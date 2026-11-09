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

async function renderAbout() {
  const info = await api.info();
  const v = info.ok ? info.data : {};
  setContent(html`<div style="max-width:820px">
    <div class="panel"><div class="about-hero">
      <img src="${portrait(AUTHOR.id, 256)}" alt="">
      <div><h2>EVE Toolkit</h2>
        <div class="muted">Version ${v.version || ''} · made by <b style="color:var(--text)">${AUTHOR.name}</b></div>
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
      <div class="muted">Game data from CCP's ESI and static data export. Thera and Turnur connections from EVE-Scout. Kill statistics from zKillboard. Wormhole statics from the Pathfinder project (MIT licence). Built with Electron.</div>
      <div class="muted" style="margin-top:8px">EVE Toolkit is free software under the <a href="#" data-link="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL version 3</a> or later. You can use, change and share it; if you share a changed version, share its source too. The source is on <a href="#" data-link="https://github.com/mrdave80/eve-toolkit">GitHub</a>. It comes with no warranty.</div>
    </div>

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
  $('#ab-copy').onclick = async () => { await api.copy($('#ab-details').textContent); toast('Copied. Paste it into an EVE mail to ' + AUTHOR.name); };
}

function aboutDetails(v) {
  return [`EVE Toolkit ${v.version || '?'}`, `System: ${v.os || navigator.platform}`, `Electron ${v.electron || ''}`, `Pilots: ${state.characters.length}`,
    `Theme: ${themeById((state.settings || {}).theme).name}`, `Page: ${state.view}${state.tab && state.view === 'char' ? ' / ' + state.tab : ''}`].join('\n');
}
