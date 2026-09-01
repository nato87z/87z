'use strict';

const { app, BrowserWindow, ipcMain, shell, globalShortcut, Notification } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { VirtualController } = require('./virtual-controller');

const VIGEM_OFFICIAL_RELEASES = 'https://github.com/nefarius/ViGEmBus/releases/latest';
let mainWindow = null;
let virtualController = null;
let autoUpdater = null;
let updateConfigured = false;
let virtualEnabled = true;
let toggleShortcut = null;

process.on('uncaughtException', error => console.error('[87Z] uncaughtException:', error));
process.on('unhandledRejection', error => console.error('[87Z] unhandledRejection:', error));

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function execWindows(file, args, timeout=5000) {
  return new Promise(resolve => {
    execFile(file,args,{windowsHide:true,timeout,encoding:'utf8'},(error,stdout,stderr)=>resolve({ok:!error,stdout:stdout||'',stderr:stderr||'',code:error?.code??0}));
  });
}

async function getSystemStatus() {
  if (process.platform !== 'win32') return {platform:process.platform,vigem:{installed:false,version:null}};
  const [service,registry] = await Promise.all([
    execWindows('sc.exe',['query','ViGEmBus']),
    execWindows('reg.exe',['query','HKLM\\SOFTWARE\\Nefarius Software Solutions e.U.\\ViGEm Bus Driver','/v','Version'])
  ]);
  const versionMatch=registry.stdout.match(/Version\s+REG_\w+\s+([^\r\n]+)/i);
  return {
    platform:'win32',
    vigem:{installed:service.ok||registry.ok,version:versionMatch?.[1]?.trim()||null}
  };
}

function requestJson(url, redirects=0) {
  return new Promise((resolve,reject)=>{
    const request=https.get(url,{headers:{'User-Agent':'87Z-App','Accept':'application/vnd.github+json'}},response=>{
      if(response.statusCode>=300&&response.statusCode<400&&response.headers.location&&redirects<5){response.resume();return resolve(requestJson(response.headers.location,redirects+1));}
      if(response.statusCode!==200){response.resume();return reject(new Error(`servidor respondeu ${response.statusCode}`));}
      let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>{try{resolve(JSON.parse(body));}catch(_){reject(new Error('resposta inválida do servidor oficial'));}});
    });
    request.setTimeout(20000,()=>request.destroy(new Error('tempo de download esgotado')));request.on('error',reject);
  });
}

function downloadFile(url,target,redirects=0) {
  return new Promise((resolve,reject)=>{
    const request=https.get(url,{headers:{'User-Agent':'87Z-App','Accept':'application/octet-stream'}},response=>{
      if(response.statusCode>=300&&response.statusCode<400&&response.headers.location&&redirects<7){response.resume();return resolve(downloadFile(response.headers.location,target,redirects+1));}
      if(response.statusCode!==200){response.resume();return reject(new Error(`download respondeu ${response.statusCode}`));}
      const total=Number(response.headers['content-length']||0);let received=0;const output=fs.createWriteStream(target);
      response.on('data',chunk=>{received+=chunk.length;send('87z:driver-status',{type:'downloading',percent:total?received/total*100:null});});
      response.pipe(output);output.on('finish',()=>output.close(()=>resolve(target)));output.on('error',reject);response.on('error',reject);
    });
    request.setTimeout(30000,()=>request.destroy(new Error('tempo de download esgotado')));request.on('error',reject);
  });
}

async function installViGEm() {
  if(process.platform!=='win32')return {ok:false,message:'A instalação do ViGEmBus só funciona no Windows.'};
  try {
    send('87z:driver-status',{type:'finding'});
    const release=await requestJson('https://api.github.com/repos/nefarius/ViGEmBus/releases/latest');
    const installer=(release.assets||[]).find(asset=>/vigembus.*\.exe$/i.test(asset.name||''))||(release.assets||[]).find(asset=>/\.exe$/i.test(asset.name||''));
    if(!installer?.browser_download_url)throw new Error('instalador oficial não encontrado');
    const safeName=path.basename(installer.name).replace(/[^a-z0-9._-]/gi,'_');
    const target=path.join(os.tmpdir(),safeName);
    await downloadFile(installer.browser_download_url,target);
    const signature=await execWindows('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command','(Get-AuthenticodeSignature -FilePath $args[0]).Status',target],15000);
    if(!signature.ok||!/^Valid\s*$/im.test(signature.stdout))throw new Error('a assinatura digital do instalador oficial não pôde ser validada');
    send('87z:driver-status',{type:'installing'});
    const result=await execWindows('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command','Start-Process -FilePath $args[0] -Verb RunAs -Wait',target],180000);
    if(!result.ok)throw new Error(result.stderr.trim()||'instalação cancelada ou não concluída');
    const status=await getSystemStatus();
    send('87z:driver-status',{type:status.vigem.installed?'installed':'not-detected'});
    return status.vigem.installed?{ok:true,status}:{ok:false,message:'O instalador terminou, mas o driver ainda não foi detectado. Reinicie o computador e verifique novamente.'};
  } catch(error){send('87z:driver-status',{type:'error',message:error.message});return {ok:false,message:'Não foi possível instalar o ViGEmBus: '+error.message};}
}

function setVirtualEnabled(enabled, source='interface') {
  virtualEnabled=!!enabled;
  try { if(virtualEnabled)virtualController?.start();else virtualController?.stop(); }
  catch(error){send('87z:virtual-status',{connected:false,error:'Falha ao alternar controle: '+error.message});}
  if(source==='shortcut')send('87z:virtual-toggle',{enabled:virtualEnabled,source});
}

function registerToggleShortcut(shortcut) {
  if(typeof shortcut!=='string'||shortcut.length>80)return {ok:false,message:'Atalho inválido.'};
  const previous=toggleShortcut;
  if(previous)globalShortcut.unregister(previous);
  let ok=false;
  try { ok=globalShortcut.register(shortcut,()=>setVirtualEnabled(!virtualEnabled,'shortcut')); } catch(_) { ok=false; }
  if(!ok){
    if(previous){try{globalShortcut.register(previous,()=>setVirtualEnabled(!virtualEnabled,'shortcut'));}catch(_){}}
    return {ok:false,message:'Esse atalho já está sendo usado por outro programa. Escolha outro.',shortcut:previous};
  }
  toggleShortcut=shortcut;
  return {ok:true,shortcut};
}

function readUpdateConfig() {
  try {
    const configPath=path.join(__dirname,'update-config.json');
    const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
    if(config.provider==='github'&&config.owner&&config.repo)return config;
  } catch(error){console.error('[87Z] update-config:',error.message);}
  return null;
}

function configureUpdates() {
  const config=readUpdateConfig();
  if(!config)return;
  try {
    ({autoUpdater}=require('electron-updater'));
    autoUpdater.autoDownload=true;autoUpdater.autoInstallOnAppQuit=true;autoUpdater.autoRunAppAfterInstall=true;
    autoUpdater.setFeedURL({provider:'github',owner:config.owner,repo:config.repo,private:false,channel:config.channel||'latest'});
    autoUpdater.on('checking-for-update',()=>send('87z:update-status',{type:'checking'}));
    autoUpdater.on('update-available',info=>send('87z:update-status',{type:'available',version:info.version}));
    autoUpdater.on('update-not-available',info=>send('87z:update-status',{type:'not-available',version:info.version||app.getVersion()}));
    autoUpdater.on('download-progress',progress=>send('87z:update-status',{type:'downloading',percent:progress.percent||0}));
    autoUpdater.on('update-downloaded',info=>{
      send('87z:update-status',{type:'downloaded',version:info.version});
      if(Notification.isSupported())new Notification({title:'87Z atualizado',body:`A versão ${info.version} está pronta. Abra o 87Z para instalar e reiniciar.`}).show();
    });
    autoUpdater.on('error',error=>send('87z:update-status',{type:'error',message:'Falha na atualização: '+error.message}));
    updateConfigured=true;
  } catch(error){console.error('[87Z] updater:',error.message);}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width:1440,height:900,minWidth:1050,minHeight:680,backgroundColor:'#08090b',autoHideMenuBar:true,
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,preload:path.join(__dirname,'preload.js')}
  });
  mainWindow.loadFile(path.join(__dirname,'index.html'));
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  virtualController = new VirtualController(status=>send('87z:virtual-status',status),input=>send('87z:virtual-input',input));
  mainWindow.on('closed',()=>{virtualController?.stop();virtualController=null;mainWindow=null;});
}

app.whenReady().then(()=>{
  configureUpdates();
  ipcMain.on('87z:set-mappings',(_event,mappings)=>virtualController?.setMappings(mappings||{}));
  ipcMain.on('87z:set-engine',(_event,engine)=>virtualController?.setEngine(engine||{}));
  ipcMain.on('87z:set-virtual-enabled',(_event,enabled)=>setVirtualEnabled(enabled));
  ipcMain.handle('87z:set-toggle-shortcut',(_event,shortcut)=>registerToggleShortcut(shortcut));
  ipcMain.handle('87z:get-system-status',getSystemStatus);
  ipcMain.handle('87z:open-vigem-download',async()=>{await shell.openExternal(VIGEM_OFFICIAL_RELEASES);return {opened:true};});
  ipcMain.handle('87z:install-vigem',installViGEm);
  ipcMain.handle('87z:get-app-info',()=>({version:app.getVersion(),updateConfigured,packaged:app.isPackaged}));
  ipcMain.handle('87z:check-update',async()=>{if(!updateConfigured)return {type:'unconfigured',version:app.getVersion()};if(!app.isPackaged)return {type:'error',message:'Atualizações só podem ser testadas na versão instalada.'};autoUpdater.checkForUpdates().catch(error=>send('87z:update-status',{type:'error',message:'Falha ao verificar: '+error.message}));return {type:'started'};});
  ipcMain.handle('87z:download-update',async()=>{if(!updateConfigured)return {type:'unconfigured'};autoUpdater.downloadUpdate().catch(error=>send('87z:update-status',{type:'error',message:'Falha no download: '+error.message}));return {type:'started-download'};});
  ipcMain.on('87z:install-update',()=>{if(updateConfigured)autoUpdater.quitAndInstall(false,true);});
  createWindow();
  if(updateConfigured&&app.isPackaged)setTimeout(()=>autoUpdater.checkForUpdates().catch(error=>send('87z:update-status',{type:'error',message:'Falha ao verificar: '+error.message})),2500);
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});

app.on('before-quit',()=>{globalShortcut.unregisterAll();virtualController?.stop();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
