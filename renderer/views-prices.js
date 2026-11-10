'use strict';
/* Price alerts: a watchlist of items with prices to alert below and above. */

const pwState = { rows: null, checking: false, sort: 'name' };
const PW_HUBS = ['Jita', 'Amarr', 'Dodixie', 'Rens', 'Hek'];
// Cheap items (minerals, ammo) need decimals; fmtCompact rounds them away.
const pwIsk = v => v === null || v === undefined ? '—' : Math.abs(v) < 1000 ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : fmtCompact(v);

function sparkline(samples, w = 120, h = 28, lines = []) {
  const pts = (samples || []).slice(-60);
  if (pts.length < 2) return html`<span class="dim" style="font-size:11.5px">building history…</span>`;
  const vals = pts.map(p => p[1]).concat(lines.filter(Boolean));
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || max * 0.01 || 1;
  const x = i => (i / (pts.length - 1)) * (w - 2) + 1, y = v => h - 2 - ((v - min) / span) * (h - 4);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
  const up = pts[pts.length - 1][1] >= pts[0][1];
  return raw(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">${lines.filter(Boolean).map(l => `<line x1="0" x2="${w}" y1="${y(l).toFixed(1)}" y2="${y(l).toFixed(1)}" stroke="var(--gold)" stroke-width="1" stroke-dasharray="3 3" opacity=".7"/>`).join('')}<path d="${d}" fill="none" stroke="var(--${up ? 'green' : 'red'})" stroke-width="1.6"/></svg>`);
}

async function tPriceWatch() {
  if (!pwState.rows) { const r = await api.priceWatch.list(); pwState.rows = r.ok ? r.data : []; }
  drawPriceWatch();
}

function pwStatus(r) {
  if (r.error) return html`<span class="badge">${r.error}</span>`;
  if (r.last === null || r.last === undefined) return html`<span class="dim">waiting for prices</span>`;
  if (r.fired && r.fired.below) return html`<span class="badge green" title="At or under your below price">Below ${pwIsk(r.below)}</span>`;
  if (r.fired && r.fired.above) return html`<span class="badge gold" title="At or over your above price">Above ${pwIsk(r.above)}</span>`;
  const near = r.below && r.last <= r.below * 1.05 ? `within 5% of ${pwIsk(r.below)}` : r.above && r.last >= r.above * 0.95 ? `within 5% of ${pwIsk(r.above)}` : null;
  return near ? html`<span class="badge accent">${near}</span>` : html`<span class="dim">watching</span>`;
}

function drawPriceWatch() {
  const rows = (pwState.rows || []).slice();
  const sorters = { name: (a, b) => a.name.localeCompare(b.name), alert: (a, b) => (b.lastAlert || 0) - (a.lastAlert || 0), change: (a, b) => pwChange(b) - pwChange(a) };
  rows.sort(sorters[pwState.sort] || sorters.name);
  const last = rows.reduce((n, r) => Math.max(n, r.lastAt || 0), 0);
  const firing = rows.filter(r => r.fired && (r.fired.below || r.fired.above)).length;
  setContent(html`<div class="toolbar"><button class="btn btn-primary" id="pw-add">+ Add item</button><button class="btn btn-ghost" id="pw-check" ${raw(rows.length ? '' : 'disabled')}>${pwState.checking ? 'Checking…' : '⟳ Check now'}</button>
      <select id="pw-sort" class="crumb-select" style="width:auto">${[['name', 'Sort by name'], ['alert', 'Latest alert first'], ['change', 'Biggest rise first']].map(([v, l]) => html`<option value="${v}" ${raw(pwState.sort === v ? 'selected' : '')}>${l}</option>`)}</select>
      <span class="dim" style="font-size:12px">${last ? `Checked ${timeAgo(new Date(last).toISOString())} · ` : ''}Prices are checked every 15 minutes while the app runs.</span></div>
    ${rows.length ? html`<div class="grid grid-3" style="margin-bottom:16px">${stat('Watching', rows.length, 'items')}${stat('Alerts now', firing, 'past their price', firing ? 'pos' : '')}${stat('Last alert', rows.some(r => r.lastAlert) ? timeAgo(new Date(Math.max(...rows.map(r => r.lastAlert || 0))).toISOString()) : '—', '')}</div>
      <div class="panel" style="padding:0"><table><thead><tr><th>Item</th><th>Hub</th><th class="right">Price now</th><th class="right">Change</th><th>Last day</th><th class="right">Below</th><th class="right">Above</th><th>Status</th></tr></thead><tbody>
      ${rows.map(r => { const ch = pwChange(r); return xRow('pw' + r.id, html`<td>${icon(r.typeId, 18)}${r.name}${r.note ? html`<div class="dim" style="font-size:11.5px">${r.note}</div>` : ''}</td><td class="muted">${r.hub} ${r.side}</td>
        <td class="right num">${r.last !== null && r.last !== undefined ? pwIsk(r.last) : '—'}</td><td class="right num ${ch > 0 ? 'pos' : ch < 0 ? 'neg' : 'dim'}">${Number.isFinite(ch) && ch !== 0 ? (ch > 0 ? '+' : '') + (ch * 100).toFixed(1) + '%' : '—'}</td>
        <td>${sparkline(r.samples, 110, 24)}</td><td class="right num">${r.below ? pwIsk(r.below) : '—'}</td><td class="right num">${r.above ? pwIsk(r.above) : '—'}</td><td>${pwStatus(r)}</td>`, pwDetail(r), 8); })}
      </tbody></table></div>` : emptyBox('Add items to watch. You get a Windows alert, and a phone alert if you’ve set those up, when the price goes below or above the prices you set.')}
    <div class="dim" style="font-size:12px;margin-top:8px">Sell is the lowest sell order at the hub; buy is the highest buy order. Each alert fires once, and is ready again after the price moves back past your line. Phone alerts use Settings → Phone alerts → “Price alerts from your watchlist”.</div>`);
  $('#pw-add').onclick = () => openPriceAlertModal();
  $('#pw-sort').onchange = e => { pwState.sort = e.target.value; drawPriceWatch(); };
  const ck = $('#pw-check'); if (ck) ck.onclick = async () => { pwState.checking = true; drawPriceWatch(); const r = await api.priceWatch.check(); pwState.checking = false; if (r.ok) pwState.rows = r.data; else toast(r.error, true); drawPriceWatch(); };
  document.querySelectorAll('[data-pw-edit]').forEach(b => b.onclick = () => openPriceAlertModal(pwState.rows.find(r => r.id === b.dataset.pwEdit)));
  document.querySelectorAll('[data-pw-del]').forEach(b => b.onclick = async () => { await api.priceWatch.remove(b.dataset.pwDel); pwState.rows = pwState.rows.filter(r => r.id !== b.dataset.pwDel); toast('Removed from the watchlist'); drawPriceWatch(); });
}

function pwChange(r) { const s = r.samples || []; if (s.length < 2) return 0; const dayAgo = Date.now() - 86400000; const base = (s.find(p => p[0] >= dayAgo) || s[0])[1]; return base ? (s[s.length - 1][1] - base) / base : 0; }

function pwDetail(r) {
  const s = r.samples || [];
  const vals = s.map(p => p[1]);
  return html`<div class="grid" style="grid-template-columns:auto 1fr;gap:18px;align-items:start">
    <div>${sparkline(s, 420, 90, [r.below, r.above])}<div class="dim" style="font-size:11.5px;margin-top:4px">${s.length ? `${s.length} checks since ${fmtDate(new Date(s[0][0]).toISOString())}` : 'No checks yet'}${r.below || r.above ? ' · dashed lines are your alert prices' : ''}</div></div>
    <div class="kv" style="font-size:12.5px">
      <span class="k">Lowest seen</span><span class="num">${vals.length ? pwIsk(Math.min(...vals)) : '—'}</span>
      <span class="k">Highest seen</span><span class="num">${vals.length ? pwIsk(Math.max(...vals)) : '—'}</span>
      <span class="k">Last alert</span><span>${r.lastAlert ? timeAgo(new Date(r.lastAlert).toISOString()) : 'none yet'}</span>
      <span class="k">Added</span><span>${r.added ? fmtDay(new Date(r.added).toISOString()) : ''}</span></div></div>
    <div style="margin-top:10px;display:flex;gap:6px"><button type="button" class="btn btn-ghost" style="padding:2px 10px;font-size:12px" data-pw-edit="${r.id}">Edit</button>
      <button type="button" class="btn btn-ghost" style="padding:2px 10px;font-size:12px" data-tid-open="${r.typeId}">Item card</button>
      <button type="button" class="btn btn-danger" style="padding:2px 10px;font-size:12px" data-pw-del="${r.id}">Remove</button></div>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-tid-open]'); if (b) { e.preventDefault(); openItemCard(Number(b.dataset.tidOpen)); } });

/** Add or edit an alert. `pre` is an existing row, or { typeId, name } to start from an item. */
function openPriceAlertModal(pre = {}) {
  const editing = !!pre.id;
  let pick = pre.typeId ? { id: pre.typeId, name: pre.name } : null;
  openModal(editing ? `Price alert: ${pre.name}` : 'Add a price alert', html`
    ${editing ? '' : html`<div class="field"><label>Item</label><input type="text" name="q" id="pwm-q" value="${pre.name || ''}" placeholder="Start typing, e.g. PLEX or Large Skill Injector" spellcheck="false" autocomplete="off"><div id="pwm-list" style="margin-top:4px;max-height:180px;overflow:auto"></div></div>`}
    <div class="grid grid-2">${field('Hub', select('hub', PW_HUBS, pre.hub || 'Jita'))}${field('Price to watch', select('side', [['sell', 'Lowest sell order'], ['buy', 'Highest buy order']], pre.side || 'sell'))}</div>
    <div class="grid grid-2">${field('Alert when it drops to', inputText('below', pre.below ? fmtNum(pre.below) : '', 'e.g. 4.2m'), 'Leave empty for no low alert')}${field('Alert when it rises to', inputText('above', pre.above ? fmtNum(pre.above) : '', 'e.g. 5b'), 'Leave empty for no high alert')}</div>
    ${field('Note (optional)', inputText('note', pre.note || '', 'e.g. Restock when cheap'))}
    <div id="pwm-now" class="dim" style="font-size:12px"></div>`, {
    submit: editing ? 'Save' : 'Add to watchlist',
    onSubmit: async d => {
      const p = { hub: d.hub, side: d.side, below: d.below ? parseIsk(d.below) : null, above: d.above ? parseIsk(d.above) : null, note: d.note };
      if ((d.below && !p.below) || (d.above && !p.above)) { toast('Prices can be like 4200000, 4.2m or 1.5b.', true); return true; }
      const r = editing ? await api.priceWatch.update(pre.id, p) : await api.priceWatch.add({ ...p, typeId: pick && pick.id, name: pick ? pick.name : d.q });
      if (!r.ok) { toast(r.error, true); return true; }
      toast(editing ? 'Alert saved' : `${r.data.name} added to price alerts`);
      const l = await api.priceWatch.list(); pwState.rows = l.ok ? l.data : pwState.rows;
      if (state.view === 'tools' && state.toolsTab === 't-prices') drawPriceWatch();
    }
  });
  const showNow = async id => {
    const box = document.getElementById('pwm-now'); if (!box || !id) return;
    const hub = document.querySelector('#modal [name=hub]').value;
    box.textContent = 'Checking the price…';
    const info = await api.items.info(id);
    if (!info.ok || !Array.isArray(info.data.prices)) { box.textContent = info.ok && info.data.prices && info.data.prices.none ? 'No hub orders for this item right now.' : ''; return; }
    const p = info.data.prices.find(x => x.hub === hub) || info.data.prices[0];
    box.innerHTML = String(html`Now at ${p.hub}: sell <b>${p.sell !== null ? pwIsk(p.sell) : '—'}</b> · buy <b>${p.buy !== null ? pwIsk(p.buy) : '—'}</b>`);
  };
  if (pick) showNow(pick.id);
  const hubSel = document.querySelector('#modal [name=hub]'); if (hubSel) hubSel.onchange = () => pick && showNow(pick.id);
  const q = document.getElementById('pwm-q');
  if (q) {
    let t = null;
    const list = document.getElementById('pwm-list');
    q.oninput = () => {
      pick = null; clearTimeout(t);
      t = setTimeout(async () => {
        if (q.value.trim().length < 2) { list.innerHTML = ''; return; }
        const r = await api.items.search(q.value);
        const items = (r.ok ? r.data : []).map(x => Array.isArray(x) ? { id: x[0], name: x[1], group: x[2] } : x).slice(0, 12);
        list.innerHTML = String(html`${items.map(x => html`<a href="#" data-pwm="${x.id}" data-name="${x.name}" style="display:flex;gap:8px;align-items:center;padding:4px 6px;border-radius:6px;text-decoration:none;color:var(--text)">${icon(x.id, 18)}<span>${x.name}</span><span class="dim" style="font-size:11.5px;margin-left:auto">${x.group || ''}</span></a>`)}`);
        list.querySelectorAll('[data-pwm]').forEach(a => a.onclick = e => { e.preventDefault(); pick = { id: Number(a.dataset.pwm), name: a.dataset.name }; q.value = pick.name; list.innerHTML = ''; showNow(pick.id); });
      }, 220);
    };
    q.focus();
  }
}

api.priceWatch.onUpdate(rows => { pwState.rows = rows; if (state.view === 'tools' && state.toolsTab === 't-prices' && !document.getElementById('modal')) drawPriceWatch(); });
