'use strict';
/* Asset finder (all pilots), ore values per m³, and copying EVE client settings between pilots. */

// ================= Asset finder =================

const afState = { q: '', from: '', pilot: '', minValue: '', data: null, plan: null, busy: false };

async function tAssetFinder() {
  const o = afState;
  setContent(html`<div class="panel" style="margin-bottom:14px"><div class="grid grid-4" style="align-items:end">
      ${field('Find', html`<input type="text" id="af-q" value="${o.q}" placeholder="Item, group, station or system">`)}
      ${field('Jumps from', html`<div style="display:flex;gap:6px"><input type="text" id="af-from" value="${o.from}" placeholder="e.g. Jita (optional)"><button class="btn btn-ghost" id="af-me" title="Use a pilot's location">⌖</button></div>`)}
      ${field('Pilot', html`<select id="af-pilot"><option value="">All pilots</option>${state.characters.filter(c => !c.needsReauth).map(c => html`<option value="${c.id}" ${raw(String(c.id) === String(o.pilot) ? 'selected' : '')}>${c.name}</option>`)}</select>`)}
      ${field('Worth at least', html`<input type="text" id="af-min" value="${o.minValue}" placeholder="e.g. 10m">`)}</div>
    <div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-primary" id="af-go">Search</button><button class="btn btn-ghost" id="af-plan" title="What would have to move to bring these to the 'Jumps from' system">Gather plan</button><button class="btn btn-ghost" id="af-refresh" title="Fetch every pilot's assets again">⟳ Refresh assets</button></div></div>
    <div id="af-out">${o.plan ? afPlanView(o.plan) : o.data ? afView(o.data) : emptyBox('Search every pilot\'s hangars at once. Add a system to sort by jumps, or make a plan for gathering it all in one place.')}</div>`);
  const read = () => Object.assign(o, { q: $('#af-q').value.trim(), from: $('#af-from').value.trim(), pilot: $('#af-pilot').value, minValue: $('#af-min').value.trim() });
  const opts = refresh => ({ q: o.q, from: o.from || undefined, pilot: o.pilot || undefined, minValue: o.minValue ? parseIsk(o.minValue) : undefined, refresh });
  const run = async refresh => {
    read(); o.plan = null;
    const out = $('#af-out'); out.innerHTML = String(loadingView(refresh ? 'Fetching assets for every pilot…' : 'Searching…'));
    const r = await api.assetFinder.search(opts(refresh));
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    o.data = r.data; out.innerHTML = String(afView(r.data));
  };
  $('#af-go').onclick = () => run(false);
  $('#af-refresh').onclick = () => run(true);
  $('#af-q').onkeydown = e => { if (e.key === 'Enter') run(false); };
  $('#af-from').onkeydown = e => { if (e.key === 'Enter') run(false); };
  $('#af-me').onclick = () => fillFromPilots('#af-from');
  $('#af-plan').onclick = async () => {
    read();
    if (!o.from) { toast('Type the system to gather things in, in "Jumps from".', 'error'); $('#af-from').focus(); return; }
    const out = $('#af-out'); out.innerHTML = String(loadingView('Planning…'));
    const r = await api.assetFinder.consolidate({ ...opts(false), to: o.from });
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    o.plan = r.data; out.innerHTML = String(afPlanView(r.data));
  };
}

const afSec = s => s === null || s === undefined ? '' : html` <span class="num" style="color:${raw(typeof SEC_COLOR === 'function' ? SEC_COLOR(s) : 'inherit')}">${(Math.round(s * 10) / 10).toFixed(1)}</span>`;

function afItems(g) {
  return html`<table class="mini"><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">m³</th><th class="right">Value</th></tr></thead><tbody>${g.items.map(i => html`<tr><td>${icon(i.typeId, 18)}${i.name}<span class="dim"> · ${i.group}</span></td><td class="right num">${fmtNum(i.qty)}</td><td class="right num muted">${fmtCompact(i.volume)}</td><td class="right num">${fmtCompact(i.value)}</td></tr>`)}</tbody></table>
    ${g.itemCount > g.items.length ? html`<div class="dim" style="padding:6px 10px">…and ${fmtNum(g.itemCount - g.items.length)} more stacks</div>` : ''}`;
}

function afView(d) {
  const errs = d.errors && d.errors.length ? html`<div class="notice" style="margin-bottom:12px">Could not read assets for ${d.errors.map(e => e.pilot).join(', ')}.</div>` : '';
  if (!d.groups.length) return html`${errs}${emptyBox('Nothing matches. Pilots need the assets permission to be searched.')}`;
  return html`${errs}<div class="grid grid-4" style="margin-bottom:14px">${stat('Stacks found', fmtNum(d.matched))}${stat('Places', fmtNum(d.totalGroups))}${stat('Value', fmtCompact(d.value) + ' ISK')}${stat('Volume', fmtCompact(d.volume) + ' m³')}</div>
    <div class="panel" style="padding:0"><table><thead><tr><th>Where</th><th>Pilot</th>${d.from ? html`<th class="right">Jumps from ${d.from}</th>` : ''}<th class="right">Stacks</th><th class="right">m³</th><th class="right">Value</th></tr></thead><tbody>
    ${d.groups.map(g => xRow('af' + g.key, html`<td><b>${g.location || 'Unknown location'}</b><div class="dim">${g.system ? html`<a href="#" data-system="${g.system}">${g.system}</a>${afSec(g.security)} · ${g.region}` : 'System unknown (no docking access)'}</div></td>
      <td><a href="#" data-pilot="${g.charId}">${g.pilot}</a></td>${d.from ? html`<td class="right num">${g.jumps === null ? '—' : g.jumps}</td>` : ''}<td class="right num">${fmtNum(g.itemCount)}</td><td class="right num muted">${fmtCompact(g.volume)}</td><td class="right num">${fmtCompact(g.value)}</td>`,
      afItems(g), d.from ? 6 : 5))}</tbody></table></div>
    <div class="dim" style="margin-top:8px;font-size:12px">Assets were read ${timeAgo(d.at)}. Click a row to see what is there.</div>`;
}

function afPlanView(p) {
  if (!p.trips.length && !p.unreachable.length) return emptyBox(`Everything that matches is already in ${p.to}.`);
  return html`<div class="grid grid-4" style="margin-bottom:14px">${stat('Gather in', p.to)}${stat('Places to visit', fmtNum(p.trips.length), p.here ? `${p.here} already there` : '')}${stat('To move', fmtCompact(p.volume) + ' m³', fmtCompact(p.value) + ' ISK')}${stat('Furthest', p.maxJumps + ' jumps')}</div>
    <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Pick-up list, nearest first</h3><div class="dim" style="font-size:12px;margin:-4px 0 8px">Ship size hint: under 60k m³ fits a deep space transport; over 300k m³ needs a freighter or several trips.</div></div>
    <table><thead><tr><th>Where</th><th>Pilot</th><th class="right">Jumps</th><th class="right">m³</th><th class="right">Value</th><th>Ship</th></tr></thead><tbody>
    ${p.trips.map(g => xRow('afp' + g.key, html`<td><b>${g.location}</b><div class="dim"><a href="#" data-system="${g.system}">${g.system}</a>${afSec(g.security)} · ${g.region}</div></td><td>${g.pilot}</td><td class="right num">${g.jumps}</td><td class="right num">${fmtCompact(g.volume)}</td><td class="right num">${fmtCompact(g.value)}</td>
      <td><span class="badge">${g.volume < 5000 ? 'Any hauler' : g.volume < 60000 ? 'DST / blockade runner' : g.volume < 350000 ? 'Freighter' : 'Several freighter trips'}</span></td>`, afItems(g), 6))}</tbody></table></div>
    ${p.unreachable.length ? html`<div class="notice" style="margin-top:12px">${p.unreachable.length} place(s) have no gate route to ${p.to} (wormhole space, or the system is unknown): ${p.unreachable.slice(0, 8).map(g => g.location).join(', ')}${p.unreachable.length > 8 ? '…' : ''}</div>` : ''}`;
}

// ================= Ore values =================

const oreState = { family: 'ore', side: 'buy', m3PerHour: '', data: null };
const ORE_FAMILIES = [['ore', 'Asteroid ore'], ['moon', 'Moon ore'], ['ice', 'Ice'], ['gas', 'Gas']];

async function tOres() {
  const o = oreState, rp = toolState.reprocess;
  setContent(html`<div class="panel" style="margin-bottom:14px"><div class="grid grid-4" style="align-items:end">
      ${field('Mining', html`<select id="or-fam">${ORE_FAMILIES.map(([k, l]) => html`<option value="${k}" ${raw(k === o.family ? 'selected' : '')}>${l}</option>`)}</select>`)}
      ${field('Price hub', hubSelect('or-hub', toolState.hub))}
      ${field('Sell to', html`<select id="or-side"><option value="buy" ${raw(o.side === 'buy' ? 'selected' : '')}>Buy orders (instant)</option><option value="sell" ${raw(o.side === 'sell' ? 'selected' : '')}>Sell orders (list it)</option></select>`)}
      ${field('Your m³ per hour', html`<input type="number" id="or-rate" value="${o.m3PerHour}" placeholder="optional, e.g. 25000">`)}</div>
    <div class="dim" style="font-size:12px;margin:2px 0 8px">Reprocessing uses the yield from the Reprocessing tool (${rp.structure === 'npc' ? 'NPC station' : 'Upwell refinery'}, base ${rp.base}%, skills ${rp.reprocessing}/${rp.efficiency}/${rp.specific}).</div>
    <button class="btn btn-primary" id="or-go">Compare</button></div>
    <div id="or-out">${o.data ? oreView(o.data) : emptyBox('See which ore, ice or gas earns the most per cubic metre, and whether to sell it raw, compressed or reprocessed.')}</div>`);
  $('#or-go').onclick = async () => {
    Object.assign(o, { family: $('#or-fam').value, side: $('#or-side').value, m3PerHour: $('#or-rate').value });
    toolState.hub = $('#or-hub').value;
    const out = $('#or-out'); out.innerHTML = String(loadingView('Fetching prices…'));
    const r = await api.ind.ores({ ...rp, family: o.family, side: o.side, hub: toolState.hub, m3PerHour: o.m3PerHour ? Number(o.m3PerHour) : undefined });
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    o.data = r.data; out.innerHTML = String(oreView(r.data));
  };
}

function oreView(d) {
  if (!d.rows.length) return emptyBox('No market prices found for this group.');
  const isk = v => v === null || v === undefined ? '—' : v < 1000 ? v.toFixed(1) : fmtCompact(v);
  const best = (r, k) => r.verdict === k ? 'pos' : '';
  const perHour = d.rows.some(r => r.perHour !== null);
  return html`<div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>ISK per m³ mined</h3><div class="dim" style="font-size:12px;margin:-4px 0 8px">${d.hub}, selling to ${d.side} orders${d.yield ? ` · reprocessing yield ${pct(d.yield)}` : ''}. Compressed is per m³ of raw ore mined.</div></div>
    <table><thead><tr><th>${d.family === 'gas' ? 'Gas' : d.family === 'ice' ? 'Ice' : 'Ore'}</th><th class="right">Raw</th><th class="right">Compressed</th>${d.family !== 'gas' ? html`<th class="right">Reprocessed</th>` : ''}${perHour ? html`<th class="right">Per hour</th>` : ''}<th>Best</th></tr></thead><tbody>
    ${d.rows.map(r => xRow('or' + r.typeId, html`<td>${icon(r.typeId, 18)}${r.name}<div class="dim">${r.group} · ${r.volume} m³ each</div></td>
      <td class="right num ${best(r, 'raw')}">${isk(r.raw)}</td><td class="right num ${best(r, 'compress')}">${isk(r.compressed)}</td>${d.family !== 'gas' ? html`<td class="right num ${best(r, 'reprocess')}">${isk(r.reprocessed)}</td>` : ''}
      ${perHour ? html`<td class="right num">${r.perHour === null ? '—' : fmtCompact(r.perHour)}</td>` : ''}<td>${r.verdict ? html`<span class="badge ${r.verdict === 'reprocess' ? 'accent' : r.verdict === 'compress' ? 'green' : ''}">${humanize(r.verdict)}</span>` : html`<span class="dim">no price</span>`}</td>`,
      r.materials.length ? html`<div class="dim" style="padding:6px 10px">Reprocessing one batch (${fmtNum(r.portion || 100)} units) gives:</div><table class="mini"><tbody>${r.materials.map(m => html`<tr><td>${icon(m.typeId, 18)}${m.name}</td><td class="right num">${fmtNum(m.qty)}</td><td class="right num muted">${fmtCompact(m.value)}</td></tr>`)}</tbody></table>` : html`<div class="dim" style="padding:8px 10px">Not reprocessable${r.compressedVolume ? `; compressed it is ${r.compressedVolume} m³ a unit` : ''}.</div>`,
      d.family !== 'gas' ? (perHour ? 6 : 5) : (perHour ? 5 : 4)))}</tbody></table></div>`;
}

// ================= EVE client settings =================

const esState = { data: null, sel: {}, kind: 'char' };

async function tEveSettings() {
  setContent(loadingView('Looking for EVE settings…'));
  const [r, b] = await Promise.all([api.eveSettings.list(), api.eveSettings.backups()]);
  if (!r.ok) return setContent(errorView(r));
  esState.data = r.data; esState.backups = b.ok ? b.data : [];
  drawEveSettings();
}

function esProfiles() { return (esState.data.installs || []).flatMap(i => i.profiles.map(p => ({ ...p, install: i.name, server: i.server, key: p.dir }))); }

function drawEveSettings() {
  const d = esState.data, profs = esProfiles();
  if (!profs.length) return setContent(html`${emptyBox('No EVE settings folders found. Log a pilot into EVE once, then come back.')}
    <div class="dim" style="margin-top:10px;font-size:12px">Looked in: ${(d.roots || []).join(', ') || 'the usual EVE folder under Local AppData'}.</div>`);
  const sel = esState.sel;
  if (!sel.dir || !profs.some(p => p.dir === sel.dir)) sel.dir = (profs.find(p => p.chars.length) || profs[0]).dir;
  const p = profs.find(x => x.dir === sel.dir);
  const kind = esState.kind;
  const list = kind === 'char' ? p.chars : p.users;
  if (!sel.from || !list.some(x => String(x.id) === String(sel.from))) sel.from = list[0] ? String(list[0].id) : null;
  const label = x => kind === 'char' ? x.name : (x.label || `Account ${x.id}`);
  setContent(html`${d.running ? html`<div class="notice" style="margin-bottom:12px;border-color:var(--red)"><b>EVE is running.</b> Close every EVE client before copying, or EVE writes its own settings back over the copy when it exits.</div>` : ''}
    <div class="panel" style="margin-bottom:14px"><div class="grid grid-3" style="align-items:end">
      ${field('Settings profile', html`<select id="es-prof">${profs.map(x => html`<option value="${x.dir}" ${raw(x.dir === sel.dir ? 'selected' : '')}>${x.server} · ${x.install} · ${x.name} (${x.chars.length} pilots)</option>`)}</select>`)}
      ${field('Copy', html`<select id="es-kind"><option value="char" ${raw(kind === 'char' ? 'selected' : '')}>Pilot settings (windows, overview, chat)</option><option value="user" ${raw(kind === 'user' ? 'selected' : '')}>Account settings (hotkeys, audio, graphics)</option></select>`)}
      ${field('From', html`<select id="es-from">${list.map(x => html`<option value="${x.id}" ${raw(String(x.id) === String(sel.from) ? 'selected' : '')}>${label(x)} · saved ${timeAgo(x.modified)}</option>`)}</select>`)}</div></div>
    <div class="panel" style="padding:0"><div style="padding:14px 18px 0;display:flex;align-items:center;gap:10px"><h3 style="margin:0">Copy to</h3><span class="dim" style="font-size:12px">${kind === 'user' ? 'EVE does not say which account is which. The newest file is usually the account you played last; name them so you remember.' : 'Ticked pilots get the From pilot\'s layout.'}</span></div>
    <table><thead><tr><th style="width:32px"><input type="checkbox" id="es-all"></th><th>${kind === 'char' ? 'Pilot' : 'Account'}</th><th>Last saved by EVE</th><th class="right">Size</th></tr></thead><tbody>
    ${list.map(x => html`<tr><td><input type="checkbox" class="es-to" value="${x.id}" ${raw(String(x.id) === String(sel.from) ? 'disabled title="This is the source"' : '')}></td>
      <td>${kind === 'char' ? html`<b>${x.name}</b>${x.mine ? html` <span class="badge accent" title="This pilot is added to EVE Toolkit">in app</span>` : ''}` : html`<input type="text" class="es-label" data-id="${x.id}" value="${x.label}" placeholder="Account ${x.id}" style="max-width:220px">`}</td>
      <td>${fmtDate(x.modified)} <span class="dim">(${timeAgo(x.modified)})</span></td><td class="right num muted">${fmtNum(Math.round(x.size / 1024))} KB</td></tr>`)}</tbody></table>
    <div style="padding:12px 18px;display:flex;gap:8px;align-items:center"><button class="btn btn-primary" id="es-copy">Copy settings</button><span class="dim" style="font-size:12px">The files being replaced are backed up first.</span></div></div>
    <div class="panel" style="margin-top:14px;padding:0"><div style="padding:14px 18px 0"><h3>Backups</h3></div>
    ${esState.backups.length ? html`<table><tbody>${esState.backups.slice(0, 20).map(b => html`<tr><td>${fmtDate(b.at)}</td><td class="muted">${b.kind === 'char' ? 'Pilot' : 'Account'} settings over ${b.files.length} file(s)</td><td class="right"><button class="btn btn-ghost btn-sm es-restore" data-id="${b.id}">Undo this copy</button></td></tr>`)}</tbody></table>` : html`<div class="dim" style="padding:0 18px 14px">No copies made yet.</div>`}</div>`);
  $('#es-prof').onchange = e => { sel.dir = e.target.value; sel.from = null; drawEveSettings(); };
  $('#es-kind').onchange = e => { esState.kind = e.target.value; sel.from = null; drawEveSettings(); };
  $('#es-from').onchange = e => { sel.from = e.target.value; drawEveSettings(); };
  if (!sel.from && list[0]) sel.from = String(list[0].id);
  $('#es-all').onchange = e => document.querySelectorAll('.es-to').forEach(c => { if (c.value !== String(sel.from)) c.checked = e.target.checked; });
  document.querySelectorAll('.es-label').forEach(i => i.onchange = () => api.eveSettings.label(i.dataset.id, i.value));
  $('#es-copy').onclick = async () => {
    const from = $('#es-from').value, to = [...document.querySelectorAll('.es-to:checked')].map(c => c.value).filter(v => v !== from);
    if (!to.length) return toast('Tick at least one target.', 'error');
    const name = id => { const x = list.find(y => String(y.id) === String(id)); return x ? label(x) : id; };
    openModal('Copy EVE settings?', html`<p>Copy <b>${name(from)}</b>'s ${kind === 'char' ? 'pilot' : 'account'} settings over:</p><ul>${to.map(t => html`<li>${name(t)}</li>`)}</ul>
      <p class="dim">Close every EVE client first. You can undo this from Backups.</p>
      ${esState.data.running ? html`<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="es-force"> EVE looks open. Copy anyway.</label>` : ''}`, { submit: 'Copy', onSubmit: async () => {
      const force = !!($('#es-force') && $('#es-force').checked);
      const r = await api.eveSettings.copy({ dir: sel.dir, kind, from, to, force });
      if (!r.ok) { toast(r.error, 'error'); return true; }
      toast(`Copied to ${r.data.copied} ${kind === 'char' ? 'pilot' : 'account'}(s). Backup saved.`);
      tEveSettings();
    } });
  };
  document.querySelectorAll('.es-restore').forEach(b => b.onclick = async () => {
    const r = await api.eveSettings.restore(b.dataset.id);
    if (!r.ok) return toast(r.error, 'error');
    toast(`Put back ${r.data.restored} file(s).`); tEveSettings();
  });
}

// ================= Compare skills =================

const cmpState = { ids: null, data: null, q: '', diff: true };

async function tCompareSkills() {
  const chars = state.characters.filter(c => !c.needsReauth);
  if (!cmpState.ids) cmpState.ids = chars.slice(0, 10).map(c => c.id);
  setContent(html`<div class="panel" style="margin-bottom:14px"><div style="display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center">
      ${chars.map(c => html`<label class="check" style="margin:0"><input type="checkbox" class="cmp-pilot" value="${c.id}" ${raw(cmpState.ids.includes(c.id) ? 'checked' : '')}> ${c.name}</label>`)}</div>
    <div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" id="cmp-go">Compare</button>
      <input type="search" id="cmp-q" placeholder="Filter skills or groups" value="${cmpState.q}" style="max-width:260px">
      <label class="check" style="margin:0"><input type="checkbox" id="cmp-diff" ${raw(cmpState.diff ? 'checked' : '')}> Only skills where pilots differ</label>
      <span style="flex:1"></span><button class="btn btn-ghost" id="cmp-csv">Skills CSV</button><button class="btn btn-ghost" id="cmp-qcsv">Queues CSV</button></div>
    <div class="dim" style="font-size:12px;margin-top:6px">Up to 10 pilots side by side.</div></div>
    <div id="cmp-out">${cmpState.data ? cmpView() : emptyBox('Pick pilots and click Compare to see their trained skills side by side.')}</div>`);
  const ids = () => [...document.querySelectorAll('.cmp-pilot:checked')].map(x => Number(x.value)).slice(0, 10);
  $('#cmp-go').onclick = async () => {
    cmpState.ids = ids(); if (!cmpState.ids.length) return toast('Pick at least one pilot.', true);
    const out = $('#cmp-out'); out.innerHTML = String(loadingView('Loading skills…'));
    const r = await api.skillsCompare(cmpState.ids);
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    cmpState.data = r.data; out.innerHTML = String(cmpView());
  };
  $('#cmp-q').oninput = e => { cmpState.q = e.target.value; if (cmpState.data) $('#cmp-out').innerHTML = String(cmpView()); };
  $('#cmp-diff').onchange = e => { cmpState.diff = e.target.checked; if (cmpState.data) $('#cmp-out').innerHTML = String(cmpView()); };
  $('#cmp-csv').onclick = async () => {
    if (!cmpState.data) return toast('Click Compare first.', true);
    const d = cmpState.data;
    const rows = [['Group', 'Skill', ...d.pilots.map(p => p.name)], ...d.skills.map(s => [s.group, s.name, ...d.pilots.map(p => p.levels[s.id] || 0)])];
    const r = await api.saveCsv('EVE skills ' + new Date().toISOString().slice(0, 10), rows);
    if (r.ok && r.data) toast(`Saved ${r.data.rows - 1} skills`); else if (!r.ok) toast(r.error, true);
  };
  $('#cmp-qcsv').onclick = async () => {
    const q = await api.queuesCsv(ids()); if (!q.ok) return toast(q.error, true);
    const r = await api.saveCsv('EVE skill queues ' + new Date().toISOString().slice(0, 10), q.data);
    if (r.ok && r.data) toast(`Saved ${r.data.rows - 1} queued levels`); else if (!r.ok) toast(r.error, true);
  };
}

function cmpView() {
  const d = cmpState.data, q = cmpState.q.trim().toLowerCase();
  const errs = d.errors.length ? html`<div class="notice" style="margin-bottom:10px">Couldn't read: ${d.errors.map(e => e.pilot).join(', ')}</div>` : '';
  const rows = d.skills.filter(s => (!q || s.name.toLowerCase().includes(q) || s.group.toLowerCase().includes(q)) && (!cmpState.diff || new Set(d.pilots.map(p => p.levels[s.id] || 0)).size > 1));
  const box = lv => html`<span class="num" style="display:inline-block;min-width:22px;text-align:center;border-radius:4px;padding:1px 4px;background:${raw(lv === 5 ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : lv ? 'color-mix(in srgb, var(--accent) ' + (lv * 6) + '%, transparent)' : 'transparent')};color:${raw(lv ? 'var(--text)' : 'var(--dim)')}">${lv || '–'}</span>`;
  let lastGroup = '';
  return html`${errs}<div class="panel" style="padding:0"><div class="table-wrap" style="max-height:70vh"><table><thead><tr><th>Skill</th>${d.pilots.map(p => html`<th class="right" title="${fmtNum(p.totalSp)} SP">${p.name.split(' ')[0]}</th>`)}</tr></thead><tbody>
    <tr><td class="dim">Total SP</td>${d.pilots.map(p => html`<td class="right num dim">${fmtCompact(p.totalSp)}</td>`)}</tr>
    ${rows.map(s => { const g = s.group !== lastGroup; lastGroup = s.group; return html`${g ? html`<tr><td colspan="${d.pilots.length + 1}" style="padding-top:12px"><b class="dim" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">${s.group}</b></td></tr>` : ''}
      <tr><td>${s.name}</td>${d.pilots.map(p => html`<td class="right">${box(p.levels[s.id] || 0)}</td>`)}</tr>`; })}</tbody></table></div></div>
    <div class="dim" style="font-size:12px;margin-top:6px">${rows.length} of ${d.skills.length} skills shown.</div>`;
}

// ================= Agent finder =================

const agState = { from: '', jumps: 10, levels: [4], division: '', type: '', faction: '', highsec: true, locator: false, q: '', opts: null, data: null, lpItem: '', lp: null, tab: 'agents' };

async function tAgents() {
  const o = agState;
  if (!o.opts) { const r = await api.agents.options(); if (!r.ok) return setContent(errorView(r)); o.opts = r.data; }
  const sel = (id, list, val, none) => html`<select id="${id}"><option value="">${none}</option>${list.map(x => html`<option value="${x.id}" ${raw(String(x.id) === String(val) ? 'selected' : '')}>${x.name}</option>`)}</select>`;
  setContent(html`<div class="seg" style="margin-bottom:12px">${[['agents', 'Agents'], ['lp', 'Buy with LP']].map(([k, l]) => html`<button data-agtab="${k}" class="${o.tab === k ? 'active' : ''}">${l}</button>`)}</div>
    ${o.tab === 'agents' ? html`<div class="panel" style="margin-bottom:14px"><div class="grid grid-4" style="align-items:end">
      ${field('Near', html`<div style="display:flex;gap:6px"><input type="text" id="ag-from" value="${o.from}" placeholder="e.g. Dodixie (optional)"><button class="btn btn-ghost" id="ag-me" title="Use a pilot's location">⌖</button></div>`)}
      ${field('Within jumps', html`<input type="number" id="ag-j" value="${o.jumps}" min="0" max="40">`)}
      ${field('Division', sel('ag-div', o.opts.divisions, o.division, 'Any'))}
      ${field('Kind', sel('ag-type', o.opts.types, o.type, 'Any'))}
      ${field('Faction', sel('ag-fac', o.opts.factions, o.faction, 'Any'))}
      ${field('Name, corp or system', html`<input type="text" id="ag-q" value="${o.q}" placeholder="optional">`)}
      ${field('Level', html`<div class="pi-chips">${[1, 2, 3, 4, 5].map(l => html`<label class="check" style="margin:0 10px 0 0"><input type="checkbox" data-aglv="${l}" ${raw(o.levels.includes(l) ? 'checked' : '')}> ${l}</label>`)}</div>`)}
      ${field('', html`<label class="check" style="margin:0"><input type="checkbox" id="ag-hs" ${raw(o.highsec ? 'checked' : '')}> Highsec only</label><label class="check" style="margin:0"><input type="checkbox" id="ag-loc" ${raw(o.locator ? 'checked' : '')}> Locator agents</label>`)}</div>
      <button class="btn btn-primary" id="ag-go">Find agents</button></div>
      <div id="ag-out">${o.data ? agView(o.data) : emptyBox('Find mission, research and storyline agents by level, division, faction and distance.')}</div>`
    : html`<div class="panel" style="margin-bottom:14px"><div class="grid grid-3" style="align-items:end">
      ${field('Item', html`<input type="text" id="lp-item" value="${o.lpItem}" placeholder="e.g. Caldari Navy Mjolnir Heavy Missile">`)}
      ${field('Nearest to', html`<div style="display:flex;gap:6px"><input type="text" id="lp-from" value="${o.from}" placeholder="e.g. Jita (optional)"><button class="btn btn-ghost" id="lp-me" title="Use a pilot's location">⌖</button></div>`)}
      <div><button class="btn btn-primary" id="lp-go" style="width:100%">Find LP stores</button></div></div>
      <div class="dim" style="font-size:12px;margin-top:6px">Searches every NPC corporation's LP store for the item. The first search reads all the stores (about a minute); later ones are instant for a day.</div></div>
      <div id="lp-out">${o.lp ? lpView(o.lp) : emptyBox('Find which corporations sell an item for LP, and their nearest station.')}</div>`}`);
  document.querySelectorAll('[data-agtab]').forEach(b => b.onclick = () => { o.tab = b.dataset.agtab; tAgents(); });
  if (o.tab === 'agents') {
    $('#ag-me').onclick = () => fillFromPilots('#ag-from');
    $('#ag-go').onclick = async () => {
      Object.assign(o, { from: $('#ag-from').value.trim(), jumps: Number($('#ag-j').value) || 0, division: $('#ag-div').value, type: $('#ag-type').value, faction: $('#ag-fac').value, q: $('#ag-q').value.trim(),
        levels: [...document.querySelectorAll('[data-aglv]:checked')].map(x => Number(x.dataset.aglv)), highsec: $('#ag-hs').checked, locator: $('#ag-loc').checked });
      const out = $('#ag-out'); out.innerHTML = String(loadingView('Finding agents…'));
      const r = await api.agents.find({ from: o.from || undefined, jumps: o.from ? o.jumps : undefined, levels: o.levels, division: o.division, type: o.type, faction: o.faction, highsec: o.highsec, locator: o.locator, q: o.q });
      if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
      o.data = r.data; out.innerHTML = String(agView(r.data)); wireAg();
    };
    wireAg();
  } else {
    $('#lp-me').onclick = () => fillFromPilots('#lp-from');
    $('#lp-go').onclick = async () => {
      o.lpItem = $('#lp-item').value.trim(); o.from = $('#lp-from').value.trim();
      if (!o.lpItem) return toast('Type an item name.', true);
      const out = $('#lp-out'); out.innerHTML = String(loadingView('Reading LP stores…'));
      const r = await api.agents.lpFor(o.lpItem, o.from || undefined);
      if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
      o.lp = r.data; out.innerHTML = String(lpView(r.data)); wireAg();
    };
    wireAg();
  }
}

function agView(d) {
  if (!d.rows.length) return emptyBox('No agents match. Try more jumps, another level, or fewer filters.');
  return html`${d.hubs.length ? html`<div class="panel" style="margin-bottom:12px"><h3 class="mh" style="margin-top:0">Mission hubs in these results</h3><div style="display:flex;flex-wrap:wrap;gap:8px">${d.hubs.map(h => html`<span class="badge accent" title="${h.station}">${h.system} · ${h.count} agents · L${h.levels.join('/')}${h.jumps !== null ? ` · ${h.jumps} j` : ''}</span>`)}</div></div>` : ''}
    <div class="panel" style="padding:0"><div class="table-wrap" style="max-height:66vh"><table><thead><tr><th>Agent</th><th class="right">Level</th><th>Division</th><th>Corporation</th><th>Where</th>${d.from ? html`<th class="right">Jumps</th>` : ''}<th></th></tr></thead><tbody>
    ${d.rows.map(a => html`<tr><td><img src="${portrait(a.id, 32)}" width="22" height="22" style="border-radius:4px;vertical-align:middle;margin-right:8px">${a.name}${a.locator ? raw(' <span class="badge">locator</span>') : ''}<div class="dim" style="font-size:11.5px">${a.type}</div></td>
      <td class="right num"><b>${a.level}</b></td><td>${a.division}</td><td>${a.corp}<div class="dim" style="font-size:11.5px">${a.faction}</div></td>
      <td>${a.system ? html`<a href="#" data-system="${a.systemId}">${a.system}</a> ${secBadge(a.security)}` : ''}<div class="dim" style="font-size:11.5px">${a.station || a.region}</div></td>
      ${d.from ? html`<td class="right num">${a.jumps}</td>` : ''}<td class="nowrap"><button class="btn btn-ghost" style="padding:1px 8px;font-size:11.5px" data-ag-dest="${a.systemId}">Set destination</button></td></tr>`)}</tbody></table></div></div>
    <div class="dim" style="font-size:12px;margin-top:6px">${d.total > d.rows.length ? `Showing ${d.rows.length} of ${d.total}. Narrow it down for the rest.` : `${d.total} agents.`} Mission guides: search the agent's mission name on the EVE University wiki.</div>`;
}

function lpView(d) {
  if (!d.rows.length) return emptyBox(`No NPC LP store sells ${d.name} (checked ${d.checked} corporations).`);
  return html`<div class="panel" style="padding:0"><table><thead><tr><th>Corporation</th><th class="right">LP</th><th class="right">ISK</th><th>Also needs</th><th>Nearest station</th>${d.from ? html`<th class="right">Jumps</th>` : ''}<th></th></tr></thead><tbody>
    ${d.rows.map(r => html`<tr><td>${r.corp}</td><td class="right num">${fmtNum(r.lp)}</td><td class="right num">${fmtCompact(r.isk)}</td>
      <td style="font-size:12px">${r.required.length ? r.required.map(x => html`<div>${icon(x.typeId, 16)}${fmtNum(x.qty)}× ${x.name}</div>`) : html`<span class="dim">—</span>`}</td>
      <td>${r.system ? html`<a href="#" data-system="${r.system}">${r.system}</a> ${secBadge(r.security)}<div class="dim" style="font-size:11.5px">${r.station}</div>` : html`<span class="dim">no station found</span>`}</td>
      ${d.from ? html`<td class="right num">${r.jumps ?? '—'}</td>` : ''}<td><button class="btn btn-ghost" style="padding:1px 8px;font-size:11.5px" data-lp-open="${r.corpId}">LP store</button></td></tr>`)}</tbody></table></div>
    <div class="dim" style="font-size:12px;margin-top:6px">${d.rows.length} store${d.rows.length === 1 ? '' : 's'} sell ${fmtNum(d.rows[0].qty)}× ${d.name}.</div>`;
}

function wireAg() {
  document.querySelectorAll('[data-ag-dest]').forEach(b => b.onclick = async () => {
    const pilots = await api.ui.pilots(); const p = pilots.ok && pilots.data.find(x => x.canWaypoint);
    if (!p) return toast('Turn on In-game control in Settings to set destinations from here.', true);
    const r = await api.ui.waypoints(p.id, [Number(b.dataset.agDest)]);
    toast(r.ok ? `Destination set for ${p.name}` : r.error, !r.ok);
  });
  document.querySelectorAll('[data-lp-open]').forEach(b => b.onclick = () => { toolState.lp.corpId = Number(b.dataset.lpOpen); state.toolsTab = 't-lp'; go('tools'); });
}
