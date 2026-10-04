import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, arcCenterFromRadius, moveLength, createCodeDictionary } from '../../src/engine/index.js';
import { ISO_BASE_CODES } from '../../src/data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from '../../src/data/codes/fanuc-turning.js';
import { FANUC_TURNING_BC_CODES } from '../../src/data/codes/fanuc-turning-bc.js';
import { FANUC_TURNING_DEMO } from '../../src/data/samples/fanuc-turning-demo.js';

const a = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]);
const bc = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES, FANUC_TURNING_BC_CODES]);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} ${actual} ≠ ${expected}`);
const last = (move) => move.points.at(-1);
const run = (text, dictionary = a) => simulate(text.split('\n'), dictionary);

test('rapide puis travail, cotes X au diamètre, U/W incrémentaux (système A)', () => {
  const { moves, warnings } = run('G0 X52. Z2.\nM3 S1000\nG1 Z-20. F0.2\nU4. W-1.');
  assert.deepEqual(moves.map((m) => [m.kind, m.code, last(m).x, last(m).z]), [
    ['rapid', 'G0', 52, 2],
    ['cut', 'G1', 52, -20],
    ['cut', 'G1', 56, -21],
  ]);
  close(moveLength(moves[2]), Math.hypot(2, 1), 'longueur au rayon');
  assert.deepEqual(warnings, []);
});

test('système B/C : G91 incrémental, G90 absolu, U/W ne déplacent pas', () => {
  const { moves } = run('G0 X20. Z0\nM3\nG91 G1 Z-10. F0.1\nX4.\nG90 Z-30.\nU8.', bc);
  assert.deepEqual(moves.map((m) => [last(m).x, last(m).z]), [[20, 0], [20, -10], [24, -10], [24, -30]]);
});

test('arc par R : centre du petit arc, R < 0 grand arc, R trop petit signalé', () => {
  const from = { z: 0, r: 10 };
  const to = { z: -5, r: 15 };
  const g3 = arcCenterFromRadius(from, to, 5, false);
  close(g3.z, -5); close(g3.r, 10);
  const g2 = arcCenterFromRadius(from, to, 5, true);
  close(g2.z, 0); close(g2.r, 15);
  assert.equal(arcCenterFromRadius(from, to, 2, true), null);
  const { moves, warnings } = run('G0 X20. Z0\nM3\nG3 X30. Z-5. R5. F0.1\nG2 X40. Z-10. R2.');
  const arc = moves[1];
  assert.ok(arc.points.length > 5, 'arc découpé');
  for (const p of arc.points) close(Math.hypot(p.z + 5, p.x / 2 - 10), 5, 'point sur le cercle');
  assert.match(warnings[0].message, /Arc impossible : R2/);
  assert.equal(warnings[0].line, 4);
});

test('arc par I/K (I au rayon, relatif au départ) et contrôle de cohérence', () => {
  const { moves, warnings } = run('G0 X20. Z0\nM3\nG3 X30. Z-5. I0 K-5. F0.1\nG2 X40. Z-10. I3. K0');
  for (const p of moves[1].points) close(Math.hypot(p.z + 5, p.x / 2 - 10), 5);
  assert.match(warnings[0].message, /Arc incohérent/);
});

test('alertes : F absente, broche arrêtée, diamètre négatif', () => {
  const { warnings } = run('G0 X10. Z1.\nG1 Z-5.\nM3\nG1 X-2. F0.1');
  assert.deepEqual(warnings.map((w) => w.line), [2, 2, 4]);
  assert.match(warnings[0].message, /Avance F non définie/);
  assert.match(warnings[1].message, /broche arrêtée/);
  assert.match(warnings[2].message, /diamètre négatif/);
});

test('G28 U0. W0. : retour direct au point de référence ; fin à M30', () => {
  const { moves, end } = run('G0 X50. Z5.\nG28 U0. W0.\nM30\nG0 X0 Z0');
  assert.deepEqual(moves.map((m) => [m.code, last(m).x, last(m).z]), [['G0', 50, 5], ['G28', 50, 5], ['G28', 200, 150]]);
  assert.deepEqual(end, { x: 200, z: 150 });
});

test('programme d’exemple : G70 suit le profil, G71 saute son profil, outils et vitesses suivis', () => {
  const sim = simulate(FANUC_TURNING_DEMO.content.split('\n'), a);
  assert.deepEqual(sim.tools.map((t) => t.word), ['T0101', 'T0202', 'T0303']);
  // Après G71 (ligne 13), la commande reprend après N160 : pas de passe du profil en T0101.
  assert.equal(sim.moves.filter((m) => m.tool === 'T0101' && m.line >= 14 && m.line <= 21).length, 0);
  // G70 (ligne 27) exécute le profil N90…N160 en T0202, puis revient au point de départ.
  const finish = sim.moves.filter((m) => m.tool === 'T0202' && m.line >= 14 && m.line <= 21);
  assert.equal(finish.length, 8);
  assert.deepEqual(last(finish.at(-1)), { x: 48, z: -55 });
  const css = sim.moves.find((m) => m.tool === 'T0202' && m.kind === 'cut');
  assert.deepEqual([css.speedMode, css.speed, css.maxSpeed, css.feed], ['css', 280, 3000, 0.12]);
  assert.ok(sim.warnings.some((w) => /G71 : cycle pas encore simulé/.test(w.message)));
});

test('durée des déplacements : rapide, mm/min, mm/tr en G97 et G96 limité', async () => {
  const { moveMinutes } = await import('../../src/engine/index.js');
  const line = (x0, z0, x1, z1, extra) => ({ kind: 'cut', points: [{ x: x0, z: z0 }, { x: x1, z: z1 }], ...extra });
  close(moveMinutes({ kind: 'rapid', points: [{ x: 0, z: 0 }, { x: 0, z: 100 }] }), 0.01);
  close(moveMinutes(line(20, 0, 20, -100, { feed: 200, feedMode: 'min' })), 0.5);
  close(moveMinutes(line(20, 0, 20, -100, { feed: 0.1, feedMode: 'rev', speed: 1000, speedMode: 'rpm' })), 1);
  // G96 S200 au Ø 50 : 1273 tr/min ; limité à 1000 par G50 S1000.
  close(moveMinutes(line(50, 0, 50, -100, { feed: 0.1, feedMode: 'rev', speed: 200, speedMode: 'css', maxSpeed: 1000 })), 1);
  close(moveMinutes(line(50, 0, 50, -100, { feed: 0.1, feedMode: 'rev', speed: 200, speedMode: 'css' })), 100 / (0.1 * ((1000 * 200) / (Math.PI * 50))));
  assert.equal(moveMinutes(line(20, 0, 20, -10, { feed: null })), 0);
});
