import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline, formatDuration } from '../../src/modules/simulation-2d/playback.js';

const moves = [
  { kind: 'rapid', points: [{ x: 0, z: 100 }, { x: 0, z: 0 }] }, // 100 mm à 10 000 mm/min : 0,01 min
  { kind: 'cut', feed: 100, feedMode: 'min', points: [{ x: 0, z: 0 }, { x: 0, z: -10 }, { x: 20, z: -10 }] }, // 20 mm : 0,2 min
  { kind: 'cut', feed: null, points: [{ x: 20, z: -10 }, { x: 30, z: -10 }] }, // sans F : durée nulle
];

test('chronologie : débuts, total, déplacement en cours', () => {
  const tl = createTimeline(moves);
  assert.ok(Math.abs(tl.total - 0.21) < 1e-9);
  assert.deepEqual(tl.locate(0), { index: 0, fraction: 0 });
  const mid = tl.locate(0.11);
  assert.equal(mid.index, 1);
  assert.ok(Math.abs(mid.fraction - 0.5) < 1e-9);
  assert.deepEqual(tl.locate(1), { index: 2, fraction: 1 });
});

test('points parcourus le long d’un déplacement à plusieurs segments', () => {
  const tl = createTimeline(moves);
  assert.deepEqual(tl.partial(1, 0.25), [{ x: 0, z: 0 }, { x: 0, z: -5 }]);
  assert.deepEqual(tl.partial(1, 0.75), [{ x: 0, z: 0 }, { x: 0, z: -10 }, { x: 10, z: -10 }]);
  assert.deepEqual(tl.partial(1, 0.75, 0.25), [{ x: 0, z: -5 }, { x: 0, z: -10 }, { x: 10, z: -10 }]);
});

test('durées lisibles', () => {
  assert.equal(formatDuration(0.7), '42 s');
  assert.equal(formatDuration(3.0833), '3 min 05 s');
  assert.equal(formatDuration(62.5), '1 h 02 min');
});
