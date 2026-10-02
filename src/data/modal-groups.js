/**
 * Groupes modaux : deux codes d'un même groupe s'excluent dans un bloc, et le dernier
 * programmé reste actif (état modal). Le groupe de chaque code est indiqué dans sa
 * définition (champ `group`) ; 'nonModal' : code actif pour ce bloc seulement (groupe 00).
 * L'ordre ci-dessous est celui de l'affichage de l'état modal.
 */
export const MODAL_GROUPS = [
  { id: 'motion', label: 'Déplacement' },
  { id: 'distance', label: 'Cotation (absolu / relatif)' },
  { id: 'feedMode', label: 'Unité d’avance' },
  { id: 'spindleMode', label: 'Vitesse de broche' },
  { id: 'cutterComp', label: 'Correction de rayon' },
  { id: 'lengthComp', label: 'Correction de longueur' },
  { id: 'plane', label: 'Plan' },
  { id: 'units', label: 'Unités' },
  { id: 'workOffset', label: 'Origine pièce' },
  { id: 'cycle', label: 'Cycle de perçage' },
  { id: 'returnMode', label: 'Retour de cycle' },
  { id: 'polar', label: 'Interpolation polaire' },
  { id: 'cylindrical', label: 'Interpolation cylindrique' },
  { id: 'macroModal', label: 'Appel modal de macro' },
];

export const NON_MODAL = 'nonModal';
export const MODAL_GROUP_IDS = new Set(MODAL_GROUPS.map((g) => g.id));

/** Codes M à effet modal suivis dans l'état (broche, arrosage). */
export const M_STATES = {
  spindle: { label: 'Broche', codes: { M3: 'rotation horaire', M4: 'rotation anti-horaire', M5: 'arrêtée' } },
  coolant: { label: 'Arrosage', codes: { M7: 'brouillard', M8: 'actif', M9: 'coupé' } },
};
