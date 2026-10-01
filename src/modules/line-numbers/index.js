import { lineNumbers, highlightActiveLineGutter } from '@codemirror/view';

export default {
  id: 'lineNumbers',
  label: 'Numérotation des lignes',
  description: 'Affiche le numéro de chaque ligne dans la marge de l’éditeur.',
  group: 'editeur',
  activate(ctx) {
    ctx.editor.addExtension([lineNumbers(), highlightActiveLineGutter()]);
  },
};
