'use strict';
/* Courier contract finder: public courier contracts with ISK per jump, and the route for each. */
const sde = require('./sde');
const store = require('./store');
const { get, getAllPages, safe, ok, resolveNames } = require('./esi');

const locCache = new Map(); // location id -> { systemId, name } | null

async function locate(id) {
  if (locCache.has(id)) return locCache.get(id);
  let v = null;
  if (id >= 60000000 && id < 64000000) {
    const s = await safe(() => get(`/universe/stations/${id}/`));
    if (ok(s)) v = { systemId: s.system_id, name: s.name };
  } else if (id >= 1e12) {
    const c = store.get().characters.find(x => !x.needsReauth && (x.scopes || []).includes('esi-universe.read_structures.v1'));
    if (c) { const s = await safe(() => get(`/universe/structures/${id}/`, c.id)); if (ok(s)) v = { systemId: s.solar_system_id, name: s.name, structure: true }; }
  }
  locCache.set(id, v);
  return v;
}

const isHs = id => { const s = sde.system(id); return s && Math.round(s.security * 10) / 10 >= 0.5; };

/** BFS from one system; returns { dist: Map, prev: Map }. secure = highsec systems only. */
function bfs(from, secure) {
  const dist = new Map([[from, 0]]), prev = new Map(), q = [from];
  for (let i = 0; i < q.length; i++) {
    const u = q[i];
    for (const v of sde.gates(u)) {
      if (dist.has(v) || (secure && !isHs(v))) continue;
      dist.set(v, dist.get(u) + 1); prev.set(v, u); q.push(v);
    }
  }
  return { dist, prev };
}
const bfsCache = new Map();
function tree(from, secure) {
  const k = from + ':' + secure;
  if (!bfsCache.has(k)) { if (bfsCache.size > 400) bfsCache.clear(); bfsCache.set(k, bfs(from, secure)); }
  return bfsCache.get(k);
}
function pathTo(from, to, secure) {
  const t = tree(from, secure);
  if (!t.dist.has(to)) return null;
  const out = [to];
  for (let cur = to; cur !== from; cur = t.prev.get(cur)) out.unshift(t.prev.get(cur));
  return out;
}

function regions() {
  if (!sde.ready()) return [];
  const m = new Map();
  for (const [id, s] of Object.entries(sde.allSystems())) { const sy = sde.system(Number(id)); if (sy && !(Number(sy.whClass) >= 1 && Number(sy.whClass) <= 6) && !(Number(sy.whClass) >= 12)) m.set(s[1], sy.region); }
  return [...m.entries()].map(([id, name]) => ({ id: Number(id), name })).filter(r => r.name && !/^[A-Z]-R\d/.test(r.name)).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * opts: { regionIds:[], from: systemId|name, maxPickup, maxVolume, maxCollateral, minReward, secure }
 */
async function find(opts = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const from = typeof opts.from === 'number' ? opts.from : sde.systemIdByName(String(opts.from || ''));
  if (!from) throw new Error(`Unknown start system "${opts.from}".`);
  const regionIds = (opts.regionIds || []).map(Number).filter(Boolean).slice(0, 4);
  if (!regionIds.length) regionIds.push(sde.system(from).regionId);
  const secure = !!opts.secure;
  const all = [];
  for (const r of regionIds) {
    const list = await safe(() => getAllPages(`/contracts/public/${r}/`, null, 10));
    if (ok(list)) for (const c of list) if (c.type === 'courier') all.push(c);
  }
  const maxVol = Number(opts.maxVolume) || Infinity, maxCol = Number(opts.maxCollateral) || Infinity, minRew = Number(opts.minReward) || 0;
  const pre = all.filter(c => c.volume <= maxVol && (c.collateral || 0) <= maxCol && (c.reward || 0) >= minRew && Date.parse(c.date_expired) > Date.now());
  const locIds = [...new Set(pre.flatMap(c => [c.start_location_id, c.end_location_id]))];
  for (let i = 0; i < locIds.length; i += 10) await Promise.all(locIds.slice(i, i + 10).map(locate));
  const fromTree = tree(from, secure), fromAny = tree(from, false);
  const rows = [];
  let unknownLoc = 0;
  for (const c of pre) {
    const a = locCache.get(c.start_location_id), b = locCache.get(c.end_location_id);
    if (!a || !b) { unknownLoc++; continue; }
    const pickup = fromTree.dist.get(a.systemId) ?? null;
    const pickupAny = fromAny.dist.get(a.systemId) ?? null;
    if (pickupAny === null || pickupAny > (Number(opts.maxPickup) || 99)) continue;
    const route = pathTo(a.systemId, b.systemId, secure);
    const routeAny = route || pathTo(a.systemId, b.systemId, false);
    if (!routeAny) continue;
    const leavesHs = !route || routeAny.some(id => !isHs(id));
    if (secure && !route) continue;
    const jumps = routeAny.length - 1;
    const total = (pickup ?? pickupAny) + jumps;
    rows.push({
      id: c.contract_id, issuerId: c.issuer_id, title: c.title || '', reward: c.reward || 0, collateral: c.collateral || 0, volume: c.volume, days: c.days_to_complete, expires: c.date_expired,
      from: { ...a, system: sde.system(a.systemId).name, security: sde.system(a.systemId).security }, to: { ...b, system: sde.system(b.systemId).name, security: sde.system(b.systemId).security },
      pickupJumps: pickup ?? pickupAny, jumps, iskPerJump: Math.round((c.reward || 0) / Math.max(1, total)), iskPerM3: c.volume ? Math.round((c.reward || 0) / c.volume) : null,
      leavesHs, lowsecJumps: routeAny.filter(id => !isHs(id)).length, path: routeAny,
      warn: [
        leavesHs ? 'Route leaves highsec' : null,
        c.collateral > 0 && c.reward > 0 && c.collateral / c.reward > 200 ? 'Very high collateral for the reward' : null,
        b.structure ? 'Delivers to a player structure: check you can dock there' : null
      ].filter(Boolean)
    });
  }
  rows.sort((x, y) => y.iskPerJump - x.iskPerJump);
  const issuers = await resolveNames([...new Set(rows.slice(0, 150).map(r => r.issuerId))]).catch(() => ({}));
  for (const r of rows) r.issuer = issuers[r.issuerId] || null;
  return { from: sde.system(from).name, regions: regionIds.map(id => (regions().find(r => r.id === id) || { name: id }).name), total: all.length, shown: rows.length, unknownLoc, rows: rows.slice(0, 150) };
}

module.exports = { find, regions, pathTo, locate };
