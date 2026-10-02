import { EditorState } from '@codemirror/state';
import { completionExtension } from '../../ui/editor/completion.js';
import { analyzeMacros } from '../../engine/macros.js';
import { formatRanges } from '../../engine/macro-ranges.js';

/**
 * Suggestions à la saisie de « # » : la prochaine macro libre de la plage du profil en premier,
 * puis les variables nommées et celles déjà utilisées dans le programme.
 */
function macroSource(macros) {
  return (context) => {
    const word = context.matchBefore(/#\d*/);
    if (!word) return null;
    const analysis = analyzeMacros(context.state.doc.iterLines());
    const { profile, ranges } = macros.ranges();
    const options = [];
    const seen = new Set();
    const next = macros.nextFree(analysis.used);
    if (next != null) {
      options.push({
        label: `#${next}`,
        detail: 'prochaine macro libre',
        info: `Première variable libre des plages ${formatRanges(ranges)}${profile ? ` (profil « ${profile.name} »)` : ''}, utilisée nulle part ailleurs.`,
        type: 'variable',
        boost: 99,
      });
      seen.add(next);
    }
    for (const named of macros.names()) {
      if (seen.has(named.index)) continue;
      seen.add(named.index);
      options.push({ label: `#${named.index}`, detail: named.name || 'variable nommée', info: named.description || undefined, type: 'variable', boost: 50 });
    }
    for (const variable of analysis.variables) {
      if (seen.has(variable.index)) continue;
      seen.add(variable.index);
      options.push({ label: variable.name, detail: `utilisée ${variable.uses.length} fois ici`, type: 'variable' });
    }
    return { from: word.from, options, validFor: /^#\d*$/ };
  };
}

export default {
  id: 'macroSuggest',
  label: 'Proposition de la prochaine macro libre',
  description:
    'En tapant « # », propose la prochaine variable libre de la plage du profil machine, puis vos variables nommées et celles du programme.',
  group: 'editeur',
  where: 'Liste de suggestions en tapant #',
  activate(ctx) {
    // Source créée une seule fois : CodeMirror identifie les sources par leur identité.
    const source = macroSource(ctx.macros);
    ctx.editor.addExtension([
      completionExtension,
      EditorState.languageData.of(() => [{ autocomplete: source }]),
    ]);
  },
};
