'use strict';
/* Places for the route planner: search systems, NPC stations and your structures as you type,
   saved favourites, and how many of your items sit at each station. */
const sde = require('./sde');
const store = require('./store');
const esi = require('./esi');
const assetfinder = require('./assetfinder');

// ---- Station names: from the game data's station list, named through ESI once and kept ----
let building = null;
async function stationIndex() {
  const d = store.get();
  const have = d.stationNames;
  const ad = sde.ready() ? sde.agentData() : null;
  const ids = ad ? Object.keys(ad.stations).map(Number) : [];
  if (have && have.list && (have.count >= ids.length || !ids.length)) return have.list;
  if (!ids.length) return (have && have.list) || [];
  if (!building) building = (async () => {
    const list = [];
    for (let i = 0; i < ids.length; i += 1000) {
      const r = await esi.safe(() => esi.rawRequest('/universe/names/', { method: 'POST', body: ids.slice(i, i + 1000) }));
      if (!esi.ok(r) || !Array.isArray(r.body)) continue;
      for (const x of r.body) if (x.category === 'station') list.push([x.id, x.name, ad.stations[x.id][0]]);
    }
    d.stationNames = { count: list.length, at: Date.now(), list };
    store.save();
    return list;
  })().finally(() => { building = null; });
  return building;
}

/** Your items per location id (stacks, units, value), from the asset finder's cache. */
let warm = null;
async function itemsByLocation(wait) {
  const p = assetfinder.load(false).then(({ rows }) => {
    const m = new Map();
    for (const r of rows) { const x = m.get(r.locationId) || { stacks: 0, units: 0, value: 0, pilots: new Set(), name: r.location, systemId: r.systemId }; x.stacks++; x.units += r.qty; x.value += r.value; x.pilots.add(r.pilot); m.set(r.locationId, x); }
    return m;
  });
  if (wait) return p.catch(() => new Map());
  if (!warm) warm = p.catch(() => null);
  return null;
}
let lastItems = null;
async function items() {
  if (lastItems && Date.now() - lastItems.at < 5 * 60000) return lastItems.map;
  const map = await itemsByLocation(true);
  lastItems = { at: Date.now(), map };
  return map;
}

const favs = () => (store.get().settings.navFavs = store.get().settings.navFavs || []);

function sysInfo(id) { const s = sde.system(id); return s ? { system: s.name, security: s.security, region: s.region } : {}; }
const itemInfo = (m, id) => { const x = m && m.get(id); return x ? { stacks: x.stacks, units: x.units, value: Math.round(x.value), pilots: [...x.pilots] } : null; };

/** Suggestions for what's typed: favourites, systems, stations and your structures. */
async function search(q, o = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  q = String(q || '').trim().toLowerCase();
  const m = await items().catch(() => null);
  const out = [];
  for (const f of favs()) if (!q || f.name.toLowerCase().includes(q)) out.push({ ...f, fav: true, ...sysInfo(f.systemId), items: f.kind === 'system' ? null : itemInfo(m, f.id) });
  if (!q) return out.slice(0, 20);
  if (q.length >= 2) {
    // Systems: names starting with the text first
    const sys = [];
    for (const [id, s] of Object.entries(sde.allSystems())) { const n = s[0].toLowerCase(); if (n.startsWith(q)) sys.push([0, Number(id)]); else if (q.length >= 3 && n.includes(q)) sys.push([1, Number(id)]); }
    sys.sort((a, b) => a[0] - b[0] || sde.system(a[1]).name.localeCompare(sde.system(b[1]).name));
    for (const [, id] of sys.slice(0, 6)) {
      let here = null;
      if (m) for (const x of m.values()) if (x.systemId === id) { here = here || { stacks: 0, value: 0, places: 0 }; here.stacks += x.stacks; here.value += x.value; here.places++; }
      out.push({ kind: 'system', id, systemId: id, name: sde.system(id).name, ...sysInfo(id), items: here ? { stacks: here.stacks, value: Math.round(here.value), places: here.places } : null });
    }
    // Stations
    const st = await stationIndex().catch(() => []);
    const hits = st.filter(([, n]) => n.toLowerCase().includes(q));
    hits.sort((a, b) => (m && m.has(b[0]) ? 1 : 0) - (m && m.has(a[0]) ? 1 : 0) || (a[1].toLowerCase().startsWith(q) ? 0 : 1) - (b[1].toLowerCase().startsWith(q) ? 0 : 1) || a[1].localeCompare(b[1]));
    for (const [id, name, systemId] of hits.slice(0, 12)) out.push({ kind: 'station', id, systemId, name, ...sysInfo(systemId), items: itemInfo(m, id) });
    // Your structures (from your assets)
    if (m) for (const [id, x] of m) if (id >= 1e12 && x.name && x.name.toLowerCase().includes(q) && x.systemId) out.push({ kind: 'structure', id, systemId: x.systemId, name: x.name, ...sysInfo(x.systemId), items: itemInfo(m, id) });
  }
  // de-dupe favourites against results
  const seen = new Set();
  return out.filter(x => { const k = x.kind + ':' + x.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 30);
}

/** Stations in one system, with your items there. */
async function stationsIn(systemName) {
  const id = typeof systemName === 'number' ? systemName : sde.systemIdByName(String(systemName || ''));
  if (!id) throw new Error(`Unknown system "${systemName}".`);
  const m = await items().catch(() => null);
  let st = (await stationIndex().catch(() => [])).filter(s => s[2] === id).map(([sid, name]) => ({ kind: 'station', id: sid, name }));
  if (!st.length) {
    const s = await esi.safe(() => esi.get(`/universe/systems/${id}/`));
    const ids = esi.ok(s) ? s.stations || [] : [];
    const names = ids.length ? await esi.resolveNames(ids).catch(() => ({})) : {};
    st = ids.map(sid => ({ kind: 'station', id: sid, name: names[sid] || `Station ${sid}` }));
  }
  if (m) for (const [lid, x] of m) if (lid >= 1e12 && x.systemId === id) st.push({ kind: 'structure', id: lid, name: x.name });
  return { system: sde.system(id).name, systemId: id, ...sysInfo(id), places: st.map(p => ({ ...p, systemId: id, items: itemInfo(m, p.id) })).sort((a, b) => ((b.items && b.items.stacks) || 0) - ((a.items && a.items.stacks) || 0) || a.name.localeCompare(b.name)) };
}

function addFav(p) {
  if (!p || !p.name || !Number.isInteger(Number(p.id)) || !Number.isInteger(Number(p.systemId))) throw new Error('Pick a system or station first.');
  const list = favs();
  if (!list.some(f => f.kind === p.kind && f.id === Number(p.id))) list.push({ kind: ['system', 'station', 'structure'].includes(p.kind) ? p.kind : 'system', id: Number(p.id), systemId: Number(p.systemId), name: String(p.name).slice(0, 100), label: p.label ? String(p.label).slice(0, 30) : '' });
  if (list.length > 40) list.shift();
  store.save(); return list;
}
function removeFav(kind, id) { const s = store.get().settings; s.navFavs = favs().filter(f => !(f.kind === kind && f.id === Number(id))); store.save(); return s.navFavs; }
async function listFavs() { const m = await items().catch(() => null); return favs().map(f => ({ ...f, ...sysInfo(f.systemId), items: f.kind === 'system' ? null : itemInfo(m, f.id) })); }

/** Start reading assets in the background so counts are ready when the user types. */
function prepare() { itemsByLocation(false); stationIndex().catch(() => {}); return true; }

module.exports = { search, stationsIn, addFav, removeFav, listFavs, prepare };
