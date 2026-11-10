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
