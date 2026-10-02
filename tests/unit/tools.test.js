import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, diffStats, diffHunks, shiftCoordinates, foldRanges, formatIso, checkProgram, createCodeDictionary } from '../../src/engine/index.js';
import { ISO_BASE_CODES } from '../../src/data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from '../../src/data/codes/fanuc-turning.js';
import { FANUC_TURNING_CYCLES, threadHeight } from '../../src/data/cycles/fanuc-turning.js';
import { FANUC_TURNING_DEMO } from '../../src/data/samples/fanuc-turning-demo.js';
import { createVersionService, MAX_AUTO_VERSIONS } from '../../src/core/versions.js';
import { createLibraryService } from '../../src/core/library.js';
import { memoryDb, fakeClock } from './helpers.js';

const fanuc = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]);
const iso = createCodeDictionary([ISO_BASE_CODES]);

test('formatIso : point décimal, zéros inutiles retirés', () => {
  assert.equal(formatIso(25), '25.');
  assert.equal(formatIso(-30.5), '-30.5');
  assert.equal(formatIso(0.1 + 0.2), '0.3');
  assert.equal(formatIso(-0), '0.');
  assert.equal(formatIso(18.37599, 3), '18.376');
});

test('comparaison : opérations, statistiques, blocs avec contexte', () => {
  const ops = diffLines(['A', 'B', 'C', 'D'], ['A', 'X', 'C', 'D', 'E']);
  assert.deepEqual(ops.map((o) => `${o.type[0]}${o.text}`), ['eA', 'dB', 'iX', 'eC', 'eD', 'iE']);
  assert.deepEqual(diffStats(ops), { added: 2, removed: 1 });
  assert.equal(ops.find((o) => o.text === 'X').bLine, 2);
  assert.deepEqual(diffLines([], []), []);
  assert.deepEqual(diffLines(['A'], []).map((o) => o.type), ['delete']);

  const long = Array.from({ length: 30 }, (_, i) => `L${i}`);
  const changed = [...long];
  changed[15] = 'MODIF';
  const hunks = diffHunks(diffLines(long, changed), 2);
  assert.deepEqual(hunks.map((h) => (h.type === 'skip' ? `…${h.count}` : `${h.type[0]}${h.text}`)), ['…13', 'eL13', 'eL14', 'dL15', 'iMODIF', 'eL16', 'eL17', '…12']);
});

test('décalage de coordonnées : cotes absolues seulement', () => {
  const text = [
    'G28 U0. W0.',
    'G0 X52. Z2.',
    'G71 P90 Q160 U0.4 W0.1 F0.25',
    'G1 X#901 Z-30.5 R5.',
    'G2 X35. Z-30. I5. K0.',
    'G4 X1.',
    'G50 X100. Z100.',
    'G76 X18.376 Z-22. P812 Q300 F1.5',
  ];
  const { lines, changed, skippedExpressions } = shiftCoordinates(text, fanuc, { X: 1, Z: -2 });
  assert.deepEqual(lines, [
    'G28 U0. W0.',
    'G0 X53. Z0.',
    'G71 P90 Q160 U0.4 W0.1 F0.25',
    'G1 X#901 Z-32.5 R5.',
    'G2 X36. Z-32. I5. K0.',
    'G4 X1.',
    'G50 X100. Z100.',
    'G76 X19.376 Z-24. P812 Q300 F1.5',
  ]);
  assert.equal(changed, 7);
  assert.equal(skippedExpressions, 1);
});

test('décalage : plage de lignes, G91 (ISO) ignoré', () => {
  assert.deepEqual(shiftCoordinates(['G0 Z1.', 'G0 Z2.', 'G0 Z3.'], fanuc, { Z: 10 }, { fromLine: 2, toLine: 2 }).lines, ['G0 Z1.', 'G0 Z12.', 'G0 Z3.']);
  assert.deepEqual(shiftCoordinates(['G91 G0 Z1.', 'G90 G0 Z1.'], iso, { Z: 10 }).lines, ['G91 G0 Z1.', 'G90 G0 Z11.']);
});

test('repliage : sous-programmes, boucles, opérations par outil', () => {
  const text = [
    'O1000', // 1
    'T0101', // 2
    'G0 X10.', // 3
    'WHILE [#1 LT 3] DO1', // 4
    'G1 Z-1. F0.1', // 5
    'END1', // 6
    'T0202', // 7
    'G0 X50.', // 8
    'M30', // 9
    'O2000', // 10
    'G0 X1.', // 11
    'M99', // 12
  ];
  assert.deepEqual(foldRanges(text), [
    { fromLine: 1, toLine: 9, kind: 'program' },
    { fromLine: 2, toLine: 6, kind: 'tool' },
    { fromLine: 4, toLine: 6, kind: 'loop' },
    { fromLine: 7, toLine: 8, kind: 'tool' },
    { fromLine: 10, toLine: 12, kind: 'program' },
  ]);
  const demo = foldRanges(FANUC_TURNING_DEMO.content.split('\n'));
  assert.equal(demo.filter((r) => r.kind === 'tool').length, 3, 'trois opérations dans l’exemple');
});

test('cycles : chaque formulaire génère un code sans erreur du vérificateur', () => {
  for (const cycle of FANUC_TURNING_CYCLES) {
    const values = Object.fromEntries(cycle.fields.map((f) => [f.key, f.default]));
    const { lines } = cycle.generate(values);
    assert.ok(lines.length >= 2, cycle.id);
    const program = ['O1', 'G21 G99', 'G50 S3000', 'T0101', 'G96 S200 M03', 'F0.2', ...lines, 'M30'];
    const errors = checkProgram(program, fanuc).filter((d) => d.severity === 'error');
    assert.deepEqual(errors, [], `${cycle.id} : ${errors.map((e) => e.message).join(' / ')}`);
    for (const code of cycle.codes) assert.ok(fanuc.lookup(code), `${cycle.id} : ${code} défini`);
  }
});

test('cycle G76 : hauteur de filet, conversions en µm, P en six chiffres', () => {
  const g76 = FANUC_TURNING_CYCLES.find((c) => c.id === 'g76');
  const values = Object.fromEntries(g76.fields.map((f) => [f.key, f.default]));
  const { lines } = g76.generate(values);
  assert.deepEqual(lines, ['G97 S1200 M03', 'G0 X24. Z5.', 'G76 P020060 Q50 R0.02', 'G76 X18.16 Z-22. P920 Q300 F1.5']);
  assert.equal(Math.round(threadHeight(1.5, false) * 1000), 920);
});

test('versions : manuelles, automatiques sans doublon, limite, import', async () => {
  const versions = createVersionService({ db: memoryDb(), now: fakeClock() });
  await versions.create('p1', 'A', { label: 'Avant modif' });
  assert.equal(await versions.snapshot('p1', 'A'), null, 'contenu identique : pas de nouvelle version');
  await versions.snapshot('p1', 'B');
  for (let i = 0; i < MAX_AUTO_VERSIONS + 5; i++) await versions.snapshot('p1', `C${i}`);
  const list = await versions.list('p1');
  assert.equal(list.filter((v) => v.auto).length, MAX_AUTO_VERSIONS);
  assert.ok(list.some((v) => v.label === 'Avant modif'), 'version manuelle conservée');
  assert.equal(list[0].content, `C${MAX_AUTO_VERSIONS + 4}`, 'plus récente en premier');
  assert.deepEqual(await versions.list('p2'), []);
});

test('bibliothèque : création, tri, modification, suppression, import', async () => {
  const library = createLibraryService({ db: memoryDb(), now: fakeClock() });
  const b = await library.create({ name: 'Tronçonnage', content: 'G75 X0.\r\nM99' });
  await library.create({ name: 'Approche', content: 'G0 X100. Z100.' });
  assert.deepEqual((await library.list()).map((i) => i.name), ['Approche', 'Tronçonnage']);
  assert.equal(b.content, 'G75 X0.\nM99');
  await library.update(b.id, { description: 'Outil 3 mm' });
  assert.equal((await library.list())[1].description, 'Outil 3 mm');
  const exported = await library.exportAll();
  await library.remove(b.id);
  assert.deepEqual(await library.importAll(exported), { added: 1, updated: 0, invalid: 0 });
});
