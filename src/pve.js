'use strict';
/* PvE ISK per hour: ratting sessions from bounty ticks, and Abyssal runs detected from pilot location. */
const store = require('./store');
const sde = require('./sde');
const { get, getAllPages, safe, ok } = require('./esi');

const TIERS = ['Tranquil', 'Calm', 'Agitated', 'Fierce', 'Raging', 'Chaotic', 'Cataclysmic'];
const WEATHER = ['Exotic', 'Firestorm', 'Gamma', 'Dark', 'Electrical'];
const FILAMENTS = TIERS.flatMap(t => WEATHER.map(w => `${t} ${w} Filament`));
const isAbyss = id => id >= 32000000 && id < 33000000;

// ---------- Ratting sessions ----------
async function ratting(charIds, days = 14) {
  const since = Date.now() - days * 86400000;
  const chars = store.get().characters;
  const sessions = [];
  for (const id of charIds) {
    const j = await safe(() => getAllPages(`/characters/${id}/wallet/journal/`, id, 10));
    if (!ok(j)) continue;
    const ticks = j.filter(e => e.ref_type === 'bounty_prizes' && Date.parse(e.date) >= since).sort((a, b) => a.date.localeCompare(b.date));
    const ess = j.filter(e => e.ref_type === 'ess_escrow_transfer' && Date.parse(e.date) >= since);
    let cur = null;
    const close = () => { if (cur) { sessions.push(cur); cur = null; } };
    for (const t of ticks) {
      const time = Date.parse(t.date);
      if (cur && time - cur.lastTick > 30 * 60000) close();
      if (!cur) cur = { charId: id, charName: (chars.find(c => c.id === id) || {}).name, start: time, lastTick: time, ticks: 0, isk: 0, systems: new Map() };
      cur.lastTick = time; cur.ticks++; cur.isk += t.amount || 0;
      if (t.context_id && (t.context_id_type === 'system_id' || (t.context_id >= 30000000 && t.context_id < 32000000))) cur.systems.set(t.context_id, (cur.systems.get(t.context_id) || 0) + (t.amount || 0));
    }
    close();
    // ESS payouts land after the session; attach each to the latest session that started before it
    for (const e of ess) {
      const time = Date.parse(e.date);
      const s = sessions.filter(x => x.charId === id && x.start <= time).sort((a, b) => b.start - a.start)[0];
      if (s) s.ess = (s.ess || 0) + (e.amount || 0);
    }
  }
  const out = sessions.map(s => {
    const minutes = Math.max(20, Math.round((s.lastTick - s.start) / 60000) + 20); // first tick covers the 20 minutes before it
    const sysId = [...s.systems.entries()].sort((a, b) => b[1] - a[1])[0];
    const total = s.isk + (s.ess || 0);
    return { charId: s.charId, charName: s.charName, start: new Date(s.start - 20 * 60000).toISOString(), end: new Date(s.lastTick).toISOString(), minutes, ticks: s.ticks, bounties: s.isk, ess: s.ess || 0, isk: total, iskPerHour: Math.round(total / minutes * 60),
      system: sysId && sde.ready() && sde.system(sysId[0]) ? sde.system(sysId[0]).name : null };
  }).sort((a, b) => b.start.localeCompare(a.start));
  const mins = out.reduce((n, s) => n + s.minutes, 0), isk = out.reduce((n, s) => n + s.isk, 0);
  const bySys = new Map();
  for (const s of out) if (s.system) { const x = bySys.get(s.system) || { system: s.system, minutes: 0, isk: 0 }; x.minutes += s.minutes; x.isk += s.isk; bySys.set(s.system, x); }
  return { days, sessions: out.slice(0, 100), hours: mins / 60, isk, iskPerHour: mins ? Math.round(isk / mins * 60) : 0,
    systems: [...bySys.values()].map(x => ({ ...x, iskPerHour: Math.round(x.isk / x.minutes * 60) })).sort((a, b) => b.iskPerHour - a.iskPerHour).slice(0, 8) };
}

// ---------- Abyssal tracker ----------
const cfg = () => ({ enabled: false, filament: 'Raging Exotic Filament', overhead: 3, price: 'buy', ...(store.get().settings.abyss || {}) });
const runs = () => store.get().abyssRuns || (store.get().abyssRuns = []);
const open = new Map(); // charId -> run in progress
let timer = null, listener = () => {};

async function poll() {
  const c = cfg();
  for (const ch of store.get().characters.filter(x => !x.needsReauth)) {
    const r = await safe(() => get(`/characters/${ch.id}/location/`, ch.id));
    if (!ok(r)) continue;
    const inside = isAbyss(r.solar_system_id);
    const cur = open.get(ch.id);
    if (inside && !cur) {
      const run = { id: Date.now() + '-' + ch.id, charId: ch.id, charName: ch.name, start: new Date().toISOString(), end: null, filament: c.filament, lootValue: null, filamentCost: null, auto: true };
      open.set(ch.id, run); listener('abyss:start', run);
    } else if (!inside && cur) {
      cur.end = new Date().toISOString();
      cur.minutes = Math.max(1, Math.round((Date.parse(cur.end) - Date.parse(cur.start)) / 60000));
      const ship = await safe(() => get(`/characters/${ch.id}/ship/`, ch.id));
      cur.died = ok(ship) && ship.ship_type_id === 670; // back in a capsule = ship lost
      open.delete(ch.id);
      const list = runs(); list.unshift(cur); store.get().abyssRuns = list.slice(0, 500); store.save('abyssRuns');
      listener('abyss:end', cur);
    }
  }
}

function start(fn) { if (fn) listener = fn; stop(); if (cfg().enabled) { poll().catch(() => {}); timer = setInterval(() => poll().catch(() => {}), 20000); } }
function stop() { clearInterval(timer); timer = null; }

function saveCfg(p) {
  const cur = cfg(), next = { ...cur };
  if (typeof p.enabled === 'boolean') next.enabled = p.enabled;
  if (typeof p.filament === 'string' && FILAMENTS.includes(p.filament)) next.filament = p.filament;
  if (p.overhead !== undefined) next.overhead = Math.max(0, Math.min(30, Number(p.overhead) || 0));
  if (['buy', 'sell', 'split'].includes(p.price)) next.price = p.price;
  store.get().settings.abyss = next; store.save('abyssRuns');
  start();
  return next;
}

async function filamentPrice(name, prices) {
  const id = sde.ready() ? sde.typeIdByName(name) : null;
  if (!id) return null;
  const p = await prices([id], 'Jita');
  return p[id] ? (p[id].sell ?? p[id].avg ?? null) : null;
}

async function setLoot(runId, text, appraise, prices) {
  const r = runs().find(x => x.id === runId);
  if (!r) throw new Error('Run not found.');
  const c = cfg();
  const a = await appraise(text, 'Jita');
  r.lootValue = Math.round(c.price === 'sell' ? a.totals.sell : c.price === 'split' ? a.totals.split : a.totals.buy);
  r.lootItems = a.rows.slice(0, 12).map(x => ({ name: x.name, qty: x.qty }));
  if (r.filament && r.filamentCost === null) r.filamentCost = await filamentPrice(r.filament, prices);
  store.save('abyssRuns');
  return r;
}

function update(runId, patch) {
  const r = runs().find(x => x.id === runId);
  if (!r) throw new Error('Run not found.');
  if (typeof patch.filament === 'string' && FILAMENTS.includes(patch.filament)) { r.filament = patch.filament; r.filamentCost = null; }
  if (patch.minutes !== undefined) r.minutes = Math.max(1, Math.min(60, Number(patch.minutes) || r.minutes));
  if (patch.lootValue !== undefined) r.lootValue = Math.max(0, Number(patch.lootValue) || 0);
  if (patch.died !== undefined) r.died = !!patch.died;
  store.save('abyssRuns');
  return r;
}

function addManual(p) {
  const r = { id: Date.now() + '-m', charId: null, charName: p.charName || null, start: new Date(Date.now() - (Number(p.minutes) || 20) * 60000).toISOString(), end: new Date().toISOString(),
    minutes: Math.max(1, Math.min(60, Number(p.minutes) || 20)), filament: FILAMENTS.includes(p.filament) ? p.filament : cfg().filament, lootValue: null, filamentCost: null, auto: false };
  const list = runs(); list.unshift(r); store.save('abyssRuns');
  return r;
}

function remove(runId) { store.get().abyssRuns = runs().filter(x => x.id !== runId); store.save('abyssRuns'); return true; }

async function summary(prices) {
  const c = cfg();
  const list = runs();
  // fill missing filament prices lazily
  const missing = [...new Set(list.filter(r => r.filament && r.filamentCost === null).map(r => r.filament))].slice(0, 6);
  for (const f of missing) { const v = await filamentPrice(f, prices).catch(() => null); if (v !== null) for (const r of list) if (r.filament === f && r.filamentCost === null) r.filamentCost = v; }
  if (missing.length) store.save('abyssRuns');
  const valued = list.filter(r => r.lootValue !== null);
  const profit = r => (r.lootValue || 0) - (r.filamentCost || 0);
  const mins = valued.reduce((n, r) => n + (r.minutes || 20) + c.overhead, 0);
  const total = valued.reduce((n, r) => n + profit(r), 0);
  const byFil = new Map();
  for (const r of valued) { const x = byFil.get(r.filament) || { filament: r.filament, runs: 0, profit: 0, minutes: 0, deaths: 0 }; x.runs++; x.profit += profit(r); x.minutes += (r.minutes || 20) + c.overhead; if (r.died) x.deaths++; byFil.set(r.filament, x); }
  return {
    cfg: c, filaments: FILAMENTS, open: [...open.values()],
    runs: list.slice(0, 100).map(r => ({ ...r, profit: r.lootValue !== null ? profit(r) : null, iskPerHour: r.lootValue !== null ? Math.round(profit(r) / ((r.minutes || 20) + c.overhead) * 60) : null })),
    totals: { runs: list.length, valued: valued.length, profit: total, iskPerHour: mins ? Math.round(total / mins * 60) : 0, avgMinutes: valued.length ? Math.round(valued.reduce((n, r) => n + (r.minutes || 20), 0) / valued.length) : 0, deaths: list.filter(r => r.died).length },
    byFilament: [...byFil.values()].map(x => ({ ...x, iskPerHour: Math.round(x.profit / x.minutes * 60), avg: Math.round(x.profit / x.runs) })).sort((a, b) => b.iskPerHour - a.iskPerHour)
  };
}

module.exports = { ratting, start, stop, saveCfg, cfg, setLoot, update, addManual, remove, summary, FILAMENTS, isAbyss };
