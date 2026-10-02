import { parseLine } from './parser.js';
import { blockRefLetters } from './checker.js';

/**
 * Renumérotation des blocs N. Fonction pure.
 *   options : { start = 10, step = 10, addMissing = false, fromLine = 1, toLine = Infinity }
 * Les références sont mises à jour : P/Q des cycles G70–G73, P de M99, GOTO n.
 * Renvoie { lines: [textes], changed: nombre de lignes modifiées, map: Map(ancien N → nouveau N) }.
 */
export const MAX_BLOCK_NUMBER = 99999;

/** Une ligne reçoit un N si elle porte un bloc exécutable (pas %, O…, commentaire seul, vide). */
function canNumber(block, tokens) {
  if (block.isEmpty || block.percent || block.programNumber != null) return false;
  return tokens.some((t) => t.type === 'word' || t.type === 'variable' || t.type === 'keyword');
}

export function renumber(lineTexts, dictionary, { start = 10, step = 10, addMissing = false, fromLine = 1, toLine = Infinity } = {}) {
  const texts = [...lineTexts];
  const map = new Map();
  const plan = []; // { index, token|null, newNumber }
  let next = start;

  texts.forEach((text, index) => {
    const lineNumber = index + 1;
    if (lineNumber < fromLine || lineNumber > toLine) return;
    const { tokens, block } = parseLine(text);
    const n = tokens.find((t) => t.type === 'word' && t.letter === 'N' && t.valueKind === 'number');
    if (n || (addMissing && canNumber(block, tokens))) {
      if (n && !map.has(n.value)) map.set(n.value, next);
      plan.push({ index, token: n ?? null, newNumber: next });
      next += step;
    }
  });

  const output = texts.map((text, index) => {
    const { tokens, block } = parseLine(text);
    const edits = [];
    const own = plan.find((p) => p.index === index);
    if (own) {
      if (own.token) edits.push({ from: own.token.from, to: own.token.to, insert: `N${own.newNumber}` });
      else {
        const first = tokens.find((t) => t.type !== 'blockDelete');
        edits.push({ from: first.from, to: first.from, insert: `N${own.newNumber} ` });
      }
    }
    const refLetters = blockRefLetters(block, dictionary);
    tokens.forEach((token, i) => {
      if (token.type === 'word' && refLetters.has(token.letter) && token.valueKind === 'number' && map.has(token.value)) {
        edits.push({ from: token.from, to: token.to, insert: `${token.letter}${map.get(token.value)}` });
      }
      const following = tokens[i + 1];
      if (token.type === 'keyword' && token.keyword === 'GOTO' && following?.type === 'number' && map.has(following.value)) {
        edits.push({ from: following.from, to: following.to, insert: String(map.get(following.value)) });
      }
    });
    if (!edits.length) return text;
    let result = text;
    for (const edit of edits.sort((a, b) => b.from - a.from)) result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
    return result;
  });

  return {
    lines: output,
    changed: output.filter((text, i) => text !== texts[i]).length,
    map,
    last: next - step,
  };
}
