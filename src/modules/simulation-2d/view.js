import { shapeFor } from './material.js';

/**
 * Dessin de la simulation dans un <canvas> : pièce en coupe (matière restante), mandrin, axe,
 * trajet (rapides en pointillés, travail en trait plein), outil, origine pièce.
 * Zoom à deux doigts ou à la molette, déplacement au doigt / à la souris, double-tap : ajuster.
 *
 * Repère écran : Z vers la droite ; tourelle arrière : outil au-dessus de l'axe (X vers le haut),
 * tourelle avant : miroir (X vers le bas).
 */
export function createView(canvas, { onPick } = {}) {
  const g = canvas.getContext('2d');
  let scene = null; // { stock, material, moves, timeline, front }
  let progress = { index: -1, fraction: 0 };
  let showAll = true;
  let view = { scale: 4, ox: 0, oy: 0 }; // pixels CSS par mm, origine écran de (z=0, r=0)
  let colors = null;
  let fitted = false;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const readColors = () => ({
    bg: css('--surface-2') || '#f3f4f6',
    text: css('--text-muted') || '#666',
    axis: css('--text-muted') || '#888',
    stock: css('--sim-stock') || '#9aa5b4',
    chuck: css('--sim-chuck') || '#5b6573',
    rapid: css('--c-mcode') || '#d33',
    cut: css('--accent') || '#2563eb',
    future: css('--border') || '#ccc',
    tool: css('--c-tool') || '#b45309',
  });

  const sy = (r) => (scene?.front ? -r : r);
  const toScreen = (z, r) => [view.ox + z * view.scale, view.oy - sy(r) * view.scale];
  const toWorld = (x, y) => ({ z: (x - view.ox) / view.scale, r: sy((view.oy - y) / view.scale) });

  function size() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { width: rect.width, height: rect.height, dpr };
  }

  /** Cadre : le brut et les passes de travail, avec une marge. */
  function fit() {
    if (!scene) return;
    const { width, height } = size();
    const { stock } = scene;
    const cut = scene.moves.filter((m) => m.kind === 'cut').flatMap((m) => m.points);
    const zs = [stock.face + 4, stock.face - stock.length - 12, ...cut.map((p) => p.z)];
    const rs = [stock.diameter / 2 + 10, -(stock.diameter / 2 + 10), ...cut.map((p) => p.x / 2)];
    const zMin = Math.min(...zs);
    const zMax = Math.max(...zs) + 6;
    const rMin = Math.min(...rs);
    const rMax = Math.max(...rs) + 8;
    const margin = 16;
    view.scale = Math.max(0.05, Math.min((width - 2 * margin) / (zMax - zMin), (height - 2 * margin) / (rMax - rMin)));
    view.ox = margin + (width - 2 * margin - (zMax - zMin) * view.scale) / 2 - zMin * view.scale;
    const top = scene.front ? -rMin : rMax; // r affiché en haut de l'écran
    view.oy = margin + (height - 2 * margin - (rMax - rMin) * view.scale) / 2 + top * view.scale;
    fitted = true;
    draw();
  }

  function polyline(points) {
    g.beginPath();
    points.forEach((p, i) => {
      const [x, y] = toScreen(p.z, p.x / 2);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  }

  function draw() {
    if (!scene) return;
    const { width, height, dpr } = size();
    colors ??= readColors();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = colors.bg;
    g.fillRect(0, 0, width, height);
    const { stock, material, moves, timeline } = scene;
    const s = view.scale;

    // Mandrin : corps à gauche du brut et mors sur la longueur serrée.
    const zLeft = stock.face - stock.length;
    const R = stock.diameter / 2;
    g.fillStyle = colors.chuck;
    const jaw = Math.max(6, R * 0.35);
    for (const sign of [1, -1]) {
      const [x0, y0] = toScreen(zLeft - 25, sign * (R + jaw + 10));
      const [x1, y1] = toScreen(zLeft, 0);
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      if (stock.grip > 0) {
        const [a, b] = toScreen(zLeft, sign * R);
        const [c, d] = toScreen(zLeft + stock.grip, sign * (R + jaw));
        g.fillRect(Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b));
      }
    }

    // Matière restante (image du canvas hors écran).
    const [mx, my] = toScreen(material.zMin, scene.front ? -material.radius : material.radius);
    g.imageSmoothingEnabled = s * (1 / material.res) < 2;
    g.drawImage(material.canvas, 1, 1, material.canvas.width - 2, material.canvas.height - 2, mx, my, stock.length * s, stock.diameter * s);

    // Axe de la pièce (trait mixte) et origine programme.
    g.strokeStyle = colors.axis;
    g.lineWidth = 1;
    g.setLineDash([12, 4, 2, 4]);
    const [, ya] = toScreen(0, 0);
    g.beginPath();
    g.moveTo(0, ya);
    g.lineTo(width, ya);
    g.stroke();
    g.setLineDash([]);
    const [x0, y0] = toScreen(0, 0);
    g.beginPath();
    g.arc(x0, y0, 5, 0, Math.PI * 2);
    g.moveTo(x0 - 8, y0);
    g.lineTo(x0 + 8, y0);
    g.moveTo(x0, y0 - 8);
    g.lineTo(x0, y0 + 8);
    g.stroke();
    g.fillStyle = colors.text;
    g.font = '12px system-ui, sans-serif';
    g.fillText('X0 Z0', x0 + 8, y0 + (scene.front ? -8 : 16));

    // Trajet : à venir (pâle), déjà parcouru (couleurs), déplacement en cours jusqu'à l'outil.
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const done = progress.index;
    if (showAll) {
      g.strokeStyle = colors.future;
      g.lineWidth = 1;
      for (let i = Math.max(0, done); i < moves.length; i++) {
        g.setLineDash(moves[i].kind === 'rapid' ? [5, 4] : []);
        polyline(moves[i].points);
      }
    }
    for (let i = 0; i < done; i++) drawMove(moves[i], moves[i].points);
    let toolAt = null;
    if (done >= 0) {
      const points = timeline.partial(done, progress.fraction);
      drawMove(moves[done], points);
      toolAt = { at: points.at(-1), move: moves[done] };
    }
    g.setLineDash([]);
    if (toolAt) drawTool(toolAt.at, toolAt.move);
  }

  function drawMove(move, points) {
    g.strokeStyle = move.kind === 'rapid' ? colors.rapid : colors.cut;
    g.lineWidth = move.kind === 'rapid' ? 1.2 : 1.8;
    g.setLineDash(move.kind === 'rapid' ? [6, 4] : []);
    polyline(points);
  }

  function drawTool(at, move) {
    const shape = shapeFor(move);
    const r = at.x / 2;
    g.fillStyle = colors.tool;
    g.strokeStyle = '#0008';
    g.lineWidth = 1;
    g.beginPath();
    shape.forEach(([dz, dr], i) => {
      const [x, y] = toScreen(at.z + dz, r + dr);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.closePath();
    g.fill();
    g.stroke();
    // Porte-outil, vers l'extérieur.
    const [hx0, hy0] = toScreen(at.z + 1.5, r + 5);
    const [hx1, hy1] = toScreen(at.z + 7.5, r + 22);
    g.fillStyle = '#6b7280';
    g.fillRect(Math.min(hx0, hx1), Math.min(hy0, hy1), Math.abs(hx1 - hx0), Math.abs(hy1 - hy0));
  }

  // --- Interactions : déplacement, zoom (molette, deux doigts), choix d'un point, ajuster ---
  const pointers = new Map();
  let pinch = null;
  let dragged = false;
  let lastTap = 0;

  function zoomAt(x, y, factor) {
    const next = Math.max(0.05, Math.min(400, view.scale * factor));
    const k = next / view.scale;
    view.ox = x - (x - view.ox) * k;
    view.oy = y - (y - view.oy) * k;
    view.scale = next;
    draw();
  }
  const local = (event) => {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const [x, y] = local(event);
    zoomAt(x, y, Math.exp(-event.deltaY * 0.0015));
  }, { passive: false });

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, local(event));
    dragged = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a[0] - b[0], a[1] - b[1]), center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const previous = pointers.get(event.pointerId);
    const now = local(event);
    pointers.set(event.pointerId, now);
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      view.ox += center[0] - pinch.center[0];
      view.oy += center[1] - pinch.center[1];
      zoomAt(center[0], center[1], distance / pinch.distance);
      pinch = { distance, center };
      dragged = true;
    } else if (pointers.size === 1) {
      const dx = now[0] - previous[0];
      const dy = now[1] - previous[1];
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        if (dragged || Math.hypot(dx, dy) > 3) dragged = true;
        view.ox += dx;
        view.oy += dy;
        draw();
      }
    }
  });
  const release = (event) => {
    const was = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!was || dragged || pointers.size) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      fit(); // double-tap / double-clic : ajuster
      lastTap = 0;
      return;
    }
    lastTap = now;
    pick(...was);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', (event) => {
    pointers.delete(event.pointerId);
    pinch = null;
  });

  /** Tap sur le dessin : déplacement le plus proche (à moins de 14 px). */
  function pick(x, y) {
    if (!scene || !onPick) return;
    let best = { index: -1, distance: 14 };
    scene.moves.forEach((move, index) => {
      for (let i = 1; i < move.points.length; i++) {
        const [ax, ay] = toScreen(move.points[i - 1].z, move.points[i - 1].x / 2);
        const [bx, by] = toScreen(move.points[i].z, move.points[i].x / 2);
        const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
        const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2)) : 0;
        const d = Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
        if (d < best.distance) best = { index, distance: d };
      }
    });
    if (best.index >= 0) onPick(best.index);
  }

  new ResizeObserver(() => (fitted ? draw() : fit())).observe(canvas);

  return {
    setScene(next, { keepView = false } = {}) {
      scene = next;
      colors = null;
      if (!keepView || !fitted) fit();
      else draw();
    },
    setProgress(next) {
      progress = next;
      draw();
    },
    setShowAll(value) {
      showAll = value;
      draw();
    },
    refreshColors() {
      colors = null;
      draw();
    },
    fit,
    draw,
    toWorld,
  };
}
