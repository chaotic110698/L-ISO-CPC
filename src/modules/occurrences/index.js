import { ViewPlugin, Decoration } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { parseLine, occurrenceKey, describeOccurrence, tokenAt } from '../../engine/index.js';

const occurrenceMark = Decoration.mark({ class: 'cm-iso-occurrence' });
const currentMark = Decoration.mark({ class: 'cm-iso-occurrence cm-iso-occurrence-current' });

/** Jeton situé sous le curseur principal (si la sélection est vide). */
function tokenUnderCursor(state) {
  const { main } = state.selection;
  if (!main.empty) return null;
  const line = state.doc.lineAt(main.head);
  const token = tokenAt(parseLine(line.text).tokens, main.head - line.from);
  return token ? { token, lineFrom: line.from } : null;
}

/** Nombre d'occurrences d'une clé dans tout le document (et nombre d'affectations pour une variable). */
function countOccurrences(doc, key) {
  let count = 0;
  let assignments = 0;
  for (const text of doc.iterLines()) {
    const { tokens, block } = parseLine(text);
    for (const token of tokens) if (occurrenceKey(token) === key) count++;
    if (key.startsWith('var:')) {
      for (const variable of block.variables) if (variable.assigned && `var:${variable.index}` === key) assignments++;
    }
  }
  return { count, assignments };
}

/**
 * Met en évidence toutes les occurrences de l'élément sous le curseur : une variable (#901),
 * un code (G1 = G01) ou une valeur d'adresse (X25. = X25.0, mais ≠ X25 sans point).
 * Le total s'affiche dans la barre d'état.
 */
function occurrencesPlugin(onSummary) {
  const build = (view) => {
    const found = tokenUnderCursor(view.state);
    const key = occurrenceKey(found?.token);
    if (!key) return { decorations: Decoration.none, key: null, label: null };
    const currentFrom = found.lineFrom + found.token.from;
    const builder = new RangeSetBuilder();
    let lastLine = 0;
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to; ) {
        const line = view.state.doc.lineAt(pos);
        pos = line.to + 1;
        if (line.number <= lastLine) continue;
        lastLine = line.number;
        for (const token of parseLine(line.text).tokens) {
          if (occurrenceKey(token) !== key) continue;
          const start = line.from + token.from;
          builder.add(start, line.from + token.to, start === currentFrom ? currentMark : occurrenceMark);
        }
      }
    }
    return { decorations: builder.finish(), key, label: describeOccurrence(found.token) };
  };

  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.apply(build(view), view, true);
      }
      update(update) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.apply(build(update.view), update.view, update.docChanged);
        }
      }
      apply(result, view, docChanged) {
        const keyChanged = result.key !== this.key;
        this.decorations = result.decorations;
        this.key = result.key;
        if (keyChanged || docChanged) {
          onSummary(result.key ? { label: result.label, ...countOccurrences(view.state.doc, result.key) } : null);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

export default {
  id: 'occurrences',
  label: 'Mise en évidence des variables et valeurs',
  description:
    'Place le curseur (ou touche) sur une macro #xxx, un code ou une valeur (X25.) : toutes ses occurrences sont surlignées et comptées dans la barre d’état.',
  group: 'editeur',
  where: 'Texte de l’éditeur et barre d’état',
  activate(ctx) {
    const status = ctx.ui.statusbar.add({ id: 'occurrences', order: 20 });
    const show = (summary) => {
      if (!summary || summary.count < 1) return status.set('');
      const plural = summary.count > 1 ? 's' : '';
      const assigned = summary.assignments ? ` · ${summary.assignments} affectation${summary.assignments > 1 ? 's' : ''}` : '';
      status.set(`${summary.label} : ${summary.count} occurrence${plural}${assigned}`, {
        title: 'Occurrences dans tout le programme',
      });
    };
    ctx.editor.addExtension(occurrencesPlugin(show));
  },
};
