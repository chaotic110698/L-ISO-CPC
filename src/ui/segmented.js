import { h, domId } from '../core/dom.js';
import { icon } from './icons.js';

/**
 * Choix exclusif présenté en boutons accolés (boutons radio stylés).
 * options : [{ value, label, icon? }] ; onChange(valeur) à chaque choix.
 * L'élément renvoyé a une méthode setValue(valeur) pour suivre un changement externe.
 */
export function segmented({ label, options, value, onChange }) {
  const name = domId('choice');
  const inputs = options.map((option) =>
    h('input', { type: 'radio', name, value: String(option.value), checked: option.value === value, onchange: () => onChange(option.value) }),
  );
  const group = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': label },
    options.map((option, i) => h('label', { class: 'segment' }, inputs[i], option.icon ? icon(option.icon) : null, h('span', null, option.label))),
  );
  group.setValue = (next) => inputs.forEach((input, i) => (input.checked = options[i].value === next));
  return group;
}
