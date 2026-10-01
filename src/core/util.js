// Petits utilitaires sans dépendance au DOM (utilisables dans les tests Node).

/** Identifiant unique court, sans dépendre de crypto.randomUUID (absent hors contexte sécurisé). */
export function uid() {
  const bytes = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  const random = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return Date.now().toString(36) + '-' + random;
}

/**
 * Retarde l'appel de `fn` jusqu'à `wait` ms après le dernier appel.
 * `flush()` exécute immédiatement l'appel en attente, `cancel()` l'abandonne.
 */
export function debounce(fn, wait) {
  let timer = null;
  let pendingArgs = null;
  const debounced = (...args) => {
    pendingArgs = args;
    clearTimeout(timer);
    timer = setTimeout(debounced.flush, wait);
  };
  debounced.flush = () => {
    clearTimeout(timer);
    timer = null;
    if (!pendingArgs) return undefined;
    const args = pendingArgs;
    pendingArgs = null;
    return fn(...args);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };
  debounced.pending = () => pendingArgs !== null;
  return debounced;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Nom unique parmi `existing` : « Nom », « Nom 2 », « Nom 3 »… */
export function uniqueName(base, existing) {
  const taken = new Set(existing.map((name) => name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Nom de fichier sûr, sans extension, limité à l'ASCII : les commandes numériques et logiciels
 * de DNC gèrent mal les accents, et certains navigateurs refusent les caractères typographiques.
 */
export function safeFileName(name, fallback = 'programme') {
  const cleaned = String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\x20-\x7e]+/g, '_')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');
  return cleaned || fallback;
}

/** « il y a 5 min », « hier à 14:02 », « 12/09/2026 »… */
export function formatRelativeTime(timestamp, now = Date.now()) {
  const diff = Math.round((now - timestamp) / 1000);
  if (diff < 45) return 'à l’instant';
  if (diff < 3600) return `il y a ${Math.max(1, Math.round(diff / 60))} min`;
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date(now);
  const yesterday = new Date(now - 86400000);
  if (date.toDateString() === today.toDateString()) return `aujourd’hui à ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `hier à ${time}`;
  return date.toLocaleDateString('fr-FR');
}

export function countLines(text) {
  if (!text) return 0;
  let lines = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  return lines;
}

/** Normalise les fins de ligne (CRLF / CR → LF). */
export function normalizeNewlines(text) {
  return String(text).replace(/\r\n?/g, '\n');
}

/** Date locale au format AAAA-MM-JJ (pour les noms de fichiers). */
export function isoDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
