// Corp workspace: everything leadership records locally (ops, timers, fleet
// participation, SRP, recruitment, imported audits, Discord config).
// Shared between officers by export/import (merge by id, newest wins).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

const COLLECTIONS = ['ops', 'timers', 'fleets', 'srp', 'hr', 'maps', 'doctrines', 'invoices', 'buyback'];
const DEFAULTS = () => ({
  version: 1,
  ops: [], timers: [], fleets: [], srp: [], hr: [], maps: [], doctrines: [], invoices: [], buyback: [],
  audits: {},
  srpRules: { percent: 100, includeFit: true, maxPayout: 0, shipOverrides: {} },
  discord: {
    webhooks: { ops: '', timers: '', structures: '', srp: '', hr: '' },
    botTokenEnc: null, guildId: '', memberRoleId: '', allianceRoleId: '', titleRoles: {},
    links: {}, syncEnabled: false, lastSync: null, lastSyncResult: null,
    fuelWarnDays: 3, alertStructures: true, remindOps: true
  },
  alerted: {},
  deleted: {},            // "collection:id" -> ISO time (tombstones so deletes survive syncing)
  alts: {},               // charId -> mainId
  buybackRules: { percent: 90, categories: {} },
  sync: { folder: '', machine: '', lastSync: null, lastError: null }
});

let file, ws, timer;

function load() {
  file = path.join(app.getPath('userData'), 'corp-workspace.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const d = DEFAULTS();
    ws = { ...d, ...raw, deleted: raw.deleted || {}, alts: raw.alts || {}, buybackRules: { ...d.buybackRules, ...(raw.buybackRules || {}) }, sync: { ...d.sync, ...(raw.sync || {}) }, maps: raw.maps || [], doctrines: raw.doctrines || [], invoices: raw.invoices || [], buyback: raw.buyback || [], discord: { ...d.discord, ...(raw.discord || {}), webhooks: { ...d.discord.webhooks, ...((raw.discord || {}).webhooks || {}) } }, srpRules: { ...d.srpRules, ...(raw.srpRules || {}) } };
  } catch { ws = DEFAULTS(); }
  return ws;
}
function saveNow() { if (!file) return; fs.writeFileSync(file + '.tmp', JSON.stringify(ws, null, 2)); fs.renameSync(file + '.tmp', file); writeSyncFile(); }
function save() { clearTimeout(timer); timer = setTimeout(saveNow, 300); }

// ---------- Shared folder sync (OneDrive / Dropbox / network share) ----------
// Each PC writes its own file into the folder and merges everyone else's.
function machineId() {
  if (!ws.sync.machine) { ws.sync.machine = require('os').hostname().replace(/[^\w-]/g, '').slice(0, 24) + '-' + crypto.randomBytes(3).toString('hex'); }
  return ws.sync.machine;
}
function writeSyncFile() {
  const dir = ws && ws.sync && ws.sync.folder;
  if (!dir) return;
  try {
    const f = path.join(dir, `eve-companion-${machineId()}.json`);
    fs.writeFileSync(f + '.tmp', JSON.stringify({ ...exportData({ includeDiscord: true }), machine: machineId() }));
    fs.renameSync(f + '.tmp', f);
  } catch (e) { ws.sync.lastError = e.message; }
}
let lastSeen = new Map();
function pullSync() {
  const dir = ws && ws.sync && ws.sync.folder;
  if (!dir) return null;
  let merged = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!/^eve-companion-.+\.json$/.test(f) || f === `eve-companion-${machineId()}.json`) continue;
      const full = path.join(dir, f);
      const m = fs.statSync(full).mtimeMs;
      if (lastSeen.get(full) === m) continue;
      lastSeen.set(full, m);
      const counts = importData(JSON.parse(fs.readFileSync(full, 'utf8')), { quiet: true });
      merged += Object.values(counts).reduce((n, x) => n + x, 0);
    }
    ws.sync.lastSync = new Date().toISOString(); ws.sync.lastError = null;
  } catch (e) { ws.sync.lastError = e.message; }
  if (merged) { fs.writeFileSync(file, JSON.stringify(ws, null, 2)); }
  return merged;
}
function setSyncFolder(folder) {
  ws.sync.folder = folder || '';
  lastSeen = new Map();
  if (folder) { fs.mkdirSync(folder, { recursive: true }); writeSyncFile(); pullSync(); }
  saveNow();
  return ws.sync;
}
function get() { if (!ws) load(); return ws; }

const newId = () => crypto.randomBytes(8).toString('hex');

function upsert(collection, item) {
  if (!COLLECTIONS.includes(collection)) throw new Error('Unknown collection ' + collection);
  const list = get()[collection];
  const now = new Date().toISOString();
  if (!item.id) { item = { ...item, id: newId(), createdAt: now }; list.push(item); }
  else {
    const i = list.findIndex(x => x.id === item.id);
    if (i === -1) list.push({ ...item, createdAt: item.createdAt || now });
    else list[i] = { ...list[i], ...item };
    item = list.find(x => x.id === item.id);
  }
  item.updatedAt = now;
  save();
  return item;
}

function remove(collection, id) {
  if (!COLLECTIONS.includes(collection)) throw new Error('Unknown collection ' + collection);
  get()[collection] = get()[collection].filter(x => x.id !== id);
  get().deleted[collection + ':' + id] = new Date().toISOString();
  save();
  return true;
}

function setSection(key, value) {
  if (!['srpRules'].includes(key)) throw new Error('Not editable: ' + key);
  get()[key] = { ...get()[key], ...value };
  save();
  return get()[key];
}

// ---------- Discord settings (bot token encrypted) ----------

function discordPublic() {
  const d = get().discord;
  const { botTokenEnc, ...rest } = d;
  return { ...rest, hasBotToken: !!botTokenEnc };
}
function setDiscord(patch) {
  const d = get().discord;
  if (patch.webhooks) {
    for (const [k, v] of Object.entries(patch.webhooks)) {
      if (v && !/^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(v.trim())) throw new Error(`The ${k} webhook URL doesn't look like a Discord webhook.`);
      d.webhooks[k] = (v || '').trim();
    }
  }
  if (typeof patch.botToken === 'string') {
    const t = patch.botToken.trim();
    d.botTokenEnc = t ? (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t).toString('base64') : 'plain:' + t) : null;
  }
  for (const k of ['guildId', 'memberRoleId', 'allianceRoleId']) if (typeof patch[k] === 'string') {
    if (patch[k] && !/^\d{15,22}$/.test(patch[k].trim())) throw new Error(`${k} must be a Discord ID (numbers only).`);
    d[k] = patch[k].trim();
  }
  for (const k of ['syncEnabled', 'alertStructures', 'remindOps']) if (typeof patch[k] === 'boolean') d[k] = patch[k];
  if (patch.fuelWarnDays !== undefined) d.fuelWarnDays = Math.max(1, Math.min(30, Number(patch.fuelWarnDays) || 3));
  if (patch.titleRoles && typeof patch.titleRoles === 'object') d.titleRoles = patch.titleRoles;
  save();
  return discordPublic();
}
function botToken() {
  const e = get().discord.botTokenEnc;
  if (!e) return null;
  if (e.startsWith('plain:')) return e.slice(6);
  return safeStorage.decryptString(Buffer.from(e, 'base64'));
}
function linkDiscord(charId, userId) {
  if (userId && !/^\d{15,22}$/.test(String(userId).trim())) throw new Error('Discord user IDs are 17–20 digit numbers (enable Developer Mode in Discord, right-click the user, Copy User ID).');
  if (userId) get().discord.links[charId] = String(userId).trim(); else delete get().discord.links[charId];
  save();
  return get().discord.links;
}

// ---------- Audits ----------

function importAudit(obj) {
  if (!obj || obj.format !== 'eve-companion-audit' || !obj.character || !obj.character.id) throw new Error('Not an EVE Toolkit audit file.');
  const prev = get().audits[obj.character.id];
  if (prev && prev.exportedAt > obj.exportedAt) return { character: obj.character, skipped: true };
  get().audits[obj.character.id] = obj;
  save();
  return { character: obj.character, skipped: false };
}
function removeAudit(id) { delete get().audits[id]; save(); return true; }

// ---------- Export / import whole workspace ----------

function exportData({ includeDiscord = false } = {}) {
  const w = get();
  const out = { format: 'eve-companion-workspace', exportedAt: new Date().toISOString() };
  for (const c of COLLECTIONS) out[c] = w[c];
  out.audits = w.audits;
  out.srpRules = w.srpRules;
  out.deleted = w.deleted;
  out.alts = w.alts;
  out.buybackRules = w.buybackRules;
  if (includeDiscord) { const { botTokenEnc, ...d } = w.discord; out.discord = d; }
  return out;
}

function importData(obj, { quiet = false } = {}) {
  if (!obj || obj.format !== 'eve-companion-workspace') throw new Error('Not an EVE Toolkit workspace file.');
  const w = get();
  const counts = {};
  // Apply remote deletions first (newer than our copy of the item)
  for (const [k, at] of Object.entries(obj.deleted || {})) {
    if ((w.deleted[k] || '') >= at) continue;
    w.deleted[k] = at;
    const [c, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    if (!COLLECTIONS.includes(c)) continue;
    const before = w[c].length;
    w[c] = w[c].filter(x => !(x.id === id && (x.updatedAt || '') <= at));
    if (w[c].length !== before) counts.deleted = (counts.deleted || 0) + 1;
  }
  for (const [k, v] of Object.entries(obj.alts || {})) if (w.alts[k] !== v) { w.alts[k] = v; counts.alts = (counts.alts || 0) + 1; }
  for (const c of COLLECTIONS) {
    let n = 0;
    for (const item of obj[c] || []) {
      if (!item.id) continue;
      const tomb = w.deleted[c + ':' + item.id];
      if (tomb && tomb >= (item.updatedAt || '')) continue;
      const i = w[c].findIndex(x => x.id === item.id);
      if (i === -1) { w[c].push(item); n++; }
      else if ((item.updatedAt || '') > (w[c][i].updatedAt || '')) { w[c][i] = item; n++; }
    }
    counts[c] = n;
  }
  let a = 0;
  for (const [id, au] of Object.entries(obj.audits || {})) {
    if (!w.audits[id] || w.audits[id].exportedAt < au.exportedAt) { w.audits[id] = au; a++; }
  }
  counts.audits = a;
  if (obj.discord) {
    const keep = w.discord.botTokenEnc;
    w.discord = { ...w.discord, ...obj.discord, botTokenEnc: keep, links: { ...w.discord.links, ...(obj.discord.links || {}) } };
  }
  if (!quiet) save();
  return counts;
}

function setAlt(charId, mainId) { if (mainId && Number(mainId) !== Number(charId)) get().alts[charId] = Number(mainId); else delete get().alts[charId]; save(); return get().alts; }
function setBuybackRules(r) { get().buybackRules = { ...get().buybackRules, ...r }; save(); return get().buybackRules; }

module.exports = { setSyncFolder, pullSync, writeSyncFile, setAlt, setBuybackRules, load, get, save, saveNow, upsert, remove, setSection, discordPublic, setDiscord, botToken, linkDiscord, importAudit, removeAudit, exportData, importData };
