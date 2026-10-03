import { Prec } from '@codemirror/state';
import { Decoration, MatchDecorator, ViewPlugin } from '@codemirror/view';

/**
 * Zéro barré : chaque chiffre 0 du programme reçoit une barre oblique (dessinée en CSS, donc
 * valable quelle que soit la police), pour ne pas le confondre avec la lettre O (O1000 / 01000).
 */
const zero = Decoration.mark({ class: 'cm-zero' });
const decorator = new MatchDecorator({ regexp: /0/g, decoration: () => zero });

const slashedZero = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = decorator.createDeco(view);
    }
    update(update) {
      this.decorations = decorator.updateDeco(update, this.decorations);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

export default {
  id: 'slashedZero',
  label: 'Zéro barré',
  description: 'Barre le chiffre 0 dans l’éditeur, pour ne pas le confondre avec la lettre O (O1000 et 01000, X10. et XIO.).',
  group: 'editeur',
  where: 'Texte de l’éditeur',
  activate(ctx) {
    // Priorité maximale : CodeMirror place alors la marque à l'intérieur des jetons colorés ;
    // la barre prend la couleur du jeton et ne coupe pas le fond des variables (#…).
    ctx.editor.addExtension(Prec.highest(slashedZero));
  },
};
