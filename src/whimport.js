'use strict';
/* Import wormhole chains exported from other mappers: Pathfinder, Wanderer, Nexum, or a plain
   list of systems ("Home -> J123456 -> J234567"). Everything is read loosely and checked: these
   files come from other people and other tools, and their formats change. */

const isSysId = v => { const x = Number(v); return Number.isInteger(x) && x >= 30000000 && x < 33000000; };
const str = (v, n = 80) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const SYS_KEYS = ['systemId', 'system_id', 'solar_system_id', 'solarSystemId', 'solarsystemid', 'eveId', 'eve_id', 'id'];
const NAME_KEYS = ['name', 'systemName', 'system_name', 'solar_system_name', 'solarSystemName'];
const LABEL_KEYS = ['alias', 'custom_name', 'label', 'tag', 'nickname', 'description'];
const FROM_KEYS = ['source', 'solar_system_source', 'from', 'systemA', 'system_a', 'a', 'sourceId', 'source_id', 'fromId', 'from_id', 'origin'];
const TO_KEYS = ['target', 'solar_system_target', 'to', 'systemB', 'system_b', 'b', 'targetId', 'target_id', 'toId', 'to_id', 'destination'];
const first = (o, keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };

/** Mass, life and size from whatever the other mapper called them. */
function connProps(c) {
  const out = { mass: 'stable', eol: false, size: 'L', type: '' };
  const types = Array.isArray(c.type) ? c.type.map(String) : [];
  const flat = JSON.stringify(c).toLowerCase();
  // Pathfinder: type: ['wh_fresh' | 'wh_reduced' | 'wh_critical' | 'wh_eol' | 'frigate' | 'preserve_mass' ...]
  if (types.includes('wh_critical')) out.mass = 'crit'; else if (types.includes('wh_reduced')) out.mass = 'destab';
  if (types.includes('wh_eol')) out.eol = true;
  if (types.includes('frigate')) out.size = 'S';
  if (types.includes('stargate') || c.scope === 'stargate') out.gate = true;
  // Wanderer: mass_status 0 fresh / 1 reduced / 2 critical, time_status 1 = EOL, ship_size_type 0..3
  if (c.mass_status !== undefined) out.mass = ['stable', 'destab', 'crit'][Number(c.mass_status)] || 'stable';
  if (c.time_status !== undefined) out.eol = Number(c.time_status) === 1;
  if (c.ship_size_type !== undefined) out.size = ['S', 'M', 'L', 'XL'][Number(c.ship_size_type)] || 'L';
  // Anything else: words in the fields
  const m = first(c, ['mass', 'massStatus', 'mass_state', 'massState']);
  if (typeof m === 'string') { if (/crit/i.test(m)) out.mass = 'crit'; else if (/reduc|destab|half/i.test(m)) out.mass = 'destab'; }
  const e = first(c, ['eol', 'isEol', 'is_eol', 'endOfLife', 'end_of_life']);
  if (e === true || e === 1 || e === 'true') out.eol = true;
  if (!types.length && c.scope === undefined && /"(gate|stargate)"/.test(flat)) out.gate = true;
  const sz = first(c, ['size', 'shipSize', 'ship_size', 'maxShipSize']);
  if (typeof sz === 'string') out.size = /frig|small|^s$/i.test(sz) ? 'S' : /medium|cruiser|^m$/i.test(sz) ? 'M' : /xl|capital|freight/i.test(sz) ? 'XL' : 'L';
  const wt = first(c, ['wormholeType', 'wh_type', 'whType', 'sig_type', 'typeName']) || (typeof c.type === 'string' ? c.type : '');
  if (typeof wt === 'string' && /^([A-Z]\d{3}|K162|[A-Z]{2}\d{3})$/i.test(wt.trim())) out.type = wt.trim().toUpperCase();
  return out;
}

/** Find the arrays of systems and connections anywhere in a JSON document. */
function scanJson(root) {
  const arrays = [];
  const walk = (v, key, depth) => {
    if (depth > 6 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) { if (v.length && v.every(x => x && typeof x === 'object' && !Array.isArray(x))) arrays.push({ key: String(key || '').toLowerCase(), items: v }); v.slice(0, 50).forEach(x => walk(x, key, depth + 1)); return; }
    for (const [k, x] of Object.entries(v)) walk(x, k, depth + 1);
  };
  walk(root, '', 0);
  const looksSystem = o => isSysId(first(o, SYS_KEYS)) || /^J\d{6}$/i.test(str(first(o, NAME_KEYS)));
  const looksConn = o => first(o, FROM_KEYS) !== undefined && first(o, TO_KEYS) !== undefined;
  const score = (a, f) => a.items.filter(f).length / a.items.length;
  const sysArr = arrays.filter(a => !/conn|link|edge/.test(a.key)).map(a => ({ a, s: score(a, looksSystem) })).filter(x => x.s >= 0.6).sort((x, y) => y.a.items.length - x.a.items.length)[0];
  const connArr = arrays.map(a => ({ a, s: score(a, looksConn) })).filter(x => x.s >= 0.6).sort((x, y) => y.a.items.length - x.a.items.length)[0];
  return { systems: sysArr ? sysArr.a.items : [], connections: connArr ? connArr.a.items : [] };
}

function detectSource(root, text) {
  if (/solar_system_source|solar_system_id/.test(text)) return 'Wanderer';
  if (/"systemId"/.test(text) && /"wh_(fresh|reduced|critical|eol)"|"scope"\s*:\s*"wh"/.test(text)) return 'Pathfinder';
  if (/nexum/i.test(text)) return 'Nexum';
  return 'another mapper';
}

/** Parse JSON from another mapper. Returns systems keyed by EVE id or name and the links between them. */
function parseJson(root, text) {
  const { systems, connections } = scanJson(root);
  if (!systems.length && !connections.length) throw new Error('No systems or connections found in that file.');
  const byKey = new Map();     // the other tool's own id → our system record
  const out = [];
  const add = rec => { const k = rec.id || rec.name.toUpperCase(); let s = out.find(x => (x.id || x.name.toUpperCase()) === k); if (!s) { s = rec; out.push(s); } return s; };
  for (const o of systems.slice(0, 1000)) {
    const sysKeyed = SYS_KEYS.map(k => o[k]).find(isSysId);
    const name = str(first(o, NAME_KEYS), 40);
    if (!sysKeyed && !name) continue;
    const pos = o.position && typeof o.position === 'object' ? o.position : o;
    const x = Number(first(pos, ['x', 'position_x', 'posX', 'left'])), y = Number(first(pos, ['y', 'position_y', 'posY', 'top']));
    const s = add({ id: sysKeyed ? Number(sysKeyed) : null, name, label: str(first(o, LABEL_KEYS), 80), x: Number.isFinite(x) ? x : null, y: Number.isFinite(y) ? y : null });
    // Pathfinder links systems by its own row id, others by EVE id or name
    for (const k of ['id', 'map_system_id', 'mapSystemId', 'uuid', 'key']) if (o[k] !== undefined) byKey.set(String(o[k]), s);
    if (s.id) byKey.set(String(s.id), s);
    if (name) byKey.set(name.toUpperCase(), s);
  }
  const resolve = v => {
    if (v && typeof v === 'object') v = first(v, [...SYS_KEYS, ...NAME_KEYS]);
    if (v === undefined || v === null) return null;
    const hit = byKey.get(String(v)) || byKey.get(String(v).toUpperCase());
    if (hit) return hit;
    if (isSysId(v)) return add({ id: Number(v), name: '', label: '', x: null, y: null });
    if (typeof v === 'string' && /^[A-Z0-9-]{3,}$/i.test(v.trim())) return add({ id: null, name: v.trim(), label: '', x: null, y: null });
    return null;
  };
  const links = [];
  for (const c of connections.slice(0, 3000)) {
    const a = resolve(first(c, FROM_KEYS)), b = resolve(first(c, TO_KEYS));
    if (!a || !b || a === b) continue;
    links.push({ a, b, ...connProps(c) });
  }
  const name = str(first(root, ['name', 'mapName', 'map_name', 'title']) || (root.data && first(root.data, ['name', 'mapName'])) || (root.map && first(root.map, ['name'])), 80);
  return { name, systems: out, links, source: detectSource(root, text) };
}

/** A plain list: one chain per line, systems separated by arrows, commas or tabs. */
function parseText(text) {
  const out = [], links = [];
  const add = n => { const k = n.toUpperCase(); let s = out.find(x => x.name.toUpperCase() === k); if (!s) { s = { id: null, name: n, label: '', x: null, y: null }; out.push(s); } return s; };
  for (const line of String(text).split(/\r?\n/).slice(0, 500)) {
    const parts = line.split(/\s*(?:<->|<=>|->|=>|→|⇄|↔|>|,|\t|\|)\s*/).map(p => p.trim().replace(/\s*\(.*\)$/, '')).filter(p => /^[A-Za-z0-9][A-Za-z0-9 -]{1,30}$/.test(p));
    if (!parts.length) continue;
    const sys = parts.map(add);
    for (let i = 1; i < sys.length; i++) if (sys[i] !== sys[i - 1]) links.push({ a: sys[i - 1], b: sys[i], mass: 'stable', eol: false, size: 'L', type: '' });
  }
  if (!out.length) throw new Error('No systems found. Paste a map file from Pathfinder, Wanderer or Nexum, or a list like "Home -> J123456 -> J234567".');
  return { name: '', systems: out, links, source: 'a system list' };
}

function parseForeign(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Nothing to import.');
  if (t.length > 6 * 1024 * 1024) throw new Error('That file is too big to be a wormhole map.');
  if (/^[[{]/.test(t)) {
    let root; try { root = JSON.parse(t); } catch { throw new Error('That looks like JSON but it is damaged or incomplete.'); }
    return parseJson(root, t);
  }
  return parseText(t);
}

/** Lay out systems with no position: a tree from the first system, columns by jumps. */
function layout(systems, links) {
  const xs = systems.filter(s => s.x !== null && s.y !== null);
  if (xs.length === systems.length && xs.length) {
    // Scale the other tool's coordinates to our spacing (nodes about 230 × 92 apart)
    const minX = Math.min(...xs.map(s => s.x)), minY = Math.min(...xs.map(s => s.y));
    const dx = [...new Set(xs.map(s => s.x))].sort((a, b) => a - b).reduce((m, v, i, a) => (i ? Math.min(m, v - a[i - 1] || m) : m), Infinity);
    const k = Number.isFinite(dx) && dx > 0 && dx < 230 ? 230 / dx : 1;
    for (const s of systems) { s.x = Math.round(120 + (s.x - minX) * k); s.y = Math.round(140 + (s.y - minY) * k); }
    return;
  }
  const adj = new Map(systems.map(s => [s, []]));
  for (const l of links) { adj.get(l.a).push(l.b); adj.get(l.b).push(l.a); }
  const depth = new Map(); const rows = new Map(); const order = [];
  for (const root of systems) {
    if (depth.has(root)) continue;
    depth.set(root, 0); const q = [root];
    while (q.length) { const s = q.shift(); order.push(s); for (const n of adj.get(s)) if (!depth.has(n)) { depth.set(n, depth.get(s) + 1); q.push(n); } }
  }
  let base = 0;
  for (const s of order) {
    const d = depth.get(s);
    if (d === 0 && rows.size) base = Math.max(...rows.values()) + 1;
    const r = Math.max(base, rows.get(d) ?? base);
    rows.set(d, r + 1);
    s.x = 120 + d * 230; s.y = 140 + r * 92;
  }
}

/** Turn a parsed foreign map into our own systems and connections. `lookup(name)` and `info(id)` come from wormhole.js. */
async function build(parsed, { lookup, info }) {
  const unknown = [];
  for (const s of parsed.systems) {
    if (!s.id && s.name) { try { const r = await lookup(s.name); s.id = r.id; s.name = r.name; } catch { unknown.push(s.name); } }
  }
  const ok = parsed.systems.filter(s => s.id);
  // the same system can arrive under a name and an id
  const seen = new Map();
  for (const s of ok) { if (seen.has(s.id)) s.dupeOf = seen.get(s.id); else seen.set(s.id, s); }
  const real = s => s && (s.dupeOf || s);
  const systems = ok.filter(s => !s.dupeOf);
  const links = parsed.links.map(l => ({ ...l, a: real(l.a), b: real(l.b) })).filter(l => l.a && l.b && l.a.id && l.b.id && l.a !== l.b);
  layout(systems, links);
  const now = new Date().toISOString();
  const out = [];
  for (const s of systems) {
    let i = {}; try { i = await info(s.id); } catch {}
    out.push({ id: s.id, name: i.name || s.name || String(s.id), cls: i.cls || '', security: i.security ?? 0, region: i.region || '', wspace: !!i.wspace, effect: i.effect || null,
      x: s.x, y: s.y, label: s.label || '', notes: '', sigs: [], addedAt: now });
  }
  const conns = [];
  for (const l of links) {
    if (conns.some(c => (c.from === l.a.id && c.to === l.b.id) || (c.from === l.b.id && c.to === l.a.id))) continue;
    conns.push({ from: l.a.id, to: l.b.id, type: l.type || '', mass: l.mass, eol: l.eol, eolAt: l.eol ? now : undefined, size: l.size, gate: l.gate || undefined, createdAt: now, updatedAt: now });
  }
  return { name: parsed.name || `Imported from ${parsed.source}`, homeId: null, mapGates: false, systems: out, connections: conns, source: parsed.source, unknown };
}

module.exports = { parseForeign, build, layout, _connProps: connProps };
