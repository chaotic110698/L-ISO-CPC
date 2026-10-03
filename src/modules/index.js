// Liste des fonctionnalités chargées au démarrage, dans l'ordre d'affichage des boutons.
// Ajouter un module : créer son dossier dans src/modules/ puis l'importer ici (voir README).
import lineNumbers from './line-numbers/index.js';
import highlighting from './highlighting/index.js';
import slashedZero from './slashed-zero/index.js';
import occurrences from './occurrences/index.js';
import definitions from './definitions/index.js';
import macroSuggest from './macro-suggest/index.js';
import outline from './outline/index.js';
import variables from './variables/index.js';
import macroWarnings from './macro-warnings/index.js';
import autocomplete from './autocomplete/index.js';
import isoKeys from './iso-keys/index.js';
import checker from './checker/index.js';
import modalState from './modal-state/index.js';
import renumberModule from './renumber/index.js';
import search from './search/index.js';
import coordinateShift from './coordinate-shift/index.js';
import folding from './folding/index.js';
import versions from './versions/index.js';
import cycles from './cycles/index.js';
import library from './library/index.js';
import history from './history/index.js';
import autosave from './autosave/index.js';
import exportFile from './export-file/index.js';
import calculators from './calculators/index.js';
import courses from './courses/index.js';

export const MODULES = [lineNumbers, highlighting, slashedZero, occurrences, definitions, autocomplete, isoKeys, macroSuggest, checker, modalState, outline, variables, macroWarnings, folding, search, cycles, library, renumberModule, coordinateShift, versions, history, autosave, exportFile, calculators, courses];
