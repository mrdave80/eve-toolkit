/* Trade profit tracker (Tools → Market) and moon scan value (Tools → Industry). */
const tradeState = { days: 30, pooled: true, pilot: '', sort: 'profit', data: null, method: (() => { try { return localStorage.getItem('tradeMethod') || 'fifo'; } catch { return 'fifo'; } })(), style: '' };

async function tTrade(stillCurrent) {
  const pilots = state.characters.filter(c => !c.needsReauth);
  setContent(html`<div class="toolbar">
      <select id="tr-pilot" class="crumb-select"><option value="">All pilots</option>${pilots.map(c => html`<option value="${c.id}" ${raw(String(c.id) === String(tradeState.pilot) ? 'selected' : '')}>${c.name}</option>`)}</select>
      <select id="tr-days" class="crumb-select">${[7, 14, 30, 60, 90, 180, 365].map(d => html`<option value="${d}" ${raw(d === tradeState.days ? 'selected' : '')}>Last ${d} days</option>`)}</select>
      <select id="tr-method" class="crumb-select" title="How the cost of each sale is worked out">${[['fifo', 'Cost: first in, first out'], ['wac', 'Cost: weighted average']].map(([k, l]) => html`<option value="${k}" ${raw(k === tradeState.method ? 'selected' : '')}>${l}</option>`)}</select>
      <label class="check" style="margin:0" title="Match a sale on one pilot to a buy on another, for when you move stock between alts"><input type="checkbox" id="tr-pool" ${raw(tradeState.pooled ? 'checked' : '')}> Match buys and sells across pilots</label>
      <span style="flex:1"></span><button class="btn btn-ghost" id="tr-excl" title="Leave buys, stations or items out of profit">Left out…</button>
    </div><div id="tr-out">${loadingView('Reading wallet transactions…')}</div>`);
  const load = async () => {
    $('#tr-out').innerHTML = String(loadingView('Reading wallet transactions…'));
    const r = await api.trade.report({ days: tradeState.days, pooled: tradeState.pooled, method: tradeState.method, charIds: tradeState.pilot ? [Number(tradeState.pilot)] : [] });
    if (stillCurrent && !stillCurrent()) return;
    if (!r.ok) { $('#tr-out').innerHTML = String(errorView(r)); return; }
    tradeState.data = r.data; drawTrade();
  };
  $('#tr-pilot').onchange = e => { tradeState.pilot = e.target.value; load(); };
  $('#tr-days').onchange = e => { tradeState.days = Number(e.target.value); load(); };
  $('#tr-pool').onchange = e => { tradeState.pooled = e.target.checked; load(); };
  $('#tr-method').onchange = e => { tradeState.method = e.target.value; try { localStorage.setItem('tradeMethod', e.target.value); } catch {} load(); };
  $('#tr-excl').onclick = () => tradeExcludeModal(load);
  tradeState.reload = load;
  load();
}

function drawTrade() {
  const d = tradeState.data, t = d.totals;
  const items = d.items.filter(i => i.sold > 0 || i.bought > 0).filter(i => !tradeState.style || (i.style && i.style[tradeState.style]));
  const sorters = { profit: (a, b) => b.profit - a.profit, worst: (a, b) => a.profit - b.profit, margin: (a, b) => (b.margin ?? -9) - (a.margin ?? -9), revenue: (a, b) => b.revenue - a.revenue, spent: (a, b) => b.spent - a.spent };
  items.sort(sorters[tradeState.sort] || sorters.profit);
  const maxAbs = Math.max(1, ...d.daily.map(x => Math.abs(x.net || 0)));
  $('#tr-out').innerHTML = String(html`<div class="grid grid-4" style="margin:12px 0 16px">
      ${stat('Profit', fmtCompact(t.net) + ' ISK', `${fmtCompact(t.perDay)} a day after all fees`, t.net >= 0 ? 'pos' : 'neg')}
      ${stat('Sales', fmtCompact(t.revenue) + ' ISK', `${fmtNum(t.trades)} sales matched to buys`)}
      ${stat('Fees', fmtCompact(t.salesTax + t.broker) + ' ISK', `Sales tax ${fmtCompact(t.salesTax)} · broker ${fmtCompact(t.broker)}`)}
      ${stat('Stock on hand', fmtCompact(t.stockIsk) + ' ISK', 'Bought and not yet sold, at what you paid')}
    </div>
    ${d.styles ? html`<div class="grid grid-2" style="margin-bottom:16px">${[['station', 'Station trading', 'Bought and sold in the same station'], ['haul', 'Hauling', 'Bought in one place, sold in another']].map(([k, label, sub]) => { const x = d.styles[k]; const share = (d.styles.station.profit + d.styles.haul.profit) ? Math.round(100 * x.profit / Math.max(1, Math.abs(d.styles.station.profit) + Math.abs(d.styles.haul.profit))) : 0;
      return html`<div class="panel tr-style ${tradeState.style === k ? 'sel' : ''}" data-trstyle="${k}" style="cursor:pointer;margin:0" title="Click to show only these sales"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3 style="margin:0">${label}</h3><span class="dim" style="font-size:12px">${sub}</span></div>
        <div style="display:flex;gap:18px;margin-top:8px;align-items:baseline"><span class="num ${x.profit >= 0 ? 'pos' : 'neg'}" style="font-size:20px">${fmtCompact(x.profit)} ISK</span><span class="muted">${fmtNum(x.trades)} sales · ${fmtCompact(x.revenue)} turnover${x.revenue ? ' · ' + (100 * x.profit / x.revenue).toFixed(1) + '% margin' : ''}</span>${share ? html`<span class="dim">${share}% of profit</span>` : ''}</div></div>`; })}</div>` : ''}
    ${d.excluded && d.excluded.count ? html`<div class="dim" style="font-size:12px;margin:-8px 0 12px">${fmtNum(d.excluded.count)} transactions in this period are left out (<a href="#" id="tr-excl2">change</a>).</div>` : ''}
    ${t.unmatchedQty ? html`<div class="notice" style="margin-bottom:12px">${fmtCompact(t.unmatchedIsk)} ISK of sales had no matching buy in the ledger (bought before the app started tracking, looted, built or moved in from another pilot). They're left out of profit. ${!d.pooled ? 'Turning on matching across pilots may help.' : ''}</div>` : ''}
    ${d.errors.length ? html`<div class="notice" style="margin-bottom:12px">Couldn't read ${d.errors.length} pilot${d.errors.length > 1 ? 's' : ''}: ${d.errors[0].error}</div>` : ''}
    ${d.daily.length ? html`<div class="panel" style="margin-bottom:16px"><h3>Profit by day</h3>
      <div style="display:flex;align-items:center;gap:2px;height:110px">${d.daily.map(x => { const v = x.net || 0, h = Math.round(Math.abs(v) / maxAbs * 50); return html`<div title="${x.day}: ${fmtCompact(v)} ISK" style="flex:1;display:flex;flex-direction:column;justify-content:center;height:100%">
        <div style="height:50px;display:flex;align-items:flex-end"><div style="width:100%;height:${v > 0 ? h : 0}px;background:var(--green);border-radius:2px 2px 0 0"></div></div>
        <div style="height:50px;display:flex;align-items:flex-start"><div style="width:100%;height:${v < 0 ? h : 0}px;background:var(--red);border-radius:0 0 2px 2px"></div></div></div>`; })}</div>
      <div class="dim" style="font-size:11.5px;display:flex;justify-content:space-between"><span>${d.daily[0].day}</span><span>${d.daily[d.daily.length - 1].day}</span></div></div>` : ''}
    <div class="panel" style="padding:0"><div style="padding:12px 16px;display:flex;gap:10px;align-items:center"><h3 style="margin:0;flex:1">Items</h3>
      <select id="tr-sort" class="crumb-select">${[['profit', 'Best profit'], ['worst', 'Worst profit'], ['margin', 'Best margin'], ['revenue', 'Most sales'], ['spent', 'Most bought']].map(([k, l]) => html`<option value="${k}" ${raw(k === tradeState.sort ? 'selected' : '')}>${l}</option>`)}</select></div>
      ${items.length ? html`<div class="table-wrap" style="max-height:55vh"><table><thead><tr><th>Item</th><th class="right">Sold</th><th class="right">Sales</th><th class="right">Cost</th><th class="right">Tax</th><th class="right">Profit</th><th class="right">Margin</th><th class="right">Avg hold</th><th class="right">Bought</th><th class="right">In stock</th></tr></thead><tbody>
        ${items.map(i => xRow('tr' + i.typeId, html`<td>${icon(i.typeId, 18)}${i.name}</td><td class="right num">${fmtNum(i.sold)}</td><td class="right num">${fmtCompact(i.revenue)}</td><td class="right num muted">${fmtCompact(i.cost)}</td><td class="right num muted">${fmtCompact(i.tax)}</td>
          <td class="right num ${i.profit >= 0 ? 'pos' : 'neg'}">${i.sold ? fmtCompact(i.profit) : '—'}</td><td class="right num">${i.margin !== null ? (i.margin * 100).toFixed(1) + '%' : '—'}</td>
          <td class="right num dim">${i.avgHoldDays !== null ? i.avgHoldDays.toFixed(1) + 'd' : '—'}</td><td class="right num muted">${i.bought ? fmtNum(i.bought) : '—'}</td><td class="right num">${i.stock ? fmtNum(i.stock) : '—'}</td>`, tradeDetail(i), 10))}</tbody></table></div>`
      : emptyBox('No market buys or sales in this period.')}</div>
    <div class="dim" style="font-size:12px;margin-top:8px">Each sale is matched to the oldest buys of the same item (first in, first out). Sales tax is taken from your wallet journal for each sale; broker fees can't be tied to an item, so they come off the total. ESI only shares about 30 days of transactions, so the app keeps its own record on this PC${d.ledgerFrom ? ', going back to ' + fmtDay(d.ledgerFrom) : ''} and adds to it every six hours.</div>`);
  $('#tr-sort').onchange = e => { tradeState.sort = e.target.value; drawTrade(); };
  document.querySelectorAll('[data-trstyle]').forEach(p => p.onclick = () => { tradeState.style = tradeState.style === p.dataset.trstyle ? '' : p.dataset.trstyle; drawTrade(); });
  const e2 = $('#tr-excl2'); if (e2) e2.onclick = e => { e.preventDefault(); tradeExcludeModal(tradeState.reload); };
  document.querySelectorAll('[data-trex]').forEach(b => b.onclick = async e => { e.stopPropagation(); const [kind, id] = b.dataset.trex.split(':'); const r = await api.trade.exclude(kind, Number(id), true); if (!r.ok) return toast(r.error, true); toast(kind === 'type' ? 'Item left out of profit' : 'Buy left out of profit'); tradeState.reload && tradeState.reload(); });
}

function tradeDetail(i) {
  const m = i.matches || [];
  if (!m.length) return html`<div class="dim">No sales matched in this period${i.bought ? `; ${fmtNum(i.bought)} bought for ${fmtCompact(i.spent)} ISK` : ''}.</div>`;
  const ago = t => fmtDuration(Date.now() - Date.parse(t), true) + ' ago';
  return html`${(i.pilots || []).length > 1 ? html`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><span class="dim" style="font-size:12px">By pilot:</span>${i.pilots.map(p => html`<span class="badge ${p.profit >= 0 ? 'green' : 'red'}">${p.name} · ${fmtNum(p.sold)} sold · ${fmtCompact(p.profit)}</span>`)}</div>` : ''}
    <table><thead><tr><th>Sold</th><th>By</th><th class="right">Qty</th><th class="right">Price</th><th>Matched to buys</th><th class="right">Tax</th><th class="right">Profit</th></tr></thead><tbody>
    ${m.map(x => html`<tr><td class="nowrap dim">${ago(x.time)}</td><td>${x.seller}</td><td class="right num">${fmtNum(x.matched)}${x.matched < x.qty ? html`<span class="dim" title="No earlier buy found for the rest"> of ${fmtNum(x.qty)}</span>` : ''}</td><td class="right num">${fmtCompact(x.price)}</td>
      <td style="font-size:12px">${x.style ? html`<span class="badge ${x.style === 'haul' ? 'gold' : ''}" style="margin-bottom:2px">${x.style === 'haul' ? 'hauled' : 'station'}</span>` : ''}${x.lots.length ? x.lots.map(l => html`<div>${fmtNum(l.qty)} @ ${fmtCompact(l.price)}${l.avg ? html` <span class="dim">average</span>` : ''} <span class="dim">· ${l.buyer !== x.seller ? l.buyer + ' · ' : ''}${fmtDuration(Date.parse(x.time) - Date.parse(l.time), true)} earlier</span>${l.id ? html` <a href="#" class="dim" data-trex="tx:${l.id}" title="Leave this buy out of profit">✕</a>` : ''}</div>`) : html`<span class="dim">no buy on record</span>`}${x.moreLots ? html`<div class="dim">and ${x.moreLots} more</div>` : ''}</td>
      <td class="right num muted">${x.tax ? fmtCompact(x.tax) : '—'}</td><td class="right num ${x.profit >= 0 ? 'pos' : 'neg'}">${x.matched ? fmtCompact(x.profit) : '—'}</td></tr>`)}</tbody></table>
    <div style="display:flex;gap:10px;align-items:center;margin-top:6px"><span class="dim" style="font-size:12px;flex:1">${m.length >= 30 ? 'Showing the latest 30 sales.' : ''}</span><button class="btn btn-ghost" style="padding:2px 9px;font-size:12px" data-trex="type:${i.typeId}">Leave this item out</button></div>`;
}

async function tradeExcludeModal(reload) {
  const d = tradeState.data || { locations: [], excluded: { loc: [], type: [], tx: 0 } };
  const ex = d.excluded || { loc: [], type: [], tx: 0 };
  const exLoc = new Set(ex.loc.map(l => l.id));
  openModal('Left out of profit', html`<div class="muted" style="font-size:12.5px;margin-bottom:10px">Leave out stations you only use for moving stock between your own pilots, gifts, or items that aren't really trading. Left-out buys and sales are skipped as if they never happened.</div>
    <h3 class="mh" style="margin-top:0">Stations and structures</h3>
    <div>${[...d.locations, ...ex.loc.filter(l => !d.locations.some(x => x.id === l.id))].map(l => html`<label class="check" style="display:flex;gap:8px"><input type="checkbox" data-exloc="${l.id}" ${raw(exLoc.has(l.id) ? 'checked' : '')}> <span style="flex:1">${l.name}</span>${l.buys !== undefined ? html`<span class="dim" style="font-size:12px">${l.buys} buys · ${l.sells} sales · ${fmtCompact(l.isk)} ISK</span>` : ''}</label>`)}</div>
    ${ex.type.length ? html`<h3 class="mh">Items</h3>${ex.type.map(t => html`<div class="skill-row"><span>${icon(t.id, 16)}${t.name}</span><a href="#" data-unex="type:${t.id}">Put back</a></div>`)}` : ''}
    ${ex.tx ? html`<h3 class="mh">Single buys</h3><div class="skill-row"><span>${fmtNum(ex.tx)} buy${ex.tx === 1 ? '' : 's'} left out</span><a href="#" data-unex="alltx:0">Put them all back</a></div>` : ''}`, {});
  { const c = document.querySelector('#modal .modal-foot [data-close]'); if (c) c.textContent = 'Done'; }
  let changed = false;
  document.querySelectorAll('[data-exloc]').forEach(i => i.onchange = async () => { await api.trade.exclude('loc', Number(i.dataset.exloc), i.checked); changed = true; });
  document.querySelectorAll('[data-unex]').forEach(a => a.onclick = async e => { e.preventDefault(); const [kind, id] = a.dataset.unex.split(':'); if (kind === 'alltx') await api.trade.exclude('alltx', 0, false); else await api.trade.exclude(kind, Number(id), false); a.closest('.skill-row').remove(); changed = true; });
  document.querySelectorAll('#modal [data-close], #modal .modal-back').forEach(b => b.addEventListener('click', () => { if (changed && reload) reload(); }));
}

// ================= Station trading =================

const stState = { hub: 'Jita', pilot: '', minMargin: 8, minVolume: 50, minProfit: 5, maxPrice: 0, share: 10, data: null, sort: 'daily', q: '' };
async function tStation(stillCurrent) {
  const s = stState;
  const pilots = state.characters.filter(c => !c.needsReauth);
  if (!s.pilot && pilots[0]) s.pilot = String(pilots[0].id);
  const num = (id, v, w = 80, step = 1) => html`<input type="number" id="${id}" value="${v}" step="${step}" style="${raw(inBox)};width:${w}px">`;
  setContent(html`<div class="panel" style="margin-bottom:14px">
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">
      <div class="field" style="margin:0"><label>Hub</label>${hubSelect('st-hub', s.hub)}</div>
      <div class="field" style="margin:0"><label>Fees from</label><select id="st-pilot" class="crumb-select">${pilots.map(c => html`<option value="${c.id}" ${raw(String(c.id) === s.pilot ? 'selected' : '')}>${c.name}</option>`)}<option value="" ${raw(!s.pilot ? 'selected' : '')}>Skills at V</option></select></div>
      <div class="field" style="margin:0"><label>Margin at least</label>${num('st-margin', s.minMargin, 70)} %</div>
      <div class="field" style="margin:0"><label>Trades a day at least</label>${num('st-vol', s.minVolume, 80)}</div>
      <div class="field" style="margin:0"><label>Profit a day at least</label>${num('st-profit', s.minProfit, 70, 0.5)} m ISK</div>
      <div class="field" style="margin:0"><label>Max price</label>${num('st-max', s.maxPrice || '', 90)} m ISK</div>
      <div class="field" style="margin:0" title="How much of the daily volume you'd expect to get through your orders"><label>Your share</label>${num('st-share', s.share, 60)} %</div>
      <button class="btn btn-primary" id="st-go">Scan</button></div>
    <div class="dim" id="st-fees" style="font-size:12px;margin-top:8px"></div></div>
    <div id="st-out">${s.data ? '' : emptyBox('Scans every item at the hub for buy-order → sell-order spreads that clear your sales tax and broker fees, then checks how much each one really trades.')}</div>`);
  const showFees = async () => { const r = await api.trade.fees(s.pilot ? Number(s.pilot) : null); const el = $('#st-fees'); if (el && r.ok) el.textContent = `Sales tax ${r.data.salesTax.toFixed(2)}% · broker fee ${r.data.brokerFee.toFixed(2)}% (${r.data.from}). Higher standings with the station owner lower broker fees a little more.`; };
  showFees();
  $('#st-pilot').onchange = e => { s.pilot = e.target.value; showFees(); };
  $('#st-go').onclick = () => runStation(stillCurrent);
  if (s.data) drawStation();
}
async function runStation(stillCurrent, refresh = false) {
  const s = stState, v = id => Number($(id).value);
  Object.assign(s, { hub: $('#st-hub').value, minMargin: v('#st-margin'), minVolume: v('#st-vol'), minProfit: v('#st-profit'), maxPrice: v('#st-max'), share: v('#st-share') });
  const out = $('#st-out');
  out.innerHTML = String(html`<div class="loading"><div class="spinner"></div><span id="st-prog">Reading the ${s.hub} order book…</span></div>`);
  const tick = setInterval(async () => { const r = await api.trade.stationStatus(); const el = $('#st-prog'); if (!el || !r.ok) return; const d = r.data; if (d.phase === 'orders' && d.total) el.textContent = `Reading the ${s.hub} order book… page ${d.done} of ${d.total}`; else if (d.phase === 'history') el.textContent = `Checking daily volume… ${d.done} of ${d.total} items`; }, 700);
  const r = await api.trade.station({ hub: s.hub, charId: s.pilot ? Number(s.pilot) : null, minMargin: s.minMargin, minVolume: s.minVolume, minProfit: s.minProfit * 1e6, maxPrice: s.maxPrice ? s.maxPrice * 1e6 : 0, share: s.share, refresh });
  clearInterval(tick);
  if (stillCurrent && !stillCurrent()) return;
  if (!$('#st-out')) return;
  if (!r.ok) { $('#st-out').innerHTML = String(errorView(r)); return; }
  s.data = r.data; drawStation();
}
function drawStation() {
  const s = stState, d = s.data; if (!d) return;
  const sorters = { daily: (a, b) => b.daily - a.daily, margin: (a, b) => b.margin - a.margin, volume: (a, b) => b.volume - a.volume, per: (a, b) => b.per - a.per };
  const q = s.q.toLowerCase();
  const rows = d.rows.filter(r => !q || r.name.toLowerCase().includes(q) || (r.group || '').toLowerCase().includes(q)).sort(sorters[s.sort] || sorters.daily);
  const spark = v => { if (!v || v.length < 2) return ''; const mn = Math.min(...v), mx = Math.max(...v), w = 70, h = 18; const pts = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - (mx > mn ? (x - mn) / (mx - mn) : 0.5) * h).toFixed(1)}`).join(' '); return raw(`<svg width="${w}" height="${h}" style="vertical-align:middle"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.3"/></svg>`); };
  $('#st-out').innerHTML = String(html`<div class="panel" style="padding:0">
    <div style="padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 style="margin:0;flex:1">${fmtNum(rows.length)} items worth station trading in ${d.station}</h3>
      <input type="text" id="st-q" placeholder="Filter by name or group" value="${s.q}" style="${raw(inBox)};width:200px">
      <select id="st-sort" class="crumb-select">${[['daily', 'Most profit a day'], ['margin', 'Best margin'], ['volume', 'Most traded'], ['per', 'Most profit each']].map(([k, l]) => html`<option value="${k}" ${raw(k === s.sort ? 'selected' : '')}>${l}</option>`)}</select>
      <button class="btn btn-ghost" id="st-refresh" style="padding:3px 10px;font-size:12px">⟳ Fresh prices</button></div>
    ${rows.length ? html`<div class="table-wrap" style="max-height:65vh"><table><thead><tr><th>Item</th><th class="right">Buy order</th><th class="right">Sell order</th><th class="right">Profit each</th><th class="right">Margin</th><th class="right">Traded a day</th><th class="right">Orders (buy / sell)</th><th>30 days</th><th class="right">Your profit a day</th></tr></thead><tbody>
      ${rows.map(r => html`<tr><td>${icon(r.typeId, 18)}<a href="#" data-tid="${r.typeId}">${r.name}</a>${r.odd ? raw(' <span class="badge gold" title="The recent average price sits outside this spread: one side may be a mistake or a scam order. Check before trading.">check</span>') : ''}<div class="dim" style="font-size:11.5px">${r.group}</div></td>
        <td class="right num">${fmtCompact(r.buy)}</td><td class="right num">${fmtCompact(r.sell)}</td><td class="right num pos">${fmtCompact(r.per)}</td><td class="right num">${(r.margin * 100).toFixed(1)}%</td>
        <td class="right num">${fmtNum(Math.round(r.volume))}</td><td class="right num dim">${r.buyOrders} / ${r.sellOrders}</td><td>${spark(r.spark)}${r.trend ? html` <span class="${r.trend > 0 ? 'pos' : 'neg'}" style="font-size:11px">${r.trend > 0 ? '+' : ''}${(r.trend * 100).toFixed(0)}%</span>` : ''}</td>
        <td class="right num pos">${fmtCompact(r.daily)}<div class="dim" style="font-size:11px">${fmtNum(r.units)} a day · ${fmtCompact(r.capital)} tied up</div></td></tr>`)}</tbody></table></div>`
      : emptyBox('Nothing at these settings. Try a lower margin or volume.')}</div>
    <div class="dim" style="font-size:12px;margin-top:8px">Profit each = sell order 0.01 under the best, less sales tax and broker fee, minus a buy order 0.01 over the best plus its broker fee. "Your profit a day" assumes you get ${s.share}% of the item's daily trades. Checked ${fmtNum(d.checked)} of ${fmtNum(d.candidates)} items with a spread, out of ${fmtNum(d.scanned)} on the market. Prices from ${fmtDate(d.at)}.</div>`);
  $('#st-q').oninput = e => { s.q = e.target.value; const pos = e.target.selectionStart; drawStation(); const i = $('#st-q'); i.focus(); i.setSelectionRange(pos, pos); };
  $('#st-sort').onchange = e => { s.sort = e.target.value; drawStation(); };
  $('#st-refresh').onclick = () => runStation(null, true);
}

// ================= Moon scan value =================

const moonState = { text: '', m3PerHour: 20000, yieldPct: 85, side: 'sell', days: 7, data: null };
const inBox = 'width:100px;background:var(--bg-2);border:1px solid var(--line-2);color:var(--text);border-radius:6px;padding:5px 8px;font:inherit;color-scheme:dark';

function tMoon() {
  const s = moonState;
  setContent(html`<div class="grid" style="grid-template-columns:minmax(320px,1fr) 2fr;gap:16px;align-items:start">
    <div class="panel"><h3>Paste survey scan</h3>
      <textarea id="mn-text" rows="12" style="width:100%" class="mono-area" placeholder="Survey Scan Results window → select all → Copy, then paste here. Several moons at once is fine.">${s.text}</textarea>
      <div class="toolbar" style="flex-wrap:wrap;gap:10px;margin-top:10px">
        <label>Extraction <input id="mn-days" type="number" min="6" max="56" value="${s.days}" style="${inBox};width:70px"> days</label>
        <label>Drill rate <input id="mn-rate" type="number" min="1000" step="500" value="${s.m3PerHour}" style="${inBox}"> m³/h</label>
        <label>Refine yield <input id="mn-yield" type="number" min="30" max="100" step="0.1" value="${s.yieldPct}" style="${inBox};width:80px"> %</label>
        <label>Price <select id="mn-side" class="crumb-select"><option value="sell" ${raw(s.side === 'sell' ? 'selected' : '')}>Jita sell</option><option value="buy" ${raw(s.side === 'buy' ? 'selected' : '')}>Jita buy</option></select></label>
      </div>
      <button class="btn btn-primary" id="mn-go" style="margin-top:6px">Value moons</button>
      <div class="dim" style="font-size:12px;margin-top:10px">A refinery's drill pulls 20,000 m³ an hour, so a 7-day extraction is about 3.4m m³. Each ore is valued at the better of selling it raw or refining it at your yield. The total assumes the whole chunk is mined.</div>
    </div>
    <div id="mn-out">${s.data ? '' : emptyBox('Paste a survey scan to see what each moon is worth.')}</div></div>`);
  if (s.data) drawMoon();
  $('#mn-go').onclick = async () => {
    Object.assign(s, { text: $('#mn-text').value, days: Number($('#mn-days').value), m3PerHour: Number($('#mn-rate').value), yieldPct: Number($('#mn-yield').value), side: $('#mn-side').value });
    $('#mn-out').innerHTML = String(loadingView('Pricing moon ores…'));
    const r = await api.moon.value(s.text, { days: s.days, m3PerHour: s.m3PerHour, yieldPct: s.yieldPct, side: s.side });
    if (!r.ok) { $('#mn-out').innerHTML = String(errorView(r)); return; }
    s.data = r.data; drawMoon();
  };
}

function drawMoon() {
  const d = moonState.data;
  const rTone = { R64: 'red', R32: 'gold', R16: 'accent', R8: 'green', R4: '' };
  $('#mn-out').innerHTML = String(html`<div class="panel" style="padding:0"><table><thead><tr><th>Moon</th><th>Best ore</th><th class="right">ISK / m³</th><th class="right">Per ${d.opts.days}-day extraction</th><th class="right">Per 30 days</th></tr></thead><tbody>
    ${d.moons.map(m => html`<tr><td><b>${m.name}</b><div class="dim" style="font-size:11.5px">${m.region || ''}${m.security !== null && m.security !== undefined ? ' · ' + (Math.round(m.security * 10) / 10).toFixed(1) : ''}${m.share < 0.99 ? ` · scan covers ${Math.round(m.share * 100)}%` : ''}</div></td>
      <td>${m.rating ? html`<span class="badge ${rTone[m.rating] || ''}">${m.rating}</span>` : ''}</td>
      <td class="right num">${fmtNum(Math.round(m.iskPerM3))}</td><td class="right num">${fmtCompact(m.extractionIsk)}</td><td class="right num pos">${fmtCompact(m.monthIsk)}</td></tr>
      <tr><td colspan="5" style="padding-top:0"><div style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px">${m.products.map(p => html`<span>${icon(p.typeId, 16)}${p.name} <span class="dim">${Math.round(p.share * 100)}% · ${fmtNum(Math.round(p.iskPerM3))}/m³ ${p.sellAs === 'ore' ? '· sell raw' : ''}</span></span>`)}</div></td></tr>`)}
  </tbody></table></div>`);
}
