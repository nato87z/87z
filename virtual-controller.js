'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { uIOhook } = require('uiohook-napi');
const { KEY_CODES, keyTarget, mouseTarget, axisFromKeys } = require('./input-utils');

const VIGEM_CLIENT_URL = 'https://unpkg.com/vigemclient@1.5.3/native/x64/ViGEmClient.dll';
const VIGEM_CLIENT_SHA256 = '96b3e40f6ef9e2698d7bb37d0a20fd77ad947714c3463b986580d3b307b3a1ca';

const DEFAULT_ENGINE = {
  axisX: 3200, axisY: 3000, curveH: 1.25, curveV: 1.35,
  filterH: 0.65, filterV: 0.75, accel: 0.2
};

const BUTTONS = {
  UP: 0x0001, DOWN: 0x0002, LEFT: 0x0004, RIGHT: 0x0008,
  START: 0x0010, BACK: 0x0020, LEFT_THUMB: 0x0040, RIGHT_THUMB: 0x0080,
  LEFT_SHOULDER: 0x0100, RIGHT_SHOULDER: 0x0200, GUIDE: 0x0400,
  A: 0x1000, B: 0x2000, X: 0x4000, Y: 0x8000
};

const CONTROL_TO_X360 = {
  'TRIÂNGULO': 'Y', 'CÍRCULO': 'B', 'X': 'A', 'QUADRADO': 'X',
  'L1': 'LEFT_SHOULDER', 'R1': 'RIGHT_SHOULDER', 'L2': 'LEFT_TRIGGER', 'R2': 'RIGHT_TRIGGER',
  'SHARE': 'BACK', 'OPTIONS': 'START', 'L3': 'LEFT_THUMB', 'R3': 'RIGHT_THUMB', 'TOUCHPAD': 'GUIDE',
  'D-UP': 'UP', 'D-DOWN': 'DOWN', 'D-LEFT': 'LEFT', 'D-RIGHT': 'RIGHT'
};

class VirtualController {
  constructor(onStatus, onInput, options={}) {
    this.onStatus = onStatus || (() => {});
    this.onInput = onInput || (() => {});
    this.dataDir = options.dataDir || __dirname;
    this.helper = null; this.helperReady = false; this.running = false; this.stopping = false; this.restartTimer = null;
    this.mappings = {}; this.engine = { ...DEFAULT_ENGINE };
    this.keysDown = new Set(); this.mouseButtonsDown = new Set(); this.hooksInstalled = false; this.heartbeatTimer = null;
    this.left = { x: 0, y: 0 }; this.right = { x: 0, y: 0 };
    this.dpad = {up:false,down:false,left:false,right:false};
    this.rightVelocity = { x: 0, y: 0 }; this.rightTarget = { x: 0, y: 0 }; this.lastMouse = null; this.decayTimer = null;
    this.report = { wButtons: 0, bLeftTrigger: 0, bRightTrigger: 0, sThumbLX: 0, sThumbLY: 0, sThumbRX: 0, sThumbRY: 0 };
    this.lastReportJson = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.stopping = false;
    this.startViGEmHelper().catch(error=>this.onStatus({connected:false,error:'Não foi possível preparar o componente do controle virtual: '+error.message}));
    this.installHooks();
    this.decayTimer = setInterval(() => this.tickRightStick(), 8);
    this.heartbeatTimer = setInterval(() => this.sendReport(), 250);
  }

  fileSha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

  downloadClient(url,target,redirects=0) {
    return new Promise((resolve,reject)=>{
      const request=https.get(url,{headers:{'User-Agent':'87Z-App/0.4.0'}},response=>{
        if(response.statusCode>=300&&response.statusCode<400&&response.headers.location&&redirects<6){response.resume();return resolve(this.downloadClient(new URL(response.headers.location,url).toString(),target,redirects+1));}
        if(response.statusCode!==200){response.resume();return reject(new Error(`download respondeu ${response.statusCode}`));}
        const temp=target+'.download';const output=fs.createWriteStream(temp);response.pipe(output);
        output.on('finish',()=>output.close(()=>{try{if(this.fileSha256(temp)!==VIGEM_CLIENT_SHA256)throw new Error('componente recebido não passou na verificação de segurança');fs.renameSync(temp,target);resolve(target);}catch(error){try{fs.unlinkSync(temp);}catch(_){}reject(error);}}));
        output.on('error',reject);response.on('error',reject);
      });
      request.setTimeout(30000,()=>request.destroy(new Error('tempo de download esgotado')));request.on('error',reject);
    });
  }

  async ensureViGEmClient() {
    const runtimeDir=path.join(this.dataDir,'runtime');fs.mkdirSync(runtimeDir,{recursive:true});
    const dll=path.join(runtimeDir,'ViGEmClient.dll');
    if(fs.existsSync(dll)&&this.fileSha256(dll)===VIGEM_CLIENT_SHA256)return dll;
    try{if(fs.existsSync(dll))fs.unlinkSync(dll);}catch(_){}
    this.onStatus({connected:false,message:'Baixando o componente oficial do controle virtual…'});
    return this.downloadClient(VIGEM_CLIENT_URL,dll);
  }

  async startViGEmHelper() {
    if (process.platform !== 'win32') {
      this.onStatus({ connected:false, error:'O emulador Xbox 360 só funciona no Windows.' });
      return;
    }
    const helper = path.join(__dirname, 'vigem-helper.ps1');
    const dll = await this.ensureViGEmClient();
    if(!this.running||this.stopping)return;
    if (!fs.existsSync(helper)) return this.onStatus({ connected:false, error:'vigem-helper.ps1 não encontrado.' });

    this.helper = spawn('powershell.exe', [
      '-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-DllPath',dll
    ], { windowsHide:true, stdio:['pipe','pipe','pipe'] });

    let buffer = '';
    this.helper.stdout.on('data', data => {
      buffer += data.toString('utf8');
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'status') {
            this.helperReady = !!msg.connected;
            this.onStatus(msg.connected
              ? { connected:true, type:'Xbox 360 Controller (XInput)', vid:msg.vid || '0x045E', pid:msg.pid || '0x028E', attached:msg.attached !== false, xinput:msg.xinput || [], devices:msg.devices || [], message:msg.message }
              : { connected:false, reconnecting:this.running && !this.stopping, xinput:msg.xinput || [], devices:msg.devices || [], error:msg.error || 'Emulador Xbox 360 desconectado.' });
            if (this.helperReady) this.sendReport(true);
          } else if (msg.type === 'diagnostic') {
            this.onStatus({ connected:this.helperReady, diagnostic:true, attached:!!msg.attached, xinput:msg.xinput || [], devices:msg.devices || [] });
          }
        } catch (_) {}
      }
    });
    let errBuffer = '';
    this.helper.stderr.on('data', data => { errBuffer += data.toString(); });
    this.helper.on('error', err => {
      this.helperReady = false;
      this.onStatus({ connected:false, error:'Falha ao iniciar o backend ViGEm: '+err.message });
    });
    this.helper.on('exit', (code) => {
      this.helperReady = false;
      this.helper = null;
      if (this.stopping || !this.running) return;
      const detail = errBuffer.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0];
      this.onStatus({connected:false, reconnecting:true, error:detail || `Backend ViGEm encerrou (código ${code}). Tentando reconectar...`});
      clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => {
        if (this.running && !this.stopping) this.startViGEmHelper().catch(error=>this.onStatus({connected:false,error:'Falha ao reconectar: '+error.message}));
      }, 1200);
    });
    this.helper.on('close', () => {
      this.helperReady = false;
    });
  }

  installHooks() {
    if (this.hooksInstalled) return;
    try {
      uIOhook.on('keydown', this.handleKeyDown); uIOhook.on('keyup', this.handleKeyUp);
      uIOhook.on('mousedown', this.handleMouseDown); uIOhook.on('mouseup', this.handleMouseUp);
      uIOhook.on('mousemove', this.handleMouseMove);
      uIOhook.start();
      this.hooksInstalled = true;
    } catch (error) {
      this.onStatus({connected:this.helperReady, nativeInput:false, error:'Captura global de teclado/mouse indisponível: '+error.message});
      console.error('[87Z] uIOhook:', error);
    }
  }

  setMappings(mappings) {
    for (const control of Object.keys(CONTROL_TO_X360)) {
      this.setControl(control, false, false);
    }
    this.mappings = { ...mappings };
    this.applyAllDigitalState();
    this.sendReport(true);
  }
  setEngine(engine) { this.engine = { ...DEFAULT_ENGINE, ...(engine || {}) }; }
  keyTarget(keycode) { return keyTarget(keycode); }

  handleKeyDown = (event) => {
    const key = this.keyTarget(event.keycode); if (!key) return;
    this.keysDown.add(key);
    if (['W','A','S','D'].includes(key)) this.updateLeftStick();
    this.applyMappedKey(key, true); this.emit('key', {key, down:true});
  };
  handleKeyUp = (event) => {
    const key = this.keyTarget(event.keycode); if (!key) return;
    this.keysDown.delete(key);
    if (['W','A','S','D'].includes(key)) this.updateLeftStick();
    this.applyMappedKey(key, false); this.emit('key', {key, down:false});
  };
  handleMouseDown = (event) => { const b = Number(event.button); this.mouseButtonsDown.add(b); this.applyMappedMouse(b,true); this.emit('mouse',{button:b,down:true}); };
  handleMouseUp = (event) => { const b = Number(event.button); this.mouseButtonsDown.delete(b); this.applyMappedMouse(b,false); this.emit('mouse',{button:b,down:false}); };

  handleMouseMove = (event) => {
    if (this.lastMouse) {
      const rawDx = Number(event.x||0)-this.lastMouse.x, rawDy = Number(event.y||0)-this.lastMouse.y;
      if(Math.abs(rawDx)>300||Math.abs(rawDy)>300){this.lastMouse={x:Number(event.x||0),y:Number(event.y||0)};return;}
      const sx = Math.max(0.05, Number(this.engine.axisX||3200)/5000), sy = Math.max(0.05, Number(this.engine.axisY||3000)/5000);
      const ch = Math.max(0.2, Number(this.engine.curveH||1)), cv = Math.max(0.2, Number(this.engine.curveV||1));
      const accel = Math.max(0, Number(this.engine.accel||0));
      const dx = Math.sign(rawDx)*Math.pow(Math.min(1,Math.abs(rawDx)/24),ch);
      // No XInput, Y positivo aponta para cima; coordenadas de tela crescem para baixo.
      const dy = -Math.sign(rawDy)*Math.pow(Math.min(1,Math.abs(rawDy)/24),cv);
      const gain = 0.95*(1+accel*0.08);
      this.rightTarget.x = Math.max(-1,Math.min(1,dx*sx*gain));
      this.rightTarget.y = Math.max(-1,Math.min(1,dy*sy*gain));
    }
    this.lastMouse={x:Number(event.x||0),y:Number(event.y||0)};
  };

  tickRightStick() {
    const fh=Math.max(0.02,Number(this.engine.filterH||0.65)), fv=Math.max(0.02,Number(this.engine.filterV||0.75));
    const smoothX=Math.max(0.08,Math.min(0.95,1-fh*0.18)), smoothY=Math.max(0.08,Math.min(0.95,1-fv*0.18));
    this.rightVelocity.x += (this.rightTarget.x-this.rightVelocity.x)*smoothX;
    this.rightVelocity.y += (this.rightTarget.y-this.rightVelocity.y)*smoothY;
    this.rightTarget.x*=0.58; this.rightTarget.y*=0.58;
    if (Math.abs(this.rightVelocity.x)<0.001 && Math.abs(this.rightVelocity.y)<0.001 && Math.abs(this.rightTarget.x)<0.001 && Math.abs(this.rightTarget.y)<0.001) {
      this.rightVelocity={x:0,y:0}; this.rightTarget={x:0,y:0}; this.right={x:0,y:0};
      this.writeAxis('rightX',0,false); this.writeAxis('rightY',0,false); this.sendReport(); return;
    }
    this.right.x=this.rightVelocity.x; this.right.y=this.rightVelocity.y;
    this.writeAxis('rightX',this.right.x,false); this.writeAxis('rightY',this.right.y,false); this.sendReport();
  }

  updateLeftStick() {
    const x=axisFromKeys(this.keysDown,'A','D'), y=axisFromKeys(this.keysDown,'S','W');
    this.left={x,y}; this.writeAxis('leftX',x,false); this.writeAxis('leftY',y,false); this.sendReport(); this.emit('stick',{stick:'LEFT',x,y});
  }
  applyMappedKey(key,pressed){ for(const [control,target] of Object.entries(this.mappings)) if(target===key) this.setControl(control,pressed); }
  applyMappedMouse(button,pressed){ const target=mouseTarget(button); if(!target)return; for(const [control,mapping] of Object.entries(this.mappings)) if(mapping===target) this.setControl(control,pressed); }
  applyAllDigitalState(){ for(const [control,target] of Object.entries(this.mappings)){ let p=false; if(typeof target==='string'&&target.startsWith('MOUSE ')) p=[...this.mouseButtonsDown].some(button=>mouseTarget(button)===target); else if(target&&KEY_CODES[target]!==undefined) p=this.keysDown.has(target); this.setControl(control,p,false); } this.sendReport(); }

  setControl(control,pressed,send=true) {
    const output=CONTROL_TO_X360[control]; if(!output) return;
    if(output==='LEFT_TRIGGER'){this.report.bLeftTrigger=pressed?255:0;if(send)this.sendReport();return;}
    if(output==='RIGHT_TRIGGER'){this.report.bRightTrigger=pressed?255:0;if(send)this.sendReport();return;}
    if(BUTTONS[output]!==undefined){this.setButtonMask(BUTTONS[output],pressed);if(send)this.sendReport();}
    this.emit('virtual-button',{control,pressed});
  }
  setButtonMask(mask,pressed){this.report.wButtons=pressed?(this.report.wButtons|mask):(this.report.wButtons&~mask);}
  writeAxis(axis,value,send=true){const v=Math.max(-1,Math.min(1,Number(value)||0)); const n=Math.round(v*32767); if(axis==='leftX')this.report.sThumbLX=n; if(axis==='leftY')this.report.sThumbLY=n; if(axis==='rightX')this.report.sThumbRX=n; if(axis==='rightY')this.report.sThumbRY=n; if(send)this.sendReport();}
  sendReport(force=false){
    if(!this.helperReady || !this.helper || !this.helper.stdin || this.helper.stdin.destroyed) return;
    const json=JSON.stringify({type:'report',...this.report});
    if(!force && json===this.lastReportJson)return;
    try { this.helper.stdin.write(json+'\n'); this.lastReportJson=json; }
    catch(error) { this.onStatus({connected:false,error:'Falha ao enviar estado ao Xbox 360 virtual: '+error.message}); }
  }
  emit(type,payload){try{this.onInput({type,...payload});}catch(_){} }

  stop(){
    const helperToStop=this.helper;
    this.keysDown.clear(); this.mouseButtonsDown.clear(); this.lastMouse=null;
    this.left={x:0,y:0}; this.right={x:0,y:0}; this.rightVelocity={x:0,y:0}; this.rightTarget={x:0,y:0};
    this.dpad={up:false,down:false,left:false,right:false};
    this.report={wButtons:0,bLeftTrigger:0,bRightTrigger:0,sThumbLX:0,sThumbLY:0,sThumbRX:0,sThumbRY:0};
    this.sendReport(true);
    if (this.hooksInstalled) {
      try {
        uIOhook.removeListener('keydown', this.handleKeyDown);
        uIOhook.removeListener('keyup', this.handleKeyUp);
        uIOhook.removeListener('mousedown', this.handleMouseDown);
        uIOhook.removeListener('mouseup', this.handleMouseUp);
        uIOhook.removeListener('mousemove', this.handleMouseMove);
        uIOhook.stop();
      } catch(_){}
      this.hooksInstalled=false;
    }
    if(this.decayTimer)clearInterval(this.decayTimer); this.decayTimer=null;
    if(this.heartbeatTimer)clearInterval(this.heartbeatTimer); this.heartbeatTimer=null;
    this.running=false; this.stopping=true; this.helperReady=false;
    clearTimeout(this.restartTimer); this.restartTimer=null;
    try { if(helperToStop && helperToStop.stdin && !helperToStop.stdin.destroyed) helperToStop.stdin.write(JSON.stringify({type:'stop'})+'\n'); } catch(_){}
    setTimeout(()=>{try{if(helperToStop && !helperToStop.killed)helperToStop.kill();}catch(_){}},250);
    this.helper=null;
    this.lastReportJson=null;
    this.onStatus({connected:false,message:'CONTROLE VIRTUAL DESCONECTADO'});
  }
}
module.exports={VirtualController};
