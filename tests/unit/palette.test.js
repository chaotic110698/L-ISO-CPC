import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankEntries } from '../../src/core/palette.js';

const entries = [
  { label: 'Rechercher / remplacer', detail: 'Ctrl+F', suggested: true },
  { label: 'Aller à…', detail: 'ligne, bloc N', suggested: true },
  { label: 'G71', detail: 'Cycle d’ébauche longitudinale' },
  { label: 'G70', detail: 'Cycle de finition' },
  { label: 'Exemple — tournage Fanuc', detail: 'programme' },
  { label: 'Calculateurs', detail: 'page', suggested: true },
];
const labels = (list) => list.map((e) => e.label);

test('recherche vide : entrées suggérées', () => {
  assert.deepEqual(labels(rankEntries(entries, '  ')), ['Rechercher / remplacer', 'Aller à…', 'Calculateurs']);
});

test('libellé d’abord, sans accents, puis détail', () => {
  assert.deepEqual(labels(rankEntries(entries, 'g7')), ['G71', 'G70']);
  assert.deepEqual(labels(rankEntries(entries, 'g70')), ['G70']);
  assert.deepEqual(labels(rankEntries(entries, 'ebauche')), ['G71']);
  assert.deepEqual(labels(rankEntries(entries, 'aller a')), ['Aller à…']);
  assert.deepEqual(labels(rankEntries(entries, 'cycle')), ['G71', 'G70']);
  assert.deepEqual(labels(rankEntries(entries, 'tournage')), ['Exemple — tournage Fanuc']);
  assert.deepEqual(labels(rankEntries(entries, 'zzz')), []);
});

test('mot du libellé qui commence par la recherche avant une simple inclusion', () => {
  const list = [{ label: 'Paramètres' }, { label: 'Ouvrir les paramètres' }, { label: 'Tout replier' }];
  assert.deepEqual(labels(rankEntries(list, 'param')), ['Paramètres', 'Ouvrir les paramètres']);
  assert.deepEqual(labels(rankEntries(list, 'pli')), ['Tout replier']);
});
