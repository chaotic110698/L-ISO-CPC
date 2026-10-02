/**
 * Comparaison ligne à ligne (algorithme de Myers : plus courte suite de modifications).
 * Fonction pure.
 *
 * diffLines(a, b) → [ { type: 'equal' | 'delete' | 'insert', text, aLine?, bLine? } ]
 *   aLine / bLine : numéros de ligne (à partir de 1) dans chaque version.
 */
export function diffLines(aLines, bLines) {
  const a = [...aLines];
  const b = [...bLines];
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace = [];

  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) break outer;
    }
  }

  // Remontée du chemin.
  const ops = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1]) ? k + 1 : k - 1;
    const prevX = vd[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ type: 'equal', text: a[x - 1], aLine: x, bLine: y });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) ops.push({ type: 'insert', text: b[y - 1], bLine: y });
      else ops.push({ type: 'delete', text: a[x - 1], aLine: x });
    }
    x = prevX;
    y = prevY;
  }
  return ops.reverse();
}

/** Nombre de lignes ajoutées et supprimées. */
export function diffStats(ops) {
  return {
    added: ops.filter((op) => op.type === 'insert').length,
    removed: ops.filter((op) => op.type === 'delete').length,
  };
}

/**
 * Regroupe les différences en blocs avec `context` lignes identiques autour ; les longues
 * plages identiques sont résumées : { type: 'skip', count }.
 */
export function diffHunks(ops, context = 3) {
  const keep = new Array(ops.length).fill(false);
  ops.forEach((op, i) => {
    if (op.type === 'equal') return;
    for (let j = Math.max(0, i - context); j <= Math.min(ops.length - 1, i + context); j++) keep[j] = true;
  });
  const result = [];
  let skipped = 0;
  ops.forEach((op, i) => {
    if (keep[i]) {
      if (skipped) result.push({ type: 'skip', count: skipped });
      skipped = 0;
      result.push(op);
    } else skipped++;
  });
  if (skipped) result.push({ type: 'skip', count: skipped });
  return result;
}
