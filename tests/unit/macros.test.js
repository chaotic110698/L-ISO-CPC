import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMacros, assignedVariables, referencedVariables, variableWarnings } from '../../src/engine/macros.js';
import { FANUC_TURNING_DEMO } from '../../src/data/samples/fanuc-turning-demo.js';

const lines = (text) => text.split('\n');

test('variables : utilisations, affectations et expression affectée', () => {
  const { variables, used } = analyzeMacros(lines('#901 = 25. (COTE)\nG1 X#901 Z-[#902+1.]\n#902=#901*2'));
  assert.deepEqual(variables.map((v) => [v.name, v.uses.length, v.assignments.map((a) => `${a.line}:${a.expression}`)]), [
    ['#901', 3, ['1:25.']],
    ['#902', 2, ['3:#901*2']],
  ]);
  assert.deepEqual(variables[0].uses[1], { line: 2, from: 4, to: 8 });
  assert.deepEqual([...used], [901, 902]);
});

test('valeurs répétées : X/Z…, point décimal significatif, triées par nombre', () => {
  const { repeated } = analyzeMacros(lines('G0 X52. Z2.\nG1 X52.0 Z-30.\nG0 X52 Z2.\nZ2.\nN10 N10'));
  assert.deepEqual(repeated.map((r) => [r.label, r.count]), [
    ['Z2.', 3],
    ['X52.', 2],
  ]);
  assert.deepEqual(repeated[1].occurrences.map((o) => o.line), [1, 2]);
  assert.equal(repeated[1].occurrences[0].valueFrom, 4);
});

test('programme d’exemple : #901 affectée une fois, utilisée deux fois', () => {
  const { variables, repeated } = analyzeMacros(lines(FANUC_TURNING_DEMO.content));
  assert.equal(variables.length, 1);
  assert.equal(variables[0].uses.length, 2);
  assert.ok(repeated.some((r) => r.label === 'X52.'));
});

test('avertissements : hors plage (communes seulement), double utilisation', () => {
  const [v1, v120, v901, v3000] = analyzeMacros(lines('#120=1\n#901=2\n#1=3\n#3000=1')).variables; // triées par numéro
  const ranges = [{ from: 900, to: 999 }];
  assert.match(variableWarnings(v120, { ranges, rangesLabel: 'Tour' })[0].message, /hors des plages libres du profil « Tour » \(#900–#999\)/);
  assert.deepEqual(variableWarnings(v901, { ranges }), []);
  assert.deepEqual(variableWarnings(v1, { ranges }), [], 'variable locale : pas de contrôle');
  assert.deepEqual(variableWarnings(v3000, { ranges }), [], 'variable système : pas de contrôle');
  assert.deepEqual(variableWarnings(v120, { ranges: [] }), [], 'sans plage définie : pas d’avertissement');

  const reused = variableWarnings(v901, { ranges, elsewhere: new Map([[901, ['Arbre', 'Axe']]]) });
  assert.match(reused[0].message, /aussi affectée dans les programmes « Arbre », « Axe »/);
  const readOnly = analyzeMacros(lines('X#901')).variables[0];
  assert.deepEqual(variableWarnings(readOnly, { ranges: [{ from: 1, to: 2 }], elsewhere: new Map([[901, ['Arbre']]]) }), [], 'simple lecture');
});

test('variables affectées / référencées d’un texte', () => {
  assert.deepEqual([...assignedVariables('#901=1\nX#902\n#903 = #904')], [901, 903]);
  assert.deepEqual([...referencedVariables('#901=1\nX#902')].sort(), [901, 902]);
});
