'use strict';
/* Help & guides: searchable walkthroughs for every tool, with screenshots, and a ? button for the page you're on. */
const helpState = { id: 'start', q: '' };

const helpFmt = t => raw(esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>'));

/** Which help topic fits the page you're on. */
function helpForPage() {
  const keys = [];
  if (state.view === 'tools') keys.push(state.toolsTab || 't-market');
  if (state.view === 'corp') keys.push(state.corpTab || 'c-overview');
  if (state.view === 'char') keys.push('char:' + (state.tab || 'summary'));
  keys.push('view:' + state.view);
  for (const k of keys) { const t = HELP.find(h => (h.ctx || []).includes(k)); if (t) return t.id; }
  return 'tour';
}
function openHelp(id) { helpState.id = id || helpForPage(); go('help'); }

function renderHelp() {
  const q = helpState.q.trim().toLowerCase();
  const match = h => !q || [h.title, h.where, h.summary, ...(h.steps || []), ...(h.tips || [])].join(' ').toLowerCase().includes(q);
  const groups = [...new Set(HELP.map(h => h.group))];
  const t = HELP.find(h => h.id === helpState.id) || HELP[0];
  const i = HELP.indexOf(t), prev = HELP[i - 1], next = HELP[i + 1];
  setContent(html`<div class="help-layout">
    <aside class="help-nav panel"><input type="text" id="hp-q" placeholder="Search help" value="${helpState.q}" style="width:100%;margin-bottom:10px">
      ${groups.map(g => { const list = HELP.filter(h => h.group === g && match(h)); return list.length ? html`<div class="help-g">${g}</div>${list.map(h => html`<button class="help-link ${h.id === t.id ? 'on' : ''}" data-hp="${h.id}">${h.title}</button>`)}` : ''; })}
      ${HELP.some(match) ? '' : html`<div class="dim" style="font-size:12.5px">Nothing matches “${helpState.q}”.</div>`}</aside>
    <article class="help-body">
      <div class="kicker" style="color:var(--accent);font-size:11px;letter-spacing:.14em;text-transform:uppercase">${t.group}</div>
      <h2 style="margin:4px 0 2px">${t.title}</h2>
      <div class="dim" style="font-size:12.5px;margin-bottom:12px">${t.where}</div>
      <p style="font-size:14px;line-height:1.55">${helpFmt(t.summary)}</p>
      <div style="display:flex;gap:8px;margin:4px 0 16px">${t.open ? html`<button class="btn btn-primary" id="hp-open">Open ${t.title.toLowerCase().startsWith('first') ? 'Settings' : 'this'} ▸</button>` : ''}
        ${t.open ? html`<button class="btn btn-ghost" id="hp-walk" title="Opens the page and shows each step beside the real controls">▶ Walk me through it</button>` : ''}</div>
      <div class="help-cols">
        <div><h3>Step by step</h3><ol class="help-steps">${t.steps.map(s => html`<li>${helpFmt(s)}</li>`)}</ol>
          ${t.tips && t.tips.length ? html`<h3>Tips</h3><ul class="help-tips">${t.tips.map(s => html`<li>${helpFmt(s)}</li>`)}</ul>` : ''}</div>
        <div class="help-shots">${(t.shots || []).map(([f, c]) => html`<figure><img src="help/${f}.jpg" alt="${c}" data-hp-zoom="${f}"><figcaption>${c}</figcaption></figure>`)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:22px;border-top:1px solid var(--line);padding-top:12px">
        ${prev ? html`<button class="btn btn-ghost" data-hp="${prev.id}">◂ ${prev.title}</button>` : html`<span></span>`}${next ? html`<button class="btn btn-ghost" data-hp="${next.id}">${next.title} ▸</button>` : ''}</div>
      <div class="dim" style="font-size:11.5px;margin-top:10px">Screenshots use demo data with made-up pilots.</div>
    </article></div>`);
  document.querySelectorAll('[data-hp]').forEach(b => b.onclick = () => { helpState.id = b.dataset.hp; renderHelp(); content().scrollTop = 0; });
  const qi = $('#hp-q'); qi.oninput = () => { helpState.q = qi.value; const pos = qi.selectionStart; renderHelp(); const n = $('#hp-q'); n.focus(); n.setSelectionRange(pos, pos); };
  const op = $('#hp-open'); if (op) op.onclick = () => helpGo(t.open);
  const wk = $('#hp-walk'); if (wk) wk.onclick = () => startWalk(t.id);
  document.querySelectorAll('[data-hp-zoom]').forEach(img => { img.addEventListener('error', () => { const f = img.closest('figure'); if (f) f.remove(); }); });
  document.querySelectorAll('[data-hp-zoom]').forEach(img => img.onclick = () => openModal(img.alt, html`<img src="help/${img.dataset.hpZoom}.jpg" style="width:100%;border-radius:6px">`, { wide: true }));
}

function helpGo(o) {
  if (o.toolsTab) state.toolsTab = o.toolsTab;
  if (o.corpTab) state.corpTab = o.corpTab;
  if (o.view === 'char') { const c = state.characters.find(x => !x.needsReauth) || state.characters[0]; if (!c) return toast('Add a pilot first.', true); return go('char', { charId: c.id, tab: o.tab || 'summary' }); }
  go(o.view);
  if (o.fold) setTimeout(() => { if (typeof openSettingsSection === 'function') openSettingsSection(o.fold); }, 300);
}


// ---------- Walkthroughs: a step panel over the real page, highlighting each control ----------
const walkState = { id: null, i: 0 };
function startWalk(id) {
  const t = HELP.find(h => h.id === id); if (!t) return;
  walkState.id = id; walkState.i = 0;
  helpGo(t.open);
  setTimeout(drawWalk, 450);
}
function endWalk() { walkState.id = null; document.getElementById('walk-panel')?.remove(); document.querySelectorAll('.help-hl').forEach(e => e.classList.remove('help-hl')); }
function drawWalk() {
  const t = HELP.find(h => h.id === walkState.id); if (!t) return endWalk();
  document.querySelectorAll('.help-hl').forEach(e => e.classList.remove('help-hl'));
  const i = walkState.i, n = t.steps.length;
  let p = document.getElementById('walk-panel');
  if (!p) { p = document.createElement('div'); p.id = 'walk-panel'; document.body.appendChild(p); }
  p.innerHTML = String(html`<div class="walk-head"><span class="dim" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase">${t.title} · step ${i + 1} of ${n}</span><button class="btn btn-ghost" id="walk-x" title="End walkthrough">✕</button></div>
    <div class="walk-text">${helpFmt(t.steps[i])}</div>
    <div class="walk-bar"><i style="width:${Math.round((i + 1) / n * 100)}%"></i></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">${i > 0 ? html`<button class="btn btn-ghost" id="walk-back">◂ Back</button>` : ''}<button class="btn btn-primary" id="walk-next">${i < n - 1 ? 'Next ▸' : 'Done'}</button></div>`);
  p.querySelector('#walk-x').onclick = endWalk;
  const b = p.querySelector('#walk-back'); if (b) b.onclick = () => { walkState.i--; drawWalk(); };
  p.querySelector('#walk-next').onclick = () => { if (walkState.i < n - 1) { walkState.i++; drawWalk(); } else { endWalk(); toast('Walkthrough finished. Press ? any time for help on a page.'); } };
  const sel = t.walk && t.walk[i];
  if (sel) { const all = document.querySelectorAll(sel); const el = all.length > 1 && all[0].tagName !== 'TR' ? all[0].parentElement : all[0]; if (el) { el.classList.add('help-hl'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
}
document.addEventListener('keydown', e => { if (walkState.id && e.key === 'Escape' && !document.getElementById('modal')) endWalk(); });
