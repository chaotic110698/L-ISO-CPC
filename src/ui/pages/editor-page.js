import { h } from '../../core/dom.js';
import { EditorHost } from '../editor/editor-host.js';
import { createToolbar } from '../toolbar.js';
import { createStatusbar } from '../statusbar.js';

/**
 * Page « Éditeur » : barre d'outils, zone d'édition, barre d'état.
 * Créée une seule fois au démarrage (les modules s'y branchent), puis affichée / masquée.
 *
 * L'emplacement `side` accueillera les panneaux latéraux des étapes suivantes
 * (état modal, tableau des variables…) ; sur mobile ils passeront en volet escamotable.
 */
export function createEditorPage({ settings }) {
  const toolbarEl = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Outils de l’éditeur' });
  const editorEl = h('div', { class: 'editor-host' });
  const sideEl = h('aside', { class: 'side-panel', hidden: true, 'aria-label': 'Panneaux' });
  const statusEl = h('footer', { class: 'statusbar' });

  const element = h(
    'section',
    { class: 'editor-page', 'aria-label': 'Éditeur' },
    toolbarEl,
    h('div', { class: 'editor-area' }, editorEl, sideEl),
    statusEl,
  );

  const editor = new EditorHost(editorEl, {
    dark: settings.get('theme') === 'dark',
    lineWrapping: settings.get('editor.lineWrapping'),
  });

  return {
    element,
    editor,
    toolbar: createToolbar(toolbarEl),
    statusbar: createStatusbar(statusEl),
  };
}
