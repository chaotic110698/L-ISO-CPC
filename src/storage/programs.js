import { uid, uniqueName, normalizeNewlines } from '../core/util.js';
import { DEFAULT_MACHINE_TYPE, isKnownMachineType } from '../data/machine-types.js';

export const PROGRAM_STORE = 'programs';

/**
 * @typedef {Object} Program
 * @property {string} id
 * @property {string} name
 * @property {string} content       texte ISO (fins de ligne LF)
 * @property {string} machineType   'tournage' | 'fraisage' | …
 * @property {number} createdAt     horodatage (ms)
 * @property {number} updatedAt     horodatage (ms)
 * @property {number} [deletedAt]   horodatage de mise à la corbeille (absent : programme actif)
 * @property {boolean} [pinned]     épinglé en tête de la liste
 */

const DAY = 24 * 60 * 60 * 1000;

/** Vérifie et normalise un programme venant de l'extérieur (import). Renvoie null s'il est invalide. */
export function sanitizeProgram(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.content !== 'string') return null;
  const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Sans titre',
    content: normalizeNewlines(raw.content),
    machineType: isKnownMachineType(raw.machineType) ? raw.machineType : DEFAULT_MACHINE_TYPE,
    createdAt,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt,
    ...(Number.isFinite(raw.deletedAt) ? { deletedAt: raw.deletedAt } : {}),
    ...(raw.pinned === true ? { pinned: true } : {}),
  };
}

export function createProgramRepository(db, { now = () => Date.now(), makeId = uid } = {}) {
  const repo = {
    /** Programmes (hors corbeille) triés du plus récemment modifié au plus ancien. */
    async list() {
      const all = await db.getAll(PROGRAM_STORE);
      return all.filter((p) => !p.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt);
    },

    /** Tous les programmes, corbeille comprise (sauvegarde JSON). */
    listAll: () => db.getAll(PROGRAM_STORE),

    /** Corbeille : programmes supprimés, du plus récent au plus ancien. */
    async listTrash() {
      const all = await db.getAll(PROGRAM_STORE);
      return all.filter((p) => p.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
    },

    get: (id) => db.get(PROGRAM_STORE, id),

    async create({ name = 'Nouveau programme', content = '', machineType = DEFAULT_MACHINE_TYPE } = {}) {
      const existing = (await repo.list()).map((p) => p.name);
      const time = now();
      // (les noms des programmes à la corbeille restent libres : ils sont vérifiés à la restauration)
      const program = {
        id: makeId(),
        name: uniqueName(name.trim() || 'Nouveau programme', existing),
        content: normalizeNewlines(content),
        machineType,
        createdAt: time,
        updatedAt: time,
      };
      await db.put(PROGRAM_STORE, program);
      return program;
    },

    /** Met à jour le nom et/ou le contenu. */
    async update(id, changes) {
      const program = await db.get(PROGRAM_STORE, id);
      if (!program) throw new Error('Programme introuvable.');
      const next = { ...program, updatedAt: Math.max(now(), program.updatedAt + 1) };
      if (typeof changes.name === 'string' && changes.name.trim()) next.name = changes.name.trim();
      if (typeof changes.content === 'string') next.content = normalizeNewlines(changes.content);
      if (isKnownMachineType(changes.machineType)) next.machineType = changes.machineType;
      await db.put(PROGRAM_STORE, next);
      return next;
    },

    async duplicate(id) {
      const program = await db.get(PROGRAM_STORE, id);
      if (!program) throw new Error('Programme introuvable.');
      return repo.create({ name: `${program.name} (copie)`, content: program.content, machineType: program.machineType });
    },

    /** Épingle ou désépingle (sans changer la date de modification). */
    async setPinned(id, pinned) {
      const program = await db.get(PROGRAM_STORE, id);
      if (!program) throw new Error('Programme introuvable.');
      const { pinned: _old, ...rest } = program;
      const next = pinned ? { ...rest, pinned: true } : rest;
      await db.put(PROGRAM_STORE, next);
      return next;
    },

    /** Suppression définitive. */
    remove: (id) => db.delete(PROGRAM_STORE, id),

    /** Mise à la corbeille (le contenu et la date de modification sont conservés). */
    async trash(id) {
      const program = await db.get(PROGRAM_STORE, id);
      if (!program) throw new Error('Programme introuvable.');
      const next = { ...program, deletedAt: now() };
      await db.put(PROGRAM_STORE, next);
      return next;
    },

    /** Sortie de la corbeille ; le nom est rendu unique si un autre programme l'a pris entre-temps. */
    async restore(id) {
      const program = await db.get(PROGRAM_STORE, id);
      if (!program) throw new Error('Programme introuvable.');
      const { deletedAt: _deleted, ...rest } = program;
      const names = (await repo.list()).map((p) => p.name);
      const next = { ...rest, name: uniqueName(program.name, names) };
      await db.put(PROGRAM_STORE, next);
      return next;
    },

    /** Supprime définitivement les programmes à la corbeille depuis plus de `days` jours. */
    async purgeTrash(days) {
      const limit = now() - days * DAY;
      const expired = (await repo.listTrash()).filter((p) => p.deletedAt <= limit);
      for (const program of expired) await db.delete(PROGRAM_STORE, program.id);
      return expired.length;
    },

    /**
     * Import en masse (sauvegarde JSON).
     * - 'merge'   : ajoute les absents, remplace ceux dont la version importée est plus récente ;
     * - 'replace' : efface tous les programmes puis importe.
     */
    async importMany(rawPrograms, { mode = 'merge' } = {}) {
      const summary = { added: 0, updated: 0, skipped: 0, invalid: 0 };
      const valid = [];
      for (const raw of Array.isArray(rawPrograms) ? rawPrograms : []) {
        const program = sanitizeProgram(raw);
        if (program) valid.push(program);
        else summary.invalid++;
      }

      if (mode === 'replace') {
        await db.clear(PROGRAM_STORE);
        await db.putMany(PROGRAM_STORE, valid);
        summary.added = valid.length;
        return summary;
      }

      const toWrite = [];
      for (const program of valid) {
        const existing = await db.get(PROGRAM_STORE, program.id);
        if (!existing) {
          toWrite.push(program);
          summary.added++;
        } else if (
          program.updatedAt > existing.updatedAt &&
          (program.content !== existing.content || program.name !== existing.name || program.deletedAt !== existing.deletedAt || program.pinned !== existing.pinned)
        ) {
          toWrite.push(program);
          summary.updated++;
        } else {
          summary.skipped++;
        }
      }
      if (toWrite.length) await db.putMany(PROGRAM_STORE, toWrite);
      return summary;
    },
  };
  return repo;
}
