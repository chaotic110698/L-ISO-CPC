/**
 * Écriture d'une valeur numérique à la manière d'un programme ISO : point décimal, sans zéros
 * inutiles (25 → « 25. », -30.50 → « -30.5 », 0 → « 0. »). Les valeurs en µm ou les
 * compteurs s'écrivent en entiers (formatInteger).
 */
export function formatIso(value, decimals = 4) {
  if (!Number.isFinite(value)) return '';
  const fixed = Number(value.toFixed(decimals));
  const text = String(Object.is(fixed, -0) ? 0 : fixed);
  return text.includes('.') ? text : `${text}.`;
}

export function formatInteger(value) {
  return String(Math.round(value));
}
