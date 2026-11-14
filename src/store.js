// Simple JSON persistence in the user's AppData folder.
// Refresh tokens are encrypted with Electron safeStorage (Windows DPAPI).
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DEFAULTS = {
  settings: {
    clientId: '',
    callbackPort: 51515,
    notifications: true,
    notifyIndustry: true,
    notifyPlanets: true,
    minimizeToTray: true,
    refreshMinutes: 15
  },
  characters: [],      // [{ id, name, scopes, refreshEnc, plain? }]
  nameCache: {},       // id -> { name, category }
  skillGroups: null,   // { fetched, groups: [{id,name,types:[]}] }
  notified: {},        // charId -> last notification key
  seenEvents: {}       // event key -> timestamp (job ready, extractor expiry)
};

let filePath;
let data;
let saveTimer = null;

// Big, fast-growing data lives in its own files under data/, so saving settings stays quick.
// The rest of the app still reads and writes it as store.get().<key>.
const BULK = ['trade', 'contractItems', 'history', 'abyssRuns', 'nameCache', 'daily', 'seenEvents', 'timers', 'mineSites', 'miningLog'];
let bulkDir;
const written = {};      // key -> fingerprint of what's on disk
const dirty = new Set();
const bulkFile = k => path.join(bulkDir, k + '.json');
const fingerprint = str => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return str.length + ':' + h; };

function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function load() {
  filePath = path.join(app.getPath('userData'), 'companion-data.json');
  bulkDir = path.join(app.getPath('userData'), 'data');
  try { fs.mkdirSync(bulkDir, { recursive: true }); } catch {}
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data = { ...DEFAULTS, ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } };
  } catch {
    data = JSON.parse(JSON.stringify(DEFAULTS));
  }
  for (const k of BULK) {
    if (data[k] !== undefined && data[k] !== null && !fs.existsSync(bulkFile(k))) { dirty.add(k); continue; }   // older versions kept it inline: move it out
    try {
      const text = fs.readFileSync(bulkFile(k), 'utf8');
      data[k] = JSON.parse(text); written[k] = fingerprint(text);
    } catch { /* not created yet */ }
  }
  return data;
}

function writeBulk(k, force) {
  if (data[k] === undefined) return;
  const text = JSON.stringify(data[k]);
  const fp = fingerprint(text);
  if (!force && written[k] === fp) return;
  writeAtomic(bulkFile(k), text);
  written[k] = fp;
}

function saveNow(all = true) {
  if (!filePath) return;
  const main = {};
  for (const [k, v] of Object.entries(data)) if (!BULK.includes(k)) main[k] = v;
  writeAtomic(filePath, JSON.stringify(main));
  // Bulk files: the ones named in save(), plus everything on quit and on the periodic flush.
  for (const k of BULK) if (all || dirty.has(k)) { try { writeBulk(k, dirty.has(k)); } catch {} }
  dirty.clear();
}

/** save() writes settings soon. Pass the bulk keys you changed, e.g. save('trade'), to write those too. */
function save(...keys) {
  for (const k of keys) if (BULK.includes(k)) dirty.add(k);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(false), 300);
}

// Safety net for any change saved without its key: compare and write every 5 minutes.
setInterval(() => { if (filePath) try { for (const k of BULK) writeBulk(k, false); } catch {} }, 5 * 60000).unref?.();

function dataFolder() { return path.dirname(filePath); }

function get() { return data; }

function encryptToken(token) {
  if (safeStorage.isEncryptionAvailable()) {
    return { enc: safeStorage.encryptString(token).toString('base64') };
  }
  return { plain: token };
}

function decryptToken(entry) {
  if (entry.refreshEnc) return safeStorage.decryptString(Buffer.from(entry.refreshEnc, 'base64'));
  return entry.plain || null;
}

function upsertCharacter(id, name, scopes, refreshToken) {
  const t = encryptToken(refreshToken);
  let c = data.characters.find(x => x.id === id);
  if (!c) { c = { id }; data.characters.push(c); }
  c.name = name;
  c.scopes = scopes;
  delete c.refreshEnc; delete c.plain;
  if (t.enc) c.refreshEnc = t.enc; else c.plain = t.plain;
  c.needsReauth = false;
  save();
  return c;
}

function setRefreshToken(id, refreshToken) {
  const c = data.characters.find(x => x.id === id);
  if (!c) return;
  const t = encryptToken(refreshToken);
  delete c.refreshEnc; delete c.plain;
  if (t.enc) c.refreshEnc = t.enc; else c.plain = t.plain;
  save();
}

function removeCharacter(id) {
  data.characters = data.characters.filter(x => x.id !== id);
  delete data.notified[id];
  save();
}

module.exports = { load, get, save, saveNow, dataFolder, BULK, decryptToken, upsertCharacter, setRefreshToken, removeCharacter };
