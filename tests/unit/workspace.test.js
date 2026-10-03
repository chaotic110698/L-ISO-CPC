import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Workspace } from '../../src/core/workspace.js';
import { EventBus } from '../../src/core/event-bus.js';
import { createProgramRepository } from '../../src/storage/programs.js';
import { FANUC_TURNING_DEMO } from '../../src/data/samples/fanuc-turning-demo.js';
import { memoryKv, memoryDb, fakeClock } from './helpers.js';

function setup({ kv = memoryKv(), db = memoryDb() } = {}) {
  const bus = new EventBus();
  const events = [];
  for (const type of ['workspace:opened', 'workspace:dirty', 'workspace:saved', 'workspace:list-changed']) {
    bus.on(type, (payload) => events.push([type, payload]));
  }
  const clock = fakeClock();
  const repo = createProgramRepository(db, { now: clock });
  const workspace = new Workspace({ repo, kv, bus });
  // Simule l'éditeur : un simple texte modifiable.
  const editor = { text: '' };
  workspace.setTextSource(() => editor.text);
  bus.on('workspace:opened', ({ program }) => (editor.text = program.content));
  const type = (text) => {
    editor.text = text;
    workspace.markDirty();
  };
  return { workspace, repo, kv, db, bus, events, editor, type, clock };
}

test('premier lancement : crée et ouvre le programme d’exemple', async () => {
  const { workspace, editor } = setup();
  await workspace.init();
  assert.equal(workspace.current.name, FANUC_TURNING_DEMO.name);
  assert.match(editor.text, /O1000/);
  assert.equal(workspace.dirty, false);
});

test('rouvre le dernier programme utilisé', async () => {
  const first = setup();
  await first.workspace.init();
  const other = await first.workspace.create({ name: 'Autre', content: 'M30' });
  const second = setup({ kv: first.kv, db: first.db });
  await second.workspace.init();
  assert.equal(second.workspace.current.id, other.id);
});

test('modification puis enregistrement', async () => {
  const { workspace, repo, type, events } = setup();
  await workspace.init();
  type('G0 X10\nM30');
  assert.equal(workspace.dirty, true);
  await workspace.save();
  assert.equal(workspace.dirty, false);
  assert.equal((await repo.get(workspace.current.id)).content, 'G0 X10\nM30');
  const dirtyEvents = events.filter(([t]) => t === 'workspace:dirty').map(([, p]) => p.dirty);
  assert.deepEqual(dirtyEvents, [false, true, false]);
});

test('une frappe pendant l’écriture en base garde l’état « modifié »', async () => {
  // Base dont l'écriture reste en suspens jusqu'à ce que le test la libère.
  const inner = memoryDb();
  let release;
  let started;
  const writeStarted = new Promise((resolve) => (started = resolve));
  const db = {
    ...inner,
    put: async (store, record) => {
      if (release === null) {
        started();
        await new Promise((resolve) => (release = resolve));
      }
      return inner.put(store, record);
    },
  };
  const { workspace, repo, type } = setup({ db });
  await workspace.init();
  type('A');
  release = null; // la prochaine écriture sera suspendue
  const saving = workspace.save();
  await writeStarted;
  type('AB');
  release();
  await saving;
  assert.equal((await repo.get(workspace.current.id)).content, 'A');
  assert.equal(workspace.dirty, true);
  await workspace.save();
  assert.equal(workspace.dirty, false);
  assert.equal((await repo.get(workspace.current.id)).content, 'AB');
});

test('ouvrir un autre programme enregistre d’abord, sauf si save: false', async () => {
  const { workspace, repo, type } = setup();
  await workspace.init();
  const firstId = workspace.current.id;
  const second = await repo.create({ name: 'Second', content: 'M30' });
  type('MODIF 1');
  await workspace.open(second.id);
  assert.equal((await repo.get(firstId)).content, 'MODIF 1');

  type('PERDU');
  await workspace.open(firstId, { save: false });
  assert.equal((await repo.get(second.id)).content, 'M30');
});

test('suppression du programme ouvert : bascule sur un autre ou en crée un', async () => {
  const { workspace, repo } = setup();
  await workspace.init();
  const only = workspace.current.id;
  await workspace.remove(only);
  assert.notEqual(workspace.current.id, only);
  assert.equal((await repo.list()).length, 1);
});

test('renommer met à jour le programme courant', async () => {
  const { workspace } = setup();
  await workspace.init();
  await workspace.rename(workspace.current.id, 'Arbre de transmission');
  assert.equal(workspace.current.name, 'Arbre de transmission');
});

test('brouillon de secours récupéré au démarrage suivant', async () => {
  const first = setup();
  await first.workspace.init();
  first.type('TEXTE NON ENREGISTRE');
  first.workspace.writeDraft();

  const second = setup({ kv: first.kv, db: first.db });
  const { recovered } = await second.workspace.init();
  assert.equal(recovered, true);
  assert.equal(second.editor.text, 'TEXTE NON ENREGISTRE');
  assert.equal(second.kv.get('draft'), undefined);
});

test('pas de brouillon écrit sans modification', async () => {
  const { workspace, kv } = setup();
  await workspace.init();
  workspace.writeDraft();
  assert.equal(kv.get('draft'), undefined);
});

test('corbeille : suppression récupérable, restauration, nom rendu unique', async () => {
  const { workspace, repo } = setup();
  await workspace.init();
  workspace.trashEnabled = true;
  const other = await workspace.create({ name: 'Arbre', content: 'O1\nM30' });
  await workspace.remove(other.id);
  assert.equal((await workspace.list()).some((p) => p.id === other.id), false, 'absent de la liste');
  assert.deepEqual((await workspace.listTrash()).map((p) => p.name), ['Arbre']);
  assert.notEqual(workspace.current.id, other.id, 'un autre programme est ouvert');
  await workspace.create({ name: 'Arbre', content: 'M30' });
  const restored = await workspace.restore(other.id);
  assert.equal(restored.name, 'Arbre 2');
  assert.equal(restored.content, 'O1\nM30');
  assert.equal(restored.deletedAt, undefined);
  assert.equal((await workspace.listTrash()).length, 0);
  assert.equal((await repo.listAll()).length, 3);
});

test('corbeille : purge après 30 jours, suppression définitive sans corbeille', async () => {
  const { workspace, clock } = setup();
  await workspace.init();
  workspace.trashEnabled = true;
  const old = await workspace.create({ name: 'Ancien', content: 'M30' });
  await workspace.remove(old.id);
  clock.advance(10 * 24 * 3600 * 1000);
  const recent = await workspace.create({ name: 'Récent', content: 'M30' });
  await workspace.remove(recent.id);
  clock.advance(21 * 24 * 3600 * 1000);
  assert.equal(await workspace.purgeExpired(30), 1);
  assert.deepEqual((await workspace.listTrash()).map((p) => p.name), ['Récent']);
  assert.equal(await workspace.emptyTrash(), 1);
  workspace.trashEnabled = false;
  const gone = await workspace.create({ name: 'Définitif', content: 'M30' });
  await workspace.remove(gone.id);
  assert.equal((await workspace.listTrash()).length, 0);
});
