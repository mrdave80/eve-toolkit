'use strict';
/* Extended views. Uses helpers defined in app.js (html, raw, esc, fmt*, setContent, api, state…). */

// ================= Shared widgets =================

function timeline(rows, { from, to, ticks = 6 } = {}) {
  const now = Date.now();
  const span = Math.max(1, to - from);
  const pos = t => Math.max(0, Math.min(100, ((t - from) / span) * 100));
  const tickTimes = Array.from({ length: ticks + 1 }, (_, i) => from + (span * i) / ticks);
  const tickLabel = t => span > 3 * 86400000
    ? new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    : new Date(t).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  return html`<div class="tl">
    <div class="tl-axis"><div></div><div class="tl-ticks">${tickTimes.map(t => html`<span style="left:${pos(t)}%">${tickLabel(t)}</span>`)}</div></div>
    ${rows.map(r => html`<div class="tl-row">
      <div class="tl-label">${r.img ? html`<img src="${r.img}" alt="">` : ''}<span title="${r.label}">${r.label}</span></div>
      <div class="tl-track">
        ${now >= from && now <= to ? html`<div class="tl-now" style="left:${pos(now)}%"></div>` : ''}
        ${r.segs.map(sg => {
          const l = pos(sg.start), w = Math.max(0.4, pos(sg.end) - l);
          return html`<div class="tl-seg ${sg.cls || ''}" style="left:${l}%;width:${w}%" title="${sg.title || sg.label}">${w > 6 ? sg.label : ''}</div>`;
        })}
      </div></div>`)}
  </div>`;
}

const slotBoxes = (used, max, ready = 0) => raw('<div class="slots">' +
  Array.from({ length: Math.max(max, used) }, (_, i) => `<i class="${i < ready ? 'ready' : (i < used ? 'on' : '')}"></i>`).join('') + '</div>');

function standingSpan(v) {
  const cls = v > 5 ? 'pp' : v > 0 ? 'p' : v < -5 ? 'nn' : v < 0 ? 'n' : '';
  return html`<span class="standing ${cls}">${(v > 0 ? '+' : '') + Number(v).toFixed(2)}</span>`;
}

const icon = (typeId, size = 20) => html`<img src="${typeIcon(typeId)}" width="${size}" height="${size}" style="vertical-align:-5px;margin-right:6px" alt="" loading="lazy">`;
const stat = (label, value, hint, cls = '') => html`<div class="stat"><div class="label">${label}</div><div class="value ${cls}">${value}</div>${hint ? html`<div class="hint">${hint}</div>` : ''}</div>`;
const emptyBox = msg => html`<div class="empty" style="padding:30px">${msg}</div>`;
const fmtM3 = n => fmtNum(n);

// ================= Skills: training stats =================

function viewTraining(d) {
  const now = Date.now();
  const active = d.queue.filter(e => e.finish && !e.complete);
  const a = d.attributes;
  const from = now - 3600000;
  const to = d.queueEnd ? Math.max(Date.parse(d.queueEnd), now + 86400000) : now + 86400000;
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Training rate', d.spPerHour ? fmtNum(d.spPerHour) + ' SP/h' : (d.paused ? 'Paused' : 'Idle'), d.spPerDay ? fmtNum(d.spPerDay) + ' SP per day' : '', d.spPerHour ? '' : 'gold')}
      ${stat('SP left in queue', fmtNum(d.spRemaining), d.queueEnd ? 'Ends ' + fmtDate(d.queueEnd) : 'Queue empty')}
      ${stat('Projected total SP', fmtNum(d.projectedSp), 'Currently ' + fmtNum(d.totalSp))}
      ${stat('Finishing soon', d.finishing24h + ' in 24h', d.finishing7d + ' within 7 days')}
    </div>
    <div class="panel"><h3>Queue timeline</h3>
      ${active.length ? timeline([{ label: 'Skill queue', segs: active.map(e => ({
        start: Math.max(Date.parse(e.start), from), end: Date.parse(e.finish),
        label: `${e.name} ${ROMAN[e.level]}`, title: `${e.name} ${ROMAN[e.level]} · ${fmtDate(e.finish)}`
      })) }], { from, to }) : emptyBox('Nothing training')}
    </div>
    <div class="grid grid-2">
      <div class="panel"><h3>Attributes & implants</h3>
        ${a ? html`<div class="kv">
          <span class="k">Intelligence</span><span class="num">${a.intelligence}</span>
          <span class="k">Memory</span><span class="num">${a.memory}</span>
          <span class="k">Perception</span><span class="num">${a.perception}</span>
          <span class="k">Willpower</span><span class="num">${a.willpower}</span>
          <span class="k">Charisma</span><span class="num">${a.charisma}</span>
          <span class="k">Bonus remaps</span><span>${a.bonus_remaps || 0}</span>
          <span class="k">Last remap</span><span>${a.last_remap_date ? fmtDay(a.last_remap_date) : '—'}</span>
          <span class="k">Next yearly remap</span><span>${a.accrued_remap_cooldown_date ? fmtDay(a.accrued_remap_cooldown_date) : 'Available'}</span>
        </div>` : html`<div class="muted">Unavailable</div>`}
        <div style="margin-top:12px" class="muted">${d.implants.length ? d.implants.map(i => i.name).join(' · ') : 'No implants plugged in'}</div>
      </div>
      <div class="panel"><h3>Skills by level (${d.skillCount} trained)</h3>
        ${[1, 2, 3, 4, 5].map(l => {
          const n = d.levelDist[l]; const pct = d.skillCount ? n / d.skillCount * 100 : 0;
          return html`<div style="display:grid;grid-template-columns:40px 1fr 50px;gap:10px;align-items:center;margin-bottom:8px">
            <span class="muted">${ROMAN[l]}</span><div class="bar" style="margin:0"><i style="width:${pct}%"></i></div><span class="num right">${n}</span></div>`;
        })}
        ${d.unallocatedSp ? html`<div class="gold">${fmtNum(d.unallocatedSp)} unallocated SP</div>` : ''}
      </div>
    </div>
    <div class="panel" style="padding:0"><div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Skill</th><th class="right">SP to train</th><th class="right">SP/hour</th><th class="right">Starts</th><th class="right">Finishes</th><th class="right">Time left</th></tr></thead>
      <tbody>${d.queue.map(e => html`<tr style="${e.complete ? 'opacity:.45' : ''}">
        <td class="dim">${e.position + 1}</td><td>${e.name} ${ROMAN[e.level]}</td>
        <td class="right num">${fmtNum(e.spToGo)}</td><td class="right num">${e.spPerHour ? fmtNum(e.spPerHour) : '—'}</td>
        <td class="right nowrap">${e.start ? fmtDate(e.start) : '—'}</td><td class="right nowrap">${e.finish ? fmtDate(e.finish) : 'Paused'}</td>
        <td class="right num nowrap" ${raw(e.finish && !e.complete ? `data-countdown="${esc(e.finish)}"` : '')}>${e.complete ? 'Done' : (e.finish ? fmtDuration(Date.parse(e.finish) - now) : '—')}</td></tr>`)}</tbody>
    </table></div></div>`);
}

// ================= Industry =================

function jobsTable(jobs, { showPilot = false } = {}) {
  const now = Date.now();
  if (!jobs.length) return emptyBox('No industry jobs');
  return html`<table><thead><tr>${showPilot ? raw('<th>Pilot</th>') : ''}<th>Activity</th><th>Blueprint</th><th>Product / Result</th><th class="right">Runs</th><th>Facility</th><th>Status</th><th style="width:150px">Progress</th><th class="right">Ends</th></tr></thead><tbody>
    ${jobs.map(j => {
      const end = Date.parse(j.end);
      const running = j.status === 'active';
      const result = j.activity === 'Invention' && j.successfulRuns !== null && j.status === 'delivered'
        ? `${j.successfulRuns}/${j.runs} succeeded` : (j.product || '');
      return html`<tr>
        ${showPilot ? html`<td class="nowrap">${j.pilot}</td>` : ''}
        <td class="nowrap">${j.activity}${j.corp ? raw(' <span class="badge">corp</span>') : ''}</td>
        <td>${icon(j.blueprintTypeId)}${j.blueprint}</td>
        <td>${result}${j.probability && j.activity === 'Invention' ? html`<div class="dim">${Math.round(j.probability * 100)}% chance</div>` : ''}</td>
        <td class="right num">${j.runs}${j.outputValue ? html`<div class="dim" title="Product average price × runs (portion sizes not included)">≈ ${fmtCompact(j.outputValue)}</div>` : ''}</td>
        <td class="muted">${j.facility}${j.corp && j.installer ? html`<div class="dim">by ${j.installer}</div>` : ''}</td>
        <td><span class="badge ${j.status === 'ready' ? 'gold' : running ? 'accent' : j.status === 'delivered' ? 'green' : j.status === 'cancelled' ? 'red' : ''}">${j.status === 'ready' ? 'Ready to deliver' : humanize(j.status)}</span></td>
        <td>${running || j.status === 'ready' ? html`<div class="bar ${j.status === 'ready' ? 'gold' : ''}" style="margin:6px 0 0"><i style="width:${(j.progress * 100).toFixed(1)}%"></i></div>` : ''}</td>
        <td class="right num nowrap" ${raw(running && end > now ? `data-countdown="${esc(j.end)}"` : '')}>${running && end > now ? fmtDuration(end - now) : fmtDate(j.completed || j.end)}</td></tr>`;
    })}</tbody></table>`;
}

function slotPanel(label, slot, jobs) {
  const ready = jobs.filter(j => !j.corp && j.slot === label && j.status === 'ready').length;
  return html`<div class="stat"><div class="label">${humanize(label)} slots</div>
    <div class="value">${slot.used} / ${slot.max}</div>
    ${slotBoxes(slot.used, slot.max, ready)}
    <div class="hint">${slot.max - slot.used > 0 ? (slot.max - slot.used) + ' free' : 'All in use'}${ready ? ' · ' + ready + ' ready' : ''}</div></div>`;
}

let industryFilter = 'current';
function viewIndustry(d) {
  const draw = () => {
    const now = Date.now();
    const jobs = d.jobs.filter(j => industryFilter === 'all' || ['active', 'paused', 'ready'].includes(j.status))
      .filter(j => industryFilter !== 'mine' || !j.corp);
    const running = d.jobs.filter(j => !j.corp && j.status === 'active' && Date.parse(j.end) > now);
    const from = now - 3600000;
    const to = running.length ? Math.max(...running.map(j => Date.parse(j.end))) : now + 86400000;
    const sk = d.skills;
    setContent(html`
      ${d.corpError ? html`<div class="notice">${d.corpError}</div>` : ''}
      <div class="grid grid-4" style="margin-bottom:16px">
        ${slotPanel('manufacturing', d.slots.manufacturing, d.jobs)}
        ${slotPanel('science', d.slots.science, d.jobs)}
        ${slotPanel('reaction', d.slots.reaction, d.jobs)}
        <div class="stat"><div class="label">Industry skills</div><div class="hint" style="line-height:1.7;margin-top:6px">
          Industry ${ROMAN[sk.industry]} · Adv. Industry ${ROMAN[sk.advancedIndustry]}<br>
          Mass Prod. ${ROMAN[sk.massProduction]} / Adv. ${ROMAN[sk.advMassProduction]}<br>
          Lab Op. ${ROMAN[sk.labOperation]} / Adv. ${ROMAN[sk.advLabOperation]}<br>
          Mass Reactions ${ROMAN[sk.massReactions]} / Adv. ${ROMAN[sk.advMassReactions]}</div></div>
      </div>
      ${(() => { const v = d.jobs.filter(j => !j.corp && ['active', 'ready'].includes(j.status)).reduce((n, j) => n + (j.outputValue || 0), 0);
        return v ? html`<div class="notice" style="background:var(--accent-dim);border-color:var(--accent-line);color:var(--text)">Manufacturing & reactions in progress: ≈ <b>${fmtCompact(v)} ISK</b> of output at average prices</div>` : ''; })()}
      ${running.length ? html`<div class="panel"><h3>Running jobs timeline</h3>${timeline(running.map(j => ({
        label: `${j.activity}: ${j.product || j.blueprint}`,
        img: typeIcon(j.blueprintTypeId),
        segs: [{ start: Math.max(Date.parse(j.start), from), end: Date.parse(j.end), cls: 'ind-' + j.slot, label: `${j.runs}× · ${fmtDuration(Date.parse(j.end) - now, true)}`, title: `${j.blueprint} → ${fmtDate(j.end)}` }]
      })), { from, to })}</div>` : ''}
      <div class="toolbar"><div class="seg">
        <button data-if="current" class="${industryFilter === 'current' ? 'active' : ''}">Current</button>
        <button data-if="mine" class="${industryFilter === 'mine' ? 'active' : ''}">My jobs only</button>
        <button data-if="all" class="${industryFilter === 'all' ? 'active' : ''}">Include history (${d.jobs.length})</button></div></div>
      <div class="panel" style="padding:0"><div class="table-wrap">${jobsTable(jobs)}</div></div>`);
    document.querySelectorAll('[data-if]').forEach(b => b.onclick = () => { industryFilter = b.dataset.if; draw(); });
  };
  draw();
}

function viewBlueprints(list) {
  let kind = 'all';
  const draw = (q = '') => {
    const rows = list.filter(b => (kind === 'all' || (kind === 'bpo' ? b.original : !b.original)) && (!q || b.name.toLowerCase().includes(q)));
    const bpo = list.filter(b => b.original).length;
    const researched = list.filter(b => b.original && b.me === 10 && b.te === 20).length;
    content().querySelector('#bp-body').innerHTML = String(rows.length ? html`<table><thead><tr><th>Blueprint</th><th>Type</th><th class="right">ME</th><th class="right">TE</th><th class="right">Runs</th><th class="right">Qty</th><th class="right">Est. value</th><th>Location</th></tr></thead><tbody>
      ${rows.map(b => html`<tr><td>${icon(b.typeId)}${b.name}</td>
        <td><span class="badge ${b.original ? 'accent' : ''}">${b.original ? 'Original' : 'Copy'}</span></td>
        <td class="right num ${b.me === 10 ? 'pos' : ''}">${b.me}%</td><td class="right num ${b.te === 20 ? 'pos' : ''}">${b.te}%</td>
        <td class="right num">${b.original ? '∞' : fmtNum(b.runs)}</td><td class="right num">${fmtNum(b.quantity)}</td>
        <td class="right num">${b.value ? fmtCompact(b.value) : '—'}</td>
        <td class="muted">${b.location}</td></tr>`)}</tbody></table>` : emptyBox('No blueprints match'));
    content().querySelector('#bp-stats').innerHTML = String(html`${stat('Blueprints', fmtNum(list.length))}${stat('Originals', fmtNum(bpo), researched + ' fully researched · ≈ ' + fmtCompact(list.reduce((n, b) => n + (b.value || 0), 0)) + ' ISK')}${stat('Copies', fmtNum(list.length - bpo))}`);
  };
  setContent(html`<div class="grid grid-3" style="margin-bottom:16px" id="bp-stats"></div>
    <div class="toolbar"><input type="search" id="bp-q" placeholder="Search blueprints…"><div class="seg">
      <button data-bk="all" class="active">All</button><button data-bk="bpo">Originals</button><button data-bk="bpc">Copies</button></div></div>
    <div class="panel" style="padding:0"><div class="table-wrap" id="bp-body"></div></div>`);
  draw();
  $('#bp-q').oninput = e => draw(e.target.value.trim().toLowerCase());
  document.querySelectorAll('[data-bk]').forEach(b => b.onclick = () => {
    kind = b.dataset.bk;
    document.querySelectorAll('[data-bk]').forEach(x => x.classList.toggle('active', x === b));
    draw($('#bp-q').value.trim().toLowerCase());
  });
}

function planetCard(p, pilot) {
  const now = Date.now();
  return html`<div class="panel">
    <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:10px">
      <div><div style="font-size:15px">${p.name}</div><div class="muted" style="font-size:12px">${humanize(p.type)} planet · CC level ${p.upgradeLevel} · ${p.pins} structures${pilot ? ' · ' + pilot : ''}</div></div>
      <div>${p.anyExpired ? raw('<span class="badge red">Extractor stopped</span>') : (p.nextExpiry && Date.parse(p.nextExpiry) - now < 86400000 ? raw('<span class="badge gold">Expiring soon</span>') : (p.extractors.length ? raw('<span class="badge green">Running</span>') : raw('<span class="badge">No extractors</span>')))}</div>
    </div>
    ${p.error ? html`<div class="notice">${p.error}</div>` : ''}
    ${p.extractors.length ? html`<table><thead><tr><th>Extractor</th><th class="right">Heads</th><th class="right">Per cycle</th><th class="right">Per hour</th><th class="right">Expires</th></tr></thead><tbody>
      ${p.extractors.map(e => {
        const exp = e.expiry ? Date.parse(e.expiry) : null;
        return html`<tr><td>${e.productTypeId ? icon(e.productTypeId, 18) : ''}${e.product}</td><td class="right num">${e.heads}</td>
          <td class="right num">${fmtNum(e.qtyPerCycle)}</td><td class="right num">${fmtNum(e.perHour)}</td>
          <td class="right num nowrap ${!exp || exp <= now ? 'neg' : (exp - now < 86400000 ? 'gold' : '')}" ${raw(exp && exp > now ? `data-countdown="${esc(e.expiry)}"` : '')}>${!exp ? 'Not running' : exp <= now ? 'Stopped' : fmtDuration(exp - now)}</td></tr>`;
      })}</tbody></table>` : ''}
    ${p.factories.length ? html`<div style="margin-top:10px" class="muted"><b>Factories (${p.factories.length}):</b> ${summariseFactories(p.factories)}</div>` : ''}
    ${p.storage.length ? html`<details style="margin-top:8px"><summary class="muted" style="cursor:pointer">Storage contents${p.storageValue ? ' · ≈ ' + fmtCompact(p.storageValue) + ' ISK' : ''}</summary>
      ${p.storage.map(st => html`<div class="fit-group" style="margin-top:8px"><div class="k">${st.facility}</div>
        <div class="skill-rows" style="padding:0">${st.items.map(i => html`<div class="skill-row"><span>${icon(i.typeId, 16)}${i.name}</span><span class="num muted">${fmtNum(i.amount)}</span></div>`)}</div></div>`)}
    </details>` : ''}
  </div>`;
}
function summariseFactories(f) {
  const m = new Map();
  for (const x of f) m.set(x.schematic, (m.get(x.schematic) || 0) + 1);
  return [...m.entries()].map(([k, n]) => `${n}× ${k}`).join(' · ');
}

function viewPlanets(d) {
  const extractors = d.planets.flatMap(p => p.extractors);
  const stopped = extractors.filter(e => e.expired).length;
  const perHour = extractors.filter(e => !e.expired).reduce((n, e) => n + e.perHour, 0);
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Colonies', `${d.planets.length} / ${d.maxPlanets}`, 'Interplanetary Consolidation ' + ROMAN[d.maxPlanets - 1])}
      ${stat('Extractors', extractors.length, stopped ? stopped + ' stopped' : 'All running', stopped ? 'gold' : '')}
      ${stat('Raw output', fmtNum(perHour) + '/h', 'Across all running extractors')}
      ${stat('Stored product value', fmtCompact(d.planets.reduce((n, p) => n + (p.storageValue || 0), 0)) + ' ISK', 'Command Center Upgrades ' + (ROMAN[d.ccUpgrades] || '0'))}
    </div>
    ${d.planets.length ? d.planets.map(p => planetCard(p)) : emptyBox('No planetary colonies')}`);
}

function viewMining(d) {
  const recent = d.days.slice(-30);
  const max = Math.max(1, ...recent.map(x => x.quantity));
  const last7 = d.days.filter(x => Date.parse(x.date) > Date.now() - 7 * 86400000).reduce((n, x) => n + x.quantity, 0);
  setContent(html`
    <div class="grid grid-3" style="margin-bottom:16px">
      ${stat('Units mined (ledger)', fmtNum(d.total), 'ESI keeps about 30 days')}
      ${stat('Estimated ore value', fmtCompact(d.totalValue) + ' ISK', 'Unrefined, at average prices')}
      ${stat('Last 7 days', fmtNum(last7), d.ores.length + ' ore types')}
    </div>
    <div class="panel"><h3>Daily units mined</h3>
      ${recent.length ? html`<div class="bars">${recent.map(x => html`<div style="height:${(x.quantity / max * 100).toFixed(1)}%" title="${fmtDay(x.date)}: ${fmtNum(x.quantity)}"></div>`)}</div>
        <div class="bars-x"><span>${fmtDay(recent[0].date)}</span><span>${fmtDay(recent[recent.length - 1].date)}</span></div>` : emptyBox('No mining recorded')}
    </div>
    <div class="grid grid-2">
      <div class="panel"><h3>By ore</h3>${d.ores.length ? html`<table><tbody>${d.ores.map(o => html`<tr><td>${icon(o.typeId)}${o.name}</td><td class="right num">${fmtNum(o.quantity)}</td><td class="right num muted">${fmtCompact(o.value || 0)} ISK</td></tr>`)}</tbody></table>` : emptyBox('—')}</div>
      <div class="panel"><h3>By system</h3>${d.systems.length ? html`<table><tbody>${d.systems.map(o => html`<tr><td>${o.name}</td><td class="right num">${fmtNum(o.quantity)}</td></tr>`)}</tbody></table>` : emptyBox('—')}</div>
    </div>
    <div class="panel" style="padding:0"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Ore</th><th>System</th><th class="right">Units</th><th class="right">Est. value</th></tr></thead><tbody>
      ${d.entries.map(e => html`<tr><td class="nowrap">${fmtDay(e.date)}</td><td>${icon(e.typeId)}${e.ore}</td><td>${e.system}</td><td class="right num">${fmtNum(e.quantity)}</td><td class="right num muted">${fmtCompact(e.value || 0)}</td></tr>`)}</tbody></table></div></div>`);
}

function viewResearch(list) {
  const total = list.reduce((n, a) => n + a.points, 0);
  const perDay = list.reduce((n, a) => n + a.pointsPerDay, 0);
  setContent(html`
    <div class="grid grid-3" style="margin-bottom:16px">
      ${stat('Research agents', list.length)}${stat('Points per day', perDay.toFixed(1))}${stat('Accumulated points', fmtNum(total))}
    </div>
    <div class="panel" style="padding:0">${list.length ? html`<table><thead><tr><th>Agent</th><th>Field</th><th class="right">Points/day</th><th>Started</th><th class="right">Accumulated</th></tr></thead><tbody>
      ${list.map(a => html`<tr><td><img src="${portrait(a.agentId, 32)}" width="24" height="24" style="vertical-align:-7px;margin-right:8px;border-radius:3px" alt="">${a.agent}</td>
        <td>${a.field}</td><td class="right num">${a.pointsPerDay.toFixed(2)}</td><td>${fmtDay(a.startedAt)}</td><td class="right num">${fmtNum(a.points)}</td></tr>`)}</tbody></table>`
      : emptyBox('No R&D agents. Research agents generate datacore points over time.')}</div>`);
}

// ================= Finance =================

function viewOrders(d) {
  let mode = 'open';
  const draw = () => {
    const sell = d.open.filter(o => !o.is_buy_order), buy = d.open.filter(o => o.is_buy_order);
    const sellVal = sell.reduce((n, o) => n + o.price * o.volume_remain, 0);
    const escrow = buy.reduce((n, o) => n + (o.escrow || 0), 0);
    const table = (rows, isBuy, hist = false) => rows.length ? html`<table><thead><tr><th>Item</th><th class="right">Price</th><th class="right">Filled</th><th class="right">Remaining value</th><th>Location</th><th>${hist ? 'State' : 'Expires'}</th></tr></thead><tbody>
      ${rows.map(o => {
        const exp = Date.parse(o.issued) + o.duration * 86400000;
        const filled = o.volume_total - o.volume_remain;
        return html`<tr><td>${icon(o.type_id)}${o.typeName}${hist ? html` <span class="badge">${o.is_buy_order ? 'Buy' : 'Sell'}</span>` : ''}</td>
          <td class="right num nowrap">${nf2.format(o.price)}</td>
          <td class="right num nowrap">${fmtNum(filled)} / ${fmtNum(o.volume_total)}
            <div class="bar" style="margin-top:4px"><i style="width:${(filled / o.volume_total * 100).toFixed(1)}%"></i></div></td>
          <td class="right num nowrap ${isBuy ? 'neg' : 'pos'}">${fmtCompact(o.price * o.volume_remain)}</td>
          <td class="muted">${o.locationName}</td>
          <td class="nowrap">${hist ? html`<span class="badge ${o.state === 'expired' ? 'gold' : o.state === 'cancelled' ? 'red' : 'green'}">${humanize(o.state)}</span> <span class="dim">${fmtDay(o.issued)}</span>` : (o.duration === 0 ? 'Immediate' : fmtDuration(exp - Date.now(), true))}</td></tr>`;
      })}</tbody></table>` : emptyBox('None');
    setContent(html`
      <div class="grid grid-4" style="margin-bottom:16px">
        ${stat('Order slots', `${d.open.length} / ${d.maxOrders}`, 'From Trade skills')}
        ${stat('Sell orders', sell.length, 'Worth ' + fmtIsk(sellVal))}
        ${stat('Buy orders', buy.length, 'Escrow ' + fmtIsk(escrow))}
        ${stat('History', d.history.length, 'Closed orders (last 90 days)')}
      </div>
      <div class="toolbar"><div class="seg"><button data-om="open" class="${mode === 'open' ? 'active' : ''}">Open orders</button><button data-om="hist" class="${mode === 'hist' ? 'active' : ''}">Order history</button></div></div>
      ${mode === 'open'
        ? html`<div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Selling</h3></div>${table(sell, false)}</div>
               <div class="panel" style="padding:0"><div style="padding:14px 18px 0"><h3>Buying</h3></div>${table(buy, true)}</div>`
        : html`<div class="panel" style="padding:0"><div class="table-wrap">${table(d.history, false, true)}</div></div>`}`);
    document.querySelectorAll('[data-om]').forEach(b => b.onclick = () => { mode = b.dataset.om; draw(); });
  };
  draw();
}

function viewLoyalty(list) {
  const total = list.reduce((n, l) => n + l.points, 0);
  setContent(html`
    <div class="grid grid-3" style="margin-bottom:16px">${stat('Corporations', list.length)}${stat('Total LP', fmtNum(total))}</div>
    <div class="panel" style="padding:0">${list.length ? html`<table><thead><tr><th>Corporation</th><th class="right">Loyalty points</th></tr></thead><tbody>
      ${list.map(l => html`<tr><td><img src="${IMG}/corporations/${l.corporationId}/logo?size=32" width="24" height="24" style="vertical-align:-7px;margin-right:8px" alt="">${l.corporation}</td><td class="right num">${fmtNum(l.points)}</td></tr>`)}</tbody></table>`
      : emptyBox('No loyalty points')}</div>`);
}

// ================= Comms =================

function viewNotifications(list) {
  let q = '';
  const draw = () => {
    const rows = list.filter(n => !q || n.typeLabel.toLowerCase().includes(q) || n.sender.toLowerCase().includes(q));
    content().querySelector('#n-body').innerHTML = String(rows.length ? html`<table><thead><tr><th>Received</th><th>Type</th><th>From</th><th></th></tr></thead><tbody>
      ${rows.map(n => html`<tr class="clickable" data-nid="${n.id}"><td class="nowrap">${fmtDate(n.timestamp)}</td>
        <td>${n.isRead ? '' : raw('<span class="badge accent">new</span> ')}${n.typeLabel}</td><td>${n.sender}</td><td class="dim right">details ▸</td></tr>`)}</tbody></table>` : emptyBox('No notifications'));
    document.querySelectorAll('[data-nid]').forEach(tr => tr.onclick = () => {
      const next = tr.nextElementSibling;
      if (next && next.classList.contains('nd')) { next.remove(); return; }
      const n = list.find(x => x.id === Number(tr.dataset.nid));
      const row = document.createElement('tr');
      row.className = 'nd';
      row.innerHTML = '<td colspan="4"><div class="pre"></div></td>';
      row.querySelector('.pre').textContent = n.text || '(no details)';
      tr.after(row);
    });
  };
  const unread = list.filter(n => !n.isRead).length;
  setContent(html`<div class="grid grid-3" style="margin-bottom:16px">${stat('Notifications', list.length, 'Most recent from ESI')}${stat('Unread', unread)}</div>
    <div class="toolbar"><input type="search" id="n-q" placeholder="Filter by type or sender…"></div>
    <div class="panel" style="padding:0"><div class="table-wrap" id="n-body"></div></div>`);
  draw();
  $('#n-q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
}

function viewCalendar(list) {
  const now = Date.now();
  const upcoming = list.filter(e => Date.parse(e.date) >= now - 3600000);
  setContent(html`<div class="panel" style="padding:0">${upcoming.length ? html`<table><thead><tr><th>When</th><th>Event</th><th>Owner</th><th>Duration</th><th>Response</th><th class="right">Starts in</th></tr></thead><tbody>
    ${upcoming.map(e => html`<tr><td class="nowrap">${fmtDate(e.date)}</td>
      <td>${e.importance ? raw('<span class="badge gold">important</span> ') : ''}${e.title}${e.text ? html`<div class="dim" style="max-width:520px">${String(e.text).replace(/<[^>]+>/g, ' ').slice(0, 200)}</div>` : ''}</td>
      <td>${e.owner || ''}</td><td>${e.duration ? e.duration + ' min' : ''}</td><td>${humanize(e.response)}</td>
      <td class="right num nowrap" data-countdown="${e.date}">${fmtDuration(Date.parse(e.date) - now)}</td></tr>`)}</tbody></table>`
    : emptyBox('No upcoming calendar events')}</div>`);
}

// ================= Character =================

function fmtTenure(ms) {
  const days = Math.floor(ms / 86400000);
  const y = Math.floor(days / 365.25), m = Math.floor((days - y * 365.25) / 30.44);
  return y ? `${y}y ${m}m` : m ? `${m}m ${Math.floor(days - m * 30.44)}d` : `${days}d`;
}

function viewCorp(d) {
  const c = d.corporation;
  setContent(html`
    <div class="profile"><img src="${IMG}/corporations/${d.corporationId}/logo?size=128" alt="" style="width:80px;height:80px">
      <div><h1>${c.name}${c.ticker ? html` <span class="muted" style="font-size:18px">[${c.ticker}]</span>` : ''}</h1>
      <div class="corp">${d.alliance ? html`${d.alliance.name} <span class="dim">&lt;${d.alliance.ticker}&gt;</span>` : 'No alliance'}</div>
      <div class="tags"><a href="#" class="badge" data-link="https://zkillboard.com/corporation/${d.corporationId}/">zKillboard ↗</a>
        <a href="#" class="badge" data-link="https://evewho.com/corporation/${d.corporationId}">EveWho ↗</a></div></div></div>
    <div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Members', c.members !== undefined ? fmtNum(c.members) : '—')}
      ${stat('Tax rate', c.taxRate !== undefined ? (c.taxRate * 100).toFixed(1) + '%' : '—')}
      ${stat('CEO', c.ceo || '—')}
      ${stat('Founded', c.founded ? fmtDay(c.founded) : '—', c.war ? 'War eligible' : '')}
    </div>
    <div class="grid grid-2">
      <div class="panel"><h3>Your roles & titles</h3>
        ${d.roles ? (d.roles.length ? html`<div class="scopes">${d.roles.map(r => html`<span class="badge">${humanize(r)}</span>`)}</div>` : html`<div class="muted">No corporation roles</div>`) : html`<div class="muted">Unavailable</div>`}
        ${d.titles && d.titles.length ? html`<div style="margin-top:12px" class="muted">Titles: ${d.titles.join(', ')}</div>` : ''}
        ${c.home ? html`<div style="margin-top:12px" class="muted">Corp HQ: ${c.home}</div>` : ''}
      </div>
      <div class="panel"><h3>Faction warfare</h3>
        ${d.fw ? html`<div class="kv"><span class="k">Militia</span><span>${d.fw.faction}</span>
          <span class="k">Enlisted</span><span>${fmtDay(d.fw.enlisted)}</span>
          <span class="k">Rank</span><span>${d.fw.rank} (highest ${d.fw.highestRank})</span>
          <span class="k">Kills</span><span class="num">${fmtNum(d.fw.kills.yesterday)} yesterday · ${fmtNum(d.fw.kills.last_week)} week · ${fmtNum(d.fw.kills.total)} total</span>
          <span class="k">Victory points</span><span class="num">${fmtNum(d.fw.victoryPoints.yesterday)} · ${fmtNum(d.fw.victoryPoints.last_week)} · ${fmtNum(d.fw.victoryPoints.total)}</span></div>`
          : html`<div class="muted">Not enlisted in faction warfare</div>`}
      </div>
    </div>
    <div class="panel"><h3>Employment history</h3>
      <table><tbody>${d.history.map(h => html`<tr>
        <td style="width:40px"><img src="${IMG}/corporations/${h.corporationId}/logo?size=32" width="28" height="28" alt=""></td>
        <td>${h.corporation}${h.deleted ? raw(' <span class="badge red">closed</span>') : ''}</td>
        <td class="nowrap">${fmtDay(h.start)} – ${h.end ? fmtDay(h.end) : 'present'}</td>
        <td class="right muted nowrap">${fmtTenure((h.end ? Date.parse(h.end) : Date.now()) - Date.parse(h.start))}</td></tr>`)}</tbody></table>
    </div>`);
}

function viewStandings(list) {
  let type = 'all';
  const draw = () => {
    const rows = list.filter(s => type === 'all' || s.type === type);
    setContent(html`<div class="toolbar"><div class="seg">
      ${[['all', 'All'], ['faction', 'Factions'], ['npc_corp', 'Corporations'], ['agent', 'Agents']].map(([k, l]) => html`<button data-st="${k}" class="${type === k ? 'active' : ''}">${l} (${k === 'all' ? list.length : list.filter(s => s.type === k).length})</button>`)}</div></div>
      <div class="panel" style="padding:0"><div class="table-wrap">${rows.length ? html`<table><thead><tr><th>Entity</th><th>Type</th><th class="right">Standing</th></tr></thead><tbody>
        ${rows.map(s => html`<tr><td>${s.name}</td><td class="muted">${humanize(s.type.replace('npc_corp', 'corporation'))}</td><td class="right">${standingSpan(s.standing)}</td></tr>`)}</tbody></table>` : emptyBox('No standings')}</div></div>`);
    document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { type = b.dataset.st; draw(); });
  };
  draw();
}

function viewContacts(list) {
  const portraitFor = c => c.type === 'character' ? portrait(c.id, 32) : c.type === 'corporation' ? `${IMG}/corporations/${c.id}/logo?size=32` : c.type === 'alliance' ? `${IMG}/alliances/${c.id}/logo?size=32` : '';
  setContent(html`<div class="grid grid-3" style="margin-bottom:16px">${stat('Contacts', list.length)}${stat('Watched', list.filter(c => c.watched).length)}${stat('Blocked', list.filter(c => c.blocked).length)}</div>
    <div class="panel" style="padding:0"><div class="table-wrap">${list.length ? html`<table><thead><tr><th>Name</th><th>Type</th><th>Labels</th><th class="right">Standing</th></tr></thead><tbody>
      ${list.map(c => html`<tr><td>${portraitFor(c) ? html`<img src="${portraitFor(c)}" width="24" height="24" style="vertical-align:-7px;margin-right:8px;border-radius:3px" alt="">` : ''}${c.name}
        ${c.watched ? raw(' <span class="badge accent">watched</span>') : ''}${c.blocked ? raw(' <span class="badge red">blocked</span>') : ''}</td>
        <td class="muted">${humanize(c.type)}</td><td class="muted">${c.labels.join(', ')}</td><td class="right">${standingSpan(c.standing)}</td></tr>`)}</tbody></table>` : emptyBox('No contacts')}</div></div>`);
}

function viewMedals(list) {
  setContent(list.length ? html`<div class="grid grid-2">${list.map(m => html`<div class="panel"><h3>${m.title}</h3>
    <div class="muted">${m.corporation} · ${fmtDay(m.date)} · issued by ${m.issuer}</div>
    ${m.description ? html`<p>${m.description}</p>` : ''}${m.reason ? html`<p class="gold">“${m.reason}”</p>` : ''}
    <span class="badge">${humanize(m.status)}</span></div>`)}</div>` : emptyBox('No medals awarded'));
}

// ================= Combat & fittings =================

function viewKills(d) {
  setContent(html`<div class="grid grid-3" style="margin-bottom:16px">
      ${stat('Kills', d.kills, 'Recent (ESI returns last 90 days)', 'pos')}${stat('Losses', d.losses, '', d.losses ? 'neg' : '')}
      ${stat('Efficiency', d.kills + d.losses ? Math.round(d.kills / (d.kills + d.losses) * 100) + '%' : '—', 'By count')}</div>
    <div class="panel" style="padding:0"><div class="table-wrap">${d.list.length ? html`<table><thead><tr><th>Time</th><th></th><th>Victim</th><th>Ship</th><th>System</th><th>Final blow</th><th class="right">Pilots</th><th></th></tr></thead><tbody>
      ${d.list.map(k => html`<tr><td class="nowrap">${fmtDate(k.time)}</td>
        <td><span class="badge ${k.loss ? 'red' : 'green'}">${k.loss ? 'Loss' : 'Kill'}</span></td>
        <td>${k.victim}<div class="dim">${k.victimCorp || ''}</div></td>
        <td>${icon(k.shipTypeId)}${k.ship}</td><td>${k.system}</td>
        <td>${k.finalBlow}${k.finalBlowShip ? html`<div class="dim">${k.finalBlowShip}</div>` : ''}</td>
        <td class="right num">${k.attackers}${k.solo ? raw(' <span class="badge">solo</span>') : ''}</td>
        <td><a href="#" data-link="https://zkillboard.com/kill/${k.id}/">zKill ↗</a></td></tr>`)}</tbody></table>` : emptyBox('No recent killmails')}</div></div>`);
}

function viewFittings(list) {
  setContent(html`<div class="toolbar"><input type="search" id="fit-q" placeholder="Search fittings or ships…"><span class="muted">${list.length} saved fittings</span></div>
    <div class="grid grid-2" id="fit-grid">${list.map(f => html`<div class="panel" data-fit="${(f.name + ' ' + f.ship).toLowerCase()}">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">
        <img src="${typeRender(f.shipTypeId, 64)}" width="52" height="52" style="border-radius:5px;background:var(--bg-2)" alt="">
        <div><div style="font-size:15px">${f.name}</div><div class="muted">${f.ship}</div></div></div>
      ${f.description ? html`<div class="dim" style="margin-bottom:8px">${f.description}</div>` : ''}
      ${f.groups.map(g => html`<div class="fit-group"><div class="k">${g.label}</div>
        ${g.items.map(i => html`<div style="font-size:12.5px">${icon(i.typeId, 16)}${i.name}${i.quantity > 1 ? html` <span class="dim">×${fmtNum(i.quantity)}</span>` : ''}</div>`)}</div>`)}
    </div>`)}</div>`);
  if (!list.length) setContent(emptyBox('No saved fittings'));
  const q = $('#fit-q');
  if (q) q.oninput = e => { const v = e.target.value.trim().toLowerCase(); document.querySelectorAll('[data-fit]').forEach(p => { p.style.display = !v || p.dataset.fit.includes(v) ? '' : 'none'; }); };
}

// ================= All-pilot boards =================

async function eachPilot(loader) {
  const pilots = state.characters.filter(c => !c.needsReauth);
  return Promise.all(pilots.map(async c => ({ c, r: await loader(c.id) })));
}

async function renderTrainingAll(stillCurrent) {
  if (!state.characters.length) return setContent(emptyBox('Add a pilot first'));
  setContent(loadingView('Loading skill queues…'));
  const res = await eachPilot(id => api.training(id));
  if (!stillCurrent()) return;
  const now = Date.now();
  const okRes = res.filter(x => x.r.ok);
  const ends = okRes.map(x => x.r.data.queueEnd).filter(Boolean).map(Date.parse);
  const from = now - 3600000;
  const to = Math.min(Math.max(now + 2 * 86400000, ...ends), now + 120 * 86400000);
  const idle = okRes.filter(x => !x.r.data.queueEnd);
  const short = okRes.filter(x => x.r.data.queueEnd && Date.parse(x.r.data.queueEnd) - now < 86400000);
  const totalRate = okRes.reduce((n, x) => n + (x.r.data.spPerHour || 0), 0);
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Pilots training', okRes.length - idle.length + ' / ' + okRes.length, '', idle.length ? 'gold' : '')}
      ${stat('Queues under 24h', short.length, short.map(x => x.c.name).join(', '), short.length ? 'gold' : '')}
      ${stat('Combined SP/hour', fmtNum(totalRate), fmtNum(totalRate * 24) + ' SP per day')}
      ${stat('Combined SP', fmtNum(okRes.reduce((n, x) => n + x.r.data.totalSp, 0)))}
    </div>
    <div class="panel"><h3>All skill queues</h3>
      ${timeline(okRes.map(({ c, r }) => ({
        label: c.name, img: portrait(c.id, 32),
        segs: r.data.queue.filter(e => e.finish && !e.complete).map(e => ({
          start: Math.max(Date.parse(e.start), from), end: Date.parse(e.finish),
          label: `${e.name} ${ROMAN[e.level]}`, title: `${c.name}: ${e.name} ${ROMAN[e.level]} · ${fmtDate(e.finish)}`
        }))
      })), { from, to })}
    </div>
    <div class="panel" style="padding:0"><table><thead><tr><th>Pilot</th><th>Training now</th><th class="right">SP/hour</th><th class="right">Skill finishes</th><th class="right">Queue ends</th><th class="right">Skills queued</th></tr></thead><tbody>
      ${res.map(({ c, r }) => {
        if (!r.ok) return html`<tr><td>${c.name}</td><td colspan="5" class="neg">${r.error}</td></tr>`;
        const d = r.data; const cur = d.queue.find(e => e.finish && !e.complete);
        const qEnd = d.queueEnd ? Date.parse(d.queueEnd) : null;
        return html`<tr class="clickable" data-open="${c.id}"><td><img src="${portrait(c.id, 32)}" width="24" height="24" style="vertical-align:-7px;margin-right:8px;border-radius:3px" alt="">${c.name}</td>
          <td>${cur ? `${cur.name} ${ROMAN[cur.level]}` : raw(`<span class="gold">${d.paused ? 'Paused' : 'Not training'}</span>`)}</td>
          <td class="right num">${d.spPerHour ? fmtNum(d.spPerHour) : '—'}</td>
          <td class="right num nowrap" ${raw(cur ? `data-countdown="${esc(cur.finish)}"` : '')}>${cur ? fmtDuration(Date.parse(cur.finish) - now) : '—'}</td>
          <td class="right num nowrap ${qEnd && qEnd - now < 86400000 ? 'gold' : ''}" ${raw(qEnd ? `data-countdown="${esc(d.queueEnd)}"` : '')}>${qEnd ? fmtDuration(qEnd - now) : '—'}</td>
          <td class="right num">${d.queue.filter(e => !e.complete).length}</td></tr>`;
      })}</tbody></table></div>`);
}

async function renderIndustryAll(stillCurrent) {
  if (!state.characters.length) return setContent(emptyBox('Add a pilot first'));
  setContent(loadingView('Loading industry jobs for all pilots…'));
  const res = await eachPilot(id => api.industryFull(id));
  if (!stillCurrent()) return;
  const now = Date.now();
  const okRes = res.filter(x => x.r.ok);
  const jobs = okRes.flatMap(({ c, r }) => r.data.jobs.filter(j => !j.corp).map(j => ({ ...j, pilot: c.name })));
  const current = jobs.filter(j => ['active', 'paused', 'ready'].includes(j.status))
    .sort((a, b) => (a.status === 'ready' ? -1 : 0) - (b.status === 'ready' ? -1 : 0) || a.end.localeCompare(b.end));
  const sum = k => okRes.reduce((acc, { r }) => ({ used: acc.used + r.data.slots[k].used, max: acc.max + r.data.slots[k].max }), { used: 0, max: 0 });
  const m = sum('manufacturing'), sc = sum('science'), re = sum('reaction');
  const ready = current.filter(j => j.status === 'ready').length;
  const running = current.filter(j => j.status === 'active' && Date.parse(j.end) > now);
  const from = now - 3600000;
  const to = running.length ? Math.max(...running.map(j => Date.parse(j.end))) : now + 86400000;
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Manufacturing', `${m.used} / ${m.max}`, `${m.max - m.used} slots free`)}
      ${stat('Science', `${sc.used} / ${sc.max}`, `${sc.max - sc.used} slots free`)}
      ${stat('Reactions', `${re.used} / ${re.max}`, `${re.max - re.used} slots free`)}
      ${stat('Ready to deliver', ready, ready ? 'Log in and deliver' : 'Nothing waiting', ready ? 'gold' : '')}
    </div>
    <div class="panel"><h3>Slots by pilot</h3><table><thead><tr><th>Pilot</th><th>Manufacturing</th><th>Science</th><th>Reactions</th><th class="right">Next job finishes</th></tr></thead><tbody>
      ${res.map(({ c, r }) => {
        if (!r.ok) return html`<tr><td>${c.name}</td><td colspan="4" class="neg">${r.error}</td></tr>`;
        const s = r.data.slots;
        const mine = r.data.jobs.filter(j => !j.corp);
        const next = mine.filter(j => j.status === 'active' && Date.parse(j.end) > now).sort((a, b) => a.end.localeCompare(b.end))[0];
        const cell = (k) => html`${s[k].used}/${s[k].max}${slotBoxes(s[k].used, s[k].max, mine.filter(j => j.slot === k && j.status === 'ready').length)}`;
        return html`<tr class="clickable" data-open="${c.id}"><td><img src="${portrait(c.id, 32)}" width="24" height="24" style="vertical-align:-7px;margin-right:8px;border-radius:3px" alt="">${c.name}</td>
          <td>${cell('manufacturing')}</td><td>${cell('science')}</td><td>${cell('reaction')}</td>
          <td class="right num nowrap" ${raw(next ? `data-countdown="${esc(next.end)}"` : '')}>${next ? fmtDuration(Date.parse(next.end) - now) : '—'}</td></tr>`;
      })}</tbody></table></div>
    ${running.length ? html`<div class="panel"><h3>Running jobs</h3>${timeline(running.map(j => ({
      label: `${j.pilot}: ${j.product || j.blueprint}`, img: typeIcon(j.blueprintTypeId),
      segs: [{ start: Math.max(Date.parse(j.start), from), end: Date.parse(j.end), cls: 'ind-' + j.slot, label: `${j.activity} · ${j.runs}×`, title: `${j.blueprint} → ${fmtDate(j.end)}` }]
    })), { from, to })}</div>` : ''}
    <div class="panel" style="padding:0"><div class="table-wrap">${jobsTable(current, { showPilot: true })}</div></div>`);
}

async function renderPlanetsAll(stillCurrent) {
  if (!state.characters.length) return setContent(emptyBox('Add a pilot first'));
  setContent(loadingView('Loading planetary colonies for all pilots…'));
  const res = await eachPilot(id => api.planets(id));
  if (!stillCurrent()) return;
  const now = Date.now();
  const okRes = res.filter(x => x.r.ok);
  const all = okRes.flatMap(({ c, r }) => r.data.planets.map(p => ({ ...p, pilot: c.name, pilotId: c.id })));
  const ex = all.flatMap(p => p.extractors.map(e => ({ ...e, planet: p.name, pilot: p.pilot })));
  const stopped = ex.filter(e => e.expired);
  const soon = ex.filter(e => !e.expired && Date.parse(e.expiry) - now < 86400000);
  const ends = ex.filter(e => e.expiry && !e.expired).map(e => Date.parse(e.expiry));
  const from = now - 3600000;
  const to = ends.length ? Math.max(...ends) : now + 86400000;
  setContent(html`
    <div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Colonies', `${all.length} / ${okRes.reduce((n, x) => n + x.r.data.maxPlanets, 0)}`)}
      ${stat('Extractors', ex.length)}
      ${stat('Stopped', stopped.length, stopped.map(e => e.planet).slice(0, 3).join(', '), stopped.length ? 'neg' : '')}
      ${stat('Stopping within 24h', soon.length, '', soon.length ? 'gold' : '')}
    </div>
    ${ex.length ? html`<div class="panel"><h3>Extractor run times</h3>${timeline(all.filter(p => p.extractors.length).map(p => ({
      label: `${p.pilot}: ${p.name}`,
      segs: p.extractors.filter(e => e.expiry && !e.expired).map(e => ({
        start: Math.max(e.installed ? Date.parse(e.installed) : from, from), end: Date.parse(e.expiry),
        cls: Date.parse(e.expiry) - now < 86400000 ? 'ind-reaction' : '', label: e.product, title: `${e.product} → ${fmtDate(e.expiry)}`
      }))
    })), { from, to })}</div>` : ''}
    ${all.length ? all.map(p => planetCard(p, p.pilot)) : emptyBox('No planetary colonies on any pilot')}`);
}
