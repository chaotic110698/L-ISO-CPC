import { ISO_BASE_CODES } from './codes/iso-base.js';
import { FANUC_TURNING_CODES } from './codes/fanuc-turning.js';
import { FANUC_TURNING_BC_CODES } from './codes/fanuc-turning-bc.js';

/**
 * Profils machines intégrés. Leurs définitions de codes sont des données en lecture seule ;
 * seul leur état est modifiable et enregistré (activé, ordre, plages de macros libres).
 * Pour modifier un code d'un profil intégré, on le redéfinit dans un profil personnel placé
 * au-dessus.
 *
 * Futurs profils (Siemens, Heidenhain, fraisage…) : ajouter une entrée ici, avec sa couche
 * de codes dans ./codes/.
 */
export const BUILTIN_PROFILES = [
  {
    id: 'iso-base',
    name: 'ISO générique',
    description: 'Codes les plus répandus, communs à la plupart des commandes (G0–G3, G90/G91, M3/M5/M30…). Sert de base aux autres profils.',
    machineType: null,
    layer: ISO_BASE_CODES,
    defaults: { enabled: true, order: 0, macroRanges: [] },
  },
  {
    id: 'fanuc-turning',
    name: 'FANUC tournage',
    description: 'Commandes FANUC de tour (système de codes A) : cycles G70–G76, G90/G92/G94, G50, G98/G99, variables de macro FANUC.',
    machineType: 'tournage',
    layer: FANUC_TURNING_CODES,
    defaults: { enabled: true, order: 1, macroRanges: [{ from: 500, to: 999 }] },
  },
  {
    id: 'fanuc-turning-bc',
    name: 'FANUC tournage — systèmes B/C',
    description: 'À activer au-dessus de « FANUC tournage » si votre tour est en système de codes B ou C : G90/G91 absolu/incrémental, G92 S limite la broche, G94/G95 unité d’avance, G77/G78/G79 cycles simples.',
    machineType: 'tournage',
    layer: FANUC_TURNING_BC_CODES,
    defaults: { enabled: false, order: 2, macroRanges: [] },
  },
];
