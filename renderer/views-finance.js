'use strict';
/* Finance: net worth history and income analytics. */

const finState = { pilot: '', days: 30 };

async function tNetworth(stillCurrent) {
  setContent(loadingView('Loading history…'));
  const r = await api.fin.history();
  if (stillCurrent && !stillCurrent()) return;
  if (!r.ok) return setContent(errorView(r));
  const d = r.data;
  const last = d.totals[d.totals.length - 1], first = d.totals[0];
  const ts = x => Date.parse(x.date + 'T00:00:00Z');
  setContent(html`
    <div class="toolbar"><button class="btn btn-primary" id="nw-snap">Take snapshot now</button><span class="dim">A snapshot of wallets, asset values and skill points is saved automatically once a day while the app runs.</span></div>
    <div class="grid grid-4" style="margin-bottom:16px">${stat('Net worth', last ? fmtCompact(last.total) + ' ISK' : '—', last ? `${fmtCompact(last.wallet)} wallets · ${fmtCompact(last.assets)} assets` : 'No snapshots yet')}
      ${stat('Change', first && last && d.totals.length > 1 ? (last.total >= first.total ? '+' : '') + fmtCompact(last.total - first.total) : '—', first ? 'Since ' + fmtDay(first.date) : '', last && first && last.total >= first.total ? 'pos' : 'neg')}
      ${stat('Skill points', last ? fmtNum(last.sp) : '—')}${stat('Snapshots', d.totals.length)}</div>
    <div class="panel"><h3>Net worth over time</h3>${d.totals.length > 1 ? lineChart([
      { points: d.totals.map(x => ({ x: ts(x), y: x.total })) }, { points: d.totals.map(x => ({ x: ts(x), y: x.assets })), color: 'var(--gold)' }, { points: d.totals.map(x => ({ x: ts(x), y: x.wallet })), color: 'var(--blue)' }])
      : html`<div class="muted">The chart appears after the second daily snapshot.</div>`}
      <div class="dim" style="font-size:12px">Total (teal), assets (gold), wallets (blue). Asset values use CCP average prices.</div></div>
    <div class="panel" style="padding:0"><table><thead><tr><th>Pilot</th><th class="right">Wallet</th><th class="right">Assets</th><th class="right">Total</th><th class="right">Skill points</th><th class="right">Change (30d)</th></tr></thead><tbody>
      ${d.pilots.map(p => { const l = p.points[p.points.length - 1]; const old = [...p.points].reverse().find(x => Date.parse(x.date) <= Date.now() - 30 * 86400000) || p.points[0];
        return html`<tr><td>${charImg(p.id, 20)}${p.name}</td><td class="right num">${l ? fmtCompact(l.wallet) : '—'}</td><td class="right num">${l ? fmtCompact(l.assets) : '—'}</td><td class="right num"><b>${l ? fmtCompact(l.total) : '—'}</b></td>
          <td class="right num">${l ? fmtNum(l.sp) : '—'}</td><td class="right num ${l && old && l.total >= old.total ? 'pos' : 'neg'}">${l && old && l !== old ? fmtCompact(l.total - old.total) : '—'}</td></tr>`; })}</tbody></table></div>`);
  $('#nw-snap').onclick = async () => { toast('Taking snapshot (assets can take a moment)…'); const s = await api.fin.snapshot(); if (!s.ok) return toast(s.error, true); toast('Snapshot saved'); tNetworth(); };
}

async function tIncome(stillCurrent) {
  const pilots = state.characters.filter(c => !c.needsReauth);
  setContent(html`<div class="toolbar"><select id="in-pilot" class="crumb-select"><option value="">All pilots</option>${pilots.map(c => html`<option value="${c.id}" ${raw(String(c.id) === String(finState.pilot) ? 'selected' : '')}>${c.name}</option>`)}</select>
    <select id="in-days" class="crumb-select">${[7, 14, 30].map(d => html`<option value="${d}" ${raw(d === finState.days ? 'selected' : '')}>Last ${d} days</option>`)}</select></div><div id="in-out">${loadingView('Reading wallet journals…')}</div>`);
  $('#in-pilot').onchange = e => { finState.pilot = e.target.value; tIncome(); };
  $('#in-days').onchange = e => { finState.days = Number(e.target.value); tIncome(); };
  const r = await api.fin.income(finState.pilot ? [Number(finState.pilot)] : [], finState.days);
  if (stillCurrent && !stillCurrent()) return;
  const out = $('#in-out'); if (!out) return;
  if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
  const d = r.data;
  const ts = x => Date.parse(x.date + 'T00:00:00Z');
  out.innerHTML = String(html`
    <div class="grid grid-4" style="margin-bottom:16px">${stat('Income', fmtCompact(d.income) + ' ISK', `${fmtCompact(d.income / d.days)} per day`, 'pos')}${stat('Spending', fmtCompact(d.expense) + ' ISK', '', 'neg')}
      ${stat('Net', fmtCompact(d.net) + ' ISK', `${d.entries} journal entries`, d.net >= 0 ? 'pos' : 'neg')}${stat('Ratting ticks', d.ratting.ticks, d.ratting.ticks ? `${fmtCompact(d.ratting.perTick)} per tick · ≈ ${fmtCompact(d.ratting.perHour)}/h while ratting` : 'No bounties')}</div>
    <div class="panel"><h3>Daily income and spending</h3>${d.daily.length > 1 ? lineChart([{ points: d.daily.map(x => ({ x: ts(x), y: x.income })) }, { points: d.daily.map(x => ({ x: ts(x), y: -x.expense })), color: 'var(--red)' }, { points: d.daily.map(x => ({ x: ts(x), y: x.ratting })), color: 'var(--gold)' }])
      : html`<div class="muted">Not enough data</div>`}<div class="dim" style="font-size:12px">Income (teal), spending (red), ratting (gold).</div></div>
    <div class="panel" style="padding:0"><table><thead><tr><th>Category</th><th class="right">Income</th><th class="right">Spending</th><th class="right">Net</th><th class="right">Entries</th></tr></thead><tbody>
      ${d.categories.map(c => html`<tr><td>${humanize(c.category)}</td><td class="right num pos">${c.income ? fmtCompact(c.income) : ''}</td><td class="right num neg">${c.expense ? fmtCompact(c.expense) : ''}</td><td class="right num"><b>${fmtCompact(c.income + c.expense)}</b></td><td class="right num dim">${c.count}</td></tr>`)}</tbody></table></div>`);
}


// ================= Ratting & Abyss ISK per hour =================
function ratTicks(s) {
  const t = s.tickList || [];
  if (!t.length) return html`<div class="dim">Refresh to see the bounty ticks.</div>`;
  const max = Math.max(1, ...t.map(x => x.amount));
  return html`<div style="display:flex;align-items:flex-end;gap:3px;height:56px;margin-bottom:6px">${t.map(x => html`<div title="${fmtDate(x.time)} · ${fmtCompact(x.amount)} ISK${x.system ? ' · ' + x.system : ''}" style="flex:1;max-width:26px;height:${raw(String(Math.max(3, Math.round(52 * x.amount / max))))}px;background:var(--accent);opacity:.8;border-radius:2px 2px 0 0"></div>`)}</div>
    <table><thead><tr><th>Tick</th><th>System</th><th class="right">Bounty</th></tr></thead><tbody>${t.slice().reverse().map(x => html`<tr><td class="nowrap dim">${fmtDate(x.time)}</td><td>${x.system ? html`<a href="#" data-system="${x.system}">${x.system}</a>` : ''}</td><td class="right num">${fmtCompact(x.amount)}</td></tr>`)}</tbody></table>
    ${s.ess ? html`<div class="dim" style="font-size:12px;margin-top:4px">Plus ${fmtCompact(s.ess)} ISK from the ESS after the session.</div>` : ''}`;
}
function abyssLoot(x) {
  const total = x.lootItems.reduce((n, i) => n + (i.value || 0), 0);
  return html`<table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Value</th><th class="right">Share</th></tr></thead><tbody>${x.lootItems.map(i => html`<tr><td>${i.typeId ? icon(i.typeId, 16) : ''}${i.name}</td><td class="right num">${fmtNum(i.qty)}</td><td class="right num">${i.value !== undefined ? fmtCompact(i.value) : '—'}</td><td class="right num dim">${i.value && total ? Math.round(i.value / total * 100) + '%' : ''}</td></tr>`)}</tbody></table>`;
}

const pveState = { days: 14, pilot: '', rat: null, abyss: null };
api.pve.onAbyss((kind, run) => {
  if (kind === 'start') toast(`${run.charName} entered the Abyss. Timing the run…`);
  if (state.view === 'tools' && state.toolsTab === 't-pve') loadAbyss();
});

async function tPve() {
  const pilots = state.characters.filter(c => !c.needsReauth);
  setContent(html`<div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
    <div><div class="toolbar"><h3 style="margin:0 10px 0 0">Ratting</h3><select id="pv-pilot" class="crumb-select"><option value="">All pilots</option>${pilots.map(c => html`<option value="${c.id}" ${raw(String(c.id) === String(pveState.pilot) ? 'selected' : '')}>${c.name}</option>`)}</select>
      <select id="pv-days" class="crumb-select">${[3, 7, 14, 30].map(d => html`<option value="${d}" ${raw(d === pveState.days ? 'selected' : '')}>Last ${d} days</option>`)}</select></div><div id="pv-rat">${loadingView('Reading bounty ticks…')}</div></div>
    <div><div class="toolbar"><h3 style="margin:0">Abyssal runs</h3></div><div id="pv-aby">${loadingView('Loading runs…')}</div></div></div>`);
  $('#pv-pilot').onchange = e => { pveState.pilot = e.target.value; loadRat(); };
  $('#pv-days').onchange = e => { pveState.days = Number(e.target.value); loadRat(); };
  loadRat(); loadAbyss();
}

async function loadRat() {
  const box = $('#pv-rat'); if (!box) return;
  box.innerHTML = String(loadingView('Reading bounty ticks…'));
  const r = await api.pve.ratting(pveState.pilot ? [Number(pveState.pilot)] : [], pveState.days);
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  const d = r.data; pveState.rat = d;
  box.innerHTML = String(html`<div class="grid grid-3" style="margin-bottom:12px">${stat('ISK per hour', fmtCompact(d.iskPerHour), 'Bounties + ESS', 'pos')}${stat('Time ratting', d.hours.toFixed(1) + ' h', `${d.sessions.length} sessions`)}${stat('Earned', fmtCompact(d.isk) + ' ISK')}</div>
    ${d.systems.length ? html`<div class="panel"><h3>Best systems</h3>${d.systems.map(x => html`<div class="skill-row"><span>${x.system} <span class="dim">${(x.minutes / 60).toFixed(1)} h</span></span><span class="num">${fmtCompact(x.iskPerHour)}/h</span></div>`)}</div>` : ''}
    <div class="panel" style="padding:0">${d.sessions.length ? html`<div class="table-wrap" style="max-height:52vh"><table><thead><tr><th>Session</th><th>Pilot</th><th>System</th><th class="right">Time</th><th class="right">ISK</th><th class="right">ISK/h</th></tr></thead><tbody>
      ${d.sessions.map(s => xRow('rs' + s.charId + s.start, html`<td class="nowrap">${fmtDate(s.start)}</td><td>${s.charName || ''}</td><td>${s.system || ''}</td><td class="right num">${Math.floor(s.minutes / 60)}h ${s.minutes % 60}m</td><td class="right num">${fmtCompact(s.isk)}${s.ess ? html`<div class="dim" style="font-size:11px">${fmtCompact(s.ess)} ESS</div>` : ''}</td><td class="right num"><b>${fmtCompact(s.iskPerHour)}</b></td>`, ratTicks(s), 6))}</tbody></table></div>`
      : html`<div class="muted" style="padding:14px 18px">No bounty ticks in this period.</div>`}</div>
    <div class="dim" style="font-size:12px">A session is a run of bounty ticks no more than 30 minutes apart. CCP pays bounties every 20 minutes, so times are accurate to about 20 minutes. ESS payouts count towards the session before them.</div>`);
}

async function loadAbyss() {
  const box = $('#pv-aby'); if (!box) return;
  const r = await api.pve.abyss();
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  const d = r.data, c = d.cfg; pveState.abyss = d;
  box.innerHTML = String(html`<div class="panel">
      <label class="check"><input type="checkbox" id="ab-on" ${raw(c.enabled ? 'checked' : '')}> <b>Time Abyss runs automatically</b></label>
      <div class="dim" style="font-size:12px;margin:2px 0 10px">Checks your pilots' locations every 20 seconds and times each visit to Abyssal deadspace.</div>
      <div class="grid grid-3" style="gap:8px">${field('Default filament', html`<select id="ab-fil" class="crumb-select">${d.filaments.map(f => html`<option ${raw(f === c.filament ? 'selected' : '')}>${f}</option>`)}</select>`)}
        ${field('Loot valued at', html`<select id="ab-price" class="crumb-select">${[['buy', 'Jita buy (instant sale)'], ['split', 'Jita split'], ['sell', 'Jita sell']].map(([v, l]) => html`<option value="${v}" ${raw(c.price === v ? 'selected' : '')}>${l}</option>`)}</select>`)}
        ${field('Minutes between runs', html`<input type="number" id="ab-over" value="${c.overhead}" min="0" max="30">`, 'Docking, refitting, buying filaments')}</div>
      ${d.open.length ? html`<div class="notice" style="margin:8px 0 0">${d.open.map(o => html`<div>${o.charName} is in the Abyss: started ${Math.round((Date.now() - Date.parse(o.start)) / 60000)} min ago</div>`)}</div>` : ''}</div>
    <div class="grid grid-4" style="margin-bottom:12px">${stat('ISK per hour', fmtCompact(d.totals.iskPerHour), 'After filament cost', d.totals.iskPerHour >= 0 ? 'pos' : 'neg')}${stat('Runs', d.totals.runs, `${d.totals.valued} valued`)}${stat('Average run', d.totals.avgMinutes + ' min')}${stat('Profit', fmtCompact(d.totals.profit), d.totals.deaths ? `${d.totals.deaths} ship${d.totals.deaths > 1 ? 's' : ''} lost` : '', d.totals.deaths ? 'neg' : '')}</div>
    ${d.byFilament.length ? html`<div class="panel"><h3>By filament</h3>${d.byFilament.map(x => html`<div class="skill-row"><span>${x.filament} <span class="dim">${x.runs} runs · avg ${fmtCompact(x.avg)}</span></span><span class="num">${fmtCompact(x.iskPerHour)}/h</span></div>`)}</div>` : ''}
    <div class="toolbar"><button class="btn btn-ghost" id="ab-add">+ Add a run by hand</button></div>
    <div class="panel" style="padding:0">${d.runs.length ? html`<div class="table-wrap" style="max-height:46vh"><table><thead><tr><th>Run</th><th>Filament</th><th class="right">Time</th><th class="right">Loot</th><th class="right">Profit</th><th class="right">ISK/h</th><th></th></tr></thead><tbody>
      ${d.runs.map(x => { const cells = html`<td class="nowrap">${fmtDate(x.start)}<div class="dim" style="font-size:11px">${x.charName || 'manual'}${x.died ? ' · ' : ''}${x.died ? raw('<span class="neg">ship lost</span>') : ''}</div></td><td style="font-size:12px">${x.filament || ''}<div class="dim">${x.filamentCost !== null && x.filamentCost !== undefined ? fmtCompact(x.filamentCost) : ''}</div></td>
        <td class="right num">${x.minutes || '?'}m</td><td class="right num">${x.lootValue !== null ? fmtCompact(x.lootValue) : html`<button class="btn btn-primary" style="padding:2px 8px;font-size:12px" data-ab-loot="${x.id}">Paste loot</button>`}</td>
        <td class="right num ${x.profit > 0 ? 'pos' : x.profit < 0 ? 'neg' : ''}">${x.profit !== null ? fmtCompact(x.profit) : ''}</td><td class="right num"><b>${x.iskPerHour !== null ? fmtCompact(x.iskPerHour) : ''}</b></td>
        <td class="nowrap" style="font-size:12px"><a href="#" data-ab-edit="${x.id}">Edit</a> · <a href="#" data-ab-del="${x.id}">Delete</a></td>`; return x.lootItems && x.lootItems.length ? xRow('ab' + x.id, cells, abyssLoot(x), 7, { title: 'Click to see the loot' }) : html`<tr>${cells}</tr>`; })}</tbody></table></div>`
      : html`<div class="muted" style="padding:14px 18px">No runs yet. Turn on automatic timing and jump into a filament, or add a run by hand.</div>`}</div>`);
  $('#ab-on').onchange = e => saveAby({ enabled: e.target.checked }, e.target.checked ? 'Abyss timing on' : 'Abyss timing off');
  $('#ab-fil').onchange = e => saveAby({ filament: e.target.value });
  $('#ab-price').onchange = e => saveAby({ price: e.target.value });
  $('#ab-over').onchange = e => saveAby({ overhead: e.target.value });
  $('#ab-add').onclick = () => openModal('Add an Abyss run', html`${field('Filament', select('filament', d.filaments.map(f => [f, f]), c.filament))}${field('Run time (minutes)', inputText('minutes', '18'))}`, {
    submit: 'Add', onSubmit: async v => { const r2 = await api.pve.abyssAdd({ filament: v.filament, minutes: v.minutes }); if (!r2.ok) throw new Error(r2.error); loadAbyss(); } });
  box.querySelectorAll('[data-ab-loot]').forEach(b => b.onclick = () => openModal('Value the loot', html`<div class="muted" style="margin-bottom:8px">In game, open the ship's cargo, press Ctrl+A then Ctrl+C, and paste it here. Leave out ammo and drones you brought in.</div>${field('Loot', textarea('loot', '', 10))}`, {
    submit: 'Value loot', onSubmit: async v => { const r2 = await api.pve.abyssLoot(b.dataset.abLoot, v.loot); if (!r2.ok) throw new Error(r2.error); toast(`Loot worth ${fmtCompact(r2.data.lootValue)} ISK`); loadAbyss(); } }));
  box.querySelectorAll('[data-ab-edit]').forEach(a => a.onclick = e => { e.preventDefault(); const x = d.runs.find(y => y.id === a.dataset.abEdit); openModal('Edit run', html`${field('Filament', select('filament', d.filaments.map(f => [f, f]), x.filament))}${field('Run time (minutes)', inputText('minutes', String(x.minutes || 20)))}${field('Loot value (ISK)', inputText('loot', x.lootValue !== null ? String(x.lootValue) : ''))}${checkbox('died', 'Ship was lost', !!x.died)}`, {
    submit: 'Save', onSubmit: async v => { const r2 = await api.pve.abyssUpdate(x.id, { filament: v.filament, minutes: v.minutes, died: !!v.died, ...(v.loot !== '' ? { lootValue: v.loot } : {}) }); if (!r2.ok) throw new Error(r2.error); loadAbyss(); } }); });
  box.querySelectorAll('[data-ab-del]').forEach(a => a.onclick = async e => { e.preventDefault(); await api.pve.abyssRemove(a.dataset.abDel); loadAbyss(); });
}
async function saveAby(p, msg) { const r = await api.pve.abyssCfg(p); if (!r.ok) return toast(r.error, true); if (msg) toast(msg); loadAbyss(); }
