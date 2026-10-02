/**
 * Codes ISO génériques, les plus répandus toutes commandes confondues (couche de base).
 *
 * Clé : lettre + valeur normalisée ('G0' pour G00, 'M3' pour M03, 'G12.1').
 * Champs d'une définition :
 *   category     catégorie d'affichage (../categories.js)
 *   name         libellé court
 *   description  explication (infobulle)
 *   syntax       forme(s) d'écriture
 *   modal        true : reste actif jusqu'à un code du même groupe ; false : ce bloc seulement
 *   params       { lettre: signification } des adresses utilisées avec ce code
 *   forms        variantes à plusieurs blocs : [{ when: ['P','Q'], params: {…} }, …] — la première
 *                dont toutes les lettres `when` sont présentes dans le bloc s'applique
 *   notes        remarques, pièges courants
 *   example      exemple de programmation
 *
 * Une couche supérieure (profil) qui redéfinit un code remplace entièrement sa définition.
 */

const ARC_PARAMS = {
  X: 'Point d’arrivée en X',
  Y: 'Point d’arrivée en Y',
  Z: 'Point d’arrivée en Z',
  R: 'Rayon de l’arc',
  I: 'Centre de l’arc en X, relatif au point de départ',
  J: 'Centre de l’arc en Y, relatif au point de départ',
  K: 'Centre de l’arc en Z, relatif au point de départ',
  F: 'Avance',
};

const DRILL_PARAMS = {
  X: 'Position du trou en X',
  Y: 'Position du trou en Y',
  Z: 'Profondeur (fond du trou)',
  R: 'Plan de dégagement (point R) d’où démarre l’avance travail',
  F: 'Avance',
  K: 'Nombre de répétitions',
  L: 'Nombre de répétitions',
};

export const ISO_BASE_CODES = {
  id: 'iso-base',
  label: 'ISO générique',
  codes: {
    // --- Interpolations et déplacements -----------------------------------------------------
    G0: {
      category: 'motion', group: 'motion',
      name: 'Positionnement en avance rapide',
      description:
        'Déplace l’outil à la vitesse maximale de la machine jusqu’au point programmé, sans usiner. La trajectoire n’est pas forcément une ligne droite : les axes peuvent arriver l’un avant l’autre.',
      syntax: 'G0 X… Z…',
      modal: true,
      params: { X: 'Point d’arrivée en X', Y: 'Point d’arrivée en Y', Z: 'Point d’arrivée en Z' },
      notes: ['Vérifier le dégagement avant chaque G0 : c’est le déplacement le plus dangereux en cas d’erreur de cote.'],
      example: 'G0 X52. Z2.',
    },
    G1: {
      category: 'motion', group: 'motion',
      name: 'Interpolation linéaire (avance travail)',
      description: 'Déplace l’outil en ligne droite à l’avance programmée F, pour usiner.',
      syntax: 'G1 X… Z… F…',
      modal: true,
      params: { X: 'Point d’arrivée en X', Y: 'Point d’arrivée en Y', Z: 'Point d’arrivée en Z', F: 'Avance' },
      notes: ['Sans F déjà défini dans le programme, la commande déclenche une alarme.'],
      example: 'G1 Z-30. F0.2',
    },
    G2: {
      category: 'motion', group: 'motion',
      name: 'Interpolation circulaire sens horaire',
      description:
        'Usine un arc de cercle dans le sens horaire jusqu’au point programmé, à l’avance F. L’arc est défini soit par son rayon R, soit par son centre I, J, K (relatif au point de départ).',
      syntax: 'G2 X… Z… R… F…   ou   G2 X… Z… I… K… F…',
      modal: true,
      params: ARC_PARAMS,
      notes: ['En tournage, le sens apparent dépend de la position de la tourelle (avant ou arrière de l’axe).'],
      example: 'G2 X35. Z-30. R5.',
    },
    G3: {
      category: 'motion', group: 'motion',
      name: 'Interpolation circulaire sens anti-horaire',
      description:
        'Usine un arc de cercle dans le sens anti-horaire jusqu’au point programmé, à l’avance F. L’arc est défini soit par son rayon R, soit par son centre I, J, K (relatif au point de départ).',
      syntax: 'G3 X… Z… R… F…   ou   G3 X… Z… I… K… F…',
      modal: true,
      params: ARC_PARAMS,
      notes: ['En tournage, le sens apparent dépend de la position de la tourelle (avant ou arrière de l’axe).'],
      example: 'G3 X35. Z-30. R5.',
    },
    G28: {
      category: 'motion', group: 'nonModal',
      name: 'Retour au point de référence',
      description:
        'Envoie les axes programmés au point de référence machine (en rapide), en passant par le point intermédiaire indiqué.',
      syntax: 'G28 X… Z…',
      modal: false,
      params: { X: 'Point intermédiaire en X', Y: 'Point intermédiaire en Y', Z: 'Point intermédiaire en Z', U: 'Point intermédiaire en X (relatif)', W: 'Point intermédiaire en Z (relatif)' },
      notes: ['En tournage, G28 U0. W0. renvoie directement les axes au point de référence, sans détour.'],
      example: 'G28 U0. W0.',
    },
    G30: {
      category: 'motion', group: 'nonModal',
      name: 'Retour au 2e point de référence',
      description: 'Comme G28, mais vers le 2e point de référence (souvent la position de changement d’outil).',
      syntax: 'G30 P2 X… Z…',
      modal: false,
      params: { P: 'Numéro du point de référence (2 à 4)' },
    },
    G31: {
      category: 'motion', group: 'nonModal',
      name: 'Saut (mesure)',
      description:
        'Déplacement linéaire interrompu dès qu’un signal externe arrive (palpeur). La position atteinte est enregistrée dans des variables système, pour la mesure.',
      syntax: 'G31 X… Z… F…',
      modal: false,
    },
    G33: {
      category: 'motion', group: 'motion',
      name: 'Filetage à pas constant',
      description: 'Filetage en une passe, synchronisé avec la rotation de la broche. Le pas est donné par F.',
      syntax: 'G33 Z… F(pas)',
      modal: true,
      params: { Z: 'Fin du filetage', F: 'Pas du filet (mm)' },
    },

    // --- Modes et réglages ------------------------------------------------------------------
    G4: {
      category: 'mode', group: 'nonModal',
      name: 'Temporisation',
      description: 'Arrête les déplacements pendant la durée indiquée (la broche continue de tourner).',
      syntax: 'G4 P… (ms)   ou   G4 X… (s)',
      modal: false,
      params: { P: 'Durée en millisecondes (sans point décimal)', X: 'Durée en secondes', U: 'Durée en secondes' },
      notes: ['P n’accepte pas de point décimal : G4 P500 = 0,5 s.'],
      example: 'G4 X0.5',
    },
    G9: {
      category: 'mode', group: 'nonModal',
      name: 'Arrêt précis (bloc)',
      description: 'Les axes ralentissent jusqu’à l’arrêt complet en fin de ce bloc avant d’exécuter le suivant (angles vifs).',
      modal: false,
    },
    G10: {
      category: 'mode', group: 'nonModal',
      name: 'Écriture de données (correcteurs, origines)',
      description: 'Modifie par programme des données de la commande : correcteurs d’outil, décalages d’origine… Le format dépend de la commande.',
      syntax: 'G10 L… P… X… Z…',
      modal: false,
    },
    G17: {
      category: 'mode', group: 'plane',
      name: 'Plan XY',
      description: 'Sélectionne le plan XY pour les arcs et la correction de rayon (fraisage).',
      modal: true,
    },
    G18: {
      category: 'mode', group: 'plane',
      name: 'Plan ZX',
      description: 'Sélectionne le plan ZX pour les arcs et la correction de rayon. C’est le plan par défaut en tournage.',
      modal: true,
    },
    G19: {
      category: 'mode', group: 'plane',
      name: 'Plan YZ',
      description: 'Sélectionne le plan YZ pour les arcs et la correction de rayon.',
      modal: true,
    },
    G20: {
      category: 'mode', group: 'units',
      name: 'Programmation en pouces',
      description: 'Les cotes et avances sont exprimées en pouces. À placer en début de programme, avant tout déplacement.',
      modal: true,
    },
    G21: {
      category: 'mode', group: 'units',
      name: 'Programmation en millimètres',
      description: 'Les cotes et avances sont exprimées en millimètres. À placer en début de programme, avant tout déplacement.',
      modal: true,
    },
    G52: {
      category: 'mode', group: 'nonModal',
      name: 'Système de coordonnées local',
      description: 'Décale temporairement l’origine pièce de la valeur programmée. G52 X0 Z0 annule le décalage.',
      syntax: 'G52 X… Z…',
      modal: false,
    },
    G53: {
      category: 'mode', group: 'nonModal',
      name: 'Déplacement en coordonnées machine',
      description: 'Les cotes du bloc sont exprimées par rapport à l’origine machine (et non à l’origine pièce). Déplacement en rapide, ce bloc seulement.',
      syntax: 'G53 X… Z…',
      modal: false,
    },
    G54: { category: 'mode', group: 'workOffset', name: 'Origine pièce 1', description: 'Active le décalage d’origine pièce n° 1 enregistré dans la commande.', modal: true },
    G55: { category: 'mode', group: 'workOffset', name: 'Origine pièce 2', description: 'Active le décalage d’origine pièce n° 2 enregistré dans la commande.', modal: true },
    G56: { category: 'mode', group: 'workOffset', name: 'Origine pièce 3', description: 'Active le décalage d’origine pièce n° 3 enregistré dans la commande.', modal: true },
    G57: { category: 'mode', group: 'workOffset', name: 'Origine pièce 4', description: 'Active le décalage d’origine pièce n° 4 enregistré dans la commande.', modal: true },
    G58: { category: 'mode', group: 'workOffset', name: 'Origine pièce 5', description: 'Active le décalage d’origine pièce n° 5 enregistré dans la commande.', modal: true },
    G59: { category: 'mode', group: 'workOffset', name: 'Origine pièce 6', description: 'Active le décalage d’origine pièce n° 6 enregistré dans la commande.', modal: true },
    G90: {
      category: 'mode', group: 'distance',
      name: 'Programmation absolue',
      description: 'Les cotes sont mesurées depuis l’origine pièce.',
      modal: true,
    },
    G91: {
      category: 'mode', group: 'distance',
      name: 'Programmation relative (incrémentale)',
      description: 'Les cotes sont mesurées depuis la position actuelle de l’outil.',
      modal: true,
    },
    G92: {
      category: 'mode', group: 'nonModal',
      name: 'Décalage d’origine programmé',
      description: 'La position actuelle de l’outil prend les coordonnées programmées (définition de l’origine par programme).',
      syntax: 'G92 X… Z…',
      modal: false,
    },
    G94: { category: 'mode', group: 'feedMode', name: 'Avance en mm/min', description: 'L’avance F est exprimée en millimètres par minute.', modal: true },
    G95: { category: 'mode', group: 'feedMode', name: 'Avance en mm/tr', description: 'L’avance F est exprimée en millimètres par tour de broche.', modal: true },
    G96: {
      category: 'mode', group: 'spindleMode',
      name: 'Vitesse de coupe constante',
      description:
        'S est une vitesse de coupe en m/min : la vitesse de rotation s’adapte au diamètre usiné pour garder la même vitesse de coupe.',
      syntax: 'G96 S… (m/min)',
      modal: true,
      params: { S: 'Vitesse de coupe (m/min)' },
      notes: ['Toujours limiter la vitesse de rotation maximale avant G96 : quand le diamètre tend vers zéro, la vitesse grimpe.'],
      example: 'G96 S220 M3',
    },
    G97: {
      category: 'mode', group: 'spindleMode',
      name: 'Vitesse de broche constante (tr/min)',
      description: 'S est une vitesse de rotation en tours par minute, indépendante du diamètre. Utilisé pour le filetage et le perçage au centre.',
      syntax: 'G97 S… (tr/min)',
      modal: true,
      params: { S: 'Vitesse de rotation (tr/min)' },
      example: 'G97 S1200 M3',
    },
    G98: { category: 'mode', group: 'returnMode', name: 'Retour au plan initial (cycles)', description: 'En fin de cycle de perçage, l’outil remonte au plan de départ.', modal: true },
    G99: { category: 'mode', group: 'returnMode', name: 'Retour au plan R (cycles)', description: 'En fin de cycle de perçage, l’outil remonte au plan R (dégagement court).', modal: true },

    // --- Outils et corrections --------------------------------------------------------------
    G40: {
      category: 'tool', group: 'cutterComp',
      name: 'Annulation de la correction de rayon',
      description: 'Désactive la correction de rayon d’outil (G41/G42). À programmer sur un déplacement de dégagement, avant un changement d’outil ou la fin du programme.',
      modal: true,
      example: 'G0 G40 X100. Z100.',
    },
    G41: {
      category: 'tool', group: 'cutterComp',
      name: 'Correction de rayon à gauche',
      description:
        'L’outil est décalé de son rayon à gauche du profil programmé (vu dans le sens du déplacement). Activée sur un déplacement linéaire d’approche (G0/G1).',
      modal: true,
      params: { D: 'Numéro du correcteur de rayon' },
      notes: ['Ne jamais activer ni annuler la correction sur un arc.'],
    },
    G42: {
      category: 'tool', group: 'cutterComp',
      name: 'Correction de rayon à droite',
      description:
        'L’outil est décalé de son rayon à droite du profil programmé (vu dans le sens du déplacement). Activée sur un déplacement linéaire d’approche (G0/G1).',
      modal: true,
      params: { D: 'Numéro du correcteur de rayon' },
      notes: ['Ne jamais activer ni annuler la correction sur un arc.'],
    },
    G43: {
      category: 'tool', group: 'lengthComp',
      name: 'Correction de longueur d’outil +',
      description: 'Ajoute la longueur d’outil enregistrée dans le correcteur H aux cotes en Z (fraisage).',
      syntax: 'G43 H… Z…',
      modal: true,
      params: { H: 'Numéro du correcteur de longueur' },
    },
    G44: {
      category: 'tool', group: 'lengthComp',
      name: 'Correction de longueur d’outil −',
      description: 'Soustrait la longueur d’outil enregistrée dans le correcteur H (rarement utilisé).',
      modal: true,
      params: { H: 'Numéro du correcteur de longueur' },
    },
    G49: { category: 'tool', group: 'lengthComp', name: 'Annulation de la correction de longueur', description: 'Désactive la correction de longueur d’outil (G43/G44).', modal: true },

    // --- Appels de macro / structure ---------------------------------------------------------
    G65: {
      category: 'program', group: 'nonModal',
      name: 'Appel de macro',
      description:
        'Appelle un programme macro en lui passant des arguments : chaque lettre devient une variable locale du programme appelé (A → #1, B → #2, C → #3, I → #4, J → #5, K → #6, D → #7…).',
      syntax: 'G65 P(n° programme) L(répétitions) A… B…',
      modal: false,
      params: { P: 'Numéro du programme macro appelé', L: 'Nombre de répétitions' },
      example: 'G65 P9010 A25. B3.',
    },
    G66: {
      category: 'program', group: 'macroModal',
      name: 'Appel modal de macro',
      description: 'La macro indiquée est appelée après chaque déplacement des blocs suivants, jusqu’à G67.',
      syntax: 'G66 P… A… B…',
      modal: true,
      params: { P: 'Numéro du programme macro appelé', L: 'Nombre de répétitions' },
    },
    G67: { category: 'program', group: 'macroModal', name: 'Annulation de l’appel modal de macro', description: 'Termine l’appel modal lancé par G66.', modal: true },

    // --- Cycles de perçage (fraisage / centre d'usinage) ----------------------------------------
    G80: { category: 'cycle', group: 'cycle', name: 'Annulation de cycle', description: 'Annule le cycle de perçage actif : les blocs suivants redeviennent de simples déplacements.', modal: true },
    G81: {
      category: 'cycle', group: 'cycle',
      name: 'Cycle de perçage',
      description: 'Perçage simple : approche en rapide au point R, perçage à l’avance F jusqu’à Z, remontée en rapide.',
      syntax: 'G81 X… Y… Z… R… F…',
      modal: true,
      params: DRILL_PARAMS,
    },
    G82: {
      category: 'cycle', group: 'cycle',
      name: 'Cycle de perçage avec temporisation',
      description: 'Comme G81, avec une temporisation P en fond de trou (lamage, chanfrein).',
      syntax: 'G82 X… Y… Z… R… P… F…',
      modal: true,
      params: { ...DRILL_PARAMS, P: 'Temporisation en fond de trou (ms)' },
    },
    G83: {
      category: 'cycle', group: 'cycle',
      name: 'Cycle de perçage avec débourrage',
      description: 'Perçage par passes successives de profondeur Q, avec remontée au point R entre chaque passe pour évacuer les copeaux.',
      syntax: 'G83 X… Y… Z… R… Q… F…',
      modal: true,
      params: { ...DRILL_PARAMS, Q: 'Profondeur de chaque passe' },
    },
    G84: {
      category: 'cycle', group: 'cycle',
      name: 'Cycle de taraudage',
      description: 'Taraudage : descente à l’avance F, inversion de la broche en fond de trou, remontée. L’avance doit correspondre exactement au pas.',
      syntax: 'G84 X… Y… Z… R… F…',
      modal: true,
      params: { ...DRILL_PARAMS, F: 'Avance = pas × vitesse de rotation (en mm/min)' },
    },
    G85: { category: 'cycle', group: 'cycle', name: 'Cycle d’alésage', description: 'Descente et remontée à l’avance travail.', syntax: 'G85 X… Y… Z… R… F…', modal: true, params: DRILL_PARAMS },
    G86: { category: 'cycle', group: 'cycle', name: 'Cycle d’alésage, arrêt broche', description: 'Descente à l’avance travail, arrêt de la broche en fond de trou, remontée en rapide.', modal: true, params: DRILL_PARAMS },
    G87: { category: 'cycle', group: 'cycle', name: 'Cycle d’alésage en tirant', description: 'Alésage en remontant (alésage arrière).', modal: true, params: DRILL_PARAMS },
    G88: { category: 'cycle', group: 'cycle', name: 'Cycle d’alésage, arrêt manuel', description: 'Arrêt en fond de trou, remontée en mode manuel.', modal: true, params: DRILL_PARAMS },
    G89: {
      category: 'cycle', group: 'cycle',
      name: 'Cycle d’alésage avec temporisation',
      description: 'Comme G85, avec une temporisation P en fond de trou.',
      modal: true,
      params: { ...DRILL_PARAMS, P: 'Temporisation en fond de trou (ms)' },
    },

    // --- Fonctions M ------------------------------------------------------------------------------
    M0: { category: 'mcode', name: 'Arrêt programmé', description: 'Arrête le programme (broche et arrosage arrêtés). Le cycle reprend avec le bouton de départ cycle.', modal: false },
    M1: { category: 'mcode', name: 'Arrêt optionnel', description: 'Comme M0, mais seulement si l’arrêt optionnel est activé sur le pupitre. Pratique pour contrôler une pièce.', modal: false },
    M2: { category: 'mcode', name: 'Fin de programme', description: 'Termine le programme. Sur certaines commandes, ne revient pas au début (préférer M30).', modal: false },
    M3: { category: 'mcode', name: 'Rotation broche sens horaire', description: 'Démarre la broche dans le sens horaire (vu depuis la broche) à la vitesse S.', modal: true, params: { S: 'Vitesse (tr/min ou m/min selon G97/G96)' } },
    M4: { category: 'mcode', name: 'Rotation broche sens anti-horaire', description: 'Démarre la broche dans le sens anti-horaire (vu depuis la broche) à la vitesse S.', modal: true, params: { S: 'Vitesse (tr/min ou m/min selon G97/G96)' } },
    M5: { category: 'mcode', name: 'Arrêt broche', description: 'Arrête la rotation de la broche.', modal: true },
    M6: { category: 'mcode', name: 'Changement d’outil', description: 'Change l’outil (centre d’usinage) : l’outil T présélectionné est monté dans la broche.', modal: false },
    M7: { category: 'mcode', name: 'Arrosage brouillard', description: 'Active la lubrification par brouillard (micro-pulvérisation).', modal: true },
    M8: { category: 'mcode', name: 'Arrosage', description: 'Active l’arrosage (liquide de coupe).', modal: true },
    M9: { category: 'mcode', name: 'Arrêt arrosage', description: 'Coupe l’arrosage.', modal: true },
    M19: { category: 'mcode', name: 'Orientation broche', description: 'Arrête la broche dans une position angulaire précise.', modal: false },
    M30: {
      category: 'mcode',
      name: 'Fin de programme et retour au début',
      description: 'Termine le programme, arrête broche et arrosage, réinitialise les modes et revient au début du programme (compteur de pièces incrémenté sur la plupart des machines).',
      modal: false,
    },
    M98: {
      category: 'program',
      name: 'Appel de sous-programme',
      description: 'Exécute le sous-programme indiqué par P, puis revient au bloc suivant. Le sous-programme se termine par M99.',
      syntax: 'M98 P(n° programme)',
      modal: false,
      params: { P: 'Numéro du sous-programme (et nombre de répétitions, selon la commande)', L: 'Nombre de répétitions' },
      example: 'M98 P1000',
    },
    M99: {
      category: 'program',
      name: 'Fin de sous-programme / retour',
      description: 'Dans un sous-programme : retour au programme appelant. Dans le programme principal : retour au début (boucle sans fin).',
      syntax: 'M99   ou   M99 P(n° bloc de retour)',
      modal: false,
      params: { P: 'Numéro de bloc N où reprendre dans le programme appelant' },
    },
  },

  /** Signification générale de chaque adresse (lettre), hors paramètres propres à un code. */
  addresses: {
    N: 'Numéro de bloc (repère pour les sauts, cycles et sous-programmes ; facultatif)',
    O: 'Numéro de programme',
    G: 'Fonction préparatoire (mode de déplacement, cycle, réglage…)',
    M: 'Fonction auxiliaire (broche, arrosage, fin de programme…)',
    T: 'Numéro d’outil',
    S: 'Vitesse de broche',
    F: 'Avance',
    X: 'Coordonnée en X',
    Y: 'Coordonnée en Y',
    Z: 'Coordonnée en Z',
    U: 'Coordonnée relative en X (ou axe parallèle à X)',
    V: 'Coordonnée relative en Y (ou axe parallèle à Y)',
    W: 'Coordonnée relative en Z (ou axe parallèle à Z)',
    A: 'Axe rotatif autour de X',
    B: 'Axe rotatif autour de Y',
    C: 'Axe rotatif autour de Z',
    I: 'Centre d’arc en X, relatif au point de départ',
    J: 'Centre d’arc en Y, relatif au point de départ',
    K: 'Centre d’arc en Z, relatif au point de départ',
    R: 'Rayon d’arc, ou point R des cycles',
    P: 'Paramètre : temporisation, numéro de programme ou de bloc, paramètre de cycle…',
    Q: 'Paramètre de cycle (profondeur de passe…)',
    D: 'Numéro du correcteur de rayon',
    H: 'Numéro du correcteur de longueur',
    E: 'Pas de filetage précis (pouces) sur certaines commandes',
    L: 'Nombre de répétitions',
    ',C': 'Chanfrein automatique à l’angle entre ce bloc et le suivant (longueur du chanfrein)',
    ',R': 'Congé automatique à l’angle entre ce bloc et le suivant (rayon)',
    ',A': 'Angle de la droite (programmation par angle)',
  },
};
