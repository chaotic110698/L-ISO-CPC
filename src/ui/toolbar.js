import { h } from '../core/dom.js';
import { icon } from './icons.js';

/**
 * Barre d'outils de l'éditeur. Les modules y ajoutent leurs boutons ; `order` fixe la position
 * (petits nombres à gauche). Sur petit écran, seules les icônes sont affichées.
 */
export function createToolbar(container) {
  const items = [];

  function add({ id, icon: iconName, label, title, onClick, order = 100 }) {
    const button = h(
      'button',
      {
        type: 'button',
        class: 'tool-btn',
        title: title ?? label,
        'aria-label': label,
        dataset: { tool: id },
        // Garde le focus dans l'éditeur (le clavier virtuel reste ouvert sur mobile).
        onmousedown: (event) => event.preventDefault(),
        onclick: onClick,
      },
      iconName ? icon(iconName) : null,
      h('span', { class: 'tool-label' }, label),
    );
    const item = { order, button };
    const index = items.findIndex((other) => other.order > order);
    if (index === -1) {
      items.push(item);
      container.append(button);
    } else {
      container.insertBefore(button, items[index].button);
      items.splice(index, 0, item);
    }

    return {
      element: button,
      setDisabled(disabled) {
        button.disabled = disabled;
      },
      remove() {
        const at = items.indexOf(item);
        if (at === -1) return;
        items.splice(at, 1);
        button.remove();
      },
    };
  }

  return {
    add,
    /** API rattachée à la portée d'un module (boutons retirés à sa désactivation). */
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
