/* Item database (Tools → Market), contract bargains (Tools → Market) and character value (Tools → Finance). */
const itemState = { q: '', results: [], id: null, data: null };
const searchBox = 'width:100%;background:var(--bg-2);border:1px solid var(--line-2);color:var(--text);border-radius:6px;padding:8px 10px;font:inherit';

function tItems() {
  setContent(html`<div class="grid" style="grid-template-columns:300px 1fr;gap:16px;align-items:start">
    <div class="panel" style="padding:12px"><input type="search" id="it-q" placeholder="Search any item, ship or skill" value="${itemState.q}" style="${searchBox}">
      <div id="it-list" style="margin-top:8px;max-height:70vh;overflow:auto"></div></div>
    <div id="it-out">${emptyBox('Search for an item to see its stats, skills, blueprint, reprocessing and prices.')}</div></div>`);
  const drawList = () => { $('#it-list').innerHTML = String(itemState.results.length ? html`${itemState.results.map(r => html`<a href="#" class="it-row ${r.id === itemState.id ? 'active' : ''}" data-it="${r.id}" style="display:flex;gap:8px;align-items:center;padding:6px 6px;border-radius:6px;text-decoration:none;color:var(--text)${raw(r.id === itemState.id ? ';background:var(--bg-3)' : '')}">${icon(r.id, 22)}<span><span>${r.name}</span><br><span class="dim" style="font-size:11.5px">${r.group}</span></span></a>`)}` : (itemState.q.length > 1 ? html`<div class="dim" style="padding:8px">No matches.</div>` : ''));
    document.querySelectorAll('[data-it]').forEach(a => a.onclick = e => { e.preventDefault(); openItem(Number(a.dataset.it)); }); };
  let t = null;
  $('#it-q').oninput = e => { itemState.q = e.target.value; clearTimeout(t); t = setTimeout(async () => { if (itemState.q.trim().length < 2) { itemState.results = []; return drawList(); } const r = await api.items.search(itemState.q); itemState.results = r.ok ? r.data : []; if (!r.ok) toast(r.error, true); drawList(); }, 200); };
  drawList();
  if (itemState.pending) { const id = itemState.pending; itemState.pending = null; openItem(id); }
  else if (itemState.data) drawItem();
  $('#it-q').focus();
}

async function openItem(id) {
  itemState.id = id;
  document.querySelectorAll('[data-it]').forEach(a => { a.style.background = Number(a.dataset.it) === id ? 'var(--bg-3)' : ''; });
  $('#it-out').innerHTML = String(loadingView('Loading item…'));
  const r = await api.items.info(id);
  if (!r.ok) { $('#it-out').innerHTML = String(errorView(r)); return; }
  itemState.data = r.data; drawItem();
}

function drawItem() {
  const d = itemState.data;
  const fmtTime = s => fmtDuration(s * 1000, true);
  const link = (id, name) => html`<a href="#" data-goitem="${id}">${name}</a>`;
  $('#it-out').innerHTML = String(html`<div class="panel"><div style="display:flex;gap:14px;align-items:center">
      <img src="https://images.evetech.net/types/${d.id}/${raw(d.category === 'Ship' ? 'render' : 'icon')}?size=128" width="64" height="64" style="border-radius:8px;border:1px solid var(--line-2)" alt="">
      <div style="flex:1"><div style="font-size:20px;font-weight:600">${d.name}</div><div class="muted">${d.group} · ${d.category}${d.meta ? ' · ' + d.meta : ''}</div>
        <div class="dim" style="font-size:12px;margin-top:3px">Volume ${fmtNum(d.volume)} m³${d.portion > 1 ? ` · portion ${fmtNum(d.portion)}` : ''} · type ID ${d.id}</div></div>
      <div style="display:flex;gap:6px;flex-direction:column"><button class="btn btn-ghost" id="it-fly" style="font-size:12px;padding:4px 10px">Who can use it?</button>
        <button class="btn btn-ghost" data-link="https://everef.net/type/${d.id}" style="font-size:12px;padding:4px 10px">EVE Ref ↗</button></div></div>
      <div id="it-fly-out"></div></div>
    <div class="grid grid-2" style="align-items:start">
      <div>
        ${d.prices ? html`<div class="panel" style="padding:0"><div style="padding:12px 16px 0"><h3>Prices</h3></div>${d.prices.none ? html`<div class="dim" style="padding:0 16px 14px">No hub orders. CCP average ${fmtCompact(d.prices.avg)} ISK.</div>` : html`<table><thead><tr><th>Hub</th><th class="right">Sell</th><th class="right">Buy</th><th class="right">On sale</th></tr></thead><tbody>
          ${d.prices.map(p => html`<tr><td>${p.hub}</td><td class="right num">${p.sell !== null ? fmtCompact(p.sell) : '—'}</td><td class="right num muted">${p.buy !== null ? fmtCompact(p.buy) : '—'}</td><td class="right num dim">${fmtNum(p.sellVolume)}</td></tr>`)}</tbody></table>`}</div>` : ''}
        ${d.requirements.length ? html`<div class="panel"><h3>Required skills</h3>${d.requirements.map(r => html`<div style="padding:3px 0">${link(r.id, r.name)} ${levelBoxes(r.level)} <span class="dim">${ROMAN[r.level]}</span></div>`)}</div>` : ''}
        ${d.build ? html`<div class="panel" style="padding:0"><div style="padding:12px 16px 0"><h3>Built from</h3><div class="dim" style="font-size:12px;margin:-4px 0 8px">${d.build.blueprint} · ${d.build.activity} · ${fmtTime(d.build.time)} per run${d.build.perRun > 1 ? ` · makes ${d.build.perRun}` : ''}${d.matCost ? ` · materials ${fmtCompact(d.matCost)} ISK each at Jita sell` : ''}</div></div>
          <table><tbody>${d.build.materials.map(m => html`<tr><td>${icon(m.id, 18)}${link(m.id, m.name)}</td><td class="right num">${fmtNum(m.qty)}</td></tr>`)}</tbody></table></div>` : ''}
        ${d.reprocess ? html`<div class="panel" style="padding:0"><div style="padding:12px 16px 0"><h3>Reprocesses into</h3><div class="dim" style="font-size:12px;margin:-4px 0 8px">Per ${fmtNum(d.reprocess.portion)} at 100% yield</div></div>
          <table><tbody>${d.reprocess.outputs.map(m => html`<tr><td>${icon(m.id, 18)}${link(m.id, m.name)}</td><td class="right num">${fmtNum(m.qty)}</td></tr>`)}</tbody></table></div>` : ''}
        ${d.usedIn.length ? html`<div class="panel"><h3>Used to build</h3><div style="display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px">${d.usedIn.map(u => html`<span>${link(u.productId, u.name)} <span class="dim">×${fmtNum(u.qty)}</span></span>`)}</div></div>` : ''}
      </div>
      <div>${d.hasStats ? Object.entries(d.attrs).map(([cat, list]) => html`<div class="panel" style="padding:0"><div style="padding:12px 16px 0"><h3>${cat}</h3></div><table><tbody>
          ${list.map(a => html`<tr><td class="muted">${a.name}</td><td class="right num">${a.typeId ? link(a.typeId, a.text) : a.text}</td></tr>`)}</tbody></table></div>`)
        : html`<div class="notice">Item stats need a one-time game data refresh. Go to Settings → Game data and click Update. It downloads the game data again with item stats included.</div>`}</div>
    </div>`);
  document.querySelectorAll('[data-goitem]').forEach(a => a.onclick = e => { e.preventDefault(); openItem(Number(a.dataset.goitem)); });
  document.querySelectorAll('#it-out [data-link]').forEach(a => a.onclick = e => { e.preventDefault(); api.openLink(a.dataset.link); });
  $('#it-fly').onclick = async () => {
    const out = $('#it-fly-out'); out.innerHTML = String(loadingView('Checking your pilots…'));
    const r = await api.canFly(d.id);
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    const nameOf = p => p.name || (state.characters.find(c => c.id === p.id) || {}).name || p.id;
    out.innerHTML = String(html`<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">${(r.data.pilots || []).filter(p => !p.error).map(p => html`<span class="badge ${p.canFly ? 'green' : ''}">${nameOf(p)}${p.canFly ? ' ✓ can use it' : ' · ' + fmtDuration(p.minutes * 60000, true) + ' of training'}</span>`)}</div>`);
  };
}

// ================= Contract bargains =================

const bargainState = { regionId: 10000002, minProfit: 20e6, minPct: 15, maxPrice: '', maxNew: 400, highsecOnly: false, data: null };

async function tBargains() {
  const s = bargainState;
  const rg = await api.couriers.regions();
  const regions = rg.ok ? rg.data : [];
  setContent(html`<div class="toolbar" style="flex-wrap:wrap;gap:10px">
      <select id="bg-region" class="crumb-select">${regions.map(r => html`<option value="${r.id}" ${raw(r.id === s.regionId ? 'selected' : '')}>${r.name}</option>`)}</select>
      <label>Min profit <input id="bg-profit" type="text" value="${fmtCompact(s.minProfit)}" style="${inStyle}"></label>
      <label>Min discount <input id="bg-pct" type="number" min="0" max="95" value="${s.minPct}" style="${inStyle};width:70px"> %</label>
      <label>Max price <input id="bg-max" type="text" value="${s.maxPrice}" placeholder="any" style="${inStyle}"></label>
      <label>Read up to <input id="bg-new" type="number" min="50" max="2000" step="50" value="${s.maxNew}" style="${inStyle};width:80px"> new contracts</label>
      <label class="check" style="margin:0"><input type="checkbox" id="bg-hs" ${raw(s.highsecOnly ? 'checked' : '')}> Highsec only</label>
      <button class="btn btn-primary" id="bg-go">Scan</button></div>
    <div id="bg-out">${s.data ? '' : emptyBox('Scan public item contracts for anything priced well under what it sells for in Jita. The first scan of a busy region takes a few minutes; after that only new contracts are read.')}</div>`);
  if (s.data) drawBargains();
  $('#bg-go').onclick = async () => {
    Object.assign(s, { regionId: Number($('#bg-region').value), minProfit: parseIsk($('#bg-profit').value) || 0, minPct: Number($('#bg-pct').value) || 0, maxPrice: $('#bg-max').value.trim(), maxNew: Number($('#bg-new').value) || 400, highsecOnly: $('#bg-hs').checked });
    $('#bg-out').innerHTML = String(loadingView('Reading contracts… this can take a few minutes the first time'));
    const r = await api.bargains.scan({ regionId: s.regionId, minProfit: s.minProfit, minPct: s.minPct, maxPrice: s.maxPrice ? parseIsk(s.maxPrice) : 0, maxNew: s.maxNew, highsecOnly: s.highsecOnly });
    if (!r.ok) { $('#bg-out').innerHTML = String(errorView(r)); return; }
    s.data = r.data; drawBargains();
  };
}

function drawBargains() {
  const d = bargainState.data;
  $('#bg-out').innerHTML = String(html`<div class="dim" style="margin:6px 0 10px;font-size:12.5px">${fmtNum(d.total)} item contracts in range · ${fmtNum(d.read)} read${d.newlyRead ? ` (${fmtNum(d.newlyRead)} new this scan)` : ''}${d.unread ? ` · ${fmtNum(d.unread)} not read yet, scan again to read more` : ''}${d.failed ? ` · ${d.failed} failed` : ''}</div>
    <div class="panel" style="padding:0">${d.rows.length ? html`<table><thead><tr><th>Contract</th><th>Where</th><th class="right">Price</th><th class="right">Jita sell value</th><th class="right">Profit</th><th class="right">If sold to buy orders</th><th></th></tr></thead><tbody>
      ${d.rows.map(x => html`<tr><td>${x.items.map(i => html`<div>${icon(i.id, 16)}${i.qty > 1 ? fmtNum(i.qty) + ' × ' : ''}${i.name}</div>`)}${x.itemCount > x.items.length ? html`<div class="dim" style="font-size:11.5px">+ ${x.itemCount - x.items.length} more</div>` : ''}${x.title ? html`<div class="dim" style="font-size:11.5px">"${x.title}"</div>` : ''}</td>
        <td>${x.system || '—'}${x.security !== null && x.security !== undefined ? html` <span class="dim">${(Math.round(x.security * 10) / 10).toFixed(1)}</span>` : ''}<div class="dim" style="font-size:11.5px">${fmtNum(x.volume)} m³</div></td>
        <td class="right num">${fmtCompact(x.price)}${x.wantCost ? html`<div class="dim" style="font-size:11.5px">+ ${fmtCompact(x.wantCost)} in items</div>` : ''}</td><td class="right num">${fmtCompact(x.sellVal)}</td>
        <td class="right num pos">${fmtCompact(x.profitSell)}<div class="dim" style="font-size:11.5px">${Math.round(x.pct * 100)}% under</div></td><td class="right num ${x.profitBuy >= 0 ? '' : 'neg'}">${fmtCompact(x.profitBuy)}</td>
        <td>${x.suspicious ? html`<span class="badge gold" title="${x.wants ? 'Asks for items in return; check them carefully' : 'More than 70% under value: check every item name and that nothing is a blueprint copy'}">check carefully</span>` : ''}${x.bpcs ? html` <span class="badge" title="Includes blueprint copies, valued at zero">${x.bpcs} BPC</span>` : ''}</td></tr>`)}
    </tbody></table>` : emptyBox('No bargains found with these settings. Lower the minimum profit or discount, or scan again to read more contracts.')}</div>
    <div class="dim" style="font-size:12px;margin-top:8px">Values use the lowest Jita sell order, with blueprint copies at zero. Find a contract in game with the contract search, filtered to the same region. Always open the contract and check each item before you accept: lookalike names and asking for items in return are common scams.</div>`);
}

// ================= Character value =================

async function tCharValue(stillCurrent) {
  setContent(loadingView('Reading skills and injector prices…'));
  const r = await api.charValue();
  if (stillCurrent && !stillCurrent()) return;
  if (!r.ok) return setContent(errorView(r));
  const d = r.data, p = d.prices;
  const sp = n => (n / 1e6).toFixed(1) + 'm';
  setContent(html`<div class="grid grid-3" style="margin-bottom:16px">
      ${stat('Large Skill Injector', fmtCompact(p.lsiSell) + ' ISK', 'Jita lowest sell')}
      ${stat('Skill Extractor', fmtCompact(p.extractor) + ' ISK', 'Jita lowest sell')}
      ${stat('Per extraction', fmtCompact(p.perExtract) + ' ISK', 'Injector sold to buy orders, after tax, minus the extractor', p.perExtract >= 0 ? 'pos' : 'neg')}</div>
    <div class="panel" style="padding:0"><table><thead><tr><th>Pilot</th><th class="right">Skill points</th><th class="right">Skills at V</th><th class="right">Extract value</th><th class="right">Cost to inject</th><th>Worth noting to a buyer</th></tr></thead><tbody>
      ${d.rows.map(x => x.error ? html`<tr><td>${x.name}</td><td colspan="5" class="dim">${x.error}</td></tr>` : html`<tr>
        <td><img src="${portrait(x.id, 32)}" width="22" height="22" style="border-radius:4px;vertical-align:middle;margin-right:8px">${x.name}</td>
        <td class="right num">${sp(x.totalSp)}${x.unallocated ? html`<div class="dim" style="font-size:11.5px">${sp(x.unallocated)} unallocated</div>` : ''}</td>
        <td class="right num">${fmtNum(x.fives)}</td>
        <td class="right num">${fmtCompact(x.extractValue)}<div class="dim" style="font-size:11.5px">${fmtNum(x.extractable)} extractors</div></td>
        <td class="right num">${fmtCompact(x.injectCost)}</td>
        <td>${x.notable.length ? x.notable.map(n => html`<span class="badge accent" style="margin:0 4px 4px 0" title="${n.skill} ${ROMAN[n.level]}">${n.label}</span>`) : html`<span class="dim">—</span>`}</td></tr>`)}
    </tbody></table></div>
    <div class="dim" style="font-size:12px;margin-top:8px">Extract value is what you'd get pulling every skill point above 5m out with extractors and selling the injectors: roughly the lowest sensible price. Cost to inject is what a buyer would pay to reach the same SP with injectors, which give less SP the more a pilot already has: roughly the highest. Character Bazaar sales tend to land between the two, higher for pilots with skills buyers want, a good remap or a clean history. Prices are Jita.</div>`);
}
