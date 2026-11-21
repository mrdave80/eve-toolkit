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
      <div style="display:flex;flex-direction:column;gap:6px"><button class="btn btn-primary" id="ft-pyfa">Open in Pyfa</button><button class="btn btn-ghost" id="ft-appraise">Appraise</button><button class="btn btn-ghost" id="ft-save">Save to game</button><button class="btn btn-ghost" id="ft-lib">Add to library</button><button class="btn btn-ghost" id="ft-site">Check for a site</button></div></div>
      ${d.unknown.length ? html`<div class="notice" style="margin-top:10px">Not recognised: ${d.unknown.join(', ')}</div>` : ''}
      ${sc.problems.length ? html`<div class="notice" style="margin-top:10px">Too many modules: ${sc.problems.map(p => `${p.over} over in ${p.slot === 'turrets' ? 'turret hardpoints' : p.slot === 'launchers' ? 'launcher hardpoints' : SLOT_LABEL[p.slot].toLowerCase()}`).join(', ')}.</div>` : ''}</div>
    <div id="ft-stats">${fitStatsPanel(d, box)}</div>
    <div class="panel" id="ft-hit"></div>
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
  drawHitCalc(box.querySelector('#ft-hit'), d);
  box.querySelector('#ft-pyfa').onclick = async () => { await api.copy(d.eft); toast('Fit copied. In Pyfa, import it from the clipboard.'); };
  box.querySelector('#ft-appraise').onclick = () => appraiseFitModal(d);
  box.querySelector('#ft-save').onclick = () => openSaveFitModal(d);
  box.querySelector('#ft-site').onclick = () => { siteState.src = 'paste'; siteState.eft = d.eft; siteState.data = null; closeModal(); state.toolsTab = 't-sitecheck'; go('tools'); };
  box.querySelector('#ft-lib').onclick = async () => { const r = await api.fitlib.add(d.eft, { source: 'checker' }); if (!r.ok) return toast(r.error, true); toast(r.data.added ? 'Added to your fit library' : 'That fit is already in your library'); };
}

// ================= Site Check =================

const siteState = { site: '', src: 'paste', eft: '', libId: '', charId: '', pilot: '', ships: null, lib: null, names: null, data: null };
async function tSiteCheck(stillCurrent) {
  const s = siteState;
  if (!s.names) { const r = await api.site.names(); s.names = r.ok ? r.data : []; }
  if (!s.lib) { const r = await api.fitlib.list(); s.lib = r.ok ? r.data.fits : []; }
  if (stillCurrent && !stillCurrent()) return;
  drawSiteCheck();
}
function drawSiteCheck() {
  const s = siteState;
  const pilots = state.characters.filter(c => !c.needsReauth);
  const ship = s.ships && s.ships.find(x => String(x.id) === String(s.pilot));
  const libFits = ship ? s.lib.filter(f => f.shipTypeId === ship.shipTypeId || (f.ship && f.ship.toLowerCase() === ship.ship.toLowerCase())) : s.lib;
  setContent(html`<div class="grid" style="grid-template-columns:minmax(330px,1fr) 2fr;gap:16px;align-items:start">
    <div class="panel">
      <div class="field"><label>Site</label><input type="text" id="sc-site" list="sc-names" value="${s.site}" placeholder="e.g. Blood Den, Guristas Forsaken Hub, Serpentis 4/10" spellcheck="false"><datalist id="sc-names">${(s.names || []).map(n => html`<option value="${n}">`)}</datalist></div>
      <div class="seg" style="margin:4px 0 10px"><button data-scsrc="paste" class="${s.src === 'paste' ? 'active' : ''}">Paste a fit</button><button data-scsrc="lib" class="${s.src === 'lib' ? 'active' : ''}">Fit library</button><button data-scsrc="pilot" class="${s.src === 'pilot' ? 'active' : ''}">What I'm flying</button></div>
      ${s.src === 'paste' ? html`<textarea id="sc-eft" rows="9" style="width:100%" class="mono-area" placeholder="[Stratios, My fit]&#10;…  (EFT, from the fitting window: Copy to clipboard)" spellcheck="false">${s.eft}</textarea>` : ''}
      ${s.src === 'pilot' ? html`${s.ships === null ? html`<div class="dim" style="font-size:12.5px">Checking what your pilots are in…</div>` : s.ships.length ? html`<div class="field"><label>Pilot</label><select id="sc-pilot">${s.ships.map(x => html`<option value="${x.id}" ${raw(String(x.id) === String(s.pilot) ? 'selected' : '')}>${x.name}: ${x.ship}${x.shipName ? ` (${x.shipName})` : ''}</option>`)}</select></div>` : html`<div class="dim" style="font-size:12.5px">Couldn't read any pilot's ship.</div>`}` : ''}
      ${s.src === 'lib' || (s.src === 'pilot' && ship) ? html`${libFits.length ? html`<div class="field"><label>${ship ? `Your ${ship.ship} fits` : 'Fit'}</label><select id="sc-lib">${libFits.map(f => html`<option value="${f.id}" ${raw(f.id === s.libId ? 'selected' : '')}>${f.ship}: ${f.name}${f.folder ? ` (${f.folder})` : ''}</option>`)}</select></div>`
        : html`<div class="notice" style="margin:6px 0">${ship ? `No ${ship.ship} fit in your Fit Library. CCP doesn't share the fit you have on, so paste it (Fitting window → Copy to clipboard) or import your in-game fittings into the library.` : 'Your Fit Library is empty. Paste a fit instead, or add fits in Tools → Fitting → Fit Library.'}</div>`}` : ''}
      <div class="field"><label>Skills</label><select id="sc-char"><option value="">All skills at V</option>${pilots.map(c => html`<option value="${c.id}" ${raw(String(c.id) === String(s.charId || (ship ? ship.id : '')) ? 'selected' : '')}>${c.name}</option>`)}</select></div>
      <button class="btn btn-primary" id="sc-go" style="width:100%">Check</button>
      <div class="dim" style="font-size:12px;margin-top:8px">Works with pirate anomalies (Hideaway to Sanctum, and the Hidden, Forsaken and Forlorn ones), rogue drone sites and DED ratings like 4/10. Faction damage and EWAR are from EVE University; the DPS and repair figures are a rough guide.</div></div>
    <div id="sc-out">${s.data ? siteResult(s.data) : emptyBox('Type a site, pick a fit and press Check.')}</div></div>`);
  const keep = () => { s.site = $('#sc-site').value.trim(); if ($('#sc-eft')) s.eft = $('#sc-eft').value; if ($('#sc-lib')) s.libId = $('#sc-lib').value; if ($('#sc-char')) s.charId = $('#sc-char').value; if ($('#sc-pilot')) s.pilot = $('#sc-pilot').value; };
  document.querySelectorAll('[data-scsrc]').forEach(b => b.onclick = async () => {
    keep(); s.src = b.dataset.scsrc; drawSiteCheck();
    if (s.src === 'pilot' && s.ships === null) { const r = await api.site.ships(); s.ships = r.ok ? r.data : []; if (!s.pilot && s.ships[0]) s.pilot = String(s.ships[0].id); s.charId = s.pilot; if (siteState.src === 'pilot') drawSiteCheck(); }
  });
  const ps = $('#sc-pilot'); if (ps) ps.onchange = () => { keep(); s.charId = s.pilot; s.libId = ''; drawSiteCheck(); };
  $('#sc-go').onclick = async () => {
    keep();
    const eft = s.src === 'paste' ? s.eft : ((s.lib.find(f => f.id === (s.libId || ($('#sc-lib') && $('#sc-lib').value))) || {}).eft || '');
    if (!s.site) return toast('Type the site name first.', true);
    if (!eft.trim()) return toast(s.src === 'paste' ? 'Paste a fit first.' : 'Pick a fit first.', true);
    const out = $('#sc-out'); out.innerHTML = String(loadingView('Working out the fit against the site…'));
    const r = await api.site.check({ site: s.site, eft, charId: s.charId || null });
    if (!r.ok) { out.innerHTML = String(errorView(r)); return; }
    s.data = r.data; if ($('#sc-out')) $('#sc-out').innerHTML = String(siteResult(r.data));
  };
}
function siteResult(d) {
  const st = d.site, f = st.faction, t = d.tank;
  const dmg = { em: 'EM', th: 'Thermal', ki: 'Kinetic', ex: 'Explosive' };
  const ico = { good: ['pos', '✓'], warn: ['gold', '!'], bad: ['neg', '✕'], info: ['dim', 'i'] };
  const who = d.statsFor ? (state.characters.find(c => c.id === d.statsFor) || {}).name : 'all skills at V';
  return html`<div class="panel"><div style="display:flex;align-items:center;gap:12px">${icon(d.fit.shipTypeId, 40)}<div style="flex:1"><div style="font-size:18px;font-weight:600">${d.fit.ship} in a ${st.name}</div><div class="dim" style="font-size:12.5px">${d.fit.name} · stats with ${who}</div></div>
      <span class="badge ${d.tone}" style="font-size:14px;padding:4px 12px">${d.verdict}</span></div>
    <div class="kv" style="margin-top:12px">
      <span class="k">Faction</span><span>${f ? html`<b>${f.label}</b>, dealing ${Object.entries(f.deals).filter(([, v]) => v >= 0.1).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${Math.round(v * 100)}% ${dmg[k]}`).join(', ')}` : 'Not recognised: put the faction in the name (Blood, Guristas, Sansha, Serpentis, Angel, Drone)'}</span>
      <span class="k">Shoot them with</span><span>${f ? f.weak.map(k => dmg[k]).join(' or ') : '—'}</span>
      <span class="k">Site</span><span>${st.ded ? `DED ${st.ded}/10, ${st.gate ? `gate takes up to a ${st.gate}` : 'no ship size limit'}` : st.family ? `${st.variant ? st.variant + ' ' : ''}${st.family.label} (tier ${st.tier} of 10)${st.space ? `, found in ${st.space}` : ''}` : '—'}</span>
      <span class="k">Expect</span><span>${st.enemies || (st.ded ? 'a gated complex with a boss room' : '—')}</span></div></div>
    <div class="panel"><h3>Verdict</h3>${d.points.map(p => html`<div class="sc-point"><span class="${ico[p.level][0]} sc-ico">${ico[p.level][1]}</span><span>${p.text}</span></div>`)}</div>
    ${t ? html`<div class="grid grid-4">${stat('Repairs vs their damage', Math.round(t.repEff) + ' HP/s', `${Math.round(t.repRaw)} raw on ${t.layer}`)}${stat('EHP vs their damage', fmtCompact(t.ehp))}${stat('DPS', Math.round(t.dps), `${Math.round(t.weaponDps)} weapons · ${Math.round(t.droneDps)} drones`)}${stat('Capacitor', t.cap ? (t.cap.stable ? `Stable ${Math.round(t.cap.stableAt)}%` : t.cap.lastsSeconds !== null ? `Lasts ${fmtDuration(t.cap.lastsSeconds * 1000, true)}` : '—') : '—', 'everything on')}</div>` : ''}
    <div class="dim" style="font-size:11.5px;margin-top:6px">Rough guide for this site: ${st.want ? `${st.want.dps} DPS and ${st.want.rep} HP/s repaired against their damage` : 'not known'}. Sites vary, and spawns stack if you clear slowly. <a href="#" data-sc-fit>Open the fit in the Fit Checker</a></div>`;
}
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-sc-fit]'); if (a && siteState.data) { e.preventDefault(); fitState.text = siteState.data.fit.eft; fitState.data = null; fitState.pending = true; state.toolsTab = 't-fit'; go('tools'); } });

// ---------- Hit chance: transversal and missile application ----------

const hitState = { mode: 'turret', tracking: 30, optimal: 20, falloff: 10, tSig: 125, dist: 15, trans: 300, exRad: 40, exVel: 150, drf: 0.5, tSpeed: 300, missSig: 125 };
/** Turret hit chance: 0.5 ^ ((angular × 40,000 / (tracking × sig))² + (max(0, distance − optimal) / falloff)²). */
function turretHit(o) {
  const dist = Math.max(1, o.dist * 1000), ang = o.trans / dist;
  const t = o.tracking > 0 && o.tSig > 0 ? (ang * 40000) / (o.tracking * o.tSig) : 0;
  const r = o.falloff > 0 ? Math.max(0, dist - o.optimal * 1000) / (o.falloff * 1000) : (dist > o.optimal * 1000 ? 99 : 0);
  return Math.pow(0.5, t * t + r * r);
}
/** Missile damage: min(1, S/E, (S/E × Ve/Vt)^drf). */
function missileApp(o) {
  if (!(o.exRad > 0)) return 1;
  const se = o.missSig / o.exRad;
  const v = o.tSpeed > 0 ? Math.pow(se * o.exVel / o.tSpeed, o.drf) : 1;
  return Math.max(0, Math.min(1, se, v));
}
function drawHitCalc(el, d) {
  if (!el) return;
  const s = hitState, st = d && d.engine && d.engine.allV;
  const num = (id, label, v, step, hint) => html`<div class="field" style="margin:0"><label>${label}</label><input type="number" data-hit="${id}" value="${v}" step="${step}" min="0">${hint ? html`<div class="dim" style="font-size:11px">${hint}</div>` : ''}</div>`;
  const pct = x => Math.round(x * 1000) / 10 + '%';
  const body = () => {
    if (s.mode === 'turret') {
      const hit = turretHit(s);
      // Transversal that still gives 50% at this range and sig (ignoring range).
      const t50 = s.tracking * s.tSig * Math.max(1, s.dist * 1000) / 40000;
      const dists = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(f => Math.max(1, Math.round((s.optimal + s.falloff) * f)));
      return html`<div class="grid grid-3" style="margin:10px 0">${stat('Chance to hit', pct(hit), hit >= 0.5 ? 'good application' : hit >= 0.2 ? 'poor' : 'barely hitting', hit >= 0.5 ? 'pos' : hit < 0.2 ? 'neg' : 'gold')}${stat('Angular velocity', (s.trans / Math.max(1, s.dist * 1000)).toFixed(4) + ' rad/s')}${stat('Transversal for 50% (tracking only)', fmtNum(Math.round(t50)) + ' m/s', `at ${s.dist} km`)}</div>
        <table><thead><tr><th>Range</th>${dists.map(x => html`<th class="right">${x} km</th>`)}</tr></thead><tbody>
        ${[0, 100, 300, 600, 1000].map(tv => html`<tr><td class="dim">${tv} m/s transversal</td>${dists.map(x => { const h = turretHit({ ...s, dist: x, trans: tv }); return html`<td class="right num ${h >= 0.5 ? 'pos' : h < 0.2 ? 'neg' : ''}">${Math.round(h * 100)}%</td>`; })}</tr>`)}</tbody></table>
        <div class="dim" style="font-size:11.5px;margin-top:6px">Turret tracking (the number on Show Info, such as 30 or 250), optimal and falloff are on the turret's Show Info (with your skills, in the fitting window). A hit chance also scales damage: glancing hits do less, wrecking hits more.</div>`;
    }
    const app = missileApp(s);
    return html`<div class="grid grid-3" style="margin:10px 0">${stat('Damage applied', pct(app), app >= 0.9 ? 'full damage' : app >= 0.5 ? 'some lost' : 'most lost', app >= 0.9 ? 'pos' : app < 0.5 ? 'neg' : 'gold')}${stat('Signature limit', pct(Math.min(1, s.missSig / Math.max(1, s.exRad))), 'target sig ÷ explosion radius')}${stat('Speed limit', pct(Math.min(1, s.tSpeed > 0 ? Math.pow((s.missSig / Math.max(1, s.exRad)) * s.exVel / s.tSpeed, s.drf) : 1)), 'from explosion velocity')}</div>
      <div class="dim" style="font-size:11.5px">Explosion radius, explosion velocity and damage reduction factor are on the missile's Show Info. Target painters raise sig; webs cut target speed.</div>`;
  };
  el.innerHTML = String(html`<div style="display:flex;align-items:center;gap:10px"><h3 style="margin:0;flex:1">Hit chance and application</h3>
      <div class="seg"><button data-hitm="turret" class="${s.mode === 'turret' ? 'active' : ''}">Turrets</button><button data-hitm="missile" class="${s.mode === 'missile' ? 'active' : ''}">Missiles</button></div>
      ${st && st.sig ? html`<button class="btn btn-ghost" id="hit-self" style="font-size:12px;padding:2px 9px" title="Use this fit's signature and speed as the target">This ship as target</button>` : ''}</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:10px">
      ${s.mode === 'turret' ? html`${num('tracking', 'Turret tracking', s.tracking, 0.1)}${num('optimal', 'Optimal (km)', s.optimal, 0.1)}${num('falloff', 'Falloff (km)', s.falloff, 0.1)}${num('tSig', 'Target sig (m)', s.tSig, 1)}${num('dist', 'Range (km)', s.dist, 0.5)}${num('trans', 'Transversal (m/s)', s.trans, 10)}`
        : html`${num('exRad', 'Explosion radius (m)', s.exRad, 1)}${num('exVel', 'Explosion velocity (m/s)', s.exVel, 1)}${num('drf', 'Damage reduction factor', s.drf, 0.01)}${num('missSig', 'Target sig (m)', s.missSig, 1)}${num('tSpeed', 'Target speed (m/s)', s.tSpeed, 10)}`}</div>
    <div id="hit-out">${body()}</div>`);
  el.querySelectorAll('[data-hit]').forEach(i => i.oninput = () => { const v = Number(i.value); if (Number.isFinite(v)) { s[i.dataset.hit] = v; el.querySelector('#hit-out').innerHTML = String(body()); } });
  el.querySelectorAll('[data-hitm]').forEach(b => b.onclick = () => { s.mode = b.dataset.hitm; drawHitCalc(el, d); });
  const self = el.querySelector('#hit-self'); if (self) self.onclick = () => { s.tSig = s.missSig = Math.round(st.sig); if (st.speed) s.tSpeed = s.trans = Math.round(st.speed); drawHitCalc(el, d); toast(`Target set to this ${d.ship}: ${s.tSig} m sig, ${s.tSpeed} m/s`); };
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

if (api.fit.onEngine) api.fit.onEngine(st => {
  if (st.phase !== 'downloading') return;
  const l = document.querySelector('#ft-out .loading, #pop-fit .loading'); if (l) l.innerHTML = String(html`<div class="spinner"></div>Downloading the fit stats data, one time only (about 10 MB)… ${st.pct || 0}%`);
});


// ================= Fit library =================

const libState = { data: null, folder: '', q: '', fly: '' };
async function tFitLib(stillCurrent) {
  if (!libState.data) {
    setContent(loadingView('Reading your fits and checking who can fly them…'));
    const r = await api.fitlib.list();
    if (stillCurrent && !stillCurrent()) return;
    if (!r.ok) return setContent(errorView(r));
    libState.data = r.data;
  }
  drawFitLib();
}
async function reloadFitLib() { const r = await api.fitlib.list(); if (r.ok) { libState.data = r.data; drawFitLib(); } }
function drawFitLib() {
  const s = libState, d = s.data, q = s.q.toLowerCase();
  const fits = d.fits.filter(f => (!s.folder || (s.folder === '-' ? !f.folder : f.folder === s.folder)) && (!q || `${f.name} ${f.ship} ${f.group} ${f.notes}`.toLowerCase().includes(q)) && (!s.fly || (s.fly === 'yes' ? f.canFly : !f.canFly)));
  const groups = new Map(); for (const f of fits) { const k = f.folder || 'Unsorted'; (groups.get(k) || groups.set(k, []).get(k)).push(f); }
  setContent(html`<div class="toolbar" style="flex-wrap:wrap">
      <select id="fl-folder" class="crumb-select"><option value="">All folders (${d.fits.length})</option>${d.folders.map(f => html`<option value="${f}" ${raw(s.folder === f ? 'selected' : '')}>${f}</option>`)}<option value="-" ${raw(s.folder === '-' ? 'selected' : '')}>Unsorted</option></select>
      <select id="fl-fly" class="crumb-select"><option value="">Anyone</option><option value="yes" ${raw(s.fly === 'yes' ? 'selected' : '')}>A pilot can fly it</option><option value="no" ${raw(s.fly === 'no' ? 'selected' : '')}>Nobody can fly it yet</option></select>
      <input type="search" id="fl-q" placeholder="Search fits, ships, notes…" value="${s.q}" style="min-width:220px">
      <span style="flex:1"></span>
      <button class="btn btn-ghost" id="fl-paste">+ Paste fits</button><button class="btn btn-ghost" id="fl-game">Import in-game fittings</button><button class="btn btn-ghost" id="fl-doc">Import doctrines</button><button class="btn btn-ghost" id="fl-export">Copy all as EFT</button></div>
    ${fits.length ? [...groups.entries()].map(([folder, list]) => html`<div class="panel" style="padding:0;margin-bottom:14px"><div style="padding:12px 16px"><h3 style="margin:0">${folder} <span class="dim" style="text-transform:none;letter-spacing:0">· ${list.length}</span></h3></div><table><thead><tr><th>Fit</th><th>Ship</th><th>Your pilots</th><th>Notes</th></tr></thead><tbody>
      ${list.map(f => xRow('fl' + f.id, html`<td><b>${f.name}</b></td><td>${icon(f.shipTypeId, 18)}${f.ship}<div class="dim" style="font-size:11.5px">${f.group}</div></td>
        <td style="font-size:12.5px">${f.pilots.length ? html`${f.pilots.filter(p => p.canFly).map(p => html`<span class="badge green" style="margin:1px 4px 1px 0">${p.name}</span>`)}${f.pilots.filter(p => !p.canFly).sort((a, b) => a.minutes - b.minutes).slice(0, 2).map(p => html`<span class="badge" style="margin:1px 4px 1px 0" title="${p.missing} skills missing">${p.name} · ${fmtDuration(p.minutes * 60000, true)}</span>`)}` : html`<span class="dim">—</span>`}</td>
        <td class="muted" style="font-size:12px;max-width:280px">${f.notes}</td>`,
        html`<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><pre class="mono-area" style="margin:0;max-height:300px;overflow:auto;font-size:12px">${f.eft}</pre>
          <div><div class="field"><label>Name</label><input type="text" data-flname="${f.id}" value="${f.name}"></div><div class="field"><label>Folder</label><input type="text" data-flfolder="${f.id}" value="${f.folder}" list="fl-folders" placeholder="e.g. PvP, Mining, Doctrine"></div>
            <div class="field"><label>Notes</label><textarea rows="2" data-flnotes="${f.id}">${f.notes}</textarea></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-primary" style="padding:3px 10px;font-size:12px" data-flcheck="${f.id}">Open in Fit Checker</button><button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" data-flcopy="${f.id}">Copy EFT</button><button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" data-flgame="${f.id}">Save to game</button><button class="btn btn-danger" style="padding:3px 10px;font-size:12px" data-fldel="${f.id}">Delete</button></div>
            <div class="dim" style="font-size:12px;margin-top:8px">${f.pilots.map(p => `${p.name}: ${p.canFly ? 'can fly it' : `${p.missing} skill${p.missing === 1 ? '' : 's'} to train, about ${fmtDuration(p.minutes * 60000, true)}`}`).join(' · ')}</div></div></div>`, 4))}</tbody></table></div>`)
      : emptyBox(d.fits.length ? 'No fits match.' : 'Your fit library is empty. Paste fits, import your pilots’ in-game fittings, or press Add to library in the Fit Checker.')}
    <datalist id="fl-folders">${d.folders.map(f => html`<option value="${f}">`)}</datalist>`);
  $('#fl-folder').onchange = e => { s.folder = e.target.value; drawFitLib(); };
  $('#fl-fly').onchange = e => { s.fly = e.target.value; drawFitLib(); };
  $('#fl-q').oninput = e => { s.q = e.target.value; const pos = e.target.selectionStart; drawFitLib(); const i = $('#fl-q'); i.focus(); i.setSelectionRange(pos, pos); };
  $('#fl-paste').onclick = () => openModal('Paste fits', html`${field('Fits in EFT format', textarea('text', '', 12), 'Paste one or many. Each starts with a line like [Vexor, My fit].')}${field('Folder (optional)', inputText('folder', s.folder && s.folder !== '-' ? s.folder : '', 'e.g. PvP'))}`, {
    submit: 'Add', onSubmit: async v => { const r = await api.fitlib.importText(v.text, v.folder); if (!r.ok) { toast(r.error, true); return true; } toast(`${r.data.added} fit${r.data.added === 1 ? '' : 's'} added${r.data.dupes ? `, ${r.data.dupes} already there` : ''}`); reloadFitLib(); } });
  const imp = async (fn, what) => { toast(`Importing ${what}…`); const r = await fn(); if (!r.ok) return toast(r.error, true); toast(`${r.data.added} new fit${r.data.added === 1 ? '' : 's'}${r.data.dupes ? `, ${r.data.dupes} already there` : ''}${r.data.errors && r.data.errors.length ? ` (${r.data.errors[0]})` : ''}`); reloadFitLib(); };
  $('#fl-game').onclick = () => imp(api.fitlib.importGame, 'in-game fittings');
  $('#fl-doc').onclick = () => imp(api.fitlib.importDoctrines, 'doctrines');
  $('#fl-export').onclick = async () => { const r = await api.fitlib.exportAll(s.folder && s.folder !== '-' ? s.folder : null); if (r.ok) { navigator.clipboard.writeText(r.data); toast('Copied. Pyfa and the game can import EFT text.'); } };
  const fitOf = id => d.fits.find(f => f.id === id);
  const save = (id, patch) => api.fitlib.update(id, patch).then(r => { if (!r.ok) toast(r.error, true); else { Object.assign(fitOf(id), r.data); if (patch.folder !== undefined && !d.folders.includes(patch.folder) && patch.folder) d.folders.push(patch.folder); } });
  document.querySelectorAll('[data-flname]').forEach(i => i.onchange = () => save(i.dataset.flname, { name: i.value }));
  document.querySelectorAll('[data-flfolder]').forEach(i => i.onchange = () => save(i.dataset.flfolder, { folder: i.value }).then(drawFitLib));
  document.querySelectorAll('[data-flnotes]').forEach(i => i.onchange = () => save(i.dataset.flnotes, { notes: i.value }));
  document.querySelectorAll('[data-flcheck]').forEach(b => b.onclick = () => { fitState.text = fitOf(b.dataset.flcheck).eft; fitState.data = null; fitState.pending = true; state.toolsTab = 't-fit'; go('tools'); });
  document.querySelectorAll('[data-flcopy]').forEach(b => b.onclick = () => { navigator.clipboard.writeText(fitOf(b.dataset.flcopy).eft); toast('Fit copied'); });
  document.querySelectorAll('[data-flgame]').forEach(b => b.onclick = () => { const f = fitOf(b.dataset.flgame); openSaveFitModal({ eft: f.eft, name: f.name, ship: f.ship }); });
  document.querySelectorAll('[data-fldel]').forEach(b => b.onclick = async () => { if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Click again to delete'; return; } await api.fitlib.remove(b.dataset.fldel); d.fits = d.fits.filter(f => f.id !== b.dataset.fldel); drawFitLib(); });
}
