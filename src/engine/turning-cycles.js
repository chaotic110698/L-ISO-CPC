/**
 * Cycles de tournage FANUC développés en passes élémentaires pour la simulation. Fonctions
 * pures, appelées par l'interpréteur (toolpath.js) avec un contexte `c` :
 *
 *   c.start      position au début du cycle (point A), { x (diamètre), z }
 *   c.feed       avance du cycle (F du bloc, sinon F modale)
 *   c.params     paramètres de la 1re ligne du cycle (G71 U… R…, G76 P… Q… R…) mémorisés
 *   c.value(L)   valeur de l'adresse L ; c.micro(L) : valeur en µm si écrite sans point (P, Q)
 *   c.target()   point X/Z (ou U/W) du bloc ; c.profile() : points du profil P…Q (dès A)
 *   c.rapid(p, extra) · c.cut(p, extra)   déplacements (points en diamètre)
 *   c.warn(message)
 *
 * Géométrie au rayon (r = x / 2). Les cycles respectent l'ordre des passes de la commande ;
 * les détails propres à chaque machine (paramètres de dégagement par défaut…) sont approchés.
 */

const EPS = 1e-6;
const toR = (p) => ({ r: p.x / 2, z: p.z });
const toX = (p) => ({ x: p.r * 2, z: p.z });
const sign = (v) => (v > EPS ? 1 : v < -EPS ? -1 : 0);

/**
 * Ébauche par passes parallèles (G71 : passes le long de Z, prises de passe en X ; G72 : passes
 * le long de X, prises de passe en Z). Repère de travail : d = axe des prises de passe,
 * c = axe de coupe. Le profil (décalé des surépaisseurs) est supposé monotone (type I).
 */
function roughing(c, { depthAxis }) {
  const swap = depthAxis === 'z';
  const toDC = (p) => (swap ? { d: p.z, c: p.r } : { d: p.r, c: p.z });
  const fromDC = (d, cc) => toX(swap ? { z: d, r: cc } : { r: d, z: cc });

  const depth = Math.abs(c.params.depth ?? 0) || 1;
  const retract = Math.abs(c.params.retract ?? 0.5);
  if (c.params.depth == null) c.warn(`Profondeur de passe non programmée (1re ligne ${c.code} absente) : 1 mm supposé.`);
  const allowX = (c.value('U') ?? 0) / 2;
  const allowZ = c.value('W') ?? 0;

  const traced = c.profile().map(toR);
  if (traced.length < 3) return c.warn(`${c.code} : profil P…Q trop court.`);
  const A = toDC(toR(c.start));
  // Profil sans le point A, décalé des surépaisseurs de finition.
  const profile = traced.slice(1).map((p) => toDC({ r: p.r + allowX, z: p.z + allowZ }));
  const ds = profile.map((p) => p.d);
  // Sens des prises de passe : vers le profil (extérieur : vers l'axe ; intérieur : vers l'extérieur).
  const s = sign(ds.reduce((a, b) => a + b, 0) / ds.length - A.d) || -1;
  const bottom = s < 0 ? Math.min(...ds) : Math.max(...ds);
  const cEnd = profile.at(-1).c;
  const dirC = sign(cEnd - A.c) || -1;

  /** Limite de coupe au niveau `level` : premier point où le profil dépasse le niveau. */
  function stopAt(level) {
    const allowed = (p) => s * (p.d - level) > EPS; // profil au-delà du niveau : on peut couper
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1];
      const b = profile[i];
      if (allowed(a) && !allowed(b)) {
        const t = Math.abs(b.d - a.d) < EPS ? 0 : (level - a.d) / (b.d - a.d);
        return a.c + (b.c - a.c) * Math.min(1, Math.max(0, t));
      }
    }
    return cEnd;
  }

  let level = A.d;
  let passes = 0;
  for (;;) {
    level += s * depth;
    if (s * (bottom - level) <= EPS || ++passes > 500) break; // niveau au-delà du fond du profil
    const cStop = stopAt(level);
    if (dirC * (cStop - A.c) <= EPS) continue; // rien à couper à ce niveau
    c.rapid(fromDC(level, A.c));
    c.cut(fromDC(level, cStop));
    c.cut(fromDC(level - s * retract, cStop - dirC * retract)); // dégagement à 45°
    c.rapid(fromDC(level - s * retract, A.c));
  }
  // Passe de demi-finition le long du profil décalé, puis retour au point A.
  c.rapid(fromDC(profile[0].d, profile[0].c));
  for (const p of profile.slice(1)) c.cut(fromDC(p.d, p.c));
  const last = profile.at(-1);
  c.rapid(fromDC(A.d, last.c));
  c.rapid(c.start);
}

/** G73 : répétition de forme — le profil est parcouru `count` fois, de plus en plus près. */
function patternRepeat(c) {
  const reliefX = c.params.reliefX ?? 0; // Δi (au rayon)
  const reliefZ = c.params.reliefZ ?? 0;
  const count = Math.max(1, Math.round(c.params.count ?? 1));
  const allowX = (c.value('U') ?? 0) / 2;
  const allowZ = c.value('W') ?? 0;
  const profile = c.profile().map(toR).slice(1);
  if (profile.length < 2) return c.warn('G73 : profil P…Q trop court.');
  for (let m = 1; m <= count; m++) {
    const k = count > 1 ? (count - m) / (count - 1) : 0;
    const dr = reliefX * k + allowX;
    const dz = reliefZ * k + allowZ;
    c.rapid(toX({ r: profile[0].r + dr, z: profile[0].z + dz }));
    for (const p of profile.slice(1)) c.cut(toX({ r: p.r + dr, z: p.z + dz }));
    c.rapid(c.start);
  }
}

/** Cycles simples d'un bloc : chariotage (G90 / G77), filetage (G92 / G78), dressage (G94 / G79). */
function simpleCycle(c, kind) {
  const to = c.target();
  if (!to) return c.warn(`${c.code} sans point X / Z : cycle ignoré.`);
  const A = c.start;
  const taper = c.value('R') ?? 0;
  const thread = kind === 'thread' ? { shape: 'thread', feed: c.feed } : {};
  if (kind === 'face') {
    // Dressage : Z en rapide, X en travail (cône par R en Z), retour Z en travail, X en rapide.
    c.rapid({ x: A.x, z: to.z + taper });
    c.cut({ x: to.x, z: to.z });
    c.cut({ x: to.x, z: A.z });
    c.rapid(A);
    return;
  }
  // Chariotage / filetage : X en rapide (cône : départ décalé de R au rayon), Z en travail,
  // remontée en X (travail pour G90, rapide pour le filetage), retour Z en rapide.
  c.rapid({ x: to.x + 2 * taper, z: A.z });
  c.cut({ x: to.x, z: to.z }, thread);
  if (kind === 'thread') c.rapid({ x: A.x, z: to.z });
  else c.cut({ x: A.x, z: to.z });
  c.rapid(A);
}

/**
 * G76 : filetage multipasses. 1re ligne : P m r a (finitions, chanfrein, angle), Q Δdmin (µm),
 * R d (surépaisseur de finition). 2e ligne : X Z R(i) P(k hauteur, µm) Q(Δd 1re passe, µm) F.
 * Passes à section de copeau constante (profondeur Δd·√n), pénétration le long du flanc.
 */
function threading(c) {
  const to = c.target();
  if (!to) return c.warn('G76 sans point X / Z : cycle ignoré.');
  const A = c.start;
  const height = c.micro('P'); // k
  const first = c.micro('Q'); // Δd
  if (!(height > 0) || !(first > 0)) return c.warn('G76 : hauteur de filet (P) ou première passe (Q) manquante.');
  const finishes = Math.max(1, c.params.finishes ?? 1);
  const angle = c.params.angle ?? 60;
  const minDepth = c.params.minDepth ?? 0;
  const allowance = c.params.allowance ?? 0;
  const taper = c.value('R') ?? 0;
  const out = sign(A.x - to.x) || 1; // +1 : filetage extérieur
  const flank = Math.tan(((angle / 2) * Math.PI) / 180);
  const extra = { shape: 'thread', feed: c.feed };

  const depths = [];
  let previous = 0;
  for (let n = 1; n < 400; n++) {
    let dn = first * Math.sqrt(n);
    if (dn - previous < minDepth) dn = previous + minDepth;
    if (dn >= height - allowance - EPS) break;
    depths.push(dn);
    previous = dn;
  }
  depths.push(height - allowance);
  for (let i = 0; i < finishes; i++) depths.push(height);

  for (const dn of depths) {
    const x = to.x + out * 2 * (height - dn); // diamètre de la passe (fond du filet en fin)
    const shift = dn * flank * (sign(to.z - A.z) || -1); // pénétration le long du flanc
    c.rapid({ x: x + 2 * taper, z: A.z + shift });
    c.cut({ x, z: to.z + shift }, extra);
    c.rapid({ x: A.x, z: to.z + shift });
    c.rapid(A);
  }
}

/**
 * G74 (perçage / gorge frontale, débourrage en Z) et G75 (gorge radiale, débourrage en X).
 * 1re ligne : R e (dégagement). 2e ligne : X Z P(Δi, µm) Q(Δk, µm) F.
 */
function pecking(c, axis) {
  const to = c.target() ?? c.start;
  const A = c.start;
  const retract = Math.abs(c.params.retract ?? 0.5);
  const stepX = Math.abs(c.micro('P') ?? 0) * 2; // au diamètre
  const stepZ = Math.abs(c.micro('Q') ?? 0);
  const drill = axis === 'z' && Math.abs(to.x - A.x) < EPS && Math.abs(A.x) < EPS;
  const extra = { shape: drill ? 'drill' : axis === 'z' ? 'grooveFace' : 'groove' };
  // Positions successives sur l'axe de décalage, et débourrage sur l'axe de pénétration.
  const peck = axis === 'z' ? stepZ : stepX;
  const shift = axis === 'z' ? stepX : stepZ;
  const from = axis === 'z' ? A.z : A.x;
  const goal = axis === 'z' ? to.z : to.x;
  const sideFrom = axis === 'z' ? A.x : A.z;
  const sideGoal = axis === 'z' ? to.x : to.z;
  const dir = sign(goal - from) || -1;
  const sideDir = sign(sideGoal - sideFrom);
  const point = (main, side) => (axis === 'z' ? { z: main, x: side } : { x: main, z: side });
  const back = axis === 'z' ? retract : retract * 2;

  let side = sideFrom;
  for (let guard = 0; guard < 2000; guard++) {
    c.rapid(point(from, side), extra);
    let at = from;
    while (dir * (goal - at) > EPS) {
      const next = peck > 0 ? (dir > 0 ? Math.min(goal, at + peck) : Math.max(goal, at - peck)) : goal;
      c.cut(point(next, side), extra);
      at = next;
      if (dir * (goal - at) > EPS) c.rapid(point(at - dir * back, side), extra);
    }
    c.rapid(point(from, side), extra);
    if (!sideDir || shift <= 0 || sideDir * (sideGoal - side) <= EPS) break;
    side = sideDir > 0 ? Math.min(sideGoal, side + shift) : Math.max(sideGoal, side - shift);
  }
  c.rapid(A, extra);
}

/**
 * Paramètres lus sur la 1re ligne d'un cycle (mémorisés jusqu'à la 2e). Systèmes A et B/C.
 * Renvoie un objet, ou null si le bloc est la ligne principale du cycle.
 */
export function cycleParameters(code, c) {
  const hasPQ = c.has('P') && c.has('Q');
  switch (code) {
    case 'G71':
      return hasPQ ? null : { depth: c.value('U'), retract: c.value('R') };
    case 'G72':
      return hasPQ ? null : { depth: c.value('W'), retract: c.value('R') };
    case 'G73':
      return hasPQ ? null : { reliefX: c.value('U'), reliefZ: c.value('W'), count: c.value('R') };
    case 'G74':
    case 'G75':
      return c.has('X') || c.has('Z') || c.has('U') || c.has('W') ? null : { retract: c.value('R') };
    case 'G76': {
      if (c.has('X') || c.has('Z') || c.has('U') || c.has('W')) return null;
      const p = String(c.text('P') ?? '').padStart(6, '0');
      return { finishes: Number(p.slice(0, 2)) || 1, chamfer: Number(p.slice(2, 4)) / 10, angle: Number(p.slice(4, 6)) || 60, minDepth: c.micro('Q') ?? 0, allowance: c.value('R') ?? 0 };
    }
    default:
      return null;
  }
}

/** Développement des cycles, par code. `system` : 'a' ou 'bc'. */
export function turningCycle(code, system) {
  const simple = system === 'bc' ? { G77: 'turn', G78: 'thread', G79: 'face' } : { G90: 'turn', G92: 'thread', G94: 'face' };
  if (simple[code]) return (c) => simpleCycle(c, simple[code]);
  switch (code) {
    case 'G71':
      return (c) => roughing(c, { depthAxis: 'x' });
    case 'G72':
      return (c) => roughing(c, { depthAxis: 'z' });
    case 'G73':
      return patternRepeat;
    case 'G76':
      return threading;
    case 'G74':
      return (c) => pecking(c, 'z');
    case 'G75':
      return (c) => pecking(c, 'x');
    default:
      return null;
  }
}

/** Cycles simples modaux (répétés par les blocs suivants qui ne donnent que X / Z). */
export const isModalSimpleCycle = (code, system) => (system === 'bc' ? ['G77', 'G78', 'G79'] : ['G90', 'G92', 'G94']).includes(code);
