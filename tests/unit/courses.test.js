import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCodeDictionary, parseLine, tokenCategory, checkProgram } from '../../src/engine/index.js';
import { ISO_BASE_CODES } from '../../src/data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from '../../src/data/codes/fanuc-turning.js';
import { FANUC_TURNING_BC_CODES } from '../../src/data/codes/fanuc-turning-bc.js';
import { LESSONS, LEVELS, isAvailable } from '../../src/data/courses/index.js';
import { FIGURES } from '../../src/modules/courses/figures.js';
import { parseInline, BLOCK_TYPES, NOTE_TONES } from '../../src/modules/courses/render.js';
import { checkAnswer, checkBlock, compareBlock, describeBlockResult, parseNumber, validateQuestion } from '../../src/modules/courses/quiz.js';
import { BOX_DAYS, MASTERED_BOX, codeQuestions, filterPool, lessonQuestions, mergeReview, reviewStats, sanitizeReview, schedule, seededRandom, selectSession } from '../../src/modules/courses/review.js';
import { MACHINE_PREFS, sanitizeProgress, mergeProgress, createProgressStore, lessonStatus } from '../../src/modules/courses/progress.js';
import { memoryKv, fakeClock } from './helpers.js';

const dictionaries = {
  default: createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]),
  iso: createCodeDictionary([ISO_BASE_CODES]),
  a: createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]),
  bc: createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES, FANUC_TURNING_BC_CODES]),
};

/** Parcourt tous les blocs (y compris imbriqués) : fn(bloc, chemin, dictionnaire hérité). */
function walk(blocks, fn, path, inherited = 'default') {
  for (const [i, block] of blocks.entries()) {
    const here = `${path}[${i}:${block.type}]`;
    const dictionary = block.dictionary ?? inherited;
    fn(block, here, dictionary);
    if (block.blocks) walk(block.blocks, fn, here, dictionary);
    if (block.type === 'variants') {
      for (const [key, inner] of Object.entries(block.cases)) walk(inner, fn, `${here}.${key}`, block.dictionaries?.[key] ?? dictionary);
    }
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
  assert.ok(LESSONS.filter(isAvailable).length >= 8);
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
        (block, path, dictionaryKey) => {
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
          const dictionary = dictionaries[dictionaryKey];
          assert.ok(dictionary, `dictionnaire inconnu ${where}`);
          for (const text of inlineTexts(block)) {
            for (const part of parseInline(text).filter((p) => p.type === 'code')) {
              assert.deepEqual(unknownTokens(part.text, dictionary), [], `code en ligne « ${part.text} » ${where}`);
            }
          }
          if (block.type === 'code') {
            const lines = codeLines(block);
            for (const line of lines) assert.deepEqual(unknownTokens(line, dictionary), [], `« ${line} » ${where}`);
            // Les programmes complets (ouvrables dans l'éditeur) passent le vérificateur sans erreur,
            // sauf les exercices volontairement fautifs, qui doivent au contraire en contenir.
            if (block.open && block.exercise) {
              assert.ok(checkProgram(lines, dictionary).length > 0, `exercice sans aucun signalement ${where}`);
            } else if (block.open) {
              const errors = checkProgram(lines, dictionary).filter((d) => d.severity === 'error');
              assert.deepEqual(errors.map((e) => `${e.line}: ${e.message}`), [], where);
            }
          }
          if (block.type === 'anatomy') for (const part of block.parts) assert.deepEqual(unknownTokens(part.text, dictionary), [], where);
        },
        '',
      );
    }
    for (const text of [lesson.summary, ...lesson.goals]) {
      for (const part of parseInline(text).filter((p) => p.type === 'code')) assert.deepEqual(unknownTokens(part.text, dictionaries.default), [], `objectif ${lesson.id}`);
    }
  });

  test(`leçon « ${lesson.id} » : quiz complet et réussissable`, () => {
    assert.ok(lesson.quiz?.length >= 4, 'au moins 4 questions');
    lesson.quiz.forEach((question, i) => {
      const where = `${lesson.id} question ${i + 1}`;
      assert.deepEqual(validateQuestion(question), [], where);
      const dictionary = dictionaries[question.dictionary ?? 'default'];
      assert.ok(dictionary, `dictionnaire ${where}`);
      const texts = [question.question, question.explain, ...(question.options ?? [])];
      for (const text of texts) {
        for (const part of parseInline(text).filter((p) => p.type === 'code')) assert.deepEqual(unknownTokens(part.text, dictionary), [], `« ${part.text} » ${where}`);
      }
      for (const line of question.lines ?? []) assert.deepEqual(unknownTokens(line, dictionary), [], `« ${line} » ${where}`);
      for (const variant of [question.expect ?? []].flat()) assert.deepEqual(unknownTokens(variant, dictionary), [], `attendu « ${variant} » ${where}`);
      // La bonne réponse est acceptée.
      const right = { choice: question.answer, block: [question.expect].flat()[0], number: String(question.answer), error: question.answer }[question.type];
      assert.equal(checkAnswer(question, right).ok, true, `bonne réponse refusée : ${where}`);
    });
  });
}

test('quiz : bloc comparé sans tenir compte de l’ordre, des zéros ni du N', () => {
  assert.equal(compareBlock('N50 g1 f.1 z-5.0 x20.', 'G01 X20. Z-5. F0.1').ok, true);
  assert.equal(compareBlock('G01 X20. Z-5. F0.1 (FINITION)', 'G01 X20. Z-5. F0.1').ok, true);
  const wrong = compareBlock('G00 X20. Z-6. S100', 'G01 X20. Z-5. F0.1');
  assert.equal(wrong.ok, false);
  assert.deepEqual(wrong.missing, ['G1', 'F0.1']);
  assert.deepEqual(wrong.extra, ['G0', 'S100']);
  assert.deepEqual(wrong.wrong, [{ letter: 'Z', got: 'Z-6.', expected: 'Z-5.' }]);
  const decimal = compareBlock('G01 X20 Z-5. F0.1', 'G01 X20. Z-5. F0.1');
  assert.deepEqual(decimal.decimal, ['X20']);
  assert.equal(decimal.ok, false);
  assert.match(describeBlockResult(decimal).join(), /0,020 mm/);
  assert.equal(compareBlock('G01 X0 Z-5. F0.1', 'G01 X0. Z-5. F0.1').ok, true, 'X0 sans point : sans conséquence');
  assert.deepEqual(compareBlock('G01 X @20.', 'G01 X20.').invalid.length > 0, true);
  assert.equal(compareBlock('', 'G01 X20.').ok, false);
});

test('quiz : variantes acceptées, nombres à la française', () => {
  assert.equal(checkBlock('U10.', ['G01 U10.', 'U10.']).ok, true);
  assert.equal(checkBlock('W10.', ['G01 U10.', 'U10.']).ok, false);
  assert.equal(parseNumber('1 432,5'), 1432.5);
  assert.equal(parseNumber('-0,06'), -0.06);
  assert.equal(parseNumber('abc'), null);
  assert.equal(checkAnswer({ type: 'number', answer: 1273, tolerance: 5 }, '1 270').ok, true);
  assert.equal(checkAnswer({ type: 'number', answer: 1273, tolerance: 5 }, '1260').ok, false);
  assert.equal(checkAnswer({ type: 'choice', answer: [0, 2] }, [2, 0]).ok, true);
  assert.equal(checkAnswer({ type: 'choice', answer: [0, 2] }, [0]).ok, false);
  assert.equal(checkAnswer({ type: 'error', answer: 3 }, 3).ok, true);
});

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
  assert.deepEqual(clean, { lessons: { a: { openedAt: 5 } }, prefs: { turret: 'front', system: 'all' }, review: { items: {}, options: { source: 'all', size: 10 } } });
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

test('progression : meilleur score de quiz conservé', () => {
  const store = createProgressStore(memoryKv(), { now: fakeClock() });
  store.setQuiz('a', 3, 5);
  store.setQuiz('a', 2, 5);
  assert.equal(store.get().lessons.a.quiz.best, 3);
  store.setQuiz('a', 5, 5);
  assert.equal(store.get().lessons.a.quiz.best, 5);
  assert.equal(store.status('a'), 'opened');
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

// ---- Mode révision ---------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

test('révision : questions générées à partir des codes, valides et réussissables', () => {
  const questions = codeQuestions(dictionaries.default.entries(), seededRandom(7));
  const ids = questions.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
  for (const kind of ['name', 'code', 'modal', 'param']) assert.ok(ids.some((id) => id.startsWith(`gen:${kind}:`)), kind);
  for (const q of questions) {
    assert.deepEqual(validateQuestion(q), [], q.id);
    assert.equal(new Set(q.options).size, q.options.length, `options distinctes ${q.id}`);
    assert.equal(checkAnswer(q, q.answer).ok, true, q.id);
    for (const text of [q.question, q.explain, ...q.options]) {
      for (const part of parseInline(text).filter((p) => p.type === 'code')) assert.deepEqual(unknownTokens(part.text, dictionaries.default), [], `${q.id} : ${part.text}`);
    }
  }
  const g76 = questions.find((q) => q.id === 'gen:name:G76');
  assert.equal(g76.options[g76.answer], 'Cycle de filetage multipasses');
  const g4 = questions.find((q) => q.id === 'gen:modal:G4');
  assert.equal(g4.options[g4.answer], 'Non : il ne vaut que pour son bloc');
});

test('révision : codes personnels inclus, avec le nom du profil', () => {
  const custom = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES, { id: 'perso', label: 'Tour Okuma', codes: { M50: { category: 'mcode', name: 'Ouverture du mandrin' } } }]);
  const questions = codeQuestions(custom.entries(), seededRandom(3));
  const q = questions.find((x) => x.id === 'gen:name:M50');
  assert.match(q.question, /Tour Okuma/);
  assert.doesNotMatch(questions.find((x) => x.id === 'gen:name:G71').question, /profil/, 'profils intégrés non cités');
  assert.equal(q.options[q.answer], 'Ouverture du mandrin');
});

test('révision : questions des leçons identifiées et rattachées à leur leçon', () => {
  const questions = lessonQuestions(LESSONS.filter(isAvailable));
  assert.equal(questions.length, LESSONS.reduce((n, l) => n + (l.quiz?.length ?? 0), 0));
  assert.equal(questions[0].id, 'lesson:programme-iso:0');
  assert.equal(questions[0].lesson.number, 1);
  assert.equal(filterPool([...questions, { id: 'gen:x', source: 'code' }], 'codes').length, 1);
});

test('révision : boîtes de Leitner', () => {
  const now = 1_000 * DAY;
  let item = schedule(undefined, true, now);
  assert.deepEqual(item, { box: 1, due: now + BOX_DAYS[1] * DAY, right: 1, wrong: 0, last: now });
  item = schedule(item, true, now);
  assert.equal(item.box, 2);
  assert.equal(item.due, now + 3 * DAY);
  item = schedule(item, false, now);
  assert.deepEqual([item.box, item.due, item.right, item.wrong], [1, now, 2, 1], 'erreur : retour en boîte 1, à revoir tout de suite');
  for (let i = 0; i < 10; i++) item = schedule(item, true, now);
  assert.equal(item.box, BOX_DAYS.length - 1, 'boîte maximale');
});

test('révision : session = questions dues d’abord, puis nouvelles ; révision libre sinon', () => {
  const now = 100 * DAY;
  const pool = [
    { id: 'a', source: 'lesson' },
    { id: 'b', source: 'lesson' },
    { id: 'c', source: 'code' },
    { id: 'd', source: 'code' },
  ];
  const items = {
    a: { box: 2, due: now - 2 * DAY, last: 1 },
    b: { box: 3, due: now + DAY, last: 2 },
    c: { box: 1, due: now - DAY, last: 3 },
  };
  const { questions, mode } = selectSession(pool, items, { size: 3, now, rng: seededRandom(1) });
  assert.equal(mode, 'due');
  assert.deepEqual(questions.map((q) => q.id).sort(), ['a', 'c', 'd'], 'b n’est pas encore dû');
  assert.deepEqual(reviewStats(pool, items, now), { due: 2, fresh: 1, mastered: 0, total: 4 });

  const allLater = { a: { box: MASTERED_BOX, due: now + DAY, last: 5 }, b: { box: 4, due: now + DAY, last: 1 }, c: { box: 5, due: now + DAY, last: 3 }, d: { box: 4, due: now + DAY, last: 2 } };
  const free = selectSession(pool, allLater, { size: 2, now, rng: seededRandom(1) });
  assert.equal(free.mode, 'free');
  assert.deepEqual(free.questions.map((q) => q.id).sort(), ['b', 'd'], 'les moins récemment vues');
  assert.equal(reviewStats(pool, allLater, now).mastered, 4);
});

test('révision : nettoyage et fusion des états', () => {
  const clean = sanitizeReview({ items: { a: { box: 9 }, b: { box: 2, due: 5, last: 7 }, c: 'x' }, options: { source: 'codes', size: 99 } });
  assert.deepEqual(clean, { items: { b: { box: 2, due: 5, right: 0, wrong: 0, last: 7 } }, options: { source: 'codes', size: 10 } });
  const merged = mergeReview(
    { items: { a: { box: 1, last: 10 }, b: { box: 3, last: 50 } }, options: { source: 'all', size: 10 } },
    { items: { a: { box: 4, last: 20 }, b: { box: 1, last: 40 }, c: { box: 2, last: 5 } }, options: { source: 'lessons', size: 20 } },
  );
  assert.deepEqual(Object.fromEntries(Object.entries(merged.items).map(([k, v]) => [k, v.box])), { a: 4, b: 3, c: 2 });
  assert.equal(merged.options.size, 20);
});

test('progression : réponses de révision enregistrées et persistantes', () => {
  const kv = memoryKv();
  const store = createProgressStore(kv, { now: () => 1000 });
  store.recordReview('lesson:programme-iso:0', true);
  store.setReviewOption('source', 'codes');
  const again = createProgressStore(kv);
  assert.equal(again.get().review.items['lesson:programme-iso:0'].box, 1);
  assert.equal(again.get().review.options.source, 'codes');
});
