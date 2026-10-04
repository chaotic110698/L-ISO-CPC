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
  threading: [
    [0, 0],
    [1.6, 2.8],
    [1.6, 8],
    [-1.6, 8],
    [-1.6, 2.8],
  ],
};

export const shapeFor = (move) => (['G32', 'G33', 'G76', 'G92thread'].includes(move.code) || move.thread ? TOOL_SHAPES.threading : TOOL_SHAPES.turning);

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
    if (stock.bore > 0) g.clearRect(0, (radius - stock.bore / 2) * res + 1, canvas.width, stock.bore * res);
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

  /** Vrai si la pointe traverse de la matière entre a et b (extrémités exclues sur 0,3 mm). */
  function hitsAlong(a, b) {
    const length = Math.hypot(b.z - a.z, b.r - a.r);
    const steps = Math.ceil(length * res);
    for (let i = 0; i <= steps; i++) {
      const d = (length * i) / Math.max(1, steps);
      if (d < 0.3 || d > length - 0.3) continue;
      const t = d / length;
      if (solidAt(a.z + (b.z - a.z) * t, Math.abs(a.r + (b.r - a.r) * t))) return true;
    }
    return false;
  }

  return { canvas, zMin, zMax, radius, res, reset, sweep, solidAt, hitsAlong };
}
