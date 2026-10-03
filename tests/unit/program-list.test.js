import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterPrograms } from '../../src/ui/programs-drawer.js';

const programs = [
  { id: 'a', name: 'Arbre 10', content: 'O1000\nT0101\nM30', updatedAt: 3 },
  { id: 'b', name: 'Écrou', content: 'O2000\nT0303\nM30', updatedAt: 5 },
  { id: 'c', name: 'Arbre 9', content: 'O3000\nM30', updatedAt: 1, pinned: true },
];
const ids = (list) => list.map((e) => e.program.id);

test('épinglés en tête, puis par date ou par nom (numérique)', () => {
  assert.deepEqual(ids(filterPrograms(programs)), ['c', 'b', 'a']);
  assert.deepEqual(ids(filterPrograms(programs, { sort: 'name' })), ['c', 'a', 'b']);
  assert.deepEqual(ids(filterPrograms(programs, { pins: false })), ['b', 'a', 'c']);
});

test('recherche sans accents dans le nom, puis dans le contenu', () => {
  assert.deepEqual(filterPrograms(programs, { query: 'ecrou' }).map((e) => [e.program.id, e.match]), [['b', 'name']]);
  assert.deepEqual(filterPrograms(programs, { query: 't0303' }).map((e) => [e.program.id, e.match]), [['b', 'content']]);
  assert.deepEqual(ids(filterPrograms(programs, { query: 'arbre', sort: 'name' })), ['c', 'a']);
  assert.equal(filterPrograms(programs, { query: 'G76' }).length, 0);
});
