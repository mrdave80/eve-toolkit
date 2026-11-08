/* Find anything: Ctrl+K or the search button. Tools, pilots, items and wormhole systems. */
const SEARCH_EXTRA = {
  't-market': 'price order book jita hub', 't-appraisal': 'value evepraisal janice paste cargo fit', 't-orders': 'undercut outbid my orders', 't-arbitrage': 'hauling hub profit',
  't-lp': 'loyalty points isk per lp', 't-trade': 'tycoon profit trading fifo margin', 't-bargain': 'contracts cheap deals snipe', 't-items': 'item info stats eve ref database ship module',
  't-build': 'manufacturing industry fuzzwork cost', 't-invent': 'invention t2 decryptor', 't-reprocess': 'refine ore minerals compress', 't-moon': 'moon survey probe scan r64 athanor tatara',
  't-route': 'route gate camp gank dotlan safe autopilot', 't-courier': 'courier hauling contracts', 't-hunt': 'hunting ratting safe pvp targets', 't-jump': 'jump capital fatigue range jf',
  't-universe': 'sov incursion thera turnur faction warfare', 't-pilot': 'pilot intel zkill evewho threat grade', 't-whres': 'wormhole residents eviction who lives j-space', 't-shame': 'wall of shame fails bad fits oof',
  't-intel': 'intel channel watch alerts', 't-local': 'local dscan d-scan clipboard', 't-combat': 'combat log dps damage', 't-networth': 'net worth assets wallet history', 't-income': 'income journal isk',
  't-pve': 'ratting abyss filament isk per hour ess bounty', 't-farm': 'skill farm extractor injector plex mct omega', 't-charval': 'character bazaar sell value skillboard', 't-insure': 'insurance platinum payout'
};
const VIEW_ENTRIES = [
  ['dashboard', 'All pilots', 'home overview'], ['trainingAll', 'Training board', 'skill queue'], ['industryAll', 'Industry board', 'jobs slots'], ['planetsAll', 'Planets board', 'pi extractors colonies'],
  ['liveMap', 'Live map', 'region map kills heat sov'], ['daily', 'Daily rewards', 'login reward daily goals monthly track news downtime'], ['wormholes', 'Wormhole mapper', 'chain signatures tripwire pathfinder'],
  ['piPlanner', 'PI planner', 'planetary interaction chain'], ['corp', 'Corporation', 'corp director members srp moons doctrines'], ['settings', 'Settings', 'theme alerts phone speech notifications game data'],
  ['about', 'About & support', 'diagnostics bug report donate mr frank']
];
const searchState = { open: false, sel: 0, results: [], token: 0 };

function searchIndex() {
  const out = VIEW_ENTRIES.map(([v, label, kw]) => ({ kind: 'Page', label, sub: '', kw, go: () => go(v) }));
  for (const [group, tabs] of TOOLS_GROUPS) for (const [k, label] of tabs) out.push({ kind: 'Tool', label, sub: 'Tools · ' + group, kw: (SEARCH_EXTRA[k] || '') + ' ' + group, go: () => { state.toolsTab = k; go('tools'); } });
  if (typeof CORP_GROUPS !== 'undefined') for (const [group, tabs] of CORP_GROUPS) for (const [k, label] of tabs) out.push({ kind: 'Corp', label, sub: 'Corporation · ' + group, kw: group, go: () => { state.corpTab = k; go('corp'); } });
  for (const c of state.characters) out.push({ kind: 'Pilot', label: c.name, sub: 'Pilot', kw: '', img: portrait(c.id, 32), go: () => go('char', { charId: c.id, tab: 'summary' }) });
  return out;
}

function scoreEntry(e, q) {
  const l = e.label.toLowerCase();
  if (l === q) return 100;
  if (l.startsWith(q)) return 80;
  if (l.split(/\s+/).some(w => w.startsWith(q))) return 60;
  if (l.includes(q)) return 45;
  if (q.split(/\s+/).every(w => (l + ' ' + e.kw + ' ' + e.sub).toLowerCase().includes(w))) return 30;
  return 0;
}

function openSearch() {
  if (searchState.open) return;
  searchState.open = true; searchState.sel = 0; searchState.results = [];
  if (state.settings && !state.settings.usedSearch) { state.settings.usedSearch = true; api.setSettings({ usedSearch: true }); }
  const box = document.createElement('div');
  box.id = 'search-pal';
  box.innerHTML = String(html`<div class="sp-back"></div><div class="sp-box"><input id="sp-q" type="text" placeholder="Find a tool, pilot, item or J-sig…" spellcheck="false" autocomplete="off"><div id="sp-list"></div>
    <div class="sp-foot dim">↑ ↓ to move · Enter to open · Esc to close</div></div>`);
  document.body.appendChild(box);
  box.querySelector('.sp-back').onclick = closeSearch;
  const inp = $('#sp-q');
  inp.oninput = () => runSearch(inp.value);
  inp.onkeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); searchState.sel = Math.min(searchState.results.length - 1, searchState.sel + 1); drawSearch(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); searchState.sel = Math.max(0, searchState.sel - 1); drawSearch(); }
    else if (e.key === 'Enter') { e.preventDefault(); pickSearch(searchState.sel); }
  };
  runSearch('');
  inp.focus();
}
function closeSearch() { const b = document.getElementById('search-pal'); if (b) b.remove(); searchState.open = false; }
function pickSearch(i) { const r = searchState.results[i]; if (!r) return; closeSearch(); r.go(); }

async function runSearch(raw) {
  const q = raw.trim().toLowerCase();
  const token = ++searchState.token;
  const idx = searchIndex();
  let res = q ? idx.map(e => ({ e, s: scoreEntry(e, q) })).filter(x => x.s).sort((a, b) => b.s - a.s).map(x => x.e).slice(0, 8)
    : idx.filter(e => e.kind === 'Page').slice(0, 8);
  if (/^j\d{6}$/i.test(q)) res.unshift({ kind: 'Wormhole', label: q.toUpperCase(), sub: 'Check who lives there', kw: '', go: () => { whResState.q = q.toUpperCase(); whResState.result = null; state.toolsTab = 't-whres'; go('tools'); setTimeout(() => { const b = document.getElementById('wr-go'); if (b) b.click(); }, 150); } });
  searchState.results = res; searchState.sel = 0; drawSearch();
  if (q.length >= 3) {
    const r = await api.items.search(q);
    if (token !== searchState.token || !searchState.open || !r.ok) return;
    const items = r.data.slice(0, 6).map(it => ({ kind: 'Item', label: it.name, sub: it.group, kw: '', img: `https://images.evetech.net/types/${it.id}/icon?size=32`, go: () => { itemState.pending = it.id; state.toolsTab = 't-items'; go('tools'); } }));
    searchState.results = [...res, ...items]; drawSearch();
  }
}

function drawSearch() {
  const list = document.getElementById('sp-list'); if (!list) return;
  list.innerHTML = String(searchState.results.length ? html`${searchState.results.map((r, i) => html`<div class="sp-row ${i === searchState.sel ? 'sel' : ''}" data-sp="${i}">
      ${r.img ? html`<img src="${r.img}" width="22" height="22" alt="">` : html`<span class="sp-ico">${{ Page: '◈', Tool: '⚙', Corp: '⛨', Pilot: '◉', Item: '▣', Wormhole: '◎' }[r.kind] || '•'}</span>`}
      <span class="sp-label">${r.label}</span><span class="sp-sub dim">${r.sub || r.kind}</span><span class="sp-kind">${r.kind}</span></div>`)}` : html`<div class="dim" style="padding:14px">Nothing found.</div>`);
  list.querySelectorAll('[data-sp]').forEach(el => { el.onclick = () => pickSearch(Number(el.dataset.sp)); el.onmouseenter = () => { searchState.sel = Number(el.dataset.sp); list.querySelectorAll('.sp-row').forEach(x => x.classList.toggle('sel', x === el)); }; });
  const s = list.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchState.open ? closeSearch() : openSearch(); }
});

// ================= Getting started =================

async function gettingStartedHtml() {
  const s = state.settings || {};
  if (s.onboardingDone) return '';
  const sde = await api.sde.info();
  const steps = [
    ['EVE application registered', !!s.clientId, null],
    ['Add your pilots', state.characters.length > 0, 'add'],
    ['Download the game data (planners, routes, item database)', !!(sde.ok && sde.data.ready), 'sde'],
    ['Pick a theme that suits where you fly', !!s.theme, 'theme'],
    ['Set up intel channels, if you fly in low or null', !!(s.intel && s.intel.enabled), 'intel'],
    ['Get alerts on your phone (optional)', !!(s.phone && s.phone.enabled), 'phone'],
    ['Press Ctrl+K to find any tool, pilot or item', !!s.usedSearch, 'search']
  ];
  const done = steps.filter(x => x[1]).length;
  return html`<div class="panel" id="gs-card" style="margin-bottom:16px"><div style="display:flex;align-items:center;gap:10px"><h3 style="margin:0;flex:1">Getting started · ${done} of ${steps.length}</h3><button class="btn btn-ghost" id="gs-hide" style="padding:3px 10px;font-size:12px">Hide</button></div>
    <div class="bar" style="margin:10px 0 12px"><i style="width:${Math.round(done / steps.length * 100)}%"></i></div>
    <div class="grid grid-2" style="gap:4px 24px">${steps.map(([label, ok, act]) => html`<div style="display:flex;gap:8px;align-items:center;padding:3px 0">
      <span style="color:${raw(ok ? 'var(--green)' : 'var(--dim)')}">${ok ? '✓' : '○'}</span>${ok ? html`<span class="muted">${label}</span>` : html`<a href="#" data-gs="${act}">${label}</a>`}</div>`)}</div></div>`;
}

function wireGettingStarted() {
  const h = document.getElementById('gs-hide'); if (h) h.onclick = async () => { await api.setSettings({ onboardingDone: true }); state.settings.onboardingDone = true; document.getElementById('gs-card').remove(); };
  document.querySelectorAll('[data-gs]').forEach(a => a.onclick = e => {
    e.preventDefault();
    const k = a.dataset.gs;
    if (k === 'add') document.getElementById('add-char').click();
    else if (k === 'search') openSearch();
    else if (k === 'intel') { state.toolsTab = 't-intel'; go('tools'); }
    else go('settings');
  });
}
