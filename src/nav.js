// Navigation: gate routes (with wormhole + Thera/Turnur shortcuts), capital jump
// planning and live universe status (sov campaigns, incursions, FW).
const sde = require('./sde');
const ws = require('./workspace');
const bridges = require('./bridges');
const { get, safe, ok, resolveNames } = require('./esi');

const LY = 9.4607e15;

function secOf(id) { const s = sde.system(id); return s ? s.security : -1; }
function secClass(id) {
  const s = sde.system(id);
  if (!s) return 'ns';
  if (s.regionId >= 11000000) return 'wh';
  const r = Math.round(s.security * 10) / 10;
  return r >= 0.5 ? 'hs' : r > 0 ? 'ls' : 'ns';
}

// ---------- EVE-Scout (Thera / Turnur) ----------

let scoutCache = { at: 0, list: [] };
async function theraConnections() {
  if (Date.now() - scoutCache.at < 10 * 60000) return scoutCache.list;
  try {
    const r = await fetch('https://api.eve-scout.com/v2/public/signatures', { headers: { 'User-Agent': 'EVE-Toolkit-Desktop' } });
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    const list = (Array.isArray(data) ? data : []).filter(x => (x.signature_type || 'wormhole') === 'wormhole').map(x => ({
      hub: x.out_system_name || x.source_system_name || 'Thera', hubId: x.out_system_id || x.source_system_id,
      systemId: x.in_system_id || x.destination_system_id, system: x.in_system_name || x.destination_system_name,
      region: x.in_region_name || '', sig: x.in_signature || '', hubSig: x.out_signature || '', type: x.wh_type || '',
      size: x.max_ship_size || '', hours: x.remaining_hours ?? null, expires: x.expires_at || null, updated: x.updated_at || x.created_at || null
    })).filter(x => x.systemId && x.hubId);
    scoutCache = { at: Date.now(), list };
  } catch (e) { if (!scoutCache.list.length) throw new Error('EVE-Scout is unreachable: ' + e.message); }
  return scoutCache.list;
}

// ---------- Routes ----------

function extraEdges({ wormholes, thera, theraList, jumpBridges }) {
  const extra = new Map();
  const add = (a, b, kind, label) => {
    (extra.get(a) || extra.set(a, []).get(a)).push({ to: b, kind, label });
    (extra.get(b) || extra.set(b, []).get(b)).push({ to: a, kind, label });
  };
  if (wormholes) for (const m of ws.get().maps) for (const c of m.connections || []) {
    if (c.gate || c.mass === 'crit') continue;
    add(c.from, c.to, 'wormhole', `${c.type || 'WH'} (${m.name})`);
  }
  if (jumpBridges) for (const b of bridges.list()) add(b.a, b.b, 'bridge', `Ansiblex ${b.aName} » ${b.bName}`);
  if (thera && theraList) for (const t of theraList) add(t.hubId, t.systemId, 'thera', `${t.hub} ${t.type || ''} ${t.sig ? '· ' + t.sig : ''}`.trim());
  return extra;
}

async function route(fromName, toName, opts = {}) {
  const from = typeof fromName === 'number' ? fromName : sde.systemIdByName(fromName);
  const to = typeof toName === 'number' ? toName : sde.systemIdByName(toName);
  if (!from) throw new Error(`Unknown system "${fromName}".`);
  if (!to) throw new Error(`Unknown system "${toName}".`);
  const avoid = new Set((opts.avoid || []).map(n => typeof n === 'number' ? n : sde.systemIdByName(n)).filter(Boolean));
  const theraList = opts.thera ? await safe(() => theraConnections()) : null;
  const extra = extraEdges({ wormholes: opts.wormholes, thera: opts.thera, theraList: theraList && ok(theraList) ? theraList : null, jumpBridges: opts.bridges });
  const pref = opts.pref || 'shortest';
  const cost = id => {
    if (pref === 'shortest') return 1;
    const c = secClass(id);
    if (pref === 'safer') return c === 'hs' ? 1 : 50000;
    return c === 'hs' ? 50000 : 1; // less secure
  };
  // Dijkstra with a simple binary heap
  const dist = new Map([[from, 0]]), prev = new Map();
  const heap = [[0, from]];
  const push = x => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = pop();
    if (u === to) break;
    if (d > (dist.get(u) ?? Infinity)) continue;
    const nexts = [...sde.gates(u).map(v => ({ to: v, kind: 'gate' })), ...(extra.get(u) || [])];
    for (const e of nexts) {
      if (avoid.has(e.to) && e.to !== to) continue;
      const nd = d + cost(e.to);
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { from: u, kind: e.kind, label: e.label }); push([nd, e.to]); }
    }
  }
  if (!dist.has(to)) throw new Error('No route found with these settings.');
  const path = [];
  for (let cur = to; cur !== undefined; cur = prev.has(cur) ? prev.get(cur).from : undefined) {
    const s = sde.system(cur);
    path.unshift({ id: cur, name: s.name, region: s.region, security: s.security, cls: secClass(cur), via: prev.has(cur) ? prev.get(cur).kind : null, viaLabel: prev.has(cur) ? prev.get(cur).label : null });
    if (cur === from) break;
  }
  // Activity for the route
  const kills = await safe(() => get('/universe/system_kills/'));
  const km = new Map(ok(kills) ? kills.map(k => [k.system_id, k]) : []);
  for (const p of path) { const k = km.get(p.id); p.kills = k ? k.ship_kills + k.pod_kills : 0; p.npc = k ? k.npc_kills : 0; }
  return {
    from: path[0], to: path[path.length - 1], jumps: path.length - 1, path,
    hs: path.filter(p => p.cls === 'hs').length, ls: path.filter(p => p.cls === 'ls').length, ns: path.filter(p => p.cls === 'ns').length,
    shortcuts: path.filter(p => p.via === 'wormhole' || p.via === 'thera' || p.via === 'bridge').length, bridgesUsed: path.filter(p => p.via === 'bridge').length
  };
}

// ---------- Jump planner ----------

const SHIPS = {
  'Carrier / Dreadnought / FAX': { base: 3.5, fatigue: 1 },
  'Supercarrier / Titan': { base: 3.0, fatigue: 1 },
  'Black Ops': { base: 4.0, fatigue: 1 },
  'Jump Freighter': { base: 5.0, fatigue: 0.1 },
  'Rorqual': { base: 5.0, fatigue: 0.1 },
  'Lancer Dreadnought': { base: 3.5, fatigue: 1 }
};
const distLy = (a, b) => { const p = sde.system(a).pos, q = sde.system(b).pos; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) / LY; };

function cynoOk(id, ship) {
  const s = sde.system(id);
  if (!s || s.regionId >= 11000000) return false;       // no jumping in J-space
  if (s.regionId === 10000070) return false;           // Pochven
  const c = secClass(id);
  if (c === 'hs') return false;                         // no capital jumps into high-sec
  return true;
}

function jumpPlan(fromName, toName, { ship = 'Carrier / Dreadnought / FAX', jdc = 5, avoid = [] } = {}) {
  const from = sde.systemIdByName(fromName), to = sde.systemIdByName(toName);
  if (!from) throw new Error(`Unknown system "${fromName}".`);
  if (!to) throw new Error(`Unknown system "${toName}".`);
  const sh = SHIPS[ship] || SHIPS['Carrier / Dreadnought / FAX'];
  const range = sh.base * (1 + 0.2 * jdc);
  const av = new Set(avoid.map(n => sde.systemIdByName(n)).filter(Boolean));
  if (!cynoOk(to, ship)) throw new Error(`${toName} can't be jumped into (high-sec, J-space or Pochven).`);
  // Candidate systems: all cyno-able k-space systems
  const all = Object.keys(sde.allSystems()).map(Number).filter(id => (cynoOk(id, ship) && !av.has(id)) || id === from);
  const pos = new Map(all.map(id => [id, sde.system(id).pos]));
  const R = range * LY, R2 = R * R;
  // BFS on jumps, tie-break by total distance
  const prev = new Map([[from, null]]), dist = new Map([[from, 0]]);
  let frontier = [from];
  while (frontier.length && !prev.has(to)) {
    const next = [];
    for (const u of frontier) {
      const p = pos.get(u);
      for (const v of all) {
        if (prev.has(v)) continue;
        const q = pos.get(v);
        const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 <= R2) { prev.set(v, u); dist.set(v, dist.get(u) + Math.sqrt(d2) / LY); next.push(v); }
      }
    }
    frontier = next;
  }
  if (!prev.has(to)) throw new Error(`Out of range: no chain of jumps within ${range.toFixed(2)} LY reaches ${toName}.`);
  const path = [];
  for (let cur = to; cur !== null; cur = prev.get(cur)) path.unshift(cur);
  // Fatigue estimate: reactivation = max(1 + d, fatigue/10) min; fatigue = max(fatigue, 10) × (1 + d), capped at 5h
  let fatigue = 0, totalWait = 0;
  const legs = [];
  for (let i = 1; i < path.length; i++) {
    const d = distLy(path[i - 1], path[i]);
    const eff = d * sh.fatigue;
    const reactivation = Math.max(1 + eff, fatigue / 10);
    fatigue = Math.min(300, Math.max(fatigue, 10) * (1 + eff));
    if (i > 1) totalWait += reactivation;
    const s = sde.system(path[i]);
    legs.push({ from: sde.system(path[i - 1]).name, to: s.name, toId: path[i], region: s.region, security: s.security, ly: d, reactivationMin: reactivation, fatigueMin: fatigue });
  }
  return { ship, jdc, range, from: sde.system(from).name, to: sde.system(to).name, jumps: legs.length, legs, totalLy: legs.reduce((n, l) => n + l.ly, 0), finalFatigueMin: fatigue, waitMin: totalWait, ships: Object.keys(SHIPS) };
}

function systemsInRange(name, ly) {
  const id = sde.systemIdByName(name);
  if (!id) throw new Error(`Unknown system "${name}".`);
  const p = sde.system(id).pos;
  return Object.keys(sde.allSystems()).map(Number).filter(x => x !== id && cynoOk(x)).map(x => ({ id: x, ly: (() => { const q = sde.system(x).pos; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) / LY; })() }))
    .filter(x => x.ly <= ly).sort((a, b) => a.ly - b.ly).map(x => ({ ...x, name: sde.system(x.id).name, region: sde.system(x.id).region, security: sde.system(x.id).security }));
}

// ---------- Universe status ----------

async function universe() {
  const [camp, inc, fw, thera] = await Promise.all([
    safe(() => get('/sovereignty/campaigns/')), safe(() => get('/incursions/')), safe(() => get('/fw/systems/')), safe(() => theraConnections())
  ]);
  const ids = new Set();
  if (ok(camp)) camp.forEach(c => { ids.add(c.defender_id); });
  if (ok(fw)) fw.forEach(f => { ids.add(f.owner_faction_id); ids.add(f.occupier_faction_id); });
  if (ok(inc)) inc.forEach(i => ids.add(i.faction_id));
  const names = await resolveNames([...ids].filter(Boolean));
  const sysName = id => { const s = sde.ready() ? sde.system(id) : null; return s ? s.name : `System ${id}`; };
  const regionOf = id => { const s = sde.ready() ? sde.system(id) : null; return s ? s.region : ''; };
  const EV = { tcu_defense: 'TCU', ihub_defense: 'Infrastructure Hub', station_defense: 'Station', station_freeport: 'Freeport' };
  return {
    campaigns: ok(camp) ? camp.map(c => ({ system: sysName(c.solar_system_id), region: regionOf(c.solar_system_id), type: EV[c.event_type] || c.event_type, start: c.start_time, defender: names[c.defender_id], defenderScore: c.defender_score, attackersScore: c.attackers_score }))
      .sort((a, b) => a.start.localeCompare(b.start)) : [],
    incursions: ok(inc) ? inc.map(i => ({ state: i.state, staging: sysName(i.staging_solar_system_id), region: regionOf(i.staging_solar_system_id), systems: i.infested_solar_systems.length, influence: i.influence, boss: i.has_boss, type: i.type, faction: names[i.faction_id] })) : [],
    fw: ok(fw) ? fw.map(f => ({ system: sysName(f.solar_system_id), region: regionOf(f.solar_system_id), owner: names[f.owner_faction_id], occupier: names[f.occupier_faction_id], contested: f.contested, vp: f.victory_points, threshold: f.victory_points_threshold, pct: f.victory_points_threshold ? f.victory_points / f.victory_points_threshold : 0 }))
      .sort((a, b) => b.pct - a.pct) : [],
    thera: ok(thera) ? thera : [], theraError: ok(thera) ? null : thera.__error
  };
}

module.exports = { route, jumpPlan, systemsInRange, universe, theraConnections, SHIPS, secClass };
