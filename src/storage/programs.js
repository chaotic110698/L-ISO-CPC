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
 */

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
  };
}

export function createProgramRepository(db, { now = () => Date.now(), makeId = uid } = {}) {
  const repo = {
    /** Programmes triés du plus récemment modifié au plus ancien. */
    async list() {
      const all = await db.getAll(PROGRAM_STORE);
      return all.sort((a, b) => b.updatedAt - a.updatedAt);
    },

    get: (id) => db.get(PROGRAM_STORE, id),

    async create({ name = 'Nouveau programme', content = '', machineType = DEFAULT_MACHINE_TYPE } = {}) {
      const existing = (await repo.list()).map((p) => p.name);
      const time = now();
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

    remove: (id) => db.delete(PROGRAM_STORE, id),

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
          (program.content !== existing.content || program.name !== existing.name)
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
