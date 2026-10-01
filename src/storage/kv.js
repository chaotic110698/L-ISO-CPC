/**
 * Stockage clé/valeur synchrone (localStorage), avec sérialisation JSON et préfixe d'espace de noms.
 * Utilisé pour les réglages (lus avant l'affichage, pour appliquer le thème sans clignotement)
 * et les petites données. Les programmes vont dans la base (voir database.js).
 *
 * Si localStorage est indisponible (navigation privée stricte…), on se replie sur la mémoire :
 * l'application fonctionne, mais rien n'est conservé après fermeture (`available === false`).
 */
export const KV_PREFIX = 'isocpc:';

export function createMemoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
  };
}

function probeLocalStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = `${KV_PREFIX}__test__`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function createKv({ storage, prefix = KV_PREFIX } = {}) {
  const backend = storage ?? probeLocalStorage();
  const target = backend ?? createMemoryStorage();

  return {
    available: Boolean(backend),

    get(key, fallback = undefined) {
      try {
        const raw = target.getItem(prefix + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    /** @returns {boolean} false si l'écriture a échoué (quota dépassé…) */
    set(key, value) {
      try {
        target.setItem(prefix + key, JSON.stringify(value));
        return true;
      } catch (error) {
        console.warn(`Écriture impossible de « ${key} »`, error);
        return false;
      }
    },

    remove(key) {
      try {
        target.removeItem(prefix + key);
      } catch {
        // rien à faire
      }
    },

    keys() {
      const keys = [];
      for (let i = 0; i < target.length; i++) {
        const key = target.key(i);
        if (key?.startsWith(prefix)) keys.push(key.slice(prefix.length));
      }
      return keys;
    },
  };
}
