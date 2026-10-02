import { createCodeDictionary } from '../../engine/index.js';
import { ISO_BASE_CODES } from '../../data/codes/iso-base.js';
import { LESSONS, isAvailable } from '../../data/courses/index.js';
import { createProgressStore } from './progress.js';
import { createCoursesPage } from './page.js';

/**
 * Cours d'ISO : catalogue de leçons (src/data/courses/), lecteur avec schémas et exemples
 * interactifs, préférences « Votre machine », progression incluse dans la sauvegarde JSON.
 */
export default {
  id: 'courses',
  label: 'Cours d’ISO',
  description: 'Leçons de programmation ISO en tournage, du premier bloc aux macros : schémas, exemples colorés avec définitions au tap, ouverture des exemples dans l’éditeur, progression enregistrée.',
  group: 'apprendre',
  where: 'Page « Cours d’ISO » (menu latéral)',
  activate(ctx) {
    const progress = createProgressStore(ctx.kv);
    // Exemples écrits pour les systèmes B/C : définitions de l'ISO générique (G90/G91 absolu/incrémental).
    const dictionaries = { default: ctx.codes, iso: createCodeDictionary([ISO_BASE_CODES]) };

    const openExample = async (name, content) => {
      await ctx.workspace.create({ name, content });
      ctx.ui.navigate('/editeur');
      ctx.ui.toast(`Exemple ouvert dans l’éditeur : « ${name} ». Vous pouvez le modifier librement.`, { type: 'success' });
    };

    let page = null;
    ctx.ui.addPage({
      id: 'cours',
      path: '/cours',
      label: 'Cours d’ISO',
      icon: 'book',
      order: 38,
      mount: () => (page = createCoursesPage({ progress, dictionaries, openExample, navigate: ctx.ui.navigate })),
      onShow: (path) => page?.show(path ?? ''),
    });

    ctx.backup.register('cours', {
      label: 'Progression des cours',
      exportData: async () => progress.get(),
      importData: async (data, { mode }) => {
        if (mode === 'replace') progress.replace(data);
        else progress.merge(data);
        return { applied: 1 };
      },
      describe: (data) => {
        const read = Object.values(data?.lessons ?? {}).filter((entry) => entry?.readAt).length;
        return `${read} leçon${read > 1 ? 's' : ''} terminée${read > 1 ? 's' : ''} sur ${LESSONS.filter(isAvailable).length}`;
      },
    });
  },
};
