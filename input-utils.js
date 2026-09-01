'use strict';

// Códigos físicos usados pelo libuiohook no Windows. Algumas teclas possuem
// uma versão esquerda/direita ou um código legado, por isso aceitamos listas.
const KEY_CODES = {
  ESC: 1, F1:59, F2:60, F3:61, F4:62, F5:63, F6:64, F7:65, F8:66, F9:67, F10:68, F11:87, F12:88,
  '`':41, '1':2, '2':3, '3':4, '4':5, '5':6, '6':7, '7':8, '8':9, '9':10, '0':11,
  '-':12, '=':13, BACK:14, TAB:15, Q:16, W:17, E:18, R:19, T:20, Y:21, U:22, I:23, O:24, P:25,
  '[':26, ']':27, '\\':43, CAPS:58, A:30, S:31, D:32, F:33, G:34, H:35, J:36, K:37, L:38,
  ';':39, "'":40, ENTER:28, SHIFT:[42,54], Z:44, X:45, C:46, V:47, B:48, N:49, M:50, ',':51, '.':52, '/':53,
  CTRL:[29,57373], WIN:[367,57435,57436], ALT:[56,57400], SPACE:57,
  INS:[366,57426], DEL:[365,57427], UP:57416, LEFT:57419, DOWN:57424, RIGHT:57421
};

const MOUSE_BUTTONS = {
  1: 'MOUSE 1',
  2: 'MOUSE 2',
  3: 'MOUSE 3',
  4: 'MOUSE X1',
  5: 'MOUSE X2'
};

function keyTarget(keycode) {
  const numericCode = Number(keycode);
  for (const [name, code] of Object.entries(KEY_CODES)) {
    if (Array.isArray(code) ? code.includes(numericCode) : code === numericCode) return name;
  }
  return null;
}

function mouseTarget(button) {
  return MOUSE_BUTTONS[Number(button)] || null;
}

function axisFromKeys(keysDown, negativeKey, positiveKey) {
  const negative = keysDown.has(negativeKey) ? 1 : 0;
  const positive = keysDown.has(positiveKey) ? 1 : 0;
  return positive - negative;
}

module.exports = { KEY_CODES, MOUSE_BUTTONS, keyTarget, mouseTarget, axisFromKeys };
