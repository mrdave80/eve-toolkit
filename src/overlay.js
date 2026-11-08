'use strict';
/* Overlay: a small always-on-top window to sit over the EVE client (EVE in windowed or fixed-window mode). */
const { BrowserWindow, globalShortcut, screen } = require('electron');
const path = require('path');
const store = require('./store');

let win = null, route = null;
const cfg = () => ({ opacity: 0.92, locked: false, bounds: null, ...(store.get().settings.overlay || {}) });
function saveCfg(p) { store.get().settings.overlay = { ...cfg(), ...p }; store.save(); }

function create() {
  if (win && !win.isDestroyed()) return win;
  const c = cfg();
  const wa = screen.getPrimaryDisplay().workArea;
  const b = c.bounds || { width: 330, height: 460, x: wa.x + wa.width - 350, y: wa.y + 80 };
  win = new BrowserWindow({
    ...b, minWidth: 260, minHeight: 200, frame: false, transparent: true, resizable: true, skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false,
    title: 'EVE Toolkit overlay', backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setOpacity(c.opacity);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
  win.once('ready-to-show', () => { win.showInactive(); applyLock(); });
  const remember = () => { if (win && !win.isDestroyed()) saveCfg({ bounds: win.getBounds() }); };
  win.on('moved', remember); win.on('resized', remember);
  win.on('closed', () => { win = null; saveCfg({ open: false }); });
  saveCfg({ open: true });
  return win;
}

function applyLock() {
  if (!win || win.isDestroyed()) return;
  const locked = cfg().locked;
  win.setIgnoreMouseEvents(locked, { forward: true });
  win.webContents.send('overlay:state', { locked, opacity: cfg().opacity });
}

function toggle() { if (win && !win.isDestroyed()) { win.close(); return false; } create(); return true; }
function setLocked(v) { saveCfg({ locked: !!v }); applyLock(); return cfg(); }
function setOpacity(v) { const o = Math.max(0.35, Math.min(1, Number(v) || 0.9)); saveCfg({ opacity: o }); if (win && !win.isDestroyed()) win.setOpacity(o); return cfg(); }
function setRoute(r) { route = r; if (win && !win.isDestroyed()) win.webContents.send('overlay:route', route); return true; }
const getRoute = () => route;
const send = (ch, d) => { if (win && !win.isDestroyed()) win.webContents.send(ch, d); };

function registerShortcuts() {
  try {
    globalShortcut.register('CommandOrControl+Shift+O', () => toggle());
    globalShortcut.register('CommandOrControl+Shift+L', () => { if (win && !win.isDestroyed()) setLocked(!cfg().locked); });
  } catch { /* another app owns the keys */ }
}
function restore() { if (cfg().open) create(); }

module.exports = { create, toggle, setLocked, setOpacity, setRoute, getRoute, cfg, send, registerShortcuts, restore, unregister: () => globalShortcut.unregisterAll(), isOpen: () => !!(win && !win.isDestroyed()) };
