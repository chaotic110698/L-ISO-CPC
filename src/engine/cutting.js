/**
 * Formules de coupe (tournage, fraisage, rectification). Fonctions pures, sans DOM :
 * utilisées par les calculateurs, et plus tard par l'estimation du temps d'usinage.
 *
 * Conventions : diamètres en mm, vitesses de rotation en tr/min, avances par tour en mm/tr.
 */

/** Unités de vitesse (vitesse de coupe, vitesse périphérique, vitesse d'avance) → facteur vers mm/min. */
export const SPEED_UNITS = {
  'mm/min': 1,
  'mm/s': 60,
  'm/min': 1000,
  'm/s': 60000,
};

/** Convertit une vitesse d'une unité à une autre. */
export function convertSpeed(value, from, to) {
  return (value * SPEED_UNITS[from]) / SPEED_UNITS[to];
}

/** Vitesse de coupe (dans l'unité demandée) à partir du diamètre et de la vitesse de rotation. */
export function cuttingSpeed(diameter, rpm, unit = 'm/min') {
  return convertSpeed(Math.PI * diameter * rpm, 'mm/min', unit);
}

/** Vitesse de rotation (tr/min) donnant la vitesse de coupe `speed` (exprimée en `unit`) au diamètre donné. */
export function spindleSpeed(diameter, speed, unit = 'm/min') {
  return convertSpeed(speed, unit, 'mm/min') / (Math.PI * diameter);
}

/** Diamètre en dessous duquel la vitesse maximale (G50) est atteinte en vitesse de coupe constante. */
export function limitDiameter(speed, maxRpm, unit = 'm/min') {
  return convertSpeed(speed, unit, 'mm/min') / (Math.PI * maxRpm);
}

/** Vitesse d'avance (mm/min) : tournage f × N, fraisage fz × Z × N. */
export function feedRate(feedPerRev, rpm) {
  return feedPerRev * rpm;
}

/** Avance par tour (mm/tr) donnant la vitesse d'avance `rate` (mm/min). */
export function feedPerRevolution(rate, rpm) {
  return rate / rpm;
}

/**
 * Rugosité théorique en tournage (profil laissé par le rayon de bec), en µm :
 *   Rt = f² / (8 r)            hauteur crête-creux
 *   Ra ≈ f² / (18 √3 r)        rugosité moyenne arithmétique
 */
export function roughness(feed, noseRadius) {
  const ra = (1000 * feed * feed) / (18 * Math.sqrt(3) * noseRadius);
  const rt = (1000 * feed * feed) / (8 * noseRadius);
  return { ra, rt };
}

/** Avance maximale (mm/tr) pour obtenir la rugosité Ra (µm) avec le rayon de bec donné. */
export function feedForRoughness(ra, noseRadius) {
  return Math.sqrt((ra * 18 * Math.sqrt(3) * noseRadius) / 1000);
}

/**
 * Compensation du rayon de bec quand on programme la pointe théorique de l'outil sans G41/G42,
 * sur un cône ou un chanfrein faisant l'angle `angle` (degrés) avec l'axe Z :
 *   ΔZ = r × (1 − tan(α / 2))
 *   ΔX = 2 r × (1 − tan((90° − α) / 2))   (au diamètre)
 */
export function noseRadiusCompensation(noseRadius, angle) {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const dz = noseRadius * (1 - Math.tan(rad(angle) / 2));
  const dxRadius = noseRadius * (1 - Math.tan(rad(90 - angle) / 2));
  return { dz, dxRadius, dxDiameter: 2 * dxRadius };
}

/** Rapport de vitesses en rectification cylindrique : q = vitesse meule / vitesse pièce. */
export function grindingSpeedRatio(wheelSpeed, wheelUnit, workSpeed, workUnit) {
  return convertSpeed(wheelSpeed, wheelUnit, 'mm/min') / convertSpeed(workSpeed, workUnit, 'mm/min');
}
