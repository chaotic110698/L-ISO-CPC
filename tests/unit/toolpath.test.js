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
  assert.deepEqual(sim.warnings, [], 'programme d’exemple sans alerte');
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

const lastOf = (moves) => moves.at(-1).points.at(-1);

test('G71 : passes de 2 mm au rayon jusqu’au profil décalé, demi-finition, retour au point A', () => {
  const sim = simulate(FANUC_TURNING_DEMO.content.split('\n'), a);
  const g71 = sim.moves.filter((m) => m.line === 13);
  // Passes en Z (travail) : niveaux Ø48, Ø44 … Ø20 (8 passes), au-dessus du profil Ø16 + 0,4.
  const passes = g71.filter((m) => m.kind === 'cut' && m.points[0].x === m.points[1].x && m.points[0].z === 2);
  assert.deepEqual(passes.map((m) => m.points[0].x), [48, 44, 40, 36, 32, 28, 24, 20]);
  // Ø48 : arrêt sur le profil décalé (Ø48 + 0,4 atteint au flanc Z-30 + 0,1).
  close(passes[0].points[1].z, -29.9, 'arrêt de la 1re passe');
  // Ø20 : arrêt au chanfrein (Ø20,4 à Z-1,9), donc entre Z-2 et Z0.
  assert.ok(passes.at(-1).points[1].z < 0 && passes.at(-1).points[1].z > -2);
  assert.deepEqual(lastOf(g71), { x: 52, z: 2 }, 'retour au point A');
  for (const m of g71) for (const p of m.points) assert.ok(p.x >= 16.4 - 1e-9 || m.kind === 'rapid', 'jamais sous la surépaisseur');
});

test('cycle simple G90 modal : répété par les blocs X seuls', () => {
  const { moves } = run('G0 X52. Z2.\nM3\nG90 X48. Z-30. F0.2\nX46.\nX44.\nG0 X100.');
  const cycles = moves.filter((m) => m.code === 'G90');
  assert.equal(cycles.length, 12);
  assert.deepEqual(cycles.filter((m) => m.kind === 'cut' && m.points[0].z !== -30 && m.points[1].z === -30).map((m) => m.points[1].x), [48, 46, 44]);
  assert.deepEqual(lastOf(moves), { x: 100, z: 2 });
});

test('G76 : passes à section constante jusqu’au fond du filet, outil à fileter', () => {
  const { moves } = run('G0 X24. Z5.\nM3 S1200\nG76 P020060 Q50 R0.02\nG76 X18.16 Z-22. P920 Q300 F1.5');
  const cuts = moves.filter((m) => m.code === 'G76' && m.kind === 'cut');
  assert.ok(cuts.length >= 8, `${cuts.length} passes`);
  assert.ok(cuts.every((m) => m.shape === 'thread' && m.feed === 1.5));
  const diameters = cuts.map((m) => m.points.at(-1).x);
  close(diameters.at(-1), 18.16, 'fond du filet');
  close(diameters.at(-2), 18.16, '2 passes de finition (P02…)');
  close(diameters[0], 18.16 + 2 * (0.92 - 0.3), '1re passe : Q300 µm');
  for (let i = 1; i < diameters.length; i++) assert.ok(diameters[i] <= diameters[i - 1] + 1e-9, 'de plus en plus profond');
});

test('G74 perçage avec débourrage, G75 gorge, G72 et G73', () => {
  const drill = run('G0 X0 Z2.\nM3\nG74 R1.\nG74 Z-20. Q5000 F0.1').moves.filter((m) => m.code === 'G74');
  assert.deepEqual(drill.filter((m) => m.kind === 'cut').map((m) => m.points.at(-1).z), [-3, -8, -13, -18, -20]);
  assert.ok(drill.every((m) => m.shape === 'drill'));
  const groove = run('G0 X42. Z-20.\nM3\nG75 R0.5\nG75 X30. Z-24. P2000 Q3000 F0.05').moves.filter((m) => m.code === 'G75' && m.kind === 'cut');
  assert.deepEqual([...new Set(groove.map((m) => m.points.at(-1).z))], [-20, -23, -24]);
  assert.equal(Math.min(...groove.map((m) => m.points.at(-1).x)), 30);
  const face = run('G0 X52. Z2.\nM3\nG72 W2. R0.5\nG72 P10 Q20 U0.2 W0.1 F0.2\nN10 G0 Z-6.\nG1 X20.\nN20 Z0').moves.filter((m) => m.code === 'G72' && m.kind === 'cut');
  assert.ok(face.length > 3 && face.every((m) => m.points.every((p) => p.x >= 20 - 1e-9)));
  const repeat = run('G0 X52. Z2.\nM3\nG73 U3. W0 R3\nG73 P10 Q20 U0.4 W0 F0.2\nN10 G0 X30.\nG1 Z-20.\nN20 X50.').moves.filter((m) => m.code === 'G73' && m.kind === 'cut' && m.points[0].z === 2);
  assert.deepEqual(repeat.map((m) => m.points[0].x), [36.4, 33.4, 30.4]);
});

test('sous-programme M98 (répétitions) et M99', () => {
  const text = 'O1000\nG0 X50. Z2.\nM98 P20010\nG0 X100.\nM30\nO0010\nG0 W-5.\nM99';
  const { moves, warnings } = run(text);
  assert.deepEqual(moves.map((m) => [m.line, m.points.at(-1).z]), [[2, 2], [7, -3], [7, -8], [4, -8]]);
  assert.deepEqual(warnings, []);
  assert.match(run('M98 P1234').warnings[0].message, /O1234 absent/);
});

test('côté des outils deviné : extérieur (exemple), intérieur (alésage depuis Ø18)', async () => {
  const { toolSides } = await import('../../src/engine/index.js');
  const demo = simulate(FANUC_TURNING_DEMO.content.split('\n'), a);
  assert.deepEqual(toolSides(demo.moves), { '': 'external', T0101: 'external', T0202: 'external', T0303: 'external' });
  const bore = run('T0404\nG97 S1000 M3\nG0 X18. Z2.\nG71 U1.5 R0.5\nG71 P10 Q20 U-0.4 W0.1 F0.2\nN10 G0 X40.\nG1 Z0 F0.1\nX34. Z-3.\nZ-30.\nN20 X18.');
  assert.deepEqual(toolSides(bore.moves), { T0404: 'internal' });
  // Ébauche intérieure : prises de passe vers l'extérieur, jamais au-delà du profil (Ø40 - 0,4).
  const cuts = bore.moves.filter((m) => m.kind === 'cut');
  assert.ok(cuts.length > 5 && cuts.every((m) => m.points.every((p) => p.x <= 39.6 + 1e-9)));
});

test('macros : WHILE … DO / END, IF … GOTO, IF … THEN, N avant l’affectation', () => {
  // Trois passes de chariotage calculées par une boucle.
  const loop = run(['#1 = 50.', 'M3 S1000', 'G0 X52. Z2.', 'WHILE [#1 GT 44.] DO1', '#1 = #1 - 2.', 'G1 X#1 F0.2', 'Z-20.', 'G0 X52. Z2.', 'END1', 'G0 X100.'].join('\n'));
  assert.deepEqual(loop.moves.filter((m) => m.kind === 'cut' && m.points[1].z === -20).map((m) => m.points[1].x), [48, 46, 44]);
  assert.deepEqual(loop.variables, { 1: 44 });
  const jump = run(['N10 #2 = 0', 'N20 #2 = #2 + 1', 'IF [#2 LT 3] GOTO 20', 'IF [#2 EQ 3] THEN #5 = 7', 'IF [#2 EQ 9] THEN #6 = 1', 'GOTO 50', 'G0 X999.', 'N50 G0 X#5'].join('\n'));
  assert.deepEqual(jump.variables, { 2: 3, 5: 7 });
  assert.deepEqual(jump.moves.map((m) => m.points.at(-1).x), [7], 'la ligne sautée n’est pas exécutée');
  assert.match(run('GOTO 99').warnings[0].message, /aucun bloc N99/);
  assert.match(run('WHILE [1 EQ 1] DO1\nG0 X1.\nEND1').warnings.at(-1).message, /boucle sans fin/);
});
