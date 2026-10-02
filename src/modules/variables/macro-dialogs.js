import { h, domId } from '../../core/dom.js';
import { formatRanges, inRanges } from '../../engine/macro-ranges.js';

/** Texte de commentaire compatible commande numérique : majuscules, sans accents ni parenthèses. */
export function commentText(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[()]/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Avertissements (non bloquants) sur le choix d'un numéro de variable.
 * context : { ranges, rangesLabel, usedHere: Set, elsewhere: Map(index → [noms]), macros }
 */
export function numberWarnings(index, { ranges, rangesLabel, usedHere, elsewhere, macros }) {
  const warnings = [];
  if (!Number.isInteger(index) || index < 1) return ['Numéro de variable invalide.'];
  if (ranges.length && !inRanges(ranges, index)) warnings.push(`Hors des plages libres${rangesLabel ? ` du profil « ${rangesLabel} »` : ''} (${formatRanges(ranges)}).`);
  if (usedHere.has(index)) warnings.push(`#${index} est déjà utilisée dans ce programme.`);
  const others = elsewhere.get(index);
  if (others?.length) warnings.push(`#${index} est déjà affectée dans « ${others[0]} »${others.length > 1 ? ` et ${others.length - 1} autre(s) programme(s)` : ''}.`);
  const named = macros.name(index);
  if (named?.name) warnings.push(`#${index} porte déjà le nom « ${named.name} ».`);
  return warnings;
}

/**
 * Champs communs : numéro (avec avertissements en direct), nom, description.
 * Renvoie { element, read(), focus() }.
 */
export function variableFields({ index, name = '', description = '', context, lockNumber = false }) {
  const numberId = domId('var');
  const number = h('input', { id: numberId, class: 'input mono', value: index ?? '', inputmode: 'numeric', autocomplete: 'off', disabled: lockNumber });
  const warnings = h('ul', { class: 'var-warnings', 'aria-live': 'polite' });
  const nameInput = h('input', { class: 'input', value: name, autocomplete: 'off', placeholder: 'Cote mesurée, diamètre brut…' });
  const descriptionInput = h('textarea', { class: 'input textarea', rows: 2 }, description);

  const readNumber = () => Number(String(number.value).replace(/^#/, '').trim());
  const showWarnings = () => {
    if (lockNumber) return;
    warnings.replaceChildren(...numberWarnings(readNumber(), context).map((w) => h('li', null, w)));
  };
  number.addEventListener('input', showWarnings);
  showWarnings();

  const element = h(
    'div',
    { class: 'code-editor' },
    h('div', { class: 'field' }, h('label', { for: numberId }, 'Variable n°'), number, warnings, lockNumber ? null : h('small', null, 'Les avertissements n’empêchent pas d’utiliser ce numéro.')),
    h('div', { class: 'field' }, h('label', null, 'Nom', nameInput)),
    h('div', { class: 'field' }, h('label', null, 'Description (facultatif)', descriptionInput)),
  );
  return {
    element,
    read: () => ({ index: readNumber(), name: nameInput.value.trim(), description: descriptionInput.value.trim() }),
    focus: () => (lockNumber ? nameInput : number).focus(),
    extra: (node) => element.append(node),
  };
}
