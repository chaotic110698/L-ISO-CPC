/**
 * Codes FANUC tournage (système de codes G « A », le plus courant sur tour).
 * Cette couche se superpose à l'ISO générique et redéfinit les codes détournés :
 * G90/G92/G94 deviennent des cycles, G98/G99 l'unité d'avance, G50 la limitation de vitesse.
 */
export const FANUC_TURNING_CODES = {
  id: 'fanuc-turning',
  label: 'FANUC tournage',
  codes: {
    'G7.1': { category: 'motion', name: 'Interpolation cylindrique' },
    'G12.1': { category: 'motion', name: 'Interpolation polaire' },
    'G13.1': { category: 'motion', name: 'Annulation de l’interpolation polaire' },
    G32: { category: 'motion', name: 'Filetage (passe unique)' },
    G34: { category: 'motion', name: 'Filetage à pas variable' },
    G50: { category: 'mode', name: 'Limitation de vitesse broche / décalage d’origine' },
    G70: { category: 'cycle', name: 'Cycle de finition' },
    G71: { category: 'cycle', name: 'Cycle d’ébauche longitudinale (chariotage)' },
    G72: { category: 'cycle', name: 'Cycle d’ébauche transversale (dressage)' },
    G73: { category: 'cycle', name: 'Cycle d’ébauche parallèle au profil' },
    G74: { category: 'cycle', name: 'Cycle de perçage / rainurage frontal' },
    G75: { category: 'cycle', name: 'Cycle de rainurage radial' },
    G76: { category: 'cycle', name: 'Cycle de filetage multipasses' },
    G80: { category: 'cycle', name: 'Annulation de cycle de perçage' },
    G83: { category: 'cycle', name: 'Cycle de perçage frontal avec débourrage' },
    G84: { category: 'cycle', name: 'Cycle de taraudage frontal' },
    G85: { category: 'cycle', name: 'Cycle d’alésage frontal' },
    G87: { category: 'cycle', name: 'Cycle de perçage radial' },
    G88: { category: 'cycle', name: 'Cycle de taraudage radial' },
    G89: { category: 'cycle', name: 'Cycle d’alésage radial' },
    G90: { category: 'cycle', name: 'Cycle de chariotage simple' },
    G92: { category: 'cycle', name: 'Cycle de filetage simple' },
    G94: { category: 'cycle', name: 'Cycle de dressage simple' },
    G98: { category: 'mode', name: 'Avance en mm/min' },
    G99: { category: 'mode', name: 'Avance en mm/tr' },
    // Codes de fraisage sans équivalent en tournage système A.
    G17: { category: 'mode', name: 'Plan XY (outils motorisés)' },
    G43: null,
    G44: null,
    G49: null,
    G81: null,
    G82: null,
    G86: null,
    G91: null,
    G95: null,
  },
};
