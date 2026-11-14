// Appearance settings panel and the About page.
const AUTHOR = { name: 'Mr Frank', id: 742485678 };
const AUTHOR_LINKS = {
  evewho: `https://evewho.com/character/${AUTHOR.id}`,
  zkill: `https://zkillboard.com/character/${AUTHOR.id}/`
};
const TEAM = [
  { name: 'Mr Frank', id: 742485678, role: 'Developer', note: 'Designs, builds and maintains the app.' },
  { name: 'Kayou Aldeshaar', id: 91378854, role: 'Inspiration & Beta Tester', note: 'EVE Toolkit was their idea.' }
];

async function saveAppearance(patch) {
  const r = await api.setSettings(patch);
  if (!r.ok) { toast(r.error, true); return null; }
  state.settings = r.data;
  return r.data;
}

function drawAppearance() {
  const box = $('#appearance-panel');
  if (!box) return;
  const st = state.settings || {};
  const auto = st.themeAuto || {};
  const current = themeById(st.theme).id;
  const opts = sel => THEMES.map(t => html`<option value="${t.id}" ${raw(t.id === sel ? 'selected' : '')}>${t.name}</option>`);
  box.innerHTML = String(html`<h3>Appearance</h3>
    <div class="muted" style="margin-bottom:12px">Pick a theme. It applies straight away and is remembered on this PC.</div>
    <div class="theme-grid">${THEMES.map(t => themeCard(t, t.id === current))}</div>
    <div class="grid grid-2" style="margin-top:18px;align-items:start">
      <div>
        <div class="field"><label for="ap-accent">Custom highlight colour</label>
          <div style="display:flex;gap:8px;align-items:center"><input type="color" id="ap-accent" value="${st.themeAccent || themeById(st.theme).c.accent}" style="width:52px;height:32px;padding:2px;cursor:pointer">
          <button class="btn btn-ghost" id="ap-accent-reset" ${raw(st.themeAccent ? '' : 'disabled')}>Use theme colour</button></div>
          <div class="dim" style="font-size:12px;margin-top:5px">Overrides the theme's highlight, e.g. your corp or alliance colour.</div></div>
        <div class="field"><label for="ap-zoom">Text and layout size</label>
          <select id="ap-zoom" class="crumb-select" style="max-width:160px">${[[0.9, 'Compact (90%)'], [1, 'Normal (100%)'], [1.1, 'Large (110%)'], [1.25, 'Extra large (125%)']].map(([v, l]) => html`<option value="${v}" ${raw((st.zoom || 1) === v ? 'selected' : '')}>${l}</option>`)}</select></div>
      </div>
      <div>
        <label class="check"><input type="checkbox" id="ap-auto" ${raw(auto.enabled ? 'checked' : '')}> Match the theme to where I'm flying</label>
        <div class="dim" style="font-size:12px;margin:4px 0 10px">Every 2 minutes the app checks the location of the pilot you're viewing (or your first pilot) and switches theme by space. Uses the location permission and the game data.</div>
        <div id="ap-zones" ${raw(auto.enabled ? '' : 'hidden')}>
          ${Object.entries(LOCATION_LABELS).map(([k, l]) => html`<div class="field" style="display:grid;grid-template-columns:130px 1fr;align-items:center;gap:8px;margin-bottom:6px"><label for="ap-z-${k}" style="margin:0">${l}</label><select id="ap-z-${k}" data-zone="${k}" class="crumb-select">${opts(auto[k] || LOCATION_DEFAULTS[k])}</select></div>`)}
          <div class="muted" style="font-size:12px" id="ap-now">${themeState.zone ? `Now: ${themeState.where || ''} (${LOCATION_LABELS[themeState.zone]}) → ${themeById(themeState.applied).name}` : 'Location not known yet: using your chosen theme.'}</div>
        </div>
      </div>
    </div>`);

  box.querySelectorAll('[data-theme]').forEach(b => b.onclick = async () => {
    const t = themeById(b.dataset.theme);
    const s = await saveAppearance({ theme: t.id, themeBg: t.c.bg });
    if (s) { await refreshTheme(s); drawAppearance(); toast(`Theme: ${t.name}${s.themeAuto && s.themeAuto.enabled ? ' (used when your location is unknown)' : ''}`); }
  });
  $('#ap-accent').onchange = async e => { const s = await saveAppearance({ themeAccent: e.target.value }); if (s) { await refreshTheme(s); drawAppearance(); } };
  $('#ap-accent-reset').onclick = async () => { const s = await saveAppearance({ themeAccent: '' }); if (s) { await refreshTheme(s); drawAppearance(); } };
  $('#ap-zoom').onchange = e => saveAppearance({ zoom: Number(e.target.value) });
  $('#ap-auto').onchange = async e => {
    const zones = Object.fromEntries([...box.querySelectorAll('[data-zone]')].map(x => [x.dataset.zone, x.value]));
    const s = await saveAppearance({ themeAuto: { enabled: e.target.checked, ...zones } });
    if (s) { await refreshTheme(s); drawAppearance(); }
  };
  box.querySelectorAll('[data-zone]').forEach(x => x.onchange = async () => {
    const s = await saveAppearance({ themeAuto: { [x.dataset.zone]: x.value } });
    if (s) { await refreshTheme(s); drawAppearance(); }
  });
}

// What each ESI permission is used for, in plain words.
const SCOPE_WHY = {
  publicData: 'Your pilot’s public name and portrait', 'esi-skills.read_skills.v1': 'Skills, for the planner, “can I fly” and fit checks', 'esi-skills.read_skillqueue.v1': 'Skill queue and its alerts',
  'esi-wallet.read_character_wallet.v1': 'Wallet, income, trade profit and net worth', 'esi-mail.read_mail.v1': 'Reading your EVE mail', 'esi-contracts.read_character_contracts.v1': 'Your contracts and their alerts',
  'esi-clones.read_clones.v1': 'Jump clones and the clone timer', 'esi-clones.read_implants.v1': 'Implants, for training times', 'esi-location.read_location.v1': 'Where your pilot is: map, routes, intel distance, Abyss timing',
  'esi-location.read_ship_type.v1': 'Current ship', 'esi-location.read_online.v1': 'Whether the pilot is logged in', 'esi-industry.read_character_jobs.v1': 'Industry jobs and their alerts',
  'esi-markets.read_character_orders.v1': 'Market orders and undercut checks', 'esi-assets.read_assets.v1': 'Assets and net worth', 'esi-universe.read_structures.v1': 'Names of player structures you can dock at',
  'esi-characters.read_blueprints.v1': 'Blueprints', 'esi-industry.read_character_mining.v1': 'Mining ledger', 'esi-industry.read_corporation_jobs.v1': 'Corp jobs you installed',
  'esi-planets.manage_planets.v1': 'Reading PI colonies (the app can’t change them)', 'esi-characters.read_agents_research.v1': 'R&D agents', 'esi-characters.read_loyalty.v1': 'Loyalty points',
  'esi-characters.read_notifications.v1': 'Wars, structure attacks and other notifications', 'esi-characters.read_contacts.v1': 'Contacts and standings, for threat grades', 'esi-calendar.read_calendar_events.v1': 'Calendar',
  'esi-characters.read_standings.v1': 'NPC standings', 'esi-characters.read_medals.v1': 'Medals', 'esi-characters.read_fatigue.v1': 'Jump fatigue timer', 'esi-characters.read_titles.v1': 'Corp titles',
  'esi-characters.read_corporation_roles.v1': 'Whether corp tools should show', 'esi-characters.read_fw_stats.v1': 'Faction warfare stats', 'esi-killmails.read_killmails.v1': 'Your kills and losses', 'esi-fittings.read_fittings.v1': 'Your saved fittings',
  'esi-ui.write_waypoint.v1': 'Setting waypoints in game (opt-in)', 'esi-ui.open_window.v1': 'Opening info, contract and mail windows in game (opt-in)',
  'esi-mail.send_mail.v1': 'Sending mail you write (opt-in)', 'esi-mail.organize_mail.v1': 'Marking mail read or unread (opt-in)', 'esi-calendar.respond_calendar_events.v1': 'Answering calendar invites (opt-in)', 'esi-fittings.write_fittings.v1': 'Saving fits to the game (opt-in)'
};
const OUTSIDE = [['CCP: login.eveonline.com, esi.evetech.net, images.evetech.net, developers.eveonline.com', 'Login, game data, pictures and the static data download'], ['zkillboard.com', 'Kill history for threat grades, routes and the Wall of Shame'], ['api.eve-scout.com', 'Thera and Turnur connections'],
  ['registry.npmjs.org', 'Fit stats data for the fit checker'], ['api.github.com, github.com', 'Checking for and downloading updates'], ['eveonline.com news', 'Daily rewards and EVE news'], ['ntfy.sh or your Discord webhook', 'Phone alerts, only if you turn them on']];

function privacyPanel(info) {
  const d = info && info.ok ? info.data : {};
  const row = s => html`<tr><td style="font-family:var(--font-num);font-size:11.5px;white-space:nowrap">${s.replace(/^esi-|\.v\d$/g, '')}</td><td class="muted" style="font-size:12.5px">${SCOPE_WHY[s] || ''}</td></tr>`;
  return html`<div class="panel"><h3>Privacy and permissions</h3>
    <div class="muted" style="margin-bottom:10px">Everything stays on this PC${d.userData ? html` in <code>${d.userData}</code>` : ''}. There is no EVE Toolkit server, account or tracking. Logins are encrypted with Windows. The app only reads your EVE data, except for the opt-in options marked below. You can revoke access any time on <a href="#" data-link="https://community.eveonline.com/support/third-party-applications/">CCP’s third-party applications page</a>.</div>
    <details class="sgroup"><summary><span class="gname">What each permission is for</span><span class="dim">${(d.scopes || []).length} for pilots</span></summary><div style="padding:0 14px 10px"><table><tbody>
      ${(d.scopes || []).map(row)}${(d.uiScopes || []).map(row)}${(d.writeScopes || []).map(row)}
      <tr><td colspan="2" class="dim" style="font-size:12px;padding-top:10px">Directors and FCs added with “Add director / FC” also allow reading corp members, structures, assets, wallets, contracts, industry and mining for the corp tools.</td></tr></tbody></table></div></details>
    <details class="sgroup"><summary><span class="gname">Who the app talks to</span><span class="dim">${OUTSIDE.length} services</span></summary><div style="padding:0 14px 10px"><table><tbody>${OUTSIDE.map(([h, w]) => html`<tr><td style="font-size:12.5px">${h}</td><td class="muted" style="font-size:12.5px">${w}</td></tr>`)}</tbody></table></div></details></div>`;
}

async function renderAbout() {
  const info = await api.info();
  const v = info.ok ? info.data : {};
  setContent(html`<div style="max-width:820px">
    <div class="panel"><div class="about-hero">
      <img src="${portrait(AUTHOR.id, 256)}" alt="">
      <div><h2>EVE Toolkit</h2>
        <div class="muted">Version ${v.version || ''} · made by <b style="color:var(--text)">${AUTHOR.name}</b></div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:8px"><button class="btn btn-ghost" data-updcheck style="padding:3px 11px;font-size:12.5px">Check for updates</button><span class="dim" style="font-size:12px" data-updlast></span></div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost" data-ext="${AUTHOR_LINKS.evewho}">${AUTHOR.name} on EveWho ↗</button>
          <button class="btn btn-ghost" data-ext="${AUTHOR_LINKS.zkill}">zKillboard ↗</button>
          <button class="btn btn-ghost" data-copy="${AUTHOR.name}">Copy name</button>
        </div></div></div></div>

    <div class="grid grid-2" style="align-items:start">
      <div class="panel"><h3>Support development</h3>
        <div>This app is free and every feature works without donating. If it saves you time or ISK, donations of <b>ISK or PLEX</b> to <b>${AUTHOR.name}</b> are welcome.</div>
        <ol class="about-steps muted">
          <li><b style="color:var(--text)">ISK:</b> search for ${AUTHOR.name} in game, right-click the name and choose <i>Give Money</i>.</li>
          <li><b style="color:var(--text)">PLEX:</b> move it from your PLEX Vault to your item hangar, then send a private item-exchange contract to ${AUTHOR.name}.</li>
        </ol>
        <div class="dim" style="font-size:12px;margin-top:8px">Donations are a thank-you only. Nothing is locked or unlocked by donating.</div>
      </div>
      <div class="panel"><h3>Requests and bug reports</h3>
        <div>Send an <b>EVE mail to ${AUTHOR.name}</b> with feature requests, ideas or bugs.</div>
        <div class="muted" style="margin-top:8px">For bugs, include what you clicked, what you expected and what happened. A screenshot link helps too. Paste in these details:</div>
        <pre class="mono-area" id="ab-details" style="margin:10px 0;padding:10px;border:1px solid var(--line);border-radius:6px;background:var(--bg-2);white-space:pre-wrap;font-size:12px">${aboutDetails(v)}</pre>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" id="ab-copy">Copy details for EVE mail</button><button class="btn btn-ghost" id="ab-mail" title="Needs in-game control (Settings)">✉ Open mail in game</button></div>
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line)"><div class="muted" style="font-size:12px;margin-bottom:6px">Something broke? The diagnostics report adds recent errors from the app's log. Tokens, your client ID and webhook addresses are left out.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost" id="ab-diag">Copy diagnostics</button><button class="btn btn-ghost" id="ab-logs">Open log folder</button><button class="btn btn-ghost" id="ab-view">View</button></div></div>
      </div>
    </div>

    <div class="panel"><h3>App Dev Team</h3>
      <div class="grid grid-2">${TEAM.map(m => html`<div style="display:flex;gap:14px;align-items:center">
        <img src="${portrait(m.id, 128)}" width="64" height="64" style="border-radius:8px;border:1px solid var(--line-2);flex:none" alt="">
        <div><div><b>${m.name}</b></div><div style="color:var(--accent);font-size:12.5px">${m.role}</div><div class="muted" style="font-size:12.5px;margin:2px 0 6px">${m.note}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" data-ext="https://evewho.com/character/${m.id}">EveWho ↗</button>
          <button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" data-ext="https://zkillboard.com/character/${m.id}/">zKillboard ↗</button></div></div></div>`)}</div>
    </div>

    <div class="panel"><h3>Credits</h3>
      <div class="muted">Game data from CCP's ESI and static data export. Thera and Turnur connections from EVE-Scout. Kill statistics from zKillboard. Wormhole statics from the Pathfinder project (MIT licence). Fit stats from EVEShip.fit's dogma engine (MIT licence). Built with Electron.</div>
      <div class="muted" style="margin-top:8px">EVE Toolkit is free software under the <a href="#" data-link="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL version 3</a> or later. You can use, change and share it; if you share a changed version, share its source too. The source is on <a href="#" data-link="https://github.com/mrdave80/eve-toolkit">GitHub</a>. It comes with no warranty.</div>
    </div>

    ${privacyPanel(info)}

    <div class="panel"><h3>Made with AI</h3>
      <div class="muted">EVE Toolkit was built with help from Claude, Anthropic’s AI assistant. I looked deep into my soul and found I don’t give a shit whether you like AI. It’s very good at jobs like this one. If you want to complain, send me an EVE mail. Your tears fuel me.</div>
      <div style="margin-top:6px;font-size:12.5px;color:var(--accent)">Mr Frank</div>
    </div>

    <div class="foot-note">
      EVE Online and the EVE logo are the registered trademarks of CCP hf. All rights are reserved worldwide. All other trademarks are the property of their respective owners.
      EVE Online, the EVE logo, EVE and all associated logos and designs are the intellectual property of CCP hf. All artwork, screenshots, characters, vehicles, storylines,
      world facts or other recognisable features of the intellectual property relating to these trademarks are likewise the intellectual property of CCP hf.
      This application is not affiliated with or endorsed by CCP hf., and CCP hf. is not responsible for its content or functioning.
    </div></div>`);
  document.querySelectorAll('[data-ext]').forEach(b => b.onclick = () => api.openLink(b.dataset.ext));
  document.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { await api.copy(b.dataset.copy); toast('Copied'); });
  $('#ab-mail').onclick = () => mailInGame(AUTHOR.id, `EVE Toolkit ${v.version || ''}: `, '\n\n---\n' + $('#ab-details').textContent);
  $('#ab-diag').onclick = async () => { const r = await api.diag.copy(); toast(r.ok ? 'Diagnostics copied. Paste into an EVE mail or a text file.' : r.error, !r.ok); };
  $('#ab-logs').onclick = () => api.diag.openFolder();
  $('#ab-view').onclick = async () => { const r = await api.diag.report(); openModal('Diagnostics', html`<pre class="mono-area" style="white-space:pre-wrap;font-size:11.5px;max-height:60vh;overflow:auto;background:var(--bg-2);padding:10px;border-radius:6px;margin:0">${r.ok ? r.data : r.error}</pre>`, { submit: 'Copy', onSubmit: async () => { await api.diag.copy(); toast('Copied'); } }); };
  fillUpdLast();
  $('#ab-copy').onclick = async () => { await api.copy($('#ab-details').textContent); toast('Copied. Paste it into an EVE mail to ' + AUTHOR.name); };
}

function aboutDetails(v) {
  return [`EVE Toolkit ${v.version || '?'}`, `System: ${v.os || navigator.platform}`, `Electron ${v.electron || ''}`, `Pilots: ${state.characters.length}`,
    `Theme: ${themeById((state.settings || {}).theme).name}`, `Page: ${state.view}${state.tab && state.view === 'char' ? ' / ' + state.tab : ''}`].join('\n');
}
