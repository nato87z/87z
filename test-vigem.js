'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
if (process.platform !== 'win32') { console.error('Este teste requer Windows.'); process.exit(2); }
const helper=path.join(__dirname,'vigem-helper.ps1');
const dll=path.join(__dirname,'ViGEmClient.dll');
if(!fs.existsSync(helper)||!fs.existsSync(dll)){console.error('Falta vigem-helper.ps1 ou ViGEmClient.dll. Rode npm install.');process.exit(2)}
console.log('[87Z] Teste Xbox 360 via ViGEm - modo persistente.');
console.log('[87Z] O controle permanecerá conectado até você pressionar Ctrl+C.');
console.log('[87Z] A validação principal é XInput; o nome mostrado pelo joy.cpl pode ser diferente.');
const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-DllPath',dll],{windowsHide:false,stdio:['pipe','pipe','inherit']});
child.stdout.on('data',d=>process.stdout.write(d));
child.on('exit',code=>process.exitCode=code||0);
let held=false;
function sendReport(report){ if(child.stdin.destroyed)return; try{child.stdin.write(JSON.stringify({type:'report',...report})+'\n');}catch(_){} }
const neutral={wButtons:0,bLeftTrigger:0,bRightTrigger:0,sThumbLX:0,sThumbLY:0,sThumbRX:0,sThumbRY:0};
sendReport(neutral);
const keepAlive=setInterval(()=>{ if(child.stdin.destroyed)return; sendReport({wButtons:held?0x1000:0,bLeftTrigger:0,bRightTrigger:0,sThumbLX:0,sThumbLY:0,sThumbRX:0,sThumbRY:0}); },1000);
setTimeout(()=>{ held=true; sendReport({wButtons:0x1000,bLeftTrigger:0,bRightTrigger:0,sThumbLX:0,sThumbLY:0,sThumbRX:0,sThumbRY:0}); console.log('[87Z] Teste: botão A pressionado virtualmente.'); },1200);
function stop(){ clearInterval(keepAlive); try{ if(!child.stdin.destroyed) child.stdin.write(JSON.stringify({type:'stop'})+'\n'); }catch(_){} setTimeout(()=>{try{child.kill()}catch(_){} process.exit(0)},250); }
process.on('SIGINT',stop); process.on('SIGTERM',stop);
child.on('error',()=>clearInterval(keepAlive));
