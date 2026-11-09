/* Fit checker (Tools → Fitting). */
const fitState = { text: '', data: null };
const SLOT_LABEL = { high: 'High slots', med: 'Mid slots', low: 'Low slots', rig: 'Rigs', sub: 'Subsystems' };

function tFit() {
  setContent(html`<div class="grid" style="grid-template-columns:minmax(300px,1fr) 2.2fr;gap:16px;align-items:start">
    <div class="panel"><h3>Paste a fit</h3>
      <textarea id="ft-text" rows="18" style="width:100%" class="mono-area" spellcheck="false" placeholder="[Vexor, My fit]&#10;Damage Control II&#10;…&#10;&#10;In game: Fitting → Save/Copy → Copy to clipboard. Pyfa: Export → EFT.">${fitState.text}</textarea>
      <div class="toolbar" style="margin:10px 0 0"><button class="btn btn-primary" id="ft-go">Check fit</button></div>
      <div class="dim" style="font-size:12px;margin-top:10px">Checks slots, CPU, powergrid and calibration with each pilot's skills, who can fly it and what it costs. For fitted EHP, DPS and capacitor, use Pyfa: the <b>Open in Pyfa</b> button copies the fit for it.</div></div>
    <div id="ft-out">${fitState.data ? '' : emptyBox('Paste a fit in EFT format, the same format the game and Pyfa copy.')}</div></div>`);
  if (fitState.data) drawFit();
  $('#ft-go').onclick = async () => {
    fitState.text = $('#ft-text').value;
    $('#ft-out').innerHTML = String(loadingView('Checking the fit…'));
    const r = await api.fit.check(fitState.text);
    if (!r.ok) { $('#ft-out').innerHTML = String(errorView(r)); return; }
    fitState.data = r.data; drawFit();
  };
  if (fitState.pending) { fitState.pending = false; $('#ft-go').click(); }
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
    <div class="grid grid-2" style="align-items:start">
      <div class="panel"><h3>Fitting</h3>${['high', 'med', 'low', 'rig', 'sub'].map(slotRow)}
        ${d.drones.length ? html`<div class="dim" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;margin:6px 0 4px">Drones</div>${d.drones.map(m => html`<div style="padding:2px 0">${icon(m.id, 20)}${m.qty} × ${m.name}</div>`)}` : ''}
        ${d.cargo.length ? html`<div class="dim" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;margin:8px 0 4px">Cargo</div>${d.cargo.map(m => html`<div style="padding:2px 0;font-size:12.5px">${icon(m.id, 18)}${fmtNum(m.qty)} × ${m.name}</div>`)}` : ''}</div>
      <div>
        <div class="panel"><h3>Resources with all skills at V</h3>${bar(v.cpu, v.cpuOut, 'CPU', 'tf')}${bar(v.pg, v.pgOut, 'Powergrid', 'MW')}${bar(v.cal, v.calOut, 'Calibration', '')}
          ${sc.turrets.max || sc.turrets.used ? bar(sc.turrets.used, sc.turrets.max, 'Turret hardpoints', '') : ''}${sc.launchers.max || sc.launchers.used ? bar(sc.launchers.used, sc.launchers.max, 'Launcher hardpoints', '') : ''}</div>
        <div class="panel" style="padding:0"><div style="padding:12px 16px 0"><h3>Your pilots</h3></div><table><thead><tr><th>Pilot</th><th>Skills</th><th class="right">CPU</th><th class="right">Powergrid</th><th>Fits?</th></tr></thead><tbody>
          ${d.pilots.map(p => { const f = p.fitting; return html`<tr><td>${p.name}${p.fromAudit ? html` <span class="badge">audit</span>` : ''}</td>
            <td>${p.canFly ? html`<span class="pos">Can fly</span>` : html`<span class="muted" title="${(p.missing || []).map(m => m.name + ' ' + ROMAN[m.level]).join(', ')}">${p.minutes >= 1440 ? Math.round(p.minutes / 1440) + 'd' : fmtDuration(p.minutes * 60000, true)} to train</span>`}</td>
            <td class="right num ${f && f.cpu > f.cpuOut + 0.01 ? 'neg' : ''}">${f ? `${Math.round(f.cpu)}/${Math.round(f.cpuOut)}` : '—'}</td><td class="right num ${f && f.pg > f.pgOut + 0.01 ? 'neg' : ''}">${f ? `${Math.round(f.pg)}/${Math.round(f.pgOut)}` : '—'}</td>
            <td>${!f ? html`<span class="dim">—</span>` : f.ok ? html`<span class="badge green">Fits</span>` : html`<span class="badge gold" title="Ship bonuses that cut fitting costs aren't counted">Likely over</span>`}</td></tr>`; })}</tbody></table></div>
        <div class="panel"><h3>Hull, before modules and skills</h3><div class="kv">
          <span class="k">Shield / armour / hull</span><span class="num">${fmtNum(h.hp.shield)} / ${fmtNum(h.hp.armor)} / ${fmtNum(h.hp.hull)} HP · about ${fmtNum(h.ehp)} EHP</span>
          <span class="k">Shield resists</span><span class="num">${h.resists.shield.map(pct).join(' · ')}</span>
          <span class="k">Armour resists</span><span class="num">${h.resists.armor.map(pct).join(' · ')}</span>
          <span class="k">Speed / align</span><span class="num">${fmtNum(Math.round(h.velocity))} m/s · ${h.align ? h.align.toFixed(1) + ' s' : '—'}</span>
          <span class="k">Cargo / drone bay</span><span class="num">${fmtNum(h.cargo)} m³ · ${fmtNum(h.droneBay)} m³, ${fmtNum(h.bandwidth)} Mbit/s</span>
          <span class="k">Signature / lock range</span><span class="num">${fmtNum(h.sig)} m · ${fmtNum(Math.round(h.lockRange / 1000))} km</span>
          <span class="k">Capacitor</span><span class="num">${fmtNum(Math.round(h.cap))} GJ, ${fmtNum(Math.round(h.capRecharge))} s recharge</span></div>
          <div class="dim" style="font-size:11.5px;margin-top:6px">Resists in EM · thermal · kinetic · explosive order.</div></div>
      </div></div>
    <div class="dim" style="font-size:12px;margin-top:4px">CPU and powergrid use CPU Management, Power Grid Management, Weapon Upgrades, Advanced Weapon Upgrades, Energy Grid Upgrades, Electronics Upgrades and Shield Upgrades, plus co-processors and similar modules. Ship bonuses that cut fitting costs (for example on logistics ships) aren't counted, so a fit can show as slightly over when it actually fits. For fitted EHP, DPS and capacitor, use Pyfa.</div>`);
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
