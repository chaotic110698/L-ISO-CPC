import { drawerOptions } from '../../ui/programs-drawer.js';

/** Liste des programmes plus pratique : recherche, tri par date ou par nom, programmes épinglés. */
export default {
  id: 'programList',
  label: 'Recherche, tri et épinglage des programmes',
  description: 'Dans le tiroir « Programmes » : recherche par nom ou par contenu (O1234, T0303…), tri par date de modification ou par nom, programmes épinglés en tête de liste.',
  group: 'fichiers',
  where: 'Tiroir « Programmes »',
  activate(ctx) {
    drawerOptions.listTools = true;
    ctx.onDispose(() => (drawerOptions.listTools = false));
  },
};
