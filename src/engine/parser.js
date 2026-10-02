import { tokenizeLine } from './tokenizer.js';

/**
 * Analyse d'une ligne en bloc structuré, puis d'un programme entier. Fonctions pures, sans DOM :
 * réutilisables par l'éditeur, le vérificateur, la future simulation et les tests.
 *
 * Bloc renvoyé par parseLine(text).block :
 *   {
 *     deleted: 0 | niveau,        saut de bloc optionnel (/, /2…)
 *     blockNumber: 10 | null,     numéro N
 *     programNumber: 1000 | null, numéro O (ou :)
 *     percent: boolean,           ligne contenant %
 *     words: [ { letter, valueKind, valueText, value, hasDecimal, code, expr, token } ],
 *     codes: [ mots G et M (avec `code` normalisé : 'G1', 'M30'…) ],
 *     variables: [ { name, index, assigned, token } ],
 *     comments: [ texte sans parenthèses ],
 *     isEmpty: boolean            ni mot ni variable (vide, commentaire seul ou %)
 *   }
 */

const cache = new Map();
const CACHE_LIMIT = 20000;

function buildBlock(text, tokens) {
  const block = {
    deleted: 0,
    blockNumber: null,
    programNumber: null,
    percent: false,
    words: [],
    codes: [],
    variables: [],
    comments: [],
    isEmpty: true,
  };

  tokens.forEach((token, index) => {
    switch (token.type) {
      case 'blockDelete':
        block.deleted = token.level;
        break;
      case 'percent':
        block.percent = true;
        break;
      case 'comment':
        block.comments.push(token.text.replace(/^\(/, '').replace(/\)$/, ''));
        break;
      case 'variable': {
        const next = tokens[index + 1];
        // Affectation : la variable est le premier élément (hors N / saut de bloc) suivi de « = ».
        const first = tokens.findIndex((t) => t.type !== 'blockDelete' && !(t.type === 'word' && t.letter === 'N'));
        const assigned = index === first && next?.type === 'operator' && next.text === '=';
        block.variables.push({ name: token.name, index: token.index, assigned, token });
        block.isEmpty = false;
        break;
      }
      case 'word': {
        const word = {
          letter: token.letter,
          valueKind: token.valueKind,
          valueText: token.valueText ?? null,
          value: token.value ?? null,
          hasDecimal: token.hasDecimal ?? false,
          code: token.code ?? null,
          expr: token.valueKind === 'expr' ? text.slice(token.exprFrom, token.exprTo) : null,
          token,
        };
        block.words.push(word);
        if (word.code) block.codes.push(word);
        if (token.letter === 'N' && token.valueKind === 'number' && block.blockNumber === null) block.blockNumber = token.value;
        if (token.letter === 'O' && token.valueKind === 'number') block.programNumber = token.value;
        block.isEmpty = false;
        break;
      }
      case 'keyword':
      case 'function':
        block.isEmpty = false;
        break;
      default:
        break;
    }
  });
  return block;
}

/** Analyse une ligne. Résultat mis en cache par texte : ne pas le modifier. */
export function parseLine(text) {
  let parsed = cache.get(text);
  if (!parsed) {
    const tokens = tokenizeLine(text);
    parsed = { tokens, block: buildBlock(text, tokens) };
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(text, parsed);
  }
  return parsed;
}

/**
 * Analyse un programme complet.
 * Renvoie { lines: [ { number, from, text, tokens, block } ] } (number à partir de 1,
 * from = position du début de ligne dans le texte).
 */
export function parseProgram(text) {
  const lines = [];
  let from = 0;
  const rawLines = String(text).split('\n');
  rawLines.forEach((raw, index) => {
    const lineText = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const { tokens, block } = parseLine(lineText);
    lines.push({ number: index + 1, from, text: lineText, tokens, block });
    from += raw.length + 1;
  });
  return { lines };
}
