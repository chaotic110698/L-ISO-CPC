import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsStore, SETTINGS_KEY } from '../../src/settings/settings-store.js';
import { memoryKv } from './helpers.js';

const ENTRIES = [
  { key: 'theme', type: 'choice', options: [{ value: 'light' }, { value: 'dark' }], default: () => 'light' },
  { key: 'size', type: 'number', min: 10, max: 20, step: 1, default: 15 },
  { key: 'flag', type: 'boolean', default: true },
];

test('valeurs par défaut (y compris calculées)', () => {
  const settings = createSettingsStore({ kv: memoryKv(), entries: ENTRIES });
  assert.equal(settings.get('theme'), 'light');
  assert.equal(settings.get('size'), 15);
  assert.equal(settings.get('flag'), true);
});

test('set : validation, bornes, pas, persistance', () => {
  const kv = memoryKv();
  const settings = createSettingsStore({ kv, entries: ENTRIES });
  settings.set('size', 99);
  assert.equal(settings.get('size'), 20);
  settings.set('size', '12.4');
  assert.equal(settings.get('size'), 12);
  assert.throws(() => settings.set('theme', 'rose'));
  assert.throws(() => settings.set('flag', 'oui'));
  assert.throws(() => settings.set('inconnu', 1));
  settings.set('theme', 'dark');
  assert.deepEqual(kv.get(SETTINGS_KEY), { size: 12, theme: 'dark' });

  const reloaded = createSettingsStore({ kv, entries: ENTRIES });
  assert.equal(reloaded.get('theme'), 'dark');
  assert.equal(reloaded.isExplicit('theme'), true);
  assert.equal(reloaded.isExplicit('flag'), false);
});

test('une valeur stockée invalide retombe sur la valeur par défaut', () => {
  const kv = memoryKv();
  kv.set(SETTINGS_KEY, { theme: 'violet', size: 'abc' });
  const settings = createSettingsStore({ kv, entries: ENTRIES });
  assert.equal(settings.get('theme'), 'light');
  assert.equal(settings.get('size'), 15);
});

test('abonnements : clé précise et joker, uniquement si la valeur change', () => {
  const settings = createSettingsStore({ kv: memoryKv(), entries: ENTRIES });
  const seen = [];
  settings.subscribe('flag', (value, key, previous) => seen.push(['flag', value, previous]));
  const off = settings.subscribe('*', (value, key) => seen.push(['*', key, value]));
  settings.set('flag', false);
  settings.set('flag', false);
  off();
  settings.set('size', 11);
  assert.deepEqual(seen, [
    ['flag', false, true],
    ['*', 'flag', false],
  ]);
});

test('reset et resetAll notifient le retour à la valeur par défaut', () => {
  const settings = createSettingsStore({ kv: memoryKv(), entries: ENTRIES });
  settings.set('flag', false);
  settings.set('size', 18);
  const seen = [];
  settings.subscribe('*', (value, key) => seen.push([key, value]));
  settings.reset('flag');
  assert.equal(settings.get('flag'), true);
  settings.resetAll();
  assert.equal(settings.get('size'), 15);
  assert.deepEqual(seen, [
    ['flag', true],
    ['size', 15],
  ]);
});

test('export / import (fusion et remplacement)', () => {
  const settings = createSettingsStore({ kv: memoryKv(), entries: ENTRIES });
  settings.set('size', 18);
  assert.deepEqual(settings.exportValues(), { size: 18 });

  const merged = settings.importValues({ theme: 'dark', inconnu: 1, flag: 'faux' });
  assert.deepEqual(merged, { applied: 1, ignored: 2 });
  assert.equal(settings.get('size'), 18);
  assert.equal(settings.get('theme'), 'dark');

  settings.importValues({ flag: false }, { mode: 'replace' });
  assert.equal(settings.get('size'), 15);
  assert.equal(settings.get('theme'), 'light');
  assert.equal(settings.get('flag'), false);
});
