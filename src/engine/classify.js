/**
 * Catégorie d'affichage d'un jeton (voir src/data/categories.js). Les codes G et M prennent la
 * catégorie de leur définition dans le dictionnaire ; un code absent du dictionnaire est 'unknown'.
 */
const TOOL_LETTERS = new Set(['T', 'D', 'H']);

export function tokenCategory(token, dictionary) {
  switch (token.type) {
    case 'comment':
      return 'comment';
    case 'percent':
    case 'eob':
    case 'blockDelete':
      return 'program';
    case 'variable':
      return 'macro';
    case 'keyword':
    case 'function':
      return 'macroKeyword';
    case 'unknown':
      return 'invalid';
    case 'word': {
      const { letter } = token;
      if (letter === 'G' || letter === 'M') {
        if (!token.code) return 'unknown';
        return dictionary?.lookup(token.code)?.category ?? 'unknown';
      }
      if (letter === 'N') return 'blockNumber';
      if (letter === 'O') return 'program';
      if (TOOL_LETTERS.has(letter)) return 'tool';
      return 'address';
    }
    default:
      return null;
  }
}
