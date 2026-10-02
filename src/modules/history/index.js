import { keymap } from '@codemirror/view';
import { history, historyKeymap, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';

export default {
  id: 'history',
  label: 'Annuler / rétablir',
  description: 'Historique des modifications (Ctrl+Z, Ctrl+Y ou Ctrl+Maj+Z) et boutons dans la barre d’outils.',
  group: 'editeur',
  where: 'Boutons de la barre d’outils, Ctrl+Z / Ctrl+Y',
  activate(ctx) {
    ctx.editor.addExtension([history(), keymap.of(historyKeymap)]);

    const undoButton = ctx.ui.toolbar.add({ id: 'undo', icon: 'undo', label: 'Annuler', title: 'Annuler (Ctrl+Z)', order: 10, onClick: () => ctx.editor.run(undo) });
    const redoButton = ctx.ui.toolbar.add({ id: 'redo', icon: 'redo', label: 'Rétablir', title: 'Rétablir (Ctrl+Y)', order: 11, onClick: () => ctx.editor.run(redo) });

    const refresh = (state) => {
      undoButton.setDisabled(undoDepth(state) === 0);
      redoButton.setDisabled(redoDepth(state) === 0);
    };
    ctx.editor.onUpdate((update) => refresh(update.state));
    ctx.editor.onDocReplaced(() => refresh(ctx.editor.state));
    refresh(ctx.editor.state);
  },
};
