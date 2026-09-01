const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { uIOhook } = require('uiohook-napi');
const helper=path.join(__dirname,'vigem-helper.ps1'), dll=path.join(__dirname,'ViGEmClient.dll');
if(process.platform!=='win32') process.exit(2);
const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-DllPath',dll],{stdio:['pipe','pipe','inherit']});
let buf=''; child.stdout.on('data',d=>{buf+=d.toString();let ls=buf.split(/\r?\n/);buf=ls.pop()||'';for(const l of ls){if(l.trim())console.log('[BACKEND]',l)}});
function report(r){child.stdin.write(JSON.stringify({type:'report',...r})+'\n')}
const held=new Set();
function send(){let x=held.has(30)?-1:held.has(32)?1:0;let y=held.has(17)?1:held.has(31)?-1:0; report({wButtons:held.has(57)?0x1000:0,bLeftTrigger:0,bRightTrigger:0,sThumbLX:x*32767,sThumbLY:y*32767,sThumbRX:0,sThumbRY:0}); console.log(`[INPUT] W=${held.has(17)} A=${held.has(30)} S=${held.has(31)} D=${held.has(32)} SPACE=${held.has(57)} -> LX=${x*32767} LY=${y*32767}`)}
uIOhook.on('keydown',e=>{held.add(Number(e.keycode));send()});
uIOhook.on('keyup',e=>{held.delete(Number(e.keycode));send()});
uIOhook.start();
console.log('[87Z] Teste de INPUT REAL. Pressione W/A/S/D e SPACE. Ctrl+C para sair.');
function stop(){try{uIOhook.stop()}catch{} try{child.stdin.write(JSON.stringify({type:'stop'})+'\n')}catch{} setTimeout(()=>process.exit(0),150)}
process.on('SIGINT',stop); process.on('SIGTERM',stop);
