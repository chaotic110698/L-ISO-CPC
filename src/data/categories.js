/**
 * Catégories de codes et d'éléments de programme. Chaque catégorie a une couleur propre,
 * identique pour tous ses membres, définie pour les deux thèmes dans css/tokens.css
 * (variable --c-<id>) et appliquée par la classe .tok-<id> (css/editor.css).
 */
export const CATEGORIES = [
  { id: 'motion', label: 'Interpolations et déplacements', example: 'G0 G1 G2 G3' },
  { id: 'cycle', label: 'Cycles', example: 'G71 G70 G76 G83' },
  { id: 'mode', label: 'Modes et réglages', example: 'G21 G96 G97 G99' },
  { id: 'tool', label: 'Outils et corrections', example: 'T0101 G40 G41 G42' },
  { id: 'mcode', label: 'Fonctions M', example: 'M3 M5 M8 M30' },
  { id: 'program', label: 'Structure du programme', example: '% O1000 M98 M99' },
  { id: 'macro', label: 'Variables de macro', example: '#901 #1' },
  { id: 'macroKeyword', label: 'Instructions de macro', example: 'IF GOTO WHILE SQRT' },
  { id: 'address', label: 'Adresses et valeurs', example: 'X25. Z-30. F0.2' },
  { id: 'blockNumber', label: 'Numéros de bloc', example: 'N10' },
  { id: 'comment', label: 'Commentaires', example: '(EBAUCHE)' },
  { id: 'unknown', label: 'Codes inconnus du profil', example: 'G123' },
  { id: 'invalid', label: 'Caractères invalides', example: '@' },
];
