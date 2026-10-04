import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStock, guessStock, sanitizeStock } from '../../src/modules/simulation-2d/stock.js';

test('brut lu dans un commentaire, plusieurs écritures', () => {
  const read = (comment) => {
    const s = parseStock(['O1000', comment]);
    return s && [s.diameter, s.length, s.bore];
  };
  assert.deepEqual(read('(BRUT D50 X 80 - ALUMINIUM)'), [50, 80, 0]);
  assert.deepEqual(read('(brut Ø42,5 L120)'), [42.5, 120, 0]);
  assert.deepEqual(read('(BRUT DIA 60 X 100)'), [60, 100, 0]);
  assert.deepEqual(read('(BRUT 30 X 45)'), [30, 45, 0]);
  assert.deepEqual(read('(BRUT TUBE D60 D30 X 100)'), [60, 100, 30]);
  assert.equal(parseStock(['(EBAUCHE)', 'G0 X50.']), null);
});

test('brut pré-percé : diamètre intérieur et profondeur', () => {
  const read = (...comments) => {
    const s = parseStock(['O1000', ...comments]);
    return s && [s.diameter, s.length, s.bore, s.boreDepth];
  };
  assert.deepEqual(read('(BRUT D50 X 80 PERCE D20 P30)'), [50, 80, 20, 30]);
  assert.deepEqual(read('(BRUT D50 X 80)', '(PRE-PERCAGE Ø18 PROF 25)'), [50, 80, 18, 25]);
  assert.deepEqual(read('(BRUT D50 X 80 - PREPERCE D16)'), [50, 80, 16, 0]);
  assert.deepEqual(read('(BRUT D50 X 80 PERCE D20 P90)'), [50, 80, 20, 0], 'plus long que le brut : débouchant');
  assert.deepEqual(read('(BRUT TUBE D60 D30 X 100)'), [60, 100, 30, 0]);
});

test('brut déduit des passes de travail, valeurs bornées', () => {
  const moves = [
    { kind: 'rapid', points: [{ x: 200, z: 150 }, { x: 52, z: 2 }] },
    { kind: 'cut', points: [{ x: 48, z: 0 }, { x: 48, z: -55 }] },
  ];
  assert.deepEqual(guessStock(moves), { diameter: 50, length: 70, face: 0, bore: 0, boreDepth: 0, grip: 17.5 });
  const fallback = { diameter: 50, length: 80, face: 0, bore: 0, grip: 20 };
  assert.deepEqual(sanitizeStock({ diameter: '40', length: -3, face: 'x', bore: 45, boreDepth: 2, grip: 900 }, { ...fallback, boreDepth: 0 }), { diameter: 40, length: 1, face: 0, bore: 0, boreDepth: 0, grip: 0 });
});
