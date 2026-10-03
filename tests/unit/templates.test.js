import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TURNING_TEMPLATES, codeSystem } from '../../src/data/templates/turning.js';
import { checkProgram, createCodeDictionary } from '../../src/engine/index.js';
import { ISO_BASE_CODES } from '../../src/data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from '../../src/data/codes/fanuc-turning.js';
import { FANUC_TURNING_BC_CODES } from '../../src/data/codes/fanuc-turning-bc.js';

const template = (id) => TURNING_TEMPLATES.find((t) => t.id === id);
const defaults = (t) => Object.fromEntries(t.fields.map((f) => [f.key, f.default]));
const run = (id, values = {}, system = 'a') => template(id).generate({ ...defaults(template(id)), ...values }, { system }).lines;

test('système de codes déduit des profils', () => {
  assert.equal(codeSystem(['iso-base', 'fanuc-turning']), 'a');
  assert.equal(codeSystem(['iso-base', 'fanuc-turning', 'fanuc-turning-bc']), 'bc');
});

test('séquence d’outil : G50 en système A, G92 en B/C', () => {
  assert.deepEqual(run('tool'), ['(--- FINITION ---)', 'T0202', 'G50 S3000', 'G96 S220 M03', 'G00 X52. Z2. M08']);
  assert.deepEqual(run('tool', { mode: 'rpm', speed: 1200, label: '', coolant: false }, 'bc'), ['T0202', 'G97 S1200 M03', 'G00 X52. Z2.']);
  assert.equal(run('tool', {}, 'bc')[2], 'G92 S3000');
});

test('bloc de sécurité et fin : G28 U0. W0. (A), G91 G28 X0 Z0 (B/C)', () => {
  assert.deepEqual(run('safety'), ['G21 G40 G97 G99', 'G28 U0. W0.']);
  assert.deepEqual(run('safety', { feed: 'min' }, 'bc'), ['G21 G40 G90 G97 G94', 'G91 G28 X0 Z0', 'G90']);
  assert.deepEqual(run('end'), ['M09', 'M05', 'G28 U0. W0.', 'M30', '%']);
  assert.deepEqual(run('end', { kind: 'M99', home: false, percent: false }), ['M99']);
});

test('en-tête : commentaires en majuscules, sans parenthèses parasites', () => {
  assert.deepEqual(run('header', { number: 12, name: 'arbre (rep 3)', stock: '', material: 'inox' }), ['%', 'O0012 (ARBRE REP 3)', '(MATIERE INOX)']);
});

test('les modèles par défaut passent le vérificateur (A et B/C)', () => {
  const a = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]);
  const bc = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES, FANUC_TURNING_BC_CODES]);
  for (const [system, dictionary] of [['a', a], ['bc', bc]]) {
    const lines = ['header', 'safety', 'tool', 'clear', 'end'].flatMap((id) => run(id, {}, system));
    const errors = checkProgram(lines, dictionary).filter((d) => d.severity === 'error');
    assert.deepEqual(errors, [], `système ${system}`);
  }
});
