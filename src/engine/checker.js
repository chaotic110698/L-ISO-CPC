import { parseLine } from './parser.js';
import { createModalState, applyBlock } from './modal-state.js';
import { NON_MODAL, MODAL_GROUPS } from '../data/modal-groups.js';

/**
 * Vérificateur de syntaxe et de cohérence. Fonction pure : renvoie des diagnostics
 *   { line, from, to, severity: 'error' | 'warning' | 'info', rule, message }
 * (line à partir de 1, from/to : colonnes dans la ligne).
 *
 * Chaque règle peut être désactivée (options.rules[id] === false).
 */
export const CHECKER_RULES = [
  { id: 'syntax', label: 'Parenthèses non fermées, caractères invalides, valeurs manquantes' },
  { id: 'unknownCode', label: 'Codes inconnus du profil actif' },
  { id: 'sameGroup', label: 'Codes incompatibles sur une même ligne (même groupe modal)' },
  { id: 'repeatedAddress', label: 'Adresse répétée dans un bloc (X… X…)' },
  { id: 'multipleM', label: 'Plusieurs codes M dans un bloc' },
  { id: 'decimalPoint', label: 'Cote sans point décimal (X25 au lieu de X25.)' },
  { id: 'feed', label: 'Avance F non définie avant un usinage (G1, G2, G3)' },
  { id: 'spindle', label: 'Broche démarrée sans vitesse S, vitesse de coupe constante sans limitation (G50 S / G92 S)' },
  { id: 'compensation', label: 'G40 oublié (compensation de rayon active en fin de programme ou au changement d’outil)' },
  { id: 'blockRefs', label: 'Blocs P / Q / GOTO introuvables, numéros N en double' },
  { id: 'programEnd', label: 'Fin de programme M30 / M02 manquante' },
];

const COORDINATE_LETTERS = new Set(['X', 'Y', 'Z', 'U', 'V', 'W', 'I', 'J', 'K', 'R', ',C', ',R']);
const CUTTING_MOTION = new Set(['G1', 'G2', 'G3']);
const groupLabel = (id) => MODAL_GROUPS.find((g) => g.id === id)?.label.toLowerCase() ?? id;

/** Lettres d'un bloc qui désignent des numéros de bloc N (P/Q de G70–G73, P de M99…). */
export function blockRefLetters(block, dictionary) {
  const letters = new Set();
  for (const word of block.codes) {
    const definition = dictionary.lookup(word.code);
    if (!definition) continue;
    const sets = definition.forms ? definition.forms.map((f) => f.params ?? {}) : [definition.params ?? {}];
    for (const params of sets) {
      for (const [letter, text] of Object.entries(params)) if (/num[ée]ro (?:N|de bloc)/i.test(text)) letters.add(letter);
    }
  }
  return letters;
}

export function checkProgram(lineTexts, dictionary, { rules = {} } = {}) {
  const on = (id) => rules[id] !== false;
  const diagnostics = [];
  const add = (line, from, to, severity, rule, message) => {
    if (on(rule)) diagnostics.push({ line, from, to: Math.max(to, from + 1), severity, rule, message });
  };

  const state = createModalState();
  // Code qui limite la vitesse de broche dans ce dictionnaire (G50 en système A, G92 en B/C) :
  // sans lui (ISO générique, fraisage), la règle « G96 sans limitation » ne s'applique pas.
  const limitCode = dictionary.entries().find((definition) => definition.spindleLimit)?.key ?? null;
  const blockNumbers = new Map(); // N → [lignes]
  const references = []; // { value, line, from, to, label }
  let hasEnd = false;
  let hasSubprogramEnd = false;
  let lastLine = 0;
  let lastText = '';
  let number = 0;

  for (const text of lineTexts) {
    number++;
    const { tokens, block } = parseLine(text);
    if (text.trim()) {
      lastLine = number;
      lastText = text;
    }

    // --- Syntaxe ---------------------------------------------------------------------------
    for (const token of tokens) {
      if (token.type === 'comment' && token.unclosed) add(number, token.from, text.length, 'error', 'syntax', 'Parenthèse de commentaire non fermée : ajoutez « ) ».');
      if (token.type === 'unknown') add(number, token.from, token.to, 'error', 'syntax', token.reason === 'caractère non reconnu' ? `Caractère « ${token.text} » non reconnu par la commande.` : 'Parenthèse fermante sans parenthèse ouvrante.');
      if (token.type === 'word' && token.valueKind === 'missing') add(number, token.from, token.to, 'error', 'syntax', `Valeur manquante après ${token.letter}.`);
    }

    // --- Codes et adresses du bloc ----------------------------------------------------------
    const groups = new Map();
    const letters = new Map();
    const mCodes = [];
    for (const word of block.words) {
      const { token } = word;
      if (word.code) {
        const definition = dictionary.lookup(word.code);
        if (!definition) add(number, token.from, token.to, 'warning', 'unknownCode', `${word.code} est inconnu du profil machine actif.`);
        else if (definition.group && definition.group !== NON_MODAL) {
          const other = groups.get(definition.group);
          if (other) add(number, token.from, token.to, 'error', 'sameGroup', `${other} et ${word.code} sont incompatibles dans un même bloc (groupe : ${groupLabel(definition.group)}).`);
          else groups.set(definition.group, word.code);
        }
        if (word.letter === 'M') mCodes.push(word);
        if (word.code === 'M30' || word.code === 'M2') hasEnd = true;
        if (word.code === 'M99') hasSubprogramEnd = true;
      } else if (!['N', 'O'].includes(word.letter)) {
        if (letters.has(word.letter)) add(number, token.from, token.to, 'error', 'repeatedAddress', `Adresse ${word.letter} répétée dans le bloc.`);
        letters.set(word.letter, word);
      }
      if (COORDINATE_LETTERS.has(word.letter) && word.valueKind === 'number' && !word.hasDecimal && word.value !== 0) {
        add(number, token.from, token.to, 'warning', 'decimalPoint', `${word.letter}${word.valueText} sans point décimal : ${(word.value / 1000).toLocaleString('fr-FR')} mm sur une FANUC sans « mode calculatrice ». Écrire ${word.letter}${word.valueText}. ?`);
      }
    }
    if (mCodes.length > 1) {
      const [, second] = mCodes;
      add(number, second.token.from, second.token.to, 'warning', 'multipleM', `${mCodes.length} codes M dans le même bloc : beaucoup de commandes n’en acceptent qu’un (vérifier le paramétrage).`);
    }

    // --- Numéros de bloc et références -------------------------------------------------------
    if (block.blockNumber != null) {
      if (!blockNumbers.has(block.blockNumber)) blockNumbers.set(block.blockNumber, []);
      blockNumbers.get(block.blockNumber).push(number);
      const n = block.words.find((w) => w.letter === 'N');
      if (blockNumbers.get(block.blockNumber).length === 2) {
        add(number, n.token.from, n.token.to, 'warning', 'blockRefs', `Numéro de bloc N${block.blockNumber} en double (déjà ligne ${blockNumbers.get(block.blockNumber)[0]}).`);
      }
    }
    const refLetters = blockRefLetters(block, dictionary);
    for (const word of block.words) {
      if (refLetters.has(word.letter) && word.valueKind === 'number') references.push({ value: word.value, line: number, from: word.token.from, to: word.token.to, label: `${word.letter}${word.valueText}` });
    }
    tokens.forEach((token, i) => {
      const next = tokens[i + 1];
      if (token.type === 'keyword' && token.keyword === 'GOTO' && next?.type === 'number') {
        references.push({ value: next.value, line: number, from: token.from, to: next.to, label: `GOTO ${next.text}` });
      }
    });

    // --- Cohérence d'exécution (état modal) -------------------------------------------------
    const before = { ...state, groups: { ...state.groups } };
    applyBlock(state, block, dictionary);
    const motionCode = block.codes.find((w) => dictionary.lookup(w.code)?.group === 'motion')?.code;
    const motion = state.groups.motion;
    const hasAxis = block.words.some((w) => ['X', 'Z', 'U', 'W', 'Y'].includes(w.letter));
    if (CUTTING_MOTION.has(motion) && (motionCode || hasAxis) && state.feed == null) {
      const target = block.words.find((w) => w.code === motionCode) ?? block.words.find((w) => ['X', 'Z', 'U', 'W', 'Y'].includes(w.letter));
      add(number, target.token.from, target.token.to, 'error', 'feed', `Usinage en ${motion} sans avance F définie auparavant.`);
      state.feed = 0; // un seul signalement
    }
    for (const word of block.codes) {
      if ((word.code === 'M3' || word.code === 'M4') && state.speed == null) add(number, word.token.from, word.token.to, 'warning', 'spindle', `${word.code} sans vitesse de broche S programmée.`);
      if (word.code === 'G96' && state.maxSpeed == null && limitCode) {
        add(number, word.token.from, word.token.to, 'warning', 'spindle', `Vitesse de coupe constante (G96) sans limitation préalable de la vitesse de broche (${limitCode} S…).`);
      }
    }
    const toolWord = block.words.find((w) => w.letter === 'T');
    const compensation = before.groups.cutterComp;
    if (toolWord && compensation && compensation !== 'G40' && state.groups.cutterComp === compensation) {
      add(number, toolWord.token.from, toolWord.token.to, 'warning', 'compensation', `Changement d’outil avec la compensation de rayon ${compensation} encore active : programmer G40 avant.`);
    }
    const end = block.codes.find((w) => w.code === 'M30' || w.code === 'M2');
    if (end && state.groups.cutterComp && state.groups.cutterComp !== 'G40') {
      add(number, end.token.from, end.token.to, 'warning', 'compensation', `Fin de programme avec la compensation de rayon ${state.groups.cutterComp} encore active : G40 oublié.`);
    }
  }

  // --- Références de blocs ---------------------------------------------------------------------
  for (const ref of references) {
    if (!blockNumbers.has(ref.value)) add(ref.line, ref.from, ref.to, 'error', 'blockRefs', `${ref.label} : aucun bloc N${ref.value} dans le programme.`);
  }

  // --- Fin de programme -------------------------------------------------------------------------
  if (lastLine && !hasEnd && !hasSubprogramEnd) {
    add(lastLine, 0, lastText.length, 'warning', 'programEnd', 'Fin de programme absente : terminer par M30 (ou M02), ou M99 pour un sous-programme.');
  }

  return diagnostics.sort((a, b) => a.line - b.line || a.from - b.from);
}
