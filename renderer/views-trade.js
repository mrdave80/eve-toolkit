/* Trade profit tracker (Tools → Market) and moon scan value (Tools → Industry). */
const tradeState = { days: 30, pooled: true, pilot: '', sort: 'profit', data: null };

async function tTrade(stillCurrent) {
  const pilots = state.characters.filter(c => !c.needsReauth);
  setContent(html`<div class="toolbar">
      <select id="tr-pilot" class="crumb-select"><option value="">All pilots</option>${pilots.map(c => html`<option value="${c.id}" ${raw(String(c.id) === String(tradeState.pilot) ? 'selected' : '')}>${c.name}</option>`)}</select>
      <select id="tr-days" class="crumb-select">${[7, 14, 30, 60, 90, 180, 365].map(d => html`<option value="${d}" ${raw(d === tradeState.days ? 'selected' : '')}>Last ${d} days</option>`)}</select>
      <label class="check" style="margin:0" title="Match a sale on one pilot to a buy on another, for when you move stock between alts"><input type="checkbox" id="tr-pool" ${raw(tradeState.pooled ? 'checked' : '')}> Match buys and sells across pilots</label>
    </div><div id="tr-out">${loadingView('Reading wallet transactions…')}</div>`);
  const load = async () => {
    $('#tr-out').innerHTML = String(loadingView('Reading wallet transactions…'));
    const r = await api.trade.report({ days: tradeState.days, pooled: tradeState.pooled, charIds: tradeState.pilot ? [Number(tradeState.pilot)] : [] });
    if (stillCurrent && !stillCurrent()) return;
    if (!r.ok) { $('#tr-out').innerHTML = String(errorView(r)); return; }
    tradeState.data = r.data; drawTrade();
  };
  $('#tr-pilot').onchange = e => { tradeState.pilot = e.target.value; load(); };
  $('#tr-days').onchange = e => { tradeState.days = Number(e.target.value); load(); };
  $('#tr-pool').onchange = e => { tradeState.pooled = e.target.checked; load(); };
  load();
}

function drawTrade() {
  const d = tradeState.data, t = d.totals;
  const items = d.items.filter(i => i.sold > 0 || i.bought > 0);
  const sorters = { profit: (a, b) => b.profit - a.profit, worst: (a, b) => a.profit - b.profit, margin: (a, b) => (b.margin ?? -9) - (a.margin ?? -9), revenue: (a, b) => b.revenue - a.revenue, spent: (a, b) => b.spent - a.spent };
  items.sort(sorters[tradeState.sort] || sorters.profit);
  const maxAbs = Math.max(1, ...d.daily.map(x => Math.abs(x.net || 0)));
  $('#tr-out').innerHTML = String(html`<div class="grid grid-4" style="margin:12px 0 16px">
      ${stat('Profit', fmtCompact(t.net) + ' ISK', `${fmtCompact(t.perDay)} a day after all fees`, t.net >= 0 ? 'pos' : 'neg')}
      ${stat('Sales', fmtCompact(t.revenue) + ' ISK', `${fmtNum(t.trades)} sales matched to buys`)}
      ${stat('Fees', fmtCompact(t.salesTax + t.broker) + ' ISK', `Sales tax ${fmtCompact(t.salesTax)} · broker ${fmtCompact(t.broker)}`)}
      ${stat('Stock on hand', fmtCompact(t.stockIsk) + ' ISK', 'Bought and not yet sold, at what you paid')}
    </div>
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
        ${items.map(i => html`<tr><td>${icon(i.typeId, 18)}${i.name}</td><td class="right num">${fmtNum(i.sold)}</td><td class="right num">${fmtCompact(i.revenue)}</td><td class="right num muted">${fmtCompact(i.cost)}</td><td class="right num muted">${fmtCompact(i.tax)}</td>
          <td class="right num ${i.profit >= 0 ? 'pos' : 'neg'}">${i.sold ? fmtCompact(i.profit) : '—'}</td><td class="right num">${i.margin !== null ? (i.margin * 100).toFixed(1) + '%' : '—'}</td>
          <td class="right num dim">${i.avgHoldDays !== null ? i.avgHoldDays.toFixed(1) + 'd' : '—'}</td><td class="right num muted">${i.bought ? fmtNum(i.bought) : '—'}</td><td class="right num">${i.stock ? fmtNum(i.stock) : '—'}</td></tr>`)}</tbody></table></div>`
      : emptyBox('No market buys or sales in this period.')}</div>
    <div class="dim" style="font-size:12px;margin-top:8px">Each sale is matched to the oldest buys of the same item (first in, first out). Sales tax is taken from your wallet journal for each sale; broker fees can't be tied to an item, so they come off the total. ESI only shares about 30 days of transactions, so the app keeps its own record on this PC${d.ledgerFrom ? ', going back to ' + fmtDay(d.ledgerFrom) : ''} and adds to it every six hours.</div>`);
  $('#tr-sort').onchange = e => { tradeState.sort = e.target.value; drawTrade(); };
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
