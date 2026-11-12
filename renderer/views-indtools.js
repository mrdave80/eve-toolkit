'use strict';
/* Industry tools: Job Splitter and Blueprint Prices (Tools → Industry). */

const splitState = { text: '', maxHours: 24, structure: 'raitaru', rig: 't1', security: 'hs', me: 10, te: 20, useBpcs: true, data: null };
const itSel = (id, opts, v) => html`<select id="${id}" class="crumb-select">${opts.map(([k, l]) => html`<option value="${k}" ${raw(String(k) === String(v) ? 'selected' : '')}>${l}</option>`)}</select>`;

async function tJobSplit(stillCurrent) {
  const s = splitState;
  const st = await api.ind.structures();
  const S = st.ok ? st.data.structures : { npc: { label: 'NPC station' } };
  setContent(html`<div class="grid" style="grid-template-columns:minmax(300px,1fr) 2fr;gap:16px;align-items:start">
    <div class="panel"><h3>What to build</h3>
      <textarea id="js-text" rows="10" style="width:100%" class="mono-area" placeholder="One item per line, e.g.&#10;Hammerhead II 500&#10;Ishtar 4&#10;10x Damage Control II">${s.text}</textarea>
      <div class="grid grid-2" style="margin-top:10px;gap:10px">
        ${field('Longest job', itSel('js-hours', [[2, '2 hours'], [8, '8 hours'], [12, '12 hours'], [24, '1 day'], [48, '2 days'], [72, '3 days'], [168, '1 week'], [720, '30 days']], s.maxHours))}
        ${field('Where', itSel('js-struct', Object.entries(S).map(([k, v]) => [k, v.label]), s.structure))}
        ${field('Rigs', itSel('js-rig', [['none', 'None'], ['t1', 'T1'], ['t2', 'T2']], s.rig))}
        ${field('Security', itSel('js-sec', [['hs', 'High sec'], ['ls', 'Low sec'], ['ns', 'Null / WH']], s.security))}
        ${field('ME if you don’t own it', html`<input type="number" id="js-me" value="${s.me}" min="0" max="10">`)}${field('TE', html`<input type="number" id="js-te" value="${s.te}" min="0" max="20">`)}</div>
      <label class="check"><input type="checkbox" id="js-bpc" ${raw(s.useBpcs ? 'checked' : '')}> Use up blueprint copies first</label>
      <button class="btn btn-primary" id="js-go" style="margin-top:8px">Split into jobs</button>
      <div class="dim" style="font-size:12px;margin-top:8px">Jobs are split so none runs longer than you pick (handy for "log in once a day"), then shared out over every pilot's free manufacturing and reaction slots. Copies stay with the pilot who owns them.</div></div>
    <div id="js-out">${s.data ? '' : emptyBox('Paste a list to see the jobs for each pilot and the materials you still need.')}</div></div>`);
  $('#js-go').onclick = async () => {
    Object.assign(s, { text: $('#js-text').value, maxHours: Number($('#js-hours').value), structure: $('#js-struct').value, rig: $('#js-rig').value, security: $('#js-sec').value, me: Number($('#js-me').value), te: Number($('#js-te').value), useBpcs: $('#js-bpc').checked });
    $('#js-out').innerHTML = String(loadingView('Reading slots, blueprints and assets…'));
    const r = await api.ind.split({ text: s.text, maxHours: s.maxHours, structure: s.structure, rig: s.rig, security: s.security, me: s.me, te: s.te, useBpcs: s.useBpcs });
    if (stillCurrent && !stillCurrent()) return;
    if (!r.ok) { $('#js-out').innerHTML = String(errorView(r)); return; }
    s.data = r.data; drawSplit();
  };
  if (s.data) drawSplit();
}

function drawSplit() {
  const d = splitState.data, t = d.totals;
  const dur = sec => fmtDuration(sec * 1000, true);
  const jobRow = j => html`<tr><td>${icon(j.productTypeId, 18)}${j.product}${j.activity === 'reaction' ? raw(' <span class="badge">reaction</span>') : ''}</td><td class="right num">${fmtNum(j.runs)}</td><td class="right num">${fmtNum(j.out)}</td><td class="right num dim">${dur(j.seconds)}</td>
    <td style="font-size:12px">${j.bp ? html`${j.bp} <span class="dim">ME ${j.me} / TE ${j.te}</span>` : html`<span class="gold">no blueprint</span> <span class="dim">ME ${j.me}</span>`}${j.moveBp ? html`<div class="gold" style="font-size:11.5px">Blueprint is with ${j.moveBp}</div>` : ''}</td></tr>`;
  $('#js-out').innerHTML = String(html`<div class="grid grid-3" style="margin-bottom:12px">${stat('Jobs', fmtNum(t.jobs), `${fmtNum(t.placed)} fit in free slots now`, t.placed < t.jobs ? 'gold' : 'pos')}${stat('Materials to buy', fmtNum(t.toBuy), `${fmtNum(Math.round(t.buyVolume))} m³ to haul`)}${stat('Pilots', fmtNum(d.pilots.filter(p => p.jobs.length).length), `of ${d.pilots.length} with jobs`)}</div>
    ${d.skipped.length || d.unknown.length ? html`<div class="notice" style="margin-bottom:12px">${d.skipped.map(x => html`<div>${x.name}: ${x.why}</div>`)}${d.unknown.length ? html`<div>Not recognised: ${d.unknown.slice(0, 6).join(', ')}</div>` : ''}</div>` : ''}
    ${d.pilots.map(p => html`<div class="panel" style="padding:0;margin-bottom:12px"><div style="padding:12px 16px;display:flex;gap:10px;align-items:baseline">${charImg(p.id, 22)}<h3 style="margin:0;flex:1">${p.name}</h3>
      ${p.error ? html`<span class="neg" style="font-size:12px">${p.error}</span>` : html`<span class="dim" style="font-size:12px">${p.jobs.length} job${p.jobs.length === 1 ? '' : 's'} · free slots: ${p.free.manufacturing} manufacturing, ${p.free.reaction} reaction${p.jobs.length ? ' · done in ' + fmtDuration(p.hours * 3600000, true) : ''}</span>`}</div>
      ${p.jobs.length ? html`<table><thead><tr><th>Product</th><th class="right">Runs</th><th class="right">Makes</th><th class="right">Time</th><th>Blueprint</th></tr></thead><tbody>${p.jobs.map(jobRow)}</tbody></table>` : ''}</div>`)}
    ${d.waiting.length ? html`<div class="panel" style="padding:0;margin-bottom:12px"><div style="padding:12px 16px"><h3 style="margin:0">Waiting for a free slot</h3><div class="dim" style="font-size:12px">${d.waiting.length} more job${d.waiting.length === 1 ? '' : 's'} once the ones above finish</div></div><table><tbody>${d.waiting.map(jobRow)}</tbody></table></div>` : ''}
    <div class="panel" style="padding:0"><div style="padding:12px 16px;display:flex;align-items:center"><h3 style="margin:0;flex:1">Materials</h3>${d.multibuy ? html`<button class="btn btn-ghost" id="js-copy" style="padding:3px 10px;font-size:12px">Copy shopping list (multibuy)</button>` : ''}</div>
      <div class="table-wrap" style="max-height:50vh"><table><thead><tr><th>Material</th><th class="right">Need</th><th class="right">Have</th><th class="right">Buy</th><th>Where you have it</th></tr></thead><tbody>
      ${d.materials.map(m => html`<tr><td>${icon(m.typeId, 18)}${m.name}</td><td class="right num">${fmtNum(m.need)}</td><td class="right num ${m.have >= m.need ? 'pos' : ''}">${fmtNum(m.have)}</td><td class="right num ${m.buy ? 'gold' : 'dim'}">${m.buy ? fmtNum(m.buy) : '—'}</td>
        <td style="font-size:12px">${m.places.map(p => html`<div>${fmtNum(p.qty)} <span class="dim">· ${p.pilot} · ${p.location}</span></div>`)}</td></tr>`)}</tbody></table></div></div>`);
  const c = $('#js-copy'); if (c) c.onclick = () => { navigator.clipboard.writeText(d.multibuy); toast('Copied. In game: Market → Multibuy → Import'); };
}

// ================= Blueprint prices =================

const bpState = { q: '', regions: [], data: null };
async function tBpPrices(stillCurrent) {
  const s = bpState;
  const REG = [[10000002, 'The Forge'], [10000043, 'Domain'], [10000032, 'Sinq Laison'], [10000042, 'Metropolis'], [10000030, 'Heimatar']];
  setContent(html`<div class="panel" style="margin-bottom:14px"><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
      <div class="field" style="margin:0;flex:1;min-width:260px"><label>Blueprint or what it makes</label><input type="text" id="bp-q" value="${s.q}" placeholder="e.g. Hammerhead II Blueprint, Raven, Ishtar"></div>
      <div class="field" style="margin:0"><label>Regions</label><div style="display:flex;gap:10px;flex-wrap:wrap">${REG.map(([id, n]) => html`<label class="check" style="margin:0"><input type="checkbox" data-bpreg="${id}" ${raw(!s.regions.length || s.regions.includes(id) ? 'checked' : '')}> ${n}</label>`)}</div></div>
      <button class="btn btn-primary" id="bp-go">Find prices</button></div>
      <div class="dim" style="font-size:12px;margin-top:8px">Blueprints mostly sell on contracts, so their market price means little. This reads public contracts that hold just that one blueprint. The first search reads a lot of contracts; later ones are quick.</div></div>
    <div id="bp-out">${s.data ? '' : emptyBox('Search for a blueprint to see what originals and copies really sell for.')}</div>`);
  const go = async () => {
    s.q = $('#bp-q').value.trim(); if (!s.q) return;
    s.regions = [...document.querySelectorAll('[data-bpreg]')].filter(i => i.checked).map(i => Number(i.dataset.bpreg));
    const out = $('#bp-out');
    out.innerHTML = String(html`<div class="loading"><div class="spinner"></div><span id="bp-prog">Reading contracts…</span></div>`);
    const tick = setInterval(async () => { const r = await api.ind.bpStatus(); const el = $('#bp-prog'); if (!el || !r.ok) return; const d = r.data; if (d.phase === 'lists') el.textContent = `Reading contract lists… ${d.done} of ${d.total} regions`; else if (d.phase === 'items') el.textContent = `Opening single-blueprint contracts… ${fmtNum(d.done)} of ${fmtNum(d.total)}`; }, 700);
    const r = await api.ind.bpOffers({ query: s.q, regions: s.regions });
    clearInterval(tick);
    if (stillCurrent && !stillCurrent()) return;
    if (!$('#bp-out')) return;
    if (!r.ok) { $('#bp-out').innerHTML = String(errorView(r)); return; }
    s.data = r.data; drawBp();
  };
  $('#bp-go').onclick = go;
  $('#bp-q').onkeydown = e => { if (e.key === 'Enter') go(); };
  if (s.data) drawBp();
}

function drawBp() {
  const d = bpState.data, m = d.summary;
  const where = r => html`${r.system ? html`<a href="#" data-system="${r.system}">${r.system}</a>${r.security !== null && r.security !== undefined ? secBadge(r.security) : ''}` : r.region}<div class="dim" style="font-size:11.5px">${r.location || r.region}</div>`;
  const ago = t => fmtDuration(Date.now() - Date.parse(t), true);
  $('#bp-out').innerHTML = String(html`<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">${icon(d.blueprintId, 32)}<div><div style="font-size:16px">${d.blueprint}</div>${d.product ? html`<div class="dim" style="font-size:12px">Makes ${d.product}</div>` : ''}</div></div>
    <div class="grid grid-4" style="margin-bottom:14px">${stat('Original (BPO)', m.bpoCheapest ? fmtCompact(m.bpoCheapest) + ' ISK' : '—', m.bpos ? `cheapest of ${m.bpos} · median ${fmtCompact(m.bpoMedian)}` : 'None on contract')}
      ${stat('Copy, per run', m.bpcPerRunCheapest ? fmtCompact(m.bpcPerRunCheapest) + ' ISK' : '—', m.bpcs ? `cheapest of ${m.bpcs} · median ${fmtCompact(m.bpcPerRunMedian)}` : 'None on contract')}
      ${stat('NPC market', d.market && d.market.sell ? fmtCompact(d.market.sell) + ' ISK' : '—', d.market && d.market.sell ? 'Jita sell order (originals CCP sells)' : 'Not sold on the market')}
      ${stat('Contracts read', fmtNum(d.scanned), `single-item contracts in ${d.regions.join(', ')}`)}</div>
    <div class="grid grid-2" style="align-items:start">
      <div class="panel" style="padding:0"><div style="padding:12px 16px"><h3 style="margin:0">Originals</h3></div>${d.bpos.length ? html`<div class="table-wrap" style="max-height:55vh"><table><thead><tr><th class="right">Price</th><th class="right">ME / TE</th><th>Where</th><th class="right">Listed</th></tr></thead><tbody>
        ${d.bpos.map(r => html`<tr><td class="right num">${fmtCompact(r.price)}</td><td class="right num">${r.me ?? '?'} / ${r.te ?? '?'}</td><td>${where(r)}</td><td class="right dim">${ago(r.issued)}</td></tr>`)}</tbody></table></div>` : html`<div class="dim" style="padding:0 16px 14px">None on contract.</div>`}</div>
      <div class="panel" style="padding:0"><div style="padding:12px 16px"><h3 style="margin:0">Copies</h3></div>${d.bpcs.length ? html`<div class="table-wrap" style="max-height:55vh"><table><thead><tr><th class="right">Per run</th><th class="right">Runs</th><th class="right">Price</th><th class="right">ME / TE</th><th>Where</th></tr></thead><tbody>
        ${d.bpcs.map(r => html`<tr><td class="right num pos">${fmtCompact(r.perRun)}</td><td class="right num">${fmtNum(r.runs)}</td><td class="right num">${fmtCompact(r.price)}</td><td class="right num">${r.me ?? '?'} / ${r.te ?? '?'}</td><td>${where(r)}</td></tr>`)}</tbody></table></div>` : html`<div class="dim" style="padding:0 16px 14px">None on contract.</div>`}</div></div>
    <div class="dim" style="font-size:12px;margin-top:8px">Only contracts with the blueprint on its own are counted; packs and contracts asking for items back are left out. Open the contract in game from the contract search to buy.</div>`);
}


// ================= Ice and ore sites =================

const mineState = { tab: 'sites', from: '', kind: '', data: null, moons: null };
async function tMining(stillCurrent) {
  const s = mineState;
  const r = await api.mine.list({});
  if (stillCurrent && !stillCurrent()) return;
  if (!r.ok) return setContent(errorView(r));
  s.data = r.data; const c = r.data.cfg;
  setContent(html`<div class="grid" style="grid-template-columns:minmax(300px,1fr) 2fr;gap:16px;align-items:start">
    <div><div class="panel"><h3>Add a scan</h3>
      <textarea id="mn-scan" rows="6" style="width:100%" class="mono-area" placeholder="Probe scanner → Ctrl+A, Ctrl+C → paste here"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center"><input type="text" id="mn-sys" placeholder="System (blank = your online pilot's)" style="${raw(inBox)};flex:1;width:auto"><button class="btn btn-primary" id="mn-add">Add</button></div>
      <div class="dim" style="font-size:12px;margin-top:8px">With the clipboard watch on (Tools → Intel → Local &amp; D-scan), copying the probe scanner in game adds it by itself. Ice and ore mentioned with a system in your intel channels are picked up too.</div></div>
    <div class="panel"><h3>Alerts</h3>
      <label class="check"><input type="checkbox" id="mn-alert" ${raw(c.alert ? 'checked' : '')}> Alert me about new sites</label>
      <div style="display:flex;gap:14px;margin:4px 0 8px"><label class="check" style="margin:0"><input type="checkbox" id="mn-ice" ${raw(c.ice ? 'checked' : '')}> Ice</label><label class="check" style="margin:0"><input type="checkbox" id="mn-ore" ${raw(c.ore ? 'checked' : '')}> Ore sites</label></div>
      <div class="field" style="margin:0"><label>Within jumps of any of your pilots</label><input type="number" id="mn-jumps" min="0" max="30" value="${c.maxJumps}" style="width:90px"></div>
      <div class="dim" style="font-size:12px;margin-top:8px">CCP doesn't share anomalies outside the game, so sites only come from scans and intel messages. A sighting is kept for ${c.keepHours} hours unless a later scan shows it gone.</div></div></div>
    <div><div class="seg" style="margin-bottom:12px"><button data-mntab="sites" class="${s.tab === 'sites' ? 'active' : ''}">Sightings</button><button data-mntab="known" class="${s.tab === 'known' ? 'active' : ''}">Ice systems you've seen</button><button data-mntab="moons" class="${s.tab === 'moons' ? 'active' : ''}">Moon chunks</button></div>
      <div id="mn-out"></div></div></div>`);
  const save = () => api.mine.cfg({ alert: $('#mn-alert').checked, ice: $('#mn-ice').checked, ore: $('#mn-ore').checked, maxJumps: Number($('#mn-jumps').value) });
  ['#mn-alert', '#mn-ice', '#mn-ore', '#mn-jumps'].forEach(id => $(id).onchange = save);
  $('#mn-add').onclick = async () => {
    const t = $('#mn-scan').value; if (!t.trim()) return toast('Paste your probe scanner first', true);
    const r2 = await api.mine.paste(t, { system: $('#mn-sys').value.trim() || null });
    if (!r2.ok) return toast(r2.error, true);
    if (r2.data.needSystem) return toast(r2.data.pilots.length ? 'More than one pilot is online: type the system' : 'No pilot online: type the system', true);
    toast(`${r2.data.system}: ${r2.data.sites} mining site${r2.data.sites === 1 ? '' : 's'}${r2.data.gone ? `, ${r2.data.gone} gone` : ''}`);
    $('#mn-scan').value = ''; tMining(stillCurrent);
  };
  document.querySelectorAll('[data-mntab]').forEach(b => b.onclick = () => { s.tab = b.dataset.mntab; document.querySelectorAll('[data-mntab]').forEach(x => x.classList.toggle('active', x === b)); drawMining(); });
  drawMining();
}

async function drawMining() {
  const s = mineState, d = s.data, out = $('#mn-out'); if (!out) return;
  const ago = t => timeAgo(t);
  const jumpsCell = x => (x.jumps === null || x.jumps === undefined ? html`<span class="dim">—</span>` : html`${x.jumps}${x.nearPilot ? html` <span class="dim" style="font-size:11.5px">from ${x.nearPilot}</span>` : ''}`);
  if (s.tab === 'sites') {
    const live = d.sites.filter(x => !x.gone), gone = d.sites.filter(x => x.gone);
    out.innerHTML = String(html`<div class="panel" style="padding:0">${d.sites.length ? html`<table><thead><tr><th>Site</th><th>System</th><th class="right">Jumps</th><th>Seen</th><th>From</th><th></th></tr></thead><tbody>
      ${[...live, ...gone].map(x => html`<tr class="${x.gone ? 'dim' : ''}"><td><span class="badge ${x.kind === 'ice' ? 'accent' : 'gold'}">${x.kind}</span> ${x.name}${x.gone ? raw(' <span class="badge">gone</span>') : ''}</td><td><a href="#" data-system="${x.system}">${x.system}</a>${x.security !== null ? secBadge(x.security) : ''}<div class="dim" style="font-size:11.5px">${x.region}</div></td>
        <td class="right num">${jumpsCell(x)}</td><td class="dim" style="font-size:12px">${ago(x.firstSeen)}${x.lastSeen !== x.firstSeen ? html`<div>checked ${ago(x.lastSeen)}</div>` : ''}</td><td style="font-size:12px">${x.source === 'chat' ? 'intel' : 'scan'}${x.by ? html` <span class="dim">· ${x.by}</span>` : ''}</td>
        <td><button class="btn btn-ghost" style="padding:1px 7px" data-mndel="${x.systemId}|${x.key}" title="Remove">✕</button></td></tr>`)}</tbody></table>` : emptyBox('No sightings yet. Paste a probe scan, or turn on the clipboard watch and copy one in game.')}</div>`);
    document.querySelectorAll('[data-mndel]').forEach(b => b.onclick = async () => { const [sys, key] = b.dataset.mndel.split('|'); await api.mine.remove(Number(sys), key); tMining(); });
  } else if (s.tab === 'known') {
    out.innerHTML = String(html`<div class="panel" style="padding:0">${d.knownIce.length ? html`<table><thead><tr><th>System</th><th class="right">Ice seen</th></tr></thead><tbody>${d.knownIce.map(k => html`<tr><td><a href="#" data-system="${k.system}">${k.system}</a>${k.security !== null ? secBadge(k.security) : ''} <span class="dim">${k.region}</span></td><td class="right num">${k.times}×</td></tr>`)}</tbody></table>` : emptyBox('Systems where you or your intel channels have seen ice show up here, so you know where to look next time.')}</div>
      <div class="dim" style="font-size:12px;margin-top:8px">Ice only spawns in certain systems, and once a belt is mined out a new one appears at random in one of them.</div>`);
  } else {
    out.innerHTML = String(loadingView('Reading moon extractions…'));
    const r = await api.mine.moons();
    if (s.tab !== 'moons' || !$('#mn-out')) return;
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    const ex = r.data.extractions;
    const now = Date.now();
    out.innerHTML = String(html`<div class="panel" style="padding:0">${ex.length ? html`<table><thead><tr><th>Moon</th><th>Chunk</th><th class="right">Jumps</th><th>Breaks by itself</th></tr></thead><tbody>
      ${ex.map(e => { const t = Date.parse(e.arrival) - now; return html`<tr><td>${e.moon || e.structure}<div class="dim" style="font-size:11.5px">${e.structure || ''}${e.system ? ' · ' + e.system : ''}</div></td>
        <td>${t <= 0 ? raw('<span class="badge green">ready</span>') : html`in ${fmtDuration(t, true)}`}<div class="dim" style="font-size:11.5px">${fmtDate(e.arrival)}</div></td>
        <td class="right num">${e.near ? html`${e.near.jumps} <span class="dim" style="font-size:11.5px">from ${e.near.pilot}</span>` : '—'}</td><td class="dim" style="font-size:12px">${fmtDate(e.decay)}</td></tr>`; })}</tbody></table>` : emptyBox(r.data.errors.length ? r.data.errors[0].error : 'No moon extractions. This needs a director pilot with the Station Manager role.')}</div>
      <div class="dim" style="font-size:12px;margin-top:8px">You get an alert an hour before each chunk arrives and when it's ready (turn off under Corporation → Discord).</div>`);
  }
}

// A copied probe scan or a sighting from intel: refresh the page if it's open, and say what was found
api.mine.onScan(d => { if (d && d.sites) toast(`${d.system}: ${d.sites} mining site${d.sites === 1 ? '' : 's'} from your probe scan${d.gone ? `, ${d.gone} gone` : ''}`); if (state.view === 'tools' && state.toolsTab === 't-mining') tMining(); });
api.mine.onNew(() => { if (state.view === 'tools' && state.toolsTab === 't-mining') tMining(); });
