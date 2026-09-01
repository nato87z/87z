'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({width:1440,height:900,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});
  await win.loadFile(path.join(__dirname,'..','index.html'));
  await new Promise(resolve => setTimeout(resolve,500));
  const image = await win.webContents.capturePage();
  require('fs').writeFileSync(path.join(__dirname,'..','ui-preview.png'),image.toPNG());
  app.quit();
});
