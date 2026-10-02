import programme from './lecon-01-programme.js';
import repere from './lecon-02-repere.js';
import deplacements from './lecon-03-deplacements.js';
import absoluIncremental from './lecon-04-absolu-incremental.js';
import brocheAvance from './lecon-05-broche-avance.js';
import outils from './lecon-06-outils.js';
import modaux from './lecon-07-modaux.js';
import programmeType from './lecon-08-programme-type.js';
import ebaucheFinition from './lecon-09-ebauche-finition.js';
import cyclesSimples from './lecon-10-cycles-simples.js';
import filetage from './lecon-11-filetage.js';
import percageGorges from './lecon-12-percage-gorges.js';
import sousProgrammes from './lecon-13-sous-programmes.js';
import macros from './lecon-14-macros.js';
import bonnesPratiques from './lecon-15-bonnes-pratiques.js';

/**
 * Catalogue des cours d'ISO. Une leçon rédigée est un fichier de ce dossier (format :
 * README.md) ; une entrée sans `sections` est annoncée « en préparation ».
 */
export const LEVELS = [
  { id: 'debutant', title: 'Débutant', description: 'Les bases pour lire et écrire un programme de tournage complet.' },
  { id: 'confirme', title: 'Confirmé', description: 'Cycles, filetage, sous-programmes et macros.' },
];

export const LESSONS = [
  programme,
  repere,
  deplacements,
  absoluIncremental,
  brocheAvance,
  outils,
  modaux,
  programmeType,
  ebaucheFinition,
  cyclesSimples,
  filetage,
  percageGorges,
  sousProgrammes,
  macros,
  bonnesPratiques,
];

export const isAvailable = (lesson) => Array.isArray(lesson.sections);
