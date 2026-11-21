const { app, BrowserWindow, protocol } = require('electron'); const path = require('path');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'mock-preload.js'), contextIsolation: true, sandbox: false } });
  w.webContents.on('console-message', (e, l, m, line, src) => { if (l >= 2) console.log('CONSOLE', m, (src || '').split('/').pop(), line); });
  await w.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  await new Promise(r => setTimeout(r, 3000));
  console.log('typeof toolsGroupOf:', await w.webContents.executeJavaScript('typeof toolsGroupOf'));
  app.quit();
});
