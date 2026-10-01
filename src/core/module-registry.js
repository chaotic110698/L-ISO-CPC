import { createScope } from './scope.js';

/**
 * Registre des fonctionnalités branchables.
 *
 * Un module est un objet :
 *   {
 *     id: 'lineNumbers',                 identifiant unique (camelCase)
 *     label: 'Numérotation des lignes',  libellé de l'interrupteur dans Paramètres
 *     description: '…',                  texte d'aide (facultatif)
 *     group: 'editeur',                  regroupement dans Paramètres (voir MODULE_GROUPS)
 *     defaultEnabled: true,              état initial (true par défaut)
 *     requires: ['autreModule'],         dépendances (facultatif)
 *     settings: [ …entrées de schéma ],  réglages propres au module (facultatif)
 *     activate(ctx) { … }                branche le module ; peut renvoyer une fonction de nettoyage
 *   }
 *
 * Le contexte `ctx` fourni à activate() rattache automatiquement tout ce que le module ajoute
 * (extensions d'éditeur, boutons, écouteurs…) à une portée détruite à la désactivation.
 * Désactiver un module dans Paramètres le retire donc réellement, sans recharger la page.
 * Un module dont une dépendance est inactive reste inactif.
 */
export function createModuleRegistry({ settings, createContext, onError = (def, error) => console.error(def.id, error) }) {
  const entries = new Map();
  const changeListeners = new Set();
  let started = false;
  let syncing = false;
  let syncAgain = false;

  const toggleKey = (id) => `modules.${id}`;
  const isEnabled = (id) => settings.get(toggleKey(id)) === true;

  function shouldRun(id, visiting = new Set()) {
    const entry = entries.get(id);
    if (!entry || entry.error || !isEnabled(id) || visiting.has(id)) return false;
    visiting.add(id);
    const ok = (entry.def.requires ?? []).every((dep) => shouldRun(dep, visiting));
    visiting.delete(id);
    return ok;
  }

  /** Ordre topologique : chaque module après ses dépendances. */
  function order() {
    const result = [];
    const seen = new Set();
    const visit = (id) => {
      if (seen.has(id) || !entries.has(id)) return;
      seen.add(id);
      for (const dep of entries.get(id).def.requires ?? []) visit(dep);
      result.push(id);
    };
    for (const id of entries.keys()) visit(id);
    return result;
  }

  function fail(entry, error) {
    entry.error = error;
    onError(entry.def, error);
  }

  function activate(entry) {
    const scope = createScope();
    entry.scope = scope;
    try {
      const result = entry.def.activate(createContext(entry.def, scope));
      if (typeof result === 'function') scope.add(result);
      else if (typeof result?.deactivate === 'function') scope.add(() => result.deactivate());
      else if (typeof result?.then === 'function') {
        result.catch((error) => {
          if (entry.scope !== scope) return;
          deactivate(entry);
          fail(entry, error);
          sync();
        });
      }
    } catch (error) {
      entry.scope = null;
      scope.dispose();
      fail(entry, error);
    }
  }

  function deactivate(entry) {
    const scope = entry.scope;
    entry.scope = null;
    scope?.dispose();
  }

  function sync() {
    if (!started) return;
    if (syncing) {
      syncAgain = true;
      return;
    }
    syncing = true;
    try {
      do {
        syncAgain = false;
        const ids = order();
        // Un module désactivé par l'utilisateur oublie son éventuelle erreur (nouvel essai au réactivage).
        for (const id of ids) if (!isEnabled(id)) entries.get(id).error = null;
        // Désactivation des dépendants avant leurs dépendances…
        for (const id of [...ids].reverse()) {
          const entry = entries.get(id);
          if (entry.scope && !shouldRun(id)) deactivate(entry);
        }
        // …puis activation des dépendances avant leurs dépendants.
        for (const id of ids) {
          const entry = entries.get(id);
          if (!entry.scope && shouldRun(id)) activate(entry);
        }
      } while (syncAgain);
    } finally {
      syncing = false;
    }
    for (const listener of [...changeListeners]) listener();
  }

  return {
    register(def) {
      if (!def?.id || typeof def.activate !== 'function') throw new Error('Module invalide : id et activate() sont requis.');
      if (entries.has(def.id)) throw new Error(`Module déjà enregistré : ${def.id}`);
      entries.set(def.id, { def, scope: null, error: null });
      settings.register([
        {
          key: toggleKey(def.id),
          section: 'modules',
          type: 'boolean',
          label: def.label,
          description: def.description,
          group: def.group ?? 'outils',
          module: def.id,
          default: def.defaultEnabled ?? true,
        },
        ...(def.settings ?? []).map((entry) => ({ ...entry, section: 'modules', parentModule: def.id })),
      ]);
      sync();
    },

    /** Active les modules selon les réglages, puis suit les changements d'interrupteurs. */
    start() {
      if (started) return;
      started = true;
      settings.subscribe('*', (_value, key) => {
        if (key.startsWith('modules.')) sync();
      });
      sync();
    },

    list: () => [...entries.values()].map((entry) => entry.def),
    isActive: (id) => Boolean(entries.get(id)?.scope),
    toggleKey,

    /** 'active' | 'disabled' | 'blocked' (dépendance inactive) | 'error' */
    status(id) {
      const entry = entries.get(id);
      if (!entry) return 'disabled';
      if (entry.scope) return 'active';
      if (entry.error) return 'error';
      return isEnabled(id) ? 'blocked' : 'disabled';
    },

    error: (id) => entries.get(id)?.error ?? null,

    /** Rappel après chaque synchronisation (pour rafraîchir la page Paramètres). */
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
  };
}
