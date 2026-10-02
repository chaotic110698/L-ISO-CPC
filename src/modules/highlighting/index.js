import { ViewPlugin, Decoration } from '@codemirror/view';
import { RangeSetBuilder, StateEffect } from '@codemirror/state';
import { parseLine, tokenCategory } from '../../engine/index.js';
import { CATEGORIES } from '../../data/categories.js';
import { h } from '../../core/dom.js';

/** Force le recalcul des couleurs (dictionnaire de codes modifié, par ex. changement de profil). */
const refresh = StateEffect.define();

const marks = new Map();
const markFor = (className) => {
  if (!marks.has(className)) marks.set(className, Decoration.mark({ class: className }));
  return marks.get(className);
};

/**
 * Colore les lignes visibles à partir des jetons du moteur : une couleur par catégorie
 * (voir src/data/categories.js). Pour les adresses (X25.), la lettre et la valeur sont
 * marquées séparément pour bien faire ressortir les valeurs.
 */
function highlighter(dictionary) {
  const build = (view) => {
    const builder = new RangeSetBuilder();
    let lastLine = 0;
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to; ) {
        const line = view.state.doc.lineAt(pos);
        pos = line.to + 1;
        if (line.number <= lastLine) continue;
        lastLine = line.number;
        for (const token of parseLine(line.text).tokens) {
          const category = tokenCategory(token, dictionary);
          if (!category) continue;
          const start = line.from + token.from;
          const end = line.from + token.to;
          if (category === 'address' && token.valueKind === 'number') {
            const letterEnd = start + token.letter.length;
            builder.add(start, letterEnd, markFor('tok-address'));
            builder.add(letterEnd, end, markFor('tok-value'));
          } else {
            builder.add(start, end, markFor(`tok-${category}`));
          }
        }
      }
    }
    return builder.finish();
  };

  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = build(view);
      }
      update(update) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.transactions.some((tr) => tr.effects.some((effect) => effect.is(refresh)))
        ) {
          this.decorations = build(update.view);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

export default {
  id: 'highlighting',
  label: 'Coloration syntaxique',
  description:
    'Une couleur par catégorie de code : interpolations (G0–G3), cycles, modes, outils et corrections, fonctions M, structure, macros, adresses, commentaires.',
  group: 'editeur',
  /** Légende affichée sous l'interrupteur, dans Paramètres. */
  renderInfo() {
    return h(
      'ul',
      { class: 'color-legend', 'aria-label': 'Légende des couleurs' },
      CATEGORIES.map((category) =>
        h('li', null, h('code', { class: `tok-${category.id}` }, category.example), h('span', null, category.label)),
      ),
    );
  },
  activate(ctx) {
    ctx.editor.addExtension(highlighter(ctx.codes));
    ctx.onDispose(ctx.codes.onChange(() => ctx.editor.view.dispatch({ effects: refresh.of(null) })));
  },
};
