import { assignedVariables, referencedVariables } from '../engine/macros.js';
import { nextFreeVariable } from '../engine/macro-ranges.js';

export const MACRO_STORE = 'macros';

/**
 * Variables de macro : noms et descriptions personnels (« #901 = cote mesurée »), plages libres
 * du profil en vigueur, utilisation dans les autres programmes enregistrés, prochaine variable
 * libre. Les noms valent pour toutes les machines et tous les programmes.
 *
 * Événement : 'macros:changed' (noms modifiés ou autres programmes réanalysés).
 */
export function createMacroService({ db, profiles, workspace, bus }) {
  const names = new Map();
  let others = { assigned: new Map(), referenced: new Set() };
  let othersStale = true;

  const emit = () => bus.emit('macros:changed');

  const service = {
    /** Vrai quand le module « Avertissements de macros » est actif. */
    warningsEnabled: false,

    async init() {
      for (const record of await db.getAll(MACRO_STORE)) {
        if (Number.isInteger(record.index)) names.set(record.index, record);
      }
      bus.on('workspace:list-changed', () => {
        othersStale = true;
        service.refreshOthers();
      });
      bus.on('workspace:opened', () => {
        othersStale = true;
        service.refreshOthers();
      });
      bus.on('profiles:changed', emit);
    },

    name: (index) => names.get(index) ?? null,
    names: () => [...names.values()].sort((a, b) => a.index - b.index),

    /** Nom / description d'une variable ; tous deux vides : la variable redevient anonyme. */
    async setName(index, { name = '', description = '' }) {
      const record = { id: String(index), index, name: name.trim(), description: description.trim(), updatedAt: Date.now() };
      if (!record.name && !record.description) {
        names.delete(index);
        await db.delete(MACRO_STORE, record.id);
      } else {
        names.set(index, record);
        await db.put(MACRO_STORE, record);
      }
      emit();
    },

    /** Plages libres en vigueur : { profile: { id, name } | null, ranges }. */
    ranges: () => profiles.macroRanges(),

    /** Réanalyse les autres programmes enregistrés (affectations et références). */
    async refreshOthers() {
      if (!othersStale) return others;
      othersStale = false;
      const currentId = workspace.current?.id;
      const assigned = new Map();
      const referenced = new Set();
      for (const program of await workspace.list()) {
        if (program.id === currentId) continue;
        for (const index of assignedVariables(program.content)) {
          if (!assigned.has(index)) assigned.set(index, []);
          assigned.get(index).push(program.name);
        }
        for (const index of referencedVariables(program.content)) referenced.add(index);
      }
      others = { assigned, referenced };
      emit();
      return others;
    },

    /** Programmes (autres que le courant) où chaque variable est affectée : Map(index → [noms]). */
    assignedElsewhere: () => others.assigned,

    /**
     * Prochaine variable libre des plages du profil : ni utilisée dans le programme courant
     * (`usedHere`), ni dans un autre programme, ni déjà nommée. null si la plage est pleine
     * ou si le profil ne définit aucune plage.
     */
    nextFree(usedHere = new Set()) {
      const { ranges } = profiles.macroRanges();
      const used = new Set([...usedHere, ...others.referenced, ...names.keys()]);
      return nextFreeVariable(ranges, used);
    },

    // --- Sauvegarde globale ---------------------------------------------------------------------
    exportAll: () => service.names(),

    async importAll(records, { mode = 'merge' } = {}) {
      const summary = { applied: 0, invalid: 0 };
      if (mode === 'replace') {
        for (const index of [...names.keys()]) await db.delete(MACRO_STORE, String(index));
        names.clear();
      }
      for (const record of Array.isArray(records) ? records : []) {
        if (!Number.isInteger(record?.index) || record.index < 0) {
          summary.invalid++;
          continue;
        }
        const existing = names.get(record.index);
        if (existing && mode === 'merge' && (record.updatedAt ?? 0) <= (existing.updatedAt ?? 0)) continue;
        const clean = { id: String(record.index), index: record.index, name: String(record.name ?? '').trim(), description: String(record.description ?? '').trim(), updatedAt: record.updatedAt ?? Date.now() };
        names.set(record.index, clean);
        await db.put(MACRO_STORE, clean);
        summary.applied++;
      }
      emit();
      return summary;
    },
  };
  return service;
}
