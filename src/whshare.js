'use strict';
/* Wormhole map sharing: export a map to a file or a text code, and import one from another EVE Toolkit.
   Imported data comes from other people, so everything is checked and trimmed before it's saved. */
const zlib = require('zlib');
const ws = require('./workspace');

const FORMAT = 'eve-toolkit-wormhole-map';
const PREFIX = 'EVETK-WH1:';
const MAX_BYTES = 3 * 1024 * 1024;

const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '');
const num = (v, lo = -1e9, hi = 1e9) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
const iso = v => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null);
const bool = v => v === true;
const sysId = v => { const x = Number(v); return Number.isInteger(x) && x >= 30000000 && x < 33000000 ? x : null; };

function cleanSig(g) {
  if (!g || typeof g !== 'object' || !/^[A-Z]{3}-\d{3}$/i.test(str(g.id, 7))) return null;
  return { id: str(g.id, 7).toUpperCase(), group: str(g.group, 20), type: str(g.type, 40), name: str(g.name, 80), strength: num(g.strength, 0, 100),
    firstSeen: iso(g.firstSeen) || new Date().toISOString(), lastSeen: iso(g.lastSeen), gone: bool(g.gone), whType: str(g.whType, 6), leadsTo: str(g.leadsTo, 40), notes: str(g.notes, 500) };
}
function cleanSystem(s) {
  const id = sysId(s && s.id); if (!id) return null;
  return { id, name: str(s.name, 40), cls: str(s.cls, 12), security: num(s.security, -1, 1), region: str(s.region, 40), wspace: bool(s.wspace), effect: str(s.effect, 40) || null,
    x: Math.round(num(s.x, -50000, 50000)), y: Math.round(num(s.y, -50000, 50000)), label: str(s.label, 80), notes: str(s.notes, 2000), pinned: bool(s.pinned),
    statics: Array.isArray(s.statics) ? s.statics.slice(0, 6).map(x => str(x, 12)) : (typeof s.statics === 'string' ? str(s.statics, 60) : undefined),
    sigs: Array.isArray(s.sigs) ? s.sigs.slice(0, 200).map(cleanSig).filter(Boolean) : [], sigsAt: iso(s.sigsAt), addedAt: iso(s.addedAt) || new Date().toISOString() };
}
function cleanConn(c, ids) {
  const from = sysId(c && c.from), to = sysId(c && c.to);
  if (!from || !to || from === to || !ids.has(from) || !ids.has(to)) return null;
  return { from, to, type: str(c.type, 6), mass: ['stable', 'reduced', 'critical'].includes(c.mass) ? c.mass : 'stable', eol: bool(c.eol), size: ['S', 'M', 'L', 'XL', 'C'].includes(c.size) ? c.size : 'L',
    createdAt: iso(c.createdAt) || new Date().toISOString(), updatedAt: iso(c.updatedAt) || new Date().toISOString(), note: str(c.note, 300) || undefined };
}

/** The shareable copy of a map: no pilot tracking, no internal ids. */
function exportMap(mapId, version) {
  const m = ws.get().maps.find(x => x.id === mapId);
  if (!m) throw new Error('Map not found');
  const systems = (m.systems || []).map(cleanSystem).filter(Boolean);
  const ids = new Set(systems.map(s => s.id));
  return { format: FORMAT, version: 1, app: 'EVE Toolkit ' + version, exportedAt: new Date().toISOString(),
    map: { name: str(m.name, 80) || 'Chain', homeId: sysId(m.homeId), mapGates: bool(m.mapGates), systems, connections: (m.connections || []).map(c => cleanConn(c, ids)).filter(Boolean) } };
}

/** Short text version for pasting into Discord or EVE mail. */
function toCode(data) { return PREFIX + zlib.gzipSync(Buffer.from(JSON.stringify(data))).toString('base64'); }

function parse(input) {
  let text = String(input || '').trim();
  if (!text) throw new Error('Nothing to import.');
  if (text.length > MAX_BYTES * 2) throw new Error('That file is too big to be a wormhole map.');
  const at = text.indexOf(PREFIX);
  if (at >= 0) {
    const b64 = text.slice(at + PREFIX.length).replace(/[^A-Za-z0-9+/=]/g, '');
    try { text = zlib.gunzipSync(Buffer.from(b64, 'base64'), { maxOutputLength: MAX_BYTES }).toString('utf8'); }
    catch { throw new Error('That map code is damaged or incomplete. Copy all of it, including the EVETK-WH1: start.'); }
  }
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Not an EVE Toolkit wormhole map. Export one from the wormhole mapper and import that.'); }
  if (!data || data.format !== FORMAT || !data.map || !Array.isArray(data.map.systems)) throw new Error('Not an EVE Toolkit wormhole map.');
  if (Number(data.version) > 1) throw new Error('This map was exported by a newer EVE Toolkit. Update the app, then import it again.');
  const systems = data.map.systems.slice(0, 1000).map(cleanSystem).filter(Boolean);
  const ids = new Set(systems.map(s => s.id));
  const connections = (Array.isArray(data.map.connections) ? data.map.connections.slice(0, 3000) : []).map(c => cleanConn(c, ids)).filter(Boolean);
  return { name: str(data.map.name, 80) || 'Imported chain', homeId: ids.has(sysId(data.map.homeId)) ? sysId(data.map.homeId) : null, mapGates: bool(data.map.mapGates), systems, connections,
    exportedAt: iso(data.exportedAt), app: str(data.app, 40) };
}

const newId = () => require('crypto').randomBytes(6).toString('hex');

/** mode 'new': a new map. mode 'merge': add what's missing to an existing map; newer signature and connection info wins. */
function importMap(input, { mode = 'new', targetId = null } = {}) {
  const d = parse(input);
  if (mode !== 'merge') {
    const names = new Set(ws.get().maps.map(m => m.name));
    let name = d.name; if (names.has(name)) name = `${name} (imported)`;
    const m = ws.upsert('maps', { name, homeId: d.homeId, mapGates: d.mapGates, systems: d.systems, connections: d.connections.map(c => ({ id: newId(), ...c })), importedAt: new Date().toISOString() });
    return { map: m, mode, systems: d.systems.length, connections: d.connections.length, added: d.systems.length, from: d };
  }
  const m = ws.get().maps.find(x => x.id === targetId);
  if (!m) throw new Error('Pick a map to merge into.');
  m.systems = m.systems || []; m.connections = m.connections || [];
  let addedSys = 0, addedConn = 0, updatedConn = 0, addedSigs = 0;
  for (const s of d.systems) {
    const ex = m.systems.find(x => x.id === s.id);
    if (!ex) { m.systems.push(s); addedSys++; continue; }
    if (!ex.label && s.label) ex.label = s.label;
    if (!ex.notes && s.notes) ex.notes = s.notes;
    ex.sigs = ex.sigs || [];
    for (const g of s.sigs) {
      const eg = ex.sigs.find(x => x.id === g.id);
      if (!eg) { ex.sigs.push(g); addedSigs++; }
      else { for (const k of ['type', 'name', 'whType', 'leadsTo']) if (!eg[k] && g[k]) eg[k] = g[k]; eg.strength = Math.max(eg.strength || 0, g.strength || 0); }
    }
  }
  for (const c of d.connections) {
    const ex = m.connections.find(x => (x.from === c.from && x.to === c.to) || (x.from === c.to && x.to === c.from));
    if (!ex) { m.connections.push({ id: newId(), ...c }); addedConn++; continue; }
    if (Date.parse(c.updatedAt) > Date.parse(ex.updatedAt || 0)) { Object.assign(ex, { type: c.type || ex.type, mass: c.mass, eol: c.eol, size: c.size, updatedAt: c.updatedAt }); updatedConn++; }
  }
  if (!m.homeId && d.homeId) m.homeId = d.homeId;
  const saved = ws.upsert('maps', m);
  return { map: saved, mode, systems: d.systems.length, connections: d.connections.length, added: addedSys, addedConn, updatedConn, addedSigs, from: d };
}

module.exports = { exportMap, toCode, parse, importMap, FORMAT, PREFIX };
