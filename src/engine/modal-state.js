import { parseLine } from './parser.js';
import { NON_MODAL, M_STATES } from '../data/modal-groups.js';

/**
 * État modal à la fin d'une ligne donnée : codes actifs par groupe, outil, broche,
 * arrosage, dernières valeurs F et S, vitesse maxi (G50 S en système A, G92 S en B/C). Fonction pure.
 *
 *   { groups: { motion: 'G1', feedMode: 'G99', … }, tool: { word: 'T0202', number: 2, offset: 2 } | null,
 *     spindle: 'M3', coolant: 'M8', feed: 0.12, speed: 280, maxSpeed: 3000, program: 1000, line }
 */
export function createModalState() {
  return { groups: {}, tool: null, spindle: null, coolant: null, feed: null, speed: null, maxSpeed: null, program: null, line: 0 };
}

/** Applique un bloc à l'état (modifie `state`). */
export function applyBlock(state, block, dictionary) {
  let isMaxSpeedBlock = false;
  for (const word of block.codes) {
    const definition = dictionary.lookup(word.code);
    if (definition?.group && definition.group !== NON_MODAL) state.groups[definition.group] = word.code;
    // Code de limitation de vitesse (champ `spindleLimit` de sa définition) suivi d'un S.
    if (definition?.spindleLimit && block.words.some((w) => w.letter === 'S')) isMaxSpeedBlock = true;
    for (const [key, info] of Object.entries(M_STATES)) if (info.codes[word.code]) state[key] = word.code;
  }
  for (const word of block.words) {
    if (word.valueKind !== 'number') continue;
    if (word.letter === 'T') {
      const value = word.value;
      state.tool = /^\d{3,4}$/.test(word.valueText)
        ? { word: `T${word.valueText}`, number: Math.floor(value / 100), offset: value % 100 }
        : { word: `T${word.valueText}`, number: value, offset: null };
    }
    if (word.letter === 'F') state.feed = word.value;
    if (word.letter === 'S') {
      if (isMaxSpeedBlock) state.maxSpeed = word.value;
      else state.speed = word.value;
    }
  }
  if (block.programNumber != null) state.program = block.programNumber;
  return state;
}

/** État modal après la ligne `upToLine` (numérotée à partir de 1) d'une suite de lignes. */
export function modalStateAt(lineTexts, upToLine, dictionary) {
  const state = createModalState();
  let number = 0;
  for (const text of lineTexts) {
    number++;
    if (number > upToLine) break;
    applyBlock(state, parseLine(text).block, dictionary);
    state.line = number;
  }
  return state;
}
