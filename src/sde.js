// CCP Static Data Export: downloaded on the user's PC from CCP's official
// site, then reduced to a compact local database the app keeps in memory.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { app } = require('electron');
const yauzl = require('yauzl');

const BASE = 'https://developers.eveonline.com/static-data';
const LATEST = `${BASE}/tranquility/latest.jsonl`;
const zipUrl = build => `${BASE}/tranquility/eve-online-static-data-${build}-jsonl.zip`;

// Dogma attributes we keep (skill requirements, skill training, wormholes, fitting basics)
const KEEP_ATTRS = new Set([
  182, 183, 184, 1285, 1289, 1290, 277, 278, 279, 1286, 1287, 1288, // required skills + levels
  275, 180, 181,                                                    // skill rank, primary, secondary
  1381, 1382, 1383, 1384, 1385, 1457,                               // wormhole target class, life, mass, regen, jump mass, target region
  12, 13, 14, 1137, 1154, 48, 11, 50, 30, 283, 1271,                // slots, cpu/pg output, cpu/pg use, drone bay, bandwidth
  633, 422, 1692                                                    // meta level, tech level, meta group
]);
const REQ = [[182, 277], [183, 278], [184, 279], [1285, 1286], [1289, 1287], [1290, 1288]];
const FILES = ['types', 'groups', 'categories', 'dogmaAttributes', 'typeDogma', 'blueprints', 'typeMaterials', 'mapSolarSystems', 'mapRegions', 'mapConstellations', 'mapStargates', 'mapSecondarySuns', 'mapPlanets', 'marketGroups', 'npcCharacters'];

let db = null;          // loaded database
let fullDb = null;      // item database attributes, loaded on first use
let status = { state: 'none', build: null, progress: 0, message: '' };
let onStatus = () => {};
const setStatus = s => { status = { ...status, ...s }; onStatus(status); };

const dir = () => path.join(app.getPath('userData'), 'sde');
const dbFile = () => path.join(dir(), 'sde-db.json');
const fullFile = () => path.join(dir(), 'sde-dogma.json');   // every attribute of published types, for the item database
const en = o => (o && typeof o === 'object' ? o.en : o) || '';

// ---------- Build from a downloaded zip ----------

function openZip(file) {
  return new Promise((res, rej) => yauzl.open(file, { lazyEntries: true, autoClose: false }, (e, z) => e ? rej(e) : res(z)));
}

async function zipEntries(zip) {
  return new Promise((res, rej) => {
    const map = {};
    zip.on('entry', e => { map[path.basename(e.fileName).replace(/\.jsonl$/, '')] = e; zip.readEntry(); });
    zip.on('end', () => res(map));
    zip.on('error', rej);
    zip.readEntry();
  });
}

function eachLine(zip, entry, fn) {
  return new Promise((res, rej) => {
    zip.openReadStream(entry, (e, stream) => {
      if (e) return rej(e);
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      rl.on('line', line => { if (line.trim()) { try { fn(JSON.parse(line)); } catch (err) { /* skip bad line */ } } });
      rl.on('close', res);
      stream.on('error', rej);
    });
  });
}

async function buildFromZip(file, build) {
  const zip = await openZip(file);
  const entries = await zipEntries(zip);
  const missing = ['types', 'groups', 'blueprints', 'mapSolarSystems'].filter(f => !entries[f]);
  if (missing.length) throw new Error('The downloaded game data is missing: ' + missing.join(', '));
  const out = {
    build, builtAt: new Date().toISOString(),
    types: {}, groups: {}, categories: {}, dogma: {}, blueprints: {}, products: {}, materials: {},
    systems: {}, regions: {}, constellations: {}, gates: {}, suns: {}, planets: {}, marketGroups: {},
    agents: [], stations: {}, npcCorps: {}, factions: {}, divisions: {}, agentTypes: {}
  };
  let step = 0;
  const tick = name => setStatus({ state: 'building', progress: Math.round((++step / FILES.length) * 100), message: `Reading ${name}…` });

  tick('types');
  await eachLine(zip, entries.types, t => {
    out.types[t._key] = [en(t.name), t.groupID, t.portionSize || 1, t.packagedVolume ?? t.volume ?? 0, t.marketGroupID || 0, t.metaGroupID || 0, t.published ? 1 : 0, t.basePrice || 0, t.mass || 0, t.capacity || 0];
  });
  tick('groups');
  await eachLine(zip, entries.groups, g => { out.groups[g._key] = [en(g.name), g.categoryID, g.published ? 1 : 0]; });
  tick('categories');
  if (entries.categories) await eachLine(zip, entries.categories, c => { out.categories[c._key] = en(c.name); });
  tick('attributes');
  const full = { attrs: {}, units: {}, cats: {}, types: {} };
  if (entries.dogmaAttributes) await eachLine(zip, entries.dogmaAttributes, a => {
    full.attrs[a._key] = [en(a.displayName) || '', a.unitID || 0, a.categoryID || 0, a.highIsGood ? 1 : 0, a.published && en(a.displayName) ? 1 : 0, a.name || ''];
  });
  if (entries.dogmaUnits) await eachLine(zip, entries.dogmaUnits, u => { full.units[u._key] = en(u.displayName) || ''; });
  if (entries.dogmaAttributeCategories) await eachLine(zip, entries.dogmaAttributeCategories, c => { full.cats[c._key] = en(c.name) || ''; });
  tick('dogma');
  if (entries.typeDogma) await eachLine(zip, entries.typeDogma, d => {
    const keep = {};
    let any = false;
    const t = out.types[d._key];
    const fl = [];
    for (const a of d.dogmaAttributes || []) {
      if (KEEP_ATTRS.has(a.attributeID)) { keep[a.attributeID] = a.value; any = true; }
      if (t && t[6]) fl.push([a.attributeID, a.value]);
    }
    if (any) out.dogma[d._key] = keep;
    if (fl.length) full.types[d._key] = fl;
  });
  out.full = full;
  tick('blueprints');
  await eachLine(zip, entries.blueprints, b => {
    const acts = {};
    for (const [k, a] of Object.entries(b.activities || {})) {
      acts[k] = {
        t: a.time || 0,
        m: (a.materials || []).map(x => [x.typeID, x.quantity]),
        p: (a.products || []).map(x => [x.typeID, x.quantity, x.probability ?? null]),
        s: (a.skills || []).map(x => [x.typeID, x.level])
      };
      for (const p of a.products || []) {
        if (k === 'manufacturing' || k === 'reaction') out.products[p.typeID] = [b._key, k];
        if (k === 'invention') (out.products['inv:' + p.typeID] = out.products['inv:' + p.typeID] || []).push(b._key);
      }
    }
    out.blueprints[b._key] = { a: acts, max: b.maxProductionLimit || 1 };
  });
  tick('materials');
  if (entries.typeMaterials) await eachLine(zip, entries.typeMaterials, m => {
    if (m.materials) out.materials[m._key] = m.materials.map(x => [x.materialTypeID, x.quantity]);
  });
  tick('systems');
  await eachLine(zip, entries.mapSolarSystems, s => {
    out.systems[s._key] = [en(s.name), s.regionID, s.constellationID, s.securityStatus, s.position ? s.position.x : 0, s.position ? s.position.y : 0, s.position ? s.position.z : 0, s.wormholeClassID || 0];
  });
  tick('regions');
  if (entries.mapRegions) await eachLine(zip, entries.mapRegions, r => { out.regions[r._key] = [en(r.name), r.wormholeClassID || 0]; });
  tick('constellations');
  if (entries.mapConstellations) await eachLine(zip, entries.mapConstellations, c => { out.constellations[c._key] = [en(c.name), c.wormholeClassID || 0, c.regionID]; });
  tick('stargates');
  if (entries.mapStargates) await eachLine(zip, entries.mapStargates, g => {
    const from = g.solarSystemID, to = g.destination && g.destination.solarSystemID;
    if (!from || !to) return;
    (out.gates[from] = out.gates[from] || []).push(to);
  });
  tick('secondary suns');
  if (entries.mapSecondarySuns) await eachLine(zip, entries.mapSecondarySuns, s => { out.suns[s.solarSystemID] = s.typeID; });
  tick('planets');
  if (entries.mapPlanets) await eachLine(zip, entries.mapPlanets, pl => {
    if (!pl.solarSystemID || !pl.typeID) return;
    const m = out.planets[pl.solarSystemID] = out.planets[pl.solarSystemID] || {};
    m[pl.typeID] = (m[pl.typeID] || 0) + 1;
  });
  tick('market groups');
  if (entries.marketGroups) await eachLine(zip, entries.marketGroups, g => { out.marketGroups[g._key] = [en(g.name), g.parentGroupID || 0]; });
  tick('agents');
  // Agents for the agent finder. Field names vary a little between SDE builds, so read them loosely.
  if (entries.npcStations) await eachLine(zip, entries.npcStations, st => { out.stations[st._key] = [st.solarSystemID || st.solarSystemId || 0, st.ownerID || st.corporationID || 0]; });
  if (entries.npcCorporations) await eachLine(zip, entries.npcCorporations, c => { out.npcCorps[c._key] = [en(c.name), c.factionID || 0]; });
  if (entries.factions) await eachLine(zip, entries.factions, f => { out.factions[f._key] = en(f.name); });
  if (entries.npcCorporationDivisions) await eachLine(zip, entries.npcCorporationDivisions, d => { out.divisions[d._key] = en(d.displayName) || en(d.name) || ''; });
  if (entries.agentTypes) await eachLine(zip, entries.agentTypes, a => { out.agentTypes[a._key] = typeof a.name === 'string' ? a.name : en(a.name); });
  if (entries.npcCharacters) await eachLine(zip, entries.npcCharacters, c => {
    const a = c.agent || (c.agentTypeID !== undefined ? c : null);
    if (!a) return;
    const loc = c.locationID || c.stationID || a.locationID || 0;
    out.agents.push([c._key, en(c.name), c.corporationID || a.corporationID || 0, a.level || 0, a.divisionID || 0, a.agentTypeID || 0, loc, a.isLocator ? 1 : 0]);
  });
  zip.close();
  return out;
}

// ---------- Download ----------

async function latestBuild() {
  const r = await fetch(LATEST, { headers: { 'User-Agent': 'EVE-Toolkit-Desktop' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Could not check the latest game data version (${r.status}).`);
  const text = await r.text();
  for (const line of text.split('\n')) {
    try { const j = JSON.parse(line); if (j._key === 'sde') return { build: j.buildNumber, released: j.releaseDate }; } catch {}
  }
  throw new Error('Unexpected response when checking the game data version.');
}

/** Start-up check: does the game data need downloading, refreshing for new app features, or updating to CCP's latest build? */
async function check() {
  if (status.state === 'downloading' || status.state === 'building') return { state: 'busy' };
  if (!db) return { state: 'missing' };
  const have = db.build;
  if (!hasFull() || !hasPlanets()) return { state: 'incomplete', build: have };
  try {
    const { build, released } = await latestBuild();
    if (build && Number(build) > Number(have)) return { state: 'outdated', build: have, latest: build, released };
    return { state: 'ok', build: have, latest: build };
  } catch (e) { return { state: 'ok', build: have, offline: true }; }   // can't reach CCP: don't nag
}

async function download(build) {
  fs.mkdirSync(dir(), { recursive: true });
  const file = path.join(dir(), `sde-${build}.zip`);
  const res = await fetch(zipUrl(build), { headers: { 'User-Agent': 'EVE-Toolkit-Desktop' } });
  if (!res.ok) throw new Error(`Game data download failed (${res.status}).`);
  const total = Number(res.headers.get('content-length') || 0);
  const out = fs.createWriteStream(file + '.part');
  let got = 0, last = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!out.write(Buffer.from(value))) await new Promise(r => out.once('drain', r));
    if (Date.now() - last > 300) { last = Date.now(); setStatus({ state: 'downloading', progress: total ? Math.round(got / total * 100) : 0, message: `Downloading game data… ${(got / 1048576).toFixed(0)} MB${total ? ' of ' + (total / 1048576).toFixed(0) + ' MB' : ''}` }); }
  }
  await new Promise(r => out.end(r));
  fs.renameSync(file + '.part', file);
  return file;
}

async function update({ force = false } = {}) {
  if (status.state === 'downloading' || status.state === 'building') throw new Error('Already updating game data.');
  try {
    setStatus({ state: 'checking', progress: 0, message: 'Checking for the latest game data…' });
    const { build } = await latestBuild();
    if (!force && db && db.build === build && hasFull() && db.planets && Object.keys(db.planets).length) { setStatus({ state: 'ready', message: 'Game data is up to date.' }); return info(); }
    const file = await download(build);
    setStatus({ state: 'building', progress: 0, message: 'Building local database…' });
    const out = await buildFromZip(file, build);
    await install(out);
    try { fs.unlinkSync(file); } catch {}
    return info();
  } catch (e) {
    setStatus({ state: db ? 'ready' : 'error', message: e.message });
    throw e;
  }
}

async function install(out) {
  fs.mkdirSync(dir(), { recursive: true });
  if (out.full) { fs.writeFileSync(fullFile() + '.tmp', JSON.stringify(out.full)); fs.renameSync(fullFile() + '.tmp', fullFile()); delete out.full; fullDb = null; }
  fs.writeFileSync(dbFile() + '.tmp', JSON.stringify(out));
  fs.renameSync(dbFile() + '.tmp', dbFile());
  db = index(out);
  setStatus({ state: 'ready', build: out.build, progress: 100, message: 'Game data ready.' });
}

/** Import a zip the user downloaded themselves (fallback if the in-app download is blocked). */
async function importZip(file) {
  setStatus({ state: 'building', progress: 0, message: 'Building local database…' });
  const m = /(\d{5,})/.exec(path.basename(file));
  const out = await buildFromZip(file, m ? Number(m[1]) : Date.now());
  await install(out);
  return info();
}

// ---------- Load & index ----------

function index(d) {
  d.nameToType = new Map();
  for (const [id, t] of Object.entries(d.types)) {
    const k = t[0].toLowerCase();
    // prefer published types when names collide
    if (!d.nameToType.has(k) || t[6]) d.nameToType.set(k, Number(id));
  }
  d.nameToSystem = new Map();
  for (const [id, s] of Object.entries(d.systems)) d.nameToSystem.set(s[0].toLowerCase(), Number(id));
  return d;
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(dbFile(), 'utf8'));
    db = index(raw);
    setStatus({ state: 'ready', build: db.build, progress: 100, message: 'Game data ready.' });
  } catch { db = null; setStatus({ state: 'none', message: 'Game data not downloaded yet.' }); }
  return !!db;
}

function info() {
  return { ...status, ready: !!db, build: db ? db.build : null, builtAt: db ? db.builtAt : null,
    counts: db ? { types: Object.keys(db.types).length, blueprints: Object.keys(db.blueprints).length, systems: Object.keys(db.systems).length } : null };
}

// ---------- Queries ----------

/** All published attributes for a type, with names and units. null if the game data predates the item database. */
function fullAttrs(id) {
  if (!fullDb) { try { fullDb = JSON.parse(fs.readFileSync(fullFile(), 'utf8')); } catch { return null; } }
  const list = fullDb.types[id] || [];
  return list.map(([a, v]) => { const m = fullDb.attrs[a] || ['', 0, 0, 0, 0, '']; return { id: a, name: m[0], unit: fullDb.units[m[1]] || '', unitId: m[1], category: fullDb.cats[m[2]] || 'Other', highIsGood: !!m[3], published: m[4] === undefined ? true : !!m[4], key: m[5] || '', value: v }; });
}
/** Planets in a system by type, e.g. { Barren: 3, Gas: 2 }. null if the game data predates planet data. */
function planetsIn(id) {
  const d = need(); if (!d.planets || !Object.keys(d.planets).length) return null;
  const m = d.planets[id]; if (!m) return {};
  const out = {};
  for (const [t, n] of Object.entries(m)) { const name = ((d.types[t] || [''])[0].match(/\(([^)]+)\)/) || [])[1] || (d.types[t] || [''])[0]; out[name] = (out[name] || 0) + n; }
  return out;
}
function hasPlanets() { const d = need(); return !!(d.planets && Object.keys(d.planets).length); }
function groupName(id) { const g = need().groups[id]; return g ? g[0] : null; }
function hasFull() {
  if (!fullDb) { try { fullDb = JSON.parse(fs.readFileSync(fullFile(), 'utf8')); } catch { return false; } }
  const any = Object.values(fullDb.attrs || {})[0];
  return !!any && any.length >= 5;   // files from 1.8.7/1.8.8 lack the full attribute list the fit checker needs
}
/** Blueprints that use this type as a material. */
function usedIn(id) {
  const d = need(); const out = [];
  for (const [bp, b] of Object.entries(d.blueprints)) for (const [act, a] of Object.entries(b.a)) {
    if (!['manufacturing', 'reaction'].includes(act)) continue;
    const m = a.m.find(x => x[0] === Number(id));
    if (m) for (const p of a.p) out.push({ productId: p[0], qty: m[1], activity: act, blueprintId: Number(bp) });
  }
  return out;
}

function need() { if (!db) { const e = new Error('Game data is not downloaded yet. Open Settings → Game data and click Download.'); e.code = 'NO_SDE'; throw e; } return db; }

function type(id) {
  const t = need().types[id];
  if (!t) return null;
  const g = db.groups[t[1]] || ['', 0];
  return { id: Number(id), name: t[0], groupId: t[1], group: g[0], categoryId: g[1], category: db.categories[g[1]] || '', portionSize: t[2], volume: t[3], marketGroupId: t[4], metaGroupId: t[5], published: !!t[6], basePrice: t[7], mass: t[8] || 0, capacity: t[9] || 0 };
}
const typeIdByName = name => need().nameToType.get(String(name).trim().toLowerCase()) || null;
const attrs = id => need().dogma[id] || {};

function requirements(id) {
  const a = attrs(id);
  return REQ.filter(([s]) => a[s]).map(([s, l]) => ({ id: a[s], level: a[l] || 1 }));
}

/** Every skill (with level) needed for a type, prerequisites included, deepest first. */
function allRequirements(id, acc = new Map()) {
  for (const r of requirements(id)) {
    allRequirements(r.id, acc);
    acc.set(r.id, Math.max(acc.get(r.id) || 0, r.level));
  }
  return acc;
}

function skillMeta(id) {
  const a = attrs(id);
  const ATTR = { 164: 'charisma', 165: 'intelligence', 166: 'memory', 167: 'perception', 168: 'willpower' };
  return { rank: a[275] || 1, primary: ATTR[a[180]] || 'intelligence', secondary: ATTR[a[181]] || 'memory' };
}

function search(q, { category = null, categories = null, published = true, limit = 40 } = {}) {
  const d = need();
  q = String(q).trim().toLowerCase();
  if (q.length < 2) return [];
  const out = [];
  for (const [id, t] of Object.entries(d.types)) {
    if (published && !t[6]) continue;
    if (!t[0].toLowerCase().includes(q)) continue;
    const cat = (d.groups[t[1]] || [])[1];
    if (category !== null && cat !== category) continue;
    if (categories && !categories.includes(cat)) continue;
    out.push({ id: Number(id), name: t[0], group: (d.groups[t[1]] || [''])[0], categoryId: cat, starts: t[0].toLowerCase().startsWith(q) });
  }
  out.sort((a, b) => (b.starts - a.starts) || a.name.length - b.name.length || a.name.localeCompare(b.name));
  return out.slice(0, limit);
}

function skillsByGroup() {
  const d = need();
  const groups = {};
  for (const [id, t] of Object.entries(d.types)) {
    const g = d.groups[t[1]];
    if (!g || g[1] !== 16 || !t[6]) continue;
    (groups[g[0]] = groups[g[0]] || []).push({ id: Number(id), name: t[0] });
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}

function blueprintFor(productId) { const p = need().products[productId]; return p ? { blueprintId: p[0], activity: p[1] } : null; }
function blueprint(id) { return need().blueprints[id] || null; }
function inventedFrom(t2BlueprintId) { return need().products['inv:' + t2BlueprintId] || []; }
function reprocess(id) { return need().materials[id] || null; }

function system(id) {
  const d = need();
  const s = d.systems[id];
  if (!s) return null;
  const reg = d.regions[s[1]] || ['', 0];
  const con = d.constellations[s[2]] || ['', 0];
  return { id: Number(id), name: s[0], regionId: s[1], region: reg[0], constellation: con[0], security: s[3], pos: [s[4], s[5], s[6]], whClass: s[7] || con[1] || reg[1] || 0, sun: d.suns[id] ? (d.types[d.suns[id]] || [''])[0] : null };
}
const systemIdByName = name => need().nameToSystem.get(String(name).trim().toLowerCase()) || null;
const gates = id => need().gates[id] || [];
const allSystems = () => need().systems;
/** Agent finder data, or null when the game data predates it. */
function agentData() { const d = need(); return d.agents && d.agents.length ? { agents: d.agents, stations: d.stations || {}, npcCorps: d.npcCorps || {}, factions: d.factions || {}, divisions: d.divisions || {}, agentTypes: d.agentTypes || {} } : null; }
/** Every type id whose summary passes fn(type). */
const typesWhere = fn => Object.keys(need().types).map(id => type(id)).filter(t => t && fn(t));
const ready = () => !!db;

/** Wormhole types from group 988 with destination class, lifetime and mass limits. */
function wormholeTypes() {
  const d = need();
  const CLS = { 1: 'C1', 2: 'C2', 3: 'C3', 4: 'C4', 5: 'C5', 6: 'C6', 7: 'HS', 8: 'LS', 9: 'NS', 12: 'Thera', 13: 'C13', 14: 'Drifter', 15: 'Drifter', 16: 'Drifter', 17: 'Drifter', 18: 'Drifter', 25: 'Pochven' };
  const out = [];
  for (const [id, t] of Object.entries(d.types)) {
    if (t[1] !== 988) continue;
    const a = d.dogma[id] || {};
    const code = t[0].replace(/^Wormhole\s+/i, '').trim();
    if (!/^[A-Z]\d{3}$|^K162$|^[A-Z]{2}\d{3}$/i.test(code)) continue;
    out.push({ id: Number(id), code: code.toUpperCase(), leadsTo: CLS[a[1381]] || (code === 'K162' ? 'Exit' : '?'),
      lifeHours: a[1382] ? Math.round(a[1382] / 60) : null, totalMass: a[1383] || null, jumpMass: a[1385] || null, regen: a[1384] || 0 });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

module.exports = {
  load, update, importZip, info, ready, check, setListener: fn => { onStatus = fn; },
  type, typeIdByName, attrs, fullAttrs, hasFull, usedIn, groupName, planetsIn, hasPlanets, requirements, allRequirements, skillMeta, search, skillsByGroup,
  blueprintFor, blueprint, inventedFrom, wormholeTypes, reprocess, system, systemIdByName, gates, allSystems, typesWhere, agentData,
  _buildFromZip: buildFromZip, _install: install
};
