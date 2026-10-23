/**
 * Taillage de meule (rectification) : la meule, vue de dessus, est un rectangle ; le diamant
 * piloté par le programme l'usine comme une plaquette carbure usine une pièce. Fonctions pures.
 *
 * Repère de la meule (dessin) : z vers la droite, r en s'éloignant de la meule. À l'écran, vue en
 * miroir comme à la machine : meule au-dessus, diamant en dessous.
 *   z = 0 : flanc gauche de la meule, z = largeur : flanc droit ; r = 0 : périphérie de la
 *   meule, la meule est en dessous (r < 0).
 * Chaque diamant a son repère programme : origine (angle gauche, angle droit ou milieu) et sens de
 * Z+ propres (deux diamants en miroir : Z+ vers l'intérieur de la meule pour chacun), X+ commun.
 *
 * Diamants (orientation de la pointe) :
 *   straight   droit, face à la meule (taille la périphérie) ;
 *   leftFlank  incliné à 45° vers la droite : taille le flanc gauche, origine sur l'angle gauche ;
 *   rightFlank incliné à 45° vers la gauche : taille le flanc droit, origine sur l'angle droit.
 */

export const DIAMONDS = {
  straight: { label: 'Droit (face à la meule)', short: 'droit', angle: 0 },
  leftFlank: { label: '45° vers la droite — flanc gauche', short: 'flanc gauche', angle: 45, origin: 'left' },
  rightFlank: { label: '45° vers la gauche — flanc droit', short: 'flanc droit', angle: -45, origin: 'right' },
};

export const ORIGINS = {
  left: 'Angle gauche de la meule',
  center: 'Milieu de la périphérie',
  right: 'Angle droit de la meule',
};

/** Sens de Z+ de chaque diamant : 'right' (vers le flanc droit) ou 'left' (vers le flanc gauche). */
export const Z_DEFAULTS = { straight: 'right', leftFlank: 'right', rightFlank: 'left' };
export const WHEEL_DEFAULTS = { width: 40, xMode: 'diameter', straightOrigin: 'left', diamond: 'straight', invertX: false, zDirections: Z_DEFAULTS };
const number = (text) => Number(String(text).replace(',', '.'));

/** Diamant droit (pointe à 60°, corps vers le haut), tourné de `angle` degrés autour de la pointe. */
export function diamondShape(kind) {
  const base = [
    [0, 0],
    [1.2, 2],
    [1.2, 14],
    [-1.2, 14],
    [-1.2, 2],
  ];
  const a = ((DIAMONDS[kind]?.angle ?? 0) * Math.PI) / 180;
  // Rotation dans le sens trigonométrique (z, r) : +45° couche le corps vers la gauche.
  return base.map(([dz, dr]) => [dz * Math.cos(a) - dr * Math.sin(a), dz * Math.sin(a) + dr * Math.cos(a)]);
}

/** Programme de taillage de meule : commentaire « MEULE », « DIAMANT », « TAILLAGE ». */
export const isDressingProgram = (lineTexts) => [...lineTexts].some((text) => /\((?=[^)]*\b(?:MEULE|DIAMANT|TAILLAGE)\b)[^)]*\)/i.test(text));

/** Largeur de meule écrite dans un commentaire : « (MEULE L40) », « (MEULE 400 X 40) », « (MEULE LARGEUR 25) ». */
export function parseWheel(lineTexts) {
  const n = '(\\d+(?:[.,]\\d+)?)';
  for (const text of lineTexts) {
    const comment = /\(([^)]*\bMEULE\b[^)]*)\)/i.exec(text)?.[1]?.toUpperCase();
    if (!comment) continue;
    const width = new RegExp(`\\b(?:L|LARG(?:EUR)?\\.?)\\s*${n}`).exec(comment)?.[1] ?? new RegExp(`${n}\\s*(?:X|×)\\s*${n}`).exec(comment)?.[2];
    if (width) return { width: number(width) };
  }
  return null;
}

/**
 * Diamant indiqué sur la ligne de l'outil : « T0202 (DIAMANT FLANC GAUCHE) ». « Diamant gauche »,
 * « diamant à droite », « diamant droite » désignent un diamant de flanc ; « diamant droit » (au
 * masculin) le diamant droit, face à la meule.
 */
export function diamondFromComment(text) {
  const upper = String(text).toUpperCase();
  if (/FLANC\s+GAUCHE|DIAMANT\s+(?:[AÀ]\s+)?GAUCHE/.test(upper)) return 'leftFlank';
  if (/FLANC\s+DROIT|DIAMANT\s+(?:[AÀ]\s+DROITE?|DROITE)\b/.test(upper)) return 'rightFlank';
  if (/DIAMANT\s+DROIT\b|PERIPH/.test(upper)) return 'straight';
  return null;
}

/** Origine (z dans le repère de la meule) du diamant `kind`. */
export function originZ(kind, wheel) {
  const origin = DIAMONDS[kind]?.origin ?? wheel.straightOrigin;
  return origin === 'right' ? wheel.width : origin === 'center' ? wheel.width / 2 : 0;
}

/** Sens de Z+ du diamant `kind` dans le repère de la meule : 1 vers la droite, −1 vers la gauche. */
export const zSign = (kind, wheel) => ((wheel.zDirections?.[kind] ?? Z_DEFAULTS[kind]) === 'left' ? -1 : 1);

/**
 * Déplacements du programme ramenés dans le repère de la meule. Les points restent au format
 * de l'interpréteur ({ x « diamètre », z }) : x = 2 × écart radial à la périphérie.
 * diamondOf(outil, déplacement) → 'straight' | 'leftFlank' | 'rightFlank'.
 */
export function toWheelMoves(moves, wheel, diamondOf) {
  // Sens des axes selon la machine : X+ en s'éloignant de la meule (ou vers elle si inversé) ;
  // Z+ propre à chaque diamant (vers le flanc droit ou vers le flanc gauche).
  const sx = wheel.invertX ? -1 : 1;
  const radial = (x) => sx * (wheel.xMode === 'radius' ? x : x / 2);
  const frame = (diamond) => ({ dz: originZ(diamond, wheel), sz: zSign(diamond, wheel) });
  let previous = null;
  return moves.map((move) => {
    const diamond = diamondOf(move.tool ?? '', move);
    const current = frame(diamond);
    // Changement de diamant : la machine part de là où elle était, donc le point de départ se
    // calcule dans le repère (origine et sens de Z) du diamant précédent.
    const start = previous && previous !== diamond ? frame(previous) : current;
    previous = diamond;
    return {
      ...move,
      diamond,
      points: move.points.map((p, i) => {
        const { dz, sz } = i === 0 ? start : current;
        return { x: radial(p.x) * 2, z: sz * p.z + dz };
      }),
    };
  });
}

/**
 * Réglages de meule corrigés (largeur bornée, choix connus). Ancien réglage `invertZ` (un seul
 * sens de Z pour tous les diamants) : chaque sens par défaut est retourné.
 */
export function sanitizeWheel(raw) {
  const width = Number(raw?.width);
  const flip = (direction) => (direction === 'left' ? 'right' : 'left');
  return {
    width: Number.isFinite(width) && width > 0 ? Math.min(1000, width) : WHEEL_DEFAULTS.width,
    xMode: raw?.xMode === 'radius' ? 'radius' : 'diameter',
    straightOrigin: ORIGINS[raw?.straightOrigin] ? raw.straightOrigin : WHEEL_DEFAULTS.straightOrigin,
    diamond: DIAMONDS[raw?.diamond] ? raw.diamond : WHEEL_DEFAULTS.diamond,
    invertX: raw?.invertX === true,
    zDirections: Object.fromEntries(
      Object.keys(DIAMONDS).map((kind) => {
        const chosen = raw?.zDirections?.[kind];
        return [kind, chosen === 'left' || chosen === 'right' ? chosen : raw?.invertZ === true ? flip(Z_DEFAULTS[kind]) : Z_DEFAULTS[kind]];
      }),
    ),
  };
}
