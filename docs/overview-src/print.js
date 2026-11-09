const { app, BrowserWindow } = require('electron'); const fs = require('fs'); const path = require('path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1123, height: 794 });
  await win.loadFile(path.join(__dirname, 'overview.html'));
  await new Promise(r => setTimeout(r, 2500));
  const pdf = await win.webContents.printToPDF({ pageSize: 'A4', landscape: true, printBackground: true, margins: { marginType: 'none' }, preferCSSPageSize: true });
  fs.writeFileSync(path.join(__dirname, 'EVE-Toolkit-App-Overview.pdf'), pdf);
  console.log('pdf', pdf.length); app.quit();
});
