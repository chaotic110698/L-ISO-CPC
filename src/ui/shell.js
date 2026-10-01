import { h } from '../core/dom.js';
import { icon } from './icons.js';

/**
 * Structure générale de la page : barre du haut (menu, nom du programme, navigation, thème)
 * et zone des pages. Les liens de navigation sont déclarés par les pages enregistrées
 * (les futurs modules Cours / Simulation y ajouteront les leurs).
 */
export function createShell(root, { onMenu, onRename, onToggleTheme }) {
  const dirtyDot = h('span', { class: 'dirty-dot', title: 'Modifications non enregistrées', hidden: true }, icon('dot'));
  const titleText = h('span', { class: 'program-title-text' });
  const title = h(
    'button',
    { type: 'button', class: 'program-title', title: 'Renommer le programme', onclick: onRename },
    titleText,
    dirtyDot,
  );
  const nav = h('nav', { class: 'topnav', 'aria-label': 'Navigation principale' });
  const themeButton = h('button', { type: 'button', class: 'icon-btn', onclick: onToggleTheme });

  const topbar = h(
    'header',
    { class: 'topbar' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Programmes', title: 'Programmes', onclick: onMenu }, icon('menu')),
    h('span', { class: 'brand', 'aria-hidden': 'true' }, 'ISO'),
    title,
    h('div', { class: 'topbar-spacer' }),
    nav,
    themeButton,
  );
  const pages = h('main', { class: 'pages' });

  root.replaceChildren(topbar, pages);
  root.classList.add('app');

  const links = new Map();

  return {
    pages,

    addNavLink({ path, label, icon: iconName }) {
      const link = h('a', { href: `#${path}`, class: 'topnav-link', title: label }, icon(iconName), h('span', { class: 'topnav-label' }, label));
      nav.append(link);
      links.set(path, link);
    },

    setRoute(path) {
      for (const [linkPath, link] of links) {
        if (linkPath === path) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      title.hidden = path !== '/editeur';
    },

    setProgramName(name) {
      titleText.textContent = name ?? '';
      document.title = name ? `${name} · L-ISO-CPC` : 'L-ISO-CPC';
    },

    setDirty(dirty) {
      dirtyDot.hidden = !dirty;
    },

    setTheme(theme) {
      const next = theme === 'dark' ? 'clair' : 'sombre';
      themeButton.replaceChildren(icon(theme === 'dark' ? 'sun' : 'moon'));
      themeButton.setAttribute('aria-label', `Passer en thème ${next}`);
      themeButton.title = `Passer en thème ${next}`;
    },
  };
}
