'use strict';
const ice = require('./icesystems');
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
    systems.push({ id, name: s.name, security: s.security, x: s.pos[0], z: s.pos[2], constellation: s.constellation, ship: k.ship, pod: k.pod, npc: k.npc, jumps: st.jumps.get(id) || 0, sov: st.sov.get(id) || null, gates: sde.gates(id).length, ice: ice.belts(id) });
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

/** All of New Eden, one node per region: summed kills, jumps and ice systems, the alliance holding
    the most systems, and which regions connect by gate. Wormhole space and Pochven are left out. */
async function universe({ force = false } = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const st = await liveStats(force);
  const R = new Map(), sysRegion = new Map();
  for (const idStr of Object.keys(sde.allSystems())) {
    const id = Number(idStr), s = sde.system(id);
    if (!s || !s.region || (s.whClass >= 1 && s.whClass <= 6) || s.whClass >= 12 || /^[A-Z]-R\d/.test(s.region)) continue;
    sysRegion.set(id, s.regionId);
    const r = R.get(s.regionId) || { id: s.regionId, name: s.region, n: 0, sx: 0, sz: 0, sec: 0, ship: 0, pod: 0, npc: 0, jumps: 0, ice: 0, sovCount: new Map() };
    const k = st.kills.get(id) || {};
    r.n++; r.sx += s.pos[0]; r.sz += s.pos[2]; r.sec += Number(s.security) || 0;
    r.ship += k.ship || 0; r.pod += k.pod || 0; r.npc += k.npc || 0; r.jumps += st.jumps.get(id) || 0;
    if (ice.belts(id)) r.ice++;
    const sv = st.sov.get(id); if (sv) r.sovCount.set(sv, (r.sovCount.get(sv) || 0) + 1);
    R.set(s.regionId, r);
  }
  const links = new Set();
  for (const [id, rid] of sysRegion) for (const to of sde.gates(id)) { const r2 = sysRegion.get(Number(to)); if (r2 && r2 !== rid) links.add(rid < r2 ? `${rid}|${r2}` : `${r2}|${rid}`); }
  const systems = [...R.values()].map(r => {
    const top = [...r.sovCount.entries()].sort((a, b) => b[1] - a[1])[0];
    return { id: r.id, name: r.name, region: r.name, security: Math.round(r.sec / r.n * 100) / 100, x: r.sx / r.n, z: r.sz / r.n, constellation: '', ship: r.ship, pod: r.pod, npc: r.npc, jumps: r.jumps, sov: top && top[1] >= r.n / 3 ? top[0] : null, gates: 0, ice: r.ice, count: r.n, isRegion: true };
  });
  const edges = [...links].map(k => k.split('|').map(Number));
  for (const s of systems) s.gates = edges.filter(e => e.includes(s.id)).length;
  const sovIds = [...new Set(systems.map(s => s.sov).filter(Boolean))];
  const names = sovIds.length ? await resolveNames(sovIds).catch(() => ({})) : {};
  return { universe: true, regionId: 0, region: 'New Eden', systems, external: [], edges, bridges: [], wormholes: [], sovNames: names, systemRegion: Object.fromEntries(sysRegion), updated: new Date(st.at).toISOString() };
}

module.exports = { region, universe, liveStats };
