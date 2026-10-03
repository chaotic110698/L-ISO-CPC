import { drawerOptions } from '../../ui/programs-drawer.js';

/**
 * Corbeille : un programme supprimé reste récupérable pendant 30 jours (tiroir « Programmes »
 * › Corbeille, ou « Annuler » dans la notification), puis il est effacé au démarrage suivant.
 * Désactivée, une suppression est définitive (après confirmation).
 */
export default {
  id: 'trash',
  label: 'Corbeille',
  description: `Un programme supprimé va à la corbeille : récupérable ${drawerOptions.trashDays} jours (« Annuler » juste après, ou Programmes › Corbeille), puis effacé. Désactivée : la suppression est définitive.`,
  group: 'fichiers',
  where: 'Tiroir « Programmes » › Corbeille',
  activate(ctx) {
    const { workspace } = ctx;
    workspace.trashEnabled = true;
    drawerOptions.trash = true;
    workspace.purgeExpired(drawerOptions.trashDays).catch((error) => console.error('Corbeille', error));
    ctx.onDispose(() => {
      workspace.trashEnabled = false;
      drawerOptions.trash = false;
    });
  },
};
