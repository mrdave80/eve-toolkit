'use strict';
/* One-click updates for the Windows builds.
   Downloads the matching release zip from GitHub, checks it against SHA256SUMS.txt from the same release,
   then swaps it in and restarts:
   - Portable exe: the running exe is renamed to .old (Windows allows renaming a running file), the new exe takes its place.
   - Folder (win-x64 zip): a small PowerShell script waits for the app to close, swaps the folders and starts the new copy.
   User data lives in AppData, so neither touches settings or pilots. */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const yauzl = require('yauzl');

const UA = { 'User-Agent': 'EVE-Toolkit-Desktop' };
let state = { phase: 'idle', pct: 0, version: null, error: null, kind: null };
let listener = () => {};
let prepared = null; // { kind, version, file|dir }

function kind() {
  if (process.platform !== 'win32' || !app.isPackaged) return null;
  return process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : 'folder';
}
const exeName = () => path.basename(process.execPath);

function set(patch) { state = { ...state, ...patch }; try { listener(state); } catch {} }

/** Which release assets this copy can install from. */
function assetsFor(release) {
  const k = kind();
  const assets = Array.isArray(release && release.assets) ? release.assets : [];
  if (!k || !assets.length) return null;
  const want = k === 'portable' ? /-portable\.zip$/i : /-win-x64\.zip$/i;
  const zip = assets.find(a => want.test(a.name || ''));
  const sums = assets.find(a => /^SHA256SUMS\.txt$/i.test(a.name || ''));
  if (!zip || !sums) return null;
  const ok = u => typeof u === 'string' && /^https:\/\/(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)\//.test(u);
  if (!ok(zip.browser_download_url) || !ok(sums.browser_download_url)) return null;
  return { kind: k, zip: { name: zip.name, url: zip.browser_download_url, size: zip.size || 0 }, sums: { url: sums.browser_download_url } };
}

/** Can the app write where it lives? Without that it can't replace itself. */
function writable() {
  const k = kind(); if (!k) return false;
  const dir = k === 'portable' ? path.dirname(process.env.PORTABLE_EXECUTABLE_FILE) : path.dirname(path.dirname(process.execPath));
  const probe = path.join(dir, `.evetk-write-test-${process.pid}`);
  try { fs.writeFileSync(probe, ''); fs.unlinkSync(probe); return true; } catch { return false; }
}

function workDir(version) { return path.join(app.getPath('temp'), 'eve-toolkit-update', String(version).replace(/[^\d.]/g, '')); }

async function fetchText(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!r.ok) throw new Error(`Download failed (${r.status}).`);
  return r.text();
}

async function downloadTo(url, file, size) {
  const r = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!r.ok || !r.body) throw new Error(`Download failed (${r.status}).`);
  const total = Number(r.headers.get('content-length')) || size || 0;
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(file);
  let got = 0, last = 0;
  try {
    for await (const chunk of r.body) {
      hash.update(chunk);
      got += chunk.length;
      if (!out.write(chunk)) await new Promise(res => out.once('drain', res));
      const pct = total ? Math.min(99, Math.floor(got / total * 100)) : 0;
      if (pct !== last) { last = pct; set({ pct }); }
    }
  } finally { await new Promise(res => out.end(res)); }
  return hash.digest('hex');
}

const openZip = file => new Promise((res, rej) => yauzl.open(file, { lazyEntries: true, autoClose: true }, (e, z) => e ? rej(e) : res(z)));

/** Extract a zip safely (no absolute paths or ..). Returns the list of written files. */
async function extract(file, dest, only) {
  const z = await openZip(file);
  const written = [];
  await new Promise((res, rej) => {
    z.on('error', rej); z.on('end', res);
    z.on('entry', e => {
      const name = e.fileName.replace(/\\/g, '/');
      if (name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) { z.close(); return rej(new Error('The update file looks wrong, so it was not used.')); }
      if (only && !only(name)) { z.readEntry(); return; }
      const target = path.join(dest, only ? path.basename(name) : name);
      if (name.endsWith('/')) { fs.mkdirSync(target, { recursive: true }); z.readEntry(); return; }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      z.openReadStream(e, (err, s) => {
        if (err) return rej(err);
        const w = fs.createWriteStream(target);
        s.on('error', rej); w.on('error', rej);
        w.on('close', () => { written.push(target); z.readEntry(); });
        s.pipe(w);
      });
    });
    z.readEntry();
  });
  return written;
}

/** Download, verify and unpack. Safe to call again; it reuses a finished download. */
async function prepare(release) {
  if (state.phase === 'downloading' || state.phase === 'installing') return state;
  const a = assetsFor(release);
  const version = String(release.tag_name || release.version || '').replace(/^v/i, '');
  if (!a) throw new Error('This copy can’t update itself. Download the new version from the releases page.');
  if (!writable()) throw new Error('EVE Toolkit can’t write to the folder it runs from, so it can’t replace itself. Download the new version from the releases page, or move the app to a folder you own (Documents or Desktop).');
  if (prepared && prepared.version === version) { set({ phase: 'ready', pct: 100, version, kind: a.kind, error: null }); return state; }
  set({ phase: 'downloading', pct: 0, version, kind: a.kind, error: null });
  try {
    const dir = workDir(version);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const sums = await fetchText(a.sums.url);
    const line = sums.split(/\r?\n/).find(l => l.trim().endsWith(a.zip.name));
    const expected = line ? line.trim().split(/\s+/)[0].toLowerCase() : null;
    if (!expected || !/^[0-9a-f]{64}$/.test(expected)) throw new Error('The release has no checksum for this download, so it was not installed.');
    const zipFile = path.join(dir, a.zip.name);
    const got = await downloadTo(a.zip.url, zipFile, a.zip.size);
    set({ phase: 'verifying', pct: 100 });
    if (got !== expected) throw new Error('The download didn’t match the release checksum, so it was not installed. Try again later.');
    if (a.kind === 'portable') {
      const files = await extract(zipFile, dir, n => /\.exe$/i.test(n) && !n.includes('/'));
      const exe = files.find(f => /\.exe$/i.test(f));
      if (!exe) throw new Error('The update has no program file in it.');
      prepared = { kind: 'portable', version, file: exe };
    } else {
      // Unpack beside the installed folder so the swap is a rename on the same drive.
      const appDir = path.dirname(process.execPath) + '.new-update';
      fs.rmSync(appDir, { recursive: true, force: true });
      await extract(zipFile, appDir);
      let root = appDir;
      const top = fs.readdirSync(appDir);
      if (!fs.existsSync(path.join(root, exeName())) && top.length === 1 && fs.statSync(path.join(appDir, top[0])).isDirectory()) root = path.join(appDir, top[0]);
      if (!fs.existsSync(path.join(root, exeName()))) throw new Error('The update is missing the program file.');
      prepared = { kind: 'folder', version, dir: root };
    }
    fs.rmSync(zipFile, { force: true });
    set({ phase: 'ready', pct: 100 });
  } catch (e) {
    prepared = null;
    set({ phase: 'error', error: e.message || String(e) });
    throw e;
  }
  return state;
}

const psq = s => `'${String(s).replace(/'/g, "''")}'`;

/** Swap in the prepared copy and restart. `quit` closes the app (flushing data first). */
function install(quit) {
  if (!prepared) throw new Error('The update isn’t downloaded yet.');
  set({ phase: 'installing' });
  if (prepared.kind === 'portable') {
    const exe = process.env.PORTABLE_EXECUTABLE_FILE;
    const old = exe + '.old';
    try { fs.rmSync(old, { force: true }); } catch {}
    try { fs.renameSync(exe, old); } catch (e) { set({ phase: 'error', error: 'Couldn’t replace the program file: ' + e.message }); throw e; }
    try { fs.copyFileSync(prepared.file, exe); }
    catch (e) { try { fs.renameSync(old, exe); } catch {} set({ phase: 'error', error: e.message }); throw e; }
    app.relaunch({ execPath: exe, args: [] });
    quit();
    return;
  }
  const appDir = path.dirname(process.execPath);
  const oldDir = appDir + '.old-update';
  const log = path.join(app.getPath('userData'), 'logs', 'update.log');
  const script = path.join(workDir(prepared.version), 'swap.ps1');
  fs.writeFileSync(script, [
    "$ErrorActionPreference = 'Stop'",
    `$app = ${psq(appDir)}; $new = ${psq(prepared.dir)}; $old = ${psq(oldDir)}; $exe = Join-Path $app ${psq(exeName())}; $log = ${psq(log)}`,
    '$deadline = (Get-Date).AddSeconds(90)',
    'while ((Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($app + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) }) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 400 }',
    'function Retry($block) { for ($i = 0; $i -lt 25; $i++) { try { & $block; return } catch { Start-Sleep -Milliseconds 400 } }; & $block }',
    'try {',
    '  if (Test-Path $old) { Remove-Item $old -Recurse -Force }',
    '  Retry { Move-Item -LiteralPath $app -Destination $old }',
    '  try { Retry { Move-Item -LiteralPath $new -Destination $app } } catch { Move-Item -LiteralPath $old -Destination $app; throw }',
    '  Start-Process -FilePath $exe',
    '  Remove-Item $old -Recurse -Force -ErrorAction SilentlyContinue',
    '} catch {',
    '  try { New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null; "$(Get-Date -Format s) $($_.Exception.Message)" | Out-File -FilePath $log -Append } catch {}',
    '  Start-Process -FilePath $exe',
    '}'
  ].join('\r\n'));
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script], { detached: true, stdio: 'ignore', windowsHide: true, cwd: path.dirname(script) });
  // Only close once the installer is actually running; otherwise stay open and say why.
  ps.once('spawn', () => { ps.unref(); quit(); });
  ps.once('error', e => set({ phase: 'error', error: 'Couldn’t start the installer: ' + e.message }));
}

/** On start: tidy up after an update (old portable exe, temp files). */
function cleanup() {
  try { const exe = process.env.PORTABLE_EXECUTABLE_FILE; if (exe) fs.rmSync(exe + '.old', { force: true }); } catch {}
  try { fs.rmSync(path.join(app.getPath('temp'), 'eve-toolkit-update'), { recursive: true, force: true }); } catch {}
  try { if (kind() === 'folder') for (const x of ['.old-update', '.new-update']) fs.rmSync(path.dirname(process.execPath) + x, { recursive: true, force: true }); } catch {}
}

module.exports = { kind, assetsFor, writable, prepare, install, cleanup, status: () => state, setListener: fn => { listener = fn; }, _extract: extract };
