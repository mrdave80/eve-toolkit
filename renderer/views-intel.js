'use strict';
/* Intel: chat watcher feed, Local / D-scan analysis, combat log meter. */

const intelState = { cfg: null, reports: [], pilots: [], status: null, combat: [], localText: '', dscanText: '', local: null, dscan: null, zk: {}, spikes: [], localEvents: [] };

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.start(); o.stop(ctx.currentTime + 0.55);
  } catch {}
}

api.intel.onReport(r => {
  intelState.reports.unshift(r); intelState.reports.length = Math.min(intelState.reports.length, 300);
  if (r.alert && intelState.cfg && intelState.cfg.sound) beep();
  if (state.view === 'tools' && state.toolsTab === 't-intel') drawIntelFeed();
  if (state.view === 'liveMap' && typeof drawMap === 'function') drawMap();
});
api.intel.onPilots(p => { intelState.pilots = p; if (state.view === 'tools' && state.toolsTab === 't-intel') drawIntelFeed(); });
api.intel.onStatus(s => { intelState.status = s; });
api.intel.onLocal(ev => {
  intelState.localEvents.unshift(ev); intelState.localEvents.length = Math.min(intelState.localEvents.length, 100);
  if (ev.alert && intelState.cfg && intelState.cfg.sound) beep();
  if (state.view === 'tools' && state.toolsTab === 't-intel') drawIntelFeed();
});
api.intel.onSpikes(s => { intelState.spikes = s; if (state.view === 'tools' && state.toolsTab === 't-intel') drawIntelFeed(); });
api.pilot.onProgress(p => { const b = $('#lc-zk'); if (b) b.textContent = p.i >= p.n ? 'Grade pilots' : `Grading ${p.i}/${p.n}…`; });
const onLocalTab = () => state.view === 'tools' && state.toolsTab === 't-local';
function updateClipBadge(on) { const b = document.getElementById('clip-badge'); if (b) { b.hidden = !on; b.onclick = () => { state.toolsTab = 't-local'; go('tools'); }; } }
api.intel.config().then(r => updateClipBadge(r.ok && r.data.clipboard));
api.clip.onLocal(m => {
  intelState.localText = m.text; intelState.local = m.data;
  if (m.grades) { intelState.zk = m.grades; intelState.local.pilots.sort((a, c) => ((m.grades[c.id] || {}).score ?? -1) - ((m.grades[a.id] || {}).score ?? -1)); }
  else intelState.zk = {};
  if (onLocalTab()) { const t = $('#lc-text'); if (t) t.value = m.text; drawLocal(); }
  else if (m.grades) {
    const bad = Object.values(m.grades).filter(g => g.level === 'Extreme' || g.level === 'High').length;
    toast(`Local copied: ${m.data.total} pilots, ${m.data.hostiles} red${bad ? `, ${bad} high threat` : ''}. See Tools → Intel → Local & D-scan.`, bad > 0);
  }
});
api.clip.onDscan(m => {
  intelState.dscanText = m.text; intelState.dscan = m.data;
  if (onLocalTab()) { const t = $('#ds-text'); if (t) t.value = m.text; drawDscan(); }
  else toast(`D-scan copied: ${m.data.ships} ships${m.data.onGridShips ? `, ${m.data.onGridShips} on grid` : ''}.`, m.data.onGridShips > 0);
});
api.intel.onAttack(a => { if (intelState.cfg && intelState.cfg.sound !== false && !quietNow('attack')) { beep(); setTimeout(beep, 250); } say(`${a.who.split(' ')[0]} under attack${a.player ? ' by ' + a.attacker.replace(/\[.*$/, '') : ''}`, 'attack'); });
api.intel.onCombat(c => { intelState.combat = c; if (state.view === 'tools' && state.toolsTab === 't-combat') drawCombat(); });

async function tIntel() {
  const [c, r] = await Promise.all([api.intel.config(), api.intel.reports()]);
  intelState.cfg = c.ok ? c.data : null;
  if (r.ok) { intelState.reports = r.data.reports; intelState.pilots = r.data.pilots; intelState.spikes = r.data.spikes || []; intelState.localEvents = r.data.local || []; }
  const cfg = intelState.cfg || { channels: [], channelsSeen: [] };
  setContent(html`<div class="ind-layout">
    <div class="panel ind-form"><h3>Intel watch</h3>
      <label class="check"><input type="checkbox" id="it-on" ${raw(cfg.enabled ? 'checked' : '')}> <b>Watch intel channels</b></label>
      ${field('Alert when reported within', html`<div style="display:flex;gap:8px;align-items:center"><input type="number" id="it-jumps" value="${cfg.jumps}" min="0" max="20" style="width:80px"> jumps of any of my pilots</div>`)}
      ${field('Channels to watch', html`<div class="pi-chips">${[...new Set([...cfg.channelsSeen, ...cfg.channels])].filter(x => x.toLowerCase() !== 'local').map(ch => html`<button class="badge ${cfg.channels.includes(ch) ? 'accent' : ''}" data-it-ch="${ch}">${ch}</button>`)}</div>`,
        cfg.channelsSeen.length ? 'Channels found in your EVE chat logs from the last 14 days. Click to toggle.' : 'No chat logs found yet. Join your intel channel in game, or set the log folder below.')}
      ${field('Add channel by name', html`<input type="text" id="it-add" placeholder="e.g. Delve Intel">`)}
      ${checkbox('it-sound', 'Play a sound on alerts', cfg.sound)}${checkbox('it-notify', 'Windows notification on alerts', cfg.notify)}
      ${field('EVE logs folder', html`<div style="display:flex;gap:6px"><input type="text" id="it-folder" value="${cfg.folder}" placeholder="${cfg.root}"><button class="btn btn-ghost" id="it-pick">…</button></div>`, 'Leave blank for Documents\\EVE\\logs.')}
      <h3 class="mh" style="margin-top:16px">Threat alerts</h3>
      ${checkbox('it-grade', 'Grade pilots named in nearby reports (zKillboard)', cfg.grade !== false)}
      ${field('Alert when someone speaks in Local who is', html`<select id="it-lt" class="crumb-select">${[['off', 'Off'], ['Moderate', 'Moderate threat or worse'], ['High', 'High threat or worse'], ['Extreme', 'Extreme threat only']].map(([v, l]) => html`<option value="${v}" ${raw((cfg.localThreat || 'High') === v ? 'selected' : '')}>${l}</option>`)}</select>`, 'EVE logs what people say in Local, not who is there. For the full member list, paste Local under Local & D-scan. Tagged hostiles and gankers always alert.')}
      ${checkbox('it-spike', 'Kill-spike watch: alert on sudden kills near my pilots', cfg.spike)}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">${field('Within jumps', html`<input type="number" id="it-sj" value="${cfg.spikeJumps ?? 2}" min="0" max="6">`)}${field('Highsec: ships/h', html`<input type="number" id="it-sh" value="${cfg.spikeHs ?? 3}" min="1" max="50">`)}${field('Low/null/WH: ships/h', html`<input type="number" id="it-sl" value="${cfg.spikeLow ?? 5}" min="1" max="100">`)}</div>
      <div class="dim" style="font-size:12px;margin:-4px 0 10px">Uses CCP's hourly kill counts, checked every 5 minutes. In highsec a spike usually means a gank fleet is working the area.</div>
      <button class="btn btn-primary" id="it-save" style="width:100%">Save</button>
      <div class="dim" style="font-size:12px;margin-top:10px">In game, make sure chat logging is on: Settings → Chat → Log chat to file.</div></div>
    <div><div class="panel"><h3>Your pilots</h3><div id="it-pilots"></div></div>
      <div class="panel" id="it-spikes-panel"><h3>Kill activity near you <button class="btn btn-ghost" id="it-spike-now" style="padding:2px 8px;font-size:12px;float:right">Check now</button></h3><div id="it-spikes"></div></div>
      <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Threats in Local</h3></div><div id="it-local"></div></div>
      <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Intel feed</h3></div><div id="it-feed"></div></div></div></div>`);
  $('#it-spike-now').onclick = async () => { const r = await api.intel.checkSpikes(); if (!r.ok) return toast(r.error, true); intelState.spikes = r.data; drawIntelFeed(); toast(r.data.length ? `${r.data.length} system(s) with kill spikes near your pilots` : 'Nothing unusual near your pilots'); };
  drawIntelFeed();
  document.querySelectorAll('[data-it-ch]').forEach(b => b.onclick = () => b.classList.toggle('accent'));
  $('#it-pick').onclick = async () => { const r = await api.intel.pickFolder(); if (r.ok && r.data) $('#it-folder').value = r.data; };
  $('#it-save').onclick = async () => {
    const chans = [...document.querySelectorAll('[data-it-ch].accent')].map(b => b.dataset.itCh);
    const add = $('#it-add').value.trim(); if (add) chans.push(add);
    const r = await api.intel.setConfig({ enabled: $('#it-on').checked, jumps: $('#it-jumps').value, channels: chans, sound: document.querySelector('[name="it-sound"]').checked, notify: document.querySelector('[name="it-notify"]').checked, folder: $('#it-folder').value,
      grade: document.querySelector('[name="it-grade"]').checked, localThreat: $('#it-lt').value, spike: document.querySelector('[name="it-spike"]').checked, spikeJumps: $('#it-sj').value, spikeHs: $('#it-sh').value, spikeLow: $('#it-sl').value });
    if (!r.ok) return toast(r.error, true);
    intelState.cfg = r.data; toast(r.data.enabled ? `Watching ${r.data.channels.length} channel(s)` : 'Intel watch off'); tIntel();
  };
}

function drawIntelFeed() {
  const pb = $('#it-pilots'), fb = $('#it-feed'), sb = $('#it-spikes'), lb = $('#it-local');
  if (!pb || !fb) return;
  if (sb) sb.innerHTML = String(intelState.spikes.length ? html`<table><tbody>${intelState.spikes.slice(0, 12).map(s => xRow('isp' + s.systemId, html`<td><b>${s.system}</b> ${secBadge(s.security)}</td>
      <td><span class="badge ${s.zone === 'hs' ? 'red' : 'gold'}">${s.shipKills} ships</span>${s.podKills ? html` <span class="dim">${s.podKills} pods</span>` : ''}</td><td class="muted">${s.near.jumps}j from ${s.near.pilot}</td><td class="dim">${s.zone === 'hs' ? 'possible gank fleet' : 'fighting nearby'}</td>`,
      '', 4, { load: () => spikeDetail(s), title: 'Click for the kills, who is doing them and where' }))}</tbody></table>`
    : html`<div class="muted">${intelState.cfg && intelState.cfg.spike ? 'Nothing unusual within range in the last hour.' : 'Turn on kill-spike watch to see this.'}</div>`);
  if (lb) lb.innerHTML = String(intelState.localEvents.length ? html`<table><tbody>${intelState.localEvents.slice(0, 20).map(ev => xRow('ilc' + ev.pilot.id + ':' + ev.at, html`<td class="dim nowrap">${agoShort(ev.at)}</td>
      <td><a href="#" data-pilot="${ev.pilot.id}">${ev.pilot.name}</a></td><td>${threatBadge({ level: ev.level, tone: ev.alert ? 'red' : ev.pilot.tone, score: ev.pilot.score }, true)} ${flagChips(ev.pilot.flags, 2)}</td><td class="muted">${ev.system || ''}${ev.listener ? ' · ' + ev.listener : ''}</td>`,
      '', 4, { cls: ev.alert ? 'intel-alert' : '', load: () => localThreatDetail(ev), title: 'Click for what they said, what they fly and recent kills' }))}</tbody></table>`
    : html`<div class="muted" style="padding:0 18px 14px">Pilots who speak in Local are graded here.</div>`);
  if (sb) xOpenLazy(sb);
  if (lb) xOpenLazy(lb);
  pb.innerHTML = String(intelState.pilots.length ? html`<div class="pi-chips">${intelState.pilots.map(p => html`<span class="badge">${p.pilot}: <b>${p.system}</b></span>`)}</div>` : html`<div class="muted">Locations appear once Local logs or ESI report them.</div>`);
  const now = Date.now();
  fb.innerHTML = String(intelState.reports.length ? html`<table><tbody>${intelState.reports.slice(0, 80).map(r => html`<tr class="${r.alert ? 'intel-alert' : r.clear ? 'intel-clear' : ''}">
      <td class="nowrap dim" style="width:80px">${Math.round((now - Date.parse(r.at)) / 60000)}m ago</td><td class="muted nowrap">${r.channel}<div class="dim">${r.who}</div></td>
      <td>${r.text}${r.pilots && r.pilots.length ? html`<div style="margin-top:4px">${r.pilots.map(p => html`<a href="#" data-pilot="${p.id}" class="badge ${p.tone}" style="text-decoration:none" title="${p.flags.map(f => f.label).join(', ')}">${p.name}: ${p.level}</a> `)}</div>` : ''}</td>
      <td class="right nowrap">${r.systems.map(s => html`<span class="badge ${s.near && s.near.jumps <= (intelState.cfg ? intelState.cfg.jumps : 5) ? (r.clear ? 'green' : 'red') : ''}">${s.name}${s.near ? ' · ' + s.near.jumps + 'j' : ''}</span> `)}${r.clear ? raw('<span class="badge green">clear</span>') : ''}</td></tr>`)}</tbody></table>`
    : html`<div class="muted" style="padding:14px 18px">${intelState.cfg && intelState.cfg.enabled ? 'Waiting for reports…' : 'Turn on intel watch to start.'}</div>`);
}

// "883m ago" is hard to read: minutes, then hours, then days
function agoShort(t) { const m = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60000)); return m < 60 ? m + 'm ago' : m < 48 * 60 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; }

/** A kill spike opened: the last two hours of kills there, who's doing them, in what, and where. */
async function spikeDetail(s) {
  const r = await api.systemIntel(s.systemId, 2, false, 30);
  if (!r.ok) return html`<div class="error">${r.error}</div>`;
  const d = r.data;
  const kills = d.kills.filter(k => !k.npc).slice(0, 8);
  const camp = d.places.find(p => (p.kind === 'gate' || p.kind === 'station') && p.kills >= 2);
  return html`<div style="display:grid;grid-template-columns:1.6fr 1fr;gap:16px;align-items:start">
    <div>${d.notes.length ? html`<div style="margin-bottom:8px">${d.notes.slice(0, 3).map(n => html`<div class="${n.tone}" style="font-size:12.5px">${n.tone === 'neg' ? '⚠ ' : '• '}${n.text}</div>`)}</div>` : ''}
      ${kills.length ? html`<table><thead><tr><th>When</th><th>Lost</th><th>Where</th><th>By</th><th class="right">ISK</th></tr></thead><tbody>${kills.map(k => html`<tr>
        <td class="dim nowrap" style="font-size:12px">${agoShort(k.time)}</td><td style="font-size:12.5px">${icon(k.victim.ship, 16)}${k.victim.shipName}<div class="dim" style="font-size:11px">${k.victim.name || ''}${k.victim.corpName ? ' · ' + k.victim.corpName : ''}</div></td>
        <td style="font-size:12px">${k.where.label}</td><td style="font-size:12px">${k.attackerCount ? html`${k.attackerCount} · ${k.attackerGroups.slice(0, 2).join(', ')}` : 'NPCs'}</td>
        <td class="right num" style="font-size:12px">${fmtCompact(k.value)} <a href="#" data-link="https://zkillboard.com/kill/${k.id}/" title="zKillboard">↗</a></td></tr>`)}</tbody></table>`
        : html`<div class="muted">zKillboard doesn't have these kills yet. CCP's count updates hourly and zKillboard can lag a few minutes.</div>`}</div>
    <div>${d.attackerGroups.length ? html`<div class="dim" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase">Who's killing</div>${d.attackerGroups.slice(0, 4).map(g => html`<div class="skill-row" style="font-size:12.5px"><span>${g.name}</span><span class="num">${g.kills}</span></div>`)}` : ''}
      ${d.attackerShips.length ? html`<div class="dim" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-top:8px">In</div><div style="font-size:12.5px">${d.attackerShips.slice(0, 5).map(x => html`<span style="margin-right:10px">${icon(x.typeId, 14)}${x.name} <span class="dim">${x.kills}</span></span>`)}</div>` : ''}
      ${camp ? html`<div style="margin-top:8px"><span class="badge red">camp</span> <span style="font-size:12.5px">${camp.label} · ${camp.kills} kills${camp.pods ? ', pods too' : ''}</span></div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn btn-ghost" style="padding:3px 9px;font-size:12px" data-si-open="${s.system}">System Intel</button><button class="btn btn-ghost" style="padding:3px 9px;font-size:12px" data-system="${s.system}">System card</button><a class="btn btn-ghost" style="padding:3px 9px;font-size:12px" href="#" data-link="https://zkillboard.com/system/${s.systemId}/">zKill ↗</a></div></div></div>`;
}

/** A pilot who spoke in Local, opened: what they said, how they were graded and what they fly. */
async function localThreatDetail(ev) {
  const r = await api.pilot.profile(ev.pilot.id);
  const p = r.ok ? r.data : null;
  const flags = p ? (p.flags || []) : (ev.pilot.flags || []);
  return html`<div style="display:grid;grid-template-columns:1fr 1.4fr;gap:16px;align-items:start">
    <div>${ev.text ? html`<div style="font-size:12.5px;margin-bottom:8px"><span class="dim">Said in Local:</span> “${ev.text}”</div>` : ''}
      ${p ? html`<div style="font-size:12.5px">${p.corporation && p.corporation.name ? html`${p.corporation.name}${p.corporation.ticker ? ` [${p.corporation.ticker}]` : ''}` : ''}${p.alliance ? html` · ${p.alliance.name}` : ''}</div>
        <div class="dim" style="font-size:12px">${p.security !== null && p.security !== undefined ? `Security ${Number(p.security).toFixed(1)}` : ''}${p.stats ? ` · ${fmtNum(p.stats.kills)} kills, ${fmtNum(p.stats.losses)} losses${p.stats.danger !== null ? ` · ${p.stats.danger}% dangerous` : ''}` : ''}${p.lastKillAt ? ` · last kill ${agoShort(p.lastKillAt)}` : ''}</div>` : html`<div class="dim" style="font-size:12px">${r.error || ''}</div>`}
      ${flags.length ? html`<div style="margin-top:8px">${flags.map(f => html`<div style="font-size:12.5px;margin-bottom:4px"><span class="badge ${f.tone || ''}">${f.label}</span> <span class="dim">${f.why || ''}</span></div>`)}</div>` : ''}
      ${p && p.reasons && p.reasons.length ? html`<div class="dim" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-top:8px">Why this grade</div>${p.reasons.slice(0, 4).map(x => html`<div style="font-size:12px">${x.pts > 0 ? '+' : ''}${x.pts} · ${x.text}</div>`)}` : ''}</div>
    <div>${p && p.topShips && p.topShips.length ? html`<div class="dim" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase">Flies</div><div style="font-size:12.5px;margin-bottom:8px">${p.topShips.slice(0, 6).map(x => html`<span style="margin-right:10px">${icon(x.typeId, 14)}${x.name} <span class="dim">${x.kills}</span></span>`)}</div>` : ''}
      ${p && p.kills && p.kills.length ? html`<div class="dim" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase">Recent kills</div><table><tbody>${p.kills.slice(0, 5).map(k => html`<tr><td class="dim nowrap" style="font-size:12px">${agoShort(k.time)}</td><td style="font-size:12px">${k.shipName || '?'} → ${k.victimShipName || '?'}</td><td style="font-size:12px">${k.system || ''}</td><td class="dim" style="font-size:12px">${k.solo ? 'solo' : k.attackers + ' pilots'}</td></tr>`)}</tbody></table>` : html`<div class="muted" style="font-size:12.5px">No recent kills on zKillboard.</div>`}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn btn-ghost" style="padding:3px 9px;font-size:12px" data-pilot="${ev.pilot.id}">Full profile</button><a class="btn btn-ghost" style="padding:3px 9px;font-size:12px" href="#" data-link="https://zkillboard.com/character/${ev.pilot.id}/">zKill ↗</a>
        <button class="btn btn-ghost" style="padding:3px 9px;font-size:12px" data-it-tag="${ev.pilot.id}|${ev.pilot.name}">Tag as hostile</button></div></div></div>`;
}
document.addEventListener('click', async e => {
  const o = e.target.closest('[data-si-open]');
  if (o) { e.preventDefault(); siState.q = o.dataset.siOpen; siState.data = null; state.toolsTab = 't-sysintel'; go('tools'); setTimeout(() => { const b = document.getElementById('si-go'); if (b) b.click(); }, 300); return; }
  const t = e.target.closest('[data-it-tag]');
  if (t) { e.preventDefault(); const [id, name] = t.dataset.itTag.split('|'); const r = await api.pilot.watch(Number(id), name, 'hostile', 'Tagged from Threats in Local'); toast(r.ok ? `${name} tagged as hostile: you'll be alerted whenever they're reported` : r.error, !r.ok); }
});

// ---------- Local & D-scan ----------

function standingBadge(s) {
  if (s === null || s === undefined) return raw('<span class="badge">neutral</span>');
  return raw(`<span class="badge ${s > 0 ? 'accent' : 'red'}">${s > 0 ? '+' : ''}${s}</span>`);
}

async function tLocal() {
  const cf = await api.intel.config();
  const clipOn = cf.ok && cf.data.clipboard;
  setContent(html`<div class="toolbar"><label class="check" style="margin:0"><input type="checkbox" id="lc-clip" ${raw(clipOn ? 'checked' : '')}> <b>Auto-analyse when I copy Local or d-scan in EVE</b></label>
    <span class="dim" style="font-size:12px">In game, click in the Local member list or the d-scan results, press Ctrl+A then Ctrl+C. Results appear here, and alert you when the app isn't in front.</span></div>
    <div class="grid grid-2" style="align-items:start">
    <div class="panel"><h3>Local</h3><textarea id="lc-text" rows="10" class="mono-area" style="width:100%" placeholder="Select everyone in Local (click, Ctrl+A), Ctrl+C, paste here">${intelState.localText}</textarea>
      <div class="toolbar" style="margin:10px 0 0"><button class="btn btn-primary" id="lc-go">Analyse Local</button><button class="btn btn-ghost" id="lc-zk">Grade pilots</button></div><div id="lc-out"></div></div>
    <div class="panel"><h3>D-scan</h3><textarea id="ds-text" rows="10" class="mono-area" style="width:100%" placeholder="Directional scanner results: select all, Ctrl+C, paste here">${intelState.dscanText}</textarea>
      <div class="toolbar" style="margin:10px 0 0"><button class="btn btn-primary" id="ds-go">Analyse D-scan</button></div><div id="ds-out"></div></div></div>`);
  if (intelState.local) drawLocal();
  if (intelState.dscan) drawDscan();
  $('#lc-clip').onchange = async e => { const r = await api.intel.setConfig({ clipboard: e.target.checked }); updateClipBadge(r.ok && r.data.clipboard); toast(r.ok ? (e.target.checked ? 'Watching the clipboard for Local and d-scan' : 'Clipboard watch off') : r.error, !r.ok); };
  $('#lc-go').onclick = async () => {
    intelState.localText = $('#lc-text').value;
    $('#lc-out').innerHTML = String(loadingView('Looking up pilots…'));
    const r = await api.intel.local(intelState.localText);
    if (!r.ok) { $('#lc-out').innerHTML = String(errorView(r)); return; }
    intelState.local = r.data; intelState.zk = {}; drawLocal();
  };
  $('#lc-zk').onclick = async () => {
    if (!intelState.local) return toast('Analyse Local first.', true);
    const list = intelState.local.pilots.filter(p => !p.mine && !(p.standing > 0)).map(p => ({ id: p.id, name: p.name }));
    if (!list.length) return toast('Nobody to grade: everyone is you or blue.');
    if (list.length > 80) toast('Grading the first 80 non-blue pilots.');
    $('#lc-zk').disabled = true;
    const r = await api.pilot.quickMany(list);
    const b = $('#lc-zk'); if (b) { b.disabled = false; b.textContent = 'Grade pilots'; }
    if (!r.ok) return toast(r.error, true);
    intelState.zk = r.data;
    intelState.local.pilots.sort((a, c) => ((intelState.zk[c.id] || {}).score ?? -1) - ((intelState.zk[a.id] || {}).score ?? -1));
    drawLocal();
  };
  $('#ds-go').onclick = async () => {
    intelState.dscanText = $('#ds-text').value;
    const r = await api.intel.dscan(intelState.dscanText);
    if (!r.ok) { $('#ds-out').innerHTML = String(errorView(r)); return; }
    intelState.dscan = r.data; drawDscan();
  };
}

function drawLocal() {
  const d = intelState.local, box = $('#lc-out');
  if (!box) return;
  box.innerHTML = String(html`<div class="grid grid-4" style="margin:12px 0">${stat('Pilots', d.total)}${stat('Hostile', d.hostiles, '', d.hostiles ? 'neg' : '')}${stat('Blue', d.blues, '', 'pos')}${stat('Neutral', d.neutrals, '', d.neutrals ? 'gold' : '')}</div>
    <h3 class="mh">By alliance / corp</h3><div class="pi-chips" style="margin-bottom:12px">${d.groups.slice(0, 20).map(g => html`<span class="badge ${g.standing > 0 ? 'accent' : g.standing < 0 ? 'red' : ''}">${g.count}× ${g.name}</span>`)}</div>
    ${Object.keys(intelState.zk).length ? html`<div class="pi-chips" style="margin-bottom:10px">${['Extreme', 'High', 'Moderate'].map(l => { const n = Object.values(intelState.zk).filter(z => z.level === l).length; return n ? html`<span class="badge ${l === 'Moderate' ? 'gold' : 'red'}">${n} ${l}</span>` : ''; })}${(() => { const g = Object.values(intelState.zk).filter(z => z.flags.some(f => f.id === 'ganker')).length; return g ? html`<span class="badge red">${g} possible ganker${g > 1 ? 's' : ''}</span>` : ''; })()}${(() => { const h = Object.values(intelState.zk).filter(z => z.flags.some(f => ['hotdrop', 'cyno', 'blops'].includes(f.id))).length; return h ? html`<span class="badge red">${h} hotdrop / cyno</span>` : ''; })()}</div>` : ''}
    <div class="table-wrap" style="max-height:50vh"><table><tbody>${d.pilots.map(p => { const z = intelState.zk[p.id]; return html`<tr><td>${charImg(p.id, 18)}<a href="#" data-pilot="${p.id}">${p.name}</a>${p.mine ? raw(' <span class="badge">you</span>') : ''}</td><td class="muted" style="font-size:12px">${p.corporation}${p.alliance ? html`<div class="dim">${p.alliance}</div>` : ''}</td>
      <td>${standingBadge(p.standing)}</td><td class="nowrap">${z ? html`${threatBadge(z, true)} ${flagChips(z.flags, 2)}` : ''}</td>
      <td><a href="#" data-link="https://zkillboard.com/character/${p.id}/">zKill ↗</a></td></tr>`; })}</tbody></table></div>
    ${d.unknown.length ? html`<div class="dim" style="margin-top:8px">Not found: ${d.unknown.slice(0, 6).join(', ')}</div>` : ''}`);
}

function drawDscan() {
  const d = intelState.dscan, box = $('#ds-out');
  if (!box) return;
  box.innerHTML = String(html`<div class="grid grid-4" style="margin:12px 0">${stat('Objects', d.total)}${stat('Ships', d.ships, '', d.ships ? 'gold' : '')}${stat('Ships on grid', d.onGridShips, 'Within 8,000 km', d.onGridShips ? 'neg' : '')}${stat('Structures', d.structures.length)}</div>
    ${(d.signals || []).length ? html`<div class="panel" style="padding:10px 14px;margin-bottom:12px;border-color:var(--red)"><h3 class="mh" style="margin-top:0">Worth knowing</h3>
      ${d.signals.map(s => html`<div class="skill-row" style="align-items:flex-start"><span><span class="badge ${s.kind === 'field' ? 'gold' : 'red'}">${s.count}× ${s.label}</span>${s.onGrid ? html` <span class="badge red">${s.onGrid} on grid</span>` : ''} <span class="dim" style="font-size:12px">${s.why}${s.types ? ' (' + s.types.join(', ') + ')' : ''}</span></span>
        <span class="dim num" style="font-size:12px">${s.nearest !== undefined && isFinite(s.nearest) ? (s.nearest < 1e6 ? fmtNum(Math.round(s.nearest)) + ' km' : (s.nearest / 1.496e8).toFixed(1) + ' AU') : ''}</span></div>`)}</div>` : ''}
    ${(d.roles || []).length ? html`<h3 class="mh">Ships by role</h3><div class="pi-chips" style="margin-bottom:12px">${d.roles.map(r => html`<span class="badge ${r.role === 'Capitals' || r.role === 'Tackle, recon & ewar' ? 'red' : r.role === 'Logistics' ? 'gold' : r.role === 'Combat' ? 'accent' : ''}">${r.count}× ${r.role}</span>`)}</div>` : ''}
    <h3 class="mh">By class</h3><div class="pi-chips" style="margin-bottom:12px">${d.groups.slice(0, 16).map(g => html`<span class="badge">${g.count}× ${g.group}</span>`)}</div>
    <table><tbody>${d.types.slice(0, 40).map(t => html`<tr><td>${icon(t.typeId, 18)}${t.type}</td><td class="muted">${t.group}</td><td class="right num"><b>${t.count}</b></td><td class="right dim">${t.onGrid ? t.onGrid + ' on grid' : ''}</td></tr>`)}</tbody></table>`);
}

// ---------- Combat log ----------

async function tCombat() {
  const c = await api.intel.config();
  const cfg = c.ok ? c.data : {};
  setContent(html`<div class="toolbar"><label class="check" style="margin:0"><input type="checkbox" id="cb-on" ${raw(cfg.combat ? 'checked' : '')}> <b>Read combat logs</b> (Documents\\EVE\\logs\\Gamelogs)</label>
      <button class="btn btn-ghost" id="cb-reset">Reset totals</button>
      <label class="dim" style="font-size:12.5px">Under-attack alert <select id="cb-attack" class="crumb-select" style="width:auto">${[['players', 'When players shoot me'], ['all', 'When anything shoots me'], ['off', 'Off']].map(([v, l]) => html`<option value="${v}" ${raw((cfg.attackAlert || 'players') === v ? 'selected' : '')}>${l}</option>`)}</select></label>
      <span class="dim">Live damage per pilot from EVE's game logs. Logging must be on in game.</span></div>
    <div id="cb-out"></div>`);
  $('#cb-on').onchange = async e => { const r = await api.intel.setConfig({ combat: e.target.checked }); if (r.ok) toast(e.target.checked ? 'Reading combat logs' : 'Stopped'); drawCombat(); };
  $('#cb-attack').onchange = async e => { const r = await api.intel.setConfig({ attackAlert: e.target.value }); toast(r.ok ? 'Saved' : r.error, !r.ok); };
  $('#cb-reset').onclick = async () => { await api.intel.resetCombat(); intelState.combat = []; drawCombat(); };
  drawCombat();
}

function drawCombat() {
  const box = $('#cb-out');
  if (!box) return;
  const list = intelState.combat || [];
  if (!list.length) { box.innerHTML = String(emptyBox('No combat yet. Undock and shoot something. Damage appears here within a couple of seconds.')); return; }
  box.innerHTML = String(html`${list.map(c => html`<div class="panel"><h3>${c.who}</h3>
    <div class="grid grid-4" style="margin-bottom:12px">${stat('DPS out', fmtNum(c.dpsOut), `${fmtNum(c.dpsOut60)} avg over 60s`, 'pos')}${stat('DPS in', fmtNum(c.dpsIn), `${fmtNum(c.dpsIn60)} avg over 60s`, c.dpsIn > 0 ? 'neg' : '')}
      ${stat('Damage dealt', fmtNum(c.totals.out), 'This session')}${stat('Damage taken', fmtNum(c.totals.in), c.repIn ? fmtNum(c.repIn) + ' reps/s in' : '')}</div>
    <div class="grid grid-3"><div><h3 class="mh">Top targets</h3>${c.topTargets.map(([n, v]) => html`<div class="skill-row"><span>${n}</span><span class="num">${fmtNum(v)}</span></div>`)}</div>
      <div><h3 class="mh">Weapons</h3>${c.topWeapons.map(([n, v]) => html`<div class="skill-row"><span>${n}</span><span class="num">${fmtNum(v)}</span></div>`)}</div>
      <div><h3 class="mh">Latest</h3>${c.last.map(e => html`<div class="skill-row" style="font-size:12px"><span class="${e.kind === 'in' ? 'neg' : e.kind === 'out' ? 'pos' : 'muted'}">${e.kind === 'in' ? '◀' : e.kind === 'out' ? '▶' : '•'} ${fmtNum(e.amount)} ${e.other || ''}</span><span class="dim">${e.quality || e.weapon || ''}</span></div>`)}</div></div></div>`)}`);
}
