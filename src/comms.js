'use strict';
/* Sending: EVE mail (compose, reply, mark read), calendar responses, and an inbox across all pilots.
   Writing needs the opt-in scopes in auth.WRITE_SCOPES. */
const store = require('./store');
const esi = require('./esi');

const pilot = id => (store.get().characters || []).find(c => c.id === Number(id));
function need(charId, scope, what) {
  const c = pilot(charId); if (!c) throw new Error('Unknown pilot.');
  if (!(c.scopes || []).includes(scope)) throw new Error(`${c.name} hasn't allowed ${what} yet. Turn it on in Settings → In-game control, then re-authorise.`);
  return c;
}

/** Names (pilots, corps, alliances) to mail recipients. */
async function recipients(names) {
  const list = [...new Set(names.map(n => String(n).trim()).filter(Boolean))].slice(0, 50);
  if (!list.length) throw new Error('Add at least one recipient.');
  const r = await esi.rawRequest('/universe/ids/', { method: 'POST', body: list });
  const b = r.body || {};
  const found = [
    ...(b.characters || []).map(x => ({ recipient_id: x.id, recipient_type: 'character', name: x.name })),
    ...(b.corporations || []).map(x => ({ recipient_id: x.id, recipient_type: 'corporation', name: x.name })),
    ...(b.alliances || []).map(x => ({ recipient_id: x.id, recipient_type: 'alliance', name: x.name }))
  ];
  const missing = list.filter(n => !found.some(f => f.name.toLowerCase() === n.toLowerCase()));
  if (missing.length) throw new Error(`Not found in EVE: ${missing.join(', ')}`);
  return found;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Plain text to EVE mail markup (EVE mail is a small HTML subset). */
const toEveBody = text => esc(text).replace(/\r?\n/g, '<br>');

async function send(charId, { to, subject, body }) {
  need(charId, 'esi-mail.send_mail.v1', 'sending mail');
  const subj = String(subject || '').trim();
  const text = String(body || '');
  if (!subj) throw new Error('Add a subject.');
  if (subj.length > 1000) throw new Error('The subject is too long.');
  if (!text.trim()) throw new Error('The message is empty.');
  if (text.length > 7000) throw new Error('EVE mail is limited to about 8,000 characters.');
  const rec = await recipients(Array.isArray(to) ? to : String(to || '').split(/[,;\n]/));
  const r = await esi.rawRequest(`/characters/${charId}/mail/`, { charId, method: 'POST', body: { approved_cost: 0, subject: subj, body: toEveBody(text), recipients: rec.map(({ recipient_id, recipient_type }) => ({ recipient_id, recipient_type })) } });
  return { mailId: r.body, to: rec.map(x => x.name) };
}

async function markRead(charId, mailId, read = true) {
  need(charId, 'esi-mail.organize_mail.v1', 'managing mail');
  await esi.rawRequest(`/characters/${charId}/mail/${Number(mailId)}/`, { charId, method: 'PUT', body: { read: !!read } });
  return true;
}

async function respond(charId, eventId, response) {
  if (!['accepted', 'declined', 'tentative'].includes(response)) throw new Error('Pick accept, maybe or decline.');
  need(charId, 'esi-calendar.respond_calendar_events.v1', 'answering calendar invites');
  await esi.rawRequest(`/characters/${charId}/calendar/${Number(eventId)}/`, { charId, method: 'PUT', body: { response } });
  return true;
}

/** Latest mail across every pilot, newest first. */
async function inbox() {
  const chars = (store.get().characters || []).filter(c => !c.needsReauth && (c.scopes || []).includes('esi-mail.read_mail.v1'));
  const res = await Promise.all(chars.map(c => esi.mailList(c.id).then(d => ({ c, d })).catch(e => ({ c, error: e.message }))));
  const mails = [], errors = [];
  for (const { c, d, error } of res) {
    if (error) { errors.push({ pilot: c.name, error }); continue; }
    for (const m of d.mails) mails.push({ ...m, charId: c.id, pilot: c.name });
  }
  // A mail sent to several of your pilots shows once, under the first.
  const seen = new Map();
  for (const m of mails.sort((a, b) => b.timestamp.localeCompare(a.timestamp))) {
    const k = m.mail_id;
    if (seen.has(k)) { seen.get(k).alsoTo.push(m.pilot); continue; }
    seen.set(k, { ...m, alsoTo: [] });
  }
  return { mails: [...seen.values()].slice(0, 400), errors, unread: [...seen.values()].filter(m => !m.is_read).length };
}

module.exports = { send, markRead, respond, inbox, recipients, _toEveBody: toEveBody };
