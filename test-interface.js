'use strict';

const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html','utf8');
const css = fs.readFileSync('styles.css','utf8') + fs.readFileSync('styles-fixes.css','utf8');
const renderer = fs.readFileSync('renderer.js','utf8');

const controls = [...html.matchAll(/data-control="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(controls).size, controls.length, 'cada comando deve possuir uma única área clicável');
assert(!html.includes('keyboard.jfif'), 'o teclado antigo não deve ficar sob as teclas novas');
assert(css.includes('.controller-image') && css.includes('transform:none!important'), 'a imagem do controle deve permanecer estática');
assert(!renderer.includes('highlightControl'), 'entradas não devem animar a imagem do controle');

const zoneNames=['h-l1','h-r1','h-l2','h-r2','h-share','h-options','h-touch','h-tri','h-circle','h-cross','h-square','h-l3','h-r3','h-dpad-up','h-dpad-down','h-dpad-left','h-dpad-right'];
function rectangle(name) {
  const matches=[...css.matchAll(new RegExp(`\\.${name}\\{left:([\\d.]+)%;top:([\\d.]+)%;width:([\\d.]+)%;height:([\\d.]+)%\\}`,'g'))];
  assert(matches.length,`posição ausente: ${name}`);
  const match=matches[matches.length-1];
  const left=Number(match[1]),top=Number(match[2]),width=Number(match[3]),height=Number(match[4]);
  return {name,left,top,right:left+width,bottom:top+height};
}
function overlap(a,b) { return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)); }
const rects=zoneNames.map(rectangle);
for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)assert.equal(overlap(rects[i],rects[j]),0,`áreas sobrepostas: ${rects[i].name} e ${rects[j].name}`);
for(const direction of ['D-UP','D-DOWN','D-LEFT','D-RIGHT'])assert(controls.includes(direction),`direção mapeável ausente: ${direction}`);
assert(!/DS4Windows|ds4Badge|practicePage|TREINO DE SEQUÊNCIA/i.test(html+renderer),'DS4 e a antiga área de macro/treino devem ser removidos');

console.log(`[87Z] Interface validada: ${controls.length} comandos únicos e ${rects.length} áreas sem sobreposição.`);
