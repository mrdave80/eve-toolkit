/* Skill farm calculator and insurance check (Tools → Finance). */
const SLOT_LABELS = { omega: 'Omega', mct: 'MCT slot', paid: 'Already paid', skip: 'Not farming' };
const inStyle = 'width:90px;background:var(--bg-2);border:1px solid var(--line-2);color:var(--text);border-radius:6px;padding:5px 8px;font:inherit;color-scheme:dark';

async function tFarm(stillCurrent) {
  setContent(loadingView('Pricing PLEX, injectors and extractors…'));
  const r = await api.farm.calc();
  if (stillCurrent && !stillCurrent()) return;
  if (!r.ok) return setContent(errorView(r));
  const d = r.data, c = d.cfg, p = d.prices;
  const fmtSp = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'm' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n));
  setContent(html`<div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Profit per 30 days', fmtCompact(d.totals.profit) + ' ISK', `${fmtCompact(d.totals.revenue)} injectors − ${fmtCompact(d.totals.cost)} game time`, d.totals.profit >= 0 ? 'pos' : 'neg')}
      ${stat('Injectors per 30 days', d.totals.extractions.toFixed(1), 'Large Skill Injectors from farming pilots')}
      ${stat('Per extraction', fmtCompact(p.perExtraction) + ' ISK', `Injector ${fmtCompact(p.lsiNet)} after fees − extractor ${fmtCompact(p.extCost)}`, p.perExtraction >= 0 ? 'pos' : 'neg')}
      ${stat('PLEX', fmtCompact(p.plex) + ' ISK', 'Global PLEX market, lowest sell')}
    </div>
    <div class="panel" style="padding:0;margin-bottom:16px"><table><thead><tr><th>Pilot</th><th>Training</th><th class="right">SP / day</th><th class="right">SP / 30 days</th><th class="right">Injectors</th><th>Paid as</th><th class="right">Game time</th><th class="right">Profit / 30 days</th><th class="right">Extract now</th></tr></thead><tbody>
      ${d.pilots.map(x => x.error ? html`<tr><td>${x.name}</td><td colspan="8" class="dim">${x.error}</td></tr>` : html`<tr style="${raw(x.slot === 'skip' ? 'opacity:.55' : '')}">
        <td><img src="${portrait(x.id, 32)}" width="22" height="22" style="border-radius:4px;vertical-align:middle;margin-right:8px">${x.name}<div class="dim" style="font-size:11.5px;margin-left:30px">${fmtNum(x.totalSp)} SP</div></td>
        <td class="${x.training ? '' : 'dim'}">${x.training || 'Not training'}</td>
        <td class="right num">${x.spPerHour ? fmtSp(x.spPerDay) : '—'}</td><td class="right num">${x.spPerHour ? fmtSp(x.spMonth) : '—'}</td><td class="right num">${x.extractions ? x.extractions.toFixed(2) : '—'}</td>
        <td><select class="crumb-select" data-fm-slot="${x.id}">${Object.entries(SLOT_LABELS).map(([k, l]) => html`<option value="${k}" ${raw(k === x.slot ? 'selected' : '')}>${l}</option>`)}</select></td>
        <td class="right num muted">${x.plexCost ? fmtNum(x.plexCost) + ' PLEX' : '—'}</td>
        <td class="right num ${x.profit >= 0 ? 'pos' : 'neg'}">${x.slot === 'skip' ? '—' : fmtCompact(x.profit)}</td>
        <td class="right num">${x.aboveMin ? html`<span class="badge green">${x.extractable}</span>` : html`<span class="dim" title="Extractors need the pilot above 5.5m SP">under 5.5m</span>`}</td></tr>`)}
    </tbody></table></div>
    <div class="panel"><h3>Assumptions</h3>
      <div class="toolbar" style="flex-wrap:wrap;gap:14px">
        <label>Omega per 30 days <input id="fm-omega" type="number" min="0" value="${c.omegaPlex}" style="${inStyle}"> PLEX</label>
        <label>MCT per 30 days <input id="fm-mct" type="number" min="0" value="${c.mctPlex}" style="${inStyle}"> PLEX</label>
        <label>Sell injectors <select id="fm-mode" class="crumb-select"><option value="buy" ${raw(c.sellMode === 'buy' ? 'selected' : '')}>to buy orders (instant)</option><option value="sell" ${raw(c.sellMode === 'sell' ? 'selected' : '')}>with sell orders</option></select></label>
        <label>Sales tax <input id="fm-tax" type="number" step="0.01" min="0" value="${c.salesTax}" style="${inStyle}"> %</label>
        <label>Broker fee <input id="fm-broker" type="number" step="0.01" min="0" value="${c.brokerFee}" style="${inStyle}"> %</label>
        <button class="btn btn-primary" id="fm-save">Recalculate</button></div>
      <div class="dim" style="font-size:12px;margin-top:8px">SP per day comes from each pilot's current skill, so it includes their attributes and implants. Each Large Skill Injector is 500,000 SP. Game time prices are the New Eden Store prices without discounts; change them if you buy on a sale or in bulk. Extract now is how many extractors the pilot can use today without dropping below 5m SP. Prices are Jita, with PLEX from the global PLEX market.</div>
    </div>`);
  const save = async extra => { const r2 = await api.farm.save({ omegaPlex: $('#fm-omega').value, mctPlex: $('#fm-mct').value, sellMode: $('#fm-mode').value, salesTax: $('#fm-tax').value, brokerFee: $('#fm-broker').value, ...extra }); if (!r2.ok) return toast(r2.error || 'Could not save', true); tFarm(); };
  $('#fm-save').onclick = () => save({});
  document.querySelectorAll('[data-fm-slot]').forEach(s => s.onchange = () => save({ slots: { [s.dataset.fmSlot]: s.value } }));
}

const insureState = { names: '' };
async function tInsure(stillCurrent) {
  setContent(loadingView('Reading insurance prices…'));
  const names = insureState.names.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
  const r = await api.farm.insurance(names);
  if (stillCurrent && !stillCurrent()) return;
  if (!r.ok) return setContent(errorView(r));
  const d = r.data;
  const vcls = v => v === 'Worth it' ? 'green' : v === 'Marginal' ? 'gold' : 'red';
  setContent(html`<div class="grid" style="grid-template-columns:2fr 1fr;gap:16px;align-items:start">
    <div class="panel" style="padding:0">${d.rows.length ? html`<table><thead><tr><th>Ship</th><th class="right">Hull price</th><th class="right">Platinum cost</th><th class="right">Payout</th><th class="right">Net if lost</th><th class="right">Covers</th><th></th></tr></thead><tbody>
      ${d.rows.map(x => html`<tr><td>${icon(x.typeId, 20)}${x.type}${x.pilot ? html`<div class="dim" style="font-size:11.5px;margin-left:26px">${x.pilot}${x.shipName ? ' · ' + x.shipName : ''}</div>` : ''}</td>
        <td class="right num">${fmtCompact(x.hull)}</td>
        <td class="right num">${x.platinum ? fmtCompact(x.platinum.cost) : '—'}</td>
        <td class="right num">${x.platinum ? fmtCompact(x.platinum.payout) : '—'}</td>
        <td class="right num">${x.platinum ? fmtCompact(x.platinum.net) : '—'}</td>
        <td class="right num">${x.coverPct !== null ? Math.round(x.coverPct * 100) + '%' : '—'}</td>
        <td><span class="badge ${vcls(x.verdict)}">${x.verdict}</span></td></tr>
        ${x.levels.length > 1 ? html`<tr><td colspan="7" class="dim" style="font-size:11.5px;padding-top:0">${x.levels.map(l => `${l.name}: pay ${fmtCompact(l.cost)}, get ${fmtCompact(l.payout)}`).join(' · ')}</td></tr>` : ''}`)}
    </tbody></table>` : emptyBox('None of your pilots is in a ship right now. Add ship names on the right to check them.')}</div>
    <div class="panel"><h3>Check other ships</h3>
      <textarea id="in-names" rows="8" style="width:100%" class="mono-area" placeholder="One ship per line, e.g.&#10;Rattlesnake&#10;Paladin&#10;Gila">${insureState.names}</textarea>
      <button class="btn btn-primary" id="in-go" style="margin-top:8px">Check</button>
      ${d.unknown.length ? html`<div class="notice" style="margin-top:8px">Not recognised: ${d.unknown.join(', ')}</div>` : ''}
      <div class="dim" style="font-size:12px;margin-top:10px">Insurance pays out a fixed amount set by CCP, which can be far from the hull's market price. Net if lost is the payout minus what the policy costs. Covers is that net as a share of the Jita hull price. Policies last 12 weeks.</div>
    </div></div>`);
  $('#in-go').onclick = () => { insureState.names = $('#in-names').value; tInsure(); };
}
