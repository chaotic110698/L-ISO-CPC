/**
 * Sauvegarde / restauration globale au format JSON.
 *
 * Chaque domaine de données (programmes, réglages, puis profils, bibliothèque, noms de macros…)
 * s'enregistre comme une « section » ; le fichier contient une entrée par section exportée :
 *
 *   {
 *     "format": "l-iso-cpc/sauvegarde",
 *     "formatVersion": 1,
 *     "appVersion": "0.1.0",
 *     "exportedAt": "2026-10-01T12:00:00.000Z",
 *     "sections": { "programmes": [...], "parametres": {...} }
 *   }
 */

export const BACKUP_FORMAT = 'l-iso-cpc/sauvegarde';
export const BACKUP_FORMAT_VERSION = 1;

export class BackupError extends Error {}

/**
 * @typedef {Object} BackupSection
 * @property {string} label                               libellé affiché
 * @property {() => Promise<any>} exportData              données de la section
 * @property {(data: any, options: { mode: 'merge'|'replace' }) => Promise<object>} importData
 * @property {(data: any) => string} [describe]           résumé lisible du contenu (« 3 programmes »)
 */

export function createBackupService({ appVersion, now = () => new Date() }) {
  /** @type {Map<string, BackupSection>} */
  const sections = new Map();

  return {
    /** @returns {() => void} fonction de retrait de la section */
    register(id, section) {
      sections.set(id, section);
      return () => {
        if (sections.get(id) === section) sections.delete(id);
      };
    },

    list() {
      return [...sections].map(([id, section]) => ({ id, label: section.label }));
    },

    async export(ids = [...sections.keys()]) {
      const data = {};
      for (const id of ids) {
        const section = sections.get(id);
        if (section) data[id] = await section.exportData();
      }
      return {
        format: BACKUP_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        appVersion,
        exportedAt: now().toISOString(),
        sections: data,
      };
    },

    /** Analyse le texte d'un fichier de sauvegarde. Lève une BackupError explicite si invalide. */
    parse(text) {
      let backup;
      try {
        backup = JSON.parse(text);
      } catch {
        throw new BackupError('Ce fichier n’est pas un JSON valide.');
      }
      if (!backup || backup.format !== BACKUP_FORMAT) {
        throw new BackupError('Ce fichier n’est pas une sauvegarde L-ISO-CPC.');
      }
      if (!Number.isInteger(backup.formatVersion) || backup.formatVersion < 1) {
        throw new BackupError('Version de sauvegarde invalide.');
      }
      if (backup.formatVersion > BACKUP_FORMAT_VERSION) {
        throw new BackupError('Cette sauvegarde provient d’une version plus récente de l’application.');
      }
      if (!backup.sections || typeof backup.sections !== 'object') {
        throw new BackupError('La sauvegarde ne contient aucune donnée.');
      }
      // Les futures versions du format ajouteront ici leurs migrations (formatVersion 1 → 2…).
      return backup;
    },

    /** Contenu d'une sauvegarde : sections reconnues (importables) et inconnues. */
    summarize(backup) {
      return Object.keys(backup.sections).map((id) => {
        const section = sections.get(id);
        return {
          id,
          label: section?.label ?? id,
          known: Boolean(section),
          description: section?.describe?.(backup.sections[id]) ?? '',
        };
      });
    },

    /** Importe les sections demandées. Renvoie { [id]: résumé renvoyé par la section }. */
    async import(backup, { sections: ids = Object.keys(backup.sections), mode = 'merge' } = {}) {
      const results = {};
      for (const id of ids) {
        const section = sections.get(id);
        if (!section || !(id in backup.sections)) continue;
        results[id] = await section.importData(backup.sections[id], { mode });
      }
      return results;
    },
  };
}
