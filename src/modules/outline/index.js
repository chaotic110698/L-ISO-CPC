import { EditorView } from '@codemirror/view';
import { h } from '../../core/dom.js';
import { debounce } from '../../core/util.js';
import { programOutline, outlineSectionAt } from '../../engine/index.js';

const KIND_LABELS = { program: 'Programme', section: 'Section', tool: 'Outil', cycle: 'Cycle', call: 'Appel', end: 'Fin' };

/**
 * Plan du programme : programmes, sections (commentaires seuls sur leur ligne), outils, cycles,
 * appels et fins, cliquables pour s'y rendre. La partie où se trouve le curseur est surlignée.
 */
export default {
  id: 'outline',
  label: 'Plan du programme',
  description:
    'Panneau listant les programmes O…, les sections (ligne de commentaire seule, comme « (--- FINITION ---) »), les changements d’outil, les cycles, les appels de sous-programme et les fins. Un clic ou un tap va à la ligne.',
  group: 'analyse',
  where: 'Panneau « Plan » (barre d’outils)',
  activate(ctx) {
    const { editor, codes } = ctx;

    ctx.ui.panels.add({
      id: 'outline',
      title: 'Plan',
      icon: 'outline',
      order: 59,
      render(container) {
        let items = [];
        let rows = [];
        let current = -1;

        const goTo = (item) => {
          const view = editor.view;
          const line = view.state.doc.line(Math.min(item.line, view.state.doc.lines));
          view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 24 }) });
          view.focus();
        };

        const highlight = () => {
          const index = outlineSectionAt(items, editor.cursor.line);
          if (index === current) return;
          rows[current]?.classList.remove('is-current');
          rows[current]?.removeAttribute('aria-current');
          current = index;
          rows[current]?.classList.add('is-current');
          rows[current]?.setAttribute('aria-current', 'location');
        };

        const render = () => {
          items = programOutline(editor.state.doc.iterLines(), codes);
          current = -1;
          rows = items.map((item) =>
            h(
              'button',
              { type: 'button', class: `outline-item is-${item.kind} is-level-${item.level}`, dataset: { line: String(item.line), kind: item.kind }, title: `${KIND_LABELS[item.kind]} · ligne ${item.line}`, onclick: () => goTo(item) },
              h('span', { class: 'outline-label' }, item.label),
              item.detail ? h('span', { class: 'outline-detail' }, item.detail) : null,
              h('span', { class: 'outline-line' }, String(item.line)),
            ),
          );
          container.replaceChildren(
            rows.length
              ? h('nav', { class: 'outline', 'aria-label': 'Plan du programme' }, rows)
              : h('p', { class: 'var-empty' }, 'Rien à afficher : ni numéro de programme O…, ni outil, ni cycle, ni ligne de commentaire seule.'),
            h('p', { class: 'var-empty' }, 'Une ligne ne contenant qu’un commentaire, comme ', h('code', { class: 'outline-example' }, '(--- FINITION ---)'), ', crée une section.'),
          );
          highlight();
        };

        const refresh = debounce(render, 300);
        const offs = [
          editor.onUpdate((update) => {
            if (update.docChanged) refresh();
            else if (update.selectionSet) highlight();
          }),
          editor.onDocReplaced(render),
          codes.onChange(render),
        ];
        render();
        return {
          dispose() {
            refresh.cancel();
            offs.forEach((off) => off());
          },
        };
      },
    });
  },
};
