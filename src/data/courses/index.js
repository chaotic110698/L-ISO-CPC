import programme from './lecon-01-programme.js';
import repere from './lecon-02-repere.js';
import deplacements from './lecon-03-deplacements.js';
import absoluIncremental from './lecon-04-absolu-incremental.js';
import brocheAvance from './lecon-05-broche-avance.js';
import outils from './lecon-06-outils.js';
import modaux from './lecon-07-modaux.js';
import programmeType from './lecon-08-programme-type.js';

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
  { id: 'ebauche-finition', level: 'confirme', number: 9, title: 'Ébauche et finition : G71, G70, G72, G73', summary: 'Cycles de chariotage et de dressage par passes, puis finition du contour.' },
  { id: 'cycles-simples', level: 'confirme', number: 10, title: 'Cycles simples : G90, G94', summary: 'Chariotage et dressage en une passe répétée, cônes.' },
  { id: 'filetage', level: 'confirme', number: 11, title: 'Filetage : G92 et G76', summary: 'Pas, hauteur de filet, passes, et paramètres P, Q, R du G76.' },
  { id: 'percage-gorges', level: 'confirme', number: 12, title: 'Perçage et gorges : G74, G75', summary: 'Débourrage en Z, gorges en X, choix des paramètres.' },
  { id: 'sous-programmes', level: 'confirme', number: 13, title: 'Sous-programmes : M98, M99', summary: 'Appeler, répéter, imbriquer ; décalages en incrémental.' },
  { id: 'macros', level: 'confirme', number: 14, title: 'Macros : variables et conditions', summary: 'Variables #, calculs, IF, GOTO, WHILE, plages libres de la machine.' },
  { id: 'bonnes-pratiques', level: 'confirme', number: 15, title: 'Erreurs courantes et bonnes pratiques', summary: 'Les pièges qui cassent des outils, et les habitudes qui les évitent.' },
];

export const isAvailable = (lesson) => Array.isArray(lesson.sections);
