import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModuleRegistry } from '../../src/core/module-registry.js';
import { createSettingsStore } from '../../src/settings/settings-store.js';
import { memoryKv } from './helpers.js';

function setup() {
  const settings = createSettingsStore({ kv: memoryKv() });
  const log = [];
  const errors = [];
  const registry = createModuleRegistry({
    settings,
    createContext: (def, scope) => ({ id: def.id, onDispose: (fn) => scope.add(fn), signal: scope.signal }),
    onError: (def, error) => errors.push([def.id, error.message]),
  });
  /** Module de test qui journalise son activation / désactivation. */
  const mod = (id, extra = {}) => ({
    id,
    label: id,
    activate(ctx) {
      log.push(`+${id}`);
      ctx.onDispose(() => log.push(`-${id}`));
    },
    ...extra,
  });
  return { settings, registry, log, errors, mod };
}

test('les modules activés par défaut démarrent au start(), pas avant', () => {
  const { registry, log, mod } = setup();
  registry.register(mod('a'));
  registry.register(mod('b', { defaultEnabled: false }));
  assert.deepEqual(log, []);
  registry.start();
  assert.deepEqual(log, ['+a']);
  assert.equal(registry.status('a'), 'active');
  assert.equal(registry.status('b'), 'disabled');
});

test('désactivation réelle et réactivation via le réglage', () => {
  const { settings, registry, log, mod } = setup();
  registry.register(mod('a'));
  registry.start();
  settings.set('modules.a', false);
  assert.deepEqual(log, ['+a', '-a']);
  assert.equal(registry.isActive('a'), false);
  settings.set('modules.a', true);
  assert.deepEqual(log, ['+a', '-a', '+a']);
});

test('dépendances : ordre d’activation et blocage', () => {
  const { settings, registry, log, mod } = setup();
  registry.register(mod('enfant', { requires: ['parent'] }));
  registry.register(mod('parent'));
  registry.start();
  assert.deepEqual(log, ['+parent', '+enfant']);
  settings.set('modules.parent', false);
  assert.deepEqual(log, ['+parent', '+enfant', '-enfant', '-parent']);
  assert.equal(registry.status('enfant'), 'blocked');
  settings.set('modules.parent', true);
  assert.equal(registry.status('enfant'), 'active');
});

test('une erreur d’activation est isolée et nettoyée ; nouvel essai après réactivation', () => {
  const { settings, registry, log, errors } = setup();
  let fail = true;
  registry.register({
    id: 'fragile',
    label: 'fragile',
    activate(ctx) {
      ctx.onDispose(() => log.push('nettoyé'));
      if (fail) throw new Error('panne');
      log.push('+fragile');
    },
  });
  registry.start();
  assert.deepEqual(errors, [['fragile', 'panne']]);
  assert.deepEqual(log, ['nettoyé']);
  assert.equal(registry.status('fragile'), 'error');
  fail = false;
  settings.set('modules.fragile', false);
  settings.set('modules.fragile', true);
  assert.equal(registry.status('fragile'), 'active');
});

test('les réglages propres au module sont enregistrés dans le schéma', () => {
  const { settings, registry, mod } = setup();
  registry.register(mod('exp', { settings: [{ key: 'exp.eol', type: 'choice', options: [{ value: 'lf' }], default: 'lf' }] }));
  assert.equal(settings.entry('exp.eol').parentModule, 'exp');
  assert.equal(settings.entry('modules.exp').type, 'boolean');
});

test('enregistrement invalide ou en double refusé', () => {
  const { registry, mod } = setup();
  assert.throws(() => registry.register({ id: 'x' }));
  registry.register(mod('x'));
  assert.throws(() => registry.register(mod('x')));
});
