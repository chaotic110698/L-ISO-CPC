import { EditorView } from '@codemirror/view';
import { h, pickFile, readTextFile } from '../../core/dom.js';
import { formatRelativeTime } from '../../core/util.js';
import { REFERENCE, toolSides } from '../../engine/index.js';
import { highlightCode } from '../../ui/code-view.js';
import { icon } from '../../ui/icons.js';
import { switchProgram } from '../../ui/program-actions.js';
import { segmented } from '../../ui/segmented.js';
import { createMaterial, createWheelMaterial, shapeFor } from './material.js';
import { createTimeline, formatDuration } from './playback.js';
import { MAX_PROGRAMS, sameBlock, sanitizeSession, simulateChain } from './session.js';
import { guessStock, parseStock, sanitizeStock } from './stock.js';
import { createView } from './view.js';
import { DIAMONDS, ORIGINS, WHEEL_DEFAULTS, diamondFromComment, diamondShape, isDressingProgram, originZ, parseWheel, sanitizeWheel, toWheelMoves, zSign } from './wheel.js';

export { splitLegacySession } from './session.js';

const SPEEDS = [
  { value: 1, label: '×1' },
  { value: 5, label: '×5' },
  { value: 20, label: '×20' },
  { value: 100, label: '×100' },
];
const STOCK_FIELDS = [
  { key: 'diameter', label: 'Diamètre du brut', unit: 'mm' },
  { key: 'length', label: 'Longueur du brut (partie serrée comprise)', unit: 'mm' },
  { key: 'face', label: 'Z de la face avant du brut', unit: 'mm', hint: '0 : face déjà dressée ; 1 : 1 mm de surépaisseur à dresser.' },
  { key: 'bore', label: 'Diamètre intérieur (pré-perçage ou tube)', unit: 'mm Ø', hint: '0 pour une barre pleine.' },
  { key: 'boreDepth', label: 'Profondeur du pré-perçage', unit: 'mm', hint: 'Depuis la face avant ; 0 : débouchant (tube).' },
  { key: 'grip', label: 'Longueur serrée dans les mors', unit: 'mm' },
];

/** Taillage de meule : réglage (module Rectification) du sens de Z+ de chaque diamant. */
export const Z_SETTING = { straight: 'zStraight', leftFlank: 'zLeftFlank', rightFlank: 'zRightFlank' };
export const Z_CHOICES = { right: '→ À droite', left: '← À gauche' };
export const X_CHOICES = { away: 'S’éloigne de la meule', toward: 'Vers la meule' };
export const X_MODES = { diameter: 'Au diamètre (X-0.1 : 0,05 mm)', radius: 'Au rayon (X-0.1 : 0,1 mm)' };

/**
 * Page d'un simulateur 2D, partagée par les modules « Tour » et « Rectification » : programmes
 * chargés (copie de leur texte) exécutés l'un après l'autre sans remise à zéro des variables,
 * puis usinage animé — enlèvement de matière, trajet, outil — avec lecture, pause, vitesse, bloc
 * par bloc, retour à l'éditeur sur la ligne en cours, et alertes.
 *
 * config : {
 *   machine: 'lathe' (brut, mandrin, outils) | 'dressing' (taillage de meule, vue de dessus),
 *   id, path, label (menu), title (titre de la page), icon, order (menu),
 *   prefix : préfixe des données mémorisées et des réglages du module (« simulation », « rectification »),
 *   toolbar : { label, title, order } — bouton de l'éditeur qui charge le programme ouvert,
 * }
 */
export function createSimulator(ctx, config) {
  const { editor, codes } = ctx;
  const { machine, prefix } = config;
  const dressing = machine === 'dressing';
  const setting = (name) => ctx.settings.get(`${prefix}.${name}`);
  let page = null;
  let scene = null;
  let sourceKey = null;
  const SESSION_KEY = `${prefix}.session`;
  let session = sanitizeSession(ctx.kv.get(SESSION_KEY, null));
  let time = 0;
  let playing = false;
  let frame = 0;
  let lastTick = 0;
  let erased = { index: 0, fraction: 0 }; // matière effacée jusqu'à ce point du trajet
  let speed = ctx.kv.get(`${prefix}.speed`, 20);
  let currentMove = null;

  const canvas = h('canvas', { class: 'sim-canvas', 'aria-label': dressing ? 'Simulation du taillage de la meule' : 'Simulation de l’usinage' });
  const view = createView(canvas, { onPick: (index) => seek(scene.timeline.starts[index] + scene.timeline.durations[index] * 0.999) });
  const titleEl = h('h1', { class: 'console-title' });
  const statusEl = h('p', { class: 'console-counter', 'aria-live': 'off' });
  const blockEl = h('div', { class: 'sim-block mono' });
  const timeEl = h('span', { class: 'sim-time' });
  const range = h('input', { type: 'range', class: 'sim-range', min: 0, max: 1000, value: 0, 'aria-label': 'Avancement', oninput: () => seek((range.value / 1000) * (scene?.timeline.total ?? 0)) });
  const playButton = h('button', { type: 'button', class: 'btn btn-primary sim-play', dataset: { action: 'sim-play' }, onclick: () => (playing ? pause() : play()) });
  const alertsEl = h('details', { class: 'sim-alerts', hidden: true });
  const toolsEl = h('details', { class: 'sim-tools', hidden: true });
  // Taillage de meule : sens des axes de la machine (le trièdre diffère d'une machine à l'autre,
  // et d'un diamant à l'autre quand deux diamants travaillent en miroir).
  const axesEl = h('div', { class: 'sim-axes', hidden: true, role: 'group', 'aria-label': 'Sens des axes' });
  const stockEl = h('span', { class: 'sim-stock' });
  const stockButton = h('button', { type: 'button', class: 'btn btn-small', dataset: { action: 'sim-stock' }, onclick: () => (dressing ? editWheel() : editStock()) }, stockEl);
  const programsEl = h('details', { class: 'sim-programs' });
  programsEl.open = ctx.kv.get(`${prefix}.programsOpen`, true) !== false;
  programsEl.addEventListener('toggle', () => session.programs.length && ctx.kv.set(`${prefix}.programsOpen`, programsEl.open));
  const emptyEl = h(
    'div',
    { class: 'sim-empty', hidden: true },
    h('p', null, 'Aucun programme chargé.'),
    h(
      'p',
      { class: 'sim-note' },
      dressing
        ? 'Chargez un programme par diamant (droit, flanc gauche, flanc droit) : ils s’exécutent l’un après l’autre, sans remise à zéro des variables #…, comme à la machine.'
        : 'Chargez un programme enregistré (ou un fichier). Plusieurs programmes s’exécutent l’un après l’autre, sans remise à zéro des variables #….',
    ),
    h('button', { type: 'button', class: 'btn btn-primary', dataset: { action: 'sim-load-empty' }, onclick: () => pickPrograms() }, icon('plus'), 'Charger un programme'),
  );
  const variablesEl = h('details', { class: 'sim-variables', hidden: true });

  const iconButton = (name, label, action, onclick) => h('button', { type: 'button', class: 'icon-btn sim-btn', title: label, 'aria-label': label, dataset: { action }, onclick }, icon(name));
  const speedControl = segmented({
    label: 'Vitesse de lecture',
    options: SPEEDS,
    value: speed,
    onChange: (value) => {
      speed = value;
      ctx.kv.set(`${prefix}.speed`, value);
    },
  });

  function build() {
    page = h(
      'section',
      { class: `sim-page${dressing ? ' is-dressing' : ''}`, 'aria-label': config.title, dataset: { simulator: config.id } },
      h(
        'header',
        { class: 'console-header' },
        h('div', { class: 'console-heading' }, titleEl, statusEl),
        h(
          'div',
          { class: 'sim-header-actions' },
          stockButton,
          h('button', { type: 'button', class: 'btn btn-small', title: 'Ouvrir dans l’éditeur, sur la ligne en cours', dataset: { action: 'sim-leave' }, onclick: () => leave() }, icon('code'), h('span', { class: 'sim-hide-narrow' }, 'Éditeur')),
        ),
      ),
      programsEl,
      h('div', { class: 'sim-view' }, axesEl, h('div', { class: 'sim-stage' }, canvas, iconButton('fold', 'Ajuster la vue (double-tap)', 'sim-fit', () => view.fit()), emptyEl)),
      h(
        'div',
        { class: 'sim-controls' },
        h('div', { class: 'sim-timebar' }, range, timeEl),
        h(
          'div',
          { class: 'sim-buttons' },
          iconButton('undo', 'Revenir au début', 'sim-start', () => seek(0)),
          iconButton('arrowUp', 'Bloc précédent', 'sim-prev', () => stepBlock(-1)),
          playButton,
          iconButton('arrowDown', 'Bloc suivant', 'sim-next', () => stepBlock(1)),
          speedControl,
        ),
        blockEl,
        h('div', { class: 'sim-panels' }, toolsEl, variablesEl, alertsEl),
      ),
    );
    page.tabIndex = -1;
    page.addEventListener('keydown', (event) => {
      if (event.target.closest('input, select, textarea')) return;
      if (event.key === ' ') playing ? pause() : play();
      else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') stepBlock(1);
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') stepBlock(-1);
      else if (event.key === 'Home') seek(0);
      else return;
      event.preventDefault();
    });
    return page;
  }

  // Réglages propres aux programmes chargés (brut, côtés, meule) : mémorisés pour le 1er programme.
  const sessionId = () => session.programs[0]?.id ?? 'sans-id';
  const stockKey = () => `${prefix}.stock.${sessionId()}`;
  const sidesKey = () => `${prefix}.sides.${sessionId()}`;
  const wheelKey = () => `${prefix}.wheel.${sessionId()}`;

  /** Enregistre la liste des programmes chargés et recalcule. */
  function setPrograms(programs) {
    session = sanitizeSession({ programs });
    ctx.kv.set(SESSION_KEY, session);
    load({ force: true });
  }

  /** Plusieurs réglages changés d'un coup (dialogue, boutons) : un seul recalcul. */
  let reloadQueued = false;
  function scheduleLoad() {
    if (!page || reloadQueued) return;
    reloadQueued = true;
    queueMicrotask(() => {
      if (!reloadQueued) return; // déjà recalculé entre-temps
      reloadQueued = false;
      load({ force: true });
    });
  }

  /** (Re)calcule la simulation si les programmes chargés ont changé. */
  function load({ force = false } = {}) {
    const { programs } = session;
    const key = JSON.stringify(programs);
    if (!force && key === sourceKey && (scene || !programs.length)) return;
    reloadQueued = false;
    pause();
    sourceKey = key;
    titleEl.textContent = programs.length ? programs.map((p) => p.name).join(' + ') : config.title;
    emptyEl.hidden = programs.length > 0;
    stockButton.hidden = !programs.length;
    if (!programs.length) {
      scene = null;
      renderPrograms();
      view.setScene(null);
      axesEl.hidden = true;
      for (const el of [alertsEl, toolsEl, variablesEl]) el.hidden = true;
      statusEl.textContent = 'Chargez un programme pour le simuler';
      blockEl.replaceChildren();
      update();
      return;
    }
    const programLines = programs.map((p) => p.text.split('\n'));
    const lines = programLines.flat();
    const result = simulateChain(programs, codes);
    if (dressing) loadDressing(lines, programLines, result);
    else loadLathe(lines, programLines, result);
    renderPrograms();
    show();
  }

  const sortWarnings = (list) => list.sort((a, b) => (a.program ?? 0) - (b.program ?? 0) || a.line - b.line);

  /** Tournage : brut (lu dans le programme, saisi ou estimé), côté de travail des outils, collisions. */
  function loadLathe(lines, programLines, result) {
    const fromProgram = parseStock(lines);
    const fallback = fromProgram ?? guessStock(result.moves);
    const saved = ctx.kv.get(stockKey(), null);
    const stock = sanitizeStock(saved ?? fallback, fallback);
    const material = createMaterial(stock);
    const timeline = createTimeline(result.moves, { rapidRate: setting('rapidRate') });
    const autoSides = toolSides(result.moves);
    const overrides = ctx.kv.get(sidesKey(), {}) ?? {};
    const sides = Object.fromEntries(Object.entries(autoSides).map(([tool, side]) => [tool, overrides[tool] ?? side]));
    scene = { ...result, programLines, stock, material, timeline, sides, autoSides, overrides, front: setting('turret') === 'front', looksLikeDressing: isDressingProgram(lines) };
    scene.warnings = sortWarnings([...result.warnings, ...collisions(scene)]);
    stockEl.replaceChildren(icon('edit'), `Brut Ø${stock.diameter} × ${stock.length}${stock.bore > 0 ? ` · int. Ø${stock.bore}` : ''}`);
  }

  /** Meule : largeur et diamant par défaut des programmes chargés (saisis, sinon lus dans le programme). */
  function savedWheel() {
    const own = ctx.kv.get(wheelKey(), null);
    // Simulateur unique d'avant la séparation : largeur et diamant saisis pour ce programme.
    const legacy = own ? null : ctx.kv.get(`simulation.wheel.${sessionId()}`, null);
    const picked = own ?? legacy;
    return picked ? Object.fromEntries(['width', 'diamond'].filter((key) => picked[key] != null).map((key) => [key, picked[key]])) : null;
  }

  /** Réglages machine du taillage (Paramètres) : cotes X, sens des axes, origine du diamant droit. */
  const machineWheel = () => ({
    xMode: setting('xMode'),
    straightOrigin: setting('straightOrigin'),
    invertX: setting('xDirection') === 'toward',
    zDirections: Object.fromEntries(Object.entries(Z_SETTING).map(([kind, name]) => [kind, setting(name)])),
  });

  /**
   * Taillage de meule : les programmes pilotent le diamant ; leurs cotes sont ramenées dans le
   * repère de la meule (origine et sens de Z+ propres à chaque diamant), vue de dessus.
   * Diamant de chaque programme : choisi dans la liste, sinon celui du commentaire de la ligne
   * de l'outil (« T0202 (DIAMANT FLANC GAUCHE) »), sinon celui par défaut.
   */
  function loadDressing(lines, programLines, result) {
    const fromProgram = parseWheel(lines);
    const saved = savedWheel();
    const wheel = sanitizeWheel({ ...WHEEL_DEFAULTS, ...(fromProgram ?? {}), ...(saved ?? {}), ...machineWheel() });
    const fromComment = new Map(result.tools.map((t) => [`${t.program}|${t.word}`, diamondFromComment(programLines[t.program][t.line - 1])]));
    const diamondOf = (tool, move) => {
      const chosen = session.programs[move.program]?.diamond;
      return chosen && chosen !== 'auto' ? chosen : (fromComment.get(`${move.program}|${tool}`) ?? wheel.diamond);
    };
    // Sans le premier rapide depuis le point de départ fictif du tour (X200 Z150) : sans objet ici.
    const first = result.moves[0];
    const programMoves = first?.kind === 'rapid' && first.points[0].x === REFERENCE.x && first.points[0].z === REFERENCE.z ? result.moves.slice(1) : result.moves;
    const moves = toWheelMoves(programMoves, wheel, diamondOf);
    const deepest = Math.min(0, ...moves.filter((m) => m.kind === 'cut').flatMap((m) => m.points.map((p) => p.x / 2)));
    const depth = Math.max(10, wheel.width * 0.4, -deepest + 4);
    const material = createWheelMaterial(wheel.width, depth);
    const timeline = createTimeline(moves, { rapidRate: setting('rapidRate') });
    const kinds = Object.keys(DIAMONDS);
    const cutting = new Set(moves.filter((m) => m.kind === 'cut').map((m) => m.diamond));
    const used = cutting.size ? kinds.filter((kind) => cutting.has(kind)) : [wheel.diamond];
    // Repère de chaque diamant utilisé : origine et sens de Z+ (deux diamants peuvent le partager).
    const frames = new Map();
    for (const kind of used) {
      const key = `${originZ(kind, wheel)}|${zSign(kind, wheel)}`;
      frames.set(key, { z: originZ(kind, wheel), sign: zSign(kind, wheel), names: [...(frames.get(key)?.names ?? []), DIAMONDS[kind].short] });
    }
    const origins = [...frames.values()].map(({ z, sign, names }) => ({ z, sign, label: `X0 Z0 · diamant${names.length > 1 ? 's' : ''} ${names.join(', ')}` }));
    // Diamant « auto » de chaque programme (montré dans la liste) : lu dans le commentaire de ses
    // outils ; « par défaut » si un outil n'en a pas (commentaire absent ou non reconnu).
    const autoDiamonds = session.programs.map((_, index) => {
      const found = result.tools.filter((t) => t.program === index).map((t) => fromComment.get(`${index}|${t.word}`));
      return { kinds: found.length ? [...new Set(found.map((kind) => kind ?? wheel.diamond))] : [wheel.diamond], guessed: !found.length || found.some((kind) => !kind) };
    });
    scene = {
      ...result,
      moves,
      programLines,
      wheel: true,
      wheelSettings: wheel,
      material,
      timeline,
      origins,
      used,
      autoDiamonds,
      shapeOf: (move) => diamondShape(move.diamond),
      front: true, // miroir : meule au-dessus, diamant en dessous (repère des opérateurs)
    };
    // Alertes propres au tour sans objet ici : broche de la meule, X négatif (= dans la meule).
    const own = result.warnings.filter((w) => !/broche arrêtée|diamètre négatif/.test(w.message));
    scene.warnings = sortWarnings([...own, ...wheelCollisions(scene)]);
    stockEl.replaceChildren(icon('edit'), `Meule L${wheel.width}`);
  }

  /** Taillage : boutons du sens des axes (X+ commun, Z+ de chaque diamant utilisé). */
  function renderAxes() {
    axesEl.hidden = !scene?.wheel;
    if (!scene?.wheel) return;
    const wheel = scene.wheelSettings;
    const toggle = (action, pressed, title, onclick, ...content) => h('button', { type: 'button', class: 'btn btn-small sim-axis', dataset: action, 'aria-pressed': String(pressed), title, onclick }, ...content);
    axesEl.replaceChildren(
      h('span', { class: 'sim-axes-label' }, 'Sens des axes'),
      // Vue en miroir : X+ en s'éloignant de la meule = vers le bas de l'écran.
      toggle({ action: 'sim-invert-x' }, wheel.invertX, 'Inverser le sens de X+ (tous les diamants)', () => ctx.settings.set(`${prefix}.xDirection`, wheel.invertX ? 'away' : 'toward'), h('span', { class: 'sim-axis-dir' }, `X+ ${wheel.invertX ? '↑' : '↓'}`)),
      ...scene.used.map((kind) => {
        const left = wheel.zDirections[kind] === 'left';
        return toggle(
          { action: 'sim-invert-z', diamond: kind },
          left,
          `Inverser le sens de Z+ du diamant ${DIAMONDS[kind].short}`,
          () => ctx.settings.set(`${prefix}.${Z_SETTING[kind]}`, left ? 'right' : 'left'),
          h('span', { class: 'sim-axis-dir' }, `Z+ ${left ? '←' : '→'}`),
          h('span', { class: 'sim-axis-name' }, DIAMONDS[kind].short),
        );
      }),
    );
  }

  /** Liste des programmes chargés : ordre d'exécution, diamant (taillage), retrait. */
  function renderPrograms() {
    const { programs } = session;
    if (!programs.length) programsEl.open = true;
    const move = (from, to) => {
      const next = [...programs];
      next.splice(to, 0, ...next.splice(from, 1));
      setPrograms(next);
    };
    const diamondSelect = (program, index) => {
      // « auto » : le diamant lu dans le commentaire de l'outil est affiché, pour voir s'il est bien reconnu.
      const auto = scene?.autoDiamonds?.[index];
      const autoLabel = auto ? `Diamant : auto → ${auto.kinds.map((kind) => DIAMONDS[kind].short).join(', ')}${auto.guessed ? ' (par défaut)' : ''}` : 'Diamant : auto (commentaire de l’outil)';
      const select = h(
        'select',
        { class: 'input sim-side', 'aria-label': `Diamant de ${program.name}`, dataset: { program: String(index) }, onchange: () => setPrograms(programs.map((p, i) => (i === index ? { ...p, diamond: select.value } : p))) },
        h('option', { value: 'auto' }, autoLabel),
        Object.entries(DIAMONDS).map(([value, d]) => h('option', { value }, `Diamant ${d.short}`)),
      );
      select.value = program.diamond;
      return select;
    };
    const small = (name, label, action, onclick, disabled = false) => h('button', { type: 'button', class: 'icon-btn sim-btn', title: label, 'aria-label': label, dataset: { action }, disabled, onclick }, icon(name));
    // Tour : programme de taillage chargé ici par erreur → proposé au simulateur rectification.
    const toDressing = !dressing && scene?.looksLikeDressing && ctx.ui.navItems().some((item) => item.id === 'rectification');
    programsEl.replaceChildren(
      ...[
        h(
          'summary',
          null,
          icon('folder'),
          programs.length ? `Programmes chargés (${programs.length})` : 'Programmes chargés',
          programs.length > 1 ? h('span', { class: 'sim-programs-hint' }, ' · à la suite, variables partagées') : null,
        ),
        programs.length
          ? h(
              'ol',
              { class: 'sim-program-list' },
              programs.map((program, index) =>
                h(
                  'li',
                  { class: `sim-program${dressing ? ' has-side' : ''}`, dataset: { index: String(index) } },
                  h('span', { class: 'sim-program-name' }, h('strong', null, `${index + 1}.`), ` ${program.name}`),
                  dressing ? diamondSelect(program, index) : null,
                  h(
                    'span',
                    { class: 'sim-program-actions' },
                    small('arrowUp', `Exécuter « ${program.name} » plus tôt`, 'sim-program-up', () => move(index, index - 1), index === 0),
                    small('arrowDown', `Exécuter « ${program.name} » plus tard`, 'sim-program-down', () => move(index, index + 1), index === programs.length - 1),
                    small('close', `Retirer « ${program.name} »`, 'sim-program-remove', () => setPrograms(programs.filter((_, i) => i !== index))),
                  ),
                ),
              ),
            )
          : null,
        programs.length > 1 ? h('p', { class: 'sim-note' }, 'Exécutés dans cet ordre, comme à la machine : chacun repart de la position où le précédent s’est arrêté, et les variables #… ne sont pas remises à zéro entre deux programmes.') : null,
        toDressing
          ? h(
              'p',
              { class: 'sim-hint' },
              icon('info'),
              h('span', null, 'Ce programme ressemble à un taillage de meule (commentaire MEULE, DIAMANT ou TAILLAGE). '),
              h('button', { type: 'button', class: 'btn btn-small', dataset: { action: 'sim-to-dressing' }, onclick: () => handOver('rectification', '/rectification') }, icon('wheel'), 'Simuler en rectification'),
            )
          : null,
        h(
          'div',
          { class: 'sim-program-buttons' },
          h('button', { type: 'button', class: 'btn btn-small', dataset: { action: 'sim-load' }, disabled: programs.length >= MAX_PROGRAMS, onclick: () => pickPrograms() }, icon('plus'), programs.length ? 'Ajouter un programme' : 'Charger un programme'),
          programs.some((p) => p.id) ? h('button', { type: 'button', class: 'btn btn-small', title: 'Reprendre le texte enregistré des programmes', dataset: { action: 'sim-reload' }, onclick: () => reloadPrograms() }, icon('undo'), 'Recharger') : null,
          programs.length ? h('button', { type: 'button', class: 'btn btn-small', dataset: { action: 'sim-clear' }, onclick: () => setPrograms([]) }, icon('trash'), 'Tout retirer') : null,
        ),
      ].filter(Boolean),
    );
  }

  /** Passe les programmes chargés à un autre simulateur (qui les reçoit par le bus), puis l'affiche. */
  function handOver(target, path) {
    const { programs } = session;
    setPrograms([]);
    ctx.bus.emit('simulator:load', { target, programs });
    ctx.ui.navigate(path);
  }

  /** Texte d'un programme enregistré (celui en cours d'édition s'il est ouvert dans l'éditeur). */
  const textOf = (program) => (ctx.workspace.current?.id === program.id ? ctx.workspace.text : program.content);

  /** Choix des programmes à charger (dans l'ordre où on les coche), ou d'un fichier. */
  async function pickPrograms() {
    pause();
    const all = await ctx.workspace.list();
    const order = [];
    const counter = h('span', { class: 'sim-note' });
    const refresh = () => {
      counter.textContent = order.length ? `${order.length} sélectionné${order.length > 1 ? 's' : ''} — ils seront exécutés dans l’ordre de sélection.` : 'Cochez un ou plusieurs programmes.';
      for (const box of list.querySelectorAll('input')) box.closest('label').dataset.rank = order.includes(box.value) ? String(order.indexOf(box.value) + session.programs.length + 1) : '';
    };
    const list = h(
      'div',
      { class: 'sim-pick-list' },
      all.map((program) =>
        h(
          'label',
          { class: 'sim-pick' },
          h('input', {
            type: 'checkbox',
            value: program.id,
            onchange: (event) => {
              if (event.target.checked) order.push(program.id);
              else order.splice(order.indexOf(program.id), 1);
              refresh();
            },
          }),
          h('span', { class: 'sim-pick-name' }, program.name),
          h('small', null, formatRelativeTime(program.updatedAt)),
        ),
      ),
    );
    let file = null;
    const fileButton = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-small',
        dataset: { action: 'sim-load-file' },
        onclick: async () => {
          const picked = await pickFile();
          if (!picked) return;
          file = { id: null, name: picked.name.replace(/\.[^.]+$/, '') || picked.name, text: await readTextFile(picked) };
          fileButton.closest('dialog')?.close('file');
        },
      },
      icon('upload'),
      'Depuis un fichier…',
    );
    refresh();
    const choice = await ctx.ui.openDialog({
      title: session.programs.length ? 'Ajouter des programmes' : 'Charger des programmes',
      className: 'dialog-wide',
      body: h('div', { class: 'cycle-form' }, all.length ? list : h('p', null, 'Aucun programme enregistré.'), counter, h('div', null, fileButton)),
      actions: [{ label: 'Charger', value: 'ok', primary: true }, { label: 'Annuler' }],
      validate: (value) => (value === 'ok' && !order.length ? 'Cochez au moins un programme.' : null),
    });
    const added = choice === 'file' && file ? [file] : choice === 'ok' ? order.map((id) => all.find((p) => p.id === id)).map((p) => ({ id: p.id, name: p.name, text: textOf(p) })) : [];
    if (!added.length) return;
    const free = MAX_PROGRAMS - session.programs.length;
    if (added.length > free) ctx.ui.toast(`${MAX_PROGRAMS} programmes au plus : seuls les ${free} premiers sont chargés.`);
    // Smartphone : liste repliée après le chargement, pour voir le dessin sans défiler.
    if (window.matchMedia('(max-width: 719px)').matches) programsEl.open = false;
    setPrograms([...session.programs, ...added.slice(0, free)]);
  }

  /** Reprend le texte enregistré des programmes chargés (après modification dans l'éditeur). */
  async function reloadPrograms() {
    const all = await ctx.workspace.list();
    const missing = [];
    const programs = session.programs.map((p) => {
      const saved = p.id && all.find((o) => o.id === p.id);
      if (!saved) {
        if (p.id) missing.push(p.name);
        return p;
      }
      return { ...p, name: saved.name, text: textOf(saved) };
    });
    setPrograms(programs);
    ctx.ui.toast(missing.length ? `Introuvable${missing.length > 1 ? 's' : ''} : ${missing.join(', ')}.` : 'Programmes rechargés.', { type: missing.length ? 'error' : 'success' });
  }

  /** Bouton de l'éditeur : charge le programme ouvert (remplace sa copie s'il y est déjà). */
  function simulateCurrent() {
    const current = ctx.workspace.current;
    if (current) {
      const entry = { id: current.id, name: current.name, text: ctx.workspace.text };
      const at = session.programs.findIndex((p) => p.id === current.id);
      setPrograms(at >= 0 ? session.programs.map((p, i) => (i === at ? { ...p, ...entry } : p)) : [entry]);
    }
    ctx.ui.navigate(config.path);
  }

  /** Rapides du diamant à travers la meule. */
  function wheelCollisions({ moves, material }) {
    const probe = createWheelMaterial(material.zMax, -material.bottom, { maxPixels: 900 });
    probe.reset();
    const found = [];
    for (const move of moves) {
      const shape = diamondShape(move.diamond);
      for (let i = 1; i < move.points.length; i++) {
        const a = { z: move.points[i - 1].z, r: move.points[i - 1].x / 2 };
        const b = { z: move.points[i].z, r: move.points[i].x / 2 };
        if (move.kind === 'rapid' && probe.hitsAlong(a, b)) {
          found.push({ line: move.line, program: move.program, message: 'Rapide G0 à travers la meule : le diamant toucherait la meule (vérifiez l’approche ou le dégagement).', kind: 'collision' });
          break;
        }
        probe.sweep(a, b, shape);
      }
    }
    return found.filter((w, i, all) => all.findIndex((o) => sameBlock(o, w)) === i);
  }

  /** Affichage d'une simulation (re)calculée. */
  function show() {
    renderAxes();
    renderAlerts();
    renderTools();
    renderVariables();
    scene.material.reset(stockColor());
    erased = { index: 0, fraction: 0 };
    time = 0;
    view.setScene(scene);
    update();
  }

  const stockColor = () => getComputedStyle(document.documentElement).getPropertyValue('--sim-stock').trim() || '#9aa5b4';

  /**
   * Passage complet hors écran : rapides qui traversent de la matière, pointe dans les mors.
   * (Les déplacements de travail enlèvent la matière : c'est leur rôle.)
   */
  function collisions({ moves, stock, sides }) {
    const found = [];
    const probe = createMaterial(stock, { maxPixels: 900 });
    probe.reset();
    const zGrip = stock.face - stock.length + stock.grip;
    const jaw = Math.max(6, stock.diameter * 0.175);
    for (const move of moves) {
      const shape = shapeFor(move, sides[move.tool ?? '']);
      for (let i = 1; i < move.points.length; i++) {
        const a = { z: move.points[i - 1].z, r: move.points[i - 1].x / 2 };
        const b = { z: move.points[i].z, r: move.points[i].x / 2 };
        if (move.kind === 'rapid' && probe.hitsAlong(a, b)) {
          found.push({ line: move.line, program: move.program, message: 'Rapide G0 à travers la matière : collision probable (vérifiez le point d’approche ou le dégagement).', kind: 'collision' });
          break;
        }
        const inJaws = [a, b].some((p) => p.z < zGrip && Math.abs(p.r) < stock.diameter / 2 + jaw && Math.abs(p.r) > stock.diameter / 2 - 0.5);
        if (inJaws && stock.grip > 0) {
          found.push({ line: move.line, program: move.program, message: 'L’outil entre dans la zone des mors du mandrin.', kind: 'collision' });
          break;
        }
        probe.sweep(a, b, shape);
      }
    }
    return found.filter((w, i, all) => all.findIndex((o) => sameBlock(o, w) && o.message === w.message) === i);
  }

  /** « Ligne 12 », ou « PROG2 · ligne 12 » si plusieurs programmes sont chargés. */
  const where = (item) => (session.programs.length > 1 ? `${session.programs[item.program ?? 0]?.name} · ligne ${item.line}` : `Ligne ${item.line}`);

  function renderAlerts() {
    const list = scene.warnings;
    alertsEl.hidden = !list.length;
    alertsEl.replaceChildren(
      h('summary', null, icon('warning'), `${list.length} alerte${list.length > 1 ? 's' : ''}`),
      h(
        'ul',
        null,
        list.map((w) =>
          h(
            'li',
            { class: w.kind === 'collision' ? 'is-collision' : '' },
            h('button', { type: 'button', class: 'sim-alert', onclick: () => leave(w) }, h('strong', null, where(w)), ` ${w.message}`),
          ),
        ),
      ),
    );
  }

  /**
   * Outils : côté de travail (deviné ou choisi) et temps d'usinage de chacun. En taillage de
   * meule : temps par programme et diamant (le diamant se choisit dans la liste des programmes).
   */
  function renderTools() {
    const { moves, timeline } = scene;
    const time = (keep, kind) => moves.reduce((sum, m, i) => sum + (keep(m) && (!kind || m.kind === kind) ? timeline.durations[i] : 0), 0);
    const times = (keep) => [h('td', null, formatDuration(time(keep, 'cut'))), h('td', null, formatDuration(time(keep, 'rapid')))];
    let head;
    let rows;
    if (scene.wheel) {
      head = ['Programme', 'Diamant'];
      rows = session.programs.map((program, index) => {
        const used = [...new Set(moves.filter((m) => m.program === index && m.kind === 'cut').map((m) => DIAMONDS[m.diamond].short))];
        return h('tr', null, h('td', null, program.name), h('td', null, used.join(', ') || '—'), times((m) => m.program === index));
      });
    } else {
      const { autoSides, overrides } = scene;
      const SIDES = { external: 'Extérieur', internal: 'Intérieur' };
      const tools = Object.keys(autoSides).filter((tool) => tool && moves.some((m) => m.tool === tool && m.kind === 'cut'));
      head = ['Outil', 'Côté'];
      rows = tools.map((tool) => {
        const select = h(
          'select',
          {
            class: 'input sim-side',
            'aria-label': `Côté de travail de ${tool}`,
            dataset: { tool },
            onchange: () => {
              const next = { ...(ctx.kv.get(sidesKey(), {}) ?? {}) };
              if (select.value === 'auto') delete next[tool];
              else next[tool] = select.value;
              ctx.kv.set(sidesKey(), next);
              load({ force: true });
            },
          },
          h('option', { value: 'auto' }, `Auto (${SIDES[autoSides[tool]].toLowerCase()})`),
          Object.entries(SIDES).map(([value, label]) => h('option', { value }, label)),
        );
        select.value = overrides[tool] ?? 'auto';
        return h('tr', null, h('td', { class: 'mono' }, tool), h('td', null, select), times((m) => m.tool === tool));
      });
    }
    toolsEl.hidden = !rows.length;
    toolsEl.replaceChildren(
      h('summary', null, icon('clock'), `${scene.wheel ? 'Programmes' : 'Outils'} et temps (${formatDuration(timeline.total)})`),
      h('table', { class: 'sim-tool-table' }, h('thead', null, h('tr', null, [...head, 'Travail', 'Rapides'].map((label) => h('th', null, label)))), h('tbody', null, rows)),
      h('p', { class: 'sim-note' }, 'Temps estimé sans accélérations ni changements d’outil ; rapides à la vitesse réglée dans Paramètres.'),
    );
  }

  /** Variables #… à la fin de la simulation (partagées entre les programmes enchaînés). */
  function renderVariables() {
    // Plusieurs programmes : valeurs à la fin de chacun (« Après 1 » = ce que reçoit le programme 2).
    const snapshots = scene.snapshots?.length ? scene.snapshots : [scene.variables];
    const several = snapshots.length > 1;
    const indices = [...new Set(snapshots.flatMap((values) => [...values].filter(([, v]) => v != null).map(([index]) => index)))].sort((a, b) => a - b);
    variablesEl.hidden = !indices.length;
    const format = (v) => (v == null ? '—' : String(Math.round(v * 10000) / 10000).replace('.', ','));
    variablesEl.replaceChildren(
      ...[
        h('summary', null, icon('variable'), `${several ? 'Variables après chaque programme' : 'Variables en fin de simulation'} (${indices.length})`),
        h(
          'div',
          { class: 'sim-table-scroll' },
          h(
            'table',
            { class: 'sim-tool-table sim-var-table' },
            several ? h('thead', null, h('tr', null, h('th', null, 'Variable'), session.programs.map((program, i) => h('th', { title: program.name }, `Après ${i + 1}`)))) : null,
            h('tbody', null, indices.map((index) => h('tr', null, h('td', { class: 'mono' }, `#${index}`), snapshots.map((values) => h('td', { class: 'mono' }, format(values.get(index))))))),
          ),
        ),
        several ? h('p', { class: 'sim-note' }, 'Rien n’est remis à zéro entre deux programmes : la colonne « Après 1 » donne les valeurs que reçoit le programme 2, et ainsi de suite (— : variable vide).') : null,
      ].filter(Boolean),
    );
  }

  /** Efface la matière jusqu'à la position courante (en repartant du brut si on recule). */
  function advanceMaterial(to) {
    const { material, timeline, moves } = scene;
    if (to.index < erased.index || (to.index === erased.index && to.fraction < erased.fraction)) {
      material.reset(stockColor());
      erased = { index: 0, fraction: 0 };
    }
    for (let i = erased.index; i <= to.index && i < moves.length; i++) {
      const from = i === erased.index ? erased.fraction : 0;
      const until = i === to.index ? to.fraction : 1;
      if (until <= from) continue;
      const points = timeline.partial(i, until, from);
      const shape = scene.shapeOf ? scene.shapeOf(moves[i]) : shapeFor(moves[i], scene.sides[moves[i].tool ?? '']);
      for (let k = 1; k < points.length; k++) material.sweep({ z: points[k - 1].z, r: points[k - 1].x / 2 }, { z: points[k].z, r: points[k].x / 2 }, shape);
    }
    erased = { ...to };
  }

  function update() {
    if (!scene) return;
    const { timeline, moves } = scene;
    const at = time >= timeline.total && !moves.length ? { index: -1, fraction: 0 } : timeline.locate(time);
    if (at.index >= 0) advanceMaterial(at);
    view.setProgress(at);
    range.value = timeline.total ? Math.round((time / timeline.total) * 1000) : 0;
    timeEl.textContent = `${formatDuration(time)} / ${formatDuration(timeline.total)}`;
    const move = moves[at.index];
    currentMove = move ?? null;
    statusEl.textContent = move
      ? [where(move), move.tool, move.kind === 'rapid' ? 'rapide' : move.feed ? `F${move.feed}` : null, move.speed ? `${move.speedMode === 'css' ? 'G96' : 'G97'} S${move.speed}` : null].filter(Boolean).join(' · ')
      : moves.length
        ? 'Prêt'
        : 'Aucun déplacement à simuler';
    blockEl.replaceChildren(move ? highlightCode((scene.programLines[move.program ?? 0]?.[move.line - 1] ?? '').trim(), codes) : '');
    playButton.replaceChildren(icon(playing ? 'pause' : 'play'), playing ? 'Pause' : time >= timeline.total && time > 0 ? 'Rejouer' : 'Lecture');
  }

  function tick(now) {
    if (!playing) return;
    const elapsed = Math.min(0.25, (now - lastTick) / 1000); // secondes réelles (plafonnées)
    lastTick = now;
    time = Math.min(scene.timeline.total, time + (elapsed / 60) * speed);
    update();
    if (time >= scene.timeline.total) return pause();
    frame = requestAnimationFrame(tick);
  }

  function play() {
    if (!scene?.moves.length) return;
    if (time >= scene.timeline.total) time = 0;
    playing = true;
    lastTick = performance.now();
    update();
    frame = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(frame);
    update();
  }
  function seek(t) {
    if (!scene) return;
    time = Math.max(0, Math.min(scene.timeline.total, t));
    update();
  }

  /** Bloc suivant / précédent : fin du bloc courant ou du bloc d'avant (ligne différente). */
  function stepBlock(delta) {
    if (!scene?.moves.length) return;
    pause();
    const { moves, timeline } = scene;
    const { index } = timeline.locate(time);
    const endOf = (i) => {
      let j = i;
      while (j + 1 < moves.length && sameBlock(moves[j + 1], moves[i])) j++;
      return j;
    };
    if (delta > 0) {
      let j = endOf(index);
      const atEnd = time >= timeline.starts[j] + timeline.durations[j] - 1e-12;
      if (atEnd && j + 1 < moves.length) j = endOf(j + 1);
      seek(timeline.starts[j] + timeline.durations[j]);
    } else {
      let i = index;
      while (i > 0 && sameBlock(moves[i - 1], moves[index])) i--;
      if (time <= timeline.starts[i] + 1e-12 && i > 0) {
        i -= 1;
        while (i > 0 && sameBlock(moves[i - 1], moves[i])) i--;
      }
      seek(timeline.starts[i]);
    }
  }

  /**
   * Retour à l'éditeur sur la ligne en cours (ou celle d'une alerte), dans son programme : il
   * est ouvert s'il ne l'est pas déjà (un programme chargé depuis un fichier n'y est pas).
   */
  async function leave(item = currentMove) {
    pause();
    const program = item ? session.programs[item.program ?? 0] : null;
    if (program?.id && ctx.workspace.current?.id !== program.id) {
      const all = await ctx.workspace.list();
      if (!all.some((p) => p.id === program.id)) ctx.ui.toast(`« ${program.name} » n’existe plus dans vos programmes.`, { type: 'error' });
      else if (!(await switchProgram(ctx.workspace, program.id))) return;
    }
    const line = program?.id && ctx.workspace.current?.id === program.id ? item.line : 0;
    if (line > 0) {
      const doc = editor.view.state.doc;
      const target = doc.line(Math.min(line, doc.lines));
      editor.view.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: 'center' }) });
    }
    ctx.ui.navigate('/editeur');
  }

  /** Champ numérique ou liste de choix des dialogues Brut / Meule. */
  const numberField = (field, value, inputs) => {
    inputs[field.key] = h('input', { class: 'input mono', inputmode: 'decimal', autocomplete: 'off', name: field.key, value: String(value).replace('.', ',') });
    return h('div', { class: 'field cycle-field' }, h('label', null, field.label), h('div', { class: 'calc-input' }, inputs[field.key], h('span', { class: 'calc-unit-text' }, field.unit)), field.hint ? h('small', null, field.hint) : null);
  };
  const selectField = (key, label, options, value, inputs, hint) => {
    inputs[key] = h('select', { class: 'input', name: key }, Object.entries(options).map(([v, text]) => h('option', { value: v }, text)));
    inputs[key].value = value;
    return h('div', { class: 'field cycle-field' }, h('label', null, label), inputs[key], hint ? h('small', null, hint) : null);
  };
  const readNumbers = (inputs, keys) => Object.fromEntries(keys.map((key) => [key, Number(inputs[key].value.replace(',', '.'))]));

  /** Tour : brut des programmes chargés (mémorisé pour le 1er programme). */
  async function editStock() {
    if (!scene) return;
    pause();
    const { stock } = scene;
    const inputs = {};
    const custom = ctx.kv.get(stockKey(), null);
    const choice = await ctx.ui.openDialog({
      title: 'Brut',
      className: 'dialog-wide',
      body: h(
        'div',
        { class: 'cycle-form' },
        h('p', { class: 'card-description' }, 'La barre avant usinage, pour dessiner la matière. Astuce : écrivez-la dans le programme, par exemple ', h('code', null, '(BRUT D50 X 80)'), ' — diamètre 50, longueur 80 ; pré-percée : ', h('code', null, '(BRUT D50 X 80 PERCE D20 P30)'), ' — trou Ø20 sur 30 mm.'),
        h('div', { class: 'cycle-fields' }, STOCK_FIELDS.map((field) => numberField(field, stock[field.key], inputs))),
      ),
      actions: [{ label: 'Appliquer', value: 'ok', primary: true }, ...(custom ? [{ label: 'Reprendre celui du programme', value: 'reset' }] : []), { label: 'Annuler' }],
    });
    if (choice === 'reset') ctx.kv.remove(stockKey());
    else if (choice === 'ok') ctx.kv.set(stockKey(), sanitizeStock(readNumbers(inputs, STOCK_FIELDS.map((f) => f.key)), stock));
    else return;
    load({ force: true });
  }

  /**
   * Taillage : largeur de la meule et diamant par défaut (pour les programmes chargés), puis
   * réglages de la machine (pour tous les programmes) : origine du diamant droit, cotes X, sens
   * de X+ et sens de Z+ de chaque diamant.
   */
  async function editWheel() {
    if (!scene) return;
    pause();
    const wheel = scene.wheelSettings;
    const inputs = {};
    const custom = ctx.kv.get(wheelKey(), null) || ctx.kv.get(`simulation.wheel.${sessionId()}`, null);
    const choice = await ctx.ui.openDialog({
      title: 'Meule et diamants',
      className: 'dialog-wide',
      body: h(
        'div',
        { class: 'cycle-form' },
        h(
          'p',
          { class: 'card-description' },
          'Vue de dessus, en miroir comme à la machine : meule au-dessus, diamant en dessous. Astuce : ',
          h('code', null, '(MEULE L40)'),
          ' dans le programme donne la largeur ; ',
          h('code', null, 'T0202 (DIAMANT FLANC GAUCHE)'),
          ' choisit le diamant de l’outil.',
        ),
        h('h3', { class: 'sim-form-title' }, 'Programmes chargés'),
        h(
          'div',
          { class: 'cycle-fields' },
          numberField({ key: 'width', label: 'Largeur de la meule', unit: 'mm' }, wheel.width, inputs),
          selectField('diamond', 'Diamant par défaut', Object.fromEntries(Object.entries(DIAMONDS).map(([k, d]) => [k, d.label])), wheel.diamond, inputs, 'Chaque programme chargé peut avoir le sien (liste « Programmes chargés »).'),
        ),
        h('h3', { class: 'sim-form-title' }, 'Machine (tous les programmes)'),
        h('p', { class: 'sim-note' }, 'Chaque diamant a son repère : origine (flanc gauche : angle gauche ; flanc droit : angle droit) et sens de Z+. Deux diamants en miroir ont chacun Z+ vers l’intérieur de la meule.'),
        h(
          'div',
          { class: 'cycle-fields' },
          selectField('straightOrigin', 'Origine du diamant droit', ORIGINS, wheel.straightOrigin, inputs),
          selectField('xMode', 'Cotes X des programmes', X_MODES, wheel.xMode, inputs),
          selectField('xDirection', 'Sens de X+ (tous les diamants)', X_CHOICES, wheel.invertX ? 'toward' : 'away', inputs),
          Object.keys(Z_SETTING).map((kind) => selectField(Z_SETTING[kind], `Sens de Z+ — diamant ${DIAMONDS[kind].short}`, Z_CHOICES, wheel.zDirections[kind], inputs)),
        ),
      ),
      actions: [{ label: 'Appliquer', value: 'ok', primary: true }, ...(custom ? [{ label: 'Reprendre la largeur du programme', value: 'reset' }] : []), { label: 'Annuler' }],
    });
    if (choice === 'reset') {
      ctx.kv.remove(wheelKey());
      ctx.kv.remove(`simulation.wheel.${sessionId()}`);
    } else if (choice === 'ok') {
      const { width } = sanitizeWheel({ width: readNumbers(inputs, ['width']).width });
      ctx.kv.set(wheelKey(), { width, diamond: inputs.diamond.value });
      for (const name of ['straightOrigin', 'xMode', 'xDirection', ...Object.values(Z_SETTING)]) ctx.settings.set(`${prefix}.${name}`, inputs[name].value);
    } else return;
    load({ force: true });
  }

  ctx.ui.addPage({
    id: config.id,
    path: config.path,
    label: config.label,
    title: config.title,
    icon: config.icon,
    order: config.order,
    section: 'simulateur',
    mount: build,
    onShow: () => {
      load();
      page.focus({ preventScroll: true });
    },
  });
  ctx.listen(window, 'hashchange', () => {
    if (!location.hash.startsWith(`#${config.path}`)) pause();
  });
  // Programmes passés par l'autre simulateur (programme de taillage chargé dans le simulateur tour…).
  ctx.bus.on('simulator:load', ({ target, programs }) => target === config.id && setPrograms(programs));
  const reloadingSettings = dressing ? ['rapidRate', 'xMode', 'xDirection', 'straightOrigin', ...Object.values(Z_SETTING)] : ['rapidRate', 'turret'];
  for (const name of reloadingSettings) ctx.settings.subscribe(`${prefix}.${name}`, scheduleLoad);
  ctx.settings.subscribe('theme', () => {
    if (!scene) return;
    view.refreshColors();
    scene.material.reset(stockColor());
    erased = { index: 0, fraction: 0 };
    update();
  });
  ctx.onDispose(() => cancelAnimationFrame(frame));
  ctx.ui.toolbar.add({ id: config.id, icon: config.icon, label: config.toolbar.label, title: config.toolbar.title, order: config.toolbar.order, onClick: simulateCurrent });
}
