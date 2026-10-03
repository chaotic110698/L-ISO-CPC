import { EditorState, Compartment, StateEffect } from '@codemirror/state';
import {
  EditorView,
  keymap,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
} from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { editorTheme } from './editor-theme.js';

/** Textes de l'interface de CodeMirror (recherche, repliage, diagnostics…) en français. */
const FRENCH_PHRASES = EditorState.phrases.of({
  Find: 'Rechercher',
  Replace: 'Remplacer par',
  next: 'suivant',
  previous: 'précédent',
  all: 'tout',
  'match case': 'respecter la casse',
  regexp: 'expression régulière',
  'by word': 'mot entier',
  replace: 'remplacer',
  'replace all': 'tout remplacer',
  close: 'fermer',
  'current match': 'résultat courant',
  'on line': 'ligne',
  'replaced $ matches': '$ remplacements effectués',
  'replaced match on line $': 'remplacement effectué ligne $',
  'Go to line': 'Aller à la ligne',
  go: 'aller',
  'folded code': 'code replié',
  unfold: 'déplier',
  to: 'à',
  'Folded lines': 'Lignes repliées',
  'Unfolded lines': 'Lignes dépliées',
  'Fold line': 'Replier',
  'Unfold line': 'Déplier',
  Completions: 'Suggestions',
  Diagnostics: 'Diagnostics',
  'No diagnostics': 'Aucun diagnostic',
});

/**
 * Enveloppe de CodeMirror 6. Le reste de l'application ne manipule l'éditeur qu'à travers
 * cette classe : on pourrait changer de composant d'édition sans toucher aux modules.
 *
 * Le socle ne contient que l'essentiel (saisie, sélection, thème). Tout le reste
 * (numéros de ligne, historique, coloration…) est ajouté par les modules via `addExtension`,
 * chacun dans son propre « compartiment » CodeMirror, retirable à chaud.
 */
export class EditorHost {
  #view;
  #extensions = new Map();
  /** Effets en attente pendant batch() : appliqués en une seule transaction. */
  #pending = null;
  #updateListeners = new Set();
  #replaceListeners = new Set();
  #dark = new Compartment();
  #wrapping = new Compartment();
  #options;

  constructor(parent, { doc = '', dark = false, lineWrapping = true } = {}) {
    this.#options = { dark, lineWrapping };
    this.#view = new EditorView({ parent, state: this.#createState(doc) });
  }

  #createState(doc) {
    return EditorState.create({
      doc,
      extensions: [
        highlightSpecialChars(),
        drawSelection(),
        dropCursor(),
        highlightActiveLine(),
        keymap.of(defaultKeymap),
        editorTheme,
        FRENCH_PHRASES,
        this.#dark.of(EditorView.darkTheme.of(this.#options.dark)),
        this.#wrapping.of(this.#options.lineWrapping ? EditorView.lineWrapping : []),
        EditorView.contentAttributes.of({
          spellcheck: 'false',
          autocorrect: 'off',
          autocapitalize: 'characters',
          'aria-label': 'Programme ISO',
        }),
        EditorView.updateListener.of((update) => {
          for (const listener of [...this.#updateListeners]) listener(update);
        }),
        ...[...this.#extensions].map(([compartment, extension]) => compartment.of(extension)),
      ],
    });
  }

  get view() {
    return this.#view;
  }

  get state() {
    return this.#view.state;
  }

  /**
   * Ajoute une extension CodeMirror. Renvoie une fonction qui la retire.
   * L'extension est conservée lors du chargement d'un autre programme.
   */
  addExtension(extension) {
    const compartment = new Compartment();
    this.#extensions.set(compartment, extension);
    this.#reconfigure(StateEffect.appendConfig.of(compartment.of(extension)));
    return () => {
      if (!this.#extensions.delete(compartment)) return;
      this.#reconfigure(compartment.reconfigure([]));
    };
  }

  /**
   * Regroupe les ajouts et retraits d'extensions faits pendant fn() en une seule
   * reconfiguration de l'éditeur (au démarrage, une vingtaine de modules s'activent :
   * sans regroupement, l'éditeur se reconfigurerait et se redessinerait à chaque fois).
   */
  batch(fn) {
    if (this.#pending) return fn();
    this.#pending = [];
    try {
      return fn();
    } finally {
      const effects = this.#pending;
      this.#pending = null;
      if (effects.length) this.#view.dispatch({ effects });
    }
  }

  #reconfigure(effect) {
    if (this.#pending) this.#pending.push(effect);
    else this.#view.dispatch({ effects: effect });
  }

  /** Abonnement à chaque mise à jour CodeMirror (ViewUpdate). */
  onUpdate(listener) {
    this.#updateListeners.add(listener);
    return () => this.#updateListeners.delete(listener);
  }

  /** Abonnement au remplacement complet du document (ouverture d'un autre programme). */
  onDocReplaced(listener) {
    this.#replaceListeners.add(listener);
    return () => this.#replaceListeners.delete(listener);
  }

  getText() {
    return this.#view.state.doc.toString();
  }

  /** Remplace tout le document (nouvel historique d'annulation, curseur au début). */
  setText(text) {
    // Le nouvel état reprend toutes les extensions actuelles : les ajouts en attente sont inclus.
    if (this.#pending) this.#pending.length = 0;
    this.#view.setState(this.#createState(text));
    for (const listener of [...this.#replaceListeners]) listener();
  }

  /** Exécute une commande CodeMirror ((view) => boolean). */
  run(command) {
    return command(this.#view);
  }

  focus() {
    this.#view.focus();
  }

  /** Position du curseur principal, numérotée à partir de 1. */
  get cursor() {
    const { state } = this.#view;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    return { line: line.number, column: head - line.from + 1, lines: state.doc.lines };
  }

  setDark(dark) {
    this.#options.dark = dark;
    this.#view.dispatch({ effects: this.#dark.reconfigure(EditorView.darkTheme.of(dark)) });
  }

  setLineWrapping(enabled) {
    this.#options.lineWrapping = enabled;
    this.#view.dispatch({ effects: this.#wrapping.reconfigure(enabled ? EditorView.lineWrapping : []) });
  }

  /** À appeler quand la taille du texte ou la visibilité du conteneur change. */
  remeasure() {
    this.#view.requestMeasure();
  }

  /**
   * Version de l'API rattachée à une portée de module : tout ce qui est ajouté
   * est retiré automatiquement à la désactivation du module.
   */
  scoped(scope) {
    const host = this;
    return {
      addExtension: (extension) => scope.add(host.addExtension(extension)),
      onUpdate: (listener) => scope.add(host.onUpdate(listener)),
      onDocReplaced: (listener) => scope.add(host.onDocReplaced(listener)),
      run: (command) => host.run(command),
      getText: () => host.getText(),
      focus: () => host.focus(),
      remeasure: () => host.remeasure(),
      get view() {
        return host.view;
      },
      get state() {
        return host.state;
      },
      get cursor() {
        return host.cursor;
      },
    };
  }

  destroy() {
    this.#view.destroy();
  }
}
