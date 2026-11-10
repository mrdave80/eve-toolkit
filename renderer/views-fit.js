/* Fit checker (Tools → Fitting). */
const fitState = { text: '', data: null, statsFor: 'allV' };
const SLOT_LABEL = { high: 'High slots', med: 'Mid slots', low: 'Low slots', rig: 'Rigs', sub: 'Subsystems' };

function tFit() {
  setContent(html`<div class="grid" style="grid-template-columns:minmax(300px,1fr) 2.2fr;gap:16px;align-items:start">
    <div class="panel"><h3>Paste a fit</h3>
      <textarea id="ft-text" rows="18" style="width:100%" class="mono-area" spellcheck="false" placeholder="[Vexor, My fit]&#10;Damage Control II&#10;…&#10;&#10;In game: Fitting → Save/Copy → Copy to clipboard. Pyfa: Export → EFT.">${fitState.text}</textarea>
      <div class="toolbar" style="margin:10px 0 0"><button class="btn btn-primary" id="ft-go">Check fit</button></div>
      <div class="dim" style="font-size:12px;margin-top:10px">Checks slots, CPU, powergrid and calibration with each pilot's skills, who can fly it and what it costs. It also works out damage, tank, capacitor and speed, for all skills at V or any of your pilots. For deeper theorycrafting, the <b>Open in Pyfa</b> button copies the fit for it.</div></div>
    <div id="ft-out">${fitState.data ? '' : emptyBox('Paste a fit in EFT format, the same format the game and Pyfa copy.')}</div></div>`);
  if (fitState.data) drawFit();
  $('#ft-go').onclick = async () => {
    fitState.text = $('#ft-text').value;
    $('#ft-out').innerHTML = String(loadingView('Checking the fit…'));
    fitState.checking = true;
    const r = await api.fit.check(fitState.text);
    fitState.checking = false;
    if (!r.ok) { $('#ft-out').innerHTML = String(errorView(r)); return; }
    fitState.data = r.data; drawFit();
  };
  if (fitState.pending) { fitState.pending = false; $('#ft-go').click(); }
}

function fitMissing(p) {
  return html`<div style="display:flex;flex-wrap:wrap;gap:6px">${p.missing.map(m => html`<span class="badge">${m.name} ${ROMAN[m.level]}${m.have !== undefined ? html` <span class="dim">(has ${m.have ? ROMAN[m.have] : 'none'})</span>` : ''}</span>`)}</div>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center"><span class="dim" style="font-size:12px">About ${fmtDuration(p.minutes * 60000, true)} of training.</span>
      <button type="button" class="btn btn-ghost" style="padding:2px 9px;font-size:12px" data-fit-plan="${p.id}">Copy as skill plan</button></div>`;
}

const RES_COL = ['var(--blue)', 'var(--red)', 'var(--muted)', 'var(--orange)'];
function resCell(v, i) {
  if (v === null || v === undefined) return html`<td class="right dim">—</td>`;
  const p = Math.round(v * 1000) / 10;
  return html`<td class="right" style="min-width:58px"><div class="num" style="font-size:12px">${p.toFixed(1)}%</div><div style="height:3px;background:var(--line);border-radius:2px;margin-top:2px"><i style="display:block;height:3px;width:${raw(String(Math.max(0, Math.min(100, p))))}%;background:${raw(RES_COL[i])};border-radius:2px"></i></div></td>`;
}
const mmss = s => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;
const VIOL = { max_group: 'Only a limited number of these can be fitted', charge_size: 'Charge is the wrong size for the module', charge_group: 'Charge doesn’t fit that module', rig_size: 'Rig is the wrong size for the ship', ship_restricted: 'This module can’t be fitted to this ship', capital_item: 'Capital-size module on a sub-capital ship', subsystem_taken: 'Two subsystems in the same slot', wrong_slot: 'A module is in the wrong rack' };

function fitStatsPanel(d) {
  const e = d.engine || {};
  if (!e.allV) return html`<div class="panel"><h3>Damage, tank and capacitor</h3><div class="notice" style="margin:0">${e.error ? `Couldn’t work out the stats: ${e.error}` : 'Stats aren’t available.'} The fitting check below still works.</div>
    <button class="btn btn-ghost" style="margin-top:10px" id="ft-engine-retry">Try again</button></div>`;
  const opts = [['allV', 'All skills V'], ...d.pilots.filter(p => e.pilots[p.id]).map(p => [String(p.id), p.name])];
  if (!opts.some(o => o[0] === fitState.statsFor)) fitState.statsFor = 'allV';
  const s = fitState.statsFor === 'allV' ? e.allV : e.pilots[fitState.statsFor];
  const cap = c => c.stable ? html`<span class="pos">Stable at ${Math.round(c.stableAt)}%</span>` : c.lastsSeconds !== null ? html`<span class="neg">Lasts ${mmss(c.lastsSeconds)}</span>` : html`<span class="dim">No drain</span>`;
  const viol = (s.violations || []).filter(v => VIOL[v.type]);
  const reps = [['Shield boost', s.rep.shield], ['Armour repair', s.rep.armor], ['Hull repair', s.rep.hull]].filter(x => x[1] > 0.05);
  return html`<div class="panel"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><h3 style="margin:0;flex:1">Damage, tank and capacitor</h3>
      <select id="ft-statsfor" class="crumb-select" style="width:auto">${opts.map(([v, l]) => html`<option value="${v}" ${raw(v === fitState.statsFor ? 'selected' : '')}>${l}</option>`)}</select></div>
    <div class="grid grid-4" style="gap:10px;margin-bottom:12px">
      ${stat('DPS', fmtNum(Math.round(s.dps)), s.droneDps && s.weaponDps ? `${fmtNum(Math.round(s.weaponDps))} weapons · ${fmtNum(Math.round(s.droneDps))} drones` : s.droneDps ? 'drones' : s.dpsReload && Math.round(s.dpsReload) !== Math.round(s.dps) ? `${fmtNum(Math.round(s.dpsReload))} with reloads` : '')}
      ${stat('Volley', fmtNum(Math.round(s.volley)), 'everything at once')}
      ${stat('EHP', fmtCompact(s.ehp), 'even damage types')}
      ${stat('Capacitor', s.cap.stable ? Math.round(s.cap.stableAt) + '%' : s.cap.lastsSeconds !== null ? mmss(s.cap.lastsSeconds) : '—', s.cap.stable ? 'stable' : 'until empty', s.cap.stable ? 'pos' : 'neg')}</div>
    <table style="margin-bottom:12px"><thead><tr><th>Layer</th><th class="right">HP</th><th class="right">EHP</th><th class="right">EM</th><th class="right">Thermal</th><th class="right">Kinetic</th><th class="right">Explosive</th></tr></thead><tbody>
      ${['shield', 'armor', 'hull'].map(k => html`<tr><td>${{ shield: 'Shield', armor: 'Armour', hull: 'Hull' }[k]}</td><td class="right num">${fmtNum(Math.round(s.hp[k]))}</td><td class="right num">${fmtNum(Math.round(s.layers[k]))}</td>${s.resists[k].map(resCell)}</tr>`)}</tbody></table>
    <div class="kv" style="font-size:12.5px;grid-template-columns:max-content 1fr max-content 1fr">
      <span class="k">Capacitor</span><span>${fmtNum(Math.round(s.cap.amount))} GJ, ${s.cap.recharge.toFixed(0)} s recharge · ${cap(s.cap)}${s.propOff ? html` · prop module off: ${cap(s.propOff.cap)}` : ''}</span>
      ${reps.length ? html`<span class="k">Active tank</span><span>${reps.map(([l, v]) => `${l} ${fmtNum(Math.round(v))} EHP/s`).join(' · ')}</span>` : ''}
      ${s.rep.passive > 0.5 ? html`<span class="k">Passive shield</span><span>${fmtNum(Math.round(s.rep.passive))} HP/s at peak</span>` : ''}
      <span class="k">Speed</span><span>${fmtNum(Math.round(s.speed))} m/s${s.propOff ? html` <span class="dim">(${fmtNum(Math.round(s.propOff.speed))} without the prop module)</span>` : ''} · align ${s.align ? s.align.toFixed(1) + ' s' : '—'}</span>
      <span class="k">Signature</span><span>${fmtNum(Math.round(s.sig))} m${s.propOff ? html` <span class="dim">(${fmtNum(Math.round(s.propOff.sig))} without)</span>` : ''}</span>
      <span class="k">Targeting</span><span>${fmtNum(Math.round(s.lockRange / 1000))} km · ${fmtNum(Math.round(s.scanRes))} mm scan res${s.maxTargets ? ` · ${Math.round(s.maxTargets)} targets` : ''}</span></div>
    ${viol.length ? html`<div class="notice" style="margin:10px 0 0">${[...new Set(viol.map(v => VIOL[v.type]))].join('. ')}.</div>` : ''}
    <div class="dim" style="font-size:11.5px;margin-top:8px">Modules run as the game would set them on import, with drones up to your bandwidth. Calculated with <a href="#" data-link="https://eveship.fit">EVEShip.fit</a>’s open-source engine.</div></div>`;
}

function drawFit(box = $('#ft-out'), d = fitState.data) {
  if (!box || !d) return;
  const sc = d.slotCheck;
  const bar = (used, max, label, unit) => { const pct = max ? Math.min(100, used / max * 100) : (used ? 100 : 0); const over = used > max + 0.01;
    return html`<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:12.5px"><span class="muted">${label}</span><span class="num ${over ? 'neg' : ''}">${fmtNum(Math.round(used * 10) / 10)} / ${fmtNum(Math.round(max * 10) / 10)} ${unit}</span></div>
      <div class="bar ${over ? '' : ''}" style="margin-top:4px"><i style="width:${pct}%;${raw(over ? 'background:var(--red)' : '')}"></i></div></div>`; };
  const slotRow = k => { const list = d.slots[k]; if (!list.length && !(sc[k] && sc[k].max)) return ''; return html`<div style="margin-bottom:10px"><div class="dim" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${SLOT_LABEL[k]}${sc[k] ? ` · ${sc[k].used}/${sc[k].max}` : ''}</div>
    ${list.map(m => m.empty ? html`<div class="dim" style="padding:3px 0;font-size:12.5px">Empty</div>` : html`<div style="display:flex;align-items:center;gap:8px;padding:3px 0">${icon(m.id, 22)}<span>${m.name}${m.offline ? html` <span class="badge">offline</span>` : ''}</span>${m.charge ? html`<span class="dim" style="font-size:12px">${icon(m.chargeId, 16)}${m.charge}</span>` : ''}<span class="dim num" style="margin-left:auto;font-size:12px">${fmtCompact(m.price)}</span></div>`)}</div>`; };
  const v = d.allV;
  const pct = x => (x === null ? '—' : Math.round(x * 100) + '%');
  const h = d.hull;
  box.innerHTML = String(html`<div class="panel"><div style="display:flex;gap:14px;align-items:center">
      <img src="https://images.evetech.net/types/${d.shipTypeId}/render?size=128" width="72" height="72" style="border-radius:8px;border:1px solid var(--line-2)" alt="">
      <div style="flex:1"><div style="font-size:20px;font-weight:600">${d.name}</div><div class="muted">${d.ship} · ${fmtCompact(d.cost.total)} ISK <span class="dim">(hull ${fmtCompact(d.cost.hull)}, fittings ${fmtCompact(d.cost.fittings)})</span></div></div>
      <div style="display:flex;flex-direction:column;gap:6px"><button class="btn btn-primary" id="ft-pyfa">Open in Pyfa</button><button class="btn btn-ghost" id="ft-appraise">Appraise</button></div></div>
      ${d.unknown.length ? html`<div class="notice" style="margin-top:10px">Not recognised: ${d.unknown.join(', ')}</div>` : ''}
      ${sc.problems.length ? html`<div class="notice" style="margin-top:10px">Too many modules: ${sc.problems.map(p => `${p.over} over in ${p.slot === 'turrets' ? 'turret hardpoints' : p.slot === 'launchers' ? 'launcher hardpoints' : SLOT_LABEL[p.slot].toLowerCase()}`).join(', ')}.</div>` : ''}</div>
    <div id="ft-stats">${fitStatsPanel(d, box)}</div>
    <div class="grid grid-2" style="align-items:start">
      <div class="panel"><h3>Fitting</h3>${['high', 'med', 'low', 'rig', 'sub'].map(slotRow)}
        ${d.drones.length ? html`<div class="dim" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;margin:6px 0 4px">Drones</div>${d.drones.map(m => html`<div style="padding:2px 0">${icon(m.id, 20)}${m.qty} × ${m.name}</div>`)}` : ''}
        ${d.cargo.length ? html`<div class="dim" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;margin:8px 0 4px">Cargo</div>${d.cargo.map(m => html`<div style="padding:2px 0;font-size:12.5px">${icon(m.id, 18)}${fmtNum(m.qty)} × ${m.name}</div>`)}` : ''}</div>
      <div>
        <div class="panel"><h3>Resources with all skills at V</h3>${bar(v.cpu, v.cpuOut, 'CPU', 'tf')}${bar(v.pg, v.pgOut, 'Powergrid', 'MW')}${bar(v.cal, v.calOut, 'Calibration', '')}
          ${sc.turrets.max || sc.turrets.used ? bar(sc.turrets.used, sc.turrets.max, 'Turret hardpoints', '') : ''}${sc.launchers.max || sc.launchers.used ? bar(sc.launchers.used, sc.launchers.max, 'Launcher hardpoints', '') : ''}</div>
        <div class="panel" style="padding:0"><div style="padding:12px 16px 0"><h3>Your pilots</h3></div><table><thead><tr><th>Pilot</th><th>Skills</th><th class="right">CPU</th><th class="right">Powergrid</th><th>Fits?</th></tr></thead><tbody>
          ${d.pilots.map(p => { const f = p.fitting; const cells = html`<td>${p.name}${p.fromAudit ? html` <span class="badge">audit</span>` : ''}</td>
            <td>${p.canFly ? html`<span class="pos">Can fly</span>` : html`<span class="muted" title="${(p.missing || []).map(m => m.name + ' ' + ROMAN[m.level]).join(', ')}">${p.minutes >= 1440 ? Math.round(p.minutes / 1440) + 'd' : fmtDuration(p.minutes * 60000, true)} to train</span>`}</td>
            <td class="right num ${f && f.cpu > f.cpuOut + 0.01 ? 'neg' : ''}">${f ? `${Math.round(f.cpu)}/${Math.round(f.cpuOut)}` : '—'}</td><td class="right num ${f && f.pg > f.pgOut + 0.01 ? 'neg' : ''}">${f ? `${Math.round(f.pg)}/${Math.round(f.pgOut)}` : '—'}</td>
            <td>${!f ? html`<span class="dim">—</span>` : f.ok ? html`<span class="badge green">Fits</span>` : html`<span class="badge gold" title="Ship bonuses that cut fitting costs aren't counted">Likely over</span>`}</td>`;
            return p.missing && p.missing.length ? xRow('fm' + p.id, cells, fitMissing(p), 5, { title: 'Click to see the missing skills' }) : html`<tr>${cells}</tr>`; })}</tbody></table></div>
        ${d.engine && d.engine.allV ? '' : html`<div class="panel"><h3>Hull, before modules and skills</h3><div class="kv">
          <span class="k">Shield / armour / hull</span><span class="num">${fmtNum(h.hp.shield)} / ${fmtNum(h.hp.armor)} / ${fmtNum(h.hp.hull)} HP · about ${fmtNum(h.ehp)} EHP</span>
          <span class="k">Shield resists</span><span class="num">${h.resists.shield.map(pct).join(' · ')}</span>
          <span class="k">Armour resists</span><span class="num">${h.resists.armor.map(pct).join(' · ')}</span>
          <span class="k">Speed / align</span><span class="num">${fmtNum(Math.round(h.velocity))} m/s · ${h.align ? h.align.toFixed(1) + ' s' : '—'}</span>
          <span class="k">Cargo / drone bay</span><span class="num">${fmtNum(h.cargo)} m³ · ${fmtNum(h.droneBay)} m³, ${fmtNum(h.bandwidth)} Mbit/s</span>
          <span class="k">Signature / lock range</span><span class="num">${fmtNum(h.sig)} m · ${fmtNum(Math.round(h.lockRange / 1000))} km</span>
          <span class="k">Capacitor</span><span class="num">${fmtNum(Math.round(h.cap))} GJ, ${fmtNum(Math.round(h.capRecharge))} s recharge</span></div>
          <div class="dim" style="font-size:11.5px;margin-top:6px">Resists in EM · thermal · kinetic · explosive order.</div></div>`}
      </div></div>
    <div class="dim" style="font-size:12px;margin-top:4px">CPU and powergrid use CPU Management, Power Grid Management, Weapon Upgrades, Advanced Weapon Upgrades, Energy Grid Upgrades, Electronics Upgrades and Shield Upgrades, plus co-processors and similar modules. Ship bonuses that cut fitting costs (for example on logistics ships) aren't counted, so a fit can show as slightly over when it actually fits. For fitted EHP, DPS and capacitor, use Pyfa.</div>`);
  box.querySelectorAll('[data-fit-plan]').forEach(b => b.onclick = async () => { const p = d.pilots.find(x => String(x.id) === b.dataset.fitPlan); await api.copy(p.missing.map(m => `${m.name} ${m.level}`).join('\n')); toast('Skill list copied. Paste it into a skill plan in game, or into the Skill Planner here.'); });
  const sf = box.querySelector('#ft-statsfor'); if (sf) sf.onchange = e => { fitState.statsFor = e.target.value; drawFit(box, d); };
  const er = box.querySelector('#ft-engine-retry'); if (er) er.onclick = async () => { er.disabled = true; er.textContent = 'Downloading…'; const r = await api.fit.engineUpdate(); if (!r.ok) { toast(r.error, true); er.disabled = false; er.textContent = 'Try again'; return; } const c = await api.fit.check(d.eft); if (c.ok) { if (box.id === 'ft-out') fitState.data = c.data; drawFit(box, c.data); } };
  box.querySelector('#ft-pyfa').onclick = async () => { await api.copy(d.eft); toast('Fit copied. In Pyfa, import it from the clipboard.'); };
  box.querySelector('#ft-appraise').onclick = () => appraiseFitModal(d);
}

async function appraiseFitModal(d) {
  openModal(`Appraisal: ${d.name}`, loadingView('Pricing the fit at Jita…'), { wide: true });
  const r = await api.appraise(d.eft, 'Jita');
  const body = document.querySelector('#modal .modal-body');
  if (!body || !document.getElementById('modal')) return;
  const foot = body.querySelector('.modal-foot');
  const closeBtn = foot.querySelector('[data-close]'); if (closeBtn) closeBtn.textContent = 'Close';
  const box = document.createElement('div');
  if (!r.ok) box.innerHTML = String(errorView(r));
  else {
    const a = r.data, t = a.totals;
    box.innerHTML = String(html`<div class="grid grid-4" style="margin-bottom:12px">${stat('Sell value', fmtCompact(t.sell) + ' ISK', fmtIsk(t.sell))}${stat('Buy value', fmtCompact(t.buy) + ' ISK', 'Split ' + fmtCompact(t.split))}${stat('Volume', fmtNum(Math.round(t.volume)) + ' m³')}${stat('Items', fmtNum(t.items), a.rows.length + ' types')}</div>
      ${a.unknown.length ? html`<div class="notice">Not recognised: ${a.unknown.join(', ')}</div>` : ''}
      <div class="table-wrap" style="max-height:52vh"><table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Each (sell)</th><th class="right">Sell</th><th class="right">Buy</th></tr></thead><tbody>
        ${a.rows.map(x => html`<tr><td>${icon(x.typeId, 18)}${x.name}${typeof priceBadge === 'function' ? priceBadge(x) : ''}</td><td class="right num">${fmtNum(x.qty)}</td><td class="right num muted">${fmtCompact(x.unitSell)}</td><td class="right num">${fmtCompact(x.sell)}</td><td class="right num muted">${fmtCompact(x.buy)}</td></tr>`)}</tbody></table></div>
      <div class="dim" style="font-size:12px;margin-top:8px">Jita prices: sell is the lowest sell order, buy is the highest buy order.</div>`);
    const copy = document.createElement('button');
    copy.type = 'button'; copy.className = 'btn btn-ghost'; copy.textContent = 'Copy summary';
    copy.onclick = () => api.copy(`${d.name} (${d.ship}): sell ${fmtIsk(t.sell)}, buy ${fmtIsk(t.buy)}, ${fmtNum(Math.round(t.volume))} m³`).then(() => toast('Copied'));
    foot.prepend(copy);
  }
  body.querySelectorAll(':scope > .loading').forEach(x => x.remove());
  body.insertBefore(box, foot);
}

api.fit.onEngine(st => {
  if (st.phase !== 'downloading') return;
  const l = document.querySelector('#ft-out .loading, #pop-fit .loading'); if (l) l.innerHTML = String(html`<div class="spinner"></div>Downloading the fit stats data, one time only (about 10 MB)… ${st.pct || 0}%`);
});
