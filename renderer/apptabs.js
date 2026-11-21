'use strict';
/* Browser-style tabs. Each tab remembers a page (view, pilot, tool or corp tab). Clicking around changes
   the page in the current tab; Ctrl+click or middle-click opens it in a new tab. Pinned tabs sit at the
   left, can't be closed by accident and come back, on the page they were showing, when the app restarts.
   Keys: Ctrl+T new tab, Ctrl+W close, Ctrl+Tab / Ctrl+Shift+Tab next / previous, Ctrl+1–9 jump. */

const appTabs = { list: [], active: null, seq: 0, restoring: false };
const TAB_KEYS = ['view', 'charId', 'tab', 'toolsTab', 'toolsPinned', 'corpTab', 'piTab', 'directorId'];
const capLoc = () => Object.fromEntries(TAB_KEYS.map(k => [k, state[k]]));
const applyLoc = loc => { for (const k of TAB_KEYS) if (loc && loc[k] !== undefined) state[k] = loc[k]; state.mailSel = null; };
const curTab = () => appTabs.list.find(t => t.id === appTabs.active) || null;

function tabLabelFrom(groups, key) { for (const [, items] of groups || []) for (const [k, l] of items) if (k === key) return l; return null; }
function tabTitle(loc) {
  if (!loc) return 'New tab';
  if (loc.view === 'char') {
    const c = (state.characters || []).find(x => x.id === loc.charId);
    const t = typeof GROUPS !== 'undefined' ? tabLabelFrom(GROUPS, loc.tab) : null;
    return `${c ? c.name : 'Pilot'}${t ? ' · ' + t : ''}`;
  }
  if (loc.view === 'tools') return (typeof TOOLS_GROUPS !== 'undefined' && tabLabelFrom(TOOLS_GROUPS, loc.toolsTab)) || 'Tools';
  if (loc.view === 'corp') return (typeof CORP_GROUPS !== 'undefined' && tabLabelFrom(CORP_GROUPS, loc.corpTab)) || 'Corporation';
  const v = typeof VIEW_ENTRIES !== 'undefined' ? VIEW_ENTRIES.find(x => x[0] === loc.view) : null;
  return v ? v[1] : ({ settings: 'Settings', piPlanner: 'PI planner' }[loc.view] || loc.view);
}
const tabIcon = loc => (loc && loc.view === 'char' && loc.charId ? `<img src="${portrait(loc.charId, 32)}" alt="">` : '');

function saveTabs() {
  try {
    const keep = appTabs.list.filter(t => t.pinned).map(t => ({ loc: t.loc, pinned: true }));
    const a = curTab();
    localStorage.setItem('appTabs', JSON.stringify({ tabs: keep, active: a && a.pinned ? appTabs.list.filter(t => t.pinned).indexOf(a) : -1 }));
  } catch { /* storage off */ }
}

/** Startup: bring back pinned tabs, then open on the last pinned tab that was active (or a fresh one). */
function restoreTabs() {
  let saved = null; try { saved = JSON.parse(localStorage.getItem('appTabs') || 'null'); } catch {}
  const valid = loc => loc && loc.view && (loc.view !== 'char' || (state.characters || []).some(c => c.id === loc.charId));
  for (const t of (saved && saved.tabs) || []) if (valid(t.loc)) appTabs.list.push({ id: ++appTabs.seq, loc: t.loc, pinned: true });
  const pinned = appTabs.list.slice();
  if (saved && saved.active >= 0 && pinned[saved.active]) { appTabs.active = pinned[saved.active].id; applyLoc(pinned[saved.active].loc); }
  else { const t = { id: ++appTabs.seq, loc: capLoc(), pinned: false }; appTabs.list.push(t); appTabs.active = t.id; }
  drawTabs();
}

/** Called at the start of every render: the current tab follows the page. */
function syncTab() {
  let t = curTab();
  if (!t) { t = { id: ++appTabs.seq, loc: null, pinned: false }; appTabs.list.push(t); appTabs.active = t.id; }
  t.loc = capLoc();
  drawTabs();
  if (t.pinned) saveTabs();
}

function switchTab(id) {
  const t = appTabs.list.find(x => x.id === id); if (!t || id === appTabs.active) return;
  const cur = curTab(); if (cur) { cur.loc = capLoc(); cur.scroll = content().scrollTop; }
  appTabs.active = id;
  applyLoc(t.loc);
  renderSidebar(); renderTopbar(); render();
  if (t.scroll) setTimeout(() => { if (appTabs.active === id) content().scrollTop = t.scroll; }, 400);
  saveTabs();
}
/** New tab, next to the current one (pinned tabs stay at the left). loc defaults to the current page. */
function newTab(loc, activate = true) {
  const t = { id: ++appTabs.seq, loc: loc || capLoc(), pinned: false };
  const i = appTabs.list.findIndex(x => x.id === appTabs.active);
  const after = Math.max(i, appTabs.list.filter(x => x.pinned).length - 1);
  appTabs.list.splice(after + 1, 0, t);
  if (activate) { const cur = curTab(); if (cur) { cur.loc = capLoc(); cur.scroll = content().scrollTop; } appTabs.active = t.id; applyLoc(t.loc); }
  drawTabs();
  return t;
}
function closeTab(id) {
  const i = appTabs.list.findIndex(x => x.id === id); if (i < 0) return;
  const t = appTabs.list[i];
  if (t.pinned) { toast('Unpin the tab first to close it'); return; }
  if (appTabs.list.length === 1) { applyLoc({ view: 'dashboard' }); go('dashboard'); return; }
  appTabs.list.splice(i, 1);
  if (appTabs.active === id) { const n = appTabs.list[Math.min(i, appTabs.list.length - 1)]; appTabs.active = null; switchTab(n.id); }
  else drawTabs();
  saveTabs();
}
function togglePinTab(id) {
  const t = appTabs.list.find(x => x.id === id); if (!t) return;
  t.pinned = !t.pinned;
  // pinned tabs first, keeping their order
  appTabs.list = [...appTabs.list.filter(x => x.pinned), ...appTabs.list.filter(x => !x.pinned)];
  drawTabs(); saveTabs();
  toast(t.pinned ? 'Pinned: this tab stays open and comes back when the app restarts' : 'Unpinned');
}

function drawTabs() {
  const bar = document.getElementById('apptabs'); if (!bar) return;
  bar.innerHTML = appTabs.list.map(t => `<div class="apptab ${t.id === appTabs.active ? 'active' : ''} ${t.pinned ? 'pinned' : ''}" data-apptab="${t.id}" title="${esc(tabTitle(t.loc))}${t.pinned ? ' (pinned)' : ''}">
      ${tabIcon(t.loc)}<span class="at-title">${esc(tabTitle(t.loc))}</span>
      <button class="at-pin" data-atpin="${t.id}" title="${t.pinned ? 'Unpin' : 'Pin: keep this tab and reopen it when the app starts'}">${t.pinned ? '📌' : '⚲'}</button>
      ${t.pinned ? '' : `<button class="at-x" data-atclose="${t.id}" title="Close (Ctrl+W)">×</button>`}</div>`).join('') +
    '<button class="apptab-new" data-atnew title="New tab (Ctrl+T)">+</button>';
}

// Clicks on the tab strip
document.addEventListener('click', e => {
  const t = e.target;
  const pin = t.closest && t.closest('[data-atpin]'); if (pin) { e.stopPropagation(); togglePinTab(Number(pin.dataset.atpin)); return; }
  const x = t.closest && t.closest('[data-atclose]'); if (x) { e.stopPropagation(); closeTab(Number(x.dataset.atclose)); return; }
  if (t.closest && t.closest('[data-atnew]')) { newTab({ view: 'dashboard' }); renderSidebar(); renderTopbar(); render(); return; }
  const tab = t.closest && t.closest('[data-apptab]'); if (tab) { switchTab(Number(tab.dataset.apptab)); return; }
}, true);

// Ctrl+click (or Cmd+click) on a page link opens it in a new tab: copy this tab, then let the click navigate the copy
const TAB_NAV = '.side-link, .char-item, [data-open], [data-ttab], [data-ctab], [data-tab], [data-tab-go], [data-ctab-go], [data-go]';
document.addEventListener('click', e => {
  if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return;
  const el = e.target.closest && e.target.closest(TAB_NAV);
  if (!el || el.closest('#apptabs')) return;
  newTab();   // the normal handler then navigates the new tab
}, true);
// Middle-click: same, and closes a tab when used on the strip
document.addEventListener('auxclick', e => {
  if (e.button !== 1) return;
  const at = e.target.closest && e.target.closest('[data-apptab]');
  if (at) { e.preventDefault(); closeTab(Number(at.dataset.apptab)); return; }
  const el = e.target.closest && e.target.closest(TAB_NAV);
  if (!el) return;
  e.preventDefault();
  newTab();
  el.click();
});
document.addEventListener('mousedown', e => { if (e.button === 1 && e.target.closest && e.target.closest(TAB_NAV + ', [data-apptab]')) e.preventDefault(); });   // no autoscroll

document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 't' && !e.shiftKey) { e.preventDefault(); newTab({ view: 'dashboard' }); renderSidebar(); renderTopbar(); render(); return; }
  if (e.key === 'Tab') {
    e.preventDefault();
    const i = appTabs.list.findIndex(x => x.id === appTabs.active); const n = appTabs.list.length; if (n < 2) return;
    switchTab(appTabs.list[(i + (e.shiftKey ? -1 : 1) + n) % n].id); return;
  }
  if (/^[1-9]$/.test(e.key) && !e.shiftKey) { const t = e.key === '9' ? appTabs.list[appTabs.list.length - 1] : appTabs.list[Number(e.key) - 1]; if (t) { e.preventDefault(); switchTab(t.id); } }
});
if (window.api && api.onCloseTab) api.onCloseTab(() => { if (appTabs.active) closeTab(appTabs.active); });
