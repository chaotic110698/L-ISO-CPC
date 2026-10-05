import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCodeDictionary } from '../../src/engine/index.js';
import { ISO_BASE_CODES } from '../../src/data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from '../../src/data/codes/fanuc-turning.js';
import { sameBlock, sanitizeSession, simulateChain } from '../../src/modules/simulation-2d/session.js';

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
