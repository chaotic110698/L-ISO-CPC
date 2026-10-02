import { createCodeDictionary } from '../../engine/index.js';
import { ISO_BASE_CODES } from '../../data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from '../../data/codes/fanuc-turning.js';
import { FANUC_TURNING_BC_CODES } from '../../data/codes/fanuc-turning-bc.js';
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
  settings: [
    {
      key: 'courses.revision',
      type: 'boolean',
      label: 'Mode révision',
      description: 'Questions des leçons et des codes de vos profils, avec répétition espacée.',
      default: true,
    },
  ],
  activate(ctx) {
    const progress = createProgressStore(ctx.kv);
    // Dictionnaires des exemples : par défaut les profils actifs de l'utilisateur ; les passages
    // propres à un système de codes Fanuc (A ou B/C) utilisent le leur, quel que soit le profil.
    const dictionaries = {
      default: ctx.codes,
      iso: createCodeDictionary([ISO_BASE_CODES]),
      a: createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]),
      bc: createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES, FANUC_TURNING_BC_CODES]),
    };

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
      mount: () =>
        (page = createCoursesPage({
          progress,
          dictionaries,
          openExample,
          navigate: ctx.ui.navigate,
          reviewEnabled: () => ctx.settings.get('courses.revision'),
          onReviewToggle: (listener) => ctx.settings.subscribe('courses.revision', listener),
        })),
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
        const reviewed = Object.keys(data?.review?.items ?? {}).length;
        return `${read} leçon${read > 1 ? 's' : ''} terminée${read > 1 ? 's' : ''} sur ${LESSONS.filter(isAvailable).length}, ${reviewed} question${reviewed > 1 ? 's' : ''} de révision suivie${reviewed > 1 ? 's' : ''}`;
      },
    });
  },
};
