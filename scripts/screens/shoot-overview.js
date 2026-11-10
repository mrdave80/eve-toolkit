// Full feature screenshots for the overview PDF (2x resolution).
const { app, BrowserWindow, protocol } = require('electron');
const path = require('path'); const fs = require('fs');
app.commandLine.appendSwitch('force-device-scale-factor', '2');
const out = path.join(__dirname, 'out', 'overview'); fs.mkdirSync(out, { recursive: true });
const hue = s => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
function svgFor(url) {
  const h = hue(url);
  if (url.includes('/portrait')) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h},35%,28%)"/><stop offset="1" stop-color="hsl(${h},30%,10%)"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="40" r="17" fill="hsl(${h},20%,55%)"/><path d="M18 100c2-24 15-36 32-36s30 12 32 36z" fill="hsl(${h},20%,45%)"/></svg>`;
  if (url.includes('/render')) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0f151c"/><path d="M12 58 L60 40 L88 50 L60 60 Z" fill="#7d8fa3"/><path d="M30 52 L50 30 L58 42 Z" fill="#56677a"/><circle cx="86" cy="50" r="3" fill="#4fd1c5"/></svg>`;
  if (url.includes('/logo')) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="hsl(${h},35%,30%)"/><path d="M8 22 L16 8 L24 22 Z" fill="hsl(${h},45%,65%)"/></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="4" fill="hsl(${h},30%,25%)"/><circle cx="16" cy="16" r="7" fill="hsl(${h},40%,55%)"/></svg>`;
}
const R = 2119000001;
const SHOTS = [
  ['01-dashboard', `go('dashboard')`],
  ['02-summary', `go('char', { charId: ${R}, tab: 'summary' })`],
  ['03-queue', `go('char', { charId: ${R}, tab: 'queue' })`, `document.querySelector('[data-qskill]')?.click()`],
  ['04-planner', `go('char', { charId: ${R}, tab: 'plan' })`, `showCanFly({id:12005,name:'Ishtar'}, null)`],
  ['05-training-board', `go('trainingAll')`],
  ['06-industry-board', `go('industryAll')`],
  ['07-planets-board', `go('planetsAll')`],
  ['08-wallet', `go('char', { charId: ${R}, tab: 'wallet' })`],
  ['09-assets', `go('char', { charId: ${R}, tab: 'assets' })`],
  ['10-pi-planner', `go('piPlanner')`, `(() => { const tp=[6,450,9000,75000,1300000]; for (const [n,t] of Object.entries(piState.types)) t.price = tp[PI.items[n].tier] * (0.8 + (n.length % 7) / 10); drawPi(); })()`],
  ['11-wormholes', `go('wormholes')`],
  ['12-market', `state.toolsTab='t-market'; go('tools')`, `toolState.market.typeId=2185; tMarket()`],
  ['13-appraisal', `state.toolsTab='t-appraisal'; go('tools')`, `document.getElementById('ap-text').value='Ishtar\\nHammerhead II x10\\nTritanium 10000\\nWarrior II x10'; document.getElementById('ap-go').click()`],
  ['14-lp-store', `state.toolsTab='t-lp'; go('tools')`, `document.getElementById('lp-manual').value='1000035'; document.getElementById('lp-go').click()`],
  ['15-build', `state.toolsTab='t-build'; go('tools')`, `toolState.build.productTypeId=2185; runBuild()`],
  ['80-route-expand', `closeModal(); state.toolsTab='t-route'; go('tools')`, `(async()=>{document.getElementById('rt-go').click(); await new Promise(r=>setTimeout(r,700)); document.querySelector('tr.xrow td:nth-child(4)').click();})()`],
  ['81-fit-expand', `closeModal(); fitState.text='[Ishtar, Sentry Ishtar]'; fitState.data=null; state.toolsTab='t-fit'; go('tools')`, `(async()=>{document.getElementById('ft-go').click(); await new Promise(r=>setTimeout(r,700)); document.querySelector('#ft-out tr.xrow td:nth-child(2)').click();})()`],
  ['16-route', `state.toolsTab='t-route'; go('tools')`, `document.getElementById('rt-go').click()`],
  ['82-courier-expand', `closeModal(); state.toolsTab='t-courier'; go('tools')`, `(async()=>{document.getElementById('cc-from').value='Jita'; document.getElementById('cc-go').click(); await new Promise(r=>setTimeout(r,700)); document.querySelector('#cc-out tr.xrow td:nth-child(3)').click();})()`],
  ['17-courier', `state.toolsTab='t-courier'; go('tools')`, `(async()=>{document.getElementById('cc-from').value='Jita'; document.getElementById('cc-go').click(); await new Promise(r=>setTimeout(r,700)); document.querySelectorAll('[data-cc-check]')[2]?.click();})()`],
  ['18-jump', `state.toolsTab='t-jump'; go('tools')`, `document.getElementById('jp-go')?.click()`],
  ['19-universe', `state.toolsTab='t-universe'; go('tools')`],
  ['20-pilot-intel', `openPilot('Ben Dover')`],
  ['84-pilot-kill-expand', `closeModal(); openPilot('Ben Dover')`, `(async()=>{await new Promise(r=>setTimeout(r,700)); const r=document.querySelector('#pv-out tr.xrow td:nth-child(5)'); r && r.click(); r && r.closest('.panel').scrollIntoView();})()`],
  ['21-spy-check', `openPilot('Ben Dover')`, `document.getElementById('pv-vet').click()`, `document.getElementById('pv-vet-out').scrollIntoView()`],
  ['22-local', `updateClipBadge(true); state.toolsTab='t-local'; go('tools')`, `(async()=>{document.getElementById('lc-clip').checked=true; document.getElementById('lc-go').click(); await new Promise(r=>setTimeout(r,600)); document.getElementById('lc-zk').click();})()`],
  ['23-intel-watch', `state.toolsTab='t-intel'; go('tools')`],
  ['24-combat', `state.toolsTab='t-combat'; go('tools')`, `intelState.combat=[{ who: 'Wayne Kerr', dpsOut: 742, dpsOut60: 655, dpsIn: 318, dpsIn60: 240, repIn: 0, totals: { out: 184220, in: 61340 }, topTargets: [['Ben Dover (Loki)', 92310], ['Hugh Mungus (Catalyst)', 51200], ['Phil McCracken (Sabre)', 40710]], topWeapons: [['Hammerhead II', 101300], ['Heavy Neutron Blaster II', 82920]], last: [{ kind: 'out', amount: 412, other: 'Ben Dover', weapon: 'Heavy Neutron Blaster II', quality: 'Smashes' }, { kind: 'in', amount: 238, other: 'Hugh Mungus', weapon: 'Void M', quality: 'Hits' }, { kind: 'out', amount: 96, other: 'Ben Dover', weapon: 'Hammerhead II', quality: 'Hits' }] }]; drawCombat()`],
  ['25-networth', `state.toolsTab='t-networth'; go('tools')`],
  ['26-income', `state.toolsTab='t-income'; go('tools')`],
  ['27-corp-overview', `state.corpTab='c-overview'; corpState.directors=null; go('corp')`],
  ['28-corp-members', `state.corpTab='c-members'; corpState.directors=null; go('corp')`],
  ['29-corp-structures', `state.corpTab='c-structures'; corpState.directors=null; go('corp')`],
  ['30-corp-moontax', `state.corpTab='c-moontax'; corpState.directors=null; go('corp')`, `document.getElementById('mt-go')?.click()`],
  ['31-corp-doctrines', `state.corpTab='c-doctrines'; corpState.directors=null; go('corp')`],
  ['32-corp-ops', `state.corpTab='c-ops'; corpState.directors=null; go('corp')`],
  ['33-corp-timers', `state.corpTab='c-timers'; corpState.directors=null; go('corp')`],
  ['34-corp-srp', `state.corpTab='c-srp'; corpState.directors=null; go('corp')`],
  ['35-corp-hr', `state.corpTab='c-hr'; corpState.directors=null; go('corp')`],
  ['36-corp-discord', `state.corpTab='c-discord'; corpState.directors=null; go('corp')`],
  ['37-settings', `try{localStorage.removeItem('settingsOpen')}catch{}; go('settings')`],
  ['38-settings-phone', `go('settings')`, `openSettingsSection('phone')`],
  ['39-about', `go('about')`],
  ['40-fats', `state.corpTab='c-fats'; corpState.directors=null; go('corp')`],
  ['41-mining', `go('char', { charId: ${R}, tab: 'mining' })`],
  ['52-daily', `go('daily')`],
  ['53-farm', `state.toolsTab='t-farm'; go('tools')`],
  ['54-insure', `state.toolsTab='t-insure'; go('tools')`],
  ['55-trade', `state.toolsTab='t-trade'; go('tools')`],
  ['77-trade-expand', `closeModal(); state.toolsTab='t-trade'; go('tools')`, `document.querySelector('tr.xrow td:nth-child(2)').click()`],
  ['56-moon', `moonState.text='Moon\\tMoon Product\\tQuantity\\tOre TypeID\\tSolarSystemID\\tPlanetID\\tMoonID\\nT5ZI-S VII - Moon 3\\n\\tXenotime\\t0.22\\t45510\\t30004765\\t40302460\\t40302471'; state.toolsTab='t-moon'; go('tools')`, `document.getElementById('mn-go').click()`],
  ['58-items', `state.toolsTab='t-items'; go('tools')`, `document.getElementById('it-q').value='ish'; document.getElementById('it-q').dispatchEvent(new Event('input'))`, `openItem(12005)`, `document.getElementById('it-fly').click()`],
  ['59-bargains', `bargainState.data=null; state.toolsTab='t-bargain'; go('tools')`, `document.getElementById('bg-go').click()`],
  ['60-charvalue', `state.toolsTab='t-charval'; go('tools')`],
  ['61-start', `state.settings.onboardingDone = false; state.settings.usedSearch = false; go('dashboard')`],
  ['62-search', `state.settings.onboardingDone = true; go('dashboard')`, `openSearch(); const i = document.getElementById('sp-q'); i.value = 'moon'; i.dispatchEvent(new Event('input'))`],
  ['63-nearby-planets', `state.piTab='near'; nearState.data=null; nearState.pilots=null; nearState.types=['Barren','Temperate']; go('piPlanner')`, `document.getElementById('np-go').click()`],
  ['64-fit', `fitState.text='[Ishtar, Sentry Ishtar]'; fitState.data=null; state.toolsTab='t-fit'; go('tools')`, `document.getElementById('ft-go').click()`],
  ['65-wh-share', `go('wormholes')`, `document.getElementById('wh-share').click()`, `document.getElementById('whs-code').click()`],
  ['66-fit-appraise', `fitState.text='[Ishtar, Sentry Ishtar]'; fitState.data=null; state.toolsTab='t-fit'; go('tools')`, `document.getElementById('ft-go').click()`, `document.getElementById('ft-appraise').click()`],
  ['67-sde-prompt', `go('dashboard'); __mock.sdeCheck({ state: 'incomplete', build: 3419624 }); sdePromptState.asked = false; checkGameDataOnStart()`],
  ['70-pop-pilot', `go('dashboard')`, `openPilotCard('Ben Dover')`],
  ['71-pop-item', `closeModal(); go('dashboard')`, `openItemCard(12005)`],
  ['72-pop-system', `closeModal()`, `openSystemCard('1DQ1-A')`],
  ['73-pop-route', `closeModal()`, `openRouteCard('Jita', 'Tama')`],
  ['74-pop-whres', `closeModal()`, `openWhResCard('J123450')`],
  ['75-pop-fit', `closeModal()`, `openFitCard('[Ishtar, Sentry Ishtar]')`],
  ['76-pop-wsystem', `closeModal()`, `openSystemCard('J152701')`],
  ['85-update', `go('dashboard'); showUpdateBanner({ version: '1.9.1', canInstall: true, url: 'https://github.com/mrdave80/eve-toolkit/releases/latest', notes: '## EVE Toolkit 1.9.1\\n- Fit checker: damage, tank and capacitor with your skills\\n- Price alerts: a watchlist with Windows and phone alerts\\n- One-click updates' })`, `openUpdateModal({ version: '1.9.1', canInstall: true, url: 'https://github.com/mrdave80/eve-toolkit/releases/latest', notes: '## EVE Toolkit 1.9.1\\n- Fit checker: damage, tank and capacitor with your skills\\n- Price alerts: a watchlist with Windows and phone alerts\\n- One-click updates' }, false).then(() => { updState.st = { phase: 'downloading', pct: 62 }; drawUpdateProgress(); })`],
  ['57-whinfo', `go('wormholes')`, `whState.sel = { type: 'sys', id: 31000101 }; drawCanvas(); drawSide()`],
  ['42-livemap', `go('liveMap')`, `mapState.sel = 30004765; mapState.heat = 'ship'; drawMap()`],
  ['43-livemap-sov', `mapState.heat = 'sov'; mapState.sel = null; drawMap()`],
  ['44-hunting', `huntState.mode='hunt'; huntState.result=null; state.toolsTab='t-hunt'; go('tools')`, `document.getElementById('hn-from').value='T5ZI-S'; document.getElementById('hn-go').click()`, `document.querySelector('[data-hn-deep]').click()`],
  ['45-ratting', `huntState.mode='rat'; huntState.result=null; tHunt()`, `document.getElementById('hn-from').value='T5ZI-S'; document.getElementById('hn-go').click()`],
  ['46-whres', `state.toolsTab='t-whres'; go('tools')`, `document.getElementById('wr-q').value='J123450'; document.getElementById('wr-go').click()`],
  ['47-pve', `state.toolsTab='t-pve'; go('tools')`],
  ['83-pve-expand', `closeModal(); state.toolsTab='t-pve'; go('tools')`, `(async()=>{await new Promise(r=>setTimeout(r,700)); const rs=document.querySelectorAll('tr.xrow'); rs[0]?.querySelector('td:nth-child(2)').click(); rs[rs.length-1]?.querySelector('td:nth-child(3)').click();})()`],
  ['48-shame', `state.toolsTab='t-shame'; go('tools')`, `document.getElementById('sh-go').click()`],
  ['78-shame-expand', `closeModal(); state.toolsTab='t-shame'; go('tools')`, `(async()=>{document.getElementById('sh-go').click(); await new Promise(r=>setTimeout(r,600)); document.querySelector('details.shame-more').open=true;})()`],
  ['79-bargain-expand', `closeModal(); bargainState.data=null; state.toolsTab='t-bargain'; go('tools')`, `(async()=>{document.getElementById('bg-go').click(); await new Promise(r=>setTimeout(r,600)); document.querySelector('tr.xrow td:nth-child(3)').click();})()`],
  ['49-speech', `go('settings')`, `openSettingsSection('speech')`],
  ['50-route-bridges', `state.toolsTab='t-route'; go('tools')`, `document.querySelector('[name="rt-jb"]').checked=true; document.getElementById('rt-jbm').click()`, `void 0`]
];
const THEMES = ['capsuleer', 'concord', 'amarr', 'caldari', 'gallente', 'minmatar', 'nullsec', 'wormhole', 'abyssal', 'industrialist', 'daylight', 'glass-nebula', 'glass-ice', 'glass-drifter', 'glass-solar', 'glass-daylight', 'glass-gunmetal', 'glass-gunmetal-ember', 'liquid-glass', 'liquid-gunmetal', 'liquid-daylight'];
app.whenReady().then(async () => {
  protocol.handle('https', req => new Response(svgFor(req.url), { headers: { 'content-type': 'image/svg+xml' } }));
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, backgroundColor: '#0a0e13', webPreferences: { preload: path.join(__dirname, 'mock-preload.js'), contextIsolation: true, sandbox: false } });
  await win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  win.webContents.on('console-message', (_e, l, m) => { if (l >= 2) console.log('CONSOLE', m); });
  const js = s => win.webContents.executeJavaScript(s).catch(e => console.log('JSERR', e.message, s.slice(0, 60)));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const snap = async n => { await wait(1100); fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG()); console.log('shot', n); };
  await wait(5000);
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  for (const [name, ...steps] of SHOTS) {
    if (only && !only.some(o => name.startsWith(o))) continue;
    await js(`typeof closeModal === 'function' && closeModal(); typeof closeSearch === 'function' && closeSearch()`);
    for (const s of steps) { await js(s); await wait(900); }
    await snap(name);
  }
  await js(`closeModal && closeModal()`);
  if (!only || only.includes('51')) {
    const ov = new BrowserWindow({ width: 340, height: 500, show: false, transparent: true, frame: false, backgroundColor: '#00000000', webPreferences: { preload: path.join(__dirname, 'mock-preload.js'), contextIsolation: true, sandbox: false } });
    await ov.loadFile(path.join(__dirname, '..', '..', 'renderer', 'overlay.html')); await wait(2500);
    await ov.webContents.executeJavaScript(`S.reports = [{ at: new Date(Date.now()-60e3).toISOString(), text: 'Kedama  Ben Dover Loki +3 gate to Tama', alert: true, closest: { name: 'K-6K16', near: { jumps: 2 } }, top: { name: 'Ben Dover', level: 'Extreme', tone: 'red' } }, { at: new Date(Date.now()-9*60e3).toISOString(), text: 'Y-2ANO clr', closest: { name: 'Y-2ANO', near: { jumps: 3 } } }]; S.local=[{ at: new Date().toISOString(), system: '1DQ1-A', level: 'High', alert: true, pilot: { name: 'Hugh Mungus', tone: 'red' } }]; S.spikes=[{ system: 'QY6-RK', security: -0.85, zone: 'ns', shipKills: 12, near: { jumps: 2 } }]; render();`);
    await wait(1000); fs.writeFileSync(path.join(out, '51-overlay.png'), (await ov.webContents.capturePage()).toPNG()); console.log('shot 51-overlay');
  }
  if (!only) for (const t of THEMES) { await js(`applyTheme('${t}'); go('char', { charId: ${R}, tab: 'summary' })`); await snap('theme-' + t); }
  app.quit();
});
