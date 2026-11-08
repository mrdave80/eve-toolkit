'use strict';
/* Diagnostics: a small rotating log of errors and key events, and a redacted report for bug mails. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const MAX_BYTES = 1024 * 1024;
const ring = [];
let file = null;

function logFile() {
  if (!file) { const dir = path.join(app.getPath('userData'), 'logs'); fs.mkdirSync(dir, { recursive: true }); file = path.join(dir, 'eve-toolkit.log'); }
  return file;
}

/** Strip anything that looks like a token, auth code or secret before it reaches the log. */
function redact(s) {
  return String(s)
    .replace(/(Bearer\s+)[\w.-]+/gi, '$1[redacted]')
    .replace(/([?&](code|state|token|access_token|refresh_token|code_verifier)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g, '[jwt redacted]')
    .replace(/(webhooks\/\d+\/)[\w-]+/g, '$1[redacted]')
    .replace(/(ntfy\.sh\/)[\w-]+/g, '$1[topic]')
    .slice(0, 2000);
}

function log(level, area, msg) {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${area}] ${redact(msg)}`;
  ring.push(line); if (ring.length > 400) ring.shift();
  try {
    const f = logFile();
    try { if (fs.statSync(f).size > MAX_BYTES) fs.renameSync(f, f + '.1'); } catch {}
    fs.appendFileSync(f, line + '\n');
  } catch {}
}
const error = (area, msg) => log('error', area, msg && msg.stack ? msg.stack : msg);
const warn = (area, msg) => log('warn', area, msg && msg.message ? msg.message : msg);
const info = (area, msg) => log('info', area, msg);

function recent(n = 200) {
  if (ring.length >= n) return ring.slice(-n);
  try { return fs.readFileSync(logFile(), 'utf8').trim().split('\n').slice(-n); } catch { return ring.slice(-n); }
}

/** A report safe to paste into an EVE mail: versions, settings switches, pilot scope counts and recent errors. No tokens, client ID or webhook secrets. */
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
function report({ store, sde }) {
  const s = store.get().settings || {};
  const chars = store.get().characters || [];
  let sdeInfo = 'not downloaded';
  try { const i = sde.info(); sdeInfo = i && i.build ? `build ${i.build}` : (i && i.state) || 'unknown'; } catch {}
  const flags = {
    notifications: !!s.notifications, minimizeToTray: !!s.minimizeToTray, intelWatch: !!(s.intel && s.intel.enabled), clipboard: !!(s.intel && s.intel.clipboard), spikeWatch: !!(s.intel && s.intel.spike),
    phone: !!(s.phone && s.phone.enabled), speech: !!(s.speech && s.speech.enabled), uiScopes: !!s.uiScopes, abyss: !!(s.abyss && s.abyss.enabled), theme: s.theme || 'capsuleer', zoom: s.zoom || 1
  };
  const lines = [
    `EVE Toolkit ${app.getVersion()}`,
    `System: ${os.version ? os.version() : os.type()} (${os.release()}), ${os.arch()}, ${Math.round(os.totalmem() / 1073741824)} GB RAM`,
    `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
    `Client ID set: ${s.clientId ? 'yes' : 'no'} · Callback port ${s.callbackPort}`,
    `Game data: ${sdeInfo}`,
    `Pilots: ${chars.length} (${chars.filter(c => c.needsReauth).length} need re-auth) · scopes per pilot: ${chars.map(c => (c.scopes || []).length).join(', ') || 'none'}`,
    `Settings: ${Object.entries(flags).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `Data files: ${(() => { try { const dir = path.join(app.getPath('userData'), 'data'); const main = fs.statSync(path.join(app.getPath('userData'), 'companion-data.json')).size; return ['settings ' + kb(main), ...fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '') + ' ' + kb(fs.statSync(path.join(dir, f)).size))].join(', '); } catch { return 'unknown'; } })()}`,
    `Uptime: ${Math.round(process.uptime() / 60)} min`,
    '',
    'Recent log:',
    ...recent(60)
  ];
  return lines.join('\n');
}

module.exports = { log, error, warn, info, recent, report, logFile, redact };
