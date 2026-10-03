import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { actionSheet } from './dialogs.js';

/**
 * Barre d'outils de l'éditeur. Les modules y ajoutent leurs boutons ; `order` fixe la position
 * (petits nombres à gauche). Sur petit écran, seules les icônes sont affichées.
 * `menu: true` range l'action dans le menu « Outils » (actions ponctuelles), qui n'apparaît
 * que s'il contient au moins une action.
 */
export function createToolbar(container) {
  const items = [];
  const menuItems = [];
  let menuHandle = null;

  function addToMenu(item) {
    menuItems.push(item);
    menuItems.sort((a, b) => a.order - b.order);
    if (!menuHandle) {
      menuHandle = add({
        id: 'menu',
        icon: 'more',
        label: 'Outils',
        title: 'Autres outils',
        order: 95,
        onClick: async () => {
          const choice = await actionSheet({
            title: 'Outils',
            actions: menuItems.map((m) => ({ label: m.label, value: m.id, icon: m.icon, description: m.title !== m.label ? m.title : undefined })),
          });
          menuItems.find((m) => m.id === choice)?.onClick();
        },
      });
    }
    return {
      element: null,
      setDisabled() {},
      remove() {
        const at = menuItems.indexOf(item);
        if (at !== -1) menuItems.splice(at, 1);
        if (!menuItems.length && menuHandle) {
          menuHandle.remove();
          menuHandle = null;
        }
      },
    };
  }

  function add({ id, icon: iconName, label, title, onClick, order = 100, menu = false }) {
    if (menu) return addToMenu({ id, icon: iconName, label, title: title ?? label, onClick, order });
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
    const item = { id, label, title: title ?? label, icon: iconName, onClick, order, button };
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

  /** Actions disponibles (boutons et menu « Outils »), pour la palette de commandes. */
  const list = () =>
    [...items.filter((item) => item.id !== 'menu'), ...menuItems].map(({ id, label, title, icon: iconName, onClick }) => ({ id, label, title, icon: iconName, onClick }));

  return {
    add,
    list,
    /** API rattachée à la portée d'un module (boutons retirés à sa désactivation). */
    scoped(scope) {
      return {
        add(options) {
          const handle = add(options);
          scope.add(handle.remove);
          return handle;
        },
        list,
      };
    },
  };
}
