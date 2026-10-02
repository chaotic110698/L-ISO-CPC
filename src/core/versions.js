import { uid, normalizeNewlines } from './util.js';

export const VERSION_STORE = 'versions';
export const MAX_AUTO_VERSIONS = 20;

/**
 * Versions d'un programme, pour les comparer ou revenir en arrière :
 *   - manuelles (« Enregistrer une version », avec un nom) ;
 *   - automatiques à l'ouverture d'un programme (si son contenu a changé depuis la dernière
 *     version), limitées aux MAX_AUTO_VERSIONS plus récentes par programme.
 * Version : { id, programId, label, auto, content, createdAt }
 */
export function createVersionService({ db, now = () => Date.now() }) {
  const service = {
    async list(programId) {
      const all = await db.getAll(VERSION_STORE);
      return all.filter((v) => v.programId === programId).sort((a, b) => b.createdAt - a.createdAt);
    },

    async create(programId, content, { label = '', auto = false } = {}) {
      const version = { id: uid(), programId, label: label.trim(), auto, content: normalizeNewlines(content), createdAt: now() };
      await db.put(VERSION_STORE, version);
      if (auto) await service.prune(programId);
      return version;
    },

    /** Version automatique, seulement si le contenu diffère de la dernière version. */
    async snapshot(programId, content, label = 'Ouverture du programme') {
      const [latest] = await service.list(programId);
      if (latest && latest.content === normalizeNewlines(content)) return null;
      return service.create(programId, content, { label, auto: true });
    },

    async prune(programId) {
      const autos = (await service.list(programId)).filter((v) => v.auto);
      for (const old of autos.slice(MAX_AUTO_VERSIONS)) await db.delete(VERSION_STORE, old.id);
    },

    async rename(id, label) {
      const version = await db.get(VERSION_STORE, id);
      if (!version) throw new Error('Version introuvable.');
      await db.put(VERSION_STORE, { ...version, label: label.trim(), auto: false });
    },

    remove: (id) => db.delete(VERSION_STORE, id),

    exportAll: () => db.getAll(VERSION_STORE),

    async importAll(records, { mode = 'merge' } = {}) {
      const summary = { added: 0, invalid: 0 };
      if (mode === 'replace') await db.clear(VERSION_STORE);
      const valid = (Array.isArray(records) ? records : []).filter((r) => r && typeof r.id === 'string' && typeof r.programId === 'string' && typeof r.content === 'string');
      summary.invalid = (Array.isArray(records) ? records.length : 0) - valid.length;
      for (const record of valid) {
        if (mode === 'merge' && (await db.get(VERSION_STORE, record.id))) continue;
        await db.put(VERSION_STORE, { ...record, content: normalizeNewlines(record.content), createdAt: Number(record.createdAt) || now() });
        summary.added++;
      }
      return summary;
    },
  };
  return service;
}
