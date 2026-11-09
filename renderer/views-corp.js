'use strict';
/* Corp / alliance mode views. Helpers come from app.js and views-extra.js. */

const CORP_GROUPS = [
  ['Overview', [['c-overview', 'Overview']]],
  ['Members', [['c-members', 'Members'], ['c-compliance', 'Compliance'], ['c-audit', 'Member Audit']]],
  ['Structures', [['c-structures', 'Structures'], ['c-moons', 'Moons'], ['c-moontax', 'Moon Tax'], ['c-pos', 'POS & Customs']]],
  ['Finance', [['c-wallets', 'Wallets'], ['c-contracts', 'Contracts'], ['c-orders', 'Market'], ['c-buyback', 'Buyback']]],
  ['Industry', [['c-industry', 'Jobs'], ['c-assets', 'Assets'], ['c-blueprints', 'Blueprints']]],
  ['Doctrines', [['c-doctrines', 'Doctrines']]],
  ['Ops', [['c-ops', 'Op Calendar'], ['c-fleet', 'Fleet Tracker'], ['c-fats', 'Participation'], ['c-timers', 'Timerboard'], ['c-kills', 'Killboard']]],
  ['SRP', [['c-srp', 'SRP']]],
  ['Recruitment', [['c-hr', 'Applications']]],
  ['Discord', [['c-discord', 'Discord'], ['c-share', 'Share & Backup']]]
];
const corpGroupOf = tab => CORP_GROUPS.find(g => g[1].some(t => t[0] === tab)) || CORP_GROUPS[0];

const corpState = { directors: null, ws: null, fleetLive: null, srpFilter: 'pending', hrFilter: 'open', timerFilter: 'upcoming', walletDiv: 1, killFilter: 'all' };

// ---------- small helpers ----------

const eveTime = d => d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) + ' ET' : '—';
const bothTimes = d => d ? html`<span class="nowrap">${eveTime(d)}</span><div class="dim nowrap">${fmtDate(d)} local</div>` : '—';
const countdownCell = (d, cls = '') => {
  const t = Date.parse(d) - Date.now();
  return html`<span class="num nowrap ${cls}" ${raw(t > 0 ? `data-countdown="${esc(d)}"` : '')}>${t > 0 ? fmtDuration(t) : 'Passed'}</span>`;
};
const charImg = (id, size = 24) => html`<img src="${portrait(id, 64)}" width="${size}" height="${size}" style="vertical-align:-7px;margin-right:8px;border-radius:3px" alt="">`;
const ago = d => { if (!d) return '—'; const days = Math.floor((Date.now() - Date.parse(d)) / 86400000); return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + 'd ago'; };
const toUtcInput = d => new Date(d).toISOString().slice(0, 16);
const fromUtcInput = v => v ? new Date(v + ':00Z').toISOString() : null;
function sectionError(msg) { return msg ? html`<div class="notice">${msg}</div>` : ''; }

async function loadWs() { const r = await api.ws.get(); if (r.ok) corpState.ws = r.data; return corpState.ws; }

// ---------- modal ----------

function openModal(title, body, { submit = 'Save', onSubmit, wide = false, extraButtons = '' } = {}) {
  closeModal();
  const m = document.createElement('div');
  m.id = 'modal';
  m.innerHTML = String(html`<div class="modal-back"></div><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${title}</h2><button class="btn btn-ghost" data-close>✕</button></div>
    <form class="modal-body" autocomplete="off">${body}
      <div class="modal-foot">${raw(extraButtons)}<span style="flex:1"></span><button type="button" class="btn btn-ghost" data-close>Cancel</button>${onSubmit ? html`<button type="submit" class="btn btn-primary">${submit}</button>` : ''}</div>
    </form></div>`);
  document.body.appendChild(m);
  m.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  m.querySelector('.modal-back').onclick = closeModal;
  const form = m.querySelector('form');
  form.onsubmit = async e => {
    e.preventDefault();
    if (!onSubmit) return;
    const data = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll('input[type=checkbox]').forEach(c => { data[c.name] = c.checked; });
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try { const keep = await onSubmit(data, form); if (keep !== true) closeModal(); }
    catch (err) { toast(err.message || String(err), true); }
    finally { if (btn.isConnected) btn.disabled = false; }
  };
  const first = form.querySelector('input,select,textarea');
  if (first) first.focus();
  return m;
}
function closeModal() { const m = document.getElementById('modal'); if (m) m.remove(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

const field = (label, input, hint) => html`<div class="field"><label>${label}</label>${input}${hint ? html`<div class="dim" style="font-size:12px;margin-top:4px">${hint}</div>` : ''}</div>`;
const inputText = (name, value = '', ph = '') => html`<input type="text" name="${name}" value="${value}" placeholder="${ph}" spellcheck="false">`;
const inputNum = (name, value = '', ph = '') => html`<input type="number" name="${name}" value="${value}" placeholder="${ph}" step="any">`;
const select = (name, opts, value) => html`<select name="${name}">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return html`<option value="${v}" ${raw(String(v) === String(value) ? 'selected' : '')}>${l}</option>`; })}</select>`;
const textarea = (name, value = '', rows = 3) => html`<textarea name="${name}" rows="${rows}">${value}</textarea>`;
const checkbox = (name, label, checked) => html`<label class="check"><input type="checkbox" name="${name}" ${raw(checked ? 'checked' : '')}> ${label}</label>`;

async function ws(op, ...args) {
  const r = await api.ws[op](...args);
  if (!r.ok) throw new Error(r.error);
  if (r.data && r.data.__discordError) toast('Saved, but Discord post failed: ' + r.data.__discordError, true);
  return r.data;
}

// ================= Entry =================

async function renderCorp(stillCurrent) {
  if (!corpState.directors) {
    setContent(loadingView('Finding director pilots…'));
    const r = await api.corp.directors();
    corpState.directors = r.ok ? r.data : [];
  }
  await loadWs();
  if (!stillCurrent()) return;
  renderTopbar();
  const needsDirector = !['c-doctrines', 'c-ops', 'c-timers', 'c-fats', 'c-srp', 'c-hr', 'c-audit', 'c-discord', 'c-share', 'c-fleet'].includes(state.corpTab);
  if (!corpState.directors.length && needsDirector) {
    setContent(html`<div class="empty" style="max-width:640px;margin:0 auto"><h2>Set up corp mode</h2>
      <p>Corp mode reads your corporation's data through a <b>director pilot</b>: one of your characters logged in with the extra corp permissions.
      Most pages also need that character to hold the matching in-game role (Director for members and assets, Accountant for wallets, Station Manager for structures and moons).</p>
      <p class="muted">On your EVE developer application, also tick these scopes:</p>
      <div class="scopes" style="justify-content:center;margin-bottom:18px" id="corp-scopes"></div>
      <button class="btn btn-primary" data-action="add-director">+ Add director / FC pilot</button>
      <p class="dim" style="margin-top:18px">Ops, timers, SRP, recruitment and Discord work without a director. Use the tabs above.</p></div>`);
    const info = await api.info();
    if (info.ok) $('#corp-scopes').innerHTML = info.data.corpScopes.map(s => `<span class="badge">${esc(s)}</span>`).join('');
    return;
  }
  if (!state.directorId || !corpState.directors.some(d => d.id === state.directorId)) state.directorId = corpState.directors[0] ? corpState.directors[0].id : null;
  const d = state.directorId;
  const views = {
    'c-overview': () => withData(api.corp.overview(d), cOverview),
    'c-members': () => withData(api.corp.members(d), cMembers),
    'c-compliance': () => withData(api.corp.members(d), cCompliance),
    'c-audit': () => cAudit(),
    'c-structures': () => withData(Promise.all([api.corp.structures(d), api.corp.structureNotifications(d)]).then(([a, b]) => a.ok ? { ok: true, data: { ...a.data, notes: b.ok ? b.data : [] } } : a), cStructures),
    'c-moons': () => withData(api.corp.moons(d), cMoons),
    'c-pos': () => withData(api.corp.structures(d), cPos),
    'c-wallets': () => withData(api.corp.wallets(d, corpState.walletDiv), cWallets),
    'c-contracts': () => withData(api.corp.contracts(d), cContracts),
    'c-orders': () => withData(api.corp.orders(d), cOrders),
    'c-industry': () => withData(api.corp.industry(d), cIndustry),
    'c-assets': () => withData(api.corp.assets(d), cAssets, 'Loading corporation assets (can take a while)…'),
    'c-blueprints': () => withData(api.corp.assets(d), cBlueprints, 'Loading corporation blueprints…'),
    'c-doctrines': () => cDoctrines(),
    'c-moontax': () => cMoonTax(),
    'c-buyback': () => cBuyback(),
    'c-ops': () => cOps(),
    'c-fleet': () => cFleet(),
    'c-fats': () => cFats(),
    'c-timers': () => cTimers(),
    'c-kills': () => withData(api.corp.killmails(d), cKills, 'Loading corporation killmails…'),
    'c-srp': () => cSrp(),
    'c-hr': () => cHr(),
    'c-discord': () => cDiscord(),
    'c-share': () => cShare()
  };
  async function withData(promise, view, msg) {
    setContent(loadingView(msg));
    const r = await promise;
    if (!stillCurrent()) return;
    if (!r.ok) return setContent(errorView(r));
    view(r.data);
  }
  return (views[state.corpTab] || views['c-overview'])();
}

// ================= Overview =================

function cOverview(o) {
  const ws = corpState.ws;
  const now = Date.now();
  const upcomingOps = ws.ops.filter(x => Date.parse(x.start) > now - 3600000).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 5);
  const upcomingTimers = ws.timers.filter(x => Date.parse(x.time) > now - 3600000).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 5);
  const pendingSrp = ws.srp.filter(x => x.status === 'pending');
  const openApps = ws.hr.filter(x => !['accepted', 'rejected', 'withdrawn'].includes(x.status));
  setContent(html`
    <div class="profile"><img src="${IMG}/corporations/${o.corporationId}/logo?size=128" alt="" style="width:88px;height:88px">
      <div><h1>${o.name} <span class="muted" style="font-size:18px">[${o.ticker}]</span></h1>
        <div class="corp">${o.alliance ? html`${o.alliance.name} &lt;${o.alliance.ticker}&gt; · ${o.alliance.corps} corporations` : 'No alliance'}</div>
        <div class="tags"><span class="badge">CEO ${o.ceo}</span><span class="badge">Tax ${(o.taxRate * 100).toFixed(1)}%</span>
          ${o.founded ? html`<span class="badge">Founded ${fmtDay(o.founded)}</span>` : ''}
          <a href="#" class="badge" data-link="https://zkillboard.com/corporation/${o.corporationId}/">zKillboard ↗</a></div></div></div>
    ${sectionError(o.walletError)}${sectionError(o.structuresError)}
    <div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Members', fmtNum(o.memberCount))}
      ${stat('Corp wallets', o.walletTotal !== null ? fmtCompact(o.walletTotal) + ' ISK' : '—', o.walletTotal !== null ? fmtIsk(o.walletTotal) : '')}
      ${stat('Structures', o.structures.count, `${o.structures.lowFuel} under 7 days fuel · ${o.structures.reinforced} reinforced`, o.structures.lowFuel || o.structures.reinforced ? 'gold' : '')}
      ${stat('Waiting on you', `${pendingSrp.length} SRP · ${openApps.length} apps`, '', pendingSrp.length || openApps.length ? 'gold' : '')}
    </div>
    <div class="grid grid-2">
      <div class="panel"><h3>Upcoming ops</h3>${upcomingOps.length ? html`<table><tbody>${upcomingOps.map(op => html`<tr><td>${op.title}<div class="dim">${op.fc || ''} · ${op.doctrine || ''}</div></td><td class="right">${countdownCell(op.start)}<div class="dim">${eveTime(op.start)}</div></td></tr>`)}</tbody></table>` : html`<div class="muted">No ops scheduled</div>`}
        <div style="margin-top:10px"><button class="btn btn-ghost" data-ctab-go="c-ops">Op calendar →</button></div></div>
      <div class="panel"><h3>Upcoming timers</h3>${upcomingTimers.length ? html`<table><tbody>${upcomingTimers.map(t => html`<tr><td>${t.structure || t.type}<div class="dim">${t.system || ''} · ${t.timerType || ''} · ${t.objective || ''}</div></td><td class="right">${countdownCell(t.time, t.owner === 'Friendly' ? 'gold' : '')}<div class="dim">${eveTime(t.time)}</div></td></tr>`)}</tbody></table>` : html`<div class="muted">No timers</div>`}
        <div style="margin-top:10px"><button class="btn btn-ghost" data-ctab-go="c-timers">Timerboard →</button></div></div>
    </div>
    ${o.allianceCorps.length > 1 ? html`<div class="panel" style="margin-top:16px"><h3>Alliance corporations</h3><div class="skill-rows" style="padding:0">${o.allianceCorps.map(c => html`<div class="skill-row"><span><img src="${IMG}/corporations/${c.id}/logo?size=32" width="18" height="18" style="vertical-align:-4px;margin-right:6px" alt="">${c.name}</span></div>`)}</div></div>` : ''}`);
}

// ================= Members =================

function auditBadge(a) {
  if (!a) return raw('<span class="badge red">No audit</span>');
  if (a.source === 'live') return raw('<span class="badge green">Live</span>');
  const days = Math.floor((Date.now() - Date.parse(a.at)) / 86400000);
  return raw(`<span class="badge ${days > 30 ? 'gold' : 'accent'}">Audit ${days}d</span>`);
}

function cMembers(m) {
  corpState.memberList = m.list;
  let q = '';
  const draw = () => {
    const rows = m.list.filter(p => !q || p.name.toLowerCase().includes(q) || p.titles.join(' ').toLowerCase().includes(q));
    $('#mem-body').innerHTML = String(html`<table><thead><tr><th>Member</th><th>Titles</th><th class="right">Roles</th><th>Last login</th><th>Location / ship</th><th>Joined</th><th>Main</th><th>Audit</th><th>Discord</th></tr></thead><tbody>
      ${rows.map(p => html`<tr>
        <td class="nowrap">${charImg(p.id)}${p.name}</td>
        <td class="muted">${p.titles.join(', ')}</td>
        <td class="right">${p.roles.length ? html`<span class="badge" title="${p.roles.map(humanize).join(', ')}">${p.roles.length}${p.roles.includes('Director') ? ' · Dir' : ''}</span>` : ''}</td>
        <td class="nowrap ${p.inactiveDays > 30 ? 'gold' : ''}">${p.lastLogon ? ago(p.lastLogoff || p.lastLogon) : '—'}</td>
        <td class="muted">${p.location || ''}${p.ship ? html`<div class="dim">${p.ship}</div>` : ''}</td>
        <td class="nowrap muted">${p.joined ? fmtDay(p.joined) : ''}</td>
        <td><button class="btn btn-ghost pl-mini" data-setmain="${p.id}" data-dname="${p.name}">${corpState.ws.alts[p.id] ? 'alt of ' + ((m.list.find(x => x.id === corpState.ws.alts[p.id]) || {}).name || corpState.ws.alts[p.id]) : 'Main'}</button></td>
        <td>${auditBadge(p.audit)}</td>
        <td><button class="btn btn-ghost" style="padding:3px 9px" data-dlink="${p.id}" data-dname="${p.name}">${p.discord ? 'Linked' : 'Link'}</button></td></tr>`)}</tbody></table>`);
  };
  setContent(html`
    ${sectionError(m.trackingError)}${sectionError(m.rolesError)}
    <div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Members', fmtNum(m.list.length), m.limit ? 'Limit ' + fmtNum(m.limit) : '')}
      ${stat('Active 7 days', fmtNum(m.list.filter(p => p.inactiveDays !== null && p.inactiveDays <= 7).length))}
      ${stat('Audited', fmtNum(m.list.filter(p => p.audit).length), Math.round(m.list.filter(p => p.audit).length / Math.max(1, m.list.length) * 100) + '% of members')}
      ${stat('Linked to Discord', fmtNum(m.list.filter(p => p.discord).length))}
    </div>
    <div class="toolbar"><input type="search" id="mem-q" placeholder="Search members or titles…"></div>
    <div class="panel" style="padding:0"><div class="table-wrap" id="mem-body"></div></div>`);
  draw();
  $('#mem-q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
}

function linkDiscordModal(charId, name) {
  const cur = corpState.ws.discord.links[charId] || '';
  openModal(`Link ${name} to Discord`, html`
    ${field('Discord user ID', inputText('userId', cur, 'e.g. 284102391849582592'), 'In Discord: Settings → Advanced → Developer Mode, then right-click the member → Copy User ID. Leave blank to unlink.')}`,
    { onSubmit: async d => { const r = await api.discord.link(charId, d.userId); if (!r.ok) throw new Error(r.error); corpState.ws.discord.links = r.data; toast('Discord link saved'); render(); } });
}

function cCompliance(m) {
  const now = Date.now();
  const noAudit = m.list.filter(p => !p.audit);
  const stale = m.list.filter(p => p.audit && p.audit.source === 'import' && now - Date.parse(p.audit.at) > 30 * 86400000);
  const inactive = m.list.filter(p => p.inactiveDays !== null && p.inactiveDays > 30);
  const noDiscord = m.list.filter(p => !p.discord);
  const list = (title, rows, extra) => html`<div class="panel"><h3>${title} (${rows.length})</h3>
    ${rows.length ? html`<div class="skill-rows" style="padding:0">${rows.map(p => html`<div class="skill-row"><span>${charImg(p.id, 20)}${p.name}</span><span class="muted">${extra(p)}</span></div>`)}</div>` : html`<div class="pos">Everyone's covered</div>`}</div>`;
  const pct = Math.round((m.list.length - noAudit.length) / Math.max(1, m.list.length) * 100);
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Audit compliance', pct + '%', `${m.list.length - noAudit.length} of ${m.list.length} members`, pct < 80 ? 'gold' : 'pos')}
      ${stat('Missing audit', noAudit.length, '', noAudit.length ? 'gold' : '')}
      ${stat('Inactive 30+ days', inactive.length, '', inactive.length ? 'gold' : '')}
      ${stat('No Discord link', noDiscord.length)}
    </div>
    <div class="notice" style="background:var(--accent-dim);border-color:var(--accent-line);color:var(--text)">Members submit audits by running EVE Toolkit, opening their pilot's <b>Summary</b> and clicking <b>Export audit for corp</b>, then sending you the file. Import files under <b>Member Audit</b>.</div>
    <div class="grid grid-2">
      ${list('Missing audit', noAudit, p => p.lastLogon ? 'last on ' + ago(p.lastLogoff || p.lastLogon) : '')}
      ${list('Audit older than 30 days', stale, p => 'exported ' + ago(p.audit.at))}
      ${list('Inactive 30+ days', inactive, p => p.inactiveDays + ' days')}
      ${list('Not linked to Discord', noDiscord, () => '')}
    </div>`);
}

function cAudit() {
  const ws = corpState.ws;
  const audits = Object.values(ws.audits).sort((a, b) => a.character.name.localeCompare(b.character.name));
  setContent(html`
    <div class="toolbar"><button class="btn btn-primary" data-action="import-files">Import audit files…</button>
      <span class="muted">${audits.length} imported · pilots logged into this app are always live</span></div>
    ${audits.length ? html`<div class="panel" style="padding:0"><div class="table-wrap"><table><thead><tr><th>Pilot</th><th>Corporation</th><th class="right">Skill points</th><th class="right">SP/h</th><th class="right">Wallet</th><th class="right">Assets</th><th>Ship / location</th><th class="right">K / L</th><th>Exported</th><th></th></tr></thead><tbody>
      ${audits.map(a => { const s = a.summary; return html`<tr class="clickable" data-audit="${a.character.id}">
        <td class="nowrap">${charImg(a.character.id)}${a.character.name}</td><td class="muted">${a.character.corporation || ''}</td>
        <td class="right num">${fmtNum(s.totalSp)}</td><td class="right num">${s.spPerHour ? fmtNum(s.spPerHour) : '—'}</td>
        <td class="right num">${fmtCompact(s.wallet)}</td><td class="right num">${s.assetValue !== null ? fmtCompact(s.assetValue) : '—'}</td>
        <td class="muted">${s.ship || ''}<div class="dim">${s.system || ''}</div></td>
        <td class="right num">${s.kills ?? '—'} / ${s.losses ?? '—'}</td>
        <td class="nowrap">${ago(a.exportedAt)}</td>
        <td><button class="btn btn-danger" style="padding:3px 9px" data-unaudit="${a.character.id}">Remove</button></td></tr>`; })}</tbody></table></div></div>`
    : emptyBox('No audits imported yet. Ask members to export one from their pilot Summary page.')}`);
}

function auditDetail(id) {
  const a = corpState.ws.audits[id];
  if (!a) return;
  const s = a.summary;
  openModal(`${a.character.name}: audit`, html`
    <div class="dim" style="margin-bottom:12px">Exported ${fmtDate(a.exportedAt)} · ${a.character.corporation || ''}${a.character.alliance ? ' · ' + a.character.alliance : ''} · Sec ${a.character.securityStatus !== null && a.character.securityStatus !== undefined ? Number(a.character.securityStatus).toFixed(2) : '—'}</div>
    <div class="grid grid-4" style="margin-bottom:14px">
      ${stat('Skill points', fmtNum(s.totalSp), s.unallocatedSp ? fmtNum(s.unallocatedSp) + ' unallocated' : '')}
      ${stat('Wallet', fmtCompact(s.wallet) + ' ISK')}${stat('Assets', s.assetValue !== null ? fmtCompact(s.assetValue) + ' ISK' : '—')}
      ${stat('Training', s.training || 'Nothing', s.queueEnd ? 'Queue ends ' + fmtDay(s.queueEnd) : '')}
    </div>
    <div class="grid grid-2">
      <div><h3 class="mh">Skills by group</h3>${(a.skills || []).map(g => html`<details class="sgroup"><summary><span class="gname">${g.group}</span><span class="muted num">${fmtNum(g.sp)}</span></summary>
        <div class="skill-rows" style="grid-template-columns:1fr">${g.skills.map(k => html`<div class="skill-row"><span>${k.name}</span>${levelBoxes(k.level)}</div>`)}</div></details>`)}</div>
      <div><h3 class="mh">Assets (top locations)</h3>${(a.assets || []).map(l => html`<details class="sgroup"><summary><span class="gname">${l.location}</span><span class="muted num">${fmtCompact(l.value)}</span></summary>
          <div class="skill-rows" style="grid-template-columns:1fr">${l.top.map(i => html`<div class="skill-row"><span>${i.name} ×${fmtNum(i.quantity)}</span><span class="muted">${fmtCompact(i.value)}</span></div>`)}</div></details>`)}
        <h3 class="mh" style="margin-top:14px">Clones</h3>
        ${a.clones ? html`<div class="muted">Home: ${a.clones.home || '—'}</div>${(a.clones.jumpClones || []).map(j => html`<div style="margin-top:4px">${j.location} <span class="dim">${j.implants.length} implants</span></div>`)}` : html`<div class="muted">—</div>`}
        <h3 class="mh" style="margin-top:14px">Employment history</h3>
        ${(a.history || []).map(h => html`<div class="skill-row"><span>${h.corporation}</span><span class="dim">${fmtDay(h.start)} – ${h.end ? fmtDay(h.end) : 'now'}</span></div>`)}
      </div>
    </div>`, { wide: true });
}

// ================= Structures =================

function fuelCell(s) {
  if (s.fuelDays === null) return raw('<span class="badge red">No fuel / low power</span>');
  const cls = s.fuelDays < 3 ? 'neg' : s.fuelDays < 7 ? 'gold' : '';
  return html`<span class="num ${cls}">${s.fuelDays.toFixed(1)} days</span><div class="dim nowrap">${fmtDay(s.fuelExpires)}</div>`;
}

function cStructures(d) {
  const notes = (d.notes || []).slice(0, 25);
  setContent(html`${sectionError(d.error)}
    <div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Structures', d.structures.length)}
      ${stat('Under 7 days fuel', d.structures.filter(s => s.fuelDays !== null && s.fuelDays < 7).length, '', 'gold')}
      ${stat('No fuel', d.structures.filter(s => s.fuelDays === null).length, '', d.structures.some(s => s.fuelDays === null) ? 'neg' : '')}
      ${stat('Reinforced / vulnerable', d.structures.filter(s => /reinforce|armor|hull|vulnerable/.test(s.state || '')).length)}
    </div>
    <div class="panel" style="padding:0"><div class="table-wrap">${d.structures.length ? html`<table><thead><tr><th>Structure</th><th>System</th><th>State</th><th>Fuel</th><th>Services</th><th class="right">Reinforce hour</th></tr></thead><tbody>
      ${d.structures.map(s => html`<tr><td>${icon(s.typeId)}${s.name}<div class="dim">${s.type}</div></td><td>${s.system}</td>
        <td><span class="badge ${/reinforce|armor|hull/.test(s.state || '') ? 'red' : /low_power|abandoned|anchor|unanchored|fitting_invulnerable|onlining/.test(s.state || '') ? 'gold' : 'green'}">${humanize(s.state)}</span>${s.stateTimerEnd ? html`<div class="dim">Timer: ${countdownCell(s.stateTimerEnd)}</div>` : ''}${s.unanchorsAt ? html`<div class="gold">Unanchoring ${fmtDate(s.unanchorsAt)}</div>` : ''}</td>
        <td>${fuelCell(s)}</td>
        <td>${s.services.map(v => html`<span class="badge ${v.state === 'online' ? 'green' : 'red'}" style="margin:1px">${v.name}</span>`)}</td>
        <td class="right num">${s.reinforceHour !== null ? s.reinforceHour + ':00 ET' : ''}</td></tr>`)}</tbody></table>` : emptyBox('No Upwell structures')}</div></div>
    <div class="panel"><h3>Recent structure notifications (${d.notes ? d.notes.length : 0})</h3>
      ${notes.length ? html`<table><tbody>${notes.map(n => html`<tr><td class="nowrap">${fmtDate(n.timestamp)}</td><td>${n.typeLabel}</td><td>${n.system || ''}</td><td class="muted">${n.structureType || ''}</td>
        <td class="right">${n.canTimer ? html`<button class="btn btn-ghost" style="padding:3px 9px" data-note-timer="${n.id}">+ Timer (${eveTime(n.timerEnd)})</button>` : ''}</td></tr>`)}</tbody></table>` : html`<div class="muted">None</div>`}</div>`);
  corpState.lastNotes = d.notes || [];
}

function cMoons(d) {
  const now = Date.now();
  const upcoming = d.extractions.filter(e => Date.parse(e.decay) > now);
  setContent(html`${sectionError(d.error)}${sectionError(d.observerError)}
    <div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Active extractions', upcoming.length)}
      ${stat('Chunks ready', upcoming.filter(e => e.ready).length, '', upcoming.some(e => e.ready) ? 'gold' : '')}
      ${stat('Mining observers', d.observers.length)}
      ${stat('Ledger value', fmtCompact(d.ledgerTotal) + ' ISK', 'Recent observer ledgers at average ore prices')}
    </div>
    ${upcoming.length ? html`<div class="panel"><h3>Extraction schedule</h3>${timeline(upcoming.map(e => ({
      label: e.moon, segs: [
        { start: Math.max(Date.parse(e.start), now - 3600000), end: Date.parse(e.arrival), label: 'Extracting', title: `${e.structure}: arrives ${fmtDate(e.arrival)}` },
        { start: Date.parse(e.arrival), end: Date.parse(e.decay), cls: 'ind-reaction', label: 'Ready', title: `Auto-fracture ${fmtDate(e.decay)}` }]
    })), { from: now - 3600000, to: Math.max(...upcoming.map(e => Date.parse(e.decay))) })}</div>` : ''}
    <div class="panel" style="padding:0">${d.extractions.length ? html`<table><thead><tr><th>Moon</th><th>Refinery</th><th>Started</th><th>Chunk arrives</th><th>Auto-fracture</th></tr></thead><tbody>
      ${d.extractions.map(e => html`<tr><td>${e.moon}</td><td class="muted">${e.structure}</td><td class="nowrap">${fmtDay(e.start)}</td>
        <td>${e.ready ? raw('<span class="badge gold">Ready</span>') : countdownCell(e.arrival)}<div class="dim">${eveTime(e.arrival)}</div></td><td>${bothTimes(e.decay)}</td></tr>`)}</tbody></table>` : emptyBox('No moon extractions')}</div>
    <div class="panel"><h3>Moon miners (from observer ledgers)</h3>${d.miners.length ? html`<table><thead><tr><th>Pilot</th><th>Corporation</th><th class="right">Units</th><th class="right">Est. value</th></tr></thead><tbody>
      ${d.miners.map(p => html`<tr><td>${charImg(p.id, 20)}${p.name}</td><td class="muted">${p.corp}</td><td class="right num">${fmtNum(p.quantity)}</td><td class="right num">${fmtCompact(p.value)}</td></tr>`)}</tbody></table>` : html`<div class="muted">No ledger data</div>`}</div>`);
}

function cPos(d) {
  setContent(html`${sectionError(d.starbaseError)}
    <div class="panel"><h3>Control towers (POS)</h3>${d.starbases.length ? html`<table><thead><tr><th>Tower</th><th>Location</th><th>State</th><th>Reinforced until</th><th>Online since</th></tr></thead><tbody>
      ${d.starbases.map(p => html`<tr><td>${icon(p.typeId)}${p.type}</td><td>${p.moon || p.system}</td><td><span class="badge ${p.state === 'online' ? 'green' : p.state === 'reinforced' ? 'red' : 'gold'}">${humanize(p.state)}</span></td>
        <td>${p.reinforcedUntil ? bothTimes(p.reinforcedUntil) : ''}</td><td class="muted">${p.onlinedSince ? fmtDay(p.onlinedSince) : ''}</td></tr>`)}</tbody></table>` : html`<div class="muted">No control towers</div>`}</div>
    ${sectionError(d.customsError)}
    <div class="panel"><h3>Customs offices</h3>${d.customsOffices.length ? html`<table><thead><tr><th>System</th><th>Reinforce exit</th><th>Corp tax</th><th>Alliance tax</th><th>Alliance access</th><th>Standing access</th></tr></thead><tbody>
      ${d.customsOffices.map(c => html`<tr><td>${c.system}</td><td>${c.reinforceExit} ET</td><td class="num">${c.taxCorp !== null ? (c.taxCorp * 100).toFixed(1) + '%' : ''}</td><td class="num">${c.taxAlliance !== null ? (c.taxAlliance * 100).toFixed(1) + '%' : ''}</td>
        <td>${c.allowAlliance ? 'Yes' : 'No'}</td><td class="muted">${c.standingLevel ? humanize(c.standingLevel) : ''}</td></tr>`)}</tbody></table>` : html`<div class="muted">No customs offices</div>`}</div>`);
}

// ================= Finance =================

function cWallets(d) {
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">${stat('All divisions', fmtCompact(d.total) + ' ISK', fmtIsk(d.total))}
      ${d.divisions.slice(0, 3).map(w => stat(w.name, fmtCompact(w.balance) + ' ISK'))}</div>
    <div class="toolbar"><div class="seg">${d.divisions.map(w => html`<button data-wdiv="${w.division}" class="${d.division === w.division ? 'active' : ''}">${w.name} · ${fmtCompact(w.balance)}</button>`)}</div></div>
    ${sectionError(d.journalError)}
    <div class="panel" style="padding:0"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>From → To</th><th>Description</th><th class="right">Amount</th><th class="right">Balance</th></tr></thead><tbody>
      ${d.journal.map(j => html`<tr><td class="nowrap">${fmtDate(j.date)}</td><td class="nowrap">${humanize(j.ref_type)}</td>
        <td class="muted">${j.firstParty || ''}${j.secondParty ? ' → ' + j.secondParty : ''}</td><td>${j.description || ''}${j.reason ? html`<div class="dim">${j.reason}</div>` : ''}</td>
        <td class="right num nowrap ${j.amount < 0 ? 'neg' : 'pos'}">${j.amount !== undefined ? nf2.format(j.amount) : ''}</td><td class="right num nowrap">${j.balance !== undefined ? nf2.format(j.balance) : ''}</td></tr>`)}</tbody></table></div></div>`);
}

function cContracts(list) {
  let f = 'active';
  const draw = () => {
    const rows = list.filter(c => f === 'all' || ['outstanding', 'in_progress'].includes(c.status));
    setContent(html`<div class="toolbar"><div class="seg"><button data-ccf="active" class="${f === 'active' ? 'active' : ''}">Active</button><button data-ccf="all" class="${f === 'all' ? 'active' : ''}">All (${list.length})</button></div></div>
      <div class="panel" style="padding:0"><div class="table-wrap">${rows.length ? html`<table><thead><tr><th>Type</th><th>Title</th><th>Status</th><th>Issuer</th><th>To / By</th><th class="right">Price / Reward</th><th>Route</th><th>Expires</th></tr></thead><tbody>
      ${rows.map(x => html`<tr><td class="nowrap">${humanize(x.type)}</td><td>${x.title || ''}</td><td><span class="badge ${CONTRACT_STATUS[x.status] || ''}">${humanize(x.status)}</span></td>
        <td>${x.issuerName}</td><td>${x.acceptorName || x.assigneeName || ''}</td>
        <td class="right num nowrap">${x.price ? nf2.format(x.price) : ''}${x.reward ? html`<div class="pos">+${nf2.format(x.reward)}</div>` : ''}${x.collateral ? html`<div class="dim">Coll. ${fmtCompact(x.collateral)}</div>` : ''}</td>
        <td class="muted">${x.startName || ''}${x.endName && x.endName !== x.startName ? ' → ' + x.endName : ''}</td><td class="nowrap">${fmtDate(x.date_expired)}</td></tr>`)}</tbody></table>` : emptyBox('No contracts')}</div></div>`);
    document.querySelectorAll('[data-ccf]').forEach(b => b.onclick = () => { f = b.dataset.ccf; draw(); });
  };
  draw();
}

function cOrders(list) {
  const sell = list.filter(o => !o.is_buy_order), buy = list.filter(o => o.is_buy_order);
  const row = o => html`<tr><td>${icon(o.type_id)}${o.typeName}</td><td class="right num">${nf2.format(o.price)}</td><td class="right num">${fmtNum(o.volume_remain)} / ${fmtNum(o.volume_total)}</td>
    <td class="right num ${o.is_buy_order ? 'neg' : 'pos'}">${fmtCompact(o.price * o.volume_remain)}</td><td class="muted">${o.locationName}</td><td>${o.issuedBy || ''}</td><td class="muted">Div ${o.wallet_division}</td></tr>`;
  const table = rows => rows.length ? html`<table><thead><tr><th>Item</th><th class="right">Price</th><th class="right">Remaining</th><th class="right">Value</th><th>Location</th><th>Issued by</th><th>Wallet</th></tr></thead><tbody>${rows.map(row)}</tbody></table>` : emptyBox('None');
  setContent(html`<div class="grid grid-3" style="margin-bottom:16px">${stat('Sell orders', sell.length, fmtIsk(sell.reduce((n, o) => n + o.price * o.volume_remain, 0)))}${stat('Buy orders', buy.length, 'Escrow ' + fmtIsk(buy.reduce((n, o) => n + (o.escrow || 0), 0)))}</div>
    <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Selling</h3></div>${table(sell)}</div>
    <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Buying</h3></div>${table(buy)}</div>`);
}

// ================= Industry =================

function cIndustry(jobs) {
  const current = jobs.filter(j => ['active', 'paused', 'ready'].includes(j.status));
  const byAct = {};
  for (const j of current) byAct[j.activity] = (byAct[j.activity] || 0) + 1;
  const value = current.reduce((n, j) => n + (j.outputValue || 0), 0);
  const now = Date.now();
  const running = current.filter(j => j.status === 'active' && Date.parse(j.end) > now).slice(0, 25);
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">${stat('Running jobs', current.length, Object.entries(byAct).map(([k, v]) => `${v} ${k}`).join(' · '))}
      ${stat('Ready to deliver', current.filter(j => j.status === 'ready').length, '', 'gold')}${stat('Output in progress', fmtCompact(value) + ' ISK', 'Manufacturing & reactions')}
      ${stat('Industrialists', new Set(current.map(j => j.installer)).size)}</div>
    ${running.length ? html`<div class="panel"><h3>Running jobs</h3>${timeline(running.map(j => ({ label: `${j.installer}: ${j.product || j.blueprint}`, img: typeIcon(j.blueprintTypeId),
      segs: [{ start: Math.max(Date.parse(j.start), now - 3600000), end: Date.parse(j.end), cls: 'ind-' + j.slot, label: `${j.activity} · ${j.runs}×` }] })), { from: now - 3600000, to: Math.max(...running.map(j => Date.parse(j.end))) })}</div>` : ''}
    <div class="panel" style="padding:0"><div class="table-wrap">${jobsTable(jobs.slice(0, 400), { showPilot: true })}</div></div>`);
}

function cAssets(d) {
  setContent(html`<div class="grid grid-3" style="margin-bottom:16px">${stat('Corp asset value', fmtCompact(d.value) + ' ISK', fmtIsk(d.value))}${stat('Items', fmtNum(d.total))}${stat('Locations', d.locations.length)}</div>
    <div class="toolbar"><input type="search" id="ca-q" placeholder="Search items or locations…"><span class="dim">Average market prices · blueprint copies not valued</span></div>
    <div>${d.locations.slice(0, 150).map(l => html`<details class="sgroup" data-loc="${l.name.toLowerCase()}"><summary><span class="gname">${l.name}</span><span class="muted">${l.items.length} types · ${fmtCompact(l.value)} ISK</span></summary>
      <div style="padding:0 14px 10px 34px"><table><thead><tr><th>Item</th><th>Hangar</th><th class="right">Qty</th><th class="right">Value</th></tr></thead><tbody>
      ${l.items.slice(0, 300).map(i => html`<tr data-item="${i.name.toLowerCase()}"><td>${icon(i.typeId, 18)}${i.name}</td><td class="muted">${i.divisionName || ''}</td><td class="right num">${fmtNum(i.quantity)}</td><td class="right num">${i.value ? fmtCompact(i.value) : '—'}</td></tr>`)}</tbody></table></div></details>`)}</div>`);
  $('#ca-q').oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('[data-loc]').forEach(g => { const lm = q && g.dataset.loc.includes(q); let any = false;
      g.querySelectorAll('[data-item]').forEach(r => { const m = !q || lm || r.dataset.item.includes(q); r.style.display = m ? '' : 'none'; any = any || m; });
      g.style.display = any ? '' : 'none'; g.open = !!q && any && !lm; });
  };
}

function cBlueprints(d) {
  const bps = d.blueprints;
  setContent(html`${sectionError(d.blueprintError)}<div class="grid grid-3" style="margin-bottom:16px">${stat('Blueprints', fmtNum(bps.length))}${stat('Originals', fmtNum(bps.filter(b => b.original).length), '≈ ' + fmtCompact(bps.reduce((n, b) => n + (b.value || 0), 0)) + ' ISK')}${stat('Copies', fmtNum(bps.filter(b => !b.original).length))}</div>
    <div class="toolbar"><input type="search" id="cbp-q" placeholder="Search blueprints…"></div>
    <div class="panel" style="padding:0"><div class="table-wrap"><table><thead><tr><th>Blueprint</th><th>Type</th><th class="right">ME</th><th class="right">TE</th><th class="right">Runs</th><th>Hangar</th></tr></thead><tbody>
      ${bps.slice(0, 2000).map(b => html`<tr data-bp="${b.name.toLowerCase()}"><td>${icon(b.typeId)}${b.name}</td><td><span class="badge ${b.original ? 'accent' : ''}">${b.original ? 'Original' : 'Copy'}</span></td>
        <td class="right num">${b.me}%</td><td class="right num">${b.te}%</td><td class="right num">${b.original ? '∞' : fmtNum(b.runs)}</td><td class="muted">${b.location}</td></tr>`)}</tbody></table></div></div>`);
  $('#cbp-q').oninput = e => { const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('[data-bp]').forEach(r => { r.style.display = !q || r.dataset.bp.includes(q) ? '' : 'none'; }); };
}

// ================= Moon tax =================

const mtState = { from: null, to: null, rate: 10, division: 1, preview: null };

async function cMoonTax() {
  if (!state.directorId) return setContent(emptyBox('Needs a director pilot with the Accountant role.'));
  const d = new Date();
  if (!mtState.from) { mtState.from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10); mtState.to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10); }
  const inv = [...corpState.ws.invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unpaid = inv.filter(i => i.status !== 'paid');
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">${stat('Open invoices', unpaid.length, fmtCompact(unpaid.reduce((n, i) => n + i.amount, 0)) + ' ISK owed', unpaid.length ? 'gold' : '')}
      ${stat('Paid', inv.filter(i => i.status === 'paid').length, fmtCompact(inv.filter(i => i.status === 'paid').reduce((n, i) => n + i.amount, 0)) + ' ISK collected', 'pos')}</div>
    <div class="panel"><h3>Create invoices from the moon ledger</h3>
      <div class="toolbar">From <input type="date" id="mt-from" value="${mtState.from}" class="crumb-select"> to <input type="date" id="mt-to" value="${mtState.to}" class="crumb-select">
        Tax <input type="number" id="mt-rate" value="${mtState.rate}" class="crumb-select" style="width:80px"> % of ore value <button class="btn btn-primary" id="mt-go">Preview</button></div>
      <div id="mt-prev"></div></div>
    <div class="panel" style="padding:0"><div style="padding:14px 18px 0;display:flex;justify-content:space-between;align-items:center"><h3>Invoices</h3>
      <div class="toolbar" style="margin:0">Wallet division <input type="number" id="mt-div" value="${mtState.division}" min="1" max="7" class="crumb-select" style="width:60px"><button class="btn btn-ghost" id="mt-check">Check payments</button></div></div>
      ${inv.length ? html`<table><thead><tr><th>Pilot</th><th>Period</th><th class="right">Ore value</th><th class="right">Amount</th><th>Status</th><th>Issued</th><th></th></tr></thead><tbody>
      ${inv.map(i => html`<tr><td>${charImg(i.pilotId, 20)}${i.pilot}</td><td class="muted">${i.from} → ${i.to}</td><td class="right num">${fmtCompact(i.value)}</td><td class="right num"><b>${fmtIsk(i.amount)}</b></td>
        <td>${i.status === 'paid' ? raw('<span class="badge green">Paid</span>') : i.paidAmount ? html`<span class="badge gold">Part paid ${fmtCompact(i.paidAmount)}</span>` : raw('<span class="badge red">Unpaid</span>')}</td><td class="nowrap">${fmtDay(i.createdAt)}</td>
        <td class="right nowrap">${i.status !== 'paid' ? html`<button class="btn btn-ghost pl-mini" data-inv-paid="${i.id}">Mark paid</button>` : ''}<button class="btn btn-ghost pl-mini" data-inv-del="${i.id}">✕</button></td></tr>`)}</tbody></table>`
      : html`<div class="muted" style="padding:14px 18px">No invoices yet.</div>`}
      <div class="dim" style="font-size:12px;padding:8px 18px 14px">Payments are matched to ISK the pilot gives to the corporation (player donation) after the invoice date.</div></div>`);
  $('#mt-go').onclick = async () => {
    Object.assign(mtState, { from: $('#mt-from').value, to: $('#mt-to').value, rate: Number($('#mt-rate').value) || 0 });
    const box = $('#mt-prev'); box.innerHTML = String(loadingView('Reading mining ledgers…'));
    const r = await api.corpx.moonTax(state.directorId, mtState.from, mtState.to, mtState.rate);
    if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
    const d = r.data; mtState.preview = d;
    box.innerHTML = String(html`<div class="muted" style="margin:8px 0">${d.miners.length} miners · ${fmtCompact(d.totalValue)} ISK of ore · <b>${fmtCompact(d.totalTax)} ISK</b> tax</div>
      <table><tbody>${d.miners.map(m => html`<tr><td>${charImg(m.id, 20)}${m.name}</td><td class="muted">${m.corp}</td><td class="right num">${fmtNum(m.quantity)} units</td><td class="right num">${fmtCompact(m.value)}</td><td class="right num"><b>${fmtIsk(m.tax)}</b></td></tr>`)}</tbody></table>
      ${d.miners.length ? html`<div class="toolbar" style="margin-top:10px"><button class="btn btn-primary" id="mt-create">Create ${d.miners.length} invoices</button></div>` : ''}`);
    const cr = $('#mt-create');
    if (cr) cr.onclick = async () => {
      for (const m of d.miners.filter(x => x.tax > 0)) await api.ws.upsert('invoices', { pilotId: m.id, pilot: m.name, from: d.from, to: d.to, value: m.value, rate: d.rate, amount: m.tax, status: 'unpaid' });
      await loadWs(); toast('Invoices created'); cMoonTax();
    };
  };
  $('#mt-check').onclick = async () => {
    mtState.division = Number($('#mt-div').value) || 1;
    toast('Checking the corp wallet…');
    const r = await api.corpx.checkInvoices(state.directorId, mtState.division);
    if (!r.ok) return toast(r.error, true);
    toast(`${r.data.paid} of ${r.data.checked} open invoices are now paid`); await loadWs(); cMoonTax();
  };
  document.querySelectorAll('[data-inv-paid]').forEach(b => b.onclick = async () => { const i = corpState.ws.invoices.find(x => x.id === b.dataset.invPaid); await api.ws.upsert('invoices', { ...i, status: 'paid', paidAt: new Date().toISOString() }); await loadWs(); cMoonTax(); });
  document.querySelectorAll('[data-inv-del]').forEach(b => b.onclick = async () => { await api.ws.remove('invoices', b.dataset.invDel); await loadWs(); cMoonTax(); });
}

// ================= Buyback =================

async function cBuyback() {
  const info = await api.sde.info();
  if (!info.ok || !info.data.ready) return setContent(needSdeView('Buyback'));
  const rr = await api.corpx.buybackRules();
  const rules = rr.ok ? rr.data : { percent: 90, categories: {} };
  setContent(html`<div class="grid grid-2" style="align-items:start">
    <div class="panel"><h3>Quote</h3><textarea id="bb-text" rows="10" class="mono-area" style="width:100%" placeholder="Paste the items a member wants to sell to the corp"></textarea>
      <div class="toolbar" style="margin:10px 0 0"><button class="btn btn-primary" id="bb-go">Get quote</button><button class="btn btn-ghost" id="bb-rules">Rates (${rules.percent}% of Jita buy)</button></div><div id="bb-out"></div></div>
    <div class="panel"><h3>Check buyback contracts</h3><div class="muted" style="margin-bottom:10px">Outstanding item exchange contracts assigned to the corporation, valued at your buyback rates.</div>
      <button class="btn btn-primary" id="bb-check" ${raw(state.directorId ? '' : 'disabled')}>Check contracts</button><div id="bb-cout" style="margin-top:12px"></div></div></div>`);
  $('#bb-go').onclick = async () => {
    const box = $('#bb-out'); box.innerHTML = String(loadingView('Pricing…'));
    const r = await api.corpx.buybackQuote($('#bb-text').value);
    if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
    const d = r.data;
    box.innerHTML = String(html`<div class="grid grid-2" style="margin:12px 0">${stat('Buyback offer', fmtIsk(d.total), `Jita buy ${fmtCompact(d.jitaBuy)} · sell ${fmtCompact(d.jitaSell)}`, 'pos')}${stat('Volume', fmtNum(d.volume) + ' m³')}</div>
      ${d.unknown.length ? html`<div class="notice">Not recognised: ${d.unknown.slice(0, 6).join(', ')}</div>` : ''}
      <table><tbody>${d.rows.map(x => html`<tr><td>${icon(x.typeId, 18)}${x.name} ×${fmtNum(x.qty)}</td><td class="dim">${x.category}</td><td class="right num dim">${x.percent}%</td><td class="right num">${fmtCompact(x.offer)}</td></tr>`)}</tbody></table>
      <button class="btn btn-ghost" style="margin-top:10px" id="bb-copy">Copy price for contract</button>`);
    $('#bb-copy').onclick = () => api.copy(String(Math.floor(d.total))).then(() => toast('Contract price copied'));
  };
  $('#bb-rules').onclick = () => openModal('Buyback rates', html`${field('Default % of Jita buy', inputNum('percent', rules.percent))}
    ${field('Category overrides', textarea('cats', Object.entries(rules.categories).map(([k, v]) => `${k} = ${v}`).join('\n'), 6), 'One per line, e.g. "Asteroid = 95" or "Material = 92" (item categories as shown in quotes).')}`, {
    onSubmit: async d => { const cats = {}; for (const l of d.cats.split('\n')) { const m = l.match(/^\s*(.+?)\s*=\s*([\d.]+)/); if (m) cats[m[1]] = Number(m[2]); }
      const r = await api.corpx.setBuybackRules({ percent: Number(d.percent) || 0, categories: cats }); if (!r.ok) throw new Error(r.error); cBuyback(); }
  });
  $('#bb-check').onclick = async () => {
    const box = $('#bb-cout'); box.innerHTML = String(loadingView('Reading corp contracts…'));
    const r = await api.corpx.buybackContracts(state.directorId);
    if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
    box.innerHTML = String(r.data.length ? html`<table><thead><tr><th>From</th><th class="right">Asks</th><th class="right">Worth</th><th></th></tr></thead><tbody>${r.data.map(c => html`<tr><td>${charImg(c.issuerId, 20)}${c.issuer}<div class="dim">${c.title || ''} · ${fmtDay(c.issued)}</div></td>
      <td class="right num">${fmtCompact(c.price)}</td><td class="right num">${fmtCompact(c.quote)}</td><td>${c.verdict === 'ok' ? raw('<span class="badge green">Accept</span>') : c.verdict === 'over' ? html`<span class="badge red">Over by ${fmtCompact(c.diff)}</span>` : raw('<span class="badge">No items</span>')}</td></tr>`)}</tbody></table>` : emptyBox('No outstanding buyback contracts.'));
  };
}

// ================= Doctrines =================

const docState = { sel: null, evals: {} };

async function cDoctrines() {
  const info = await api.sde.info();
  if (!info.ok || !info.data.ready) return setContent(needSdeView('Doctrines'));
  const list = corpState.ws.doctrines;
  if (!docState.sel || !list.some(d => d.id === docState.sel)) docState.sel = list[0] ? list[0].id : null;
  const doc = list.find(d => d.id === docState.sel);
  setContent(html`<div class="doc-layout">
    <div><button class="btn btn-primary" data-doc-new style="width:100%;margin-bottom:10px">+ New doctrine</button>
      ${list.map(d => html`<div class="doc-card ${d.id === docState.sel ? 'active' : ''}" data-doc="${d.id}"><b>${d.name}</b><div class="dim">${d.fits.length} fit${d.fits.length === 1 ? '' : 's'}${docState.evals[d.id] ? ` · ${docState.evals[d.id].canFly} can fly` : ''}</div></div>`)}
      ${list.length ? '' : html`<div class="muted" style="padding:8px">No doctrines yet.</div>`}</div>
    <div id="doc-main">${doc ? loadingView('Checking fits and pilots…') : emptyBox('Create a doctrine, then paste EFT fits into it.')}</div></div>`);
  if (!doc) return;
  const r = await api.doctrine.evaluate(doc, 'Jita');
  const main = $('#doc-main');
  if (!main) return;
  if (!r.ok) { main.innerHTML = String(errorView(r)); return; }
  const ev = docState.evals[doc.id] = r.data;
  main.innerHTML = String(html`
    <div class="toolbar"><h2 style="margin:0;font:400 22px var(--font-num)">${doc.name}</h2><span style="flex:1"></span>
      <button class="btn btn-primary" data-doc-addfit>+ Add fit (EFT)</button><button class="btn btn-ghost" data-doc-rename>Rename</button><button class="btn btn-danger" data-doc-del>Delete</button></div>
    ${doc.description ? html`<div class="muted" style="margin-bottom:12px">${doc.description}</div>` : ''}
    <div class="grid grid-4" style="margin-bottom:16px">${stat('Fits', doc.fits.length)}${stat('Pilots who can fly', ev.canFly, `of ${ev.pilots.length} checked (live + audits)`, ev.canFly ? 'pos' : 'gold')}
      ${stat('Cheapest fit', ev.fits.length ? fmtCompact(Math.min(...ev.fits.map(f => f.cost))) + ' ISK' : '—', 'Jita sell')}${stat('Close (under 7 days)', ev.pilots.filter(p => !p.canFly && p.minutes < 7 * 1440).length)}</div>
    <div class="panel" style="padding:0">${ev.fits.length ? html`<table><thead><tr><th>Fit</th><th class="right">Cost (Jita)</th><th class="right">Skills</th><th class="right">Can fly</th><th></th></tr></thead><tbody>
      ${ev.fits.map(f => html`<tr><td><img src="${IMG}/types/${f.shipTypeId}/render?size=64" width="34" height="34" style="vertical-align:-11px;margin-right:10px;border-radius:4px" alt=""><b>${f.name}</b> <span class="dim">${f.ship}</span></td>
        <td class="right num">${fmtCompact(f.cost)}<div class="dim">hull ${fmtCompact(f.hullCost)}</div></td><td class="right num">${f.requirements}</td>
        <td class="right num">${f.pilots.filter(p => p.canFly).length}</td>
        <td class="right nowrap"><button class="btn btn-ghost pl-mini" data-fit-check="${f.id}" title="Slots, CPU and powergrid with each pilot's skills">Check</button><button class="btn btn-ghost pl-mini" data-fit-copy="${f.id}">Copy EFT</button><button class="btn btn-ghost pl-mini" data-fit-view="${f.id}">Items</button><button class="btn btn-ghost pl-mini" data-fit-del="${f.id}">✕</button></td></tr>`)}</tbody></table>` : emptyBox('Paste an EFT fit to add it to this doctrine.')}</div>
    <div class="panel" style="padding:0;margin-top:16px"><div style="padding:14px 18px 0"><h3>Pilot readiness</h3></div>${ev.pilots.length ? html`<table><thead><tr><th>Pilot</th><th>Best fit</th><th>Status</th><th>Missing</th><th class="right">Time to fly</th></tr></thead><tbody>
      ${ev.pilots.map(p => html`<tr><td>${charImg(p.id, 20)}${p.name}${p.fromAudit ? raw(' <span class="badge">audit</span>') : ''}</td><td class="muted">${p.fit}</td>
        <td>${p.canFly ? raw('<span class="badge green">Ready</span>') : p.minutes < 7 * 1440 ? raw('<span class="badge gold">Close</span>') : raw('<span class="badge red">Not ready</span>')}</td>
        <td class="muted" style="font-size:12px">${p.missing.slice(0, 4).map(m => `${m.name} ${ROMAN[m.level]}`).join(', ')}${p.missing.length > 4 ? ` +${p.missing.length - 4}` : ''}</td>
        <td class="right num">${p.canFly ? '—' : fmtMinutes(p.minutes)}</td></tr>`)}</tbody></table>` : html`<div class="muted" style="padding:14px 18px">No pilots or audits to check yet.</div>`}</div>`);
}

async function saveDoctrine(doc) { await ws('upsert', 'doctrines', doc); await loadWs(); }

function doctrineModal(doc = {}) {
  openModal(doc.id ? 'Rename doctrine' : 'New doctrine', html`${field('Name', inputText('name', doc.name || '', 'e.g. Sentry Ishtars'))}${field('Description', textarea('description', doc.description || '', 2))}`, {
    onSubmit: async d => { const saved = await ws('upsert', 'doctrines', { ...doc, name: d.name || 'Doctrine', description: d.description, fits: doc.fits || [] }); docState.sel = saved.id; await loadWs(); cDoctrines(); }
  });
}

function addFitModal(doc) {
  openModal(`Add fit to ${doc.name}`, html`${field('EFT fit', textarea('eft', '', 14), 'In game: Fitting window → Save/Copy → Copy to clipboard. Pyfa: Export → EFT. Paste several fits separated by a blank line between them.')}`, {
    wide: true, submit: 'Add fit', onSubmit: async d => {
      const blocks = d.eft.split(/\n(?=\[)/).map(b => b.trim()).filter(Boolean);
      if (!blocks.length) throw new Error('Paste at least one EFT fit.');
      const unknown = [];
      for (const b of blocks) {
        const r = await api.doctrine.parseEft(b);
        if (!r.ok) throw new Error(r.error);
        unknown.push(...r.data.unknown);
        doc.fits.push({ id: Math.random().toString(36).slice(2, 10), ...r.data });
      }
      await saveDoctrine(doc);
      toast(unknown.length ? `Added. Unrecognised items skipped: ${unknown.slice(0, 3).join(', ')}` : `Added ${blocks.length} fit${blocks.length > 1 ? 's' : ''}`, !!unknown.length);
      cDoctrines();
    }
  });
}

document.addEventListener('click', async e => {
  const q = sel => e.target.closest(sel);
  let el;
  const doc = () => corpState.ws && corpState.ws.doctrines.find(d => d.id === docState.sel);
  if (q('[data-doc-new]')) return doctrineModal();
  if ((el = q('[data-doc]'))) { docState.sel = el.dataset.doc; return cDoctrines(); }
  if (q('[data-doc-addfit]')) return addFitModal(doc());
  if (q('[data-doc-rename]')) return doctrineModal(doc());
  if ((el = q('[data-doc-del]'))) { if (el.dataset.c !== '1') { el.dataset.c = '1'; el.textContent = 'Click again'; return; } await ws('remove', 'doctrines', docState.sel); docState.sel = null; await loadWs(); return cDoctrines(); }
  if ((el = q('[data-fit-del]'))) { const d = doc(); d.fits = d.fits.filter(f => f.id !== el.dataset.fitDel); await saveDoctrine(d); return cDoctrines(); }
  if ((el = q('[data-fit-check]'))) { const f = doc().fits.find(x => x.id === el.dataset.fitCheck); fitState.text = f.eft; fitState.data = null; fitState.pending = true; state.toolsTab = 't-fit'; go('tools'); return; }
  if ((el = q('[data-fit-copy]'))) { const f = doc().fits.find(x => x.id === el.dataset.fitCopy); await api.copy(f.eft); return toast('EFT copied. In game: Fitting → Import from clipboard'); }
  if ((el = q('[data-fit-view]'))) {
    const f = doc().fits.find(x => x.id === el.dataset.fitView);
    openModal(`${f.name}: ${f.ship}`, html`<div class="grid grid-2"><div>${f.items.map(i => html`<div class="skill-row"><span>${icon(i.typeId, 18)}${i.name}</span><span class="num muted">×${i.qty}</span></div>`)}</div>
      <pre class="pre" style="max-height:420px">${f.eft}</pre></div>`, { wide: true });
  }
});

// ================= Ops =================

const OP_TYPES = ['Strat op', 'CTA', 'Home defense', 'Roam', 'Structure bash', 'Mining op', 'Moon pop', 'Training', 'Other'];

function cOps() {
  const ws = corpState.ws;
  const now = Date.now();
  const upcoming = ws.ops.filter(o => Date.parse(o.start) > now - 2 * 3600000).sort((a, b) => a.start.localeCompare(b.start));
  const past = ws.ops.filter(o => Date.parse(o.start) <= now - 2 * 3600000).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 30);
  const row = o => html`<tr><td>${o.importance === 'high' ? raw('<span class="badge red">CTA</span> ') : ''}<b>${o.title}</b><div class="dim">${o.description || ''}</div></td>
    <td><span class="badge">${o.type}</span></td><td>${bothTimes(o.start)}</td><td class="right">${countdownCell(o.start)}</td>
    <td>${o.fc || ''}</td><td>${o.doctrine || ''}</td><td class="muted">${o.location || ''}</td>
    <td class="right nowrap"><button class="btn btn-ghost" style="padding:3px 9px" data-op-edit="${o.id}">Edit</button>
      <button class="btn btn-ghost" style="padding:3px 9px" data-op-track="${o.id}" title="Start fleet tracking for this op">Track</button></td></tr>`;
  const head = html`<thead><tr><th>Op</th><th>Type</th><th>Form-up (EVE / local)</th><th class="right">In</th><th>FC</th><th>Doctrine</th><th>Location</th><th></th></tr></thead>`;
  setContent(html`
    <div class="toolbar"><button class="btn btn-primary" data-op-new>+ Schedule op</button><span class="muted">EVE time is UTC. Now: <b id="et-now">${eveTime(new Date())}</b></span></div>
    <div class="panel" style="padding:0">${upcoming.length ? html`<table>${head}<tbody>${upcoming.map(row)}</tbody></table>` : emptyBox('No upcoming ops')}</div>
    ${past.length ? html`<div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Past ops</h3></div><table>${head}<tbody>${past.map(row)}</tbody></table></div>` : ''}`);
}

function opModal(op = {}) {
  const start = op.start || new Date(Math.ceil(Date.now() / 1800000) * 1800000 + 3600000).toISOString();
  openModal(op.id ? 'Edit op' : 'Schedule op', html`
    ${field('Title', inputText('title', op.title || '', 'e.g. Sunday strat-op'))}
    <div class="grid grid-2">${field('Type', select('type', OP_TYPES, op.type || 'Strat op'))}${field('Form-up time (EVE / UTC)', html`<input type="datetime-local" name="start" value="${toUtcInput(start)}">`)}</div>
    <div class="grid grid-2">${field('FC', inputText('fc', op.fc || ''))}${field('Doctrine', inputText('doctrine', op.doctrine || ''))}</div>
    <div class="grid grid-2">${field('Form-up location', inputText('location', op.location || ''))}${field('Duration (minutes)', inputNum('duration', op.duration || 120))}</div>
    ${field('Details', textarea('description', op.description || ''))}
    ${checkbox('high', 'Mark as CTA / high importance', op.importance === 'high')}
    ${checkbox('ping', 'Post to the Discord ops channel', !op.id)}`, {
    extraButtons: op.id ? `<button type="button" class="btn btn-danger" id="op-del">Delete</button>` : '',
    onSubmit: async d => {
      if (!d.title.trim()) throw new Error('Give the op a title.');
      await ws('upsert', 'ops', { ...op, title: d.title.trim(), type: d.type, start: fromUtcInput(d.start), fc: d.fc, doctrine: d.doctrine, location: d.location, duration: Number(d.duration) || 0, description: d.description, importance: d.high ? 'high' : 'normal' }, d.ping ? 'ops' : null);
      toast('Op saved'); render();
    }
  });
  const del = $('#op-del');
  if (del) del.onclick = async () => { await ws('remove', 'ops', op.id); closeModal(); toast('Op deleted'); render(); };
}

// ---------- Fleet tracker ----------

async function cFleet() {
  const st = await api.fleet.status();
  corpState.fleetLive = st.ok ? st.data : null;
  drawFleet();
}

function drawFleet(prefillOp) {
  const live = corpState.fleetLive;
  const fcs = state.characters.filter(c => c.isDirector && !c.needsReauth);
  if (!live) {
    const op = prefillOp ? corpState.ws.ops.find(o => o.id === prefillOp) : null;
    setContent(html`
      <div class="grid grid-2">
        <div class="panel"><h3>Track a fleet</h3>
          ${fcs.length ? html`<form id="fleet-form" autocomplete="off">
            ${field('FC pilot (must be fleet boss)', select('fcId', fcs.map(c => [c.id, c.name]), fcs[0].id))}
            ${field('Fleet name', inputText('name', op ? op.title : '', 'e.g. Tama home defense'))}
            ${field('Doctrine', inputText('doctrine', op ? op.doctrine || '' : ''))}
            <input type="hidden" name="opId" value="${op ? op.id : ''}">
            ${checkbox('ping', 'Post "fleet forming" to Discord', true)}
            <div class="row" style="display:flex;gap:10px"><button type="button" class="btn btn-ghost" id="fleet-check">Check fleet</button><button class="btn btn-primary">Start tracking</button></div>
            <div id="fleet-check-out" class="muted" style="margin-top:10px"></div>
          </form>` : html`<div class="muted">Add a director / FC pilot first (sidebar → "Add director / FC"). It needs the fleet scope.</div>`}
        </div>
        <div class="panel"><h3>How participation tracking works</h3>
          <ol class="steps"><li>The FC forms the fleet in game and takes <b>fleet boss</b>.</li>
          <li>Start tracking here. The roster is recorded every minute while the app is open.</li>
          <li>Anyone seen in the fleet counts as a participant, with their ship(s) and system(s).</li>
          <li>Stop tracking when the op ends. The record appears under <b>Participation</b> and can be shared with other officers through Share & Backup.</li></ol>
          <div class="dim" style="margin-top:10px">No fleet links for members to click, and no one can claim attendance they didn't earn.</div></div>
      </div>`);
    const form = $('#fleet-form');
    if (form) {
      $('#fleet-check').onclick = async () => {
        const out = $('#fleet-check-out'); out.textContent = 'Checking…';
        const r = await api.fleet.check(Number(form.fcId.value));
        out.textContent = !r.ok ? r.error : !r.data.inFleet ? 'That pilot is not in a fleet.' : !r.data.boss ? (r.data.error || 'Not fleet boss.') : `In fleet as boss: ${r.data.members.length} members.`;
      };
      form.onsubmit = async e => {
        e.preventDefault();
        const r = await api.fleet.start({ fcId: Number(form.fcId.value), name: form.name.value.trim() || 'Fleet', doctrine: form.doctrine.value.trim(), opId: form.opId.value || null, ping: form.ping.checked });
        if (!r.ok) return toast(r.error, true);
        corpState.fleetLive = r.data; drawFleet();
      };
    }
    return;
  }
  const mins = Math.round((Date.now() - Date.parse(live.startedAt)) / 60000);
  const ships = {};
  for (const p of live.participants) for (const s of p.ships) ships[s] = (ships[s] || 0) + 1;
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Tracking', live.name, `FC ${live.fcName} · ${live.doctrine || 'no doctrine'}`, 'pos')}
      ${stat('Participants', live.participants.length)}
      ${stat('Running for', mins < 60 ? mins + ' min' : Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm', `${live.polls} roster checks`)}
      ${stat('Last check', live.lastPoll ? new Date(live.lastPoll).toLocaleTimeString('en-AU') : '—', live.lastError || 'OK', live.lastError ? 'gold' : '')}
    </div>
    <div class="toolbar"><button class="btn btn-danger" id="fleet-stop">■ Stop tracking & save</button></div>
    <div class="grid grid-2">
      <div class="panel" style="padding:0"><table><thead><tr><th>Pilot</th><th>Ships</th><th>Systems</th><th class="right">Seen</th></tr></thead><tbody>
        ${live.participants.map(p => html`<tr><td>${charImg(p.id, 20)}${p.name}</td><td class="muted">${p.ships.join(', ')}</td><td class="muted">${p.systems.join(', ')}</td><td class="right num">${p.seenPolls}×</td></tr>`)}</tbody></table></div>
      <div class="panel"><h3>Ship types</h3>${Object.entries(ships).sort((a, b) => b[1] - a[1]).map(([s, n]) => html`<div class="skill-row"><span>${s}</span><span class="num">${n}</span></div>`)}</div>
    </div>`);
  $('#fleet-stop').onclick = async () => {
    const r = await api.fleet.stop();
    if (!r.ok) return toast(r.error, true);
    corpState.fleetLive = null; await loadWs(); toast('Fleet saved to Participation'); drawFleet();
  };
}

function cFats() {
  const fleets = [...corpState.ws.fleets].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const now = Date.now();
  const stats = new Map();
  const alts = corpState.ws.alts || {};
  const mainName = id => { const pp = fleets.flatMap(f => f.participants).find(x => x.id === id); return pp ? pp.name : ((corpState.memberList || []).find(x => x.id === id) || {}).name || id; };
  for (const f of fleets) {
    const age = now - Date.parse(f.startedAt);
    const counted = new Set();
    for (const p0 of f.participants) {
      const mid = corpState.groupAlts && alts[p0.id] ? alts[p0.id] : p0.id;
      if (counted.has(mid)) continue;
      counted.add(mid);
      const p = { id: mid, name: mid === p0.id ? p0.name : mainName(mid) };
      const s = stats.get(p.id) || { id: p.id, name: p.name, d30: 0, d90: 0, total: 0, last: null };
      s.total++; if (age < 30 * 86400000) s.d30++; if (age < 90 * 86400000) s.d90++;
      if (!s.last || f.startedAt > s.last) s.last = f.startedAt;
      stats.set(p.id, s);
    }
  }
  const pilots = [...stats.values()].sort((a, b) => b.d30 - a.d30 || b.total - a.total);
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">${stat('Fleets recorded', fleets.length)}${stat('Fleets last 30 days', fleets.filter(f => now - Date.parse(f.startedAt) < 30 * 86400000).length)}
      ${stat('Unique participants', pilots.length)}${stat('Average fleet size', fleets.length ? Math.round(fleets.reduce((n, f) => n + f.participants.length, 0) / fleets.length) : '—')}</div>
    <div class="grid grid-2">
      <div class="panel" style="padding:0"><div style="padding:14px 18px 0;display:flex;justify-content:space-between"><h3>Participation by ${corpState.groupAlts ? 'person (alts merged)' : 'pilot'}</h3><label class="check" style="margin:0"><input type="checkbox" id="fat-alts" ${raw(corpState.groupAlts ? 'checked' : '')}> Merge alts into mains</label></div>${pilots.length ? html`<table><thead><tr><th>Pilot</th><th class="right">30 days</th><th class="right">90 days</th><th class="right">All</th><th>Last fleet</th></tr></thead><tbody>
        ${pilots.map(p => html`<tr><td>${charImg(p.id, 20)}${p.name}</td><td class="right num">${p.d30}</td><td class="right num">${p.d90}</td><td class="right num">${p.total}</td><td class="muted">${ago(p.last)}</td></tr>`)}</tbody></table>` : emptyBox('No fleets tracked yet')}</div>
      <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Fleets</h3></div>${fleets.length ? html`<table><thead><tr><th>Fleet</th><th>FC</th><th>Date</th><th class="right">Pilots</th><th></th></tr></thead><tbody>
        ${fleets.map(f => html`<tr class="clickable" data-fleet="${f.id}"><td>${f.name}<div class="dim">${f.doctrine || ''}</div></td><td>${f.fcName}</td><td class="nowrap">${fmtDate(f.startedAt)}<div class="dim">${Math.round((Date.parse(f.endedAt) - Date.parse(f.startedAt)) / 60000)} min</div></td><td class="right num">${f.participants.length}</td><td class="dim">▸</td></tr>`)}</tbody></table>` : emptyBox('—')}</div>
    </div>`);
}

document.addEventListener('change', e => { if (e.target && e.target.id === 'fat-alts') { corpState.groupAlts = e.target.checked; cFats(); } });

function fleetDetail(id) {
  const f = corpState.ws.fleets.find(x => x.id === id);
  if (!f) return;
  openModal(`${f.name}: ${fmtDate(f.startedAt)}`, html`<div class="muted" style="margin-bottom:10px">FC ${f.fcName} · ${f.doctrine || 'no doctrine'} · ${f.participants.length} pilots</div>
    <table><thead><tr><th>Pilot</th><th>Ships</th><th>Systems</th><th>Joined</th></tr></thead><tbody>${f.participants.map(p => html`<tr><td>${charImg(p.id, 20)}${p.name}</td><td class="muted">${p.ships.join(', ')}</td><td class="muted">${p.systems.join(', ')}</td><td class="nowrap">${new Date(p.firstSeen).toLocaleTimeString('en-AU')}</td></tr>`)}</tbody></table>`,
    { wide: true, extraButtons: `<button type="button" class="btn btn-danger" id="fleet-del">Delete record</button>` });
  $('#fleet-del').onclick = async () => { await ws('remove', 'fleets', id); await loadWs(); closeModal(); render(); };
}

// ---------- Timerboard ----------

const TIMER_KINDS = ['Shield', 'Armor', 'Hull', 'Anchoring', 'Unanchoring', 'Moon chunk', 'POS reinforce', 'Sov / IHub', 'POCO', 'Other'];

function cTimers() {
  const f = corpState.timerFilter;
  const now = Date.now();
  const list = corpState.ws.timers.filter(t => f === 'all' || (f === 'upcoming' ? Date.parse(t.time) > now - 3600000 : Date.parse(t.time) <= now - 3600000))
    .sort((a, b) => f === 'past' ? b.time.localeCompare(a.time) : a.time.localeCompare(b.time));
  setContent(html`
    <div class="toolbar"><button class="btn btn-primary" data-timer-new>+ Add timer</button>
      <div class="seg">${['upcoming', 'past', 'all'].map(k => html`<button data-tf="${k}" class="${f === k ? 'active' : ''}">${humanize(k)}</button>`)}</div>
      <span class="muted">Add timers straight from structure notifications under Structures. Now: <b>${eveTime(new Date())}</b></span></div>
    <div class="panel" style="padding:0">${list.length ? html`<table><thead><tr><th>Structure</th><th>System</th><th>Timer</th><th>Owner</th><th>Objective</th><th>Exits (EVE / local)</th><th class="right">In</th><th></th></tr></thead><tbody>
      ${list.map(t => html`<tr><td><b>${t.structure || '—'}</b><div class="dim">${t.type || ''}</div></td><td>${t.system || ''}</td><td>${t.timerType}</td>
        <td><span class="badge ${t.owner === 'Friendly' ? 'green' : t.owner === 'Hostile' ? 'red' : ''}">${t.owner}</span></td><td>${t.objective}</td>
        <td>${bothTimes(t.time)}</td><td class="right">${countdownCell(t.time, Date.parse(t.time) - now < 3600000 ? 'gold' : '')}</td>
        <td class="right"><button class="btn btn-ghost" style="padding:3px 9px" data-timer-edit="${t.id}">Edit</button></td></tr>`)}</tbody></table>` : emptyBox('No timers')}</div>`);
}

function timerModal(t = {}) {
  const time = t.time || new Date(Date.now() + 86400000).toISOString();
  openModal(t.id ? 'Edit timer' : 'Add timer', html`
    <div class="grid grid-2">${field('Structure name', inputText('structure', t.structure || ''))}${field('Structure type', inputText('type', t.type || '', 'e.g. Astrahus, Athanor'))}</div>
    <div class="grid grid-2">${field('System', inputText('system', t.system || ''))}${field('Timer', select('timerType', TIMER_KINDS, t.timerType || 'Armor'))}</div>
    <div class="grid grid-2">${field('Owner', select('owner', ['Friendly', 'Hostile', 'Neutral'], t.owner || 'Friendly'))}${field('Objective', select('objective', ['Defend', 'Attack', 'Hold', 'Monitor'], t.objective || 'Defend'))}</div>
    <div class="grid grid-2">${field('Exits at (EVE / UTC)', html`<input type="datetime-local" name="time" value="${toUtcInput(time)}">`)}
      ${field('…or time remaining', inputText('remaining', '', 'e.g. 1d 4h 30m'), 'Overrides the date if filled')}</div>
    ${field('Notes', textarea('notes', t.notes || '', 2))}
    ${checkbox('ping', 'Post to the Discord timers channel', !t.id)}`, {
    extraButtons: t.id ? `<button type="button" class="btn btn-danger" id="timer-del">Delete</button>` : '',
    onSubmit: async d => {
      let iso = fromUtcInput(d.time);
      if (d.remaining.trim()) {
        const m = d.remaining.match(/(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i);
        const ms = ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60) * 1000;
        if (!ms) throw new Error('Time remaining should look like "1d 4h 30m".');
        iso = new Date(Date.now() + ms).toISOString();
      }
      await ws('upsert', 'timers', { ...t, structure: d.structure, type: d.type, system: d.system, timerType: d.timerType, owner: d.owner, objective: d.objective, time: iso, notes: d.notes }, d.ping ? 'timers' : null);
      toast('Timer saved'); render();
    }
  });
  const del = $('#timer-del');
  if (del) del.onclick = async () => { await ws('remove', 'timers', t.id); closeModal(); render(); };
}

// ================= Killboard =================

function cKills(list) {
  const f = corpState.killFilter;
  const rows = list.filter(k => f === 'all' || (f === 'kills' ? !k.loss : k.loss));
  const kills = list.filter(k => !k.loss), losses = list.filter(k => k.loss);
  const iskK = kills.reduce((n, k) => n + k.totalValue, 0), iskL = losses.reduce((n, k) => n + k.totalValue, 0);
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">${stat('Kills', kills.length, fmtCompact(iskK) + ' ISK destroyed', 'pos')}${stat('Losses', losses.length, fmtCompact(iskL) + ' ISK lost', 'neg')}
      ${stat('ISK efficiency', iskK + iskL ? Math.round(iskK / (iskK + iskL) * 100) + '%' : '—')}${stat('SRP candidates', losses.filter(k => !corpState.ws.srp.some(s => s.killmailId === k.id)).length, 'Losses without a request')}</div>
    <div class="toolbar"><div class="seg">${[['all', 'All'], ['kills', 'Kills'], ['losses', 'Losses']].map(([k, l]) => html`<button data-kf="${k}" class="${f === k ? 'active' : ''}">${l}</button>`)}</div></div>
    <div class="panel" style="padding:0"><div class="table-wrap"><table><thead><tr><th>Time</th><th></th><th>Victim</th><th>Ship</th><th>System</th><th class="right">Value</th><th>Final blow</th><th class="right">Pilots</th><th></th></tr></thead><tbody>
      ${rows.map(k => html`<tr><td class="nowrap">${fmtDate(k.time)}</td><td><span class="badge ${k.loss ? 'red' : 'green'}">${k.loss ? 'Loss' : 'Kill'}</span></td>
        <td>${k.victim}<div class="dim">${k.victimCorp || ''}</div></td><td>${icon(k.shipTypeId)}${k.ship}</td><td>${k.system}</td><td class="right num">${fmtCompact(k.totalValue)}</td>
        <td>${k.finalBlow}${k.finalBlowShip ? html`<div class="dim">${k.finalBlowShip}</div>` : ''}</td><td class="right num">${k.attackers}${!k.loss ? html`<div class="dim">${k.corpAttackers} ours</div>` : ''}</td>
        <td class="nowrap"><a href="#" data-link="https://zkillboard.com/kill/${k.id}/">zKill ↗</a></td></tr>`)}</tbody></table></div></div>`);
  corpState.lastKills = list;
}

// ================= SRP =================

function srpPayout(lossValue, hullValue, ship) {
  const r = corpState.ws.srpRules;
  if (r.shipOverrides && r.shipOverrides[ship]) return Number(r.shipOverrides[ship]);
  let v = (r.includeFit ? lossValue : hullValue) * (Number(r.percent) || 0) / 100;
  if (Number(r.maxPayout) > 0) v = Math.min(v, Number(r.maxPayout));
  return Math.round(v);
}
function matchFleet(pilotId, time) {
  const t = Date.parse(time);
  const f = corpState.ws.fleets.find(f => Date.parse(f.startedAt) - 600000 <= t && t <= Date.parse(f.endedAt) + 600000 && f.participants.some(p => p.id === pilotId));
  return f ? f.name : '';
}

async function cSrp() {
  const f = corpState.srpFilter;
  const reqs = corpState.ws.srp.filter(r => f === 'all' || r.status === f).sort((a, b) => b.time.localeCompare(a.time));
  const all = corpState.ws.srp;
  const sum = s => all.filter(r => r.status === s).reduce((n, r) => n + (r.payout || 0), 0);
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">${stat('Pending', all.filter(r => r.status === 'pending').length, fmtCompact(sum('pending')) + ' ISK requested', 'gold')}
      ${stat('Approved, unpaid', all.filter(r => r.status === 'approved').length, fmtCompact(sum('approved')) + ' ISK to pay')}
      ${stat('Paid', all.filter(r => r.status === 'paid').length, fmtCompact(sum('paid')) + ' ISK paid out', 'pos')}
      ${stat('Rules', corpState.ws.srpRules.percent + '% of ' + (corpState.ws.srpRules.includeFit ? 'hull + fit' : 'hull'), corpState.ws.srpRules.maxPayout > 0 ? 'Max ' + fmtCompact(corpState.ws.srpRules.maxPayout) : 'No cap')}</div>
    <div class="toolbar"><button class="btn btn-primary" data-srp-link>+ Add loss from kill link</button><button class="btn btn-ghost" data-srp-eligible>Pick from corp losses</button><button class="btn btn-ghost" data-srp-rules>Payout rules</button>
      <div class="seg">${['pending', 'approved', 'paid', 'rejected', 'all'].map(k => html`<button data-sf="${k}" class="${f === k ? 'active' : ''}">${humanize(k)}</button>`)}</div></div>
    <div class="panel" style="padding:0">${reqs.length ? html`<table><thead><tr><th>Loss</th><th>Pilot</th><th>System</th><th>Fleet</th><th class="right">Loss value</th><th class="right">Payout</th><th>Status</th><th></th></tr></thead><tbody>
      ${reqs.map(r => html`<tr><td>${icon(r.shipTypeId)}<b>${r.ship}</b><div class="dim">${fmtDate(r.time)}</div></td><td>${charImg(r.pilotId, 20)}${r.pilot}</td><td>${r.system}</td>
        <td class="muted">${r.fleet || raw('<span class="gold">No tracked fleet</span>')}</td><td class="right num">${fmtCompact(r.lossValue)}</td><td class="right num">${fmtCompact(r.payout)}</td>
        <td><span class="badge ${{ pending: 'gold', approved: 'accent', paid: 'green', rejected: 'red' }[r.status]}">${humanize(r.status)}</span>${r.decisionNote ? html`<div class="dim">${r.decisionNote}</div>` : ''}</td>
        <td class="right nowrap">${r.status === 'pending' ? html`<button class="btn btn-ghost" style="padding:3px 9px" data-srp-act="approved" data-id="${r.id}">Approve</button><button class="btn btn-danger" style="padding:3px 9px" data-srp-act="rejected" data-id="${r.id}">Reject</button>` : ''}
          ${r.status === 'approved' ? html`<button class="btn btn-primary" style="padding:3px 9px" data-srp-act="paid" data-id="${r.id}">Mark paid</button>` : ''}
          <a href="#" data-link="https://zkillboard.com/kill/${r.killmailId}/" style="margin-left:6px">zKill ↗</a></td></tr>`)}</tbody></table>` : emptyBox('No requests')}</div>`);
}

async function srpCreateFromKill(k) {
  if (corpState.ws.srp.some(r => r.killmailId === k.id)) throw new Error('There is already an SRP request for this loss.');
  if (!k.victimId) throw new Error('That killmail has no pilot victim.');
  const req = await ws('upsert', 'srp', {
    killmailId: k.id, hash: k.hash, pilot: k.victim, pilotId: k.victimId, ship: k.ship, shipTypeId: k.shipTypeId, system: k.system, time: k.time,
    lossValue: k.totalValue, hullValue: k.hullValue, payout: srpPayout(k.totalValue, k.hullValue, k.ship), fleet: matchFleet(k.victimId, k.time), status: 'pending'
  }, 'srp');
  await loadWs();
  return req;
}

function srpLinkModal() {
  openModal('Add SRP request from kill link', html`
    ${field('ESI kill link', inputText('link', '', 'https://esi.evetech.net/latest/killmails/…/…/'), 'In game: open the loss mail → right-click → Copy External Kill Link.')}`, {
    submit: 'Add request',
    onSubmit: async d => {
      const r = await api.corp.killmailByLink(d.link, state.directorId || null);
      if (!r.ok) throw new Error(r.error);
      await srpCreateFromKill(r.data); toast('SRP request added'); render();
    }
  });
}

async function srpEligibleModal() {
  if (!state.directorId) return toast('Needs a director pilot to read corp losses.', true);
  openModal('Corp losses without SRP', html`<div id="srp-elig">${loadingView('Loading corp losses…')}</div>`, { wide: true });
  const r = await api.corp.killmails(state.directorId);
  const box = $('#srp-elig');
  if (!box) return;
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  const losses = r.data.filter(k => k.loss && k.victimId && !corpState.ws.srp.some(s => s.killmailId === k.id));
  box.innerHTML = String(losses.length ? html`<table><thead><tr><th>Ship</th><th>Pilot</th><th>System</th><th>Time</th><th class="right">Value</th><th class="right">Payout</th><th></th></tr></thead><tbody>
    ${losses.map(k => html`<tr><td>${icon(k.shipTypeId)}${k.ship}</td><td>${k.victim}</td><td>${k.system}</td><td class="nowrap">${fmtDate(k.time)}</td><td class="right num">${fmtCompact(k.totalValue)}</td>
      <td class="right num">${fmtCompact(srpPayout(k.totalValue, k.hullValue, k.ship))}</td><td><button class="btn btn-ghost" style="padding:3px 9px" data-srp-add="${k.id}">Create</button></td></tr>`)}</tbody></table>` : emptyBox('Every recent loss already has a request'));
  box.querySelectorAll('[data-srp-add]').forEach(b => b.onclick = async () => {
    try { await srpCreateFromKill(r.data.find(k => k.id === Number(b.dataset.srpAdd))); b.closest('tr').remove(); toast('Request created'); } catch (e) { toast(e.message, true); }
  });
  const obs = new MutationObserver(() => { if (!document.getElementById('modal')) { obs.disconnect(); render(); } });
  obs.observe(document.body, { childList: true });
}

function srpRulesModal() {
  const r = corpState.ws.srpRules;
  openModal('SRP payout rules', html`
    <div class="grid grid-2">${field('Payout percentage', inputNum('percent', r.percent))}${field('Maximum payout (ISK, 0 = none)', inputNum('maxPayout', r.maxPayout))}</div>
    ${checkbox('includeFit', 'Include fitted modules & cargo (otherwise hull only)', r.includeFit)}
    ${field('Fixed payouts by ship', textarea('overrides', Object.entries(r.shipOverrides || {}).map(([k, v]) => `${k} = ${v}`).join('\n'), 5), 'One per line, e.g. "Ishtar = 250000000". Overrides the percentage rule.')}
    <div class="dim">Values use CCP's average market prices for the hull and destroyed/dropped items on the killmail.</div>`, {
    onSubmit: async d => {
      const shipOverrides = {};
      for (const line of d.overrides.split('\n')) { const m = line.match(/^\s*(.+?)\s*=\s*([\d,_.]+)\s*$/); if (m) shipOverrides[m[1]] = Number(m[2].replace(/[,_]/g, '')); }
      const res = await api.ws.setSrpRules({ percent: Number(d.percent) || 0, maxPayout: Number(d.maxPayout) || 0, includeFit: d.includeFit, shipOverrides });
      if (!res.ok) throw new Error(res.error);
      corpState.ws.srpRules = res.data; toast('Rules saved'); render();
    }
  });
}

function srpDecide(id, status) {
  const r = corpState.ws.srp.find(x => x.id === id);
  openModal(`${humanize(status)}: ${r.pilot}, ${r.ship}`, html`
    ${status !== 'rejected' ? field('Payout (ISK)', inputNum('payout', r.payout)) : ''}
    ${field(status === 'rejected' ? 'Reason' : 'Note', inputText('note', r.decisionNote || '', status === 'rejected' ? 'e.g. Not on a corp fleet' : ''))}
    ${checkbox('ping', 'Post decision to the Discord SRP channel', true)}`, {
    submit: humanize(status),
    onSubmit: async d => {
      await ws('upsert', 'srp', { ...r, status, payout: d.payout !== undefined ? Number(d.payout) || 0 : r.payout, decisionNote: d.note, decidedAt: new Date().toISOString() }, d.ping ? 'srp' : null);
      await loadWs(); toast('SRP updated'); render();
    }
  });
}

// ================= Recruitment =================

const HR_STATUSES = ['new', 'interview', 'on hold', 'accepted', 'rejected', 'withdrawn'];

function cHr() {
  const f = corpState.hrFilter;
  const apps = corpState.ws.hr.filter(a => f === 'all' || (f === 'open' ? !['accepted', 'rejected', 'withdrawn'].includes(a.status) : a.status === f))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  setContent(html`
    <div class="toolbar"><button class="btn btn-primary" data-hr-new>+ New application</button><button class="btn btn-ghost" id="hr-vet-all" title="Runs the spy check on open applications without a recent result">Spy-check open applications</button>
      <div class="seg">${['open', 'accepted', 'rejected', 'all'].map(k => html`<button data-hf="${k}" class="${f === k ? 'active' : ''}">${humanize(k)} (${k === 'all' ? corpState.ws.hr.length : corpState.ws.hr.filter(a => k === 'open' ? !['accepted', 'rejected', 'withdrawn'].includes(a.status) : a.status === k).length})</button>`)}</div></div>
    <div class="panel" style="padding:0">${apps.length ? html`<table><thead><tr><th>Applicant</th><th>Current corp</th><th class="right">Age</th><th class="right">Corps</th><th>Spy check</th><th>Audit</th><th>Recruiter</th><th>Status</th><th>Applied</th></tr></thead><tbody>
      ${apps.map(a => html`<tr class="clickable" data-hr="${a.id}"><td>${charImg(a.characterId)}<b>${a.name}</b></td><td class="muted">${a.corporation}${a.alliance ? html`<div class="dim">${a.alliance}</div>` : ''}</td>
        <td class="right num">${a.birthday ? Math.floor((Date.now() - Date.parse(a.birthday)) / (365.25 * 86400000) * 10) / 10 + 'y' : ''}</td><td class="right num">${a.corpCount}</td>
        <td>${a.vet ? html`<span class="badge ${a.vet.tone}" title="Risk ${a.vet.risk}/100, checked ${fmtDay(a.vet.at)}">${a.vet.label}</span>` : raw('<span class="dim">—</span>')}</td>
        <td>${corpState.ws.audits[a.characterId] ? raw('<span class="badge green">Attached</span>') : raw('<span class="badge">None</span>')}</td>
        <td>${a.recruiter || ''}</td><td><span class="badge ${{ accepted: 'green', rejected: 'red', interview: 'accent', new: 'gold' }[a.status] || ''}">${humanize(a.status)}</span></td><td class="nowrap">${fmtDay(a.createdAt)}</td></tr>`)}</tbody></table>` : emptyBox('No applications')}</div>`);
  $('#hr-vet-all').onclick = async () => {
    const todo = corpState.ws.hr.filter(a => !['accepted', 'rejected', 'withdrawn'].includes(a.status) && (!a.vet || Date.now() - Date.parse(a.vet.at) > 86400000));
    if (!todo.length) return toast('All open applications were checked in the last day.');
    const b = $('#hr-vet-all'); b.disabled = true;
    for (let i = 0; i < todo.length; i++) {
      b.textContent = `Checking ${i + 1}/${todo.length}…`;
      const r = await api.pilot.vet(todo[i].characterId, state.directorId || null);
      if (r.ok) await ws('upsert', 'hr', { ...todo[i], vet: { risk: r.data.risk, label: r.data.label, tone: r.data.tone, at: r.data.at, reasons: r.data.reasons.slice(0, 8) } });
    }
    await loadWs(); toast(`Spy-checked ${todo.length} application${todo.length > 1 ? 's' : ''}`); render();
  };
}

function hrNewModal() {
  openModal('New application', html`
    ${field('Applicant character name', inputText('name', '', 'Exact in-game name'))}
    ${field('Recruiter', inputText('recruiter', ''))}
    ${field('Notes', textarea('note', '', 3))}
    ${checkbox('ping', 'Post to the Discord recruitment channel', true)}
    <div class="dim">Public background (employment history, character age, security status) is looked up automatically. Ask the applicant to export an audit from EVE Toolkit for skills and assets.</div>`, {
    submit: 'Look up & create',
    onSubmit: async d => {
      if (!d.name.trim()) throw new Error('Enter the applicant\'s character name.');
      const r = await api.corp.lookupCharacter(d.name);
      if (!r.ok) throw new Error(r.error);
      const c = r.data;
      if (corpState.ws.hr.some(a => a.characterId === c.id && !['accepted', 'rejected', 'withdrawn'].includes(a.status))) throw new Error(`${c.name} already has an open application.`);
      await ws('upsert', 'hr', { characterId: c.id, name: c.name, corporation: c.corporation, alliance: c.alliance, birthday: c.birthday, securityStatus: c.securityStatus, corpCount: c.corpCount, history: c.history,
        recruiter: d.recruiter, status: 'new', notes: d.note ? [{ at: new Date().toISOString(), by: d.recruiter || 'Recruiter', text: d.note }] : [], auditAttached: !!corpState.ws.audits[c.id] }, d.ping ? 'hr' : null);
      await loadWs(); toast('Application created'); render();
    }
  });
}

function hrDetail(id) {
  const a = corpState.ws.hr.find(x => x.id === id);
  const au = corpState.ws.audits[a.characterId];
  openModal(`Application: ${a.name}`, html`
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:14px"><img src="${portrait(a.characterId, 128)}" width="72" height="72" style="border-radius:6px" alt="">
      <div><div style="font-size:17px">${a.name}</div><div class="muted">${a.corporation}${a.alliance ? ' · ' + a.alliance : ''}</div>
      <div class="tags" style="margin-top:6px"><span class="badge">Born ${fmtDay(a.birthday)}</span><span class="badge ${a.securityStatus < 0 ? 'red' : 'accent'}">Sec ${Number(a.securityStatus).toFixed(2)}</span><span class="badge">${a.corpCount} corps</span>
        <a href="#" class="badge" data-link="https://zkillboard.com/character/${a.characterId}/">zKillboard ↗</a><a href="#" class="badge" data-link="https://evewho.com/character/${a.characterId}">EveWho ↗</a></div></div></div>
    <div class="grid grid-2">
      <div><div id="hr-vet-box">${a.vet ? html`<div style="margin-bottom:12px"><span class="badge ${a.vet.tone}">Spy check: ${a.vet.label} · ${a.vet.risk}</span> <span class="dim" style="font-size:12px">${fmtDay(a.vet.at)}</span>
          <ul style="margin:6px 0 0;padding-left:18px;font-size:12.5px">${(a.vet.reasons || []).map(r => html`<li>${r.text}</li>`)}</ul></div>` : ''}</div>
        <button type="button" class="btn btn-ghost" id="hr-vet" style="margin-bottom:12px">${a.vet ? 'Re-run spy check' : 'Run spy check'}</button>
        <h3 class="mh">Employment history</h3>${(a.history || []).slice(0, 15).map(h => html`<div class="skill-row"><span>${h.corporation}</span><span class="dim">${fmtDay(h.start)} – ${h.end ? fmtDay(h.end) : 'now'}</span></div>`)}
        <h3 class="mh" style="margin-top:14px">Audit</h3>
        ${au ? html`<div>${fmtNum(au.summary.totalSp)} SP · ${fmtCompact(au.summary.wallet)} ISK wallet · ${au.summary.assetValue !== null ? fmtCompact(au.summary.assetValue) + ' ISK assets' : ''}</div><button type="button" class="btn btn-ghost" style="margin-top:6px" data-audit-open="${a.characterId}">Open full audit</button>`
          : html`<div class="muted">No audit attached. Ask the applicant to export one from EVE Toolkit, then import it under Member Audit.</div>`}</div>
      <div><h3 class="mh">Notes</h3><div style="max-height:220px;overflow:auto">${(a.notes || []).map(n => html`<div style="border-bottom:1px solid var(--line);padding:6px 0"><div class="dim" style="font-size:12px">${n.by} · ${fmtDate(n.at)}</div><div style="white-space:pre-wrap">${n.text}</div></div>`)}</div>
        ${field('Add note', textarea('note', '', 2))}
        <div class="grid grid-2">${field('Status', select('status', HR_STATUSES.map(s => [s, humanize(s)]), a.status))}${field('Your name', inputText('by', a.recruiter || ''))}</div>
        ${checkbox('ping', 'Post status changes to Discord', true)}</div>
    </div>`, {
    wide: true, submit: 'Save',
    extraButtons: `<button type="button" class="btn btn-danger" id="hr-del">Delete</button>`,
    onSubmit: async d => {
      const notes = [...(a.notes || [])];
      if (d.note.trim()) notes.push({ at: new Date().toISOString(), by: d.by || 'Recruiter', text: d.note.trim() });
      const changed = d.status !== a.status;
      await ws('upsert', 'hr', { ...a, status: d.status, notes, recruiter: a.recruiter || d.by, auditAttached: !!corpState.ws.audits[a.characterId] }, changed && d.ping ? 'hr' : null);
      await loadWs(); toast('Application updated'); render();
    }
  });
  $('#hr-del').onclick = async () => { await ws('remove', 'hr', id); await loadWs(); closeModal(); render(); };
  $('#hr-vet').onclick = async () => {
    const box = $('#hr-vet-box'); box.innerHTML = String(loadingView('Checking…'));
    const r = await api.pilot.vet(a.characterId, state.directorId || null);
    if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
    a.vet = { risk: r.data.risk, label: r.data.label, tone: r.data.tone, at: r.data.at, reasons: r.data.reasons.slice(0, 8) };
    await ws('upsert', 'hr', { ...a });
    box.innerHTML = String(vetView(r.data));
    await loadWs();
  };
}

// ================= Discord =================

async function cDiscord() {
  const d = corpState.ws.discord;
  const KINDS = [['ops', 'Ops & fleets'], ['timers', 'Timers'], ['structures', 'Structure alerts & fuel'], ['srp', 'SRP decisions'], ['hr', 'Recruitment']];
  setContent(html`
    <div style="max-width:900px">
    <div class="panel"><h3>Channel webhooks</h3>
      <div class="dim" style="margin-bottom:10px">In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy URL. Use the same URL for several kinds if you like.</div>
      ${KINDS.map(([k, l]) => html`<div class="field"><label>${l}</label><div style="display:flex;gap:8px"><input type="text" id="wh-${k}" value="${d.webhooks[k] || ''}" placeholder="https://discord.com/api/webhooks/…" spellcheck="false" style="max-width:none;flex:1"><button class="btn btn-ghost" data-wh-test="${k}">Test</button></div></div>`)}
      <label class="check"><input type="checkbox" id="dc-alerts" ${raw(d.alertStructures ? 'checked' : '')}> Post structure attacks, reinforcements and low fuel (checked every 5 minutes while the app runs)</label>
      <div class="field"><label>Low-fuel warning (days)</label><input type="number" id="dc-fuel" value="${d.fuelWarnDays}" min="1" max="30" style="max-width:120px"></div>
      <label class="check"><input type="checkbox" id="dc-remind" ${raw(d.remindOps ? 'checked' : '')}> Remind 30 minutes before ops and 60 minutes before timers</label>
    </div>
    <div class="panel"><h3>Role sync (bot)</h3>
      <ol class="steps" style="margin-bottom:12px"><li>Create an application at <a href="#" data-link="https://discord.com/developers/applications">discord.com/developers</a> → Bot → Reset Token, and copy it.</li>
        <li>Invite it to your server with the <b>Manage Roles</b> permission. Its role must sit <b>above</b> the roles it manages.</li>
        <li>Paste the token and your server ID below, click <b>Load roles</b>, then pick the roles.</li>
        <li>Link members to their Discord accounts on the <b>Members</b> page.</li></ol>
      <div class="field"><label>Bot token ${d.hasBotToken ? raw('<span class="badge green">saved</span>') : ''}</label><input type="text" id="dc-token" placeholder="${d.hasBotToken ? '•••••••• (leave blank to keep)' : 'Paste bot token'}" spellcheck="false"></div>
      <div class="field"><label>Server (guild) ID</label><div style="display:flex;gap:8px"><input type="text" id="dc-guild" value="${d.guildId}" spellcheck="false" style="max-width:300px"><button class="btn btn-ghost" id="dc-load">Load roles</button></div></div>
      <div id="dc-roles">
        <div class="grid grid-2">${field('Member role (corp members)', inputText('memberRoleId', d.memberRoleId))}${field('Alliance role (optional)', inputText('allianceRoleId', d.allianceRoleId))}</div>
      </div>
      <label class="check"><input type="checkbox" id="dc-sync" ${raw(d.syncEnabled ? 'checked' : '')}> Sync automatically every 6 hours while the app is running</label>
      <div class="dim">Linked members: ${Object.keys(d.links).length}. Last sync: ${d.lastSync ? fmtDate(d.lastSync) : 'never'}${d.lastSyncResult ? ` · +${d.lastSyncResult.added} / −${d.lastSyncResult.removed} roles, ${d.lastSyncResult.missing} not in server${d.lastSyncResult.errors.length ? ', errors: ' + d.lastSyncResult.errors.join('; ') : ''}` : ''}</div>
    </div>
    <div style="display:flex;gap:10px"><button class="btn btn-primary" id="dc-save">Save Discord settings</button><button class="btn btn-ghost" id="dc-syncnow">Sync roles now</button></div>
    </div>`);
  const collect = () => {
    const p = { webhooks: {}, alertStructures: $('#dc-alerts').checked, remindOps: $('#dc-remind').checked, fuelWarnDays: $('#dc-fuel').value, syncEnabled: $('#dc-sync').checked, guildId: $('#dc-guild').value };
    for (const [k] of KINDS) p.webhooks[k] = $('#wh-' + k).value;
    const mr = document.querySelector('[name=memberRoleId]'), ar = document.querySelector('[name=allianceRoleId]');
    p.memberRoleId = mr ? mr.value : ''; p.allianceRoleId = ar ? ar.value : '';
    if ($('#dc-token').value.trim()) p.botToken = $('#dc-token').value;
    return p;
  };
  const save = async () => { const r = await api.discord.set(collect()); if (!r.ok) { toast(r.error, true); return false; } corpState.ws.discord = r.data; return true; };
  $('#dc-save').onclick = async () => { if (await save()) { toast('Discord settings saved'); cDiscord(); } };
  document.querySelectorAll('[data-wh-test]').forEach(b => b.onclick = async () => { if (!(await save())) return; const r = await api.discord.test(b.dataset.whTest); toast(r.ok ? (r.data.skipped ? 'No webhook set' : 'Test message sent') : r.error, !r.ok); });
  $('#dc-load').onclick = async () => {
    if (!(await save())) return;
    const r = await api.discord.guild();
    if (!r.ok) return toast(r.error, true);
    const opts = [['', '(none)'], ...r.data.roles.map(x => [x.id, x.name])];
    $('#dc-roles').innerHTML = String(html`<div class="notice" style="background:var(--accent-dim);border-color:var(--accent-line);color:var(--text)">Connected to <b>${r.data.name}</b></div>
      <div class="grid grid-2">${field('Member role (corp members)', select('memberRoleId', opts, corpState.ws.discord.memberRoleId))}${field('Alliance role (optional)', select('allianceRoleId', opts, corpState.ws.discord.allianceRoleId))}</div>`);
  };
  $('#dc-syncnow').onclick = async () => {
    if (!(await save())) return;
    toast('Syncing roles…');
    const r = await api.discord.sync();
    if (!r.ok) return toast(r.error, true);
    toast(`Role sync: +${r.data.added} / −${r.data.removed}, ${r.data.missing} not in server`);
    await loadWs(); cDiscord();
  };
}

// ================= Share / backup =================

function cShare() {
  const w = corpState.ws;
  setContent(html`<div style="max-width:820px">
    <div class="panel"><h3>Share with other officers</h3>
      <p class="muted" style="margin-top:0">Corp mode runs on this PC without a server. To share ops, timers, fleet participation, SRP, recruitment, imported audits and Discord settings (except the bot token), export a workspace file and have officers import it. Imports merge: newer changes win, nothing is deleted.</p>
      <div style="display:flex;gap:10px"><button class="btn btn-primary" id="ws-export">Export workspace…</button><button class="btn btn-ghost" data-action="import-files">Import workspace or audit files…</button></div>
    </div>
    <div class="panel"><h3>Live sync through a shared folder</h3>
      <p class="muted" style="margin-top:0">Point every officer's EVE Toolkit at the same OneDrive, Dropbox, Google Drive or network folder. Each PC writes its own file there and merges everyone else's every minute, including deletions. No server needed.</p>
      <div id="sync-box">${loadingView('')}</div></div>
    <div class="panel"><h3>What's in this workspace</h3><div class="kv">
      <span class="k">Ops</span><span>${w.ops.length}</span><span class="k">Timers</span><span>${w.timers.length}</span>
      <span class="k">Tracked fleets</span><span>${w.fleets.length}</span><span class="k">SRP requests</span><span>${w.srp.length}</span>
      <span class="k">Applications</span><span>${w.hr.length}</span><span class="k">Member audits</span><span>${Object.keys(w.audits).length}</span>
      <span class="k">Discord links</span><span>${Object.keys(w.discord.links).length}</span></div></div>
    <div class="foot-note">Export files contain member audit data (skills, wallets, assets). Share them only with trusted officers.</div></div>`);
  drawSyncBox();
  $('#ws-export').onclick = async () => { const r = await api.ws.exportFile(); if (!r.ok) return toast(r.error, true); if (r.data) toast('Exported to ' + r.data); };
}

async function drawSyncBox() {
  const box = $('#sync-box'); if (!box) return;
  const r = await api.corpx.sync();
  const sy = r.ok ? r.data : {};
  box.innerHTML = String(html`${sy.folder ? html`<div class="kv" style="margin-bottom:10px"><span class="k">Folder</span><span><code>${sy.folder}</code></span><span class="k">This PC</span><span>${sy.machine}</span>
      <span class="k">Last merge</span><span>${sy.lastSync ? fmtDate(sy.lastSync) : 'never'}</span>${sy.lastError ? html`<span class="k">Problem</span><span class="neg">${sy.lastError}</span>` : ''}</div>` : html`<div class="muted" style="margin-bottom:10px">Not syncing.</div>`}
    <div style="display:flex;gap:10px"><button class="btn btn-primary" id="sync-pick">${sy.folder ? 'Change folder…' : 'Choose shared folder…'}</button>${sy.folder ? html`<button class="btn btn-ghost" id="sync-now">Sync now</button><button class="btn btn-danger" id="sync-off">Stop syncing</button>` : ''}</div>`);
  $('#sync-pick').onclick = async () => { const x = await api.corpx.setSyncFolder(true); if (!x.ok) toast(x.error, true); await loadWs(); drawSyncBox(); };
  const now = $('#sync-now'); if (now) now.onclick = async () => { const x = await api.corpx.syncNow(); if (x.ok) toast(`Merged ${x.data.merged || 0} change(s)`); await loadWs(); drawSyncBox(); };
  const off = $('#sync-off'); if (off) off.onclick = async () => { await api.corpx.setSyncFolder(false); drawSyncBox(); };
}
if (window.api && api.corpx) api.corpx.onSynced(async () => { await loadWs(); if (state.view === 'corp') toast('Workspace updated from shared folder'); });

async function importFiles() {
  const r = await api.ws.importFiles();
  if (!r.ok) return toast(r.error, true);
  if (!r.data) return;
  const msgs = r.data.map(x => x.error ? `${x.file.split(/[\\/]/).pop()}: ${x.error}` : x.kind === 'audit' ? `${x.character.name} audit ${x.skipped ? '(older, skipped)' : 'imported'}` : `Workspace merged (${Object.entries(x.counts).filter(([, n]) => n).map(([k, n]) => n + ' ' + k).join(', ') || 'no changes'})`);
  toast(msgs.join(' · '), r.data.some(x => x.error));
  await loadWs();
  render();
}

// ================= Events =================

document.addEventListener('click', async e => {
  const t = e.target;
  const q = sel => t.closest(sel);
  let el;
  if ((el = q('[data-ctab-go]'))) { state.corpTab = el.dataset.ctabGo; go('corp'); return; }
  if (q('[data-action="add-director"]')) { addCharacter(true); return; }
  if (q('[data-action="import-files"]')) { importFiles(); return; }
  if ((el = q('[data-dlink]'))) { linkDiscordModal(Number(el.dataset.dlink), el.dataset.dname); return; }
  if ((el = q('[data-setmain]'))) {
    const id = Number(el.dataset.setmain);
    const opts = [['', '(This is a main)'], ...(corpState.memberList || []).filter(x => x.id !== id).map(x => [x.id, x.name])];
    openModal(`Main for ${el.dataset.dname}`, field('This pilot is an alt of', select('main', opts, corpState.ws.alts[id] || '')), { onSubmit: async d => { const r = await api.corpx.setAlt(id, d.main ? Number(d.main) : null); if (!r.ok) throw new Error(r.error); corpState.ws.alts = r.data; render(); } });
    return;
  }
  if ((el = q('[data-unaudit]'))) { e.stopPropagation(); await api.ws.removeAudit(Number(el.dataset.unaudit)); await loadWs(); cAudit(); return; }
  if ((el = q('[data-audit]'))) { auditDetail(Number(el.dataset.audit)); return; }
  if ((el = q('[data-audit-open]'))) { auditDetail(Number(el.dataset.auditOpen)); return; }
  if (q('[data-op-new]')) { opModal(); return; }
  if ((el = q('[data-op-edit]'))) { opModal(corpState.ws.ops.find(o => o.id === el.dataset.opEdit)); return; }
  if ((el = q('[data-op-track]'))) { state.corpTab = 'c-fleet'; renderTopbar(); const st = await api.fleet.status(); corpState.fleetLive = st.ok ? st.data : null; drawFleet(el.dataset.opTrack); return; }
  if ((el = q('[data-fleet]'))) { fleetDetail(el.dataset.fleet); return; }
  if (q('[data-timer-new]')) { timerModal(); return; }
  if ((el = q('[data-timer-edit]'))) { timerModal(corpState.ws.timers.find(x => x.id === el.dataset.timerEdit)); return; }
  if ((el = q('[data-tf]'))) { corpState.timerFilter = el.dataset.tf; cTimers(); return; }
  if ((el = q('[data-note-timer]'))) {
    const n = (corpState.lastNotes || []).find(x => x.id === Number(el.dataset.noteTimer));
    if (n) timerModal({ structure: '', type: n.structureType || '', system: n.system || '', timerType: n.type === 'StructureLostShields' ? 'Armor' : n.type === 'StructureLostArmor' ? 'Hull' : n.type.includes('Anchor') ? 'Anchoring' : 'Other', owner: 'Friendly', objective: 'Defend', time: n.timerEnd, notes: `From notification: ${n.typeLabel}` });
    return;
  }
  if ((el = q('[data-kf]'))) { corpState.killFilter = el.dataset.kf; cKills(corpState.lastKills || []); return; }
  if ((el = q('[data-wdiv]'))) { corpState.walletDiv = Number(el.dataset.wdiv); render(); return; }
  if ((el = q('[data-sf]'))) { corpState.srpFilter = el.dataset.sf; cSrp(); return; }
  if (q('[data-srp-link]')) { srpLinkModal(); return; }
  if (q('[data-srp-eligible]')) { srpEligibleModal(); return; }
  if (q('[data-srp-rules]')) { srpRulesModal(); return; }
  if ((el = q('[data-srp-act]'))) { srpDecide(el.dataset.id, el.dataset.srpAct); return; }
  if ((el = q('[data-hf]'))) { corpState.hrFilter = el.dataset.hf; cHr(); return; }
  if (q('[data-hr-new]')) { hrNewModal(); return; }
  if ((el = q('[data-hr]'))) { hrDetail(el.dataset.hr); return; }
  if ((el = q('[data-export-audit]'))) {
    const r = await api.exportAudit(Number(el.dataset.exportAudit));
    if (!r.ok) return toast(r.error, true);
    if (r.data) toast('Audit saved. Send this file to your corp: ' + r.data);
  }
});

if (window.api && api.fleet) api.fleet.onUpdate(snap => {
  corpState.fleetLive = snap;
  if (state.view === 'corp' && state.corpTab === 'c-fleet' && !document.getElementById('modal')) drawFleet();
});
