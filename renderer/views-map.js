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
  mapState.data = r.data; mapState.layout = layoutMap(r.data, box.clientWidth && box.clientHeight ? box.clientWidth / box.clientHeight : 1.4);
  drawMap();
}

/** Project x/z to screen, scale so neighbours sit a box-width apart, then push overlapping
    boxes apart while keeping each system close to where it really is and near its gate neighbours. */
const MP_W = 76, MP_H = 24, MP_GAP_X = 14, MP_GAP_Y = 16;
function layoutMap(d, aspect = 1.4) {
  const all = [...d.systems.map(s => ({ ...s, ext: false })), ...d.external.map(s => ({ ...s, ext: true }))];
  const n = all.length;
  if (!n) return { pos: new Map(), all: new Map(), box: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, cons: [] };
  const raw = all.map(s => ({ x: s.x, y: -s.z }));
  // Scale so the region covers about 4 box-cells per system: dense enough to read at Fit,
  // with room for the overlap pass to spread out tight clusters.
  const rx = Math.max(...raw.map(p => p.x)) - Math.min(...raw.map(p => p.x)) || 1, ry = Math.max(...raw.map(p => p.y)) - Math.min(...raw.map(p => p.y)) || 1;
  const k = Math.sqrt((n * (MP_W + MP_GAP_X) * (MP_H + MP_GAP_Y) * 4) / (rx * ry));
  const minX = Math.min(...raw.map(p => p.x)), minY = Math.min(...raw.map(p => p.y));
  // Stretch towards the shape of the map panel (up to 1.8×) so a tall region uses the width too
  const ar = (rx / ry), sx = ar < aspect ? Math.min(1.8, Math.sqrt(aspect / ar)) : 1, sy = ar > aspect ? Math.min(1.8, Math.sqrt(ar / aspect)) : 1;
  const P = raw.map(p => ({ x: (p.x - minX) * k * sx, y: (p.y - minY) * k * sy }));
  const home = P.map(p => ({ ...p }));
  const idx = new Map(all.map((s, i) => [s.id, i]));
  const links = (d.edges || []).map(([a, b]) => [idx.get(a), idx.get(b)]).filter(([a, b]) => a !== undefined && b !== undefined);
  const SX = MP_W + MP_GAP_X, SY = MP_H + MP_GAP_Y;
  for (let it = 0; it < 260; it++) {
    const cool = 1 - it / 300;
    // keep geography: a gentle pull back towards the real position
    for (let i = 0; i < n; i++) { P[i].x += (home[i].x - P[i].x) * 0.015 * cool; P[i].y += (home[i].y - P[i].y) * 0.015 * cool; }
    // keep gate neighbours from drifting far apart
    for (const [a, b] of links) {
      const dx = P[b].x - P[a].x, dy = P[b].y - P[a].y, dist = Math.hypot(dx, dy) || 1, want = SX * 1.6;
      if (dist > want) { const f = (dist - want) * 0.02 * cool / dist; P[a].x += dx * f; P[a].y += dy * f; P[b].x -= dx * f; P[b].y -= dy * f; }
    }
    // no overlapping boxes (with a gap), pushed apart along the shorter overlap
    let moved = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = P[j].x - P[i].x, dy = P[j].y - P[i].y;
      const ox = SX - Math.abs(dx), oy = SY - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      moved++;
      if (ox / SX < oy / SY) { const p = ox / 2 * (dx < 0 ? -1 : 1) || ox / 2; P[i].x -= p; P[j].x += p; }
      else { const p = oy / 2 * (dy < 0 ? -1 : 1) || oy / 2; P[i].y -= p; P[j].y += p; }
    }
    if (!moved && it > 60) break;
  }
  const pos = new Map(all.map((s, i) => [s.id, { x: P[i].x, y: P[i].y, ext: s.ext }]));
  const px = [...pos.values()];
  const bx = { minX: Math.min(...px.map(p => p.x)) - MP_W, minY: Math.min(...px.map(p => p.y)) - 50, maxX: Math.max(...px.map(p => p.x)) + MP_W, maxY: Math.max(...px.map(p => p.y)) + 50 };
  // constellation names, placed above each group
  const groups = new Map();
  for (const s of d.systems) { if (!s.constellation) continue; const p = pos.get(s.id); const g = groups.get(s.constellation) || { name: s.constellation, xs: [], ys: [] }; g.xs.push(p.x); g.ys.push(p.y); groups.set(s.constellation, g); }
  const cons = [...groups.values()].map(g => ({ name: g.name, x: g.xs.reduce((a, b) => a + b, 0) / g.xs.length, y: Math.min(...g.ys) - MP_H, minX: Math.min(...g.xs) - MP_W / 2 - 8, maxX: Math.max(...g.xs) + MP_W / 2 + 8, minY: Math.min(...g.ys) - MP_H / 2 - 8, maxY: Math.max(...g.ys) + MP_H / 2 + 8 }));
  return { pos, all: new Map(all.map(s => [s.id, s])), box: bx, cons };
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
  const zoomed = vb.w < (L.box.maxX - L.box.minX) * 0.55;
  const HW = MP_W / 2, HH = MP_H / 2;
  let svg = `<svg id="mp-svg" class="${zoomed ? 'mp-zoomed' : ''}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" style="width:100%;height:100%;display:block;user-select:none">`;
  // constellation names above each group
  for (const c of L.cons || []) svg += `<text class="mp-cons" x="${c.x}" y="${c.y - 4}" text-anchor="middle" style="fill:var(--dim);font-size:9.5px;letter-spacing:.08em" opacity=".75">${esc(c.name.toUpperCase())}</text>`;
  const consOf = id => (L.all.get(id) || {}).constellation;
  for (const [a, b, kind] of d.edges) { const p = P(a), q = P(b); if (p && q) { const inner = !kind && consOf(a) && consOf(a) === consOf(b); svg += `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" style="stroke:var(--line-2)" stroke-width="${kind ? 1 : inner ? 1.2 : 2}" opacity="${inner ? 0.7 : 1}" ${kind ? 'stroke-dasharray="4 4"' : ''}/>`; } }
  for (const [a, b] of d.bridges) { const p = P(a), q = P(b); if (p && q) { const mx = (p.x + q.x) / 2 + (q.y - p.y) * 0.15, my = (p.y + q.y) / 2 - (q.x - p.x) * 0.15; svg += `<path d="M${p.x} ${p.y} Q${mx} ${my} ${q.x} ${q.y}" fill="none" style="stroke:var(--gold)" stroke-width="1.6" stroke-dasharray="6 4" opacity=".85"/>`; } }
  // heat
  if (h.color) for (const s of d.systems) { const v = h.val(s); if (!v) continue; const p = P(s.id); const r = 14 + 26 * Math.sqrt(v / max); svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}" style="fill:${h.color}" opacity="${0.16 + 0.34 * Math.sqrt(v / max)}"/>`; }
  // nodes
  for (const [id, s] of L.all) {
    const p = P(id); if (!p) continue;
    const sovFill = mapState.heat === 'sov' && s.sov ? `hsl(${hashHue(s.sov)},55%,45%)` : 'var(--node)';
    const sel = mapState.sel === id;
    const pin = pins.get(id);
    if (pin) svg += `<rect x="${p.x - HW - 5}" y="${p.y - HH - 5}" width="${MP_W + 10}" height="${MP_H + 10}" rx="9" fill="none" style="stroke:${pin.clear ? 'var(--green)' : 'var(--red)'}" stroke-width="2.5"><animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></rect>`;
    const v = !s.ext && h.color ? h.val(s) : 0;
    const name = s.name.length > 11 ? s.name.slice(0, 10) + '…' : s.name;
    svg += `<g class="mp-node" data-sys="${id}" style="cursor:pointer" opacity="${s.ext ? 0.55 : 1}"><title>${esc(s.name)}${s.ext ? ' · ' + esc(s.region) : ''} (${Number(s.security).toFixed(1)})</title>
      <rect x="${p.x - HW}" y="${p.y - HH}" width="${MP_W}" height="${MP_H}" rx="5" style="fill:${sovFill};stroke:${sel ? 'var(--accent)' : secCol(s.security)}" stroke-width="${sel ? 2.4 : 1.4}"/>
      <rect x="${p.x - HW}" y="${p.y - HH}" width="4" height="${MP_H}" rx="2" style="fill:${secCol(s.security)}"/>
      <text x="${p.x + 2}" y="${p.y + 4}" text-anchor="middle" style="fill:var(--text);font-size:11px;font-weight:600">${esc(name)}</text>
      ${s.ext ? `<text x="${p.x}" y="${p.y + HH + 10}" text-anchor="middle" style="fill:var(--dim);font-size:8.5px">${esc(s.region)}</text>` : ''}
      ${v ? `<g><rect x="${p.x + HW - 12}" y="${p.y - HH - 9}" width="${String(v).length * 6 + 8}" height="13" rx="6.5" style="fill:${h.color}"/><text x="${p.x + HW - 8}" y="${p.y - HH + 1}" style="fill:#fff;font-size:9px;font-weight:700">${v}</text></g>` : ''}
      ${!s.ext ? `<text class="mp-detail" x="${p.x}" y="${p.y + HH + 9}" text-anchor="middle" style="fill:var(--dim);font-size:7.5px">${Number(s.security).toFixed(1)} · ${s.jumps || 0} jumps · ${s.npc || 0} NPC</text>` : ''}</g>`;
    const here = pilotsAt.get(id);
    if (here) svg = svg.replace(/<text class="mp-detail"[^>]*>[^<]*<\/text><\/g>$/, "</g>");
    if (here) svg += `<g><rect x="${p.x - HW}" y="${p.y + HH + 2}" width="${MP_W}" height="13" rx="3" style="fill:var(--accent)"/><text x="${p.x}" y="${p.y + HH + 11.5}" text-anchor="middle" style="fill:var(--on-accent);font-size:8.5px;font-weight:700">${esc(here.length > 1 ? here.length + ' pilots' : here[0].split(' ')[0])}</text></g>`;
  }
  for (const w of d.wormholes) { const p = P(w.inside); if (p) svg += `<g><circle cx="${p.x - HW}" cy="${p.y - HH}" r="7" style="fill:var(--purple)"/><text x="${p.x - HW}" y="${p.y - HH + 3}" text-anchor="middle" style="fill:#fff;font-size:8px;font-weight:700">J</text></g>`; }
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
    const fitW = mapState.layout.box.maxX - mapState.layout.box.minX;
    const nw = Math.max(fitW * 0.18, Math.min(fitW * 2.5, v.w * z)), nh = nw * v.h / v.w;
    mapState.view = { x: v.x + (v.w - nw) * fx, y: v.y + (v.h - nh) * fy, w: nw, h: nh };
    apply();
    svgEl.classList.toggle('mp-zoomed', nw < fitW * 0.55);
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
