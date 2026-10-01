import { debounce } from '../../core/util.js';

const DELAY_MS = 800;

export default {
  id: 'autosave',
  label: 'Sauvegarde automatique',
  description: 'Enregistre le programme quelques instants après chaque modification. Désactivée : enregistrez avec Ctrl+S ou le bouton « Enregistrer ».',
  group: 'fichiers',
  activate(ctx) {
    const { workspace } = ctx;
    const save = debounce(() => workspace.save().catch(() => {}), DELAY_MS);

    workspace.autosave = true;
    ctx.onDispose(() => {
      save.flush();
      workspace.autosave = false;
    });

    ctx.bus.on('workspace:changed', save);
    if (workspace.dirty) save();
    // Ouverture d'un autre programme : rien d'ancien à enregistrer.
    ctx.bus.on('workspace:opened', save.cancel);

    // Page masquée ou fermée : copie de secours synchrone, puis enregistrement immédiat.
    const flushNow = () => {
      workspace.writeDraft();
      save.flush();
    };
    ctx.listen(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushNow();
    });
    ctx.listen(window, 'pagehide', flushNow);
  },
};
