'use strict';

const nativeApi = window.z87;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const defaults = {
  'TRIÂNGULO':'E','CÍRCULO':'C','X':'SPACE','QUADRADO':'R','L1':'Q','R1':'G',
  'L2':'MOUSE 2','R2':'MOUSE 1','SHARE':'TAB','OPTIONS':'ESC','TOUCHPAD':'M','L3':'SHIFT','R3':'V',
  'D-UP':'UP','D-DOWN':'DOWN','D-LEFT':'LEFT','D-RIGHT':'RIGHT'
};
const engineDefaults = { axisX:3200,axisY:3000,curveH:1.25,curveV:1.35,filterH:0.65,filterV:0.75,accel:0.2 };
const labels = {'TRIÂNGULO':'△','CÍRCULO':'○','X':'×','QUADRADO':'□','D-UP':'↑','D-DOWN':'↓','D-LEFT':'←','D-RIGHT':'→'};
const keyboardRows = [
  [['ESC',1.25],['F1',1],['F2',1],['F3',1],['F4',1],['F5',1],['F6',1],['F7',1],['F8',1],['F9',1],['F10',1],['F11',1],['F12',1]],
  [['`',1],['1',1],['2',1],['3',1],['4',1],['5',1],['6',1],['7',1],['8',1],['9',1],['0',1],['-',1],['=',1],['BACK',1.75]],
  [['TAB',1.45],['Q',1],['W',1],['E',1],['R',1],['T',1],['Y',1],['U',1],['I',1],['O',1],['P',1],['[',1],[']',1],['\\',1.35]],
  [['CAPS',1.75],['A',1],['S',1],['D',1],['F',1],['G',1],['H',1],['J',1],['K',1],['L',1],[';',1],["'",1],['ENTER',2]],
  [['SHIFT',2.35],['Z',1],['X',1],['C',1],['V',1],['B',1],['N',1],['M',1],[',',1],['.',1],['/',1],['SHIFT',2.35]],
  [['CTRL',1.2],['WIN',1],['ALT',1],['SPACE',4.6],['INS',1],['DEL',1],['UP',1],['LEFT',1],['DOWN',1],['RIGHT',1]]
];

let mappings = {...defaults};
let engine = {...engineDefaults};
let virtualEnabled = localStorage.getItem('87z-virtual-enabled') !== '0';
let drag = null;
let lastConnected = false;
let shortcut = localStorage.getItem('87z-toggle-shortcut') || 'F8';
let capturingShortcut = false;

try { mappings = {...mappings,...JSON.parse(localStorage.getItem('87z-theme-mappings') || '{}')}; } catch (_) {}
try { engine = {...engine,...JSON.parse(localStorage.getItem('87z-input-engine') || '{}')}; } catch (_) {}

function toast(message, duration=2200) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), duration);
}

function shortName(control) { return labels[control] || control; }

function buildKeyboard() {
  const keyboard = $('#keyboard');
  keyboard.innerHTML = '';
  for (const rowData of keyboardRows) {
    const row = document.createElement('div');
    row.className = 'keyboard-row';
    for (const [key, units] of rowData) {
      const button = document.createElement('button');
      button.className = 'key';
      button.dataset.key = key;
      button.style.setProperty('--u', units);
      button.innerHTML = `<span>${key}</span><span class="assignment"></span>`;
      row.appendChild(button);
    }
    keyboard.appendChild(row);
  }
}

function renderMappings() {
  $('#mappedCount').textContent = `${Object.keys(mappings).length} mapeamentos`;
  $$('.key').forEach(key => {
    const control = Object.entries(mappings).find(([,target]) => target === key.dataset.key)?.[0];
    key.classList.toggle('mapped', !!control);
    key.querySelector('.assignment').textContent = control ? shortName(control) : '';
  });
  $$('.mouse-zone').forEach(button => {
    const control = Object.entries(mappings).find(([,target]) => target === button.dataset.target)?.[0];
    button.classList.toggle('mapped', !!control);
    button.querySelector('span').textContent = control ? shortName(control) : button.dataset.target;
  });
}

function saveMappings(showMessage=true) {
  localStorage.setItem('87z-theme-mappings', JSON.stringify(mappings));
  nativeApi?.setMappings(mappings);
  renderMappings();
  if (showMessage) toast('Mapeamentos aplicados e salvos.');
}

function resetMappings() {
  mappings = {...defaults};
  localStorage.removeItem('87z-theme-mappings');
  saveMappings(false);
  toast('Mapeamento padrão restaurado.');
}

function dragPoint(event) { return {x:event.clientX,y:event.clientY}; }
function moveGhost(point) { const ghost=$('#dragGhost'); if(ghost){ghost.style.left=`${point.x+14}px`;ghost.style.top=`${point.y+14}px`;} }
function drawLine(from,to) {
  let svg = $('#dragLine');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id='dragLine'; svg.classList.add('drag-line'); svg.innerHTML='<line></line>'; document.body.appendChild(svg);
  }
  const line=svg.querySelector('line');
  line.setAttribute('x1',from.x);line.setAttribute('y1',from.y);line.setAttribute('x2',to.x);line.setAttribute('y2',to.y);
}
function dropTargetAt(point) {
  $$('.drop-target').forEach(element => element.classList.remove('drop-target'));
  const target = document.elementFromPoint(point.x,point.y)?.closest('.key,.mouse-zone');
  target?.classList.add('drop-target');
  return target;
}
function startDrag(control,event) {
  if (event.button !== 0) return;
  event.preventDefault();
  const start=dragPoint(event);
  drag={control,start};
  $$('.control-zone').forEach(zone => zone.classList.toggle('selected',zone.dataset.control===control));
  const ghost=document.createElement('div');ghost.id='dragGhost';ghost.className='drag-ghost';ghost.textContent=shortName(control);document.body.appendChild(ghost);
  moveGhost(start);drawLine(start,start);
  window.addEventListener('pointermove',moveDrag);
  window.addEventListener('pointerup',endDrag,{once:true});
}
function moveDrag(event) { if(!drag)return;const point=dragPoint(event);moveGhost(point);drawLine(drag.start,point);dropTargetAt(point); }
function endDrag(event) {
  if(!drag)return;
  const target=dropTargetAt(dragPoint(event));
  if(target){
    const value=target.dataset.key||target.dataset.target;
    for(const control of Object.keys(mappings)) if(mappings[control]===value) delete mappings[control];
    mappings[drag.control]=value;saveMappings(false);toast(`${shortName(drag.control)} → ${value}`);
  } else toast('Solte sobre uma tecla ou botão do mouse.');
  drag=null;$('#dragGhost')?.remove();$('#dragLine')?.remove();$$('.selected,.drop-target').forEach(element=>element.classList.remove('selected','drop-target'));
  window.removeEventListener('pointermove',moveDrag);
}

function showPage(pageId) {
  $$('.page').forEach(page => page.classList.toggle('active',page.id===pageId));
  $$('.nav [data-page]').forEach(button => button.classList.toggle('active',button.dataset.page===pageId));
  if(pageId==='systemPage') refreshSystemStatus();
}

function renderEngine() { Object.keys(engineDefaults).forEach(id => { $(`#${id}`).value=engine[id]; }); }
function saveEngine(showMessage=true) {
  for(const id of Object.keys(engineDefaults)) {
    const input=$(`#${id}`);const min=Number(input.min);const max=Number(input.max);let value=Number(input.value);
    if(!Number.isFinite(value))value=engineDefaults[id];
    if(Number.isFinite(min))value=Math.max(min,value);if(Number.isFinite(max))value=Math.min(max,value);engine[id]=value;
  }
  localStorage.setItem('87z-input-engine',JSON.stringify(engine));nativeApi?.setEngine(engine);renderEngine();
  if(showMessage)toast('Input Engine aplicado e salvo.');
}

function normalizeKey(event) {
  const codeMap={Space:'SPACE',Escape:'ESC',Backspace:'BACK',CapsLock:'CAPS',ControlLeft:'CTRL',ControlRight:'CTRL',ShiftLeft:'SHIFT',ShiftRight:'SHIFT',AltLeft:'ALT',AltRight:'ALT',MetaLeft:'WIN',MetaRight:'WIN',ArrowUp:'UP',ArrowDown:'DOWN',ArrowLeft:'LEFT',ArrowRight:'RIGHT',Insert:'INS',Delete:'DEL',Enter:'ENTER',Tab:'TAB'};
  if(codeMap[event.code])return codeMap[event.code];
  return event.key?.length===1?event.key.toUpperCase():event.key?.toUpperCase();
}

function renderVirtualToggle() {
  const toggle=$('#virtualToggle');toggle.classList.toggle('on',virtualEnabled);toggle.setAttribute('aria-pressed',String(virtualEnabled));
  toggle.querySelector('span').textContent=virtualEnabled?(lastConnected?'CONTROLE: CONECTADO':'CONTROLE: LIGANDO…'):'CONTROLE: DESATIVADO';
}
function setVirtualStatus(status) {
  lastConnected=!!status?.connected;
  const element=$('#gamepadStatus');element.classList.toggle('connected',lastConnected);
  element.querySelector('span').textContent=lastConnected?'XBOX 360 CONECTADO':(virtualEnabled?'DESCONECTADO':'DESATIVADO');
  $('#gamepadReadout').textContent=lastConnected?'Xbox 360 virtual (XInput) pronto.':(status?.error||status?.message||'Controle virtual indisponível.');
  renderVirtualToggle();
}

function setBadge(id,text,state='') { const badge=$(id);badge.textContent=text;badge.className=`status-pill ${state}`.trim(); }
async function refreshSystemStatus() {
  setBadge('#vigemBadge','VERIFICANDO','checking');$('#vigemText').textContent='Verificando o driver…';$('#installVigem').classList.add('hidden');
  try {
    const status=await nativeApi?.getSystemStatus();
    if(status?.platform!=='win32'){$('#vigemText').textContent='A verificação completa só funciona no Windows.';setBadge('#vigemBadge','WINDOWS','optional');return;}
    if(status.vigem.installed){setBadge('#vigemBadge','INSTALADO','ok');$('#vigemText').textContent=`ViGEmBus detectado${status.vigem.version?` • versão ${status.vigem.version}`:''}.`;}
    else{setBadge('#vigemBadge','NÃO INSTALADO','missing');$('#vigemText').textContent='O controle virtual precisa do ViGEmBus. Baixe somente pelo projeto oficial.';$('#installVigem').classList.remove('hidden');}
  } catch(error){setBadge('#vigemBadge','ERRO','missing');$('#vigemText').textContent='Não foi possível verificar os drivers: '+error.message;}
}

function displayShortcut(value) { return value.replaceAll('CommandOrControl','CTRL').replaceAll('Control','CTRL').replaceAll('Super','WIN').toUpperCase(); }
function renderShortcut(message='') {
  $('#shortcutBadge').textContent=displayShortcut(shortcut);
  $('#shortcutCapture').textContent=capturingShortcut?'PRESSIONE O NOVO ATALHO…':'ALTERAR ATALHO';
  $('#shortcutText').textContent=message||(capturingShortcut?'Pressione F1–F12 ou uma combinação como Ctrl + Alt + K. Pressione Esc para cancelar.':'Use o atalho mesmo com o 87Z minimizado para ligar ou desligar o controle virtual.');
}
function shortcutFromEvent(event) {
  const parts=[];
  if(event.ctrlKey)parts.push('Control');
  if(event.altKey)parts.push('Alt');
  if(event.shiftKey)parts.push('Shift');
  if(event.metaKey)parts.push('Super');
  let key='';
  if(/^F([1-9]|1[0-2])$/.test(event.key.toUpperCase()))key=event.key.toUpperCase();
  else if(/^Key[A-Z]$/.test(event.code))key=event.code.slice(3);
  else if(/^Digit[0-9]$/.test(event.code))key=event.code.slice(5);
  else key={Space:'Space',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',Insert:'Insert',Delete:'Delete',Home:'Home',End:'End'}[event.code]||'';
  if(!key)return null;
  if(parts.length===0&&!/^F([1-9]|1[0-2])$/.test(key))return null;
  return [...parts,key].join('+');
}
async function applyShortcut(value, showMessage=true) {
  const result=await nativeApi?.setToggleShortcut(value);
  if(!result?.ok){capturingShortcut=false;renderShortcut(result?.message||'Esse atalho não pôde ser registrado.');toast(result?.message||'Atalho indisponível.',3500);return false;}
  shortcut=value;capturingShortcut=false;localStorage.setItem('87z-toggle-shortcut',shortcut);renderShortcut();
  if(showMessage)toast(`Atalho do controle: ${displayShortcut(shortcut)}`);
  return true;
}

function renderUpdate(status) {
  const text=$('#updateText'),progress=$('#updateProgress'),bar=progress.querySelector('i');
  if(status.version)$('#versionChip').textContent=`VERSÃO ${status.version}`;
  if(status.type==='unconfigured'){setBadge('#updateBadge','CONFIGURAÇÃO PENDENTE','optional');text.textContent='O canal de atualizações ainda precisa ser ligado ao repositório GitHub.';}
  if(status.type==='checking'){setBadge('#updateBadge','VERIFICANDO');text.textContent='Procurando uma versão nova…';}
  if(status.type==='not-available'){setBadge('#updateBadge','ATUALIZADO','ok');text.textContent=`Você já está na versão mais recente (${status.version||'atual'}).`;}
  if(status.type==='available'){setBadge('#updateBadge','NOVA VERSÃO','missing');text.textContent=`Versão ${status.version} encontrada. O download começará automaticamente.`;$('#downloadUpdate').classList.add('hidden');}
  if(status.type==='downloading'){setBadge('#updateBadge','BAIXANDO');text.textContent=`Baixando atualização… ${Math.round(status.percent||0)}%`;progress.classList.remove('hidden');bar.style.width=`${Math.max(0,Math.min(100,status.percent||0))}%`;}
  if(status.type==='downloaded'){setBadge('#updateBadge','PRONTA','ok');text.textContent=`Versão ${status.version} pronta para instalar.`;progress.classList.add('hidden');$('#downloadUpdate').classList.add('hidden');$('#installUpdate').classList.remove('hidden');}
  if(status.type==='error'){setBadge('#updateBadge','ERRO','missing');text.textContent=status.message||'Falha ao verificar atualizações.';progress.classList.add('hidden');}
}

document.addEventListener('keydown',event=>{
  const tag=event.target?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;
  if(capturingShortcut){event.preventDefault();event.stopPropagation();if(event.code==='Escape'){capturingShortcut=false;renderShortcut();return;}const value=shortcutFromEvent(event);if(value)applyShortcut(value);else renderShortcut('Use F1–F12 ou uma combinação que tenha Ctrl, Alt, Shift ou Win.');return;}
  const key=normalizeKey(event);
  const gameplayTargets=new Set([...Object.values(mappings),'W','A','S','D','UP','DOWN','LEFT','RIGHT']);
  if(!event.ctrlKey&&!event.altKey&&!event.metaKey&&gameplayTargets.has(key))event.preventDefault();
},true);

buildKeyboard();renderMappings();renderEngine();renderVirtualToggle();renderShortcut();
$$('.control-zone').forEach(zone=>zone.addEventListener('pointerdown',event=>startDrag(zone.dataset.control,event)));
$$('.nav [data-page]').forEach(button=>button.addEventListener('click',()=>showPage(button.dataset.page)));
$$('[data-input-view]').forEach(button=>button.addEventListener('click',()=>{$$('[data-input-view]').forEach(item=>item.classList.toggle('active',item===button));$('#keyboardView').classList.toggle('hidden',button.dataset.inputView!=='keyboard');$('#mouseView').classList.toggle('hidden',button.dataset.inputView!=='mouse');}));
$('#saveMappingTop').addEventListener('click',()=>saveMappings());$('#resetNav').addEventListener('click',resetMappings);
$('#engineSave').addEventListener('click',()=>saveEngine());$('#engineReset').addEventListener('click',()=>{engine={...engineDefaults};localStorage.removeItem('87z-input-engine');saveEngine(false);toast('Valores padrão aplicados.');});
$('#virtualToggle').addEventListener('click',()=>{virtualEnabled=!virtualEnabled;localStorage.setItem('87z-virtual-enabled',virtualEnabled?'1':'0');nativeApi?.setVirtualEnabled(virtualEnabled);renderVirtualToggle();toast(virtualEnabled?'Controle virtual ativado.':'Controle virtual desativado.');});
$('#refreshSystem').addEventListener('click',refreshSystemStatus);$('#installVigem').addEventListener('click',async()=>{const button=$('#installVigem');button.disabled=true;button.textContent='PREPARANDO…';const result=await nativeApi?.installViGEm();button.disabled=false;button.textContent='BAIXAR E INSTALAR';if(result?.ok){toast('ViGEmBus instalado com sucesso.');refreshSystemStatus();nativeApi?.setVirtualEnabled(virtualEnabled);}else{toast(result?.message||'Não foi possível instalar o ViGEmBus.',6500);if(result?.needsManualDownload)nativeApi?.openViGEmDownload();}});
$('#shortcutCapture').addEventListener('click',()=>{capturingShortcut=true;renderShortcut();});
$('#shortcutReset').addEventListener('click',()=>applyShortcut('F8'));
$('#checkUpdate').addEventListener('click',async()=>renderUpdate(await nativeApi?.checkForUpdates()));$('#downloadUpdate').addEventListener('click',async()=>renderUpdate(await nativeApi?.downloadUpdate()));$('#installUpdate').addEventListener('click',()=>nativeApi?.installUpdate());

let cam={x:0,y:0};
$('#engineTest').addEventListener('pointermove',event=>{cam.x=Math.max(-45,Math.min(45,cam.x+event.movementX*.35));cam.y=Math.max(-45,Math.min(45,cam.y+event.movementY*.35));$('#cameraDot').style.transform=`translate(calc(-50% + ${cam.x}px),calc(-50% + ${cam.y}px))`;$('#engineReadout').textContent=`X ${cam.x.toFixed(1)} • Y ${cam.y.toFixed(1)}`;});

nativeApi?.onVirtualStatus(setVirtualStatus);
nativeApi?.onVirtualToggle(state=>{virtualEnabled=!!state.enabled;localStorage.setItem('87z-virtual-enabled',virtualEnabled?'1':'0');renderVirtualToggle();toast(virtualEnabled?'Controle virtual ativado pelo atalho.':'Controle virtual desativado pelo atalho.');});
nativeApi?.onDriverStatus(status=>{const button=$('#installVigem');if(status.type==='finding'){button.textContent='LOCALIZANDO INSTALADOR…';$('#vigemText').textContent='Localizando a versão oficial mais recente…';}if(status.type==='downloading'){button.textContent=status.percent==null?'BAIXANDO…':`BAIXANDO ${Math.round(status.percent)}%`;$('#vigemText').textContent='Baixando o instalador oficial do ViGEmBus…';}if(status.type==='installing'){button.textContent='AGUARDANDO INSTALAÇÃO…';$('#vigemText').textContent='Confirme a janela do Windows e conclua a instalação.';}if(status.type==='signature-failed'){$('#vigemText').textContent=status.message;button.textContent='ABRIR SITE OFICIAL';}if(status.type==='error')$('#vigemText').textContent='Falha: '+status.message;});
nativeApi?.onVirtualInput(input=>{if(input.type==='virtual-button')$('#gamepadReadout').textContent=input.pressed?`Comando: ${shortName(input.control)}`:'Xbox 360 virtual (XInput) pronto.';else if(input.type==='key'&&input.down)$('#gamepadReadout').textContent=`Entrada: ${input.key}`;else if(input.type==='mouse'&&input.down)$('#gamepadReadout').textContent=`Entrada: MOUSE ${input.button}`;});
nativeApi?.onUpdateStatus(renderUpdate);
nativeApi?.getAppInfo().then(info=>renderUpdate({type:info.updateConfigured?'idle':'unconfigured',version:info.version}));
nativeApi?.setMappings(mappings);nativeApi?.setEngine(engine);nativeApi?.setVirtualEnabled(virtualEnabled);
applyShortcut(shortcut,false);
nativeApi?.getSystemStatus().then(status=>{if(status?.platform==='win32'&&!status.vigem?.installed){showPage('systemPage');toast('O ViGEmBus precisa ser instalado para criar o controle virtual.',5000);}});

window.addEventListener('error',event=>toast(`Erro da interface: ${event.message}`,4000));
window.addEventListener('unhandledrejection',event=>toast(`Erro: ${event.reason?.message||event.reason}`,4000));
