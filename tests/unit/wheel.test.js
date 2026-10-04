import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diamondShape, isDressingProgram, parseWheel, diamondFromComment, originZ, toWheelMoves, sanitizeWheel } from '../../src/modules/simulation-2d/wheel.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('diamants : droit vers le haut, flanc gauche couché à gauche, flanc droit couché à droite', () => {
  const body = (kind) => diamondShape(kind)[2]; // point du corps, loin de la pointe
  assert.deepEqual(diamondShape('straight')[0], [0, 0], 'pointe en 0,0');
  assert.ok(body('straight')[1] > 10 && Math.abs(body('straight')[0]) < 2);
  assert.ok(body('leftFlank')[0] < -5 && body('leftFlank')[1] > 5, 'corps en haut à gauche');
  assert.ok(body('rightFlank')[0] > 5 && body('rightFlank')[1] > 5, 'corps en haut à droite');
});

test('programme de taillage et largeur de meule lus dans les commentaires', () => {
  assert.equal(isDressingProgram(['O0100 (TAILLAGE MEULE)']), true);
  assert.equal(isDressingProgram(['O1000 (ARBRE)', 'G0 X20.']), false);
  assert.deepEqual(parseWheel(['(MEULE L40)']), { width: 40 });
  assert.deepEqual(parseWheel(['(MEULE 400 X 25)']), { width: 25 });
  assert.deepEqual(parseWheel(['(MEULE LARGEUR 32,5)']), { width: 32.5 });
  assert.equal(parseWheel(['(BRUT D50 X 80)']), null);
  assert.equal(diamondFromComment('T0202 (DIAMANT FLANC GAUCHE)'), 'leftFlank');
  assert.equal(diamondFromComment('T0303 (flanc droit)'), 'rightFlank');
  assert.equal(diamondFromComment('T0101'), null);
});

test('origine des diamants et cotes ramenées dans le repère de la meule', () => {
  const wheel = sanitizeWheel({ width: 40, xMode: 'diameter', straightOrigin: 'center' });
  assert.equal(originZ('leftFlank', wheel), 0);
  assert.equal(originZ('rightFlank', wheel), 40);
  assert.equal(originZ('straight', wheel), 20);
  const moves = [{ tool: 'T2', points: [{ x: 2, z: 0 }, { x: -0.2, z: -5 }] }];
  const [diameter] = toWheelMoves(moves, wheel, () => 'rightFlank');
  assert.deepEqual(diameter.points, [{ x: 2, z: 40 }, { x: -0.2, z: 35 }], 'X au diamètre : x reste le double de l’écart radial');
  const [radius] = toWheelMoves(moves, { ...wheel, xMode: 'radius' }, () => 'leftFlank');
  assert.deepEqual(radius.points, [{ x: 4, z: 0 }, { x: -0.4, z: -5 }]);
  assert.equal(radius.diamond, 'leftFlank');
  close(sanitizeWheel({ width: -2 }).width, 40);
});

test('changement de diamant : départ depuis la position réelle (origine du diamant précédent)', () => {
  const wheel = sanitizeWheel({ width: 40 });
  const moves = [
    { tool: 'T2', points: [{ x: 2, z: 0 }, { x: 2, z: -3 }] },
    { tool: 'T3', points: [{ x: 2, z: -3 }, { x: 2, z: -0.2 }] },
  ];
  const kinds = { T2: 'leftFlank', T3: 'rightFlank' };
  const [, second] = toWheelMoves(moves, wheel, (t) => kinds[t]);
  assert.deepEqual(second.points, [{ x: 2, z: -3 }, { x: 2, z: 39.8 }]);
});
