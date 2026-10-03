import { formatIso as mm, formatInteger as int } from '../../engine/format.js';

/**
 * Modèles d'insertion pour le tournage FANUC (début, outil, dégagement, fin de programme).
 * Même format que les formulaires de cycles (voir src/ui/generator-form.js) ; generate reçoit
 * en plus { system: 'a' | 'bc' } : système de codes de la commande, déduit des profils activés.
 *
 *   système A   : G50 limite la broche, U/W cotes incrémentales, G98/G99 unité d'avance ;
 *   système B/C : G92 limite la broche, G90/G91 absolu/incrémental, G94/G95 unité d'avance.
 */

/** Texte de commentaire : majuscules, sans parenthèses (qui fermeraient le commentaire). */
const comment = (text) => text.toUpperCase().replace(/[()]/g, '').trim();
const pad2 = (n) => String(int(n)).padStart(2, '0');

/** Retour au point de référence en X et Z, selon le système. */
const reference = (system) => (system === 'bc' ? ['G91 G28 X0 Z0', 'G90'] : ['G28 U0. W0.']);
const systemNote = (system) =>
  system === 'bc'
    ? 'Écrit pour le système B/C (profil « FANUC tournage — systèmes B/C » activé).'
    : 'Écrit pour le système A, le plus courant sur les tours FANUC. Système B/C : activez le profil « FANUC tournage — systèmes B/C ».';

export const TURNING_TEMPLATES = [
  {
    id: 'header',
    title: 'En-tête de programme',
    codes: ['%', 'O'],
    description: 'Début de fichier, numéro de programme et commentaires d’identification (pièce, brut, matière).',
    fields: [
      { key: 'number', label: 'Numéro de programme', type: 'integer', default: 1000, min: 1 },
      { key: 'name', label: 'Désignation de la pièce', type: 'text', default: 'ARBRE' },
      { key: 'stock', label: 'Brut', type: 'text', default: 'D50 X 80' },
      { key: 'material', label: 'Matière', type: 'text', default: 'ACIER' },
    ],
    generate(v) {
      const lines = ['%', `O${String(int(v.number)).padStart(4, '0')}${v.name ? ` (${comment(v.name)})` : ''}`];
      if (v.stock) lines.push(`(BRUT ${comment(v.stock)})`);
      if (v.material) lines.push(`(MATIERE ${comment(v.material)})`);
      const notes = [];
      if (v.number > 9999) notes.push('Beaucoup de commandes limitent le numéro de programme à 4 chiffres (O0001 à O9999).');
      if (v.number >= 8000) notes.push('Les programmes O8000 à O9999 sont souvent protégés (réservés au constructeur ou aux macros).');
      return { lines, notes };
    },
  },
  {
    id: 'safety',
    title: 'Bloc de sécurité',
    codes: ['G21', 'G40', 'G97'],
    description: 'Remet la commande dans un état connu en début de programme : unités, compensation annulée, vitesse en tr/min, unité d’avance, retour au point de référence.',
    fields: [
      { key: 'feed', label: 'Unité d’avance', type: 'choice', options: [{ value: 'rev', label: 'mm/tr (tournage)' }, { value: 'min', label: 'mm/min' }], default: 'rev' },
      { key: 'home', label: 'Retour au point de référence (G28)', type: 'boolean', default: true },
    ],
    generate(v, { system = 'a' } = {}) {
      const feed = system === 'bc' ? (v.feed === 'rev' ? 'G95' : 'G94') : v.feed === 'rev' ? 'G99' : 'G98';
      const lines = [system === 'bc' ? `G21 G40 G90 G97 ${feed}` : `G21 G40 G97 ${feed}`];
      if (v.home) lines.push(...reference(system));
      return { lines, notes: [systemNote(system), 'G28 : vérifiez que le trajet vers le point de référence est dégagé.'] };
    },
  },
  {
    id: 'tool',
    title: 'Séquence d’outil',
    codes: ['T', 'G96', 'M3'],
    description: 'Début d’opération complet : commentaire, appel d’outil et correcteur, limitation de vitesse, broche, approche rapide et arrosage.',
    fields: [
      { key: 'label', label: 'Opération (commentaire)', type: 'text', default: 'FINITION' },
      { key: 'tool', label: 'Numéro d’outil', type: 'integer', default: 2, min: 1 },
      { key: 'offset', label: 'Numéro de correcteur', type: 'integer', default: 2, min: 0, hint: 'En général le même que l’outil.' },
      { key: 'mode', label: 'Vitesse', type: 'choice', options: [{ value: 'css', label: 'Vitesse de coupe constante (G96, m/min)' }, { value: 'rpm', label: 'Vitesse fixe (G97, tr/min)' }], default: 'css' },
      { key: 'speed', label: 'Vitesse S', unit: 'm/min ou tr/min', default: 220, min: 1 },
      { key: 'limit', label: 'Vitesse maximale (avec G96)', unit: 'tr/min', type: 'integer', default: 3000, min: 1 },
      { key: 'direction', label: 'Sens de rotation', type: 'choice', options: [{ value: 'M3', label: 'M03 (horaire)' }, { value: 'M4', label: 'M04 (anti-horaire)' }], default: 'M3' },
      { key: 'x', label: 'Point d’approche X', unit: 'mm Ø', default: 52 },
      { key: 'z', label: 'Point d’approche Z', unit: 'mm', default: 2 },
      { key: 'coolant', label: 'Arrosage (M08)', type: 'boolean', default: true },
    ],
    generate(v, { system = 'a' } = {}) {
      const lines = [];
      if (v.label) lines.push(`(--- ${comment(v.label)} ---)`);
      lines.push(`T${pad2(v.tool)}${pad2(v.offset)}`);
      const css = v.mode === 'css';
      if (css) lines.push(`${system === 'bc' ? 'G92' : 'G50'} S${int(v.limit)}`);
      lines.push(`${css ? 'G96' : 'G97'} S${int(v.speed)} ${v.direction === 'M4' ? 'M04' : 'M03'}`);
      lines.push(`G00 X${mm(v.x)} Z${mm(v.z)}${v.coolant ? ' M08' : ''}`);
      const notes = [systemNote(system)];
      if (css) notes.push(`La limitation (${system === 'bc' ? 'G92' : 'G50'} S…) vient avant G96 : près de l’axe, la vitesse de rotation monterait sans limite.`);
      if (v.offset === 0) notes.push('Correcteur 00 : aucune correction d’outil appliquée.');
      return { lines, notes };
    },
  },
  {
    id: 'clear',
    title: 'Dégagement de fin d’opération',
    codes: ['G0', 'M9'],
    description: 'Fin d’opération : annulation de la compensation de rayon, retour en rapide à un point de changement d’outil, arrosage coupé.',
    fields: [
      { key: 'x', label: 'Point de dégagement X', unit: 'mm Ø', default: 100 },
      { key: 'z', label: 'Point de dégagement Z', unit: 'mm', default: 100 },
      { key: 'coolant', label: 'Couper l’arrosage (M09)', type: 'boolean', default: true },
      { key: 'spindle', label: 'Arrêter la broche (M05)', type: 'boolean', default: false },
    ],
    generate(v) {
      const lines = [`G00 G40 X${mm(v.x)} Z${mm(v.z)}${v.coolant ? ' M09' : ''}`];
      if (v.spindle) lines.push('M05');
      return { lines, notes: ['Choisissez un point assez loin pour que la tourelle tourne sans toucher la pièce ni la contre-pointe.'] };
    },
  },
  {
    id: 'end',
    title: 'Fin de programme',
    codes: ['M30', 'M99'],
    description: 'Arrosage et broche coupés, retour au point de référence, fin de programme (ou retour au programme appelant).',
    fields: [
      { key: 'kind', label: 'Type de fin', type: 'choice', options: [{ value: 'M30', label: 'M30 : fin de programme principal' }, { value: 'M99', label: 'M99 : fin de sous-programme' }], default: 'M30' },
      { key: 'home', label: 'Retour au point de référence (G28)', type: 'boolean', default: true },
      { key: 'percent', label: 'Ajouter « % » (fin de fichier)', type: 'boolean', default: true },
    ],
    generate(v, { system = 'a' } = {}) {
      const lines = v.kind === 'M99' ? [] : ['M09', 'M05'];
      if (v.home) lines.push(...reference(system));
      lines.push(v.kind);
      if (v.percent) lines.push('%');
      const notes = [systemNote(system)];
      if (v.kind === 'M99' && v.percent) notes.push('Un sous-programme rangé dans le même fichier que le programme principal ne prend pas de « % » ici.');
      return { lines, notes };
    },
  },
];

/** Système de codes FANUC déduit des profils activés. */
export function codeSystem(enabledProfileIds) {
  return enabledProfileIds.includes('fanuc-turning-bc') ? 'bc' : 'a';
}
