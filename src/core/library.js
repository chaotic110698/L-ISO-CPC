import { uid, normalizeNewlines } from './util.js';

export const LIBRARY_STORE = 'library';

/**
 * Bibliothèque personnelle de sous-programmes et d'extraits réutilisables.
 * Élément : { id, name, description, content, createdAt, updatedAt }.
 * Événement : 'library:changed'.
 */
export function createLibraryService({ db, bus, now = () => Date.now() }) {
  const changed = () => bus?.emit('library:changed');
  const service = {
    async list() {
      return (await db.getAll(LIBRARY_STORE)).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    },

    async create({ name, description = '', content }) {
      const time = now();
      const item = { id: uid(), name: name.trim() || 'Sans titre', description: description.trim(), content: normalizeNewlines(content), createdAt: time, updatedAt: time };
      await db.put(LIBRARY_STORE, item);
      changed();
      return item;
    },

    async update(id, patch) {
      const item = await db.get(LIBRARY_STORE, id);
      if (!item) throw new Error('Élément introuvable.');
      const next = { ...item, updatedAt: now() };
      if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim();
      if (typeof patch.description === 'string') next.description = patch.description.trim();
      if (typeof patch.content === 'string') next.content = normalizeNewlines(patch.content);
      await db.put(LIBRARY_STORE, next);
      changed();
      return next;
    },

    async remove(id) {
      await db.delete(LIBRARY_STORE, id);
      changed();
    },

    exportAll: () => service.list(),

    async importAll(records, { mode = 'merge' } = {}) {
      const summary = { added: 0, updated: 0, invalid: 0 };
      if (mode === 'replace') await db.clear(LIBRARY_STORE);
      for (const record of Array.isArray(records) ? records : []) {
        if (!record || typeof record.id !== 'string' || typeof record.content !== 'string' || typeof record.name !== 'string') {
          summary.invalid++;
          continue;
        }
        const existing = mode === 'merge' ? await db.get(LIBRARY_STORE, record.id) : null;
        if (existing && (record.updatedAt ?? 0) <= (existing.updatedAt ?? 0)) continue;
        await db.put(LIBRARY_STORE, { ...record, content: normalizeNewlines(record.content) });
        if (existing) summary.updated++;
        else summary.added++;
      }
      changed();
      return summary;
    },
  };
  return service;
}
