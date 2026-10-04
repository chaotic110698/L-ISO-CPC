import { EditorView } from '@codemirror/view';
import { h } from '../../core/dom.js';
import { REFERENCE, simulate, toolSides } from '../../engine/index.js';
import { highlightCode } from '../../ui/code-view.js';
import { icon } from '../../ui/icons.js';
import { segmented } from '../../ui/segmented.js';
import { createMaterial, createWheelMaterial, shapeFor } from './material.js';
import { createTimeline, formatDuration } from './playback.js';
import { guessStock, parseStock, sanitizeStock } from './stock.js';
import { createView } from './view.js';
import { DIAMONDS, ORIGINS, WHEEL_DEFAULTS, diamondFromComment, diamondShape, isDressingProgram, originZ, parseWheel, sanitizeWheel, toWheelMoves } from './wheel.js';

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

/**
 * Simulation 2D du tournage : le programme de l'éditeur est interprété (moteur toolpath), puis
 * l'usinage est animé — enlèvement de matière, trajet, outil — avec lecture, pause, vitesse,
 * bloc par bloc, retour à l'éditeur sur la ligne en cours, et alertes (rapide dans la matière,
 * arc impossible, avance absente…).
 */
export default {
  id: 'simulation',
  label: 'Simulation 2D (tournage)',
  description:
    'Usinage animé du programme ouvert : brut (lu dans un commentaire « (BRUT D50 X 80) » ou saisi), enlèvement de matière, trajet de l’outil, temps estimé, alertes (rapide G0 dans la matière, arc impossible, avance absente…). Lecture, pause, vitesse, bloc par bloc, zoom à deux doigts.',
  group: 'analyse',
  where: 'Menu latéral « Simulation 2D », bouton de la barre d’outils de l’éditeur',
  settings: [
    {
      key: 'simulation.turret',
      type: 'choice',
      label: 'Position de l’outil (simulation)',
      options: [
        { value: 'rear', label: 'Derrière l’axe (tourelle arrière)' },
        { value: 'front', label: 'Devant l’axe (tourelle avant)' },
      ],
      default: 'rear',
    },
    { key: 'simulation.rapidRate', type: 'number', label: 'Vitesse des rapides (estimation du temps)', unit: 'mm/min', min: 1000, max: 60000, step: 1000, default: 10000 },
  ],
  activate(ctx) {
    const { editor, codes } = ctx;
    let page = null;
    let scene = null;
    let sourceText = null;
    let time = 0;
    let playing = false;
    let frame = 0;
    let lastTick = 0;
    let erased = { index: 0, fraction: 0 }; // matière effacée jusqu'à ce point du trajet
    let speed = ctx.kv.get('simulation.speed', 20);
    let currentLine = 0;

    const canvas = h('canvas', { class: 'sim-canvas', 'aria-label': 'Simulation de l’usinage' });
    const view = createView(canvas, { onPick: (index) => seek(scene.timeline.starts[index] + scene.timeline.durations[index] * 0.999) });
    const titleEl = h('h1', { class: 'console-title' });
    const statusEl = h('p', { class: 'console-counter', 'aria-live': 'off' });
    const blockEl = h('div', { class: 'sim-block mono' });
    const timeEl = h('span', { class: 'sim-time' });
    const range = h('input', { type: 'range', class: 'sim-range', min: 0, max: 1000, value: 0, 'aria-label': 'Avancement', oninput: () => seek((range.value / 1000) * (scene?.timeline.total ?? 0)) });
    const playButton = h('button', { type: 'button', class: 'btn btn-primary sim-play', dataset: { action: 'sim-play' }, onclick: () => (playing ? pause() : play()) });
    const alertsEl = h('details', { class: 'sim-alerts', hidden: true });
    const toolsEl = h('details', { class: 'sim-tools', hidden: true });
    // Taillage de meule : sens des axes selon la machine (le trièdre diffère d'une machine à l'autre).
    const axisButton = (axis) =>
      h('button', { type: 'button', class: 'btn btn-small sim-axis', dataset: { action: `sim-invert-${axis.toLowerCase()}` }, title: `Inverser le sens de ${axis}+`, 'aria-pressed': 'false', onclick: () => invertAxis(axis) }, `${axis}+ ${axis === 'X' ? '⇅' : '⇄'}`);
    const axesEl = h('div', { class: 'sim-axes', hidden: true, role: 'group', 'aria-label': 'Sens des axes' }, axisButton('X'), axisButton('Z'));
    const stockEl = h('span', { class: 'sim-stock' });

    const iconButton = (name, label, action, onclick) => h('button', { type: 'button', class: 'icon-btn sim-btn', title: label, 'aria-label': label, dataset: { action }, onclick }, icon(name));
    const speedControl = segmented({
      label: 'Vitesse de lecture',
      options: SPEEDS,
      value: speed,
      onChange: (value) => {
        speed = value;
        ctx.kv.set('simulation.speed', value);
      },
    });

    function build() {
      page = h(
        'section',
        { class: 'sim-page', 'aria-label': 'Simulation 2D' },
        h(
          'header',
          { class: 'console-header' },
          h('div', { class: 'console-heading' }, titleEl, statusEl),
          h(
            'div',
            { class: 'sim-header-actions' },
            h('button', { type: 'button', class: 'btn btn-small', dataset: { action: 'sim-stock' }, onclick: editStock }, stockEl),
            h('button', { type: 'button', class: 'btn btn-small', dataset: { action: 'sim-leave' }, onclick: () => leave() }, icon('code'), h('span', { class: 'sim-hide-narrow' }, 'Éditeur')),
          ),
        ),
        h('div', { class: 'sim-stage' }, canvas, iconButton('fold', 'Ajuster la vue (double-tap)', 'sim-fit', () => view.fit()), axesEl),
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
          h('div', { class: 'sim-panels' }, toolsEl, alertsEl),
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

    const stockKey = () => `simulation.stock.${ctx.workspace.current?.id ?? 'sans-id'}`;
    const sidesKey = () => `simulation.sides.${ctx.workspace.current?.id ?? 'sans-id'}`;
    const machineKey = () => `simulation.machine.${ctx.workspace.current?.id ?? 'sans-id'}`;
    const wheelKey = () => `simulation.wheel.${ctx.workspace.current?.id ?? 'sans-id'}`;
    const diamondsKey = () => `simulation.diamonds.${ctx.workspace.current?.id ?? 'sans-id'}`;
    /** Machine du programme : choisie, sinon « taillage » si un commentaire parle de meule ou de diamant. */
    const machineOf = (lines) => ctx.kv.get(machineKey(), null) ?? (isDressingProgram(lines) ? 'dressing' : 'lathe');

    /** (Re)calcule la simulation si le texte du programme a changé. */
    function load({ force = false } = {}) {
      const text = editor.view.state.doc.toString();
      titleEl.textContent = ctx.workspace.current?.name ?? 'Programme';
      if (!force && scene && text === sourceText) return;
      sourceText = text;
      const lines = text.split('\n');
      const result = simulate(lines, codes);
      if (machineOf(lines) === 'dressing') return loadDressing(lines, result);
      const fromProgram = parseStock(lines);
      const fallback = fromProgram ?? guessStock(result.moves);
      const saved = ctx.kv.get(stockKey(), null);
      const stock = sanitizeStock(saved ?? fallback, fallback);
      const material = createMaterial(stock);
      const timeline = createTimeline(result.moves, { rapidRate: ctx.settings.get('simulation.rapidRate') });
      const autoSides = toolSides(result.moves);
      const overrides = ctx.kv.get(sidesKey(), {}) ?? {};
      const sides = Object.fromEntries(Object.entries(autoSides).map(([tool, side]) => [tool, overrides[tool] ?? side]));
      scene = { ...result, lines, stock, material, timeline, sides, autoSides, overrides, front: ctx.settings.get('simulation.turret') === 'front', stockSource: saved ? 'saisi' : fromProgram ? 'programme' : 'estimé' };
      scene.warnings = [...result.warnings, ...collisions(scene)].sort((a, b) => a.line - b.line);
      stockEl.replaceChildren(icon('edit'), `Brut Ø${stock.diameter} × ${stock.length}${stock.bore > 0 ? ` · int. Ø${stock.bore}` : ''}`);
      show();
    }

    /**
     * Taillage de meule : le programme pilote le diamant ; ses cotes sont ramenées dans le repère
     * de la meule (origine du diamant : angle gauche, angle droit ou milieu), vue de dessus.
     */
    function loadDressing(lines, result) {
      const fromProgram = parseWheel(lines);
      const saved = ctx.kv.get(wheelKey(), null);
      const wheel = sanitizeWheel({ ...WHEEL_DEFAULTS, ...(fromProgram ?? {}), ...(saved ?? {}) });
      // Diamant de chaque outil : commentaire de sa ligne (« DIAMANT FLANC GAUCHE »), sinon celui par défaut.
      const autoSides = { '': wheel.diamond };
      for (const tool of result.tools) autoSides[tool.word] ??= diamondFromComment(lines[tool.line - 1]) ?? wheel.diamond;
      const overrides = ctx.kv.get(diamondsKey(), {}) ?? {};
      const diamondOf = (tool) => overrides[tool] ?? autoSides[tool] ?? wheel.diamond;
      // Sans le premier rapide depuis le point de départ fictif du tour (X200 Z150) : sans objet ici.
      const programMoves = result.moves[0]?.kind === 'rapid' && result.moves[0].points[0].x === REFERENCE.x && result.moves[0].points[0].z === REFERENCE.z ? result.moves.slice(1) : result.moves;
      const moves = toWheelMoves(programMoves, wheel, diamondOf);
      const deepest = Math.min(0, ...moves.filter((m) => m.kind === 'cut').flatMap((m) => m.points.map((p) => p.x / 2)));
      const depth = Math.max(10, wheel.width * 0.4, -deepest + 4);
      const material = createWheelMaterial(wheel.width, depth);
      const timeline = createTimeline(moves, { rapidRate: ctx.settings.get('simulation.rapidRate') });
      const used = [...new Set(moves.filter((m) => m.kind === 'cut').map((m) => m.diamond))];
      // Origines des diamants utilisés (plusieurs diamants peuvent partager le même angle).
      const byZ = new Map();
      for (const kind of used.length ? used : [wheel.diamond]) byZ.set(originZ(kind, wheel), [...(byZ.get(originZ(kind, wheel)) ?? []), DIAMONDS[kind].short]);
      const origins = [...byZ].map(([z, names]) => ({ z, label: `X0 Z0 · diamant${names.length > 1 ? 's' : ''} ${names.join(', ')}` }));
      scene = {
        ...result,
        moves,
        lines,
        wheel: true,
        wheelSettings: wheel,
        material,
        timeline,
        origins,
        autoSides,
        overrides,
        shapeOf: (move) => diamondShape(move.diamond),
        front: true, // miroir : meule au-dessus, diamant en dessous (repère des opérateurs)
        stockSource: saved ? 'saisi' : fromProgram ? 'programme' : 'estimé',
      };
      // Alertes propres au tour sans objet ici : broche de la meule, X négatif (= dans la meule).
      const own = result.warnings.filter((w) => !/broche arrêtée|diamètre négatif/.test(w.message));
      scene.warnings = [...own, ...wheelCollisions(scene)].sort((a, b) => a.line - b.line);
      stockEl.replaceChildren(icon('edit'), `Meule L${wheel.width}`);
      show();
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
            found.push({ line: move.line, message: 'Rapide G0 à travers la meule : le diamant toucherait la meule (vérifiez l’approche ou le dégagement).', kind: 'collision' });
            break;
          }
          probe.sweep(a, b, shape);
        }
      }
      return found.filter((w, i, all) => all.findIndex((o) => o.line === w.line) === i);
    }

    /** Inverse le sens d'un axe (X ou Z) pour ce programme, puis recalcule. */
    function invertAxis(axis) {
      const key = axis === 'X' ? 'invertX' : 'invertZ';
      const current = scene.wheelSettings ?? sanitizeWheel(WHEEL_DEFAULTS);
      // Seul le sens est mémorisé : la largeur lue dans le programme reste prise en compte.
      ctx.kv.set(wheelKey(), { ...(ctx.kv.get(wheelKey(), null) ?? {}), [key]: !current[key] });
      load({ force: true });
    }

    /** Affichage d'une simulation (re)calculée. */
    function show() {
      axesEl.hidden = !scene.wheel;
      if (scene.wheel) {
        axesEl.querySelector('[data-action="sim-invert-x"]').setAttribute('aria-pressed', String(scene.wheelSettings.invertX));
        axesEl.querySelector('[data-action="sim-invert-z"]').setAttribute('aria-pressed', String(scene.wheelSettings.invertZ));
      }
      const { material } = scene;
      renderAlerts();
      renderTools();
      material.reset(stockColor());
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
            found.push({ line: move.line, message: 'Rapide G0 à travers la matière : collision probable (vérifiez le point d’approche ou le dégagement).', kind: 'collision' });
            break;
          }
          const inJaws = [a, b].some((p) => p.z < zGrip && Math.abs(p.r) < stock.diameter / 2 + jaw && Math.abs(p.r) > stock.diameter / 2 - 0.5);
          if (inJaws && stock.grip > 0) {
            found.push({ line: move.line, message: 'L’outil entre dans la zone des mors du mandrin.', kind: 'collision' });
            break;
          }
          probe.sweep(a, b, shape);
        }
      }
      return found.filter((w, i, all) => all.findIndex((o) => o.line === w.line && o.message === w.message) === i);
    }

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
              h('button', { type: 'button', class: 'sim-alert', onclick: () => leave(w.line) }, h('strong', null, `Ligne ${w.line}`), ` ${w.message}`),
            ),
          ),
        ),
      );
    }

    /** Outils : côté de travail (deviné ou choisi) et temps d'usinage de chacun. */
    function renderTools() {
      const { moves, timeline, autoSides, overrides } = scene;
      const tools = Object.keys(autoSides).filter((tool) => tool && moves.some((m) => m.tool === tool && m.kind === 'cut'));
      toolsEl.hidden = !tools.length;
      const time = (tool, kind) => moves.reduce((sum, m, i) => sum + (m.tool === tool && (!kind || m.kind === kind) ? timeline.durations[i] : 0), 0);
      const SIDES = scene.wheel ? Object.fromEntries(Object.entries(DIAMONDS).map(([k, d]) => [k, d.label])) : { external: 'Extérieur', internal: 'Intérieur' };
      const key = scene.wheel ? diamondsKey : sidesKey;
      toolsEl.replaceChildren(
        h('summary', null, icon('clock'), `Outils et temps (${formatDuration(timeline.total)})`),
        h(
          'table',
          { class: 'sim-tool-table' },
          h('thead', null, h('tr', null, h('th', null, 'Outil'), h('th', null, scene.wheel ? 'Diamant' : 'Côté'), h('th', null, 'Travail'), h('th', null, 'Rapides'))),
          h(
            'tbody',
            null,
            tools.map((tool) => {
              const select = h(
                'select',
                {
                  class: 'input sim-side',
                  'aria-label': scene.wheel ? `Diamant de ${tool}` : `Côté de travail de ${tool}`,
                  dataset: { tool },
                  onchange: () => {
                    const next = { ...(ctx.kv.get(key(), {}) ?? {}) };
                    if (select.value === 'auto') delete next[tool];
                    else next[tool] = select.value;
                    ctx.kv.set(key(), next);
                    load({ force: true });
                  },
                },
                h('option', { value: 'auto' }, `Auto (${SIDES[autoSides[tool]].toLowerCase()})`),
                Object.entries(SIDES).map(([value, label]) => h('option', { value }, label)),
              );
              select.value = overrides[tool] ?? 'auto';
              return h('tr', null, h('td', { class: 'mono' }, tool), h('td', null, select), h('td', null, formatDuration(time(tool, 'cut'))), h('td', null, formatDuration(time(tool, 'rapid'))));
            }),
          ),
        ),
        h('p', { class: 'sim-note' }, 'Temps estimé sans accélérations ni changements d’outil ; rapides à la vitesse réglée dans Paramètres.'),
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
      currentLine = move?.line ?? 0;
      statusEl.textContent = move
        ? [`Ligne ${move.line}`, move.tool, move.kind === 'rapid' ? 'rapide' : move.feed ? `F${move.feed}` : null, move.speed ? `${move.speedMode === 'css' ? 'G96' : 'G97'} S${move.speed}` : null].filter(Boolean).join(' · ')
        : moves.length
          ? 'Prêt'
          : 'Aucun déplacement à simuler';
      blockEl.replaceChildren(move ? highlightCode(scene.lines[move.line - 1].trim(), codes) : '');
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
        while (j + 1 < moves.length && moves[j + 1].line === moves[i].line) j++;
        return j;
      };
      if (delta > 0) {
        let j = endOf(index);
        const atEnd = time >= timeline.starts[j] + timeline.durations[j] - 1e-12;
        if (atEnd && j + 1 < moves.length) j = endOf(j + 1);
        seek(timeline.starts[j] + timeline.durations[j]);
      } else {
        let i = index;
        while (i > 0 && moves[i - 1].line === moves[index].line) i--;
        if (time <= timeline.starts[i] + 1e-12 && i > 0) {
          i -= 1;
          while (i > 0 && moves[i - 1].line === moves[i].line) i--;
        }
        seek(timeline.starts[i]);
      }
    }

    function leave(line = currentLine) {
      pause();
      if (line > 0) {
        const doc = editor.view.state.doc;
        const target = doc.line(Math.min(line, doc.lines));
        editor.view.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: 'center' }) });
      }
      ctx.ui.navigate('/editeur');
    }

    /** Champ numérique du formulaire Brut / Meule. */
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

    /**
     * Brut (tournage) ou meule (taillage) : choix de la machine pour ce programme, puis les
     * dimensions. La machine est mémorisée par programme.
     */
    async function editStock() {
      pause();
      const lines = scene.lines;
      let machine = machineOf(lines);
      const stock = scene.stock ?? guessStock(scene.moves);
      const wheel = scene.wheelSettings ?? sanitizeWheel({ ...WHEEL_DEFAULTS, ...(parseWheel(lines) ?? {}), ...(ctx.kv.get(wheelKey(), null) ?? {}) });

      const stockInputs = {};
      const lathePart = h(
        'div',
        { class: 'cycle-form', dataset: { machine: 'lathe' } },
        h('p', { class: 'card-description' }, 'La barre avant usinage, pour dessiner la matière. Astuce : écrivez-la dans le programme, par exemple ', h('code', null, '(BRUT D50 X 80)'), ' — diamètre 50, longueur 80 ; pré-percée : ', h('code', null, '(BRUT D50 X 80 PERCE D20 P30)'), ' — trou Ø20 sur 30 mm.'),
        h('div', { class: 'cycle-fields' }, STOCK_FIELDS.map((field) => numberField(field, stock[field.key], stockInputs))),
      );
      const wheelInputs = {};
      const dressingPart = h(
        'div',
        { class: 'cycle-form', dataset: { machine: 'dressing' } },
        h(
          'p',
          { class: 'card-description' },
          'Vue de dessus : la meule est un rectangle, le programme pilote le diamant. Le diamant flanc gauche a son origine sur l’angle gauche de la meule, le diamant flanc droit sur l’angle droit. Astuce : ',
          h('code', null, '(MEULE L40)'),
          ' dans le programme donne la largeur ; ',
          h('code', null, 'T0202 (DIAMANT FLANC GAUCHE)'),
          ' choisit le diamant de l’outil.',
        ),
        h(
          'div',
          { class: 'cycle-fields' },
          numberField({ key: 'width', label: 'Largeur de la meule', unit: 'mm' }, wheel.width, wheelInputs),
          selectField('diamond', 'Diamant par défaut', Object.fromEntries(Object.entries(DIAMONDS).map(([k, d]) => [k, d.label])), wheel.diamond, wheelInputs, 'Chaque outil peut avoir le sien (panneau « Outils et temps »).'),
          selectField('straightOrigin', 'Origine du diamant droit', ORIGINS, wheel.straightOrigin, wheelInputs),
          selectField('xMode', 'Cotes X du programme', { diameter: 'Au diamètre (X-0.1 : 0,05 mm à la meule)', radius: 'Au rayon (X-0.1 : 0,1 mm)' }, wheel.xMode, wheelInputs),
        ),
      );
      const showPart = () => {
        lathePart.hidden = machine !== 'lathe';
        dressingPart.hidden = machine !== 'dressing';
      };
      const machineControl = segmented({
        label: 'Machine',
        options: [
          { value: 'lathe', label: 'Tour (brut)' },
          { value: 'dressing', label: 'Taillage de meule' },
        ],
        value: machine,
        onChange: (value) => {
          machine = value;
          showPart();
        },
      });
      showPart();
      const custom = ctx.kv.get(stockKey(), null) || ctx.kv.get(wheelKey(), null) || ctx.kv.get(machineKey(), null);
      const choice = await ctx.ui.openDialog({
        title: 'Brut ou meule',
        className: 'dialog-wide',
        body: h('div', { class: 'cycle-form' }, h('div', { class: 'sim-machine' }, machineControl), lathePart, dressingPart),
        actions: [{ label: 'Appliquer', value: 'ok', primary: true }, ...(custom ? [{ label: 'Reprendre celui du programme', value: 'reset' }] : []), { label: 'Annuler' }],
      });
      if (choice === 'reset') {
        for (const key of [stockKey(), wheelKey(), machineKey()]) ctx.kv.remove(key);
      } else if (choice === 'ok') {
        ctx.kv.set(machineKey(), machine);
        if (machine === 'lathe') ctx.kv.set(stockKey(), sanitizeStock(readNumbers(stockInputs, STOCK_FIELDS.map((f) => f.key)), stock));
        else ctx.kv.set(wheelKey(), sanitizeWheel({ width: readNumbers(wheelInputs, ['width']).width, diamond: wheelInputs.diamond.value, straightOrigin: wheelInputs.straightOrigin.value, xMode: wheelInputs.xMode.value }));
      } else return;
      load({ force: true });
    }

    ctx.ui.addPage({
      id: 'simulation',
      path: '/simulation',
      label: 'Simulation 2D',
      icon: 'simulation',
      order: 24,
      mount: build,
      onShow: () => {
        load();
        page.focus({ preventScroll: true });
      },
    });
    ctx.listen(window, 'hashchange', () => {
      if (!location.hash.startsWith('#/simulation')) pause();
    });
    ctx.settings.subscribe('simulation.turret', () => scene && load({ force: true }));
    ctx.settings.subscribe('simulation.rapidRate', () => scene && load({ force: true }));
    ctx.settings.subscribe('theme', () => {
      if (!scene) return;
      view.refreshColors();
      scene.material.reset(stockColor());
      erased = { index: 0, fraction: 0 };
      update();
    });
    ctx.onDispose(() => cancelAnimationFrame(frame));
    ctx.ui.toolbar.add({ id: 'simulation', icon: 'simulation', label: 'Simuler', title: 'Simulation 2D : usinage animé du programme', order: 30, onClick: () => ctx.ui.navigate('/simulation') });
  },
};
