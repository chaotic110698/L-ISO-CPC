/**
 * Brut de la simulation (fonctions pures) : la barre de départ, avant usinage.
 *
 * { diameter, length, face, bore, grip }
 *   diameter : diamètre extérieur du brut (mm) ; length : longueur hors mandrin comprise (mm) ;
 *   face : Z de la face avant du brut (0 si la face est déjà dressée, 1 pour 1 mm de surépaisseur) ;
 *   bore : diamètre d'un alésage déjà présent (tube), 0 pour une barre pleine ;
 *   grip : longueur serrée dans les mors du mandrin (mm).
 */

export const STOCK_LIMITS = { diameter: [1, 2000], length: [1, 5000], face: [-50, 50], bore: [0, 1990], grip: [0, 500] };

const number = (text) => Number(String(text).replace(',', '.'));

/**
 * Brut écrit dans un commentaire du programme : « (BRUT D50 X 80) », « (BRUT Ø50 L80) »,
 * « (BRUT DIA 50 X 120 - ACIER) », « (BRUT TUBE D60 D30 X 100) »… null si aucun.
 */
export function parseStock(lineTexts) {
  for (const text of lineTexts) {
    const comment = /\(([^)]*\bBRUT\b[^)]*)\)/i.exec(text)?.[1];
    if (!comment) continue;
    const body = comment.replace(/^.*?\bBRUT\b\s*[:=]?/i, ' ').toUpperCase();
    const n = '(\\d+(?:[.,]\\d+)?)';
    const diameters = [...body.matchAll(new RegExp(`(?:Ø|D(?:IA\\.?)?)\\s*${n}`, 'g'))].map((m) => number(m[1]));
    const length = new RegExp(`(?:\\bX|×|\\*|\\bL(?:G|ONG\\.?)?)\\s*${n}`).exec(body)?.[1];
    // Forme courte « BRUT 50 X 80 » : premier nombre = diamètre.
    const plain = new RegExp(`^\\s*${n}\\s*(?:X|×|\\*)`).exec(body)?.[1];
    const diameter = diameters[0] ?? (plain ? number(plain) : undefined);
    if (!diameter || !length) continue;
    const bore = diameters.length > 1 ? Math.min(...diameters.slice(1)) : 0;
    return { diameter, length: number(length), face: 0, bore: bore < diameter ? bore : 0, grip: Math.min(20, number(length) / 4) };
  }
  return null;
}

/** Brut déduit du trajet quand le programme n'en indique pas : enveloppe des passes de travail. */
export function guessStock(moves) {
  const cuts = moves.filter((m) => m.kind === 'cut').flatMap((m) => m.points);
  if (!cuts.length) return { diameter: 50, length: 80, face: 0, bore: 0, grip: 20 };
  const maxX = Math.max(...cuts.map((p) => Math.abs(p.x)));
  const minZ = Math.min(...cuts.map((p) => p.z));
  const maxZ = Math.max(0, ...cuts.map((p) => p.z));
  const diameter = Math.ceil((maxX + 2) / 5) * 5;
  const length = Math.ceil((maxZ - minZ + 15) / 5) * 5;
  return { diameter, length, face: Math.min(Math.max(0, ...cuts.map((p) => p.z)), 2) > 0 ? 1 : 0, bore: 0, grip: Math.min(20, length / 4) };
}

/** Brut corrigé dans les limites admises. */
export function sanitizeStock(raw, fallback) {
  const out = {};
  for (const [key, [min, max]] of Object.entries(STOCK_LIMITS)) {
    const value = Number(raw?.[key]);
    out[key] = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback[key];
  }
  if (out.bore >= out.diameter) out.bore = 0;
  if (out.grip >= out.length) out.grip = Math.max(0, out.length - 1);
  return out;
}
