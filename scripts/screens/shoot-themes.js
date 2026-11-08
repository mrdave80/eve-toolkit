const { app, BrowserWindow, protocol } = require('electron');
const path = require('path'); const fs = require('fs');
const out = path.join(__dirname, 'out', 'themes'); fs.mkdirSync(out, { recursive: true });
const hue = s => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
const svgFor = url => url.includes('/portrait')
  ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="hsl(${hue(url)},30%,22%)"/><circle cx="50" cy="40" r="17" fill="hsl(${hue(url)},20%,55%)"/><path d="M18 100c2-24 15-36 32-36s30 12 32 36z" fill="hsl(${hue(url)},20%,45%)"/></svg>`
  : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="4" fill="hsl(${hue(url)},30%,25%)"/><circle cx="16" cy="16" r="7" fill="hsl(${hue(url)},40%,55%)"/></svg>`;
app.whenReady().then(async () => {
  protocol.handle('https', req => new Response(svgFor(req.url), { headers: { 'content-type': 'image/svg+xml' } }));
  const win = new BrowserWindow({ width: 1320, height: 840, show: false, webPreferences: { preload: path.join(__dirname, 'mock-preload.js'), contextIsolation: true, sandbox: false } });
  await win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  win.webContents.on('console-message', (_e, l, m) => { if (l >= 2) console.log('CONSOLE', m); });
  const js = s => win.webContents.executeJavaScript(s).catch(e => console.log('JSERR', e.message));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const snap = async n => { await wait(900); fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG()); console.log('shot', n); };
  await wait(2000);
  const ids = await js(`THEMES.map(t => t.id)`);
  for (const id of ids) { await js(`applyTheme('${id}'); go('char', { charId: 2119000001, tab: 'summary' })`); await snap('t-' + id); }
  await js(`applyTheme('wormhole'); go('wormholes')`); await wait(800); await snap('x-wormhole-map');
  await js(`applyTheme('nullsec'); state.toolsTab='t-route'; go('tools')`); await wait(600); await js(`document.getElementById('rt-go').click()`); await snap('x-nullsec-route');
  await js(`applyTheme('daylight'); go('dashboard')`); await snap('x-daylight-dashboard');
  await js(`api.setSettings({ theme: 'capsuleer' }).then(r => { state.settings = r.data; applyTheme('capsuleer'); go('settings'); })`); await wait(800); await snap('x-appearance');
  await js(`go('about')`); await snap('x-about');
  app.quit();
});
