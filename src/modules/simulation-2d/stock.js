/**
 * Brut de la simulation (fonctions pures) : la barre de départ, avant usinage.
 *
 * { diameter, length, face, bore, boreDepth, grip }
 *   diameter : diamètre extérieur du brut (mm) ; length : longueur hors mandrin comprise (mm) ;
 *   face : Z de la face avant du brut (0 si la face est déjà dressée, 1 pour 1 mm de surépaisseur) ;
 *   bore : diamètre intérieur déjà présent (pré-perçage ou tube), 0 pour une barre pleine ;
 *   boreDepth : profondeur du pré-perçage depuis la face (0 : débouchant, comme un tube) ;
 *   grip : longueur serrée dans les mors du mandrin (mm).
 */

export const STOCK_LIMITS = { diameter: [1, 2000], length: [1, 5000], face: [-50, 50], bore: [0, 1990], boreDepth: [0, 5000], grip: [0, 500] };

const number = (text) => Number(String(text).replace(',', '.'));

const N = '(\\d+(?:[.,]\\d+)?)';
const DIAMETER = new RegExp(`(?:Ø|D(?:IA\\.?)?)\\s*${N}`, 'g');
const DEPTH = new RegExp(`\\b(?:P(?:ROF(?:ONDEUR)?\\.?)?|L)\\s*${N}`);
const PREDRILL = /PR[EÉ]-?\s*PER[CÇ]|\bPER[CÇ]|AL[EÉ]SAGE/i; // tube : 2e diamètre du brut

/** Pré-perçage écrit dans un commentaire : « PERCE D20 P30 », « (PRE-PERCAGE Ø18 PROF 25) ». */
function parsePredrill(text) {
  const at = text.search(PREDRILL);
  if (at < 0) return null;
  const part = text.slice(at).toUpperCase();
  const bore = [...part.matchAll(DIAMETER)].map((m) => number(m[1]))[0];
  if (!bore) return null;
  const depth = DEPTH.exec(part.slice(part.search(DIAMETER) + 1))?.[1];
  return { bore, boreDepth: depth ? number(depth) : 0 };
}

/**
 * Brut écrit dans un commentaire du programme : « (BRUT D50 X 80) », « (BRUT Ø50 L80) »,
 * « (BRUT DIA 50 X 120 - ACIER) », « (BRUT TUBE D60 D30 X 100) » ; pré-perçage dans le même
 * commentaire ou un autre : « (BRUT D50 X 80 PERCE D20 P30) », « (PRE-PERCAGE Ø20 PROF 30) ».
 * null si aucun.
 */
export function parseStock(lineTexts) {
  const lines = [...lineTexts];
  const comments = lines.flatMap((text) => [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]));
  for (const comment of comments) {
    if (!/\bBRUT\b/i.test(comment)) continue;
    const body = comment.replace(/^.*?\bBRUT\b\s*[:=]?/i, ' ').toUpperCase();
    const n = '(\\d+(?:[.,]\\d+)?)';
    const diameters = [...body.matchAll(new RegExp(`(?:Ø|D(?:IA\\.?)?)\\s*${n}`, 'g'))].map((m) => number(m[1]));
    const length = new RegExp(`(?:\\bX|×|\\*|\\bL(?:G|ONG\\.?)?)\\s*${n}`).exec(body)?.[1];
    // Forme courte « BRUT 50 X 80 » : premier nombre = diamètre.
    const plain = new RegExp(`^\\s*${n}\\s*(?:X|×|\\*)`).exec(body)?.[1];
    const diameter = diameters[0] ?? (plain ? number(plain) : undefined);
    if (!diameter || !length) continue;
    const total = number(length);
    // Pré-perçage : dans ce commentaire (« PERCE D20 P30 »), dans un autre, ou 2e diamètre (tube).
    const drill = parsePredrill(body) ?? comments.map(parsePredrill).find(Boolean);
    const second = diameters.length > 1 ? Math.min(...diameters.slice(1)) : 0;
    const bore = drill?.bore ?? second;
    const boreDepth = drill?.boreDepth ?? 0;
    return { diameter, length: total, face: 0, bore: bore < diameter ? bore : 0, boreDepth: boreDepth < total ? boreDepth : 0, grip: Math.min(20, total / 4) };
  }
  return null;
}

/** Brut déduit du trajet quand le programme n'en indique pas : enveloppe des passes de travail. */
export function guessStock(moves) {
  const cuts = moves.filter((m) => m.kind === 'cut').flatMap((m) => m.points);
  if (!cuts.length) return { diameter: 50, length: 80, face: 0, bore: 0, boreDepth: 0, grip: 20 };
  const maxX = Math.max(...cuts.map((p) => Math.abs(p.x)));
  const minZ = Math.min(...cuts.map((p) => p.z));
  const maxZ = Math.max(0, ...cuts.map((p) => p.z));
  const diameter = Math.ceil((maxX + 2) / 5) * 5;
  const length = Math.ceil((maxZ - minZ + 15) / 5) * 5;
  return { diameter, length, face: Math.min(Math.max(0, ...cuts.map((p) => p.z)), 2) > 0 ? 1 : 0, bore: 0, boreDepth: 0, grip: Math.min(20, length / 4) };
}

/** Brut corrigé dans les limites admises. */
export function sanitizeStock(raw, fallback) {
  const out = {};
  for (const [key, [min, max]] of Object.entries(STOCK_LIMITS)) {
    const value = Number(raw?.[key]);
    out[key] = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback[key];
  }
  if (out.bore >= out.diameter) out.bore = 0;
  if (out.boreDepth >= out.length) out.boreDepth = 0;
  if (out.grip >= out.length) out.grip = Math.max(0, out.length - 1);
  return out;
}
