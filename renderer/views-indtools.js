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

// ================= Belt tracker =================

const beltState = { range: 15, rate: '', timer: null };
try { Object.assign(beltState, JSON.parse(localStorage.getItem('beltTracker') || '{}')); } catch {}
const saveBelt = () => { try { localStorage.setItem('beltTracker', JSON.stringify({ range: beltState.range, rate: beltState.rate })); } catch {} };
const fmtMins = m => (m === null || m === undefined ? '—' : m < 1 ? 'under a minute' : m < 90 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`);
async function tBelt() {
  const s = beltState;
  setContent(html`<div class="grid" style="grid-template-columns:minmax(300px,1fr) 2fr;gap:16px;align-items:start">
    <div><div class="panel"><h3>Add a survey</h3>
      <textarea id="bt-text" rows="6" style="width:100%" class="mono-area" placeholder="Survey scanner results → Ctrl+A, Ctrl+C → paste here"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-primary" id="bt-add">Add survey</button><button class="btn btn-ghost" id="bt-undo">Undo last</button><span style="flex:1"></span><button class="btn btn-ghost" id="bt-clear">New belt</button></div>
      <div class="dim" style="font-size:12px;margin-top:8px">Scan again every few minutes. The time left comes from how fast the belt shrinks between your first and latest survey, so it counts everyone mining there. With the clipboard watch on, copying the survey results in game adds them by itself.</div></div>
    <div class="panel"><h3>Settings</h3>
      <div class="field"><label>Your mining range (km)</label><input type="number" id="bt-range" value="${s.range}" min="1" max="100" style="width:100px"></div>
      <div class="field" style="margin:0"><label>Your mining rate, m³ a minute (for a time left from one survey)</label><input type="number" id="bt-rate" value="${s.rate}" min="0" step="10" placeholder="optional" style="width:140px"></div></div></div>
    <div id="bt-out"></div></div>`);
  const redraw = () => drawBelt();
  $('#bt-add').onclick = async () => { const t = $('#bt-text').value; if (!t.trim()) return toast('Paste the survey results first', true); const r = await api.survey.add(t); if (!r.ok) return toast(r.error, true); $('#bt-text').value = ''; toast(`Survey ${r.data.scans} added: ${r.data.rows} rocks`); redraw(); };
  $('#bt-undo').onclick = async () => { await api.survey.undo(); redraw(); };
  $('#bt-clear').onclick = async () => { await api.survey.clear(); toast('Cleared. Survey the new belt to start.'); redraw(); };
  $('#bt-range').onchange = e => { s.range = Number(e.target.value) || 15; saveBelt(); redraw(); };
  $('#bt-rate').onchange = e => { s.rate = e.target.value; saveBelt(); redraw(); };
  clearInterval(s.timer); s.timer = setInterval(() => { if (state.view === 'tools' && state.toolsTab === 't-belt') redraw(); else clearInterval(s.timer); }, 30000);
  redraw();
}
async function drawBelt() {
  const s = beltState, out = $('#bt-out'); if (!out) return;
  const r = await api.survey.get({ rangeKm: s.range, m3PerMin: Number(s.rate) || 0 });
  if (!$('#bt-out')) return;
  if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
  const d = r.data;
  if (!d) { out.innerHTML = String(html`<div class="panel">${emptyBox('No survey yet. In game, run the survey scanner, click in its results, press Ctrl+A then Ctrl+C, and paste them here.')}</div>`); return; }
  const t = d.total, rate = d.rate;
  const ago = Math.round((Date.now() - d.last) / 60000);
  out.innerHTML = String(html`<div class="grid grid-4" style="margin-bottom:14px">
      ${stat('Left in the belt', fmtNum(Math.round(t.m3)) + ' m³', `${t.rocks} rocks${t.isk ? ' · ' + fmtCompact(t.isk) + ' ISK' : ''}`)}
      ${stat(`Within ${s.range} km`, fmtNum(Math.round(t.near.m3)) + ' m³', `${t.near.rocks} rocks${t.near.isk ? ' · ' + fmtCompact(t.near.isk) + ' ISK' : ''}`)}
      ${stat('Time left', rate ? fmtMins(d.minutesLeft) : '—', rate ? `in range: ${fmtMins(d.nearMinutesLeft)}` : 'Survey again in a few minutes', rate && d.minutesLeft !== null && d.minutesLeft < 20 ? 'neg' : '')}
      ${stat('Going at', rate ? fmtNum(Math.round(rate.m3)) + ' m³/min' : '—', rate ? (rate.isk ? fmtCompact(rate.isk) + ' ISK a minute' : '') + (rate.source === 'yours' ? ' (your rate)' : ` over ${fmtMins(rate.minutes)}`) : `${d.scans} survey${d.scans === 1 ? '' : 's'}`)}</div>
    <div class="panel" style="padding:0;margin-bottom:12px"><table><thead><tr><th>Ore</th><th class="right">Rocks</th><th class="right">m³ left</th><th class="right">In range</th><th class="right">Value</th><th class="right">Going at</th><th class="right">Runs out in</th></tr></thead><tbody>
      ${d.ores.map(o => html`<tr class="${o.gone ? 'dim' : ''}"><td>${o.ore}${o.gone ? raw(' <span class="badge">gone</span>') : ''}</td><td class="right num">${o.rocks}</td><td class="right num">${fmtNum(Math.round(o.m3))}</td><td class="right num">${fmtNum(Math.round(o.nearM3))}</td><td class="right num">${o.isk ? fmtCompact(o.isk) : '—'}</td>
        <td class="right num dim">${o.m3PerMin ? fmtNum(Math.round(o.m3PerMin)) + ' m³/min' : '—'}</td><td class="right num ${o.minutesLeft !== null && o.minutesLeft < 15 ? 'neg' : ''}">${o.gone ? 'gone' : fmtMins(o.minutesLeft)}</td></tr>`)}</tbody></table></div>
    <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">The belt over time</h3><span class="dim" style="font-size:12px">${d.scans} survey${d.scans === 1 ? '' : 's'} · last ${ago < 1 ? 'just now' : ago + ' min ago'}${d.minedM3 > 0 ? ` · ${fmtNum(Math.round(d.minedM3))} m³ mined since the first` : ''}</span></div>
      <div style="margin-top:8px">${sparkline(d.history.map(h => [h.at, h.m3]), 640, 60)}</div></div>`);
}
if (api.survey && api.survey.onNew) api.survey.onNew(d => { toast(`Mining survey added (${d.rows} rocks)`); if (state.view === 'tools' && state.toolsTab === 't-belt') drawBelt(); });

// ================= Where to mine a mineral =================

const mineralState = { mineral: 'Zydrine', from: '', yieldPct: 87.5, list: null };
async function tMineral() {
  const s = mineralState;
  if (!s.list) { const r = await api.mineMinerals(); s.list = r.ok ? r.data : []; }
  setContent(html`<div class="panel" style="margin-bottom:14px"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div class="field" style="margin:0"><label>Mineral</label><select id="mi-min" class="crumb-select">${s.list.map(m => html`<option ${raw(m.name === s.mineral ? 'selected' : '')}>${m.name}</option>`)}</select></div>
      <div class="field" style="margin:0"><label>Near</label><input type="text" id="mi-from" value="${s.from}" placeholder="your pilots (or a system)" style="width:190px"></div>
      <div class="field" style="margin:0"><label>Refining yield %</label><input type="number" id="mi-yield" value="${s.yieldPct}" min="30" max="100" step="0.1" style="width:90px"></div>
      <button class="btn btn-primary" id="mi-go">Find</button></div>
    <div class="dim" style="font-size:12px;margin-top:8px">Every ore and ice that refines into the mineral, best per m³ first, with the nearest place it usually spawns and the systems where your pilots have mined it in the last 30 days.</div></div>
    <div id="mi-out"></div>`);
  $('#mi-go').onclick = () => runMineral();
  $('#mi-min').onchange = () => runMineral();
  runMineral();
}
async function runMineral() {
  const s = mineralState, out = $('#mi-out'); if (!out) return;
  Object.assign(s, { mineral: $('#mi-min').value, from: $('#mi-from').value.trim(), yieldPct: Number($('#mi-yield').value) || 87.5 });
  out.innerHTML = String(loadingView('Looking through ores and your pilots’ mining…'));
  const r = await api.mineFind({ mineral: s.mineral, fromName: s.from || null, yieldPct: s.yieldPct });
  if (!$('#mi-out')) return;
  if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
  const d = r.data, top = d.ores.filter(o => o.family !== 'moon')[0];
  const where = o => o.nearest ? (o.nearest.pochven ? html`<span class="badge" style="color:var(--red);border-color:var(--red)">Pochven</span> <span class="dim">by filament</span>` : html`<a href="#" data-system="${o.nearest.system}">${o.nearest.system}</a>${secBadge(o.nearest.security)} <span class="dim" style="font-size:11.5px">${o.nearest.jumps} jump${o.nearest.jumps === 1 ? '' : 's'}${o.nearest.pilot ? ' from ' + o.nearest.pilot : ''}</span>`) : html`<span class="dim">—</span>`;
  out.innerHTML = String(html`${top ? html`<div class="grid grid-3" style="margin-bottom:12px">${stat('Best ore for ' + d.mineral.name, top.best.name, `${top.best.perM3 < 10 ? top.best.perM3.toFixed(2) : fmtNum(Math.round(top.best.perM3))} ${d.mineral.name} per m³ mined`)}${stat('Nearest usual place', top.nearest && !top.nearest.pochven ? top.nearest.system : top.nearest && top.nearest.pochven ? 'Pochven' : '—', top.usual || '')}${stat('You’ve mined it', top.known.length ? top.known[0].system : 'not yet', top.known.length ? `${top.known[0].pilot}, ${fmtDay(top.known[0].date)}` : 'in the last 30 days')}</div>` : ''}
    <div class="panel" style="padding:0"><table><thead><tr><th>Ore</th><th class="right">${d.mineral.name} per m³</th><th>Also gives</th><th>Usually found</th><th>Nearest</th><th>Where you’ve mined it</th></tr></thead><tbody>
      ${d.ores.map(o => html`<tr><td>${icon(o.best.typeId)}${o.base}${o.best.name !== o.base ? html`<div class="dim" style="font-size:11px">best: ${o.best.name}</div>` : ''}</td><td class="right num">${o.best.perM3 < 10 ? o.best.perM3.toFixed(2) : fmtNum(Math.round(o.best.perM3))}</td>
        <td style="font-size:12px" class="muted">${o.best.others.map(x => x.name).join(', ')}</td><td style="font-size:12px">${o.usual || html`<span class="dim">—</span>`}</td><td>${where(o)}</td>
        <td style="font-size:12px">${o.known.length ? o.known.map(k => html`<div><a href="#" data-system="${k.system}">${k.system}</a> <span class="dim">${fmtDay(k.date)} · ${k.pilot}</span></div>`) : html`<span class="dim">—</span>`}</td></tr>`)}</tbody></table></div>
    <div class="dim" style="font-size:12px;margin-top:8px">Per m³ at ${d.yieldPct}% yield, for the richest grade. "Usually found" comes from EVE University's ore table: CCP doesn't publish what's in each belt, so treat it as where to look, not a promise. Belt ore also depends on the empire faction's space in highsec and lowsec. Ore anomalies and your scans (Ice & Ore Sites) show what's really there.</div>`);
}

// ================= Haul planner =================

const HAUL_SHIPS = [['', 'Custom, or the ship picked below'], ['13000', 'Blockade runner (about 13,000 m³)'], ['45000', 'T1 hauler, fitted (about 45,000 m³)'], ['62500', 'Deep space transport (about 62,500 m³)'], ['155000', 'Bowhead (ship hangar)'], ['340000', 'Jump freighter (about 340,000 m³)'], ['1100000', 'Freighter (about 1,100,000 m³)']];
const haulState = { source: 'hangar', key: '', text: '', cargo: 45000, ship: '45000', maxValue: '', warnValue: '1b', locs: null };
async function tHaul(refresh = false) {
  const s = haulState;
  if (!s.locs || refresh) { setContent(loadingView('Reading your hangars…')); const r = await api.haul.locations(!!refresh); s.locs = r.ok ? r.data : []; if (!r.ok) toast(r.error, true); }
  setContent(html`<div class="grid" style="grid-template-columns:minmax(320px,1fr) 2fr;gap:16px;align-items:start">
    <div class="panel"><div class="seg" style="margin-bottom:10px"><button data-hs="hangar" class="${s.source === 'hangar' ? 'active' : ''}">From a hangar</button><button data-hs="paste" class="${s.source === 'paste' ? 'active' : ''}">Paste items</button></div>
      ${s.source === 'hangar' ? html`<div class="field"><label>Hangar</label><select id="hl-loc">${s.locs.slice(0, 200).map(l => html`<option value="${l.key}" ${raw(l.key === s.key ? 'selected' : '')}>${l.location} · ${l.pilot} · ${fmtCompact(l.value)} ISK, ${fmtNum(Math.round(l.volume))} m³</option>`)}</select></div><button class="btn btn-ghost" id="hl-refresh" style="padding:2px 9px;font-size:12px;margin-bottom:10px">⟳ Re-read assets</button>`
        : html`<textarea id="hl-text" rows="7" style="width:100%" class="mono-area" placeholder="Inventory, contract or cargo window: select all, copy, paste here">${s.text}</textarea>`}
      <div class="field"><label>Ship</label><select id="hl-ship">${HAUL_SHIPS.map(([v, l]) => html`<option value="${v}" ${raw(s.ship === v ? 'selected' : '')}>${l}</option>`)}</select></div>
      <div class="field"><label>Or any ship (Upwell haulers, DSTs, Orca…)</label><input type="search" id="hl-hull" value="${s.hullName || ''}"></div>
      ${s.hull ? html`<div class="field"><label>Hold on the ${s.hull.name}</label><select id="hl-hold">${s.hull.holds.map(h => html`<option value="${h.m3}" ${raw(Number(s.cargo) === Math.round(h.m3) ? 'selected' : '')}>${h.name}: ${fmtNum(Math.round(h.m3))} m³</option>`)}</select><div class="dim" style="font-size:11.5px;margin-top:3px">Base sizes from the game data. Your hauler skills, cargo expanders and rigs add to these, so put your real number in below if you know it.</div></div>` : ''}
      <div class="field"><label>Cargo hold (m³)</label><input type="number" id="hl-cargo" value="${s.cargo}" min="1"></div>
      <div class="field"><label>Never carry more than (ISK a trip, optional)</label><input type="text" id="hl-max" value="${s.maxValue}" placeholder="e.g. 2b"></div>
      <div class="field"><label>Warn me above (ISK a trip)</label><input type="text" id="hl-warn" value="${s.warnValue}" placeholder="e.g. 1b"></div>
      <button class="btn btn-primary" id="hl-go" style="width:100%">Plan trips</button>
      <div class="dim" style="font-size:12px;margin-top:8px">Most ISK per m³ goes first, so the first trips carry what matters. Gankers scan cargo for value: keep highsec trips under what's worth suiciding a few ships for.</div></div>
    <div id="hl-out">${emptyBox('Pick a hangar or paste items, set your ship, and press Plan trips.')}</div></div>`);
  document.querySelectorAll('[data-hs]').forEach(b => b.onclick = () => { s.source = b.dataset.hs; tHaul(); });
  if ($('#hl-refresh')) $('#hl-refresh').onclick = () => tHaul(true);
  $('#hl-ship').onchange = e => { s.ship = e.target.value; if (e.target.value) { if ($('#hl-text')) s.text = $('#hl-text').value; s.cargo = Number(e.target.value); s.hull = null; s.hullName = ''; tHaul(); } };
  attachSearch($('#hl-hull'), { category: 6, placeholder: 'e.g. Bustard, Orca, an Upwell hauler', onPick: async it => { const r = await api.haul.hull(it.id); if (!r.ok) return toast(r.error, true); s.hull = r.data; s.hullName = r.data.name; s.ship = ''; const big = r.data.holds.slice().sort((a, b) => b.m3 - a.m3)[0]; s.cargo = Math.round((r.data.holds[0].m3 || (big && big.m3) || 0)); if ($('#hl-text')) s.text = $('#hl-text').value; tHaul(); } });
  const hh = $('#hl-hold'); if (hh) hh.onchange = e => { s.cargo = Math.round(Number(e.target.value)); $('#hl-cargo').value = s.cargo; };
  $('#hl-go').onclick = () => runHaul();
}
async function runHaul() {
  const s = haulState, out = $('#hl-out'); if (!out) return;
  Object.assign(s, { key: $('#hl-loc') ? $('#hl-loc').value : s.key, text: $('#hl-text') ? $('#hl-text').value : s.text, cargo: Number($('#hl-cargo').value) || 0, maxValue: $('#hl-max').value.trim(), warnValue: $('#hl-warn').value.trim() });
  out.innerHTML = String(loadingView('Packing…'));
  const r = await api.haul.plan({ locationKey: s.source === 'hangar' ? s.key : null, text: s.source === 'paste' ? s.text : null, cargo: s.cargo, maxValue: parseIsk(s.maxValue) || 0, warnValue: parseIsk(s.warnValue) || 0 });
  if (!$('#hl-out')) return;
  if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
  const d = r.data, warned = d.trips.filter(t => t.warn).length;
  const half = d.cumulative.findIndex(v => v >= d.total.value * 0.9);
  out.innerHTML = String(html`<div class="grid grid-4" style="margin-bottom:12px">${stat('Trips', d.trips.length, `${fmtNum(Math.round(d.total.volume))} m³ in all`)}${stat('Value', fmtCompact(d.total.value) + ' ISK', half >= 0 && d.trips.length > 1 ? `90% of it in the first ${half + 1} trip${half ? 's' : ''}` : '')}${stat('Over your warning', warned, warned ? 'split these or use a blockade runner' : 'none', warned ? 'neg' : '')}${stat('Too big for the hold', d.tooBig.length, d.tooBig.length ? d.tooBig.slice(0, 2).map(i => i.name).join(', ') : '')}</div>
    ${d.trips.map((t, i) => html`<div class="panel" style="padding:0;margin-bottom:10px"><div style="padding:10px 14px;display:flex;gap:10px;align-items:center"><b style="flex:1">Trip ${i + 1}</b>${t.warn ? raw('<span class="badge red">over your warning</span>') : ''}<span class="dim">${fmtNum(Math.round(t.volume))} m³ (${Math.round(t.full * 100)}% full) · <b style="color:var(--text)">${fmtCompact(t.value)} ISK</b></span></div>
      ${xRow('ht' + i, html`<td colspan="3" class="muted" style="font-size:12.5px">${t.items.slice(0, 6).map(x => `${fmtNum(x.qty)} × ${x.name}`).join(', ')}${t.items.length > 6 ? ` and ${t.items.length - 6} more` : ''}</td>`,
        html`<table><tbody>${t.items.map(x => html`<tr><td>${icon(x.typeId, 18)}${x.name}</td><td class="right num">${fmtNum(x.qty)}</td><td class="right num dim">${fmtNum(Math.round(x.volume))} m³</td><td class="right num">${fmtCompact(x.value)}</td></tr>`)}</tbody></table>
        <button class="btn btn-ghost" style="padding:2px 9px;font-size:12px;margin-top:6px" data-htcopy="${i}">Copy list</button>`, 3)}</div>`)}
    ${d.tooPricey.length ? html`<div class="notice">Over your per-trip cap on their own: ${d.tooPricey.map(i => i.name).join(', ')}. Move these one at a time or raise the cap.</div>` : ''}`);
  document.querySelectorAll('[data-htcopy]').forEach(b => b.onclick = () => { const t = d.trips[Number(b.dataset.htcopy)]; navigator.clipboard.writeText(t.items.map(x => `${x.name}\t${x.qty}`).join('\n')); toast('Copied'); });
}

// ================= Skills to buy =================

async function tSkillBuy() {
  setContent(loadingView('Checking your pilots’ skill plans…'));
  const r = await api.skillsToBuy();
  if (!r.ok) return setContent(errorView(r));
  const d = r.data;
  setContent(html`<div class="grid grid-3" style="margin-bottom:14px">${stat('Skill books to buy', d.rows.reduce((n, x) => n + x.toBuy, 0), `${d.rows.length} different skill${d.rows.length === 1 ? '' : 's'}`)}${stat('Cost at Jita', fmtCompact(d.total) + ' ISK', 'sell orders')}${stat('Already in your hangars', d.rows.filter(x => x.owned.length).length, 'books you can inject now')}</div>
    <div class="panel" style="padding:0">${d.rows.length ? html`<table><thead><tr><th>Skill</th><th>Needed by</th><th class="right">Price</th><th>You have the book</th></tr></thead><tbody>
      ${d.rows.map(x => html`<tr><td>${icon(x.skillId, 18)}<a href="#" data-tid="${x.skillId}">${x.name}</a><div class="dim" style="font-size:11px">${x.group}</div></td>
        <td style="font-size:12.5px">${x.pilots.map(p => html`<div>${p.name} <span class="dim">· ${p.plans.join(', ')}</span></div>`)}</td>
        <td class="right num">${x.price !== null ? fmtCompact(x.price) : '—'}${x.toBuy > 1 ? html`<div class="dim" style="font-size:11px">× ${x.toBuy}</div>` : ''}</td>
        <td style="font-size:12px">${x.owned.length ? x.owned.map(o => html`<div class="pos">${o.qty} in ${o.location} <span class="dim">(${o.pilot})</span></div>`) : html`<span class="dim">—</span>`}</td></tr>`)}</tbody></table>`
      : emptyBox('No books to buy: every skill in your pilots’ skill plans is already injected. Make a plan in a pilot’s Skills tab, or from What to Train, and anything missing shows up here.')}</div>
    ${d.rows.length ? html`<div style="margin-top:10px"><button class="btn btn-ghost" id="sb-copy">Copy shopping list for Multibuy</button></div>` : ''}
    ${d.errors.length ? html`<div class="dim" style="font-size:12px;margin-top:8px">Couldn’t read: ${d.errors.map(e => e.pilot).join(', ')}</div>` : ''}`);
  const cp = $('#sb-copy'); if (cp) cp.onclick = () => { navigator.clipboard.writeText(d.rows.filter(x => x.toBuy).map(x => `${x.name}\t${x.toBuy}`).join('\n')); toast('Copied. Paste into EVE’s Multibuy window.'); };
}

// ================= Mutaplasmids =================

const mutaState = { module: '', values: {}, mutaId: null };
function tMuta() {
  const s = mutaState;
  setContent(html`<div class="panel" style="margin-bottom:14px"><div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
      <div class="field" style="margin:0;flex:1;min-width:260px"><label>Module or drone</label><input type="search" id="mu-mod" value="${s.module}"></div><button class="btn btn-primary" id="mu-go">Show ranges</button></div>
    <div class="dim" style="font-size:12px;margin-top:8px">Every mutaplasmid that fits it, with the best and worst each stat can roll. Type in the stats of a module you rolled (or one on a contract) to see how good it is.</div></div>
    <div id="mu-out"></div>`);
  attachSearch($('#mu-mod'), { placeholder: 'e.g. 10MN Afterburner II, Large Shield Extender II, Warp Disruptor II', onPick: it => { s.module = it.name; $('#mu-mod').value = it.name; s.values = {}; runMuta(); } });
  $('#mu-go').onclick = () => { s.module = $('#mu-mod').value.trim(); s.values = {}; runMuta(); };
  if (s.module) runMuta();
}
async function runMuta() {
  const s = mutaState, out = $('#mu-out'); if (!out || !s.module) return;
  const r = await api.muta({ module: s.module, values: s.values, mutaId: s.mutaId });
  if (!$('#mu-out')) return;
  if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
  const d = r.data;
  const fmtV = (v, u) => `${Math.abs(v) >= 100 ? fmtNum(Math.round(v * 10) / 10) : Math.round(v * 1000) / 1000}${u ? ' ' + u : ''}`;
  const bar = q => q === null ? '' : html`<div class="bar" style="height:6px;margin-top:4px"><i style="width:${(q * 100).toFixed(0)}%;background:${raw(q >= 0.66 ? 'var(--green)' : q >= 0.33 ? 'var(--gold)' : 'var(--red)')}"></i></div>`;
  out.innerHTML = String(html`<div class="muted" style="margin-bottom:10px">${d.module.name}${d.module.price ? html` · ${fmtCompact(d.module.price)} ISK at Jita` : ''}</div>
    ${d.mutas.map(m => html`<div class="panel" style="padding:0;margin-bottom:12px"><div style="padding:12px 16px;display:flex;align-items:center;gap:10px"><h3 style="margin:0;flex:1">${m.name}</h3>${m.price ? html`<span class="dim">${fmtCompact(m.price)} ISK</span>` : ''}${m.quality !== null ? html`<span class="badge ${m.quality >= 0.66 ? 'green' : m.quality >= 0.33 ? 'gold' : 'red'}">your roll: ${Math.round(m.quality * 100)}%</span>` : ''}</div>
      <table><thead><tr><th>Stat</th><th class="right">Base</th><th class="right">Worst</th><th class="right">Best</th><th class="right" style="width:180px">Your roll</th></tr></thead><tbody>
        ${m.rows.map(x => html`<tr><td>${x.name}<div class="dim" style="font-size:11px">${x.highIsGood ? 'higher is better' : 'lower is better'} · ×${x.lo}–×${x.hi}</div></td><td class="right num dim">${fmtV(x.base, x.unit)}</td>
          <td class="right num neg">${fmtV(x.highIsGood ? x.min : x.max, x.unit)}</td><td class="right num pos">${fmtV(x.highIsGood ? x.max : x.min, x.unit)}</td>
          <td class="right"><input type="number" step="any" data-mu="${m.id}|${x.id}" value="${x.rolled !== null ? x.rolled : ''}" placeholder="—" style="${raw(inBox)};width:110px;text-align:right">${bar(x.quality)}</td></tr>`)}</tbody></table>
      <div style="padding:8px 16px"><button class="btn btn-ghost" style="padding:2px 10px;font-size:12px" data-murate="${m.id}">Rate this roll</button></div></div>`)}`);
  document.querySelectorAll('[data-murate]').forEach(b => b.onclick = () => {
    const id = b.dataset.murate; s.values = {}; s.mutaId = Number(id);
    document.querySelectorAll(`[data-mu^="${id}|"]`).forEach(i => { if (i.value !== '') s.values[i.dataset.mu.split('|')[1]] = Number(i.value); });
    runMuta();
  });
}

// ================= Wars =================

async function tWars(refresh = false) {
  setContent(loadingView(refresh ? 'Checking CCP’s war list…' : 'Reading wars…'));
  const r = await api.wars({ refresh });
  if (!r.ok) return setContent(errorView(r));
  const d = r.data, active = d.wars.filter(w => w.active), old = d.wars.filter(w => !w.active);
  const SIDE = { aggressor: ['red', 'you declared'], defender: ['gold', 'declared on you'], ally: ['accent', 'you’re an ally'] };
  const row = w => xRow('war' + w.id, html`<td><b>${w.aggressor}</b> <span class="dim">vs</span> <b>${w.defender}</b>${w.allies.length ? html`<div class="dim" style="font-size:11.5px">allies: ${w.allies.join(', ')}</div>` : ''}</td>
      <td><span class="badge ${SIDE[w.side][0]}">${SIDE[w.side][1]}</span><div class="dim" style="font-size:11.5px">${w.entity}</div></td>
      <td>${w.active ? (w.hot ? raw('<span class="badge red">war is on</span>') : html`<span class="badge gold">starts in ${fmtDuration(w.startsIn, true)}</span>`) : html`<span class="dim">ended ${fmtDay(w.finished)}</span>`}${w.mutual ? raw(' <span class="badge">mutual</span>') : ''}</td>
      <td class="right num">${w.kills.aggressor} / ${w.kills.defender}</td><td style="font-size:12px">${w.pilots.join(', ')}</td>`,
    html`<div class="kv"><span class="k">Declared</span><span>${fmtDate(w.declared)}</span><span class="k">Fighting from</span><span>${w.started ? fmtDate(w.started) : '—'}</span>${w.finished ? html`<span class="k">Ends</span><span>${fmtDate(w.finished)}</span>` : ''}
      <span class="k">Ships killed</span><span>${w.aggressor}: ${w.kills.aggressor} (${fmtCompact(w.kills.aggressorIsk)} ISK) · ${w.defender}: ${w.kills.defender} (${fmtCompact(w.kills.defenderIsk)} ISK)</span><span class="k">Open for allies</span><span>${w.openForAllies ? 'yes' : 'no'}</span></div>
      <div style="margin-top:8px"><a href="#" data-link="https://zkillboard.com/war/${w.id}/">This war on zKillboard ↗</a></div>`, 5);
  setContent(html`<div class="toolbar"><span class="muted" style="flex:1">Wars involving your pilots’ corporations and alliances${d.checkedAt ? html` · checked ${timeAgo(d.checkedAt)}` : ''}</span><button class="btn btn-ghost" id="wr-refresh">⟳ Check now</button></div>
    <div class="grid grid-3" style="margin-bottom:14px">${stat('Wars on now', active.filter(w => w.hot).length, active.length > active.filter(w => w.hot).length ? `${active.length - active.filter(w => w.hot).length} starting soon` : '', active.some(w => w.hot) ? 'neg' : '')}${stat('Ended', old.length)}${stat('Watching', d.entities.length + ' corps and alliances', d.entities.map(e => e.name).filter(Boolean).slice(0, 3).join(', '))}</div>
    <div class="panel" style="padding:0">${d.wars.length ? html`<table><thead><tr><th>War</th><th>You</th><th>Status</th><th class="right">Kills</th><th>Your pilots</th></tr></thead><tbody>${active.map(row)}${old.slice(0, 30).map(row)}</tbody></table>`
      : emptyBox('No wars involving your corporations or alliances. War declarations also pop up as alerts (Settings → Notifications → War declarations).')}</div>
    <div class="dim" style="font-size:12px;margin-top:8px">CCP lists the 2,000 newest wars; the app reads each once and keeps the ones that concern you. The first check takes a minute or two.</div>`);
  $('#wr-refresh').onclick = () => tWars(true);
}

// ================= Where to build =================

const whereState = { from: '', jumps: 10, activity: 'manufacturing', security: 'any', product: '', runs: 1, structure: 'npc' };
const WHERE_ACTS = [['manufacturing', 'Manufacturing'], ['reaction', 'Reactions'], ['invention', 'Invention'], ['copying', 'Copying'], ['me', 'ME research'], ['te', 'TE research']];
const WHERE_SEC = [['any', 'Anywhere'], ['empire', 'Highsec and lowsec'], ['hs', 'Highsec only'], ['ls', 'Lowsec only'], ['ns', 'Nullsec only']];
const WHERE_ST = [['npc', 'NPC station'], ['raitaru', 'Raitaru'], ['azbel', 'Azbel'], ['sotiyo', 'Sotiyo'], ['athanor', 'Athanor'], ['tatara', 'Tatara']];
function tWhere() {
  const s = whereState;
  const sel = (id, list, v) => html`<select id="${id}" class="crumb-select">${list.map(([k, l]) => html`<option value="${k}" ${raw(String(v) === k ? 'selected' : '')}>${l}</option>`)}</select>`;
  setContent(html`<div class="panel" style="margin-bottom:14px"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div class="field" style="margin:0"><label>Near</label><input type="text" id="wb-from" value="${s.from}" placeholder="your pilots (or a system)" style="width:190px"></div>
      <div class="field" style="margin:0"><label>Within jumps</label><input type="number" id="wb-jumps" value="${s.jumps}" min="0" max="30" style="width:80px"></div>
      <div class="field" style="margin:0"><label>Activity</label>${sel('wb-act', WHERE_ACTS, s.activity)}</div>
      <div class="field" style="margin:0"><label>Security</label>${sel('wb-sec', WHERE_SEC, s.security)}</div>
      <div class="field" style="margin:0"><label>Item (optional, for job cost)</label><input type="search" id="wb-item" value="${s.product}" style="width:210px"></div>
      <div class="field" style="margin:0"><label>Runs</label><input type="number" id="wb-runs" value="${s.runs}" min="1" style="width:70px"></div>
      <div class="field" style="margin:0"><label>Built in</label>${sel('wb-st', WHERE_ST, s.structure)}</div>
      <button class="btn btn-primary" id="wb-go">Find</button></div>
    <div class="dim" style="font-size:12px;margin-top:8px">CCP's cost index goes up the more industry a system does. A low index means cheaper jobs: the job fee is the item's estimated value × (index + facility tax + 4% SCC surcharge).</div></div>
    <div id="wb-out"></div>`);
  attachSearch($('#wb-item'), { placeholder: 'e.g. Hulk, Large Shield Extender II', onPick: it => { s.product = it.name; $('#wb-item').value = it.name; } });
  $('#wb-go').onclick = () => runWhere();
  runWhere();
}
async function runWhere() {
  const s = whereState, out = $('#wb-out'); if (!out) return;
  Object.assign(s, { from: $('#wb-from').value.trim(), jumps: Number($('#wb-jumps').value) || 0, activity: $('#wb-act').value, security: $('#wb-sec').value, product: $('#wb-item').value.trim(), runs: Number($('#wb-runs').value) || 1, structure: $('#wb-st').value });
  out.innerHTML = String(loadingView('Reading cost indices…'));
  const r = await api.industryWhere({ fromName: s.from || null, maxJumps: s.jumps, activity: s.activity, security: s.security, product: s.product || null, runs: s.runs, structure: s.structure });
  if (!$('#wb-out')) return;
  if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
  const d = r.data, best = d.rows[0], here = d.here.sort((a, b) => a.index - b.index)[0];
  const pct = v => (v * 100).toFixed(2) + '%';
  out.innerHTML = String(html`${d.product && best ? html`<div class="grid grid-3" style="margin-bottom:12px">${stat('Cheapest nearby', best.system, `${best.jumps} jump${best.jumps === 1 ? '' : 's'} · index ${pct(best.index)}`)}${stat(`Job fee there (${d.product.runs} run${d.product.runs === 1 ? '' : 's'})`, fmtCompact(best.jobCost) + ' ISK', d.product.name)}${here ? stat('Where you are now', fmtCompact(here.jobCost) + ' ISK', `${here.system} · saves ${fmtCompact(Math.max(0, here.jobCost - best.jobCost))} ISK by moving`, here.jobCost > best.jobCost * 1.2 ? 'gold' : '') : ''}</div>` : ''}
    <div class="panel" style="padding:0">${d.rows.length ? html`<table><thead><tr><th>System</th><th class="right">Jumps</th><th class="right">Cost index</th><th class="right">NPC stations</th>${d.product ? html`<th class="right">Job fee</th>` : ''}</tr></thead><tbody>
      ${d.rows.map(x => html`<tr class="${x.jumps === 0 ? 'hl' : ''}"><td><a href="#" data-system="${x.system}">${x.system}</a>${secBadge(x.security)} <span class="dim" style="font-size:11.5px">${x.region}</span>${x.jumps === 0 ? raw(' <span class="badge accent">you</span>') : ''}</td><td class="right num">${x.jumps}</td><td class="right num">${pct(x.index)}</td><td class="right num ${x.stations ? '' : 'dim'}">${x.stations || '—'}</td>${d.product ? html`<td class="right num">${fmtCompact(x.jobCost)}</td>` : ''}</tr>`)}</tbody></table>`
      : emptyBox('No systems with industry found in range. Try more jumps or another security level.')}</div>
    <div class="dim" style="font-size:12px;margin-top:8px">${d.checked} systems checked. Player structures can be anywhere; a system with no NPC station still works if your corp or a public structure has one there.</div>`);
}

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

// ================= Exploration loot =================

const exState = { type: '', name: '', system: '' };
async function tExplore() {
  setContent(loadingView('Loading your exploration log…'));
  const r = await api.explore.get();
  if (!r.ok) return setContent(errorView(r));
  drawExplore(r.data);
}
function drawExplore(d) {
  const s = exState;
  const typeOpts = [['', 'Guess from the site name'], ...d.types];
  setContent(html`<div class="grid grid-4" style="margin-bottom:14px">
      ${stat('ISK per hour', d.hours ? fmtCompact(d.perHour) : '—', d.hours ? `over ${fmtDuration(d.hours * 3600000, true)} of runs` : 'add a site to start')}
      ${stat('ISK per site', d.sites ? fmtCompact(d.perSite) : '—', `${fmtNum(d.sites)} site${d.sites === 1 ? '' : 's'}`)}
      ${stat('Total loot', fmtCompact(d.total) + ' ISK', d.price === 'sell' ? 'at Jita sell' : 'at Jita buy (what you get selling now)')}
      ${stat('This run', d.open ? fmtCompact(d.open.isk) : '—', d.open ? `${d.open.sites} site${d.open.sites === 1 ? '' : 's'} · ${fmtCompact(d.open.perHour)}/h · ${fmtDuration(d.open.ms, true)}` : 'no run going')}</div>
    <div class="grid grid-2" style="align-items:start">
      <div class="panel"><h3>Add a site</h3>
        <div class="dim" style="font-size:12.5px;margin-bottom:8px">After you finish a can (or the whole site), select the new loot in your cargo hold, Ctrl+C and paste it here.</div>
        <textarea id="ex-text" rows="7" style="width:100%" class="mono-area" placeholder="Paste loot from your cargo hold" spellcheck="false"></textarea>
        <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
          <div class="field" style="margin:0;flex:1;min-width:150px"><input type="text" id="ex-name" value="${s.name}" placeholder="Site name (optional)" spellcheck="false"></div>
          <div class="field" style="margin:0;width:110px"><input type="text" id="ex-sys" value="${s.system}" placeholder="System" spellcheck="false"></div>
          <select id="ex-type" class="crumb-select">${typeOpts.map(([k, l]) => html`<option value="${k}" ${raw(k === s.type ? 'selected' : '')}>${l}</option>`)}</select></div>
        <div class="row" style="gap:8px;margin-top:10px"><button class="btn btn-primary" id="ex-add">Add site</button><span style="flex:1"></span>
          ${d.open ? html`<button class="btn btn-ghost" id="ex-stop">End run</button>` : html`<button class="btn btn-ghost" id="ex-start">Start a run</button>`}</div>
        <div id="ex-msg" class="dim" style="font-size:12px;margin-top:6px"></div></div>
      <div class="panel"><h3>By site type</h3>${d.byType.length ? html`<table><thead><tr><th>Type</th><th class="right">Sites</th><th class="right">Per site</th><th class="right">Best</th><th class="right">Total</th></tr></thead><tbody>
        ${d.byType.map(t => html`<tr><td>${t.label}</td><td class="right num">${t.sites}</td><td class="right num">${fmtCompact(t.perSite)}</td><td class="right num">${fmtCompact(t.best)}</td><td class="right num">${fmtCompact(t.isk)}</td></tr>`)}</tbody></table>` : html`<div class="muted" style="font-size:12.5px">Nothing yet.</div>`}
        ${d.topItems.length ? html`<h3 class="mh" style="margin-top:12px">What's paying</h3>${d.topItems.slice(0, 8).map(i => html`<div class="skill-row" style="font-size:12.5px"><span>${icon(i.typeId, 16)}${i.name} <span class="dim">× ${fmtNum(i.qty)}</span></span><span class="num">${fmtCompact(i.isk)}</span></div>`)}` : ''}</div>
    </div>
    <div class="panel" style="margin-top:14px;padding:0">${d.recent.length ? html`<table><thead><tr><th>When</th><th>Site</th><th>Type</th><th>System</th><th class="right">Loot</th><th class="right">Value</th><th></th></tr></thead><tbody>
      ${d.recent.map(x => xRow('ex' + x.id, html`<td class="dim nowrap">${timeAgo(new Date(x.at).toISOString())}</td><td>${x.name || '—'}</td><td>${(d.types.find(t => t[0] === x.type) || [0, x.type])[1]}</td><td>${x.system || ''}</td><td class="right num">${x.items.length} item${x.items.length === 1 ? '' : 's'}</td><td class="right num">${fmtCompact(x.value)}</td><td><button class="btn btn-ghost" data-exrm="${x.id}" style="padding:1px 7px;font-size:11px" title="Remove this site">✕</button></td>`,
        html`<div style="columns:2;font-size:12px">${x.items.map(i => html`<div>${icon(i.typeId, 14)}${i.name} × ${fmtNum(i.qty)} <span class="dim">${fmtCompact(d.price === 'sell' ? i.sell : i.buy)}</span></div>`)}</div>`, 7))}</tbody></table>` : emptyBox('No sites yet. Hack a can, paste the loot above, and the ISK per site and per hour fill in.')}</div>
    ${d.runs.filter(r => r.sites).length ? html`<div class="panel" style="margin-top:14px"><h3>Runs</h3><table><thead><tr><th>Started</th><th class="right">Sites</th><th class="right">Time</th><th class="right">Loot</th><th class="right">ISK / hour</th></tr></thead><tbody>
      ${d.runs.filter(r => r.sites).slice(0, 15).map(r => html`<tr><td>${fmtDate(new Date(r.start).toISOString())}${r.open ? html` <span class="badge accent">going</span>` : ''}</td><td class="right num">${r.sites}</td><td class="right num">${fmtDuration(r.ms, true)}</td><td class="right num">${fmtCompact(r.isk)}</td><td class="right num">${fmtCompact(r.perHour)}</td></tr>`)}</tbody></table></div>` : ''}
    <div class="row" style="gap:10px;margin-top:10px;font-size:12.5px"><span class="dim">Value loot at</span><select id="ex-price" class="crumb-select"><option value="buy" ${raw(d.price !== 'sell' ? 'selected' : '')}>Jita buy</option><option value="sell" ${raw(d.price === 'sell' ? 'selected' : '')}>Jita sell</option></select>
      <span style="flex:1"></span>${d.sites ? html`<button class="btn btn-ghost" id="ex-clear" style="font-size:12px">Clear log</button>` : ''}</div>`);
  const redraw = r => { if (!r.ok) return toast(r.error, true); drawExplore(r.data); };
  $('#ex-add').onclick = async () => {
    const text = $('#ex-text').value; s.name = $('#ex-name').value.trim(); s.system = $('#ex-sys').value.trim(); s.type = $('#ex-type').value;
    if (!text.trim()) return toast('Paste the loot first.', true);
    $('#ex-add').disabled = true;
    const r = await api.explore.add({ text, type: s.type, name: s.name, system: s.system });
    if (!r.ok) { $('#ex-add').disabled = false; return toast(r.error, true); }
    s.name = '';
    toast(`${fmtCompact(r.data.site[r.data.price === 'sell' ? 'sell' : 'buy'])} ISK added${r.data.unknown.length ? ` (couldn't read ${r.data.unknown.length} line${r.data.unknown.length === 1 ? '' : 's'})` : ''}`);
    drawExplore(r.data);
  };
  const st = $('#ex-start'); if (st) st.onclick = async () => redraw(await api.explore.start());
  const sp = $('#ex-stop'); if (sp) sp.onclick = async () => redraw(await api.explore.stop());
  $('#ex-price').onchange = async e => redraw(await api.explore.price(e.target.value));
  const cl = $('#ex-clear'); if (cl) cl.onclick = async () => { if (!cl.dataset.sure) { cl.dataset.sure = '1'; cl.textContent = 'Click again to clear every site'; return; } redraw(await api.explore.clear()); };
  document.querySelectorAll('[data-exrm]').forEach(b => b.onclick = async e => { e.stopPropagation(); redraw(await api.explore.remove(b.dataset.exrm)); });
}
