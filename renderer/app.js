window.addEventListener('error', e => { try { api.diag.log('error', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`); } catch {} });
window.addEventListener('unhandledrejection', e => { try { api.diag.log('error', 'Unhandled: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)); } catch {} });
'use strict';
/* global api */

// ================= Helpers =================

const $ = sel => document.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = s => new Raw(s);
// Tagged template: every interpolation is HTML-escaped unless wrapped in raw() or is an array of Raw.
function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      if (v instanceof Raw) out += v.s;
      else if (Array.isArray(v)) out += v.map(x => (x instanceof Raw ? x.s : esc(x))).join('');
      else if (v === null || v === undefined || v === false) out += '';
      else out += esc(v);
    }
  });
  return raw(out);
}

const IMG = 'https://images.evetech.net';
const portrait = (id, size = 128) => `${IMG}/characters/${id}/portrait?size=${size}`;
const typeIcon = (id, size = 32) => `${IMG}/types/${id}/icon?size=${size}`;
const typeRender = (id, size = 128) => `${IMG}/types/${id}/render?size=${size}`;

const nf0 = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = n => (n === null || n === undefined) ? '—' : nf0.format(n);
const fmtIsk = n => (n === null || n === undefined) ? '—' : nf2.format(n) + ' ISK';
function fmtCompact(n) {
  if (n === null || n === undefined) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + 't';
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'b';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'm';
  if (a >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return nf0.format(n);
}
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
const fmtDate = d => d ? new Date(d).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtDay = d => d ? new Date(d).toLocaleDateString('en-AU', { dateStyle: 'medium' }) : '—';
function fmtDuration(ms, short = false) {
  if (ms <= 0) return 'done';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const parts = [];
  if (d) parts.push(d + 'd');
  if (h || d) parts.push(h + 'h');
  parts.push(m + 'm');
  if (!short && !d) parts.push(sec + 's');
  return parts.join(' ');
}
const humanize = s => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const levelBoxes = (trained, training = 0) => raw('<span class="levels">' + [1, 2, 3, 4, 5].map(i =>
  `<i class="${i <= trained ? 'on' : (i === training ? 'train' : '')}"></i>`).join('') + '</span>');

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.className = ''; }, err ? 6000 : 3000);
}

const loadingView = (msg = 'Contacting ESI…') => html`<div class="loading"><div class="spinner"></div>${msg}</div>`;
function errorView(res) {
  let hint = '';
  if (res.status === 403) hint = 'This pilot may not have granted the scope this page needs. Re-add the pilot from the sidebar to grant all scopes.';
  else if (res.status === 401 || /refresh login/i.test(res.error)) hint = 'The login for this pilot has expired or been revoked. Use "Re-authorise" on the pilot\'s page.';
  else if (/fetch failed|ENOTFOUND|ECONN/i.test(res.error)) hint = 'Could not reach EVE servers. Check your internet connection.';
  return html`<div class="error"><b>Couldn't load this page.</b><br>${res.error}${hint ? raw('<br><span class="muted">' + esc(hint) + '</span>') : ''}</div>`;
}

// ================= State =================

const state = {
  view: 'dashboard',      // dashboard | char | settings
  charId: null,
  tab: 'summary',
  characters: [],
  settings: {},
  overviews: new Map(),
  mailSel: null,
  lastTab: {},
  lastCorpTab: {},
  lastToolsTab: {},
  toolsTab: 't-market',
  corpTab: 'c-overview',
  directorId: null,
  renderToken: 0
};

const GROUPS = [
  ['Character', [['summary', 'Summary'], ['corp', 'Corporation'], ['standings', 'Standings'], ['contacts', 'Contacts'], ['medals', 'Medals']]],
  ['Skills', [['queue', 'Skill Queue'], ['training', 'Training Stats'], ['skills', 'Skills'], ['plan', 'Skill Planner']]],
  ['Industry', [['industry', 'Jobs & Slots'], ['blueprints', 'Blueprints'], ['planets', 'Planets'], ['mining', 'Mining'], ['research', 'R&D Agents']]],
  ['Finance', [['wallet', 'Wallet'], ['orders', 'Market'], ['contracts', 'Contracts'], ['loyalty', 'Loyalty Points']]],
  ['Comms', [['mail', 'Mail'], ['notifications', 'Notifications'], ['calendar', 'Calendar']]],
  ['Assets', [['assets', 'Assets'], ['clones', 'Clones & Jumps'], ['fittings', 'Fittings']]],
  ['Combat', [['kills', 'Killmails']]]
];
const TABS = GROUPS.flatMap(g => g[1]);
const groupOf = tab => GROUPS.find(g => g[1].some(t => t[0] === tab)) || GROUPS[0];


const content = () => $('#content');
const setContent = h => { content().innerHTML = String(h); };

// ================= Sidebar =================

function renderSidebar() {
  document.querySelectorAll('.side-link').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));

  const list = $('#char-list');
  list.innerHTML = state.characters.map(c => {
    const o = state.overviews.get(c.id);
    let sub = 'Loading…';
    let warn = c.needsReauth;
    if (c.needsReauth) sub = '⚠ Needs re-authorising';
    else if (o) {
      if (!o.queueLength) { sub = 'Not training'; warn = true; }
      else if (o.paused) { sub = 'Queue paused'; warn = true; }
      else if (o.queueEnd) {
        const left = Date.parse(o.queueEnd) - Date.now();
        sub = `Queue: ${fmtDuration(left, true)}`;
        if (left < 86400000) warn = true;
      }
    }
    return String(html`<li class="char-item ${state.view === 'char' && state.charId === c.id ? 'active' : ''}" data-id="${c.id}">
      <img src="${portrait(c.id, 64)}" alt="">
      <div><div class="nm">${c.name}${c.isDirector ? raw(' <span class="badge accent" style="font-size:9.5px;padding:0 5px">DIR</span>') : ''}</div><div class="sub ${warn ? 'warn' : ''}">${sub}</div></div>
    </li>`);
  }).join('') || '<li class="dim" style="padding:8px 10px;font-size:12px">No pilots yet</li>';
}

function renderTopbar() {
  const tabs = $('#tabs');
  const sub = $('#subtabs');
  const crumb = $('#crumb');
  if (state.view === 'char') {
    const c = state.characters.find(x => x.id === state.charId);
    crumb.textContent = c ? c.name : ''; crumb.classList.add('pilot');
    const g = groupOf(state.tab);
    tabs.innerHTML = GROUPS.map(([name, items]) =>
      `<button class="tab ${g[0] === name ? 'active' : ''}" data-tab="${items[0][0]}" data-group="${name}">${name}</button>`).join('');
    sub.innerHTML = g[1].length > 1 ? g[1].map(([k, label]) =>
      `<button class="tab ${state.tab === k ? 'active' : ''}" data-tab="${k}">${label}</button>`).join('') : '';
  } else if (state.view === 'tools') {
    crumb.textContent = 'Tools'; crumb.classList.remove('pilot');
    const g = toolsGroupOf(state.toolsTab || 't-market');
    tabs.innerHTML = TOOLS_GROUPS.map(([name, items]) => `<button class="tab ${g[0] === name ? 'active' : ''}" data-ttab="${items[0][0]}" data-tgroup="${name}">${name}</button>`).join('');
    sub.innerHTML = g[1].length > 1 ? g[1].map(([k, label]) => `<button class="tab ${(state.toolsTab || 't-market') === k ? 'active' : ''}" data-ttab="${k}">${label}</button>`).join('') : '';
  } else if (state.view === 'corp') {
    const dirs = (corpState.directors || []);
    crumb.innerHTML = dirs.length > 1
      ? String(html`<select id="dir-pick" class="crumb-select">${dirs.map(d => html`<option value="${d.id}" ${raw(d.id === state.directorId ? 'selected' : '')}>Corp via ${d.name}</option>`)}</select>`)
      : esc(dirs[0] ? 'Corporation' : 'Corporation');
    const pick = $('#dir-pick');
    if (pick) pick.onchange = () => { state.directorId = Number(pick.value); render(); };
    const g = corpGroupOf(state.corpTab);
    tabs.innerHTML = CORP_GROUPS.map(([name, items]) =>
      `<button class="tab ${g[0] === name ? 'active' : ''}" data-ctab="${items[0][0]}" data-cgroup="${name}">${name}</button>`).join('');
    sub.innerHTML = g[1].length > 1 ? g[1].map(([k, label]) => `<button class="tab ${state.corpTab === k ? 'active' : ''}" data-ctab="${k}">${label}</button>`).join('') : '';
  } else if (state.view === 'piPlanner') {
    crumb.textContent = 'Planetary interaction'; crumb.classList.remove('pilot');
    tabs.innerHTML = '';
    sub.innerHTML = [['plan', 'Chain planner'], ['near', 'Nearby planets']].map(([k, l]) => `<button class="tab ${(state.piTab || 'plan') === k ? 'active' : ''}" data-pitab="${k}">${l}</button>`).join('');
  } else {
    crumb.classList.remove('pilot'); crumb.textContent = { mailAll: 'Mail, all pilots', wormholes: 'Wormhole mapper', liveMap: 'Live map', daily: 'Daily rewards and EVE news', piPlanner: 'Planetary interaction planner', corp: 'Corporation', settings: 'Settings', about: 'About & support', dashboard: 'All pilots', trainingAll: 'Training board', industryAll: 'Industry board', planetsAll: 'Planets board' }[state.view] || '';
    tabs.innerHTML = '';
    sub.innerHTML = '';
  }
  $('#refresh').style.visibility = ['settings', 'about'].includes(state.view) ? 'hidden' : 'visible';
}

// ================= Navigation =================

function go(view, opts = {}) {
  const prevChar = state.view === 'char' ? state.charId : null;
  state.view = view;
  if (opts.charId !== undefined) state.charId = opts.charId;
  if (view === 'char' && state.charId !== prevChar && state.settings && state.settings.themeAuto && state.settings.themeAuto.enabled) refreshTheme();
  if (opts.tab) state.tab = opts.tab;
  state.mailSel = null;
  renderSidebar();
  renderTopbar();
  render();
}

async function render(force = false) {
  const token = ++state.renderToken;
  const stillCurrent = () => token === state.renderToken;
  content().scrollTop = 0;
  if (force) await api.clearCache();
  try {
    if (state.view === 'settings') return renderSettings();
    if (state.view === 'about') return renderAbout();
    if (state.view === 'dashboard') return await renderDashboard(stillCurrent);
    if (state.view === 'trainingAll') return await renderTrainingAll(stillCurrent);
    if (state.view === 'industryAll') return await renderIndustryAll(stillCurrent);
    if (state.view === 'planetsAll') return await renderPlanetsAll(stillCurrent);
    if (state.view === 'mailAll') return await renderMailAll(stillCurrent);
    if (state.view === 'corp') return await renderCorp(stillCurrent);
    if (state.view === 'piPlanner') return state.piTab === 'near' ? await renderNearbyPlanets(stillCurrent) : await renderPiPlanner(stillCurrent);
    if (state.view === 'wormholes') return await renderWormholes(stillCurrent);
    if (state.view === 'liveMap') return await renderLiveMap(stillCurrent);
    if (state.view === 'daily') return await renderDaily(stillCurrent);
    if (state.view === 'tools') return await renderTools(stillCurrent);
    if (state.view === 'char') return await renderCharTab(stillCurrent);
  } catch (e) {
    if (stillCurrent()) setContent(errorView({ error: e.message }));
  }
}

// ================= Dashboard =================

async function renderDashboard(stillCurrent) {
  if (!state.settings.clientId) return renderWelcome();
  if (!state.characters.length) {
    setContent(html`<div class="empty"><h2>No pilots yet</h2>
      <p>Add an EVE character to see skill queues, wallets, mail and more.</p>
      <button class="btn btn-primary" data-action="add">+ Add pilot</button></div>`);
    return;
  }
  const cards = () => html`<div class="grid grid-cards">${state.characters.map(c => charCard(c))}</div>`;
  setContent(cards());
  await Promise.all(state.characters.filter(c => !c.needsReauth).map(async c => {
    const r = await api.overview(c.id);
    if (r.ok) state.overviews.set(c.id, r.data);
    if (stillCurrent()) { setContent(cards()); }
    renderSidebar();
  }));
  if (stillCurrent()) {
    const total = [...state.overviews.values()].reduce((a, o) => ({ sp: a.sp + (o.totalSp || 0), isk: a.isk + (o.wallet || 0) }), { sp: 0, isk: 0 });
    setContent(html`
      <div class="grid grid-3" style="margin-bottom:16px">
        <div class="stat"><div class="label">Pilots</div><div class="value">${state.characters.length}</div></div>
        <div class="stat"><div class="label">Combined skill points</div><div class="value">${fmtNum(total.sp)}</div></div>
        <div class="stat" data-private><div class="label">Combined wallets</div><div class="value">${fmtCompact(total.isk)} ISK</div><div class="hint">${fmtIsk(total.isk)}</div></div>
      </div>
      <div id="gs-slot"></div>
      ${cards()}`);
    const gs = await gettingStartedHtml();
    const slot = document.getElementById('gs-slot');
    if (slot && gs && stillCurrent()) { slot.innerHTML = String(gs); wireGettingStarted(); }
  }
}

function charCard(c) {
  const o = state.overviews.get(c.id);
  if (c.needsReauth) {
    return html`<div class="ccard" data-open="${c.id}"><div class="ccard-head"><img src="${portrait(c.id)}" alt="">
      <div><div class="nm">${c.name}</div><div class="corp gold">Login expired. Click to re-authorise.</div></div></div></div>`;
  }
  if (!o) {
    return html`<div class="ccard" data-open="${c.id}"><div class="ccard-head"><img src="${portrait(c.id)}" alt="">
      <div><div class="nm">${c.name}</div><div class="corp">Loading…</div></div></div></div>`;
  }
  return html`<div class="ccard" data-open="${c.id}">
    <div class="ccard-head">
      <img src="${portrait(c.id)}" alt="">
      <div style="min-width:0">
        <div class="nm">${o.name || c.name} ${o.online && o.online.online ? raw('<span class="badge green">Online</span>') : ''}</div>
        <div class="corp">${o.corporation || ''}${o.alliance ? raw(' &middot; ' + esc(o.alliance)) : ''}</div>
      </div>
    </div>
    <div class="ccard-body">
      <div><div class="k">Skill points</div><div class="num">${fmtNum(o.totalSp)}</div></div>
      <div><div class="k">Wallet</div><div class="num" data-private>${fmtCompact(o.wallet)} ISK</div></div>
      <div><div class="k">Location</div><div data-private>${o.system || '—'}</div></div>
      <div><div class="k">Ship</div><div>${o.ship ? o.ship.type : '—'}</div></div>
    </div>
    <div class="ccard-train">${trainingBlock(o)}</div>
  </div>`;
}

function trainingBlock(o) {
  if (!o.queueLength) return html`<div class="row"><span class="gold">Not training</span><span class="muted">Queue empty</span></div>`;
  if (o.paused) return html`<div class="row"><span class="gold">Queue paused</span><span class="muted">${o.training ? o.training.skill + ' ' + ROMAN[o.training.level] : ''}</span></div>`;
  const t = o.training;
  if (!t) return html`<div class="row muted">Queue finished</div>`;
  const start = Date.parse(t.start), end = Date.parse(t.finish);
  const spTotal = t.levelEndSp - t.levelStartSp;
  const spDone = (t.trainingStartSp - t.levelStartSp);
  const startFrac = spTotal > 0 ? spDone / spTotal : 0;
  const pct = Math.min(100, Math.max(0, (startFrac + (1 - startFrac) * ((Date.now() - start) / (end - start))) * 100));
  const qLeft = Date.parse(o.queueEnd) - Date.now();
  return html`<div class="row"><span><b>${t.skill} ${ROMAN[t.level]}</b></span><span class="num" data-countdown="${t.finish}">${fmtDuration(end - Date.now())}</span></div>
    <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    <div class="row" style="margin-top:6px"><span class="muted">${o.queueLength} in queue</span>
    <span class="${qLeft < 86400000 ? 'gold' : 'muted'}">Queue ends ${fmtDuration(qLeft, true)}</span></div>`;
}

// ================= Welcome / settings =================

function setupSteps(port) {
  return html`<ol class="steps">
    <li>Go to <a href="#" data-link="https://developers.eveonline.com/applications">developers.eveonline.com/applications</a> and sign in with your EVE account.</li>
    <li>Create a new application. Give it any name (for example <i>My EVE Toolkit</i>).</li>
    <li>Set the <b>Callback URL</b> to <code>http://localhost:${port}/callback</code></li>
    <li>Tick the scopes listed below (or all scopes for character data).</li>
    <li>Save, then copy the application's <b>Client ID</b> and paste it below. No secret key is needed.</li>
  </ol>`;
}

async function renderWelcome() {
  const info = await api.info();
  const scopes = info.ok ? info.data.scopes : [];
  setContent(html`
    <div style="max-width:760px">
      <div class="profile"><svg viewBox="0 0 32 32" style="width:64px;height:64px;color:var(--accent)"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".35"/><path d="M16 3a13 13 0 0 1 12.6 9.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="16" r="4.2" fill="currentColor"/></svg>
      <div><h1>Welcome, capsuleer</h1><div class="corp">One-time setup: connect EVE Toolkit to the EVE SSO.</div></div></div>
      <div class="panel"><h3>1 · Register your app with CCP</h3>${setupSteps(state.settings.callbackPort)}
        <div class="scopes">${scopes.filter(s => s !== 'publicData').map(s => html`<span class="badge">${s}</span>`)}</div>
      </div>
      <div class="panel"><h3>2 · Paste your Client ID</h3>
        <div class="field"><label for="w-client">Client ID</label><input id="w-client" type="text" placeholder="e.g. 3f1c0a9e2b7d4c51a8e6f0b2d9c4e7a1" spellcheck="false"></div>
        <button class="btn btn-primary" id="w-save">Save and add first pilot</button>
      </div>
    </div>`);
  $('#w-save').onclick = async () => {
    const id = $('#w-client').value.trim();
    if (!/^[0-9a-f]{32}$/i.test(id)) return toast('That does not look like an EVE Client ID (32 hex characters).', true);
    const r = await api.setSettings({ clientId: id });
    if (!r.ok) return toast(r.error, true);
    state.settings = r.data;
    addCharacter();
  };
}

const settingsOpen = (() => { try { return JSON.parse(localStorage.getItem('settingsOpen') || '{}'); } catch { return {}; } })();
function settingsFold(key, title, hint, body, forceOpen) {
  const open = forceOpen || settingsOpen[key];
  return html`<details class="sgroup sfold" data-sfold="${key}" ${raw(open ? 'open' : '')}><summary><span class="gname">${title}</span><span class="dim" style="font-size:12px">${hint}</span></summary><div class="sfold-body">${body}</div></details>`;
}
function setStreamer(on, save = true) {
  document.documentElement.toggleAttribute('data-streamer', !!on);
  const b = document.getElementById('streamer-btn'); if (b) b.classList.toggle('on', !!on);
  if (save) { state.settings.streamer = !!on; api.setSettings({ streamer: !!on }); toast(on ? 'Streamer mode on: names, wallets and locations are hidden' : 'Streamer mode off'); }
}
document.addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && (e.key === 'H' || e.key === 'h')) { e.preventDefault(); setStreamer(!document.documentElement.hasAttribute('data-streamer')); } });

function openSettingsSection(key) { const d = document.querySelector(`[data-sfold="${key}"]`); if (d) { d.open = true; d.scrollIntoView(); } }

async function renderSettings() {
  const [info, s] = await Promise.all([api.info(), api.getSettings()]);
  state.settings = s.data;
  const st = s.data;
  const nPilots = state.characters.length, reauth = state.characters.filter(c => c.needsReauth).length;
  setContent(html`
    <div style="max-width:980px">
      <div class="dim" style="font-size:12px;margin:-4px 0 10px;display:flex;gap:10px"><span>Click a section to open it.</span><a href="#" id="s-openall">Open all</a><a href="#" id="s-closeall">Close all</a></div>
      ${settingsFold('appearance', 'Appearance', 'Theme, glass effects and theme schedule', raw(`<div class="panel" id="appearance-panel"></div>`))}
      ${settingsFold('sso', 'EVE SSO application', st.clientId ? 'Client ID set' : 'Not set up yet: needed before adding pilots', html`<div class="panel"><h3>EVE SSO application</h3>
        <div class="field"><label for="s-client">Client ID</label><input id="s-client" type="text" value="${st.clientId}" spellcheck="false"></div>
        <div class="field"><label for="s-port">Callback port</label><input id="s-port" type="number" min="1024" max="65535" value="${st.callbackPort}" style="max-width:140px">
          <div class="dim" style="margin-top:5px;font-size:12px">Callback URL registered with CCP must be exactly <code>http://localhost:${st.callbackPort}/callback</code></div></div>
        <details><summary class="muted" style="cursor:pointer">How to register an application</summary><div style="margin-top:10px">${setupSteps(st.callbackPort)}</div></details>
      </div>`, !st.clientId)}
      ${settingsFold('behaviour', 'Notifications and behaviour', 'Windows notifications, alerts, tray and check interval', html`<div class="panel"><h3>Behaviour</h3>
        <label class="check"><input type="checkbox" id="s-notif" ${raw(st.notifications ? 'checked' : '')}> Windows notifications when a skill queue is empty, paused or has under 24 hours left</label>
 <label class="check"><input type="checkbox" id="s-ind" ${raw(st.notifyIndustry !== false ? 'checked' : '')}> Notify when industry jobs finish or all manufacturing slots are idle</label>
        <label class="check"><input type="checkbox" id="s-pi" ${raw(st.notifyPlanets !== false ? 'checked' : '')}> Notify when planetary extractors are about to stop</label>
        <div style="padding-left:26px;margin:-4px 0 8px" class="dim">…and when PI storage will fill or factories will run out, <input type="number" id="s-piw-h" min="1" max="48" value="${(st.piWatch && st.piWatch.leadHours) || 6}" style="width:56px;background:var(--bg-2);border:1px solid var(--line-2);color:var(--text);border-radius:6px;padding:2px 6px;color-scheme:dark"> hours ahead
          <label class="check" style="display:inline-flex;margin:0 0 0 12px"><input type="checkbox" id="s-piw-r" ${raw(!st.piWatch || st.piWatch.reminders !== false ? 'checked' : '')}> remind me twice if it isn't fixed</label></div>
        <div class="dim" style="margin:12px 0 6px">Also alert me about:</div>
        <div class="pi-chips" style="margin-bottom:12px">${[['wars', 'War declarations'], ['corpApps', 'Corp applications & membership'], ['contracts', 'Contracts'], ['orders', 'Orders filled / expired'], ['undercut', 'Undercuts (every 30 min)'], ['kills', 'Kill reports'], ['cloneJump', 'Jump clone ready'], ['fatigue', 'Jump fatigue cleared'], ['incursions', 'Incursions near my pilots']].map(([k, l]) => html`<label class="check" style="margin:0 14px 6px 0"><input type="checkbox" data-alert="${k}" ${raw((st.alerts || {})[k] !== false ? 'checked' : '')}> ${l}</label>`)}</div>
        <div class="field"><label for="s-incj">Incursion alert range (jumps from any pilot)</label><input id="s-incj" type="number" min="1" max="30" value="${st.incursionJumps || 10}" style="max-width:140px"></div>
        <label class="check"><input type="checkbox" id="s-tray" ${raw(st.minimizeToTray ? 'checked' : '')}> Keep running in the system tray when the window is closed</label>
        <div class="dim" style="margin:14px 0 6px">Quiet hours (no Windows, phone or spoken alerts):</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px"><label class="check" style="margin:0"><input type="checkbox" id="s-qon" ${raw(st.quiet && st.quiet.enabled ? 'checked' : '')}> From</label>
          <input type="time" id="s-qfrom" value="${(st.quiet && st.quiet.from) || '23:00'}" style="background:var(--bg-2);border:1px solid var(--line-2);color:var(--text);border-radius:6px;padding:5px 8px;color-scheme:dark"> to
          <input type="time" id="s-qto" value="${(st.quiet && st.quiet.to) || '07:00'}" style="background:var(--bg-2);border:1px solid var(--line-2);color:var(--text);border-radius:6px;padding:5px 8px;color-scheme:dark">
          <span class="dim">but still alert me about</span>${[['attack', 'being attacked'], ['intel', 'intel near my pilots'], ['structures', 'structure attacks']].map(([k, l]) => html`<label class="check" style="margin:0"><input type="checkbox" data-qallow="${k}" ${raw(((st.quiet && st.quiet.allow) || ['attack']).includes(k) ? 'checked' : '')}> ${l}</label>`)}</div>
        ${state.characters.length ? html`<div class="dim" style="margin:12px 0 6px">Alerts for each pilot (untick a pilot to silence their skill, industry, PI, market and other pilot alerts):</div>
          <div class="pi-chips" style="margin-bottom:12px">${state.characters.map(c => html`<label class="check" style="margin:0 12px 6px 0"><input type="checkbox" data-pmute="${c.id}" ${raw((st.mutedPilots || []).includes(c.id) ? '' : 'checked')}> ${c.name}</label>`)}</div>` : ''}
        <div class="field"><label for="s-refresh">Background check interval (minutes)</label><input id="s-refresh" type="number" min="5" max="240" value="${st.refreshMinutes}" style="max-width:140px"></div>
      </div>`)}
      <button class="btn btn-primary" id="s-save" style="margin:4px 0 12px">Save settings</button>
      ${settingsFold('updates', 'Updates', `This is version ${info.ok ? info.data.version : ''}`, html`<div class="panel"><h3>Updates</h3>
        <div class="muted" style="margin-bottom:10px">The app checks <a href="#" data-link="https://github.com/mrdave80/eve-toolkit/releases">GitHub releases</a> twice a day and shows a banner when there's a newer version. <b>Update now</b> downloads it, checks it and restarts on the new version, keeping all your data.</div>
        <details style="margin-bottom:10px"><summary class="dim" style="cursor:pointer;font-size:12px">Use a different update feed</summary>
        <div class="field" style="margin-top:8px"><label for="s-upd">Update feed URL</label><input id="s-upd" type="text" value="${st.updateUrl || ''}" placeholder="Leave empty for GitHub releases" spellcheck="false" style="max-width:none"></div>
        <div class="dim" style="font-size:12px">A JSON file like <code>{"version":"1.9.0","url":"https://…","notes":"…"}</code>, or another GitHub releases API address.</div></details>
        <button class="btn btn-ghost" id="s-updcheck">Check now</button> <span class="muted">This is version ${info.ok ? info.data.version : ''}.</span></div>`)}
      ${settingsFold('speech', 'Spoken alerts', 'Read alerts aloud', raw('<div class="panel" id="speech-panel"></div>'))}
      ${settingsFold('phone', 'Phone alerts', 'Send alerts to your phone', raw('<div class="panel" id="phone-panel"></div>'))}
      ${settingsFold('ingame', 'In-game control and sending', 'Waypoints, in-game windows, sending mail, calendar replies, saving fits', raw('<div class="panel" id="ingame-panel"></div>'))}
      ${settingsFold('sde', 'Game data', 'Item, system and planet data from CCP', raw(`<div class="panel"><h3>Game data</h3><div id="sde-panel">${loadingView('Checking…')}</div></div>`))}
      ${settingsFold('backup', 'Backup and restore', 'Move everything to another PC', html`<div class="panel"><h3>Backup and restore</h3>
        <div class="muted" style="margin-bottom:10px">A backup holds your pilots and their logins, settings, watchlists, notes, trade history, maps and corp tools, locked with a password you choose. Restore it on another PC to carry on where you left off. Keep the file safe: anyone with the file and the password can use your logins.</div>
        <button class="btn btn-primary" id="bk-make">Make a backup…</button> <button class="btn btn-ghost" id="bk-restore">Restore from a backup…</button></div>`)}
      ${settingsFold('pilots', 'Pilots', `${nPilots} pilot${nPilots === 1 ? '' : 's'}${reauth ? ` · ${reauth} need${reauth === 1 ? 's' : ''} re-authorising` : ''}`, html`<div class="panel"><h3>Pilots</h3>
        ${state.characters.length ? html`<table><tbody>${state.characters.map(c => html`<tr>
          <td style="width:44px"><img src="${portrait(c.id, 32)}" width="32" height="32" style="border-radius:4px" alt=""></td>
          <td>${c.name} ${c.needsReauth ? raw('<span class="badge gold">Needs re-auth</span>') : ''}
            ${c.missingScopes.length ? html`<div class="dim" style="font-size:12px">Missing scopes: ${c.missingScopes.join(', ')}</div>` : ''}</td>
          <td class="right"><button class="btn btn-ghost" data-reauth="${c.id}">Re-authorise</button>
            <button class="btn btn-danger" data-remove="${c.id}">Remove</button></td></tr>`)}</tbody></table>`
          : html`<div class="muted">No pilots added.</div>`}
      </div>`, !!reauth)}

      <div class="foot-note">
        EVE Toolkit ${info.ok ? info.data.version : ''} · Data folder: <code>${info.ok ? info.data.userData : ''}</code><br>
        Logins use EVE SSO with PKCE; refresh tokens are encrypted with Windows DPAPI and never leave this PC.
        This app only reads data and cannot change anything in your EVE account.<br><br>
        EVE Online and the EVE logo are the registered trademarks of CCP hf. All rights are reserved worldwide.
        All other trademarks are the property of their respective owners. EVE Online, the EVE logo, EVE and all associated logos and designs are
        the intellectual property of CCP hf. This application is not affiliated with or endorsed by CCP hf.
      </div>
    </div>`);

  document.querySelectorAll('[data-sfold]').forEach(d => d.addEventListener('toggle', () => { settingsOpen[d.dataset.sfold] = d.open; try { localStorage.setItem('settingsOpen', JSON.stringify(settingsOpen)); } catch {} }));
  $('#s-openall').onclick = e => { e.preventDefault(); document.querySelectorAll('[data-sfold]').forEach(d => { d.open = true; }); };
  $('#s-closeall').onclick = e => { e.preventDefault(); document.querySelectorAll('[data-sfold]').forEach(d => { d.open = false; }); };
  $('#bk-make').onclick = () => openModal('Make a backup', html`${field('Password', html`<input type="password" name="pw" autocomplete="new-password">`, 'At least 8 characters. There is no way to recover a backup without it.')}${field('Password again', html`<input type="password" name="pw2" autocomplete="new-password">`)}`, {
    submit: 'Choose where to save', onSubmit: async d => { if (d.pw !== d.pw2) { toast('The passwords don’t match.', true); return true; } const r = await api.backup.create(d.pw); if (!r.ok) { toast(r.error, true); return true; } if (r.data) toast('Backup saved to ' + r.data.file); } });
  $('#bk-restore').onclick = async () => {
    const p = await api.backup.pick(); if (!p.ok) return toast(p.error, true); if (!p.data) return;
    openModal('Restore from a backup', html`<div class="dim" style="margin-bottom:10px;word-break:break-all">${p.data.file}</div>${field('Password', html`<input type="password" name="pw">`)}<div id="bk-peek"></div>
      <div class="notice" style="margin:10px 0 0">Restoring replaces this PC’s EVE Toolkit data with the backup, then restarts the app. A copy of the current data is kept in the data folder first.</div>`, {
      submit: 'Check the backup', onSubmit: async d => {
        const peek = document.getElementById('bk-peek'), btn = document.querySelector('#modal [type=submit]');
        if (!peek.dataset.ok) {
          const r = await api.backup.describe(d.pw); if (!r.ok) { toast(r.error, true); return true; }
          peek.dataset.ok = '1'; btn.textContent = 'Restore and restart';
          peek.innerHTML = String(html`<div class="kv" style="font-size:12.5px;margin-top:6px"><span class="k">Made</span><span>${fmtDate(r.data.created)} with version ${r.data.app}</span><span class="k">Pilots</span><span>${r.data.pilots.join(', ') || 'none'}</span><span class="k">Corp tools</span><span>${r.data.hasWorkspace ? 'included' : 'none'}</span></div>`);
          return true;
        }
        const r = await api.backup.restore(d.pw); if (!r.ok) { toast(r.error, true); return true; }
        toast('Restored. EVE Toolkit is restarting…');
      } });
  };
  drawAppearance();
  drawSpeechPanel();
  drawPhonePanel();
  drawIngamePanel();
  drawSdePanel();
  $('#s-updcheck').onclick = async () => { await api.setSettings({ updateUrl: $('#s-upd').value }); const r = await api.checkUpdate(); if (r.ok && r.data) { showUpdateBanner(r.data); openUpdateModal(r.data, false); } else toast(!r.ok ? r.error : 'You have the latest version', !r.ok); };
  $('#s-save').onclick = async () => {
    const r = await api.setSettings({
      clientId: $('#s-client').value,
      callbackPort: $('#s-port').value,
      notifications: $('#s-notif').checked,
      minimizeToTray: $('#s-tray').checked,
      notifyIndustry: $('#s-ind').checked,
      notifyPlanets: $('#s-pi').checked,
      incursionJumps: Number($('#s-incj').value),
      alerts: Object.fromEntries([...document.querySelectorAll('[data-alert]')].map(c => [c.dataset.alert, c.checked])),
      updateUrl: $('#s-upd').value,
      refreshMinutes: $('#s-refresh').value,
      quiet: { enabled: $('#s-qon').checked, from: $('#s-qfrom').value, to: $('#s-qto').value, allow: [...document.querySelectorAll('[data-qallow]')].filter(c => c.checked).map(c => c.dataset.qallow) },
      mutedPilots: [...document.querySelectorAll('[data-pmute]')].filter(c => !c.checked).map(c => Number(c.dataset.pmute))
    });
    if (!r.ok) return toast(r.error, true);
    await api.piWatch.cfg({ leadHours: Number($('#s-piw-h').value), reminders: $('#s-piw-r').checked });
    state.settings = (await api.getSettings()).data || r.data;
    toast('Settings saved');
    renderSettings();
  };
}

async function drawSdePanel() {
  const box = $('#sde-panel');
  if (!box) return;
  const r = await api.sde.info();
  const i = r.ok ? r.data : { state: 'error', message: r.error };
  const busy = ['checking', 'downloading', 'building'].includes(i.state);
  box.innerHTML = String(html`
    <div class="muted" style="margin-bottom:10px">The skill planner, industry calculator, appraisal, doctrines, route planner and wormhole database use CCP's official static data export. It's downloaded once from developers.eveonline.com (about 100 MB) and stored on this PC.</div>
    ${i.ready ? html`<div class="kv" style="margin-bottom:10px"><span class="k">Build</span><span>${i.build}</span><span class="k">Installed</span><span>${fmtDate(i.builtAt)}</span><span class="k">Contents</span><span>${fmtNum(i.counts.types)} items · ${fmtNum(i.counts.blueprints)} blueprints · ${fmtNum(i.counts.systems)} systems</span></div>` : ''}
    ${busy ? html`<div class="bar" style="margin:10px 0"><i style="width:${i.progress || 3}%"></i></div><div class="muted">${i.message}</div>`
      : html`<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn ${i.ready ? 'btn-ghost' : 'btn-primary'}" id="sde-dl">${i.ready ? 'Check for updates' : 'Download game data'}</button>
        <button class="btn btn-ghost" id="sde-imp" title="If the download is blocked, download the JSONL zip from developers.eveonline.com/static-data yourself and import it">Import zip…</button></div>
        ${i.message && !i.ready ? html`<div class="${i.state === 'error' ? 'neg' : 'muted'}" style="margin-top:8px">${i.message}</div>` : ''}`}`);
  const dl = $('#sde-dl'), imp = $('#sde-imp');
  if (dl) dl.onclick = async () => { const u = api.sde.update(false); drawSdePanel(); const res = await u; if (!res.ok) toast(res.error, true); else toast('Game data ready'); drawSdePanel(); };
  if (imp) imp.onclick = async () => { const res = await api.sde.importZip(); if (!res.ok) toast(res.error, true); else if (res.data) toast('Game data imported'); drawSdePanel(); };
}
api.sde.onStatus(st => {
  const m = $('#sde-msg'), b = $('#sde-bar');
  if (m) m.textContent = st.message;
  if (b) b.style.width = (st.progress || 2) + '%';
  if (state.view === 'settings' && ['checking', 'downloading', 'building'].includes(st.state)) drawSdePanel();
});

/** Shown by SDE-dependent views when the data isn't installed yet. */
function needSdeView(what) {
  return html`<div class="empty" style="max-width:600px;margin:0 auto"><h2>Game data needed</h2>
    <p>${what} uses CCP's static game data (blueprints, skills, item names). It's a one-time download of about 100 MB.</p>
    <button class="btn btn-primary" data-action="sde-download">Download game data</button>
    <p class="dim" style="margin-top:12px">You can also manage this under Settings → Game data.</p></div>`;
}
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-action="sde-download"]')) return;
  setContent(html`<div class="loading"><div class="spinner"></div><span id="sde-msg">Starting download…</span><div class="bar" style="max-width:420px;margin:14px auto 0"><i id="sde-bar" style="width:2%"></i></div></div>`);
  const r = await api.sde.update(false);
  if (!r.ok) toast(r.error, true); else toast('Game data ready');
  render();
});

async function addCharacter(corp = false) {
  if (!state.settings.clientId) { go('settings'); return toast('Set your Client ID first.', true); }
  toast(corp ? 'Complete the director login in your browser (includes corp permissions)…' : 'Complete the login in your browser…');
  const r = await api.addCharacter(corp);
  corpState.directors = null;
  if (!r.ok) return toast(r.error, true);
  const before = new Set(state.characters.map(c => c.id));
  state.characters = r.data;
  const added = state.characters.find(c => !before.has(c.id)) || null;
  toast(added ? `${added.name} added` : 'Pilot re-authorised');
  if (corp) { state.corpTab = state.corpTab || 'c-overview'; go('corp'); }
  else if (added) go('char', { charId: added.id, tab: 'summary' }); else { renderSidebar(); render(); }
}

async function removeCharacter(id) {
  const c = state.characters.find(x => x.id === id);
  if (!c) return;
  const btn = document.querySelector(`[data-remove="${id}"]`);
  if (btn && btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1'; btn.textContent = 'Click again to remove';
    setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ''; btn.textContent = 'Remove'; } }, 4000);
    return;
  }
  const r = await api.removeCharacter(id);
  if (!r.ok) return toast(r.error, true);
  state.characters = r.data;
  state.overviews.delete(id);
  toast(`${c.name} removed`);
  renderSidebar();
  renderSettings();
}

// ================= Character tabs =================

async function renderCharTab(stillCurrent) {
  const c = state.characters.find(x => x.id === state.charId);
  if (!c) return go('dashboard');
  if (c.needsReauth) {
    setContent(html`<div class="empty"><h2>${c.name} needs re-authorising</h2>
      <p>The EVE login for this pilot has expired or was revoked (for example after a password change).</p>
      <button class="btn btn-primary" data-action="add">Re-authorise ${c.name}</button></div>`);
    return;
  }
  setContent(loadingView());
  const loaders = {
    summary: () => api.overview(c.id), queue: () => api.skillQueue(c.id), skills: () => api.skills(c.id),
    wallet: () => api.wallet(c.id), mail: () => api.mail(c.id), contracts: () => api.contracts(c.id),
    clones: () => Promise.all([api.clones(c.id), api.fatigue(c.id)]).then(([a, b]) => a.ok ? { ok: true, data: { ...a.data, fatigue: b.ok ? b.data : null } } : a),
    industry: () => api.industryFull(c.id), orders: () => api.ordersFull(c.id),
    assets: () => api.assets(c.id),
    training: () => api.training(c.id), blueprints: () => api.blueprints(c.id), planets: () => api.planets(c.id),
    mining: () => api.mining(c.id), research: () => api.research(c.id), loyalty: () => api.loyalty(c.id),
    notifications: () => api.notifications(c.id), calendar: () => api.calendar(c.id), corp: () => api.corporation(c.id),
    standings: () => api.standings(c.id), contacts: () => api.contacts(c.id), medals: () => api.medals(c.id),
    kills: () => api.killmails(c.id), fittings: () => api.fittings(c.id),
    plan: () => api.plan.list(c.id)
  };
  const msg = { skills: 'Loading skills (first run downloads the skill list)…', assets: 'Loading assets…', planets: 'Loading planetary colonies…', kills: 'Loading killmails…', blueprints: 'Loading blueprints…' }[state.tab];
  if (msg) setContent(loadingView(msg));
  const r = await loaders[state.tab]();
  if (!stillCurrent()) return;
  if (!r.ok) {
    if (r.status === 401 || /refresh login/i.test(r.error)) {
      const lr = await api.listCharacters();
      if (lr.ok) { state.characters = lr.data; renderSidebar(); }
    }
    return setContent(errorView(r));
  }
  const views = { summary: viewSummary, queue: viewQueue, skills: viewSkills, wallet: viewWallet, mail: viewMail,
    contracts: viewContracts, clones: viewClones, industry: viewIndustry, orders: viewOrders, assets: viewAssets,
    training: viewTraining, blueprints: viewBlueprints, planets: viewPlanets, mining: viewMining, research: viewResearch,
    loyalty: viewLoyalty, notifications: viewNotifications, calendar: viewCalendar, corp: viewCorp, standings: viewStandings,
    contacts: viewContacts, medals: viewMedals, kills: viewKills, fittings: viewFittings, plan: viewPlanner };
  views[state.tab](r.data, c);
}

function viewSummary(o, c) {
  state.overviews.set(c.id, o);
  renderSidebar();
  const sec = o.securityStatus;
  setContent(html`
    ${o.errors && o.errors.length ? html`<div class="notice">Some details could not be loaded: ${o.errors.join('; ')}</div>` : ''}
    <div class="profile">
      <img src="${portrait(c.id, 256)}" alt="">
      <div>
        <h1>${o.name || c.name}</h1>
        <div class="corp">${o.corporation || ''}${o.alliance ? raw(' &middot; ' + esc(o.alliance)) : ''}</div>
        <div class="tags">
          ${o.online ? (o.online.online ? raw('<span class="badge green">Online</span>') : html`<span class="badge">Last login ${fmtDate(o.online.last_login)}</span>`) : ''}
          ${sec !== null && sec !== undefined ? html`<span class="badge ${sec < 0 ? 'red' : 'accent'}">Sec ${sec.toFixed(2)}</span>` : ''}
          ${o.birthday ? html`<span class="badge">Born ${fmtDay(o.birthday)}</span>` : ''}
          <a href="#" class="badge" data-link="https://zkillboard.com/character/${c.id}/">zKillboard ↗</a>
          <a href="#" class="badge" data-link="https://evewho.com/character/${c.id}">EveWho ↗</a>
          <button class="badge" data-export-audit="${c.id}" style="cursor:pointer" title="Save a snapshot file to send to your corp's leadership">⇪ Export audit for corp</button>
        </div>
      </div>
    </div>
    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="stat" data-private><div class="label">Wallet</div><div class="value">${fmtCompact(o.wallet)} ISK</div><div class="hint">${fmtIsk(o.wallet)}</div></div>
      <div class="stat"><div class="label">Skill points</div><div class="value">${fmtNum(o.totalSp)}</div>
        <div class="hint">${o.unallocatedSp ? fmtNum(o.unallocatedSp) + ' unallocated' : 'No unallocated SP'}</div></div>
      <div class="stat" data-private><div class="label">Location</div><div class="value" style="font-size:18px">${o.system || '—'}</div>
        <div class="hint">${o.docked ? 'Docked: ' + o.docked : (o.system ? 'In space' : '')}</div></div>
    </div>
    <div class="grid grid-2">
      <div class="panel"><h3>Training</h3>${trainingBlock(o)}
        <div style="margin-top:12px"><button class="btn btn-ghost" data-tab-go="queue">View full queue →</button></div></div>
      <div class="panel"><h3>Active ship</h3>
        ${o.ship ? html`<div style="display:flex;gap:14px;align-items:center">
          <img src="${typeRender(o.ship.typeId, 128)}" width="96" height="96" style="border-radius:6px;background:var(--bg-2)" alt="">
          <div><div style="font-size:16px">${o.ship.name}</div><div class="muted">${o.ship.type}</div></div></div>` : html`<div class="muted">Unknown</div>`}
      </div>
    </div>`);
}

function viewQueue(d, c) {
  const now = Date.now();
  const q = d.queue;
  const active = q.filter(e => e.finish_date && Date.parse(e.finish_date) > now);
  const end = active.length ? Date.parse(active[active.length - 1].finish_date) : null;
  const a = d.attributes;
  setContent(html`
    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="stat"><div class="label">Skills in queue</div><div class="value">${active.length}</div>
        <div class="hint">${q.length && !q.some(e => e.finish_date) ? 'Queue is paused' : (q.length ? '' : 'Queue is empty')}</div></div>
      <div class="stat"><div class="label">Queue finishes</div><div class="value" style="font-size:18px" ${raw(end ? `data-countdown="${new Date(end).toISOString()}"` : '')}>${end ? fmtDuration(end - now) : '—'}</div>
        <div class="hint">${end ? fmtDate(end) : ''}</div></div>
      <div class="stat"><div class="label">Attributes</div>
        ${a ? html`<div class="hint" style="margin-top:6px;line-height:1.8">
          Int <b class="num">${a.intelligence}</b> · Mem <b class="num">${a.memory}</b> · Per <b class="num">${a.perception}</b> · Wil <b class="num">${a.willpower}</b> · Cha <b class="num">${a.charisma}</b>
          ${a.bonus_remaps ? html`<br>${a.bonus_remaps} bonus remap(s) available` : ''}
          ${a.accrued_remap_cooldown_date ? html`<br>Next remap: ${fmtDay(a.accrued_remap_cooldown_date)}` : ''}</div>` : html`<div class="hint">Unavailable</div>`}
      </div>
    </div>
    <div class="panel">
      ${q.length ? q.map(e => {
        const fin = e.finish_date ? Date.parse(e.finish_date) : null;
        const done = fin && fin <= now;
        const started = e.start_date ? Date.parse(e.start_date) : null;
        let pct = 0;
        if (fin && started && e.level_end_sp > e.level_start_sp) {
          const base = (e.training_start_sp - e.level_start_sp) / (e.level_end_sp - e.level_start_sp);
          pct = now < started ? base : base + (1 - base) * Math.min(1, (now - started) / (fin - started));
        }
        return html`<div class="queue-item expandable" data-qskill="${e.skill_id}" data-qpos="${e.queue_position}" style="${done ? 'opacity:.45' : ''}" title="Click for details">
          <div class="queue-pos">${e.queue_position + 1}</div>
          <div><span class="queue-name">${e.name} ${ROMAN[e.finished_level]}</span>${levelBoxes(e.finished_level - 1, e.finished_level)}
            <div class="bar"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>
            <div class="dim" style="font-size:12px;margin-top:4px">${fmtNum(e.level_end_sp - e.level_start_sp)} SP for this level</div></div>
          <div class="right"><div class="num" ${raw(fin && !done ? `data-countdown="${e.finish_date}"` : '')}>${done ? 'Complete' : (fin ? fmtDuration(fin - now) : 'Paused')}</div>
            <div class="dim" style="font-size:12px">${fin ? fmtDate(fin) : ''} <span class="qchev">▾</span></div></div>
        </div><div class="queue-detail" data-qdetail="${e.queue_position}" hidden></div>`;
      }) : html`<div class="empty" style="padding:30px"><h2>Nothing training</h2><p>Log in to EVE to add skills to the queue.</p></div>`}
    </div>`);
  const panel = content().querySelector('.panel:last-of-type');
  if (q.length && panel) {
    const bar = document.createElement('div');
    bar.className = 'toolbar';
    bar.innerHTML = '<button class="btn btn-ghost" id="q-expand">Expand all</button><button class="btn btn-ghost" id="q-collapse">Collapse all</button><span class="dim">Click a skill for its description, prerequisites and training time per level.</span>';
    panel.before(bar);
    $('#q-expand').onclick = () => document.querySelectorAll('[data-qskill]').forEach(el => toggleQueueDetail(el, d, c, true));
    $('#q-collapse').onclick = () => document.querySelectorAll('[data-qdetail]').forEach(el => { el.hidden = true; el.previousElementSibling.classList.remove('open'); });
  }
  document.querySelectorAll('[data-qskill]').forEach(el => el.onclick = () => toggleQueueDetail(el, d, c));
}

const spForLevel = (rank, lvl) => lvl <= 0 ? 0 : Math.ceil(250 * rank * Math.pow(Math.sqrt(32), lvl - 1));

async function toggleQueueDetail(el, d, c, forceOpen = false) {
  const box = el.nextElementSibling;
  if (!box || !box.matches('[data-qdetail]')) return;
  if (!box.hidden && !forceOpen) { box.hidden = true; el.classList.remove('open'); return; }
  box.hidden = false; el.classList.add('open');
  if (box.dataset.loaded) return;
  box.dataset.loaded = '1';
  box.innerHTML = String(loadingView('Loading skill details…'));
  const r = await api.skillInfo(c.id, Number(el.dataset.qskill));
  if (!r.ok) { box.innerHTML = String(errorView(r)); box.dataset.loaded = ''; return; }
  const s = r.data;
  const e = d.queue.find(x => x.queue_position === Number(el.dataset.qpos));
  const a = d.attributes;
  const attrVal = name => a && name ? a[name.toLowerCase()] : null;
  const spMin = a && s.primary && s.secondary ? attrVal(s.primary) + attrVal(s.secondary) / 2 : null;
  // Live rate from the queue entry (includes implants and boosters), else attributes
  const live = e && e.start_date && e.finish_date && Date.parse(e.finish_date) > Date.parse(e.start_date)
    ? (e.level_end_sp - e.training_start_sp) / ((Date.parse(e.finish_date) - Date.parse(e.start_date)) / 60000) : null;
  const rate = live || spMin;
  const queuedLevels = d.queue.filter(x => x.skill_id === s.id).map(x => x.finished_level);
  const rows = [1, 2, 3, 4, 5].map(l => {
    const need = spForLevel(s.rank, l), prev = spForLevel(s.rank, l - 1);
    const status = l <= s.trainedLevel ? 'trained' : queuedLevels.includes(l) ? 'queued' : 'todo';
    const left = l <= s.trainedLevel ? 0 : need - Math.max(prev, Math.min(need, s.spInSkill));
    const qe = d.queue.find(x => x.skill_id === s.id && x.finished_level === l && x.finish_date);
    const qTime = qe ? Date.parse(qe.finish_date) - Math.max(Date.now(), Date.parse(qe.start_date)) : null;
    return { l, need, delta: need - prev, status, time: qTime !== null ? Math.max(0, qTime) : (rate && left > 0 ? left / rate * 60000 : 0) };
  });
  box.innerHTML = String(html`<div class="qd-grid">
    <div>
      <div class="qd-desc">${s.description || 'No description.'}</div>
      <div class="tags" style="margin-top:10px">
        <span class="badge accent">Rank ×${s.rank}</span>
        ${s.primary ? html`<span class="badge">Primary: ${s.primary}${attrVal(s.primary) ? ' ' + attrVal(s.primary) : ''}</span>` : ''}
        ${s.secondary ? html`<span class="badge">Secondary: ${s.secondary}${attrVal(s.secondary) ? ' ' + attrVal(s.secondary) : ''}</span>` : ''}
        ${rate ? html`<span class="badge">${fmtNum(rate * 60)} SP/h${live ? '' : ' (base attributes)'}</span>` : ''}
      </div>
      <h3 class="mh" style="margin-top:14px">Prerequisites</h3>
      ${s.requires.length ? s.requires.map(rq => html`<div class="skill-row"><span>${rq.trained >= rq.level ? raw('<span class="pos">✓</span>') : raw('<span class="neg">✗</span>')} ${rq.name} ${ROMAN[rq.level]}</span><span class="dim">trained ${ROMAN[rq.trained] || '0'}</span></div>`) : html`<div class="muted">None</div>`}
    </div>
    <div>
      <h3 class="mh">Levels</h3>
      <table class="qd-levels"><thead><tr><th>Level</th><th class="right">SP for level</th><th class="right">Total SP</th><th class="right">Time</th><th></th></tr></thead><tbody>
        ${rows.map(x => html`<tr class="${x.status}"><td>${ROMAN[x.l]}</td><td class="right num">${fmtNum(x.delta)}</td><td class="right num">${fmtNum(x.need)}</td>
          <td class="right num">${x.status === 'trained' ? '—' : (x.time ? fmtDuration(x.time, true) : '?')}</td>
          <td>${x.status === 'trained' ? raw('<span class="badge green">Trained</span>') : x.status === 'queued' ? raw('<span class="badge accent">Queued</span>') : ''}</td></tr>`)}
      </tbody></table>
      <div class="dim" style="margin-top:6px;font-size:12px">Currently ${fmtNum(s.spInSkill)} SP in this skill · times use ${live ? 'your live training rate' : 'base attributes (no implants)'}.</div>
    </div></div>`);
}

function viewSkills(d) {
  const lv5 = d.groups.reduce((n, g) => n + g.skills.filter(s => s.level === 5).length, 0);
  const count = d.groups.reduce((n, g) => n + g.count, 0);
  setContent(html`
    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="stat"><div class="label">Total skill points</div><div class="value">${fmtNum(d.totalSp)}</div><div class="hint">${d.unallocatedSp ? fmtNum(d.unallocatedSp) + ' unallocated' : ''}</div></div>
      <div class="stat"><div class="label">Skills trained</div><div class="value">${count}</div></div>
      <div class="stat"><div class="label">At level V</div><div class="value">${lv5}</div></div>
    </div>
    <div class="toolbar"><input type="search" id="skill-filter" placeholder="Filter skills…"></div>
    <div id="skill-groups">${d.groups.map(g => html`<details class="sgroup" data-group>
      <summary><span class="gname">${g.name}</span><span class="muted">${g.count}/${g.total} · <span class="num">${fmtNum(g.sp)}</span> SP</span></summary>
      <div class="skill-rows">${g.skills.map(s => html`<div class="skill-row" data-skill="${s.name.toLowerCase()}">
        <span>${s.name}${s.active < s.level ? raw(' <span class="badge gold" title="Alpha clone limited">α ' + ROMAN[s.active] + '</span>') : ''}</span>
        <span>${levelBoxes(s.level)}</span></div>`)}</div></details>`)}
    </div>`);
  $('#skill-filter').oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('[data-group]').forEach(g => {
      let any = false;
      g.querySelectorAll('[data-skill]').forEach(r => { const m = !q || r.dataset.skill.includes(q); r.style.display = m ? '' : 'none'; any = any || m; });
      g.style.display = any ? '' : 'none';
      g.open = !!q && any;
    });
  };
}

function viewWallet(d) {
  let mode = 'journal';
  const draw = () => {
    const body = mode === 'journal'
      ? html`<table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="right">Amount</th><th class="right">Balance</th></tr></thead><tbody>
          ${d.journal.map(j => html`<tr><td class="nowrap">${fmtDate(j.date)}</td><td class="nowrap">${humanize(j.ref_type)}</td>
          <td>${j.description || ''}${j.reason ? html`<div class="dim">${j.reason}</div>` : ''}</td>
          <td class="right num nowrap ${j.amount < 0 ? 'neg' : 'pos'}">${j.amount !== undefined ? nf2.format(j.amount) : ''}</td>
          <td class="right num nowrap">${j.balance !== undefined ? nf2.format(j.balance) : ''}</td></tr>`)}</tbody></table>`
      : html`<table><thead><tr><th>Date</th><th>Item</th><th class="right">Qty</th><th class="right">Unit price</th><th class="right">Total</th><th>Client</th><th>Location</th></tr></thead><tbody>
          ${d.transactions.map(t => html`<tr><td class="nowrap">${fmtDate(t.date)}</td>
          <td><img src="${typeIcon(t.type_id)}" width="20" height="20" style="vertical-align:-5px;margin-right:6px" alt="">${t.typeName}</td>
          <td class="right num">${fmtNum(t.quantity)}</td><td class="right num nowrap">${nf2.format(t.unit_price)}</td>
          <td class="right num nowrap ${t.is_buy ? 'neg' : 'pos'}">${(t.is_buy ? '-' : '+') + nf2.format(t.unit_price * t.quantity)}</td>
          <td>${t.clientName || ''}</td><td class="muted">${t.locationName || ''}</td></tr>`)}</tbody></table>`;
    const thirty = Date.now() - 30 * 86400000;
    const recent = d.journal.filter(j => Date.parse(j.date) > thirty && typeof j.amount === 'number');
    const inc = recent.filter(j => j.amount > 0).reduce((n, j) => n + j.amount, 0);
    const out = recent.filter(j => j.amount < 0).reduce((n, j) => n + j.amount, 0);
    setContent(html`
      <div class="grid grid-3" style="margin-bottom:16px">
        <div class="stat"><div class="label">Balance</div><div class="value">${fmtCompact(d.balance)} ISK</div><div class="hint">${fmtIsk(d.balance)}</div></div>
        <div class="stat"><div class="label">Income · 30 days</div><div class="value pos">${fmtCompact(inc)}</div></div>
        <div class="stat"><div class="label">Spending · 30 days</div><div class="value neg">${fmtCompact(out)}</div></div>
      </div>
      <div class="toolbar"><div class="seg"><button data-wmode="journal" class="${mode === 'journal' ? 'active' : ''}">Journal (${d.journal.length})</button>
        <button data-wmode="tx" class="${mode === 'tx' ? 'active' : ''}">Market transactions (${d.transactions.length})</button></div></div>
      <div class="panel" style="padding:0"><div class="table-wrap">${body}</div></div>`);
    document.querySelectorAll('[data-wmode]').forEach(b => b.onclick = () => { mode = b.dataset.wmode; draw(); });
  };
  draw();
}

function eveMailToText(body) {
  const withBreaks = String(body || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function viewMail(d, c) {
  const mails = [...d.mails].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  setContent(html`<div class="toolbar"><button class="btn btn-primary" id="ml-new">✎ New mail</button><span class="dim" style="font-size:12px">${c.canSendMail ? '' : 'Sending from the app needs the Sending option in Settings → In-game control.'}</span></div><div class="mail-layout">
    <div class="mail-list">${mails.length ? mails.map(m => html`<div class="mail-row ${m.is_read ? '' : 'unread'}" data-mail="${m.mail_id}">
      <div class="from">${m.fromName} · ${fmtDate(m.timestamp)}</div><div class="subj">${m.subject || '(no subject)'}</div></div>`)
      : html`<div class="empty">No mail</div>`}</div>
    <div class="mail-view" id="mail-view"><div class="empty">${d.unread !== null ? `${d.unread} unread` : ''}<br>Select a message</div></div>
  </div>`);
  document.querySelectorAll('[data-mail]').forEach(el => el.onclick = async () => {
    document.querySelectorAll('.mail-row').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
    const id = Number(el.dataset.mail);
    state.mailSel = id;
    showMailMessage($('#mail-view'), c.id, id, d.mails.find(m => m.mail_id === id));
  });
  $('#ml-new').onclick = () => openComposeMail({ charId: c.id });
}

const CONTRACT_STATUS = { outstanding: 'accent', in_progress: 'accent', finished: 'green', finished_issuer: 'green', finished_contractor: 'green', expired: 'gold', rejected: 'red', failed: 'red', deleted: 'red', reversed: 'red', cancelled: 'red' };

function viewContracts(list, c) {
  let filter = 'active';
  const draw = () => {
    const rows = list.filter(x => filter === 'all' || ['outstanding', 'in_progress'].includes(x.status));
    setContent(html`
      <div class="toolbar"><div class="seg">
        <button data-cf="active" class="${filter === 'active' ? 'active' : ''}">Active</button>
        <button data-cf="all" class="${filter === 'all' ? 'active' : ''}">All (${list.length})</button></div></div>
      <div class="panel" style="padding:0"><div class="table-wrap">
        ${rows.length ? html`<table><thead><tr><th>Type</th><th>Title</th><th>Status</th><th>Issuer</th><th>To / By</th><th class="right">Price / Reward</th><th>Location</th><th>Expires</th></tr></thead><tbody>
        ${rows.map(x => html`<tr class="clickable" data-contract="${x.contract_id}" title="Click to show items">
          <td class="nowrap">${humanize(x.type)}${x.issuer_id === c.id ? '' : raw(' <span class="badge">incoming</span>')}</td>
          <td>${x.title || raw('<span class="dim">—</span>')}${x.availability ? html`<div class="dim">${humanize(x.availability)}</div>` : ''}</td>
          <td><span class="badge ${CONTRACT_STATUS[x.status] || ''}">${humanize(x.status)}</span></td>
          <td>${x.issuerName || ''}</td>
          <td>${x.acceptorName || x.assigneeName || ''}</td>
          <td class="right num nowrap">${x.price ? nf2.format(x.price) : ''}${x.reward ? html`<div class="pos">+${nf2.format(x.reward)}</div>` : ''}${x.collateral ? html`<div class="dim">Coll. ${fmtCompact(x.collateral)}</div>` : ''}</td>
          <td class="muted">${x.startName || ''}${x.endName && x.endName !== x.startName ? ' → ' + x.endName : ''}</td>
          <td class="nowrap">${fmtDate(x.date_expired)}</td></tr>`)}</tbody></table>`
        : html`<div class="empty">No ${filter === 'active' ? 'active ' : ''}contracts</div>`}
      </div></div>`);
    document.querySelectorAll('[data-cf]').forEach(b => b.onclick = () => { filter = b.dataset.cf; draw(); });
    document.querySelectorAll('[data-contract]').forEach(tr => tr.onclick = async () => {
      const next = tr.nextElementSibling;
      if (next && next.classList.contains('citems')) { next.remove(); tr.classList.remove('expanded'); return; }
      tr.classList.add('expanded');
      const row = document.createElement('tr');
      row.className = 'citems';
      row.innerHTML = `<td colspan="8">${loadingView('Loading items…')}</td>`;
      tr.after(row);
      const r = await api.contractItems(c.id, Number(tr.dataset.contract));
      row.firstElementChild.innerHTML = String(!r.ok ? errorView(r) : (r.data.length ? html`<div class="skill-rows" style="padding:4px 8px">${r.data.map(i => html`<div class="skill-row">
        <span><img src="${typeIcon(i.typeId)}" width="18" height="18" style="vertical-align:-4px;margin-right:6px" alt="">${i.name}${i.included ? '' : raw(' <span class="badge gold">wanted</span>')}</span>
        <span class="num muted">${fmtNum(i.quantity)}</span></div>`)}</div>` : html`<div class="muted">No items (ISK-only or courier contract)</div>`));
    });
  };
  draw();
}

function viewClones(d) {
  const f = d.fatigue;
  const hours = f ? f.cloneJumpHours : 24;
  const canJump = d.lastJump ? Date.parse(d.lastJump) + hours * 3600000 : 0;
  const left = canJump - Date.now();
  const fatigueLeft = f && f.fatigueExpires ? Date.parse(f.fatigueExpires) - Date.now() : 0;
  setContent(html`
    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="stat"><div class="label">Home station</div><div class="value" style="font-size:16px">${d.home || '—'}</div></div>
      <div class="stat"><div class="label">Clone jump</div><div class="value" style="font-size:18px">${left > 0 ? fmtDuration(left, true) : 'Available'}</div>
        <div class="hint">${d.lastJump ? 'Last jump ' + fmtDate(d.lastJump) : 'No jumps recorded'} · ${hours}h cooldown</div></div>
      <div class="stat"><div class="label">Jump clones</div><div class="value">${d.jumpClones.length}${f ? ' / ' + f.maxJumpClones : ''}</div><div class="hint">From Infomorph Psychology skills</div></div>
    </div>
    <div class="panel"><h3>Jump drive fatigue</h3>
      ${f ? html`<div class="kv">
        <span class="k">Fatigue</span><span class="${fatigueLeft > 0 ? 'gold' : 'pos'}">${fatigueLeft > 0 ? raw('<span data-countdown="' + esc(f.fatigueExpires) + '">' + esc(fmtDuration(fatigueLeft)) + '</span> remaining') : 'None'}</span>
        <span class="k">Last jump</span><span>${f.lastJump ? fmtDate(f.lastJump) : '—'}</span>
        <span class="k">Last fatigue update</span><span>${f.lastUpdate ? fmtDate(f.lastUpdate) : '—'}</span></div>` : html`<div class="muted">Unavailable</div>`}
    </div>
    <div class="grid grid-2">
      <div class="panel"><h3>Active clone implants</h3>
        ${d.activeImplants.length ? html`<ul style="margin:0;padding-left:18px">${d.activeImplants.map(i => html`<li>${i}</li>`)}</ul>` : html`<div class="muted">No implants</div>`}</div>
      ${d.jumpClones.map((j, i) => html`<div class="panel"><h3>${j.name || 'Jump clone ' + (i + 1)}</h3>
        <div style="margin-bottom:8px">${j.location}</div>
        ${j.implants.length ? html`<ul style="margin:0;padding-left:18px" class="muted">${j.implants.map(x => html`<li>${x}</li>`)}</ul>` : html`<div class="dim">No implants</div>`}</div>`)}
    </div>`);
}



function viewAssets(d) {
  const priced = d.pricesAt ? new Date(d.pricesAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : null;
  setContent(html`
    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="stat"><div class="label">Estimated asset value</div><div class="value">${fmtCompact(d.value)} ISK</div><div class="hint">${fmtIsk(d.value)}</div></div>
      <div class="stat"><div class="label">Items</div><div class="value">${fmtNum(d.total)}</div><div class="hint">Across ${d.locations.length} locations</div></div>
      <div class="stat"><div class="label">Most valuable location</div><div class="value" style="font-size:15px">${d.locations[0] ? d.locations[0].name : '—'}</div><div class="hint">${d.locations[0] ? fmtCompact(d.locations[0].value) + ' ISK' : ''}</div></div>
    </div>
    <div class="toolbar"><input type="search" id="asset-filter" placeholder="Search items or locations…">
      <span class="dim">Values use CCP's universe-wide average prices${priced ? ' (updated ' + priced + ')' : ''}. Blueprint copies are not valued.</span></div>
    <div id="asset-locs">${d.locations.map(l => html`<details class="sgroup" data-loc="${l.name.toLowerCase()}">
      <summary><span class="gname">${l.name}</span><span class="muted">${l.items.length} types · <span class="num">${fmtCompact(l.value)}</span> ISK</span></summary>
      <div class="table-wrap" style="max-height:none;padding:0 14px 10px 34px"><table><thead><tr><th>Item</th><th class="right">Quantity</th><th class="right">Unit price</th><th class="right">Value</th></tr></thead><tbody>
      ${l.items.map(i => html`<tr data-item="${i.name.toLowerCase()}">
        <td><img src="${typeIcon(i.typeId)}" width="18" height="18" style="vertical-align:-4px;margin-right:6px" alt="" loading="lazy">${i.name}</td>
        <td class="right num">${fmtNum(i.quantity)}</td><td class="right num muted">${i.unitPrice ? nf2.format(i.unitPrice) : '—'}</td>
        <td class="right num">${i.value ? fmtCompact(i.value) : '—'}</td></tr>`)}</tbody></table></div></details>`)}
    </div>`);
  $('#asset-filter').oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('[data-loc]').forEach(g => {
      const locMatch = q && g.dataset.loc.includes(q);
      let any = false;
      g.querySelectorAll('[data-item]').forEach(r => { const m = !q || locMatch || r.dataset.item.includes(q); r.style.display = m ? '' : 'none'; any = any || m; });
      g.style.display = any ? '' : 'none';
      g.open = !!q && any && !locMatch;
    });
  };
}

// ================= Server status & ticker =================

async function updateServerStatus() {
  const el = $('#server-status');
  const r = await api.status();
  if (r.ok) el.innerHTML = String(html`<span class="dot up"></span>Tranquility · ${fmtNum(r.data.players)} online`);
  else el.innerHTML = String(html`<span class="dot down"></span>Tranquility unreachable`);
}

setInterval(() => {
  document.querySelectorAll('[data-countdown]').forEach(el => {
    el.textContent = fmtDuration(Date.parse(el.dataset.countdown) - Date.now());
  });
}, 1000);

// ================= Events =================

document.addEventListener('click', e => {
  const t = e.target;
  const pl = t.closest('[data-pilot]');
  if (pl) { e.preventDefault(); openPilotCard(pl.dataset.pilot); return; }
  const sy = t.closest('[data-system]');
  if (sy) { e.preventDefault(); openSystemCard(sy.dataset.system); return; }
  const it = t.closest('[data-tid]');
  if (it && (it.tagName !== 'IMG' || !it.parentElement.closest('a,button,label,.clickable,[data-it],[data-pv],[data-goitem],.char-item,[data-open],[data-ttab],[data-tab],.side-link,#search-pal,[data-ttype]'))) { e.preventDefault(); openItemCard(it.dataset.tid); return; }
  const xr = t.closest('tr.xrow');
  if (xr && !t.closest('a,button,input,select,textarea,label')) { toggleX(xr); return; }
  const link = t.closest('[data-link]');
  if (link) { e.preventDefault(); api.openLink(link.dataset.link); return; }
  const side = t.closest('.side-link');
  if (side) { if (side.dataset.view === 'corp') corpState.directors = null; go(side.dataset.view); return; }
  const ch = t.closest('.char-item');
  if (ch) { go('char', { charId: Number(ch.dataset.id), tab: state.view === 'char' ? state.tab : 'summary' }); return; }
  const card = t.closest('[data-open]');
  if (card) { go('char', { charId: Number(card.dataset.open), tab: 'summary' }); return; }
  const pitab = t.closest('[data-pitab]');
  if (pitab) { state.piTab = pitab.dataset.pitab; renderTopbar(); render(); return; }
  const ttab = t.closest('[data-ttab]');
  if (ttab) {
    let k = ttab.dataset.ttab;
    if (ttab.dataset.tgroup && state.lastToolsTab[ttab.dataset.tgroup]) k = state.lastToolsTab[ttab.dataset.tgroup];
    state.lastToolsTab[toolsGroupOf(k)[0]] = k;
    state.toolsTab = k;
    go('tools');
    return;
  }
  const ctab = t.closest('[data-ctab]');
  if (ctab) {
    let k = ctab.dataset.ctab;
    if (ctab.dataset.cgroup && state.lastCorpTab[ctab.dataset.cgroup]) k = state.lastCorpTab[ctab.dataset.cgroup];
    state.lastCorpTab[corpGroupOf(k)[0]] = k;
    state.corpTab = k;
    go('corp');
    return;
  }
  const tab = t.closest('[data-tab]');
  if (tab) {
    let k = tab.dataset.tab;
    if (tab.dataset.group && state.lastTab[tab.dataset.group]) k = state.lastTab[tab.dataset.group];
    state.lastTab[groupOf(k)[0]] = k;
    go('char', { tab: k });
    return;
  }
  const tabGo = t.closest('[data-tab-go]');
  if (tabGo) { go('char', { tab: tabGo.dataset.tabGo }); return; }
  if (t.closest('[data-action="add"]') || t.closest('#add-char')) { addCharacter(); return; }
  const re = t.closest('[data-reauth]');
  if (re) { addCharacter(); return; }
  const rm = t.closest('[data-remove]');
  if (rm) { removeCharacter(Number(rm.dataset.remove)); return; }
});

$('#refresh').onclick = () => render(true);
$('#search-btn').onclick = () => openSearch();
$('#ov-toggle').onclick = async () => { const r = await api.overlay.toggle(); if (r.ok) toast(r.data ? 'Overlay on. Ctrl+Shift+O hides it, Ctrl+Shift+L locks it so clicks go through to EVE.' : 'Overlay closed'); };
document.addEventListener('keydown', e => {
  if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) { e.preventDefault(); render(true); }
});

api.onOverviewUpdate(list => {
  for (const o of list) state.overviews.set(o.id, o);
  renderSidebar();
});

// ================= Boot =================

function showUpdateBanner(u) {
  if (!u || document.getElementById('upd-banner')) return;
  const b = document.createElement('div');
  b.id = 'upd-banner';
  b.innerHTML = String(html`<span>EVE Toolkit <b>${u.version}</b> is available. <a href="#" id="upd-notes">What’s new</a></span>
    ${u.canInstall ? html`<button class="btn btn-primary" style="padding:4px 12px" id="upd-go">Update now</button>` : html`<a href="#" data-link="${u.url}" class="btn btn-primary" style="padding:4px 12px">Download</a>`}
    <button class="btn btn-ghost" style="padding:4px 10px" id="upd-x" title="Hide until next start">✕</button>`);
  document.getElementById('main').prepend(b);
  b.querySelector('#upd-x').onclick = () => b.remove();
  b.querySelector('#upd-notes').onclick = e => { e.preventDefault(); openUpdateModal(u, false); };
  const go = b.querySelector('#upd-go'); if (go) go.onclick = () => openUpdateModal(u, true);
}

// Release notes are markdown from GitHub: show headings and bullets as plain text, never as HTML.
function releaseNotesHtml(md) {
  const lines = String(md || '').split('\n').map(l => l.trimEnd()).filter((l, i, a) => l || (a[i - 1] && a[i - 1].trim()));
  if (!lines.length) return html`<div class="dim">No notes for this version.</div>`;
  const clean = t => t.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return html`<div style="max-height:46vh;overflow:auto;font-size:13px;line-height:1.55">${lines.map(l => /^#+\s/.test(l) ? html`<div style="font-weight:600;margin:8px 0 4px">${clean(l.replace(/^#+\s*/, ''))}</div>`
    : /^\s*[-*]\s/.test(l) ? html`<div style="display:flex;gap:8px;margin:2px 0"><span style="color:var(--accent)">•</span><span>${clean(l.replace(/^\s*[-*]\s*/, ''))}</span></div>`
    : html`<div style="margin:4px 0">${clean(l)}</div>`)}</div>`;
}

const updState = { st: null };
function drawUpdateProgress() {
  const box = document.getElementById('upd-prog'); if (!box) return;
  const st = updState.st || {};
  const btn = document.getElementById('upd-install');
  const label = { downloading: `Downloading… ${st.pct || 0}%`, verifying: 'Checking the download…', ready: 'Ready. EVE Toolkit will close and open again on the new version.', installing: 'Installing…', error: st.error || 'The update failed.' }[st.phase] || '';
  box.innerHTML = String(html`${st.phase && st.phase !== 'idle' ? html`<div class="bar ${st.phase === 'error' ? 'gold' : ''}" style="margin:12px 0 6px"><i style="width:${raw(String(st.phase === 'downloading' ? st.pct || 0 : 100))}%"></i></div>
    <div class="${st.phase === 'error' ? 'neg' : 'muted'}" style="font-size:12.5px">${label}</div>` : ''}`);
  if (btn) { btn.disabled = !['ready', 'error', 'idle', undefined].includes(st.phase); btn.textContent = st.phase === 'ready' ? 'Restart and update' : st.phase === 'error' ? 'Try again' : ['downloading', 'verifying'].includes(st.phase) ? 'Downloading…' : st.phase === 'installing' ? 'Restarting…' : 'Download and install'; }
}
api.update.onProgress(st => { updState.st = st; drawUpdateProgress(); });

async function openUpdateModal(u, start) {
  const s = await api.update.status(); updState.st = s.ok ? s.data : null;
  const m = openModal(`EVE Toolkit ${u.version}`, html`${releaseNotesHtml(u.notes)}
    ${u.canInstall ? html`<div class="dim" style="font-size:12px;margin-top:12px">The download is checked against the release checksum before anything changes. Your pilots, settings and data stay as they are.</div>` : html`<div class="notice" style="margin:12px 0 0">This copy can’t update itself. Download the new version and replace the old one.</div>`}
    <div id="upd-prog"></div>`, {
    wide: true,
    extraButtons: String(html`<button type="button" class="btn btn-ghost" data-link="${u.url}">Release page ↗</button>`)
  });
  const foot = m.querySelector('.modal-foot'); const close = foot.querySelector('[data-close]'); if (close) close.textContent = 'Later';
  if (u.canInstall) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-primary'; b.id = 'upd-install'; foot.appendChild(b);
    b.onclick = async () => {
      const st = updState.st || {};
      if (st.phase === 'ready') { b.disabled = true; const r = await api.update.install(); if (!r.ok) toast(r.error, true); return; }
      updState.st = { phase: 'downloading', pct: 0 }; drawUpdateProgress();
      const r = await api.update.prepare();
      if (!r.ok) { updState.st = { phase: 'error', error: r.error }; drawUpdateProgress(); return; }
      updState.st = r.data; drawUpdateProgress();
    };
    drawUpdateProgress();
    if (start && !(updState.st && ['downloading', 'verifying', 'ready'].includes(updState.st.phase))) b.click();
  }
}
api.onUpdate(showUpdateBanner);

(async function boot() {
  api.updateInfo().then(r => { if (r.ok && r.data) showUpdateBanner(r.data); });
  api.update.justUpdated().then(r => { if (r.ok && r.data) setTimeout(() => toast(`Updated to version ${r.data}`), 1500); });
  api.info().then(r => { if (r.ok) { document.title = 'EVE Toolkit ' + r.data.version; const b = document.querySelector('.brand-name'); if (b) b.title = 'Version ' + r.data.version; } });
  const [s, c] = await Promise.all([api.getSettings(), api.listCharacters()]);
  state.settings = s.ok ? s.data : {};
  applyTheme(state.settings.theme, state.settings.themeAccent);
  setStreamer(!!state.settings.streamer, false);
  if (api.piWatch) api.piWatch.cfg().then(r => { if (r.ok) state.piSnooze = r.data.snooze; });
  { const b = document.getElementById('streamer-btn'); if (b) b.onclick = () => setStreamer(!document.documentElement.hasAttribute('data-streamer')); }
  state.characters = c.ok ? c.data : [];
  if (state.settings.themeAuto && state.settings.themeAuto.enabled) refreshTheme();
  renderSidebar();
  renderTopbar();
  render();
  updateServerStatus();
  setInterval(updateServerStatus, 5 * 60 * 1000);
  setTimeout(checkGameDataOnStart, 2500);
})();

// ================= Game data check on start =================

const sdePromptState = { asked: false };
async function checkGameDataOnStart() {
  if (sdePromptState.asked || !state.settings.clientId) return;   // the welcome screen covers first-time setup
  const r = await api.sde.check();
  if (!r.ok || !r.data || ['ok', 'busy'].includes(r.data.state)) return;
  const c = r.data;
  if (c.state === 'outdated' && Number(state.settings.sdeSkipBuild) >= Number(c.latest)) return;
  if (document.getElementById('modal')) { setTimeout(checkGameDataOnStart, 15000); return; }   // don't cover something the user is doing
  sdePromptState.asked = true;
  const why = {
    missing: html`EVE Toolkit needs EVE's game data for planners, routes, the item database, the fit checker and more. It's a one-time download from CCP and takes a few minutes.`,
    incomplete: html`This version of EVE Toolkit uses parts of the game data your copy doesn't have yet: planets for Nearby planets, and full item details for the fit checker and item database. Updating downloads it again from CCP and takes a few minutes.`,
    outdated: html`CCP has released new game data${c.released ? html` (${fmtDay(c.released)})` : ''}. Updating brings in ships, items and changes from the latest patch. It takes a few minutes.`
  }[c.state];
  openModal({ missing: 'Download game data?', incomplete: 'Update game data?', outdated: 'New game data available' }[c.state], html`
    <p class="muted" style="margin-top:0">${why}</p>
    <div id="sdp-progress" hidden><div id="sde-msg" class="muted" style="font-size:12.5px">Starting…</div><div class="bar" style="margin-top:8px"><i id="sde-bar" style="width:2%"></i></div>
      <div class="dim" style="font-size:12px;margin-top:8px">You can close this and keep using the app; the update carries on in the background.</div></div>
    <div id="sdp-err"></div>`, {
    submit: c.state === 'missing' ? 'Download now' : 'Update now',
    extraButtons: c.state === 'outdated' ? '<button type="button" class="btn btn-ghost" id="sdp-skip" title="Don\'t ask again until CCP releases another update">Skip this update</button>' : '',
    onSubmit: async () => {
      $('#sdp-progress').hidden = false; $('#sdp-err').innerHTML = '';
      const btn = document.querySelector('#modal button[type="submit"]'); if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
      const u = await api.sde.update(false);
      if (!u.ok) {
        $('#sdp-err').innerHTML = String(html`<div class="error" style="margin-top:10px">${u.error}<br><span class="muted">If the download keeps failing, download the JSONL zip from developers.eveonline.com/static-data yourself and use Settings → Game data → Import zip.</span></div>`);
        if (btn) { btn.disabled = false; btn.textContent = 'Try again'; }
        return true;   // keep the window open
      }
      toast('Game data is up to date');
      if (state.view !== 'settings') render();
    }
  });
  const later = document.querySelector('#modal .modal-foot [data-close]'); if (later) later.textContent = 'Later';
  const skip = document.getElementById('sdp-skip');
  if (skip) skip.onclick = async () => { await api.setSettings({ sdeSkipBuild: c.latest }); state.settings.sdeSkipBuild = c.latest; closeModal(); toast("Skipped. You'll be asked again when CCP releases the next update."); };
}
