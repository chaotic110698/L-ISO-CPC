/**
 * Routeur par fragment d'URL (#/editeur, #/parametres…) : compatible file:// et hébergement statique.
 * Les pages sont créées à la première visite puis conservées (masquées) : l'éditeur garde ainsi
 * son état, son historique d'annulation et sa position quand on passe aux Paramètres.
 *
 * Une route reçoit aussi ses sous-chemins : #/cours/repere-du-tour affiche la page /cours, qui
 * lit la suite (« repere-du-tour ») dans onShow(sousChemin) ou l'événement « page:show ».
 */
export function createRouter({ container, defaultPath, onChange }) {
  const routes = new Map();
  let current = null;
  let currentFull = null;

  /** { key, rest, full } : route enregistrée et sous-chemin éventuel. */
  function resolve() {
    const full = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (routes.has(full)) return { key: full, rest: '', full };
    for (const key of routes.keys()) {
      if (full.startsWith(`${key}/`)) return { key, rest: full.slice(key.length + 1), full };
    }
    return { key: defaultPath, rest: '', full: defaultPath };
  }

  function render() {
    const { key: path, rest, full } = resolve();
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
    const previousFull = currentFull;
    current = path;
    currentFull = full;
    if (previous !== path || previousFull !== full) {
      route.onShow?.(rest);
      route.element.dispatchEvent(new CustomEvent('page:show', { detail: { path: rest } }));
      if (previous !== path) onChange?.(path, route);
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
        // Page retirée alors qu'elle était affichée (module désactivé) : page par défaut.
        if (current === path) {
          current = null;
          currentFull = null;
          if (location.hash === `#${defaultPath}`) render();
          else location.hash = defaultPath;
        }
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
