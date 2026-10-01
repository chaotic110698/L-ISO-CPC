/**
 * Routeur par fragment d'URL (#/editeur, #/parametres…) : compatible file:// et hébergement statique.
 * Les pages sont créées à la première visite puis conservées (masquées) : l'éditeur garde ainsi
 * son état, son historique d'annulation et sa position quand on passe aux Paramètres.
 *
 * Routes prévues pour les phases suivantes : #/cours, #/simulation (enregistrées par leurs modules).
 */
export function createRouter({ container, defaultPath, onChange }) {
  const routes = new Map();
  let current = null;

  function pathFromHash() {
    const path = decodeURIComponent(location.hash.replace(/^#/, ''));
    return routes.has(path) ? path : defaultPath;
  }

  function render() {
    const path = pathFromHash();
    const route = routes.get(path);
    if (!route) return;
    if (!route.element) {
      route.element = route.mount();
      route.element.classList.add('page');
      container.append(route.element);
    }
    for (const other of routes.values()) {
      if (other.element) other.element.hidden = other !== route;
    }
    const previous = current;
    current = path;
    if (previous !== path) {
      route.onShow?.();
      route.element.dispatchEvent(new CustomEvent('page:show'));
      onChange?.(path, route);
    }
  }

  return {
    /** route : { title, mount(): HTMLElement, onShow?() } */
    register(path, route) {
      routes.set(path, { ...route, element: null });
      if (current !== null) render();
      return () => {
        routes.get(path)?.element?.remove();
        routes.delete(path);
      };
    },
    start() {
      window.addEventListener('hashchange', render);
      render();
    },
    navigate(path) {
      if (location.hash === `#${path}`) render();
      else location.hash = path;
    },
    get current() {
      return current;
    },
  };
}
