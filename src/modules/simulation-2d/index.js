import { EditorView } from '@codemirror/view';
import { h } from '../../core/dom.js';
import { simulate } from '../../engine/index.js';
import { highlightCode } from '../../ui/code-view.js';
import { icon } from '../../ui/icons.js';
import { segmented } from '../../ui/segmented.js';
import { TURNING_CYCLES } from './cycles.js';
import { createMaterial, shapeFor } from './material.js';
import { createTimeline, formatDuration } from './playback.js';
import { guessStock, parseStock, sanitizeStock } from './stock.js';
import { createView } from './view.js';

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
  { key: 'bore', label: 'Alésage déjà présent (tube)', unit: 'mm Ø', hint: '0 pour une barre pleine.' },
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
        h('div', { class: 'sim-stage' }, canvas, iconButton('fold', 'Ajuster la vue (double-tap)', 'sim-fit', () => view.fit())),
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
          alertsEl,
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

    /** (Re)calcule la simulation si le texte du programme a changé. */
    function load({ force = false } = {}) {
      const text = editor.view.state.doc.toString();
      titleEl.textContent = ctx.workspace.current?.name ?? 'Programme';
      if (!force && scene && text === sourceText) return;
      sourceText = text;
      const lines = text.split('\n');
      const result = simulate(lines, codes, { cycles: TURNING_CYCLES });
      const fromProgram = parseStock(lines);
      const fallback = fromProgram ?? guessStock(result.moves);
      const saved = ctx.kv.get(stockKey(), null);
      const stock = sanitizeStock(saved ?? fallback, fallback);
      const material = createMaterial(stock);
      const timeline = createTimeline(result.moves, { rapidRate: ctx.settings.get('simulation.rapidRate') });
      scene = { ...result, lines, stock, material, timeline, front: ctx.settings.get('simulation.turret') === 'front', stockSource: saved ? 'saisi' : fromProgram ? 'programme' : 'estimé' };
      scene.warnings = [...result.warnings, ...collisions(scene)].sort((a, b) => a.line - b.line);
      stockEl.replaceChildren(icon('edit'), `Brut Ø${stock.diameter} × ${stock.length}`);
      renderAlerts();
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
    function collisions({ moves, stock }) {
      const found = [];
      const probe = createMaterial(stock, { maxPixels: 900 });
      probe.reset();
      const zGrip = stock.face - stock.length + stock.grip;
      const jaw = Math.max(6, stock.diameter * 0.175);
      for (const move of moves) {
        const shape = shapeFor(move);
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
        const shape = shapeFor(moves[i]);
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

    async function editStock() {
      pause();
      const { stock } = scene;
      const inputs = {};
      const fields = STOCK_FIELDS.map((field) => {
        inputs[field.key] = h('input', { class: 'input mono', inputmode: 'decimal', autocomplete: 'off', name: field.key, value: String(stock[field.key]).replace('.', ',') });
        return h('div', { class: 'field cycle-field' }, h('label', null, field.label), h('div', { class: 'calc-input' }, inputs[field.key], h('span', { class: 'calc-unit-text' }, field.unit)), field.hint ? h('small', null, field.hint) : null);
      });
      const source = { programme: 'lu dans le commentaire (BRUT …) du programme', saisi: 'saisi pour ce programme', estimé: 'estimé d’après les passes (aucun commentaire (BRUT …) dans le programme)' }[scene.stockSource];
      const choice = await ctx.ui.openDialog({
        title: 'Brut (barre de départ)',
        className: 'dialog-wide',
        body: h(
          'div',
          { class: 'cycle-form' },
          h('p', { class: 'card-description' }, `La barre avant usinage, pour dessiner la matière. Actuellement : ${source}. Astuce : écrivez-le dans le programme, par exemple `, h('code', null, '(BRUT D50 X 80)'), ' — diamètre 50, longueur 80.'),
          h('div', { class: 'cycle-fields' }, fields),
        ),
        actions: [{ label: 'Appliquer', value: 'ok', primary: true }, ...(scene.stockSource === 'saisi' ? [{ label: 'Reprendre celui du programme', value: 'reset' }] : []), { label: 'Annuler' }],
      });
      if (choice === 'reset') ctx.kv.remove(stockKey());
      else if (choice === 'ok') {
        const raw = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, Number(input.value.replace(',', '.'))]));
        ctx.kv.set(stockKey(), sanitizeStock(raw, stock));
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
