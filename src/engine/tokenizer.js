/**
 * Découpage d'une ligne de programme ISO en jetons. Fonction pure, sans DOM.
 *
 * Types de jetons (champ `type`) :
 *   word         mot adresse : lettre + valeur (G1, X25., T0101, N10, ,C1.…)
 *   comment      commentaire entre parenthèses (`unclosed: true` si non fermé)
 *   percent      %  (début / fin de bande)
 *   eob          ;  (fin de bloc, notation Fanuc)
 *   blockDelete  /  ou /1…/9 en début de bloc (saut de bloc optionnel)
 *   variable     variable de macro (#901) ; `indirect: true` pour #[…]
 *   keyword      mot-clé de macro (IF, GOTO, WHILE, DO, END, EQ, NE…)
 *   function     fonction de macro (SIN, SQRT, ROUND…)
 *   number       nombre isolé (expressions de macro, numéros GOTO / DO / END)
 *   operator     = + - * / [ ] < > ,
 *   unknown      caractère non reconnu
 *
 * Chaque jeton : { type, from, to, text } (positions dans la ligne), plus des champs propres.
 *
 * Un mot dont la valeur est une expression (X#901, Z-[#1+2.]) donne un jeton `word` qui ne
 * couvre que la lettre et le signe (`valueKind: 'expr'`, `exprFrom`, `exprTo`) ; l'expression
 * est découpée normalement à la suite (variables, opérateurs…).
 */

export const KEYWORDS = new Set(['IF', 'GOTO', 'WHILE', 'DO', 'END', 'THEN', 'EQ', 'NE', 'GT', 'LT', 'GE', 'LE', 'AND', 'OR', 'XOR', 'MOD']);

export const FUNCTIONS = new Set([
  'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN', 'ATN', 'SQRT', 'SQR', 'ABS', 'BIN', 'BCD',
  'ROUND', 'RND', 'FIX', 'FUP', 'LN', 'EXP', 'POW', 'ADP', 'POPEN', 'PCLOS', 'DPRNT', 'BPRNT',
]);

const OPERATORS = '=+-*/[]<>,';
const NUMBER_RE = /(?:\d+\.?\d*|\.\d+)/y;

const isLetter = (ch) => ch !== undefined && /[A-Za-z]/.test(ch);
const isDigit = (ch) => ch !== undefined && ch >= '0' && ch <= '9';

/** Normalise la partie numérique d'un code : G01 → G1, M03 → M3, G12.10 → G12.1. */
export function codeKey(letter, valueText) {
  const number = Number(valueText);
  if (!Number.isFinite(number)) return null;
  return letter.toUpperCase() + String(number);
}

/** Fin d'un groupe entre crochets commençant à `start` (sur '['), ou fin de ligne si non fermé. */
function matchBracket(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) return i + 1;
    else if (text[i] === '(') return i;
  }
  return text.length;
}

/** Fin d'une valeur-expression (#123, #[…], […]) commençant à `start`. */
function expressionEnd(text, start) {
  if (text[start] === '[') return matchBracket(text, start);
  // '#'
  let i = start + 1;
  if (text[i] === '[') return matchBracket(text, i);
  while (isDigit(text[i])) i++;
  return i;
}

export function tokenizeLine(text) {
  const tokens = [];
  const n = text.length;
  let i = 0;

  const push = (type, from, to, extra) => {
    const token = { type, from, to, text: text.slice(from, to) };
    if (extra) Object.assign(token, extra);
    tokens.push(token);
    return token;
  };

  /** Lit un mot adresse dont la lettre (ou ',C') occupe [start, valueStart). Renvoie la position suivante. */
  const readWord = (start, letter, valueStart) => {
    // Espaces tolérés entre la lettre et sa valeur (ignorés par les commandes Fanuc).
    let p = valueStart;
    while (text[p] === ' ' || text[p] === '\t') p++;
    let q = p;
    if (text[q] === '+' || text[q] === '-') q++;

    NUMBER_RE.lastIndex = q;
    const match = NUMBER_RE.exec(text);
    if (match) {
      const end = q + match[0].length;
      const valueText = text.slice(p, end);
      const word = {
        letter,
        valueKind: 'number',
        valueText,
        value: Number(valueText),
        hasDecimal: valueText.includes('.'),
      };
      if (letter === 'G' || letter === 'M') word.code = codeKey(letter, valueText);
      push('word', start, end, word);
      return end;
    }
    if (text[q] === '#' || text[q] === '[') {
      push('word', start, q, { letter, valueKind: 'expr', exprFrom: q, exprTo: expressionEnd(text, q), sign: text.slice(p, q) });
      return q;
    }
    push('word', start, valueStart, { letter, valueKind: 'missing' });
    return valueStart;
  };

  while (i < n) {
    const ch = text[i];

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
    } else if (ch === '(') {
      const close = text.indexOf(')', i + 1);
      const to = close === -1 ? n : close + 1;
      push('comment', i, to, close === -1 ? { unclosed: true } : undefined);
      i = to;
    } else if (ch === ')') {
      push('unknown', i, i + 1, { reason: 'parenthèse fermante sans ouverture' });
      i++;
    } else if (ch === '%') {
      push('percent', i, i + 1);
      i++;
    } else if (ch === ';') {
      push('eob', i, i + 1);
      i++;
    } else if (ch === '/' && tokens.length === 0) {
      const to = isDigit(text[i + 1]) ? i + 2 : i + 1;
      push('blockDelete', i, to, { level: to - i === 2 ? Number(text[i + 1]) : 1 });
      i = to;
    } else if (ch === '#') {
      let j = i + 1;
      while (isDigit(text[j])) j++;
      if (j > i + 1) {
        const index = Number(text.slice(i + 1, j));
        push('variable', i, j, { index, name: `#${index}` });
      } else {
        push('variable', i, i + 1, { indirect: true, name: null });
      }
      i = j;
    } else if (isLetter(ch)) {
      let j = i;
      while (isLetter(text[j])) j++;
      const run = text.slice(i, j).toUpperCase();
      if (j - i >= 2 && (KEYWORDS.has(run) || FUNCTIONS.has(run))) {
        push(KEYWORDS.has(run) ? 'keyword' : 'function', i, j, { keyword: run });
        i = j;
      } else {
        i = readWord(i, ch.toUpperCase(), i + 1);
      }
    } else if (ch === ',' && isLetter(text[i + 1]) && !isLetter(text[i + 2])) {
      // Chanfrein / congé automatique Fanuc : ,C1. ,R2. ,A30.
      i = readWord(i, ',' + text[i + 1].toUpperCase(), i + 2);
    } else if (ch === ':' && isDigit(text[i + 1])) {
      // Numéro de programme au format ISO « :1000 » (équivalent de O1000).
      i = readWord(i, 'O', i + 1);
    } else if (isDigit(ch) || (ch === '.' && isDigit(text[i + 1]))) {
      NUMBER_RE.lastIndex = i;
      const length = NUMBER_RE.exec(text)[0].length;
      const valueText = text.slice(i, i + length);
      push('number', i, i + length, { value: Number(valueText), hasDecimal: valueText.includes('.') });
      i += length;
    } else if (OPERATORS.includes(ch)) {
      push('operator', i, i + 1);
      i++;
    } else {
      push('unknown', i, i + 1, { reason: 'caractère non reconnu' });
      i++;
    }
  }
  return tokens;
}
