// Intel: watches EVE chat logs for reports near your pilots, tails combat logs
// for a DPS meter, and analyses pasted Local and D-scan.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const sde = require('./sde');
const store = require('./store');
const { get, rawRequest, safe, ok, resolveNames } = require('./esi');

const DEFAULTS = { enabled: false, channels: [], jumps: 5, sound: true, notify: true, folder: '', combat: false,
  grade: true, attackAlert: 'players', clipboard: false, localThreat: 'High', spike: false, spikeJumps: 2, spikeHs: 3, spikeLow: 5 };
const LEVEL_RANK = { Minimal: 0, Low: 1, Moderate: 2, High: 3, Extreme: 4 };
let pilotintel = null; // loaded lazily to avoid a require cycle
const pi = () => pilotintel || (pilotintel = require('./pilotintel'));
const cfg = () => ({ ...DEFAULTS, ...(store.get().settings.intel || {}) });
// On Linux, EVE runs through Steam's Proton, which keeps its own Documents folder.
const PROTON_DOCS = () => path.join(app.getPath('home'), '.local', 'share', 'Steam', 'steamapps', 'compatdata', '8500', 'pfx', 'drive_c', 'users', 'steamuser', 'Documents');
const logsRoot = () => {
  if (cfg().folder) return cfg().folder;
  const normal = path.join(app.getPath('documents'), 'EVE', 'logs');
  if (process.platform === 'linux' && !fs.existsSync(normal) && fs.existsSync(path.join(PROTON_DOCS(), 'EVE', 'logs'))) return path.join(PROTON_DOCS(), 'EVE', 'logs');
  return normal;
};

let listener = () => {};
const offsets = new Map();          // file -> byte offset
const fileMeta = new Map();         // file -> { channel, listener }
const pilotSystems = new Map();     // listener name -> systemId (from Local logs)
const reports = [];
let timer = null, esiTimer = null;

// ---------- Parsing ----------

function decode(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) buf = buf.subarray(2);
  const even = buf.length - (buf.length % 2);
  return buf.subarray(0, even).toString('utf16le');
}

function parseHeader(text) {
  const ch = /Channel Name:\s*(.+)/.exec(text), li = /Listener:\s*(.+)/.exec(text);
  return { channel: ch ? ch[1].trim() : null, listener: li ? li[1].trim() : null };
}

const LINE = /^﻿?\[\s*(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s*\]\s*(.+?)\s>\s(.*)$/;
function parseChatLine(line) {
  const m = LINE.exec(line.trim());
  if (!m) return null;
  return { time: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toISOString(), who: m[7].trim(), text: m[8].trim() };
}

function findSystems(text) {
  if (!sde.ready()) return [];
  const words = text.replace(/<[^>]+>/g, ' ').split(/[\s,;:!?()\[\]*]+/).filter(Boolean);
  const found = new Map();
  for (let i = 0; i < words.length; i++) {
    for (let n = 3; n >= 1; n--) {
      if (i + n > words.length) continue;
      const cand = words.slice(i, i + n).join(' ').replace(/[.'"]+$/, '');
      if (cand.length < 3) continue;
      const id = sde.systemIdByName(cand);
      if (id) { found.set(id, sde.system(id).name); i += n - 1; break; }
    }
  }
  return [...found.entries()].map(([id, name]) => ({ id, name }));
}

const isClear = t => /\b(clr|clear|cleared)\b/i.test(t);
const isQuestion = t => /\bstatus\b|\?\s*$/i.test(t);

// ---------- Distances ----------

function jumpsBetween(from, to, max) {
  if (from === to) return 0;
  const seen = new Set([from]);
  let frontier = [from];
  for (let d = 1; d <= max; d++) {
    const next = [];
    for (const u of frontier) for (const v of sde.gates(u)) {
      if (v === to) return d;
      if (!seen.has(v)) { seen.add(v); next.push(v); }
    }
    frontier = next;
  }
  return null;
}

function nearest(systemId, max) {
  let best = null;
  for (const [pilot, sys] of pilotSystems) {
    const j = jumpsBetween(sys, systemId, max);
    if (j !== null && (!best || j < best.jumps)) best = { pilot, jumps: j, from: sde.system(sys).name };
  }
  return best;
}

// ---------- Watching ----------

function tickFiles() {
  const c = cfg();
  const chatDir = path.join(logsRoot(), 'Chatlogs');
  let files = [];
  try { files = fs.readdirSync(chatDir).filter(f => f.endsWith('.txt')); } catch { listener('intel:status', { ok: false, message: `Chat logs not found at ${chatDir}. Check EVE's log folder in Intel settings.` }); return; }
  const today = Date.now() - 24 * 3600000;
  const wanted = new Set(c.channels.map(x => x.toLowerCase()));
  for (const f of files) {
    const full = path.join(chatDir, f);
    let st; try { st = fs.statSync(full); } catch { continue; }
    if (st.mtimeMs < today) continue;
    const chanGuess = f.replace(/_\d{8}_\d{6}(_\d+)?\.txt$/, '');
    if (chanGuess.toLowerCase() !== 'local' && !wanted.has(chanGuess.toLowerCase())) continue;
    let off = offsets.get(full);
    if (off === undefined) {
      // First sight: read header and skip existing history (but keep the last Local system change)
      const buf = fs.readFileSync(full);
      const text = decode(buf);
      fileMeta.set(full, parseHeader(text.slice(0, 2000)));
      if (chanGuess.toLowerCase() === 'local') scanLocal(full, text);
      offsets.set(full, buf.length);
      continue;
    }
    if (st.size <= off) continue;
    const fd = fs.openSync(full, 'r');
    const len = st.size - off;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, off);
    fs.closeSync(fd);
    offsets.set(full, off + len - (len % 2));
    const text = decode(buf);
    const meta = fileMeta.get(full) || {};
    if (chanGuess.toLowerCase() === 'local') { scanLocal(full, text); localSpeakers(meta, text, c); continue; }
    for (const line of text.split(/\r?\n/)) {
      const msg = parseChatLine(line);
      if (!msg || msg.who === 'EVE System') continue;
      handleReport(meta.channel || chanGuess, msg, c).catch(() => {});
    }
  }
}

function scanLocal(file, text) {
  const meta = fileMeta.get(file) || {};
  const re = /Channel changed to Local\s*:\s*(.+)/g;
  let m, last = null;
  while ((m = re.exec(text))) last = m[1].replace(/\*$/, '').trim();
  if (last && meta.listener) {
    const id = sde.ready() ? sde.systemIdByName(last) : null;
    if (id) { pilotSystems.set(meta.listener, id); listener('intel:pilots', positions()); }
  }
}

async function handleReport(channel, msg, c) {
  const systems = findSystems(msg.text).map(s => ({ ...s, near: nearest(s.id, c.jumps) }));
  const clear = isClear(msg.text);
  const close = systems.filter(s => s.near && s.near.jumps <= c.jumps);
  const r = { at: msg.time, channel, who: msg.who, text: msg.text, systems, clear, question: isQuestion(msg.text), alert: !clear && !isQuestion(msg.text) && close.length > 0, closest: close.sort((a, b) => a.near.jumps - b.near.jumps)[0] || null, pilots: [] };
  // Grade pilots named in the report (only for reports near you, to stay polite to zKillboard)
  if (c.grade && r.alert) {
    try {
      const work = (async () => {
        const found = await pi().namesInText(msg.text, systems.map(x => x.name));
        for (const f of found.slice(0, 5)) r.pilots.push(await pi().quick(f.id, f.name));
      })();
      await Promise.race([work, new Promise(res => setTimeout(res, 6000))]);
    } catch { /* grading is a bonus */ }
    r.pilots.sort((a, b) => b.score - a.score);
    const zone = r.closest ? zoneOfSystem(r.closest.id) : null;
    r.top = r.pilots[0] ? { ...r.pilots[0], zoneScore: zone && r.pilots[0].zones ? r.pilots[0].zones[zone] : null } : null;
  }
  reports.unshift(r);
  reports.length = Math.min(reports.length, 300);
  listener('intel:report', r);
}

function zoneOfSystem(id) {
  if (!sde.ready()) return null;
  const s = sde.system(id); if (!s) return null;
  if (s.region === 'Pochven') return 'pochven';
  const c = Number(s.whClass) || 0;
  if ((c >= 1 && c <= 6) || (c >= 12 && c <= 18)) return 'wh';
  const sec = Math.round(s.security * 10) / 10;
  return sec >= 0.5 ? 'hs' : sec > 0 ? 'ls' : 'ns';
}

// ---------- Local speakers ----------
const localSeen = new Map(); // name -> last check time
async function localSpeakers(meta, text, c) {
  if (!c.localThreat || c.localThreat === 'off') return;
  const mine = new Set(store.get().characters.map(x => x.name.toLowerCase()));
  for (const line of text.split(/\r?\n/)) {
    const msg = parseChatLine(line);
    if (!msg || msg.who === 'EVE System' || mine.has(msg.who.toLowerCase())) continue;
    if (Date.now() - (localSeen.get(msg.who) || 0) < 3600000) continue;
    localSeen.set(msg.who, Date.now());
    try {
      const found = await pi().namesInText(msg.who);
      const hit = found.find(f => f.name.toLowerCase() === msg.who.toLowerCase());
      if (!hit) continue;
      const g = await pi().quick(hit.id, hit.name);
      const sysId = meta.listener ? pilotSystems.get(meta.listener) : null;
      const zone = sysId ? zoneOfSystem(sysId) : null;
      const z = zone && g.zones ? g.zones[zone] : null;
      const lvl = z ? z.level : g.level;
      const watched = g.watch && ['hostile', 'ganker'].includes(g.watch.tag);
      const event = { at: msg.time, pilot: g, listener: meta.listener, system: sysId && sde.ready() && sde.system(sysId) ? sde.system(sysId).name : null, zone, level: lvl, text: msg.text,
        alert: watched || LEVEL_RANK[lvl] >= LEVEL_RANK[c.localThreat] };
      localEvents.unshift(event); localEvents.length = Math.min(localEvents.length, 100);
      listener('intel:local', event);
    } catch { /* skip */ }
  }
}
const localEvents = [];

// ---------- Kill spikes near your pilots (ESI hourly system kills) ----------
const spikeSeen = new Map();
let spikes = [];
async function checkSpikes() {
  const c = cfg();
  if (!c.spike || !sde.ready()) return;
  const r = await safe(() => get('/universe/system_kills/'));
  if (!ok(r)) return;
  const found = [];
  const pos = positions();
  for (const s of r) {
    const zone = zoneOfSystem(s.system_id);
    const min = zone === 'hs' ? c.spikeHs : c.spikeLow;
    if (!zone || (s.ship_kills || 0) < min) continue;
    let best = null;
    for (const p of pos) {
      const j = jumpsBetween(p.systemId, s.system_id, c.spikeJumps);
      if (j !== null && j <= c.spikeJumps && (!best || j < best.jumps)) best = { pilot: p.pilot, jumps: j, from: p.system };
    }
    if (!best) continue;
    const sy = sde.system(s.system_id);
    found.push({ systemId: s.system_id, system: sy.name, security: sy.security, zone, shipKills: s.ship_kills, podKills: s.pod_kills || 0, npcKills: s.npc_kills || 0, near: best });
  }
  spikes = found.sort((a, b) => a.near.jumps - b.near.jumps || b.shipKills - a.shipKills);
  for (const f of spikes) {
    const key = f.systemId;
    if (Date.now() - (spikeSeen.get(key) || 0) < 3600000) continue;
    spikeSeen.set(key, Date.now());
    listener('intel:spike', f);
  }
  listener('intel:spikes', spikes);
}
let spikeTimer = null;

function positions() { return [...pilotSystems.entries()].map(([pilot, id]) => ({ pilot, systemId: id, system: sde.ready() && sde.system(id) ? sde.system(id).name : id })); }

async function esiPositions() {
  // Fill in pilots whose Local logs we haven't seen
  for (const ch of store.get().characters.filter(x => !x.needsReauth)) {
    if (pilotSystems.has(ch.name)) continue;
    const r = await safe(() => get(`/characters/${ch.id}/location/`, ch.id));
    if (ok(r)) pilotSystems.set(ch.name, r.solar_system_id);
  }
  listener('intel:pilots', positions());
}

function start() {
  stop();
  timer = setInterval(() => { try { tickFiles(); } catch (e) { listener('intel:status', { ok: false, message: e.message }); } tickCombat(); }, 1500);
  esiPositions().catch(() => {});
  esiTimer = setInterval(() => esiPositions().catch(() => {}), 120000);
  clearInterval(spikeTimer);
  if (cfg().spike) { setTimeout(() => checkSpikes().catch(() => {}), 8000); spikeTimer = setInterval(() => checkSpikes().catch(() => {}), 5 * 60000); }
  listener('intel:status', { ok: true, message: 'Watching' });
}
function stop() { clearInterval(timer); clearInterval(esiTimer); clearInterval(spikeTimer); timer = null; }
function restartIfEnabled() { const c = cfg(); if (c.enabled || c.combat || c.spike) start(); else stop(); }

function channelsSeen() {
  const dir = path.join(logsRoot(), 'Chatlogs');
  try {
    const recent = Date.now() - 14 * 86400000;
    const names = new Set();
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.txt')) continue;
      try { if (fs.statSync(path.join(dir, f)).mtimeMs < recent) continue; } catch { continue; }
      names.add(f.replace(/_\d{8}_\d{6}(_\d+)?\.txt$/, ''));
    }
    return [...names].sort();
  } catch { return []; }
}

// ---------- Combat log ----------

const combat = new Map();   // listener -> { events: [], totals }
const combatOffsets = new Map();
const lastAttack = new Map();
const CL = /^\[\s*(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s*\]\s*\(combat\)\s*(.+)$/;

function parseCombatLine(line) {
  const m = CL.exec(line.trim());
  if (!m) return null;
  const at = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const body = m[7].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const d = /^(\d+)\s+(to|from)\s+(.+?)\s+-\s+(.+?)(?:\s+-\s+(.+))?$/.exec(body);
  if (d) return { at, kind: d[2] === 'to' ? 'out' : 'in', amount: Number(d[1]), other: d[3], weapon: d[4], quality: d[5] || '' };
  const rep = /^(\d+)\s+remote\s+(armor|shield|hull|capacitor)\s+\w*\s*(?:repaired|boosted|transferred)?\s*(to|by)\s+(.+?)(?:\s+-\s+(.+))?$/i.exec(body);
  if (rep) return { at, kind: rep[3].toLowerCase() === 'to' ? 'repOut' : 'repIn', amount: Number(rep[1]), other: rep[4], weapon: rep[5] || rep[2] };
  if (/misses you completely|misses/i.test(body)) return { at, kind: 'miss', amount: 0, other: body.split(' ')[0] };
  return null;
}

function tickCombat() {
  if (!cfg().combat) return;
  const dir = path.join(logsRoot(), 'Gamelogs');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.txt')); } catch { return; }
  const recent = Date.now() - 6 * 3600000;
  for (const f of files) {
    const full = path.join(dir, f);
    let st; try { st = fs.statSync(full); } catch { continue; }
    if (st.mtimeMs < recent) continue;
    let off = combatOffsets.get(full);
    if (off === undefined) {
      const head = fs.readFileSync(full).subarray(0, 1200).toString('utf8');
      const li = /Listener:\s*(.+)/.exec(head);
      combatOffsets.set(full, st.size);
      fileMeta.set(full, { listener: li ? li[1].trim() : f });
      continue;
    }
    if (st.size <= off) continue;
    const fd = fs.openSync(full, 'r'); const buf = Buffer.alloc(st.size - off); fs.readSync(fd, buf, 0, buf.length, off); fs.closeSync(fd);
    combatOffsets.set(full, st.size);
    const who = (fileMeta.get(full) || {}).listener || f;
    const c = combat.get(who) || { events: [], totals: { out: 0, in: 0, repOut: 0, repIn: 0 }, targets: {}, weapons: {}, started: Date.now() };
    let hit = null;
    for (const line of buf.toString('utf8').split(/\r?\n/)) {
      const e = parseCombatLine(line);
      if (!e) continue;
      if (e.kind === 'in' && e.amount > 0) { const player = /\[[^\]]+\]\s*\(/.test(e.other) || /\[[^\]]+\]$/.test(e.other); if (!hit || (player && !hit.player)) hit = { ...e, player }; }
      e.at = Date.now();   // use arrival time for live DPS
      c.events.push(e);
      if (c.totals[e.kind] !== undefined) c.totals[e.kind] += e.amount;
      if (e.kind === 'out') { c.targets[e.other] = (c.targets[e.other] || 0) + e.amount; c.weapons[e.weapon] = (c.weapons[e.weapon] || 0) + e.amount; }
    }
    c.events = c.events.filter(e => Date.now() - e.at < 120000);
    combat.set(who, c);
    const mode = cfg().attackAlert;
    if (hit && mode !== 'off' && (mode === 'all' || hit.player) && Date.now() - (lastAttack.get(who) || 0) > 90000) {
      lastAttack.set(who, Date.now());
      listener('combat:attack', { who, attacker: hit.other.replace(/\s*\(.*\)\s*$/, ''), ship: (/\(([^)]+)\)/.exec(hit.other) || [])[1] || '', weapon: hit.weapon, amount: hit.amount, player: hit.player });
    }
  }
  const now = Date.now();
  const snap = [...combat.entries()].map(([who, c]) => {
    const win = ms => c.events.filter(e => now - e.at < ms);
    const sum = (list, k) => list.filter(e => e.kind === k).reduce((n, e) => n + e.amount, 0);
    const w10 = win(10000), w60 = win(60000);
    return { who, dpsOut: sum(w10, 'out') / 10, dpsIn: sum(w10, 'in') / 10, dpsOut60: sum(w60, 'out') / 60, dpsIn60: sum(w60, 'in') / 60, repOut: sum(w10, 'repOut') / 10, repIn: sum(w10, 'repIn') / 10,
      totals: c.totals, topTargets: Object.entries(c.targets).sort((a, b) => b[1] - a[1]).slice(0, 5), topWeapons: Object.entries(c.weapons).sort((a, b) => b[1] - a[1]).slice(0, 5),
      last: c.events.slice(-12).reverse().map(e => ({ kind: e.kind, amount: e.amount, other: e.other, weapon: e.weapon, quality: e.quality })) };
  });
  listener('combat:update', snap);
}
function resetCombat() { combat.clear(); return true; }

// ---------- Local & D-scan ----------

async function analyseLocal(text) {
  const names = [...new Set(String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean))].slice(0, 1000);
  if (!names.length) throw new Error('Paste the Local member list (select all names in Local, Ctrl+C).');
  const ids = [];
  for (let i = 0; i < names.length; i += 500) {
    const r = await rawRequest('/universe/ids/', { method: 'POST', body: names.slice(i, i + 500) });
    for (const c of r.body.characters || []) ids.push(c);
  }
  const aff = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const r = await rawRequest('/characters/affiliation/', { method: 'POST', body: ids.slice(i, i + 1000).map(c => c.id) });
    aff.push(...r.body);
  }
  const nameMap = await resolveNames([...new Set(aff.flatMap(a => [a.corporation_id, a.alliance_id]).filter(Boolean))]);
  // Standings from all pilots' contacts (character, corp, alliance)
  const standing = new Map();
  for (const ch of store.get().characters.filter(x => !x.needsReauth)) {
    const r = await safe(() => get(`/characters/${ch.id}/contacts/`, ch.id));
    if (ok(r)) for (const c of r) standing.set(c.contact_id, Math.abs(c.standing) > Math.abs(standing.get(c.contact_id) || 0) ? c.standing : standing.get(c.contact_id));
  }
  const mine = new Set(store.get().characters.map(c => c.id));
  const pilots = aff.map(a => {
    const c = ids.find(x => x.id === a.character_id) || {};
    const st = standing.get(a.character_id) ?? standing.get(a.corporation_id) ?? (a.alliance_id ? standing.get(a.alliance_id) : undefined);
    return { id: a.character_id, name: c.name, corporationId: a.corporation_id, corporation: nameMap[a.corporation_id], allianceId: a.alliance_id || null, alliance: a.alliance_id ? nameMap[a.alliance_id] : null,
      standing: st ?? null, mine: mine.has(a.character_id), npcCorp: a.corporation_id < 2000000 };
  });
  const groups = new Map();
  for (const p of pilots) {
    const k = p.allianceId ? 'a' + p.allianceId : 'c' + p.corporationId;
    const g = groups.get(k) || { name: p.alliance || p.corporation, alliance: !!p.allianceId, id: p.allianceId || p.corporationId, count: 0, standing: p.standing };
    g.count++; groups.set(k, g);
  }
  const unknown = names.filter(n => !ids.some(c => c.name.toLowerCase() === n.toLowerCase()));
  return { total: pilots.length, pilots: pilots.sort((a, b) => (a.standing ?? 0) - (b.standing ?? 0)), groups: [...groups.values()].sort((a, b) => b.count - a.count), unknown,
    hostiles: pilots.filter(p => p.standing !== null && p.standing < 0).length, blues: pilots.filter(p => p.standing !== null && p.standing > 0).length, neutrals: pilots.filter(p => p.standing === null && !p.mine).length };
}

async function zkillStats(ids) {
  const out = {};
  for (const id of ids.slice(0, 25)) {
    try {
      const r = await fetch(`https://zkillboard.com/api/stats/characterID/${id}/`, { headers: { 'User-Agent': 'EVE-Toolkit-Desktop (in-game contact: Mr Frank)', 'Accept-Encoding': 'gzip' } });
      if (!r.ok) continue;
      const j = await r.json();
      out[id] = { kills: j.shipsDestroyed || 0, losses: j.shipsLost || 0, danger: j.dangerRatio ?? null, gang: j.gangRatio ?? null, solo: j.soloKills || 0, iskDestroyed: j.iskDestroyed || 0 };
      await new Promise(res => setTimeout(res, 350));
    } catch { /* skip */ }
  }
  return out;
}

function analyseDscan(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const cols = line.split('\t').map(c => c.trim());
    if (cols.length < 2) continue;
    // Columns are usually [typeID?] Name, Type, Distance
    let typeName = null, dist = null, name = null;
    for (let i = 0; i < cols.length; i++) {
      if (/^[-\d,. ]+\s*(km|m|AU)$|^-$/.test(cols[i])) dist = cols[i];
      else if (!typeName && i > 0 && sde.typeIdByName(cols[i])) typeName = cols[i];
      else if (!name && !/^\d+$/.test(cols[i])) name = cols[i];
    }
    if (!typeName) continue;
    const id = sde.typeIdByName(typeName);
    const t = sde.type(id);
    let km = null;
    if (dist && dist !== '-') { const n = Number(dist.replace(/[^\d.]/g, '')); km = /AU/.test(dist) ? n * 1.496e8 : /km/.test(dist) ? n : n / 1000; }
    rows.push({ name, typeId: id, type: t.name, group: t.group, category: t.category, categoryId: t.categoryId, km });
  }
  const byType = new Map(), byGroup = new Map();
  for (const r of rows) {
    const k = r.typeId; const x = byType.get(k) || { typeId: k, type: r.type, group: r.group, category: r.category, count: 0, onGrid: 0 };
    x.count++; if (r.km !== null && r.km <= 8000) x.onGrid++; byType.set(k, x);
    byGroup.set(r.group, (byGroup.get(r.group) || 0) + 1);
  }
  const ships = rows.filter(r => r.categoryId === 6);
  return { total: rows.length, ships: ships.length, onGridShips: ships.filter(r => r.km !== null && r.km <= 8000).length,
    types: [...byType.values()].sort((a, b) => b.count - a.count), groups: [...byGroup.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => ({ group: g, count: n })),
    structures: rows.filter(r => [65, 23, 40].includes(r.categoryId)).map(r => ({ name: r.name, type: r.type, km: r.km })) };
}

module.exports = {
  setListener: fn => { listener = fn; }, start, stop, restartIfEnabled, cfg, reports: () => reports, positions, channelsSeen, logsRoot,
  analyseLocal, analyseDscan, zkillStats, resetCombat, checkSpikes, spikes: () => spikes, localEvents: () => localEvents,
  _parseChatLine: parseChatLine, _findSystems: findSystems, _parseCombatLine: parseCombatLine, _isClear: isClear, _jumpsBetween: jumpsBetween, _decode: decode
};
