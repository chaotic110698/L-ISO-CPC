/**
 * Une « portée » collecte les fonctions de nettoyage d'un module (extensions d'éditeur, boutons,
 * écouteurs…). Quand le module est désactivé, `dispose()` les exécute toutes en ordre inverse :
 * la désactivation est réelle, sans que chaque module ait à gérer son propre ménage.
 */
export function createScope() {
  const disposers = [];
  const controller = new AbortController();
  let disposed = false;

  return {
    /** Signal annulé à la désactivation : utile pour interrompre un travail asynchrone. */
    signal: controller.signal,

    get disposed() {
      return disposed;
    },

    /** Enregistre une fonction de nettoyage et la renvoie telle quelle. */
    add(dispose) {
      if (typeof dispose !== 'function') return dispose;
      if (disposed) {
        dispose();
        return dispose;
      }
      disposers.push(dispose);
      return dispose;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      while (disposers.length) {
        const dispose = disposers.pop();
        try {
          dispose();
        } catch (error) {
          console.error('Erreur pendant le nettoyage', error);
        }
      }
    },
  };
}
