'use strict';
/* Systems where ice belts can spawn. CCP doesn't put this in the game data or ESI, so it's a bundled
   community list (src/data/ice-systems.json), matched to system ids through the SDE. */
const sde = require('./sde');
const DATA = require('./data/ice-systems.json');

let cache = null;
/** Map systemId -> { belts, region } (built once the SDE is loaded). */
function byId() {
  if (cache) return cache;
  if (!sde.ready()) return new Map();
  const m = new Map();
  for (const [region, systems] of Object.entries(DATA.regions)) {
    for (const [name, belts] of Object.entries(systems)) {
      const id = sde.systemIdByName(name);
      if (id) m.set(Number(id), { belts, region });
    }
  }
  cache = m;
  return m;
}
const isIce = id => byId().has(Number(id));
const belts = id => (byId().get(Number(id)) || {}).belts || 0;
const ids = () => [...byId().keys()];

/** Gate jumps from one system to every system within max jumps. */
function distances(fromId, max) {
  const dist = new Map([[Number(fromId), 0]]);
  let frontier = [Number(fromId)];
  for (let d = 1; d <= max && frontier.length; d++) {
    const next = [];
    for (const s of frontier) for (const g of sde.gates(s)) { const n = Number(g); if (!dist.has(n)) { dist.set(n, d); next.push(n); } }
    frontier = next;
  }
  return dist;
}

/** Ice systems nearest to the given starting points ([{ systemId, pilot }]), closest first. */
function nearest(starts, o = {}) {
  const max = Math.max(1, Math.min(40, Number(o.maxJumps) || 15));
  const limit = Number(o.limit) || 40;
  const best = new Map();
  for (const st of starts || []) {
    if (!st || !st.systemId) continue;
    const dist = distances(st.systemId, max);
    for (const [id, info] of byId()) {
      const j = dist.get(id);
      if (j === undefined) continue;
      const cur = best.get(id);
      if (!cur || j < cur.jumps) best.set(id, { jumps: j, pilot: st.pilot || null, belts: info.belts });
    }
  }
  return [...best.entries()].map(([id, x]) => {
    const s = sde.system(id) || {};
    return { systemId: id, system: s.name || String(id), region: s.region || '', security: s.security ?? null, ...x };
  }).sort((a, b) => a.jumps - b.jumps || a.system.localeCompare(b.system)).slice(0, limit);
}

/** Every ice system in a region (for the region list when no pilot is near). */
function inRegion(region) {
  const r = DATA.regions[region] || {};
  return Object.entries(r).map(([name, b]) => { const id = sde.ready() ? sde.systemIdByName(name) : null; const s = id ? sde.system(id) : null; return { systemId: id, system: name, belts: b, security: s ? s.security : null, region }; });
}

const info = () => ({ note: DATA.note, updated: DATA.updated, systems: Object.values(DATA.regions).reduce((n, r) => n + Object.keys(r).length, 0), regions: Object.keys(DATA.regions) });

module.exports = { isIce, belts, ids, nearest, inRegion, info, _reset: () => { cache = null; } };
