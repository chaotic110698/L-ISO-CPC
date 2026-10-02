import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCodeDictionary, parseLine, tokenCategory, checkProgram } from '../../src/engine/index.js';
import { ISO_BASE_CODES } from '../../src/data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from '../../src/data/codes/fanuc-turning.js';
import { LESSONS, LEVELS, isAvailable } from '../../src/data/courses/index.js';
import { FIGURES } from '../../src/modules/courses/figures.js';
import { parseInline, BLOCK_TYPES, NOTE_TONES } from '../../src/modules/courses/render.js';
import { MACHINE_PREFS, sanitizeProgress, mergeProgress, createProgressStore, lessonStatus } from '../../src/modules/courses/progress.js';
import { memoryKv, fakeClock } from './helpers.js';

const dictionaries = {
  default: createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]),
  iso: createCodeDictionary([ISO_BASE_CODES]),
};

/** Parcourt tous les blocs (y compris imbriqués) : fn(bloc, chemin). */
function walk(blocks, fn, path) {
  for (const [i, block] of blocks.entries()) {
    const here = `${path}[${i}:${block.type}]`;
    fn(block, here);
    if (block.blocks) walk(block.blocks, fn, here);
    if (block.type === 'variants') for (const [key, inner] of Object.entries(block.cases)) walk(inner, fn, `${here}.${key}`);
  }
}

/** Textes enrichis d'un bloc (pour vérifier les codes en ligne). */
function inlineTexts(block) {
  return [block.text, block.title, block.caption, ...(block.items ?? []), ...(block.head ?? []), ...(block.rows ?? []).flat()].filter((t) => typeof t === 'string');
}

const codeLines = (block) => (block.lines ? block.lines.map((l) => (Array.isArray(l) ? l[0] : l)) : block.code.split('\n'));

function unknownTokens(text, dictionary) {
  return parseLine(text)
    .tokens.filter((token) => ['unknown', 'invalid'].includes(tokenCategory(token, dictionary)))
    .map((token) => text.slice(token.from, token.to));
}

test('catalogue : identifiants uniques, niveaux connus, numéros croissants', () => {
  const ids = LESSONS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  const levels = new Set(LEVELS.map((l) => l.id));
  LESSONS.forEach((lesson, i) => {
    assert.ok(levels.has(lesson.level), lesson.id);
    assert.equal(lesson.number, i + 1, lesson.id);
    assert.ok(lesson.title && lesson.summary, lesson.id);
  });
  assert.ok(LESSONS.filter(isAvailable).length >= 4);
});

for (const lesson of LESSONS.filter(isAvailable)) {
  test(`leçon « ${lesson.id} » : structure et exemples valides`, () => {
    assert.ok(lesson.duration > 0 && lesson.goals?.length, 'durée et objectifs');
    const sectionIds = lesson.sections.map((s) => s.id);
    assert.equal(new Set(sectionIds).size, sectionIds.length, 'sections uniques');
    for (const section of lesson.sections) {
      assert.ok(section.title && section.blocks.length, section.id);
      walk(
        section.blocks,
        (block, path) => {
          const where = `${lesson.id}/${section.id}${path}`;
          assert.ok(BLOCK_TYPES.includes(block.type), `type inconnu ${where}`);
          if (block.type === 'note') assert.ok(NOTE_TONES[block.tone], `ton inconnu ${where}`);
          if (block.type === 'figure') assert.ok(FIGURES[block.figure], `schéma inconnu ${where}`);
          if (block.type === 'variants') {
            const pref = MACHINE_PREFS.find((p) => p.key === block.pref);
            assert.ok(pref, `préférence inconnue ${where}`);
            const values = pref.options.map((o) => o.value).filter((v) => v !== pref.default);
            assert.deepEqual(Object.keys(block.cases).sort(), values.sort(), `cas ${where}`);
          }
          const dictionary = dictionaries[block.dictionary ?? 'default'];
          assert.ok(dictionary, `dictionnaire inconnu ${where}`);
          for (const text of inlineTexts(block)) {
            for (const part of parseInline(text).filter((p) => p.type === 'code')) {
              assert.deepEqual(unknownTokens(part.text, dictionary), [], `code en ligne « ${part.text} » ${where}`);
            }
          }
          if (block.type === 'code') {
            const lines = codeLines(block);
            for (const line of lines) assert.deepEqual(unknownTokens(line, dictionary), [], `« ${line} » ${where}`);
            // Les programmes complets (ouvrables dans l'éditeur) passent le vérificateur sans erreur.
            if (block.open) {
              const errors = checkProgram(lines, dictionary).filter((d) => d.severity === 'error');
              assert.deepEqual(errors.map((e) => `${e.line}: ${e.message}`), [], where);
            }
          }
          if (block.type === 'anatomy') for (const part of block.parts) assert.deepEqual(unknownTokens(part.text, dictionary), [], where);
        },
        '',
      );
    }
  });
}

test('schémas : SVG produit pour les deux positions d’outil', () => {
  for (const [name, draw] of Object.entries(FIGURES)) {
    for (const turret of ['rear', 'front']) {
      const svg = draw({ turret });
      assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+ \d+"/, name);
      assert.doesNotMatch(svg, /NaN|undefined/, `${name} ${turret}`);
    }
  }
});

test('texte enrichi : code, gras, italique', () => {
  assert.deepEqual(parseInline('Le code `G01` est **modal**, *souvent*.'), [
    { type: 'text', text: 'Le code ' },
    { type: 'code', text: 'G01' },
    { type: 'text', text: ' est ' },
    { type: 'strong', text: 'modal' },
    { type: 'text', text: ', ' },
    { type: 'em', text: 'souvent' },
    { type: 'text', text: '.' },
  ]);
});

test('progression : nettoyage des données lues', () => {
  const clean = sanitizeProgress({ lessons: { a: { openedAt: 5, readAt: 'x', junk: 1 }, b: 'n' }, prefs: { turret: 'front', system: 'Z' } });
  assert.deepEqual(clean, { lessons: { a: { openedAt: 5 } }, prefs: { turret: 'front', system: 'all' } });
  assert.deepEqual(sanitizeProgress(null).lessons, {});
});

test('progression : fusion (ce qui est fait de part et d’autre, meilleur score)', () => {
  const mine = sanitizeProgress({ lessons: { a: { openedAt: 10, quiz: { best: 3, total: 5, at: 1 } }, b: { openedAt: 3 } } });
  const theirs = sanitizeProgress({ lessons: { a: { openedAt: 4, readAt: 20, quiz: { best: 4, total: 5, at: 2 } }, c: { openedAt: 7 } }, prefs: { turret: 'rear' } });
  const merged = mergeProgress(mine, theirs);
  assert.deepEqual(merged.lessons.a, { openedAt: 4, readAt: 20, quiz: { best: 4, total: 5, at: 2 } });
  assert.deepEqual(merged.lessons.b, { openedAt: 3 });
  assert.deepEqual(merged.lessons.c, { openedAt: 7 });
  assert.equal(merged.prefs.turret, 'rear');
  assert.equal(lessonStatus(merged, 'a'), 'read');
  assert.equal(lessonStatus(merged, 'c'), 'opened');
  assert.equal(lessonStatus(merged, 'z'), 'new');
});

test('progression : magasin persistant (ouverture, lecture, préférences)', () => {
  const kv = memoryKv();
  const store = createProgressStore(kv, { now: fakeClock(100) });
  let changes = 0;
  store.onChange(() => changes++);
  store.markOpened('a');
  store.markOpened('a');
  assert.equal(changes, 1, 'une seule ouverture enregistrée');
  store.setRead('a');
  store.setPref('turret', 'front');
  const again = createProgressStore(kv);
  assert.equal(again.status('a'), 'read');
  assert.equal(again.pref('turret'), 'front');
  again.setRead('a', false);
  assert.equal(again.status('a'), 'opened');
  again.reset();
  assert.equal(again.status('a'), 'new');
  assert.equal(again.pref('turret'), 'front', 'les préférences survivent à la remise à zéro');
});
