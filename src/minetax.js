'use strict';
/* Mining report and tax for one pilot.
   CCP's personal mining ledger only says how much was mined on each day (no times), so for hour-based
   windows the app keeps its own log: every check it compares the ledger with the last one and records
   what changed, with the time. Tax can be worked out on the ore's value or on what it refines into,
   and a running balance tracks what's owed since the last payment (payments are found in the wallet). */
const store = require('./store');
const sde = require('./sde');
const market = require('./market');
const industry = require('./industry');
const { get, getAllPages, safe, ok, resolveNames, marketPrices } = require('./esi');

const H = 3600000, DAY = 24 * H;
const PERIODS = { '6h': 6 * H, '12h': 12 * H, '24h': DAY, '48h': 2 * DAY, week: 7 * DAY, month: 30 * DAY };
const DEFAULTS = { rate: 10, basis: 'refined', yieldPct: 87.5, refineTax: 5, oreSet: 'moon', ores: [], payee: null, period: 'since' };

function book() { const d = store.get(); d.miningLog = d.miningLog || {}; return d.miningLog; }
function pilotBook(id) { const b = book(); b[id] = b[id] || { snap: {}, events: [], since: null, cfg: { ...DEFAULTS }, payments: [] }; b[id].cfg = { ...DEFAULTS, ...b[id].cfg }; return b[id]; }

const kindOf = typeId => {
  const t = (sde.ready() && sde.type(typeId)) || {};
  const g = t.group || '';
  if (/Moon Asteroids|Moon Ore/i.test(g) || /^(Ubiquitous|Common|Uncommon|Rare|Exceptional)/.test(g)) return 'moon';
  if (/Ice/i.test(g) || /Ice/i.test(t.category || '') && /ice/i.test(t.name || '')) return 'ice';
  if (/Cloud|Gas/i.test(g)) return 'gas';
  return 'ore';
};

/** Read the ledger and record what's new since the last read. */
async function track(charId) {
  const p = pilotBook(charId);
  const rows = await getAllPages(`/characters/${charId}/mining/`, charId, 10);
  const now = Date.now();
  const snap = {};
  for (const r of rows) snap[`${r.date}|${r.type_id}|${r.solar_system_id}`] = r.quantity;
  if (p.since) {
    for (const [k, q] of Object.entries(snap)) {
      const was = p.snap[k] || 0;
      if (q > was) { const [date, t, s] = k.split('|'); p.events.push([now, Number(t), Number(s), q - was, date]); }
    }
  } else p.since = now;   // first read: the starting point
  p.snap = snap;
  p.events = p.events.filter(e => e[0] > now - 40 * DAY).slice(-20000);
  p.checkedAt = now;
  store.save('miningLog');
  return rows;
}

/** Payments to the payee corp found in the pilot's wallet journal, merged with ones marked by hand. */
async function payments(charId) {
  const p = pilotBook(charId);
  if (!p.cfg.payee || !p.cfg.payee.id) return p.payments;
  const j = await safe(() => getAllPages(`/characters/${charId}/wallet/journal/`, charId, 5));
  if (ok(j)) {
    for (const e of j) {
      if (!['player_donation', 'corporation_account_withdrawal'].includes(e.ref_type) || !(e.amount < 0)) continue;
      if (e.second_party_id !== p.cfg.payee.id) continue;
      if (p.payments.some(x => x.id === e.id)) continue;
      p.payments.push({ id: e.id, at: e.date, amount: -e.amount, note: e.reason || '', auto: true });
    }
    p.payments.sort((a, b) => a.at.localeCompare(b.at));
    store.save('miningLog');
  }
  return p.payments;
}

/** What each ore refines into at the given yield, after the refinery takes its tax (a share of the
    minerals), valued at Jita buy. Leftover units that don't make a full batch stay as ore. Sets o.minerals
    on each ore and returns the totals for everything. */
async function mineralsFor(ores, yieldPct, taxPct) {
  if (!sde.ready()) return { yieldPct, taxPct, list: [], value: 0, taxValue: 0 };
  const keep = (yieldPct / 100) * (1 - taxPct / 100), took = (yieldPct / 100) * (taxPct / 100);
  const ids = new Set();
  const per = ores.map(o => { const m = sde.reprocess(o.typeId); const portion = ((sde.type(o.typeId) || {}).portionSize) || 1; if (m) m.forEach(([x]) => ids.add(x)); return { o, m, portion }; });
  const pr = ids.size ? await market.prices([...ids], 'Jita').catch(() => ({})) : {};
  const price = id => { const x = pr[id] || {}; return x.buy ?? x.avg ?? 0; };
  const name = id => (sde.type(id) || {}).name || String(id);
  const total = new Map();
  for (const { o, m, portion } of per) {
    if (!m) { o.minerals = null; continue; }
    const batches = Math.floor(o.qty / portion);
    o.leftover = o.qty - batches * portion;
    o.minerals = m.map(([x, q]) => { const qty = Math.floor(batches * q * keep), tax = Math.floor(batches * q * took); return { typeId: x, name: name(x), qty, tax, value: qty * price(x) }; }).filter(x => x.qty || x.tax);
    o.mineralValue = o.minerals.reduce((n, x) => n + x.value, 0);
    for (const x of o.minerals) { const t = total.get(x.typeId) || { typeId: x.typeId, name: x.name, qty: 0, tax: 0, value: 0, taxedQty: 0 }; t.qty += x.qty; t.tax += x.tax; t.value += x.value; if (o.taxed) t.taxedQty += x.qty; total.set(x.typeId, t); }
  }
  const list = [...total.values()].sort((a, b) => b.value - a.value);
  return { yieldPct, taxPct, list, value: list.reduce((n, x) => n + x.value, 0), taxValue: list.reduce((n, x) => n + x.tax * price(x.typeId), 0) };
}

/** Ore value per unit for each basis. */
async function unitValues(typeIds, basis, yieldPct) {
  const out = {};
  if (!typeIds.length) return out;
  if (basis === 'average') { const avg = await marketPrices(); for (const t of typeIds) out[t] = avg.get(t) || 0; return out; }
  if (basis === 'jitaBuy' || basis === 'jitaSell') {
    const pr = await market.prices(typeIds, 'Jita');
    for (const t of typeIds) { const x = pr[t] || {}; out[t] = (basis === 'jitaBuy' ? x.buy : x.sell) ?? x.avg ?? 0; }
    return out;
  }
  // refined: what one unit reprocesses into, at the yield you set, at Jita buy
  const mats = {}; const all = new Set();
  for (const t of typeIds) { const m = sde.ready() ? sde.reprocess(t) : null; const portion = ((sde.type(t) || {}).portionSize) || 1; if (m) { mats[t] = { m, portion }; m.forEach(([x]) => all.add(x)); } }
  const pr = await market.prices([...all, ...typeIds], 'Jita');
  const buy = id => { const x = pr[id] || {}; return x.buy ?? x.avg ?? 0; };
  for (const t of typeIds) {
    if (!mats[t]) { out[t] = buy(t); continue; }
    out[t] = mats[t].m.reduce((n, [x, q]) => n + q * (yieldPct / 100) * buy(x), 0) / mats[t].portion;
  }
  return out;
}

function windowStart(p, period, now) {
  if (period === 'since') { const last = p.payments[p.payments.length - 1]; return last ? Date.parse(last.at) : null; }
  return now - (PERIODS[period] || PERIODS.week);
}

/**
 * o: { period: 6h|12h|24h|48h|week|month|since, from, to (custom dates), rate, basis, yieldPct, oreSet: all|moon|ore|ice|gas|pick, ores: [typeIds] }
 * Settings are remembered per pilot.
 */
async function report(charId, o = {}) {
  const p = pilotBook(charId);
  for (const k of ['rate', 'basis', 'yieldPct', 'refineTax', 'oreSet', 'ores', 'period']) if (o[k] !== undefined) p.cfg[k] = o[k];
  const c = p.cfg;
  const rows = await track(charId);
  await payments(charId);
  const now = Date.now();
  let start = o.from ? Date.parse(o.from) : windowStart(p, c.period, now);
  const end = o.to ? Date.parse(o.to) + DAY : now;
  // What went into the window: exact (from the app's own log) where it covers it, whole days from the ledger before that
  const exactFrom = p.since;
  const items = new Map(); let approx = false;
  const add = (t, s, q) => { const k = t + '|' + s; const x = items.get(k) || { typeId: t, systemId: s, qty: 0 }; x.qty += q; items.set(k, x); };
  if (start === null) start = rows.reduce((m, r) => Math.min(m, Date.parse(r.date)), now);   // never paid: everything ESI has
  if (start < exactFrom) {
    approx = true;
    const fromDay = new Date(start).toISOString().slice(0, 10), toDay = new Date(Math.min(exactFrom, end)).toISOString().slice(0, 10);
    // days fully before tracking started come from the ledger
    for (const r of rows) if (r.date >= fromDay && r.date < toDay) add(r.type_id, r.solar_system_id, r.quantity);
    // the day tracking started: the ledger total for that day minus what the log saw later
    const startDay = new Date(exactFrom).toISOString().slice(0, 10);
    if (startDay >= fromDay && Date.parse(startDay) < end) for (const r of rows) if (r.date === startDay) {
      const later = p.events.filter(e => e[4] === startDay && e[1] === r.type_id && e[2] === r.solar_system_id).reduce((n, e) => n + e[3], 0);
      add(r.type_id, r.solar_system_id, Math.max(0, r.quantity - later));
    }
  }
  const sincePaid = c.period === 'since' && !o.from;
  for (const e of p.events) if ((sincePaid ? e[0] > start : e[0] >= start) && e[0] >= exactFrom && e[0] <= end) add(e[1], e[2], e[3]);

  const typeIds = [...new Set([...items.values()].map(x => x.typeId))];
  const allIds = [...new Set(rows.map(r => r.type_id))];
  const names = await resolveNames([...new Set([...allIds, ...[...items.values()].map(x => x.systemId)])], charId).catch(() => ({}));
  const pick = new Set((c.ores || []).map(Number));
  const wanted = t => (c.oreSet === 'all' ? true : c.oreSet === 'pick' ? pick.has(t) : kindOf(t) === c.oreSet);
  const values = await unitValues(typeIds, c.basis, Number(c.yieldPct) || 87.5);
  const byOre = new Map();
  for (const x of items.values()) {
    const o2 = byOre.get(x.typeId) || { typeId: x.typeId, name: names[x.typeId] || (sde.type(x.typeId) || {}).name, kind: kindOf(x.typeId), qty: 0, systems: {}, taxed: wanted(x.typeId) };
    o2.qty += x.qty; o2.systems[names[x.systemId] || x.systemId] = (o2.systems[names[x.systemId] || x.systemId] || 0) + x.qty; byOre.set(x.typeId, o2);
  }
  const rate = Math.max(0, Math.min(100, Number(c.rate) || 0)) / 100;
  const ores = [...byOre.values()].map(x => { const unit = values[x.typeId] || 0; const value = unit * x.qty; return { ...x, unit, value, tax: x.taxed ? value * rate : 0, systems: Object.entries(x.systems).map(([n, q]) => ({ name: n, qty: q })) }; })
    .sort((a, b) => b.value - a.value);
  const taxed = ores.filter(x => x.taxed);
  const minerals = await mineralsFor(ores, Number(c.yieldPct) || 87.5, Math.max(0, Math.min(100, Number(c.refineTax) || 0)));
  const tax = taxed.reduce((n, x) => n + x.tax, 0);
  // hourly bars for short windows, daily otherwise
  const span = end - start, step = span <= 2 * DAY + 1 ? H : DAY;
  const buckets = [];
  for (let t = Math.floor(start / step) * step; t < end; t += step) buckets.push({ at: new Date(t).toISOString(), qty: 0 });
  const b0 = buckets.length ? Date.parse(buckets[0].at) : start;
  for (const e of p.events) if (e[0] >= start && e[0] <= end && wanted(e[1])) { const i = Math.floor((e[0] - b0) / step); if (buckets[i]) buckets[i].qty += e[3]; }
  if (step === DAY) for (const r of rows) { if (!wanted(r.type_id) || Date.parse(r.date) >= exactFrom) continue; const i = buckets.findIndex(b => b.at.slice(0, 10) === r.date); if (i >= 0) buckets[i].qty += r.quantity; }
  const paidInWindow = p.payments.filter(x => Date.parse(x.at) >= start && Date.parse(x.at) <= end).reduce((n, x) => n + x.amount, 0);
  return {
    cfg: c, period: c.period, from: new Date(start).toISOString(), to: new Date(end).toISOString(), approx, trackedSince: new Date(exactFrom).toISOString(), checkedAt: new Date(p.checkedAt).toISOString(),
    ores, availableOres: allIds.map(t => ({ typeId: t, name: names[t] || (sde.type(t) || {}).name, kind: kindOf(t) })).sort((a, b) => a.kind.localeCompare(b.kind) || String(a.name).localeCompare(String(b.name))),
    totals: { qty: ores.reduce((n, x) => n + x.qty, 0), value: ores.reduce((n, x) => n + x.value, 0), taxedValue: taxed.reduce((n, x) => n + x.value, 0), tax, paid: paidInWindow, owing: Math.max(0, tax - (c.period === 'since' ? 0 : paidInWindow)) },
    minerals,
    payments: p.payments.slice(-10).reverse(), payee: c.payee, buckets, step: step === H ? 'hour' : 'day'
  };
}

async function setPayee(charId, name) {
  const p = pilotBook(charId);
  if (!name) { p.cfg.payee = null; store.save('miningLog'); return null; }
  const r = await safe(() => require('./esi').rawRequest('/universe/ids/', { method: 'POST', body: [String(name).trim()] }));
  const corp = ok(r) && r.body && (r.body.corporations || [])[0];
  if (!corp) throw new Error(`No corporation called "${name}".`);
  p.cfg.payee = { id: corp.id, name: corp.name };
  store.save('miningLog');
  return p.cfg.payee;
}
function markPaid(charId, amount, note) {
  const p = pilotBook(charId);
  const a = Number(amount); if (!(a > 0)) throw new Error('Enter the amount paid.');
  p.payments.push({ id: 'm' + Date.now(), at: new Date().toISOString(), amount: a, note: String(note || '').slice(0, 200), auto: false });
  store.save('miningLog');
  return p.payments;
}
function removePayment(charId, id) { const p = pilotBook(charId); p.payments = p.payments.filter(x => String(x.id) !== String(id)); store.save('miningLog'); return p.payments; }

/** Background: keep every pilot's log up to date so hour windows work. */
async function trackAll() {
  for (const c of store.get().characters.filter(x => !x.needsReauth && (x.scopes || []).includes('esi-industry.read_character_mining.v1'))) await safe(() => track(c.id));
}

module.exports = { report, track, trackAll, setPayee, markPaid, removePayment, PERIODS, _kindOf: kindOf };
