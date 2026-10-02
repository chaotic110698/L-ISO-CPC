import { keymap } from '@codemirror/view';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';

/** Recherche et remplacement (Ctrl+F, Ctrl+H ou bouton), avec expressions régulières. */
export default {
  id: 'search',
  label: 'Recherche et remplacement',
  description: 'Panneau de recherche (Ctrl+F) : suivant / précédent, remplacer, tout remplacer, casse, mot entier, expressions régulières.',
  group: 'outils',
  activate(ctx) {
    ctx.editor.addExtension([search({ top: true }), keymap.of(searchKeymap)]);
    ctx.ui.toolbar.add({
      id: 'search',
      icon: 'search',
      label: 'Rechercher',
      title: 'Rechercher / remplacer (Ctrl+F)',
      order: 20,
      onClick: () => openSearchPanel(ctx.editor.view),
    });
  },
};
