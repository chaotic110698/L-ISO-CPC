import { parseLine } from '../../engine/index.js';

/**
 * Correction des quiz (fonctions pures, sans DOM).
 *
 * Types de questions (champ `quiz` d'une leçon, voir src/data/courses/README.md) :
 *   choice  { question, options: [..], answer: index | [index…], explain }
 *   block   { question, expect: 'G01 X20. Z-5. F0.1' | [variantes…], explain }
 *   number  { question, answer: 1432, tolerance?: 5, unit?: 'tr/min', explain }
 *   error   { question, lines: [..], answer: indexDeLigne, explain }
 */

/** Adresses dont la valeur doit porter un point décimal (piège Fanuc : X20 = 0,020 mm). */
const DECIMAL_LETTERS = new Set(['X', 'Z', 'U', 'W', 'Y', 'V', 'R', 'I', 'K', 'J']);

const formatValue = (word) => `${word.letter}${word.valueText}`;

/** Mots d'un bloc, sans numéro N ni commentaire : codes G/M normalisés (G01 → G1). */
function wordsOf(text) {
  const { tokens, block } = parseLine(text);
  // Tout ce qui n'est ni un mot complet ni un commentaire (caractère inconnu, « X » sans valeur,
  // nombre isolé…) est signalé.
  const invalid = tokens
    .filter((t) => !['word', 'comment', 'eob'].includes(t.type) || (t.type === 'word' && t.valueKind !== 'number'))
    .map((t) => text.slice(t.from, t.to));
  const codes = new Set();
  const values = new Map();
  for (const word of block.words) {
    if (word.letter === 'N') continue;
    if (word.code) codes.add(word.code);
    else values.set(word.letter, word);
  }
  return { codes, values, invalid, words: block.words };
}

/**
 * Compare un bloc saisi au bloc attendu, sans tenir compte de l'ordre des mots, des zéros
 * (G01 = G1, X20. = X20.0) ni du numéro de bloc.
 * → { ok, missing: [], extra: [], wrong: [{ letter, got, expected }], decimal: [], invalid: [] }
 */
export function compareBlock(input, expected) {
  const got = wordsOf(input);
  const want = wordsOf(expected);
  const result = { missing: [], extra: [], wrong: [], decimal: [], invalid: got.invalid };
  for (const code of want.codes) if (!got.codes.has(code)) result.missing.push(code);
  for (const code of got.codes) if (!want.codes.has(code)) result.extra.push(code);
  for (const [letter, word] of want.values) {
    const mine = got.values.get(letter);
    if (!mine) result.missing.push(formatValue(word));
    else if (mine.value !== word.value) result.wrong.push({ letter, got: formatValue(mine), expected: formatValue(word) });
  }
  for (const [letter, word] of got.values) {
    if (!want.values.has(letter)) result.extra.push(formatValue(word));
    else if (DECIMAL_LETTERS.has(letter) && !word.hasDecimal && word.value !== 0) result.decimal.push(formatValue(word));
  }
  result.ok = !result.missing.length && !result.extra.length && !result.wrong.length && !result.decimal.length && !result.invalid.length && got.words.length > 0;
  return result;
}

/** Meilleure correspondance parmi les variantes acceptées. */
export function checkBlock(input, expect) {
  const variants = Array.isArray(expect) ? expect : [expect];
  const results = variants.map((variant) => compareBlock(input, variant));
  const score = (r) => r.missing.length + r.extra.length + r.wrong.length + r.decimal.length + r.invalid.length;
  return results.find((r) => r.ok) ?? results.reduce((best, r) => (score(r) < score(best) ? r : best));
}

/** Explications lisibles d'une comparaison de blocs. */
export function describeBlockResult(result) {
  const lines = [];
  if (result.invalid.length) lines.push(`Caractère non reconnu : ${result.invalid.join(' ')}`);
  if (result.missing.length) lines.push(`Manquant : ${result.missing.join(' ')}`);
  for (const w of result.wrong) lines.push(`${w.got} : la valeur attendue est ${w.expected}`);
  if (result.extra.length) lines.push(`En trop : ${result.extra.join(' ')}`);
  if (result.decimal.length) lines.push(`Point décimal manquant : ${result.decimal.join(' ')} (sur beaucoup de Fanuc, X20 se lit 0,020 mm)`);
  return lines;
}

/** Nombre saisi à la française ou non (« 1 432,5 », « 1432.5 »), ou null. */
export function parseNumber(text) {
  const clean = String(text ?? '').replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  return Number(clean);
}

/** Corrige une réponse : → { ok, details?: [] } */
export function checkAnswer(question, response) {
  switch (question.type) {
    case 'choice': {
      const expected = new Set([question.answer].flat());
      const given = new Set([response ?? []].flat());
      return { ok: expected.size === given.size && [...expected].every((i) => given.has(i)) };
    }
    case 'block': {
      const result = checkBlock(String(response ?? ''), question.expect);
      return { ok: result.ok, details: describeBlockResult(result) };
    }
    case 'number': {
      const value = parseNumber(response);
      if (value == null) return { ok: false, details: ['Saisissez un nombre.'] };
      return { ok: Math.abs(value - question.answer) <= (question.tolerance ?? 0) };
    }
    case 'error':
      return { ok: response === question.answer };
    default:
      throw new Error(`Type de question inconnu : ${question.type}`);
  }
}

/** Le quiz est-il complet ? (pour un affichage valide, chaque question doit pouvoir être réussie). */
export function validateQuestion(question) {
  const problems = [];
  if (!question.question) problems.push('énoncé manquant');
  if (!question.explain) problems.push('explication manquante');
  if (question.type === 'choice') {
    for (const i of [question.answer].flat()) if (!question.options?.[i]) problems.push(`réponse ${i} hors des options`);
  } else if (question.type === 'block') {
    for (const variant of [question.expect].flat()) if (!compareBlock(variant, variant).ok) problems.push(`bloc attendu invalide : ${variant}`);
  } else if (question.type === 'number') {
    if (!Number.isFinite(question.answer)) problems.push('réponse numérique manquante');
  } else if (question.type === 'error') {
    if (!question.lines?.[question.answer]) problems.push('ligne fautive hors du programme');
  } else problems.push(`type inconnu : ${question.type}`);
  return problems;
}
