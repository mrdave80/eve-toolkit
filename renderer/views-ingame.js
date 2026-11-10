'use strict';
/* In-game control (waypoints, open windows) and phone alert settings. */

/** Pick the pilot to act through: logged in to EVE and with the permission. Returns charId or null (and explains why). */
async function pickUiPilot(kind) {
  const r = await api.ui.pilots();
  if (!r.ok) { toast(r.error, true); return null; }
  const can = r.data.filter(p => kind === 'waypoint' ? p.canWaypoint : p.canOpenWindow);
  if (!can.length) { toast('No pilot has allowed in-game control yet. Turn it on in Settings → In-game control, then re-authorise.', true); return null; }
  const online = can.filter(p => p.online);
  if (!online.length) { toast(`Log in to EVE with ${can.map(p => p.name).join(' or ')} first.`, true); return null; }
  return online[0].id;
}

async function sendWaypoints(path) {
  // Autopilot can't take wormhole or Thera hops, so stop at the first one
  const ids = [];
  for (let i = 1; i < path.length; i++) { if (path[i].via && path[i].via !== 'gate') break; ids.push(path[i].id); }
  if (!ids.length) return toast('The first hop is a wormhole. Autopilot can’t use it.', true);
  const charId = await pickUiPilot('waypoint'); if (!charId) return;
  const r = await api.ui.waypoints(charId, ids.length > 60 ? [ids[ids.length - 1]] : ids);
  if (!r.ok) return toast(r.error, true);
  toast(ids.length < path.length - 1 ? `Sent ${r.data.sent} waypoints to ${r.data.pilot}, stopping before the wormhole hop.` : ids.length > 60 ? `Route is long, so only the destination was set for ${r.data.pilot}.` : `Route sent to ${r.data.pilot} (${r.data.sent} waypoints).`);
}

async function setDestination(systemId) {
  const charId = await pickUiPilot('waypoint'); if (!charId) return;
  const r = await api.ui.waypoints(charId, [systemId]);
  toast(r.ok ? `Destination set for ${r.data.pilot}` : r.error, !r.ok);
}

async function openInGame(kind, id) {
  const charId = await pickUiPilot('window'); if (!charId) return;
  const r = await api.ui.open(charId, kind, id);
  toast(r.ok ? `Opened in game for ${r.data.pilot}` : r.error, !r.ok);
}

async function mailInGame(to, subject, body) {
  const charId = await pickUiPilot('window'); if (!charId) return false;
  const r = await api.ui.mail(charId, to, subject, body);
  toast(r.ok ? `Mail window opened in game for ${r.data.pilot}` : r.error, !r.ok);
  return r.ok;
}

async function drawIngamePanel() {
  const box = $('#ingame-panel'); if (!box) return;
  const st = state.settings || {};
  const pilots = state.characters;
  box.innerHTML = String(html`<h3>In-game control</h3>
    <div class="muted" style="margin-bottom:10px">Lets EVE Toolkit set autopilot waypoints and open contracts, pilot info and mail windows in your running EVE client. Off by default.</div>
    <ol class="steps" style="margin-bottom:10px">
      <li>On <a href="#" data-link="https://developers.eveonline.com/applications">developers.eveonline.com/applications</a>, edit your app and also tick <code>esi-ui.write_waypoint.v1</code> and <code>esi-ui.open_window.v1</code>. Save.</li>
      <li>Turn this on, then click <b>Re-authorise</b> for each pilot under Pilots below.</li></ol>
    <label class="check"><input type="checkbox" id="ig-on" ${raw(st.uiScopes ? 'checked' : '')}> Ask for in-game control when pilots log in</label>
    <div class="pi-chips" style="margin-top:8px">${pilots.map(c => html`<span class="badge ${c.canWaypoint ? 'green' : ''}">${c.name}: ${c.canWaypoint ? 'allowed' : 'not yet'}</span>`)}</div>
    <div class="dim" style="font-size:12px;margin-top:6px">Turn it off again if logins start failing with "invalid scope". That means the app registration is missing the two scopes.</div>
    <h3 class="mh" style="margin-top:18px">Sending</h3>
    <div class="muted" style="margin-bottom:10px">Lets EVE Toolkit send and reply to EVE mail, mark mail read, answer calendar invites and save fits to your in-game fittings. Off by default.</div>
    <ol class="steps" style="margin-bottom:10px"><li>On your app at <a href="#" data-link="https://developers.eveonline.com/applications">developers.eveonline.com</a>, also tick <code>esi-mail.send_mail.v1</code>, <code>esi-mail.organize_mail.v1</code>, <code>esi-calendar.respond_calendar_events.v1</code> and <code>esi-fittings.write_fittings.v1</code>. Save.</li>
      <li>Turn this on, then re-authorise each pilot under Pilots.</li></ol>
    <label class="check"><input type="checkbox" id="wr-on" ${raw(st.writeScopes ? 'checked' : '')}> Ask for sending when pilots log in</label>
    <div class="pi-chips" style="margin-top:8px">${pilots.map(c => html`<span class="badge ${c.canWrite ? 'green' : ''}">${c.name}: ${c.canWrite ? 'allowed' : 'not yet'}</span>`)}</div>`);
  $('#wr-on').onchange = async e => { const r = await api.setSettings({ writeScopes: e.target.checked }); if (!r.ok) return toast(r.error, true); state.settings = r.data; toast(e.target.checked ? 'On. Now re-authorise your pilots.' : 'Off'); };
  $('#ig-on').onchange = async e => { const r = await api.setSettings({ uiScopes: e.target.checked }); if (!r.ok) return toast(r.error, true); state.settings = r.data; toast(e.target.checked ? 'On. Now re-authorise your pilots.' : 'Off'); };
}

async function drawPhonePanel() {
  const box = $('#phone-panel'); if (!box) return;
  const r = await api.phone.get();
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  const c = r.data;
  box.innerHTML = String(html`<h3>Phone alerts</h3>
    <div class="muted" style="margin-bottom:10px">Send chosen alerts to your phone so you hear about an empty skill queue, a structure attack or a hostile in range while you're away from the PC.</div>
    <label class="check"><input type="checkbox" id="ph-on" ${raw(c.enabled ? 'checked' : '')}> <b>Send alerts to my phone</b></label>
    <div class="grid grid-2" style="margin-top:10px">
      ${field('ntfy topic address', html`<div style="display:flex;gap:6px"><input type="text" id="ph-ntfy" value="${c.ntfy}" placeholder="https://ntfy.sh/your-secret-topic" spellcheck="false"><button class="btn btn-ghost" id="ph-gen" title="Make a random private topic">🎲</button></div>`,
        raw('Free: install the <b>ntfy</b> app (Android or iPhone) and subscribe to the same topic. Anyone who knows the topic name can read it, so keep it random.'))}
      ${field('…or a Discord webhook', html`<input type="text" id="ph-hook" value="${c.webhook}" placeholder="https://discord.com/api/webhooks/…" spellcheck="false">`, 'Point it at a private channel. The Discord app on your phone notifies you.')}
    </div>
    <div class="dim" style="margin:4px 0 6px">Send these:</div>
    <div class="pi-chips">${Object.entries(c.categoryLabels).map(([k, l]) => html`<label class="check" style="margin:0 14px 6px 0"><input type="checkbox" data-ph-cat="${k}" ${raw(c.categories[k] ? 'checked' : '')}> ${l}</label>`)}</div>
    <label class="check" style="margin-top:6px"><input type="checkbox" id="ph-away" ${raw(c.onlyAway ? 'checked' : '')}> Only while EVE Toolkit isn't the active window</label>
    <div class="toolbar" style="margin-top:10px"><button class="btn btn-primary" id="ph-save">Save phone alerts</button><button class="btn btn-ghost" id="ph-test">Send a test</button></div>
    <div class="dim" style="font-size:12px">Intel alerts follow the Windows notification setting in Intel Watch. Repeats are held back for 10 minutes, with at most 30 alerts an hour.</div>`);
  const read = () => ({ enabled: $('#ph-on').checked, ntfy: $('#ph-ntfy').value, webhook: $('#ph-hook').value, onlyAway: $('#ph-away').checked,
    categories: Object.fromEntries([...document.querySelectorAll('[data-ph-cat]')].map(x => [x.dataset.phCat, x.checked])) });
  $('#ph-gen').onclick = () => { const a = new Uint8Array(9); crypto.getRandomValues(a); $('#ph-ntfy').value = 'https://ntfy.sh/evetk-' + [...a].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 14); };
  $('#ph-save').onclick = async () => { const r2 = await api.phone.save(read()); toast(r2.ok ? 'Phone alerts saved' : r2.error, !r2.ok); };
  $('#ph-test').onclick = async () => { const r2 = await api.phone.test(read()); toast(r2.ok ? 'Test sent. Check your phone.' : r2.error, !r2.ok); };
}
