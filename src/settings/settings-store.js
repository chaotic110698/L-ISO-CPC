/**
 * Magasin de réglages : valeurs validées par le schéma, persistées dans le stockage clé/valeur,
 * notifiées immédiatement aux abonnés (application instantanée, sans rechargement).
 *
 * Seuls les choix explicites de l'utilisateur sont enregistrés ; les autres réglages suivent
 * leur valeur par défaut (qui peut donc évoluer avec les versions de l'application).
 */
export const SETTINGS_KEY = 'settings';

function coerce(entry, value) {
  switch (entry.type) {
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'number': {
      const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof number !== 'number' || !Number.isFinite(number)) return undefined;
      let result = number;
      if (entry.min != null) result = Math.max(entry.min, result);
      if (entry.max != null) result = Math.min(entry.max, result);
      if (entry.step) result = Number((Math.round(result / entry.step) * entry.step).toFixed(10));
      return result;
    }
    case 'choice':
      return entry.options.some((option) => option.value === value) ? value : undefined;
    case 'string':
      return typeof value === 'string' ? value : undefined;
    default:
      return value;
  }
}

const defaultOf = (entry) => (typeof entry.default === 'function' ? entry.default() : entry.default);

export function createSettingsStore({ kv, entries = [] }) {
  const schema = new Map();
  const listeners = new Map();
  let values = kv.get(SETTINGS_KEY, {});
  if (!values || typeof values !== 'object' || Array.isArray(values)) values = {};

  const persist = () => kv.set(SETTINGS_KEY, values);

  function notify(key, value, previous) {
    for (const target of [key, '*']) {
      for (const listener of [...(listeners.get(target) ?? [])]) {
        try {
          listener(value, key, previous);
        } catch (error) {
          console.error(`Erreur dans un abonné au réglage « ${key} »`, error);
        }
      }
    }
  }

  const store = {
    /** Ajoute des entrées au schéma (le registre des modules y ajoute leurs interrupteurs). */
    register(newEntries) {
      for (const entry of newEntries) {
        if (!entry.key) throw new Error('Entrée de réglage sans clé.');
        schema.set(entry.key, Object.freeze({ ...entry }));
      }
    },

    entry: (key) => schema.get(key),
    entries: () => [...schema.values()],

    get(key) {
      const entry = schema.get(key);
      if (!entry) return values[key];
      if (key in values) {
        const value = coerce(entry, values[key]);
        if (value !== undefined) return value;
      }
      return defaultOf(entry);
    },

    /** Le réglage a-t-il été choisi explicitement (sinon il suit sa valeur par défaut) ? */
    isExplicit: (key) => key in values,

    set(key, value) {
      const entry = schema.get(key);
      if (!entry) throw new Error(`Réglage inconnu : ${key}`);
      const next = coerce(entry, value);
      if (next === undefined) throw new Error(`Valeur invalide pour « ${entry.label ?? key} ».`);
      const previous = store.get(key);
      values = { ...values, [key]: next };
      persist();
      if (!Object.is(previous, next)) notify(key, next, previous);
    },

    reset(key) {
      if (!(key in values)) return;
      const previous = store.get(key);
      const { [key]: _removed, ...rest } = values;
      values = rest;
      persist();
      const next = store.get(key);
      if (!Object.is(previous, next)) notify(key, next, previous);
    },

    resetAll() {
      const previous = Object.keys(values).map((key) => [key, store.get(key)]);
      values = {};
      persist();
      for (const [key, value] of previous) {
        const next = store.get(key);
        if (!Object.is(value, next)) notify(key, next, value);
      }
    },

    /**
     * Abonnement aux changements d'un réglage (ou de tous avec '*').
     * Le rappel reçoit (valeur, clé, valeurPrécédente).
     * @returns {() => void} fonction de désabonnement
     */
    subscribe(key, listener) {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(listener);
      return () => listeners.get(key)?.delete(listener);
    },

    /** Choix explicites (pour la sauvegarde JSON). */
    exportValues: () => ({ ...values }),

    /** Applique des réglages importés. 'replace' repart des valeurs par défaut. */
    importValues(imported, { mode = 'merge' } = {}) {
      const summary = { applied: 0, ignored: 0 };
      if (!imported || typeof imported !== 'object' || Array.isArray(imported)) return summary;
      if (mode === 'replace') store.resetAll();
      for (const [key, value] of Object.entries(imported)) {
        const entry = schema.get(key);
        if (!entry || coerce(entry, value) === undefined) {
          summary.ignored++;
          continue;
        }
        store.set(key, value);
        summary.applied++;
      }
      return summary;
    },
  };

  store.register(entries);
  return store;
}
