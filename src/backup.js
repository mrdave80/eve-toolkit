'use strict';
/* Encrypted backup and restore, for moving EVE Toolkit to another PC.
   Logins (refresh tokens) are normally locked to this Windows account, so the backup carries them
   decrypted inside a password-protected file: AES-256-GCM with a key from scrypt. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { app } = require('electron');
const store = require('./store');

const FORMAT = 'evetk-backup-1';
const SKIP = new Set(['nameCache', 'contractItems', 'seenEvents', 'skillGroups', 'locSystems', 'stationNames']);   // caches that rebuild themselves
const KDF = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

const key = (password, salt) => crypto.scryptSync(String(password), salt, 32, KDF);

function checkPassword(p) { if (typeof p !== 'string' || p.length < 8) throw new Error('Use a password of at least 8 characters.'); }

/** Build the backup file contents. */
function create(password) {
  checkPassword(password);
  store.saveNow();
  const d = store.get();
  const main = {};
  for (const [k, v] of Object.entries(d)) if (!SKIP.has(k)) main[k] = v;
  main.characters = (d.characters || []).map(c => {
    const { refreshEnc, plain, ...rest } = c;
    let token = null; try { token = store.decryptToken(c); } catch {}
    return { ...rest, refreshPlain: token };
  });
  let workspace = null;
  try { workspace = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'corp-workspace.json'), 'utf8')); } catch {}
  const plain = zlib.gzipSync(Buffer.from(JSON.stringify({ main, workspace })));
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(password, salt), iv);
  const enc = Buffer.concat([c.update(plain), c.final()]);
  return JSON.stringify({ format: FORMAT, app: app.getVersion(), created: new Date().toISOString(), pilots: main.characters.map(x => x.name),
    kdf: { name: 'scrypt', N: KDF.N, r: KDF.r, p: KDF.p }, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: enc.toString('base64') });
}

function open(text, password) {
  let f; try { f = JSON.parse(text); } catch { throw new Error('That isn’t an EVE Toolkit backup file.'); }
  if (!f || f.format !== FORMAT) throw new Error('That isn’t an EVE Toolkit backup file.');
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key(password, Buffer.from(f.salt, 'base64')), Buffer.from(f.iv, 'base64'));
    d.setAuthTag(Buffer.from(f.tag, 'base64'));
    const plain = Buffer.concat([d.update(Buffer.from(f.data, 'base64')), d.final()]);
    return { meta: f, payload: JSON.parse(zlib.gunzipSync(plain).toString('utf8')) };
  } catch { throw new Error('Wrong password, or the file is damaged.'); }
}

/** Peek at a backup without restoring it. */
function describe(text, password) { const { meta, payload } = open(text, password); return { created: meta.created, app: meta.app, pilots: (payload.main.characters || []).map(c => c.name), hasWorkspace: !!payload.workspace }; }

/** Replace this PC's data with the backup. The app restarts afterwards. */
function restore(text, password) {
  const { payload } = open(text, password);
  const ud = app.getPath('userData');
  const dataDir = path.join(ud, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  // Keep a copy of what's being replaced, just in case
  const keep = path.join(ud, 'before-restore-' + new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(keep, { recursive: true });
  for (const f of ['companion-data.json', 'corp-workspace.json']) { try { fs.copyFileSync(path.join(ud, f), path.join(keep, f)); } catch {} }
  const main = payload.main;
  main.characters = (main.characters || []).map(c => {
    const { refreshPlain, ...rest } = c;
    if (!refreshPlain) return { ...rest, needsReauth: true };
    const { safeStorage } = require('electron');
    return safeStorage.isEncryptionAvailable() ? { ...rest, refreshEnc: safeStorage.encryptString(refreshPlain).toString('base64') } : { ...rest, plain: refreshPlain };
  });
  const inline = {};
  for (const [k, v] of Object.entries(main)) {
    if (store.BULK.includes(k)) fs.writeFileSync(path.join(dataDir, k + '.json'), JSON.stringify(v));
    else inline[k] = v;
  }
  fs.writeFileSync(path.join(ud, 'companion-data.json'), JSON.stringify(inline));
  if (payload.workspace) fs.writeFileSync(path.join(ud, 'corp-workspace.json'), JSON.stringify(payload.workspace));
  return { pilots: main.characters.map(c => c.name), keptOld: keep };
}

module.exports = { create, describe, restore, _open: open };
