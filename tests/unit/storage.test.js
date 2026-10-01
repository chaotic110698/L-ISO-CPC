import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgramRepository, sanitizeProgram } from '../../src/storage/programs.js';
import { createBackupService, BackupError, BACKUP_FORMAT } from '../../src/storage/backup.js';
import { createKv, createMemoryStorage } from '../../src/storage/kv.js';
import { memoryDb, fakeClock } from './helpers.js';

test('kv : JSON, préfixe, valeur par défaut, données corrompues', () => {
  const storage = createMemoryStorage();
  const kv = createKv({ storage });
  kv.set('a', { b: 1 });
  assert.deepEqual(kv.get('a'), { b: 1 });
  assert.equal(storage.getItem('isocpc:a'), '{"b":1}');
  assert.equal(kv.get('absent', 42), 42);
  storage.setItem('isocpc:casse', '{oups');
  assert.equal(kv.get('casse', 'défaut'), 'défaut');
  assert.deepEqual(kv.keys().sort(), ['a', 'casse']);
});

test('programmes : création, noms uniques, mise à jour, tri, duplication, suppression', async () => {
  const now = fakeClock();
  const repo = createProgramRepository(memoryDb(), { now });
  const a = await repo.create({ name: 'Arbre', content: 'G0 X0\r\nM30' });
  assert.equal(a.content, 'G0 X0\nM30');
  assert.equal(a.machineType, 'tournage');
  const b = await repo.create({ name: 'arbre' });
  assert.equal(b.name, 'arbre 2');

  const updated = await repo.update(a.id, { content: 'M30', name: '  Axe  ' });
  assert.equal(updated.name, 'Axe');
  assert.ok(updated.updatedAt > a.updatedAt);
  assert.deepEqual((await repo.list()).map((p) => p.id), [a.id, b.id]);

  const copy = await repo.duplicate(a.id);
  assert.equal(copy.name, 'Axe (copie)');
  assert.notEqual(copy.id, a.id);

  await repo.remove(b.id);
  assert.equal(await repo.get(b.id), undefined);
  await assert.rejects(repo.update('inconnu', { content: '' }));
});

test('programmes : import fusion / remplacement', async () => {
  const now = fakeClock();
  const repo = createProgramRepository(memoryDb(), { now });
  const local = await repo.create({ name: 'Local', content: 'A' });
  const old = { ...local, content: 'ANCIEN', updatedAt: local.updatedAt - 10 };
  const newer = { ...local, content: 'NOUVEAU', updatedAt: local.updatedAt + 10 };
  const extra = { id: 'ext', name: 'Externe', content: 'B', createdAt: 1, updatedAt: 2 };

  assert.deepEqual(await repo.importMany([old, extra, { id: 3 }]), { added: 1, updated: 0, skipped: 1, invalid: 1 });
  assert.equal((await repo.get(local.id)).content, 'A');
  assert.deepEqual(await repo.importMany([newer]), { added: 0, updated: 1, skipped: 0, invalid: 0 });
  assert.equal((await repo.get(local.id)).content, 'NOUVEAU');

  await repo.importMany([extra], { mode: 'replace' });
  assert.deepEqual((await repo.list()).map((p) => p.id), ['ext']);
});

test('sanitizeProgram : normalise ou rejette', () => {
  assert.equal(sanitizeProgram(null), null);
  assert.equal(sanitizeProgram({ id: 'a' }), null);
  const p = sanitizeProgram({ id: 'a', content: 'x\r\ny', machineType: 'inconnu', name: '' });
  assert.equal(p.content, 'x\ny');
  assert.equal(p.machineType, 'tournage');
  assert.equal(p.name, 'Sans titre');
});

test('sauvegarde : export, analyse, import des sections choisies', async () => {
  const repo = createProgramRepository(memoryDb(), { now: fakeClock() });
  await repo.create({ name: 'P1', content: 'M30' });
  let imported = null;
  const backup = createBackupService({ appVersion: '9.9.9', now: () => new Date('2026-01-02T03:04:05Z') });
  backup.register('programmes', {
    label: 'Programmes',
    exportData: () => repo.list(),
    importData: (data, options) => repo.importMany(data, options),
    describe: (data) => `${data.length} programme(s)`,
  });
  backup.register('parametres', {
    label: 'Paramètres',
    exportData: async () => ({ theme: 'dark' }),
    importData: async (data) => (imported = data),
  });

  const data = await backup.export(['programmes']);
  assert.equal(data.format, BACKUP_FORMAT);
  assert.equal(data.appVersion, '9.9.9');
  assert.equal(data.exportedAt, '2026-01-02T03:04:05.000Z');
  assert.deepEqual(Object.keys(data.sections), ['programmes']);

  const parsed = backup.parse(JSON.stringify(await backup.export()));
  assert.deepEqual(
    backup.summarize(parsed).map((s) => [s.id, s.known]),
    [
      ['programmes', true],
      ['parametres', true],
    ],
  );
  const results = await backup.import(parsed, { sections: ['parametres'] });
  assert.deepEqual(imported, { theme: 'dark' });
  assert.deepEqual(Object.keys(results), ['parametres']);
});

test('sauvegarde : fichiers invalides refusés avec un message clair', () => {
  const backup = createBackupService({ appVersion: '1' });
  assert.throws(() => backup.parse('pas du json'), BackupError);
  assert.throws(() => backup.parse('{"format":"autre"}'), /pas une sauvegarde/);
  assert.throws(() => backup.parse(JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 99, sections: {} })), /plus récente/);
  assert.throws(() => backup.parse(JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 1 })), /aucune donnée/);
});
