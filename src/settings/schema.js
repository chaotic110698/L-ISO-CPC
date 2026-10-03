/**
 * Schéma déclaratif des réglages. La page Paramètres est générée à partir de ces entrées :
 * ajouter une entrée ici (ou dans le champ `settings` d'un module) suffit à la faire apparaître.
 *
 * Types d'entrées :
 *   boolean                 interrupteur
 *   number  (min/max/step)  curseur
 *   choice  (options)       choix exclusif
 *   string                  texte
 * `default` peut être une fonction (évaluée à la lecture), par ex. pour suivre le thème du système.
 *
 * Les interrupteurs de fonctionnalités (`modules.<id>`) sont ajoutés automatiquement par le
 * registre des modules (src/core/module-registry.js).
 */

export const SETTINGS_SECTIONS = [
  { id: 'apparence', title: 'Apparence' },
  { id: 'editeur', title: 'Éditeur' },
  {
    id: 'profils',
    title: 'Profils machines',
    description: 'Profils activés, du plus général au plus spécifique. La gestion complète (codes, plages de macros, ordre) se fait dans la page Profils machines.',
  },
  {
    id: 'modules',
    title: 'Fonctionnalités',
    description:
      'Chaque fonctionnalité peut être désactivée individuellement : elle est alors réellement retirée de l’éditeur, pas seulement masquée.',
  },
  { id: 'donnees', title: 'Données' },
  { id: 'apropos', title: 'À propos' },
];

/** Regroupement des fonctionnalités dans la section « Fonctionnalités ». */
export const MODULE_GROUPS = [
  { id: 'editeur', label: 'Édition' },
  { id: 'analyse', label: 'Analyse du programme' },
  { id: 'outils', label: 'Outils' },
  { id: 'fichiers', label: 'Fichiers et enregistrement' },
  { id: 'calculateurs', label: 'Calculateurs' },
  { id: 'apprendre', label: 'Apprendre' },
];

export function systemPrefersDark() {
  return Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

export const CORE_SETTINGS = [
  {
    key: 'theme',
    section: 'apparence',
    type: 'choice',
    label: 'Thème',
    options: [
      { value: 'light', label: 'Clair', icon: 'sun' },
      { value: 'dark', label: 'Sombre', icon: 'moon' },
    ],
    // Par défaut : celui du système, jusqu'à ce que l'utilisateur choisisse.
    default: () => (systemPrefersDark() ? 'dark' : 'light'),
  },
  {
    key: 'ui.size',
    section: 'apparence',
    type: 'choice',
    label: 'Taille de l’interface',
    description: 'Grande : boutons, menus, interrupteurs et listes agrandis, pour un usage au doigt ou avec des gants. Le texte du programme se règle à part (Éditeur › Taille du texte).',
    options: [
      { value: 'normal', label: 'Normale' },
      { value: 'large', label: 'Grande' },
    ],
    default: 'normal',
  },
  {
    key: 'editor.fontSize',
    section: 'editeur',
    type: 'number',
    label: 'Taille du texte',
    min: 12,
    max: 24,
    step: 1,
    unit: 'px',
    default: 15,
  },
  {
    key: 'editor.lineWrapping',
    section: 'editeur',
    type: 'boolean',
    label: 'Retour à la ligne automatique',
    description: 'Les lignes trop longues passent à la ligne au lieu de défiler horizontalement.',
    default: true,
  },
];
