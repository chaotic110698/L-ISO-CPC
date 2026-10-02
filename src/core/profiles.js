import { uid, uniqueName } from './util.js';
import { codeKey } from '../engine/tokenizer.js';
import { normalizeRanges } from '../engine/macro-ranges.js';
import { BUILTIN_PROFILES } from '../data/profiles.js';
import { CATEGORIES } from '../data/categories.js';
import { DEFAULT_MACHINE_TYPE, isKnownMachineType } from '../data/machine-types.js';

export const PROFILE_STORE = 'profiles';

/** Catégories proposées pour un code G/M (les autres décrivent des adresses ou la syntaxe). */
export const CODE_CATEGORIES = CATEGORIES.filter((c) => ['motion', 'cycle', 'mode', 'tool', 'mcode', 'program'].includes(c.id));
const CODE_CATEGORY_IDS = new Set(CODE_CATEGORIES.map((c) => c.id));

/** « g01 », « M 100 », « G12.1 » → clé normalisée ('G1', 'M100', 'G12.1'), ou null. */
export function parseCodeKey(text) {
  const match = String(text ?? '').trim().match(/^([GM])\s*(\d+(?:\.\d+)?)$/i);
  return match ? codeKey(match[1], match[2]) : null;
}

const cleanText = (value, max = 4000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Définition de code saisie ou importée, nettoyée ; null = code retiré sur cette machine. */
export function sanitizeCodeDefinition(raw) {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object') return undefined;
  const definition = {
    category: CODE_CATEGORY_IDS.has(raw.category) ? raw.category : 'mode',
    name: cleanText(raw.name, 200) || 'Code personnalisé',
  };
  for (const key of ['description', 'syntax', 'example']) {
    const text = cleanText(raw[key]);
    if (text) definition[key] = text;
  }
  if (typeof raw.modal === 'boolean') definition.modal = raw.modal;
  if (raw.params && typeof raw.params === 'object') {
    const params = {};
    for (const [letter, text] of Object.entries(raw.params)) {
      const l = String(letter).trim().toUpperCase();
      if (/^,?[A-Z]$/.test(l) && cleanText(text)) params[l] = cleanText(text, 300);
    }
    if (Object.keys(params).length) definition.params = params;
  }
  if (Array.isArray(raw.forms)) definition.forms = raw.forms; // repris tel quel (copie d'un code intégré)
  if (Array.isArray(raw.notes)) {
    const notes = raw.notes.map((n) => cleanText(n, 500)).filter(Boolean);
    if (notes.length) definition.notes = notes;
  }
  return definition;
}

/**
 * Profils machines : profils intégrés (données en lecture seule + état enregistré) et profils
 * personnels (entièrement modifiables). Les profils activés, dans l'ordre, forment les couches
 * du dictionnaire de codes (coloration, infobulles, vérificateur…).
 *
 * Profil exposé :
 *   { id, builtin, name, description, machineType, enabled, order,
 *     macroRanges: [{ from, to }], codes: { clé: définition | null }, addresses, variables }
 */
export function createProfileService({ db, dictionary, bus, now = () => Date.now() }) {
  let profiles = [];

  const builtinById = new Map(BUILTIN_PROFILES.map((p) => [p.id, p]));

  function fromRecord(record) {
    const builtin = builtinById.get(record.id);
    if (builtin) {
      return {
        id: builtin.id,
        builtin: true,
        name: builtin.name,
        description: builtin.description,
        machineType: builtin.machineType,
        enabled: record.enabled ?? builtin.defaults.enabled,
        order: record.order ?? builtin.defaults.order,
        macroRanges: normalizeRanges(record.macroRanges ?? builtin.defaults.macroRanges),
        codes: builtin.layer.codes,
        addresses: builtin.layer.addresses ?? {},
        variables: builtin.layer.variables ?? [],
      };
    }
    return {
      id: record.id,
      builtin: false,
      name: record.name,
      description: record.description ?? '',
      machineType: isKnownMachineType(record.machineType) ? record.machineType : DEFAULT_MACHINE_TYPE,
      enabled: record.enabled !== false,
      order: Number.isFinite(record.order) ? record.order : 100,
      macroRanges: normalizeRanges(record.macroRanges),
      codes: record.codes ?? {},
      addresses: record.addresses ?? {},
      variables: [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /** Enregistrement à stocker : état seul pour un profil intégré, tout pour un profil personnel. */
  function toRecord(profile) {
    if (profile.builtin) {
      return { id: profile.id, builtin: true, enabled: profile.enabled, order: profile.order, macroRanges: profile.macroRanges };
    }
    const { builtin: _b, variables: _v, ...record } = profile;
    return record;
  }

  function sorted() {
    profiles.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return profiles;
  }

  function applyLayers() {
    dictionary.setLayers(
      sorted()
        .filter((p) => p.enabled)
        .map((p) => ({ id: p.id, label: p.name, codes: p.codes, addresses: p.addresses, variables: p.variables })),
    );
  }

  async function persist(profile) {
    await db.put(PROFILE_STORE, toRecord(profile));
  }

  function changed() {
    applyLayers();
    bus?.emit('profiles:changed');
  }

  function find(id) {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) throw new Error('Profil introuvable.');
    return profile;
  }

  function requireCustom(id) {
    const profile = find(id);
    if (profile.builtin) throw new Error('Un profil intégré ne se modifie pas : créez un profil personnel.');
    return profile;
  }

  /** Renumérote les ordres de 0 à n-1 (après déplacement, ajout, suppression). */
  async function renumber() {
    const list = sorted();
    for (let i = 0; i < list.length; i++) {
      if (list[i].order !== i) {
        list[i].order = i;
        await persist(list[i]);
      }
    }
  }

  const service = {
    async init() {
      const records = await db.getAll(PROFILE_STORE);
      const byId = new Map(records.map((r) => [r.id, r]));
      profiles = [
        ...BUILTIN_PROFILES.map((b) => fromRecord(byId.get(b.id) ?? { id: b.id })),
        ...records.filter((r) => !builtinById.has(r.id) && r.name).map(fromRecord),
      ];
      applyLayers();
    },

    /** Profils triés dans l'ordre d'empilement (du plus général au plus spécifique). */
    list: () => sorted().map((p) => ({ ...p })),
    get: (id) => ({ ...find(id) }),
    enabledProfiles: () => sorted().filter((p) => p.enabled),

    /**
     * Plages de macros libres en vigueur : celles du profil activé le plus spécifique qui en
     * déclare. { profile, ranges } — ranges vide si aucun profil n'en déclare.
     */
    macroRanges() {
      const profile = [...sorted()].reverse().find((p) => p.enabled && p.macroRanges.length);
      return { profile: profile ? { id: profile.id, name: profile.name } : null, ranges: profile?.macroRanges ?? [] };
    },

    async create({ name = 'Ma machine', description = '', machineType = DEFAULT_MACHINE_TYPE, copyFrom = null } = {}) {
      const source = copyFrom ? find(copyFrom) : null;
      const time = now();
      const profile = {
        id: uid(),
        builtin: false,
        name: uniqueName(name.trim() || 'Ma machine', profiles.map((p) => p.name)),
        description: description.trim(),
        machineType: isKnownMachineType(machineType) ? machineType : DEFAULT_MACHINE_TYPE,
        enabled: true,
        order: Math.max(-1, ...profiles.map((p) => p.order)) + 1,
        macroRanges: source ? [...source.macroRanges] : [],
        // Copie d'un profil personnel : ses codes ; d'un profil intégré : vide (il reste dessous).
        codes: source && !source.builtin ? structuredClone(source.codes) : {},
        addresses: source && !source.builtin ? { ...source.addresses } : {},
        variables: [],
        createdAt: time,
        updatedAt: time,
      };
      profiles.push(profile);
      await persist(profile);
      changed();
      return { ...profile };
    },

    /** Modifie nom, description, type de machine, activation ou plages de macros. */
    async update(id, patch) {
      const profile = find(id);
      if (typeof patch.enabled === 'boolean') profile.enabled = patch.enabled;
      if (patch.macroRanges) profile.macroRanges = normalizeRanges(patch.macroRanges);
      if (!profile.builtin) {
        if (typeof patch.name === 'string' && patch.name.trim()) profile.name = patch.name.trim();
        if (typeof patch.description === 'string') profile.description = patch.description.trim();
        if (isKnownMachineType(patch.machineType)) profile.machineType = patch.machineType;
        profile.updatedAt = now();
      }
      await persist(profile);
      changed();
      return { ...profile };
    },

    /** Déplace un profil dans la pile (delta -1 : plus général, +1 : plus spécifique). */
    async move(id, delta) {
      const list = sorted();
      const index = list.findIndex((p) => p.id === id);
      const target = index + delta;
      if (index === -1 || target < 0 || target >= list.length) return;
      const [profile] = list.splice(index, 1);
      list.splice(target, 0, profile);
      list.forEach((p, i) => (p.order = i - list.length)); // ordres provisoires, puis renumérotation
      await renumber();
      changed();
    },

    /** Ajoute ou remplace un code dans un profil personnel (définition null : code retiré). */
    async setCode(id, key, definition) {
      const profile = requireCustom(id);
      const clean = sanitizeCodeDefinition(definition);
      if (clean === undefined) throw new Error('Définition de code invalide.');
      profile.codes = { ...profile.codes, [key]: clean };
      profile.updatedAt = now();
      await persist(profile);
      changed();
    },

    async removeCode(id, key) {
      const profile = requireCustom(id);
      const { [key]: _removed, ...codes } = profile.codes;
      profile.codes = codes;
      profile.updatedAt = now();
      await persist(profile);
      changed();
    },

    async remove(id) {
      requireCustom(id);
      profiles = profiles.filter((p) => p.id !== id);
      await db.delete(PROFILE_STORE, id);
      await renumber();
      changed();
    },

    /** Profil personnel prêt à être exporté seul (partage entre utilisateurs). */
    exportProfile(id) {
      const { builtin: _b, variables: _v, ...data } = find(id);
      return { format: 'l-iso-cpc/profil', formatVersion: 1, profile: data };
    },

    /** Importe un profil exporté seul ; il devient un nouveau profil personnel. */
    async importProfile(data) {
      const raw = data?.format === 'l-iso-cpc/profil' ? data.profile : null;
      if (!raw || typeof raw.name !== 'string') throw new Error('Ce fichier n’est pas un profil machine L-ISO-CPC.');
      const created = await service.create({ name: raw.name, description: raw.description ?? '', machineType: raw.machineType });
      const profile = find(created.id);
      profile.macroRanges = normalizeRanges(raw.macroRanges);
      profile.codes = sanitizeCodes(raw.codes);
      await persist(profile);
      changed();
      return { ...profile };
    },

    // --- Sauvegarde globale -------------------------------------------------------------------
    exportAll: () => sorted().map(toRecord),

    async importAll(records, { mode = 'merge' } = {}) {
      const summary = { added: 0, updated: 0, invalid: 0 };
      if (!Array.isArray(records)) return summary;
      if (mode === 'replace') {
        for (const p of profiles.filter((p) => !p.builtin)) await db.delete(PROFILE_STORE, p.id);
        profiles = profiles.filter((p) => p.builtin);
      }
      for (const record of records) {
        if (!record || typeof record.id !== 'string') {
          summary.invalid++;
          continue;
        }
        if (builtinById.has(record.id)) {
          const profile = fromRecord(record);
          profiles = profiles.filter((p) => p.id !== record.id);
          profiles.push(profile);
          await persist(profile);
          summary.updated++;
          continue;
        }
        if (typeof record.name !== 'string' || !record.name.trim()) {
          summary.invalid++;
          continue;
        }
        const existing = profiles.find((p) => p.id === record.id);
        if (existing && mode === 'merge' && (record.updatedAt ?? 0) <= (existing.updatedAt ?? 0)) continue;
        const profile = fromRecord({ ...record, codes: sanitizeCodes(record.codes) });
        profiles = profiles.filter((p) => p.id !== record.id);
        profiles.push(profile);
        await persist(profile);
        if (existing) summary.updated++;
        else summary.added++;
      }
      await renumber();
      changed();
      return summary;
    },
  };

  function sanitizeCodes(codes) {
    const result = {};
    for (const [rawKey, definition] of Object.entries(codes && typeof codes === 'object' ? codes : {})) {
      const key = parseCodeKey(rawKey);
      const clean = sanitizeCodeDefinition(definition);
      if (key && clean !== undefined) result[key] = clean;
    }
    return result;
  }

  return service;
}
