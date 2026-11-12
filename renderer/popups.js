'use strict';
/* Quick-look popups: pilot, item, system, route, wormhole residents and fit check.
   Each opens over the current page so you don't lose your place. */

const popBtn = (label, attrs = '') => raw(`<button type="button" class="btn btn-ghost" style="padding:3px 10px;font-size:12px" ${attrs}>${label}</button>`);

function popShell(title, id, opts = {}) {
  const m = openModal(title, html`<div id="${id}">${loadingView(opts.loading || 'Loading…')}</div>`, { wide: opts.wide !== false, extraButtons: opts.extraButtons || '' });
  const foot = m.querySelector('.modal-foot [data-close]');
  if (foot) foot.textContent = 'Close';
  return m;
}
const popBox = id => { const m = document.getElementById('modal'); return m ? m.querySelector('#' + id) : null; };
function popFootButton(label, fn, primary) {
  const m = document.getElementById('modal'); if (!m) return;
  const foot = m.querySelector('.modal-foot'); const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn ' + (primary ? 'btn-primary' : 'btn-ghost'); b.textContent = label;
  b.onclick = () => { closeModal(); fn(); };
  foot.insertBefore(b, foot.firstChild);
}

// ---------- Pilot card ----------

async function openPilotCard(q, refresh) {
  popShell('Pilot', 'pop-pilot', { loading: 'Checking ESI and zKillboard… (about 10 seconds for a new pilot)' });
  popFootButton('Open full profile', () => openPilot(q), true);
  const r = await api.pilot.profile(String(q), { refresh: !!refresh });
  const box = popBox('pop-pilot'); if (!box) return;
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  const p = r.data, st = p.stats;
  const ageDays = p.birthday ? Math.floor((Date.now() - Date.parse(p.birthday)) / 86400000) : null;
  const recent = [...(p.kills || []).map(k => ({ ...k, loss: false })), ...(p.losses || []).map(k => ({ ...k, loss: true }))]
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 6);
  const m = document.getElementById('modal'); if (m) m.querySelector('.modal-head h2').textContent = p.name;
  box.innerHTML = String(html`<div style="display:flex;gap:16px;align-items:flex-start">
      <img src="${portrait(p.id, 256)}" width="96" height="96" style="border-radius:10px;border:1px solid var(--line-2);flex:none" alt="">
      <div style="flex:1;min-width:0">
        <div class="muted"><img src="${IMG}/corporations/${p.corporation.id}/logo?size=32" width="16" height="16" style="vertical-align:-3px;border-radius:3px" alt=""> ${p.corporation.name || ''} ${p.corporation.ticker ? html`[${p.corporation.ticker}]` : ''}
          ${p.alliance ? html` · <img src="${IMG}/alliances/${p.alliance.id}/logo?size=32" width="16" height="16" style="vertical-align:-3px;border-radius:3px" alt=""> ${p.alliance.name} &lt;${p.alliance.ticker}&gt;` : ''}</div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          ${p.security !== null ? html`<span class="badge ${p.security <= -5 ? 'red' : p.security < 0 ? 'gold' : 'green'}">Sec ${p.security.toFixed(2)}</span>` : ''}
          ${ageDays !== null ? html`<span class="badge">${ageDays < 365 ? ageDays + ' days old' : (ageDays / 365).toFixed(1) + ' years old'}</span>` : ''}
          <span class="badge">${p.corpChanges} corp${p.corpChanges === 1 ? '' : 's'}</span>
          ${p.corporation.npc ? raw('<span class="badge">NPC corp</span>') : ''}${p.corporation.warEligible ? raw('<span class="badge gold">War eligible</span>') : ''}
          ${p.standing !== null ? standingBadge(p.standing) : ''}${p.watch && p.watch.tag ? html`<span class="badge ${p.watch.tag === 'friendly' ? 'accent' : 'red'}">${TAG_LABEL[p.watch.tag]}</span>` : ''}</div>
        <div style="margin-top:8px">${flagChips(p.flags, 8)}</div>
        <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">${popBtn('EveWho ↗', `data-link="https://evewho.com/character/${p.id}"`)}${popBtn('zKillboard ↗', `data-link="https://zkillboard.com/character/${p.id}/"`)}${popBtn('Copy name', 'id="pop-pcopy"')}</div>
      </div>
      <div style="text-align:center;flex:none;min-width:110px;padding:8px 12px;border:1px solid ${raw(p.tone === 'red' ? 'var(--red)' : p.tone === 'gold' ? 'var(--gold)' : 'var(--line)')};border-radius:10px">
        <div style="font-family:var(--font-num);font-size:38px;line-height:1;color:${raw(p.tone ? 'var(--' + p.tone + ')' : 'var(--text)')}">${p.score}</div>
        <div style="font-weight:600;margin-top:4px">${p.level} threat</div><div class="dim" style="font-size:11px">PvP ${p.pvpScore} · gank ${p.gankScore}</div></div>
    </div>
    ${p.reasons.length ? html`<ul style="margin:12px 0 0;padding-left:18px;font-size:12.5px">${p.reasons.slice(0, 4).map(x => html`<li>${x.text}</li>`)}</ul>` : ''}
    ${st ? html`<div class="grid grid-4" style="margin:14px 0 0">${stat('Kills', fmtNum(st.kills), `${fmtNum(st.solo)} solo`)}${stat('Losses', fmtNum(st.losses))}${stat('ISK destroyed', fmtCompact(st.iskDestroyed))}${stat('ISK lost', fmtCompact(st.iskLost))}</div>` : ''}
    <div class="grid grid-2" style="align-items:start;margin-top:14px">
      <div><h3 class="mh">Ships used on kills</h3>${p.topShips.length ? p.topShips.slice(0, 5).map(s => html`<div class="skill-row" style="font-size:12.5px"><span>${icon(s.typeId, 18)}${s.name || s.typeId}</span><span class="num">${s.kills}</span></div>`) : html`<div class="muted">No kills on record.</div>`}</div>
      <div><h3 class="mh">Recent activity</h3>${recent.length ? recent.map(k => html`<div class="skill-row" style="font-size:12.5px"><span><span class="badge ${k.loss ? 'red' : 'green'}" style="min-width:34px;text-align:center">${k.loss ? 'loss' : 'kill'}</span> ${icon(k.loss ? k.ship : (k.victimShip || k.ship), 18)}${k.loss ? k.shipName : (k.victimShipName || k.shipName) || '?'} <span class="dim">${k.system ? html`in <a href="#" data-system="${k.system}">${k.system}</a>` : ''}</span></span>
          <span class="dim nowrap">${k.value ? fmtCompact(k.value) + ' · ' : ''}${timeAgo(k.time)}</span></div>`) : html`<div class="muted">Nothing recent.</div>`}</div>
    </div>
    ${p.zkError ? html`<div class="notice" style="margin:10px 0 0">zKillboard didn't answer (${p.zkError}), so this grade uses ESI data only.</div>` : ''}`);
  const cp = box.querySelector('#pop-pcopy'); if (cp) cp.onclick = async () => { await api.copy(p.name); toast('Name copied.'); };
}

// ---------- Item card ----------

async function openItemCard(typeId) {
  const id = Number(typeId); if (!id) return;
  popShell('Item', 'pop-item', { loading: 'Loading item…' });
  popFootButton('Open in item database', () => { itemState.pending = id; state.toolsTab = 't-items'; go('tools'); }, true);
  const r = await api.items.info(id);
  const box = popBox('pop-item'); if (!box) return;
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  const d = r.data;
  const m = document.getElementById('modal'); if (m) m.querySelector('.modal-head h2').textContent = d.name;
  const cats = Object.entries(d.attrs || {});
  const keyStats = []; for (const [, list] of cats) for (const a of list) { if (keyStats.length >= 12) break; keyStats.push(a); }
  box.innerHTML = String(html`<div style="display:flex;gap:14px;align-items:center">
      <img src="https://images.evetech.net/types/${d.id}/${raw(d.category === 'Ship' ? 'render' : 'icon')}?size=128" width="64" height="64" style="border-radius:8px;border:1px solid var(--line-2)" alt="">
      <div style="flex:1"><div class="muted">${d.group} · ${d.category}${d.meta ? ' · ' + d.meta : ''}</div>
        <div class="dim" style="font-size:12px;margin-top:3px">Volume ${fmtNum(d.volume)} m³ · type ID ${d.id}</div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${popBtn('Who can use it?', 'id="pop-ifly"')}${d.onMarket ? popBtn('Price alert', 'id="pop-ialert"') : ''}${popBtn('Copy name', 'id="pop-icopy"')}${popBtn('EVE Ref ↗', `data-link="https://everef.net/type/${d.id}"`)}</div></div></div>
    <div id="pop-ifly-out"></div>
    <div class="grid grid-2" style="align-items:start;margin-top:14px">
      <div>
        ${d.prices ? html`<h3 class="mh">Hub prices</h3>${d.prices.none ? html`<div class="dim">No hub orders. CCP average ${fmtCompact(d.prices.avg)} ISK.</div>` : html`<table><thead><tr><th>Hub</th><th class="right">Sell</th><th class="right">Buy</th></tr></thead><tbody>
          ${d.prices.map(p => html`<tr><td>${p.hub}</td><td class="right num">${p.sell !== null ? fmtCompact(p.sell) : '—'}</td><td class="right num muted">${p.buy !== null ? fmtCompact(p.buy) : '—'}</td></tr>`)}</tbody></table>`}` : html`<div class="dim">Not sold on the market.</div>`}
        ${d.matCost ? html`<div class="dim" style="font-size:12px;margin-top:6px">Materials to build one: about ${fmtCompact(d.matCost)} ISK</div>` : ''}
        ${d.requirements.length ? html`<h3 class="mh" style="margin-top:14px">Required skills</h3>${d.requirements.map(x => html`<div style="padding:2px 0;font-size:12.5px">${x.name} ${levelBoxes(x.level)} <span class="dim">${ROMAN[x.level]}</span></div>`)}` : ''}
      </div>
      <div>${keyStats.length ? html`<h3 class="mh">Key stats</h3><table><tbody>${keyStats.map(a => html`<tr><td class="muted">${a.name}</td><td class="right num">${a.text}</td></tr>`)}</tbody></table>
          ${cats.reduce((n, [, l]) => n + l.length, 0) > keyStats.length ? html`<div class="dim" style="font-size:12px;margin-top:6px">More in the item database.</div>` : ''}`
        : d.hasStats ? '' : html`<div class="dim" style="font-size:12px">Item stats need a game data refresh (Settings → Game data).</div>`}</div>
    </div>`);
  const al = box.querySelector('#pop-ialert'); if (al) al.onclick = () => openPriceAlertModal({ typeId: d.id, name: d.name });
  box.querySelector('#pop-icopy').onclick = async () => { await api.copy(d.name); toast('Name copied.'); };
  box.querySelector('#pop-ifly').onclick = async () => {
    const out = box.querySelector('#pop-ifly-out'); out.innerHTML = String(loadingView('Checking your pilots…'));
    const c = await api.canFly(d.id);
    if (!c.ok) { out.innerHTML = String(errorView(c)); return; }
    const nameOf = p => p.name || (state.characters.find(x => x.id === p.id) || {}).name || p.id;
    out.innerHTML = String(html`<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">${(c.data.pilots || []).filter(p => !p.error).map(p => html`<span class="badge ${p.canFly ? 'green' : ''}">${nameOf(p)}${p.canFly ? ' ✓ can use it' : ' · ' + fmtDuration(p.minutes * 60000, true) + ' of training'}</span>`)}</div>`);
  };
}

// ---------- System card ----------

/** 7 × 24 heatmap of kills by day and EVE hour, with the quietest and busiest hours. */
function activityHeat(a) {
  if (!a || !a.activity) return html`<div class="dim" style="font-size:12px">No kills on zKillboard for this system.</div>`;
  const g = a.activity, max = Math.max(1, ...g.flat());
  if (!g.flat().some(Boolean)) return html`<div class="dim" style="font-size:12px">No kills on zKillboard for this system.</div>`;
  const hours = Array.from({ length: 24 }, (_, h) => g.reduce((n, row) => n + row[h], 0));
  const peak = hours.indexOf(Math.max(...hours));
  const quiet = (() => { let best = 0, bestSum = Infinity; for (let h = 0; h < 24; h++) { const s = hours[h] + hours[(h + 1) % 24] + hours[(h + 2) % 24]; if (s < bestSum) { bestSum = s; best = h; } } return best; })();
  const local = h => new Date(Date.UTC(2000, 0, 1, h)).toLocaleTimeString([], { hour: 'numeric' });
  const cell = v => v ? `color-mix(in srgb, var(--red) ${Math.round(15 + 85 * v / max)}%, transparent)` : 'var(--bg-2)';
  return html`<div style="display:grid;grid-template-columns:30px repeat(24,1fr);gap:2px;font-size:10px">
      ${g.map((row, d) => html`<span class="dim" style="align-self:center">${a.days[d]}</span>${row.map((v, h) => html`<span title="${a.days[d]} ${String(h).padStart(2, '0')}:00 EVE: ${v} kills" style="height:12px;border-radius:2px;background:${raw(cell(v))}"></span>`)}`)}
      <span></span>${Array.from({ length: 24 }, (_, h) => html`<span class="dim" style="text-align:center">${h % 6 === 0 ? String(h).padStart(2, '0') : ''}</span>`)}</div>
    <div class="muted" style="font-size:12px;margin-top:6px">Busiest around <b>${String(peak).padStart(2, '0')}:00 EVE</b> (${local(peak)} your time). Quietest from <b>${String(quiet).padStart(2, '0')}:00 EVE</b> (${local(quiet)} your time) for three hours. From kills recorded on zKillboard.</div>`;
}

async function openSystemCard(q) {
  popShell('System', 'pop-sys', { loading: 'Loading system…' });
  const r = await api.systemCard(q);
  const box = popBox('pop-sys'); if (!box) return;
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  const s = r.data;
  const m = document.getElementById('modal'); if (m) m.querySelector('.modal-head h2').textContent = s.name;
  const k = s.kills;
  const planets = s.planets ? Object.entries(s.planets) : [];
  box.innerHTML = String(html`<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">
      ${s.wspace ? html`<span class="badge" style="color:var(--purple);border-color:var(--purple)">${s.wh ? s.wh.cls : 'Wormhole'}</span>` : html`<span style="font-size:18px">${secBadge(s.security)}</span>`}
      <span class="muted">${s.region} · ${s.constellation}</span>${s.pochven ? raw(' <span class="badge red">Pochven</span>') : ''}${s.sov ? html` <span class="dim">· held by ${s.sov.name}</span>` : ''}</div>
    ${k ? html`<div class="grid grid-4" style="margin:14px 0 0">${stat('Ship kills', fmtNum(k.ship), 'last hour', k.ship >= 5 ? 'neg' : '')}${stat('Pod kills', fmtNum(k.pod), 'last hour', k.pod >= 3 ? 'neg' : '')}${stat('NPC kills', fmtNum(k.npc), 'last hour')}${stat('Jumps', s.wspace ? '—' : fmtNum(s.jumps), s.wspace ? 'not reported in wormholes' : 'last hour')}</div>`
      : html`<div class="dim" style="margin-top:10px">Live kill numbers aren't available right now.</div>`}
    ${s.wh ? html`<div style="margin-top:12px">${whInfoHtml(s.wh)}</div>` : ''}
    <div class="grid grid-2" style="align-items:start;margin-top:14px">
      <div><h3 class="mh">Planets</h3>${planets.length ? html`<div style="display:flex;flex-wrap:wrap;gap:6px">${planets.map(([t, n]) => html`<span class="badge">${t} ×${n}</span>`)}</div>` : html`<div class="dim">${s.planets === null ? 'Needs a game data refresh.' : 'No planets.'}</div>`}</div>
      <div><h3 class="mh">Gates to</h3>${s.gates.length ? html`<div style="display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px">${s.gates.map(g => html`<span><a href="#" data-system="${g.id}">${g.name}</a> ${secBadge(g.security)}${g.region !== s.region ? html` <span class="dim">${g.region}</span>` : ''}</span>`)}</div>` : html`<div class="dim">${s.wspace ? 'No gates. Wormhole space.' : 'No gates.'}</div>`}</div>
    </div>
    <div id="pop-sact" style="margin-top:14px"><h3 class="mh">When it's busy</h3><div class="dim" style="font-size:12px">Loading kills by hour from zKillboard…</div></div>
    <div style="margin-top:14px;display:flex;gap:6px;flex-wrap:wrap">
      ${s.wspace ? '' : popBtn('Route here', 'id="pop-sroute"')}${s.wspace ? popBtn('Who lives here?', 'id="pop-swh"') : ''}${popBtn('System intel', 'id="pop-sintel"')}${popBtn('Live map', 'id="pop-smap"')}${popBtn('Set destination', 'id="pop-sdest"')}
      ${popBtn('zKillboard ↗', `data-link="https://zkillboard.com/system/${s.id}/"`)}${popBtn('Dotlan ↗', `data-link="https://evemaps.dotlan.net/system/${s.name.replace(/ /g, '_')}"`)}${s.wspace ? popBtn('anoik.is ↗', `data-link="https://anoik.is/systems/${s.name}"`) : ''}</div>`);
  api.systemActivity(s.id).then(a => { const el = box.querySelector('#pop-sact'); if (el) el.innerHTML = String(html`<h3 class="mh">When it's busy</h3>${a.ok ? activityHeat(a.data) : html`<div class="dim" style="font-size:12px">${a.error}</div>`}`); });
  const on = (sel, fn) => { const b = box.querySelector(sel); if (b) b.onclick = fn; };
  on('#pop-sintel', () => { closeModal(); siState.q = s.name; siState.data = null; state.toolsTab = 't-sysintel'; go('tools'); setTimeout(() => { const b = document.getElementById('si-go'); if (b) b.click(); }, 300); });
  on('#pop-sroute', () => openRouteCard(navState.from || '', s.name));
  on('#pop-swh', () => openWhResCard(s.name));
  on('#pop-smap', () => { closeModal(); mapState.regionId = s.regionId; mapState.sel = s.id; mapState.view = null; go('liveMap'); });
  on('#pop-sdest', () => setDestination(s.id));
}

// ---------- Route ----------

async function openRouteCard(from, to) {
  const m = openModal('Route', html`<div class="toolbar" style="margin:0">
      <input type="search" id="pop-rfrom" value="${from || ''}" placeholder="From" style="width:220px;min-width:0" spellcheck="false">
      <span class="dim">→</span><input type="search" id="pop-rto" value="${to || ''}" placeholder="To" style="width:220px;min-width:0" spellcheck="false">
      <select id="pop-rpref" class="crumb-select">${[['shortest', 'Shortest'], ['secure', 'Safer'], ['insecure', 'Less secure']].map(([v, l]) => html`<option value="${v}" ${raw(navState.pref === v ? 'selected' : '')}>${l}</option>`)}</select>
      <button type="button" class="btn btn-primary" id="pop-rgo">Plot</button></div>
    <div id="pop-route" style="margin-top:14px">${from && to ? '' : html`<div class="dim">Enter both ends and press Plot.</div>`}</div>`, { wide: true });
  const foot = m.querySelector('.modal-foot [data-close]'); if (foot) foot.textContent = 'Close';
  popFootButton('Open in route planner', () => { navState.from = m.querySelector('#pop-rfrom').value.trim(); navState.to = m.querySelector('#pop-rto').value.trim(); state.toolsTab = 't-route'; go('tools'); }, true);
  const run = () => plotRouteCard(m);
  m.querySelector('#pop-rgo').onclick = run;
  m.querySelectorAll('#pop-rfrom,#pop-rto').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  if (from && to) run(); else (from ? m.querySelector('#pop-rto') : m.querySelector('#pop-rfrom')).focus();
}

async function plotRouteCard(m) {
  const from = m.querySelector('#pop-rfrom').value.trim(), to = m.querySelector('#pop-rto').value.trim();
  const box = m.querySelector('#pop-route');
  if (!from || !to) { box.innerHTML = String(html`<div class="dim">Enter both ends and press Plot.</div>`); return; }
  box.innerHTML = String(loadingView('Plotting…'));
  const r = await api.nav.route(from, to, { pref: m.querySelector('#pop-rpref').value, avoid: navState.avoid, wormholes: navState.wormholes, thera: navState.thera });
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  const d = r.data, hot = d.path.filter(p => p.kills > 0);
  box.innerHTML = String(html`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:baseline">
      <span style="font-size:20px;font-family:var(--font-num)">${d.jumps} jumps</span>
      <span class="muted">${d.hs} highsec · ${d.ls} lowsec · ${d.ns} nullsec${d.shortcuts ? ` · ${d.shortcuts} shortcut${d.shortcuts === 1 ? '' : 's'}` : ''}</span></div>
    <div id="pop-rsafe" style="margin:10px 0">${loadingView(hot.length ? `Checking ${hot.length} system${hot.length === 1 ? '' : 's'} with recent kills…` : 'Checking…')}</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px 6px;font-size:12.5px;line-height:1.9">${d.path.map((p, i) => html`<span style="white-space:nowrap">${i ? raw('<span class="dim">›</span> ') : ''}<a href="#" data-system="${p.id}" style="color:${raw(SEC_COLOR(p.security))}" title="${p.name} ${(Math.round(p.security * 10) / 10).toFixed(1)}${p.kills ? ' · ' + p.kills + ' kills last hour' : ''}${p.viaLabel ? ' · via ' + p.viaLabel : ''}">${p.name}</a>${p.kills ? html`<sup class="neg" style="font-size:10px"> ${p.kills}</sup>` : ''}${p.via ? html` <span class="badge" style="font-size:10px">${p.viaLabel || p.via}</span>` : ''}</span>`)}</div>`);
  const safe = m.querySelector('#pop-rsafe');
  if (!hot.length) { safe.innerHTML = String(html`<span class="badge green">No kills on this route in the last hour</span>`); return; }
  const c = await api.nav.routeCheck(d.path.map(p => ({ id: p.id, kills: p.kills })), { hours: 1 });
  if (!safe.isConnected) return;
  if (!c.ok) { safe.innerHTML = String(errorView(c)); return; }
  const s = c.data, bad = s.reports.filter(x => x.hazards.some(z => z.severity !== 'info'));
  const tone = s.verdict === 'danger' ? 'red' : s.verdict === 'warn' ? 'gold' : 'green';
  safe.innerHTML = String(html`<span class="badge ${tone}">${s.verdict === 'danger' ? 'Active danger on this route' : s.verdict === 'warn' ? 'Recent trouble on this route' : 'No gate camps or ganking seen'}</span>
    ${bad.map(x => html`<div style="margin-top:6px;font-size:12.5px"><b><a href="#" data-system="${x.system}">${x.system}</a></b> <span class="dim">jump ${x.index}</span> ${x.hazards.filter(z => z.severity !== 'info').map(z => html`<span class="badge ${z.severity === 'danger' ? 'red' : 'gold'}">${HAZ_ICON[z.type] || '⚠'} ${z.title}</span> `)}</div>`)}`);
}

// ---------- Wormhole residents ----------

async function openWhResCard(name) {
  popShell(`Who lives in ${name}?`, 'pop-whres', { loading: 'Reading zKillboard… (about 10 seconds)' });
  popFootButton('Open full page', () => { whResState.q = name; state.toolsTab = 't-whres'; go('tools'); setTimeout(() => runWhRes(), 50); }, true);
  const r = await api.whRes(name);
  const box = popBox('pop-whres'); if (!box) return;
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  whResState.q = name; whResState.result = r.data;
  drawWhRes(box, r.data);
}

// ---------- Fit check ----------

document.addEventListener('click', e => { const b = e.target.closest('[data-killfit]'); if (b) { e.preventDefault(); openKillFit(b.dataset.killfit); } });
async function openKillFit(killId) {
  popShell('Fit check', 'pop-fit', { loading: 'Reading the killmail…' });
  const r = await api.fit.fromKillmail(killId);
  if (!r.ok) { const b = popBox('pop-fit'); if (b) b.innerHTML = String(errorView(r)); return; }
  openFitCard(r.data);
}
async function openEsiFit(raw) {
  const r = await api.fit.fromEsi(raw);
  if (!r.ok) return toast(r.error, true);
  openFitCard(r.data);
}

function openSaveFitModal(d) {
  const pilots = state.characters.filter(c => !c.needsReauth);
  const ok = pilots.filter(c => c.canSaveFits);
  openModal('Save fit to the game', html`${field('Pilot', select('charId', pilots.map(c => [c.id, c.name + (c.canSaveFits ? '' : ' (not allowed yet)')]), (ok[0] || pilots[0] || {}).id))}
    ${field('Fitting name', inputText('name', d.name || d.ship, 'Up to 50 characters'))}${field('Description (optional)', textarea('description', '', 3))}
    ${ok.length ? '' : html`<div class="notice" style="margin:0">Saving fits needs the Sending option in Settings → In-game control, then re-authorising your pilots.</div>`}
    <div class="dim" style="font-size:12px">It appears in the pilot's saved fittings in game (Fitting window → Personal).</div>`, {
    submit: 'Save to game',
    onSubmit: async v => { const r = await api.fit.saveToGame(Number(v.charId), d.eft, v.name, v.description); if (!r.ok) { toast(r.error, true); return true; } toast(`Saved to ${r.data.pilot}'s fittings`); }
  });
}


async function openFitCard(eft) {
  popShell('Fit check', 'pop-fit', { loading: 'Checking the fit against your pilots…' });
  popFootButton('Open in fit checker', () => { fitState.text = eft; fitState.data = null; fitState.pending = true; state.toolsTab = 't-fit'; go('tools'); }, true);
  const r = await api.fit.check(eft);
  const box = popBox('pop-fit'); if (!box) return;
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  const m = document.getElementById('modal'); if (m) m.querySelector('.modal-head h2').textContent = `Fit check · ${r.data.name}`;
  drawFit(box, r.data);
}
