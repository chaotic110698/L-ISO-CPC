import { parseLine } from './parser.js';
import { evaluateExpression, evaluateTokens } from './macro-eval.js';
import { cycleParameters, isModalSimpleCycle, turningCycle } from './turning-cycles.js';

/**
 * Interpréteur de trajectoire pour le tournage (plan X/Z) : fonction pure, sans DOM. Sert à la
 * simulation 2D et servira à l'estimation du temps d'usinage.
 *
 * Coordonnées : `x` au DIAMÈTRE (comme dans le programme), `z` le long de l'axe. Les arcs sont
 * calculés au rayon puis découpés en petits segments. Repère géométrique : Z vers la droite,
 * X vers le haut, G2 = sens horaire (tourelle arrière) ; une tourelle avant est un simple
 * miroir à l'affichage.
 *
 * simulate(lignes, dictionnaire, options) → {
 *   moves: [{ line, kind: 'rapid' | 'cut', code, points: [{ x, z }], feed, feedMode: 'rev' | 'min',
 *            speed, speedMode: 'css' | 'rpm', maxSpeed, tool, spindle }],
 *   warnings: [{ line, message }],  tools: [{ line, word }],  end: { x, z }
 * }
 */

/** Point de départ et de retour G28 par défaut (diamètre, Z) : loin de la pièce. */
export const REFERENCE = { x: 200, z: 150 };
const ARC_STEP = (4 * Math.PI) / 180; // découpage des arcs : 4° au plus par segment
const EPS = 1e-6;
const MAX_STEPS = 200000; // garde-fou contre une boucle sans fin (M99 sans appel, GOTO…)

/** Points d'un arc de (z0, r0) à (z1, r1) autour du centre (zc, rc), sens horaire si cw. */
export function arcPoints(from, to, center, cw) {
  const a0 = Math.atan2(from.r - center.r, from.z - center.z);
  let a1 = Math.atan2(to.r - center.r, to.z - center.z);
  // Horaire (repère Z droite, X haut) : angle décroissant.
  if (cw) {
    while (a1 > a0 - EPS) a1 -= 2 * Math.PI;
  } else {
    while (a1 < a0 + EPS) a1 += 2 * Math.PI;
  }
  // Arc quasi complet sur des points identiques : cercle entier (rare en tournage).
  const sweep = a1 - a0;
  const radius = Math.hypot(from.z - center.z, from.r - center.r);
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / ARC_STEP));
  const points = [];
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (sweep * i) / steps;
    points.push(i === steps ? { z: to.z, r: to.r } : { z: center.z + radius * Math.cos(a), r: center.r + radius * Math.sin(a) });
  }
  return points;
}

/** Centre d'un arc donné par son rayon R (R < 0 : grand arc). null si R trop petit. */
export function arcCenterFromRadius(from, to, radius, cw) {
  const dz = to.z - from.z;
  const dr = to.r - from.r;
  const chord = Math.hypot(dz, dr);
  const R = Math.abs(radius);
  if (chord < EPS || R < chord / 2 - 1e-4) return null;
  const h = Math.sqrt(Math.max(0, R * R - (chord * chord) / 4));
  const mz = (from.z + to.z) / 2;
  const mr = (from.r + to.r) / 2;
  // Normale à la corde ; le côté du centre dépend du sens et du signe de R (petit / grand arc).
  const nz = -dr / chord;
  const nr = dz / chord;
  const side = (cw ? -1 : 1) * (radius >= 0 ? 1 : -1);
  return { z: mz + side * h * nz, r: mr + side * h * nr };
}

/**
 * Système de codes de la commande : B/C si G91 est la cotation incrémentale dans le
 * dictionnaire actif (profil « systèmes B/C »), sinon A (U/W incrémentaux).
 */
export const codeSystemOf = (dictionary) => (dictionary?.lookup('G91')?.group === 'distance' ? 'bc' : 'a');

export function simulate(lineTexts, dictionary, { reference = REFERENCE } = {}) {
  const texts = [...lineTexts];
  const parsed = texts.map((text) => parseLine(text));
  const blocks = parsed.map((p) => p.block);
  const vars = new Map(); // variables de macro #… affectées pendant la simulation
  const system = codeSystemOf(dictionary);
  const byNumber = new Map();
  blocks.forEach((block, i) => {
    if (block.blockNumber != null && !byNumber.has(block.blockNumber)) byNumber.set(block.blockNumber, i);
  });

  const moves = [];
  const warnings = [];
  const tools = [];
  const warned = new Set();
  const warn = (line, message) => {
    const key = `${line}|${message}`;
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push({ line, message });
  };

  const state = {
    pos: { x: reference.x, z: reference.z },
    motion: 'G0',
    incremental: false, // G91 (systèmes B/C)
    feed: null,
    feedMode: 'rev',
    speed: null,
    speedMode: 'rpm',
    maxSpeed: null,
    tool: null,
    spindle: null, // 'M3' | 'M4' | null
    ended: false,
    cycleParams: {}, // paramètres des 1res lignes de cycles (G71 U… R…)
    modalCycle: null, // cycle simple modal en cours (G90 / G92 / G94, ou G77 / G78 / G79)
  };
  let steps = 0;
  let currentLine = 0;
  let capture = null; // tracé d'un profil P…Q sans l'exécuter (cycles d'ébauche)
  let depth = 0; // profondeur d'appel de sous-programme
  const programs = new Map(); // numéro O → indice de ligne
  blocks.forEach((block, i) => {
    if (block.programNumber != null && !programs.has(block.programNumber)) programs.set(block.programNumber, i);
  });

  /**
   * Valeur numérique de l'adresse `letter` du bloc : nombre écrit, ou expression de macro
   * calculée (X#901, X[#1+2.], X-#3). undefined si absente ou variable vide.
   */
  function num(block, letter) {
    const word = block.words.find((w) => w.letter === letter && (w.valueKind === 'number' || w.valueKind === 'expr'));
    if (!word) return undefined;
    if (word.valueKind === 'number') return word.value;
    try {
      const value = evaluateExpression(word.expr, vars);
      if (value == null) {
        warn(currentLine, `${letter}${word.expr} : variable vide, l’adresse ${letter} est ignorée.`);
        return undefined;
      }
      return word.token.text.endsWith('-') ? -value : value;
    } catch (error) {
      warn(currentLine, `${letter}${word.expr} : expression non calculable (${error.message}).`);
      return undefined;
    }
  }

  /** Ajoute un déplacement (points en diamètre) depuis la position courante. */
  function pushMove(line, kind, code, points, extra = {}) {
    if (!points.length) return;
    (capture ?? moves).push({
      line,
      kind,
      code,
      points: [{ ...state.pos }, ...points],
      feed: state.feed,
      feedMode: state.feedMode,
      speed: state.speed,
      speedMode: state.speedMode,
      maxSpeed: state.maxSpeed,
      tool: state.tool,
      spindle: state.spindle,
      ...extra,
    });
    state.pos = { ...points.at(-1) };
  }

  /** Cible d'un bloc : X/Z absolus (ou relatifs en G91), U/W relatifs (système A). */
  function target(block) {
    const X = num(block, 'X');
    const Z = num(block, 'Z');
    const U = system === 'a' ? num(block, 'U') : undefined;
    const W = system === 'a' ? num(block, 'W') : undefined;
    if (X === undefined && Z === undefined && U === undefined && W === undefined) return null;
    let { x, z } = state.pos;
    if (X !== undefined) x = state.incremental ? x + X : X;
    if (Z !== undefined) z = state.incremental ? z + Z : Z;
    if (U !== undefined) x += U;
    if (W !== undefined) z += W;
    return { x, z };
  }

  /** Déplacement selon le code de mouvement (G0, G1, G2, G3) vers `to`. */
  function motionTo(line, block, code, to) {
    if (to.x < -EPS) warn(line, `X${to.x} : diamètre négatif, l’outil passerait de l’autre côté de l’axe.`);
    if (code === 'G0') return pushMove(line, 'rapid', code, [to]);
    if (state.feed == null || state.feed <= 0) warn(line, 'Avance F non définie avant ce déplacement de travail : la commande s’arrêterait en alarme.');
    if (!state.spindle) warn(line, 'Déplacement de travail broche arrêtée (pas de M03 / M04 avant).');
    if (code === 'G1' || code === 'G32' || code === 'G33') return pushMove(line, 'cut', code, [to]);

    // Arcs G2 / G3 : calcul au rayon.
    const cw = code === 'G2';
    const from = { z: state.pos.z, r: state.pos.x / 2 };
    const end = { z: to.z, r: to.x / 2 };
    const R = num(block, 'R');
    const I = num(block, 'I');
    const K = num(block, 'K');
    let center = null;
    if (R !== undefined) {
      center = arcCenterFromRadius(from, end, R, cw);
      if (!center) {
        const chord = Math.hypot(end.z - from.z, end.r - from.r);
        warn(line, chord < EPS ? 'Arc sans déplacement : point d’arrivée identique au départ.' : `Arc impossible : R${Math.abs(R)} est plus petit que la moitié de la distance entre les deux points (${(chord / 2).toFixed(3)} mm). Tracé en ligne droite.`);
        return pushMove(line, 'cut', code, [to]);
      }
    } else if (I !== undefined || K !== undefined) {
      center = { z: from.z + (K ?? 0), r: from.r + (I ?? 0) };
      const r0 = Math.hypot(from.z - center.z, from.r - center.r);
      const r1 = Math.hypot(end.z - center.z, end.r - center.r);
      if (Math.abs(r0 - r1) > 0.01) warn(line, `Arc incohérent : le centre I/K n’est pas à la même distance des deux points (${r0.toFixed(3)} et ${r1.toFixed(3)} mm).`);
    } else {
      warn(line, `${code} sans rayon R ni centre I/K : tracé en ligne droite.`);
      return pushMove(line, 'cut', code, [to]);
    }
    const points = arcPoints(from, end, center, cw).map((p) => ({ x: p.r * 2, z: p.z }));
    pushMove(line, 'cut', code, points);
  }

  /** Exécute les lignes [from, to] (indices) ; renvoie false si le programme est terminé. */
  function run(from, to) {
    for (let i = from; i <= to && i < blocks.length; i++) {
      if (state.ended || ++steps > MAX_STEPS) return false;
      const block = blocks[i];
      const line = i + 1;
      currentLine = line;
      if (assign(parsed[i].tokens, line)) continue;
      if (parsed[i].tokens.some((t) => t.type === 'keyword' && ['IF', 'GOTO', 'WHILE', 'END', 'DO'].includes(t.keyword))) {
        warn(line, 'Instruction de macro (IF, GOTO, WHILE…) pas encore simulée : ligne ignorée.');
        continue;
      }
      if (block.isEmpty) continue;
      const jump = execute(block, line, i);
      if (jump === 'end') return false;
      if (jump === 'return') return true; // M99 : fin du sous-programme
      if (typeof jump === 'number') i = jump; // reprise après la ligne d'indice `jump`
    }
    return true;
  }

  /**
   * M98 P… : appel d'un sous-programme du même fichier. P de plus de 4 chiffres : répétitions
   * puis numéro (P30010 : 3 fois O0010) ; sinon L donne les répétitions.
   */
  function callSubprogram(block, line) {
    const word = block.words.find((w) => w.letter === 'P' && w.valueKind === 'number');
    if (!word) return warn(line, 'M98 sans numéro de programme P.');
    const digits = word.valueText.replace(/\D/g, '');
    const number = digits.length > 4 ? Number(digits.slice(-4)) : Number(digits);
    const times = digits.length > 4 ? Number(digits.slice(0, -4)) || 1 : (num(block, 'L') ?? 1);
    const start = programs.get(number);
    if (start == null) return warn(line, `M98 P${word.valueText} : sous-programme O${String(number).padStart(4, '0')} absent de ce fichier, appel ignoré.`);
    if (depth >= 8) return warn(line, 'Appels de sous-programmes imbriqués trop profonds (plus de 8) : appel ignoré.');
    depth++;
    for (let n = 0; n < times && !state.ended; n++) run(start + 1, blocks.length - 1);
    depth--;
  }

  /** Affectation « #n = expression » : calculée et mémorisée. Renvoie true si c'en était une. */
  function assign(tokens, line) {
    if (tokens[0]?.type !== 'variable' || tokens[1]?.type !== 'operator' || tokens[1].text !== '=') return false;
    const rest = tokens.slice(2).filter((t) => t.type !== 'comment');
    try {
      const index = tokens[0].index;
      if (index == null) throw new Error('variable indirecte #[…] non prise en charge');
      vars.set(index, evaluateTokens(rest, vars));
    } catch (error) {
      warn(line, `Affectation non calculable (${error.message}).`);
    }
    return true;
  }

  /** Bloc : codes modaux, outil, F, S, puis déplacement ou cycle. Renvoie un saut éventuel. */
  function execute(block, line, index) {
    let motionCode = null;
    let cycle = null;
    let reference28 = false;
    let coordinateSet = false;
    let callSub = false;
    for (const word of block.codes) {
      const code = word.code;
      const def = dictionary?.lookup(code);
      if (['G0', 'G1', 'G2', 'G3', 'G32', 'G33'].includes(code)) motionCode = code;
      else if (code === 'G28') reference28 = true;
      else if (code === 'G90' && system === 'bc') state.incremental = false;
      else if (code === 'G91' && system === 'bc') state.incremental = true;
      else if (code === 'G96') state.speedMode = 'css';
      else if (code === 'G97') state.speedMode = 'rpm';
      else if (code === 'G99' || code === 'G95') state.feedMode = 'rev';
      else if (code === 'G98' || (code === 'G94' && system === 'bc')) state.feedMode = 'min';
      else if ((code === 'G50' && system === 'a') || (code === 'G92' && system === 'bc')) coordinateSet = true;
      else if (code === 'M3' || code === 'M4') state.spindle = code;
      else if (code === 'M5') state.spindle = null;
      else if (code === 'M30' || code === 'M2') {
        if (!capture) state.ended = true;
      } else if (code === 'M98') callSub = true;
      else if (code === 'G65' || code === 'G66') warn(line, `${code} : appel de macro pas encore simulé.`);
      else if (def?.category === 'cycle' || isModalSimpleCycle(code, system)) cycle = code;
    }

    // Outil, avance, vitesse (S de limitation après G50 / G92).
    const T = block.words.find((w) => w.letter === 'T' && w.valueKind === 'number');
    if (T) {
      state.tool = `T${T.valueText}`;
      if (!capture) tools.push({ line, word: state.tool });
    }
    const F = num(block, 'F');
    if (F !== undefined && !cycle) state.feed = F;
    const S = num(block, 'S');
    if (S !== undefined) {
      if (coordinateSet) state.maxSpeed = S;
      else state.speed = S;
    }

    if (coordinateSet) {
      const X = num(block, 'X');
      const Z = num(block, 'Z');
      if (X !== undefined || Z !== undefined) {
        warn(line, 'Prise d’origine par G50 / G92 X… Z… : la simulation considère la position actuelle comme ce point.');
        state.pos = { x: X ?? state.pos.x, z: Z ?? state.pos.z };
      }
      return state.ended ? 'end' : null;
    }

    if (reference28) {
      const via = target(block);
      if (via) pushMove(line, 'rapid', 'G28', [via]);
      const axes = new Set(block.words.filter((w) => 'XZUW'.includes(w.letter)).map((w) => (w.letter === 'U' ? 'X' : w.letter === 'W' ? 'Z' : w.letter)));
      pushMove(line, 'rapid', 'G28', [{ x: axes.has('X') || !axes.size ? reference.x : state.pos.x, z: axes.has('Z') || !axes.size ? reference.z : state.pos.z }]);
      return state.ended ? 'end' : null;
    }

    if (cycle) {
      if (cycle !== state.modalCycle) state.lastCycleTarget = null;
      state.modalCycle = isModalSimpleCycle(cycle, system) ? cycle : null;
      const result = runCycle(cycle, block, line, index);
      return state.ended ? 'end' : result;
    }

    if (motionCode) {
      state.motion = motionCode;
      state.modalCycle = null;
      state.lastCycleTarget = null;
    }
    const to = target(block);
    // Bloc qui ne donne que X / Z après un cycle simple : le cycle est répété (modal).
    if (to && state.modalCycle && !motionCode) runCycle(state.modalCycle, block, line, index);
    else if (to) motionTo(line, block, state.motion, to);
    if (callSub) callSubprogram(block, line);
    if (block.codes.some((w) => w.code === 'M99')) return depth > 0 || capture ? 'return' : 'end';
    return state.ended ? 'end' : null;
  }

  /** Index de ligne du bloc N`value`, ou -1. */
  const lineOfN = (value) => byNumber.get(value) ?? -1;

  /** Points du profil P…Q (indices start…stop) tracés depuis la position courante, sans les exécuter. */
  function traceProfile(start, stop) {
    const saved = { ...state, pos: { ...state.pos } };
    const outer = capture;
    capture = [];
    run(start, stop);
    const traced = capture;
    capture = outer;
    Object.assign(state, saved);
    return [{ ...saved.pos }, ...traced.flatMap((m) => m.points.slice(1))];
  }

  /**
   * Cycles : la 1re ligne (G71 U… R…, G76 P… Q… R…) mémorise ses paramètres ; G70 suit le
   * profil P…Q ; les autres sont développés en passes (turning-cycles.js). Après un cycle de
   * profil, la commande reprend après le bloc Q (le profil n'est pas exécuté à la suite).
   */
  function runCycle(code, block, line, index) {
    const words = (letter) => block.words.find((w) => w.letter === letter);
    const value = (letter) => num(block, letter);
    const micro = (letter) => {
      const word = words(letter);
      const v = num(block, letter);
      return v === undefined ? undefined : word?.valueKind === 'number' && !word.hasDecimal ? v / 1000 : v;
    };
    const helpers = { has: (letter) => Boolean(words(letter)), value, micro, text: (letter) => words(letter)?.valueText };
    const params = cycleParameters(code, helpers);
    if (params) {
      state.cycleParams[code] = params;
      return null;
    }
    const F = num(block, 'F');
    const cycleFeed = F ?? state.feed;
    const profileCycle = ['G70', 'G71', 'G72', 'G73'].includes(code);
    let start = -1;
    let stop = -1;
    if (profileCycle) {
      const P = num(block, 'P');
      const Q = num(block, 'Q');
      start = lineOfN(P);
      stop = lineOfN(Q);
      if (start < 0 || stop < 0 || stop < start) {
        warn(line, `${code} : bloc N${P ?? '?'} ou N${Q ?? '?'} introuvable, cycle ignoré.`);
        return null;
      }
    }
    if (code === 'G70') {
      const back = { ...state.pos };
      const savedMotion = state.motion;
      run(start, stop);
      state.motion = savedMotion;
      pushMove(line, 'rapid', 'G70', [back]); // fin de G70 : retour au point de départ
      return null;
    }
    const generator = turningCycle(code, system);
    if (!generator) {
      warn(line, `${code} : cycle pas encore simulé.`);
      return profileCycle && stop > index ? stop : null;
    }
    if (!state.spindle) warn(line, `${code} : cycle d’usinage broche arrêtée (pas de M03 / M04 avant).`);
    if (!(cycleFeed > 0)) warn(line, `${code} : avance F non définie.`);
    const savedFeed = state.feed;
    state.feed = cycleFeed;
    // Cycle simple répété par un bloc X seul (ou Z seul) : l'autre cote reste celle du cycle précédent.
    const simple = isModalSimpleCycle(code, system);
    const has = (letters) => block.words.some((w) => letters.includes(w.letter));
    const cycleTarget = () => {
      const t = target(block);
      const last = state.lastCycleTarget;
      if (!simple || !last) return t;
      if (!t) return last;
      return { x: has(['X', 'U']) ? t.x : last.x, z: has(['Z', 'W']) ? t.z : last.z };
    };
    if (simple) state.lastCycleTarget = cycleTarget();
    generator({
      code,
      start: { ...state.pos },
      feed: cycleFeed,
      params: state.cycleParams[code] ?? {},
      value,
      micro,
      target: () => (simple ? state.lastCycleTarget : target(block)),
      profile: () => traceProfile(start, stop),
      rapid: (to, extra) => pushMove(line, 'rapid', code, [to], extra),
      cut: (to, extra) => pushMove(line, 'cut', code, [to], extra),
      warn: (message) => warn(line, message),
    });
    // Avance du cycle (F du bloc) conservée ensuite, comme sur la commande.
    if (F === undefined) state.feed = savedFeed;
    return profileCycle && stop > index ? stop : null;
  }

  run(0, blocks.length - 1);
  if (steps > MAX_STEPS) warnings.push({ line: blocks.length, message: 'Simulation arrêtée : programme trop long ou boucle sans fin.' });
  return { moves, warnings, tools, end: { ...state.pos }, system, variables: Object.fromEntries(vars) };
}

/** Longueur d'un déplacement (mm), points en diamètre. */
export function moveLength(move) {
  let length = 0;
  for (let i = 1; i < move.points.length; i++) {
    const a = move.points[i - 1];
    const b = move.points[i];
    length += Math.hypot((b.x - a.x) / 2, b.z - a.z);
  }
  return length;
}

/**
 * Durée d'un déplacement en minutes. Rapides à `rapidRate` mm/min. Travail : F en mm/min, ou
 * F en mm/tr × vitesse de rotation — en G96, calculée segment par segment au diamètre courant
 * (n = 1000·Vc / π·D), limitée par G50 / G92 S. Sans S connu : `defaultRpm`.
 */
export function moveMinutes(move, { rapidRate = 10000, defaultRpm = 1000, maxRpm = 6000 } = {}) {
  if (move.kind === 'rapid') return moveLength(move) / rapidRate;
  if (!(move.feed > 0)) return 0;
  if (move.feedMode === 'min') return moveLength(move) / move.feed;
  let minutes = 0;
  for (let i = 1; i < move.points.length; i++) {
    const a = move.points[i - 1];
    const b = move.points[i];
    const length = Math.hypot((b.x - a.x) / 2, b.z - a.z);
    if (!length) continue;
    let rpm = move.speed > 0 ? move.speed : defaultRpm;
    if (move.speedMode === 'css' && move.speed > 0) {
      const diameter = Math.abs(a.x + b.x) / 2;
      rpm = diameter > 0 ? (1000 * move.speed) / (Math.PI * diameter) : Infinity;
    }
    rpm = Math.min(rpm, move.maxSpeed > 0 ? move.maxSpeed : maxRpm);
    minutes += length / (move.feed * rpm);
  }
  return minutes;
}
