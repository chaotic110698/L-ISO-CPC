import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../../src/core/event-bus.js';
import { createScope } from '../../src/core/scope.js';
import { debounce, uniqueName, safeFileName, countLines, normalizeNewlines, uid } from '../../src/core/util.js';

test('EventBus : abonnement, émission, désabonnement', () => {
  const bus = new EventBus();
  const received = [];
  const off = bus.on('x', (payload) => received.push(payload));
  bus.emit('x', 1);
  off();
  bus.emit('x', 2);
  assert.deepEqual(received, [1]);
});

test('EventBus : une erreur dans un abonné n’empêche pas les autres', (t) => {
  t.mock.method(console, 'error', () => {});
  const bus = new EventBus();
  let called = false;
  bus.on('x', () => {
    throw new Error('boum');
  });
  bus.on('x', () => (called = true));
  bus.emit('x');
  assert.equal(called, true);
});

test('Scope : nettoyage en ordre inverse, une seule fois, signal annulé', () => {
  const scope = createScope();
  const order = [];
  scope.add(() => order.push(1));
  scope.add(() => order.push(2));
  scope.dispose();
  scope.dispose();
  assert.deepEqual(order, [2, 1]);
  assert.equal(scope.signal.aborted, true);
  // Ajout après destruction : exécuté immédiatement.
  scope.add(() => order.push(3));
  assert.deepEqual(order, [2, 1, 3]);
});

test('debounce : flush, cancel, pending', async () => {
  const calls = [];
  const fn = debounce((v) => calls.push(v), 20);
  fn(1);
  fn(2);
  assert.equal(fn.pending(), true);
  fn.flush();
  assert.deepEqual(calls, [2]);
  fn(3);
  fn.cancel();
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(calls, [2]);
  fn(4);
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(calls, [2, 4]);
});

test('uniqueName : suffixe numérique, insensible à la casse', () => {
  assert.equal(uniqueName('Prog', []), 'Prog');
  assert.equal(uniqueName('Prog', ['prog']), 'Prog 2');
  assert.equal(uniqueName('Prog', ['Prog', 'Prog 2']), 'Prog 3');
});

test('safeFileName : caractères interdits remplacés', () => {
  assert.equal(safeFileName('O1000 : arbre/axe?'), 'O1000 _ arbre_axe_');
  assert.equal(safeFileName('   '), 'programme');
  assert.equal(safeFileName('..secret..'), 'secret');
  assert.equal(safeFileName('Exemple — tournage Fanuc'), 'Exemple - tournage Fanuc');
  assert.equal(safeFileName('Pièce n°2 – ébauche'), 'Piece n_2 - ebauche');
});

test('countLines et normalizeNewlines', () => {
  assert.equal(countLines(''), 0);
  assert.equal(countLines('a'), 1);
  assert.equal(countLines('a\nb\n'), 3);
  assert.equal(normalizeNewlines('a\r\nb\rc\n'), 'a\nb\nc\n');
});

test('uid : identifiants distincts', () => {
  const ids = new Set(Array.from({ length: 500 }, uid));
  assert.equal(ids.size, 500);
});
