'use strict';
window.__overlay = true;
window.addEventListener('error', e => { try { api.diag.log('error', `overlay: ${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`); } catch {} });
/* Overlay window: compact live view over the EVE client. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const raw = s => s; const html = String.raw; // themes.js expects these helpers to exist
const S = { pilots: [], idx: 0, reports: [], local: [], spikes: [], route: null, stats: {}, locked: false, opacity: 0.92, settings: {} };
try { S.idx = Number(localStorage.getItem('ov-idx')) || 0; } catch {}
const SEC = s => { const r = Math.round(s * 10) / 10; return r >= 0.9 ? '#2fefef' : r >= 0.7 ? '#48f048' : r >= 0.5 ? '#c5f05a' : r >= 0.3 ? '#e8b64c' : r > 0 ? '#ed8936' : '#f56565'; };
const sec = s => `<span style="color:${SEC(s)};font-weight:700">${(Math.round(s * 10) / 10).toFixed(1)}</span>`;
const ago = t => { const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 60 ? m + 'm' : Math.round(m / 60) + 'h'; };

async function loadPilots() {
  const r = await api.nav.pilotLocations();
  if (r.ok) S.pilots = r.data.filter(p => p.systemId);
  if (S.idx >= S.pilots.length) S.idx = 0;
  await loadStats();
  render();
}
async function loadStats() {
  const ids = new Set();
  const p = S.pilots[S.idx]; if (p) ids.add(p.systemId);
  if (S.route) for (const x of S.route.path) ids.add(x.id);
  if (!ids.size) return;
  const r = await api.overlay.stats([...ids]); if (r.ok) S.stats = r.data;
}

function render() {
  const p = S.pilots[S.idx];
  const st = p ? S.stats[p.systemId] || {} : {};
  let h = `<div class="ov-head"><span class="t">EVE TOOLKIT${S.locked ? ' · locked (Ctrl+Shift+L)' : ''}</span>
    ${S.pilots.length > 1 ? `<button data-a="prev" title="Previous pilot">◀</button><button data-a="next" title="Next pilot">▶</button>` : ''}
    <button data-a="fade" title="Opacity">◐</button><button data-a="lock" title="Lock: clicks go through to EVE (Ctrl+Shift+L)">${S.locked ? '🔒' : '🔓'}</button><button data-a="close" title="Close (Ctrl+Shift+O)">✕</button></div><div class="ov-body">`;
  if (p) {
    const zone = p.whClass >= 1 && p.whClass <= 6 ? 'C' + p.whClass : p.region === 'Pochven' ? 'Pochven' : '';
    h += `<div class="ov-sec"><div class="dim" style="font-size:11px">${esc(p.name)}</div>
      <div class="ov-sys">${esc(p.system || '?')} ${p.security !== null && p.security !== undefined ? sec(p.security) : ''} <span class="dim" style="font-size:11px;font-weight:400">${esc(zone || p.region || '')}</span></div>
      <div style="margin-top:3px">${(st.ship || 0) + (st.pod || 0) ? `<span class="badge red">${st.ship || 0} ships · ${st.pod || 0} pods /1h</span>` : '<span class="badge green">no kills /1h</span>'} <span class="dim" style="font-size:11px">${st.npc || 0} NPC · ${st.jumps || 0} jumps</span></div></div>`;
    const localHere = S.local.filter(e => e.system === p.system && Date.now() - Date.parse(e.at) < 60 * 60000).slice(0, 4);
    if (localHere.length) h += `<div class="ov-sec"><h4>In Local</h4>${localHere.map(e => `<div class="ov-row"><span class="n">${esc(e.pilot.name)}</span><span class="badge ${e.alert ? 'red' : e.pilot.tone || ''}">${esc(e.level)}</span></div>`).join('')}</div>`;
  } else h += `<div class="ov-sec dim">Pilot locations appear once a pilot is logged in to EVE.</div>`;
  if (S.route && S.route.path.length) {
    const here = p ? S.route.path.findIndex(x => x.id === p.systemId) : -1;
    const start = Math.max(0, here);
    const next = S.route.path.slice(start, start + 7);
    h += `<div class="ov-sec"><h4>Route to ${esc(S.route.to)} · ${S.route.path.length - 1 - Math.max(0, here)} jumps left</h4>${next.map(x => {
      const k = (S.stats[x.id] || {}); const kills = (k.ship || 0) + (k.pod || 0);
      return `<div class="ov-row ${p && x.id === p.systemId ? 'here' : ''}"><span class="n">${p && x.id === p.systemId ? '▶ ' : ''}${esc(x.name)} ${sec(x.security)}${x.via && x.via !== 'gate' ? ` <span class="badge gold">${esc(x.via)}</span>` : ''}</span>
        <span>${x.hazard ? `<span class="badge ${x.hazard.severity === 'danger' ? 'red' : 'gold'}">${esc(x.hazard.title)}</span> ` : ''}${kills ? `<span class="badge ${kills >= 5 ? 'red' : 'gold'}">${kills}</span>` : ''}</span></div>`; }).join('')}</div>`;
  }
  const near = S.spikes.slice(0, 3);
  if (near.length) h += `<div class="ov-sec"><h4>Kill spikes near you</h4>${near.map(s => `<div class="ov-row"><span class="n">${esc(s.system)} ${sec(s.security)} <span class="dim">${s.near.jumps}j</span></span><span class="badge ${s.zone === 'hs' ? 'red' : 'gold'}">${s.shipKills} ships</span></div>`).join('')}</div>`;
  const reps = S.reports.filter(r => Date.now() - Date.parse(r.at) < 45 * 60000).slice(0, 6);
  h += `<div class="ov-sec"><h4>Intel</h4>${reps.length ? reps.map(r => `<div class="ov-rep ${r.alert ? 'alert' : ''}"><span class="tm">${ago(r.at)}</span>${r.closest ? `<b>${esc(r.closest.name)}</b> ${r.closest.near.jumps}j · ` : ''}${esc(r.text).slice(0, 90)}${r.top ? ` <span class="badge ${r.top.tone}">${esc(r.top.name)}: ${esc(r.top.level)}</span>` : ''}</div>`).join('') : '<div class="dim">Nothing in the last 45 minutes.</div>'}</div>`;
  h += '</div>';
  const box = document.getElementById('ov');
  box.innerHTML = h;
  document.body.classList.toggle('ov-locked', S.locked);
  box.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    const a = b.dataset.a;
    if (a === 'close') api.overlay.toggle();
    else if (a === 'lock') { const r = await api.overlay.lock(!S.locked); if (r.ok) S.locked = r.data.locked; render(); }
    else if (a === 'fade') { const steps = [1, 0.85, 0.7, 0.55]; const i = steps.findIndex(x => Math.abs(x - S.opacity) < 0.05); S.opacity = steps[(i + 1) % steps.length]; api.overlay.opacity(S.opacity); }
    else { S.idx = (S.idx + (a === 'next' ? 1 : S.pilots.length - 1)) % S.pilots.length; try { localStorage.setItem('ov-idx', S.idx); } catch {} loadStats().then(render); }
  });
}

(async function boot() {
  const [s, c, rep, rt] = await Promise.all([api.getSettings(), api.overlay.cfg(), api.intel.reports(), api.overlay.getRoute()]);
  const th = await api.overlay.getTheme();
  if (th.ok && th.data) applyTheme(th.data.id, th.data.accent);
  else if (s.ok) applyTheme(s.data.theme, s.data.themeAccent);
  if (s.ok) S.settings = s.data;
  api.overlay.onTheme(t => { if (t && t.id) applyTheme(t.id, t.accent); });
  if (c.ok) { S.locked = c.data.locked; S.opacity = c.data.opacity; }
  if (rep.ok) { S.reports = rep.data.reports || []; S.spikes = rep.data.spikes || []; S.local = rep.data.local || []; }
  if (rt.ok) S.route = rt.data;
  render();
  await loadPilots();
  setInterval(loadPilots, 30000);
  setInterval(render, 30000);
})();
api.intel.onReport(r => { S.reports.unshift(r); S.reports.length = Math.min(S.reports.length, 100); render(); });
api.intel.onLocal(e => { S.local.unshift(e); S.local.length = Math.min(S.local.length, 50); render(); });
api.intel.onSpikes(s => { S.spikes = s; render(); });
api.overlay.onRoute(r => { S.route = r; loadStats().then(render); });
api.overlay.onState(st => { S.locked = st.locked; S.opacity = st.opacity; render(); });
