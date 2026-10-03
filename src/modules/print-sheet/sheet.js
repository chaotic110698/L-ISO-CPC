import { analyzeMacros } from '../../engine/macros.js';
import { programOutline } from '../../engine/index.js';

/**
 * Contenu de la fiche à imprimer (fonction pure) : numéros de programme, outils avec leur
 * opération, variables (nom personnel, description, affectations), sections, lignes.
 *
 * nameOf(index) → { name, description } | null : noms personnels des variables.
 */
export function buildSheet(lineTexts, dictionary, nameOf = () => null) {
  const lines = [...lineTexts];
  while (lines.length > 1 && !lines.at(-1).trim()) lines.pop(); // lignes vides finales
  const outline = programOutline(lines, dictionary);
  const programs = outline.filter((i) => i.kind === 'program').map((i) => ({ number: i.label, comment: i.detail, line: i.line }));

  const tools = [];
  let section = null;
  for (const item of outline) {
    if (item.kind === 'program') section = null;
    if (item.kind === 'section') section = item.label;
    if (item.kind === 'tool') tools.push({ word: item.label, line: item.line, operation: section ?? '', comment: item.detail });
  }

  const variables = analyzeMacros(lines).variables.map((v) => {
    const named = nameOf(v.index);
    return {
      name: v.name,
      label: named?.name ?? '',
      description: named?.description ?? '',
      assignments: v.assignments.map((a) => `l.${a.line}${a.expression ? ` = ${a.expression}` : ''}`),
      uses: v.uses.length,
    };
  });

  const sections = outline.filter((i) => i.kind === 'section').map((i) => ({ label: i.label, line: i.line }));
  return { programs, tools, variables, sections, lines };
}
