// Liste des fonctionnalités chargées au démarrage, dans l'ordre d'affichage des boutons.
// Ajouter un module : créer son dossier dans src/modules/ puis l'importer ici (voir README).
import lineNumbers from './line-numbers/index.js';
import highlighting from './highlighting/index.js';
import occurrences from './occurrences/index.js';
import definitions from './definitions/index.js';
import macroSuggest from './macro-suggest/index.js';
import variables from './variables/index.js';
import macroWarnings from './macro-warnings/index.js';
import autocomplete from './autocomplete/index.js';
import checker from './checker/index.js';
import modalState from './modal-state/index.js';
import renumberModule from './renumber/index.js';
import history from './history/index.js';
import autosave from './autosave/index.js';
import exportFile from './export-file/index.js';
import calculators from './calculators/index.js';

export const MODULES = [lineNumbers, highlighting, occurrences, definitions, autocomplete, macroSuggest, checker, modalState, variables, macroWarnings, renumberModule, history, autosave, exportFile, calculators];
