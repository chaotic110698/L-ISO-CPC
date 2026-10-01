/**
 * Types de machines. Seul le tournage est développé en phase 1 ; les autres sont réservés
 * pour que programmes et profils portent dès maintenant leur type (champ `machineType`).
 */
export const MACHINE_TYPES = [
  { id: 'tournage', label: 'Tournage', axes: ['X', 'Z'], available: true },
  { id: 'fraisage', label: 'Fraisage', axes: ['X', 'Y', 'Z'], available: false },
  { id: 'rectification', label: 'Rectification', axes: ['X', 'Z'], available: false },
];

export const DEFAULT_MACHINE_TYPE = 'tournage';

export function isKnownMachineType(id) {
  return MACHINE_TYPES.some((type) => type.id === id);
}
