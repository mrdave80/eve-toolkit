const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, shell, nativeImage, dialog, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const auth = require('./auth');
const esi = require('./esi');
const extra = require('./esi-extra');
const corp = require('./corp');
const workspace = require('./workspace');
const discord = require('./discord');
const audit = require('./audit');
const fleetTracker = require('./fleet-tracker');
const wormhole = require('./wormhole');
const sde = require('./sde');
const market = require('./market');
const skillplan = require('./skillplan');
const doctrines = require('./doctrines');
const industry = require('./industry');
const appraise = require('./appraise');
const daily = require('./daily');
const timers = require('./timers');
const farm = require('./farm');
const whinfo = require('./whinfo');
const trade = require('./trade');
const moonscan = require('./moonscan');
const items = require('./items');
const charvalue = require('./charvalue');
const bargains = require('./bargains');
const planets = require('./planets');
const tradetools = require('./tradetools');
const nav = require('./nav');
const intel = require('./intel');
const finance = require('./finance');
const pilotintel = require('./pilotintel');
const routewatch = require('./routewatch');
const phone = require('./phone');
const clipwatch = require('./clipwatch');
const couriers = require('./couriers');
const bridges = require('./bridges');
const livemap = require('./livemap');
const hunting = require('./hunting');
const whresidents = require('./whresidents');
const pve = require('./pve');
const overlay = require('./overlay');
const shame = require('./shame');
const diag = require('./diag');
process.on('uncaughtException', e => diag.error('crash', e));
process.on('unhandledRejection', e => diag.error('promise', e));
phone.setAwayCheck(() => !win || win.isDestroyed() || !win.isFocused() || !win.isVisible());

// 1.5.0 rename to EVE Toolkit: the data folder follows the product name, so carry over settings, logins and game data once.
(function migrateFromEveCompanion() {
  try {
    const now = app.getPath('userData');
    const old = path.join(app.getPath('appData'), 'EVE Companion');
    if (now === old || fs.existsSync(path.join(now, 'companion-data.json')) || !fs.existsSync(path.join(old, 'companion-data.json'))) return;
    const skip = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Crashpad', 'blob_storage', 'logs']);
    fs.mkdirSync(now, { recursive: true });
    for (const f of fs.readdirSync(old)) if (!skip.has(f)) fs.cpSync(path.join(old, f), path.join(now, f), { recursive: true, force: false, errorOnExist: false });
    fs.writeFileSync(path.join(now, 'migrated-from-eve-companion.txt'), `Copied from ${old} on ${new Date().toISOString()}\nThe old folder can be deleted once everything works.\n`);
  } catch (e) { console.error('Data migration failed', e); }
})();

app.setAppUserModelId('net.evetoolkit.desktop');

// One copy at a time. A newer version launched while an older one runs
// tells the old copy, which relaunches the new exe and exits.
const launchPath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
if (!app.requestSingleInstanceLock({ version: app.getVersion(), execPath: launchPath })) {
  app.quit();
}

function newerVersion(a, b) {
  const pa = String(a || '0').split('.').map(Number), pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

let win = null;
let tray = null;
let quitting = false;
let pollTimer = null;

const ICON = path.join(__dirname, '..', 'build', 'icon.png');

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: store.get().settings.themeBg || '#0a0e13',
    title: `EVE Toolkit ${app.getVersion()}`,
    icon: ICON,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      backgroundThrottling: false, // keep intel, speech and timers on time while minimised to the tray
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => { const z = store.get().settings.zoom; if (z && z !== 1) win.webContents.setZoomFactor(z); });

  // Links open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });

  win.on('close', e => {
    if (!quitting && store.get().settings.minimizeToTray && tray) {
      e.preventDefault();
      win.hide();
    }
  });
}

function showWindow() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  try {
    const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setToolTip(`EVE Toolkit ${app.getVersion()}`);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open EVE Toolkit', click: showWindow },
      { label: 'Check skill queues now', click: () => checkQueues(true) },
      { label: 'Show / hide overlay (Ctrl+Shift+O)', click: () => overlay.toggle() },
      { label: 'Lock / unlock overlay (Ctrl+Shift+L)', click: () => overlay.setLocked(!overlay.cfg().locked) },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', showWindow);
  } catch (e) {
    tray = null;
  }
}

// ---------- Background skill queue watch ----------

async function checkQueues(manual = false) {
  const data = store.get();
  if (!data.settings.clientId || !data.characters.length) return;
  const results = [];
  for (const c of data.characters) {
    if (c.needsReauth) continue;
    try {
      const o = await esi.overview(c.id);
      results.push(o);
      if (!data.settings.notifications) continue;
      let key = null, body = null;
      const hoursLeft = o.queueEnd ? (Date.parse(o.queueEnd) - Date.now()) / 3.6e6 : 0;
      if (o.queueLength === 0) { key = 'empty'; body = 'Skill queue is empty. Nothing is training.'; }
      else if (o.paused) { key = 'paused'; body = 'Skill queue is paused.'; }
      else if (hoursLeft < 24) { key = 'short:' + o.queueEnd; body = `Skill queue ends in ${Math.max(0, Math.floor(hoursLeft))}h ${Math.floor((hoursLeft % 1) * 60)}m.`; }
      if (key && (manual || data.notified[c.id] !== key)) {
        data.notified[c.id] = key;
        store.save();
        if (Notification.isSupported()) {
          phone.forward('skills', o.name || c.name, body);
          const n = new Notification({ title: o.name || c.name, body, icon: ICON });
          n.on('click', showWindow);
          n.show();
        }
      } else if (!key && data.notified[c.id]) {
        delete data.notified[c.id];
        store.save();
      }
      if (data.settings.notifyIndustry !== false) await checkIndustry(c, data);
      if (data.settings.notifyPlanets !== false) await checkPlanets(c, data);
      await checkExtraAlerts(c, data);
      await timers.refreshPilot(c).catch(() => {});
    } catch { /* surfaced in the UI on next view */ }
  }
  await timers.checkIncursions(results, notify, seen).catch(() => {});
  if (win && !win.isDestroyed()) win.webContents.send('overview:update', results);
}

function notify(title, body, category = 'general') {
  phone.forward(category, title, body);
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON });
  n.on('click', showWindow);
  n.show();
}

// Remember which events we've already announced (kept small).
function seen(data, key) {
  data.seenEvents = data.seenEvents || {};
  if (data.seenEvents[key]) return true;
  data.seenEvents[key] = Date.now();
  const keys = Object.keys(data.seenEvents);
  if (keys.length > 800) keys.sort((a, b) => data.seenEvents[a] - data.seenEvents[b]).slice(0, 200).forEach(k => delete data.seenEvents[k]);
  store.save('seenEvents');
  return false;
}

async function checkIndustry(c, data) {
  if (!data.settings.notifications) return;
  const r = await extra.industryFull(c.id);
  const ready = r.jobs.filter(j => !j.corp && j.status === 'ready');
  const fresh = ready.filter(j => !seen(data, 'job:' + j.jobId));
  if (fresh.length === 1) notify(c.name, `${fresh[0].activity} finished: ${fresh[0].product || fresh[0].blueprint} (${fresh[0].runs} run${fresh[0].runs > 1 ? 's' : ''})`, 'industry');
  else if (fresh.length > 1) notify(c.name, `${fresh.length} industry jobs are ready to deliver.`, 'industry');
  const free = r.slots.manufacturing.max - r.slots.manufacturing.used;
  if (ready.length === 0 && free === r.slots.manufacturing.max && r.slots.manufacturing.max > 1) {
    // all manufacturing slots idle: announce once per day
    const day = new Date().toISOString().slice(0, 10);
    if (!seen(data, `idle:${c.id}:${day}`)) notify(c.name, `All ${free} manufacturing slots are idle.`, 'industry');
  }
}

async function checkPlanets(c, data) {
  if (!data.settings.notifications) return;
  const r = await extra.planets(c.id);
  const soon = Date.now() + 2 * 3.6e6;
  for (const p of r.planets) {
    for (const e of p.extractors) {
      if (!e.expiry) continue;
      const exp = Date.parse(e.expiry);
      if (exp <= soon && !seen(data, `pi:${p.planetId}:${e.expiry}`)) {
        notify(c.name, exp <= Date.now()
          ? `Extractor on ${p.name} has stopped (${e.product}).`
          : `Extractor on ${p.name} stops in under 2 hours (${e.product}).`, 'planets');
        break;
      }
    }
  }
}

// ---------- Extra alerts: wars, corp apps, contracts, orders ----------

const ALERT_NOTIFS = {
  wars: ['WarDeclared', 'AllWarDeclaredMsg', 'CorpWarDeclaredMsg', 'CorpWarDeclaredV2', 'AllWarDeclaredV2', 'WarAdopted', 'WarInherited', 'WarRetractedByConcord', 'WarHQRemovedFromSpace', 'MercOfferedNegotiationMsg', 'AllyJoinedWarAggressorMsg', 'AllyJoinedWarDefenderMsg'],
  corpApps: ['CorpAppNewMsg', 'CharAppAcceptMsg', 'CharAppRejectMsg', 'CorpAppInvitedMsg', 'CharLeftCorpMsg', 'CorpNewCEOMsg'],
  kills: ['KillReportVictim', 'KillReportFinalBlow']
};
function alertOn(data, key) { const a = data.settings.alerts || {}; return a[key] !== false; }

async function checkExtraAlerts(c, data) {
  if (!data.settings.notifications) return;
  // Notifications feed
  const n = await esi.get(`/characters/${c.id}/notifications/`, c.id).catch(() => null);
  if (n) for (const x of n) {
    if (Date.parse(x.timestamp) < Date.now() - 6 * 3600000) continue;
    for (const [key, types] of Object.entries(ALERT_NOTIFS)) {
      if (!alertOn(data, key) || !types.includes(x.type)) continue;
      if (seen(data, 'notif:' + x.notification_id)) continue;
      notify(c.name, x.type.replace(/([a-z])([A-Z])/g, '$1 $2'), 'corp');
    }
  }
  // Contracts: new ones assigned to me, and my contracts completing
  if (alertOn(data, 'contracts')) {
    const list = await esi.get(`/characters/${c.id}/contracts/`, c.id).catch(() => null);
    if (list) {
      data.contractState = data.contractState || {};
      const prev = data.contractState[c.id] || null;
      const cur = {};
      for (const k of list) {
        cur[k.contract_id] = k.status;
        if (!prev) continue;
        if (!(k.contract_id in prev) && k.assignee_id === c.id && k.status === 'outstanding') notify(c.name, `New ${k.type.replace(/_/g, ' ')} contract assigned to you${k.title ? ': ' + k.title : ''}`, 'market');
        else if (prev[k.contract_id] && prev[k.contract_id] !== k.status && k.issuer_id === c.id && /finished|in_progress|rejected|failed/.test(k.status)) notify(c.name, `Contract ${k.title ? '"' + k.title + '" ' : ''}${k.status.replace(/_/g, ' ')}`, 'market');
      }
      data.contractState[c.id] = cur;
      store.save();
    }
  }
  // Orders: filled or expired since last check
  if (alertOn(data, 'orders')) {
    const open = await esi.get(`/characters/${c.id}/orders/`, c.id).catch(() => null);
    if (open) {
      data.orderState = data.orderState || {};
      const prev = data.orderState[c.id] || null;
      const cur = Object.fromEntries(open.map(o => [o.order_id, { t: o.type_id, v: o.volume_remain }]));
      if (prev) {
        const gone = Object.keys(prev).filter(id => !(id in cur));
        if (gone.length) {
          const hist = await esi.get(`/characters/${c.id}/orders/history/`, c.id).catch(() => []);
          const names = await esi.resolveNames(gone.map(id => prev[id].t), c.id);
          for (const id of gone) {
            const h = hist.find(x => String(x.order_id) === id);
            const state = h ? (h.volume_remain === 0 ? 'filled' : h.state) : 'closed';
            notify(c.name, `Market order ${state}: ${names[prev[id].t] || 'item'}`, 'market');
          }
        }
        for (const [id, o] of Object.entries(cur)) if (prev[id] && o.v < prev[id].v && !seen(data, `partial:${id}:${o.v}`)) { /* partial fills tracked silently */ }
      }
      data.orderState[c.id] = cur;
      store.save();
    }
  }
}

let lastUndercut = 0;
async function checkUndercuts() {
  const data = store.get();
  if (!data.settings.notifications || (data.settings.alerts || {}).undercut === false) return;
  if (Date.now() - lastUndercut < 30 * 60000) return;
  lastUndercut = Date.now();
  const list = await tradetools.myOrders().catch(() => []);
  const beaten = list.filter(o => o.check && o.check.beaten && !seen(data, `uc:${o.order_id}:${o.check.best}`));
  if (beaten.length === 1) notify(beaten[0].charName, `${beaten[0].is_buy_order ? 'Outbid' : 'Undercut'} on ${beaten[0].typeName} by ${Math.round(beaten[0].check.by).toLocaleString('en-AU')} ISK`, 'market');
  else if (beaten.length > 1) notify('Market', `${beaten.length} of your orders were undercut or outbid.`, 'market');
}
setInterval(() => checkUndercuts().catch(() => {}), 5 * 60000);

// ---------- Update check ----------

let updateInfo = null;
// Official releases: https://github.com/mrdave80/eve-toolkit/releases. A custom feed in Settings overrides it.
const RELEASES_API = 'https://api.github.com/repos/mrdave80/eve-toolkit/releases/latest';
const RELEASES_PAGE = 'https://github.com/mrdave80/eve-toolkit/releases/latest';
async function checkForUpdate() {
  const custom = store.get().settings.updateUrl;
  const url = custom && /^https:\/\//.test(custom) ? custom : RELEASES_API;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'EVE-Toolkit-Desktop', Accept: 'application/vnd.github+json, application/json' } });
    if (!r.ok) return updateInfo;
    const j = await r.json();
    // GitHub release ("tag_name": "v1.8.9") or a simple feed ({ "version": "1.8.9", "url": "...", "notes": "..." })
    const version = String(j.version || j.tag_name || '').replace(/^v/i, '');
    if (!/^\d+\.\d+\.\d+/.test(version) || j.draft || j.prerelease) return updateInfo;
    if (newerVersion(version, app.getVersion())) {
      const notes = String(j.notes || j.body || '').replace(/\r/g, '').slice(0, 1500);
      updateInfo = { version, url: j.url && !j.tag_name ? j.url : (j.html_url || RELEASES_PAGE), notes };
      if (win && !win.isDestroyed()) win.webContents.send('app:update', updateInfo);
      const d = store.get();
      if (!seen(d, 'update:' + version)) notify('EVE Toolkit update available', `Version ${version} is ready to download.`, 'app');
    }
  } catch (e) { diag.warn('update', e.message); }
  return updateInfo;
}
setTimeout(() => checkForUpdate(), 20000);
setInterval(() => checkForUpdate(), 12 * 3600000);

function schedulePolling() {
  clearInterval(pollTimer);
  const mins = Math.max(5, Number(store.get().settings.refreshMinutes) || 15);
  pollTimer = setInterval(() => checkQueues(false), mins * 60 * 1000);
}

// ---------- IPC ----------

function publicCharacters() {
  return store.get().characters.map(c => ({
    id: c.id, name: c.name, needsReauth: !!c.needsReauth,
    missingScopes: auth.SCOPES.filter(s => s !== 'publicData' && !(c.scopes || []).includes(s)),
    corpScopes: auth.CORP_SCOPES.filter(s => (c.scopes || []).includes(s)).length,
    isDirector: auth.CORP_SCOPES.some(s => (c.scopes || []).includes(s)),
    canWaypoint: (c.scopes || []).includes('esi-ui.write_waypoint.v1'), canOpenWindow: (c.scopes || []).includes('esi-ui.open_window.v1')
  }));
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) { diag.warn('ipc:' + channel, e.message || String(e)); return { ok: false, error: e.message || String(e), status: e.status || 0 }; }
  });
}

handle('app:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  os: `${require('os').version ? require('os').version() : 'Windows'} (${require('os').release()})`,
  userData: app.getPath('userData'),
  scopes: auth.SCOPES,
  corpScopes: auth.CORP_SCOPES
}));
handle('settings:get', () => store.get().settings);
handle('app:checkUpdate', () => checkForUpdate());
handle('app:updateInfo', () => updateInfo);
handle('settings:set', s => {
  const cur = store.get().settings;
  const next = { ...cur };
  if (typeof s.clientId === 'string') next.clientId = s.clientId.trim();
  if (s.callbackPort !== undefined) {
    const p = Number(s.callbackPort);
    if (!Number.isInteger(p) || p < 1024 || p > 65535) throw new Error('Callback port must be between 1024 and 65535.');
    next.callbackPort = p;
  }
  if (typeof s.notifications === 'boolean') next.notifications = s.notifications;
  if (typeof s.uiScopes === 'boolean') next.uiScopes = s.uiScopes;
  if (s.speech && typeof s.speech === 'object') {
    const sp = { ...(cur.speech || {}) };
    for (const k of ['enabled', 'intel', 'local', 'spike', 'abyss', 'route']) if (typeof s.speech[k] === 'boolean') sp[k] = s.speech[k];
    if (typeof s.speech.voice === 'string') sp.voice = s.speech.voice.slice(0, 200);
    if (s.speech.rate !== undefined) sp.rate = Math.max(0.6, Math.min(1.8, Number(s.speech.rate) || 1));
    if (s.speech.volume !== undefined) sp.volume = Math.max(0.1, Math.min(1, Number(s.speech.volume) || 1));
    next.speech = sp;
  }
  if (typeof s.minimizeToTray === 'boolean') next.minimizeToTray = s.minimizeToTray;
  if (typeof s.onboardingDone === 'boolean') next.onboardingDone = s.onboardingDone;
  if (typeof s.usedSearch === 'boolean') next.usedSearch = s.usedSearch;
  if (typeof s.notifyIndustry === 'boolean') next.notifyIndustry = s.notifyIndustry;
  if (typeof s.notifyPlanets === 'boolean') next.notifyPlanets = s.notifyPlanets;
  if (s.incursionJumps !== undefined) next.incursionJumps = Math.max(1, Math.min(30, Math.round(Number(s.incursionJumps) || 10)));
  if (s.alerts && typeof s.alerts === 'object') next.alerts = { ...(cur.alerts || {}), ...Object.fromEntries(Object.entries(s.alerts).filter(([, v]) => typeof v === 'boolean')) };
  if (typeof s.updateUrl === 'string') { const u = s.updateUrl.trim(); if (u && !/^https:\/\//.test(u)) throw new Error('The update feed must be an https:// address.'); next.updateUrl = u; }
  if (typeof s.theme === 'string' && /^[a-z0-9-]{1,32}$/.test(s.theme)) next.theme = s.theme;
  if (typeof s.themeAccent === 'string' && (s.themeAccent === '' || /^#[0-9a-fA-F]{6}$/.test(s.themeAccent))) next.themeAccent = s.themeAccent;
  if (typeof s.themeBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.themeBg)) { next.themeBg = s.themeBg; if (win && !win.isDestroyed()) win.setBackgroundColor(s.themeBg); }
  if (s.themeAuto && typeof s.themeAuto === 'object') {
    const a = {};
    if (typeof s.themeAuto.enabled === 'boolean') a.enabled = s.themeAuto.enabled;
    for (const k of ['hs', 'ls', 'ns', 'wh', 'pochven']) if (typeof s.themeAuto[k] === 'string' && /^[a-z0-9-]{1,32}$/.test(s.themeAuto[k])) a[k] = s.themeAuto[k];
    next.themeAuto = { ...(cur.themeAuto || {}), ...a };
  }
  if (s.zoom !== undefined) { const z = Number(s.zoom); if ([0.9, 1, 1.1, 1.25].includes(z)) { next.zoom = z; if (win && !win.isDestroyed()) win.webContents.setZoomFactor(z); } }
  if (s.refreshMinutes !== undefined) next.refreshMinutes = Math.max(5, Math.min(240, Number(s.refreshMinutes) || 15));
  store.get().settings = next;
  store.save();
  schedulePolling();
  return next;
});

handle('characters:list', () => publicCharacters());
handle('characters:add', async (corp = false) => {
  const s = store.get().settings;
  const { tokens, info } = await auth.login({ clientId: s.clientId, port: s.callbackPort, corp: !!corp, ui: !!s.uiScopes });
  store.upsertCharacter(info.id, info.name, info.scopes, tokens.refresh_token);
  showWindow();
  return publicCharacters();
});
handle('characters:remove', id => { store.removeCharacter(id); return publicCharacters(); });
handle('characters:reorder', ids => {
  const d = store.get();
  d.characters.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  store.save();
  return publicCharacters();
});

handle('esi:status', () => esi.serverStatus());
handle('esi:overview', id => esi.overview(id));
handle('esi:skillqueue', id => esi.skillQueue(id));
handle('esi:skills', id => esi.skills(id));
handle('esi:wallet', id => esi.wallet(id));
handle('esi:mail', id => esi.mailList(id));
handle('esi:mailBody', (id, mailId) => esi.mailBody(id, mailId));
handle('esi:contracts', id => esi.contracts(id));
handle('esi:clones', id => esi.clones(id));
handle('esi:industry', id => esi.industry(id));
handle('esi:orders', id => esi.orders(id));
handle('esi:assets', id => esi.assets(id));
handle('esi:training', id => extra.training(id));
handle('esi:industryFull', id => extra.industryFull(id));
handle('esi:blueprints', id => extra.blueprints(id));
handle('esi:planets', id => extra.planets(id));
handle('esi:mining', id => extra.mining(id));
handle('esi:research', id => extra.research(id));
handle('esi:loyalty', id => extra.loyalty(id));
handle('esi:ordersFull', id => extra.ordersFull(id));
handle('esi:contractItems', (id, cid) => extra.contractItems(id, cid));
handle('esi:notifications', id => extra.notifications(id));
handle('esi:calendar', id => extra.calendar(id));
handle('esi:corporation', id => extra.corporation(id));
handle('esi:standings', id => extra.standings(id));
handle('esi:contacts', id => extra.contacts(id));
handle('esi:medals', id => extra.medals(id));
handle('esi:fatigue', id => extra.fatigue(id));
handle('esi:killmails', id => extra.killmails(id));
handle('esi:fittings', id => extra.fittings(id));
handle('esi:clearCache', () => { esi.clearCaches(); return true; });
handle('shell:open', url => {
  const uu = store.get().settings.updateUrl;
  if (updateInfo && url === updateInfo.url) return shell.openExternal(url);
  if (uu && url.startsWith(new URL(uu).origin + '/')) return shell.openExternal(url);
  if (!/^https:\/\/(developers\.eveonline\.com|www\.eveonline\.com|support\.eveonline\.com|evewho\.com|zkillboard\.com|discord\.com|support\.discord\.com)\//.test(url)) throw new Error('Blocked link');
  return shell.openExternal(url);
});


// ================= Game data (SDE) =================

sde.setListener(st => { if (win && !win.isDestroyed()) win.webContents.send('sde:status', st); });
handle('sde:info', () => sde.info());
handle('sde:update', force => sde.update({ force: !!force }));
handle('sde:import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Import CCP static data zip (JSONL)', filters: [{ name: 'SDE zip', extensions: ['zip'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return sde.importZip(r.filePaths[0]);
});
handle('sde:search', (q, opts) => sde.search(q, opts || {}));
handle('sde:type', id => sde.type(id));
handle('sde:wormholeTypes', () => sde.wormholeTypes());

// ================= Market =================

handle('market:hubs', () => market.HUBS);
handle('market:prices', (ids, hub) => market.prices(ids, hub));
handle('market:book', async (id, hub) => { const b = await market.book(id, hub); const { raw, ...rest } = b; return rest; });
handle('market:history', (id, hub) => market.history(id, hub));
handle('clipboard:write', text => { clipwatch.ignoreText(String(text)); clipboard.writeText(String(text)); return true; });

// ================= Skill planner =================

async function haveMap(charId) { return (await skillplan.charState(charId)).levels; }
handle('plan:list', charId => skillplan.plans(charId));
handle('plan:save', plan => skillplan.savePlan(plan));
handle('plan:delete', id => skillplan.deletePlan(id));
handle('plan:compute', plan => skillplan.compute(plan));
handle('plan:remap', plan => skillplan.optimiseRemap(plan));
handle('plan:addSkill', async (plan, skillId, level) => { skillplan.addToEntries(plan.entries, skillId, level, await haveMap(plan.charId)); return skillplan.savePlan(plan); });
handle('plan:addType', async (plan, typeId) => { skillplan.addTypeRequirements(plan.entries, typeId, await haveMap(plan.charId)); return skillplan.savePlan(plan); });
handle('plan:import', async (plan, text) => {
  const { entries, unknown } = skillplan.parseText(text);
  const have = await haveMap(plan.charId);
  for (const e of entries) skillplan.addToEntries(plan.entries, e.skillId, e.level, have);
  return { plan: skillplan.savePlan(plan), unknown };
});
handle('plan:export', plan => { const t = skillplan.exportText(plan.entries); clipboard.writeText(t); return t; });
handle('plan:skills', () => sde.skillsByGroup());
handle('canfly', typeId => skillplan.canFly(typeId, store.get().characters.filter(c => !c.needsReauth).map(c => c.id), workspace.get().audits));

// ================= Industry & trading tools =================

handle('ind:calc', o => industry.calculate(o));
handle('ind:invent', o => industry.invention(o));
handle('ind:reprocess', (text, o) => industry.reprocess(appraise.parseItems(text).items, o));
handle('ind:structures', () => ({ structures: industry.STRUCTURES, decryptors: industry.DECRYPTORS }));
handle('ind:pilotSkills', async charId => {
  const s = await esi.get(`/characters/${charId}/skills/`, charId);
  const lv = new Map(s.skills.map(k => [k.skill_id, k.active_skill_level]));
  const by = n => lv.get(sde.typeIdByName(n)) || 0;
  return { industry: by('Industry'), advancedIndustry: by('Advanced Industry'), reactions: by('Reactions'), reprocessing: by('Reprocessing'), efficiency: by('Reprocessing Efficiency'),
    scrapmetal: by('Scrapmetal Processing'), levels: Object.fromEntries(lv) };
});
handle('appraise', (text, hub) => appraise.appraise(text, hub, store.get().priceOverrides || {}));
handle('appraise:setPrice', (typeId, price) => {
  const d = store.get(); d.priceOverrides = d.priceOverrides || {};
  const id = Number(typeId), v = Number(price);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Bad item');
  if (v > 0 && v < 1e15) d.priceOverrides[id] = v; else delete d.priceOverrides[id];
  store.save(); return true;
});
handle('trade:lp', (corpId, hub) => tradetools.lpStore(corpId, hub));
handle('trade:arbitrage', (names, from, to, tax) => tradetools.arbitrage(names, from, to, tax));
handle('trade:watchlist', () => tradetools.WATCHLIST);
handle('trade:myOrders', () => tradetools.myOrders());

// ================= Navigation =================

handle('nav:systemId', name => sde.systemIdByName(name));
handle('nav:route', (a, b, o) => nav.route(a, b, o));
handle('couriers:find', o => couriers.find(o || {}));
handle('map:region', (id, o) => livemap.region(id, o || {}));
handle('hunt:find', o => hunting.find(o || {}));
handle('wh:residents', q => whresidents.check(q));
handle('diag:report', () => diag.report({ store, sde }));
handle('diag:copy', () => { clipboard.writeText(diag.report({ store, sde })); return true; });
handle('diag:openFolder', () => shell.openPath(path.dirname(diag.logFile())));
let rendererLogs = 0;
handle('diag:log', (level, msg) => { if (rendererLogs++ < 200) diag.log(level === 'error' ? 'error' : 'warn', 'renderer', String(msg).slice(0, 1500)); return true; });
handle('shame:wall', o => shame.wall(o || {}, (i, n, what) => sendWin('shame:progress', { i, n, what })));
handle('overlay:toggle', () => overlay.toggle());
handle('overlay:cfg', () => ({ ...overlay.cfg(), open: overlay.isOpen() }));
handle('overlay:lock', v => overlay.setLocked(v));
handle('overlay:opacity', v => overlay.setOpacity(v));
handle('overlay:setRoute', r => overlay.setRoute(r && Array.isArray(r.path) ? { path: r.path.slice(0, 120).map(p => ({ id: Number(p.id), name: String(p.name), security: Number(p.security), kills: Number(p.kills) || 0, via: p.via || null, hazard: p.hazard || null })), from: String(r.from || ''), to: String(r.to || ''), at: new Date().toISOString() } : null));
handle('overlay:getRoute', () => overlay.getRoute());
handle('overlay:stats', async ids => { const st = await livemap.liveStats(false); return Object.fromEntries((Array.isArray(ids) ? ids : []).slice(0, 200).map(Number).map(id => [id, { ...(st.kills.get(id) || { ship: 0, pod: 0, npc: 0 }), jumps: st.jumps.get(id) || 0 }])); });
handle('pve:ratting', (ids, days) => pve.ratting((Array.isArray(ids) && ids.length ? ids : store.get().characters.filter(c => !c.needsReauth).map(c => c.id)).map(Number), Math.max(1, Math.min(30, Number(days) || 14))));
handle('pve:abyss', () => pve.summary(market.prices));
handle('pve:abyssCfg', p => pve.saveCfg(p || {}));
handle('pve:abyssLoot', (id, text) => pve.setLoot(String(id), String(text || ''), appraise.appraise, market.prices));
handle('pve:abyssUpdate', (id, patch) => pve.update(String(id), patch || {}));
handle('pve:abyssAdd', p => pve.addManual(p || {}));
handle('pve:abyssRemove', id => pve.remove(String(id)));
handle('hunt:deep', (id, h) => hunting.deepCheck(id, h));
handle('bridges:list', () => bridges.list());
handle('bridges:parse', text => bridges.parse(String(text || '')));
handle('bridges:save', (list, mode) => bridges.save(Array.isArray(list) ? list : [], mode === 'add' ? 'add' : 'replace'));
handle('couriers:regions', () => couriers.regions());
handle('nav:routeCheck', (path, o) => routewatch.checkRoute(Array.isArray(path) ? path.map(p => ({ id: Number(p.id), kills: Number(p.kills) || 0 })) : [], o || {}));
handle('nav:jump', (a, b, o) => nav.jumpPlan(a, b, o));
handle('nav:range', (n, ly) => nav.systemsInRange(n, ly));
handle('nav:universe', () => nav.universe());
handle('nav:ships', () => Object.keys(nav.SHIPS));
handle('nav:pilotLocations', async () => {
  const out = [];
  for (const c of store.get().characters.filter(x => !x.needsReauth)) {
    const r = await esi.get(`/characters/${c.id}/location/`, c.id).catch(() => null);
    if (r) { const sy = sde.ready() ? sde.system(r.solar_system_id) : null; out.push({ id: c.id, name: c.name, systemId: r.solar_system_id, system: sy ? sy.name : null, security: sy ? sy.security : null, whClass: sy ? sy.whClass : null, region: sy ? sy.region : null, regionId: sy ? sy.regionId : null }); }
  }
  return out;
});

// ================= Intel =================

intel.setListener((ch, data) => {
  if (win && !win.isDestroyed()) win.webContents.send(ch, data);
  overlay.send(ch, data);
  const canNotify = intel.cfg().notify && Notification.isSupported();
  if (ch === 'intel:report' && data.alert && canNotify) {
    const t = data.top;
    const threat = t ? ` · ${t.name}: ${(t.zoneScore || t).level} threat${t.flags && t.flags[0] ? ', ' + t.flags[0].label.toLowerCase() : ''}` : '';
    notify(`Intel: ${data.closest.name} (${data.closest.near.jumps} jump${data.closest.near.jumps === 1 ? '' : 's'} from ${data.closest.near.pilot})${threat}`, `${data.who}: ${data.text}`.slice(0, 200), 'intel');
  }
  if (ch === 'intel:local' && data.alert && canNotify) {
    const f = data.pilot.flags && data.pilot.flags.length ? ` (${data.pilot.flags.slice(0, 2).map(x => x.label.toLowerCase()).join(', ')})` : '';
    notify(`${data.level} threat in Local${data.system ? ' ' + data.system : ''}`, `${data.pilot.name}${f} is in Local with ${data.listener || 'your pilot'}.`, 'intel');
  }
  if (ch === 'intel:spike' && canNotify) {
    const hs = data.zone === 'hs';
    notify(hs ? `Possible ganking in ${data.system}` : `Kill spike in ${data.system}`,
      `${data.shipKills} ships destroyed there in the last hour, ${data.near.jumps} jump${data.near.jumps === 1 ? '' : 's'} from ${data.near.pilot}.${hs ? ' Watch for gank fleets on gates and undocks.' : ''}`, 'intel');
  }
});
handle('intel:config', () => ({ ...intel.cfg(), root: intel.logsRoot(), channelsSeen: intel.channelsSeen() }));
handle('intel:setConfig', c => {
  const cur = store.get().settings.intel || {};
  const next = { ...cur };
  if (Array.isArray(c.channels)) next.channels = c.channels.map(String).slice(0, 20);
  for (const k of ['enabled', 'sound', 'notify', 'combat', 'grade', 'spike', 'clipboard']) if (typeof c[k] === 'boolean') next[k] = c[k];
  if (['off', 'Moderate', 'High', 'Extreme'].includes(c.localThreat)) next.localThreat = c.localThreat;
  if (c.spikeJumps !== undefined) next.spikeJumps = Math.max(0, Math.min(6, Number(c.spikeJumps) || 2));
  if (c.spikeHs !== undefined) next.spikeHs = Math.max(1, Math.min(50, Number(c.spikeHs) || 3));
  if (c.spikeLow !== undefined) next.spikeLow = Math.max(1, Math.min(100, Number(c.spikeLow) || 5));
  if (c.jumps !== undefined) next.jumps = Math.max(0, Math.min(20, Number(c.jumps) || 5));
  if (typeof c.folder === 'string') next.folder = c.folder.trim();
  store.get().settings.intel = next; store.save();
  intel.restartIfEnabled();
  syncClipwatch();
  return { ...intel.cfg(), root: intel.logsRoot(), channelsSeen: intel.channelsSeen() };
});
handle('intel:pickFolder', async () => { const r = await dialog.showOpenDialog(win, { title: 'EVE logs folder (contains Chatlogs and Gamelogs)', properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
handle('intel:reports', () => ({ reports: intel.reports(), pilots: intel.positions(), spikes: intel.spikes(), local: intel.localEvents() }));
handle('intel:checkSpikes', async () => { await intel.checkSpikes(); return intel.spikes(); });

// ================= Pilot intel =================
handle('pilot:profile', (q, opts) => pilotintel.profile(q, opts || {}));
handle('pilot:quickMany', pilots => pilotintel.quickMany(Array.isArray(pilots) ? pilots : [], (i, n) => { if (win && !win.isDestroyed()) win.webContents.send('pilot:progress', { i, n }); }));
handle('pilot:watch', (id, name, tag, note) => {
  if (!Number.isInteger(Number(id))) throw new Error('Bad pilot id');
  if (tag && !['hostile', 'ganker', 'friendly', 'note'].includes(tag)) throw new Error('Bad tag');
  return pilotintel.setWatch(Number(id), String(name || ''), tag || null, note);
});
handle('pilot:watchlist', () => pilotintel.watch());
handle('pilot:recent', () => pilotintel.recent());
handle('pilot:vet', (q, directorId) => pilotintel.vet(q, { directorId }));

// ================= Clipboard watcher (Local / d-scan) =================
const sendWin = (ch, d) => { if (win && !win.isDestroyed()) win.webContents.send(ch, d); };
const away = () => !win || win.isDestroyed() || !win.isFocused();
async function onClip(kind, text) {
  if (kind === 'dscan') {
    if (!sde.ready()) return;
    const d = intel.analyseDscan(text);
    if (!d.total) return;
    sendWin('clip:dscan', { text, data: d });
    if (away() && intel.cfg().notify) {
      const top = (d.types || []).filter(t => t.category === 'Ship').slice(0, 3).map(t => `${t.count}× ${t.type}`).join(', ');
      notify(`D-scan: ${d.ships} ship${d.ships === 1 ? '' : 's'}${d.onGridShips ? `, ${d.onGridShips} on grid` : ''}`, top || `${d.total} objects`, 'intel');
    }
    return;
  }
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const d = await intel.analyseLocal(text);
  if (d.total < Math.max(2, Math.ceil(lines.length * 0.6))) return; // probably not a Local list
  sendWin('clip:local', { text, data: d, grades: null });
  const list = d.pilots.filter(p => !p.mine && !(p.standing > 0)).map(p => ({ id: p.id, name: p.name }));
  const grades = intel.cfg().grade === false ? {} : await pilotintel.quickMany(list.slice(0, 50), (i, n) => sendWin('pilot:progress', { i, n }));
  sendWin('clip:local', { text, data: d, grades });
  const vals = Object.values(grades);
  const bad = vals.filter(g => g.level === 'Extreme' || g.level === 'High');
  const gankers = vals.filter(g => g.flags.some(f => f.id === 'ganker')).length;
  const drops = vals.filter(g => g.flags.some(f => ['hotdrop', 'cyno', 'blops'].includes(f.id))).length;
  if (away() && intel.cfg().notify && (d.hostiles || bad.length || gankers || drops)) {
    notify(`Local: ${d.total} pilots, ${d.hostiles} red${bad.length ? `, ${bad.length} high threat` : ''}`,
      [bad.slice(0, 3).map(g => `${g.name} (${g.level})`).join(', '), gankers ? `${gankers} ganker${gankers > 1 ? 's' : ''}` : '', drops ? `${drops} hotdrop/cyno` : ''].filter(Boolean).join(' · '), 'intel');
  }
}
function syncClipwatch() { if (intel.cfg().clipboard) { if (!clipwatch.running()) clipwatch.start(onClip); } else clipwatch.stop(); }

// ================= In-game control (ESI UI) =================
function uiPilot(id, scope) {
  const c = store.get().characters.find(x => x.id === Number(id));
  if (!c) throw new Error('Unknown pilot.');
  if (!(c.scopes || []).includes(scope)) throw new Error(`${c.name} hasn't allowed in-game control. Turn it on under Settings → In-game control, then re-authorise ${c.name}.`);
  return c;
}
handle('ui:pilots', async () => {
  const out = [];
  for (const c of store.get().characters.filter(x => !x.needsReauth)) {
    const scopes = c.scopes || [];
    const r = await esi.get(`/characters/${c.id}/online/`, c.id).catch(() => null);
    out.push({ id: c.id, name: c.name, online: !!(r && r.online), canWaypoint: scopes.includes('esi-ui.write_waypoint.v1'), canOpenWindow: scopes.includes('esi-ui.open_window.v1') });
  }
  return out.sort((a, b) => (b.online - a.online) || (b.canWaypoint - a.canWaypoint));
});
handle('ui:waypoints', async (charId, systemIds) => {
  const c = uiPilot(charId, 'esi-ui.write_waypoint.v1');
  const ids = (Array.isArray(systemIds) ? systemIds : []).map(Number).filter(Number.isInteger).slice(0, 60);
  if (!ids.length) throw new Error('No systems to send.');
  for (let i = 0; i < ids.length; i++) {
    await esi.rawRequest(`/ui/autopilot/waypoint/?add_to_beginning=false&clear_other_waypoints=${i === 0}&destination_id=${ids[i]}`, { charId: c.id, method: 'POST' });
  }
  return { sent: ids.length, pilot: c.name };
});
handle('ui:open', async (charId, kind, id) => {
  const c = uiPilot(charId, 'esi-ui.open_window.v1');
  const n = Number(id);
  if (!Number.isInteger(n)) throw new Error('Bad id');
  const path = { contract: `/ui/openwindow/contract/?contract_id=${n}`, info: `/ui/openwindow/information/?target_id=${n}`, market: `/ui/openwindow/marketdetails/?type_id=${n}` }[kind];
  if (!path) throw new Error('Unknown window');
  await esi.rawRequest(path, { charId: c.id, method: 'POST' });
  return { pilot: c.name };
});
handle('ui:mail', async (charId, recipientId, subject, body) => {
  const c = uiPilot(charId, 'esi-ui.open_window.v1');
  await esi.rawRequest('/ui/openwindow/newmail/', { charId: c.id, method: 'POST', body: { recipients: [Number(recipientId)], subject: String(subject || '').slice(0, 1000), body: String(body || '').slice(0, 10000) } });
  return { pilot: c.name };
});

// ================= Phone alerts =================
handle('phone:get', () => ({ ...phone.cfg(), categoryLabels: phone.CATEGORIES }));
handle('phone:save', c => phone.save(c || {}));
handle('phone:test', c => phone.test(c || {}));
handle('intel:local', text => intel.analyseLocal(text));
handle('intel:zkill', ids => intel.zkillStats(ids));
handle('intel:dscan', text => intel.analyseDscan(text));
handle('intel:resetCombat', () => intel.resetCombat());

// ================= Corp extras: moon tax, buyback, alts, sync =================

handle('corp:moonTax', (id, from, to, rate) => corp.moonTax(id, from, to, rate));
handle('corp:checkInvoices', async (id, division) => {
  const w = workspace.get();
  const updated = await corp.checkInvoicePayments(id, w.invoices.filter(i => i.status !== 'paid'), division);
  let paid = 0;
  for (const u of updated) { if (u.status === 'paid') paid++; workspace.upsert('invoices', u); }
  return { checked: updated.length, paid };
});
async function buybackQuote(text) {
  const r = workspace.get().buybackRules;
  const a = await appraise.appraise(text, 'Jita');
  let total = 0;
  const rows = a.rows.map(x => {
    const pctv = r.categories[x.category] ?? r.percent;
    const offer = (x.unitBuy || 0) * x.qty * pctv / 100;
    total += offer;
    return { ...x, percent: pctv, offer };
  });
  return { rows, unknown: a.unknown, total, jitaBuy: a.totals.buy, jitaSell: a.totals.sell, volume: a.totals.volume };
}
handle('buyback:quote', text => buybackQuote(text));
handle('buyback:rules', () => workspace.get().buybackRules);
handle('buyback:setRules', r => workspace.setBuybackRules(r));
handle('buyback:contracts', async id => {
  const list = await corp.buybackContracts(id);
  const out = [];
  for (const c of list) {
    const text = c.items.map(i => `${(sde.type(i.typeId) || {}).name}\t${i.qty}`).join('\n');
    const q = c.items.length ? await buybackQuote(text) : { total: 0, rows: [] };
    out.push({ ...c, quote: q.total, verdict: !c.items.length ? 'empty' : c.price <= q.total * 1.005 ? 'ok' : 'over', diff: c.price - q.total });
  }
  return out;
});
handle('ws:setAlt', (charId, mainId) => workspace.setAlt(charId, mainId));
handle('ws:sync', () => workspace.get().sync);
handle('ws:setSyncFolder', async pick => {
  let folder = '';
  if (pick) { const r = await dialog.showOpenDialog(win, { title: 'Shared folder (OneDrive, Dropbox, Google Drive or network share)', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled) return workspace.get().sync; folder = r.filePaths[0]; }
  return workspace.setSyncFolder(folder);
});
handle('ws:syncNow', () => { const n = workspace.pullSync(); workspace.writeSyncFile(); return { merged: n, sync: workspace.get().sync }; });
setInterval(() => { try { if (workspace.get().sync.folder && workspace.pullSync() > 0 && win && !win.isDestroyed()) win.webContents.send('ws:synced', true); } catch {} }, 60000);

// ================= Finance =================

handle('fin:snapshot', () => finance.snapshot(true));
handle('fin:history', () => finance.history());
handle('fin:income', (ids, days) => finance.income(ids && ids.length ? ids : store.get().characters.filter(c => !c.needsReauth).map(c => c.id), days || 30));
setTimeout(() => finance.snapshot(false).catch(() => {}), 60000);
setInterval(() => finance.snapshot(false).catch(() => {}), 6 * 3600000);
// Daily reset, monthly track, EVE news and Tranquility status.
setInterval(() => { if (app.isReady() && store.get().settings.notifications) daily.tick(notify).catch(() => {}); }, 60000);
setInterval(() => { if (app.isReady()) { try { timers.tick(notify); } catch {} } }, 60000);
handle('wh:info', q => whinfo.info(q));
handle('trade:report', o => trade.report(o || {}));
handle('items:search', q => items.search(String(q || '')));
handle('items:info', id => items.info(Number(id)));
handle('charvalue', () => charvalue.value());
handle('bargains:scan', o => bargains.scan(o || {}));
handle('pi:nearby', o => planets.nearby(o || {}));
handle('moon:value', (text, o) => moonscan.value(String(text || ''), o || {}));
// Keep the trade ledger growing past ESI's 30 days even when the page isn't opened.
setInterval(() => { const d = store.get(); if (app.isReady() && d.settings.clientId && d.characters.length) trade.sync(d.characters.filter(c => !c.needsReauth).map(c => c.id)).catch(() => {}); }, 6 * 3600000);
handle('farm:calc', () => farm.farm());
handle('farm:save', c => farm.saveFarm(c || {}));
handle('farm:insurance', names => farm.insurance(Array.isArray(names) ? names : []));
handle('daily:status', () => daily.status());
handle('daily:done', (charId, done) => daily.setDone(charId, !!done));
handle('daily:allDone', done => daily.setAllDone(!!done));
handle('daily:track', (charId, on) => daily.setTrack(charId, !!on));
handle('daily:save', cfg => daily.save(cfg || {}));
handle('daily:news', async () => { await daily.fetchNews(true); return daily.status(); });

// ================= Doctrines =================

handle('doc:parseEft', text => doctrines.parseEft(text));
handle('doc:evaluate', (doctrine, hub) => doctrines.evaluate(doctrine, store.get().characters.filter(c => !c.needsReauth).map(c => c.id), workspace.get().audits, hub));

// ================= Wormhole mapper =================

wormhole.setListener((kind, data) => {
  if (win && !win.isDestroyed()) win.webContents.send('wh:event', { kind, data });
  if (kind === 'jump' && data.mapped && !data.gate && Notification.isSupported() && store.get().settings.notifications && !(win && win.isFocused())) {
    notify('New connection mapped', `${data.charName}: ${data.fromName} → ${data.toName}`, 'wormhole');
  }
});
handle('wh:maps', () => workspace.get().maps);
handle('wh:op', (mapId, o) => wormhole.op(mapId, o));
handle('wh:system', id => wormhole.systemInfo(id));
handle('wh:activity', async ids => {
  const a = await wormhole.activity();
  const out = {};
  for (const id of ids) out[id] = { kills: a.kills[id] || null, jumps: a.jumps[id] ?? null };
  return out;
});
handle('wh:routes', id => wormhole.hubRoutes(id));
handle('wh:track', (mapId, pilots) => wormhole.startTracking(mapId, pilots));
handle('wh:untrack', () => wormhole.stopTracking());
handle('wh:status', async () => {
  const st = wormhole.status();
  const ids = Object.values(st.ships).filter(Boolean);
  const names = ids.length ? await esi.resolveNames(ids) : {};
  return { ...st, shipNames: Object.fromEntries(Object.entries(st.ships).map(([c, t]) => [c, names[t] || null])) };
});

// ================= PI planner =================

handle('pi:types', async names => {
  const [ids, prices] = await Promise.all([esi.typeIdsByName(names), esi.marketPrices()]);
  const out = {};
  for (const n of names) out[n] = { id: ids[n], price: ids[n] ? (prices.get(ids[n]) || 0) : 0 };
  return out;
});
handle('pi:capacity', async () => {
  const out = [];
  for (const c of store.get().characters.filter(x => !x.needsReauth)) {
    try {
      const s = await esi.get(`/characters/${c.id}/skills/`, c.id);
      const lv = id => ((s.skills.find(k => k.skill_id === id) || {}).active_skill_level) || 0;
      out.push({ id: c.id, name: c.name, maxPlanets: 1 + lv(2495), ccu: lv(2505), planetology: lv(2406), advPlanetology: lv(2403), remote: lv(13279) });
    } catch (e) { out.push({ id: c.id, name: c.name, error: e.message }); }
  }
  return out;
});
handle('pi:current', async () => {
  const out = { extracting: {}, producing: {}, colonies: 0, byPilot: [] };
  for (const c of store.get().characters.filter(x => !x.needsReauth)) {
    try {
      const r = await extra.planets(c.id);
      out.colonies += r.planets.length;
      out.byPilot.push({ id: c.id, name: c.name, colonies: r.planets.length, max: r.maxPlanets });
      for (const p of r.planets) {
        for (const e of p.extractors) if (e.product && !e.expired) out.extracting[e.product] = (out.extracting[e.product] || 0) + e.perHour;
        for (const f of p.factories) if (f.schematic && f.schematic !== 'Idle') out.producing[f.schematic] = (out.producing[f.schematic] || 0) + 1;
      }
    } catch { /* scope missing */ }
  }
  return out;
});
handle('pi:plans', () => store.get().piPlans || []);
handle('pi:savePlan', plan => {
  const d = store.get();
  d.piPlans = d.piPlans || [];
  if (!plan.id) plan.id = require('crypto').randomBytes(6).toString('hex');
  plan.savedAt = new Date().toISOString();
  const i = d.piPlans.findIndex(p => p.id === plan.id);
  if (i === -1) d.piPlans.push(plan); else d.piPlans[i] = plan;
  store.save();
  return d.piPlans;
});
handle('pi:deletePlan', id => { const d = store.get(); d.piPlans = (d.piPlans || []).filter(p => p.id !== id); store.save(); return d.piPlans; });

// Skills
handle('esi:skillInfo', async (charId, typeId) => {
  const info = await esi.skillInfo(typeId);
  const [names, skills] = await Promise.all([
    esi.resolveNames(info.requires.map(r => r.id), charId),
    esi.get(`/characters/${charId}/skills/`, charId).catch(() => ({ skills: [] }))
  ]);
  const lv = new Map(skills.skills.map(k => [k.skill_id, k.trained_skill_level]));
  const sp = new Map(skills.skills.map(k => [k.skill_id, k.skillpoints_in_skill]));
  return {
    ...info,
    trainedLevel: lv.get(typeId) || 0,
    spInSkill: sp.get(typeId) || 0,
    requires: info.requires.map(r => ({ ...r, name: names[r.id], trained: lv.get(r.id) || 0 }))
  };
});

// ================= Corp / alliance mode =================

const directors = () => store.get().characters.filter(c => !c.needsReauth && auth.CORP_SCOPES.some(s => (c.scopes || []).includes(s)));

handle('corp:directors', async () => {
  const out = [];
  for (const d of directors()) {
    const info = await corp.corpOf(d.id).catch(() => null);
    out.push({ id: d.id, name: d.name, corporationId: info ? info.corporationId : null, allianceId: info ? info.allianceId : null });
  }
  return out;
});
handle('corp:overview', id => corp.overview(id));
handle('corp:members', id => corp.members(id));
handle('corp:structures', id => corp.structures(id));
handle('corp:moons', id => corp.moons(id));
handle('corp:wallets', (id, div) => corp.wallets(id, div));
handle('corp:contracts', id => corp.contracts(id));
handle('corp:orders', id => corp.orders(id));
handle('corp:industry', id => corp.industry(id));
handle('corp:assets', id => corp.assets(id));
handle('corp:killmails', id => corp.killmails(id));
handle('corp:killmailByLink', (link, id) => corp.killmailByLink(link, id));
handle('corp:structureNotifications', id => corp.structureNotifications(id));
handle('corp:lookupCharacter', name => corp.lookupCharacter(name));

// Workspace
handle('ws:get', () => { const w = workspace.get(); return { ops: w.ops, timers: w.timers, fleets: w.fleets, srp: w.srp, hr: w.hr, doctrines: w.doctrines || [], invoices: w.invoices || [], alts: w.alts || {}, srpRules: w.srpRules, buybackRules: w.buybackRules, audits: w.audits, sync: w.sync, discord: workspace.discordPublic() }; });
handle('ws:upsert', async (collection, item, notify) => {
  const saved = workspace.upsert(collection, item);
  if (notify) await announce(collection, saved, notify).catch(e => { saved.__discordError = e.message; });
  return saved;
});
handle('ws:remove', (collection, id) => workspace.remove(collection, id));
handle('ws:setSrpRules', r => workspace.setSection('srpRules', r));
handle('ws:export', async () => {
  const r = await dialog.showSaveDialog(win, { title: 'Export corp workspace', defaultPath: `eve-toolkit-workspace-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'Workspace', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, JSON.stringify(workspace.exportData({ includeDiscord: true }), null, 2));
  return r.filePath;
});
handle('ws:import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Import corp workspace or audit files', properties: ['openFile', 'multiSelections'], filters: [{ name: 'EVE Toolkit files', extensions: ['json'] }] });
  if (r.canceled) return null;
  const results = [];
  for (const f of r.filePaths) {
    try {
      const obj = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (obj.format === 'eve-companion-audit') results.push({ file: f, kind: 'audit', ...workspace.importAudit(obj) });
      else results.push({ file: f, kind: 'workspace', counts: workspace.importData(obj) });
    } catch (e) { results.push({ file: f, error: e.message }); }
  }
  return results;
});
handle('ws:removeAudit', id => workspace.removeAudit(id));

// Member side: export my audit for corp leadership
handle('audit:export', async charId => {
  const data = await audit.build(charId);
  const safeName = String(data.character.name || charId).replace(/[^\w -]/g, '');
  const r = await dialog.showSaveDialog(win, { title: 'Export audit for your corp', defaultPath: `${safeName} - audit ${data.exportedAt.slice(0, 10)}.json`, filters: [{ name: 'Audit', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2));
  return r.filePath;
});

// Fleet tracker
fleetTracker.setListener(snap => { if (win && !win.isDestroyed()) win.webContents.send('fleet:update', snap); });
handle('fleet:status', () => fleetTracker.snapshot());
handle('fleet:check', fcId => corp.currentFleet(fcId));
handle('fleet:start', async opts => {
  const fc = store.get().characters.find(c => c.id === opts.fcId);
  const snap = fleetTracker.start({ ...opts, fcName: fc ? fc.name : '' });
  if (opts.ping) await discord.postWebhook('ops', { title: `Fleet forming: ${opts.name}`, description: opts.ping === true ? '' : String(opts.ping), fields: [{ name: 'FC', value: fc ? fc.name : '' }, { name: 'Doctrine', value: opts.doctrine }] }).catch(() => {});
  return snap;
});
handle('fleet:stop', () => fleetTracker.stop());

// Discord
handle('discord:set', patch => workspace.setDiscord(patch));
handle('discord:test', kind => discord.testWebhook(kind));
handle('discord:guild', () => discord.guildInfo());
handle('discord:link', (charId, userId) => workspace.linkDiscord(charId, userId));
handle('discord:sync', () => runRoleSync());

async function announce(collection, item, kind) {
  const fmt = d => d ? `<t:${Math.floor(Date.parse(d) / 1000)}:F> (<t:${Math.floor(Date.parse(d) / 1000)}:R>)` : '';
  if (collection === 'ops') return discord.postWebhook('ops', { title: `${item.importance === 'high' ? '🚨 ' : ''}Op: ${item.title}`, description: item.description, fields: [
    { name: 'Form-up', value: fmt(item.start) , inline: false }, { name: 'FC', value: item.fc }, { name: 'Doctrine', value: item.doctrine }, { name: 'Location', value: item.location }, { name: 'Type', value: item.type }] });
  if (collection === 'timers') return discord.postWebhook('timers', { title: `Timer: ${item.structure || item.type}`, fields: [
    { name: 'Exits', value: fmt(item.time), inline: false }, { name: 'System', value: item.system }, { name: 'Timer', value: item.timerType }, { name: 'Owner', value: item.owner }, { name: 'Objective', value: item.objective }], description: item.notes });
  if (collection === 'srp') return discord.postWebhook('srp', { title: `SRP ${item.status}: ${item.pilot} – ${item.ship}`, url: item.killmailId ? `https://zkillboard.com/kill/${item.killmailId}/` : undefined, fields: [
    { name: 'Payout', value: item.payout ? Math.round(item.payout).toLocaleString('en-AU') + ' ISK' : '' }, { name: 'Loss value', value: item.lossValue ? Math.round(item.lossValue).toLocaleString('en-AU') + ' ISK' : '' }, { name: 'Fleet', value: item.fleet }, { name: 'Notes', value: item.decisionNote, inline: false }] });
  if (collection === 'hr') return discord.postWebhook('hr', { title: `Application ${item.status}: ${item.name}`, url: `https://zkillboard.com/character/${item.characterId}/`, fields: [
    { name: 'Recruiter', value: item.recruiter }, { name: 'Corp history', value: item.corpCount ? item.corpCount + ' corporations' : '' }, { name: 'Audit', value: item.auditAttached ? 'Attached' : 'Not supplied' }] });
}

async function runRoleSync() {
  const memberships = new Map();
  for (const d of directors()) {
    const info = await corp.corpOf(d.id);
    const m = await corp.members(d.id);
    for (const p of m.list) {
      const cur = memberships.get(p.id) || { inCorp: false, inAlliance: false, titles: [] };
      cur.inCorp = true; cur.inAlliance = !!info.allianceId; cur.titles = cur.titles.concat(p.titles);
      memberships.set(p.id, cur);
    }
  }
  if (!memberships.size) throw new Error('No director pilots could read a member list.');
  return discord.syncRoles(memberships);
}

// Background: structure alerts, low fuel, op reminders, role sync
const startedAt = Date.now();
async function corpBackground() {
  const w = workspace.get();
  const d = w.discord;
  const once = key => { if (w.alerted[key]) return false; w.alerted[key] = Date.now(); workspace.save(); return true; };
  // prune old alert keys
  for (const [k, t] of Object.entries(w.alerted)) if (Date.now() - t > 30 * 86400000) delete w.alerted[k];
  for (const dir of directors()) {
    if (d.alertStructures) {
      try {
        const notes = await corp.structureNotifications(dir.id);
        for (const n of notes.filter(x => x.alert && Date.parse(x.timestamp) > startedAt - 3600000)) {
          if (!once('note:' + n.id)) continue;
          await discord.postWebhook('structures', { title: `⚠ ${n.typeLabel}`, fields: [{ name: 'System', value: n.system }, { name: 'Structure', value: n.structureType }, { name: 'Timer ends', value: n.timerEnd ? `<t:${Math.floor(Date.parse(n.timerEnd) / 1000)}:F>` : '' }], footer: `Seen by ${dir.name}` }).catch(() => {});
          if (Notification.isSupported() && store.get().settings.notifications) notify(dir.name, `${n.typeLabel}${n.system ? ' in ' + n.system : ''}`, 'structures');
        }
      } catch { /* missing scope or role */ }
      try {
        const st = await corp.structures(dir.id);
        for (const s of st.structures) {
          if (s.fuelDays !== null && s.fuelDays < d.fuelWarnDays && once(`fuel:${s.id}:${new Date().toISOString().slice(0, 10)}`)) {
            await discord.postWebhook('structures', { title: `⛽ Low fuel: ${s.name}`, color: 0xe8b64c, fields: [{ name: 'Remaining', value: `${s.fuelDays.toFixed(1)} days` }, { name: 'System', value: s.system }, { name: 'Runs out', value: `<t:${Math.floor(Date.parse(s.fuelExpires) / 1000)}:F>` }] }).catch(() => {});
          }
        }
      } catch { /* ignore */ }
    }
  }
  if (d.remindOps) {
    for (const op of w.ops) {
      const t = Date.parse(op.start) - Date.now();
      if (t > 0 && t < 30 * 60000 && once('opremind:' + op.id)) {
        await discord.postWebhook('ops', { title: `⏰ Forming in ${Math.round(t / 60000)} min: ${op.title}`, fields: [{ name: 'FC', value: op.fc }, { name: 'Doctrine', value: op.doctrine }, { name: 'Location', value: op.location }] }).catch(() => {});
        notify('Op starting soon', `${op.title} forms in ${Math.round(t / 60000)} minutes`, 'ops');
      }
    }
    for (const tm of w.timers) {
      const t = Date.parse(tm.time) - Date.now();
      if (t > 0 && t < 60 * 60000 && once('timerremind:' + tm.id)) {
        await discord.postWebhook('timers', { title: `⏰ Timer in ${Math.round(t / 60000)} min: ${tm.structure || tm.type}`, fields: [{ name: 'System', value: tm.system }, { name: 'Objective', value: tm.objective }] }).catch(() => {});
        notify('Timer soon', `${tm.structure || tm.type} in ${tm.system} exits in ${Math.round(t / 60000)} minutes`, 'ops');
      }
    }
  }
  if (d.syncEnabled && (!d.lastSync || Date.now() - Date.parse(d.lastSync) > 6 * 3600000)) {
    try { await runRoleSync(); } catch { /* shown in UI */ }
  }
}
setInterval(() => { if (app.isReady()) corpBackground().catch(() => {}); }, 5 * 60000);

// ---------- Lifecycle ----------

app.on('second-instance', (_e, _argv, _cwd, data) => {
  if (data && data.execPath && newerVersion(data.version, app.getVersion())) {
    // Hand over to the newer build
    quitting = true;
    try { store.saveNow(); workspace.saveNow(); } catch {}
    app.relaunch({ execPath: data.execPath, args: [] });
    app.exit(0);
    return;
  }
  showWindow();
});

app.whenReady().then(() => {
  diag.info('app', `start ${app.getVersion()} on ${process.platform} ${require('os').release()}`);
  store.load();
  workspace.load();
  sde.load();
  setTimeout(() => { intel.restartIfEnabled(); syncClipwatch(); }, 3000);
  overlay.registerShortcuts();
  setTimeout(() => overlay.restore(), 1500);
  pve.start((ch, run) => {
    sendWin(ch, run); overlay.send(ch, run);
    if (ch === 'abyss:end') notify(run.died ? 'Abyss run: ship lost' : `Abyss run finished: ${run.minutes} min`, run.died ? `${run.charName} came back in a capsule.` : `${run.charName}: paste your loot in EVE Toolkit (Finance → Ratting & Abyss) to value the run.`);
  });
  createWindow();
  createTray();
  schedulePolling();
  setTimeout(() => checkQueues(false), 15_000);
});

app.on('will-quit', () => overlay.unregister());
app.on('before-quit', () => { quitting = true; store.saveNow(); try { if (fleetTracker.snapshot()) fleetTracker.stop(); workspace.saveNow(); } catch {} });
app.on('window-all-closed', () => {
  if (!tray || !store.get().settings.minimizeToTray) app.quit();
});
