import { h } from '../core/dom.js';

/**
 * Barre d'état sous l'éditeur. Chaque élément est une zone de texte que son propriétaire
 * (socle ou module) met à jour. `side` : 'start' (gauche) ou 'end' (droite).
 */
export function createStatusbar(container) {
  const start = h('div', { class: 'status-side' });
  const end = h('div', { class: 'status-side status-end' });
  container.append(start, end);

  function add({ id, side = 'start', order = 100, title }) {
    const element = h('span', { class: 'status-item', dataset: { status: id, order: String(order) }, title });
    const parent = side === 'end' ? end : start;
    const next = [...parent.children].find((child) => Number(child.dataset.order) > order);
    parent.insertBefore(element, next ?? null);
    return {
      element,
      set(text, { title: newTitle, tone } = {}) {
        element.textContent = text;
        if (newTitle !== undefined) element.title = newTitle;
        element.dataset.tone = tone ?? '';
      },
      remove: () => element.remove(),
    };
  }

  return {
    add,
    scoped(scope) {
      return {
        add(options) {
          const handle = add(options);
          scope.add(handle.remove);
          return handle;
        },
      };
    },
  };
}
