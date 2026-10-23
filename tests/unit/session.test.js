import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCodeDictionary } from '../../src/engine/index.js';
import { ISO_BASE_CODES } from '../../src/data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from '../../src/data/codes/fanuc-turning.js';
import { sameBlock, sanitizeSession, simulateChain, splitLegacySession } from '../../src/modules/simulation-2d/session.js';

const codes = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]);

test('session : programmes sans texte écartés, diamant connu ou « auto »', () => {
  const session = sanitizeSession({ programs: [{ id: 'a', name: 'DROIT', text: 'G0 X0', diamond: 'rightFlank' }, { name: 'X' }, { id: 3, text: '', diamond: 'oblique' }] });
  assert.deepEqual(session.programs, [
    { id: 'a', name: 'DROIT', text: 'G0 X0', diamond: 'rightFlank' },
    { id: null, name: 'Programme', text: '', diamond: 'auto' },
  ]);
  assert.deepEqual(sanitizeSession(null), { programs: [] });
});

test('programmes enchaînés : variables partagées, sans remise à zéro, et position reprise', () => {
  const right = ['#100=0.2 (PASSE COMMUNE)', '#101=#101+1', 'G0 X2. Z0', 'G1 X[-#100] F0.1', 'G0 X2.'].join('\n');
  const left = ['#101=#101+1', 'G1 X[-#100*2] F0.1', 'G0 X4.'].join('\n');
  const chain = simulateChain([{ text: right }, { text: left }], codes);
  assert.equal(chain.variables.get(101), 2, 'le compteur continue dans le 2e programme');
  const second = chain.moves.filter((m) => m.program === 1);
  assert.equal(second[0].points[0].x, 2, 'le 2e programme part de la fin du 1er');
  assert.equal(second[0].points.at(-1).x, -0.4, '#100 du 1er programme est connue du 2e');
  assert.equal(chain.starts[1], chain.moves.indexOf(second[0]));
  assert.deepEqual(chain.end, { x: 4, z: 0 });
  assert.ok(sameBlock(second[0], { program: 1, line: second[0].line }));
  assert.ok(!sameBlock(second[0], { program: 0, line: second[0].line }));
});

test('programmes enchaînés : variables après chaque programme, alerte si une variable attendue est vide', () => {
  const left = ['#500=0.15 (PASSE)', '#105=12.', '#101=#101+1', 'G0 X2. Z0.2', 'G1 X[-#105] F80', 'G0 X2.'].join('\n');
  const right = ['#101=#101+1', '#120=#105-#500', 'G0 X2. Z[#500]', 'G1 X[-#120] F80', 'G0 X2.'].join('\n');
  const inOrder = simulateChain([{ text: left }, { text: right }], codes);
  assert.deepEqual(inOrder.snapshots.map((m) => Object.fromEntries(m)), [
    { 500: 0.15, 105: 12, 101: 1 },
    { 500: 0.15, 105: 12, 101: 2, 120: 11.85 },
  ], 'le 2e programme reçoit les valeurs du 1er (colonne « Après 1 »)');
  // (alertes propres au tour — broche, diamètre négatif — écartées par le simulateur rectification)
  const dressingWarnings = (list) => list.filter((w) => !/broche arrêtée|diamètre négatif/.test(w.message));
  assert.deepEqual(dressingWarnings(inOrder.warnings), [], 'compteur #101 = #101 + 1 : pas d’alerte');
  // Programme du flanc droit seul (ou placé avant l'autre) : ses variables d'entrée sont vides.
  const alone = simulateChain([{ text: right }], codes);
  const messages = dressingWarnings(alone.warnings).map((w) => w.message);
  assert.ok(messages.some((m) => /^#120 = #105-#500 : #105, #500 vides, comptées 0\. Si un autre programme les écrit, chargez-le avant celui-ci\.$/.test(m)), messages.join(' | '));
  assert.ok(messages.some((m) => /^Z\[#500\] : variable vide, l’adresse Z est ignorée\. Si un autre programme l’écrit, chargez-le avant celui-ci\.$/.test(m)), messages.join(' | '));
  // Variable système (position, correcteurs…) : non simulée.
  const system = simulateChain([{ text: 'G0 X[#5021+2.] Z0' }], codes);
  assert.match(dressingWarnings(system.warnings)[0].message, /#5021, variable système non simulée, comptée 0/);
});

const fakeKv = (entries = {}) => {
  const store = new Map(Object.entries(entries));
  return { get: (key, fallback = null) => (store.has(key) ? store.get(key) : fallback), set: (key, value) => store.set(key, value), remove: (key) => store.delete(key) };
};

test('séparation des simulateurs : la session de taillage passe au simulateur rectification, une seule fois', () => {
  const dressing = { programs: [{ id: 'a', name: 'DROIT', text: 'O1 (TAILLAGE MEULE L40)\nG0 X2.' }] };
  const kv = fakeKv({ 'simulation.session': dressing, 'simulation.wheel.a': { width: 30, invertZ: true } });
  splitLegacySession(kv);
  assert.equal(kv.get('simulation.session'), null, 'retirée du simulateur tour');
  assert.equal(kv.get('rectification.session').programs[0].name, 'DROIT');
  assert.deepEqual(kv.get('rectification.legacyWheel'), { width: 30, invertZ: true }, 'réglages de meule mis de côté');
  // Une seule fois : une session chargée ensuite dans le simulateur tour y reste.
  kv.set('simulation.session', dressing);
  splitLegacySession(kv);
  assert.ok(kv.get('simulation.session'));

  const lathe = fakeKv({ 'simulation.session': { programs: [{ id: 'b', name: 'ARBRE', text: 'O2 (ARBRE)\nG0 X20.' }] } });
  splitLegacySession(lathe);
  assert.equal(lathe.get('simulation.session').programs[0].name, 'ARBRE', 'programme de tour : inchangé');
  assert.equal(lathe.get('rectification.session'), null);

  const chosen = fakeKv({ 'simulation.session': { programs: [{ id: 'c', name: 'P', text: 'G0 X2.' }] }, 'simulation.machine.c': 'dressing' });
  splitLegacySession(chosen);
  assert.equal(chosen.get('rectification.session').programs[0].name, 'P', 'machine choisie « taillage » sans commentaire');
});
