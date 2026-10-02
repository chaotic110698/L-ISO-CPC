/**
 * Schémas des leçons, dessinés en SVG (couleurs des thèmes via les variables CSS).
 *
 * Chaque schéma est une fonction ({ turret }) → chaîne SVG. `turret` : 'rear' (outil ou meule
 * derrière l'axe : X+ vers le haut sur le dessin) ou 'front' (devant : X+ vers le bas). Le
 * programme est identique dans les deux cas : seul le dessin est retourné.
 */

const SCALE = 8; // px par mm
const PAD = 10;
const Z_MIN = -36;
const Z_MAX = 8;
const R_MAX = 21;
const CHUCK_Z = -30;
const WIDTH = PAD * 2 + (Z_MAX - Z_MIN) * SCALE;
const HEIGHT = 30 + R_MAX * SCALE + 30;

/** Conversion coordonnées machine (Z, rayon) → écran. */
function frame(turret) {
  const front = turret === 'front';
  const axisY = front ? 30 : HEIGHT - 30;
  const sign = front ? 1 : -1; // sens écran de « r croissant »
  return {
    axisY,
    sign,
    x: (z) => PAD + (z - Z_MIN) * SCALE,
    y: (r) => axisY + sign * r * SCALE,
    /** Ordonnée d'un texte placé à `r`, décalé de `off` px vers l'extérieur (ligne de base corrigée). */
    ty: (r, off = 0) => axisY + sign * (r * SCALE + off) + 5,
    /** Drapeau de sens d'arc SVG pour G02 (cw) ou G03. */
    sweep: (cw) => (front ? (cw ? 0 : 1) : cw ? 1 : 0),
  };
}

const fmt = (n) => Math.round(n * 10) / 10;

function svg(content, label) {
  return `<svg class="course-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <marker id="fig-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker>
</defs>${content}</svg>`;
}

/** Mandrin, axe de broche et repère (flèches X+ et Z+), en haut à droite par défaut. */
function machineBase(f, { frameAt = [1.5, 17] } = {}) {
  const left = f.x(Z_MIN);
  const chuckRight = f.x(CHUCK_Z);
  const outer = f.y(R_MAX - 1);
  const top = Math.min(outer, f.axisY);
  const ox = f.x(frameAt[0]);
  const oy = f.y(frameAt[1]);
  return `
  <rect x="${fmt(left)}" y="${fmt(top)}" width="${fmt(chuckRight - left)}" height="${fmt(Math.abs(outer - f.axisY))}" class="fig-chuck"/>
  <text transform="translate(${fmt((left + chuckRight) / 2 + 5)} ${fmt(f.y(9))}) rotate(-90)" class="fig-small" text-anchor="middle">mandrin</text>
  <line x1="${fmt(left - 6)}" y1="${fmt(f.axisY)}" x2="${WIDTH}" y2="${fmt(f.axisY)}" class="fig-axis"/>
  <text x="${fmt(chuckRight + 4)}" y="${fmt(f.ty(0, -16))}" class="fig-small">axe de broche</text>
  <g class="fig-frame">
    <line x1="${fmt(ox)}" y1="${fmt(oy)}" x2="${fmt(ox + 40)}" y2="${fmt(oy)}" marker-end="url(#fig-arrow)"/>
    <line x1="${fmt(ox)}" y1="${fmt(oy)}" x2="${fmt(ox)}" y2="${fmt(oy + f.sign * 26)}" marker-end="url(#fig-arrow)"/>
    <text x="${fmt(ox + 22)}" y="${fmt(oy - f.sign * 8 + 5)}" text-anchor="middle">Z+</text>
    <text x="${fmt(ox + 8)}" y="${fmt(oy + f.sign * 22 + 5)}">X+</text>
  </g>`;
}

/** Outil (ou meule) au contact du rayon `r` en `z`, côté extérieur. */
function toolShape(f, z, r) {
  const x = f.x(z);
  const y = f.y(r);
  const s = f.sign;
  return `<path d="M${fmt(x)} ${fmt(y)} l10 ${fmt(s * 20)} h22 v${fmt(s * 12)} h-30 z" class="fig-tool"/>
  <text x="${fmt(x + 36)}" y="${fmt(y + s * 26 + 5)}" class="fig-small">outil</text>`;
}

/** Repère du tour : origine pièce, X au diamètre, Z vers l'extérieur du mandrin. */
export function repereTour({ turret }) {
  const f = frame(turret);
  const R = 12;
  const part = `<rect x="${fmt(f.x(CHUCK_Z))}" y="${fmt(Math.min(f.y(R), f.axisY))}" width="${fmt(-CHUCK_Z * SCALE)}" height="${fmt(R * SCALE)}" class="fig-part"/>`;
  const origin = `<circle cx="${fmt(f.x(0))}" cy="${fmt(f.axisY)}" r="5" class="fig-origin"/>
  <text x="${fmt(f.x(0) + 8)}" y="${fmt(f.ty(0, -16))}" class="fig-label">X0 Z0</text>`;
  const dim = `<line x1="${fmt(f.x(-21))}" y1="${fmt(f.axisY)}" x2="${fmt(f.x(-21))}" y2="${fmt(f.y(R))}" class="fig-dim" marker-start="url(#fig-arrow)" marker-end="url(#fig-arrow)"/>
  <text x="${fmt(f.x(-21) + 7)}" y="${fmt(f.ty(R / 2 + 1))}" class="fig-label">rayon 12</text>
  <text x="${fmt(f.x(-21) + 7)}" y="${fmt(f.ty(R / 2 - 1))}" class="fig-code">→ X24.</text>`;
  const minus = `<line x1="${fmt(f.x(-6))}" y1="${fmt(f.y(3))}" x2="${fmt(f.x(-14))}" y2="${fmt(f.y(3))}" class="fig-dim" marker-end="url(#fig-arrow)"/>
  <text x="${fmt(f.x(-5))}" y="${fmt(f.ty(3))}" class="fig-small">Z–</text>`;
  return svg(machineBase(f) + part + dim + minus + origin + toolShape(f, -9, R), `Repère du tour, outil ${turret === 'front' ? 'devant' : 'derrière'} l’axe`);
}

/** Chemin de profil : liste de segments { to: [z, r], arc?: { r, cw } } à partir de `start`. */
function profilePath(f, start, segments) {
  let d = `M${fmt(f.x(start[0]))} ${fmt(f.y(start[1]))}`;
  for (const seg of segments) {
    const [z, r] = seg.to;
    if (seg.arc) d += ` A${seg.arc.r * SCALE} ${seg.arc.r * SCALE} 0 0 ${f.sweep(seg.arc.cw)} ${fmt(f.x(z))} ${fmt(f.y(r))}`;
    else d += ` L${fmt(f.x(z))} ${fmt(f.y(r))}`;
  }
  return d;
}

/** Profil avec arrondi convexe (G03) et congé concave (G02), en tournant vers le mandrin. */
export function arcs({ turret }) {
  const f = frame(turret);
  const segments = [
    { to: [0, 8] },
    { to: [-2, 10], arc: { r: 2, cw: false }, label: 'G03 R2', at: [0.8, 10.4], anchor: 'start' },
    { to: [-15, 10] },
    { to: [-18, 13], arc: { r: 3, cw: true }, label: 'G02 R3', at: [-14.5, 12.2], anchor: 'start' },
    { to: [-18, 15] },
    { to: [CHUCK_Z, 15] },
  ];
  const outline = profilePath(f, [0, 0], segments) + ` L${fmt(f.x(CHUCK_Z))} ${fmt(f.axisY)} Z`;
  const toolPath = profilePath(f, [0, 8], segments.slice(1));
  const labels = segments
    .filter((s) => s.label)
    .map((s) => `<text x="${fmt(f.x(s.at[0]))}" y="${fmt(f.ty(s.at[1]))}" class="fig-code" text-anchor="${s.anchor}">${s.label}</text>`)
    .join('');
  return svg(
    machineBase(f) +
      `<path d="${outline}" class="fig-part"/>
  <path d="${toolPath}" class="fig-path" marker-end="url(#fig-arrow)"/>
  <circle cx="${fmt(f.x(0))}" cy="${fmt(f.y(8))}" r="4" class="fig-point"/>
  <text x="${fmt(f.x(0) + 8)}" y="${fmt(f.ty(8, -12))}" class="fig-small">départ</text>` +
      labels,
    `Arrondi G03 et congé G02, outil ${turret === 'front' ? 'devant' : 'derrière'} l’axe`,
  );
}

/** Points A → D avec coordonnées absolues et déplacements incrémentaux (système A). */
export function absoluIncremental({ turret }) {
  const f = frame(turret);
  const points = [
    { name: 'A', z: 0, r: 10 },
    { name: 'B', z: -15, r: 10 },
    { name: 'C', z: -15, r: 15 },
    { name: 'D', z: CHUCK_Z, r: 15 },
  ];
  const outline = `M${fmt(f.x(0))} ${fmt(f.axisY)} ` + points.map((p) => `L${fmt(f.x(p.z))} ${fmt(f.y(p.r))}`).join(' ') + ` L${fmt(f.x(CHUCK_Z))} ${fmt(f.axisY)} Z`;
  const path = `M${fmt(f.x(0))} ${fmt(f.y(10))} ` + points.slice(1).map((p) => `L${fmt(f.x(p.z))} ${fmt(f.y(p.r))}`).join(' ');
  const placement = [
    { dx: 8, off: 0, anchor: 'start' }, // A : à droite
    { dx: 0, off: -20, anchor: 'middle' }, // B : côté matière
    { dx: 0, off: 10, anchor: 'middle' }, // C : à l'extérieur
    { dx: 0, off: 10, anchor: 'middle' }, // D : à l'extérieur
  ];
  const marks = points
    .map((p, i) => {
      const { dx, off, anchor } = placement[i];
      return `<circle cx="${fmt(f.x(p.z))}" cy="${fmt(f.y(p.r))}" r="4" class="fig-point"/>
  <text x="${fmt(f.x(p.z) + dx)}" y="${fmt(f.ty(p.r, off))}" class="fig-label" text-anchor="${anchor}">${p.name}</text>`;
    })
    .join('');
  const moves = [
    { text: 'W-15.', x: f.x(-7.5), y: f.ty(10, 8), anchor: 'middle' },
    { text: 'U10.', x: f.x(-15) + 8, y: f.ty(12.5), anchor: 'start' },
    { text: 'W-15.', x: f.x(-22.5), y: f.ty(15, 8), anchor: 'middle' },
  ]
    .map((m) => `<text x="${fmt(m.x)}" y="${fmt(m.y)}" class="fig-code" text-anchor="${m.anchor}">${m.text}</text>`)
    .join('');
  return svg(
    machineBase(f) + `<path d="${outline}" class="fig-part"/><path d="${path}" class="fig-path" marker-end="url(#fig-arrow)"/>` + marks + moves,
    `Points A à D et déplacements incrémentaux, outil ${turret === 'front' ? 'devant' : 'derrière'} l’axe`,
  );
}

/**
 * Ébauche G71 : passes parallèles à Z (profondeur 2 mm au rayon) arrêtées sur le profil,
 * dans un brut Ø42. Profil de la leçon 9.
 */
export function g71({ turret }) {
  const f = frame(turret);
  const BRUT = 21;
  const profile = [
    [0, 12],
    [-2, 14],
    [-12, 14],
    [-18, 18],
    [-26, 18],
  ];
  // Z où le profil atteint le rayon r (premier point en partant de la face), ou fin du profil.
  const reach = (r) => {
    for (let i = 1; i < profile.length; i++) {
      const [z0, r0] = profile[i - 1];
      const [z1, r1] = profile[i];
      if (r1 >= r && r1 !== r0) return z0 + ((r - r0) / (r1 - r0)) * (z1 - z0);
      if (r0 >= r) return z0;
    }
    return profile.at(-1)[0];
  };
  const brut = `<rect x="${fmt(f.x(CHUCK_Z))}" y="${fmt(Math.min(f.y(BRUT), f.axisY))}" width="${fmt(-CHUCK_Z * SCALE)}" height="${fmt(BRUT * SCALE)}" class="fig-stock"/>`;
  const outline =
    `M${fmt(f.x(0))} ${fmt(f.axisY)} ` +
    profile.map(([z, r]) => `L${fmt(f.x(z))} ${fmt(f.y(r))}`).join(' ') +
    ` L${fmt(f.x(-26))} ${fmt(f.y(BRUT))} L${fmt(f.x(CHUCK_Z))} ${fmt(f.y(BRUT))} L${fmt(f.x(CHUCK_Z))} ${fmt(f.axisY)} Z`;
  const passes = [19, 17, 15, 13]
    .map((r) => `<line x1="${fmt(f.x(2))}" y1="${fmt(f.y(r))}" x2="${fmt(f.x(reach(r)))}" y2="${fmt(f.y(r))}" class="fig-pass" marker-end="url(#fig-arrow)"/>`)
    .join('');
  const finish = `<path d="M${profile.map(([z, r]) => `${fmt(f.x(z))} ${fmt(f.y(r))}`).join(' L')}" class="fig-path"/>`;
  return svg(
    machineBase(f, { frameAt: [2, 3] }) +
      brut +
      `<path d="${outline}" class="fig-part"/>` +
      passes +
      finish +
      `<circle cx="${fmt(f.x(2))}" cy="${fmt(f.y(BRUT + 1))}" r="4" class="fig-point"/>
  <text x="${fmt(f.x(2) + 8)}" y="${fmt(f.ty(BRUT + 1, 4))}" class="fig-small">départ X44. Z2.</text>
  <text x="${fmt(f.x(-4))}" y="${fmt(f.ty(BRUT, 6))}" class="fig-small" text-anchor="end">brut Ø42</text>
  <text x="${fmt(f.x(-6))}" y="${fmt(f.ty(9))}" class="fig-code">G70</text>`,
    `Passes d’ébauche G71 et contour de finition G70, outil ${turret === 'front' ? 'devant' : 'derrière'} l’axe`,
  );
}

export const FIGURES = {
  'repere-tour': repereTour,
  arcs,
  'absolu-incremental': absoluIncremental,
  g71,
};
