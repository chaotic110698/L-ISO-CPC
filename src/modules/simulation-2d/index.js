import { createSimulator, splitLegacySession } from './simulator.js';

/**
 * Simulateur tour (section Simulateur › Tour) : on y charge un ou plusieurs programmes (copie de
 * leur texte), exécutés l'un après l'autre sans remise à zéro des variables #…, puis l'usinage
 * est animé — brut, enlèvement de matière, mandrin, outil — avec lecture, pause, vitesse, bloc
 * par bloc, retour à l'éditeur sur la ligne en cours, et alertes (rapide dans la matière, outil
 * dans les mors, arc impossible, avance absente…). Page commune aux simulateurs : simulator.js.
 */
export default {
  id: 'simulation',
  label: 'Simulateur tour',
  description:
    'Section Simulateur › Tour : chargez un ou plusieurs programmes enregistrés (exécutés à la suite, variables # partagées). Usinage animé : brut (lu dans un commentaire « (BRUT D50 X 80) » ou saisi), enlèvement de matière, trajet de l’outil, temps estimé, alertes (rapide G0 dans la matière, outil dans les mors, arc impossible, avance absente…). Lecture, pause, vitesse, bloc par bloc, zoom à deux doigts.',
  group: 'analyse',
  where: 'Menu latéral › Simulateur › Tour ; bouton « Simuler (tour) » de l’éditeur (charge le programme ouvert)',
  settings: [
    {
      key: 'simulation.turret',
      type: 'choice',
      label: 'Position de l’outil (simulation)',
      options: [
        { value: 'rear', label: 'Derrière l’axe (tourelle arrière)' },
        { value: 'front', label: 'Devant l’axe (tourelle avant)' },
      ],
      default: 'rear',
    },
    { key: 'simulation.rapidRate', type: 'number', label: 'Vitesse des rapides (estimation du temps)', unit: 'mm/min', min: 1000, max: 60000, step: 1000, default: 10000 },
  ],
  activate(ctx) {
    splitLegacySession(ctx.kv);
    createSimulator(ctx, {
      machine: 'lathe',
      id: 'simulation',
      path: '/simulation',
      label: 'Tour',
      title: 'Simulateur tour',
      icon: 'simulation',
      order: 24,
      prefix: 'simulation',
      toolbar: { label: 'Simuler (tour)', title: 'Charger ce programme dans le simulateur tour', order: 30 },
    });
  },
};
