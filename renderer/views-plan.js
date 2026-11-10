'use strict';
/* Skill planner + Can I fly. Also provides the shared item search box. */

// ---------- Shared: item search with dropdown ----------

function attachSearch(input, { categories = null, category = null, onPick, placeholder }) {
  if (placeholder) input.placeholder = placeholder;
  const wrap = document.createElement('div');
  wrap.className = 'srch-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const list = document.createElement('div');
  list.className = 'srch-list';
  list.hidden = true;
  wrap.appendChild(list);
  let timer, items = [], idx = -1;
  const show = () => {
    list.innerHTML = items.map((it, i) => `<div class="srch-item ${i === idx ? 'on' : ''}" data-i="${i}"><img src="${IMG}/types/${it.id}/icon?size=32" width="20" height="20" alt=""><span>${esc(it.name)}</span><span class="dim">${esc(it.group)}</span></div>`).join('') || '<div class="srch-item dim">No matches</div>';
    list.hidden = false;
    list.querySelectorAll('[data-i]').forEach(el => el.onmousedown = e => { e.preventDefault(); pick(items[+el.dataset.i]); });
  };
  const pick = it => { if (!it) return; list.hidden = true; input.value = ''; onPick(it); };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { list.hidden = true; return; }
    timer = setTimeout(async () => {
      const r = await api.sde.search(q, { categories, category, limit: 25 });
      if (!r.ok) { list.innerHTML = `<div class="srch-item neg">${esc(r.error)}</div>`; list.hidden = false; return; }
      items = r.data; idx = items.length ? 0 : -1; show();
    }, 180);
  });
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); show(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); show(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(items[idx]); e.preventDefault(); }
    else if (e.key === 'Escape') list.hidden = true;
  });
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
}

const fmtMinutes = m => fmtDuration(m * 60000, true);
const finishFrom = m => new Date(Date.now() + m * 60000);

// ---------- Planner view ----------

const planState = { planId: null, computed: null, remap: null };

async function viewPlanner(plans, c) {
  const info = await api.sde.info();
  if (!info.ok || !info.data.ready) return setContent(needSdeView('The skill planner'));
  if (!plans.length) {
    const r = await api.plan.save({ charId: c.id, name: 'Main plan', entries: [] });
    if (r.ok) plans = [r.data];
  }
  if (!planState.planId || !plans.some(p => p.id === planState.planId)) planState.planId = plans[0].id;
  const plan = plans.find(p => p.id === planState.planId);
  const cr = await api.plan.compute(plan);
  if (!cr.ok) return setContent(errorView(cr));
  const d = cr.data;
  planState.computed = d;
  const todo = d.rows.filter(r => !r.trained);
  setContent(html`
    <div class="toolbar">
      <select id="pl-pick" class="crumb-select">${plans.map(p => html`<option value="${p.id}" ${raw(p.id === plan.id ? 'selected' : '')}>${p.name} (${p.entries.length})</option>`)}</select>
      <button class="btn btn-ghost" id="pl-new">+ Plan</button><button class="btn btn-ghost" id="pl-rename">Rename</button>
      <span class="wh-sep"></span>
      <button class="btn btn-ghost" id="pl-import">Import text</button><button class="btn btn-ghost" id="pl-export" title="Copies 'Skill Name Level' lines you can paste into EVE's skill queue or another planner">Copy for EVE</button>
      <button class="btn btn-ghost" id="pl-remap">Optimise remap</button>${d.rows.some(r => r.trained) ? html`<button class="btn btn-ghost" id="pl-clean" title="Take skills this pilot has already trained out of the plan">Remove trained</button>` : ''}
      <span style="flex:1"></span><button class="btn btn-danger" id="pl-del">Delete plan</button>
    </div>
    <div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Training time', todo.length ? fmtMinutes(d.totalMinutes) : 'Done', todo.length ? 'Finishes ' + fmtDate(finishFrom(d.totalMinutes)) : 'Everything trained')}
      ${stat('Skill points', fmtNum(d.totalSp), `${todo.length} levels to train`)}
      ${stat('Training rate', d.factor !== 1 ? `×${d.factor.toFixed(2)}` : 'Base attributes', d.factor !== 1 ? 'Calibrated to your live queue (implants and boosters)' : 'Start training to calibrate implants')}
      ${stat('Remaps', d.bonusRemaps + ' bonus', d.nextRemap ? 'Yearly remap ' + fmtDay(d.nextRemap) : 'Yearly remap available')}
    </div>
    <div class="grid grid-2" style="margin-bottom:16px">
      <div class="panel"><h3>Add to plan</h3>
        <input type="search" id="pl-add" style="width:100%">
        <div class="dim" style="margin-top:6px;font-size:12px">Search a skill to add a level, or any ship, module or item to add everything needed to use it. Prerequisites are added automatically.</div>
        <div id="pl-levelpick"></div></div>
      <div class="panel" id="pl-remapbox"><h3>Remap</h3><div class="muted">Click <b>Optimise remap</b> to find the attribute spread that trains this plan fastest.</div></div>
    </div>
    <div class="panel" style="padding:0">${d.rows.length ? html`<table class="plan-table"><thead><tr><th style="width:34px">#</th><th>Skill</th><th>Attributes</th><th class="right">SP</th><th class="right">Time</th><th class="right">Done by</th><th>Status</th><th></th></tr></thead><tbody>
      ${d.rows.map(r => html`<tr class="${r.trained ? 'done' : ''}" draggable="true" data-row="${r.index}">
        <td class="dim">${r.index + 1}</td>
        <td><b>${r.name}</b> ${ROMAN[r.level]} ${levelBoxes(r.level - 1, r.level)}<div class="dim">${r.group || ''} · rank ${r.rank}</div></td>
        <td class="muted" style="font-size:12px">${humanize(r.primary)} / ${humanize(r.secondary)}</td>
        <td class="right num">${r.trained ? '—' : fmtNum(r.sp)}</td><td class="right num">${r.trained ? '—' : fmtMinutes(r.minutes)}</td>
        <td class="right nowrap dim">${r.trained ? '' : fmtDate(finishFrom(r.cumulative))}</td>
        <td>${r.trained ? raw('<span class="badge green">Trained</span>') : r.queued ? raw('<span class="badge accent">In queue</span>') : !r.prereqOk ? raw('<span class="badge red" title="A prerequisite is later in the plan">Order!</span>') : ''}</td>
        <td class="right nowrap"><button class="btn btn-ghost pl-mini" data-up="${r.index}" title="Move up">↑</button><button class="btn btn-ghost pl-mini" data-down="${r.index}" title="Move down">↓</button><button class="btn btn-ghost pl-mini" data-rm="${r.index}" title="Remove">✕</button></td></tr>`)}</tbody></table>`
      : emptyBox('Empty plan. Search above to add skills or a ship.')}</div>
    <div class="panel" style="margin-top:16px"><h3>Can I fly…?</h3>
      <input type="search" id="cf-search" style="width:100%;max-width:520px">
      <div id="cf-out" style="margin-top:12px"></div></div>`);
  bindPlanner(plan, c);
}

function bindPlanner(plan, c) {
  const reload = () => render();
  const save = async p => { const r = await api.plan.save(p); if (!r.ok) toast(r.error, true); return r.ok; };
  const cl = $('#pl-clean'); if (cl) cl.onclick = async () => {
    const done = new Set((planState.computed ? planState.computed.rows : []).filter(r => r.trained).map(r => r.skillId + ':' + r.level));
    const before = plan.entries.length; plan.entries = plan.entries.filter(e => !done.has(e.skillId + ':' + e.level));
    if (await save(plan)) { toast(`Removed ${before - plan.entries.length} trained level${before - plan.entries.length === 1 ? '' : 's'}`); reload(); }
  };
  $('#pl-pick').onchange = e => { planState.planId = e.target.value; planState.remap = null; reload(); };
  $('#pl-new').onclick = () => openModal('New skill plan', field('Name', inputText('name', '', 'e.g. Ishtar ready')), { submit: 'Create', onSubmit: async d => {
    const r = await api.plan.save({ charId: c.id, name: d.name || 'Plan', entries: [] }); if (r.ok) { planState.planId = r.data.id; reload(); } } });
  $('#pl-rename').onclick = () => openModal('Rename plan', field('Name', inputText('name', plan.name)), { onSubmit: async d => { plan.name = d.name || plan.name; await save(plan); reload(); } });
  $('#pl-del').onclick = async () => { const b = $('#pl-del'); if (b.dataset.c !== '1') { b.dataset.c = '1'; b.textContent = 'Click again to delete'; return; } await api.plan.remove(plan.id); planState.planId = null; reload(); };
  $('#pl-import').onclick = () => openModal('Import skills from text', html`${field('One skill per line', textarea('text', '', 10), 'Format: "Skill Name 4" or "Skill Name IV". Works with EVEMon, in-game copies and most planners.')}`, {
    submit: 'Import', onSubmit: async d => { const r = await api.plan.importText(plan, d.text); if (!r.ok) throw new Error(r.error); toast(r.data.unknown.length ? `Imported. Not recognised: ${r.data.unknown.slice(0, 3).join(', ')}${r.data.unknown.length > 3 ? '…' : ''}` : 'Imported', !!r.data.unknown.length); reload(); }
  });
  $('#pl-export').onclick = async () => { const r = await api.plan.exportText(plan); toast(r.ok ? `Copied ${plan.entries.length} lines to the clipboard` : r.error, !r.ok); };
  $('#pl-remap').onclick = async () => {
    const box = $('#pl-remapbox'); box.innerHTML = String(html`<h3>Remap</h3>${loadingView('Trying every attribute spread…')}`);
    const r = await api.plan.remap(plan);
    if (!r.ok) { box.innerHTML = String(errorView(r)); return; }
    if (!r.data) { box.innerHTML = '<h3>Remap</h3><div class="muted">Nothing left to train.</div>'; return; }
    const { current, best, savedMinutes } = r.data;
    const keys = ['intelligence', 'memory', 'perception', 'willpower', 'charisma'];
    box.innerHTML = String(html`<h3>Optimal remap</h3>
      <table><thead><tr><th>Attribute</th><th class="right">Now</th><th class="right">Best</th></tr></thead><tbody>${keys.map(k => html`<tr><td>${humanize(k)}</td><td class="right num">${current.attributes[k]}</td><td class="right num ${best.attributes[k] > 17 ? 'pos' : 'dim'}">${best.attributes[k]}</td></tr>`)}</tbody></table>
      <div style="margin-top:10px">${savedMinutes > 60 ? html`Saves <b class="pos">${fmtMinutes(savedMinutes)}</b> (${fmtMinutes(current.minutes)} → ${fmtMinutes(best.minutes)})` : 'Your current attributes are already close to optimal for this plan.'}</div>
      <div class="dim" style="font-size:12px;margin-top:6px">Base remap values (17 + up to 10 each, 14 points total). Implants add on top.</div>`);
  };
  attachSearch($('#pl-add'), { placeholder: 'Search skills, ships, modules…', onPick: it => {
    if (it.categoryId === 16) {
      $('#pl-levelpick').innerHTML = String(html`<div class="toolbar" style="margin:10px 0 0"><span><b>${it.name}</b> to level</span>${[1, 2, 3, 4, 5].map(l => html`<button class="btn btn-ghost" data-lvl="${l}">${ROMAN[l]}</button>`)}</div>`);
      document.querySelectorAll('[data-lvl]').forEach(b => b.onclick = async () => { const r = await api.plan.addSkill(plan, it.id, Number(b.dataset.lvl)); if (!r.ok) return toast(r.error, true); toast(`Added ${it.name} ${ROMAN[b.dataset.lvl]} and prerequisites`); reload(); });
    } else {
      api.plan.addType(plan, it.id).then(r => { if (!r.ok) return toast(r.error, true); toast(`Added everything needed for ${it.name}`); reload(); });
    }
  } });
  attachSearch($('#cf-search'), { placeholder: 'Any ship, module, implant…', onPick: it => showCanFly(it, plan) });
  const move = async (i, j) => { if (j < 0 || j >= plan.entries.length) return; const [e] = plan.entries.splice(i, 1); plan.entries.splice(j, 0, e); await save(plan); reload(); };
  document.querySelectorAll('[data-up]').forEach(b => b.onclick = () => move(+b.dataset.up, +b.dataset.up - 1));
  document.querySelectorAll('[data-down]').forEach(b => b.onclick = () => move(+b.dataset.down, +b.dataset.down + 1));
  document.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { plan.entries.splice(+b.dataset.rm, 1); await save(plan); reload(); });
  // drag to reorder
  let dragFrom = null;
  document.querySelectorAll('.plan-table tr[data-row]').forEach(tr => {
    tr.addEventListener('dragstart', () => { dragFrom = +tr.dataset.row; tr.classList.add('dragging'); });
    tr.addEventListener('dragend', () => tr.classList.remove('dragging'));
    tr.addEventListener('dragover', e => e.preventDefault());
    tr.addEventListener('drop', e => { e.preventDefault(); if (dragFrom !== null) move(dragFrom, +tr.dataset.row); });
  });
}

async function showCanFly(it, plan) {
  const out = $('#cf-out');
  out.innerHTML = String(loadingView(`Checking ${it.name}…`));
  const r = await api.canFly(it.id);
  if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
  const d = r.data;
  out.innerHTML = String(html`
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:12px"><img src="${IMG}/types/${it.id}/${d.type && d.type.categoryId === 6 ? 'render' : 'icon'}?size=64" width="56" height="56" style="border-radius:6px;background:var(--bg-2)" alt="">
      <div><div style="font-size:16px">${it.name}</div><div class="muted">${d.requirements.length} skill requirements incl. prerequisites</div></div>
      ${plan ? html`<button class="btn btn-ghost" id="cf-add" style="margin-left:auto">Add to this plan</button>` : ''}</div>
    <table><thead><tr><th>Pilot</th><th>Status</th><th>Missing</th><th class="right">Time to fly</th></tr></thead><tbody>
      ${d.pilots.map(p => p.error ? html`<tr><td>${p.id}</td><td colspan="3" class="neg">${p.error}</td></tr>` : html`<tr><td>${charImg(p.id, 20)}${p.name}${p.fromAudit ? raw(' <span class="badge">audit</span>') : ''}</td>
        <td>${p.canFly ? raw('<span class="badge green">Can use</span>') : raw('<span class="badge red">Missing skills</span>')}</td>
        <td class="muted" style="font-size:12px">${p.missing.slice(0, 5).map(m => `${m.name} ${ROMAN[m.level]} (has ${ROMAN[m.have] || '0'})`).join(', ')}${p.missing.length > 5 ? ` +${p.missing.length - 5} more` : ''}</td>
        <td class="right num">${p.canFly ? '—' : fmtMinutes(p.minutes)}</td></tr>`)}</tbody></table>
    ${d.requirements.length ? html`<details style="margin-top:10px"><summary class="muted" style="cursor:pointer">All requirements</summary><div class="pi-chips" style="margin-top:8px">${d.requirements.map(q => html`<span class="badge">${q.name} ${ROMAN[q.level]}</span>`)}</div></details>` : ''}`);
  const add = $('#cf-add');
  if (add) add.onclick = async () => { const res = await api.plan.addType(plan, it.id); if (!res.ok) return toast(res.error, true); toast(`Added requirements for ${it.name}`); render(); };
}
