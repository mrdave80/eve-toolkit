const { app, BrowserWindow, protocol } = require('electron');
const path = require('path'); const fs = require('fs');
const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
const hue = s => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
function svgFor(url) {
  const h = hue(url);
  if (url.includes('/portrait')) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h},35%,28%)"/><stop offset="1" stop-color="hsl(${h},30%,10%)"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="40" r="17" fill="hsl(${h},20%,55%)"/><path d="M18 100c2-24 15-36 32-36s30 12 32 36z" fill="hsl(${h},20%,45%)"/></svg>`;
  if (url.includes('/render')) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0f151c"/><path d="M12 58 L60 40 L88 50 L60 60 Z" fill="#7d8fa3"/><path d="M30 52 L50 30 L58 42 Z" fill="#56677a"/><circle cx="86" cy="50" r="3" fill="#4fd1c5"/></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="4" fill="hsl(${h},30%,25%)"/><circle cx="16" cy="16" r="7" fill="hsl(${h},40%,55%)"/></svg>`;
}
app.whenReady().then(async () => {
  protocol.handle('https', req => new Response(svgFor(req.url), { headers: { 'content-type': 'image/svg+xml' } }));
  const win = new BrowserWindow({ width: 1320, height: 840, show: false, backgroundColor: '#0a0e13',
    webPreferences: { preload: path.join(__dirname, 'mock-preload.js'), contextIsolation: true, sandbox: false } });
  await win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  const js = s => win.webContents.executeJavaScript(s);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const snap = async n => { await wait(900); fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG()); console.log('shot', n); };
  await wait(1500);
  await js(`document.querySelector('[data-view="wormholes"]').click()`); await wait(1500); await snap('w1-map');
  await js(`document.querySelector('.wh-node[data-sys="31000101"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:10,clientY:10,pointerId:1})); document.querySelector('.wh-node[data-sys="31000101"]').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:10,clientY:10,pointerId:1}))`); await wait(700); await snap('w2-system');
  await js(`document.querySelector('.wh-edge[data-conn="c4"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`); await wait(600); await snap('w3-connection');
  await js(`document.querySelector('[data-view="dashboard"]').click()`); await wait(1500); await snap('w4-dashboard-names');
  app.quit();
});
