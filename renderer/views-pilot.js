'use strict';
/* Pilot Intel: look up any pilot, see their public record and a threat grade. */

const pilotState = { q: '', profile: null, loading: false };
const ZONE_LABEL = { hs: 'Highsec', ls: 'Lowsec', ns: 'Nullsec', wh: 'Wormholes', pochven: 'Pochven' };
const TAG_LABEL = { hostile: 'Hostile', ganker: 'Ganker', friendly: 'Friendly', note: 'Note only' };

function threatBadge(g, small) {
  if (!g) return '';
  return html`<span class="badge ${g.tone}" title="Threat score ${g.score}/100" style="${raw(small ? '' : 'font-size:12px')}">${g.level}${small ? '' : ' · ' + g.score}</span>`;
}
const flagChips = (flags, n = 99) => html`${(flags || []).slice(0, n).map(f => html`<span class="badge ${f.tone}" title="${f.why || ''}">${f.label}</span> `)}`;

function openPilot(q) {
  pilotState.q = String(q); pilotState.profile = null;
  state.toolsTab = 't-pilot';
  if (state.view !== 'tools') go('tools'); else { renderTopbar(); render(); }
  setTimeout(() => lookupPilot(false), 0);
}

async function tPilot() {
  const [rec, wl] = await Promise.all([api.pilot.recent(), api.pilot.watchlist()]);
  const recent = rec.ok ? rec.data : [], watch = wl.ok ? Object.entries(wl.data) : [];
  setContent(html`<div class="toolbar"><input type="search" id="pv-q" value="${pilotState.q}" placeholder="Pilot name or character ID" style="width:320px" spellcheck="false">
      <button class="btn btn-primary" id="pv-go">Look up</button><button class="btn btn-ghost" id="pv-refresh" ${raw(pilotState.profile ? '' : 'disabled')}>⟳ Fresh data</button>
      <span class="dim" style="font-size:12px">Public data from ESI and zKillboard. Results are kept for 6 hours.</span></div>
    <div id="pv-out">${pilotState.profile ? '' : html`<div class="grid grid-2" style="align-items:start">
      <div class="panel"><h3>Recent lookups</h3>${recent.length ? html`<table><tbody>${recent.map(r => html`<tr class="clickable" data-pv="${r.id}"><td>${charImg(r.id, 20)}${r.name}</td><td>${threatBadge(r, true)}</td><td class="right dim">${timeAgo(r.at)}</td></tr>`)}</tbody></table>` : html`<div class="muted">Nothing yet. Look up a pilot by name, or grade everyone in Local under Local &amp; D-scan.</div>`}</div>
      <div class="panel"><h3>Watchlist</h3>${watch.length ? html`<table><tbody>${watch.map(([id, w]) => html`<tr class="clickable" data-pv="${id}"><td>${charImg(id, 20)}${w.name}</td><td><span class="badge ${w.tag === 'friendly' ? 'accent' : w.tag === 'note' ? '' : 'red'}">${TAG_LABEL[w.tag]}</span></td><td class="muted" style="font-size:12px">${w.note}</td></tr>`)}</tbody></table>` : html`<div class="muted">Tag pilots as hostile, ganker or friendly from their profile. Tagged hostiles and gankers always alert when they turn up in intel or Local.</div>`}</div>
    </div>`}</div>`);
  if (pilotState.profile) drawPilot();
  $('#pv-go').onclick = () => lookupPilot(false);
  $('#pv-refresh').onclick = () => lookupPilot(true);
  $('#pv-q').onkeydown = e => { if (e.key === 'Enter') lookupPilot(false); };
  document.querySelectorAll('[data-pv]').forEach(r => r.onclick = () => { $('#pv-q').value = r.dataset.pv; lookupPilot(false); });
}

function timeAgo(iso) {
  if (!iso) return '';
  const m = (Date.now() - Date.parse(iso)) / 60000;
  return m < 60 ? Math.round(m) + 'm ago' : m < 2880 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago';
}

async function lookupPilot(refresh) {
  const box = $('#pv-out'); if (!box) return;
  const q = ($('#pv-q') ? $('#pv-q').value : pilotState.q).trim();
  if (!q) return toast('Enter a pilot name.', true);
  pilotState.q = q;
  box.innerHTML = String(loadingView(refresh ? 'Fetching fresh data…' : 'Checking ESI and zKillboard… (about 10 seconds for a new pilot)'));
  const r = await api.pilot.profile(q, { refresh });
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  pilotState.profile = r.data;
  const rb = $('#pv-refresh'); if (rb) rb.disabled = false;
  drawPilot();
}

function zoneRow(z) {
  return html`<div class="grid" style="grid-template-columns:repeat(5,1fr);gap:8px">${Object.entries(ZONE_LABEL).map(([k, l]) => { const v = z[k]; return html`<div class="tile" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2)">
    <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">${l}</div><div style="margin-top:3px"><span class="badge ${v.tone}">${v.level}</span></div>
    <div class="dim" style="font-size:11px;margin-top:4px">${v.share ? v.share + '% of kills' : 'no kills seen'}</div></div>`; })}</div>`;
}

function hourChart(activity) {
  if (!activity) return html`<div class="muted">No activity data on zKillboard.</div>`;
  const hours = Array(24).fill(0);
  for (let d = 0; d < 7; d++) { const row = activity[d] || activity[String(d)]; if (row) for (let h = 0; h < 24; h++) hours[h] += Number(row[h] || row[String(h)] || 0); }
  const max = Math.max(1, ...hours);
  if (max <= 1 && !hours.some(Boolean)) return html`<div class="muted">No activity data on zKillboard.</div>`;
  const peak = hours.indexOf(Math.max(...hours));
  return html`<div style="display:flex;align-items:flex-end;gap:3px;height:70px">${hours.map((v, h) => html`<div title="${String(h).padStart(2, '0')}:00 EVE: ${v} kills" style="flex:1;height:${raw(String(Math.max(3, Math.round(66 * v / max))))}px;background:${raw(h === peak ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 45%, transparent)')};border-radius:2px 2px 0 0"></div>`)}</div>
    <div style="display:flex;justify-content:space-between" class="dim"><span style="font-size:11px">00</span><span style="font-size:11px">06</span><span style="font-size:11px">12</span><span style="font-size:11px">18</span><span style="font-size:11px">23 EVE</span></div>
    <div class="muted" style="font-size:12px;margin-top:6px">Most active around <b>${String(peak).padStart(2, '0')}:00 EVE time</b> (${new Date(Date.UTC(2000, 0, 1, peak)).toLocaleTimeString([], { hour: 'numeric' })} your time).</div>`;
}

function killRows(list, loss) {
  if (!list.length) return html`<div class="muted" style="padding:10px 18px">${loss ? 'No recent losses.' : 'No recent kills.'}</div>`;
  return html`<table><thead><tr><th>When</th><th>${loss ? 'Lost' : 'Flying'}</th>${loss ? '' : raw('<th>Victim</th>')}<th>System</th><th class="right">Pilots</th><th class="right">Value</th><th></th></tr></thead><tbody>${list.map(k => html`<tr>
    <td class="dim nowrap">${timeAgo(k.time)}</td><td>${k.ship ? icon(k.ship, 18) : ''}${k.shipName || '?'}${k.concord ? raw(' <span class="badge red">CONCORD</span>') : ''}${k.cyno ? raw(' <span class="badge red">cyno fitted</span>') : ''}</td>
    ${loss ? '' : html`<td>${k.victimShip ? icon(k.victimShip, 18) : ''}${k.victimShipName || '?'}</td>`}
    <td>${k.system ? html`<a href="#" data-system="${k.system}">${k.system}</a>` : ''} ${k.zone ? html`<span class="dim">${ZONE_LABEL[k.zone]}</span>` : ''}</td><td class="right num">${k.solo ? raw('<span class="badge">solo</span>') : k.attackers}</td>
    <td class="right num">${k.value ? fmtCompact(k.value) : ''}</td><td><a href="#" data-link="https://zkillboard.com/kill/${k.id}/">zKill ↗</a></td></tr>`)}</tbody></table>`;
}

function drawPilot() {
  const p = pilotState.profile, box = $('#pv-out');
  if (!p || !box) return;
  const ageDays = p.birthday ? Math.floor((Date.now() - Date.parse(p.birthday)) / 86400000) : null;
  const st = p.stats;
  const w = p.watch || {};
  box.innerHTML = String(html`
    <div class="grid" style="grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px;align-items:start">
      <div class="panel"><div style="display:flex;gap:16px">
        <img src="${portrait(p.id, 256)}" width="108" height="108" style="border-radius:10px;border:1px solid var(--line-2);flex:none" alt="">
        <div style="min-width:0;flex:1"><div style="font-size:22px;font-weight:600">${p.name}</div>
          <div class="muted" style="margin-top:2px"><img src="${IMG}/corporations/${p.corporation.id}/logo?size=32" width="16" height="16" style="vertical-align:-3px;border-radius:3px" alt=""> ${p.corporation.name || ''} ${p.corporation.ticker ? html`[${p.corporation.ticker}]` : ''}
            ${p.alliance ? html` · <img src="${IMG}/alliances/${p.alliance.id}/logo?size=32" width="16" height="16" style="vertical-align:-3px;border-radius:3px" alt=""> ${p.alliance.name} &lt;${p.alliance.ticker}&gt;` : ''}</div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            ${p.security !== null ? html`<span class="badge ${p.security <= -5 ? 'red' : p.security < 0 ? 'gold' : 'green'}">Sec ${p.security.toFixed(2)}</span>` : ''}
            ${ageDays !== null ? html`<span class="badge">${ageDays < 365 ? ageDays + ' days old' : (ageDays / 365).toFixed(1) + ' years old'}</span>` : ''}
            <span class="badge">${p.corpChanges} corp${p.corpChanges === 1 ? '' : 's'}</span>
            ${p.corporation.npc ? raw('<span class="badge">NPC corp</span>') : ''}${p.corporation.warEligible ? raw('<span class="badge gold" title="Their corporation can be at war, so war targets may be around">War eligible</span>') : ''}
            ${p.standing !== null ? standingBadge(p.standing) : ''}</div>
          <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" data-link="https://evewho.com/character/${p.id}">EveWho ↗</button>
            <button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" data-link="https://zkillboard.com/character/${p.id}/">zKillboard ↗</button>
            <button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" id="pv-copy">Copy name</button>
            <button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" id="pv-info" title="Needs in-game control (Settings)">Show info in game</button>
            <button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" id="pv-vet">Recruit spy check</button></div></div></div>
        ${p.bio ? html`<div class="muted" style="font-size:12px;margin-top:12px;max-height:72px;overflow:auto;border-top:1px solid var(--line);padding-top:10px">${p.bio}</div>` : ''}
      </div>
      <div class="panel" style="border-color:${raw(p.tone === 'red' ? 'var(--red)' : p.tone === 'gold' ? 'var(--gold)' : 'var(--line)')}"><h3>Threat assessment</h3>
        <div style="display:flex;align-items:center;gap:16px">
          <div style="font-family:var(--font-num);font-size:44px;line-height:1;color:${raw(p.tone ? 'var(--' + p.tone + ')' : 'var(--text)')}">${p.score}</div>
          <div><div style="font-size:18px;font-weight:600">${p.level} threat</div><div class="muted" style="font-size:12px">PvP ${p.pvpScore} · Highsec gank risk ${p.gankScore}</div></div></div>
        <div style="margin-top:10px">${flagChips(p.flags)}</div>
        <ul style="margin:10px 0 0;padding-left:18px;font-size:12.5px">${p.reasons.slice(0, 7).map(r => html`<li>${r.text}${r.pts ? html` <span class="dim">(${r.pts > 0 ? '+' : ''}${r.pts})</span>` : ''}</li>`)}</ul>
        ${p.zkError ? html`<div class="notice" style="margin:10px 0 0">zKillboard didn't answer (${p.zkError}), so this grade uses ESI data only.</div>` : ''}
      </div>
    </div>

    <div id="pv-vet-out"></div>
    <div class="panel"><h3>Threat by area of space</h3>${zoneRow(p.zones)}
      <div class="dim" style="font-size:12px;margin-top:8px">Weighted by where their recent kills happened. Highsec also includes the suicide-gank score.</div></div>

    <div class="grid grid-4" style="margin-bottom:16px">${st ? html`${stat('Kills', fmtNum(st.kills), `${fmtNum(st.solo)} solo`)}${stat('Losses', fmtNum(st.losses))}${stat('ISK destroyed', fmtCompact(st.iskDestroyed), `${fmtCompact(st.iskLost)} lost`)}${stat('Danger / gang', `${st.danger ?? '?'}% / ${st.gang ?? '?'}%`, p.lastKillAt ? 'Last kill ' + timeAgo(p.lastKillAt) : 'No recent kills')}` : stat('zKillboard', 'No data')}</div>

    <div class="grid grid-2" style="align-items:start">
      <div class="panel"><h3>Ships used on kills</h3>${p.topShips.length ? html`<table><tbody>${p.topShips.map(s => html`<tr><td>${icon(s.typeId, 20)}${s.name || s.typeId}</td><td class="muted">${s.group || ''}</td><td class="right num">${s.kills}</td></tr>`)}</tbody></table>` : html`<div class="muted">None seen.</div>`}</div>
      <div class="panel"><h3>Active hours</h3>${hourChart(st && st.activity)}</div>
    </div>

    <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Recent kills</h3></div><div class="table-wrap">${killRows(p.kills, false)}</div></div>
    <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Recent losses</h3></div><div class="table-wrap">${killRows(p.losses, true)}</div></div>

    <div class="grid grid-2" style="align-items:start">
      <div class="panel"><h3>Corporation history</h3><table><tbody>${p.history.map(h => html`<tr><td>${h.name}</td><td class="right dim">${h.start ? h.start.slice(0, 10) : ''}</td></tr>`)}</tbody></table></div>
      <div class="panel"><h3>Your notes</h3>
        ${field('Tag', html`<select id="pv-tag" class="crumb-select">${[['', 'Not tagged'], ['hostile', 'Hostile: always alert'], ['ganker', 'Ganker: always alert in highsec'], ['friendly', 'Friendly: never alert'], ['note', 'Note only']].map(([v, l]) => html`<option value="${v}" ${raw((w.tag || '') === v ? 'selected' : '')}>${l}</option>`)}</select>`)}
        ${field('Note', html`<textarea id="pv-note" rows="3" style="width:100%" placeholder="e.g. Cyno alt for the Uedama gank fleet">${w.note || ''}</textarea>`)}
        <button class="btn btn-primary" id="pv-save">Save to watchlist</button>
        <div class="dim" style="font-size:12px;margin-top:8px">Stored on this PC only.</div></div>
    </div>
    <div class="dim" style="font-size:12px">Grades are estimates from public killboard data and your own standings. A quiet record can still hide an alt. Checked ${timeAgo(p.at)}${p.cached ? ' (cached)' : ''}.</div>`);
  $('#pv-copy').onclick = async () => { await api.copy(p.name); toast('Copied'); };
  $('#pv-info').onclick = () => openInGame('info', p.id);
  $('#pv-vet').onclick = async () => { const o = $('#pv-vet-out'); o.innerHTML = String(loadingView('Checking employment history and killboard…')); const r = await api.pilot.vet(p.id, state.directorId || null); o.innerHTML = String(r.ok ? vetView(r.data) : errorView(r)); };
  $('#pv-save').onclick = async () => {
    const r = await api.pilot.watch(p.id, p.name, $('#pv-tag').value || null, $('#pv-note').value);
    if (!r.ok) return toast(r.error, true);
    toast($('#pv-tag').value ? 'Saved to watchlist' : 'Removed from watchlist');
    lookupPilot(true);
  };
}


// ---------- Recruit spy check ----------
function vetView(v) {
  return html`<div class="panel" style="border-color:var(--${raw(v.tone === 'green' ? 'line' : v.tone)})"><h3>Recruit spy check</h3>
    <div style="display:flex;align-items:center;gap:14px"><div style="font-family:var(--font-num);font-size:38px;line-height:1;color:var(--${raw(v.tone)})">${v.risk}</div>
      <div><div style="font-size:17px;font-weight:600">${v.label}</div><div class="muted" style="font-size:12.5px">${v.advice}</div></div></div>
    <ul style="margin:10px 0 0;padding-left:18px;font-size:12.5px">${v.reasons.length ? v.reasons.map(r => html`<li><span style="color:var(--${raw(r.tone)})">${r.pts > 0 ? '▲' : '▼'}</span> ${r.text}</li>`) : html`<li>No warning signs found.</li>`}</ul>
    ${v.stays && v.stays.length ? html`<details style="margin-top:8px"><summary class="dim" style="cursor:pointer;font-size:12px">Time in each corp</summary><table style="margin-top:6px"><tbody>${v.stays.map(x => html`<tr><td>${x.name}${x.npc ? raw(' <span class="dim">NPC</span>') : ''}</td><td class="right num ${x.days < 30 && !x.npc ? 'neg' : ''}">${x.days < 60 ? x.days + ' days' : Math.round(x.days / 30) + ' months'}</td><td class="right dim">${x.start ? x.start.slice(0, 10) : ''}</td></tr>`)}</tbody></table></details>` : ''}
    <div class="dim" style="font-size:12px;margin-top:8px">Built from public records and your standings. Spies use clean alts too, so an audit and an interview still matter.</div></div>`;
}


// ---------- Wormhole residents ----------
const whResState = { q: '', result: null };
function tWhRes() {
  setContent(html`<div class="toolbar"><input type="search" id="wr-q" value="${whResState.q}" placeholder="Wormhole system, e.g. J123450" style="width:280px" spellcheck="false"><button class="btn btn-primary" id="wr-go">Check</button>
      <span class="dim" style="font-size:12px">Who shoots, dies and loses structures there, from zKillboard. Takes about 10 seconds.</span></div><div id="wr-out">${whResState.result ? '' : emptyBox('Check who lives in a wormhole before you roll into it, or before you move in.')}</div>`);
  if (whResState.result) drawWhRes();
  $('#wr-go').onclick = runWhRes;
  $('#wr-q').onkeydown = e => { if (e.key === 'Enter') runWhRes(); };
}
async function runWhRes() {
  const q = ($('#wr-q') ? $('#wr-q').value : whResState.q).trim(); if (!q) return toast('Enter a system name.', true);
  whResState.q = q; const box = $('#wr-out'); if (!box) return;
  box.innerHTML = String(loadingView('Reading zKillboard…'));
  const r = await api.whRes(q);
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  whResState.result = r.data; drawWhRes();
}
function drawWhRes(box = $('#wr-out'), d = whResState.result) {
  if (!box || !d) return;
  const max = Math.max(1, ...d.heat), peak = d.heat.indexOf(Math.max(...d.heat));
  const roleTone = { 'Likely resident': 'red', 'Possibly evicted': 'gold', 'Regular hunter': 'gold', 'Dies here often': '', 'Eviction or roam': '', Visitor: '' };
  box.innerHTML = String(html`<div class="panel"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
      <div><div style="font-size:20px;font-weight:600">${d.name} ${d.isWh ? html`<span class="badge" style="color:var(--purple);border-color:var(--purple)">${d.whClass >= 1 && d.whClass <= 6 ? 'C' + d.whClass : d.whClass === 12 ? 'Thera' : d.whClass === 13 ? 'C13' : 'Drifter'}</span>` : html`<span class="badge">${d.region}</span>`}</div>
        <div style="margin-top:4px;font-size:14px">${d.verdict}</div>${d.info ? whInfoHtml(d.info) : ''}</div>
      <div style="display:flex;gap:6px"><button class="btn btn-ghost" data-link="https://zkillboard.com/system/${d.id}/">zKillboard ↗</button></div></div></div>
    <div class="grid grid-4" style="margin-bottom:16px">${stat('Last kill', d.lastKill ? (d.quietDays ? d.quietDays + ' days ago' : 'today') : 'never', d.lastKill ? fmtDay(d.lastKill) : '', d.quietDays !== null && d.quietDays < 3 ? 'neg' : '')}${stat('Kills (30 days)', d.kills30, `${d.mailsChecked} recent kills checked`)}
      ${stat('Busiest time', d.tz[0] ? d.tz[0].tz : '—', d.tz[0] ? `${d.tz[0].pct}% of kills · peak ${String(peak).padStart(2, '0')}:00 ET` : '')}${stat('All-time kills', d.statsTotal ? fmtNum(d.statsTotal.kills) : '—', d.statsTotal ? fmtCompact(d.statsTotal.isk) + ' ISK destroyed' : '')}</div>
    <div class="grid" style="grid-template-columns:1.4fr 1fr;gap:16px;align-items:start">
      <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Groups seen here</h3></div>${d.groups.length ? html`<table><thead><tr><th>Group</th><th>Looks like</th><th class="right">Days active</th><th class="right">Kills / losses</th><th class="right">Pilots</th><th>Last seen</th><th>Time zone</th></tr></thead><tbody>
        ${d.groups.map(g => html`<tr><td><img src="${IMG}/${g.alliance ? 'alliances' : 'corporations'}/${g.id}/logo?size=32" width="18" height="18" style="vertical-align:-4px;margin-right:6px;border-radius:3px" alt="">${g.name}${g.structures.length ? html` <span class="badge gold" title="${g.structures.map(s => s.type).join(', ')}">lost ${g.structures.length} structure${g.structures.length > 1 ? 's' : ''}</span>` : ''}</td>
          <td><span class="badge ${roleTone[g.role]}">${g.role}</span></td><td class="right num">${g.daysActive}</td><td class="right num">${g.attacks} / ${g.losses}</td><td class="right num">${g.pilots}</td><td class="nowrap">${fmtDay(g.last)}</td><td class="muted" style="font-size:12px">${g.tz.tz}</td></tr>`)}</tbody></table>` : html`<div class="muted" style="padding:0 18px 14px">No player groups in recent kills.</div>`}</div>
      <div><div class="panel"><h3>Active hours (EVE time)</h3><div style="display:flex;align-items:flex-end;gap:3px;height:70px">${d.heat.map((v, h) => html`<div title="${String(h).padStart(2, '0')}:00 ET: ${v}" style="flex:1;height:${raw(String(Math.max(3, Math.round(66 * v / max))))}px;background:${raw(h === peak ? 'var(--purple)' : 'color-mix(in srgb, var(--purple) 45%, transparent)')};border-radius:2px 2px 0 0"></div>`)}</div>
          <div style="display:flex;justify-content:space-between" class="dim"><span style="font-size:11px">00</span><span style="font-size:11px">06</span><span style="font-size:11px">12</span><span style="font-size:11px">18</span><span style="font-size:11px">23</span></div>
          <div class="muted" style="font-size:12px;margin-top:6px">${d.tz.map(t => `${t.tz}: ${t.pct}%`).join(' · ')}</div></div>
        ${d.structureLosses.length ? html`<div class="panel"><h3>Structures lost here</h3>${d.structureLosses.map(s => html`<div class="skill-row" style="font-size:12.5px"><span>${s.type} <span class="dim">${s.owner}</span></span><span><a href="#" data-link="https://zkillboard.com/kill/${s.id}/">${fmtDay(s.time)}</a></span></div>`)}</div>` : ''}
        ${d.allTime.length ? html`<div class="panel"><h3>Most kills here, all time</h3>${d.allTime.slice(0, 6).map(a => html`<div class="skill-row" style="font-size:12.5px"><span>${a.name}</span><span class="num">${fmtNum(a.kills)}</span></div>`)}</div>` : ''}</div></div>
    <div class="dim" style="font-size:12px">A group that kills and dies here across several days is likely living here. A burst of structure kills over one or two days usually means an eviction. A group that keeps dying here without shooting back may be passing through, or may be residents who don't fight. Residents who never fight or die won't show up at all.</div>`);
}


// ---------- Wall of Shame ----------
const shameState = { period: 'day', scope: 'all', zone: 'all', cat: '', data: null, loading: false };
api.shame.onProgress(p => { const el = $('#sh-prog'); if (el) el.textContent = p.what === 'killmails' ? `Reading killmails ${p.i}/${p.n}…` : `Asking zKillboard ${p.i}/${p.n}…`; });

function tShame() {
  const s = shameState;
  const seg = (k, opts) => html`<div class="seg">${opts.map(([v, l]) => html`<button data-sh="${k}" data-v="${v}" class="${s[k] === v ? 'active' : ''}">${l}</button>`)}</div>`;
  setContent(html`<div class="toolbar">${seg('period', [['day', 'Last 24 hours'], ['week', 'Last 7 days']])}${seg('scope', [['all', 'Everyone'], ['mine', 'My corp & alliance']])}
      <select id="sh-zone" class="crumb-select">${[['all', 'All space'], ['hs', 'Highsec'], ['ls', 'Lowsec'], ['ns', 'Nullsec'], ['wh', 'Wormholes']].map(([v, l]) => html`<option value="${v}" ${raw(s.zone === v ? 'selected' : '')}>${l}</option>`)}</select>
      <button class="btn btn-primary" id="sh-go">${s.data ? '⟳ Refresh' : 'Load the wall'}</button><span class="dim" id="sh-prog" style="font-size:12px"></span></div>
    <div id="sh-out">${s.data ? '' : emptyBox('The most embarrassing recent losses: naked fits, mixed tanks, rainbow guns, autopiloting freighters, ships lost to rats and battleships solo’d by frigates. Loading takes up to a minute while the app reads the killmails.')}</div>`);
  document.querySelectorAll('[data-sh]').forEach(b => b.onclick = () => { s[b.dataset.sh] = b.dataset.v; tShame(); if (s.data) loadShame(); });
  $('#sh-zone').onchange = e => { s.zone = e.target.value; if (s.data) loadShame(); };
  $('#sh-go').onclick = loadShame;
  if (s.data) drawShame();
}

async function loadShame() {
  const s = shameState, box = $('#sh-out'); if (!box || s.loading) return;
  s.loading = true; box.innerHTML = String(loadingView('Digging through the killboard…'));
  const r = await api.shame.wall({ period: s.period, scope: s.scope, zone: s.zone });
  s.loading = false; const p = $('#sh-prog'); if (p) p.textContent = '';
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  s.data = r.data; drawShame();
}

function shameCard(k, rank) {
  return html`<div class="panel" style="display:grid;grid-template-columns:34px 64px 1fr auto;gap:12px;align-items:center;padding:12px 14px;margin-bottom:10px">
    <div style="font-family:var(--font-num);font-size:22px;color:${raw(rank <= 3 ? 'var(--gold)' : 'var(--dim)')};text-align:center">${rank}</div>
    <img src="${IMG}/types/${k.shipTypeId}/render?size=128" width="64" height="64" style="border-radius:6px;border:1px solid var(--line-2)" alt="">
    <div style="min-width:0"><div><b>${k.victim || 'Unknown pilot'}</b> lost a <b>${k.ship}</b> <span class="dim">· ${fmtCompact(k.value)} ISK${k.cargoValue > 5e8 ? ` (${fmtCompact(k.cargoValue)} in cargo)` : ''}</span></div>
      <div class="muted" style="font-size:12px">${k.corp || ''}${k.alliance ? ' · ' + k.alliance : ''} · ${k.system || ''} ${k.security !== null ? secBadge(k.security) : ''} · ${timeAgo(k.time)}${k.npc ? ' · killed by NPCs' : k.attackers === 1 && k.finalShip ? ` · solo by a ${k.finalShip}` : ` · ${k.attackers} attackers`}</div>
      <div style="margin-top:5px">${k.tags.map(t => html`<span class="badge ${t.pts >= 25 ? 'red' : 'gold'}" title="${t.why}">${t.label}</span> `)}${k.slots ? html`<span class="dim" style="font-size:11px">${k.fitted}/${k.slots} slots fitted</span>` : ''}</div></div>
    <div style="text-align:right;font-size:12px;white-space:nowrap"><div style="font-family:var(--font-num);font-size:18px">${k.score}</div><div class="dim">shame</div>
      <a href="#" data-link="https://zkillboard.com/kill/${k.id}/">zKill ↗</a>${k.victimId ? html` · <a href="#" data-pilot="${k.victimId}">Pilot</a>` : ''}<br><a href="#" data-sh-copy="${k.id}">Copy for Discord</a></div></div>`;
}

function drawShame() {
  const s = shameState, d = s.data, box = $('#sh-out'); if (!box || !d) return;
  const list = s.cat ? d.shame.filter(k => k.tags.some(t => t.id === s.cat)) : d.shame;
  box.innerHTML = String(html`<div class="pi-chips" style="margin-bottom:12px"><button class="badge ${s.cat ? '' : 'accent'}" data-sh-cat="">All (${d.shame.length})</button>${d.categories.map(c => html`<button class="badge ${s.cat === c.id ? 'accent' : ''}" data-sh-cat="${c.id}" title="${c.why}">${c.label} (${c.count})</button>`)}</div>
    <div class="grid" style="grid-template-columns:1fr 320px;gap:16px;align-items:start">
      <div><h3 class="mh">Hall of Shame</h3>${list.length ? list.slice(0, 25).map((k, i) => shameCard(k, i + 1)) : emptyBox('Nothing embarrassing found. Suspicious.')}</div>
      <div><div class="panel"><h3>Biggest oofs</h3>${d.oofs.slice(0, 8).map(k => html`<div class="skill-row" style="font-size:12.5px"><span>${icon(k.shipTypeId, 18)}${k.ship} <span class="dim">${k.victim || ''}</span></span><a href="#" data-link="https://zkillboard.com/kill/${k.id}/" class="num">${fmtCompact(k.value)}</a></div>`)}</div>
        <div class="panel"><h3>Repeat offenders</h3>${d.offenders.length ? d.offenders.map((p, i) => html`<div style="padding:5px 0;border-bottom:1px solid var(--line);font-size:12.5px"><div style="display:flex;justify-content:space-between"><span>${i + 1}. <a href="#" data-pilot="${p.id}">${p.name || p.id}</a></span><span class="num">${p.losses} loss${p.losses > 1 ? 'es' : ''} · ${fmtCompact(p.isk)}</span></div><div class="dim" style="font-size:11px">${p.tags.map(([l, n]) => `${l}${n > 1 ? ' ×' + n : ''}`).join(' · ')}</div></div>`) : html`<div class="muted">No repeat offenders yet.</div>`}</div>
        <div class="panel"><h3>Feeder ${d.scope === 'mine' ? 'groups' : 'corps & alliances'}</h3>${d.feeders.map(c => html`<div class="skill-row" style="font-size:12.5px"><span>${c.name || c.id}</span><span class="num">${c.losses} · ${fmtCompact(c.isk)}</span></div>`)}</div>
        <div class="dim" style="font-size:11.5px">From zKillboard losses ${d.period === 'week' ? 'over the last 7 days' : 'in the last 24 hours'}, judged on the fit in each killmail. Refreshes every 30 minutes. All in good fun: fly safe.</div></div></div>`);
  box.querySelectorAll('[data-sh-cat]').forEach(b => b.onclick = () => { s.cat = b.dataset.shCat; drawShame(); });
  box.querySelectorAll('[data-sh-copy]').forEach(a => a.onclick = async e => {
    e.preventDefault(); const k = d.shame.find(x => String(x.id) === a.dataset.shCopy) || d.oofs.find(x => String(x.id) === a.dataset.shCopy);
    await api.copy(`Wall of Shame: ${k.victim || 'Someone'} lost a ${k.ship} (${fmtCompact(k.value)} ISK) in ${k.system}. ${k.tags.map(t => t.label).join(', ')}. https://zkillboard.com/kill/${k.id}/`);
    toast('Copied');
  });
}
