import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSheet } from '../../src/modules/print-sheet/sheet.js';
import { createCodeDictionary } from '../../src/engine/index.js';
import { ISO_BASE_CODES } from '../../src/data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from '../../src/data/codes/fanuc-turning.js';
import { FANUC_TURNING_DEMO } from '../../src/data/samples/fanuc-turning-demo.js';

test('fiche : programmes, outils avec leur opération, variables nommées', () => {
  const dictionary = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]);
  const names = { 901: { name: 'Ø épaulement', description: 'Diamètre fini' } };
  const sheet = buildSheet(FANUC_TURNING_DEMO.content.split('\n'), dictionary, (i) => names[i] ?? null);
  assert.deepEqual(sheet.programs, [{ number: 'O1000', comment: 'EXEMPLE TOURNAGE FANUC', line: 2 }]);
  assert.deepEqual(sheet.tools.map((t) => [t.word, t.operation, t.line]), [['T0101', 'EBAUCHE', 8], ['T0202', 'FINITION', 24], ['T0303', 'FILETAGE M20 X 1.5', 30]]);
  assert.deepEqual(sheet.variables, [{ name: '#901', label: 'Ø épaulement', description: 'Diamètre fini', assignments: ['l.4 = 25.'], uses: 2 }]);
  assert.equal(sheet.sections.length, 3);
  assert.equal(sheet.lines.length, 38, 'sans la ligne vide finale');
});
