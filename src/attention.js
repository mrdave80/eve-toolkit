'use strict';
/* "Needs attention" for the home page: one short list of things to act on across every pilot,
   each pointing at the page that deals with it. Every check is independent and best-effort. */
const store = require('./store');
const esi = require('./esi');
const extra = require('./esi-extra');
const { safe, ok } = esi;

const H = 3600000;
let cache = { at: 0, data: null };

/** o.orders: the last undercut check (from main), o.directors: director pilots */
async function gather(o = {}) {
  if (!o.refresh && cache.data && Date.now() - cache.at < 3 * 60000) return cache.data;
  const d = store.get();
  const pilots = (d.characters || []).filter(c => !c.needsReauth);
  const items = [];
  const push = (level, kind, text, goTo, pilot) => items.push({ level, kind, text, go: goTo, pilotId: pilot ? pilot.id : null, pilot: pilot ? pilot.name : null });
  const now = Date.now();
  for (const c of d.characters || []) if (c.needsReauth) push('red', 'login', `${c.name}'s login has expired. Re-authorise to keep tracking this pilot.`, { view: 'char', charId: c.id, tab: 'summary' }, c);

  await Promise.all(pilots.map(async c => {
    const scopes = c.scopes || [];
    // Skill queue
    const q = await safe(() => esi.get(`/characters/${c.id}/skillqueue/`, c.id));
    if (ok(q)) {
      const active = q.filter(x => x.finish_date && Date.parse(x.finish_date) > now);
      const end = active.reduce((m, x) => Math.max(m, Date.parse(x.finish_date)), 0);
      if (!q.length || !active.length) push('gold', 'queue', `${c.name} isn't training anything.`, { view: 'char', charId: c.id, tab: 'plan' }, c);
      else if (end - now < 24 * H) push('gold', 'queue', `${c.name}'s skill queue ends in ${Math.max(1, Math.round((end - now) / H))} h.`, { view: 'char', charId: c.id, tab: 'queue' }, c);
    }
    // Industry: jobs ready to deliver
    if (scopes.includes('esi-industry.read_character_jobs.v1')) {
      const j = await safe(() => esi.get(`/characters/${c.id}/industry/jobs/`, c.id));
      if (ok(j)) {
        const ready = j.filter(x => x.status === 'ready' || (x.status === 'active' && Date.parse(x.end_date) <= now));
        if (ready.length) push('info', 'industry', `${c.name} has ${ready.length} industry job${ready.length === 1 ? '' : 's'} ready to deliver.`, { view: 'char', charId: c.id, tab: 'industry' }, c);
      }
    }
    // Planets: extractors stopped or stopping, storage full, factories dry
    if (scopes.includes('esi-planets.manage_planets.v1')) {
      const p = await safe(() => extra.planets(c.id));
      if (ok(p)) for (const pl of p.planets || []) {
        const exp = (pl.extractors || []).filter(e => e.expiry).map(e => Date.parse(e.expiry));
        const first = exp.length ? Math.min(...exp) : null;
        if (first !== null && first <= now) push('red', 'planets', `Extractors on ${pl.name} (${c.name}) have stopped.`, { view: 'planetsAll' }, c);
        else if (first !== null && first - now < 6 * H) push('gold', 'planets', `Extractors on ${pl.name} (${c.name}) stop in ${Math.max(1, Math.round((first - now) / H))} h.`, { view: 'planetsAll' }, c);
        const sim = pl.sim;
        if (sim && sim.storage && sim.storage.fullAt && Date.parse(sim.storage.fullAt) - now < 6 * H) push(Date.parse(sim.storage.fullAt) <= now ? 'red' : 'gold', 'planets', `Storage on ${pl.name} (${c.name}) ${Date.parse(sim.storage.fullAt) <= now ? 'is full' : 'fills up soon'}.`, { view: 'planetsAll' }, c);
      }
    }
    // Unread mail
    if (scopes.includes('esi-mail.read_mail.v1')) {
      const l = await safe(() => esi.get(`/characters/${c.id}/mail/labels/`, c.id));
      if (ok(l) && l.total_unread_count) push('info', 'mail', `${c.name} has ${l.total_unread_count} unread mail${l.total_unread_count === 1 ? '' : 's'}.`, { view: 'mailAll' }, c);
    }
    // Contracts waiting for you
    if (scopes.includes('esi-contracts.read_character_contracts.v1')) {
      const k = await safe(() => esi.get(`/characters/${c.id}/contracts/`, c.id));
      if (ok(k)) {
        const forMe = k.filter(x => x.assignee_id === c.id && x.status === 'outstanding' && x.issuer_id !== c.id);
        const courier = k.filter(x => x.acceptor_id === c.id && x.type === 'courier' && x.status === 'in_progress');
        if (forMe.length) push('info', 'contracts', `${c.name} has ${forMe.length} contract${forMe.length === 1 ? '' : 's'} waiting to be accepted.`, { view: 'contractsAll' }, c);
        for (const x of courier) { const due = Date.parse(x.date_accepted) + (x.days_to_complete || 0) * 24 * H; if (due - now < 24 * H) push(due <= now ? 'red' : 'gold', 'contracts', `${c.name}'s courier contract is due ${due <= now ? 'now' : 'in ' + Math.max(1, Math.round((due - now) / H)) + ' h'}.`, { view: 'contractsAll' }, c); }
      }
    }
  }));

  // Market orders beaten at the last check
  const beaten = (o.orders || []).filter(x => x.check && x.check.beaten);
  if (beaten.length) push('gold', 'orders', `${beaten.length} of your market order${beaten.length === 1 ? ' was' : 's were'} undercut or outbid.`, { view: 'tools', toolsTab: 't-orders' });

  // Corp: low fuel and moon chunks (directors only)
  const corp = require('./corp');
  const seenStruct = new Set();
  for (const dir of o.directors || []) {
    const st = await safe(() => corp.structures(dir.id));
    if (ok(st)) for (const s of st.structures || []) {
      if (seenStruct.has(s.id)) continue; seenStruct.add(s.id);
      if (s.fuelDays !== null && s.fuelDays < 7) push(s.fuelDays < 2 ? 'red' : 'gold', 'fuel', `${s.name} has ${s.fuelDays < 1 ? 'less than a day' : Math.floor(s.fuelDays) + ' days'} of fuel left.`, { view: 'corp', corpTab: 'c-fuel' });
      if (/reinforce|armor|hull/.test(s.state || '')) push('red', 'structures', `${s.name} is ${String(s.state).replace(/_/g, ' ')}.`, { view: 'corp', corpTab: 'c-structures' });
    }
    const ex = await safe(() => corp.extractions(dir.id));
    if (ok(ex)) for (const e of ex) {
      const t = Date.parse(e.arrival) - now;
      if (t <= 0 && Date.parse(e.decay) > now) push('info', 'moons', `Moon chunk ready at ${e.moon || e.structure}.`, { view: 'tools', toolsTab: 't-mining' });
      else if (t > 0 && t < 3 * H) push('info', 'moons', `Moon chunk at ${e.moon || e.structure} arrives in ${Math.max(1, Math.round(t / 60000))} min.`, { view: 'tools', toolsTab: 't-mining' });
    }
  }
  const rank = { red: 0, gold: 1, info: 2 };
  const data = { items: items.sort((a, b) => rank[a.level] - rank[b.level]), at: new Date().toISOString() };
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { gather };
