import { tokenizeLine } from './tokenizer.js';

/**
 * Calcul des expressions de macro FANUC (variables #…, [ ], + - * /, MOD, fonctions) pour la
 * simulation. Fonction pure. Angles en degrés, comme sur la commande.
 *
 * Une variable jamais affectée est « vide » (null) : dans un calcul elle vaut 0 ; seule, à la
 * place d'une valeur d'adresse (X#100), elle rend le mot sans effet — comme sur la commande.
 */

const DEG = Math.PI / 180;
const FUNCTIONS = {
  SIN: (v) => Math.sin(v * DEG),
  COS: (v) => Math.cos(v * DEG),
  TAN: (v) => Math.tan(v * DEG),
  ASIN: (v) => Math.asin(v) / DEG,
  ACOS: (v) => Math.acos(v) / DEG,
  ATAN: (v) => Math.atan(v) / DEG,
  SQRT: Math.sqrt,
  ABS: Math.abs,
  ROUND: (v) => Math.sign(v) * Math.round(Math.abs(v)),
  FIX: (v) => Math.sign(v) * Math.floor(Math.abs(v)),
  FUP: (v) => Math.sign(v) * Math.ceil(Math.abs(v)),
  LN: Math.log,
  EXP: Math.exp,
};

export class MacroError extends Error {}

/**
 * Évalue une suite de jetons. vars : Map index → valeur. Renvoie un nombre, ou null si
 * l'expression n'est qu'une variable vide. Lève MacroError si l'expression est invalide.
 */
export function evaluateTokens(tokens, vars) {
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (text) => peek()?.type === 'operator' && peek().text === text;
  const isKeyword = (name) => peek()?.type === 'keyword' && peek().keyword === name;
  const value = (v) => (v == null ? 0 : v);

  function expression() {
    let left = term();
    for (;;) {
      if (isOp('+')) (i++, (left = value(left) + value(term())));
      else if (isOp('-')) (i++, (left = value(left) - value(term())));
      else if (isKeyword('OR')) (i++, (left = value(left) | value(term())));
      else if (isKeyword('XOR')) (i++, (left = value(left) ^ value(term())));
      else return left;
    }
  }
  function term() {
    let left = factor();
    for (;;) {
      if (isOp('*')) (i++, (left = value(left) * value(factor())));
      else if (isOp('/')) {
        i++;
        const right = value(factor());
        if (right === 0) throw new MacroError('division par zéro');
        left = value(left) / right;
      } else if (isKeyword('MOD')) (i++, (left = value(left) % value(factor())));
      else if (isKeyword('AND')) (i++, (left = value(left) & value(factor())));
      else return left;
    }
  }
  function bracket() {
    if (!isOp('[')) throw new MacroError('crochet [ attendu');
    i++;
    const v = expression();
    if (!isOp(']')) throw new MacroError('crochet ] manquant');
    i++;
    return v;
  }
  function factor() {
    const token = peek();
    if (!token) throw new MacroError('expression incomplète');
    if (isOp('-')) return (i++, -value(factor()));
    if (isOp('+')) return (i++, value(factor()));
    if (isOp('[')) return bracket();
    if (token.type === 'number') return (i++, token.value);
    if (token.type === 'variable') {
      i++;
      const index = token.index ?? Math.round(value(bracket())); // #[…] : variable indirecte
      return index === 0 ? null : (vars.get(index) ?? null);
    }
    if (token.type === 'function') {
      const fn = FUNCTIONS[token.keyword];
      if (!fn) throw new MacroError(`fonction ${token.keyword} non prise en charge`);
      i++;
      if (token.keyword === 'ATAN' && isOp('[')) {
        // ATAN[a]/[b] : angle de a/b, dans le bon quadrant.
        const a = value(bracket());
        if (isOp('/') && tokens[i + 1]?.text === '[') {
          i++;
          const b = value(bracket());
          return ((Math.atan2(a, b) / DEG) + 360) % 360;
        }
        return fn(a);
      }
      return fn(value(bracket()));
    }
    throw new MacroError(`« ${token.text} » inattendu`);
  }

  const result = expression();
  if (i < tokens.length) throw new MacroError(`« ${tokens[i].text} » inattendu`);
  return result;
}

/** Évalue un texte d'expression (« [#1+2.]*3 »). */
export const evaluateExpression = (text, vars) => evaluateTokens(tokenizeLine(text).filter((t) => t.type !== 'whitespace'), vars);
