/**
 * Mode révision (fonctions pures, sans DOM) : réserve de questions et répétition espacée.
 *
 * Réserve = questions des quiz des leçons + questions générées à partir des codes du
 * dictionnaire actif (profils machines de l'utilisateur, codes personnels compris).
 *
 * Répétition espacée (boîtes de Leitner) : chaque question a une boîte de 0 (jamais vue) à 5.
 * Bonne réponse : boîte suivante, prochaine révision dans BOX_DAYS[boîte] jours. Mauvaise
 * réponse : retour en boîte 1, à revoir tout de suite.
 */

import { BUILTIN_PROFILES } from '../../data/profiles.js';

const BUILTIN_SOURCES = new Set(BUILTIN_PROFILES.map((p) => p.id));

export const BOX_DAYS = [0, 1, 3, 7, 16, 35];
export const MAX_BOX = BOX_DAYS.length - 1;
/** Boîte à partir de laquelle une question est considérée comme maîtrisée. */
export const MASTERED_BOX = 4;
const DAY = 24 * 60 * 60 * 1000;

export const REVIEW_SOURCES = [
  { value: 'all', label: 'Tout' },
  { value: 'lessons', label: 'Questions des leçons' },
  { value: 'codes', label: 'Codes de vos profils' },
];
export const REVIEW_SIZES = [10, 20];

/** Générateur pseudo-aléatoire reproductible (tests). */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rng = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Première phrase d'une description, sans caractères de mise en forme. */
const firstSentence = (text) => String(text ?? '').replace(/[`*]/g, '').split(/(?<=\.)\s/)[0];

/** Question à choix : la bonne réponse mélangée avec des leurres distincts. */
function choice(rng, correct, decoys, count = 4) {
  const unique = [...new Set(decoys.filter((d) => d && d !== correct))];
  const picked = shuffle(unique, rng).slice(0, count - 1);
  if (picked.length < 2) return null;
  const options = shuffle([correct, ...picked], rng);
  return { options, answer: options.indexOf(correct) };
}

/**
 * Questions générées à partir des définitions de codes (dictionary.entries()).
 * Identifiants stables (gen:<type>:<code>[:adresse]) pour la répétition espacée.
 */
export function codeQuestions(entries, rng = Math.random) {
  const codes = entries.filter((e) => /^[GM]\d/.test(e.key) && e.name);
  const sameCategory = (e) => codes.filter((o) => o.key !== e.key && o.category === e.category);
  const others = (e) => codes.filter((o) => o.key !== e.key);
  const prefer = (e, map) => {
    const near = sameCategory(e).map(map);
    return near.length >= 3 ? near : [...near, ...others(e).map(map)];
  };
  // Profil cité seulement pour les codes personnels (les profils intégrés sont implicites).
  const source = (e) => (e.sourceLabel && !BUILTIN_SOURCES.has(e.source) ? ` (profil « ${e.sourceLabel} »)` : '');
  const explainCode = (e) => `\`${e.key}\` : ${e.name}.${e.description ? ` ${firstSentence(e.description)}` : ''}`;
  const questions = [];

  for (const e of codes) {
    const byName = choice(rng, e.name, prefer(e, (o) => o.name));
    if (byName) {
      questions.push({ id: `gen:name:${e.key}`, source: 'code', type: 'choice', question: `Que fait le code \`${e.key}\`${source(e)} ?`, ...byName, explain: explainCode(e) });
    }
    const byCode = choice(rng, `\`${e.key}\``, prefer(e, (o) => `\`${o.key}\``));
    if (byCode && !codes.some((o) => o.key !== e.key && o.name === e.name)) {
      questions.push({ id: `gen:code:${e.key}`, source: 'code', type: 'choice', question: `Quel code correspond à « ${e.name} »${source(e)} ?`, ...byCode, explain: explainCode(e) });
    }
    if (typeof e.modal === 'boolean' && e.category !== 'mcode') {
      questions.push({
        id: `gen:modal:${e.key}`,
        source: 'code',
        type: 'choice',
        question: `Le code \`${e.key}\`, « ${e.name} », reste-t-il actif après son bloc ?`,
        options: ['Oui : il reste actif jusqu’à un autre code de son groupe (modal)', 'Non : il ne vaut que pour son bloc'],
        answer: e.modal ? 0 : 1,
        explain: `\`${e.key}\` est ${e.modal ? 'modal : il reste actif jusqu’à ce qu’un autre code du même groupe le remplace' : 'non modal : il ne vaut que pour le bloc où il est écrit'}.`,
      });
    }
    const params = e.params && !e.forms ? Object.entries(e.params) : [];
    if (params.length >= 3) {
      for (const [letter, text] of params) {
        const q = choice(rng, text, params.map(([, t]) => t));
        if (!q) continue;
        questions.push({ id: `gen:param:${e.key}:${letter}`, source: 'code', type: 'choice', question: `Dans un bloc \`${e.key}\` (« ${e.name} »), que représente l’adresse ${letter} ?`, ...q, explain: `Dans \`${e.key}\`, ${letter} : ${text}.` });
      }
    }
  }
  return questions;
}

/** Questions des quiz de leçons, avec leur leçon d'origine. Identifiants : lesson:<leçon>:<n>. */
export function lessonQuestions(lessons) {
  return lessons.flatMap((lesson) =>
    (lesson.quiz ?? []).map((question, index) => ({
      ...question,
      id: `lesson:${lesson.id}:${index}`,
      source: 'lesson',
      lesson: { id: lesson.id, number: lesson.number, title: lesson.title, level: lesson.level },
    })),
  );
}

/** Nouvel état d'une question après une réponse. */
export function schedule(item = {}, ok, now = Date.now()) {
  const box = ok ? Math.min((item.box ?? 0) + 1, MAX_BOX) : 1;
  return {
    box,
    due: ok ? now + BOX_DAYS[box] * DAY : now,
    right: (item.right ?? 0) + (ok ? 1 : 0),
    wrong: (item.wrong ?? 0) + (ok ? 0 : 1),
    last: now,
  };
}

const isDue = (item, now) => item && item.box > 0 && item.due <= now;

/** Comptes pour l'écran d'accueil de la révision. */
export function reviewStats(pool, items, now = Date.now()) {
  let due = 0;
  let fresh = 0;
  let mastered = 0;
  for (const question of pool) {
    const item = items[question.id];
    if (!item || !item.box) fresh++;
    else if (isDue(item, now)) due++;
    if (item?.box >= MASTERED_BOX) mastered++;
  }
  return { due, fresh, mastered, total: pool.length };
}

/**
 * Questions d'une session : d'abord celles à revoir (les plus en retard en premier), puis des
 * nouvelles (au hasard, en alternant leçons et codes). Si rien n'est dû ni nouveau : les
 * questions vues le moins récemment (« révision libre »). → { questions, mode: 'due'|'free' }
 */
export function selectSession(pool, items, { size = 10, now = Date.now(), rng = Math.random } = {}) {
  const due = pool.filter((q) => isDue(items[q.id], now)).sort((a, b) => items[a.id].due - items[b.id].due);
  const fresh = pool.filter((q) => !items[q.id]?.box);
  const bySource = (source) => shuffle(fresh.filter((q) => q.source === source), rng);
  const lessonsFirst = bySource('lesson');
  const codesFirst = bySource('code');
  const mixed = [];
  while (lessonsFirst.length || codesFirst.length) {
    if (lessonsFirst.length) mixed.push(lessonsFirst.shift());
    if (codesFirst.length) mixed.push(codesFirst.shift());
  }
  const selected = [...due, ...mixed].slice(0, size);
  if (selected.length) return { questions: shuffle(selected, rng), mode: 'due' };
  const free = [...pool].sort((a, b) => (items[a.id]?.last ?? 0) - (items[b.id]?.last ?? 0)).slice(0, size);
  return { questions: shuffle(free, rng), mode: 'free' };
}

export function filterPool(pool, source) {
  if (source === 'lessons') return pool.filter((q) => q.source === 'lesson');
  if (source === 'codes') return pool.filter((q) => q.source === 'code');
  return pool;
}

/** Nettoyage des états lus (stockage ou sauvegarde importée). */
export function sanitizeReview(raw) {
  const items = {};
  if (raw?.items && typeof raw.items === 'object') {
    for (const [id, item] of Object.entries(raw.items)) {
      if (!item || typeof item !== 'object') continue;
      const box = Number(item.box);
      if (!Number.isInteger(box) || box < 0 || box > MAX_BOX) continue;
      items[id] = { box, due: Number(item.due) || 0, right: Number(item.right) || 0, wrong: Number(item.wrong) || 0, last: Number(item.last) || 0 };
    }
  }
  const source = REVIEW_SOURCES.some((s) => s.value === raw?.options?.source) ? raw.options.source : 'all';
  const size = REVIEW_SIZES.includes(raw?.options?.size) ? raw.options.size : REVIEW_SIZES[0];
  return { items, options: { source, size } };
}

/** Fusion (import) : pour chaque question, l'état le plus récent l'emporte. */
export function mergeReview(current, incoming) {
  const items = { ...current.items };
  for (const [id, item] of Object.entries(incoming.items)) {
    if (!items[id] || item.last > items[id].last) items[id] = item;
  }
  return { items, options: { ...incoming.options } };
}
