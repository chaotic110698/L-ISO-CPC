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
 * Simulateur 2D, section à part de l'éditeur : on y charge un ou plusieurs programmes (copie de
 * leur texte), exécutés l'un après l'autre sans remise à zéro des variables #… (taillage de
 * meule : un programme par diamant). Les programmes sont interprétés (moteur toolpath), puis
 * l'usinage est animé — enlèvement de matière, trajet, outil — avec lecture, pause, vitesse,
 * bloc par bloc, retour à l'éditeur sur la ligne en cours, et alertes (rapide dans la matière,
 * arc impossible, avance absente…).
 */
export default {
  id: 'simulation',
  label: 'Simulateur 2D (tournage, taillage de meule)',
  description:
    'Section à part : chargez un ou plusieurs programmes enregistrés (exécutés à la suite, variables # partagées — un programme par diamant en taillage de meule). Usinage animé : brut (lu dans un commentaire « (BRUT D50 X 80) » ou saisi), enlèvement de matière, trajet de l’outil, temps estimé, alertes (rapide G0 dans la matière, arc impossible, avance absente…). Lecture, pause, vitesse, bloc par bloc, zoom à deux doigts.',
  group: 'analyse',
  where: 'Menu latéral, section « Simulateur » ; bouton « Simuler » de l’éditeur (charge le programme ouvert)',
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
    let sourceKey = null;
    const SESSION_KEY = 'simulation.session';
    let session = sanitizeSession(ctx.kv.get(SESSION_KEY, null));
    let time = 0;
    let playing = false;
    let frame = 0;
    let lastTick = 0;
    let erased = { index: 0, fraction: 0 }; // matière effacée jusqu'à ce point du trajet
    let speed = ctx.kv.get('simulation.speed', 20);
    let currentMove = null;

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
    const stockButton = h('button', { type: 'button', class: 'btn btn-small', dataset: { action: 'sim-stock' }, onclick: () => editStock() }, stockEl);
    const programsEl = h('details', { class: 'sim-programs' });
    programsEl.open = ctx.kv.get('simulation.programsOpen', true) !== false;
    programsEl.addEventListener('toggle', () => session.programs.length && ctx.kv.set('simulation.programsOpen', programsEl.open));
    const emptyEl = h(
      'div',
      { class: 'sim-empty', hidden: true },
      h('p', null, 'Aucun programme chargé.'),
      h('p', { class: 'sim-note' }, 'Chargez un programme enregistré (ou un fichier). En taillage de meule, chargez un programme par diamant : ils s’exécutent l’un après l’autre, sans remise à zéro des variables.'),
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
            stockButton,
            h('button', { type: 'button', class: 'btn btn-small', title: 'Ouvrir dans l’éditeur, sur la ligne en cours', dataset: { action: 'sim-leave' }, onclick: () => leave() }, icon('code'), h('span', { class: 'sim-hide-narrow' }, 'Éditeur')),
          ),
        ),
        programsEl,
        h('div', { class: 'sim-stage' }, canvas, iconButton('fold', 'Ajuster la vue (double-tap)', 'sim-fit', () => view.fit()), axesEl, emptyEl),
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

    // Réglages (brut, machine, meule, côtés) mémorisés pour le 1er programme chargé.
    const sessionId = () => session.programs[0]?.id ?? 'sans-id';
    const stockKey = () => `simulation.stock.${sessionId()}`;
    const sidesKey = () => `simulation.sides.${sessionId()}`;
    const machineKey = () => `simulation.machine.${sessionId()}`;
    const wheelKey = () => `simulation.wheel.${sessionId()}`;
    /** Machine : choisie, sinon « taillage » si un commentaire parle de meule ou de diamant. */
    const machineOf = (lines) => ctx.kv.get(machineKey(), null) ?? (isDressingProgram(lines) ? 'dressing' : 'lathe');
    const isDressing = () => machineOf(session.programs.flatMap((p) => p.text.split('\n'))) === 'dressing';

    /** Enregistre la liste des programmes chargés et recalcule. */
    function setPrograms(programs) {
      session = sanitizeSession({ programs });
      ctx.kv.set(SESSION_KEY, session);
      load({ force: true });
    }

    /** (Re)calcule la simulation si les programmes chargés ont changé. */
    function load({ force = false } = {}) {
      const { programs } = session;
      const key = JSON.stringify(programs);
      if (!force && key === sourceKey && (scene || !programs.length)) return;
      pause();
      sourceKey = key;
      renderPrograms();
      titleEl.textContent = programs.length ? programs.map((p) => p.name).join(' + ') : 'Simulateur 2D';
      emptyEl.hidden = programs.length > 0;
      stockButton.hidden = !programs.length;
      if (!programs.length) {
        scene = null;
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
      if (machineOf(lines) === 'dressing') return loadDressing(lines, programLines, result);
      const fromProgram = parseStock(lines);
      const fallback = fromProgram ?? guessStock(result.moves);
      const saved = ctx.kv.get(stockKey(), null);
      const stock = sanitizeStock(saved ?? fallback, fallback);
      const material = createMaterial(stock);
      const timeline = createTimeline(result.moves, { rapidRate: ctx.settings.get('simulation.rapidRate') });
      const autoSides = toolSides(result.moves);
      const overrides = ctx.kv.get(sidesKey(), {}) ?? {};
      const sides = Object.fromEntries(Object.entries(autoSides).map(([tool, side]) => [tool, overrides[tool] ?? side]));
      scene = { ...result, programLines, stock, material, timeline, sides, autoSides, overrides, front: ctx.settings.get('simulation.turret') === 'front', stockSource: saved ? 'saisi' : fromProgram ? 'programme' : 'estimé' };
      scene.warnings = sortWarnings([...result.warnings, ...collisions(scene)]);
      stockEl.replaceChildren(icon('edit'), `Brut Ø${stock.diameter} × ${stock.length}${stock.bore > 0 ? ` · int. Ø${stock.bore}` : ''}`);
      show();
    }

    const sortWarnings = (list) => list.sort((a, b) => (a.program ?? 0) - (b.program ?? 0) || a.line - b.line);

    /**
     * Taillage de meule : les programmes pilotent le diamant ; leurs cotes sont ramenées dans le
     * repère de la meule (origine du diamant : angle gauche, angle droit ou milieu), vue de dessus.
     * Diamant de chaque programme : choisi dans la liste, sinon celui du commentaire de la ligne
     * de l'outil (« T0202 (DIAMANT FLANC GAUCHE) »), sinon celui par défaut.
     */
    function loadDressing(lines, programLines, result) {
      const fromProgram = parseWheel(lines);
      const saved = ctx.kv.get(wheelKey(), null);
      const wheel = sanitizeWheel({ ...WHEEL_DEFAULTS, ...(fromProgram ?? {}), ...(saved ?? {}) });
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
      const timeline = createTimeline(moves, { rapidRate: ctx.settings.get('simulation.rapidRate') });
      const used = [...new Set(moves.filter((m) => m.kind === 'cut').map((m) => m.diamond))];
      // Origines des diamants utilisés (plusieurs diamants peuvent partager le même angle).
      const byZ = new Map();
      for (const kind of used.length ? used : [wheel.diamond]) byZ.set(originZ(kind, wheel), [...(byZ.get(originZ(kind, wheel)) ?? []), DIAMONDS[kind].short]);
      const origins = [...byZ].map(([z, names]) => ({ z, label: `X0 Z0 · diamant${names.length > 1 ? 's' : ''} ${names.join(', ')}` }));
      scene = {
        ...result,
        moves,
        programLines,
        wheel: true,
        wheelSettings: wheel,
        material,
        timeline,
        origins,
        shapeOf: (move) => diamondShape(move.diamond),
        front: true, // miroir : meule au-dessus, diamant en dessous (repère des opérateurs)
        stockSource: saved ? 'saisi' : fromProgram ? 'programme' : 'estimé',
      };
      // Alertes propres au tour sans objet ici : broche de la meule, X négatif (= dans la meule).
      const own = result.warnings.filter((w) => !/broche arrêtée|diamètre négatif/.test(w.message));
      scene.warnings = sortWarnings([...own, ...wheelCollisions(scene)]);
      stockEl.replaceChildren(icon('edit'), `Meule L${wheel.width}`);
      renderPrograms();
      show();
    }

    /** Liste des programmes chargés : ordre d'exécution, diamant (taillage), retrait. */
    function renderPrograms() {
      const { programs } = session;
      const dressing = programs.length > 0 && isDressing();
      if (!programs.length) programsEl.open = true;
      const move = (from, to) => {
        const next = [...programs];
        next.splice(to, 0, ...next.splice(from, 1));
        setPrograms(next);
      };
      const diamondSelect = (program, index) => {
        const select = h(
          'select',
          { class: 'input sim-side', 'aria-label': `Diamant de ${program.name}`, dataset: { program: String(index) }, onchange: () => setPrograms(programs.map((p, i) => (i === index ? { ...p, diamond: select.value } : p))) },
          h('option', { value: 'auto' }, 'Diamant : auto (commentaire de l’outil)'),
          Object.entries(DIAMONDS).map(([value, d]) => h('option', { value }, `Diamant ${d.short}`)),
        );
        select.value = program.diamond;
        return select;
      };
      const small = (name, label, action, onclick, disabled = false) => h('button', { type: 'button', class: 'icon-btn sim-btn', title: label, 'aria-label': label, dataset: { action }, disabled, onclick }, icon(name));
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
                  { class: 'sim-program', dataset: { index: String(index) } },
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

    /** Bouton « Simuler » de l'éditeur : charge le programme ouvert (remplace sa copie s'il y est déjà). */
    function simulateCurrent() {
      const current = ctx.workspace.current;
      if (!current) return ctx.ui.navigate('/simulation');
      const entry = { id: current.id, name: current.name, text: ctx.workspace.text };
      const at = session.programs.findIndex((p) => p.id === current.id);
      setPrograms(at >= 0 ? session.programs.map((p, i) => (i === at ? { ...p, ...entry } : p)) : [entry]);
      ctx.ui.navigate('/simulation');
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
      renderVariables();
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
      const entries = [...scene.variables].filter(([, v]) => v != null).sort((a, b) => a[0] - b[0]);
      variablesEl.hidden = !entries.length;
      const format = (v) => String(Math.round(v * 10000) / 10000).replace('.', ',');
      variablesEl.replaceChildren(
        ...[
          h('summary', null, icon('variable'), `Variables en fin de simulation (${entries.length})`),
        h('table', { class: 'sim-tool-table' }, h('tbody', null, entries.map(([index, value]) => h('tr', null, h('td', { class: 'mono' }, `#${index}`), h('td', { class: 'mono' }, format(value)))))),
          session.programs.length > 1 ? h('p', { class: 'sim-note' }, 'Les programmes partagent leurs variables : chacun reprend les valeurs laissées par le précédent.') : null,
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
      if (!scene) return;
      pause();
      const lines = scene.programLines.flat();
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
          selectField('diamond', 'Diamant par défaut', Object.fromEntries(Object.entries(DIAMONDS).map(([k, d]) => [k, d.label])), wheel.diamond, wheelInputs, 'Chaque programme chargé peut avoir le sien (liste « Programmes chargés »).'),
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
      section: 'simulateur',
      mount: build,
      onShow: () => {
        load();
        page.focus({ preventScroll: true });
      },
    });
    ctx.listen(window, 'hashchange', () => {
      if (!location.hash.startsWith('#/simulation')) pause();
    });
    ctx.settings.subscribe('simulation.turret', () => page && load({ force: true }));
    ctx.settings.subscribe('simulation.rapidRate', () => page && load({ force: true }));
    ctx.settings.subscribe('theme', () => {
      if (!scene) return;
      view.refreshColors();
      scene.material.reset(stockColor());
      erased = { index: 0, fraction: 0 };
      update();
    });
    ctx.onDispose(() => cancelAnimationFrame(frame));
    ctx.ui.toolbar.add({ id: 'simulation', icon: 'simulation', label: 'Simuler', title: 'Charger ce programme dans le simulateur 2D', order: 30, onClick: simulateCurrent });
  },
};
