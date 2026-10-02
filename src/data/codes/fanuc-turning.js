/**
 * Codes FANUC tournage (système de codes G « A », le plus courant sur tour : séries 0i-T/TF,
 * 30i-T…). Cette couche se superpose à l'ISO générique et redéfinit entièrement les codes
 * détournés : G90/G92/G94 deviennent des cycles, G98/G99 l'unité d'avance, G50 la limitation
 * de vitesse. Format des définitions : voir iso-base.js.
 *
 * Unités des cycles multipasses : les valeurs notées « µm » s'écrivent SANS point décimal
 * (Q300 = 0,3 mm) ; les autres en mm avec point décimal.
 */

const PROFILE_FORM = (roughing) => ({
  when: ['P', 'Q'],
  params: {
    P: 'Numéro N du premier bloc du profil (ns)',
    Q: 'Numéro N du dernier bloc du profil (nf)',
    U: 'Surépaisseur de finition en X (au diamètre ; positive à l’extérieur, négative à l’intérieur)',
    W: 'Surépaisseur de finition en Z',
    F: `Avance ${roughing} (celles du profil sont ignorées ici, et utilisées par G70)`,
    S: 'Vitesse de broche pendant le cycle',
    T: 'Outil pendant le cycle',
  },
});

const LATHE_DRILL_PARAMS = {
  X: 'Position en X (ou C : angle de la broche)',
  C: 'Position angulaire de la broche (axe C)',
  Z: 'Fond du trou',
  R: 'Distance du plan initial au point R (approche)',
  Q: 'Profondeur de chaque passe (µm, sans point)',
  P: 'Temporisation en fond de trou (ms)',
  F: 'Avance',
  K: 'Nombre de répétitions',
  M: 'Code M de blocage de l’axe C (selon machine)',
};

/** Alésage : pas de passes de débourrage (Q). */
const { Q: _peck, ...BORING_PARAMS } = LATHE_DRILL_PARAMS;

export const FANUC_TURNING_CODES = {
  id: 'fanuc-turning',
  label: 'FANUC tournage',
  codes: {
    // --- Interpolations ----------------------------------------------------------------------
    'G7.1': {
      category: 'motion', group: 'cylindrical',
      name: 'Interpolation cylindrique',
      description: 'Usinage sur la surface d’un cylindre avec l’axe C et un outil motorisé (rainures hélicoïdales, cames). G7.1 C… active (C = rayon du cylindre), G7.1 C0 annule.',
      syntax: 'G7.1 C(rayon)  …  G7.1 C0',
      modal: true,
    },
    'G12.1': {
      category: 'motion', group: 'polar',
      name: 'Interpolation polaire',
      description: 'Usinage en face avec outil motorisé : on programme en coordonnées cartésiennes (X, C), la commande pilote X et la rotation de la broche (méplats, polygones).',
      modal: true,
    },
    'G13.1': { category: 'motion', group: 'polar', name: 'Annulation de l’interpolation polaire', description: 'Termine le mode G12.1.', modal: true },
    G32: {
      category: 'motion', group: 'motion',
      name: 'Filetage (passe unique)',
      description: 'Une passe de filetage synchronisée avec la broche, du point actuel au point programmé. Les passes successives se programment une à une (sinon, utiliser G92 ou G76).',
      syntax: 'G32 Z… F(pas)',
      modal: true,
      params: { X: 'Diamètre à la fin de la passe (filetage conique)', Z: 'Fin du filetage', F: 'Pas du filet (mm)', Q: 'Décalage angulaire du départ (filets multiples, en millièmes de degré)' },
      notes: ['Toujours en G97 : la synchronisation avec la broche exige une vitesse de rotation fixe.'],
      example: 'G97 S800 M3\nG0 X19.4 Z5.\nG32 Z-22. F1.5\nG0 X24.\nZ5.',
    },
    G34: {
      category: 'motion', group: 'motion',
      name: 'Filetage à pas variable',
      description: 'Comme G32, avec un pas qui varie de K à chaque tour.',
      syntax: 'G34 Z… F(pas) K(variation)',
      modal: true,
      params: { F: 'Pas de départ (mm)', K: 'Variation du pas par tour (mm)' },
    },

    // --- Modes ----------------------------------------------------------------------------------
    G17: { category: 'mode', group: 'plane', name: 'Plan XY (outils motorisés)', description: 'Plan XY, pour les usinages en face avec outil motorisé sur les tours équipés d’un axe Y.', modal: true },
    G50: {
      category: 'mode', group: 'nonModal',
      name: 'Limitation de vitesse broche / décalage d’origine',
      description:
        'Avec S : vitesse de rotation maximale autorisée (tr/min), indispensable avant G96. Avec X et Z : définit l’origine pièce à partir de la position actuelle de l’outil (ancienne méthode, remplacée par les décalages G54…).',
      syntax: 'G50 S(tr/min maxi)   ou   G50 X… Z…',
      modal: false,
      spindleLimit: true,
      forms: [
        { when: ['S'], params: { S: 'Vitesse de rotation maximale (tr/min)' } },
        { params: { X: 'Coordonnée X attribuée à la position actuelle', Z: 'Coordonnée Z attribuée à la position actuelle' } },
      ],
      notes: ['À programmer avant G96 : sans limitation, la broche peut atteindre sa vitesse maximale près du centre.'],
      example: 'G50 S3000\nG96 S220 M3',
    },
    G98: { category: 'mode', group: 'feedMode', name: 'Avance en mm/min', description: 'L’avance F est exprimée en millimètres par minute (perçage avec outil motorisé, déplacements sans broche).', modal: true },
    G99: { category: 'mode', group: 'feedMode', name: 'Avance en mm/tr', description: 'L’avance F est exprimée en millimètres par tour de broche. Mode habituel en tournage.', modal: true },

    // --- Cycles multipasses ----------------------------------------------------------------------
    G70: {
      category: 'cycle', group: 'nonModal',
      name: 'Cycle de finition',
      description: 'Usine le profil compris entre les blocs P et Q en une passe, avec les avances, vitesses et outils programmés dans ces blocs. S’utilise après G71, G72 ou G73.',
      syntax: 'G70 P(ns) Q(nf)',
      modal: false,
      params: { P: 'Numéro N du premier bloc du profil (ns)', Q: 'Numéro N du dernier bloc du profil (nf)' },
      notes: ['Activer la compensation de rayon de bec (G42 extérieur / G41 intérieur) avant G70, l’annuler après.'],
      example: 'G0 G42 X52. Z2.\nG70 P90 Q160\nG0 G40 X100. Z100.',
    },
    G71: {
      category: 'cycle', group: 'nonModal',
      name: 'Cycle d’ébauche longitudinale (chariotage)',
      description: 'Enlève la matière par passes parallèles à l’axe Z, en suivant le profil décrit entre les blocs P et Q, en laissant une surépaisseur pour la finition. Se programme sur deux blocs G71.',
      syntax: 'G71 U(Δd) R(e)\nG71 P(ns) Q(nf) U(Δu) W(Δw) F S T',
      modal: false,
      forms: [
        PROFILE_FORM('d’ébauche'),
        { params: { U: 'Profondeur de passe (au rayon), Δd', R: 'Dégagement en fin de passe (au rayon), e' } },
      ],
      notes: [
        'Profil de type I : X et Z doivent évoluer dans un seul sens (sans creux).',
        'Le premier bloc du profil (ns) ne contient qu’un déplacement en X (G0 ou G1).',
      ],
      example: 'G71 U2. R0.5\nG71 P100 Q200 U0.4 W0.1 F0.25',
    },
    G72: {
      category: 'cycle', group: 'nonModal',
      name: 'Cycle d’ébauche transversale (dressage)',
      description: 'Comme G71, mais les passes sont parallèles à l’axe X (dressage) : adapté aux pièces courtes de grand diamètre.',
      syntax: 'G72 W(Δd) R(e)\nG72 P(ns) Q(nf) U(Δu) W(Δw) F S T',
      modal: false,
      forms: [PROFILE_FORM('d’ébauche'), { params: { W: 'Profondeur de passe en Z, Δd', R: 'Dégagement en fin de passe, e' } }],
      notes: ['Le premier bloc du profil (ns) ne contient qu’un déplacement en Z.'],
      example: 'G72 W2. R0.5\nG72 P100 Q200 U0.4 W0.1 F0.25',
    },
    G73: {
      category: 'cycle', group: 'nonModal',
      name: 'Cycle d’ébauche parallèle au profil',
      description: 'Répète le profil P–Q en le décalant à chaque passe : adapté aux bruts déjà proches de la forme finale (pièces forgées, moulées).',
      syntax: 'G73 U(Δi) W(Δk) R(d)\nG73 P(ns) Q(nf) U(Δu) W(Δw) F S T',
      modal: false,
      forms: [
        PROFILE_FORM('d’ébauche'),
        { params: { U: 'Matière totale à enlever en X (au rayon), Δi', W: 'Matière totale à enlever en Z, Δk', R: 'Nombre de passes' } },
      ],
    },
    G74: {
      category: 'cycle', group: 'nonModal',
      name: 'Cycle de perçage / rainurage frontal',
      description: 'Perçage profond au centre avec débourrage (sans X), ou rainurage en face par plongées successives en Z.',
      syntax: 'G74 R(e)\nG74 X(U) Z(W) P(Δi) Q(Δk) R(Δd) F',
      modal: false,
      forms: [
        {
          when: ['Z'],
          params: {
            X: 'Diamètre de la dernière plongée (rainurage ; absent pour un perçage)',
            U: 'Distance en X (relative)',
            Z: 'Profondeur finale en Z',
            W: 'Distance en Z (relative)',
            P: 'Décalage en X entre deux plongées (µm, sans point)',
            Q: 'Profondeur de chaque passe en Z (µm, sans point)',
            R: 'Dégagement en fond de passe',
            F: 'Avance',
          },
        },
        { params: { R: 'Recul après chaque passe (débourrage), e' } },
      ],
      example: 'G74 R1.\nG74 Z-40. Q5000 F0.1',
    },
    G75: {
      category: 'cycle', group: 'nonModal',
      name: 'Cycle de rainurage radial',
      description: 'Gorge radiale par plongées successives en X avec débourrage ; décale en Z entre les plongées pour une gorge plus large que l’outil.',
      syntax: 'G75 R(e)\nG75 X(U) Z(W) P(Δi) Q(Δk) R(Δd) F',
      modal: false,
      forms: [
        {
          when: ['X'],
          params: {
            X: 'Diamètre du fond de gorge',
            U: 'Distance en X (relative)',
            Z: 'Position Z de la dernière plongée',
            W: 'Distance en Z (relative)',
            P: 'Profondeur de chaque passe en X (µm, sans point)',
            Q: 'Décalage en Z entre deux plongées (µm, sans point)',
            R: 'Dégagement en fond de gorge',
            F: 'Avance',
          },
        },
        { params: { R: 'Recul après chaque passe (débourrage), e' } },
      ],
    },
    G76: {
      category: 'cycle', group: 'nonModal',
      name: 'Cycle de filetage multipasses',
      description: 'Filetage complet en plusieurs passes à pénétration oblique, calculées automatiquement. Se programme sur deux blocs G76.',
      syntax: 'G76 P(m)(r)(a) Q(Δdmin) R(d)\nG76 X(U) Z(W) R(i) P(k) Q(Δd) F(pas)',
      modal: false,
      forms: [
        {
          when: ['X'],
          params: {
            X: 'Diamètre à fond de filet',
            U: 'Distance en X (relative)',
            Z: 'Fin du filetage',
            W: 'Distance en Z (relative)',
            R: 'Conicité : différence de rayon entre début et fin (0 ou absent : cylindrique)',
            P: 'Hauteur du filet au rayon, k (µm, sans point)',
            Q: 'Profondeur de la première passe au rayon, Δd (µm, sans point)',
            F: 'Pas du filet (mm)',
          },
        },
        {
          params: {
            P: 'Six chiffres mmrraa : m = passes de finition, rr = chanfrein de sortie (dixièmes de pas), aa = angle de l’outil',
            Q: 'Profondeur de passe minimale, Δdmin (µm, sans point)',
            R: 'Surépaisseur de finition, d (mm)',
          },
        },
      ],
      notes: ['Toujours en G97 (vitesse de rotation constante).', 'Point de départ : au-dessus du diamètre du filet, à au moins 2 à 3 pas en amont.'],
      example: 'G97 S800 M3\nG0 X22. Z5.\nG76 P020060 Q50 R0.05\nG76 X18.16 Z-22. P920 Q300 F1.5',
    },

    // --- Cycles simples (redéfinissent G90 / G92 / G94 de l'ISO) ------------------------------------
    G90: {
      category: 'cycle', group: 'motion',
      name: 'Cycle de chariotage simple',
      description:
        'Une passe complète de chariotage en un bloc : plongée en X, passe en Z, retrait, retour au point de départ. Modal : les blocs suivants ne contenant que X répètent le cycle à un nouveau diamètre.',
      syntax: 'G90 X(U) Z(W) R… F…',
      modal: true,
      params: { X: 'Diamètre de la passe', U: 'Distance en X (relative)', Z: 'Fin de la passe en Z', W: 'Distance en Z (relative)', R: 'Conicité : différence de rayon début − fin', F: 'Avance' },
      notes: ['En tournage FANUC (système A), G90 n’est PAS la programmation absolue : X/Z sont absolus, U/W relatifs.'],
      example: 'G0 X52. Z2.\nG90 X46. Z-30. F0.25\nX42.\nX38.',
    },
    G92: {
      category: 'cycle', group: 'motion',
      name: 'Cycle de filetage simple',
      description: 'Une passe de filetage complète en un bloc (plongée, filetage, retrait, retour). Modal : les blocs suivants ne contenant que X enchaînent les passes.',
      syntax: 'G92 X(U) Z(W) R… F(pas)',
      modal: true,
      params: { X: 'Diamètre de la passe', U: 'Distance en X (relative)', Z: 'Fin du filetage', W: 'Distance en Z (relative)', R: 'Conicité : différence de rayon début − fin', F: 'Pas du filet (mm)' },
      notes: ['En tournage FANUC (système A), G92 est un cycle de filetage, pas un décalage d’origine (c’est G50).'],
      example: 'G97 S1000 M3\nG0 X24. Z5.\nG92 X19.4 Z-22. F1.5\nX19.\nX18.7',
    },
    G94: {
      category: 'cycle', group: 'motion',
      name: 'Cycle de dressage simple',
      description: 'Une passe complète de dressage en un bloc : plongée en Z, passe en X, retrait, retour. Modal comme G90.',
      syntax: 'G94 X(U) Z(W) R… F…',
      modal: true,
      params: { X: 'Diamètre de fin de passe', U: 'Distance en X (relative)', Z: 'Position Z de la passe', W: 'Distance en Z (relative)', R: 'Conicité en Z', F: 'Avance' },
      notes: ['En tournage FANUC (système A), G94 est un cycle de dressage ; l’avance en mm/min est G98.'],
    },

    // --- Cycles de perçage (outils motorisés / au centre) -----------------------------------------
    G80: { category: 'cycle', group: 'cycle', name: 'Annulation de cycle de perçage', description: 'Annule le cycle de perçage actif (G83 à G89).', modal: true },
    G83: { category: 'cycle', group: 'cycle', name: 'Cycle de perçage frontal avec débourrage', description: 'Perçage en face (axe Z), par passes Q avec débourrage.', syntax: 'G83 X(C) Z R Q P F K M', modal: true, params: LATHE_DRILL_PARAMS },
    G84: { category: 'cycle', group: 'cycle', name: 'Cycle de taraudage frontal', description: 'Taraudage en face (axe Z), avec inversion de la broche en fond de trou.', syntax: 'G84 X(C) Z R P F K M', modal: true, params: { ...LATHE_DRILL_PARAMS, F: 'Avance = pas du taraud (en G99)' } },
    G85: { category: 'cycle', group: 'cycle', name: 'Cycle d’alésage frontal', description: 'Alésage en face : aller et retour à l’avance travail.', modal: true, params: BORING_PARAMS },
    G87: { category: 'cycle', group: 'cycle', name: 'Cycle de perçage radial', description: 'Perçage radial (axe X) avec outil motorisé, par passes Q.', syntax: 'G87 Z(C) X R Q P F K M', modal: true, params: { ...LATHE_DRILL_PARAMS, X: 'Fond du trou (diamètre)', Z: 'Position du trou en Z' } },
    G88: { category: 'cycle', group: 'cycle', name: 'Cycle de taraudage radial', description: 'Taraudage radial (axe X) avec outil motorisé.', modal: true, params: { ...LATHE_DRILL_PARAMS, X: 'Fond du trou (diamètre)', Z: 'Position du trou en Z' } },
    G89: { category: 'cycle', group: 'cycle', name: 'Cycle d’alésage radial', description: 'Alésage radial (axe X) avec outil motorisé.', modal: true, params: { ...BORING_PARAMS, X: 'Fond du trou (diamètre)', Z: 'Position du trou en Z' } },

    // --- Codes de fraisage sans équivalent en tournage système A ------------------------------
    G43: null,
    G44: null,
    G49: null,
    G81: null,
    G82: null,
    G86: null,
    G91: null,
    G95: null,
  },

  /** Adresses : significations propres au tournage (remplacent celles de l'ISO générique). */
  addresses: {
    X: 'Coordonnée X, programmée au DIAMÈTRE en tournage',
    U: 'Déplacement relatif en X (au diamètre)',
    W: 'Déplacement relatif en Z',
    C: 'Axe C : position angulaire de la broche (degrés)',
    T: 'Outil et correcteur : T0101 = outil 01 avec le correcteur 01',
    F: 'Avance (mm/tr en G99, mm/min en G98)',
    S: 'Vitesse de broche : m/min en G96, tr/min en G97, maxi en G50',
  },

  /** Plages de variables de macro FANUC (Custom Macro B). */
  variables: [
    { from: 0, to: 0, name: 'Variable nulle', description: 'Toujours vide (« null ») ; lecture seule.' },
    { from: 1, to: 33, name: 'Variables locales', description: 'Propres à chaque appel de macro (arguments de G65 : A → #1, B → #2…). Effacées à la fin de la macro.' },
    { from: 100, to: 199, name: 'Variables communes (volatiles)', description: 'Partagées entre programmes ; effacées à la mise hors tension (selon paramétrage).' },
    { from: 500, to: 999, name: 'Variables communes conservées', description: 'Partagées entre programmes et conservées après mise hors tension. Plage habituelle des variables utilisateur.' },
    { from: 1000, to: 99999, name: 'Variables système', description: 'Données de la commande : entrées/sorties, correcteurs, positions, alarmes (#3000), horloge… Lecture ou écriture selon la variable.' },
  ],
};
