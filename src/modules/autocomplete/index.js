import { EditorState } from '@codemirror/state';
import { parseLine, tokenAt } from '../../engine/index.js';
import { completionExtension } from '../../ui/editor/completion.js';

/** G1 → « G01 » si le format à deux chiffres est choisi (codes décimaux inchangés). */
function formatKey(key, padded) {
  if (!padded || key.includes('.')) return key;
  const number = key.slice(1);
  return number.length === 1 ? `${key[0]}0${number}` : key;
}

/**
 * Suggestions des codes G et M du profil actif, avec leur définition, à la saisie de G ou M
 * (ou Ctrl+Espace). Les codes personnalisés des profils machines sont inclus.
 */
function codeSource(dictionary, settings) {
  return (context) => {
    const word = context.matchBefore(/[GMgm]\d*\.?\d*/);
    if (!word) return null;
    const before = context.state.sliceDoc(Math.max(0, word.from - 1), word.from);
    if (/[A-Za-z0-9#.\[]/.test(before)) return null; // pas un début de mot (IF, #1G…)
    const line = context.state.doc.lineAt(context.pos);
    const token = tokenAt(parseLine(line.text).tokens, word.from - line.from + 1);
    if (token?.type === 'comment') return null;

    const letter = word.text[0].toUpperCase();
    const typed = word.text.slice(1);
    const typedPlain = typed.replace(/^0+(?=\d)/, '');
    const padded = settings.get('autocomplete.format') === 'padded';
    const options = dictionary
      .entries()
      .filter((entry) => entry.key[0] === letter)
      .filter((entry) => {
        if (!typed) return true;
        const number = entry.key.slice(1);
        return number.startsWith(typedPlain) || formatKey(entry.key, true).slice(1).startsWith(typed);
      })
      .sort((a, b) => Number(a.key.slice(1)) - Number(b.key.slice(1)))
      .map((entry) => ({
        label: formatKey(entry.key, padded),
        detail: entry.name,
        info: entry.description ? `${entry.description}${entry.syntax ? `\n\nSyntaxe : ${entry.syntax}` : ''}` : undefined,
        type: entry.category,
      }));
    if (!options.length) return null;
    return { from: word.from, options, filter: false };
  };
}

export default {
  id: 'autocomplete',
  label: 'Autocomplétion des codes G et M',
  description: 'En tapant G ou M, propose les codes du profil machine actif avec leur définition (Ctrl+Espace pour l’ouvrir à tout moment).',
  group: 'editeur',
  settings: [
    {
      key: 'autocomplete.format',
      type: 'choice',
      label: 'Format des codes insérés',
      options: [
        { value: 'padded', label: 'G01, M03' },
        { value: 'plain', label: 'G1, M3' },
      ],
      default: 'padded',
    },
  ],
  activate(ctx) {
    const source = codeSource(ctx.codes, ctx.settings);
    ctx.editor.addExtension([completionExtension, EditorState.languageData.of(() => [{ autocomplete: source }])]);
  },
};
