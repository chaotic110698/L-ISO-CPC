import { parseLine } from './parser.js';

/**
 * Cible d'un « Aller à… ». Fonction pure.
 *   « 42 » → ligne 42 ; « N120 » → bloc N120 ; « O2000 » ou « :2000 » → programme 2000 ;
 *   « T3 » ou « T0303 » → changement d'outil 3 (T3 seul : tout T03xx, T0303 : exactement).
 * Plusieurs correspondances (N en double, outil repris) : la première après la ligne `from`,
 * puis on repart du début. Renvoie { line, matches, index } ou { error }.
 */
export function resolveGoTo(lineTexts, query, from = 0) {
  const text = String(query ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!text) return { error: 'Saisissez un numéro de ligne, un bloc N, un programme O ou un outil T.' };
  const lines = [...lineTexts];

  if (/^\d+$/.test(text)) {
    const line = Number(text);
    if (line < 1 || line > lines.length) return { error: `Le programme compte ${lines.length} ligne${lines.length > 1 ? 's' : ''}.` };
    return { line, matches: [line], index: 0 };
  }

  const match = /^([NOT:])(\d+)$/.exec(text);
  if (!match) return { error: 'Format non reconnu : 42, N120, O2000 ou T0303.' };
  const [, letter, digits] = match;
  const value = Number(digits);
  const test = {
    N: (block) => block.blockNumber === value,
    O: (block) => block.programNumber === value,
    ':': (block) => block.programNumber === value,
    T: (block) =>
      block.words.some((w) => {
        if (w.letter !== 'T' || w.valueKind !== 'number' || !w.value) return false;
        // T3 / T03 : numéro d'outil seul ; T0303 : mot complet (outil et correcteur).
        if (digits.length <= 2) return Math.floor(w.value / 100) === value || (w.valueText.length <= 2 && w.value === value);
        return w.value === value;
      }),
  }[letter];

  const matches = [];
  lines.forEach((line, i) => {
    if (test(parseLine(line).block)) matches.push(i + 1);
  });
  const label = { N: `bloc N${digits}`, O: `programme O${digits}`, ':': `programme O${digits}`, T: `outil T${digits}` }[letter];
  if (!matches.length) return { error: `Aucun ${label} dans ce programme.` };
  const index = Math.max(0, matches.findIndex((line) => line > from));
  return { line: matches[index], matches, index };
}

/**
 * Lignes qui forment un bloc exécuté par la commande (ni vides, ni « % », ni commentaire seul),
 * pour avancer bloc par bloc (mode pupitre). Numéros de ligne à partir de 1.
 */
export function executableLines(lineTexts) {
  const lines = [];
  let number = 0;
  for (const text of lineTexts) {
    number++;
    if (!parseLine(text).block.isEmpty) lines.push(number);
  }
  return lines;
}
