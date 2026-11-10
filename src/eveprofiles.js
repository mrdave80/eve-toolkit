'use strict';
/* Copy EVE client settings (window layout, overview, hotkeys) from one pilot or account to others.
   EVE keeps them in core_char_<characterId>.dat and core_user_<accountId>.dat inside
   %LOCALAPPDATA%\CCP\EVE\<install>_tq_tranquility\settings_<profile>\. Every copy is backed up first. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { app } = require('electron');

const RE_DIR = /^.+_(tq_tranquility|sisi_singularity)$/i;
const RE_FILE = /^core_(char|user)_(\d+)\.dat$/i;

function roots() {
  const out = [];
  if (process.platform === 'win32') {
    const la = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    out.push(path.join(la, 'CCP', 'EVE'));
  } else {
    const steam = ['.steam/steam', '.local/share/Steam', '.var/app/com.valvesoftware.Steam/.local/share/Steam'];
    for (const s of steam) out.push(path.join(os.homedir(), s, 'steamapps/compatdata/8500/pfx/drive_c/users/steamuser/AppData/Local/CCP/EVE'));
    out.push(path.join(os.homedir(), 'Library/Application Support/CCP/EVE')); // macOS
  }
  if (process.env.EVE_SETTINGS_ROOT) out.unshift(process.env.EVE_SETTINGS_ROOT);
  return out.filter(p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
}

const backupRoot = () => path.join(app.getPath('userData'), 'eve-settings-backups');

/** Install folders → profiles → files. */
function list() {
  const installs = [];
  for (const root of roots()) {
    for (const d of safeDir(root)) {
      if (!RE_DIR.test(d)) continue;
      const server = /sisi/i.test(d) ? 'Singularity' : 'Tranquility';
      const profiles = [];
      for (const p of safeDir(path.join(root, d))) {
        if (!/^settings_/i.test(p)) continue;
        const dir = path.join(root, d, p);
        const chars = [], users = [];
        for (const f of safeDir(dir)) {
          const m = f.match(RE_FILE); if (!m) continue;
          let st; try { st = fs.statSync(path.join(dir, f)); } catch { continue; }
          (m[1].toLowerCase() === 'char' ? chars : users).push({ id: Number(m[2]), file: f, modified: st.mtimeMs, size: st.size });
        }
        chars.sort((a, b) => b.modified - a.modified); users.sort((a, b) => b.modified - a.modified);
        profiles.push({ name: p.replace(/^settings_/i, ''), dir, chars, users });
      }
      if (profiles.length) installs.push({ name: d.replace(RE_DIR, '').replace(/_+$/, '') || d, server, dir: path.join(root, d), profiles });
    }
  }
  return { roots: roots(), installs };
}

function safeDir(p) { try { return fs.readdirSync(p); } catch { return []; } }

/** Make sure a profile folder really came from list(), never from somewhere else on disk. */
function checkProfile(dir) {
  const ok = list().installs.some(i => i.profiles.some(p => path.resolve(p.dir) === path.resolve(dir)));
  if (!ok) throw new Error('That settings folder is not one EVE uses.');
  return path.resolve(dir);
}

function eveRunning() {
  return new Promise(resolve => {
    if (process.platform === 'win32') {
      execFile('tasklist', ['/FI', 'IMAGENAME eq exefile.exe', '/NH'], { windowsHide: true }, (e, out) => resolve(!e && /exefile\.exe/i.test(out || '')));
    } else {
      execFile('pgrep', ['-f', 'exefile.exe'], (e, out) => resolve(!e && !!String(out || '').trim()));
    }
  });
}

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }

/** Copy one source file over several targets. kind: 'char' | 'user'. Backs up each target first. */
async function copy({ dir, kind, from, to, force }) {
  dir = checkProfile(dir);
  if (!['char', 'user'].includes(kind)) throw new Error('Pick pilot or account settings.');
  from = Number(from); to = [...new Set((to || []).map(Number))].filter(n => n && n !== from);
  if (!from || !to.length) throw new Error('Pick a source and at least one target.');
  if (!force && await eveRunning()) { const e = new Error('EVE is running. Close every EVE client first, or it will overwrite these files when it exits.'); e.code = 'EVE_RUNNING'; throw e; }
  const src = path.join(dir, `core_${kind}_${from}.dat`);
  if (!fs.existsSync(src)) throw new Error('The source settings file is missing.');
  const id = stamp(), bdir = path.join(backupRoot(), id);
  fs.mkdirSync(bdir, { recursive: true });
  const files = [];
  for (const t of to) {
    const dst = path.join(dir, `core_${kind}_${t}.dat`);
    const had = fs.existsSync(dst);
    if (had) fs.copyFileSync(dst, path.join(bdir, path.basename(dst)));
    files.push({ file: path.basename(dst), existed: had });
  }
  fs.writeFileSync(path.join(bdir, 'manifest.json'), JSON.stringify({ at: Date.now(), dir, kind, from, to, files }, null, 2));
  for (const t of to) fs.copyFileSync(src, path.join(dir, `core_${kind}_${t}.dat`));
  return { backup: id, copied: to.length };
}

function backups() {
  return safeDir(backupRoot()).map(id => {
    try { const m = JSON.parse(fs.readFileSync(path.join(backupRoot(), id, 'manifest.json'), 'utf8')); return { id, ...m }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.at - a.at);
}

/** Put the files from a backup back where they were. Files that did not exist before are removed. */
async function restore(id, force) {
  if (!/^[\dT-]+$/.test(String(id))) throw new Error('Bad backup id.');
  const bdir = path.join(backupRoot(), id);
  const m = JSON.parse(fs.readFileSync(path.join(bdir, 'manifest.json'), 'utf8'));
  const dir = checkProfile(m.dir);
  if (!force && await eveRunning()) { const e = new Error('EVE is running. Close every EVE client first.'); e.code = 'EVE_RUNNING'; throw e; }
  for (const f of m.files) {
    if (!RE_FILE.test(f.file)) continue;
    const dst = path.join(dir, f.file);
    if (f.existed) fs.copyFileSync(path.join(bdir, f.file), dst);
    else { try { fs.unlinkSync(dst); } catch {} }
  }
  return { restored: m.files.length };
}

module.exports = { list, copy, backups, restore, eveRunning };
