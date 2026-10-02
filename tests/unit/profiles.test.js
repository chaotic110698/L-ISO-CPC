import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProfileService, parseCodeKey, sanitizeCodeDefinition } from '../../src/core/profiles.js';
import { createCodeDictionary } from '../../src/engine/code-dictionary.js';
import { normalizeRanges, parseRanges, formatRanges, inRanges, nextFreeVariable, validateRange, countInRanges } from '../../src/engine/macro-ranges.js';
import { EventBus } from '../../src/core/event-bus.js';
import { memoryDb, fakeClock } from './helpers.js';

async function setup(db = memoryDb()) {
  const dictionary = createCodeDictionary();
  const bus = new EventBus();
  let changes = 0;
  bus.on('profiles:changed', () => changes++);
  const profiles = createProfileService({ db, dictionary, bus, now: fakeClock() });
  await profiles.init();
  return { db, dictionary, profiles, changes: () => changes };
}

test('plages de macros : normalisation, fusion, saisie libre, formatage', () => {
  assert.deepEqual(normalizeRanges([{ from: 960, to: 999 }, { from: 949, to: 900 }, { from: 950, to: 955 }]), [
    { from: 900, to: 955 },
    { from: 960, to: 999 },
  ]);
  assert.deepEqual(parseRanges('#900–#949, 960-999 ; 100').ranges, [
    { from: 100, to: 100 },
    { from: 900, to: 949 },
    { from: 960, to: 999 },
  ]);
  assert.match(parseRanges('900-abc').error, /illisible/);
  assert.match(parseRanges('999-900').error, /inférieure/);
  assert.equal(validateRange(1, 2), null);
  assert.equal(formatRanges([{ from: 900, to: 949 }, { from: 960, to: 999 }]), '#900–#949, #960–#999');
  assert.equal(formatRanges([]), 'aucune');
  assert.equal(inRanges([{ from: 900, to: 949 }], 949), true);
  assert.equal(inRanges([{ from: 900, to: 949 }], 950), false);
  assert.equal(countInRanges([{ from: 900, to: 999 }]), 100);
  assert.equal(nextFreeVariable([{ from: 900, to: 902 }], new Set([900, 901])), 902);
  assert.equal(nextFreeVariable([{ from: 900, to: 900 }], new Set([900])), null);
});

test('saisie d’un code : normalisation et nettoyage de la définition', () => {
  assert.equal(parseCodeKey('g01'), 'G1');
  assert.equal(parseCodeKey(' M 100 '), 'M100');
  assert.equal(parseCodeKey('G12.1'), 'G12.1');
  assert.equal(parseCodeKey('X10'), null);
  const def = sanitizeCodeDefinition({ category: 'pirate', name: '  Mon code ', params: { x: 'Axe', '??': 'non' }, notes: ['', 'note'], modal: 'oui' });
  assert.deepEqual(def, { category: 'mode', name: 'Mon code', params: { X: 'Axe' }, notes: ['note'] });
  assert.equal(sanitizeCodeDefinition(null), null);
  assert.equal(sanitizeCodeDefinition('texte'), undefined);
});

test('profils intégrés par défaut : ISO puis FANUC tournage, plage #500–#999', async () => {
  const { profiles, dictionary } = await setup();
  assert.deepEqual(profiles.list().map((p) => [p.id, p.builtin, p.enabled]), [
    ['iso-base', true, true],
    ['fanuc-turning', true, true],
  ]);
  assert.equal(dictionary.lookup('G90').category, 'cycle');
  assert.deepEqual(profiles.macroRanges().ranges, [{ from: 500, to: 999 }]);
  assert.equal(profiles.macroRanges().profile.name, 'FANUC tournage');
});

test('désactiver un profil change immédiatement le dictionnaire, état conservé', async () => {
  const { profiles, dictionary, db } = await setup();
  await profiles.update('fanuc-turning', { enabled: false, macroRanges: [{ from: 900, to: 999 }] });
  assert.equal(dictionary.lookup('G90').category, 'mode');
  assert.equal(dictionary.lookup('G71'), undefined);
  const again = await setup(db);
  assert.equal(again.profiles.get('fanuc-turning').enabled, false);
  assert.deepEqual(again.profiles.get('fanuc-turning').macroRanges, [{ from: 900, to: 999 }]);
});

test('profil personnel : code propriétaire, code standard redéfini, code retiré', async () => {
  const { profiles, dictionary, changes } = await setup();
  const mine = await profiles.create({ name: 'Tour Okuma' });
  assert.equal(profiles.list().at(-1).id, mine.id, 'placé au-dessus des profils existants');
  await profiles.setCode(mine.id, 'M50', { category: 'mcode', name: 'Ouverture du mandrin' });
  await profiles.setCode(mine.id, 'M8', { category: 'mcode', name: 'Arrosage haute pression' });
  await profiles.setCode(mine.id, 'G28', null);
  assert.equal(dictionary.lookup('M50').name, 'Ouverture du mandrin');
  assert.equal(dictionary.lookup('M50').sourceLabel, 'Tour Okuma');
  assert.deepEqual(dictionary.lookup('M8').previous.map((p) => p.sourceLabel), ['ISO générique']);
  assert.equal(dictionary.lookup('G28'), undefined);
  await profiles.removeCode(mine.id, 'G28');
  assert.ok(dictionary.lookup('G28'));
  assert.ok(changes() >= 5);
  await assert.rejects(profiles.setCode('fanuc-turning', 'M50', { name: 'x' }), /intégré/);
  await assert.rejects(profiles.remove('iso-base'), /intégré/);
});

test('ordre de la pile : le profil le plus haut l’emporte', async () => {
  const { profiles, dictionary } = await setup();
  const mine = await profiles.create({ name: 'Perso' });
  await profiles.setCode(mine.id, 'G90', { category: 'mode', name: 'Absolu (perso)' });
  assert.equal(dictionary.lookup('G90').name, 'Absolu (perso)');
  await profiles.move(mine.id, -1);
  assert.deepEqual(profiles.list().map((p) => p.id), ['iso-base', mine.id, 'fanuc-turning']);
  assert.equal(dictionary.lookup('G90').name, 'Cycle de chariotage simple');
  await profiles.move('iso-base', -1); // déjà en tête : sans effet
  assert.equal(profiles.list()[0].id, 'iso-base');
});

test('plages : profil activé le plus spécifique qui en déclare', async () => {
  const { profiles } = await setup();
  const mine = await profiles.create({ name: 'Perso' });
  assert.equal(profiles.macroRanges().profile.id, 'fanuc-turning', 'profil sans plage ignoré');
  await profiles.update(mine.id, { macroRanges: [{ from: 960, to: 999 }, { from: 900, to: 949 }] });
  assert.deepEqual(profiles.macroRanges().ranges, [
    { from: 900, to: 949 },
    { from: 960, to: 999 },
  ]);
  await profiles.update(mine.id, { enabled: false });
  assert.equal(profiles.macroRanges().profile.id, 'fanuc-turning');
});

test('copie, suppression, export / import d’un profil seul', async () => {
  const { profiles } = await setup();
  const a = await profiles.create({ name: 'A' });
  await profiles.setCode(a.id, 'M50', { category: 'mcode', name: 'Mandrin' });
  const b = await profiles.create({ name: 'A', copyFrom: a.id });
  assert.equal(b.name, 'A 2');
  assert.equal(b.codes.M50.name, 'Mandrin');
  const exported = profiles.exportProfile(a.id);
  await profiles.remove(a.id);
  const imported = await profiles.importProfile(JSON.parse(JSON.stringify(exported)));
  assert.equal(imported.codes.M50.name, 'Mandrin');
  await assert.rejects(profiles.importProfile({ format: 'autre' }), /profil machine/);
});

test('sauvegarde globale : export puis import (fusion / remplacement)', async () => {
  const first = await setup();
  const mine = await first.profiles.create({ name: 'Ma machine' });
  await first.profiles.setCode(mine.id, 'M50', { category: 'mcode', name: 'Mandrin' });
  await first.profiles.update('fanuc-turning', { macroRanges: [{ from: 900, to: 999 }] });
  const data = JSON.parse(JSON.stringify(first.profiles.exportAll()));

  const second = await setup();
  const other = await second.profiles.create({ name: 'Autre' });
  const merged = await second.profiles.importAll(data, { mode: 'merge' });
  assert.equal(merged.added, 1);
  assert.equal(second.dictionary.lookup('M50').name, 'Mandrin');
  assert.deepEqual(second.profiles.get('fanuc-turning').macroRanges, [{ from: 900, to: 999 }]);
  assert.ok(second.profiles.list().some((p) => p.id === other.id));

  await second.profiles.importAll(data, { mode: 'replace' });
  assert.equal(second.profiles.list().some((p) => p.id === other.id), false);
});
