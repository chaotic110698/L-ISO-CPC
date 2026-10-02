/**
 * Progression dans les cours, conservée dans le stockage clé/valeur du navigateur et incluse
 * dans la sauvegarde JSON (section « cours »).
 *
 *   {
 *     lessons: { [idLeçon]: { openedAt, readAt?, quiz?: { best, total, at } } },
 *     prefs: { turret: 'both'|'rear'|'front', system: 'all'|'A'|'BC' }
 *   }
 */

export const PROGRESS_KEY = 'courses.progress';

/** Préférences « Votre machine » : elles choisissent les variantes affichées dans les leçons. */
export const MACHINE_PREFS = [
  {
    key: 'turret',
    label: 'Position de l’outil (ou de la meule)',
    help: 'Derrière l’axe de la broche (tourelle arrière, le plus courant sur les tours à banc incliné et les rectifieuses cylindriques) ou devant (tourelle avant, tours conventionnels transformés, petits tours).',
    options: [
      { value: 'both', label: 'Afficher les deux' },
      { value: 'rear', label: 'Arrière' },
      { value: 'front', label: 'Avant' },
    ],
    default: 'both',
  },
  {
    key: 'system',
    label: 'Système de codes G (Fanuc)',
    help: 'Système A : le plus répandu sur tour (U/W pour l’incrémental, G50 limite la broche). Systèmes B et C : G90/G91 pour absolu/incrémental, comme en fraisage. En cas de doute : paramètre 3401 bits 6-7, ou la notice.',
    options: [
      { value: 'all', label: 'Afficher tous' },
      { value: 'A', label: 'Système A' },
      { value: 'BC', label: 'Systèmes B / C' },
    ],
    default: 'all',
  },
];

const DEFAULT_PREFS = Object.fromEntries(MACHINE_PREFS.map((pref) => [pref.key, pref.default]));

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

/** Nettoie des données lues (stockage ou fichier importé). */
export function sanitizeProgress(raw) {
  const lessons = {};
  if (isObject(raw?.lessons)) {
    for (const [id, entry] of Object.entries(raw.lessons)) {
      if (!isObject(entry)) continue;
      const clean = {};
      for (const key of ['openedAt', 'readAt']) if (Number.isFinite(entry[key])) clean[key] = entry[key];
      const quiz = entry.quiz;
      if (isObject(quiz) && Number.isFinite(quiz.best) && Number.isFinite(quiz.total)) clean.quiz = { best: quiz.best, total: quiz.total, at: Number(quiz.at) || 0 };
      if (Object.keys(clean).length) lessons[id] = clean;
    }
  }
  const prefs = { ...DEFAULT_PREFS };
  if (isObject(raw?.prefs)) {
    for (const pref of MACHINE_PREFS) {
      const value = raw.prefs[pref.key];
      if (pref.options.some((option) => option.value === value)) prefs[pref.key] = value;
    }
  }
  return { lessons, prefs };
}

/** Fusion (import) : on garde ce qui a été fait de part et d'autre, et le meilleur score. */
export function mergeProgress(current, incoming) {
  const result = structuredClone(current);
  for (const [id, entry] of Object.entries(incoming.lessons)) {
    const mine = result.lessons[id] ?? {};
    const merged = { ...mine };
    for (const key of ['openedAt', 'readAt']) {
      if (entry[key] != null) merged[key] = mine[key] != null ? Math.min(mine[key], entry[key]) : entry[key];
    }
    if (entry.quiz && (!mine.quiz || entry.quiz.best / entry.quiz.total > mine.quiz.best / mine.quiz.total)) merged.quiz = entry.quiz;
    result.lessons[id] = merged;
  }
  result.prefs = { ...incoming.prefs };
  return result;
}

/** État d'une leçon pour l'affichage : 'new' | 'opened' | 'read'. */
export function lessonStatus(progress, id) {
  const entry = progress.lessons[id];
  if (entry?.readAt) return 'read';
  if (entry?.openedAt) return 'opened';
  return 'new';
}

export function createProgressStore(kv, { now = () => Date.now() } = {}) {
  let progress = sanitizeProgress(kv.get(PROGRESS_KEY));
  const listeners = new Set();
  const commit = () => {
    kv.set(PROGRESS_KEY, progress);
    for (const listener of [...listeners]) listener(progress);
  };
  const touch = (id) => (progress.lessons[id] ??= {});

  return {
    get: () => progress,
    status: (id) => lessonStatus(progress, id),
    pref: (key) => progress.prefs[key],
    setPref(key, value) {
      progress.prefs = { ...progress.prefs, [key]: value };
      progress = sanitizeProgress(progress);
      commit();
    },
    markOpened(id) {
      const entry = touch(id);
      if (entry.openedAt) return;
      entry.openedAt = now();
      commit();
    },
    setRead(id, read = true) {
      const entry = touch(id);
      entry.openedAt ??= now();
      if (read) entry.readAt = now();
      else delete entry.readAt;
      commit();
    },
    /** Résultat d'un quiz : le meilleur score est conservé. */
    setQuiz(id, score, total) {
      const entry = touch(id);
      entry.openedAt ??= now();
      const previous = entry.quiz;
      if (!previous || score / total >= previous.best / previous.total) entry.quiz = { best: score, total, at: now() };
      commit();
    },
    replace(data) {
      progress = sanitizeProgress(data);
      commit();
    },
    merge(data) {
      progress = mergeProgress(progress, sanitizeProgress(data));
      commit();
    },
    reset() {
      progress = sanitizeProgress({ prefs: progress.prefs });
      commit();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
