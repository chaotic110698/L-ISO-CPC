import { test } from 'node:test';
import assert from 'node:assert/strict';
import { programOutline, outlineSectionAt, createCodeDictionary } from '../../src/engine/index.js';
import { ISO_BASE_CODES } from '../../src/data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from '../../src/data/codes/fanuc-turning.js';
import { FANUC_TURNING_DEMO } from '../../src/data/samples/fanuc-turning-demo.js';

const fanuc = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]);
const brief = (items) => items.map((i) => `${i.line}:${i.kind}:${i.label}`);

test('plan du programme d’exemple : sections, outils, cycles, fin', () => {
  const items = programOutline(FANUC_TURNING_DEMO.content.split('\n'), fanuc);
  assert.deepEqual(brief(items), [
    '2:program:O1000',
    '7:section:EBAUCHE',
    '8:tool:T0101',
    '12:cycle:G71',
    '23:section:FINITION',
    '24:tool:T0202',
    '27:cycle:G70',
    '29:section:FILETAGE M20 X 1.5',
    '30:tool:T0303',
    '33:cycle:G76',
    '37:end:M30',
  ]);
  assert.equal(items[0].detail, 'EXEMPLE TOURNAGE FANUC');
  assert.match(items[3].detail, /ébauche/i);
});

test('plan : en-tête ignoré, appels, sous-programme, T0 ignoré, sans dictionnaire', () => {
  const text = ['O0010 (PIECE)', '(BRUT D40)', '(MATIERE ACIER)', 'T0100', 'T0', 'M98 P2000 L2', 'G65 P9010 A1.', '***', 'M30', 'O2000', 'G90 X20. Z-5. F0.2', 'M99'];
  assert.deepEqual(brief(programOutline(text)), ['1:program:O0010', '4:tool:T0100', '6:call:M98 P2000', '7:call:G65 P9010', '9:end:M30', '10:program:O2000', '11:cycle:G90', '12:end:M99']);
});

test('plan : section décorée, outil commenté', () => {
  const items = programOutline(['O1', 'G21', '(=== DRESSAGE ===)', 'T0505 (OUTIL A DRESSER)'], fanuc);
  assert.deepEqual(brief(items), ['1:program:O0001', '3:section:DRESSAGE', '4:tool:T0505']);
  assert.equal(items[2].detail, 'OUTIL A DRESSER');
});

test('section active à une ligne donnée', () => {
  const items = programOutline(FANUC_TURNING_DEMO.content.split('\n'), fanuc);
  assert.equal(items[outlineSectionAt(items, 1)]?.label, undefined);
  assert.equal(items[outlineSectionAt(items, 15)].label, 'T0101');
  assert.equal(items[outlineSectionAt(items, 23)].label, 'FINITION');
  assert.equal(items[outlineSectionAt(items, 40)].label, 'T0303');
});
