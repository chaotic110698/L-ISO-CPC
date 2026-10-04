/**
 * Matière de la pièce, en pixels : le brut est dessiné dans un canvas hors écran, puis l'outil
 * balayé le long du trajet « efface » la matière qu'il traverse (vue en coupe, les deux moitiés
 * de la pièce, puisque la pièce tourne).
 *
 * Repère : z le long de l'axe, r = rayon (X/2), r > 0 du côté de l'outil.
 */

/**
 * Formes d'outil (mm, pointe en 0,0 ; r vers l'extérieur de la pièce). Polygones convexes :
 * le balayage d'un segment est l'enveloppe convexe de l'outil au départ et à l'arrivée.
 */
export const TOOL_SHAPES = {
  // Plaquette losange d'outil à charioter extérieur, pointe vers le mandrin et l'axe.
  turning: [
    [0, 0],
    [6, 0.6],
    [7.5, 6],
    [1.5, 5],
  ],
  // Outil à fileter : pointe à 60°.
  thread: [
    [0, 0],
    [1.6, 2.8],
    [1.6, 8],
    [-1.6, 8],
    [-1.6, 2.8],
  ],
  // Foret Ø8 dans l'axe (pointe à 118°), pour G74 sur X0.
  drill: [
    [0, 0],
    [2.4, 4],
    [40, 4],
    [40, -4],
    [2.4, -4],
  ],
  // Outil à gorge radiale (G75) : plaquette de 3 mm, pointe = coin côté mandrin.
  groove: [
    [0, 0],
    [3, 0],
    [3, 14],
    [0, 14],
  ],
  // Outil à gorge frontale (G74 hors de l'axe) : 3 mm de large en X.
  grooveFace: [
    [0, 0],
    [0, 3],
    [14, 3],
    [14, 0],
  ],
};

/**
 * Forme d'outil d'un déplacement : indiquée par le cycle, filetage G32 / G33, sinon outil à
 * charioter. side 'internal' (alésage) : plaquette retournée, vers l'axe.
 */
export function shapeFor(move, side = 'external') {
  const shape = TOOL_SHAPES[move.shape] ?? (['G32', 'G33'].includes(move.code) ? TOOL_SHAPES.thread : TOOL_SHAPES.turning);
  const flips = side === 'internal' && (shape === TOOL_SHAPES.turning || shape === TOOL_SHAPES.thread);
  return flips ? shape.map(([dz, dr]) => [dz, -dr]) : shape;
}

/** Enveloppe convexe (chaîne monotone) d'une liste de points [z, r]. */
export function convexHull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const point of p) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (const point of p.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Matière (canvas hors écran) pour un brut donné. res : pixels par millimètre. */
export function createMaterial(stock, { maxPixels = 2400, makeCanvas = () => document.createElement('canvas') } = {}) {
  const zMax = stock.face;
  const zMin = stock.face - stock.length;
  const radius = stock.diameter / 2;
  const res = Math.max(1, Math.min(24, maxPixels / Math.max(stock.length, stock.diameter)));
  const canvas = makeCanvas();
  canvas.width = Math.ceil(stock.length * res) + 2;
  canvas.height = Math.ceil(stock.diameter * res) + 2;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const px = (z, r) => [(z - zMin) * res + 1, (radius - r) * res + 1];

  function reset(color) {
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = color ?? '#8a94a3';
    g.fillRect(1, 1, stock.length * res, stock.diameter * res);
    if (stock.bore > 0) {
      const rb = stock.bore / 2;
      if (!(stock.boreDepth > 0)) {
        g.clearRect(0, (radius - rb) * res + 1, canvas.width, stock.bore * res); // tube : débouchant
      } else {
        // Pré-perçage borgne depuis la face, fond en pointe de foret (118°).
        const bottom = zMax - stock.boreDepth;
        const tip = bottom - rb / Math.tan((59 * Math.PI) / 180);
        g.globalCompositeOperation = 'destination-out';
        g.beginPath();
        for (const [z, r] of [[zMax + 1, rb], [bottom, rb], [tip, 0], [bottom, -rb], [zMax + 1, -rb]]) g.lineTo(...px(z, r));
        g.closePath();
        g.fill();
        g.globalCompositeOperation = 'source-over';
      }
    }
  }

  /** Efface la matière balayée par l'outil de a à b ({ z, r }), sur les deux moitiés. */
  function sweep(a, b, shape) {
    const hull = convexHull([...shape.map(([dz, dr]) => [a.z + dz, a.r + dr]), ...shape.map(([dz, dr]) => [b.z + dz, b.r + dr])]);
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    for (const sign of [1, -1]) {
      g.beginPath();
      hull.forEach(([z, r], i) => {
        const [x, y] = px(z, sign * r);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  /** Vrai s'il reste de la matière au point (z, r). */
  function solidAt(z, r) {
    const [x, y] = px(z, r);
    if (x < 1 || y < 1 || x >= canvas.width - 1 || y >= canvas.height - 1) return false;
    return g.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3] > 128;
  }

  /**
   * Vrai si la pointe traverse de la matière entre a et b (extrémités exclues sur 0,3 mm).
   * Seule une pénétration franche compte : le point et ses voisins à `tol` doivent être dans la
   * matière (une pointe qui longe une surface usinée n'est pas une collision).
   */
  function hitsAlong(a, b) {
    const tol = Math.max(0.2, 2 / res);
    const deep = (z, r) => solidAt(z, r) && solidAt(z + tol, r) && solidAt(z - tol, r) && solidAt(z, r + tol) && solidAt(z, r - tol);
    const length = Math.hypot(b.z - a.z, b.r - a.r);
    const steps = Math.ceil(length * res);
    for (let i = 0; i <= steps; i++) {
      const d = (length * i) / Math.max(1, steps);
      if (d < 0.3 || d > length - 0.3) continue;
      const t = d / length;
      if (deep(a.z + (b.z - a.z) * t, Math.abs(a.r + (b.r - a.r) * t))) return true;
    }
    return false;
  }

  return { canvas, zMin, zMax, radius, res, reset, sweep, solidAt, hitsAlong };
}

/**
 * Meule vue de dessus (taillage) : rectangle z ∈ [0, largeur], r ∈ [−profondeur, 0], usiné par
 * le diamant (sans symétrie : la vue n'est pas une coupe de pièce tournée). Même interface que
 * createMaterial ; `top` / `bottom` donnent l'étendue en r.
 */
export function createWheelMaterial(width, depth, { maxPixels = 2400, makeCanvas = () => document.createElement('canvas') } = {}) {
  const zMin = 0;
  const zMax = width;
  const res = Math.max(1, Math.min(40, maxPixels / Math.max(width, depth)));
  const canvas = makeCanvas();
  canvas.width = Math.ceil(width * res) + 2;
  canvas.height = Math.ceil(depth * res) + 2;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const px = (z, r) => [(z - zMin) * res + 1, -r * res + 1];

  function reset(color) {
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = color ?? '#8a94a3';
    g.fillRect(1, 1, width * res, depth * res);
  }

  function sweep(a, b, shape) {
    const hull = convexHull([...shape.map(([dz, dr]) => [a.z + dz, a.r + dr]), ...shape.map(([dz, dr]) => [b.z + dz, b.r + dr])]);
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    g.beginPath();
    hull.forEach(([z, r], i) => {
      const [x, y] = px(z, r);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }

  function solidAt(z, r) {
    const [x, y] = px(z, r);
    if (x < 1 || y < 1 || x >= canvas.width - 1 || y >= canvas.height - 1) return false;
    return g.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3] > 128;
  }

  function hitsAlong(a, b) {
    const tol = Math.max(0.05, 2 / res);
    const deep = (z, r) => solidAt(z, r) && solidAt(z + tol, r) && solidAt(z - tol, r) && solidAt(z, r + tol) && solidAt(z, r - tol);
    const length = Math.hypot(b.z - a.z, b.r - a.r);
    const steps = Math.ceil(length * res);
    for (let i = 0; i <= steps; i++) {
      const d = (length * i) / Math.max(1, steps);
      if (d < 0.1 || d > length - 0.1) continue;
      const t = d / length;
      if (deep(a.z + (b.z - a.z) * t, a.r + (b.r - a.r) * t)) return true;
    }
    return false;
  }

  return { canvas, zMin, zMax, top: 0, bottom: -depth, radius: 0, res, reset, sweep, solidAt, hitsAlong, wheel: true };
}
