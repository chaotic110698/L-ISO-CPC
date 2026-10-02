import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCodeDictionary, checkProgram, modalStateAt, renumber } from '../../src/engine/index.js';
import { ISO_BASE_CODES } from '../../src/data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from '../../src/data/codes/fanuc-turning.js';
import { FANUC_TURNING_BC_CODES } from '../../src/data/codes/fanuc-turning-bc.js';
import { MODAL_GROUP_IDS, NON_MODAL } from '../../src/data/modal-groups.js';
import { FANUC_TURNING_DEMO } from '../../src/data/samples/fanuc-turning-demo.js';

const fanuc = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]);
const iso = createCodeDictionary([ISO_BASE_CODES]);
const lines = (text) => text.split('\n');
const check = (text, dictionary = fanuc, options) => checkProgram(lines(text), dictionary, options);
const rules = (diagnostics) => diagnostics.map((d) => `${d.line}:${d.rule}`);

test('données : chaque groupe modal référencé existe', () => {
  for (const layer of [ISO_BASE_CODES, FANUC_TURNING_CODES, FANUC_TURNING_BC_CODES]) {
    for (const [key, def] of Object.entries(layer.codes)) {
      if (def?.group) assert.ok(def.group === NON_MODAL || MODAL_GROUP_IDS.has(def.group), `${key} : ${def.group}`);
    }
  }
});

test('le programme d’exemple ne déclenche aucun diagnostic', () => {
  assert.deepEqual(check(FANUC_TURNING_DEMO.content), []);
});

test('état modal à une ligne : groupes, outil, broche, arrosage, F, S, G50', () => {
  const text = FANUC_TURNING_DEMO.content;
  const s = modalStateAt(lines(text), 21, fanuc); // après N160 Z-55.
  assert.equal(s.groups.motion, 'G1');
  assert.equal(s.groups.feedMode, 'G99');
  assert.equal(s.groups.spindleMode, 'G96');
  assert.equal(s.groups.cutterComp, 'G40');
  assert.deepEqual(s.tool, { word: 'T0101', number: 1, offset: 1 });
  assert.equal(s.spindle, 'M3');
  assert.equal(s.coolant, 'M8');
  assert.equal(s.feed, 0.12);
  assert.equal(s.speed, 220);
  assert.equal(s.maxSpeed, 3000);
  assert.equal(s.program, 1000);
  const end = modalStateAt(lines(text), 999, fanuc);
  assert.equal(end.spindle, 'M5');
  assert.equal(end.coolant, 'M9');
  assert.equal(end.groups.spindleMode, 'G97');
  // G90 : cycle (groupe déplacement) en FANUC tournage, cotation absolue en ISO.
  assert.equal(modalStateAt(['G90 X40. Z-10. F0.2'], 1, fanuc).groups.motion, 'G90');
  assert.equal(modalStateAt(['G90'], 1, iso).groups.distance, 'G90');
});

test('syntaxe : parenthèse non fermée, caractère invalide, valeur manquante', () => {
  const d = check('G0 X1. (OUVERT\nG1 @ Z1. F1.\nG0 X Z1.\nM30');
  assert.deepEqual(rules(d), ['1:syntax', '2:syntax', '3:syntax']);
  assert.match(d[0].message, /non fermée/);
  assert.equal(d[1].from, 3);
  assert.match(d[2].message, /Valeur manquante après X/);
});

test('codes incompatibles (même groupe), adresse répétée, plusieurs M', () => {
  const d = check('G0 G1 X1. X2. F0.1 M3 M8 S100\nM30');
  assert.deepEqual(rules(d), ['1:sameGroup', '1:repeatedAddress', '1:multipleM']);
  assert.match(d[0].message, /G0 et G1 sont incompatibles/);
});

test('code inconnu du profil', () => {
  const d = check('G43 H1\nM30');
  assert.deepEqual(rules(d), ['1:unknownCode']);
});

test('point décimal, avance non définie', () => {
  assert.deepEqual(rules(check('G0 X25 Z1.\nM30')), ['1:decimalPoint']);
  assert.deepEqual(rules(check('G0 X0 Z0\nM30')), [], 'zéro : pas d’ambiguïté');
  assert.deepEqual(rules(check('G1 X10. Z-5.\nM30')), ['1:feed']);
  assert.deepEqual(rules(check('G1 X10. F0.2\nM30')), []);
});

test('broche : M3 sans S, G96 sans G50 S (tournage FANUC uniquement)', () => {
  assert.deepEqual(rules(check('M3\nM30')), ['1:spindle']);
  assert.deepEqual(rules(check('G96 S200 M3\nM30')), ['1:spindle']);
  assert.deepEqual(rules(check('G50 S2500\nG96 S200 M3\nM30')), []);
  assert.deepEqual(rules(check('G96 S200 M3\nM30', iso)), []);
});

test('G40 oublié : fin de programme et changement d’outil', () => {
  const d = check('G0 G42 X10. Z1.\nT0202\nM30');
  assert.deepEqual(rules(d), ['2:compensation', '3:compensation']);
  assert.deepEqual(rules(check('G0 G42 X10. Z1.\nG0 G40 X50.\nT0202\nM30')), []);
});

test('références de blocs et N en double', () => {
  const d = check('N10 G71 U1. R0.5\nN20 G71 P30 Q99 U0.2 W0.1 F0.2\nN30 G0 X10.\nN30 G1 Z-5.\nGOTO 55\nM30');
  assert.deepEqual(rules(d), ['2:blockRefs', '4:blockRefs', '5:blockRefs']);
  assert.match(d[0].message, /Q99 : aucun bloc N99/);
  assert.match(d[1].message, /N30 en double/);
  assert.match(d[2].message, /GOTO 55/);
});

test('fin de programme absente (M99 accepté pour un sous-programme)', () => {
  assert.deepEqual(rules(check('G0 X1.\n\n')), ['1:programEnd']);
  assert.deepEqual(rules(check('O2000\nG0 X1.\nM99')), []);
});

test('règles désactivables', () => {
  assert.deepEqual(check('G0 X25 Z1.', fanuc, { rules: { decimalPoint: false, programEnd: false } }), []);
});

test('renumérotation : pas, références P/Q, GOTO, M99 P, ajout des N manquants', () => {
  const text = '%\nO100\nN5 G71 U1. R0.5\nN7 G71 P9 Q11 U0.2 W0.1 F0.2\nN9 G0 X10.\nG1 Z-5.\nN11 X20.\nIF [#1 GT 0] GOTO 9\n(COMMENTAIRE)\nM99 P11';
  const result = renumber(lines(text), fanuc, { start: 10, step: 10 });
  assert.deepEqual(result.lines, ['%', 'O100', 'N10 G71 U1. R0.5', 'N20 G71 P30 Q40 U0.2 W0.1 F0.2', 'N30 G0 X10.', 'G1 Z-5.', 'N40 X20.', 'IF [#1 GT 0] GOTO 30', '(COMMENTAIRE)', 'M99 P40']);
  assert.equal(result.changed, 6);

  const all = renumber(lines(text), fanuc, { start: 100, step: 5, addMissing: true });
  assert.deepEqual(all.lines.slice(2), ['N100 G71 U1. R0.5', 'N105 G71 P110 Q120 U0.2 W0.1 F0.2', 'N110 G0 X10.', 'N115 G1 Z-5.', 'N120 X20.', 'N125 IF [#1 GT 0] GOTO 110', '(COMMENTAIRE)', 'N130 M99 P120']);
  assert.deepEqual(all.lines.slice(0, 2), ['%', 'O100'], '% et O… jamais numérotés');
});

test('renumérotation d’une portion seulement', () => {
  const result = renumber(['N1 G0 X1.', 'N2 G0 X2.', 'N3 G0 X3.'], fanuc, { start: 50, step: 1, fromLine: 2, toLine: 3 });
  assert.deepEqual(result.lines, ['N1 G0 X1.', 'N50 G0 X2.', 'N51 G0 X3.']);
});
