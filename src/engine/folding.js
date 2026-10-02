import { parseLine } from './parser.js';

/**
 * Zones repliables d'un programme. Fonction pure.
 *   - sous-programme : de « O… » jusqu'à M99 (ou M30/M02, ou le programme suivant) ;
 *   - boucle : WHILE … DO n jusqu'au END n correspondant ;
 *   - opération : d'un changement d'outil (T…) jusqu'avant le suivant (ou la fin).
 * Renvoie [ { fromLine, toLine, kind: 'program' | 'loop' | 'tool' } ] (lignes à partir de 1),
 * chaque zone couvrant au moins deux lignes.
 */
export function foldRanges(lineTexts) {
  const ranges = [];
  const loops = [];
  let program = null;
  let tool = null;
  let number = 0;
  let lastContent = 0;

  const close = (open, end, kind) => {
    if (open && end > open) ranges.push({ fromLine: open, toLine: end, kind });
  };

  for (const text of lineTexts) {
    number++;
    const { tokens, block } = parseLine(text);
    if (!block.isEmpty) lastContent = number;

    if (block.programNumber != null) {
      close(program, number - 1, 'program');
      close(tool, number - 1, 'tool');
      tool = null;
      program = number;
    }
    if (block.words.some((w) => w.letter === 'T' && w.valueKind === 'number')) {
      close(tool, number - 1, 'tool');
      tool = number;
    }
    tokens.forEach((token, i) => {
      const next = tokens[i + 1];
      if (token.type === 'keyword' && token.keyword === 'DO' && next?.type === 'number') loops.push({ id: next.value, line: number });
      if (token.type === 'keyword' && token.keyword === 'END' && next?.type === 'number') {
        const index = loops.findLastIndex((loop) => loop.id === next.value);
        if (index !== -1) {
          close(loops[index].line, number, 'loop');
          loops.splice(index, 1);
        }
      }
    });
    const end = block.codes.find((w) => ['M99', 'M30', 'M2'].includes(w.code));
    if (end) {
      close(tool, end.code === 'M99' ? number : number - 1, 'tool');
      tool = null;
      close(program, number, 'program');
      program = null;
    }
  }
  close(tool, lastContent, 'tool');
  close(program, lastContent, 'program');
  return ranges.sort((a, b) => a.fromLine - b.fromLine || b.toLine - a.toLine);
}
