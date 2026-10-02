import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, createCodeDictionary, explainToken, paramsFor } from '../../src/engine/index.js';
import { ISO_BASE_CODES } from '../../src/data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from '../../src/data/codes/fanuc-turning.js';
import { CATEGORIES } from '../../src/data/categories.js';
import { MACRO_KEYWORDS, MACRO_FUNCTIONS } from '../../src/data/macro-language.js';
import { KEYWORDS, FUNCTIONS } from '../../src/engine/tokenizer.js';

const dictionary = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]);

/** Explication du jeton n° index de la ligne. */
function explain(line, index, findAssignments) {
  const { tokens, block } = parseLine(line);
  return explainToken(tokens[index], { block, dictionary, findAssignments });
}

test('données : chaque code a une catégorie valide, un nom et une description', () => {
  const ids = new Set(CATEGORIES.map((c) => c.id));
  for (const layer of [ISO_BASE_CODES, FANUC_TURNING_CODES]) {
    for (const [key, def] of Object.entries(layer.codes)) {
      if (def === null) continue;
      assert.ok(ids.has(def.category), `${key} : catégorie`);
      assert.ok(def.name, `${key} : nom`);
      assert.ok(def.description?.length > 15, `${key} : description`);
      for (const form of def.forms ?? []) assert.ok(Object.keys(form.params).length, `${key} : variante sans paramètre`);
    }
  }
});

test('données : tous les mots-clés et fonctions de macro sont documentés', () => {
  for (const keyword of KEYWORDS) assert.ok(MACRO_KEYWORDS[keyword], keyword);
  for (const fn of FUNCTIONS) assert.ok(MACRO_FUNCTIONS[fn], fn);
});

test('code : définition, source, paramètres présents dans le bloc', () => {
  const e = explain('G71 P90 Q160 U0.4 W0.1 F0.25', 0);
  assert.equal(e.kind, 'code');
  assert.equal(e.title, 'G71');
  assert.equal(e.category, 'cycle');
  assert.equal(e.source, 'FANUC tournage');
  assert.deepEqual(
    e.params.filter((p) => p.value).map((p) => p.value),
    ['P90', 'Q160', 'U0.4', 'W0.1', 'F0.25'],
  );
});

test('variante de cycle choisie selon les lettres du bloc', () => {
  const g71 = dictionary.lookup('G71');
  assert.match(paramsFor(g71, parseLine('G71 U2. R0.5').block).params.U, /Profondeur de passe/);
  assert.match(paramsFor(g71, parseLine('G71 P1 Q2 U0.4').block).params.U, /Surépaisseur/);
  assert.match(explain('G71 U2. R0.5', 1).subtitle, /Profondeur de passe/);
  assert.match(explain('G71 P90 Q160 U0.4 W0.1', 3).subtitle, /Surépaisseur de finition en X/);
});

test('code redéfini par le profil : ancienne signification signalée', () => {
  const e = explain('G90 X46. Z-30. F0.25', 0);
  assert.equal(e.subtitle, 'Cycle de chariotage simple');
  assert.deepEqual(e.redefined.map((r) => [r.sourceLabel, r.name]), [['ISO générique', 'Programmation absolue']]);
  assert.equal(explain('G1 X1.', 0).redefined.length, 0);
});

test('code inconnu du profil', () => {
  const e = explain('G123', 0);
  assert.equal(e.kind, 'unknownCode');
  assert.match(e.description, /profil machine/);
  assert.equal(explain('G43 H1', 0).kind, 'unknownCode', 'retiré par la couche tournage');
});

test('décodages : T0101, G76 P020060, M98 P31000', () => {
  assert.ok(explain('T0101', 0).details.includes('Outil 01 · correcteur 01'));
  assert.ok(explain('T0300', 0).details.some((d) => /annulée/.test(d)));
  const g76 = explain('G76 P020060 Q50 R0.02', 1).details;
  assert.ok(g76.includes('2 passes de finition'));
  assert.ok(g76.includes('Angle de l’outil : 60°'));
  assert.ok(explain('M98 P31000', 1).details.includes('Appelle le programme O1000, 3 fois.'));
  assert.ok(explain('M98 P1000', 1).details.includes('Appelle le programme O1000.'));
});

test('adresse : signification générale propre au tournage, alerte sans point décimal', () => {
  assert.match(explain('X25.', 0).subtitle, /DIAMÈTRE/);
  assert.ok(explain('G1 X25 Z-3.', 1).details.some((d) => /vaut 0,025 mm/.test(d)));
  assert.equal(explain('G1 X25. Z-3.', 1).details.some((d) => /point décimal/.test(d)), false);
  assert.equal(explain('G76 X18.376 Z-22. P812 Q300 F1.5', 3).details.some((d) => /point décimal/.test(d)), false, 'µm sans point : pas d’alerte');
  assert.ok(explain('G1 X#901', 1).details.includes('Valeur calculée : #901'));
});

test('variable : plage FANUC et affectations', () => {
  const e = explain('X#901', 1, () => [{ line: 4, text: '#901 = 25.' }]);
  assert.equal(e.subtitle, 'Variables communes conservées');
  assert.deepEqual(e.details, ['Affectée ligne 4 : #901 = 25.']);
  assert.equal(explain('#1', 0).subtitle, 'Variables locales');
  assert.match(explain('#5001', 0).subtitle, /système/);
  assert.match(explain('#123', 0, () => []).details[0], /Aucune affectation/);
});

test('mots-clés, fonctions, %, saut de bloc ; rien pour un commentaire', () => {
  assert.equal(explain('WHILE[#1LT5]DO1', 0).subtitle, 'Boucle tant que');
  assert.equal(explain('#1=SQRT[2]', 2).description, 'Racine carrée');
  assert.equal(explain('%', 0).subtitle, 'Caractère de début / fin de programme');
  assert.equal(explain('/N10 M1', 0).subtitle, 'Saut de bloc optionnel');
  assert.equal(explain('(COMMENTAIRE)', 0), null);
});
