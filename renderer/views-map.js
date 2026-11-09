'use strict';
/* Live region map: heat from CCP's hourly stats, intel pins, your pilots, jump bridges and wormholes. */

const mapState = { regionId: null, heat: 'ship', intelMins: 30, data: null, pilots: [], sel: null, view: null, timer: null, layout: null };
const HEAT = {
  ship: { label: 'Ship & pod kills (1h)', color: 'var(--red)', val: s => s.ship + s.pod },
  npc: { label: 'NPC kills (1h): ratting', color: 'var(--green)', val: s => s.npc },
  jumps: { label: 'Jumps (1h): traffic', color: 'var(--blue)', val: s => s.jumps },
  sov: { label: 'Sovereignty', color: null, val: () => 0 },
  none: { label: 'No heat', color: null, val: () => 0 }
};
const secCol = s => SEC_COLOR(s);
const hashHue = n => (Number(n) * 2654435761 % 360 + 360) % 360;

async function renderLiveMap(stillCurrent) {
  setContent(loadingView('Loading map…'));
  const [rg, loc] = await Promise.all([api.couriers.regions(), api.nav.pilotLocations()]);
  if (stillCurrent && !stillCurrent()) return;
  if (!rg.ok) return setContent(errorView(rg));
  mapState.pilots = loc.ok ? loc.data : [];
  if (!mapState.regionId) mapState.regionId = (mapState.pilots.find(p => p.regionId) || {}).regionId || 10000002;
  setContent(html`<div class="toolbar">
      <select id="mp-region" class="crumb-select">${rg.data.map(r => html`<option value="${r.id}" ${raw(r.id === mapState.regionId ? 'selected' : '')}>${r.name}</option>`)}</select>
      <select id="mp-heat" class="crumb-select">${Object.entries(HEAT).map(([k, h]) => html`<option value="${k}" ${raw(k === mapState.heat ? 'selected' : '')}>${h.label}</option>`)}</select>
      <select id="mp-intel" class="crumb-select">${[[0, 'No intel pins'], [15, 'Intel: last 15 min'], [30, 'Intel: last 30 min'], [60, 'Intel: last hour']].map(([v, l]) => html`<option value="${v}" ${raw(v === mapState.intelMins ? 'selected' : '')}>${l}</option>`)}</select>
      <button class="btn btn-ghost" id="mp-fit">Fit</button><button class="btn btn-ghost" id="mp-refresh">⟳ Update</button>
      <span class="dim" id="mp-upd" style="font-size:12px"></span></div>
    <div class="grid" style="grid-template-columns:1fr 290px;gap:14px;align-items:start">
      <div class="panel" style="padding:0;overflow:hidden"><div id="mp-box" class="wh-canvas-wrap" style="height:calc(100vh - 200px);cursor:grab"></div></div>
      <div><div class="panel" id="mp-side"></div><div class="panel" id="mp-legend"></div></div></div>`);
  $('#mp-region').onchange = e => { mapState.regionId = Number(e.target.value); mapState.sel = null; mapState.view = null; loadMap(); };
  $('#mp-heat').onchange = e => { mapState.heat = e.target.value; drawMap(); };
  $('#mp-intel').onchange = e => { mapState.intelMins = Number(e.target.value); drawMap(); };
  $('#mp-fit').onclick = () => { mapState.view = null; drawMap(); };
  $('#mp-refresh').onclick = () => loadMap(true);
  await loadMap();
  clearInterval(mapState.timer);
  mapState.timer = setInterval(() => { if (state.view === 'liveMap') loadMap(true); else clearInterval(mapState.timer); }, 5 * 60000);
}

async function loadMap(force) {
  const r = await api.map.region(mapState.regionId, { force: !!force });
  const box = $('#mp-box'); if (!box) return;
  if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
  mapState.data = r.data; mapState.layout = layoutMap(r.data);
  drawMap();
}

/** Project x/z to screen and push apart overlapping systems so labels stay readable. */
function layoutMap(d) {
  const all = [...d.systems.map(s => ({ ...s, ext: false })), ...d.external.map(s => ({ ...s, ext: true }))];
  const xs = all.map(s => s.x), zs = all.map(s => s.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const W = 1400, H = 950, pad = 60;
  const k = Math.min((W - 2 * pad) / ((maxX - minX) || 1), (H - 2 * pad) / ((maxZ - minZ) || 1));
  const pos = new Map(all.map(s => [s.id, { x: pad + (s.x - minX) * k, y: pad + (maxZ - s.z) * k, ext: s.ext }]));
  const nodes = [...pos.entries()];
  for (let it = 0; it < 80; it++) {
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i][1], b = nodes[j][1];
      const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 0.01, min = 46;
      if (dist < min) { const push = (min - dist) / 2, ux = dx / dist, uy = dy / dist; a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push; }
    }
  }
  const px = [...pos.values()];
  const bx = { minX: Math.min(...px.map(p => p.x)) - 40, minY: Math.min(...px.map(p => p.y)) - 40, maxX: Math.max(...px.map(p => p.x)) + 40, maxY: Math.max(...px.map(p => p.y)) + 40 };
  return { pos, all: new Map(all.map(s => [s.id, s])), box: bx };
}

function intelPins() {
  if (!mapState.intelMins) return new Map();
  const since = Date.now() - mapState.intelMins * 60000;
  const pins = new Map();
  for (const r of (intelState.reports || [])) {
    if (Date.parse(r.at) < since) continue;
    for (const s of r.systems || []) {
      if (!s.id) continue;
      const p = pins.get(s.id) || { count: 0, clear: false, last: r };
      p.count++; if (!pins.has(s.id)) { p.clear = !!r.clear; p.last = r; } pins.set(s.id, p);
    }
  }
  return pins;
}

function drawMap() {
  const d = mapState.data, L = mapState.layout, box = $('#mp-box');
  if (!d || !L || !box) return;
  const h = HEAT[mapState.heat];
  const max = Math.max(1, ...d.systems.map(h.val));
  const pins = intelPins();
  const pilotsAt = new Map();
  for (const p of mapState.pilots) if (p.systemId) (pilotsAt.get(p.systemId) || pilotsAt.set(p.systemId, []).get(p.systemId)).push(p.name);
  const P = id => L.pos.get(id);
  const vb = mapState.view || { x: L.box.minX, y: L.box.minY, w: L.box.maxX - L.box.minX, h: L.box.maxY - L.box.minY };
  mapState.view = vb;
  let svg = `<svg id="mp-svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" style="width:100%;height:100%;display:block;user-select:none">`;
  for (const [a, b, kind] of d.edges) { const p = P(a), q = P(b); if (p && q) svg += `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" style="stroke:var(--line-2)" stroke-width="${kind ? 1 : 1.6}" ${kind ? 'stroke-dasharray="4 4"' : ''}/>`; }
  for (const [a, b] of d.bridges) { const p = P(a), q = P(b); if (p && q) { const mx = (p.x + q.x) / 2 + (q.y - p.y) * 0.15, my = (p.y + q.y) / 2 - (q.x - p.x) * 0.15; svg += `<path d="M${p.x} ${p.y} Q${mx} ${my} ${q.x} ${q.y}" fill="none" style="stroke:var(--gold)" stroke-width="1.6" stroke-dasharray="6 4" opacity=".85"/>`; } }
  // heat
  if (h.color) for (const s of d.systems) { const v = h.val(s); if (!v) continue; const p = P(s.id); const r = 8 + 26 * Math.sqrt(v / max); svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}" style="fill:${h.color}" opacity="${0.18 + 0.4 * Math.sqrt(v / max)}"/>`; }
  // nodes
  for (const [id, s] of L.all) {
    const p = P(id); if (!p) continue;
    const sovFill = mapState.heat === 'sov' && s.sov ? `hsl(${hashHue(s.sov)},55%,45%)` : 'var(--node)';
    const sel = mapState.sel === id;
    const pin = pins.get(id);
    if (pin) svg += `<circle cx="${p.x}" cy="${p.y}" r="17" fill="none" style="stroke:${pin.clear ? 'var(--green)' : 'var(--red)'}" stroke-width="2.5"><animate attributeName="r" values="13;19;13" dur="1.6s" repeatCount="indefinite"/></circle>`;
    svg += `<g class="mp-node" data-sys="${id}" style="cursor:pointer" opacity="${s.ext ? 0.55 : 1}">
      <rect x="${p.x - 32}" y="${p.y - 10}" width="64" height="20" rx="5" style="fill:${sovFill};stroke:${sel ? 'var(--accent)' : secCol(s.security)}" stroke-width="${sel ? 2.4 : 1.3}"/>
      <text x="${p.x}" y="${p.y + 4}" text-anchor="middle" style="fill:var(--text);font-size:10.5px;font-weight:600">${esc(s.name.length > 10 ? s.name.slice(0, 9) + '…' : s.name)}</text>
      ${s.ext ? `<text x="${p.x}" y="${p.y + 21}" text-anchor="middle" style="fill:var(--dim);font-size:8.5px">${esc(s.region)}</text>` : ''}
      ${!s.ext && h.color && h.val(s) ? `<text x="${p.x + 30}" y="${p.y - 12}" text-anchor="end" style="fill:${h.color};font-size:9px;font-weight:700">${h.val(s)}</text>` : ''}</g>`;
    const here = pilotsAt.get(id);
    if (here) svg += `<g><rect x="${p.x - 34}" y="${p.y + 12}" width="68" height="13" rx="3" style="fill:var(--accent)"/><text x="${p.x}" y="${p.y + 21.5}" text-anchor="middle" style="fill:var(--on-accent);font-size:8.5px;font-weight:700">${esc(here.length > 1 ? here.length + ' pilots' : here[0].split(' ')[0])}</text></g>`;
  }
  for (const w of d.wormholes) { const p = P(w.inside); if (p) svg += `<g><circle cx="${p.x - 34}" cy="${p.y - 10}" r="7" style="fill:var(--purple)"/><text x="${p.x - 34}" y="${p.y - 7}" text-anchor="middle" style="fill:#fff;font-size:8px;font-weight:700">J</text></g>`; }
  svg += '</svg>';
  box.innerHTML = svg;
  $('#mp-upd').textContent = `CCP stats from ${new Date(d.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · updates every 5 min`;
  drawMapLegend(max, h, pins);
  drawMapSide();
  bindMapPanZoom();
}

function drawMapLegend(max, h, pins) {
  const d = mapState.data, box = $('#mp-legend'); if (!box) return;
  const sov = new Map();
  for (const s of d.systems) if (s.sov) sov.set(s.sov, (sov.get(s.sov) || 0) + 1);
  box.innerHTML = String(html`<h3>${d.region}</h3>
    <div class="muted" style="font-size:12px">${d.systems.length} systems · ${d.systems.reduce((n, s) => n + s.ship + s.pod, 0)} ships and pods killed in the last hour · ${d.systems.reduce((n, s) => n + s.npc, 0)} NPCs killed</div>
    <div style="margin-top:8px;font-size:12px" class="muted">${h.color ? html`Busiest: ${[...d.systems].sort((a, b) => h.val(b) - h.val(a)).filter(s => h.val(s)).slice(0, 5).map(s => html`<a href="#" data-mp-go="${s.id}">${s.name}</a> (${h.val(s)}) `)}` : ''}</div>
    ${pins.size ? html`<div style="margin-top:6px;font-size:12px"><span class="badge red">${pins.size} system${pins.size > 1 ? 's' : ''} in intel</span></div>` : ''}
    ${mapState.heat === 'sov' ? html`<div style="margin-top:8px">${[...sov.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => html`<div style="font-size:12px;display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:10px;height:10px;border-radius:2px;background:hsl(${raw(String(hashHue(id)))},55%,45%)"></span>${d.sovNames[id] || id} <span class="dim">${n}</span></div>`)}</div>` : ''}
    <div class="dim" style="font-size:11px;margin-top:8px">Border colour = security. Gold dashed = your jump bridges. J = wormhole from your maps. Pulsing ring = intel report (green = clear).</div>`);
  box.querySelectorAll('[data-mp-go]').forEach(a => a.onclick = e => { e.preventDefault(); mapState.sel = Number(a.dataset.mpGo); drawMap(); });
}

function drawMapSide() {
  const box = $('#mp-side'); if (!box) return;
  const d = mapState.data, L = mapState.layout;
  const s = mapState.sel && L.all.get(mapState.sel);
  if (!s) { box.innerHTML = String(html`<h3>System</h3><div class="muted">Click a system for details. Scroll to zoom, drag to pan.</div>`); return; }
  const reports = (intelState.reports || []).filter(r => (r.systems || []).some(x => x.id === s.id)).slice(0, 4);
  const here = mapState.pilots.filter(p => p.systemId === s.id);
  const wh = d.wormholes.filter(w => w.inside === s.id);
  box.innerHTML = String(html`<h3>${s.name} ${secBadge(s.security)}</h3>
    <div class="muted" style="font-size:12px">${s.ext ? s.region : (s.constellation || '')}${s.sov ? html` · ${d.sovNames[s.sov] || 'sov ' + s.sov}` : ''}</div>
    ${s.ext ? '' : html`<div class="grid grid-2" style="margin:10px 0;gap:8px">${stat('Ship kills', s.ship + s.pod, `${s.pod} pods`, s.ship + s.pod ? 'neg' : '')}${stat('NPC kills', s.npc)}${stat('Jumps', s.jumps)}${stat('Gates', s.gates, s.gates === 1 ? 'Dead end' : '')}</div>`}
    ${here.length ? html`<div style="margin-bottom:6px">${here.map(p => html`<span class="badge accent">${p.name}</span> `)}</div>` : ''}
    ${wh.map(w => html`<div style="font-size:12px"><span class="badge" style="color:var(--purple);border-color:var(--purple)">${w.type}</span> to ${w.otherName}</div>`)}
    ${reports.length ? html`<h3 class="mh" style="margin-top:8px">Intel</h3>${reports.map(r => html`<div style="font-size:12px;margin-bottom:4px"><span class="dim">${Math.round((Date.now() - Date.parse(r.at)) / 60000)}m</span> ${r.text}</div>`)}` : ''}
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">
      <button class="btn btn-ghost" style="padding:3px 9px;font-size:12px" data-mp-act="from">Route from</button><button class="btn btn-ghost" style="padding:3px 9px;font-size:12px" data-mp-act="to">Route to</button>
      <button class="btn btn-ghost" style="padding:3px 9px;font-size:12px" data-mp-act="hunt">Hunting / ratting near</button><button class="btn btn-ghost" style="padding:3px 9px;font-size:12px" data-mp-act="dest">Set destination</button>
      ${s.ext ? html`<button class="btn btn-ghost" style="padding:3px 9px;font-size:12px" data-mp-act="region">Open ${s.region}</button>` : ''}</div>`);
  box.querySelectorAll('[data-mp-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.mpAct;
    if (a === 'from') openRouteCard(s.name, navState.to);
    else if (a === 'to') openRouteCard(navState.from, s.name);
    else if (a === 'hunt') { huntState.from = s.name; state.toolsTab = 't-hunt'; go('tools'); }
    else if (a === 'dest') setDestination(s.id);
    else if (a === 'region') { mapState.regionId = s.regionId; mapState.sel = s.id; mapState.view = null; loadMap(); }
  });
}

function bindMapPanZoom() {
  const svgEl = $('#mp-svg'), box = $('#mp-box'); if (!svgEl) return;
  const apply = () => svgEl.setAttribute('viewBox', `${mapState.view.x} ${mapState.view.y} ${mapState.view.w} ${mapState.view.h}`);
  box.onwheel = e => {
    e.preventDefault();
    const r = svgEl.getBoundingClientRect(), v = mapState.view;
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const z = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const nw = Math.max(200, Math.min(4000, v.w * z)), nh = nw * v.h / v.w;
    mapState.view = { x: v.x + (v.w - nw) * fx, y: v.y + (v.h - nh) * fy, w: nw, h: nh };
    apply();
  };
  let drag = null, moved = false;
  box.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, v: { ...mapState.view } }; moved = false; box.style.cursor = 'grabbing'; };
  window.onpointermove = e => {
    if (!drag) return;
    const r = svgEl.getBoundingClientRect(), dx = (e.clientX - drag.x) * drag.v.w / r.width, dy = (e.clientY - drag.y) * drag.v.h / r.height;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) moved = true;
    mapState.view = { ...drag.v, x: drag.v.x - dx, y: drag.v.y - dy }; apply();
  };
  window.onpointerup = e => {
    if (!drag) return; drag = null; box.style.cursor = 'grab';
    if (!moved) { const g = e.target.closest && e.target.closest('[data-sys]'); if (g) { mapState.sel = Number(g.dataset.sys); drawMap(); } }
  };
}
