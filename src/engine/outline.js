import { parseLine } from './parser.js';

/** Cycles reconnus sans dictionnaire (tournage Fanuc, système A). */
const DEFAULT_CYCLES = new Set(['G70', 'G71', 'G72', 'G73', 'G74', 'G75', 'G76', 'G90', 'G92', 'G94']);
const ENDS = { M30: 'Fin de programme', M2: 'Fin de programme', M99: 'Fin de sous-programme' };
const CALLS = new Set(['M98', 'G65', 'G66']);

/** Texte d'un commentaire de section, sans les décorations (--- EBAUCHE ---, *** FINITION ***). */
const sectionTitle = (comment) => comment.replace(/^[\s\-=*_#~.]+|[\s\-=*_#~.]+$/g, '') || comment.trim();

/**
 * Plan d'un programme : programmes (O…), sections (ligne de commentaire seule), changements
 * d'outil, cycles, appels de sous-programme et fins. Fonction pure.
 *
 * Une ligne de commentaire ne devient une section que si elle suit une ligne de programme
 * (pas l'en-tête juste sous O…, pas la suite d'un bloc de commentaires). Un cycle écrit sur
 * deux blocs consécutifs (G71 U… R… puis G71 P… Q…) n'apparaît qu'une fois.
 *
 * dictionary (facultatif) : un code est un cycle si sa catégorie est « cycle » ; il donne
 * aussi le nom affiché. Renvoie [{ line, kind, label, detail, level }] (lignes à partir de 1),
 * kind : 'program' | 'section' | 'tool' | 'cycle' | 'call' | 'end' ; level : 0 à 2.
 */
export function programOutline(lineTexts, dictionary = null) {
  const items = [];
  const isCycle = (code) => (dictionary ? dictionary.lookup(code)?.category === 'cycle' : DEFAULT_CYCLES.has(code));
  const name = (code) => dictionary?.lookup(code)?.name ?? '';
  let number = 0;
  let previous = 'none'; // nature de la ligne précédente : none | program | comment | code
  let lastCycle = null;

  for (const text of lineTexts) {
    number++;
    const { block } = parseLine(text);
    const comment = block.comments.join(' ').trim();
    const add = (kind, label, detail, level) => items.push({ line: number, kind, label, detail, level });

    if (block.programNumber != null) {
      add('program', `O${String(block.programNumber).padStart(4, '0')}`, comment, 0);
      previous = 'program';
      lastCycle = null;
      continue;
    }
    if (block.isEmpty) {
      if (comment && previous === 'code') add('section', sectionTitle(comment), '', 1);
      if (comment) previous = previous === 'none' ? 'none' : 'comment';
      continue;
    }

    const tool = block.words.find((w) => w.letter === 'T' && w.valueKind === 'number' && w.value > 0);
    if (tool) add('tool', `T${tool.valueText}`, comment, 1);

    for (const word of block.codes) {
      const { code } = word;
      if (isCycle(code)) {
        if (lastCycle?.code === code && lastCycle.line === number - 1) {
          lastCycle.line = number; // seconde ligne du même cycle
          continue;
        }
        add('cycle', word.token.text.toUpperCase(), name(code), 2);
        lastCycle = { code, line: number };
      } else if (CALLS.has(code)) {
        const target = block.words.find((w) => w.letter === 'P');
        add('call', `${word.token.text.toUpperCase()}${target ? ` P${target.valueText}` : ''}`, name(code) || 'Appel de sous-programme', 2);
      } else if (ENDS[code]) {
        add('end', word.token.text.toUpperCase(), ENDS[code], 1);
      }
    }
    previous = 'code';
  }
  return items;
}

/** Index de l'élément de plan qui contient la ligne `line` (dernier programme, section ou outil avant elle), ou -1. */
export function outlineSectionAt(items, line) {
  let found = -1;
  items.forEach((item, i) => {
    if (item.line <= line && ['program', 'section', 'tool'].includes(item.kind)) found = i;
  });
  return found;
}
