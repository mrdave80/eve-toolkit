'use strict';
/* Live region map data: system layout from the SDE, plus CCP's hourly kills/jumps and sovereignty. */
const sde = require('./sde');
const { get, safe, ok, resolveNames } = require('./esi');
const bridges = require('./bridges');
const ws = require('./workspace');

let stats = { at: 0, kills: new Map(), jumps: new Map(), sov: new Map() };
async function liveStats(force) {
  if (!force && Date.now() - stats.at < 5 * 60000) return stats;
  const [k, j, s] = await Promise.all([safe(() => get('/universe/system_kills/')), safe(() => get('/universe/system_jumps/')), safe(() => get('/sovereignty/map/'))]);
  stats = {
    at: Date.now(),
    kills: new Map(ok(k) ? k.map(x => [x.system_id, { ship: x.ship_kills || 0, pod: x.pod_kills || 0, npc: x.npc_kills || 0 }]) : []),
    jumps: new Map(ok(j) ? j.map(x => [x.system_id, x.ship_jumps || 0]) : []),
    sov: new Map(ok(s) ? s.filter(x => x.alliance_id || x.faction_id).map(x => [x.system_id, x.alliance_id || x.faction_id]) : [])
  };
  return stats;
}

function regionSystemIds(regionId) {
  const out = [];
  for (const [id, raw] of Object.entries(sde.allSystems())) if (raw[1] === regionId) out.push(Number(id));
  return out;
}

async function region(regionId, { force = false } = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const rid = Number(regionId);
  const ids = regionSystemIds(rid);
  if (!ids.length) throw new Error('Unknown region.');
  const inRegion = new Set(ids);
  const st = await liveStats(force);
  const systems = [], edges = [], external = new Map();
  for (const id of ids) {
    const s = sde.system(id);
    const k = st.kills.get(id) || { ship: 0, pod: 0, npc: 0 };
    systems.push({ id, name: s.name, security: s.security, x: s.pos[0], z: s.pos[2], constellation: s.constellation, ship: k.ship, pod: k.pod, npc: k.npc, jumps: st.jumps.get(id) || 0, sov: st.sov.get(id) || null, gates: sde.gates(id).length });
    for (const to of sde.gates(id)) {
      if (inRegion.has(to)) { if (id < to) edges.push([id, to]); }
      else {
        const t = sde.system(to);
        if (!external.has(to)) external.set(to, { id: to, name: t.name, region: t.region, regionId: t.regionId, security: t.security, x: t.pos[0], z: t.pos[2] });
        edges.push([id, to, 'out']);
      }
    }
  }
  const jb = bridges.list().filter(b => inRegion.has(b.a) || inRegion.has(b.b)).map(b => [b.a, b.b]);
  for (const [a, b] of jb) for (const id of [a, b]) if (!inRegion.has(id) && !external.has(id)) { const t = sde.system(id); external.set(id, { id, name: t.name, region: t.region, regionId: t.regionId, security: t.security, x: t.pos[0], z: t.pos[2] }); }
  // Wormhole connections from your maps that touch this region
  const whLinks = [];
  for (const m of ws.get().maps || []) for (const c of m.connections || []) if (!c.gate && (inRegion.has(c.from) || inRegion.has(c.to))) whLinks.push({ from: c.from, to: c.to, inside: inRegion.has(c.from) ? c.from : c.to, other: inRegion.has(c.from) ? c.to : c.from, otherName: (sde.system(inRegion.has(c.from) ? c.to : c.from) || {}).name, type: c.type || 'K162' });
  const sovIds = [...new Set(systems.map(s => s.sov).filter(Boolean))];
  const names = sovIds.length ? await resolveNames(sovIds).catch(() => ({})) : {};
  const first = sde.system(ids[0]);
  return { regionId: rid, region: first.region, systems, external: [...external.values()], edges, bridges: jb, wormholes: whLinks, sovNames: names, updated: new Date(st.at).toISOString() };
}

module.exports = { region, liveStats };
