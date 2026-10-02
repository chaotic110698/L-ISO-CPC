import { h, domId } from '../../core/dom.js';

/** Lit un nombre saisi (virgule ou point, espaces ignorés). NaN si vide ou invalide. */
export function parseNumber(text) {
  const cleaned = String(text ?? '').replace(/\s/g, '').replace(',', '.');
  return cleaned === '' ? NaN : Number(cleaned);
}

/** Formate un nombre à la française, sans zéros inutiles. */
export function formatNumber(value, decimals = 3) {
  if (!Number.isFinite(value)) return '';
  return value.toLocaleString('fr-FR', { maximumFractionDigits: decimals, useGrouping: false });
}

/** Comme formatNumber, avec séparateur de milliers (affichage des résultats). */
export function formatResult(value, decimals = 3) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('fr-FR', { maximumFractionDigits: decimals });
}

/**
 * Calculateur générique à saisie libre dans tous les sens.
 *
 * spec = {
 *   id, title, description, formula,
 *   fields: [ { key, label, unit?, unitKey?, units?, decimals?, kind?: 'number'|'choice', options? } ],
 *   defaults: { … },                              état initial
 *   compute(state, changedKey),                    complète l'état après une saisie
 *   onUnitChange?(state, unitKey, previousUnit),   conversion de la valeur affichée
 *   results?(state) → [ texte | Node ],            lignes de résultat
 * }
 * L'état est mémorisé via load()/save() (stockage local).
 */
export function createCalculator(spec, { load, save }) {
  const state = { ...spec.defaults, ...(load() ?? {}) };
  const inputs = new Map();
  const results = h('div', { class: 'calc-results', 'aria-live': 'polite' });
  const visibility = [];

  function refresh(exceptKey) {
    for (const update of visibility) update();
    for (const [key, { input, decimals }] of inputs) {
      if (key === exceptKey) continue;
      if (input.tagName === 'SELECT') input.value = state[key];
      else input.value = formatNumber(state[key], decimals);
    }
    results.replaceChildren(...(spec.results?.(state) ?? []).map((line) => (line instanceof Node ? line : h('p', null, line))));
  }

  function commit(changedKey) {
    spec.compute(state, changedKey);
    save({ ...state });
    refresh(changedKey);
  }

  const rows = spec.fields.map((field) => {
      const id = domId(`calc-${spec.id}`);
      let control;
      if (field.kind === 'choice') {
        control = h(
          'select',
          { id, class: 'input', onchange: (e) => { state[field.key] = e.target.value; commit(field.key); } },
          field.options.map((o) => h('option', { value: o.value }, o.label)),
        );
      } else {
        control = h('input', {
          id,
          class: 'input',
          type: 'text',
          inputmode: 'decimal',
          autocomplete: 'off',
          spellcheck: 'false',
          dataset: { key: field.key },
          oninput: (e) => {
            state[field.key] = parseNumber(e.target.value);
            commit(field.key);
          },
          onblur: () => refresh(),
        });
      }
      inputs.set(field.key, { input: control, decimals: field.decimals ?? 3 });

      let unit = null;
      if (field.units) {
        unit = h(
          'select',
          {
            class: 'input calc-unit',
            'aria-label': `Unité : ${field.label}`,
            dataset: { unitFor: field.key },
            onchange: (e) => {
              const previous = state[field.unitKey];
              state[field.unitKey] = e.target.value;
              spec.onUnitChange?.(state, field.unitKey, previous);
              save({ ...state });
              refresh();
            },
          },
          field.units.map((u) => h('option', { value: u }, u)),
        );
        unit.value = state[field.unitKey];
      } else if (field.unit) {
        unit = h('span', { class: 'calc-unit-text' }, field.unit);
      }

      const row = h(
        'div',
        { class: `calc-field${field.kind === 'choice' ? ' is-choice' : ''}` },
        h('label', { for: id }, field.label),
        h('div', { class: 'calc-input' }, control, unit),
        field.hint ? h('small', { class: 'calc-hint' }, field.hint) : null,
      );
      if (field.hidden) visibility.push(() => (row.hidden = field.hidden(state)));
      return row;
    });

  const element = h(
    'section',
    { class: 'calc-card card', dataset: { calc: spec.id }, 'aria-labelledby': `calc-title-${spec.id}` },
    h('h2', { id: `calc-title-${spec.id}`, class: 'card-title' }, spec.title),
    spec.description ? h('p', { class: 'card-description' }, spec.description) : null,
    h('div', { class: 'calc-fields' }, rows),
    results,
    spec.formula ? h('p', { class: 'calc-formula' }, spec.formula) : null,
  );

  spec.compute(state, null);
  refresh();
  return element;
}
