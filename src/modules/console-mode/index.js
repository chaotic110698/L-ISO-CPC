import { EditorView } from '@codemirror/view';
import { h } from '../../core/dom.js';
import { executableLines, modalStateAt, parseLine, summarizeModalState } from '../../engine/index.js';
import { highlightCode } from '../../ui/code-view.js';
import { icon } from '../../ui/icons.js';

const SIZES = { large: 22, xlarge: 28 };

/**
 * Mode pupitre : le programme en grand et en lecture seule, pour suivre un essai bloc par bloc
 * devant la machine. Bloc courant surligné, gros boutons « précédent / suivant » (ou flèches,
 * espace), état modal et sens des codes du bloc. L'écran reste allumé tant que la page est
 * affichée (si le navigateur le permet). En quittant, le curseur de l'éditeur est placé sur le
 * bloc courant.
 */
export default {
  id: 'consoleMode',
  label: 'Mode pupitre',
  description:
    'Le programme en grand et en lecture seule, bloc courant surligné, gros boutons « bloc précédent / suivant », état modal et sens des codes du bloc. L’écran reste allumé. Pour suivre un essai bloc par bloc devant la machine.',
  group: 'editeur',
  where: 'Menu latéral « Mode pupitre », menu Outils de l’éditeur',
  settings: [
    {
      key: 'consoleMode.size',
      type: 'choice',
      label: 'Taille du texte en mode pupitre',
      options: [
        { value: 'large', label: 'Grande' },
        { value: 'xlarge', label: 'Très grande' },
      ],
      default: 'large',
    },
  ],
  activate(ctx) {
    const { editor, codes } = ctx;
    let page = null;
    let lines = [];
    let blocks = [];
    let current = 1;
    let wakeLock = null;
    let visible = false;

    const titleEl = h('h1', { class: 'console-title' });
    const counter = h('p', { class: 'console-counter', 'aria-live': 'polite' });
    const listEl = h('ol', { class: 'console-lines', 'aria-label': 'Programme' });
    const modalEl = h('p', { class: 'console-modal mono' });
    const codesEl = h('ul', { class: 'console-codes' });
    const wakeEl = h('p', { class: 'console-wake' });
    const prev = h('button', { type: 'button', class: 'btn console-step', dataset: { action: 'console-prev' }, onclick: () => step(-1) }, icon('arrowUp'), 'Bloc précédent');
    const next = h('button', { type: 'button', class: 'btn btn-primary console-step', dataset: { action: 'console-next' }, onclick: () => step(1) }, 'Bloc suivant', icon('arrowDown'));

    function leave() {
      const doc = editor.view.state.doc;
      const line = doc.line(Math.min(current, doc.lines));
      editor.view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
      ctx.ui.navigate('/editeur');
    }

    function build() {
      page = h(
        'section',
        { class: 'console-page', 'aria-label': 'Mode pupitre', tabindex: -1 },
        h(
          'header',
          { class: 'console-header' },
          h('div', { class: 'console-heading' }, titleEl, counter),
          h('button', { type: 'button', class: 'btn', dataset: { action: 'console-leave' }, onclick: leave }, icon('code'), 'Éditeur'),
        ),
        h('div', { class: 'console-body' }, listEl),
        h('div', { class: 'console-info' }, modalEl, codesEl, wakeEl),
        h('footer', { class: 'console-footer' }, prev, next),
      );
      page.addEventListener('keydown', (event) => {
        if (event.target.closest('input, textarea, select')) return;
        const delta = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 }[event.key];
        if (!delta) return;
        event.preventDefault();
        step(delta);
      });
      return page;
    }

    /** Recharge le programme (texte de l'éditeur, modifications non enregistrées comprises). */
    function load() {
      const doc = editor.view.state.doc;
      lines = doc.toString().split('\n');
      blocks = executableLines(lines);
      titleEl.textContent = ctx.workspace.current?.name ?? 'Programme';
      const cursor = editor.cursor.line;
      current = blocks.find((n) => n >= cursor) ?? blocks.at(-1) ?? 1;
      const size = SIZES[ctx.settings.get('consoleMode.size')] ?? SIZES.large;
      page.style.setProperty('--console-size', `${size}px`);
      listEl.replaceChildren(
        ...lines.map((text, i) =>
          h(
            'li',
            { class: `console-line${blocks.includes(i + 1) ? '' : ' is-passive'}`, dataset: { line: String(i + 1) }, onclick: () => select(i + 1) },
            h('span', { class: 'console-number' }, String(i + 1)),
            highlightCode(text, codes),
          ),
        ),
      );
      select(current, 'auto');
    }

    function select(line, behavior = 'smooth') {
      listEl.querySelector('.is-current')?.classList.remove('is-current');
      current = line;
      const el = listEl.children[line - 1];
      el?.classList.add('is-current');
      el?.scrollIntoView({ block: 'center', behavior });
      const index = blocks.indexOf(line);
      counter.textContent = index >= 0 ? `Bloc ${index + 1} / ${blocks.length} · ligne ${line}` : `Ligne ${line} (sans bloc à exécuter)`;
      prev.disabled = !blocks.some((n) => n < line);
      next.disabled = !blocks.some((n) => n > line);

      const state = modalStateAt(lines, line, codes);
      modalEl.textContent = summarizeModalState(state) || 'État modal : rien de programmé avant ce bloc.';
      const { block } = parseLine(lines[line - 1] ?? '');
      codesEl.replaceChildren(
        ...block.codes.map((word) => {
          const entry = codes.lookup(word.code);
          return h('li', null, h('code', { class: `tok-${entry?.category ?? 'unknown'}` }, word.token.text), entry ? ` ${entry.name}` : ' code inconnu du profil');
        }),
        ...block.comments.map((text) => h('li', { class: 'console-comment' }, `(${text})`)),
      );
    }

    function step(delta) {
      const target = delta > 0 ? blocks.find((n) => n > current) : blocks.findLast((n) => n < current);
      if (target) select(target);
    }

    // Écran maintenu allumé (Screen Wake Lock), redemandé au retour sur l'onglet.
    async function lock() {
      if (!visible || wakeLock || document.visibilityState !== 'visible') return;
      if (!('wakeLock' in navigator)) {
        wakeEl.textContent = 'Ce navigateur ne peut pas garder l’écran allumé : réglez la mise en veille du téléphone.';
        return;
      }
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeEl.textContent = 'Écran maintenu allumé pendant le mode pupitre.';
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      } catch {
        wakeEl.textContent = 'Mise en veille non bloquée (refusée par le navigateur ou la batterie).';
      }
    }
    function unlock() {
      wakeLock?.release().catch(() => {});
      wakeLock = null;
    }

    ctx.ui.addPage({
      id: 'pupitre',
      path: '/pupitre',
      label: 'Mode pupitre',
      icon: 'console',
      order: 22,
      section: 'programmation',
      mount: build,
      onShow: () => {
        visible = true;
        load();
        lock();
        page.focus({ preventScroll: true });
      },
    });
    ctx.listen(window, 'hashchange', () => {
      if (visible && !location.hash.startsWith('#/pupitre')) {
        visible = false;
        unlock();
      }
    });
    ctx.listen(document, 'visibilitychange', lock);
    ctx.onDispose(unlock);
    ctx.ui.toolbar.add({ id: 'console-mode', icon: 'console', label: 'Mode pupitre', title: 'Suivre le programme bloc par bloc, en grand (à partir de la ligne du curseur)', order: 85, menu: true, onClick: () => ctx.ui.navigate('/pupitre') });
  },
};
