// Liste des fonctionnalités chargées au démarrage, dans l'ordre d'affichage des boutons.
// Ajouter un module : créer son dossier dans src/modules/ puis l'importer ici (voir README).
import lineNumbers from './line-numbers/index.js';
import highlighting from './highlighting/index.js';
import occurrences from './occurrences/index.js';
import definitions from './definitions/index.js';
import history from './history/index.js';
import autosave from './autosave/index.js';
import exportFile from './export-file/index.js';
import calculators from './calculators/index.js';

export const MODULES = [lineNumbers, highlighting, occurrences, definitions, history, autosave, exportFile, calculators];
