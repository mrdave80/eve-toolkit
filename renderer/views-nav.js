'use strict';
/* Navigation tools: route planner, jump planner, universe status. */

const navState = { from: '', to: '', pref: 'shortest', avoid: '', wormholes: true, thera: true, jfrom: '', jto: '', ship: 'Carrier / Dreadnought / FAX', jdc: 5, javoid: '' };
const SEC_COLOR = s => { const r = Math.round(s * 10) / 10; return r >= 0.9 ? '#2fefef' : r >= 0.7 ? '#48f048' : r >= 0.5 ? '#c5f05a' : r >= 0.3 ? '#e8b64c' : r > 0 ? '#ed8936' : '#f56565'; };
const secBadge = s => html`<span class="num" style="color:${SEC_COLOR(s)}">${(Math.round(s * 10) / 10).toFixed(1)}</span>`;

async function fillFromPilots(inputId) {
  const r = await api.nav.pilotLocations();
  if (!r.ok || !r.data.length) return toast('Could not read pilot locations.', true);
  const box = document.createElement('div');
  openModal('Use a pilot\'s location', html`${r.data.map(p => html`<button type="button" class="btn btn-ghost" style="display:block;width:100%;text-align:left;margin-bottom:6px" data-pick-sys="${p.system || ''}">${charImg(p.id, 20)}${p.name}: <b>${p.system || 'unknown'}</b></button>`)}`);
  document.querySelectorAll('[data-pick-sys]').forEach(b => b.onclick = () => { $(inputId).value = b.dataset.pickSys; closeModal(); });
}

async function tRoute() {
  const n = navState;
  { const jb = await api.bridges.list(); navState.jbCount = jb.ok ? jb.data.length : 0; }
  setContent(html`<div class="ind-layout"><div class="panel ind-form"><h3>Route</h3>
      ${field('From', html`<div style="display:flex;gap:6px"><input type="text" id="rt-from" value="${n.from}" placeholder="e.g. Jita"><button class="btn btn-ghost" id="rt-me" title="Use a pilot's location">⌖</button></div>`)}
      ${field('To', html`<input type="text" id="rt-to" value="${n.to}" placeholder="e.g. Amarr">`)}
      ${field('Preference', html`<select id="rt-pref">${[['shortest', 'Shortest'], ['safer', 'Safer (prefer high-sec)'], ['less', 'Less secure (avoid high-sec)']].map(([k, l]) => html`<option value="${k}" ${raw(n.pref === k ? 'selected' : '')}>${l}</option>`)}</select>`)}
      ${field('Avoid systems', html`<textarea id="rt-avoid" rows="3" class="mono-area" style="width:100%" placeholder="One per line, e.g. Uedama, Niarja">${n.avoid}</textarea>`)}
      ${checkbox('rt-wh', 'Use wormholes from my maps (not critical-mass ones)', n.wormholes)}
      ${checkbox('rt-thera', 'Use Thera & Turnur connections (EVE-Scout)', n.thera)}
      <div style="display:flex;align-items:center;gap:8px">${checkbox('rt-jb', `Use our jump bridges (${navState.jbCount ?? 0})`, n.bridges)}<button type="button" class="btn btn-ghost" style="padding:2px 8px;font-size:12px;margin-bottom:8px" id="rt-jbm">Manage</button></div>
      ${checkbox('rt-safe', 'Check the route for gate camps and ganking', n.safety !== false)}
      ${field('Look back', html`<select id="rt-hours" class="crumb-select">${[[1, 'Last hour (fast: hot systems only)'], [2, 'Last 2 hours (checks every system)'], [3, 'Last 3 hours (checks every system)']].map(([v, l]) => html`<option value="${v}" ${raw((n.hours || 1) === v ? 'selected' : '')}>${l}</option>`)}</select>`)}
      <button class="btn btn-primary" id="rt-go" style="width:100%">Find route</button></div>
    <div id="rt-out">${emptyBox('Plan a route across stargates, your mapped wormhole chain and public Thera/Turnur connections.')}</div></div>`);
  $('#rt-me').onclick = () => fillFromPilots('#rt-from');
  $('#rt-jbm').onclick = () => manageBridges();
  $('#rt-go').onclick = async () => {
    Object.assign(n, { from: $('#rt-from').value.trim(), to: $('#rt-to').value.trim(), pref: $('#rt-pref').value, avoid: $('#rt-avoid').value, wormholes: document.querySelector('[name="rt-wh"]').checked, thera: document.querySelector('[name="rt-thera"]').checked, bridges: document.querySelector('[name="rt-jb"]').checked, safety: document.querySelector('[name="rt-safe"]').checked, hours: Number($('#rt-hours').value) });
    const out = $('#rt-out'); out.innerHTML = String(loadingView('Routing…'));
    const r = await api.nav.route(n.from, n.to, { pref: n.pref, avoid: n.avoid.split(/[\n,]/).map(x => x.trim()).filter(Boolean), wormholes: n.wormholes, thera: n.thera, bridges: n.bridges });
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    const d = r.data;
    const danger = d.path.filter(p => p.kills >= 5);
    out.innerHTML = String(html`<div class="grid grid-4" style="margin-bottom:16px">${stat('Jumps', d.jumps, `${d.from.name} → ${d.to.name}`)}${stat('Security', `${d.hs} HS · ${d.ls} LS · ${d.ns} NS`)}
        ${stat('Shortcuts used', d.shortcuts, d.shortcuts ? 'Wormhole / Thera hops' : 'Gates only')}${stat('Hot systems', danger.length, '5+ kills in the last hour', danger.length ? 'neg' : 'pos')}</div>
      <div id="rt-safety"></div>
      <div class="route-strip">${d.path.map(p => html`<span class="rs" style="background:${SEC_COLOR(p.security)}" title="${p.name} ${p.security.toFixed(1)}${p.kills ? ' · ' + p.kills + ' kills' : ''}"></span>`)}</div>
      <div class="panel" style="padding:0"><table><thead><tr><th>#</th><th>System</th><th>Sec</th><th>Region</th><th>Via</th><th class="right">Kills (1h)</th><th class="right">NPC</th></tr></thead><tbody>
        ${d.path.map((p, i) => { const cells = html`<td class="dim">${i}</td><td><b><a href="#" data-system="${p.id}" style="color:inherit">${p.name}</a></b> <span class="rt-flag"></span></td><td>${secBadge(p.security)}</td><td class="muted">${p.region}</td>
          <td>${p.via === 'wormhole' ? html`<span class="badge accent">${p.viaLabel}</span>` : p.via === 'thera' ? html`<span class="badge" style="color:var(--purple);border-color:var(--purple)">${p.viaLabel}</span>` : p.via === 'bridge' ? html`<span class="badge gold">${p.viaLabel}</span>` : p.via ? raw('<span class="dim">gate</span>') : ''}</td>
          <td class="right num ${p.kills >= 5 ? 'neg' : p.kills ? 'gold' : 'dim'}">${p.kills || ''}</td><td class="right num dim">${p.npc || ''}</td>`;
          return p.kills ? xRow('rk' + p.id, cells, '', 7, { cls: p.kills >= 5 ? 'hot' : '', attrs: `data-rt-row="${p.id}"`, title: 'Click to see what died here', load: () => routeSystemKills(p) }) : html`<tr data-rt-row="${p.id}">${cells}</tr>`; })}</tbody></table></div>
      <div class="toolbar" style="margin-top:10px"><button class="btn btn-primary" id="rt-send">⌁ Send route to EVE</button><button class="btn btn-ghost" id="rt-dest">Set destination only</button><button class="btn btn-ghost" id="rt-copy">Copy system list</button></div>`);
    xOpenLazy();
    $('#rt-send').onclick = () => sendWaypoints(d.path);
    $('#rt-dest').onclick = () => setDestination(d.to.id);
    $('#rt-copy').onclick = () => api.copy(d.path.map(p => p.name).join('\n')).then(() => toast('Copied'));
    navState.lastRoute = d;
    api.overlay.setRoute({ path: d.path, from: d.from.name, to: d.to.name });
    if (n.safety) runRouteCheck(d, n.hours || 1);
    else $('#rt-safety').innerHTML = String(html`<div class="toolbar"><button class="btn btn-ghost" id="rt-check">Check route for gate camps and ganking</button></div>`), $('#rt-check').onclick = () => runRouteCheck(d, n.hours || 1);
  };
}

async function tJump() {
  const n = navState;
  const ships = await api.nav.ships();
  setContent(html`<div class="ind-layout"><div class="panel ind-form"><h3>Jump route</h3>
      ${field('From', html`<div style="display:flex;gap:6px"><input type="text" id="jp-from" value="${n.jfrom}"><button class="btn btn-ghost" id="jp-me" title="Use a pilot's location">⌖</button></div>`)}
      ${field('To', html`<input type="text" id="jp-to" value="${n.jto}">`)}
      ${field('Ship', html`<select id="jp-ship">${(ships.ok ? ships.data : []).map(s => html`<option ${raw(s === n.ship ? 'selected' : '')}>${s}</option>`)}</select>`)}
      ${field('Jump Drive Calibration', html`<select id="jp-jdc">${[0, 1, 2, 3, 4, 5].map(l => html`<option value="${l}" ${raw(l === n.jdc ? 'selected' : '')}>${ROMAN[l] || '0'}</option>`)}</select>`)}
      ${field('Avoid systems', html`<textarea id="jp-avoid" rows="2" class="mono-area" style="width:100%">${n.javoid}</textarea>`)}
      <button class="btn btn-primary" id="jp-go" style="width:100%">Plan jumps</button>
      <button class="btn btn-ghost" id="jp-range" style="width:100%;margin-top:8px">Show systems in range of "From"</button></div>
    <div id="jp-out">${emptyBox('Plan the fewest jumps for capitals, black ops and jump freighters. Destinations must be low-sec or null-sec.')}</div></div>`);
  $('#jp-me').onclick = () => fillFromPilots('#jp-from');
  const read = () => Object.assign(n, { jfrom: $('#jp-from').value.trim(), jto: $('#jp-to').value.trim(), ship: $('#jp-ship').value, jdc: Number($('#jp-jdc').value), javoid: $('#jp-avoid').value });
  $('#jp-go').onclick = async () => {
    read();
    const out = $('#jp-out'); out.innerHTML = String(loadingView('Calculating jump chain…'));
    const r = await api.nav.jump(n.jfrom, n.jto, { ship: n.ship, jdc: n.jdc, avoid: n.javoid.split(/[\n,]/).map(x => x.trim()).filter(Boolean) });
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    const d = r.data;
    out.innerHTML = String(html`<div class="grid grid-4" style="margin-bottom:16px">${stat('Jumps', d.jumps, `${d.from} → ${d.to}`)}${stat('Range', d.range.toFixed(2) + ' LY', `${d.ship}, JDC ${ROMAN[d.jdc] || '0'}`)}
        ${stat('Total distance', d.totalLy.toFixed(2) + ' LY')}${stat('Fatigue at arrival', fmtDuration(d.finalFatigueMin * 60000, true), `≈ ${fmtDuration(d.waitMin * 60000, true)} of jump timers on the way (estimate)`, d.finalFatigueMin > 120 ? 'gold' : '')}</div>
      <div class="panel" style="padding:0"><table><thead><tr><th>#</th><th>From</th><th>To</th><th>Sec</th><th>Region</th><th class="right">Distance</th><th class="right">Wait before next</th><th class="right">Fatigue after</th></tr></thead><tbody>
        ${d.legs.map((l, i) => html`<tr><td class="dim">${i + 1}</td><td>${l.from}</td><td><b>${l.to}</b></td><td>${secBadge(l.security)}</td><td class="muted">${l.region}</td><td class="right num">${l.ly.toFixed(2)} LY</td>
          <td class="right num">${fmtDuration(l.reactivationMin * 60000, true)}</td><td class="right num">${fmtDuration(l.fatigueMin * 60000, true)}</td></tr>`)}</tbody></table></div>
      <div class="dim" style="font-size:12px;margin-top:8px">Fatigue uses the standard formula with the 5-hour cap; jump freighters and Rorquals get the 90% distance reduction. Treat timers as estimates.</div>`);
  };
  $('#jp-range').onclick = async () => {
    read();
    const sh = (await api.nav.ships());
    const out = $('#jp-out'); out.innerHTML = String(loadingView('Finding systems in range…'));
    const base = { 'Carrier / Dreadnought / FAX': 3.5, 'Supercarrier / Titan': 3.0, 'Black Ops': 4.0, 'Jump Freighter': 5.0, 'Rorqual': 5.0, 'Lancer Dreadnought': 3.5 }[n.ship] || 3.5;
    const ly = base * (1 + 0.2 * n.jdc);
    const r = await api.nav.range(n.jfrom, ly);
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    out.innerHTML = String(html`<div class="muted" style="margin-bottom:10px">${r.data.length} cyno-able systems within ${ly.toFixed(2)} LY of ${n.jfrom}</div><div class="panel" style="padding:0"><div class="table-wrap" style="max-height:70vh"><table><tbody>
      ${r.data.map(s => html`<tr><td><b>${s.name}</b></td><td>${secBadge(s.security)}</td><td class="muted">${s.region}</td><td class="right num">${s.ly.toFixed(2)} LY</td></tr>`)}</tbody></table></div></div>`);
  };
}

async function tUniverse(stillCurrent) {
  setContent(loadingView('Loading universe status…'));
  const r = await api.nav.universe();
  if (stillCurrent && !stillCurrent()) return;
  if (!r.ok) return setContent(errorView(r));
  const d = r.data;
  const now = Date.now();
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">${stat('Sov campaigns', d.campaigns.length, d.campaigns.filter(c => Date.parse(c.start) < now).length + ' running now')}${stat('Incursions', d.incursions.length)}
      ${stat('Thera / Turnur holes', d.thera.length, d.theraError || 'From EVE-Scout')}${stat('Contested FW systems', d.fw.filter(f => f.contested !== 'uncontested').length)}</div>
    <div class="grid grid-2">
      <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Thera & Turnur connections</h3></div><div class="table-wrap" style="max-height:420px">${d.thera.length ? html`<table><thead><tr><th>Hub</th><th>Connects to</th><th>Region</th><th>Sig</th><th>Size</th><th class="right">Left</th></tr></thead><tbody>
        ${d.thera.map(t => html`<tr><td>${t.hub}</td><td><b>${t.system}</b></td><td class="muted">${t.region}</td><td class="num">${t.sig}${t.hubSig ? html`<div class="dim">${t.hub}: ${t.hubSig}</div>` : ''}</td><td class="muted">${humanize(t.size)}</td><td class="right num">${t.hours !== null ? t.hours + 'h' : ''}</td></tr>`)}</tbody></table>` : html`<div class="muted" style="padding:14px 18px">${d.theraError || 'None listed'}</div>`}</div></div>
      <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Sovereignty campaigns</h3></div><div class="table-wrap" style="max-height:420px">${d.campaigns.length ? html`<table><thead><tr><th>System</th><th>Structure</th><th>Defender</th><th>Starts</th><th class="right">Score D/A</th></tr></thead><tbody>
        ${d.campaigns.map(c => html`<tr><td><b>${c.system}</b><div class="dim">${c.region}</div></td><td>${c.type}</td><td class="muted">${c.defender}</td><td class="nowrap">${Date.parse(c.start) > now ? countdownCell(c.start) : raw('<span class="badge red">Live</span>')}<div class="dim">${eveTime(c.start)}</div></td>
          <td class="right num">${c.defenderScore !== undefined ? Math.round(c.defenderScore * 100) + ' / ' + Math.round(c.attackersScore * 100) : ''}</td></tr>`)}</tbody></table>` : html`<div class="muted" style="padding:14px 18px">None</div>`}</div></div>
      <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Incursions</h3></div>${d.incursions.length ? html`<table><thead><tr><th>Staging</th><th>Region</th><th>State</th><th class="right">Systems</th><th class="right">Influence</th></tr></thead><tbody>
        ${d.incursions.map(i => html`<tr><td><b>${i.staging}</b></td><td class="muted">${i.region}</td><td><span class="badge ${i.state === 'mobilizing' ? 'gold' : i.state === 'withdrawing' ? '' : 'red'}">${humanize(i.state)}</span>${i.boss ? raw(' <span class="badge red">Boss</span>') : ''}</td>
          <td class="right num">${i.systems}</td><td class="right num">${Math.round(i.influence * 100)}%</td></tr>`)}</tbody></table>` : html`<div class="muted" style="padding:14px 18px">None</div>`}</div>
      <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Faction warfare (most contested)</h3></div><div class="table-wrap" style="max-height:420px"><table><thead><tr><th>System</th><th>Occupier</th><th style="width:160px">Contested</th></tr></thead><tbody>
        ${d.fw.slice(0, 60).map(f => html`<tr><td><b>${f.system}</b><div class="dim">${f.region}</div></td><td class="muted">${f.occupier}${f.owner !== f.occupier ? html`<div class="dim">owned by ${f.owner}</div>` : ''}</td>
          <td><div class="bar ${f.pct > 0.75 ? 'gold' : ''}" style="margin:4px 0"><i style="width:${Math.min(100, f.pct * 100).toFixed(1)}%"></i></div><span class="dim">${Math.round(f.pct * 100)}%</span></td></tr>`)}</tbody></table></div></div>
    </div>`);
}


// ---------- Route safety ----------
const HAZ_ICON = { camp: '⛔', undock: '⛔', gank: '☠', activity: '⚠' };
async function routeSystemKills(p) {
  const r = await api.nav.routeCheck([{ id: p.id, kills: p.kills }], { hours: 1 });
  if (!r.ok) throw new Error(r.error);
  const x = (r.data.reports || [])[0];
  if (!x) return html`<div class="dim">Only NPC or isolated kills in ${p.name} in the last hour.</div>`;
  return html`${x.hazards.length ? html`<div style="margin-bottom:6px">${x.hazards.map(z => html`<span class="badge ${z.severity === 'danger' ? 'red' : z.severity === 'warn' ? 'gold' : ''}" title="${z.detail}">${HAZ_ICON[z.type] || '⚠'} ${z.title}</span> `)}</div>` : ''}
    ${x.pilots && x.pilots.length ? html`<div style="margin-bottom:6px">${x.pilots.map(q => html`<a href="#" data-pilot="${q.id}" class="badge ${q.tone}" style="text-decoration:none">${q.name}</a> `)}</div>` : ''}
    ${x.kills && x.kills.length ? html`<table><tbody>${x.kills.map(k => html`<tr><td class="dim nowrap">${Math.round((Date.now() - Date.parse(k.time)) / 60000)}m ago</td><td>${icon(k.victimShip, 16)}${k.victimShipName || ''}${k.concord ? raw(' <span class="badge">CONCORD</span>') : ''}</td><td class="muted">${k.where || ''}</td><td class="right num">${k.attackers} attackers</td><td class="right num">${k.value ? fmtCompact(k.value) : ''}</td><td><a href="#" data-link="https://zkillboard.com/kill/${k.id}/">zKill ↗</a></td></tr>`)}</tbody></table>` : html`<div class="dim">No killmails found yet. zKillboard can lag a few minutes behind.</div>`}`;
}

async function runRouteCheck(d, hours) {
  const box = $('#rt-safety'); if (!box) return;
  const hot = d.path.filter(p => p.kills > 0).length;
  box.innerHTML = String(html`<div class="panel">${loadingView(hours > 1 ? `Checking ${Math.min(40, d.path.length)} systems on zKillboard (about ${Math.ceil(Math.min(40, d.path.length) * 1.3)} seconds)…` : hot ? `Checking ${hot} system${hot === 1 ? '' : 's'} with recent kills…` : 'No kills on this route in the last hour.')}</div>`);
  if (hours === 1 && !hot) { drawRouteSafety(d, { verdict: 'clear', reports: [], checked: 0, hours: 1 }); return; }
  const r = await api.nav.routeCheck(d.path.map(p => ({ id: p.id, kills: p.kills })), { hours });
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  drawRouteSafety(d, r.data);
}

function drawRouteSafety(d, s) {
  const box = $('#rt-safety'); if (!box) return;
  const bad = s.reports.filter(r => r.hazards.some(z => z.severity !== 'info'));
  const tone = s.verdict === 'danger' ? 'red' : s.verdict === 'warn' ? 'gold' : 'green';
  const headline = s.verdict === 'danger' ? 'Active danger on this route' : s.verdict === 'warn' ? 'Recent trouble on this route' : 'No gate camps or ganking seen';
  box.innerHTML = String(html`<div class="panel" style="border-color:var(--${raw(tone === 'green' ? 'line' : tone)})">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">Route safety · <span style="color:var(--${raw(tone)})">${headline}</span></h3>
      <div style="display:flex;gap:6px">${bad.length ? html`<button class="btn btn-primary" id="rt-avoid-bad">Avoid ${bad.length} system${bad.length === 1 ? '' : 's'} and re-route</button>` : ''}<button class="btn btn-ghost" id="rt-recheck">⟳ Re-check</button></div></div>
    <div class="dim" style="font-size:12px;margin:4px 0 10px">${s.hours === 1 ? `Checked the ${s.checked} system${s.checked === 1 ? '' : 's'} with kills in the last hour` : `Checked ${s.checked} systems over the last ${s.hours} hours`} using zKillboard. Camps can start after you check, so re-check before you undock.</div>
    ${s.reports.length ? s.reports.map(r => html`<div style="border-top:1px solid var(--line);padding:10px 0">
      <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><b><a href="#" data-system="${r.system}" style="color:inherit">${r.system}</a></b> ${r.security !== null && r.security !== undefined ? secBadge(r.security) : ''} <span class="dim">jump ${r.index}</span>
        ${r.groups && r.groups.length ? html`<span class="muted" style="font-size:12px">by ${r.groups.map(g => `${g.name} (${g.kills})`).join(', ')}</span>` : ''}</div>
      ${r.error ? html`<div class="dim">${r.error}</div>` : ''}
      ${r.hazards.map(z => html`<div style="margin-top:6px"><span class="badge ${z.severity === 'danger' ? 'red' : z.severity === 'warn' ? 'gold' : ''}">${HAZ_ICON[z.type] || '⚠'} ${z.title}</span>${z.onRoute ? raw(' <span class="badge red">on your route</span>') : ''}
        <div class="muted" style="font-size:12.5px;margin-top:3px">${z.detail}</div></div>`)}
      ${r.ships && r.ships.length ? html`<div style="margin-top:6px;font-size:12px" class="muted">Ships: ${r.ships.map(x => html`${icon(x.typeId, 16)}${x.name || x.typeId} ×${x.kills} `)}</div>` : ''}
      ${r.pilots && r.pilots.length ? html`<div style="margin-top:6px">${r.pilots.map(p => html`<a href="#" data-pilot="${p.id}" class="badge ${p.tone}" style="text-decoration:none" title="${p.flags.map(f => f.label).join(', ')}">${p.name}: ${p.level}</a> `)}</div>` : ''}
      ${r.kills && r.kills.length ? html`<details style="margin-top:6px"><summary class="dim" style="cursor:pointer;font-size:12px">${r.kills.length} recent kill${r.kills.length === 1 ? '' : 's'}</summary><table style="margin-top:6px"><tbody>${r.kills.map(k => html`<tr><td class="dim nowrap">${Math.round((Date.now() - Date.parse(k.time)) / 60000)}m ago</td><td>${icon(k.victimShip, 16)}${k.victimShipName || ''}${k.concord ? raw(' <span class="badge">CONCORD</span>') : ''}</td><td class="muted">${k.where}</td><td class="right num">${k.attackers}</td><td class="right num">${k.value ? fmtCompact(k.value) : ''}</td><td><a href="#" data-link="https://zkillboard.com/kill/${k.id}/">zKill ↗</a></td></tr>`)}</tbody></table></details>` : ''}
    </div>`) : html`<div class="muted">${s.checked ? 'Kills found were NPC or isolated, with no camps or ganks.' : 'Nobody has died on this route in the last hour.'}</div>`}
  </div>`);
  const hz = new Map();
  for (const r of s.reports) { const z = r.hazards.find(x => x.severity === 'danger') || r.hazards.find(x => x.severity === 'warn'); if (z) hz.set(r.systemId, { severity: z.severity, title: z.type === 'gank' ? 'gank' : z.type === 'activity' ? 'pvp' : 'camp' }); }
  api.overlay.setRoute({ path: d.path.map(p => ({ ...p, hazard: hz.get(p.id) || null })), from: d.from.name, to: d.to.name });
  for (const r of s.reports) {
    const row = document.querySelector(`[data-rt-row="${r.systemId}"] .rt-flag`); if (!row) continue;
    const z = r.hazards.find(x => x.severity === 'danger') || r.hazards.find(x => x.severity === 'warn');
    if (z) row.innerHTML = String(html`<span class="badge ${z.severity === 'danger' ? 'red' : 'gold'}">${HAZ_ICON[z.type] || '⚠'} ${z.type === 'gank' ? 'gank' : z.type === 'activity' ? 'pvp' : 'camp'}</span>`);
  }
  $('#rt-recheck').onclick = () => runRouteCheck(d, s.hours);
  const av = $('#rt-avoid-bad');
  if (av) av.onclick = () => {
    const n = navState;
    const skip = new Set([d.from.name, d.to.name]);
    const add = bad.map(r => r.system).filter(x => !skip.has(x));
    if (!add.length) return toast('The hot systems are your start or destination, so they can’t be avoided.', true);
    n.avoid = [...new Set([...n.avoid.split(/[\n,]/).map(x => x.trim()).filter(Boolean), ...add])].join('\n');
    $('#rt-avoid').value = n.avoid;
    $('#rt-go').click();
  };
}


// ---------- Courier contracts ----------
const courierState = { from: '', regions: [], maxPickup: 10, maxVolume: '', maxCollateral: '', minReward: '', secure: true, result: null, checks: {} };
async function tCourier() {
  const c = courierState;
  const rg = await api.couriers.regions();
  const regs = rg.ok ? rg.data : [];
  setContent(html`<div class="ind-layout"><div class="panel ind-form"><h3>Courier contracts</h3>
      ${field('Start from', html`<div style="display:flex;gap:6px"><input type="text" id="cc-from" value="${c.from}" placeholder="e.g. Jita"><button class="btn btn-ghost" id="cc-me" title="Use a pilot's location">⌖</button></div>`)}
      ${field('Regions (up to 4)', html`<select id="cc-reg" multiple size="6" style="width:100%">${regs.map(r => html`<option value="${r.id}" ${raw(c.regions.includes(r.id) ? 'selected' : '')}>${r.name}</option>`)}</select>`, 'Leave empty for the start system’s region. Ctrl+click to pick several.')}
      <div class="grid grid-2">${field('Max jumps to pickup', html`<input type="number" id="cc-pick" value="${c.maxPickup}" min="0" max="60">`)}${field('Max volume m³', html`<input type="number" id="cc-vol" value="${c.maxVolume}" placeholder="e.g. 60000">`)}
        ${field('Max collateral ISK', html`<input type="number" id="cc-col" value="${c.maxCollateral}" placeholder="any">`)}${field('Min reward ISK', html`<input type="number" id="cc-rew" value="${c.minReward}" placeholder="any">`)}</div>
      ${checkbox('cc-secure', 'Highsec routes only', c.secure)}
      <button class="btn btn-primary" id="cc-go" style="width:100%">Find contracts</button>
      <div class="dim" style="font-size:12px;margin-top:8px">ISK per jump counts the jumps to the pickup plus the delivery route. Check a route before accepting. Busy highsec trade routes are where freighters get ganked.</div></div>
    <div id="cc-out">${c.result ? '' : emptyBox('Find public courier contracts near you, ranked by ISK per jump, with a gank and camp check on each route.')}</div></div>`);
  if (c.result) drawCouriers();
  $('#cc-me').onclick = () => fillFromPilots('#cc-from');
  $('#cc-go').onclick = async () => {
    Object.assign(c, { from: $('#cc-from').value.trim(), regions: [...$('#cc-reg').selectedOptions].map(o => Number(o.value)).slice(0, 4), maxPickup: Number($('#cc-pick').value) || 10,
      maxVolume: $('#cc-vol').value, maxCollateral: $('#cc-col').value, minReward: $('#cc-rew').value, secure: document.querySelector('[name="cc-secure"]').checked, checks: {} });
    if (!c.from) return toast('Enter a start system.', true);
    $('#cc-out').innerHTML = String(loadingView('Loading public contracts (can take a little while for busy regions)…'));
    const r = await api.couriers.find({ from: c.from, regionIds: c.regions, maxPickup: c.maxPickup, maxVolume: c.maxVolume, maxCollateral: c.maxCollateral, minReward: c.minReward, secure: c.secure });
    if (!r.ok) { $('#cc-out').innerHTML = String(errorView(r)); return; }
    c.result = r.data; drawCouriers();
  };
}

function drawCouriers() {
  const c = courierState, d = c.result, box = $('#cc-out'); if (!box || !d) return;
  const chk = id => c.checks[id];
  box.innerHTML = String(html`<div class="grid grid-4" style="margin-bottom:14px">${stat('Contracts', d.shown, `of ${d.total} public couriers in ${d.regions.join(', ')}`)}${stat('Best ISK/jump', d.rows[0] ? fmtCompact(d.rows[0].iskPerJump) : '—')}
      ${stat('Highsec only', d.rows.filter(r => !r.leavesHs).length)}${stat('Unknown locations', d.unknownLoc, d.unknownLoc ? 'Private structures your pilots can’t see' : '')}</div>
    ${d.rows.length ? html`<div class="panel" style="padding:0"><div class="table-wrap" style="max-height:72vh"><table><thead><tr><th>Pickup</th><th>Deliver to</th><th class="right">Jumps</th><th class="right">Reward<div class="dim" style="font-weight:400">ISK/jump</div></th><th class="right">Collateral<div class="dim" style="font-weight:400">m³</div></th><th>Route safety</th></tr></thead><tbody>
      ${d.rows.map(r => xRow('cc' + r.id, html`
        <td><b>${r.from.system}</b> ${secBadge(r.from.security)}<div class="dim" style="max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11.5px" title="${r.from.name}">${r.pickupJumps}j away · ${r.from.name}</div></td>
        <td><b>${r.to.system}</b> ${secBadge(r.to.security)}<div class="dim" style="max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11.5px" title="${r.to.name}">${r.to.name}</div>${r.warn.map(w => html`<div class="gold" style="font-size:11px;max-width:170px">⚠ ${w}</div>`)}</td>
        <td class="right num">${r.jumps}${r.lowsecJumps ? html`<div class="neg" style="font-size:11px">${r.lowsecJumps} low/null</div>` : ''}</td>
        <td class="right num">${fmtCompact(r.reward)}<div><b>${fmtCompact(r.iskPerJump)}</b></div></td><td class="right num">${fmtCompact(r.collateral)}<div class="dim">${fmtNum(Math.round(r.volume))}</div></td>
        <td style="min-width:130px"><div id="cc-chk-${r.id}">${chk(r.id) ? courierCheckBadge(chk(r.id)) : html`<button class="btn btn-ghost" style="padding:2px 8px;font-size:12px" data-cc-check="${r.id}">Check route</button>`}</div>
          <div style="margin-top:4px;font-size:11.5px"><a href="#" data-cc-open="${r.id}" title="Needs in-game control">Open in game</a>${r.issuerId ? html` · <a href="#" data-pilot="${r.issuerId}" class="dim" title="Check the issuer before accepting">${r.issuer || 'issuer'}</a>` : ''}</div></td>`, '', 6, { title: 'Click to see the route system by system', load: () => courierRoute(r) }))}</tbody></table></div></div>
      <div class="toolbar" style="margin-top:10px"><button class="btn btn-ghost" id="cc-check-top">Check the top 5 routes</button></div>` : emptyBox('No courier contracts match these filters.')}`);
  xOpenLazy(box);
  const check = async id => {
    const r = d.rows.find(x => x.id === Number(id)); const cell = $('#cc-chk-' + id); if (!r || !cell) return;
    cell.innerHTML = String(raw('<span class="dim">checking…</span>'));
    const res = await api.nav.routeCheck(r.path.map(pid => ({ id: pid })), { hours: 1, fetchKills: true, grade: false });
    c.checks[id] = res.ok ? res.data : { error: res.error };
    cell.innerHTML = String(courierCheckBadge(c.checks[id]));
  };
  box.querySelectorAll('[data-cc-check]').forEach(b => b.onclick = () => check(b.dataset.ccCheck));
  box.querySelectorAll('[data-cc-open]').forEach(b => b.onclick = e => { e.preventDefault(); openInGame('contract', b.dataset.ccOpen); });
  const top = $('#cc-check-top'); if (top) top.onclick = async () => { for (const r of d.rows.slice(0, 5)) if (!c.checks[r.id]) await check(r.id); };
}

async function courierRoute(r) {
  const res = await api.nav.route(r.from.system, r.to.system, { pref: 'shortest', wormholes: false, thera: false });
  if (!res.ok) throw new Error(res.error);
  const chk = courierState.checks[r.id];
  const hz = new Map(); if (chk && chk.reports) for (const x of chk.reports) hz.set(x.systemId, x.hazards.filter(z => z.severity !== 'info'));
  const path = res.data.path;
  return html`<div class="dim" style="font-size:12px;margin-bottom:6px">${path.length - 1} jumps from ${r.from.system} to ${r.to.system}${chk ? '' : '. Press "Check route" to flag camps and ganks on it.'}</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px 6px;font-size:12.5px;line-height:1.9">${path.map((p, i) => { const h = hz.get(p.id) || [];
      return html`<span style="white-space:nowrap">${i ? raw('<span class="dim">›</span> ') : ''}<a href="#" data-system="${p.id}" style="color:${raw(SEC_COLOR(p.security))}">${p.name}</a>${p.kills ? html`<sup class="neg" style="font-size:10px"> ${p.kills}</sup>` : ''}${h.map(z => html` <span class="badge ${z.severity === 'danger' ? 'red' : 'gold'}" title="${z.detail}">${HAZ_ICON[z.type] || '⚠'} ${z.title}</span>`)}</span>`; })}</div>
    <div class="dim" style="font-size:11.5px;margin-top:4px">Shortest gate route. Small red numbers are ship kills in the last hour.</div>`;
}

function courierCheckBadge(x) {
  if (x.error) return html`<span class="dim" title="${x.error}">failed</span>`;
  const hz = x.reports.flatMap(r => r.hazards.filter(z => z.severity !== 'info').map(z => `${r.system}: ${z.title}`));
  return x.verdict === 'clear' ? raw('<span class="badge green">Clear (1h)</span>')
    : html`<span class="badge ${x.verdict === 'danger' ? 'red' : 'gold'}" title="${hz.join('\n')}">${x.verdict === 'danger' ? '☠ Danger' : '⚠ Trouble'}</span><div class="dim" style="font-size:11px">${hz[0] || ''}</div>`;
}


// ---------- Jump bridges ----------
async function manageBridges() {
  const cur = await api.bridges.list();
  const list = cur.ok ? cur.data : [];
  openModal('Alliance jump bridges', html`
    <div class="muted" style="margin-bottom:8px">Paste your alliance's Ansiblex list, one bridge per line. These formats all work:</div>
    <pre class="mono-area" style="margin:0 0 10px;padding:8px;background:var(--bg-2);border-radius:6px;font-size:12px">1DQ1-A » 8QT-H4 - Imperium Bridge
Y-2ANO &lt;-&gt; PR-8CN
K-6K16    1DQ1-A</pre>
    ${field('Bridges', textarea('jb', list.map(b => `${b.aName} » ${b.bName}`).join('\n'), 10))}
    <div class="dim" style="font-size:12px">Saved on this PC. ${list.length} bridge${list.length === 1 ? '' : 's'} saved now. Autopilot can't take bridges, so "Send route to EVE" stops before the first one.</div>`, {
    submit: 'Save bridges',
    onSubmit: async d => {
      const r = await api.bridges.parse(d.jb);
      if (!r.ok) throw new Error(r.error);
      const s = await api.bridges.save(r.data.bridges, 'replace');
      if (!s.ok) throw new Error(s.error);
      toast(`${s.data.length} jump bridge${s.data.length === 1 ? '' : 's'} saved${r.data.skipped.length ? `. Skipped ${r.data.skipped.length} line${r.data.skipped.length === 1 ? '' : 's'} without two system names, e.g. "${r.data.skipped[0]}"` : ''}`, r.data.skipped.length > 0);
      if (state.toolsTab === 't-route') tRoute();
    }
  });
}


// ---------- Hunting grounds & safe ratting ----------
const huntState = { from: '', jumps: 6, mode: 'hunt', zones: ['ls', 'ns'], bridges: false, result: null, deep: {} };
function tHunt() {
  const h = huntState;
  if (h.mode === 'camps' && !h.campsInit) { h.campsInit = true; h.zones = ['hs', 'ls', 'ns']; h.jumps = Math.max(h.jumps || 0, 8); }
  setContent(html`<div class="ind-layout"><div class="panel ind-form"><h3>Hunting &amp; ratting</h3>
      <div class="seg" style="margin-bottom:12px">${[['hunt', 'Hunting grounds'], ['rat', 'Safe ratting'], ['camps', 'Gate camps']].map(([k, l]) => html`<button data-hm="${k}" class="${h.mode === k ? 'active' : ''}">${l}</button>`)}</div>
      ${field('Near', html`<div style="display:flex;gap:6px"><input type="text" id="hn-from" value="${h.from}" placeholder="e.g. Tama"><button class="btn btn-ghost" id="hn-me" title="Use a pilot's location">⌖</button></div>`)}
      ${field('Within jumps', html`<input type="number" id="hn-j" value="${h.jumps}" min="1" max="15">`)}
      ${field('Space', html`<div class="pi-chips">${[['hs', 'Highsec'], ['ls', 'Lowsec'], ['ns', 'Nullsec']].map(([k, l]) => html`<label class="check" style="margin:0 12px 0 0"><input type="checkbox" data-hz="${k}" ${raw(h.zones.includes(k) ? 'checked' : '')}> ${l}</label>`)}</div>`)}
      ${checkbox('hn-jb', 'Use our jump bridges', h.bridges)}
      <button class="btn btn-primary" id="hn-go" style="width:100%">Search</button>
      <div class="dim" style="font-size:12px;margin-top:8px">${h.mode === 'camps' ? html`Lists gate and undock camps active right now, for when you want a fight. Checks the busiest systems in range on zKillboard, so it takes a few seconds. Jump clones near trade hubs make good launch points.` : h.mode === 'hunt' ? 'Ranks systems where NPCs are dying (ratters at work) but players aren’t, closer first. Dead ends and quiet systems rank higher.' : 'Ranks quiet systems with no player kills in the last hour and little traffic. Dead ends rank higher because hostiles can only come one way.'} Based on CCP’s hourly stats. Use <b>Check 3h</b> for a zKillboard look at the last 3 hours.</div></div>
    <div id="hn-out">${h.result ? '' : emptyBox(h.mode === 'camps' ? 'Find gate camps to fight near you or a trade hub.' : h.mode === 'hunt' ? 'Find active ratters nearby.' : 'Find quiet systems to rat in.')}</div></div>`);

  if (h.result && h.result.mode === h.mode) drawHunt();
  document.querySelectorAll('[data-hm]').forEach(b => b.onclick = () => { h.mode = b.dataset.hm; h.result = null; tHunt(); });
  $('#hn-me').onclick = () => fillFromPilots('#hn-from');
  $('#hn-go').onclick = async () => {
    Object.assign(h, { from: $('#hn-from').value.trim(), jumps: Number($('#hn-j').value) || 6, zones: [...document.querySelectorAll('[data-hz]:checked')].map(x => x.dataset.hz), bridges: document.querySelector('[name="hn-jb"]').checked, deep: {} });
    if (!h.from) return toast('Enter a system.', true);
    if (h.mode === 'camps') {
      $('#hn-out').innerHTML = String(loadingView('Checking the busiest systems on zKillboard…'));
      const c = await api.camps({ from: h.from, jumps: h.jumps, zones: h.zones, bridges: h.bridges });
      if (!c.ok) { $('#hn-out').innerHTML = String(errorView(c)); return; }
      h.result = { ...c.data, mode: 'camps' }; drawHunt(); return;
    }
    $('#hn-out').innerHTML = String(loadingView('Reading CCP’s hourly stats…'));
    const r = await api.hunt.find({ from: h.from, jumps: h.jumps, mode: h.mode, zones: h.zones, bridges: h.bridges });
    if (!r.ok) { $('#hn-out').innerHTML = String(errorView(r)); return; }
    h.result = r.data; drawHunt();
  };
}

function drawCamps(d, box) {
  box.innerHTML = String(html`<div class="muted" style="margin-bottom:10px">${d.rows.length} camp${d.rows.length === 1 ? '' : 's'} found · checked the ${d.checked} busiest of ${d.candidates} systems with kills in the last hour, within ${d.jumps} jumps of ${d.from}</div>
    ${d.rows.length ? html`<div class="panel" style="padding:0"><table><thead><tr><th>Where</th><th class="right">Jumps</th><th class="right">Kills</th><th class="right">Latest</th><th>Campers</th><th></th></tr></thead><tbody>
    ${d.rows.map((r, i) => xRow('camp' + i, html`<td><b><a href="#" data-system="${r.id}" style="color:inherit">${r.name}</a></b> ${secBadge(r.security)} <span class="muted">${r.where}</span>
        ${r.smartbomb ? raw(' <span class="badge red">smartbombs</span>') : ''}${r.bubbles ? raw(' <span class="badge gold">bubbles</span>') : ''}<div class="dim" style="font-size:11.5px">${r.region}</div></td>
      <td class="right num">${r.jumps}</td><td class="right num">${r.kills}</td><td class="right num ${r.latest <= 20 ? 'neg' : ''}">${r.latest} min ago</td>
      <td style="font-size:12px">${r.groups.slice(0, 2).map(g => g.name).join(', ')}<div class="dim">${r.ships.slice(0, 3).map(s => s.name).join(', ')}</div></td>
      <td class="nowrap" style="font-size:12px"><a href="#" data-hn-route="${r.name}">Route</a></td>`,
      html`<div class="grid grid-2" style="gap:14px"><div><b style="font-size:12px">Ships they fly</b>${r.ships.map(s => html`<div class="skill-row" style="font-size:12.5px"><span>${icon(s.typeId, 16)}${s.name}</span><span class="num">${s.kills} kill${s.kills === 1 ? '' : 's'}</span></div>`)}</div>
        <div><b style="font-size:12px">Recent kills</b>${r.recent.map(k => html`<div class="skill-row" style="font-size:12.5px"><span>${icon(k.victimShip, 16)}${k.victimShipName} <span class="dim">${k.where}</span></span><span class="num dim">${fmtCompact(k.value)} · ${k.attackers} attackers</span></div>`)}
        ${r.pilots.length ? html`<div style="margin-top:6px;font-size:12px">Check the campers: ${r.pilots.map(p => html`<a href="#" data-pilot="${p.id}">${p.name}</a> `)}</div>` : ''}</div></div>`, 6))}</tbody></table></div>`
    : emptyBox('No gate camps found in range right now. Try more jumps or check again in a few minutes.')}`);
  box.querySelectorAll('[data-hn-route]').forEach(a => a.onclick = e => { e.preventDefault(); openRouteCard(huntState.from, a.dataset.hnRoute); });
}

function drawHunt() {
  const h = huntState, d = h.result, box = $('#hn-out'); if (!box || !d) return;
  if (d.mode === 'camps') return drawCamps(d, box);
  box.innerHTML = String(html`<div class="muted" style="margin-bottom:10px">${d.rows.length} of ${d.checked} systems within ${d.jumps} jumps of ${d.from} · CCP stats from ${new Date(d.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    ${d.rows.length ? html`<div class="panel" style="padding:0"><div class="table-wrap" style="max-height:74vh"><table><thead><tr><th>System</th><th class="right">Jumps</th><th class="right">NPC kills</th><th class="right">Ships / pods</th><th class="right">Traffic</th><th>Sov</th><th style="width:22%">Why</th><th></th></tr></thead><tbody>
      ${d.rows.slice(0, 40).map(r => html`<tr><td><b><a href="#" data-system="${r.id}" style="color:inherit">${r.name}</a></b> ${secBadge(r.security)}${r.gates === 1 ? raw(' <span class="badge">dead end</span>') : ''}<div class="dim" style="font-size:11.5px">${r.region}</div>
          <div class="bar" style="margin-top:4px;max-width:120px"><i style="width:${r.pct}%"></i></div></td>
        <td class="right num">${r.jumps}</td><td class="right num ${r.npc ? 'pos' : 'dim'}">${r.npc}</td><td class="right num ${r.ship + r.pod ? 'neg' : 'dim'}">${r.ship} / ${r.pod}</td><td class="right num">${r.traffic}</td>
        <td class="muted" style="font-size:12px">${r.sovName || ''}</td><td class="muted" style="font-size:11.5px">${r.why.join(' · ')}</td>
        <td class="nowrap" style="font-size:12px"><span id="hn-deep-${r.id}">${h.deep[r.id] ? deepBadge(h.deep[r.id]) : html`<a href="#" data-hn-deep="${r.id}">Check 3h</a>`}</span><br><a href="#" data-hn-route="${r.name}">Route</a> · <a href="#" data-hn-map="${r.id}">Map</a></td></tr>`)}</tbody></table></div></div>`
    : emptyBox(h.mode === 'hunt' ? 'No ratting activity found in range in the last hour.' : 'No quiet systems in range. Try more jumps or another area.')}`);
  box.querySelectorAll('[data-hn-deep]').forEach(a => a.onclick = async e => {
    e.preventDefault(); const id = a.dataset.hnDeep; const cell = $('#hn-deep-' + id); cell.textContent = 'checking…';
    const r = await api.hunt.deep(Number(id), 3); h.deep[id] = r.ok ? r.data : { error: r.error }; cell.innerHTML = String(deepBadge(h.deep[id]));
  });
  box.querySelectorAll('[data-hn-route]').forEach(a => a.onclick = e => { e.preventDefault(); openRouteCard(h.from, a.dataset.hnRoute); });
  box.querySelectorAll('[data-hn-map]').forEach(a => a.onclick = e => { e.preventDefault(); const r = d.rows.find(x => x.id === Number(a.dataset.hnMap)); mapState.regionId = r.regionId; mapState.sel = r.id; mapState.view = null; go('liveMap'); });
}
const deepBadge = x => x.error ? html`<span class="dim" title="${x.error}">failed</span>` : x.kills ? html`<span class="badge red" title="${fmtCompact(x.value)} ISK destroyed">${x.kills} kill${x.kills > 1 ? 's' : ''} / 3h</span>` : raw('<span class="badge green">quiet 3h</span>');
