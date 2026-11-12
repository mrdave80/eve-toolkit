'use strict';
/* Job splitter: paste what you want built ("Hammerhead II 500"), and it works out the runs,
   splits them into jobs that fit a time limit and your blueprints' runs, hands them out across
   your pilots' free manufacturing and reaction slots, and shows where the materials already are. */
const sde = require('./sde');
const store = require('./store');
const industry = require('./industry');
const extra = require('./esi-extra');
const buildplan = require('./buildplan');
const { parseItems } = require('./appraise');
const { safe, ok } = require('./esi');

/**
 * o: { text, maxHours (per job, default 24), structure, rig, security, me, te (for blueprints you don't own), pilots: [ids] (default all), useBpcs }
 */
async function split(o = {}) {
  if (!sde.ready()) throw new Error('Game data is still loading.');
  const parsed = parseItems(o.text || '');
  if (!parsed.items.length) throw new Error('Paste what you want to build, one item per line, e.g. "Hammerhead II 500".');
  const maxSec = Math.max(1, Number(o.maxHours) || 24) * 3600;
  const d = store.get();
  const ids = (o.pilots && o.pilots.length ? o.pilots : (d.characters || []).filter(c => !c.needsReauth).map(c => c.id)).map(Number);
  const cname = id => ((d.characters || []).find(c => c.id === id) || {}).name || String(id);

  // Free slots and blueprints per pilot
  const pilots = [];
  await Promise.all(ids.map(async id => {
    const [ind, bps] = await Promise.all([safe(() => extra.industryFull(id)), safe(() => extra.blueprints(id))]);
    if (!ok(ind)) { pilots.push({ id, name: cname(id), error: ind.__error, free: { manufacturing: 0, reaction: 0 }, bps: [] }); return; }
    const s = ind.slots, sk = ind.skills || {};
    pilots.push({ id, name: cname(id), free: { manufacturing: Math.max(0, s.manufacturing.max - s.manufacturing.used), reaction: Math.max(0, s.reaction.max - s.reaction.used) },
      max: { manufacturing: s.manufacturing.max, reaction: s.reaction.max }, skills: { industry: sk.industry ?? 5, advancedIndustry: sk.advancedIndustry ?? 5, reactions: 5 }, bps: ok(bps) ? bps : [] });
  }));
  pilots.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  const jobs = [], skipped = [];
  for (const it of parsed.items) {
    const bi = sde.blueprintFor(it.typeId);
    if (!bi) { skipped.push({ name: it.name, why: 'Nothing builds this' }); continue; }
    const bp = sde.blueprint(bi.blueprintId), act = bp.a[bi.activity];
    const slot = bi.activity === 'reaction' ? 'reaction' : 'manufacturing';
    const per = (act.p.find(p => p[0] === it.typeId) || [0, 1])[1] || 1;
    let runsLeft = Math.ceil(it.qty / per);
    // Blueprints you own for this: originals first (any runs), then copies by runs left
    const owned = pilots.flatMap(p => p.bps.filter(b => b.typeId === bi.blueprintId).map(b => ({ ...b, pilotId: p.id })));
    const bpo = owned.filter(b => b.original).sort((a, b) => b.me - a.me)[0];
    const bpcs = owned.filter(b => b.copy && b.runs > 0).sort((a, b) => b.me - a.me || b.runs - a.runs);
    const opts = { structure: o.structure || 'npc', rig: o.rig || 'none', security: o.security || 'hs', activity: bi.activity };
    const mk = (runs, b, pilotHint) => {
      const me = b ? b.me : (bi.activity === 'reaction' ? 0 : (o.me ?? 10)), te = b ? b.te : (bi.activity === 'reaction' ? 0 : (o.te ?? 20));
      const factor = industry.meFactor({ ...opts, me });
      const mats = act.m.map(([typeId, base]) => ({ typeId, qty: industry.matQty(base, runs, factor) }));
      const seconds = industry.jobSeconds(act.t, runs, { ...opts, te });
      jobs.push({ productTypeId: it.typeId, product: it.name, blueprintId: bi.blueprintId, blueprint: (sde.type(bi.blueprintId) || {}).name, activity: bi.activity, slot,
        runs, out: runs * per, me, te, seconds, materials: mats, bp: b ? (b.original ? 'BPO' : `BPC (${b.runs} runs)`) : null, bpItem: b ? b.itemId : null, bpPilot: b ? b.pilotId : pilotHint || null });
    };
    const oneRun = industry.jobSeconds(act.t, 1, { ...opts, te: bpo ? bpo.te : (o.te ?? 20) }) || 1;
    const maxRuns = Math.max(1, Math.floor(maxSec / oneRun));
    // Use copies first if asked (they run out anyway), else the original
    if (o.useBpcs !== false) for (const c of bpcs) { if (runsLeft <= 0) break; let left = Math.min(c.runs, runsLeft); runsLeft -= left; while (left > 0) { const r = Math.min(left, maxRuns); mk(r, c); left -= r; } }
    while (runsLeft > 0) { const r = Math.min(runsLeft, maxRuns); mk(r, bpo || null); runsLeft -= r; }
    if (!bpo && !bpcs.length && bi.activity !== 'reaction') skipped.push({ name: it.name, why: `You don't own a ${(sde.type(bi.blueprintId) || {}).name || 'blueprint'}; planned at ME ${o.me ?? 10}`, warn: true });
  }

  // Hand out jobs: longest first, to the pilot holding the blueprint, else whoever has most free slots
  jobs.sort((a, b) => b.seconds - a.seconds);
  const free = new Map(pilots.map(p => [p.id, { ...p.free }]));
  const assigned = new Map(pilots.map(p => [p.id, []])); const waiting = [];
  for (const j of jobs) {
    // BPCs can't be shared without a contract, so keep them with their owner where possible
    let p = j.bpPilot && free.get(j.bpPilot) && free.get(j.bpPilot)[j.slot] > 0 ? j.bpPilot : null;
    if (!p) { const load = id => assigned.get(id).reduce((n, x) => n + x.seconds, 0); p = [...free.entries()].filter(([, f]) => f[j.slot] > 0).sort((a, b) => b[1][j.slot] - a[1][j.slot] || load(a[0]) - load(b[0]))[0]?.[0] || null; }
    if (!p) { waiting.push(j); continue; }
    free.get(p)[j.slot]--; j.pilot = cname(p); j.moveBp = j.bpPilot && j.bpPilot !== p ? cname(j.bpPilot) : null;
    assigned.get(p).push(j);
  }

  // Materials for everything, and where you already have them
  const need = new Map();
  for (const j of jobs) for (const m of j.materials) need.set(m.typeId, (need.get(m.typeId) || 0) + m.qty);
  const have = await buildplan.stock([...need.keys()], { refresh: !!o.refresh });
  const materials = [...need.entries()].map(([typeId, qty]) => {
    const t = sde.type(typeId) || {}; const h = have[typeId] ? have[typeId].total : 0;
    return { typeId, name: t.name || 'Type ' + typeId, need: qty, have: Math.min(qty, h), buy: Math.max(0, qty - h), places: have[typeId] ? have[typeId].places.slice(0, 4) : [], volume: (t.volume || 0) * Math.max(0, qty - h) };
  }).sort((a, b) => b.buy - a.buy || a.name.localeCompare(b.name));

  return {
    pilots: pilots.map(p => ({ id: p.id, name: p.name, error: p.error || null, free: p.free, max: p.max || null, jobs: assigned.get(p.id) || [], hours: (assigned.get(p.id) || []).reduce((n, j) => Math.max(n, j.seconds), 0) / 3600 })),
    waiting, skipped, unknown: parsed.unknown, materials,
    totals: { jobs: jobs.length, placed: jobs.length - waiting.length, buyVolume: materials.reduce((n, m) => n + m.volume, 0), toBuy: materials.filter(m => m.buy > 0).length },
    multibuy: materials.filter(m => m.buy > 0).map(m => `${m.name} ${m.buy}`).join('\n')
  };
}

module.exports = { split };
