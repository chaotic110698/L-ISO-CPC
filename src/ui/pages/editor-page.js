import { h } from '../../core/dom.js';
import { EditorHost } from '../editor/editor-host.js';
import { createToolbar } from '../toolbar.js';
import { createStatusbar } from '../statusbar.js';
import { createPanels } from '../panels.js';

/**
 * Page « Éditeur » : barre d'outils, zone d'édition, accessoires (barre de touches…), barre d'état.
 * Créée une seule fois au démarrage (les modules s'y branchent), puis affichée / masquée.
 *
 * Les panneaux (tableau des variables, état modal…) s'affichent à droite de l'éditeur sur
 * grand écran, en volet bas sur smartphone.
 */
export function createEditorPage({ settings, kv }) {
  const toolbarEl = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Outils de l’éditeur' });
  const editorEl = h('div', { class: 'editor-host' });
  const sideEl = h('aside', { class: 'side-panel', hidden: true, 'aria-label': 'Panneaux' });
  const accessoryEl = h('div', { class: 'editor-accessories' });
  const statusEl = h('footer', { class: 'statusbar' });

  const element = h(
    'section',
    { class: 'editor-page', 'aria-label': 'Éditeur' },
    toolbarEl,
    h('div', { class: 'editor-area' }, editorEl, sideEl),
    accessoryEl,
    statusEl,
  );

  const editor = new EditorHost(editorEl, {
    dark: settings.get('theme') === 'dark',
    lineWrapping: settings.get('editor.lineWrapping'),
  });

  const toolbar = createToolbar(toolbarEl);
  const addAccessory = (node) => {
    accessoryEl.append(node);
    return () => node.remove();
  };
  return {
    element,
    editor,
    toolbar,
    statusbar: createStatusbar(statusEl),
    panels: createPanels({ sideEl, toolbar, kv, onResize: () => editor.remeasure() }),
    /** Élément affiché sous la zone d'édition → retrait. */
    accessories: {
      add: addAccessory,
      scoped: (scope) => ({ add: (node) => scope.add(addAccessory(node)) }),
    },
  };
}
