import { h } from '../../core/dom.js';
import { TURNING_TEMPLATES, codeSystem } from '../../data/templates/turning.js';
import { openGeneratorForm } from '../../ui/generator-form.js';

/**
 * Modèles d'insertion : blocs types (en-tête, sécurité, séquence d'outil, dégagement, fin)
 * remplis par un petit formulaire et écrits pour le système de codes de la machine (A ou B/C).
 */
export default {
  id: 'templates',
  label: 'Modèles d’insertion',
  description:
    'Panneau « Modèles » : en-tête de programme, bloc de sécurité, séquence d’outil complète, dégagement, fin de programme. Un formulaire court, un aperçu, puis insertion sous le curseur ; le code suit le système A ou B/C selon vos profils.',
  group: 'outils',
  where: 'Panneau « Modèles » (barre d’outils)',
  activate(ctx) {
    ctx.ui.panels.add({
      id: 'templates',
      title: 'Modèles',
      icon: 'file',
      order: 61,
      render(container) {
        const render = () => {
          const enabled = ctx.profiles.enabledProfiles().map((p) => p.id);
          const system = codeSystem(enabled);
          container.replaceChildren(
            h('p', { class: 'var-summary' }, `Blocs types, écrits pour le système ${system === 'bc' ? 'B/C' : 'A'} (selon vos profils). Le code est inséré sous la ligne du curseur.`),
            ...(enabled.includes('fanuc-turning')
              ? TURNING_TEMPLATES.map((template) =>
                  h(
                    'button',
                    { type: 'button', class: 'cycle-item', dataset: { template: template.id }, onclick: () => openGeneratorForm(ctx, template, { storageKey: `template.${template.id}`, context: { system } }) },
                    h('span', { class: 'cycle-codes' }, template.codes.map((code) => h('code', { class: 'tok-program' }, code))),
                    h('span', { class: 'cycle-title' }, template.title),
                    h('small', null, template.description),
                  ),
                )
              : [h('p', { class: 'var-empty' }, 'Les modèles sont écrits pour les tours FANUC : activez le profil « FANUC tournage ».')]),
          );
        };
        const off = ctx.bus.on('profiles:changed', render);
        render();
        return { dispose: off };
      },
    });
  },
};
