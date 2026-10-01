// Aides DOM : création d'éléments, fichiers (ouverture / téléchargement).

const PROPERTY_KEYS = new Set(['value', 'checked', 'selected', 'indeterminate']);

/**
 * Crée un élément : h('button', { class: 'btn', onclick: fn }, 'Texte', autreNoeud).
 * - `on<event>` : écouteur d'événement ; `dataset` / `style` : objets ;
 * - `value`, `checked`… : affectés comme propriétés après l'ajout des enfants ;
 * - `null`, `undefined` ou `false` : attribut ignoré ; `true` : attribut booléen.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  const deferred = [];
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (PROPERTY_KEYS.has(key)) deferred.push([key, value]);
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  for (const [key, value] of deferred) el[key] = value;
  return el;
}

export function append(parent, children) {
  for (const child of [children].flat(Infinity)) {
    if (child == null || child === false) continue;
    parent.append(child instanceof Node ? child : String(child));
  }
  return parent;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

let idCounter = 0;
/** Identifiant DOM unique (pour relier label / champ, aria-labelledby…). */
export function domId(prefix = 'id') {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** Télécharge un texte sous forme de fichier (fonctionne aussi en file://). */
export function downloadText(fileName, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: fileName, style: { display: 'none' } });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Ouvre le sélecteur de fichiers. Résout avec le fichier choisi, ou null si annulé. */
export function pickFile({ accept } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

/**
 * Lit un fichier texte. Essaie l'UTF-8 strict puis se replie sur Windows-1252,
 * encodage fréquent des programmes ISO produits par les logiciels de DNC.
 */
export async function readTextFile(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}
