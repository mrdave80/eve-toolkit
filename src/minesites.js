'use strict';
/* Ice belts and ore sites. CCP doesn't publish anomalies anywhere outside the game, so sightings come
   from your own probe scanner (pasted, or copied while the clipboard watch is on) and from intel channel
   messages that mention ice or an ore site with a system. New ones within your range raise an alert. */
const store = require('./store');
const sde = require('./sde');
const { get, safe, ok } = require('./esi');

const ICE = /\b(ice|icicle|glacial|glaze|glitter|gelidus|krystallos|glare crust)\b/i;
const ORE = /\b(deposit|ore site|asteroid (belt|cluster|field)|ore anom|mining site|ore belt|ore field|ore prospect|moon ?chunk|veldspar|scordite|kernite|arkonor|bistot|mercoxit|spodumain|crokite)\b/i;
const SITE_NAME = /((?:enriched |pristine |thick |smooth |shattered )?(?:clear icicle|white glaze|blue ice|glacial mass|dark glitter|gelidus|krystallos|glare crust)(?: belt| field)?|shattered ice field|[a-z]+ (?:frontier|perimeter|core|border|corridor|fringe|periphery|ring|cluster) deposit|[a-z]+ (?:asteroid )?(?:belt|cluster))/i;

const DEFAULTS = { alert: true, maxJumps: 5, ice: true, ore: false, keepHours: 48 };
function data() { const d = store.get(); d.mineSites = d.mineSites || { cfg: { ...DEFAULTS }, systems: {} }; d.mineSites.cfg = { ...DEFAULTS, ...d.mineSites.cfg }; return d.mineSites; }
const kindOf = text => (ICE.test(text) ? 'ice' : ORE.test(text) ? 'ore' : null);

/** Probe scanner rows that are mining anomalies: ID \t Group \t Type \t Name \t % \t Distance */
function parseScan(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const c = line.split('\t').map(x => x.trim());
    if (!/^[A-Z]{3}-\d{3}$/.test(c[0] || '')) continue;
    const type = c[2] || '', name = c[3] || '';
    const k = /ice/i.test(type) || ICE.test(name) ? 'ice' : /ore|mining/i.test(type) || /deposit|asteroid|belt|cluster/i.test(name) ? 'ore' : null;
    if (k && name) out.push({ sig: c[0], name, kind: k });
  }
  return out;
}
const isScan = text => String(text || '').split(/\r?\n/).filter(l => /^[A-Z]{3}-\d{3}\t/.test(l.trim())).length >= 1;

let notifier = () => {};
let positions = () => [];
let jumps = () => null;

function nearestPilot(systemId, max) {
  let best = null;
  for (const p of positions()) { const j = jumps(p.systemId, systemId, max); if (j !== null && (!best || j < best.jumps)) best = { pilot: p.pilot, jumps: j, from: p.system }; }
  return best;
}

function record(systemId, sites, o = {}) {
  const D = data(), now = new Date().toISOString();
  const sys = D.systems[systemId] = D.systems[systemId] || { sites: [], ever: { ice: 0, ore: 0 } };
  const fresh = [];
  for (const s of sites) {
    const key = s.sig || s.name.toLowerCase();
    const ex = sys.sites.find(x => (x.sig && s.sig ? x.sig === s.sig : x.name.toLowerCase() === s.name.toLowerCase()) && !x.gone);
    if (ex) { ex.lastSeen = now; if (s.sig) ex.sig = s.sig; continue; }
    const site = { key, sig: s.sig || null, name: s.name, kind: s.kind, firstSeen: now, lastSeen: now, source: o.source || 'scan', by: o.by || null, gone: false };
    sys.sites.push(site); sys.ever[s.kind] = (sys.ever[s.kind] || 0) + 1; fresh.push(site);
  }
  // A full scan of the system shows what's no longer there
  if (o.fullScan) for (const x of sys.sites) if (!x.gone && x.source === 'scan' && !sites.some(s => (s.sig && s.sig === x.sig) || s.name.toLowerCase() === x.name.toLowerCase())) { x.gone = true; x.goneAt = now; }
  sys.at = now;
  prune();
  store.save('mineSites');
  const c = D.cfg;
  for (const f of fresh) {
    if (!c.alert || !c[f.kind]) continue;
    const near = nearestPilot(Number(systemId), c.maxJumps);
    if (!near && positions().length) continue;
    const name = (sde.ready() && sde.system(Number(systemId)) || {}).name || systemId;
    notifier(f.kind === 'ice' ? `Ice: ${f.name}` : `Ore site: ${f.name}`, `${name}${near ? ` · ${near.jumps} jump${near.jumps === 1 ? '' : 's'} from ${near.pilot}` : ''}${f.by ? ` · seen by ${f.by}` : ''}`, { systemId: Number(systemId), site: f });
  }
  return { added: fresh.length, gone: o.fullScan ? sys.sites.filter(x => x.gone && x.goneAt === now).length : 0 };
}

function prune() {
  const D = data(), cut = Date.now() - D.cfg.keepHours * 3600000;
  for (const [id, s] of Object.entries(D.systems)) {
    s.sites = s.sites.filter(x => Date.parse(x.gone ? x.goneAt : x.lastSeen) > cut);
    if (!s.sites.length && !(s.ever.ice || s.ever.ore)) delete D.systems[id];
  }
}

/** Which system a paste came from: the pilot asked for, else the one pilot who's online. */
async function systemFor(charId) {
  const chars = store.get().characters.filter(c => !c.needsReauth);
  const pick = charId ? chars.filter(c => c.id === Number(charId)) : chars;
  const online = [];
  for (const c of pick) {
    if (!charId) { const o = await safe(() => get(`/characters/${c.id}/online/`, c.id)); if (!ok(o) || !o.online) continue; }
    const l = await safe(() => get(`/characters/${c.id}/location/`, c.id));
    if (ok(l)) online.push({ id: c.id, name: c.name, systemId: l.solar_system_id });
  }
  return online;
}

async function paste(text, o = {}) {
  const sites = parseScan(text);
  if (!isScan(text)) throw new Error('Paste your probe scanner: in game, select all results (Ctrl+A) and copy (Ctrl+C).');
  let systemId = o.systemId ? Number(o.systemId) : null, by = null;
  if (!systemId && o.system && sde.ready()) systemId = sde.systemIdByName(String(o.system));
  if (!systemId) {
    const on = await systemFor(o.charId);
    if (on.length !== 1) return { needSystem: true, pilots: on.map(p => ({ id: p.id, name: p.name, system: (sde.ready() && sde.system(p.systemId) || {}).name })), sites: sites.length };
    systemId = on[0].systemId; by = on[0].name;
  }
  const r = record(systemId, sites, { source: 'scan', by, fullScan: true });
  return { ...r, systemId, system: (sde.ready() && sde.system(systemId) || {}).name, sites: sites.length };
}

/** Intel channel message: "ice in Amamake", "Clear Icicle Belt up in Ohkunen" */
function fromChat(text, systems, who) {
  const k = kindOf(text);
  if (!k || !systems || !systems.length || /\b(gone|done|mined out|empty|despawn)/i.test(text)) return null;
  const m = SITE_NAME.exec(text);
  const name = m ? m[1].replace(/\b\w/g, x => x.toUpperCase()) : (k === 'ice' ? 'Ice belt' : 'Ore site');
  return record(systems[0].id, [{ name, kind: k }], { source: 'chat', by: who });
}

/** Sightings with jumps from a pilot or system, newest first. */
function list(o = {}) {
  const D = data(); prune();
  const from = o.fromSystemId ? Number(o.fromSystemId) : null;
  const max = Number(o.maxJumps) || 15;
  const out = [];
  for (const [id, s] of Object.entries(D.systems)) {
    const sysId = Number(id), sy = sde.ready() ? sde.system(sysId) : null;
    const j = from ? jumps(from, sysId, max) : null;
    const near = from ? null : nearestPilot(sysId, max);
    for (const x of s.sites) out.push({ ...x, systemId: sysId, system: sy ? sy.name : String(id), security: sy ? sy.security : null, region: sy ? sy.region : '', jumps: from ? j : near ? near.jumps : null, nearPilot: near ? near.pilot : null });
  }
  const known = Object.entries(D.systems).filter(([, s]) => s.ever.ice).map(([id, s]) => { const sy = sde.ready() ? sde.system(Number(id)) : null; return { systemId: Number(id), system: sy ? sy.name : id, security: sy ? sy.security : null, region: sy ? sy.region : '', times: s.ever.ice, jumps: from ? jumps(from, Number(id), max) : null }; });
  return { cfg: D.cfg, sites: out.sort((a, b) => (a.gone - b.gone) || b.lastSeen.localeCompare(a.lastSeen)), knownIce: known.sort((a, b) => (a.jumps ?? 99) - (b.jumps ?? 99)) };
}

function setCfg(p = {}) {
  const c = data().cfg;
  for (const k of ['alert', 'ice', 'ore']) if (typeof p[k] === 'boolean') c[k] = p[k];
  if (p.maxJumps !== undefined) c.maxJumps = Math.max(0, Math.min(30, Number(p.maxJumps) || 0));
  if (p.keepHours !== undefined) c.keepHours = Math.max(4, Math.min(168, Number(p.keepHours) || 48));
  store.save('mineSites');
  return c;
}
function remove(systemId, key) {
  const D = data(); const s = D.systems[systemId]; if (!s) return true;
  s.sites = key ? s.sites.filter(x => x.key !== key) : [];
  store.save('mineSites'); return true;
}

module.exports = { parseScan, isScan, paste, record, fromChat, list, setCfg, remove, kindOf,
  setNotifier: fn => { notifier = fn; }, setPositions: (fn, jfn) => { positions = fn; jumps = jfn; } };
