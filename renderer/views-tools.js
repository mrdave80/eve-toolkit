'use strict';
/* Tools: market, industry, navigation, intel, finance. Helpers from app.js & friends. */

const TOOLS_GROUPS = [
  ['Market', [['t-market', 'Browser'], ['t-appraisal', 'Appraisal'], ['t-orders', 'My Orders'], ['t-arbitrage', 'Hub Arbitrage'], ['t-lp', 'LP Store'], ['t-trade', 'Trade Profit'], ['t-prices', 'Price Alerts'], ['t-bargain', 'Contract Bargains'], ['t-items', 'Item Database']]],
  ['Industry', [['t-build', 'Build Calculator'], ['t-wtb', 'What to Build'], ['t-invent', 'Invention'], ['t-reprocess', 'Reprocessing'], ['t-ores', 'Ore Values'], ['t-moon', 'Moon Scan'], ['t-assets', 'Asset Finder']]],
  ['Navigation', [['t-route', 'Route Planner'], ['t-courier', 'Courier Contracts'], ['t-hunt', 'Hunting & Ratting'], ['t-agents', 'Agent Finder'], ['t-jump', 'Jump Planner'], ['t-universe', 'Universe']]],
  ['Intel', [['t-pilot', 'Pilot Intel'], ['t-sysintel', 'System Intel'], ['t-whres', 'Wormhole Residents'], ['t-shame', 'Wall of Shame'], ['t-intel', 'Intel Watch'], ['t-local', 'Local & D-scan'], ['t-combat', 'Combat Log']]],
  ['Fitting', [['t-fit', 'Fit Checker']]],
  ['Pilots', [['t-compare', 'Compare Skills']]],
  ['Client', [['t-eveset', 'Copy EVE Settings']]],
  ['Finance', [['t-networth', 'Net Worth'], ['t-income', 'Income'], ['t-pve', 'Ratting & Abyss'], ['t-farm', 'Skill Farm'], ['t-charval', 'Character Value'], ['t-insure', 'Insurance']]]
];
const toolsGroupOf = tab => TOOLS_GROUPS.find(g => g[1].some(t => t[0] === tab)) || TOOLS_GROUPS[0];
const HUB_NAMES = ['Jita', 'Amarr', 'Dodixie', 'Rens', 'Hek'];

const toolState = {
  hub: 'Jita',
  build: { productTypeId: null, runs: 10, me: 10, te: 20, structure: 'raitaru', rig: 't1', security: 'hs', systemName: '', facilityTax: 1, build: [], componentMe: 10, componentTe: 20, pilotId: null },
  invent: { productTypeId: null, decryptor: 'none', pilotId: null },
  market: { typeId: null },
  appraisal: { text: '' },
  reprocess: { text: '', structure: 'npc', base: 50, rig: 0, security: 'hs', reprocessing: 5, efficiency: 5, specific: 5, implant: 0, scrapmetal: 4 },
  arb: { from: 'Jita', to: 'Amarr', tax: 3.6, list: '' },
  lp: { corpId: null }
};

const hubSelect = (id, val) => html`<select id="${id}" class="crumb-select">${HUB_NAMES.map(h => html`<option ${raw(h === val ? 'selected' : '')}>${h}</option>`)}</select>`;
const pilotSelect = (id, val, none = 'Max skills (V)') => html`<select id="${id}" class="crumb-select"><option value="">${none}</option>${state.characters.filter(c => !c.needsReauth).map(c => html`<option value="${c.id}" ${raw(c.id === val ? 'selected' : '')}>${c.name}</option>`)}</select>`;
const pct = v => v === null || v === undefined || !isFinite(v) ? '—' : (v * 100).toFixed(1) + '%';
const iskCell = (v, cls = '') => html`<span class="num ${cls}">${v === null || v === undefined ? '—' : fmtCompact(v)}</span>`;

async function renderTools(stillCurrent) {
  const tab = state.toolsTab || 't-market';
  const needsSde = ['t-shame', 't-whres', 't-hunt', 't-courier', 't-market', 't-appraisal', 't-arbitrage', 't-build', 't-invent', 't-reprocess', 't-ores', 't-assets', 't-wtb', 't-agents', 't-sysintel', 't-route', 't-jump', 't-intel', 't-local'];
  if (needsSde.includes(tab)) {
    const info = await api.sde.info();
    if (!info.ok || !info.data.ready) return setContent(needSdeView('This tool'));
  }
  const views = {
    't-market': tMarket, 't-appraisal': tAppraisal, 't-orders': tOrders, 't-arbitrage': tArbitrage, 't-lp': tLp,
    't-build': tBuild, 't-invent': tInvent, 't-reprocess': tReprocess,
    't-courier': () => tCourier(), 't-hunt': () => tHunt(), 't-route': () => (typeof tRoute === 'function' ? tRoute() : null), 't-jump': () => (typeof tJump === 'function' ? tJump() : null), 't-universe': () => (typeof tUniverse === 'function' ? tUniverse(stillCurrent) : null),
    't-pilot': tPilot, 't-whres': () => tWhRes(), 't-shame': () => tShame(), 't-intel': () => (typeof tIntel === 'function' ? tIntel() : null), 't-local': () => (typeof tLocal === 'function' ? tLocal() : null), 't-combat': () => (typeof tCombat === 'function' ? tCombat() : null),
    't-fit': () => tFit(),
    't-items': () => tItems(), 't-bargain': () => tBargains(), 't-charval': () => tCharValue(stillCurrent),
    't-trade': () => tTrade(stillCurrent), 't-assets': () => tAssetFinder(), 't-wtb': () => tWhatToBuild(), 't-agents': () => tAgents(), 't-sysintel': () => tSysIntel(), 't-ores': () => tOres(), 't-eveset': () => tEveSettings(), 't-compare': () => tCompareSkills(), 't-prices': () => tPriceWatch(), 't-moon': () => tMoon(),
    't-farm': () => tFarm(stillCurrent), 't-insure': () => tInsure(stillCurrent),
    't-pve': () => tPve(), 't-networth': () => (typeof tNetworth === 'function' ? tNetworth(stillCurrent) : null), 't-income': () => (typeof tIncome === 'function' ? tIncome(stillCurrent) : null)
  };
  return (views[tab] || tMarket)(stillCurrent);
}

// ================= Charts =================

function lineChart(series, { w = 820, h = 220, fmtY = fmtCompact, bars = null } = {}) {
  const pts = series.flatMap(s => s.points);
  if (!pts.length) return html`<div class="muted">No data</div>`;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y).filter(y => y !== null && isFinite(y));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) * 0.98, y1 = Math.max(...ys) * 1.02 || 1;
  const L = 64, R = 12, T = 12, B = 26;
  const X = x => L + (x1 === x0 ? 0 : (x - x0) / (x1 - x0)) * (w - L - R);
  const Y = y => T + (1 - (y - y0) / ((y1 - y0) || 1)) * (h - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => y0 + f * (y1 - y0));
  const xt = [0, 0.33, 0.66, 1].map(f => x0 + f * (x1 - x0));
  let barSvg = '';
  if (bars && bars.length) {
    const bm = Math.max(...bars.map(b => b.y)) || 1;
    const bw = Math.max(1, (w - L - R) / bars.length - 1);
    barSvg = bars.map(b => `<rect x="${X(b.x) - bw / 2}" y="${h - B - (b.y / bm) * (h - T - B) * 0.35}" width="${bw}" height="${(b.y / bm) * (h - T - B) * 0.35}" class="cbar"/>`).join('');
  }
  return raw(`<svg viewBox="0 0 ${w} ${h}" class="chart" preserveAspectRatio="none">
    ${ticks.map(t => `<line x1="${L}" x2="${w - R}" y1="${Y(t)}" y2="${Y(t)}" class="cgrid"/><text x="${L - 6}" y="${Y(t) + 4}" class="cy">${esc(fmtY(t))}</text>`).join('')}
    ${xt.map(t => `<text x="${X(t)}" y="${h - 8}" class="cx">${esc(new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }))}</text>`).join('')}
    ${barSvg}
    ${series.map((s, i) => `<path d="${s.points.filter(p => p.y !== null).map((p, j) => (j ? 'L' : 'M') + X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ')}" class="cline c${i}" style="${s.color ? 'stroke:' + s.color : ''}"/>`).join('')}
  </svg>`);
}

// ================= Market browser =================

async function tMarket() {
  const t = toolState.market;
  setContent(html`<div class="toolbar"><input type="search" id="mk-search">${hubSelect('mk-hub', toolState.hub)}</div><div id="mk-out">${t.typeId ? loadingView('Loading order book…') : emptyBox('Search for any item to see live hub prices, the order book and price history.')}</div>`);
  attachSearch($('#mk-search'), { placeholder: 'Search any market item…', onPick: it => { t.typeId = it.id; tMarket(); } });
  $('#mk-hub').onchange = e => { toolState.hub = e.target.value; tMarket(); };
  if (!t.typeId) return;
  const [book, hist, info] = await Promise.all([api.market.book(t.typeId, toolState.hub), api.market.history(t.typeId, toolState.hub), api.sde.type(t.typeId)]);
  const out = $('#mk-out'); if (!out) return;
  if (!book.ok) { out.innerHTML = String(errorView(book)); return; }
  const b = book.data, ty = info.ok ? info.data : { name: '' };
  const hubs = await Promise.all(HUB_NAMES.map(h => api.market.prices([t.typeId], h).then(r => [h, r.ok ? r.data[t.typeId] : null])));
  const spread = b.sell && b.buy ? (b.sell - b.buy) / b.sell : null;
  const h = hist.ok ? hist.data : [];
  out.innerHTML = String(html`
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px"><img src="${IMG}/types/${t.typeId}/icon?size=64" width="56" height="56" style="border-radius:8px;background:var(--bg-2)" alt="">
      <div><div style="font:400 22px var(--font-num)">${ty.name}</div><div class="muted">${ty.group || ''} · ${ty.volume ? fmtNum(ty.volume) + ' m³' : ''} · ${toolState.hub}</div></div></div>
    <div class="grid grid-4" style="margin-bottom:16px">${stat('Best sell', b.sell ? fmtIsk(b.sell) : 'None', fmtNum(b.sellVolume) + ' on market')}${stat('Best buy', b.buy ? fmtIsk(b.buy) : 'None', fmtNum(b.buyVolume) + ' wanted')}
      ${stat('Spread', pct(spread), spread !== null ? fmtIsk(b.sell - b.buy) + ' per unit' : '')}${stat('Avg daily volume', h.length ? fmtNum(h.slice(-30).reduce((n, x) => n + x.volume, 0) / Math.min(30, h.length)) : '—', 'Last 30 days, region')}</div>
    <div class="panel"><h3>Price history (region, 6 months)</h3>${lineChart([
      { points: h.map(x => ({ x: Date.parse(x.date), y: x.average })) },
      { points: h.map(x => ({ x: Date.parse(x.date), y: x.highest })), color: 'rgba(104,211,145,.5)' },
      { points: h.map(x => ({ x: Date.parse(x.date), y: x.lowest })), color: 'rgba(245,101,101,.5)' }], { bars: h.map(x => ({ x: Date.parse(x.date), y: x.volume })) })}
      <div class="dim" style="font-size:12px">Average (teal), daily high and low, and volume (bars).</div></div>
    <div class="grid grid-3">
      <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Sell orders at hub</h3></div><table><tbody>${b.sells.map(o => html`<tr><td class="num">${nf2.format(o.price)}</td><td class="right num muted">${fmtNum(o.volume)}</td></tr>`)}</tbody></table></div>
      <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Buy orders reaching hub</h3></div><table><tbody>${b.buys.map(o => html`<tr><td class="num">${nf2.format(o.price)}</td><td class="right num muted">${fmtNum(o.volume)}</td><td class="dim">${o.range}</td></tr>`)}</tbody></table></div>
      <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>All hubs</h3></div><table><thead><tr><th>Hub</th><th class="right">Sell</th><th class="right">Buy</th></tr></thead><tbody>${hubs.map(([hn, p]) => html`<tr><td>${hn}</td><td class="right num">${p && p.sell ? fmtCompact(p.sell) : '—'}</td><td class="right num">${p && p.buy ? fmtCompact(p.buy) : '—'}</td></tr>`)}</tbody></table></div>
    </div>`);
}

// ================= Appraisal =================

const parseIsk = str => {
  const m = /^\s*([\d.,]+)\s*([kmbt])?\s*(isk)?\s*$/i.exec(String(str));
  if (!m) return NaN;
  const n = Number(m[1].replace(/,/g, ''));
  return n * ({ k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] || '').toLowerCase()] || 1);
};
function priceBadge(x) {
  if (x.override) return html` <span class="badge" title="Your price, saved on this PC">your price</span>`;
  if (x.priceSource === 'build') return html` <span class="badge gold" title="No market orders. Material cost from the blueprint at hub prices (CCP average ${fmtCompact(x.estimate.avg)}). Contract prices are usually higher.">material cost</span>`;
  if (x.priceSource === 'avg') return html` <span class="badge gold" title="No hub orders; CCP average price used. Contract prices may be higher.">avg</span>`;
  return '';
}

async function tAppraisal() {
  const a = toolState.appraisal;
  setContent(html`<div class="grid grid-2" style="align-items:start">
    <div class="panel"><h3>Paste items</h3><textarea id="ap-text" rows="14" style="width:100%" class="mono-area" placeholder="Inventory copy, contract, cargo scan, EFT fit, or lines like 'Tritanium 1000' / '10x Hammerhead II'">${a.text}</textarea>
      <div class="toolbar" style="margin:10px 0 0">${hubSelect('ap-hub', toolState.hub)}<button class="btn btn-primary" id="ap-go">Appraise</button></div></div>
    <div id="ap-out">${emptyBox('Paste anything with item names to value it at live hub prices.')}</div></div>`);
  $('#ap-hub').onchange = e => { toolState.hub = e.target.value; };
  $('#ap-go').onclick = async () => {
    a.text = $('#ap-text').value;
    const out = $('#ap-out'); out.innerHTML = String(loadingView('Pricing items…'));
    const r = await api.appraise(a.text, toolState.hub);
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    const d = r.data;
    out.innerHTML = String(html`<div class="grid grid-2" style="margin-bottom:12px">${stat('Sell value', fmtCompact(d.totals.sell) + ' ISK', fmtIsk(d.totals.sell))}${stat('Buy value', fmtCompact(d.totals.buy) + ' ISK', 'Split ' + fmtCompact(d.totals.split))}${stat('Volume', fmtNum(d.totals.volume) + ' m³')}${stat('Items', fmtNum(d.totals.items), d.rows.length + ' types')}</div>
      ${d.rows.some(x => x.estimate && !x.override) ? html`<div class="notice">Some items have no market orders in this region (supercarriers and titans only sell on contracts). They're valued at the higher of CCP's average price and their material cost, which is usually below contract prices. Use <b>set price</b> to enter what they really sell for.</div>` : ''}
      ${d.unknown.length ? html`<div class="notice">Not recognised: ${d.unknown.slice(0, 8).join(', ')}${d.unknown.length > 8 ? '…' : ''}</div>` : ''}
      <div class="panel" style="padding:0"><div class="table-wrap" style="max-height:60vh"><table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Sell</th><th class="right">Buy</th><th class="right">m³</th></tr></thead><tbody>
        ${d.rows.map(x => html`<tr><td>${icon(x.typeId, 18)}${x.name}${priceBadge(x)}${x.noOrders || x.override ? html` <a href="#" class="dim" style="font-size:11.5px" data-ap-price="${x.typeId}" data-ap-unit="${Math.round(x.unitSell)}">${x.override ? 'change' : 'set price'}</a>` : ''}</td><td class="right num">${fmtNum(x.qty)}</td><td class="right num">${fmtCompact(x.sell)}</td><td class="right num muted">${fmtCompact(x.buy)}</td><td class="right num dim">${fmtNum(x.volume)}</td></tr>`)}</tbody></table></div></div>
      <button class="btn btn-ghost" style="margin-top:10px" id="ap-copy">Copy summary</button>`);
    document.querySelectorAll('[data-ap-price]').forEach(el => el.onclick = e => {
      e.preventDefault();
      const id = el.dataset.apPrice;
      const box = document.createElement('span');
      box.innerHTML = String(html` <input type="text" style="width:120px;padding:2px 6px;font-size:12px;background:var(--bg-2);border:1px solid var(--line-2);color:var(--text);border-radius:5px" placeholder="e.g. 32b" value="${fmtCompact(Number(el.dataset.apUnit))}"> <button class="btn btn-primary" style="padding:2px 8px;font-size:12px">Save</button> <button class="btn btn-ghost" style="padding:2px 8px;font-size:12px">Clear</button>`);
      el.replaceWith(box);
      const [inp, save, clear] = box.children;
      inp.focus(); inp.select();
      const apply = async v => { const r2 = await api.appraiseSetPrice(Number(id), v); if (!r2.ok) return toast(r2.error || 'Could not save'); $('#ap-go').click(); };
      save.onclick = () => { const v = parseIsk(inp.value); if (!(v > 0)) return toast('Enter a price, e.g. 32b or 450m'); apply(v); };
      inp.onkeydown = ev => { if (ev.key === 'Enter') save.click(); };
      clear.onclick = () => apply(0);
    });
    $('#ap-copy').onclick = () => api.copy(`Appraisal (${d.hub}): sell ${fmtIsk(d.totals.sell)}, buy ${fmtIsk(d.totals.buy)}, ${fmtNum(d.totals.volume)} m³, ${d.rows.length} types`).then(() => toast('Copied'));
  };
}

// ================= My orders (undercuts) =================

/** EVE allows four significant digits in a price. Return the next price that beats `best`. */
function beatPrice(best, buy) {
  if (!best || best <= 0) return null;
  const step = Math.max(0.01, Math.pow(10, Math.floor(Math.log10(best)) - 3));
  const round = v => Math.round(v * 100) / 100;
  if (buy) return round((Math.floor(best / step + 1e-9) + 1) * step);
  let p = (Math.ceil(best / step - 1e-9) - 1) * step;
  if (p <= 0) return null;
  // Dropping below a power of ten shrinks the step, e.g. 1,000 → 999.9
  const step2 = Math.max(0.01, Math.pow(10, Math.floor(Math.log10(p)) - 3));
  if (step2 < step) p = best - step2;
  return round(p);
}
const ordState = { list: null, idx: -1, done: new Set(), hotkey: false };

async function tOrders(refresh) {
  if (!ordState.list || refresh) {
    setContent(loadingView('Checking your orders against the market…'));
    const r = await api.trade.myOrders();
    if (!r.ok) return setContent(errorView(r));
    ordState.list = r.data; ordState.idx = -1; ordState.done = new Set();
  }
  drawOrders();
}

function ordersToFix() { return (ordState.list || []).filter(o => o.check && o.check.beaten && !ordState.done.has(o.order_id)); }

async function fixOrder(o) {
  const price = beatPrice(o.check.best, o.is_buy_order);
  if (price === null) return toast('No price to beat.', true);
  await api.copy(String(price));
  const w = await api.ui.open(o.charId, 'market', o.type_id);
  ordState.done.add(o.order_id);
  toast(w.ok ? `${fmtNum(price)} copied. ${o.typeName} market opened in game for ${w.data.pilot}: find your order, Modify, paste.` : `${fmtNum(price)} copied. Open the ${o.typeName} market in game (to open it from here, turn on In-game control in Settings).`);
  drawOrders();
}
function ordersNext() {
  const todo = ordersToFix();
  if (!todo.length) return toast('No outbid orders left. Re-check to look again.');
  fixOrder(todo[0]);
}
if (window.api && api.orderHelper) api.orderHelper.onNext(() => { if (state.view === 'tools' && state.toolsTab === 't-orders') ordersNext(); });

function drawOrders() {
  const list = ordState.list || [];
  const beaten = list.filter(o => o.check && o.check.beaten);
  const left = ordersToFix().length;
  setContent(html`<div class="grid grid-4" style="margin-bottom:16px">${stat('Open orders', list.length)}${stat('Undercut / outbid', beaten.length, beaten.length ? `${left} still to update` : 'You are top of the book', beaten.length ? 'neg' : 'pos')}
      ${stat('Sell value', fmtCompact(list.filter(o => !o.is_buy_order).reduce((n, o) => n + o.price * o.volume_remain, 0)) + ' ISK')}${stat('Buy escrow', fmtCompact(list.filter(o => o.is_buy_order).reduce((n, o) => n + (o.escrow || 0), 0)) + ' ISK')}</div>
    <div class="toolbar"><button class="btn btn-primary" id="or-next" ${raw(left ? '' : 'disabled')}>Update next order ▸</button>
      <label class="check" style="margin:0"><input type="checkbox" id="or-hot" ${raw(ordState.hotkey ? 'checked' : '')}> Ctrl+Alt+N does this while you're in game</label>
      <button class="btn btn-ghost" id="or-refresh">⟳ Re-check</button></div>
    <div class="dim" style="font-size:12px;margin:-4px 0 10px">Each step copies a price that beats the best order (to EVE's four-digit rule) and opens that item's market in game. In EVE: find your order, Modify Order, paste, OK.</div>
    <div class="panel" style="padding:0">${list.length ? html`<table><thead><tr><th>Pilot</th><th>Item</th><th></th><th class="right">Your price</th><th class="right">Best other</th><th class="right">Difference</th><th class="right">New price</th><th class="right">Remaining</th><th>Location</th></tr></thead><tbody>
      ${list.map(o => { const c = o.check; const np = c && c.beaten ? beatPrice(c.best, o.is_buy_order) : null; const done = ordState.done.has(o.order_id); return html`<tr style="${raw(done ? 'opacity:.55' : '')}"><td>${charImg(o.charId, 20)}${o.charName}</td><td>${icon(o.type_id, 18)}${o.typeName}</td><td><span class="badge">${o.is_buy_order ? 'Buy' : 'Sell'}</span></td>
        <td class="right num">${nf2.format(o.price)}</td><td class="right num">${c && c.best ? nf2.format(c.best) : '—'}</td>
        <td class="right">${c ? (c.beaten ? html`<span class="badge red">${o.is_buy_order ? 'Outbid' : 'Undercut'} by ${fmtCompact(c.by)}</span>` : raw('<span class="badge green">Top</span>')) : raw('<span class="dim">?</span>')}</td>
        <td class="right nowrap">${np !== null ? html`<span class="num">${nf2.format(np)}</span> <button class="btn btn-ghost" style="padding:1px 8px;font-size:11.5px" data-or-fix="${o.order_id}">${done ? 'Again' : 'Update'}</button>` : ''}</td>
        <td class="right num">${fmtNum(o.volume_remain)}/${fmtNum(o.volume_total)}</td><td class="muted">${o.locationName}</td></tr>`; })}</tbody></table>` : emptyBox('No open market orders on your pilots.')}</div>`);
  $('#or-refresh').onclick = () => tOrders(true);
  $('#or-next').onclick = () => ordersNext();
  $('#or-hot').onchange = async e => { const r = await api.orderHelper.hotkey(e.target.checked); if (!r.ok) { toast(r.error, true); e.target.checked = false; return; } ordState.hotkey = e.target.checked; toast(e.target.checked ? 'Ctrl+Alt+N updates the next order' : 'Hotkey off'); };
  document.querySelectorAll('[data-or-fix]').forEach(b => b.onclick = () => fixOrder(list.find(o => String(o.order_id) === b.dataset.orFix)));
}

// ================= Arbitrage =================

async function tArbitrage() {
  const a = toolState.arb;
  if (!a.list) { const w = await api.trade.watchlist(); a.list = w.ok ? w.data.join('\n') : ''; }
  setContent(html`<div class="grid" style="grid-template-columns:300px 1fr;align-items:start">
    <div class="panel"><h3>Route</h3><div class="toolbar">Buy in ${hubSelect('ar-from', a.from)} sell in ${hubSelect('ar-to', a.to)}</div>
      ${field('Sales tax + broker fee %', html`<input type="number" id="ar-tax" value="${a.tax}" step="0.1">`)}
      ${field('Watchlist (one item per line)', html`<textarea id="ar-list" rows="14" class="mono-area" style="width:100%">${a.list}</textarea>`)}
      <button class="btn btn-primary" id="ar-go">Compare</button></div>
    <div id="ar-out">${emptyBox('Compare buy-here, sell-there margins for your watchlist.')}</div></div>`);
  $('#ar-go').onclick = async () => {
    a.from = $('#ar-from').value; a.to = $('#ar-to').value; a.tax = Number($('#ar-tax').value) || 0; a.list = $('#ar-list').value;
    if (a.from === a.to) return toast('Pick two different hubs.', true);
    const out = $('#ar-out'); out.innerHTML = String(loadingView('Reading both markets…'));
    const r = await api.trade.arbitrage(a.list.split('\n').map(x => x.trim()).filter(Boolean), a.from, a.to, a.tax);
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    out.innerHTML = String(html`<div class="panel" style="padding:0"><div class="table-wrap" style="max-height:75vh"><table><thead><tr><th>Item</th><th class="right">Buy in ${a.from}</th><th class="right">Relist in ${a.to}</th><th class="right">Margin</th><th class="right">Profit/unit</th><th class="right">Instant sell</th><th class="right">ISK/m³</th></tr></thead><tbody>
      ${r.data.rows.map(x => html`<tr><td>${icon(x.typeId, 18)}${x.name}</td><td class="right num">${fmtCompact(x.buyAt)}</td><td class="right num">${fmtCompact(x.sellRelist)}</td>
        <td class="right num ${x.marginRelist > 0.05 ? 'pos' : x.marginRelist < 0 ? 'neg' : ''}">${pct(x.marginRelist)}</td><td class="right num">${fmtCompact(x.profitRelist)}</td>
        <td class="right num ${x.profitInstant > 0 ? 'pos' : 'dim'}">${fmtCompact(x.profitInstant)}</td><td class="right num muted">${x.perM3 !== null ? fmtCompact(x.perM3) : '—'}</td></tr>`)}</tbody></table></div></div>`);
  };
}

// ================= LP store =================

const lpPriced = x => (x.valueBuy !== undefined && x.valueBuy !== null) || x.value > 0;

async function tLp() {
  setContent(loadingView('Loading your loyalty points…'));
  const corps = new Map();
  for (const c of state.characters.filter(x => !x.needsReauth)) {
    const r = await api.loyalty(c.id);
    if (r.ok) for (const l of r.data) { const cur = corps.get(l.corporationId) || { id: l.corporationId, name: l.corporation, lp: 0, pilots: [] }; cur.lp += l.points; cur.pilots.push(c.name); corps.set(l.corporationId, cur); }
  }
  const list = [...corps.values()].sort((a, b) => b.lp - a.lp);
  if (!toolState.lp.corpId && list[0]) toolState.lp.corpId = list[0].id;
  setContent(html`<div class="toolbar"><select id="lp-corp" class="crumb-select">${list.map(c => html`<option value="${c.id}" ${raw(c.id === toolState.lp.corpId ? 'selected' : '')}>${c.name}: ${fmtNum(c.lp)} LP</option>`)}</select>
    <input type="number" id="lp-manual" placeholder="…or corporation ID" style="width:180px" class="crumb-select" value="${toolState.lp.corpId && !corps.has(toolState.lp.corpId) ? toolState.lp.corpId : ''}">${hubSelect('lp-hub', toolState.hub)}<button class="btn btn-primary" id="lp-go">Load store</button></div>
    <div id="lp-out">${list.length ? '' : emptyBox('None of your pilots have loyalty points. Enter an NPC corporation ID to browse its store.')}</div>`);
  const go = async () => {
    const id = Number($('#lp-manual').value) || Number($('#lp-corp').value);
    if (!id) return;
    toolState.lp.corpId = id; toolState.hub = $('#lp-hub').value;
    const out = $('#lp-out'); out.innerHTML = String(loadingView('Pricing the LP store…'));
    const r = await api.trade.lp(id, toolState.hub);
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    const have = corps.get(id);
    const rows = [...r.data.rows].sort((a, b) => (lpPriced(b) - lpPriced(a)));
    const unpriced = rows.filter(x => !lpPriced(x)).length;
    out.innerHTML = String(html`${unpriced === rows.length && rows.length ? html`<div class="notice" style="margin-bottom:10px">None of this store's offers trade on the market (cosmetic items such as emblems), so there's no ISK per LP to show.</div>` : unpriced ? html`<div class="dim" style="margin-bottom:10px">${unpriced} offer${unpriced === 1 ? ' has' : 's have'} no market and ${unpriced === 1 ? 'is' : 'are'} listed last.</div>` : ''}${have ? html`<div class="muted" style="margin-bottom:10px">You have <b>${fmtNum(have.lp)} LP</b> (${have.pilots.join(', ')}).</div>` : ''}
      <div class="panel" style="padding:0"><div class="table-wrap" style="max-height:75vh"><table><thead><tr><th>Offer</th><th class="right">LP</th><th class="right">ISK</th><th>Also needs</th><th class="right">Sells for (buy orders)</th><th class="right">ISK / LP</th><th class="right">Market depth</th></tr></thead><tbody>
      ${rows.slice(0, 150).map(x => html`<tr><td>${icon(x.typeId, 18)}${x.quantity > 1 ? x.quantity + '× ' : ''}${x.name}</td><td class="right num">${fmtNum(x.lp)}</td><td class="right num">${fmtCompact(x.isk)}</td>
        <td class="muted" style="font-size:12px">${x.required.length ? fmtCompact(x.reqCost) + ' ISK of items' : ''}</td><td class="right num">${x.valueBuy !== undefined && x.valueBuy !== null ? fmtCompact(x.valueBuy) : x.value > 0 ? html`${fmtCompact(x.value)} <span class="dim">avg</span>` : raw('<span class="dim">No market</span>')}</td>
        <td class="right num ${(x.iskPerLpBuy ?? x.iskPerLp) > 1000 ? 'pos' : ''}">${lpPriced(x) ? html`<b>${fmtNum(x.iskPerLpBuy ?? x.iskPerLp)}</b>` : raw('<span class="dim">—</span>')}${x.iskPerLpSell ? html`<div class="dim">${fmtNum(x.iskPerLpSell)} relist</div>` : ''}</td>
        <td class="right num dim">${x.volume ? fmtNum(x.volume) : ''}</td></tr>`)}</tbody></table></div></div>
      <div class="dim" style="font-size:12px;margin-top:8px">The top 40 offers are priced from live hub orders; the rest use CCP averages until refined.</div>`);
  };
  $('#lp-go').onclick = go;
  if (toolState.lp.corpId) go();
}

// ================= Industry: build calculator =================

async function tBuild() {
  const b = toolState.build;
  const st = await api.ind.structures();
  const S = st.ok ? st.data.structures : {};
  setContent(html`<div class="ind-layout">
    <div class="panel ind-form"><h3>Job</h3>
      <input type="search" id="bd-search">
      <div class="grid grid-2" style="margin-top:12px">${field('Runs', html`<input type="number" id="bd-runs" value="${b.runs}" min="1">`)}${field('Pilot skills', pilotSelect('bd-pilot', b.pilotId))}
        ${field('Blueprint ME %', html`<input type="number" id="bd-me" value="${b.me}" min="0" max="10">`)}${field('Blueprint TE %', html`<input type="number" id="bd-te" value="${b.te}" min="0" max="20" step="2">`)}
        ${field('Structure', html`<select id="bd-struct">${Object.entries(S).map(([k, v]) => html`<option value="${k}" ${raw(k === b.structure ? 'selected' : '')}>${v.label}</option>`)}</select>`)}
        ${field('Rigs', html`<select id="bd-rig">${[['none', 'None'], ['t1', 'T1 rig'], ['t2', 'T2 rig']].map(([k, l]) => html`<option value="${k}" ${raw(k === b.rig ? 'selected' : '')}>${l}</option>`)}</select>`)}
        ${field('Security', html`<select id="bd-sec">${[['hs', 'High-sec'], ['ls', 'Low-sec'], ['ns', 'Null / WH']].map(([k, l]) => html`<option value="${k}" ${raw(k === b.security ? 'selected' : '')}>${l}</option>`)}</select>`)}
        ${field('Facility tax %', html`<input type="number" id="bd-tax" value="${b.facilityTax}" step="0.1">`)}
        ${field('System (for cost index)', html`<input type="text" id="bd-sys" value="${b.systemName}" placeholder="e.g. Perimeter">`)}${field('Price hub', hubSelect('bd-hub', toolState.hub))}
        ${field('Component ME', html`<input type="number" id="bd-cme" value="${b.componentMe}">`)}${field('Component TE', html`<input type="number" id="bd-cte" value="${b.componentTe}">`)}</div>
      <button class="btn btn-primary" id="bd-go" style="width:100%">Calculate</button></div>
    <div id="bd-out">${b.productTypeId ? loadingView('Calculating…') : emptyBox('Search for something to build: ships, modules, components, fuel blocks, reactions…')}</div></div>`);
  attachSearch($('#bd-search'), { placeholder: 'What do you want to build?', onPick: it => { b.productTypeId = it.id; b.build = []; readBuild(); runBuild(); } });
  $('#bd-go').onclick = () => { readBuild(); runBuild(); };
  if (b.productTypeId) runBuild();
}
function readBuild() {
  const b = toolState.build, v = id => $(id).value;
  Object.assign(b, { runs: Number(v('#bd-runs')) || 1, me: Number(v('#bd-me')) || 0, te: Number(v('#bd-te')) || 0, structure: v('#bd-struct'), rig: v('#bd-rig'), security: v('#bd-sec'),
    facilityTax: Number(v('#bd-tax')) || 0, systemName: v('#bd-sys').trim(), componentMe: Number(v('#bd-cme')) || 0, componentTe: Number(v('#bd-cte')) || 0, pilotId: Number(v('#bd-pilot')) || null });
  toolState.hub = v('#bd-hub');
}
async function pilotSkillOpts(pilotId) {
  if (!pilotId) return { industry: 5, advancedIndustry: 5, reactions: 5 };
  const r = await api.ind.pilotSkills(pilotId);
  return r.ok ? r.data : { industry: 5, advancedIndustry: 5, reactions: 5 };
}
async function runBuild() {
  const b = toolState.build, out = $('#bd-out');
  if (!out || !b.productTypeId) return;
  out.innerHTML = String(loadingView('Calculating…'));
  const sys = b.systemName ? await api.nav.systemId(b.systemName) : null;
  const skills = await pilotSkillOpts(b.pilotId);
  const r = await api.ind.calc({ ...b, systemId: sys && sys.ok ? sys.data : null, hub: toolState.hub, skills });
  if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
  const d = r.data;
  const pilotLv = skills.levels || null;
  out.innerHTML = String(html`
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:14px"><img src="${IMG}/types/${d.productTypeId}/icon?size=64" width="56" height="56" style="border-radius:8px;background:var(--bg-2)" alt="">
      <div><div style="font:400 22px var(--font-num)">${fmtNum(d.outQty)}× ${d.product.name}</div><div class="muted">${humanize(d.activity)} · ${d.blueprint} · ${d.runs} run${d.runs > 1 ? 's' : ''} · ${fmtDuration(d.seconds * 1000, true)}${d.runs > d.maxRuns ? raw(' · <span class="gold">more runs than one BPC allows (' + d.maxRuns + ')</span>') : ''}</div></div></div>
    <div class="grid grid-4" style="margin-bottom:16px">${stat('Total cost', fmtCompact(d.totalCost) + ' ISK', `${fmtCompact(d.unitCost)} per unit`)}${stat('Sell value', fmtCompact(d.revenueSell) + ' ISK', `${fmtCompact(d.sellPrice)} each (${toolState.hub} sell)`)}
      ${stat('Profit', fmtCompact(d.profitSell) + ' ISK', `${fmtCompact(d.profitBuy)} if sold to buy orders`, d.profitSell >= 0 ? 'pos' : 'neg')}${stat('ISK per hour', fmtCompact(d.iskPerHour), 'Profit ÷ job time', d.iskPerHour >= 0 ? '' : 'neg')}</div>
    <div class="panel" style="padding:0"><table><thead><tr><th>Material</th><th class="right">Base/run</th><th class="right">Needed</th><th class="right">Unit</th><th class="right">Buy cost</th><th>Build it?</th><th class="right">Used cost</th></tr></thead><tbody>
      ${d.materials.map(m => html`<tr><td>${icon(m.typeId, 18)}${m.name}</td><td class="right num dim">${fmtNum(m.base)}</td><td class="right num">${fmtNum(m.qty)}</td><td class="right num muted">${fmtCompact(m.unit)}</td><td class="right num">${fmtCompact(m.buyCost)}</td>
        <td>${m.canBuild ? html`<label class="check" style="margin:0"><input type="checkbox" data-bd-build="${m.typeId}" ${raw(b.build.includes(m.typeId) ? 'checked' : '')}> ${m.built ? html`<span class="${m.built.totalCost < m.buyCost ? 'pos' : 'neg'}">${m.built.totalCost < m.buyCost ? 'saves ' : 'costs '}${fmtCompact(Math.abs(m.buyCost - m.cost))}</span>` : ''}</label>` : ''}</td>
        <td class="right num"><b>${fmtCompact(m.cost)}</b></td></tr>`)}</tbody></table></div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="panel"><h3>Job cost</h3><div class="kv"><span class="k">Estimated item value</span><span class="num">${fmtIsk(d.eiv)}</span><span class="k">System cost index</span><span class="num">${(d.costIndex * 100).toFixed(2)}%${b.systemName ? '' : ' (default, set a system)'}</span>
        <span class="k">Facility tax + SCC</span><span class="num">${(b.facilityTax + 4).toFixed(1)}%</span><span class="k">Installation cost</span><span class="num">${fmtIsk(d.jobCost)}</span><span class="k">Materials</span><span class="num">${fmtIsk(d.materialCost)}</span></div></div>
      <div class="panel"><h3>Required skills</h3>${d.skills.length ? d.skills.map(s => html`<div class="skill-row"><span>${pilotLv ? ((pilotLv[s.id] || 0) >= s.level ? raw('<span class="pos">✓</span> ') : raw('<span class="neg">✗</span> ')) : ''}${s.name} ${ROMAN[s.level]}</span><span class="dim">${pilotLv ? 'has ' + (ROMAN[pilotLv[s.id] || 0] || '0') : ''}</span></div>`) : html`<div class="muted">None</div>`}</div></div>
    <div class="panel" style="margin-top:16px" id="bd-shop"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0;flex:1">Shopping list</h3>
      <label class="dim" style="font-size:12.5px">Count stock <select id="bd-shop-where" class="crumb-select" style="width:auto"><option value="">in every hangar</option>${b.systemName ? html`<option value="sys" ${raw(b.shopWhere === 'sys' ? 'selected' : '')}>in ${b.systemName} only</option>` : ''}</select></label>
      <button class="btn btn-ghost" id="bd-shop-go">${b.shop ? '⟳ Check hangars' : 'Check my hangars'}</button></div>
      <div id="bd-shop-out">${html`<div class="dim" style="font-size:12px;margin-top:6px">Takes what your pilots already own off the materials list, checks for the blueprint, and gives you a multibuy list for the rest.</div>`}</div></div>`);
  $('#bd-shop-go').onclick = () => runShopping();
  if (b.shop) runShopping();
  document.querySelectorAll('[data-bd-build]').forEach(c => c.onchange = () => {
    const id = Number(c.dataset.bdBuild);
    b.build = c.checked ? [...b.build, id] : b.build.filter(x => x !== id);
    runBuild();
  });
}

async function runShopping() {
  const b = toolState.build, out = $('#bd-shop-out'); if (!out) return;
  b.shop = true; b.shopWhere = $('#bd-shop-where').value;
  out.innerHTML = String(loadingView('Checking every pilot\'s hangars…'));
  const sys = b.systemName ? await api.nav.systemId(b.systemName) : null;
  const r = await api.ind.shopping({ ...b, systemId: sys && sys.ok ? sys.data : null, hub: toolState.hub, skills: await pilotSkillOpts(b.pilotId) }, { system: b.shopWhere === 'sys' ? b.systemName : null });
  if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
  const d = r.data;
  out.innerHTML = String(html`<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">
      ${d.ready ? html`<span class="badge green">You have every material</span>` : html`<span class="badge gold">${d.items.filter(i => i.buy).length} to buy · ${fmtNum(Math.round(d.buyVolume))} m³</span>`}
      ${d.blueprint.have ? html`<span class="badge green" title="${d.blueprint.places.map(p => p.pilot + ': ' + p.location).join('\n')}">Blueprint: ${d.blueprint.places[0].pilot}, ${d.blueprint.places[0].location}</span>` : html`<span class="badge red">No ${d.blueprint.name} found in your hangars</span>`}
      <span style="flex:1"></span>${d.multibuy ? html`<button class="btn btn-ghost" style="padding:2px 10px;font-size:12px" id="bd-multibuy" title="Paste into EVE's Multibuy window">Copy multibuy</button>` : ''}</div>
    <table><thead><tr><th>Material</th><th class="right">Need</th><th class="right">You have</th><th class="right">To buy</th><th class="right">Cost</th><th>Where it is</th></tr></thead><tbody>
    ${d.items.map(i => html`<tr><td>${icon(i.typeId, 18)}${i.name}</td><td class="right num">${fmtNum(i.need)}</td><td class="right num ${i.have >= i.need ? 'pos' : ''}">${fmtNum(i.have)}</td>
      <td class="right num"><b>${i.buy ? fmtNum(i.buy) : '—'}</b></td><td class="right num muted">${i.buy && i.unit ? fmtCompact(i.buy * i.unit) : ''}</td>
      <td class="dim" style="font-size:12px">${i.places.map(p => `${p.pilot}: ${fmtNum(p.qty)} in ${p.system || p.location}`).join(' · ')}</td></tr>`)}</tbody></table>`);
  const mb = $('#bd-multibuy'); if (mb) mb.onclick = async () => { await api.copy(d.multibuy); toast('Copied. In EVE: Market → Multibuy → paste.'); };
}

// ================= What to build =================

const wtbState = { data: null, share: 10, salesTax: 3.37, brokerFee: 1.5 };
async function tWhatToBuild() {
  const o = wtbState, b = toolState.build;
  setContent(html`<div class="panel" style="margin-bottom:14px"><div class="grid grid-4" style="align-items:end">
      ${field('Sell at', hubSelect('wb-hub', toolState.hub))}
      ${field('Sales tax + broker fee %', html`<div style="display:flex;gap:6px"><input type="number" id="wb-tax" step="0.01" value="${o.salesTax}"><input type="number" id="wb-fee" step="0.01" value="${o.brokerFee}"></div>`)}
      ${field('Your share of daily sales %', html`<input type="number" id="wb-share" min="1" max="100" value="${o.share}">`)}
      <div><button class="btn btn-primary" id="wb-go" style="width:100%">Rank my blueprints</button></div></div>
    <div class="dim" style="font-size:12px;margin-top:6px">Uses your pilots' blueprints (best ME/TE of each), the facility from the Build Calculator (${b.structure}, ${b.rig} rig, ${b.security}), and the hub's last 30 days of sales. Profit per day assumes one job slot running non-stop, capped at your share of what the market actually buys.</div></div>
    <div id="wb-out">${o.data ? wtbView(o.data) : emptyBox('Find out which of your blueprints are worth running right now.')}</div>`);
  $('#wb-go').onclick = async () => {
    Object.assign(o, { salesTax: Number($('#wb-tax').value), brokerFee: Number($('#wb-fee').value), share: Number($('#wb-share').value) });
    toolState.hub = $('#wb-hub').value;
    const out = $('#wb-out'); out.innerHTML = String(loadingView('Pricing your blueprints… this takes a minute the first time'));
    const r = await api.ind.whatToBuild({ ...b, hub: toolState.hub, salesTax: o.salesTax, brokerFee: o.brokerFee, share: o.share, skills: await pilotSkillOpts(b.pilotId) });
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    o.data = r.data; out.innerHTML = String(wtbView(r.data)); wireWtb();
  };
  wireWtb();
}
function wtbView(d) {
  if (!d.rows.length) return emptyBox('None of your blueprints could be priced.');
  return html`<div class="panel" style="padding:0"><table><thead><tr><th>Product</th><th>Blueprint</th><th class="right">Cost each</th><th class="right">Sells for</th><th class="right">Profit each</th><th class="right">Market buys / day</th><th class="right">You make / day</th><th class="right">Profit / day</th><th></th></tr></thead><tbody>
    ${d.rows.map(r => html`<tr><td>${icon(r.typeId, 18)}${r.name}</td><td class="muted" style="font-size:12px">${r.original ? 'BPO' : 'BPC'} ${r.me}/${r.te}${r.original ? '' : ` · ${r.runs} runs`}<div class="dim">${r.pilot}</div></td>
      <td class="right num">${fmtCompact(r.unitCost)}</td><td class="right num">${fmtCompact(r.sell)}</td><td class="right num ${r.unitProfit >= 0 ? 'pos' : 'neg'}">${fmtCompact(r.unitProfit)}<div class="dim" style="font-size:11px">${pct(r.margin)}</div></td>
      <td class="right num">${fmtNum(r.marketPerDay)}</td><td class="right num">${fmtNum(r.makePerDay)}${r.capped ? html` <span class="badge gold" title="The market buys less than you could make">capped</span>` : ''}</td>
      <td class="right num"><b class="${r.perDaySlot >= 0 ? 'pos' : 'neg'}">${fmtCompact(r.perDaySlot)}</b></td><td><button class="btn btn-ghost" style="padding:1px 8px;font-size:11.5px" data-wb-open="${r.typeId}">Build ▸</button></td></tr>`)}</tbody></table></div>
    <div class="dim" style="font-size:12px;margin-top:6px">${d.rows.length} of ${d.total} products priced at ${d.hub}, after ${d.tax.toFixed(2)}% tax and fees.</div>`;
}
function wireWtb() { document.querySelectorAll('[data-wb-open]').forEach(b => b.onclick = () => { toolState.build.productTypeId = Number(b.dataset.wbOpen); state.toolsTab = 't-build'; go('tools'); }); }

// ================= Invention =================

async function tInvent() {
  const v = toolState.invent;
  const st = await api.ind.structures();
  const D = st.ok ? st.data.decryptors : {};
  setContent(html`<div class="ind-layout"><div class="panel ind-form"><h3>Invention</h3>
      <input type="search" id="iv-search">
      ${field('Decryptor', html`<select id="iv-dec">${Object.entries(D).map(([k, d]) => html`<option value="${k}" ${raw(k === v.decryptor ? 'selected' : '')}>${d.label} (×${d.prob} chance, +${d.runs} runs)</option>`)}</select>`)}
      ${field('Pilot skills', pilotSelect('iv-pilot', v.pilotId, 'All level IV'))}
      <div class="dim" style="font-size:12px;margin-bottom:10px">Manufacturing uses the structure settings from the Build Calculator.</div>
      <button class="btn btn-primary" id="iv-go" style="width:100%">Calculate</button>
      <button class="btn btn-ghost" id="iv-compare" style="width:100%;margin-top:8px">Compare all decryptors</button></div>
    <div id="iv-out">${v.productTypeId ? loadingView('Calculating…') : emptyBox('Search for a Tech II item to see invention odds and cost per unit.')}</div></div>`);
  attachSearch($('#iv-search'), { placeholder: 'Tech II item (e.g. Hammerhead II)', onPick: it => { v.productTypeId = it.id; runInvent(); } });
  $('#iv-go').onclick = () => runInvent();
  $('#iv-compare').onclick = () => compareDecryptors(Object.keys(D));
  if (v.productTypeId) runInvent();
}
async function inventOpts(dec) {
  const v = toolState.invent;
  v.decryptor = dec || $('#iv-dec').value; v.pilotId = Number($('#iv-pilot').value) || null;
  const sk = v.pilotId ? await api.ind.pilotSkills(v.pilotId) : null;
  return { ...toolState.build, productTypeId: v.productTypeId, decryptor: v.decryptor, hub: toolState.hub, runs: 1,
    skills: { ...(sk && sk.ok ? sk.data : { industry: 5, advancedIndustry: 5 }), levels: sk && sk.ok ? sk.data.levels : null, default: 4 } };
}
async function runInvent() {
  const out = $('#iv-out'); if (!out || !toolState.invent.productTypeId) return;
  out.innerHTML = String(loadingView('Calculating…'));
  const r = await api.ind.invent(await inventOpts());
  if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
  const d = r.data;
  out.innerHTML = String(html`
    <div class="grid grid-4" style="margin-bottom:16px">${stat('Success chance', pct(d.probability), 'Base ' + pct(d.baseProbability))}${stat('Runs per success', d.runsPerSuccess, `ME ${d.me} / TE ${d.te}`)}
      ${stat('Invention per unit', fmtCompact(d.perSuccess / d.build.outQty) + ' ISK', fmtCompact(d.perSuccess) + ' per successful BPC')}${stat('Total cost per unit', fmtCompact(d.totalPerUnit) + ' ISK', `Sells ${fmtCompact(d.build.sellPrice)} · profit ${fmtCompact(d.build.sellPrice - d.totalPerUnit)}`, d.build.sellPrice > d.totalPerUnit ? 'pos' : 'neg')}</div>
    <div class="grid grid-2"><div class="panel"><h3>Per attempt (${d.t1Blueprint} → ${d.t2Blueprint})</h3>
      ${d.materials.map(m => html`<div class="skill-row"><span>${icon(m.typeId, 18)}${m.name} ×${m.qty}</span><span class="num">${fmtCompact(m.cost)}</span></div>`)}
      <div class="skill-row"><b>Attempt cost</b><b class="num">${fmtCompact(d.attemptCost)}</b></div></div>
      <div class="panel"><h3>Skills used</h3>${d.skills.map(s => html`<div class="skill-row"><span>${s.name}${s.encryption ? raw(' <span class="dim">(encryption)</span>') : ''}</span><span>${ROMAN[s.level] || '0'}</span></div>`)}
        <div class="dim" style="font-size:12px;margin-top:8px">Chance = base × (1 + (science₁ + science₂)/30 + encryption/40) × decryptor.</div></div></div>
    <div class="panel" style="margin-top:16px"><h3>Manufacturing with the invented BPC</h3><div class="kv"><span class="k">Output</span><span>${fmtNum(d.build.outQty)} units</span><span class="k">Materials + job</span><span class="num">${fmtIsk(d.build.totalCost)}</span><span class="k">Build time</span><span>${fmtDuration(d.build.seconds * 1000, true)}</span></div></div>
    <div id="iv-cmp"></div>`);
}
async function compareDecryptors(keys) {
  const box = $('#iv-cmp') || $('#iv-out');
  if (!toolState.invent.productTypeId) return toast('Pick an item first.', true);
  box.innerHTML = String(loadingView('Running every decryptor…'));
  const rows = [];
  for (const k of keys) { const r = await api.ind.invent(await inventOpts(k)); if (r.ok) rows.push([k, r.data]); }
  rows.sort((a, b) => a[1].totalPerUnit - b[1].totalPerUnit);
  box.innerHTML = String(html`<div class="panel" style="padding:0;margin-top:16px"><div style="padding:14px 18px 0"><h3>Decryptor comparison</h3></div><table><thead><tr><th>Decryptor</th><th class="right">Chance</th><th class="right">Runs</th><th class="right">ME/TE</th><th class="right">Cost per unit</th><th class="right">Profit per unit</th></tr></thead><tbody>
    ${rows.map(([k, d], i) => html`<tr><td>${i === 0 ? raw('<span class="badge green">Best</span> ') : ''}${k === 'none' ? 'None' : k}</td><td class="right num">${pct(d.probability)}</td><td class="right num">${d.runsPerSuccess}</td><td class="right num">${d.me}/${d.te}</td>
      <td class="right num">${fmtCompact(d.totalPerUnit)}</td><td class="right num ${d.build.sellPrice > d.totalPerUnit ? 'pos' : 'neg'}">${fmtCompact(d.build.sellPrice - d.totalPerUnit)}</td></tr>`)}</tbody></table></div>`);
}

// ================= Reprocessing =================

async function tReprocess() {
  const o = toolState.reprocess;
  setContent(html`<div class="ind-layout"><div class="panel ind-form"><h3>Reprocessing</h3>
      <textarea id="rp-text" rows="8" class="mono-area" style="width:100%" placeholder="Paste ore, ice or loot (inventory copy works)">${o.text}</textarea>
      <div class="grid grid-2" style="margin-top:10px">
        ${field('Facility', html`<select id="rp-struct"><option value="npc" ${raw(o.structure === 'npc' ? 'selected' : '')}>NPC station</option><option value="upwell" ${raw(o.structure === 'upwell' ? 'selected' : '')}>Upwell refinery</option></select>`)}
        ${field('Security', html`<select id="rp-sec">${[['hs', 'High-sec'], ['ls', 'Low-sec'], ['ns', 'Null / WH']].map(([k, l]) => html`<option value="${k}" ${raw(k === o.security ? 'selected' : '')}>${l}</option>`)}</select>`)}
        ${field('Base yield %', html`<input type="number" id="rp-base" value="${o.base}">`)}${field('Rig bonus', html`<select id="rp-rig"><option value="0">None</option><option value="1" ${raw(o.rig == 1 ? 'selected' : '')}>T1 (+1)</option><option value="3" ${raw(o.rig == 3 ? 'selected' : '')}>T2 (+3)</option></select>`)}
        ${field('Reprocessing', html`<input type="number" id="rp-r" value="${o.reprocessing}" min="0" max="5">`)}${field('Reprocessing Efficiency', html`<input type="number" id="rp-e" value="${o.efficiency}" min="0" max="5">`)}
        ${field('Ore-specific skill', html`<input type="number" id="rp-s" value="${o.specific}" min="0" max="5">`)}${field('Implant %', html`<select id="rp-imp">${[0, 1, 2, 4].map(x => html`<option ${raw(o.implant == x ? 'selected' : '')}>${x}</option>`)}</select>`)}
        ${field('Scrapmetal Processing', html`<input type="number" id="rp-scrap" value="${o.scrapmetal}" min="0" max="5">`)}${field('Price hub', hubSelect('rp-hub', toolState.hub))}</div>
      <button class="btn btn-primary" id="rp-go" style="width:100%">Calculate</button></div>
    <div id="rp-out">${emptyBox('Paste items to see what they reprocess into, and whether that beats selling them as they are.')}</div></div>`);
  $('#rp-go').onclick = async () => {
    const v = id => $(id).value;
    Object.assign(o, { text: v('#rp-text'), structure: v('#rp-struct'), security: v('#rp-sec'), base: Number(v('#rp-base')), rig: Number(v('#rp-rig')), reprocessing: Number(v('#rp-r')), efficiency: Number(v('#rp-e')), specific: Number(v('#rp-s')), implant: Number(v('#rp-imp')), scrapmetal: Number(v('#rp-scrap')) });
    toolState.hub = v('#rp-hub');
    const out = $('#rp-out'); out.innerHTML = String(loadingView('Calculating…'));
    const r = await api.ind.reprocess(o.text, { ...o, hub: toolState.hub });
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    const d = r.data;
    const asIs = d.rows.reduce((n, x) => n + x.sellAsIsBuy, 0);
    out.innerHTML = String(html`<div class="grid grid-4" style="margin-bottom:16px">${stat('Ore yield', pct(d.yieldOre))}${stat('Scrap yield', pct(d.yieldScrap))}${stat('Minerals value', fmtCompact(d.totalBuy) + ' ISK', 'At buy orders · ' + fmtCompact(d.totalSell) + ' at sell')}${stat('Sell as-is', fmtCompact(asIs) + ' ISK', d.totalBuy > asIs ? 'Reprocessing wins' : 'Selling wins', d.totalBuy > asIs ? 'pos' : 'gold')}</div>
      <div class="grid grid-2"><div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Output</h3></div><table><tbody>${d.minerals.map(m => html`<tr><td>${icon(m.typeId, 18)}${m.name}</td><td class="right num">${fmtNum(m.qty)}</td><td class="right num muted">${fmtCompact(m.buy)}</td></tr>`)}</tbody></table></div>
      <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Per item</h3></div><table><thead><tr><th>Item</th><th class="right">Reprocess</th><th class="right">Sell as-is</th><th></th></tr></thead><tbody>${d.rows.map(x => html`<tr><td>${x.name}<div class="dim">${fmtNum(x.qty)}${x.leftover ? ` (${fmtNum(x.leftover)} left over)` : ''}</div></td>
        <td class="right num">${x.reprocessable ? fmtCompact(x.reprocessBuy) : '—'}</td><td class="right num">${fmtCompact(x.sellAsIsBuy)}</td><td><span class="badge ${x.verdict === 'reprocess' ? 'accent' : ''}">${humanize(x.verdict)}</span></td></tr>`)}</tbody></table></div></div>`);
  };
}
