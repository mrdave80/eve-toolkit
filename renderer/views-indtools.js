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
  const r = await api.mine.list(s.from ? { from: s.from, maxJumps: 25 } : { maxJumps: 25 });
  if (stillCurrent && !stillCurrent()) return;
  if (!r.ok && s.from) { toast(r.error, true); s.from = ''; return tMining(stillCurrent); }
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
    <div><div class="seg" style="margin-bottom:12px"><button data-mntab="sites" class="${s.tab === 'sites' ? 'active' : ''}">Sightings</button><button data-mntab="spawn" class="${s.tab === 'spawn' ? 'active' : ''}">Where ice spawns</button><button data-mntab="known" class="${s.tab === 'known' ? 'active' : ''}">Ice systems you've seen</button><button data-mntab="moons" class="${s.tab === 'moons' ? 'active' : ''}">Moon chunks</button></div>
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
      ${[...live, ...gone].map(x => html`<tr class="${x.gone ? 'dim' : ''}"><td><span class="badge ${x.kind === 'ice' ? 'accent' : 'gold'}">${x.kind}</span> ${x.name}${x.gone ? raw(' <span class="badge">gone</span>') : ''}${x.kind === 'ice' && x.iceSystem === false && x.source === 'chat' ? html`<div class="dim" style="font-size:11px" title="This system isn't on the ice spawn list, so the intel message may mean something else">not a known ice system</div>` : ''}</td><td><a href="#" data-system="${x.system}">${x.system}</a>${x.security !== null ? secBadge(x.security) : ''}<div class="dim" style="font-size:11.5px">${x.region}</div></td>
        <td class="right num">${jumpsCell(x)}</td><td class="dim" style="font-size:12px">${ago(x.firstSeen)}${x.lastSeen !== x.firstSeen ? html`<div>checked ${ago(x.lastSeen)}</div>` : ''}</td><td style="font-size:12px">${x.source === 'chat' ? 'intel' : 'scan'}${x.by ? html` <span class="dim">· ${x.by}</span>` : ''}</td>
        <td><button class="btn btn-ghost" style="padding:1px 7px" data-mndel="${x.systemId}|${x.key}" title="Remove">✕</button></td></tr>`)}</tbody></table>` : emptyBox('No sightings yet. Paste a probe scan, or turn on the clipboard watch and copy one in game.')}</div>`);
    document.querySelectorAll('[data-mndel]').forEach(b => b.onclick = async () => { const [sys, key] = b.dataset.mndel.split('|'); await api.mine.remove(Number(sys), key); tMining(); });
  } else if (s.tab === 'spawn') {
    const n = d.iceNear || [];
    out.innerHTML = String(html`<div class="panel" style="margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="dim" style="font-size:12.5px">Closest to</span>
        <input type="text" id="mn-from" value="${s.from || ''}" placeholder="${d.pilotsKnown && !s.from ? 'your pilots' : 'a system'}" style="${raw(inBox)};width:200px"><button class="btn" id="mn-from-go">Show</button>${s.from ? html`<button class="btn btn-ghost" id="mn-from-clear">Use my pilots</button>` : ''}</div>
      <div class="panel" style="padding:0">${n.length ? html`<table><thead><tr><th>System</th><th class="right">Belts</th><th class="right">Jumps</th><th>Your sightings</th></tr></thead><tbody>
        ${n.map(x => html`<tr><td><a href="#" data-system="${x.system}">${x.system}</a>${x.security !== null ? secBadge(x.security) : ''}<div class="dim" style="font-size:11.5px">${x.region}</div></td><td class="right num">${x.belts}</td>
          <td class="right num">${x.jumps}${x.pilot ? html` <span class="dim" style="font-size:11.5px">from ${x.pilot}</span>` : ''}</td>
          <td style="font-size:12px">${x.live ? html`<span class="badge green">${x.live} up now</span> ` : ''}${x.seen ? html`<span class="dim">seen ${x.seen}×</span>` : x.live ? '' : html`<span class="dim">—</span>`}</td></tr>`)}</tbody></table>`
        : emptyBox(d.pilotsKnown || s.from ? 'No ice systems within 25 jumps.' : 'None of your pilots has a known location yet. Type a system above, or start Intel Watch so the app knows where your pilots are.')}</div>
      <div class="dim" style="font-size:12px;margin-top:8px">Ice belts only appear in certain systems (${d.iceInfo ? d.iceInfo.systems : ''} of them). When a belt is mined out, a new one spawns a few hours later. This list is community data, since CCP doesn't publish it; Perrigen Falls isn't covered yet. Snowflakes on the live map mark the same systems.</div>`);
    const go = () => { s.from = $('#mn-from').value.trim(); tMining(); };
    $('#mn-from-go').onclick = go; $('#mn-from').onkeydown = e => { if (e.key === 'Enter') go(); };
    if ($('#mn-from-clear')) $('#mn-from-clear').onclick = () => { s.from = ''; tMining(); };
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

// ================= What to train next =================

const trainState = { ship: '', pilot: '', data: null, sug: null, tab: 'ship' };
const ROMAN5 = ['', 'I', 'II', 'III', 'IV', 'V'];
async function tTrain(stillCurrent) {
  const s = trainState;
  const pilots = state.characters.filter(c => !c.needsReauth);
  if (!s.pilot && pilots[0]) s.pilot = String(pilots[0].id);
  setContent(html`<div class="seg" style="margin-bottom:12px"><button data-trtab="ship" class="${s.tab === 'ship' ? 'active' : ''}">For a ship</button><button data-trtab="next" class="${s.tab === 'next' ? 'active' : ''}">Quick wins for a pilot</button></div>
    ${s.tab === 'ship' ? html`<div class="panel" style="margin-bottom:14px"><div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div class="field" style="margin:0;flex:1;min-width:240px"><label>Ship</label><input type="text" id="tr-ship" value="${s.ship}" placeholder="e.g. Ishtar, Retriever, Hulk"></div><button class="btn btn-primary" id="tr-go">Show masteries</button></div>
        <div class="dim" style="font-size:12px;margin-top:8px">CCP's ship masteries I–V: the skills that make a ship work well, from "can fly it" to fully trained. Each pilot shows how far along they are and how long the next level takes.</div></div>`
      : html`<div class="panel" style="margin-bottom:14px"><div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div class="field" style="margin:0"><label>Pilot</label><select id="tr-pilot" class="crumb-select">${pilots.map(c => html`<option value="${c.id}" ${raw(String(c.id) === s.pilot ? 'selected' : '')}>${c.name}</option>`)}</select></div><button class="btn btn-primary" id="tr-sug">Find quick wins</button></div>
        <div class="dim" style="font-size:12px;margin-top:8px">Goes through CCP's certificates (Core Fitting, Navigation, Armor Tanking and so on) and lists the ones this pilot is closest to raising a level.</div></div>`}
    <div id="tr-out"></div>`);
  document.querySelectorAll('[data-trtab]').forEach(b => b.onclick = () => { s.tab = b.dataset.trtab; tTrain(stillCurrent); });
  if (s.tab === 'ship') {
    const go2 = async () => { s.ship = $('#tr-ship').value.trim(); if (!s.ship) return; $('#tr-out').innerHTML = String(loadingView('Checking every pilot…')); const r = await api.train.ship(s.ship); if (!$('#tr-out')) return; if (!r.ok) { $('#tr-out').innerHTML = String(errorView(r)); return; } s.data = r.data; drawTrainShip(); };
    $('#tr-go').onclick = go2; $('#tr-ship').onkeydown = e => { if (e.key === 'Enter') go2(); };
    if (s.data) drawTrainShip();
  } else {
    $('#tr-pilot').onchange = e => { s.pilot = e.target.value; s.sug = null; };
    $('#tr-sug').onclick = async () => { $('#tr-out').innerHTML = String(loadingView('Going through the certificates…')); const r = await api.train.suggest(Number(s.pilot)); if (!$('#tr-out')) return; if (!r.ok) { $('#tr-out').innerHTML = String(errorView(r)); return; } s.sug = r.data; drawTrainSug(); };
    if (s.sug) drawTrainSug();
  }
}
async function makePlan(charId, name, missing) {
  const r = await api.plan.importText({ charId: Number(charId), name, entries: [] }, missing.map(m => `${m.name} ${m.level}`).join('\n'));
  toast(r.ok ? `Skill plan "${name}" made. Open it from the pilot's Skills tab.` : r.error, !r.ok);
}
function drawTrainShip() {
  const d = trainState.data;
  $('#tr-out').innerHTML = String(html`<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">${icon(d.shipTypeId, 32)}<div><div style="font-size:16px">${d.ship}</div><div class="dim" style="font-size:12px">${d.group}</div></div></div>
    <div class="panel" style="padding:0"><table><thead><tr><th>Pilot</th><th>Can fly</th>${d.levels.map(l => html`<th class="right" title="${l.certs.join(', ')}">Mastery ${ROMAN5[l.level]}</th>`)}</tr></thead><tbody>
    ${d.pilots.map(p => p.error ? html`<tr><td>${p.id}</td><td colspan="6" class="neg">${p.error}</td></tr>` : xRow('trs' + p.id, html`<td>${charImg(p.id, 20)}${p.name} ${p.mastery ? html`<span class="badge green">${ROMAN5[p.mastery]}</span>` : ''}</td>
      <td>${p.canFly ? raw('<span class="pos">✓</span>') : html`<span class="gold">${fmtDuration(p.flyMinutes * 60000, true)}</span>`}</td>
      ${p.levels.map(l => html`<td class="right ${l.done ? 'pos' : ''}">${l.done ? '✓' : fmtDuration(l.minutes * 60000, true)}</td>`)}`,
      html`${p.levels.filter(l => !l.done).slice(0, 1).map(l => html`<div style="font-size:12.5px;margin-bottom:6px"><b>For mastery ${ROMAN5[l.level]}</b> <span class="dim">(${fmtDuration(l.minutes * 60000, true)})</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px">${l.missing.map(m => html`<span>${m.name} ${ROMAN5[m.level]} <span class="dim">(has ${m.have ? ROMAN5[m.have] : 'none'})</span></span>`)}</div>
        <button class="btn btn-ghost" style="padding:2px 9px;font-size:12px;margin-top:8px" data-trplan="${p.id}|${l.level}">Make a skill plan for this</button>`)}
        ${p.levels.every(l => l.done) ? html`<div class="pos">Mastery V: nothing left to train for this ship.</div>` : ''}`, 7))}</tbody></table></div>
    <div class="dim" style="font-size:12px;margin-top:8px">Hover a mastery heading for the certificates in it. Times use each pilot's attributes and implants, and assume levels train in order.</div>`);
  document.querySelectorAll('[data-trplan]').forEach(b => b.onclick = () => { const [pid, lvl] = b.dataset.trplan.split('|'); const p = d.pilots.find(x => String(x.id) === pid); const l = p.levels.find(x => String(x.level) === lvl); makePlan(pid, `${d.ship} mastery ${ROMAN5[l.level]}`, l.missing); });
}
function drawTrainSug() {
  const d = trainState.sug;
  const groups = new Map(); for (const c of d.certificates) (groups.get(c.group) || groups.set(c.group, []).get(c.group)).push(c);
  $('#tr-out').innerHTML = String(html`<div class="panel" style="padding:0;margin-bottom:14px"><div style="padding:12px 16px"><h3 style="margin:0">Quick wins</h3><div class="dim" style="font-size:12px">Certificates this pilot can raise a level soonest</div></div><table><tbody>
      ${d.quick.map(c => xRow('trq' + c.id, html`<td><b>${c.name}</b><div class="dim" style="font-size:11.5px">${c.group}</div></td><td>${c.level ? html`<span class="badge">${ROMAN5[c.level]}</span>` : html`<span class="dim">none</span>`} → <span class="badge accent">${ROMAN5[c.next.level]}</span></td><td class="right num">${fmtDuration(c.next.minutes * 60000, true)}</td>`,
        html`<div style="display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px">${c.next.missing.map(m => html`<span>${m.name} ${ROMAN5[m.level]} <span class="dim">(has ${m.have ? ROMAN5[m.have] : 'none'})</span></span>`)}</div><button class="btn btn-ghost" style="padding:2px 9px;font-size:12px;margin-top:8px" data-trcert="${c.id}">Make a skill plan for this</button>`, 3))}</tbody></table></div>
    <div class="grid grid-3" style="align-items:start">${[...groups.entries()].map(([g, list]) => html`<div class="panel"><h3>${g}</h3>${list.map(c => html`<div class="skill-row" style="font-size:12.5px"><span>${c.name}</span><span>${c.level ? html`<span class="badge ${c.level === 5 ? 'green' : ''}">${ROMAN5[c.level]}</span>` : html`<span class="dim">—</span>`}</span></div>`)}</div>`)}</div>`);
  document.querySelectorAll('[data-trcert]').forEach(b => b.onclick = () => { const c = d.quick.find(x => String(x.id) === b.dataset.trcert); makePlan(d.charId, `${c.name} ${ROMAN5[c.next.level]}`, c.next.missing); });
}
