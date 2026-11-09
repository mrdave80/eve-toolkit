// New gunmetal and liquid glass themes: dashboard, a popup and the overlay.
const { app, BrowserWindow, protocol } = require('electron');
const path = require('path'); const fs = require('fs');
const out = path.join(__dirname, 'out', 'themes'); fs.mkdirSync(out, { recursive: true });
const hue = s => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
const svgFor = url => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="4" fill="hsl(${hue(url)},30%,25%)"/><circle cx="16" cy="16" r="7" fill="hsl(${hue(url)},40%,55%)"/></svg>`;
const IDS = (process.env.IDS || 'glass-gunmetal,glass-gunmetal-ember,liquid-glass,liquid-gunmetal,liquid-daylight').split(',');
app.whenReady().then(async () => {
  protocol.handle('https', req => new Response(svgFor(req.url), { headers: { 'content-type': 'image/svg+xml' } }));
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { preload: path.join(__dirname, 'mock-preload.js'), contextIsolation: true, sandbox: false } });
  await win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  win.webContents.on('console-message', (_e, l, m) => { if (l >= 2) console.log('CONSOLE', m); });
  const js = s => win.webContents.executeJavaScript(s).catch(e => console.log('JSERR', e.message));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const snap = async (w, n) => { await wait(1000); fs.writeFileSync(path.join(out, n + '.png'), (await w.webContents.capturePage()).toPNG()); console.log('shot', n); };
  await wait(3000);
  for (const id of IDS) {
    await js(`closeModal(); applyTheme('${id}'); go('dashboard')`); await snap(win, 'n-' + id);
    await js(`openSystemCard('1DQ1-A')`); await snap(win, 'n-' + id + '-popup');
  }
  const ov = new BrowserWindow({ width: 340, height: 460, show: false, backgroundColor: '#2a3340', webPreferences: { preload: path.join(__dirname, 'mock-preload.js'), contextIsolation: true, sandbox: false } });
  await ov.loadFile(path.join(__dirname, '..', '..', 'renderer', 'overlay.html'));
  ov.webContents.on('console-message', (_e, l, m) => { if (l >= 2) console.log('OV', m); });
  await wait(2500);
  for (const id of ['liquid-glass', 'glass-gunmetal']) { await ov.webContents.executeJavaScript(`applyTheme('${id}')`).catch(e => console.log('OVERR', e.message)); await snap(ov, 'ov-' + id); }
  app.quit();
});
