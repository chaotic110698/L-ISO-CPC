import { moveMinutes } from '../../engine/index.js';

/**
 * Chronologie d'une simulation (fonctions pures) : durée de chaque déplacement, temps de
 * début, et position de l'outil à un instant donné.
 */
export function createTimeline(moves, options) {
  const durations = moves.map((move) => moveMinutes(move, options));
  const starts = [];
  let total = 0;
  for (const d of durations) {
    starts.push(total);
    total += d;
  }
  // Longueurs cumulées de chaque déplacement (au rayon), pour avancer le long des segments.
  const lengths = moves.map((move) => {
    const acc = [0];
    for (let i = 1; i < move.points.length; i++) {
      const a = move.points[i - 1];
      const b = move.points[i];
      acc.push(acc[i - 1] + Math.hypot((b.x - a.x) / 2, b.z - a.z));
    }
    return acc;
  });

  /** Déplacement en cours à l'instant t (minutes) : { index, fraction } ; fin : dernier, 1. */
  function locate(t) {
    if (!moves.length) return { index: -1, fraction: 0 };
    if (t >= total) return { index: moves.length - 1, fraction: 1 };
    let lo = 0;
    let hi = moves.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    // Déplacements sans durée (F absente) : passés d'un coup.
    const fraction = durations[lo] > 0 ? Math.min(1, (t - starts[lo]) / durations[lo]) : 1;
    return { index: lo, fraction };
  }

  /**
   * Points du déplacement `index` parcourus jusqu'à `fraction` (le dernier point est la position
   * de l'outil), à partir de la fraction `from`.
   */
  function partial(index, fraction, from = 0) {
    const move = moves[index];
    const acc = lengths[index];
    const total = acc.at(-1);
    const at = (f) => {
      if (total === 0) return { ...move.points.at(-1) };
      const d = f * total;
      let i = 1;
      while (i < acc.length - 1 && acc[i] < d) i++;
      const span = acc[i] - acc[i - 1];
      const t = span > 0 ? (d - acc[i - 1]) / span : 1;
      const a = move.points[i - 1];
      const b = move.points[i];
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, segment: i };
    };
    const start = at(from);
    const end = at(fraction);
    const inner = move.points.slice((start.segment ?? 1), end.segment ?? move.points.length);
    return [start, ...inner, end].map(({ x, z }) => ({ x, z }));
  }

  /** Instant de début du premier déplacement de la ligne `line` (ou de la suivante qui en a). */
  function timeOfLine(line) {
    const index = moves.findIndex((m) => m.line >= line);
    return index < 0 ? total : starts[index];
  }

  return { durations, starts, total, locate, partial, timeOfLine };
}

/** Durée lisible : « 42 s », « 3 min 05 s », « 1 h 02 min ». */
export function formatDuration(minutes) {
  const seconds = Math.round(minutes * 60);
  if (seconds < 60) return `${seconds} s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s).padStart(2, '0')} s`;
}
