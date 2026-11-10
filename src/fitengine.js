'use strict';
/* Fit stats: damage, tank, capacitor and navigation for a fit, using EVEShip.fit's dogma engine
   (@eveshipfit/dogma-engine, MIT licence, https://github.com/EVEShipFit/dogma-engine).
   The engine needs its own copy of CCP's game data (sde.dat from @eveshipfit/sde), which is
   downloaded from the npm registry the first time and checked against npm's sha512 before use. */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const sde = require('./sde');

const ENGINE_PKG = '@eveshipfit/dogma-engine';
const DATA_PKG = '@eveshipfit/sde';
const REGISTRY = 'https://registry.npmjs.org/';
const RECHECK_MS = 3 * 86400000;

let engine = null, loadedBuild = null, loading = null;
let dl = { phase: 'idle', pct: 0, error: null };
let listener = () => {};
const set = p => { dl = { ...dl, ...p }; try { listener(dl); } catch {} };

const dataDir = () => path.join(app.getPath('userData'), 'data');
const dataFile = () => path.join(dataDir(), 'fit-engine-sde.dat');
const metaFile = () => path.join(dataDir(), 'fit-engine-sde.json');
const readMeta = () => { try { return JSON.parse(fs.readFileSync(metaFile(), 'utf8')); } catch { return null; } };
const engineMajor = () => { try { return Number(require(`${ENGINE_PKG}/package.json`).version.split('.')[0]); } catch { return null; } };

/** Newest data package that matches the engine's major version. */
async function latestData() {
  const r = await fetch(REGISTRY + DATA_PKG.replace('/', '%2f'), { headers: { Accept: 'application/vnd.npm.install-v1+json', 'User-Agent': 'EVE-Toolkit-Desktop' } });
  if (!r.ok) throw new Error(`Couldn't reach the npm registry (${r.status}).`);
  const j = await r.json();
  const major = engineMajor();
  const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  const v = Object.keys(j.versions || {}).filter(x => /^\d+\.\d+\.\d+$/.test(x) && Number(x.split('.')[0]) === major).sort(cmp).pop();
  if (!v) throw new Error('No fit data for this version of the engine.');
  const dist = j.versions[v].dist || {};
  if (!/^https:\/\/registry\.npmjs\.org\//.test(dist.tarball || '') || !/^sha512-/.test(dist.integrity || '')) throw new Error('The fit data listing looks wrong.');
  return { version: v, tarball: dist.tarball, integrity: dist.integrity };
}

/** Pull one file out of a .tar buffer. */
function untarOne(tar, want) {
  let off = 0;
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every(b => b === 0)) break;
    const str = (a, b) => h.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    const name = (str(345, 500) ? str(345, 500) + '/' : '') + str(0, 100);
    const size = parseInt(str(124, 136).trim() || '0', 8);
    off += 512;
    if (name === want) return tar.subarray(off, off + size);
    off += Math.ceil(size / 512) * 512;
  }
  return null;
}

async function download(info) {
  set({ phase: 'downloading', pct: 0, error: null });
  const r = await fetch(info.tarball, { headers: { 'User-Agent': 'EVE-Toolkit-Desktop' } });
  if (!r.ok || !r.body) throw new Error(`Download failed (${r.status}).`);
  const total = Number(r.headers.get('content-length')) || 0;
  const parts = []; let got = 0;
  for await (const c of r.body) { parts.push(c); got += c.length; if (total) set({ pct: Math.min(99, Math.floor(got / total * 100)) }); }
  const tgz = Buffer.concat(parts.map(p => Buffer.from(p)));
  const [algo, b64] = info.integrity.split(/-(.+)/);
  if (crypto.createHash(algo).update(tgz).digest('base64') !== b64) throw new Error('The fit data didn’t match its checksum, so it wasn’t used.');
  const dat = untarOne(zlib.gunzipSync(tgz), 'package/dist/sde.dat');
  if (!dat || dat.length < 1e6) throw new Error('The fit data download had no game data in it.');
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(dataFile() + '.tmp', dat);
  fs.renameSync(dataFile() + '.tmp', dataFile());
  fs.writeFileSync(metaFile(), JSON.stringify({ version: info.version, at: Date.now(), checkedAt: Date.now() }));
  set({ phase: 'idle', pct: 100 });
}

/** Make sure the data is on disk (download if missing), and look for newer data every few days. */
async function ensureData({ force = false } = {}) {
  const meta = readMeta(), have = meta && fs.existsSync(dataFile());
  if (have && !force && Date.now() - (meta.checkedAt || 0) < RECHECK_MS) return meta;
  if (dl.phase === 'downloading') throw new Error('The fit data is already downloading.');
  try {
    const info = await latestData();
    if (!have || info.version !== meta.version || force) await download(info);
    else fs.writeFileSync(metaFile(), JSON.stringify({ ...meta, checkedAt: Date.now() }));
  } catch (e) {
    set({ phase: have ? 'idle' : 'error', error: e.message });
    if (!have) throw e;
  }
  return readMeta();
}

async function load() {
  if (engine) return engine;
  if (loading) return loading;
  loading = (async () => {
    await ensureData();
    const mod = await import(ENGINE_PKG);
    const wasm = fs.readFileSync(require.resolve(`${ENGINE_PKG}/esf_dogma_engine_bg.wasm`));
    mod.initSync({ module: wasm });
    loadedBuild = mod.load_sde(new Uint8Array(fs.readFileSync(dataFile())));
    engine = mod;
    return mod;
  })();
  try { return await loading; } finally { loading = null; }
}

function allSkillsV() {
  const out = {};
  for (const list of Object.values(sde.skillsByGroup())) for (const s of list) out[s.id] = 5;
  return out;
}

const SLOT = { high: 'high', med: 'medium', low: 'low', rig: 'rig', sub: 'subsystem' };
/** Our parsed fit (fitcheck.parse) into the engine's Fit. */
function toFit(fit) {
  const items = [];
  for (const [k, kind] of Object.entries(SLOT)) {
    let i = 0;
    for (const m of fit.slots[k] || []) {
      if (!m.empty) items.push({ type_id: m.id, slot: { type: kind, index: i }, state: m.offline ? 'offline' : 'active', quantity: 1, ...(m.chargeId ? { charge: { type_id: m.chargeId } } : {}) });
      i++;
    }
  }
  for (const d of fit.drones || []) items.push({ type_id: d.id, slot: { type: 'drone_bay' }, state: 'active', quantity: d.qty || 1 });
  return { name: fit.name, ship: { type_id: fit.shipTypeId }, items };
}

const RES = { shield: [271, 274, 273, 272], armor: [267, 270, 269, 268], hull: [113, 110, 109, 111] };
const PROP_GROUPS = /^Propulsion Module$/i;

function summarise(calc, fitObj) {
  const s = calc.ship.attributes;
  const A = id => { const v = s.get(id); return v ? v.value : null; };
  let volley = 0;
  calc.items.forEach((it, i) => {
    if (it.state !== 'active' && it.state !== 'overload') return;
    const v = it.attributes.get(-21) || (it.charge && it.charge.attributes.get(-21));
    if (v) volley += v.value * (fitObj.items[i].quantity || 1);
  });
  const dps = A(-12) || 0, drone = A(-14) || 0;
  const stableAt = A(-72), lasts = A(-7);
  return {
    dps, dpsReload: A(-13) || 0, droneDps: drone, weaponDps: Math.max(0, dps - drone), volley,
    ehp: A(-43) || 0, layers: { shield: A(-30) || 0, armor: A(-28) || 0, hull: A(-29) || 0 },
    hp: { shield: A(263) || 0, armor: A(265) || 0, hull: A(9) || 0 },
    resists: Object.fromEntries(Object.entries(RES).map(([k, ids]) => [k, ids.map(id => (A(id) === null ? null : 1 - A(id)))])),
    rep: { shield: A(-50) || 0, armor: A(-48) || 0, hull: A(-49) || 0, passive: A(-52) || 0 },
    cap: { amount: A(482) || 0, recharge: (A(55) || 0) / 1000, stable: stableAt !== null && stableAt > 0, stableAt: stableAt || 0, lastsSeconds: lasts !== null && lasts >= 0 ? lasts : null, delta: A(-5) },
    speed: A(37) || 0, align: A(-1), sig: A(552) || 0, lockRange: A(76) || 0, scanRes: A(564) || 0, maxTargets: A(-70),
    cpu: { used: A(49) || 0, out: A(48) || 0 }, pg: { used: A(15) || 0, out: A(11) || 0 },
    violations: (calc.violations || []).map(v => v.rule)
  };
}

/** Stats for a parsed fit with a skill map ({skillId: level}); null skills = all V. */
async function stats(fit, skills) {
  const e = await load();
  const base = toFit(fit);
  const settled = e.post_load({ ...base, character: { skills: skills || allSkillsV() } });
  const calc = e.calculate(settled, { validate: true });
  const out = summarise(calc, settled);
  // Speed and capacitor with the prop module off as well, since most people only run it some of the time
  const props = settled.items.map((it, i) => ({ it, i })).filter(({ it }) => /medium/.test(it.slot.type) && it.state === 'active' && PROP_GROUPS.test((sde.type(it.type_id) || {}).group || ''));
  if (props.length) {
    const off = JSON.parse(JSON.stringify(settled)); for (const { i } of props) off.items[i].state = 'online';
    const c2 = summarise(e.calculate(off), off);
    out.propOff = { speed: c2.speed, cap: c2.cap, sig: c2.sig };
  }
  out.states = settled.items.map(it => it.state);
  return out;
}

/** EFT text from an in-game saved fitting (as ESI returns it). */
async function eftFromEsi(fitting) {
  const e = await load();
  const f = e.load_esi_fitting({ name: String(fitting.name || 'Fit').slice(0, 50), description: String(fitting.description || ''), ship_type_id: Number(fitting.ship_type_id), items: (fitting.items || []).map(i => ({ flag: String(i.flag), quantity: Number(i.quantity) || 1, type_id: Number(i.type_id) })) });
  return e.save_eft({ ...f, name: fitting.name || f.name });
}

/** EFT text for the ship that died in a killmail. */
async function eftFromKillmail(killId) {
  const { zk } = require('./zkill');
  const { get } = require('./esi');
  const z = await zk(`/killID/${Number(killId)}/`, 3600000);
  const hash = Array.isArray(z) && z[0] && z[0].zkb && z[0].zkb.hash;
  if (!hash) throw new Error('zKillboard doesn’t have that killmail.');
  const km = await get(`/killmails/${Number(killId)}/${hash}/`);
  const e = await load();
  const f = e.load_killmail(km);
  const ship = (sde.ready() && sde.type(km.victim.ship_type_id) || {}).name || 'Ship';
  return e.save_eft({ ...f, name: `${ship} lost ${String(km.killmail_time || '').slice(0, 10)}` });
}

/** The engine's ESI fitting for a parsed fit, ready to save in game. */
async function toEsiFitting(fit, name, description) {
  const e = await load();
  const f = { ...toFit(fit), name: String(name || fit.name || 'Fit').slice(0, 50) };
  const out = e.save_esi_fitting(f);
  return { name: f.name, description: String(description || '').slice(0, 500), ship_type_id: out.ship_type_id, items: out.items };
}

const status = () => ({ ...dl, meta: readMeta(), build: loadedBuild, ready: !!engine });

module.exports = { stats, eftFromEsi, eftFromKillmail, toEsiFitting, load, ensureData, status, toFit, setListener: fn => { listener = fn; }, _untarOne: untarOne };
