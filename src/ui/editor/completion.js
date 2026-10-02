import { autocompletion } from '@codemirror/autocomplete';

/**
 * Configuration unique de l'autocomplétion, partagée par tous les modules qui fournissent des
 * suggestions (macros, codes G/M…) : CodeMirror refuse deux configurations différentes, et une
 * même instance ajoutée deux fois n'est prise en compte qu'une fois.
 */
export const completionExtension = autocompletion({ activateOnTyping: true, icons: false, maxRenderedOptions: 60 });
