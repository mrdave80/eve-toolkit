'use strict';
/* Alerts inbox: the bell in the top bar keeps the last two days of alerts. Clicking one opens the page
   it's about; "Alert types" switches each kind on or off. */

const ALERT_TYPES = {
  attack: { label: 'Under attack', color: 'var(--red)', go: () => { state.toolsTab = 't-combat'; go('tools'); } },
  intel: { label: 'Intel, Local and kill spikes', color: 'var(--red)', go: () => { state.toolsTab = 't-intel'; go('tools'); } },
  structures: { label: 'Structures and moon chunks', color: 'var(--gold)', go: () => { state.corpTab = 'c-structures'; go('corp'); } },
  corp: { label: 'Corp notifications', color: 'var(--gold)', go: a => (a.pilotId ? go('char', { charId: a.pilotId, tab: 'notifications' }) : go('corp')) },
  ops: { label: 'Ops and timers', color: 'var(--gold)', go: () => { state.corpTab = 'c-timers'; go('corp'); } },
  timers: { label: 'Clone jump, fatigue and incursions', color: 'var(--accent)', go: a => (a.pilotId ? go('char', { charId: a.pilotId, tab: 'clones' }) : go('dashboard')) },
  industry: { label: 'Industry jobs', color: 'var(--accent)', go: a => (a.pilotId ? go('char', { charId: a.pilotId, tab: 'industry' }) : go('industryAll')) },
  planets: { label: 'Planets (PI)', color: 'var(--accent)', go: () => go('planetsAll') },
  market: { label: 'Market orders and contracts', color: 'var(--accent)', go: () => { state.toolsTab = 't-orders'; go('tools'); } },
  prices: { label: 'Price alerts', color: 'var(--accent)', go: () => { state.toolsTab = 't-prices'; go('tools'); } },
  wormhole: { label: 'Wormhole mapper', color: 'var(--purple)', go: () => go('wormholes') },
  daily: { label: 'Daily reset, goals and EVE news', color: 'var(--green)', go: () => go('daily') },
  app: { label: 'App updates', color: 'var(--green)', go: () => go('about') },
  general: { label: 'Other', color: 'var(--dim)', go: () => go('dashboard') }
};
const alertState = { list: [], open: false, types: null };

function alertUnread() { return alertState.list.filter(a => !a.read).length; }
function drawAlertCount() {
  const c = document.getElementById('alert-count'); if (!c) return;
  const n = alertUnread(); c.hidden = !n; c.textContent = n > 99 ? '99+' : String(n);
}
function alertAgo(t) { const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; }

function drawAlertPanel() {
  let p = document.getElementById('alert-panel');
  if (!alertState.open) { if (p) p.remove(); return; }
  if (!p) { p = document.createElement('div'); p.id = 'alert-panel'; document.body.appendChild(p); }
  const list = alertState.list;
  p.innerHTML = String(html`<div class="ap-head"><b style="flex:1">Alerts</b><button class="btn btn-ghost" style="padding:2px 9px;font-size:12px" id="ap-types">Alert types</button><button class="btn btn-ghost" style="padding:2px 9px;font-size:12px" id="ap-clear">Clear</button></div>
    <div class="ap-list">${list.length ? list.map(a => { const t = ALERT_TYPES[a.category] || ALERT_TYPES.general; return html`<div class="ap-item ${a.read ? '' : 'unread'}" data-ap="${a.id}">
      <span class="ap-dot" style="background:${raw(t.color)}"></span><div style="flex:1;min-width:0"><div style="font-size:13px"><b>${a.title}</b></div><div class="muted" style="font-size:12.5px">${a.body}</div>
      <div class="dim" style="font-size:11px">${t.label}${a.silenced ? ' · quiet hours, not shown' : ''}</div></div><span class="dim" style="font-size:11.5px">${alertAgo(a.at)}</span></div>`; })
      : html`<div class="muted" style="padding:20px 14px">No alerts in the last two days.</div>`}</div>`);
  p.querySelectorAll('[data-ap]').forEach(el => el.onclick = () => { const a = list.find(x => x.id === el.dataset.ap); if (!a) return; alertState.open = false; drawAlertPanel(); (ALERT_TYPES[a.category] || ALERT_TYPES.general).go(a); });
  p.querySelector('#ap-clear').onclick = async () => { await api.alerts.clear(); alertState.list = []; drawAlertCount(); drawAlertPanel(); };
  p.querySelector('#ap-types').onclick = () => openAlertTypes();
}

async function openAlertTypes() {
  const cur = (state.settings && state.settings.alertTypes) || {};
  alertState.open = false; drawAlertPanel();
  openModal('Alert types', html`<div class="muted" style="font-size:12.5px;margin-bottom:10px">Untick a kind of alert to stop it completely: no Windows, phone or spoken alert, and nothing in the inbox. Quiet hours and per-pilot muting are in Settings → Notifications.</div>
    ${Object.entries(ALERT_TYPES).map(([k, t]) => html`<label class="check"><input type="checkbox" data-at="${k}" ${raw(cur[k] === false ? '' : 'checked')}> <span class="ap-dot" style="display:inline-block;margin:0 6px 0 0;background:${raw(t.color)}"></span>${t.label}</label>`)}`, {
    submit: 'Save', onSubmit: async () => {
      const patch = {}; document.querySelectorAll('[data-at]').forEach(i => { patch[i.dataset.at] = i.checked; });
      const r = await api.alerts.types(patch); if (!r.ok) { toast(r.error, true); return true; }
      if (state.settings) state.settings.alertTypes = r.data; toast('Alert types saved');
    }
  });
}

async function initAlerts() {
  const r = await api.alerts.list(); if (r.ok) alertState.list = r.data;
  drawAlertCount();
  const b = document.getElementById('alert-btn');
  if (b) b.onclick = async e => {
    e.stopPropagation();
    alertState.open = !alertState.open; drawAlertPanel();
    if (alertState.open && alertUnread()) { await api.alerts.read(); setTimeout(() => { alertState.list.forEach(a => { a.read = true; }); drawAlertCount(); }, 1500); }
  };
  document.addEventListener('click', e => { if (alertState.open && !e.target.closest('#alert-panel') && !e.target.closest('#alert-btn')) { alertState.open = false; drawAlertPanel(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && alertState.open) { alertState.open = false; drawAlertPanel(); } });
  api.alerts.onNew(a => { alertState.list.unshift(a); alertState.list.length = Math.min(alertState.list.length, 300); drawAlertCount(); if (alertState.open) drawAlertPanel(); });
}
