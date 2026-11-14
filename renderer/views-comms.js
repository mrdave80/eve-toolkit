'use strict';
/* Mail across all pilots, writing and replying, and calendar responses. */

const inboxState = { data: null, sel: null, filter: 'all', q: '' };

/** Compose (or reply). pre: { charId, to, subject, body } */
function openComposeMail(pre = {}) {
  const senders = state.characters.filter(c => !c.needsReauth);
  const can = c => c.canSendMail;
  const first = senders.find(c => c.id === pre.charId && can(c)) || senders.find(can) || senders[0];
  if (!first) return toast('Add a pilot first.', true);
  openModal(pre.subject ? 'Reply' : 'New mail', html`
    ${field('From', select('charId', senders.map(c => [c.id, c.name + (can(c) ? '' : ' (not allowed to send yet)')]), first.id))}
    ${field('To', inputText('to', pre.to || '', 'Pilot, corporation or alliance names, separated by commas'))}
    ${field('Subject', inputText('subject', pre.subject || ''))}
    ${field('Message', textarea('body', pre.body || '', 10))}
    ${senders.some(can) ? '' : html`<div class="notice" style="margin:0">To send mail from the app, turn on <b>Sending</b> in Settings → In-game control and re-authorise your pilots. You can still use “Open in game”.</div>`}`, {
    submit: 'Send', wide: true,
    extraButtons: String(html`<button type="button" class="btn btn-ghost" id="cm-ingame" title="Opens EVE's mail window with this filled in (needs in-game control)">Open in game instead</button>`),
    onSubmit: async d => {
      const c = senders.find(x => x.id === Number(d.charId));
      if (!can(c)) { toast(`${c.name} can't send mail from the app yet. Turn on Sending in Settings → In-game control, then re-authorise.`, true); return true; }
      const r = await api.comms.send(c.id, { to: d.to, subject: d.subject, body: d.body });
      if (!r.ok) { toast(r.error, true); return true; }
      toast(`Sent to ${r.data.to.join(', ')}`);
    }
  });
  const ig = document.getElementById('cm-ingame');
  if (ig) ig.onclick = async () => {
    const f = document.querySelector('#modal form'); const d = Object.fromEntries(new FormData(f).entries());
    const r = await api.ui.mail(Number(d.charId), [], d.subject, d.body);
    toast(r.ok ? `Mail window opened in game for ${r.data.pilot}. Add the recipients there.` : r.error, !r.ok);
  };
}

const quoteMail = (m, text) => `\n\n--- ${m.fromName} wrote on ${fmtDate(m.timestamp)} ---\n${text}`;

async function showMailMessage(box, charId, mailId, listItem) {
  box.innerHTML = String(loadingView('Loading message…'));
  const r = await api.mailBody(charId, mailId);
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  const m = r.data, text = eveMailToText(m.body);
  const c = state.characters.find(x => x.id === charId) || {};
  box.innerHTML = String(html`<h2>${m.subject || '(no subject)'}</h2>
    <div class="muted">From <a href="#" data-pilot="${m.from}">${m.fromName}</a> · ${fmtDate(m.timestamp)}</div>
    <div class="dim" style="font-size:12px">To: ${m.recipientNames.join(', ')}${listItem && listItem.alsoTo && listItem.alsoTo.length ? ` · also in ${listItem.alsoTo.join(', ')}'s inbox` : ''}</div>
    <div style="display:flex;gap:6px;margin:10px 0"><button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" id="mv-reply">Reply</button>
      <button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" id="mv-replyall">Reply to all</button>
      <button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" id="mv-fwd">Forward</button>
      ${c.canWrite ? html`<button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" id="mv-unread">Mark unread</button>` : ''}</div>
    <div class="mail-body"></div>`);
  box.querySelector('.mail-body').textContent = text;
  const subj = s => /^re:/i.test(s) ? s : 'Re: ' + (s || '');
  box.querySelector('#mv-reply').onclick = () => openComposeMail({ charId, to: m.fromName, subject: subj(m.subject), body: quoteMail(m, text) });
  box.querySelector('#mv-replyall').onclick = () => openComposeMail({ charId, to: [m.fromName, ...m.recipientNames.filter(n => n !== c.name && n !== 'Mailing list')].join(', '), subject: subj(m.subject), body: quoteMail(m, text) });
  box.querySelector('#mv-fwd').onclick = () => openComposeMail({ charId, subject: 'Fwd: ' + (m.subject || ''), body: quoteMail(m, text) });
  const un = box.querySelector('#mv-unread'); if (un) un.onclick = async () => { const x = await api.comms.markRead(charId, mailId, false); toast(x.ok ? 'Marked unread' : x.error, !x.ok); if (x.ok && listItem) listItem.is_read = false; };
  // Opening a message marks it read in EVE too, when the pilot allows it
  if (listItem && !listItem.is_read && c.canWrite) { listItem.is_read = true; api.comms.markRead(charId, mailId, true); document.querySelectorAll(`[data-imail="${charId}:${mailId}"]`).forEach(el => el.classList.remove('unread')); }
}

async function renderMailAll(stillCurrent) {
  if (!inboxState.data) {
    setContent(loadingView('Reading every pilot’s mail…'));
    const r = await api.comms.inbox();
    if (stillCurrent && !stillCurrent()) return;
    if (!r.ok) return setContent(errorView(r));
    inboxState.data = r.data;
  }
  drawMailAll();
}

function drawMailAll() {
  const d = inboxState.data, s = inboxState;
  const pilots = [...new Set(d.mails.map(m => m.pilot))];
  const q = s.q.trim().toLowerCase();
  const rows = d.mails.filter(m => (s.filter === 'all' || (s.filter === 'unread' ? !m.is_read : m.pilot === s.filter)) && (!q || `${m.subject} ${m.fromName}`.toLowerCase().includes(q)));
  setContent(html`<div class="toolbar"><button class="btn btn-primary" id="mi-new">✎ New mail</button><button class="btn btn-ghost" id="mi-refresh">⟳ Refresh</button>
      <select id="mi-filter" class="crumb-select" style="width:auto">${[['all', 'All pilots'], ['unread', `Unread (${d.unread})`], ...pilots.map(p => [p, p])].map(([v, l]) => html`<option value="${v}" ${raw(s.filter === v ? 'selected' : '')}>${l}</option>`)}</select>
      <input type="search" id="mi-q" value="${s.q}" placeholder="Search subject or sender" style="width:240px;min-width:0">
      ${d.errors.length ? html`<span class="badge gold" title="${d.errors.map(e => e.pilot + ': ' + e.error).join('\n')}">${d.errors.length} pilot${d.errors.length === 1 ? '' : 's'} couldn’t load</span>` : ''}</div>
    <div class="mail-layout">
      <div class="mail-list">${rows.length ? rows.map(m => html`<div class="mail-row ${m.is_read ? '' : 'unread'} ${s.sel === m.charId + ':' + m.mail_id ? 'active' : ''}" data-imail="${m.charId}:${m.mail_id}">
        <div class="from">${m.fromName} · ${fmtDate(m.timestamp)}</div><div class="subj">${m.subject || '(no subject)'}</div>
        <div class="dim" style="font-size:11px">${m.pilot}${m.alsoTo.length ? ` +${m.alsoTo.length}` : ''}</div></div>`) : html`<div class="empty">No mail</div>`}</div>
      <div class="mail-view" id="mi-view"><div class="empty">${d.unread} unread across ${pilots.length} pilot${pilots.length === 1 ? '' : 's'}<br>Select a message</div></div></div>`);
  $('#mi-new').onclick = () => openComposeMail();
  $('#mi-refresh').onclick = () => { inboxState.data = null; renderMailAll(); };
  $('#mi-filter').onchange = e => { s.filter = e.target.value; drawMailAll(); };
  let t = null; $('#mi-q').oninput = e => { s.q = e.target.value; clearTimeout(t); t = setTimeout(() => { drawMailAll(); const i = $('#mi-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
  document.querySelectorAll('[data-imail]').forEach(el => el.onclick = () => {
    document.querySelectorAll('.mail-row').forEach(x => x.classList.remove('active')); el.classList.add('active');
    s.sel = el.dataset.imail;
    const [cid, mid] = el.dataset.imail.split(':').map(Number);
    showMailMessage($('#mi-view'), cid, mid, d.mails.find(m => m.charId === cid && m.mail_id === mid));
  });
}

/** Calendar response buttons, for viewCalendar. */
function calendarResponseCell(e, c) {
  const canRespond = c && c.canRespond;
  const cur = e.response;
  if (!canRespond || !['not_responded', 'accepted', 'declined', 'tentative'].includes(cur)) return html`${humanize(cur)}`;
  const b = (v, l) => html`<button type="button" class="btn ${cur === v ? 'btn-primary' : 'btn-ghost'}" style="padding:1px 8px;font-size:11.5px" data-cal-resp="${e.id}" data-v="${v}">${l}</button>`;
  return html`<div style="display:flex;gap:4px">${b('accepted', 'Accept')}${b('tentative', 'Maybe')}${b('declined', 'Decline')}</div>`;
}
function wireCalendarResponses(list, c) {
  document.querySelectorAll('[data-cal-resp]').forEach(b => b.onclick = async () => {
    const r = await api.comms.respond(c.id, Number(b.dataset.calResp), b.dataset.v);
    if (!r.ok) return toast(r.error, true);
    const e = list.find(x => x.id === Number(b.dataset.calResp)); if (e) e.response = b.dataset.v;
    toast({ accepted: 'Accepted', tentative: 'Marked as maybe', declined: 'Declined' }[b.dataset.v]);
    viewCalendar(list, c);
  });
}

// ================= Contracts and notifications, all pilots =================

const allBoards = { contracts: null, notes: null, cf: 'action', cpilot: '', nq: '', npilot: '', ncat: '' };
async function loadForAll(fn) {
  const pilots = state.characters.filter(c => !c.needsReauth);
  const out = []; const errors = [];
  await Promise.all(pilots.map(async c => { const r = await fn(c.id); if (r.ok) out.push(...(r.data || []).map(x => ({ ...x, pilotId: c.id, pilotName: c.name }))); else errors.push(`${c.name}: ${r.error}`); }));
  return { list: out, errors };
}

async function renderContractsAll(stillCurrent, refresh = false) {
  if (!allBoards.contracts || refresh) {
    setContent(loadingView('Reading every pilot’s contracts…'));
    const r = await loadForAll(id => api.contracts(id));
    if (stillCurrent && !stillCurrent()) return;
    // a contract between two of your pilots shows once
    const seen = new Map();
    for (const x of r.list) { const ex = seen.get(x.contract_id); if (!ex) seen.set(x.contract_id, { ...x, pilots: [x.pilotName] }); else ex.pilots.push(x.pilotName); }
    allBoards.contracts = { list: [...seen.values()].sort((a, b) => b.date_issued.localeCompare(a.date_issued)), errors: r.errors };
  }
  drawContractsAll();
}
function contractNeedsAction(x) {
  const mine = new Set(state.characters.map(c => c.id));
  if (x.status === 'outstanding' && mine.has(x.assignee_id) && !mine.has(x.issuer_id)) return 'Waiting for you to accept';
  if (x.status === 'in_progress' && x.type === 'courier' && mine.has(x.acceptor_id)) { const due = Date.parse(x.date_accepted) + (x.days_to_complete || 0) * 86400000; return due < Date.now() ? 'Courier overdue' : 'Courier to deliver by ' + fmtDate(new Date(due).toISOString()); }
  if (mine.has(x.issuer_id) && ['finished_contractor'].includes(x.status)) return 'Finished, collect it';
  if (mine.has(x.issuer_id) && x.status === 'outstanding' && Date.parse(x.date_expired) - Date.now() < 86400000) return 'Expires within a day';
  return null;
}
function drawContractsAll() {
  const d = allBoards.contracts, s = allBoards;
  const pilots = [...new Set(d.list.flatMap(x => x.pilots))].sort();
  const rows = d.list.filter(x => (!s.cpilot || x.pilots.includes(s.cpilot)) && (s.cf === 'all' || (s.cf === 'active' ? ['outstanding', 'in_progress'].includes(x.status) : contractNeedsAction(x))));
  const counts = { action: d.list.filter(contractNeedsAction).length, active: d.list.filter(x => ['outstanding', 'in_progress'].includes(x.status)).length, all: d.list.length };
  setContent(html`<div class="toolbar"><div class="seg">${[['action', 'Needs action'], ['active', 'Active'], ['all', 'All']].map(([k, l]) => html`<button data-cfa="${k}" class="${s.cf === k ? 'active' : ''}">${l} (${counts[k]})</button>`)}</div>
      <select id="ca-pilot" class="crumb-select"><option value="">All pilots</option>${pilots.map(p => html`<option ${raw(p === s.cpilot ? 'selected' : '')}>${p}</option>`)}</select><span style="flex:1"></span><button class="btn btn-ghost" id="ca-refresh">⟳ Refresh</button></div>
    ${d.errors.length ? html`<div class="notice" style="margin-bottom:10px">${d.errors.join(' · ')}</div>` : ''}
    <div class="panel" style="padding:0"><div class="table-wrap">${rows.length ? html`<table><thead><tr><th>Pilot</th><th>Type</th><th>Title</th><th>Status</th><th>From → to</th><th class="right">Price / reward</th><th>Where</th><th>Expires</th></tr></thead><tbody>
      ${rows.map(x => { const act = contractNeedsAction(x); return xRow('cta' + x.contract_id, html`<td>${x.pilots.join(', ')}</td><td class="nowrap">${humanize(x.type)}</td><td>${x.title || raw('<span class="dim">—</span>')}${act ? html`<div class="gold" style="font-size:11.5px">${act}</div>` : ''}</td>
        <td><span class="badge ${CONTRACT_STATUS[x.status] || ''}">${humanize(x.status)}</span></td><td style="font-size:12.5px">${x.issuerName || ''}${x.acceptorName || x.assigneeName ? ' → ' + (x.acceptorName || x.assigneeName) : ''}</td>
        <td class="right num nowrap">${x.price ? fmtCompact(x.price) : ''}${x.reward ? html`<div class="pos">+${fmtCompact(x.reward)}</div>` : ''}${x.collateral ? html`<div class="dim">Coll. ${fmtCompact(x.collateral)}</div>` : ''}</td>
        <td class="muted" style="font-size:12.5px">${x.startName || ''}${x.endName && x.endName !== x.startName ? ' → ' + x.endName : ''}</td><td class="nowrap">${fmtDate(x.date_expired)}</td>`, '', 8,
        { load: async () => { const r = await api.contractItems(x.pilotId, x.contract_id); if (!r.ok) return html`<div class="error">${r.error}</div>`; const its = r.data.items || r.data || []; return its.length ? html`<div style="display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12.5px">${its.map(i => html`<span>${icon(i.typeId || i.type_id, 16)}${fmtNum(i.quantity)} × ${i.name || i.typeName || ''}${i.is_included === false || i.included === false ? html` <span class="dim">(wanted)</span>` : ''}</span>`)}</div>` : html`<div class="dim">No items (ISK only).</div>`; } }); })}</tbody></table>`
      : emptyBox(s.cf === 'action' ? 'Nothing waiting on you.' : 'No contracts.')}</div></div>`);
  document.querySelectorAll('[data-cfa]').forEach(b => b.onclick = () => { s.cf = b.dataset.cfa; drawContractsAll(); });
  $('#ca-pilot').onchange = e => { s.cpilot = e.target.value; drawContractsAll(); };
  $('#ca-refresh').onclick = () => renderContractsAll(null, true);
}

const NOTE_CATS = [['', 'All kinds'], ['structure', 'Structures and sov'], ['war', 'War and kills'], ['corp', 'Corp and alliance'], ['industry', 'Moons, industry and PI'], ['other', 'Other']];
const noteCat = n => { const t = n.type || ''; if (/Structure|Sov|Tower|Citadel|EntosisCapture|Orbital|Skyhook/i.test(t)) return 'structure'; if (/War|Kill|Bounty|FWC|Insurance/i.test(t)) return 'war'; if (/Corp|Alliance|CharApp|CharLeft|CorpApp|Charter/i.test(t)) return 'corp'; if (/Moon|Mining|Industry|Planet|Extraction/i.test(t)) return 'industry'; return 'other'; };
async function renderNotificationsAll(stillCurrent, refresh = false) {
  if (!allBoards.notes || refresh) {
    setContent(loadingView('Reading every pilot’s notifications…'));
    const r = await loadForAll(id => api.notifications(id));
    if (stillCurrent && !stillCurrent()) return;
    // corp-wide notifications reach every pilot in the corp: show each once
    const seen = new Map();
    for (const n of r.list) { const k = (n.type || n.typeLabel) + '|' + n.timestamp + '|' + (n.text || '').slice(0, 200); const ex = seen.get(k); if (!ex) seen.set(k, { ...n, pilots: [n.pilotName] }); else { ex.pilots.push(n.pilotName); ex.isRead = ex.isRead && n.isRead; } }
    allBoards.notes = { list: [...seen.values()].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))), errors: r.errors };
  }
  drawNotificationsAll();
}
function drawNotificationsAll() {
  const d = allBoards.notes, s = allBoards;
  const pilots = [...new Set(d.list.flatMap(x => x.pilots))].sort();
  const q = s.nq.toLowerCase();
  const rows = d.list.filter(n => (!s.npilot || n.pilots.includes(s.npilot)) && (!s.ncat || noteCat(n) === s.ncat) && (!q || `${n.typeLabel} ${n.sender} ${n.text || ''}`.toLowerCase().includes(q)));
  setContent(html`<div class="toolbar"><select id="na-cat" class="crumb-select">${NOTE_CATS.map(([k, l]) => html`<option value="${k}" ${raw(k === s.ncat ? 'selected' : '')}>${l}</option>`)}</select>
      <select id="na-pilot" class="crumb-select"><option value="">All pilots</option>${pilots.map(p => html`<option ${raw(p === s.npilot ? 'selected' : '')}>${p}</option>`)}</select>
      <input type="search" id="na-q" placeholder="Search notifications…" value="${s.nq}" style="min-width:220px"><span style="flex:1"></span><button class="btn btn-ghost" id="na-refresh">⟳ Refresh</button></div>
    ${d.errors.length ? html`<div class="notice" style="margin-bottom:10px">${d.errors.join(' · ')}</div>` : ''}
    <div class="panel" style="padding:0"><div class="table-wrap">${rows.length ? html`<table><thead><tr><th>Received</th><th>What</th><th>From</th><th>Pilots</th></tr></thead><tbody>
      ${rows.slice(0, 300).map((n, i) => xRow('nta' + i + n.timestamp, html`<td class="nowrap">${fmtDate(n.timestamp)}</td><td>${n.isRead ? '' : raw('<span class="badge accent">new</span> ')}${n.typeLabel}</td><td>${n.sender}</td><td class="muted" style="font-size:12.5px">${n.pilots.length > 2 ? n.pilots.length + ' pilots' : n.pilots.join(', ')}</td>`,
        html`<div class="pre" style="white-space:pre-wrap;font-size:12px">${n.text || '(no details)'}</div>`, 4))}</tbody></table>` : emptyBox('No notifications match.')}</div></div>`);
  $('#na-cat').onchange = e => { s.ncat = e.target.value; drawNotificationsAll(); };
  $('#na-pilot').onchange = e => { s.npilot = e.target.value; drawNotificationsAll(); };
  $('#na-q').oninput = e => { s.nq = e.target.value; const pos = e.target.selectionStart; drawNotificationsAll(); const i = $('#na-q'); i.focus(); i.setSelectionRange(pos, pos); };
  $('#na-refresh').onclick = () => renderNotificationsAll(null, true);
}
