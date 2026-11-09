'use strict';
/* Planetary Interaction planner. Uses PI (pi-data.js) and helpers from app.js. */

const piState = {
  types: null,           // name -> { id, price }
  capacity: null,        // [{ name, maxPlanets }]
  current: null,         // { extracting, producing }
  plans: [],
  overlay: false,
  compact: false,
  hover: null,
  plan: null
};

const PI_DEFAULT_PLAN = () => ({
  id: null, name: 'New plan',
  targets: [{ name: 'Nano-Factory', perDay: 6 }],
  buy: [],
  planetTypes: Object.keys(PI.PLANETS),
  p0PerPlanet: 12000,        // raw units per hour one extraction planet produces (2 ECUs)
  advPerPlanet: 12,          // advanced factories per factory planet
  htPerPlanet: 3,            // high-tech plants per factory planet (Barren/Temperate only)
  tax: 10                    // customs office tax %
});

// ================= Calculations =================

function piCompute(plan) {
  const rates = {}, factories = {}, bought = {}, consumers = {};
  const edges = new Map(); // "from>to" -> rate
  const buy = new Set(plan.buy);
  const targets = new Set(plan.targets.map(t => t.name));
  function demand(name, rate, parent) {
    const it = PI.items[name];
    if (!it) return;
    rates[name] = (rates[name] || 0) + rate;
    if (parent) { const k = name + '>' + parent; edges.set(k, (edges.get(k) || 0) + rate); (consumers[name] = consumers[name] || new Set()).add(parent); }
    if (buy.has(name) && !targets.has(name)) { bought[name] = (bought[name] || 0) + rate; return; }
    if (it.tier === 0) return;
    factories[name] = (factories[name] || 0) + rate / it.perFactoryHour;
    for (const inp of it.inputs) demand(inp.name, rate * inp.qty / it.out, name);
  }
  for (const t of plan.targets) if (t.perDay > 0) demand(t.name, t.perDay / 24, null);

  // Raw extraction & planet assignment
  const p0Needed = Object.keys(rates).filter(n => PI.items[n].tier === 0 && !bought[n]);
  const avail = new Set(plan.planetTypes);
  const coverage = {};
  for (const [pt, v] of Object.entries(PI.PLANETS)) if (avail.has(pt)) coverage[pt] = v.p0.filter(p => p0Needed.includes(p)).length;
  const assign = {}, unobtainable = [];
  const order = [...p0Needed].sort((a, b) => PI.planetsWith(a).filter(t => avail.has(t)).length - PI.planetsWith(b).filter(t => avail.has(t)).length);
  const typeLoad = {};
  for (const p0 of order) {
    const cands = PI.planetsWith(p0).filter(t => avail.has(t));
    if (!cands.length) { unobtainable.push(p0); continue; }
    cands.sort((a, b) => (coverage[b] - coverage[a]) || ((typeLoad[b] || 0) - (typeLoad[a] || 0)));
    assign[p0] = cands[0];
    typeLoad[cands[0]] = (typeLoad[cands[0]] || 0) + rates[p0];
  }
  const planets = {};
  for (const [pt, load] of Object.entries(typeLoad)) planets[pt] = Math.max(1, Math.ceil(load / plan.p0PerPlanet));
  const extractionPlanets = Object.values(planets).reduce((n, x) => n + x, 0);

  // Factory counts
  const fac = { basic: 0, advanced: 0, hightech: 0 };
  for (const [n, f] of Object.entries(factories)) {
    const t = PI.items[n].tier;
    if (t === 1) fac.basic += f; else if (t === 4) fac.hightech += f; else fac.advanced += f;
  }
  const factoryPlanets = Math.ceil(Math.ceil(fac.advanced) / plan.advPerPlanet) + Math.ceil(Math.ceil(fac.hightech) / plan.htPerPlanet);

  // Economics (per day)
  const price = n => (piState.types && piState.types[n] ? piState.types[n].price : 0);
  const tax = plan.tax / 100;
  let output = 0, exportTax = 0;
  for (const t of plan.targets) { output += t.perDay * price(t.name); exportTax += t.perDay * PI.BASE_CUSTOMS[PI.items[t.name].tier] * tax; }
  let boughtCost = 0, importTax = 0;
  for (const [n, r] of Object.entries(bought)) { boughtCost += r * 24 * price(n); importTax += r * 24 * PI.BASE_CUSTOMS[PI.items[n].tier] * tax * 0.5; }
  let internalTax = 0;
  for (const [n, r] of Object.entries(rates)) {
    const it = PI.items[n];
    if (it.tier >= 1 && it.tier <= 3 && !targets.has(n) && !bought[n]) internalTax += r * 24 * PI.BASE_CUSTOMS[it.tier] * tax * 1.5;
  }
  const valueByTier = [0, 0, 0, 0, 0];
  for (const [n, r] of Object.entries(rates)) valueByTier[PI.items[n].tier] += r * 24 * price(n);

  return {
    rates, factories, bought, edges, consumers, assign, unobtainable, planets, extractionPlanets, factoryPlanets,
    totalPlanets: extractionPlanets + factoryPlanets, fac,
    econ: { output, boughtCost, exportTax, importTax, internalTax, net: output - boughtCost - exportTax - importTax - internalTax, valueByTier },
    active: new Set(Object.keys(rates))
  };
}

// ================= Rendering =================

const fmtRate = r => r >= 100 ? fmtNum(r) : r >= 10 ? r.toFixed(1) : r >= 1 ? r.toFixed(2) : r.toFixed(3);

function planetSvg(type, r) {
  const v = PI.PLANETS[type];
  const id = 'pg-' + type;
  return `<defs><radialGradient id="${id}" cx="35%" cy="32%" r="75%"><stop offset="0" stop-color="${v.colors[2]}"/><stop offset=".45" stop-color="${v.colors[0]}"/><stop offset="1" stop-color="${v.colors[1]}"/></radialGradient></defs>
    ${v.ring ? `<ellipse rx="${r * 1.75}" ry="${r * 0.42}" fill="none" stroke="${v.colors[0]}" stroke-opacity=".45" stroke-width="3"/>` : ''}
    <circle r="${r}" fill="url(#${id})"/>
    ${type === 'Gas' || type === 'Storm' ? `<path d="M${-r} ${-r * .25} Q0 ${-r * .45} ${r} ${-r * .25} M${-r} ${r * .2} Q0 0 ${r} ${r * .2}" stroke="${v.colors[1]}" stroke-opacity=".35" stroke-width="${r * .12}" fill="none"/>` : ''}
    ${v.ring ? `<path d="M${-r * 1.75} 0 A${r * 1.75} ${r * .42} 0 0 0 ${r * 1.75} 0" fill="none" stroke="${v.colors[2]}" stroke-opacity=".55" stroke-width="3"/>` : ''}`;
}

function layout(res) {
  const W = 1180, top = 46;
  const cols = [
    { key: 'planet', x: 70, list: Object.keys(PI.PLANETS) },
    { key: 0, x: 270, list: PI.P0 },
    { key: 1, x: 470, list: [] }, { key: 2, x: 690, list: [] }, { key: 3, x: 910, list: [] }, { key: 4, x: 1110, list: [] }
  ];
  // Order each tier by the average position of its inputs to reduce crossings.
  const pos = {};
  cols[1].list.forEach((n, i) => { pos[n] = i; });
  for (let t = 1; t <= 4; t++) {
    const names = Object.values(PI.items).filter(i => i.tier === t).map(i => i.name);
    names.sort((a, b) => avg(a) - avg(b));
    cols[t + 1].list = names;
    names.forEach((n, i) => { pos[n] = i * (cols[1].list.length / names.length); });
  }
  function avg(n) { const ins = PI.items[n].inputs; return ins.reduce((s, i) => s + (pos[i.name] ?? 0), 0) / ins.length; }
  // Planet order by the P0s they offer
  cols[0].list.sort((a, b) => PI.PLANETS[a].p0.reduce((s, p) => s + pos[p], 0) - PI.PLANETS[b].p0.reduce((s, p) => s + pos[p], 0));

  const show = n => !piState.compact || res.active.has(n) || (n in PI.PLANETS && Object.values(res.assign).includes(n));
  let maxRows = 0;
  for (const c of cols) { c.visible = c.list.filter(show); maxRows = Math.max(maxRows, c.visible.length); }
  const rowH = piState.compact ? 74 : 34;
  const H = Math.max(piState.compact ? 380 : 560, top + maxRows * rowH + 40);
  const nodes = {};
  for (const c of cols) {
    const n = c.visible.length;
    const span = H - top - 40;
    c.visible.forEach((name, i) => {
      const y = top + (n === 1 ? span / 2 : (i + 0.5) * (span / n));
      nodes[(c.key === 'planet' ? 'planet:' : '') + name] = { x: c.x, y, name, col: c.key };
    });
  }
  return { W, H, cols, nodes };
}

function graphSvg(res) {
  const L = layout(res);
  const { nodes } = L;
  const curve = (a, b) => { const mx = (a.x + b.x) / 2; return `M${a.x + 22},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x - 22},${b.y}`; };
  const maxRate = Math.max(1, ...[...res.edges.values()]);
  let edges = '';
  // planet -> P0 edges for assigned planet types
  for (const [p0, pt] of Object.entries(res.assign)) {
    const a = nodes['planet:' + pt], b = nodes[p0];
    if (a && b) edges += `<path class="pe on" data-a="planet:${esc(pt)}" data-b="${esc(p0)}" d="${curve(a, b)}" stroke-width="${(1.2 + 3 * Math.sqrt(res.rates[p0] / maxRate)).toFixed(2)}"/>`;
  }
  for (const [k, r] of res.edges) {
    const [from, to] = k.split('>');
    const a = nodes[from], b = nodes[to];
    if (!a || !b) continue;
    const bought = !!res.bought[from];
    edges += `<path class="pe on ${bought ? 'buy' : ''}" data-a="${esc(from)}" data-b="${esc(to)}" d="${curve(a, b)}" stroke-width="${(1.2 + 3.5 * Math.sqrt(r / maxRate)).toFixed(2)}"/>`;
  }
  // faint potential edges (shown on hover only)
  let ghost = '';
  for (const it of Object.values(PI.items)) for (const inp of it.inputs) {
    const a = nodes[inp.name], b = nodes[it.name];
    if (a && b && !res.edges.has(inp.name + '>' + it.name)) ghost += `<path class="pe ghost" data-a="${esc(inp.name)}" data-b="${esc(it.name)}" d="${curve(a, b)}"/>`;
  }
  for (const [pt, v] of Object.entries(PI.PLANETS)) for (const p0 of v.p0) {
    const a = nodes['planet:' + pt], b = nodes[p0];
    if (a && b && res.assign[p0] !== pt) ghost += `<path class="pe ghost" data-a="planet:${esc(pt)}" data-b="${esc(p0)}" d="${curve(a, b)}"/>`;
  }

  const targets = new Set(piState.plan.targets.map(t => t.name));
  const cur = piState.overlay && piState.current ? piState.current : null;
  let nodeSvg = '';
  for (const [key, n] of Object.entries(nodes)) {
    if (n.col === 'planet') {
      const count = res.planets[n.name] || 0;
      const allowed = piState.plan.planetTypes.includes(n.name);
      nodeSvg += `<g class="pn planet ${count ? 'on' : ''} ${allowed ? '' : 'off'}" data-n="${esc(key)}" transform="translate(${n.x},${n.y})">
        ${planetSvg(n.name, piState.compact ? 26 : 15)}
        <text y="${piState.compact ? 42 : 27}" class="lbl">${esc(n.name.toUpperCase())}</text>
        ${count ? `<text y="${piState.compact ? 56 : 39}" class="sub">×${count}</text>` : ''}
        ${allowed ? '' : `<text y="4" class="sub x">not available</text>`}</g>`;
      continue;
    }
    const it = PI.items[n.name];
    const on = res.active.has(n.name);
    const t = piState.types && piState.types[n.name];
    const isBuy = !!res.bought[n.name];
    const isTarget = targets.has(n.name);
    const mine = cur && (it.tier === 0 ? cur.extracting[n.name] : cur.producing[n.name]);
    const r = piState.compact ? 17 : 13;
    nodeSvg += `<g class="pn ${on ? 'on' : ''} ${isBuy ? 'buy' : ''} ${isTarget ? 'target' : ''}" data-n="${esc(n.name)}" transform="translate(${n.x},${n.y})">
      <circle r="${r + 3}" class="halo"/>
      <circle r="${r}" class="disc"/>
      ${t && t.id ? `<image href="${IMG}/types/${t.id}/icon?size=32" x="${-r + 2}" y="${-r + 2}" width="${2 * r - 4}" height="${2 * r - 4}" clip-path="circle(${r - 2}px)"/>` : `<text y="4" class="tier">P${it.tier}</text>`}
      ${mine ? `<circle cx="${r - 2}" cy="${-r + 2}" r="4.5" class="mine"/>` : ''}
      <text x="${r + 6}" y="-1" class="lbl l">${esc(n.name)}</text>
      <text x="${r + 6}" y="11" class="sub l">${on ? (isBuy ? 'buy ' : '') + fmtRate(res.rates[n.name]) + '/h' : (t && t.price ? fmtCompact(t.price) + ' ISK' : '')}${on && res.factories[n.name] ? ' · ' + Math.ceil(res.factories[n.name]) + '×' : ''}</text></g>`;
  }
  const heads = L.cols.map((c, i) => `<text x="${c.x - 20}" y="18" class="colh">${['Planet types', 'Raw (P0)', 'P1 commodities', 'P2 commodities', 'P3 commodities', 'P4 commodities'][i]} · ${c.visible.length}</text><line x1="${c.x - 20}" x2="${c.x + 160}" y1="26" y2="26" class="colline"/>`).join('');
  return `<svg id="pi-svg" viewBox="0 0 ${L.W + 140} ${L.H}" preserveAspectRatio="xMinYMin meet" class="${piState.compact ? 'compact' : ''}">
    ${heads}<g class="ghosts">${ghost}</g><g class="edges">${edges}</g><g class="nodes">${nodeSvg}</g></svg>`;
}

function chainOf(name) {
  // upstream + downstream names (including planets) for hover highlighting
  const set = new Set([name]);
  const up = n => {
    if (n.startsWith('planet:')) return;
    const it = PI.items[n]; if (!it) return;
    if (it.tier === 0) {
      const a = piState.lastRes && piState.lastRes.assign[n];
      if (a) set.add('planet:' + a); else PI.planetsWith(n).forEach(p => set.add('planet:' + p));
    }
    for (const i of it.inputs) { set.add(i.name); up(i.name); }
  };
  const down = n => { for (const u of PI.usedBy(n)) { set.add(u); down(u); } };
  if (name.startsWith('planet:')) { const pt = name.slice(7); for (const p0 of PI.PLANETS[pt].p0) { set.add(p0); down(p0); } }
  else { up(name); down(name); }
  return set;
}

function bindGraph() {
  const svg = document.getElementById('pi-svg');
  if (!svg) return;
  svg.querySelectorAll('.pn').forEach(g => {
    g.addEventListener('mouseenter', () => {
      const set = chainOf(g.dataset.n);
      svg.classList.add('hovering');
      svg.querySelectorAll('.pn').forEach(x => x.classList.toggle('hl', set.has(x.dataset.n)));
      svg.querySelectorAll('.pe').forEach(x => x.classList.toggle('hl', set.has(x.dataset.a) && set.has(x.dataset.b)));
    });
    g.addEventListener('mouseleave', () => { svg.classList.remove('hovering'); svg.querySelectorAll('.hl').forEach(x => x.classList.remove('hl')); });
    g.addEventListener('click', () => piNodeInfo(g.dataset.n));
  });
}

// ================= Side panel =================

function piSidePanel(res) {
  const p = piState.plan;
  const cap = piState.capacity ? piState.capacity.reduce((n, c) => n + (c.maxPlanets || 0), 0) : null;
  const price = n => (piState.types && piState.types[n] ? piState.types[n].price : 0);
  const products = [2, 3, 4, 1].map(t => [t, Object.values(PI.items).filter(i => i.tier === t).map(i => i.name).sort()]);
  const e = res.econ;
  const over = cap !== null && res.totalPlanets > cap;
  return html`
    <div class="panel"><h3>Targets</h3>
      ${p.targets.map((t, i) => html`<div class="pi-target">
        <select data-pt-name="${i}">${products.map(([tier, names]) => html`<optgroup label="P${tier}">${names.map(n => html`<option ${raw(n === t.name ? 'selected' : '')}>${n}</option>`)}</optgroup>`)}</select>
        <input type="number" min="0" step="any" value="${t.perDay}" data-pt-rate="${i}" title="Units per day">
        <span class="dim">/day</span>
        <button class="btn btn-ghost" data-pt-del="${i}" title="Remove" style="padding:4px 8px">✕</button></div>`)}
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-ghost" data-pt-add>+ Add target</button>
        <button class="btn btn-ghost" data-pt-max title="Set the rate so the plan fits your colony slots">Fit to my planets</button></div>
      <div class="dim" style="margin-top:8px;font-size:12px">Click any item in the chart to make it a target or buy it instead of producing it.</div>
    </div>

    <div class="panel"><h3>Planets</h3>
      <div class="kv" style="margin-bottom:10px">
        <span class="k">Extraction</span><span><b>${res.extractionPlanets}</b> planets</span>
        <span class="k">Factory</span><span><b>${res.factoryPlanets}</b> planets <span class="dim">(${Math.ceil(res.fac.advanced)} advanced, ${Math.ceil(res.fac.hightech)} high-tech)</span></span>
        <span class="k">Total</span><span class="${over ? 'neg' : 'pos'}"><b>${res.totalPlanets}</b>${cap !== null ? ` of ${cap} colony slots` : ''}</span>
      </div>
      ${Object.entries(res.planets).sort((a, b) => b[1] - a[1]).map(([pt, n]) => html`<div class="pi-planet-row">
        <svg viewBox="-30 -18 60 36" width="34" height="22">${raw(planetSvg(pt, 13))}</svg><span><b>${pt}</b> ×${n}</span>
        <span class="dim">${Object.entries(res.assign).filter(([, t]) => t === pt).map(([p0]) => p0).join(', ')}</span></div>`)}
      ${res.unobtainable.length ? html`<div class="notice" style="margin-top:10px">No allowed planet type provides ${res.unobtainable.join(', ')}. Allow another planet type, or buy the matching P1.</div>` : ''}
      ${res.fac.hightech > 0 ? html`<div class="dim" style="margin-top:8px;font-size:12px">High-Tech Production Plants (P4) can only be built on Barren or Temperate planets.</div>` : ''}
      ${piState.capacity ? html`<div class="dim" style="margin-top:8px;font-size:12px">${piState.capacity.map(c => `${c.name}: ${c.maxPlanets ?? '?'}`).join(' · ')}</div>` : ''}
    </div>

    <div class="panel"><h3>Economics per day</h3>
      <div class="kv">
        <span class="k">Output value</span><span class="num pos">${fmtCompact(e.output)} ISK</span>
        <span class="k">Bought inputs</span><span class="num ${e.boughtCost ? 'neg' : ''}">${e.boughtCost ? '−' + fmtCompact(e.boughtCost) : '0'} ISK</span>
        <span class="k">Export tax (final)</span><span class="num neg">−${fmtCompact(e.exportTax)} ISK</span>
        <span class="k">Transfer tax (est.)</span><span class="num neg">−${fmtCompact(e.internalTax + e.importTax)} ISK</span>
        <span class="k"><b>Net</b></span><span class="num ${e.net >= 0 ? 'pos' : 'neg'}"><b>${fmtCompact(e.net)} ISK</b></span>
        <span class="k">Per planet</span><span class="num">${res.totalPlanets ? fmtCompact(e.net / res.totalPlanets) : '—'} ISK</span>
        <span class="k">Per month</span><span class="num">${fmtCompact(e.net * 30)} ISK</span>
      </div>
      <h3 style="margin-top:14px">Value at each tier</h3>
      ${[0, 1, 2, 3, 4].filter(t => e.valueByTier[t] > 0).map(t => { const mx = Math.max(...e.valueByTier); return html`<div style="display:grid;grid-template-columns:44px 1fr 74px;gap:8px;align-items:center;margin-bottom:6px">
        <span class="muted">${t ? 'P' + t : 'P0'}</span><div class="bar" style="margin:0"><i style="width:${(e.valueByTier[t] / mx * 100).toFixed(1)}%"></i></div><span class="num right">${fmtCompact(e.valueByTier[t])}</span></div>`; })}
      <div class="dim" style="font-size:12px;margin-top:6px">Selling at a lower tier earns that tier's value without the later factory work. Prices are CCP's universe-wide averages.</div>
    </div>

    <div class="panel"><h3>Settings</h3>
      <div class="field"><label>Planet types available to you</label><div class="pi-chips">${Object.keys(PI.PLANETS).map(pt => html`<button class="badge ${p.planetTypes.includes(pt) ? 'accent' : ''}" data-ptype="${pt}">${pt}</button>`)}</div></div>
      <div class="grid grid-2">
        ${field('Raw per extraction planet (units/h)', html`<input type="number" data-pset="p0PerPlanet" value="${p.p0PerPlanet}" min="1000" step="500">`, 'Two extractor heads clusters on a good planet: 8k–20k')}
        ${field('Customs tax %', html`<input type="number" data-pset="tax" value="${p.tax}" min="0" max="100" step="0.5">`)}
        ${field('Advanced factories per planet', html`<input type="number" data-pset="advPerPlanet" value="${p.advPerPlanet}" min="1" max="30">`)}
        ${field('High-tech plants per planet', html`<input type="number" data-pset="htPerPlanet" value="${p.htPerPlanet}" min="1" max="6">`)}
      </div>
    </div>`;
}

function piTable(res) {
  const rows = Object.entries(res.rates).sort((a, b) => PI.items[b[0]].tier - PI.items[a[0]].tier || a[0].localeCompare(b[0]));
  const price = n => (piState.types && piState.types[n] ? piState.types[n].price : 0);
  const cur = piState.overlay && piState.current ? piState.current : null;
  return html`<div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Bill of materials</h3></div><table><thead><tr><th>Item</th><th>Tier</th><th class="right">Per hour</th><th class="right">Per day</th><th class="right">Factories</th><th>Source</th><th class="right">Value / day</th>${cur ? raw('<th class="right">You now</th>') : ''}</tr></thead><tbody>
    ${rows.map(([n, r]) => { const it = PI.items[n]; const t = piState.types && piState.types[n];
      const mine = cur ? (it.tier === 0 ? cur.extracting[n] : cur.producing[n]) : null;
      return html`<tr><td>${t && t.id ? html`<img src="${IMG}/types/${t.id}/icon?size=32" width="20" height="20" style="vertical-align:-5px;margin-right:6px" alt="">` : ''}${n}</td>
      <td><span class="badge">${it.tier ? 'P' + it.tier : 'P0'}</span></td><td class="right num">${fmtRate(r)}</td><td class="right num">${fmtNum(r * 24)}</td>
      <td class="right num">${res.factories[n] ? html`${Math.ceil(res.factories[n])} <span class="dim">(${res.factories[n].toFixed(2)})</span>` : ''}</td>
      <td class="muted">${res.bought[n] ? raw('<span class="badge gold">Buy</span>') : it.tier === 0 ? (res.assign[n] ? 'Extract on ' + res.assign[n] : raw('<span class="neg">No planet type</span>')) : PI.FACTORY[it.tier]}</td>
      <td class="right num">${fmtCompact(r * 24 * price(n))}</td>
      ${cur ? html`<td class="right num ${mine ? 'pos' : 'dim'}">${mine ? (it.tier === 0 ? fmtNum(mine) + '/h' : mine + ' fact.') : '—'}</td>` : ''}</tr>`; })}</tbody></table></div>`;
}

// ================= View =================

async function renderPiPlanner(stillCurrent) {
  if (!piState.plan) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('pi-current-plan') || 'null'); } catch {}
    piState.plan = saved && saved.targets ? { ...PI_DEFAULT_PLAN(), ...saved } : PI_DEFAULT_PLAN();
  }
  if (!piState.types) {
    setContent(loadingView('Loading PI items and prices…'));
    const r = await api.pi.types(Object.keys(PI.items));
    piState.types = r.ok ? r.data : {};
    const [cap, plans] = await Promise.all([api.pi.capacity(), api.pi.plans()]);
    piState.capacity = cap.ok && cap.data.length ? cap.data : null;
    piState.plans = plans.ok ? plans.data : [];
    if (!stillCurrent()) return;
  }
  drawPi();
}

function drawPi() {
  const res = piCompute(piState.plan);
  piState.lastRes = res;
  try { localStorage.setItem('pi-current-plan', JSON.stringify(piState.plan)); } catch {}
  const p = piState.plan;
  const scroll = content().scrollTop;
  setContent(html`
    <div class="toolbar">
      <input type="text" id="pi-name" value="${p.name}" class="pi-name" spellcheck="false">
      <button class="btn btn-primary" id="pi-save">Save plan</button>
      <select id="pi-load" class="crumb-select"><option value="">Saved plans (${piState.plans.length})…</option>${piState.plans.map(x => html`<option value="${x.id}">${x.name}</option>`)}</select>
      <button class="btn btn-ghost" id="pi-new">New</button>
      ${p.id ? html`<button class="btn btn-danger" id="pi-del">Delete</button>` : ''}
      <span style="flex:1"></span>
      <label class="check" style="margin:0"><input type="checkbox" id="pi-compact" ${raw(piState.compact ? 'checked' : '')}> Hide unused</label>
      <label class="check" style="margin:0"><input type="checkbox" id="pi-overlay" ${raw(piState.overlay ? 'checked' : '')}> Show my colonies</label>
    </div>
    <div class="pi-layout">
      <div class="panel pi-graph">${raw(graphSvg(res))}
        <div class="pi-legend"><span><i class="lg on"></i>In this plan</span><span><i class="lg buy"></i>Bought</span><span><i class="lg tgt"></i>Target</span>${piState.overlay ? raw('<span><i class="lg mine"></i>You make this now</span>') : ''}<span class="dim">Hover to trace a chain · click for details</span></div>
      </div>
      <div class="pi-side">${piSidePanel(res)}</div>
    </div>
    ${piTable(res)}`);
  content().scrollTop = scroll;
  bindGraph();
  bindPi();
}

function piNodeInfo(key) {
  if (key.startsWith('planet:')) {
    const pt = key.slice(7);
    const p = piState.plan;
    const on = p.planetTypes.includes(pt);
    openModal(`${pt} planet`, html`<div style="display:flex;gap:16px;align-items:center"><svg viewBox="-45 -30 90 60" width="110" height="72">${raw(planetSvg(pt, 24))}</svg>
      <div><div class="muted">Raw resources</div>${PI.PLANETS[pt].p0.map(x => html`<div>${x} <span class="dim">→ ${Object.values(PI.items).find(i => i.tier === 1 && i.inputs[0].name === x).name}</span></div>`)}</div></div>`,
      { submit: on ? 'Mark as unavailable' : 'Mark as available', onSubmit: () => { p.planetTypes = on ? p.planetTypes.filter(x => x !== pt) : [...p.planetTypes, pt]; drawPi(); } });
    return;
  }
  const it = PI.items[key];
  const res = piState.lastRes;
  const t = piState.types && piState.types[key];
  const isTarget = piState.plan.targets.some(x => x.name === key);
  const isBuy = piState.plan.buy.includes(key);
  const used = PI.usedBy(key);
  openModal(key, html`
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:12px">
      ${t && t.id ? html`<img src="${IMG}/types/${t.id}/icon?size=64" width="56" height="56" style="border-radius:8px;background:var(--bg-2)" alt="">` : ''}
      <div><div><span class="badge accent">${it.tier ? 'P' + it.tier : 'Raw (P0)'}</span> ${t && t.price ? html`<span class="badge">${fmtIsk(t.price)} avg</span>` : ''}</div>
      ${it.tier ? html`<div class="muted" style="margin-top:6px">${PI.FACTORY[it.tier]}: ${it.out} per ${it.cycleH === 0.5 ? '30 min' : 'hour'} (${it.perFactoryHour}/h per factory)</div>` : html`<div class="muted" style="margin-top:6px">Found on: ${PI.planetsWith(key).join(', ')}</div>`}
      ${res.rates[key] ? html`<div style="margin-top:4px">This plan needs <b>${fmtRate(res.rates[key])}/h</b> (${fmtNum(res.rates[key] * 24)}/day)</div>` : ''}</div></div>
    ${it.inputs.length ? html`<h3 class="mh">Inputs per cycle</h3>${it.inputs.map(i => html`<div class="skill-row"><span>${i.name}</span><span class="num">${fmtNum(i.qty)}</span></div>`)}` : ''}
    ${used.length ? html`<h3 class="mh" style="margin-top:12px">Used in</h3><div class="pi-chips">${used.map(u => html`<span class="badge">${u}</span>`)}</div>` : ''}`,
    {
      submit: isTarget ? 'Remove target' : 'Make this a target',
      extraButtons: it.tier >= 1 && !isTarget ? `<button type="button" class="btn btn-ghost" id="pi-buytoggle">${isBuy ? 'Produce instead of buying' : 'Buy instead of producing'}</button>` : '',
      onSubmit: () => {
        if (isTarget) piState.plan.targets = piState.plan.targets.filter(x => x.name !== key);
        else if (it.tier >= 1) piState.plan.targets.push({ name: key, perDay: Math.max(1, Math.round(it.perFactoryHour * 24)) });
        else throw new Error('Raw materials can\'t be targets. Pick a P1 or higher.');
        drawPi();
      }
    });
  const bt = $('#pi-buytoggle');
  if (bt) bt.onclick = () => { piState.plan.buy = isBuy ? piState.plan.buy.filter(x => x !== key) : [...piState.plan.buy, key]; closeModal(); drawPi(); };
}

function bindPi() {
  const p = piState.plan;
  const redraw = () => drawPi();
  document.querySelectorAll('[data-pt-name]').forEach(s => s.onchange = () => { p.targets[+s.dataset.ptName].name = s.value; redraw(); });
  document.querySelectorAll('[data-pt-rate]').forEach(s => s.onchange = () => { p.targets[+s.dataset.ptRate].perDay = Math.max(0, Number(s.value) || 0); redraw(); });
  document.querySelectorAll('[data-pt-del]').forEach(b => b.onclick = () => { p.targets.splice(+b.dataset.ptDel, 1); redraw(); });
  const add = document.querySelector('[data-pt-add]');
  if (add) add.onclick = () => { p.targets.push({ name: 'Coolant', perDay: 120 }); redraw(); };
  const fit = document.querySelector('[data-pt-max]');
  if (fit) fit.onclick = () => {
    const cap = piState.capacity ? piState.capacity.reduce((n, c) => n + (c.maxPlanets || 0), 0) : 0;
    if (!cap) return toast('Add pilots first so colony slots can be counted.', true);
    if (!p.targets.length) return toast('Add a target first.', true);
    // binary search a scale factor so total planets <= capacity
    const base = p.targets.map(t => t.perDay || 1);
    let lo = 0, hi = 1;
    const fits = k => { const tmp = { ...p, targets: p.targets.map((t, i) => ({ ...t, perDay: base[i] * k })) }; return piCompute(tmp).totalPlanets <= cap; };
    while (fits(hi) && hi < 1e5) hi *= 2;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
    p.targets = p.targets.map((t, i) => ({ ...t, perDay: Math.floor(base[i] * lo * 10) / 10 }));
    toast(`Scaled to fit ${cap} colony slots`);
    redraw();
  };
  document.querySelectorAll('[data-ptype]').forEach(b => b.onclick = () => {
    const pt = b.dataset.ptype;
    p.planetTypes = p.planetTypes.includes(pt) ? p.planetTypes.filter(x => x !== pt) : [...p.planetTypes, pt];
    redraw();
  });
  document.querySelectorAll('[data-pset]').forEach(i => i.onchange = () => { p[i.dataset.pset] = Math.max(0, Number(i.value) || 0); redraw(); });
  $('#pi-name').onchange = e => { p.name = e.target.value.trim() || 'Plan'; };
  $('#pi-compact').onchange = e => { piState.compact = e.target.checked; redraw(); };
  $('#pi-overlay').onchange = async e => {
    piState.overlay = e.target.checked;
    if (piState.overlay && !piState.current) {
      toast('Loading your colonies…');
      const r = await api.pi.current();
      piState.current = r.ok ? r.data : { extracting: {}, producing: {} };
    }
    redraw();
  };
  $('#pi-save').onclick = async () => {
    p.name = $('#pi-name').value.trim() || 'Plan';
    const r = await api.pi.savePlan(JSON.parse(JSON.stringify(p)));
    if (!r.ok) return toast(r.error, true);
    piState.plans = r.data;
    if (!p.id) p.id = r.data.find(x => x.name === p.name && x.savedAt) ? r.data[r.data.length - 1].id : null;
    toast('Plan saved'); redraw();
  };
  $('#pi-load').onchange = e => {
    const pl = piState.plans.find(x => x.id === e.target.value);
    if (pl) { piState.plan = { ...PI_DEFAULT_PLAN(), ...JSON.parse(JSON.stringify(pl)) }; redraw(); }
  };
  $('#pi-new').onclick = () => { piState.plan = PI_DEFAULT_PLAN(); redraw(); };
  const del = $('#pi-del');
  if (del) del.onclick = async () => { const r = await api.pi.deletePlan(p.id); if (r.ok) piState.plans = r.data; piState.plan = PI_DEFAULT_PLAN(); toast('Plan deleted'); redraw(); };
}

// ================= Nearby planets =================

const nearState = { from: '', types: ['Barren', 'Temperate'], all: false, jumps: 10, zones: ['hs', 'ls', 'ns'], bridges: false, pilots: null, data: null };
const NEAR_ZONES = [['hs', 'Highsec'], ['ls', 'Lowsec'], ['ns', 'Nullsec'], ['pochven', 'Pochven']];
const planetIcon = t => `<svg width="16" height="16" viewBox="-11 -11 22 22" style="flex:none">${planetSvg(t, 6)}</svg>`;
const secColor = s => { const v = Math.round(s * 10) / 10; return v >= 0.5 ? 'var(--green)' : v > 0 ? 'var(--gold)' : 'var(--red)'; };

async function renderNearbyPlanets(stillCurrent) {
  const s = nearState;
  if (!s.pilots) { const r = await api.nav.pilotLocations(); s.pilots = r.ok ? r.data.filter(p => p.system && !(Number(p.whClass) >= 1 && Number(p.whClass) <= 6)) : []; if (stillCurrent && !stillCurrent()) return; if (!s.from && s.pilots[0]) s.from = s.pilots[0].system; }
  const planTypes = piState.lastRes ? Object.keys(piState.lastRes.planets || {}) : [];
  const inBox = 'background:var(--bg-2);border:1px solid var(--line-2);color:var(--text);border-radius:6px;padding:6px 10px;font:inherit;color-scheme:dark';
  setContent(html`<div class="panel">
      <div class="toolbar" style="flex-wrap:wrap;gap:12px;margin:0">
        <label>From <input id="np-from" type="text" value="${s.from}" placeholder="System name" spellcheck="false" style="${inBox};width:150px"></label>
        ${s.pilots.length ? html`<span class="dim" style="font-size:12px">or a pilot:</span>${s.pilots.map(p => html`<button class="btn btn-ghost" style="padding:3px 9px;font-size:12px" data-np-pilot="${p.system}" title="${p.name} is in ${p.system}">${p.name.split(' ')[0]} · ${p.system}</button>`)}` : ''}
      </div>
      <div style="margin-top:12px"><div class="dim" style="font-size:12px;margin-bottom:6px">Planet types</div>
        <div class="pi-chips">${Object.keys(PI.PLANETS).map(pt => html`<button class="badge ${s.types.includes(pt) ? 'accent' : ''}" data-np-type="${pt}" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">${raw(planetIcon(pt))}${pt}</button>`)}
          ${planTypes.length ? html`<button class="btn btn-ghost" style="padding:3px 9px;font-size:12px;margin-left:6px" id="np-plan" title="${planTypes.join(', ')}">Use my plan's types</button>` : ''}</div></div>
      <div class="toolbar" style="flex-wrap:wrap;gap:14px;margin:12px 0 0">
        <label class="check" style="margin:0"><input type="radio" name="np-mode" value="any" ${raw(!s.all ? 'checked' : '')}> Any of these</label>
        <label class="check" style="margin:0"><input type="radio" name="np-mode" value="all" ${raw(s.all ? 'checked' : '')}> All in one system</label>
        <label>Within <input id="np-jumps" type="number" min="0" max="30" value="${s.jumps}" style="${inBox};width:70px"> jumps</label>
        ${NEAR_ZONES.map(([k, l]) => html`<label class="check" style="margin:0"><input type="checkbox" data-np-zone="${k}" ${raw(s.zones.includes(k) ? 'checked' : '')}> ${l}</label>`)}
        <label class="check" style="margin:0"><input type="checkbox" id="np-bridges" ${raw(s.bridges ? 'checked' : '')}> Use jump bridges</label>
        <button class="btn btn-primary" id="np-go">Find planets</button></div>
    </div>
    <div id="np-out">${s.data ? '' : emptyBox('Pick the planet types you need and where you are. The closest systems with them come first.')}</div>`);
  if (s.data) drawNearby();
  const read = () => {
    s.from = $('#np-from').value.trim(); s.jumps = Number($('#np-jumps').value) || 0; s.all = document.querySelector('input[name="np-mode"]:checked').value === 'all';
    s.zones = [...document.querySelectorAll('[data-np-zone]')].filter(x => x.checked).map(x => x.dataset.npZone); s.bridges = $('#np-bridges').checked;
  };
  document.querySelectorAll('[data-np-type]').forEach(b => b.onclick = () => { read(); const t = b.dataset.npType; s.types = s.types.includes(t) ? s.types.filter(x => x !== t) : [...s.types, t]; renderNearbyPlanets(); });
  document.querySelectorAll('[data-np-pilot]').forEach(b => b.onclick = () => { $('#np-from').value = b.dataset.npPilot; read(); find(); });
  const plan = $('#np-plan'); if (plan) plan.onclick = () => { read(); s.types = planTypes.slice(); s.all = false; renderNearbyPlanets(); };
  $('#np-from').onkeydown = e => { if (e.key === 'Enter') { read(); find(); } };
  $('#np-go').onclick = () => { read(); find(); };
  async function find() {
    $('#np-out').innerHTML = String(loadingView('Searching nearby systems…'));
    const r = await api.pi.nearby({ from: s.from, types: s.types, all: s.all, jumps: s.jumps, zones: s.zones, bridges: s.bridges });
    if (!r.ok) { $('#np-out').innerHTML = String(errorView(r)); return; }
    s.data = r.data; drawNearby();
  }
}

function drawNearby() {
  const d = nearState.data;
  const near = Object.entries(d.nearest);
  $('#np-out').innerHTML = String(html`<div class="grid grid-${Math.min(4, Math.max(2, near.length))}" style="margin:14px 0">
      ${near.map(([t, n]) => html`<div class="stat"><div class="label" style="display:flex;align-items:center;gap:6px">${raw(planetIcon(t))}Nearest ${t}</div><div class="value">${n ? n.name : '—'}</div><div class="hint">${n ? (n.jumps === 0 ? 'In ' + d.from : n.jumps + ' jump' + (n.jumps === 1 ? '' : 's') + ' from ' + d.from) : 'None within ' + d.jumps + ' jumps'}</div></div>`)}
    </div>
    <div class="panel" style="padding:0">${d.rows.length ? html`<table><thead><tr><th>System</th><th class="right">Jumps</th><th>Region</th>${d.types.map(t => html`<th class="right">${t}</th>`)}<th>Other planets</th><th></th></tr></thead><tbody>
      ${d.rows.map(r => html`<tr><td><b><a href="#" data-system="${r.name}" style="color:inherit">${r.name}</a></b> <span style="color:${raw(secColor(r.security))}">${(Math.round(r.security * 10) / 10).toFixed(1)}</span></td>
        <td class="right num">${r.jumps}</td><td class="muted">${r.region}</td>
        ${d.types.map(t => html`<td class="right num ${r.counts[t] ? '' : 'dim'}">${r.counts[t] || '—'}</td>`)}
        <td class="dim" style="font-size:12px">${Object.entries(r.planets).filter(([k]) => !d.types.includes(k) && PI.PLANETS[k]).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</td>
        <td style="white-space:nowrap"><a href="#" data-np-route="${r.name}" style="font-size:12px">Route</a> · <a href="#" data-link="https://evemaps.dotlan.net/system/${r.name.replace(/ /g, '_')}" style="font-size:12px">Dotlan ↗</a></td></tr>`)}
    </tbody></table>` : emptyBox(`No systems with ${d.all ? 'all of ' : ''}those planet types within ${d.jumps} jumps. Try more jumps or more areas of space.`)}</div>
    <div class="dim" style="font-size:12px;margin-top:8px">Searched ${fmtNum(d.searched)} systems within ${d.jumps} jumps of ${d.from}${d.more ? `, showing the closest 120 of ${d.rows.length + d.more}` : ''}. Planets in lowsec and nullsec give more resources than highsec, and wormholes the most. Planet counts come from CCP's game data.</div>`);
  document.querySelectorAll('[data-np-route]').forEach(a => a.onclick = e => { e.preventDefault(); openRouteCard(nearState.data.from, a.dataset.npRoute); });
}
