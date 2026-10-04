import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExpression } from '../../src/engine/macro-eval.js';
import { simulate } from '../../src/engine/index.js';

const vars = new Map([[1, 10], [2, 4]]);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('expressions : priorités, crochets, variables, fonctions en degrés', () => {
  assert.equal(evaluateExpression('[#1+2.]*3', vars), 36);
  assert.equal(evaluateExpression('#1+2*3', vars), 16);
  assert.equal(evaluateExpression('-#2', vars), -4);
  close(evaluateExpression('SIN[30]', vars), 0.5);
  assert.equal(evaluateExpression('SQRT[#2]', vars), 2);
  assert.equal(evaluateExpression('ROUND[2.5]', vars), 3);
  assert.equal(evaluateExpression('FIX[-2.7]', vars), -2);
  assert.equal(evaluateExpression('7 MOD 3', vars), 1);
  assert.equal(evaluateExpression('#[#2-3]', vars), 10, 'variable indirecte');
  close(evaluateExpression('ATAN[1]/[1]', vars), 45);
});

test('variable vide : null seule, 0 dans un calcul ; erreurs signalées', () => {
  assert.equal(evaluateExpression('#100', vars), null);
  assert.equal(evaluateExpression('#100+1', vars), 1);
  assert.throws(() => evaluateExpression('[#1+2', vars), /crochet/);
  assert.throws(() => evaluateExpression('#1/0', vars), /division par zéro/);
});

test('simulation : affectations puis adresses calculées', () => {
  const { moves, warnings, variables } = simulate(['#1 = 20.', '#2 = [#1+10.]/2', 'G0 X#1 Z#2', 'G0 X[#1*2] Z-#2', 'G0 X#500'], null);
  assert.deepEqual(variables, { 1: 20, 2: 15 });
  assert.deepEqual(moves.map((m) => [m.points.at(-1).x, m.points.at(-1).z]), [[20, 15], [40, -15]]);
  assert.match(warnings[0].message, /X#500 : variable vide/);
});

test('comparaisons : EQ NE GT LT GE LE, combinées par AND / OR, variable vide', () => {
  assert.equal(evaluateExpression('[#1 GT 5]', vars), 1);
  assert.equal(evaluateExpression('[#1 LE 5]', vars), 0);
  assert.equal(evaluateExpression('[#1 EQ 10] AND [#2 LT 5]', vars), 1);
  assert.equal(evaluateExpression('[#1 EQ 0] OR [#2 NE 4]', vars), 0);
  assert.equal(evaluateExpression('[#100 EQ #0]', vars), 1, 'vide EQ vide');
  assert.equal(evaluateExpression('[#100 EQ 0]', vars), 0, 'vide n’est pas égal à 0');
  assert.equal(evaluateExpression('[#100 LT 1]', vars), 1, 'vide vaut 0 dans GT / LT');
});
