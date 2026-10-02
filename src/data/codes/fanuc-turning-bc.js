/**
 * FANUC tournage, systèmes de codes G « B » et « C ». Couche à placer AU-DESSUS de « FANUC
 * tournage » (système A) : seuls les codes dont le sens change sont redéfinis.
 *
 *   système A          systèmes B / C
 *   X/Z abs., U/W rel. G90 absolu, G91 incrémental
 *   G50 S (limite)     G92 S (limite) — G92 X Z : système de coordonnées
 *   G98 / G99          G94 (mm/min) / G95 (mm/tr)
 *   G90 / G92 / G94    G77 / G78 / G79 (cycles simples)
 *   —                  G98 / G99 : retour au plan initial / au point R des cycles de perçage
 */
export const FANUC_TURNING_BC_CODES = {
  id: 'fanuc-turning-bc',
  label: 'FANUC tournage B/C',
  codes: {
    G90: {
      category: 'mode', group: 'distance',
      name: 'Programmation absolue',
      description: 'Systèmes B/C : les cotes X et Z sont des positions mesurées depuis l’origine pièce. Mode par défaut.',
      modal: true,
      notes: ['En système A (le plus courant sur tour), G90 est au contraire un cycle de chariotage.'],
    },
    G91: {
      category: 'mode', group: 'distance',
      name: 'Programmation incrémentale',
      description: 'Systèmes B/C : les cotes X et Z sont des déplacements depuis la position actuelle (X au diamètre). Reste actif jusqu’à G90.',
      modal: true,
      notes: ['Pensez à revenir en G90 : sinon toutes les cotes suivantes sont lues comme des déplacements.'],
      example: 'G91 G01 Z-15. F0.2\nX10.\nG90',
    },
    G92: {
      category: 'mode', group: 'nonModal',
      name: 'Limitation de vitesse broche / système de coordonnées',
      description: 'Systèmes B/C : avec S, limite la vitesse de rotation maximale (indispensable avant G96) ; avec X et Z, déclare la position actuelle de l’outil (ancienne méthode de prise d’origine).',
      syntax: 'G92 S(tr/min maxi)   ou   G92 X… Z…',
      modal: false,
      spindleLimit: true,
      forms: [
        { when: ['S'], params: { S: 'Vitesse de rotation maximale (tr/min)' } },
        { params: { X: 'Position actuelle déclarée en X', Z: 'Position actuelle déclarée en Z' } },
      ],
      notes: ['Équivaut à G50 du système A.'],
      example: 'G92 S2500\nG96 S180 M03',
    },
    G94: {
      category: 'mode', group: 'feedMode',
      name: 'Avance en mm/min',
      description: 'Systèmes B/C : F est une vitesse d’avance en mm/min (équivaut à G98 du système A).',
      modal: true,
    },
    G95: {
      category: 'mode', group: 'feedMode',
      name: 'Avance en mm/tr',
      description: 'Systèmes B/C : F est une avance par tour de broche (équivaut à G99 du système A). Habituel en tournage.',
      modal: true,
    },
    G98: {
      category: 'mode', group: 'returnMode',
      name: 'Retour au plan initial (cycles de perçage)',
      description: 'Systèmes B/C : en fin de cycle de perçage, l’outil remonte au point de départ du cycle.',
      modal: true,
    },
    G99: {
      category: 'mode', group: 'returnMode',
      name: 'Retour au point R (cycles de perçage)',
      description: 'Systèmes B/C : en fin de cycle de perçage, l’outil remonte au point R.',
      modal: true,
    },
    G77: {
      category: 'cycle', group: 'motion',
      name: 'Cycle de chariotage simple',
      description: 'Systèmes B/C : une passe complète de chariotage en un bloc (équivaut à G90 du système A).',
      syntax: 'G77 X Z R F',
      modal: true,
      params: { X: 'Diamètre de la passe', Z: 'Fin de la passe en Z', R: 'Conicité : différence de rayon début − fin', F: 'Avance' },
    },
    G78: {
      category: 'cycle', group: 'motion',
      name: 'Cycle de filetage simple',
      description: 'Systèmes B/C : une passe de filetage complète en un bloc (équivaut à G92 du système A).',
      syntax: 'G78 X Z R F(pas)',
      modal: true,
      params: { X: 'Diamètre de la passe', Z: 'Fin du filetage', R: 'Conicité', F: 'Pas du filet (mm)' },
    },
    G79: {
      category: 'cycle', group: 'motion',
      name: 'Cycle de dressage simple',
      description: 'Systèmes B/C : une passe complète de dressage en un bloc (équivaut à G94 du système A).',
      syntax: 'G79 X Z R F',
      modal: true,
      params: { X: 'Diamètre de fin de passe', Z: 'Position Z de la passe', R: 'Conicité en Z', F: 'Avance' },
    },
    // Sens propre au système A : retirés pour ne pas induire en erreur.
    G50: null,
  },
  addresses: {
    U: 'Systèmes B/C : l’incrémental se programme avec G91 ; U sert surtout de paramètre de cycle (surépaisseur en X, profondeur de passe)',
    W: 'Systèmes B/C : l’incrémental se programme avec G91 ; W sert surtout de paramètre de cycle (surépaisseur en Z)',
  },
};
