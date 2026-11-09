// Visits every view/tab with mock data and reports visible text that looks like leaked HTML.
const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#345"/></svg>';
const TOOLS_EXTRA = 1; const CHAR = ['summary','corp','standings','contacts','medals','queue','training','skills','plan','industry','blueprints','planets','mining','research','wallet','orders','contracts','loyalty','mail','notifications','calendar','assets','clones','fittings','kills'];
const TOOLS = ['t-pilot','t-whres','t-shame','t-market','t-appraisal','t-orders','t-arbitrage','t-lp','t-build','t-invent','t-reprocess','t-route','t-courier','t-hunt','t-jump','t-universe','t-intel','t-local','t-combat','t-networth','t-income','t-pve','t-farm','t-insure','t-trade','t-moon','t-items','t-bargain','t-charval'];
const CORP = ['c-overview','c-members','c-compliance','c-audit','c-structures','c-moons','c-moontax','c-pos','c-wallets','c-contracts','c-orders','c-buyback','c-industry','c-assets','c-blueprints','c-doctrines','c-ops','c-fleet','c-fats','c-timers','c-kills','c-srp','c-hr','c-discord','c-share'];
const EXTRA = {
  't-build': `toolState.build.productTypeId=2185; runBuild()`,
  't-market': `toolState.market.typeId=2185; tMarket()`,
  't-route': `document.getElementById('rt-go')?.click()`,
  't-jump': `document.getElementById('jp-go')?.click()`,
  't-invent': `document.getElementById('inv-go')?.click()`,
  't-reprocess': `document.getElementById('rp-go')?.click()`,
  't-lp': `document.querySelector('#content button.primary')?.click()`,
  't-arbitrage': `document.querySelector('#content button.primary')?.click()`,
  't-appraisal': `(()=>{const t=document.querySelector('#content textarea'); if(t){t.value='Tritanium 1000\\nRifter 2'; document.querySelector('#content button.primary')?.click();}})()`,
  't-local': `(async()=>{document.getElementById('lc-go').click(); await new Promise(r=>setTimeout(r,500)); document.getElementById('lc-zk').click();})()`,
  't-courier': `(async()=>{document.getElementById('cc-from').value='Jita'; document.getElementById('cc-go').click(); await new Promise(r=>setTimeout(r,600)); document.querySelector('[data-cc-check]')?.click();})()`,
  't-hunt': `(()=>{document.getElementById('hn-from').value='T5ZI-S'; document.getElementById('hn-go').click();})()`,
  't-whres': `(()=>{document.getElementById('wr-q').value='J123450'; document.getElementById('wr-go').click();})()`,
  't-shame': `document.getElementById('sh-go').click()`,
  't-pilot': `(()=>{document.getElementById('pv-q').value='Ben Dover'; document.getElementById('pv-go').click();})()`,
};
app.whenReady().then(async () => {
  protocol.handle('https', () => new Response(svg, { headers: { 'content-type': 'image/svg+xml' } }));
  const win = new BrowserWindow({ width: 1400, height: 900, show: false,
    webPreferences: { preload: path.join(__dirname, 'mock-preload.js'), contextIsolation: true, sandbox: false } });
  await win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  win.webContents.on('console-message', (_e, l, m, line, src) => { if (l >= 2) console.log('CONSOLE', m, (src || '').split('/').pop(), line); });
  const js = s => win.webContents.executeJavaScript(s).catch(e => console.log('JSERR', e.message, '::', s.slice(0, 60)));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const check = async label => {
    await wait(900);
    const r = await js(`(()=>{
      const t = document.body.innerText;
      const bad = t.match(/<\\/?(span|div|b|i|a|td|tr|br|small|strong|em|img|svg|p)\\b[^\\n]{0,40}|&(amp|lt|gt|quot|#39);|\\[object Object\\]|\\bundefined\\b|\\bNaN\\b/g) || [];
      const attrs = [...document.querySelectorAll('[title],[placeholder]')].map(e=>e.title+' '+e.placeholder).join(' ').match(/<\\/?(span|div|b)\\b|&(amp|lt|gt|quot);|\\[object Object\\]/g) || [];
      return [...new Set(bad.concat(attrs))].slice(0,6);
    })()`);
    console.log((r && r.length ? 'BAD ' : 'ok  ') + label + (r && r.length ? '  ' + JSON.stringify(r) : ''));
  };
  await wait(2000);
  await js(`state.piTab='near'; go('piPlanner')`); await check('piNear'); await js(`state.piTab='plan'`);
  for (const v of ['dashboard','trainingAll','industryAll','planetsAll','piPlanner','wormholes','liveMap','daily','settings','about']) { await js(`go('${v}')`); await check(v); }
  // PI planner with a target so the BOM table renders
  await js(`go('piPlanner')`); await wait(800);
  await js(`(()=>{const s=document.querySelector('#content select'); if(s){s.value=[...s.options].find(o=>/Nano-Factory/.test(o.text))?.value||s.value; s.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
  await check('piPlanner+target');
  for (const c of [2119000001, 2119000004, 2119000005]) for (const t of CHAR) { await js(`go('char',{charId:${c},tab:'${t}'})`); await check('char:' + c + ':' + t); }
  await js(`go('char',{charId:2119000001,tab:'summary'})`); await wait(800);
  await js(`document.querySelectorAll('[data-qtoggle], .queue-toggle, .q-expand').forEach(e=>e.click())`); await check('summary+queue-expanded');
  for (const t of TOOLS) { await js(`state.toolsTab='${t}'; go('tools')`); await wait(700); if (EXTRA[t]) { await js(EXTRA[t]); await wait(700); } await check('tools:' + t); }
  for (const t of CORP) { await js(`state.corpTab='${t}'; corpState.directors=null; go('corp')`); await wait(900); await check('corp:' + t); }
  app.quit();
});
