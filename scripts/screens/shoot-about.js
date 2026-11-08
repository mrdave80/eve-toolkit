const { app, BrowserWindow, protocol } = require('electron'); const path = require('path'); const fs = require('fs');
app.whenReady().then(async () => {
  protocol.handle('https', req => new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="hsl(${[...req.url].reduce((a,c)=>a+c.charCodeAt(0),0)%360},30%,25%)"/><circle cx="50" cy="40" r="17" fill="#998"/><path d="M18 100c2-24 15-36 32-36s30 12 32 36z" fill="#776"/></svg>`, { headers: { 'content-type': 'image/svg+xml' } }));
  const win = new BrowserWindow({ width: 1320, height: 1000, show: false, webPreferences: { preload: path.join(__dirname, 'mock-preload.js'), contextIsolation: true, sandbox: false } });
  await win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  win.webContents.on('console-message', (_e, l, m) => { if (l >= 2) console.log('CONSOLE', m); });
  await new Promise(r => setTimeout(r, 5000));
  await win.webContents.executeJavaScript(`go('about')`); await new Promise(r => setTimeout(r, 1200));
  console.log(await win.webContents.executeJavaScript(`[...document.querySelectorAll('[data-ext]')].map(b=>b.dataset.ext).join(' ')`));
  fs.writeFileSync(path.join(__dirname, 'out', 'about-team.png'), (await win.webContents.capturePage()).toPNG()); app.quit();
});
