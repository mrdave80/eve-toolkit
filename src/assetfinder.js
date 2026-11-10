'use strict';
/* Asset finder: every pilot's assets in one list, searchable, with the system each stack is in,
   jumps from a system you pick, and a plan for gathering things in one place. */
const sde = require('./sde');
const store = require('./store');
const esi = require('./esi');

const SLOW = 6 * 3600000;
let cache = { at: 0, rows: null, errors: [] };

function locCache() { const d = store.get(); d.locSystems = d.locSystems || {}; return d.locSystems; }

/** Station, structure or system id -> { systemId, name }. Structures need a pilot with docking access. */
async function locate(id, charId) {
  const c = locCache();
  if (c[id] && (c[id].systemId || Date.now() - (c[id].at || 0) < 86400000)) return c[id];
  let v = { systemId: null, name: null, at: Date.now() };
  if (id >= 30000000 && id < 33000000) { const s = sde.ready() && sde.system(id); v = { systemId: id, name: s ? s.name + ' (in space)' : null, at: Date.now() }; }
  else if (id >= 60000000 && id < 64000000) { const s = await esi.safe(() => esi.get(`/universe/stations/${id}/`)); if (esi.ok(s)) v = { systemId: s.system_id, name: s.name, at: Date.now() }; }
  else if (id >= 1e12) { const s = await esi.safe(() => esi.get(`/universe/structures/${id}/`, charId)); if (esi.ok(s)) v = { systemId: s.solar_system_id, name: s.name, structure: true, at: Date.now() }; }
  c[id] = v; store.save();
  return v;
}

/** Gate jumps from one system to every other. */
function distances(from) {
  const dist = new Map([[from, 0]]), q = [from];
  for (let i = 0; i < q.length; i++) for (const v of sde.gates(q[i])) if (!dist.has(v)) { dist.set(v, dist.get(q[i]) + 1); q.push(v); }
  return dist;
}

async function load(force) {
  if (!force && cache.rows && Date.now() - cache.at < SLOW) return cache;
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const chars = (store.get().characters || []).filter(c => !c.needsReauth && (c.scopes || []).includes('esi-assets.read_assets.v1'));
  const rows = [], errors = [];
  for (const c of chars) {
    let a; try { a = await esi.assets(c.id); } catch (e) { errors.push({ pilot: c.name, error: e.message }); continue; }
    for (const l of a.locations) {
      const where = await locate(l.id, c.id);
      const s = where.systemId && sde.system(where.systemId);
      for (const it of l.items) {
        const t = sde.type(it.typeId) || {};
        rows.push({ charId: c.id, pilot: c.name, locationId: l.id, location: where.name || l.name, systemId: where.systemId || null, system: s ? s.name : null,
          security: s ? s.security : null, region: s ? s.region : null, typeId: it.typeId, name: it.name || t.name || `Type ${it.typeId}`, group: t.group || '', category: t.category || '',
          qty: it.quantity, value: it.value || 0, volume: (t.volume || 0) * it.quantity });
      }
    }
  }
  cache = { at: Date.now(), rows, errors };
  return cache;
}

/** Search and sort. o: { q, from (system name), pilot, minValue, group: 'location'|'item' } */
async function search(o = {}) {
  const { rows, errors, at } = await load(!!o.refresh);
  const q = String(o.q || '').trim().toLowerCase();
  let list = rows.filter(r => (!q || r.name.toLowerCase().includes(q) || r.group.toLowerCase().includes(q) || (r.location || '').toLowerCase().includes(q) || (r.system || '').toLowerCase().includes(q))
    && (!o.pilot || r.charId === Number(o.pilot)) && (!o.minValue || r.value >= Number(o.minValue)));
  let fromId = null, dist = null;
  if (o.from) { fromId = sde.systemIdByName(String(o.from)); if (!fromId) throw new Error(`Unknown system "${o.from}".`); dist = distances(fromId); }
  const jumpsOf = sys => (dist && sys ? (dist.has(sys) ? dist.get(sys) : null) : null);
  // Group by location
  const locs = new Map();
  for (const r of list) {
    const k = r.charId + ':' + r.locationId;
    const l = locs.get(k) || { key: k, charId: r.charId, pilot: r.pilot, locationId: r.locationId, location: r.location, systemId: r.systemId, system: r.system, security: r.security, region: r.region, jumps: jumpsOf(r.systemId), items: [], value: 0, volume: 0 };
    l.items.push(r); l.value += r.value; l.volume += r.volume;
    locs.set(k, l);
  }
  const groups = [...locs.values()].map(l => ({ ...l, items: l.items.sort((a, b) => b.value - a.value).slice(0, 300), itemCount: l.items.length }));
  groups.sort(dist ? (a, b) => (a.jumps ?? 9999) - (b.jumps ?? 9999) || b.value - a.value : (a, b) => b.value - a.value);
  const pilots = [...new Map(rows.map(r => [r.charId, r.pilot])).entries()].map(([id, name]) => ({ id, name }));
  return { at, errors, from: fromId ? sde.system(fromId).name : null, groups: groups.slice(0, 400), totalGroups: groups.length, matched: list.length,
    value: list.reduce((n, r) => n + r.value, 0), volume: list.reduce((n, r) => n + r.volume, 0), pilots };
}

/** What would have to move to bring the matching items to one system. */
async function consolidate(o = {}) {
  if (!o.to) throw new Error('Pick the system to gather things in.');
  const r = await search({ ...o, from: o.to });
  const target = r.from;
  const away = r.groups.filter(g => g.system !== target);
  const unreachable = away.filter(g => g.jumps === null);
  const trips = away.filter(g => g.jumps !== null).map(g => ({ ...g, items: g.items.slice(0, 50) }));
  return { to: target, trips, unreachable, here: r.groups.filter(g => g.system === target).length,
    volume: trips.reduce((n, g) => n + g.volume, 0), value: trips.reduce((n, g) => n + g.value, 0), maxJumps: trips.reduce((n, g) => Math.max(n, g.jumps), 0) };
}

module.exports = { search, consolidate, load, _distances: distances };
