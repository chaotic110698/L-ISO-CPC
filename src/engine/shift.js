import { parseLine } from './parser.js';
import { applyBlock, createModalState } from './modal-state.js';
import { formatIso } from './format.js';

/**
 * Décalage de coordonnées (par exemple déplacer une pièce de 2 mm en Z). Fonction pure.
 *   offsets : { X: 1, Z: -2 } — X au diamètre en tournage.
 *   options : { fromLine = 1, toLine = Infinity }
 *
 * Seules les cotes ABSOLUES sont décalées : les adresses relatives (U, W), les blocs en
 * programmation relative (G91), les blocs de référence ou de définition d'origine (G28, G30,
 * G50, G52, G53, G92 ISO, G10), les temporisations (G4) et les paramètres de cycles (P, Q, U,
 * W, R…) ne sont pas modifiés. Les valeurs calculées (X#901) sont comptées comme ignorées.
 *
 * Renvoie { lines, changed (mots modifiés), skippedExpressions }.
 */
const SKIP_CODES = new Set(['G4', 'G10', 'G28', 'G30', 'G50', 'G52', 'G53']);

export function shiftCoordinates(lineTexts, dictionary, offsets, { fromLine = 1, toLine = Infinity } = {}) {
  const letters = Object.entries(offsets).filter(([, delta]) => Number.isFinite(delta) && delta !== 0);
  const state = createModalState();
  let changed = 0;
  let skippedExpressions = 0;
  let number = 0;
  const lines = [];

  for (const text of lineTexts) {
    number++;
    const { tokens, block } = parseLine(text);
    applyBlock(state, block, dictionary);
    const inRange = number >= fromLine && number <= toLine;
    const skipBlock =
      block.codes.some((w) => SKIP_CODES.has(w.code) || (w.code === 'G92' && dictionary.lookup('G92')?.category !== 'cycle')) ||
      state.groups.distance === 'G91';
    if (!inRange || skipBlock || !letters.length) {
      lines.push(text);
      continue;
    }
    let result = text;
    for (const token of [...tokens].reverse()) {
      if (token.type !== 'word') continue;
      const delta = offsets[token.letter];
      if (!Number.isFinite(delta) || delta === 0) continue;
      if (token.valueKind === 'expr') {
        skippedExpressions++;
        continue;
      }
      if (token.valueKind !== 'number') continue;
      const valueFrom = token.to - token.valueText.length;
      result = result.slice(0, valueFrom) + formatIso(token.value + delta) + result.slice(token.to);
      changed++;
    }
    lines.push(result);
  }
  return { lines, changed, skippedExpressions };
}
