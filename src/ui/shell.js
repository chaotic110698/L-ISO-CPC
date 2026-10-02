import { h } from '../core/dom.js';
import { icon } from './icons.js';

const WIDE_QUERY = '(min-width: 1024px)';

/**
 * Structure générale de la page :
 *   barre du haut (menu, nom du programme, thème)
 *   menu latéral (navigation entre les fonctions) + zone des pages.
 *
 * Le menu latéral est fixe sur grand écran (repliable avec ☰) et escamotable sur mobile.
 * Ses entrées sont déclarées par les pages et les modules (les futurs Cours, Simulation,
 * Calculateurs… y ajouteront les leurs) ; les fonctions à venir apparaissent grisées.
 */
export function createShell(root, { onRename, onToggleTheme, collapsed = false, onCollapsedChange }) {
  const dirtyDot = h('span', { class: 'dirty-dot', title: 'Modifications non enregistrées', hidden: true }, icon('dot'));
  const titleText = h('span', { class: 'program-title-text' });
  const title = h(
    'button',
    { type: 'button', class: 'program-title', title: 'Renommer le programme', onclick: onRename },
    titleText,
    dirtyDot,
  );
  const themeButton = h('button', { type: 'button', class: 'icon-btn', onclick: onToggleTheme });
  const menuButton = h(
    'button',
    { type: 'button', class: 'icon-btn', 'aria-label': 'Menu', title: 'Menu', 'aria-controls': 'sidenav', onclick: () => toggleMenu() },
    icon('menu'),
  );

  const topbar = h(
    'header',
    { class: 'topbar' },
    menuButton,
    h('a', { class: 'brand', href: '#/accueil', title: 'Accueil' }, 'ISO'),
    title,
    h('div', { class: 'topbar-spacer' }),
    themeButton,
  );

  const mainList = h('ul', { class: 'sidenav-list' });
  const upcomingList = h('ul', { class: 'sidenav-list' });
  const upcomingSection = h(
    'div',
    { class: 'sidenav-section', hidden: true },
    h('p', { class: 'sidenav-heading' }, 'À venir'),
    upcomingList,
  );
  const sidenav = h(
    'nav',
    { id: 'sidenav', class: 'sidenav', 'aria-label': 'Menu principal' },
    h('div', { class: 'sidenav-section' }, mainList),
    upcomingSection,
  );
  const backdrop = h('div', { class: 'nav-backdrop', onclick: () => setOpen(false) });
  const pages = h('main', { class: 'pages' });

  root.replaceChildren(topbar, h('div', { class: 'app-body' }, sidenav, backdrop, pages));
  root.classList.add('app');

  const wide = window.matchMedia(WIDE_QUERY);
  const items = new Map();

  function setOpen(open) {
    root.classList.toggle('nav-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    if (open) sidenav.querySelector('a, button:not(:disabled)')?.focus();
  }

  function setCollapsed(value) {
    root.classList.toggle('nav-collapsed', value);
    menuButton.setAttribute('aria-expanded', String(!value));
  }

  function toggleMenu() {
    if (wide.matches) {
      const next = !root.classList.contains('nav-collapsed');
      setCollapsed(next);
      onCollapsedChange?.(next);
    } else {
      setOpen(!root.classList.contains('nav-open'));
    }
  }

  setCollapsed(collapsed);
  wide.addEventListener('change', () => setOpen(false));
  sidenav.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.classList.contains('nav-open')) {
      setOpen(false);
      menuButton.focus();
    }
  });

  return {
    pages,

    /**
     * Ajoute une entrée au menu. `path` : lien vers une page ; `onSelect` : action ;
     * `upcoming: true` : fonction à venir (grisée, non cliquable).
     */
    addNavItem({ id, path, label, icon: iconName, onSelect, upcoming = false, description }) {
      const content = [icon(iconName), h('span', { class: 'sidenav-label' }, label)];
      let element;
      if (upcoming) {
        element = h('span', { class: 'sidenav-item is-upcoming', title: description ?? 'Bientôt disponible' }, content, h('span', { class: 'badge' }, 'bientôt'));
        upcomingSection.hidden = false;
      } else if (path) {
        element = h('a', { class: 'sidenav-item', href: `#${path}`, title: label, onclick: () => setOpen(false) }, content);
      } else {
        element = h(
          'button',
          {
            type: 'button',
            class: 'sidenav-item',
            title: label,
            onclick: () => {
              setOpen(false);
              onSelect?.();
            },
          },
          content,
        );
      }
      const li = h('li', { dataset: { nav: id } }, element);
      (upcoming ? upcomingList : mainList).append(li);
      items.set(id, { path, element });
    },

    setRoute(path) {
      for (const { path: itemPath, element } of items.values()) {
        if (itemPath && itemPath === path) element.setAttribute('aria-current', 'page');
        else element.removeAttribute('aria-current');
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
