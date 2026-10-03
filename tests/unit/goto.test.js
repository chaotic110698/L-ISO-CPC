import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGoTo } from '../../src/engine/index.js';

const program = ['%', 'O1000', 'N10 G21', 'N20 T0101', 'N30 G0 X10.', 'N20 T0303', 'M30', 'O2000 (SOUS-PROG)', 'N10 T3', 'M99', '%'];

test('aller à une ligne', () => {
  assert.deepEqual(resolveGoTo(program, ' 5 '), { line: 5, matches: [5], index: 0 });
  assert.match(resolveGoTo(program, '99').error, /11 lignes/);
  assert.match(resolveGoTo(program, '').error, /Saisissez/);
  assert.match(resolveGoTo(program, 'X10').error, /non reconnu/);
});

test('aller à un bloc N : suivant après le curseur, puis retour au début', () => {
  assert.equal(resolveGoTo(program, 'n20').line, 4);
  assert.equal(resolveGoTo(program, 'N20', 4).line, 6);
  assert.equal(resolveGoTo(program, 'N20', 6).line, 4);
  assert.deepEqual(resolveGoTo(program, 'N10').matches, [3, 9]);
  assert.match(resolveGoTo(program, 'N500').error, /Aucun bloc N500/);
});

test('aller à un programme O (ou :)', () => {
  assert.equal(resolveGoTo(program, 'O2000').line, 8);
  assert.equal(resolveGoTo(program, ':2000').line, 8);
  assert.equal(resolveGoTo(program, 'O1000').line, 2);
});

test('aller à un outil : T3 = outil 3 quel que soit le correcteur, T0303 exact', () => {
  assert.deepEqual(resolveGoTo(program, 'T3').matches, [6, 9]);
  assert.deepEqual(resolveGoTo(program, 'T03').matches, [6, 9]);
  assert.deepEqual(resolveGoTo(program, 'T0303').matches, [6]);
  assert.deepEqual(resolveGoTo(program, 'T1').matches, [4]);
  assert.match(resolveGoTo(program, 'T5').error, /Aucun outil T5/);
});
