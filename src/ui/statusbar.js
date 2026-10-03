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

  /** Rend cliquable un élément existant (même celui d'un autre propriétaire) → retrait. */
  function onClick(id, handler, title) {
    const element = container.querySelector(`[data-status="${id}"]`);
    if (!element) return () => {};
    const previous = element.title;
    const keydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handler();
      }
    };
    element.classList.add('is-clickable');
    element.setAttribute('role', 'button');
    element.tabIndex = 0;
    if (title) element.title = title;
    element.addEventListener('click', handler);
    element.addEventListener('keydown', keydown);
    return () => {
      element.classList.remove('is-clickable');
      element.removeAttribute('role');
      element.removeAttribute('tabindex');
      element.title = previous;
      element.removeEventListener('click', handler);
      element.removeEventListener('keydown', keydown);
    };
  }

  return {
    add,
    onClick,
    scoped(scope) {
      return {
        add(options) {
          const handle = add(options);
          scope.add(handle.remove);
          return handle;
        },
        onClick: (id, handler, title) => scope.add(onClick(id, handler, title)),
      };
    },
  };
}
