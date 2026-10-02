import { h } from '../../core/dom.js';
import { CALCULATORS } from './specs.js';
import { createCalculator } from './calculator.js';

const STORAGE_KEY = 'calculators';

/** Page « Calculateurs » : une carte par calculateur, chacun activable dans Paramètres. */
function createPage(ctx) {
  const saved = ctx.kv.get(STORAGE_KEY, {}) ?? {};
  const grid = h('div', { class: 'calc-grid' });
  const cards = new Map();

  for (const spec of CALCULATORS) {
    const card = createCalculator(spec, {
      load: () => saved[spec.id],
      save: (state) => {
        saved[spec.id] = state;
        ctx.kv.set(STORAGE_KEY, saved);
      },
    });
    cards.set(spec.id, card);
    grid.append(card);
  }

  const empty = h('p', { class: 'card-description', hidden: true }, 'Tous les calculateurs sont désactivés (Paramètres › Fonctionnalités › Calculateurs).');
  const applyVisibility = () => {
    for (const [id, card] of cards) card.hidden = !ctx.settings.get(`calculators.${id}`);
    empty.hidden = [...cards.values()].some((card) => !card.hidden);
  };
  for (const spec of CALCULATORS) ctx.settings.subscribe(`calculators.${spec.id}`, applyVisibility);
  applyVisibility();

  return h(
    'section',
    { class: 'calc-page', 'aria-label': 'Calculateurs' },
    h(
      'div',
      { class: 'calc-inner' },
      h('h1', { class: 'page-title' }, 'Calculateurs'),
      h('p', { class: 'card-description' }, 'Les résultats se mettent à jour pendant la saisie. Chaque calculateur fonctionne dans les deux sens : modifiez n’importe quel champ.'),
      empty,
      grid,
    ),
  );
}

export default {
  id: 'calculators',
  label: 'Calculateurs',
  description: 'Page de calculs d’atelier : vitesse de coupe ↔ tr/min, avance, rectification (vitesses en mm/min et mm/s), conversions, rugosité théorique, rayon de bec.',
  group: 'calculateurs',
  settings: CALCULATORS.map((spec) => ({ key: `calculators.${spec.id}`, type: 'boolean', label: spec.title, default: true })),
  activate(ctx) {
    ctx.ui.addPage({
      id: 'calculateurs',
      path: '/calculateurs',
      label: 'Calculateurs',
      icon: 'calculator',
      order: 40,
      mount: () => createPage(ctx),
    });
  },
};
