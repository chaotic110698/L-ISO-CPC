import { keymap } from '@codemirror/view';
import { foldService, foldGutter, codeFolding, foldKeymap, foldAll, unfoldAll } from '@codemirror/language';
import { foldRanges } from '../../engine/index.js';

const LABELS = { program: 'sous-programme', loop: 'boucle', tool: 'opération' };

/** Zones repliables, mises en cache par document (les documents CodeMirror sont immuables). */
const cache = new WeakMap();
function rangesFor(state) {
  let byLine = cache.get(state.doc);
  if (!byLine) {
    byLine = new Map();
    for (const range of foldRanges(state.doc.iterLines())) if (!byLine.has(range.fromLine)) byLine.set(range.fromLine, range);
    cache.set(state.doc, byLine);
  }
  return byLine;
}

/**
 * Repliage des sous-programmes (O… → M99), des boucles (WHILE … DO → END) et des opérations
 * (d'un changement d'outil au suivant), par la marge, Ctrl+Maj+[ / ] ou le menu Outils.
 */
export default {
  id: 'folding',
  label: 'Repliage des sous-programmes et des boucles',
  description: 'Replie un sous-programme (O… → M99), une boucle WHILE … END ou une opération (d’un outil T au suivant) pour mieux s’y retrouver.',
  group: 'editeur',
  activate(ctx) {
    ctx.editor.addExtension([
      codeFolding({
        placeholderText: '…',
        preparePlaceholder: (state, range) => {
          const from = state.doc.lineAt(range.from).number;
          const to = state.doc.lineAt(range.to).number;
          const kind = rangesFor(state).get(from)?.kind;
          return `${to - from} ligne${to - from > 1 ? 's' : ''}${kind ? ` · ${LABELS[kind]}` : ''}`;
        },
        placeholderDOM: (view, onclick, prepared) => {
          const span = document.createElement('span');
          span.className = 'cm-foldPlaceholder';
          span.textContent = `… ${prepared}`;
          span.title = 'Déplier';
          span.onclick = onclick;
          return span;
        },
      }),
      foldService.of((state, lineStart) => {
        const line = state.doc.lineAt(lineStart);
        const range = rangesFor(state).get(line.number);
        if (!range) return null;
        return { from: line.to, to: state.doc.line(range.toLine).to };
      }),
      foldGutter({ openText: '▾', closedText: '▸' }),
      keymap.of(foldKeymap),
    ]);
    ctx.ui.toolbar.add({ id: 'fold-all', icon: 'fold', label: 'Tout replier', order: 80, menu: true, onClick: () => foldAll(ctx.editor.view) });
    ctx.ui.toolbar.add({ id: 'unfold-all', icon: 'unfold', label: 'Tout déplier', order: 81, menu: true, onClick: () => unfoldAll(ctx.editor.view) });
  },
};
