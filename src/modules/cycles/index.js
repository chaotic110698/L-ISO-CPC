import { h } from '../../core/dom.js';
import { FANUC_TURNING_CYCLES } from '../../data/cycles/fanuc-turning.js';
import { openGeneratorForm } from '../../ui/generator-form.js';

/** Modèles de cycles par profil intégré : proposés seulement si ce profil est activé. */
const CYCLES_BY_PROFILE = [{ profile: 'fanuc-turning', cycles: FANUC_TURNING_CYCLES }];

export default {
  id: 'cycles',
  label: 'Formulaires de cycles',
  description: 'Panneau « Cycles » : formulaires qui génèrent les blocs des cycles FANUC (G71/G70, G72, G76, G92, G90, G74, G75) avec aperçu, conversions mm → µm et calcul de la hauteur de filet.',
  group: 'outils',
  where: 'Panneau « Cycles » (barre d’outils, menu latéral)',
  activate(ctx) {
    ctx.ui.panels.add({
      id: 'cycles',
      title: 'Cycles',
      icon: 'cycle',
      order: 62,
      render(container) {
        const render = () => {
          const enabled = new Set(ctx.profiles.enabledProfiles().map((p) => p.id));
          const groups = CYCLES_BY_PROFILE.filter((g) => enabled.has(g.profile));
          container.replaceChildren(
            h('p', { class: 'var-summary' }, 'Remplissez le formulaire : le code est inséré sous la ligne du curseur.'),
            ...(groups.length
              ? groups.flatMap((group) =>
                  group.cycles.map((cycle) =>
                    h(
                      'button',
                      { type: 'button', class: 'cycle-item', dataset: { cycle: cycle.id }, onclick: () => openGeneratorForm(ctx, cycle, { storageKey: `cycle.${cycle.id}` }) },
                      h('span', { class: 'cycle-codes' }, cycle.codes.map((code) => h('code', { class: 'tok-cycle' }, code))),
                      h('span', { class: 'cycle-title' }, cycle.title),
                      h('small', null, cycle.description),
                    ),
                  ),
                )
              : [h('p', { class: 'var-empty' }, 'Aucun modèle de cycle pour les profils activés (activez « FANUC tournage »).')]),
          );
        };
        const off = ctx.bus.on('profiles:changed', render);
        render();
        return { dispose: off };
      },
    });
    ctx.ui.addNavItem({ id: 'bibliotheque', label: 'Cycles (formulaires)', icon: 'cycle', order: 45, onSelect: () => ctx.ui.showPanel('cycles') });
  },
};
