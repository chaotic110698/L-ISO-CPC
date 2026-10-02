/**
 * Plages de macros libres d'un profil machine : [{ from, to }] (bornes incluses).
 * Un profil peut en déclarer plusieurs portions (ex. #900–#949 et #960–#999).
 * Fonctions pures, sans DOM.
 */

export const MAX_VARIABLE = 99999;

/** Plages valides, triées et fusionnées (chevauchements et plages contiguës regroupés). */
export function normalizeRanges(ranges) {
  const valid = (Array.isArray(ranges) ? ranges : [])
    .map((r) => ({ from: Math.trunc(Number(r?.from)), to: Math.trunc(Number(r?.to)) }))
    .filter((r) => Number.isFinite(r.from) && Number.isFinite(r.to) && r.from >= 0 && r.to <= MAX_VARIABLE)
    .map((r) => (r.from <= r.to ? r : { from: r.to, to: r.from }))
    .sort((a, b) => a.from - b.from);
  const merged = [];
  for (const range of valid) {
    const last = merged.at(-1);
    if (last && range.from <= last.to + 1) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

/** Erreur de saisie d'une plage (message en français), ou null si elle est valide. */
export function validateRange(from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return 'Les bornes doivent être des nombres entiers.';
  if (from < 0 || to < 0) return 'Les numéros de variable sont positifs.';
  if (from > MAX_VARIABLE || to > MAX_VARIABLE) return `Numéro maximal : #${MAX_VARIABLE}.`;
  if (from > to) return 'La première borne doit être inférieure ou égale à la seconde.';
  return null;
}

export function inRanges(ranges, index) {
  return ranges.some((r) => index >= r.from && index <= r.to);
}

export function countInRanges(ranges) {
  return normalizeRanges(ranges).reduce((sum, r) => sum + r.to - r.from + 1, 0);
}

/** « #500–#999 », « #900–#949, #960–#999 », ou « aucune ». */
export function formatRanges(ranges) {
  const list = normalizeRanges(ranges);
  if (!list.length) return 'aucune';
  return list.map((r) => (r.from === r.to ? `#${r.from}` : `#${r.from}–#${r.to}`)).join(', ');
}

/**
 * Lit une saisie libre : « 500-999 », « #900–#949, #960-#999 », « 100 ».
 * Renvoie { ranges } ou { error }.
 */
export function parseRanges(text) {
  const parts = String(text ?? '')
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const ranges = [];
  for (const part of parts) {
    const match = part.match(/^#?\s*(\d+)\s*(?:(?:-|–|à|a)\s*#?\s*(\d+))?$/i);
    if (!match) return { error: `Plage illisible : « ${part} ». Exemple : 900-999.` };
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    const error = validateRange(from, to);
    if (error) return { error: `${part} : ${error}` };
    ranges.push({ from, to });
  }
  return { ranges: normalizeRanges(ranges) };
}

/** Prochaine variable libre des plages, absente de `used` (Set d'indices), ou null. */
export function nextFreeVariable(ranges, used) {
  for (const range of normalizeRanges(ranges)) {
    for (let i = range.from; i <= range.to; i++) if (!used.has(i)) return i;
  }
  return null;
}
