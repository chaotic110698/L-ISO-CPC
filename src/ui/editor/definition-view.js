import { h } from '../../core/dom.js';
import { icon } from '../icons.js';
import { CATEGORIES } from '../../data/categories.js';

const categoryLabel = (id) => CATEGORIES.find((category) => category.id === id)?.label ?? '';

/** Contenu de l'infobulle de définition (objet produit par explainToken du moteur). */
export function renderExplanation(explanation, { onClose, onEditCode } = {}) {
  const e = explanation;
  const meta = [e.source, e.modal === true ? 'modal' : e.modal === false ? 'non modal (ce bloc seulement)' : null].filter(Boolean).join(' · ');

  return h(
    'div',
    { class: 'def-tip', role: 'dialog', 'aria-label': `Définition de ${e.title}` },
    h(
      'header',
      { class: 'def-header' },
      h('span', { class: `def-code tok-${e.category}` }, e.title),
      h('span', { class: 'def-category' }, categoryLabel(e.category)),
      h('button', { type: 'button', class: 'icon-btn def-close', 'aria-label': 'Fermer la définition', onclick: onClose }, icon('close')),
    ),
    h('div', { class: 'def-body' },
      e.subtitle ? h('p', { class: 'def-name' }, e.subtitle) : null,
      meta ? h('p', { class: 'def-meta' }, meta) : null,
      e.redefined?.length
        ? h(
            'p',
            { class: 'def-redefined' },
            icon('warning'),
            h('span', null, 'Code redéfini par ce profil. ', e.redefined.map((r) => `En ${r.sourceLabel} : « ${r.name} ».`).join(' ')),
          )
        : null,
      e.warnings?.length
        ? h('div', { class: 'def-warnings' }, e.warnings.map((w) => h('p', { class: 'def-redefined' }, icon('warning'), h('span', null, w))))
        : null,
      e.description ? h('p', { class: 'def-description' }, e.description) : null,
      e.details?.length ? h('ul', { class: 'def-details' }, e.details.map((d) => h('li', null, d))) : null,
      e.syntax ? h('pre', { class: 'def-syntax' }, e.syntax) : null,
      e.params?.length
        ? h(
            'dl',
            { class: 'def-params' },
            e.params.map((p) => [
              h('dt', { class: p.value ? 'is-used' : null }, p.letter),
              h('dd', null, p.text, p.value ? h('code', { class: 'def-value' }, p.value) : null),
            ]),
          )
        : null,
      e.notes?.length ? h('ul', { class: 'def-notes' }, e.notes.map((n) => h('li', null, n))) : null,
      e.example ? h('div', { class: 'def-example' }, h('span', null, 'Exemple'), h('pre', null, e.example)) : null,
      onEditCode && (e.kind === 'code' || e.kind === 'unknownCode')
        ? h(
            'div',
            { class: 'button-row' },
            h(
              'button',
              { type: 'button', class: 'btn btn-small def-edit', onclick: () => onEditCode(e.title) },
              icon(e.kind === 'unknownCode' ? 'plus' : 'edit'),
              e.kind === 'unknownCode' ? 'Ajouter ce code à un profil' : 'Personnaliser pour ma machine',
            ),
          )
        : null,
    ),
  );
}
