import { parseLine } from './parser.js';
import { inRanges, formatRanges, normalizeRanges } from './macro-ranges.js';

/**
 * Analyse des variables de macro et des valeurs répétées d'un programme. Fonctions pures.
 *
 * analyzeMacros(lineTexts) →
 *   {
 *     variables: [ { index, name: '#901', uses: [occ], assignments: [{ line, expression }] } ],
 *     repeated:  [ { key, letter, value, label: 'X52.', count, occurrences: [occ] } ],
 *     used: Set(index)
 *   }
 *   occ = { line (n° à partir de 1), from, to (colonnes dans la ligne) }
 */

/** Lettres dont on relève les valeurs répétées (cotes, avances, vitesses). */
export const REPEATED_LETTERS = new Set(['X', 'Y', 'Z', 'U', 'V', 'W', 'I', 'J', 'K', 'R', 'C', 'F', 'S']);

/** Plage des variables communes FANUC : seules leurs affectations sont contrôlées. */
export const COMMON_VARIABLES = { from: 100, to: 999 };

function assignmentExpression(text, tokens, variableIndex) {
  const equals = tokens[variableIndex + 1];
  const end = tokens.slice(variableIndex + 2).find((t) => t.type === 'comment')?.from ?? text.length;
  return text.slice(equals.to, end).trim();
}

export function analyzeMacros(lineTexts) {
  const variables = new Map();
  const repeated = new Map();
  let number = 0;

  for (const text of lineTexts) {
    number++;
    const { tokens, block } = parseLine(text);
    tokens.forEach((token, i) => {
      if (token.type === 'variable' && token.name) {
        if (!variables.has(token.index)) variables.set(token.index, { index: token.index, name: token.name, uses: [], assignments: [] });
        const variable = variables.get(token.index);
        variable.uses.push({ line: number, from: token.from, to: token.to });
        const assigned = block.variables.find((v) => v.token === token)?.assigned;
        if (assigned) variable.assignments.push({ line: number, expression: assignmentExpression(text, tokens, i) });
      } else if (token.type === 'word' && token.valueKind === 'number' && REPEATED_LETTERS.has(token.letter)) {
        const key = `${token.letter}=${token.value}${token.hasDecimal ? '' : '!'}`;
        if (!repeated.has(key)) {
          repeated.set(key, { key, letter: token.letter, value: token.value, valueText: token.valueText, label: `${token.letter}${token.valueText}`, count: 0, occurrences: [] });
        }
        const entry = repeated.get(key);
        entry.count++;
        entry.occurrences.push({ line: number, from: token.from, to: token.to, valueFrom: token.from + token.letter.length });
      }
    });
  }

  return {
    variables: [...variables.values()].sort((a, b) => a.index - b.index),
    repeated: [...repeated.values()].filter((r) => r.count > 1).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    used: new Set(variables.keys()),
  };
}

/** Variables affectées dans un texte de programme (pour comparer avec les autres programmes). */
export function assignedVariables(text) {
  const assigned = new Set();
  for (const line of String(text).split('\n')) {
    for (const variable of parseLine(line).block.variables) if (variable.assigned) assigned.add(variable.index);
  }
  return assigned;
}

/** Variables référencées (lues ou écrites) dans un texte de programme. */
export function referencedVariables(text) {
  const used = new Set();
  for (const line of String(text).split('\n')) {
    for (const variable of parseLine(line).block.variables) if (variable.index != null) used.add(variable.index);
  }
  return used;
}

/**
 * Avertissements (jamais bloquants) d'une variable du programme :
 *   - affectée hors des plages libres du profil (variables communes #100–#999 seulement :
 *     les locales et les variables système ont un usage imposé) ;
 *   - également affectée dans un autre programme (double utilisation possible).
 *
 * context : { ranges: [{from, to}], rangesLabel?: 'FANUC tournage', elsewhere?: Map(index → [noms de programmes]) }
 */
export function variableWarnings(variable, { ranges = [], rangesLabel = null, elsewhere = new Map() } = {}) {
  const warnings = [];
  const list = normalizeRanges(ranges);
  const assigned = variable.assignments.length > 0;
  const common = variable.index >= COMMON_VARIABLES.from && variable.index <= COMMON_VARIABLES.to;
  if (assigned && common && list.length && !inRanges(list, variable.index)) {
    warnings.push({
      code: 'outOfRange',
      message: `${variable.name} est hors des plages libres${rangesLabel ? ` du profil « ${rangesLabel} »` : ''} (${formatRanges(list)}) : elle peut être utilisée par la machine ou un autre programme.`,
    });
  }
  const others = elsewhere.get(variable.index) ?? [];
  if (assigned && others.length) {
    const names = others.slice(0, 3).map((n) => `« ${n} »`).join(', ');
    warnings.push({
      code: 'reused',
      message: `${variable.name} est aussi affectée dans ${others.length > 1 ? 'les programmes' : 'le programme'} ${names}${others.length > 3 ? '…' : ''} : vérifiez qu’il ne s’agit pas d’une double utilisation.`,
    });
  }
  return warnings;
}
