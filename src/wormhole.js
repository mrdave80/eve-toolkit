// Wormhole mapping: system info, live pilot tracking with auto-mapping,
// connections, signatures and routes. Maps live in the corp workspace so they
// can be shared through workspace export/import.
const store = require('./store');
const ws = require('./workspace');
const { get, rawRequest, safe, ok } = require('./esi');

const J_CLASS = { A: 'C1', B: 'C2', C: 'C3', D: 'C4', E: 'C5', F: 'C6', G: 'Thera', H: 'C13', K: 'Drifter' };
const POCHVEN_REGION = 10000070;

// ---------- System data ----------

const inflight = new Map();
const WH_CLS = { 1: 'C1', 2: 'C2', 3: 'C3', 4: 'C4', 5: 'C5', 6: 'C6', 12: 'Thera', 13: 'C13', 14: 'Drifter', 15: 'Drifter', 16: 'Drifter', 17: 'Drifter', 18: 'Drifter', 25: 'Pochven' };
function fromSde(id) {
  const sde = require('./sde');
  if (!sde.ready()) return null;
  const s = sde.system(id);
  if (!s) return null;
  const sec = Math.round(s.security * 10) / 10;
  const wspace = s.regionId >= 11000000;
  let cls = WH_CLS[s.whClass] || null;
  if (!cls) cls = wspace ? 'J' : s.regionId === POCHVEN_REGION ? 'Pochven' : (sec >= 0.5 ? 'HS' : sec > 0 ? 'LS' : 'NS');
  return { id, name: s.name, security: s.security, cls, wspace, region: s.region, regionId: s.regionId, constellation: s.constellation, gates: sde.gates(id), effect: s.sun || null };
}

async function systemInfo(id) {
  const local = fromSde(id);
  if (local) return local;
  const data = store.get();
  data.whSystems = data.whSystems || {};
  if (data.whSystems[id]) return data.whSystems[id];
  if (inflight.has(id)) return inflight.get(id);
  const p = (async () => {
    const s = await get(`/universe/systems/${id}/`);
    const con = await get(`/universe/constellations/${s.constellation_id}/`);
    const reg = await get(`/universe/regions/${con.region_id}/`);
    const sec = Math.round(s.security_status * 10) / 10;
    let cls;
    if (con.region_id >= 11000000) cls = J_CLASS[reg.name[0]] || 'J';
    else if (con.region_id === POCHVEN_REGION) cls = 'Pochven';
    else cls = sec >= 0.5 ? 'HS' : sec > 0 ? 'LS' : 'NS';
    const gates = [];
    for (const g of s.stargates || []) {
      const r = await safe(() => get(`/universe/stargates/${g}/`));
      if (ok(r)) gates.push(r.destination.system_id);
    }
    const info = {
      id, name: s.name, security: s.security_status, cls, wspace: con.region_id >= 11000000,
      region: reg.name, regionId: con.region_id, constellation: con.name, gates
    };
    data.whSystems[id] = info;
    store.save();
    return info;
  })();
  inflight.set(id, p);
  try { return await p; } finally { inflight.delete(id); }
}

async function systemByName(name) {
  const sde = require('./sde');
  if (sde.ready()) { const id = sde.systemIdByName(name); if (id) return systemInfo(id); }
  const r = await rawRequest('/universe/ids/', { method: 'POST', body: [String(name).trim()] });
  const s = (r.body.systems || [])[0];
  if (!s) throw new Error(`No solar system named "${name}".`);
  return systemInfo(s.id);
}

let activityCache = { at: 0, kills: {}, jumps: {} };
async function activity() {
  if (Date.now() - activityCache.at < 15 * 60000) return activityCache;
  const [k, j] = await Promise.all([safe(() => get('/universe/system_kills/')), safe(() => get('/universe/system_jumps/'))]);
  const kills = {}, jumps = {};
  if (ok(k)) for (const x of k) kills[x.system_id] = { ship: x.ship_kills, pod: x.pod_kills, npc: x.npc_kills };
  if (ok(j)) for (const x of j) jumps[x.system_id] = x.ship_jumps;
  activityCache = { at: Date.now(), kills, jumps };
  return activityCache;
}

const HUBS = { Jita: 30000142, Amarr: 30002187, Dodixie: 30002659, Rens: 30002510, Hek: 30002053 };
async function hubRoutes(systemId) {
  const out = {};
  await Promise.all(Object.entries(HUBS).map(async ([n, id]) => {
    const r = await safe(() => get(`/route/${systemId}/${id}/?flag=shortest`));
    out[n] = ok(r) ? r.length - 1 : null;
  }));
  return out;
}

// ---------- Map operations ----------

const newId = () => require('crypto').randomBytes(6).toString('hex');
function getMap(id) {
  const m = ws.get().maps.find(x => x.id === id);
  if (!m) throw new Error('Map not found');
  m.systems = m.systems || []; m.connections = m.connections || [];
  return m;
}
function saveMap(m) { return ws.upsert('maps', m); }
const findSys = (m, id) => m.systems.find(s => s.id === id);

function placeNear(m, parentId) {
  const p = parentId ? findSys(m, parentId) : null;
  if (!p) {
    const maxX = m.systems.reduce((n, s) => Math.max(n, s.x), 0);
    return { x: m.systems.length ? maxX + 220 : 120, y: 140 };
  }
  const kids = m.connections.filter(c => c.from === p.id || c.to === p.id).length;
  let x = p.x + 230, y = p.y + (kids - 1) * 92;
  for (let i = 0; i < 30 && m.systems.some(s => Math.abs(s.x - x) < 170 && Math.abs(s.y - y) < 70); i++) y += 92;
  return { x, y };
}

async function addSystem(m, systemId, parentId = null, extra = {}) {
  let s = findSys(m, systemId);
  if (s) return s;
  const info = await systemInfo(systemId);
  const pos = placeNear(m, parentId);
  s = { id: systemId, name: info.name, cls: info.cls, security: info.security, region: info.region, wspace: info.wspace, effect: info.effect || null,
    x: pos.x, y: pos.y, label: '', notes: '', sigs: [], addedAt: new Date().toISOString(), ...extra };
  m.systems.push(s);
  return s;
}

function addConnection(m, from, to, props = {}) {
  let c = m.connections.find(x => (x.from === from && x.to === to) || (x.from === to && x.to === from));
  if (c) { Object.assign(c, props, { updatedAt: new Date().toISOString() }); return c; }
  c = { id: newId(), from, to, type: '', mass: 'stable', eol: false, size: 'L', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...props };
  m.connections.push(c);
  return c;
}

// In-game probe scanner copy: ID \t Group \t Category \t Name \t Signal% \t Distance
function parseSigs(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const cols = line.split('\t');
    const id = (cols[0] || '').trim().toUpperCase();
    if (!/^[A-Z]{3}-\d{3}$/.test(id)) continue;
    const group = (cols[1] || '').trim();
    out.push({
      id, group: /anomal/i.test(group) ? 'Anomaly' : 'Signature',
      type: (cols[2] || '').trim().replace(/ Site$/i, '') || '',
      name: (cols[3] || '').trim(),
      strength: parseFloat((cols[4] || '').replace('%', '').replace(',', '.')) || 0
    });
  }
  return out;
}

async function op(mapId, o) {
  if (o.kind === 'createMap') {
    return ws.upsert('maps', { name: o.name || 'Chain', systems: [], connections: [], homeId: null, mapGates: false });
  }
  const m = getMap(mapId);
  const now = new Date().toISOString();
  switch (o.kind) {
    case 'renameMap': m.name = o.name; break;
    case 'deleteMap': ws.remove('maps', mapId); return null;
    case 'setOption': m[o.key] = o.value; break;
    case 'addSystemByName': {
      const info = await systemByName(o.name);
      await addSystem(m, info.id, o.parentId || null);
      if (o.parentId) addConnection(m, o.parentId, info.id, o.connection || {});
      break;
    }
    case 'moveSystem': { const s = findSys(m, o.id); if (s) { s.x = Math.round(o.x); s.y = Math.round(o.y); } break; }
    case 'updateSystem': { const s = findSys(m, o.id); if (s) Object.assign(s, pick(o.patch, ['label', 'notes', 'pinned', 'effect', 'statics', 'locked'])); break; }
    case 'removeSystem':
      m.systems = m.systems.filter(s => s.id !== o.id);
      m.connections = m.connections.filter(c => c.from !== o.id && c.to !== o.id);
      if (m.homeId === o.id) m.homeId = null;
      break;
    case 'setHome': m.homeId = o.id; { const s = findSys(m, o.id); if (s) s.pinned = true; } break;
    case 'addConnection': addConnection(m, o.from, o.to, o.props || {}); break;
    case 'updateConnection': {
      const c = m.connections.find(x => x.id === o.id);
      if (c) {
        const patch = pick(o.patch, ['type', 'mass', 'eol', 'size', 'notes', 'sigFrom', 'sigTo']);
        if (patch.eol && !c.eol) c.eolAt = now;
        if (patch.mass && patch.mass !== c.mass) c.massAt = now;
        Object.assign(c, patch, { updatedAt: now });
      }
      break;
    }
    case 'removeConnection': m.connections = m.connections.filter(c => c.id !== o.id); break;
    case 'clearOld': {
      const cutoff = Date.now() - (o.hours || 24) * 3600000;
      const eolCut = Date.now() - 4 * 3600000;
      m.connections = m.connections.filter(c => Date.parse(c.createdAt) > cutoff && !(c.eol && c.eolAt && Date.parse(c.eolAt) < eolCut));
      const linked = new Set(m.connections.flatMap(c => [c.from, c.to]));
      m.systems = m.systems.filter(s => s.pinned || s.id === m.homeId || linked.has(s.id));
      break;
    }
    case 'pasteSigs': {
      const s = findSys(m, o.systemId);
      if (!s) break;
      const parsed = parseSigs(o.text);
      if (!parsed.length) throw new Error('No signatures found. In game, open the Probe Scanner, select all results (Ctrl+A), copy (Ctrl+C) and paste here.');
      const seen = new Set(parsed.map(p => p.id));
      let added = 0, updated = 0, removed = 0;
      for (const p of parsed) {
        const ex = s.sigs.find(x => x.id === p.id);
        if (ex) {
          // keep user fields; only upgrade scanned info
          if (p.type) ex.type = p.type;
          if (p.name) ex.name = p.name;
          ex.strength = Math.max(ex.strength || 0, p.strength);
          ex.group = p.group; ex.lastSeen = now; ex.gone = false; updated++;
        } else { s.sigs.push({ ...p, firstSeen: now, lastSeen: now, whType: '', leadsTo: '', notes: '' }); added++; }
      }
      for (const x of s.sigs) if (!seen.has(x.id) && (x.group === 'Signature' || parsed.some(p => p.group === x.group))) {
        if (o.removeMissing) x.__del = true; else x.gone = true;
      }
      removed = s.sigs.filter(x => x.__del).length;
      s.sigs = s.sigs.filter(x => !x.__del);
      s.sigsAt = now;
      saveMap(m);
      return { map: m, result: { added, updated, removed } };
    }
    case 'updateSig': {
      const s = findSys(m, o.systemId);
      const sig = s && s.sigs.find(x => x.id === o.sigId);
      if (sig) Object.assign(sig, pick(o.patch, ['whType', 'leadsTo', 'notes', 'type', 'name']));
      if (sig && o.patch.leadsTo) {
        const target = await systemByName(o.patch.leadsTo);
        await addSystem(m, target.id, s.id);
        const c = addConnection(m, s.id, target.id, { type: sig.whType || '', sigFrom: sig.id });
        sig.leadsToId = target.id; sig.leadsTo = target.name;
        c.sigFrom = sig.id;
      }
      break;
    }
    case 'removeSig': { const s = findSys(m, o.systemId); if (s) s.sigs = s.sigs.filter(x => x.id !== o.sigId); break; }
    default: throw new Error('Unknown map operation ' + o.kind);
  }
  return saveMap(m);
}
const pick = (o, keys) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => keys.includes(k)));

// ---------- Live tracking ----------

const tracker = { mapId: null, pilots: new Set(), positions: {}, ships: {}, timer: null, log: [], onEvent: () => {} };

async function pollOnce() {
  if (!tracker.mapId) return;
  let m;
  try { m = getMap(tracker.mapId); } catch { stopTracking(); return; }
  let changed = false;
  for (const charId of tracker.pilots) {
    const loc = await safe(() => get(`/characters/${charId}/location/`, charId));
    if (!ok(loc)) continue;
    const ship = await safe(() => get(`/characters/${charId}/ship/`, charId));
    if (ok(ship)) tracker.ships[charId] = ship.ship_type_id;
    const prev = tracker.positions[charId];
    const cur = loc.solar_system_id;
    tracker.positions[charId] = cur;
    if (!prev || prev === cur) {
      // First sighting: drop the pilot's system on an empty map
      if (!prev && !m.systems.length) { await addSystem(m, cur, null); m.homeId = m.homeId || cur; changed = true; }
      continue;
    }
    const from = await systemInfo(prev).catch(() => null);
    const gate = from ? from.gates.includes(cur) : false;
    const inMap = !!findSys(m, prev);
    const charName = (store.get().characters.find(c => c.id === charId) || {}).name || charId;
    const entry = { at: new Date().toISOString(), charId, charName, from: prev, to: cur, gate };
    const toInfoEarly = await systemInfo(cur).catch(() => null);
    const touchesWspace = (from && from.wspace) || (toInfoEarly && toInfoEarly.wspace);
    if (!gate && (inMap || touchesWspace)) {
      if (!inMap) await addSystem(m, prev, null);
      await addSystem(m, cur, prev);
      addConnection(m, prev, cur, { auto: true, firstBy: charName });
      changed = true; entry.mapped = true;
    } else if (gate && inMap && m.mapGates) {
      await addSystem(m, cur, prev);
      addConnection(m, prev, cur, { gate: true, type: 'Stargate', auto: true });
      changed = true; entry.mapped = true;
    }
    const toInfo = await systemInfo(cur).catch(() => null);
    entry.fromName = from ? from.name : prev; entry.toName = toInfo ? toInfo.name : cur;
    tracker.log.unshift(entry);
    tracker.log = tracker.log.slice(0, 50);
    tracker.onEvent('jump', entry);
  }
  if (changed) { saveMap(m); tracker.onEvent('map', m); }
  tracker.onEvent('positions', status());
}

function startTracking(mapId, pilots) {
  tracker.mapId = mapId;
  tracker.pilots = new Set(pilots);
  clearInterval(tracker.timer);
  tracker.timer = setInterval(() => pollOnce().catch(() => {}), 10000);
  pollOnce().catch(() => {});
  return status();
}
function stopTracking() { clearInterval(tracker.timer); tracker.timer = null; tracker.mapId = null; return status(); }
function status() {
  return { mapId: tracker.mapId, pilots: [...tracker.pilots], positions: tracker.positions, ships: tracker.ships, log: tracker.log, active: !!tracker.timer };
}

module.exports = { systemInfo, systemByName, activity, hubRoutes, op, startTracking, stopTracking, status, pollOnce, parseSigs, setListener: fn => { tracker.onEvent = fn; } };
