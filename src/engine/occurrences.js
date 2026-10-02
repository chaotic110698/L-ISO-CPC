/**
 * Clé d'identité d'un jeton, pour repérer ses autres occurrences dans le programme.
 *
 *   #901           → 'var:901'
 *   G01 / G1       → 'code:G1'
 *   X25. / X25.0   → 'X=25'
 *   X25 (sans point) → 'X=25!' : distinct de X25. — sur une commande Fanuc sans saisie
 *                    « calculatrice », X25 vaut 0,025 mm.
 *
 * Renvoie null pour les jetons sans identité utile (commentaires, opérateurs…).
 */
export function occurrenceKey(token) {
  if (!token) return null;
  if (token.type === 'variable') return token.name ? `var:${token.index}` : null;
  if (token.type !== 'word' || token.valueKind !== 'number') return null;
  if (token.code) return `code:${token.code}`;
  return `${token.letter}=${token.value}${token.hasDecimal ? '' : '!'}`;
}

/** Libellé lisible d'une clé (« #901 », « G1 », « X25. »). */
export function describeOccurrence(token) {
  if (token.type === 'variable') return token.name;
  if (token.code) return token.code;
  return `${token.letter}${token.valueText}`;
}

/** Jeton situé à la position `column` d'une ligne (curseur dedans ou juste après). */
export function tokenAt(tokens, column) {
  let after = null;
  for (const token of tokens) {
    if (token.from <= column && column < token.to) return token;
    if (token.to === column) after = token;
  }
  return after;
}
