import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diamondShape, isDressingProgram, parseWheel, diamondFromComment, originZ, toWheelMoves, sanitizeWheel, zSign } from '../../src/modules/simulation-2d/wheel.js';

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
  assert.deepEqual(diameter.points, [{ x: 2, z: 40 }, { x: -0.2, z: 45 }], 'X au diamètre : x reste le double de l’écart radial ; flanc droit : Z+ vers la gauche');
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
  assert.deepEqual(second.points, [{ x: 2, z: -3 }, { x: 2, z: 40.2 }], 'départ : repère du flanc gauche ; arrivée : repère du flanc droit (Z+ vers la gauche)');
});

test('sens de Z+ propre à chaque diamant : par défaut, flanc droit en miroir du flanc gauche', () => {
  const wheel = sanitizeWheel({ width: 40 });
  assert.deepEqual(wheel.zDirections, { straight: 'right', leftFlank: 'right', rightFlank: 'left' });
  assert.equal(zSign('leftFlank', wheel), 1);
  assert.equal(zSign('rightFlank', wheel), -1);
  // Même programme pour les deux flancs : Z0.2 = 0,2 mm dans la meule, Z-3 = dégagé à l'extérieur.
  const moves = [{ tool: 'T1', points: [{ x: 2, z: 0.2 }, { x: -12, z: 0.2 }, { x: -12, z: -3 }] }];
  const [left] = toWheelMoves(moves, wheel, () => 'leftFlank');
  const [right] = toWheelMoves(moves, wheel, () => 'rightFlank');
  assert.deepEqual(left.points.map((p) => p.z), [0.2, 0.2, -3]);
  right.points.forEach((p, i) => close(p.z, [39.8, 39.8, 43][i]));
  // Machine dont les deux diamants ont Z+ vers la droite.
  const same = sanitizeWheel({ width: 40, zDirections: { rightFlank: 'right' } });
  toWheelMoves(moves, same, () => 'rightFlank')[0].points.forEach((p, i) => close(p.z, [40.2, 40.2, 37][i]));
  assert.equal(sanitizeWheel({ zDirections: { leftFlank: 'haut' } }).zDirections.leftFlank, 'right', 'valeur inconnue : sens par défaut');
});

test('X+ inversé ; ancien réglage « Z inversé » : chaque diamant garde son sens relatif', () => {
  const wheel = sanitizeWheel({ width: 40, invertX: true, invertZ: true });
  assert.deepEqual(wheel.zDirections, { straight: 'left', leftFlank: 'left', rightFlank: 'right' });
  const moves = [{ tool: 'T1', points: [{ x: 2, z: 0 }, { x: -0.2, z: 5 }] }];
  const [left] = toWheelMoves(moves, wheel, () => 'leftFlank');
  assert.deepEqual(left.points, [{ x: -2, z: 0 }, { x: 0.2, z: -5 }], 'X+ vers la meule, Z+ vers la gauche');
  const [right] = toWheelMoves(moves, { ...wheel, invertX: false }, () => 'rightFlank');
  assert.deepEqual(right.points, [{ x: 2, z: 40 }, { x: -0.2, z: 45 }], 'origine flanc droit inchangée : angle droit');
  assert.equal(sanitizeWheel({}).invertX, false);
});
