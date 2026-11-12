'use strict';
/* Wormhole mapper. Helpers from app.js / views-extra.js / views-corp.js (openModal, field…). */

const whState = { maps: [], mapId: null, sel: null, zoom: null, status: null, activity: {}, routes: {} };

const CLASS_COLOR = {
  C1: '#63b3ed', C2: '#4fd1c5', C3: '#68d391', C4: '#e8b64c', C5: '#ed8936', C6: '#f56565',
  Thera: '#b794f4', C13: '#a0aec0', Drifter: '#fc8181', Pochven: '#f56565', HS: '#68d391', LS: '#e8b64c', NS: '#f56565', J: '#a0aec0'
};
const MASS = { stable: { label: 'Stable', color: '#4fd1c5' }, destab: { label: 'Destab (<50%)', color: '#e8b64c' }, crit: { label: 'Critical (<10%)', color: '#f56565' } };
const SIZE_W = { S: 2, M: 3.5, L: 5, XL: 7 };
const SIZE_LABEL = { S: 'Frigate', M: 'Medium', L: 'Large', XL: 'Capital / XL' };
const NODE_W = 168, NODE_H = 58;

const curMap = () => whState.maps.find(m => m.id === whState.mapId) || null;
const sysClassLabel = s => s.wspace || ['Thera', 'C13', 'Drifter', 'Pochven'].includes(s.cls) ? s.cls : `${s.cls} ${Number(s.security).toFixed(1)}`;
const ageStr = d => { if (!d) return ''; const m = Math.floor((Date.now() - Date.parse(d)) / 60000); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; };

async function whOp(o, mapId = whState.mapId) {
  const r = await api.wh.op(mapId, o);
  if (!r.ok) { toast(r.error, true); return null; }
  const m = r.data && r.data.map ? r.data.map : r.data;
  if (m && m.id) {
    const i = whState.maps.findIndex(x => x.id === m.id);
    if (i === -1) whState.maps.push(m); else whState.maps[i] = m;
  }
  return r.data;
}

// ================= View =================

async function renderWormholes(stillCurrent) {
  setContent(loadingView('Loading maps…'));
  const [maps, st] = await Promise.all([api.wh.maps(), api.wh.status()]);
  if (!stillCurrent()) return;
  whState.maps = maps.ok ? maps.data : [];
  whState.status = st.ok ? st.data : null;
  if (!whState.maps.length) {
    const r = await whOp({ kind: 'createMap', name: 'Home chain' }, null);
    if (r) whState.mapId = r.id;
  }
  if (!whState.mapId || !curMap()) whState.mapId = (whState.status && whState.status.mapId) || (whState.maps[0] && whState.maps[0].id);
  drawWh();
  refreshActivity();
}

async function refreshActivity() {
  const m = curMap();
  if (!m || !m.systems.length) return;
  const r = await api.wh.activity(m.systems.map(s => s.id));
  if (r.ok) { whState.activity = r.data; if (state.view === 'wormholes') drawCanvas(); }
}

function drawWh() {
  const m = curMap();
  const st = whState.status || { active: false, pilots: [] };
  const pilots = state.characters.filter(c => !c.needsReauth);
  const tracking = st.active && st.mapId === (m && m.id);
  setContent(html`
    <div class="toolbar wh-toolbar">
      <select id="wh-map" class="crumb-select">${whState.maps.map(x => html`<option value="${x.id}" ${raw(m && x.id === m.id ? 'selected' : '')}>${x.name} (${(x.systems || []).length})</option>`)}</select>
      <button class="btn btn-ghost" id="wh-newmap" title="New map">+ Map</button>
      <button class="btn btn-ghost" id="wh-rename">Rename</button>
      <button class="btn btn-ghost" id="wh-share" title="Export this map, or import one from EVE Toolkit, Pathfinder, Wanderer or Nexum">⇄ Share / import</button>
      <button class="btn btn-ghost" id="wh-rollbtn" title="Work out which ships to send through to close a wormhole">Rolling</button>
      <span class="wh-sep"></span>
      <input type="search" id="wh-add" placeholder="Add system by name (e.g. J123456, Jita)…" style="min-width:250px">
      <span class="wh-sep"></span>
      ${tracking
        ? html`<button class="btn btn-danger" id="wh-stop">■ Stop tracking</button><span class="badge green">Live: ${st.pilots.length} pilot${st.pilots.length === 1 ? '' : 's'}</span>`
        : html`<button class="btn btn-primary" id="wh-start" ${raw(pilots.length ? '' : 'disabled')}>▶ Track pilots</button>`}
      <span style="flex:1"></span>
      <label class="check" style="margin:0" title="Also map stargate jumps out of systems already on the map"><input type="checkbox" id="wh-gates" ${raw(m && m.mapGates ? 'checked' : '')}> Map gate jumps</label>
      <button class="btn btn-ghost" id="wh-clear" title="Remove connections older than 24h or EOL for 4h+">Clear old</button>
      <div class="seg"><button id="wh-zout" title="Zoom out">−</button><button id="wh-zfit" title="Fit to view">Fit</button><button id="wh-zin" title="Zoom in">+</button></div>
    </div>
    <div class="wh-layout">
      <div class="panel wh-canvas-wrap" id="wh-canvas"></div>
      <div class="wh-side" id="wh-side"></div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="panel" id="wh-chain"></div>
      <div class="panel" id="wh-log"></div>
    </div>`);
  drawCanvas(); drawSide(); drawChainList(); drawLog();
  bindWhToolbar();
}

// ---------- Canvas ----------

function drawCanvas() {
  const box = document.getElementById('wh-canvas');
  const m = curMap();
  if (!box || !m) return;
  if (!m.systems.length) {
    box.innerHTML = String(html`<div class="empty"><h2>Empty map</h2><p>Click <b>Track pilots</b> and jump through a wormhole. Systems and connections are added automatically as you jump.<br>You can also add a system by name in the box above.</p></div>`);
    return;
  }
  const st = whState.status || { positions: {} };
  const tracked = st.active && st.mapId === m.id;
  const pilotsAt = {};
  if (tracked) for (const [cid, sid] of Object.entries(st.positions)) (pilotsAt[sid] = pilotsAt[sid] || []).push(Number(cid));
  const W = Math.max(1100, ...m.systems.map(s => s.x + NODE_W + 80));
  const H = Math.max(520, ...m.systems.map(s => s.y + NODE_H + 80));
  const pos = id => { const s = m.systems.find(x => x.id === id); return s ? { x: s.x + NODE_W / 2, y: s.y + NODE_H / 2 } : null; };
  let edges = '';
  for (const c of m.connections) {
    const a = pos(c.from), b = pos(c.to);
    if (!a || !b) continue;
    const ageH = (Date.now() - Date.parse(c.createdAt)) / 3600000;
    const color = c.gate ? '#56677a' : MASS[c.mass || 'stable'].color;
    const sel = whState.sel && whState.sel.type === 'conn' && whState.sel.id === c.id;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const label = [c.type, c.eol ? 'EOL' : '', ageH >= 1 ? Math.floor(ageH) + 'h' : Math.floor(ageH * 60) + 'm'].filter(Boolean).join(' · ');
    edges += `<g class="wh-edge ${sel ? 'sel' : ''} ${ageH > 16 && !c.gate ? 'old' : ''}" data-conn="${esc(c.id)}">
      <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="hit"/>
      <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" stroke-width="${c.gate ? 1.5 : SIZE_W[c.size || 'L']}" ${c.eol ? 'stroke-dasharray="8 6"' : ''} class="ln"/>
      ${c.gate ? '' : `<g transform="translate(${mx},${my})"><rect x="${-label.length * 3.3 - 8}" y="-10" width="${label.length * 6.6 + 16}" height="20" rx="10" class="elbl-bg" stroke="${color}"/><text y="4" class="elbl">${esc(label)}</text></g>`}</g>`;
  }
  let nodes = '';
  for (const s of m.systems) {
    const color = CLASS_COLOR[s.cls] || '#a0aec0';
    const sel = whState.sel && whState.sel.type === 'sys' && whState.sel.id === s.id;
    const act = whState.activity[s.id];
    const kills = act && act.kills ? act.kills.ship + act.kills.pod : 0;
    const npc = act && act.kills ? act.kills.npc : 0;
    const here = pilotsAt[s.id] || [];
    const sigs = (s.sigs || []).filter(x => x.group === 'Signature' && !x.gone);
    const unscanned = sigs.filter(x => !x.type).length;
    nodes += `<g class="wh-node ${sel ? 'sel' : ''}" data-sys="${s.id}" transform="translate(${s.x},${s.y})">
      <rect width="${NODE_W}" height="${NODE_H}" rx="8" class="nb"/>
      <rect width="5" height="${NODE_H}" rx="2" fill="${color}"/>
      <text x="14" y="21" class="nn">${esc(s.name)}${m.homeId === s.id ? ' ⌂' : ''}</text>
      <text x="${NODE_W - 10}" y="21" class="nc" fill="${color}">${esc(sysClassLabel(s))}</text>
      <text x="14" y="38" class="ns">${esc(s.label || s.region || '')}</text>
      <text x="14" y="51" class="ni">${sigs.length ? `◎ ${sigs.length}${unscanned ? ` (${unscanned} ?)` : ''}` : ''}${kills ? `  ✖ ${kills}` : ''}${npc ? `  ☠ ${npc}` : ''}</text>
      ${here.slice(0, 4).map((cid, i) => `<image href="${IMG}/characters/${cid}/portrait?size=64" x="${NODE_W - 24 - i * 20}" y="${NODE_H - 24}" width="18" height="18" class="pp"/>`).join('')}
    </g>`;
  }
  const contentW = Math.max(...m.systems.map(s => s.x + NODE_W + 40)), contentH = Math.max(...m.systems.map(s => s.y + NODE_H + 40));
  const zoom = whState.zoom || Math.max(0.45, Math.min(1.2, (box.clientWidth - 8) / contentW, (box.clientHeight - 8) / contentH));
  whState.curZoom = zoom;
  box.innerHTML = `<svg id="wh-svg" width="${W * zoom}" height="${H * zoom}" viewBox="0 0 ${W} ${H}">
    <defs><pattern id="whgrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" style="stroke:var(--panel-2)" stroke-width="1"/></pattern></defs>
    <rect width="${W}" height="${H}" fill="url(#whgrid)" class="bg"/>${edges}${nodes}</svg>`;
  bindCanvas();
}

function bindCanvas() {
  const svg = document.getElementById('wh-svg');
  if (!svg) return;
  const toSvg = e => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  svg.querySelectorAll('.wh-node').forEach(g => {
    g.addEventListener('pointerdown', e => {
      e.preventDefault();
      const id = Number(g.dataset.sys);
      const s = curMap().systems.find(x => x.id === id);
      const start = toSvg(e), ox = s.x, oy = s.y;
      let moved = false;
      whState.dragging = true;
      g.setPointerCapture(e.pointerId);
      const move = ev => {
        const p = toSvg(ev);
        const nx = Math.max(0, Math.round((ox + p.x - start.x) / 10) * 10), ny = Math.max(0, Math.round((oy + p.y - start.y) / 10) * 10);
        if (Math.abs(p.x - start.x) + Math.abs(p.y - start.y) > 4) moved = true;
        s.x = nx; s.y = ny;
        if (moved) drawCanvasFast();
      };
      const up = async () => {
        g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up);
        whState.dragging = false;
        if (moved) { await whOp({ kind: 'moveSystem', id, x: s.x, y: s.y }); drawCanvas(); }
        else { whState.sel = { type: 'sys', id }; drawCanvas(); drawSide(); }
      };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
    });
  });
  svg.querySelectorAll('.wh-edge').forEach(g => g.addEventListener('click', () => { whState.sel = { type: 'conn', id: g.dataset.conn }; drawCanvas(); drawSide(); }));
  svg.querySelector('.bg').addEventListener('click', () => { whState.sel = null; drawCanvas(); drawSide(); });
}
// Cheap redraw while dragging (no rebinding race: re-bind is fine because pointer capture stays on old node until up)
let dragFrame = null;
function drawCanvasFast() {
  if (dragFrame) return;
  dragFrame = requestAnimationFrame(() => {
    dragFrame = null;
    const m = curMap(); const svg = document.getElementById('wh-svg');
    if (!m || !svg) return;
    for (const s of m.systems) { const g = svg.querySelector(`.wh-node[data-sys="${s.id}"]`); if (g) g.setAttribute('transform', `translate(${s.x},${s.y})`); }
    for (const c of m.connections) {
      const a = m.systems.find(x => x.id === c.from), b = m.systems.find(x => x.id === c.to);
      const g = svg.querySelector(`.wh-edge[data-conn="${c.id}"]`);
      if (!a || !b || !g) continue;
      const ax = a.x + NODE_W / 2, ay = a.y + NODE_H / 2, bx = b.x + NODE_W / 2, by = b.y + NODE_H / 2;
      g.querySelectorAll('line').forEach(l => { l.setAttribute('x1', ax); l.setAttribute('y1', ay); l.setAttribute('x2', bx); l.setAttribute('y2', by); });
      const lbl = g.querySelector('g'); if (lbl) lbl.setAttribute('transform', `translate(${(ax + bx) / 2},${(ay + by) / 2})`);
    }
  });
}

// ---------- Side panel ----------

function drawSide() {
  const box = document.getElementById('wh-side');
  const m = curMap();
  if (!box || !m) return;
  const sel = whState.sel;
  if (!sel) {
    const wsys = m.systems.filter(s => s.wspace).length;
    const eol = m.connections.filter(c => c.eol).length;
    box.innerHTML = String(html`<div class="panel"><h3>${m.name}</h3>
      <div class="kv"><span class="k">Systems</span><span>${m.systems.length} (${wsys} J-space)</span><span class="k">Connections</span><span>${m.connections.filter(c => !c.gate).length} wormholes</span>
        <span class="k">End of life</span><span class="${eol ? 'gold' : ''}">${eol}</span><span class="k">Critical mass</span><span class="${m.connections.some(c => c.mass === 'crit') ? 'neg' : ''}">${m.connections.filter(c => c.mass === 'crit').length}</span></div>
      <div class="dim" style="margin-top:12px;font-size:12.5px;line-height:1.6">Click a system to see its signatures, activity and routes. Click a connection to set its type, size, mass and life. Drag systems to arrange the chain.<br><br>
      Maps are shared with other officers through <b>Corporation → Discord → Share & Backup</b>.</div>
      <div style="margin-top:14px"><button class="btn btn-danger" id="wh-delmap">Delete this map</button></div></div>`);
    $('#wh-delmap').onclick = async () => {
      const b = $('#wh-delmap'); if (b.dataset.c !== '1') { b.dataset.c = '1'; b.textContent = 'Click again to delete'; return; }
      await api.wh.op(m.id, { kind: 'deleteMap' }); whState.maps = whState.maps.filter(x => x.id !== m.id); whState.mapId = null; render();
    };
    return;
  }
  if (sel.type === 'conn') return drawConnSide(box, m, m.connections.find(c => c.id === sel.id));
  const s = m.systems.find(x => x.id === sel.id);
  if (!s) { whState.sel = null; return drawSide(); }
  const act = whState.activity[s.id];
  const routes = whState.routes[s.id];
  const sigs = (s.sigs || []).slice().sort((a, b) => (a.group === b.group ? a.id.localeCompare(b.id) : a.group === 'Signature' ? -1 : 1));
  box.innerHTML = String(html`<div class="panel">
    <div style="display:flex;justify-content:space-between;align-items:start;gap:10px">
      <div><div style="font:400 20px var(--font-num)">${s.name}${m.homeId === s.id ? ' ⌂' : ''}</div><div class="muted">${s.region}</div></div>
      <span class="badge" style="color:${CLASS_COLOR[s.cls]};border-color:${CLASS_COLOR[s.cls]}">${sysClassLabel(s)}</span></div>
    ${s.wspace ? raw('<div id="wh-info"></div>') : ''}
    <div class="kv" style="margin-top:12px">
      <span class="k">Last hour</span><span>${act && act.kills ? html`<span class="${act.kills.ship ? 'neg' : ''}">${act.kills.ship} ships</span> · ${act.kills.pod} pods · ${act.kills.npc} NPCs` : 'No kills'}${act && act.jumps !== null ? ' · ' + act.jumps + ' jumps' : ''}</span>
      ${!s.wspace ? html`<span class="k">To trade hubs</span><span>${routes ? Object.entries(routes).map(([h, n]) => `${h} ${n ?? '—'}`).join(' · ') : raw('<a href="#" id="wh-routes">Calculate jumps</a>')}</span>` : ''}
    </div>
    <div class="field" style="margin-top:12px"><label>Label</label><input type="text" id="wh-label" value="${s.label || ''}" placeholder="e.g. Home, Static C5, Hostile"></div>
    <div class="field"><label>Notes</label><textarea id="wh-notes" rows="2">${s.notes || ''}</textarea></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost" id="wh-home">${m.homeId === s.id ? 'Home ✓' : 'Set as home'}</button>
      <button class="btn btn-ghost" id="wh-res" title="Who lives here? From zKillboard">Who lives here?</button>
      <button class="btn btn-ghost" id="wh-link">+ Connect to…</button>
      <a class="btn btn-ghost" href="#" data-link="https://zkillboard.com/system/${s.id}/">zKill ↗</a>
      <button class="btn btn-danger" id="wh-rmsys">Remove</button></div>
  </div>
  <div class="panel"><h3>Signatures ${s.sigsAt ? html`<span class="dim" style="text-transform:none;letter-spacing:0">· updated ${ageStr(s.sigsAt)} ago</span>` : ''}</h3>
    <textarea id="wh-paste" rows="3" placeholder="Probe scanner → Ctrl+A, Ctrl+C → paste here" style="width:100%;background:var(--bg-2);border:1px solid var(--line-2);color:var(--text);border-radius:6px;padding:8px;font:12px Consolas,monospace"></textarea>
    <div style="display:flex;gap:10px;align-items:center;margin:6px 0 10px"><button class="btn btn-primary" id="wh-pastebtn">Update signatures</button>
      <label class="check" style="margin:0" title="Off: signatures no longer in the scanner are crossed out so you can check them first"><input type="checkbox" id="wh-rmmissing" ${raw(localStorage.getItem('whRmMissing') === '1' ? 'checked' : '')}> Delete missing straight away</label></div>
    ${sigs.some(x => x.gone) ? html`<div class="notice" style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><span style="flex:1">${sigs.filter(x => x.gone).length} signature${sigs.filter(x => x.gone).length === 1 ? ' is' : 's are'} no longer in your scanner (crossed out below).</span><button class="btn btn-ghost" id="wh-delgone">Delete them</button></div>` : ''}
    ${sigs.length ? html`<table class="wh-sigs"><thead><tr><th>ID</th><th>Type</th><th>Name / WH</th><th class="right">%</th><th class="right">Age</th><th></th></tr></thead><tbody>
      ${sigs.map(x => { const fresh = Date.now() - Date.parse(x.firstSeen) < 10 * 60000; return html`<tr class="${x.gone ? 'gone' : ''} ${fresh ? 'fresh' : ''}">
        <td class="num">${x.id}</td><td>${x.group === 'Anomaly' ? raw('<span class="dim">Anom</span> ') : ''}${x.type ? html`<span class="badge ${x.type === 'Wormhole' ? 'accent' : ''}">${x.type}</span>` : raw('<span class="gold">?</span>')}</td>
        <td>${x.type === 'Wormhole' ? html`<input class="wh-mini" data-sigwh="${x.id}" value="${x.whType || ''}" placeholder="Type"> <input class="wh-mini wide" data-siglead="${x.id}" value="${x.leadsTo || ''}" placeholder="Leads to (system)">` : html`<span class="muted">${x.name}</span>`}</td>
        <td class="right num ${x.strength >= 100 ? 'pos' : ''}">${x.strength ? Math.round(x.strength) : ''}</td><td class="right dim">${ageStr(x.firstSeen)}</td>
        <td><button class="btn btn-ghost" style="padding:1px 7px" data-sigdel="${x.id}">✕</button></td></tr>`; })}</tbody></table>` : html`<div class="muted">No signatures recorded</div>`}
  </div>`);
  if (s.wspace) api.wh.info(s.id).then(r => { const el = $('#wh-info'); if (el && r.ok && r.data) el.innerHTML = String(whInfoHtml(r.data)); });
  $('#wh-label').onchange = e => whOp({ kind: 'updateSystem', id: s.id, patch: { label: e.target.value } }).then(drawCanvas);
  $('#wh-notes').onchange = e => whOp({ kind: 'updateSystem', id: s.id, patch: { notes: e.target.value } });
  $('#wh-home').onclick = async () => { await whOp({ kind: 'setHome', id: s.id }); drawCanvas(); drawSide(); };
  $('#wh-res').onclick = () => openWhResCard(s.name);
  $('#wh-rmsys').onclick = async () => { await whOp({ kind: 'removeSystem', id: s.id }); whState.sel = null; drawCanvas(); drawSide(); drawChainList(); };
  $('#wh-link').onclick = () => openModal(`Connect ${s.name} to…`, html`${field('System name', inputText('name', '', 'e.g. J123456 or a k-space system'))}
    <div class="grid grid-2">${field('Wormhole type', inputText('type', '', 'e.g. K162'))}${field('Size', select('size', Object.entries(SIZE_LABEL), 'L'))}</div>`, {
      submit: 'Connect', onSubmit: async d => { const r = await whOp({ kind: 'addSystemByName', name: d.name, parentId: s.id, connection: { type: d.type.trim().toUpperCase(), size: d.size } }); if (!r) return true; drawCanvas(); drawChainList(); refreshActivity(); }
    });
  const rl = $('#wh-routes');
  if (rl) rl.onclick = async e => { e.preventDefault(); rl.textContent = 'Calculating…'; const r = await api.wh.routes(s.id); if (r.ok) { whState.routes[s.id] = r.data; drawSide(); } };
  $('#wh-pastebtn').onclick = async () => {
    const text = $('#wh-paste').value;
    if (!text.trim()) return toast('Paste your probe scanner results first.', true);
    try { localStorage.setItem('whRmMissing', $('#wh-rmmissing').checked ? '1' : '0'); } catch {}
    const r = await whOp({ kind: 'pasteSigs', systemId: s.id, text, removeMissing: $('#wh-rmmissing').checked });
    if (r && r.result) { const gone = (r.map.systems.find(x => x.id === s.id) || { sigs: [] }).sigs.filter(x => x.gone).length; toast(`Signatures: ${r.result.added} new, ${r.result.updated} updated, ${r.result.removed ? r.result.removed + ' removed' : gone + ' gone'}`); }
    drawCanvas(); drawSide();
  };
  document.querySelectorAll('[data-sigwh]').forEach(i => i.onchange = () => whOp({ kind: 'updateSig', systemId: s.id, sigId: i.dataset.sigwh, patch: { whType: i.value.trim().toUpperCase() } }));
  document.querySelectorAll('[data-siglead]').forEach(i => i.onchange = async () => {
    if (!i.value.trim()) return;
    const r = await whOp({ kind: 'updateSig', systemId: s.id, sigId: i.dataset.siglead, patch: { leadsTo: i.value.trim() } });
    if (r) { toast('Connection added'); drawCanvas(); drawSide(); drawChainList(); refreshActivity(); }
  });
  if ($('#wh-delgone')) $('#wh-delgone').onclick = async () => { await whOp({ kind: 'removeGoneSigs', systemId: s.id }); drawSide(); drawCanvas(); };
  document.querySelectorAll('[data-sigdel]').forEach(b => b.onclick = async () => { await whOp({ kind: 'removeSig', systemId: s.id, sigId: b.dataset.sigdel }); drawSide(); drawCanvas(); });
}

function drawConnSide(box, m, c) {
  if (!c) { whState.sel = null; return drawSide(); }
  const a = m.systems.find(x => x.id === c.from), b = m.systems.find(x => x.id === c.to);
  box.innerHTML = String(html`<div class="panel">
    <h3>Connection</h3>
    <div style="font:400 18px var(--font-num);margin-bottom:4px">${a ? a.name : c.from} ⇄ ${b ? b.name : c.to}</div>
    <div class="dim" style="margin-bottom:12px">Found ${ageStr(c.createdAt)} ago${c.firstBy ? ' by ' + c.firstBy : ''}${c.eolAt ? ` · EOL since ${ageStr(c.eolAt)}` : ''}</div>
    ${c.gate ? html`<div class="muted">Stargate connection</div>` : html`
    <div class="grid grid-2">${field('Wormhole type', html`<input type="text" id="wc-type" value="${c.type || ''}" placeholder="e.g. K162, B274">`)}${field('Max ship size', select('wc-size', Object.entries(SIZE_LABEL), c.size || 'L'))}</div>
    <div class="field"><label>Mass</label><div class="seg">${Object.entries(MASS).map(([k, v]) => html`<button data-mass="${k}" class="${(c.mass || 'stable') === k ? 'active' : ''}" style="${(c.mass || 'stable') === k ? `color:${v.color}` : ''}">${v.label}</button>`)}</div></div>
    <label class="check"><input type="checkbox" id="wc-eol" ${raw(c.eol ? 'checked' : '')}> End of life (less than 4 hours left)</label>
    <div class="field"><label>Notes</label><textarea id="wc-notes" rows="2">${c.notes || ''}</textarea></div>`}
    <div style="display:flex;gap:8px;flex-wrap:wrap">${c.gate ? '' : html`<button class="btn btn-ghost" id="wc-roll">Plan rolling…</button>`}<button class="btn btn-danger" id="wc-del">Delete connection</button></div></div>`);
  if (!c.gate) {
    const up = patch => whOp({ kind: 'updateConnection', id: c.id, patch }).then(() => { drawCanvas(); drawSide(); drawChainList(); });
    $('#wc-type').onchange = e => up({ type: e.target.value.trim().toUpperCase() });
    document.querySelector('[name="wc-size"]').onchange = e => up({ size: e.target.value });
    document.querySelectorAll('[data-mass]').forEach(btn => btn.onclick = () => up({ mass: btn.dataset.mass }));
    $('#wc-eol').onchange = e => up({ eol: e.target.checked });
    $('#wc-notes').onchange = e => whOp({ kind: 'updateConnection', id: c.id, patch: { notes: e.target.value } });
  }
  showWhTypeInfo(c);
  if ($('#wc-roll')) $('#wc-roll').onclick = () => openRollModal(c);
  $('#wc-del').onclick = async () => { await whOp({ kind: 'removeConnection', id: c.id }); whState.sel = null; drawCanvas(); drawSide(); drawChainList(); };
}

let whTypesCache = null;
async function showWhTypeInfo(c) {
  if (!c || c.gate) return;
  if (!whTypesCache) { const r = await api.sde.wormholeTypes(); whTypesCache = r.ok ? r.data : []; }
  const input = $('#wc-type');
  if (!input) return;
  if (!input.list && whTypesCache.length) {
    const dl = document.createElement('datalist'); dl.id = 'wh-type-list';
    dl.innerHTML = whTypesCache.map(t => `<option value="${t.code}">${t.leadsTo}</option>`).join('');
    document.body.appendChild(dl); input.setAttribute('list', 'wh-type-list');
  }
  const t = whTypesCache.find(x => x.code === String(c.type || '').toUpperCase());
  if (!t) return;
  const box = document.createElement('div');
  box.className = 'notice'; box.style.cssText = 'background:var(--accent-dim);border-color:var(--accent-line);color:var(--text)';
  box.innerHTML = String(html`<b>${t.code}</b> leads to <b>${t.leadsTo}</b>${t.lifeHours ? html` · lives ${t.lifeHours}h` : ''}${t.totalMass ? html` · ${fmtNum(t.totalMass / 1e6)}M kg total` : ''}${t.jumpMass ? html` · max ship ${fmtNum(t.jumpMass / 1e6)}M kg` : ''}${t.regen ? ' · mass regenerates' : ''}`);
  input.closest('.grid').after(box);
}

function drawChainList() {
  const box = document.getElementById('wh-chain');
  const m = curMap();
  if (!box || !m) return;
  const name = id => (m.systems.find(s => s.id === id) || {}).name || id;
  const list = m.connections.filter(c => !c.gate).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  box.innerHTML = String(html`<h3>Connections by age</h3>${list.length ? html`<table><tbody>${list.map(c => {
    const h = (Date.now() - Date.parse(c.createdAt)) / 3600000;
    return html`<tr class="clickable" data-selconn="${c.id}"><td>${name(c.from)} ⇄ ${name(c.to)}</td><td>${c.type ? html`<span class="badge">${c.type}</span>` : ''} <span class="dim">${SIZE_LABEL[c.size || 'L']}</span></td>
      <td><span style="color:${MASS[c.mass || 'stable'].color}">${MASS[c.mass || 'stable'].label}</span>${c.eol ? raw(' <span class="badge gold">EOL</span>') : ''}</td>
      <td class="right num ${h > 16 ? 'gold' : ''}">${ageStr(c.createdAt)}</td></tr>`; })}</tbody></table>` : html`<div class="muted">No wormhole connections yet</div>`}`);
  box.querySelectorAll('[data-selconn]').forEach(tr => tr.onclick = () => { whState.sel = { type: 'conn', id: tr.dataset.selconn }; drawCanvas(); drawSide(); });
}

function drawLog() {
  const box = document.getElementById('wh-log');
  if (!box) return;
  const st = whState.status || { log: [], active: false };
  const names = (whState.status && whState.status.shipNames) || {};
  box.innerHTML = String(html`<h3>Jump log ${st.active ? raw('<span class="badge green" style="margin-left:6px">live</span>') : ''}</h3>
    ${st.active ? html`<div class="skill-rows" style="padding:0;grid-template-columns:1fr;margin-bottom:8px">${st.pilots.map(cid => { const c = state.characters.find(x => x.id === cid); const sys = st.positions[cid]; const s = curMap() && curMap().systems.find(x => x.id === sys);
      return html`<div class="skill-row"><span>${charImg(cid, 18)}${c ? c.name : cid}</span><span class="muted">${s ? s.name : (sys ? 'System ' + sys : 'locating…')}${names[cid] ? ' · ' + names[cid] : ''}</span></div>`; })}</div>` : ''}
    ${st.log && st.log.length ? html`<table><tbody>${st.log.slice(0, 15).map(j => html`<tr><td class="nowrap dim">${new Date(j.at).toLocaleTimeString('en-AU')}</td><td>${j.charName}</td><td>${j.fromName} → ${j.toName}</td>
      <td>${j.gate ? raw('<span class="badge">gate</span>') : raw('<span class="badge accent">wormhole</span>')}${j.mapped ? raw(' <span class="badge green">mapped</span>') : ''}</td></tr>`)}</tbody></table>` : html`<div class="muted">${st.active ? 'Waiting for jumps (checked every 10 seconds)…' : 'Start tracking to log jumps and map connections automatically.'}</div>`}`);
}

function bindWhToolbar() {
  const m = curMap();
  $('#wh-map').onchange = e => { whState.mapId = e.target.value; whState.sel = null; drawWh(); refreshActivity(); };
  $('#wh-newmap').onclick = () => openModal('New map', field('Name', inputText('name', '', 'e.g. Scouting chain')), { submit: 'Create', onSubmit: async d => { const r = await whOp({ kind: 'createMap', name: d.name || 'Chain' }, null); if (r) { whState.mapId = r.id; drawWh(); } } });
  $('#wh-share').onclick = () => whShareModal(m);
  $('#wh-rollbtn').onclick = () => openRollModal(null);
  $('#wh-rename').onclick = () => openModal('Rename map', field('Name', inputText('name', m.name)), { onSubmit: async d => { await whOp({ kind: 'renameMap', name: d.name || m.name }); drawWh(); } });
  $('#wh-add').onkeydown = async e => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return;
    const parent = whState.sel && whState.sel.type === 'sys' ? whState.sel.id : null;
    const r = await whOp({ kind: 'addSystemByName', name: e.target.value.trim(), parentId: parent });
    if (r) { e.target.value = ''; drawCanvas(); drawChainList(); refreshActivity(); toast(parent ? 'System added and connected to the selected system' : 'System added'); }
  };
  const start = $('#wh-start');
  if (start) start.onclick = () => {
    const pilots = state.characters.filter(c => !c.needsReauth);
    openModal('Track pilots', html`<div class="muted" style="margin-bottom:10px">Selected pilots' locations are checked every 10 seconds. Jumping through a wormhole from a system on this map adds the new system and the connection automatically.</div>
      ${pilots.map(c => checkbox('p' + c.id, html`${charImg(c.id, 20)}${c.name}`, true))}`, {
      submit: 'Start tracking', onSubmit: async d => {
        const ids = pilots.filter(c => d['p' + c.id]).map(c => c.id);
        if (!ids.length) throw new Error('Pick at least one pilot.');
        const r = await api.wh.track(m.id, ids);
        if (!r.ok) throw new Error(r.error);
        whState.status = r.data; drawWh();
      }
    });
  };
  const stop = $('#wh-stop');
  if (stop) stop.onclick = async () => { const r = await api.wh.untrack(); if (r.ok) whState.status = r.data; drawWh(); };
  $('#wh-gates').onchange = e => whOp({ kind: 'setOption', key: 'mapGates', value: e.target.checked });
  $('#wh-clear').onclick = async () => { await whOp({ kind: 'clearOld', hours: 24 }); whState.sel = null; drawCanvas(); drawSide(); drawChainList(); toast('Old connections cleared'); };
  $('#wh-zin').onclick = () => { whState.zoom = Math.min(2, (whState.zoom || whState.curZoom || 1) + 0.15); drawCanvas(); };
  $('#wh-zout').onclick = () => { whState.zoom = Math.max(0.35, (whState.zoom || whState.curZoom || 1) - 0.15); drawCanvas(); };
  $('#wh-zfit').onclick = () => { whState.zoom = null; drawCanvas(); };
}

if (window.api && api.wh) api.wh.onEvent(async ({ kind, data }) => {
  if (kind === 'map') {
    const i = whState.maps.findIndex(x => x.id === data.id);
    if (i === -1) whState.maps.push(data); else whState.maps[i] = data;
    if (state.view === 'wormholes' && whState.mapId === data.id && !whState.dragging) { drawCanvas(); drawChainList(); refreshActivity(); }
  } else if (kind === 'positions' || kind === 'jump') {
    const st = await api.wh.status();
    if (st.ok) whState.status = st.data;
    if (state.view === 'wormholes') { drawLog(); if (kind === 'positions' && !whState.dragging) drawCanvas(); }
    if (kind === 'jump' && data.mapped && !data.gate) toast(`${data.charName} found ${data.fromName} → ${data.toName}`);
  }
});


// Class, statics and effect for a wormhole system (from bundled static data + SDE).
function whInfoHtml(i, compact = false) {
  if (!i) return '';
  const st = i.statics.length ? i.statics.map(x => html`<span class="badge accent" style="margin:0 6px 4px 0" title="${x.lifeHours ? x.lifeHours + 'h life' : ''}${x.totalMass ? ' · ' + fmtCompact(x.totalMass) + ' kg total' : ''}${x.jumpMass ? ' · ' + fmtCompact(x.jumpMass) + ' kg per jump' : ''}">${x.code} → ${x.leadsTo}</span>`)
    : html`<span class="dim">${i.staticsKnown ? 'None' : 'Not recorded'}</span>`;
  return html`<div class="kv" style="margin-top:${compact ? 6 : 12}px">
    <span class="k">Statics</span><span>${st}</span>
    <span class="k">Effect</span><span>${i.effect ? html`<b>${i.effect}</b>${compact ? '' : html` <span class="dim">${i.effectSummary}</span>`}` : html`<span class="dim">None</span>`}</span>
    ${i.shattered ? html`<span class="k">Shattered</span><span>Yes · no planets, no citadels</span>` : ''}
  </div>`;
}


// Export a map to a file or a text code, or import one from another EVE Toolkit.
function whShareModal(m) {
  const others = whState.maps;
  openModal('Share wormhole maps', html`
    <h3 class="mh" style="margin-top:0">Send this map</h3>
    <div class="muted" style="font-size:12.5px;margin-bottom:8px">Exports <b>${m ? m.name : 'this map'}</b> with its systems, connections, signatures, labels and notes. Pilot tracking isn't included.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-primary" id="whs-code" ${raw(m ? '' : 'disabled')}>Copy as text</button><button type="button" class="btn btn-ghost" id="whs-file" ${raw(m ? '' : 'disabled')}>Save to file…</button></div>
    <div class="dim" style="font-size:12px;margin:6px 0 16px">Text is easiest for Discord or EVE mail: paste the whole thing, starting with EVETK-WH1:. A file is better for big chains.</div>
    <h3 class="mh">Bring in a map</h3>
    <div class="muted" style="font-size:12.5px;margin-bottom:8px">Takes an EVE Toolkit map, a map exported from <b>Pathfinder</b>, <b>Wanderer</b> or <b>Nexum</b>, or a plain list of systems, one chain per line: <code>J123456 -> J234567 -> Jita</code>.</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px">
      <label class="check" style="margin:0"><input type="radio" name="whs-mode" value="new" checked> As a new map</label>
      <label class="check" style="margin:0"><input type="radio" name="whs-mode" value="merge" ${raw(m ? '' : 'disabled')}> Merge into <select id="whs-target" class="crumb-select" style="margin-left:6px">${others.map(x => html`<option value="${x.id}" ${raw(m && x.id === m.id ? 'selected' : '')}>${x.name}</option>`)}</select></label></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-primary" id="whs-paste">Paste from clipboard</button><button type="button" class="btn btn-ghost" id="whs-open">Open file…</button></div>
    <div class="dim" style="font-size:12px;margin-top:6px">Merging adds systems, connections and signatures you don't have yet, and takes newer connection details (mass, end of life). Your own labels and notes are kept.</div>
    <div id="whs-out" style="margin-top:12px"></div>`, {});
  { const c = document.querySelector('#modal .modal-foot [data-close]'); if (c) c.textContent = 'Close'; }
  const out = () => document.getElementById('whs-out');
  const ex = async target => {
    const r = await api.wh.exportMap(m.id, target);
    if (!r.ok) { out().innerHTML = String(errorView(r)); return; }
    if (r.data.canceled) return;
    out().innerHTML = String(html`<div class="notice">${r.data.copied ? `Copied ${r.data.systems} systems as text (${fmtNum(r.data.chars)} characters). Paste it wherever your corp shares things.` : `Saved ${r.data.systems} systems to ${r.data.file}.`}</div>`);
  };
  const im = async source => {
    const mode = document.querySelector('input[name="whs-mode"]:checked').value;
    const r = await api.wh.importMap(source, { mode, targetId: $('#whs-target') ? $('#whs-target').value : null });
    if (!r.ok) { out().innerHTML = String(errorView(r)); return; }
    if (r.data.canceled) return;
    const d = r.data;
    const i = whState.maps.findIndex(x => x.id === d.map.id); if (i === -1) whState.maps.push(d.map); else whState.maps[i] = d.map;
    whState.mapId = d.map.id; whState.sel = null;
    closeModal(); drawWh(); refreshActivity();
    toast((d.mode === 'merge' ? `Merged "${d.from.name}": ${d.added} new systems, ${d.addedConn} new connections, ${d.addedSigs} new signatures` : `Imported "${d.map.name}": ${d.systems} systems, ${d.connections} connections`)
      + (d.foreign ? ` from ${d.foreign}` : '') + (d.unknown && d.unknown.length ? `. Skipped unknown systems: ${d.unknown.slice(0, 5).join(', ')}` : ''));
  };
  $('#whs-code').onclick = () => ex('code');
  $('#whs-file').onclick = () => ex('file');
  $('#whs-paste').onclick = () => im('clipboard');
  $('#whs-open').onclick = () => im('file');
}


// ---------- Rolling planner ----------
const rollState = { ships: null, presets: null };
async function openRollModal(c) {
  if (!whTypesCache) { const r = await api.sde.wormholeTypes(); whTypesCache = r.ok ? r.data : []; }
  if (!rollState.presets) { const r = await api.wh.rollPresets(); rollState.presets = r.ok ? r.data : []; }
  if (!rollState.ships) { try { rollState.ships = JSON.parse(localStorage.getItem('whRollShips') || 'null'); } catch {} }
  if (!rollState.ships || !rollState.ships.length) rollState.ships = [{ ...rollState.presets[1], count: 1 }];
  const t = c && whTypesCache.find(x => x.code === String(c.type || '').toUpperCase());
  const kt = v => (v ? Math.round(v / 1e6) : '');
  openModal('Rolling planner', html`
    <div class="muted" style="font-size:12.5px;margin-bottom:10px">Plans round trips so the hole closes on a jump <b>back</b>, never with a ship on the far side. Wormhole mass varies by ±10%, so every jump out is checked against the lightest the hole could be.</div>
    <div class="grid grid-4">
      <div class="field"><label>Wormhole type</label><input type="text" id="rl-type" list="wh-type-list-r" value="${t ? t.code : (c && c.type) || ''}" placeholder="e.g. H296"></div>
      <div class="field"><label>Total mass (k t)</label><input type="number" id="rl-total" value="${t ? kt(t.totalMass) : ''}" placeholder="e.g. 3000"></div>
      <div class="field"><label>Max per jump (k t)</label><input type="number" id="rl-jump" value="${t ? kt(t.jumpMass) : ''}" placeholder="e.g. 1350"></div>
      <div class="field"><label>Mass through so far (k t)</label><input type="number" id="rl-thru" value="" placeholder="if you know it"></div></div>
    <div class="field"><label>How it looks now</label><div class="seg" id="rl-state">${Object.entries(MASS).map(([k, v]) => html`<button type="button" data-rlstate="${k}" class="${(c && c.mass || 'stable') === k ? 'active' : ''}">${v.label}</button>`)}</div></div>
    <h3 class="mh">Rolling ships</h3>
    <div id="rl-ships"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 12px"><select id="rl-preset" class="crumb-select">${rollState.presets.map((p, i) => html`<option value="${i}">${p.name}</option>`)}<option value="custom">Custom ship…</option></select><button type="button" class="btn btn-ghost" id="rl-add">+ Add ship</button></div>
    <div id="rl-out"></div>
    <datalist id="wh-type-list-r">${whTypesCache.filter(x => x.totalMass).map(x => html`<option value="${x.code}">${x.leadsTo}</option>`)}</datalist>`, { wide: true });
  { const cl = document.querySelector('#modal .modal-foot [data-close]'); if (cl) cl.textContent = 'Close'; }
  const drawShips = () => {
    $('#rl-ships').innerHTML = String(html`<table><thead><tr><th>Ship</th><th class="right">Cold (k t)</th><th class="right">Hot (k t)</th><th></th></tr></thead><tbody>${rollState.ships.map((s, i) => html`<tr>
      <td><input type="text" class="wh-mini" data-rls="${i}" data-k="name" value="${s.name}" style="width:100%"></td><td class="right"><input type="number" data-rls="${i}" data-k="cold" value="${kt(s.cold)}" class="wh-mini" style="width:90px"></td>
      <td class="right"><input type="number" data-rls="${i}" data-k="hot" value="${kt(s.hot)}" class="wh-mini" style="width:90px"></td><td><button type="button" class="btn btn-ghost" style="padding:1px 7px" data-rlsdel="${i}">✕</button></td></tr>`)}</tbody></table>`);
    document.querySelectorAll('[data-rls]').forEach(i => i.oninput = () => { const s = rollState.ships[i.dataset.rls]; s[i.dataset.k] = i.dataset.k === 'name' ? i.value : Number(i.value) * 1e6; run(); });
    document.querySelectorAll('[data-rlsdel]').forEach(b => b.onclick = () => { rollState.ships.splice(Number(b.dataset.rlsdel), 1); drawShips(); run(); });
  };
  const run = async () => {
    try { localStorage.setItem('whRollShips', JSON.stringify(rollState.ships)); } catch {}
    const st = document.querySelector('[data-rlstate].active');
    const total = Number($('#rl-total').value) * 1e6;
    if (!total) { $('#rl-out').innerHTML = String(html`<div class="dim">Pick a wormhole type or enter its total mass.</div>`); return; }
    const r = await api.wh.roll({ total, jumpMass: Number($('#rl-jump').value) * 1e6 || null, state: st ? st.dataset.rlstate : 'stable', through: Number($('#rl-thru').value) * 1e6 || 0, ships: rollState.ships });
    const out = $('#rl-out'); if (!out) return;
    if (!r.ok) { out.innerHTML = String(html`<div class="notice">${r.error}</div>`); return; }
    const p = r.data;
    out.innerHTML = String(html`<div class="kv" style="margin-bottom:8px"><span class="k">Mass left now</span><span>${fmtNum(p.range.lo / 1e6)}k – ${fmtNum(p.range.hi / 1e6)}k t</span>
      ${p.tooBig.length ? html`<span class="k">Too heavy to jump</span><span class="neg">${p.tooBig.join(', ')}</span>` : ''}</div>
      ${p.steps.length ? html`<table><thead><tr><th>#</th><th>Ship</th><th>Out</th><th>Back</th><th class="right">Through after</th><th></th></tr></thead><tbody>${p.steps.map(s => html`<tr>
        <td class="num">${s.n}</td><td>${s.ship}</td><td><span class="badge ${s.out === 'hot' ? 'gold' : ''}">${s.out}</span> <span class="dim">${fmtNum(s.outMass / 1e6)}k</span></td><td><span class="badge ${s.back === 'hot' ? 'gold' : ''}">${s.back}</span> <span class="dim">${fmtNum(s.backMass / 1e6)}k</span></td>
        <td class="right num">${fmtNum(s.after / 1e6)}k t</td><td style="font-size:12px">${s.willClose ? raw('<span class="pos">Closes</span>') : s.mayClose ? raw('<span class="gold">May close</span>') : s.check === 'destab' ? 'Should now look reduced' : s.check === 'crit' ? 'Should now look critical' : ''}</td></tr>`)}</tbody></table>` : ''}
      <div class="notice" style="margin-top:10px">${p.advice}</div>
      <div class="dim" style="font-size:11.5px;margin-top:6px">Hot means with the microwarpdrive running as you jump. After each step, look at the hole: if it shows reduced or critical earlier than expected, set that above and the plan updates.</div>`);
  };
  drawShips(); run();
  $('#rl-type').onchange = () => { const x = whTypesCache.find(w => w.code === $('#rl-type').value.trim().toUpperCase()); if (x) { $('#rl-total').value = kt(x.totalMass); $('#rl-jump').value = kt(x.jumpMass); } run(); };
  ['#rl-total', '#rl-jump', '#rl-thru'].forEach(id => $(id).oninput = run);
  document.querySelectorAll('[data-rlstate]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-rlstate]').forEach(x => x.classList.toggle('active', x === b)); run(); });
  $('#rl-add').onclick = () => { const v = $('#rl-preset').value; rollState.ships.push(v === 'custom' ? { name: 'My ship', cold: 0, hot: 0 } : { ...rollState.presets[Number(v)] }); drawShips(); run(); };
}
