'use strict';

const assert = require('assert');
const { keyTarget, mouseTarget, axisFromKeys } = require('./input-utils');

assert.equal(keyTarget(17), 'W');
assert.equal(keyTarget(42), 'SHIFT');
assert.equal(keyTarget(54), 'SHIFT');
assert.equal(keyTarget(57435), 'WIN');
assert.equal(keyTarget(57426), 'INS');
assert.equal(keyTarget(99999), null);

assert.equal(mouseTarget(1), 'MOUSE 1');
assert.equal(mouseTarget(2), 'MOUSE 2');
assert.equal(mouseTarget(3), 'MOUSE 3');
assert.equal(mouseTarget(4), 'MOUSE X1');
assert.equal(mouseTarget(5), 'MOUSE X2');

assert.equal(axisFromKeys(new Set(), 'A', 'D'), 0);
assert.equal(axisFromKeys(new Set(['A']), 'A', 'D'), -1);
assert.equal(axisFromKeys(new Set(['D']), 'A', 'D'), 1);
assert.equal(axisFromKeys(new Set(['A','D']), 'A', 'D'), 0);

console.log('[87Z] Lógica de teclado e mouse validada.');
