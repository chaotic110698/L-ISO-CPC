import { foldText } from './util.js';

/**
 * Classement des entrées de la palette de commandes. Fonction pure.
 * entrée : { label, detail?, keywords?, suggested? } — tous les mots de la recherche doivent
 * apparaître (sans accents ni majuscules) dans le libellé, le détail ou les mots-clés.
 * Ordre : libellé identique, puis commençant par la recherche, puis un mot du libellé qui
 * commence par elle, puis libellé qui la contient, puis le reste ; à égalité, ordre d'origine.
 * Recherche vide : les entrées `suggested` seulement.
 */
export function rankEntries(entries, query, limit = 40) {
  const q = foldText(query).trim();
  if (!q) return entries.filter((e) => e.suggested).slice(0, limit);
  const words = q.split(/\s+/);
  const scored = [];
  entries.forEach((entry, index) => {
    const label = foldText(entry.label);
    const hay = `${label} ${foldText(entry.detail)} ${foldText(entry.keywords)}`;
    if (!words.every((word) => hay.includes(word))) return;
    let score = 4;
    if (label === q) score = 0;
    else if (label.startsWith(q)) score = 1;
    else if (label.split(/[\s\-—–'’(«]+/).some((part) => part.startsWith(words[0]))) score = 2;
    else if (label.includes(q)) score = 3;
    scored.push({ entry, score, index });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((s) => s.entry);
}
