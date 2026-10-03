import { h, domId } from '../core/dom.js';
import { parseNumber } from '../modules/calculators/calculator.js';
import { insertBlockAtCursor } from '../modules/library/insert.js';

function defaults(model) {
  return Object.fromEntries(model.fields.map((f) => [f.key, f.default]));
}

/**
 * Formulaire d'un générateur de code (cycle, modèle d'insertion), avec aperçu du code mis à
 * jour pendant la saisie, puis insertion sous la ligne du curseur.
 *
 * model : { title, description, fields: [ { key, label, unit?, default,
 *   type: 'number' | 'integer' | 'boolean' | 'choice' | 'text', options?, hint?, min? } ],
 *   generate(values, context) → { lines, notes? } }
 * storageKey : dernières valeurs saisies, reprises à l'ouverture suivante.
 */
export async function openGeneratorForm(ctx, model, { storageKey, context } = {}) {
  const saved = storageKey ? ctx.kv.get(storageKey, null) : null;
  const values = { ...defaults(model), ...(saved ?? {}) };
  const preview = h('pre', { class: 'cycle-preview', 'aria-live': 'polite' });
  const notes = h('ul', { class: 'def-notes' });
  const error = h('p', { class: 'dialog-error', hidden: true });

  const read = () => {
    const out = {};
    for (const field of model.fields) {
      const raw = values[field.key];
      if (field.type === 'boolean' || field.type === 'choice') out[field.key] = raw;
      else if (field.type === 'text') out[field.key] = String(raw ?? '').trim();
      else {
        const number = typeof raw === 'number' ? raw : parseNumber(raw);
        if (!Number.isFinite(number)) return { error: `« ${field.label} » : valeur numérique attendue.` };
        if (field.type === 'integer' && !Number.isInteger(number)) return { error: `« ${field.label} » : nombre entier attendu.` };
        if (field.min != null && number < field.min) return { error: `« ${field.label} » : minimum ${field.min}.` };
        out[field.key] = number;
      }
    }
    return { values: out };
  };

  const update = () => {
    const { values: clean, error: message } = read();
    error.hidden = !message;
    error.textContent = message ?? '';
    if (!clean) return null;
    const result = model.generate(clean, context);
    preview.textContent = result.lines.join('\n');
    notes.replaceChildren(...(result.notes ?? []).map((n) => h('li', null, n)));
    return { clean, result };
  };

  const fieldRows = model.fields.map((field) => {
    const id = domId('field');
    let control;
    if (field.type === 'boolean') {
      control = h('input', { id, type: 'checkbox', checked: Boolean(values[field.key]), onchange: (e) => ((values[field.key] = e.target.checked), update()) });
      return h('label', { class: 'check cycle-check' }, control, h('span', null, field.label));
    }
    if (field.type === 'choice') {
      control = h('select', { id, class: 'input', onchange: (e) => ((values[field.key] = e.target.value), update()) }, field.options.map((o) => h('option', { value: o.value }, o.label)));
      control.value = values[field.key];
    } else if (field.type === 'text') {
      control = h('input', { id, class: 'input', autocomplete: 'off', value: values[field.key] ?? '', dataset: { field: field.key }, oninput: (e) => ((values[field.key] = e.target.value), update()) });
    } else {
      control = h('input', {
        id,
        class: 'input mono',
        inputmode: 'decimal',
        autocomplete: 'off',
        value: String(values[field.key]).replace('.', ','),
        dataset: { field: field.key },
        oninput: (e) => ((values[field.key] = e.target.value), update()),
      });
    }
    return h(
      'div',
      { class: 'field cycle-field' },
      h('label', { for: id }, field.label),
      h('div', { class: 'calc-input' }, control, field.unit ? h('span', { class: 'calc-unit-text' }, field.unit) : null),
      field.hint ? h('small', null, field.hint) : null,
    );
  });

  update();
  const choice = await ctx.ui.openDialog({
    title: model.title,
    className: 'dialog-wide dialog-tall',
    body: h(
      'div',
      { class: 'cycle-form' },
      h('p', { class: 'card-description' }, model.description),
      h('div', { class: 'cycle-fields' }, fieldRows),
      error,
      h('h3', { class: 'var-heading' }, 'Code généré'),
      preview,
      notes,
    ),
    actions: [{ label: 'Insérer dans le programme', value: 'insert', primary: true }, { label: 'Annuler' }],
    validate: () => (update() ? null : 'Corrigez les valeurs signalées.'),
  });
  if (choice !== 'insert') return;
  const { clean, result } = update();
  if (storageKey) ctx.kv.set(storageKey, clean);
  insertBlockAtCursor(ctx.editor.view, result.lines.join('\n'));
  ctx.ui.toast(`${model.title} : ${result.lines.length} lignes insérées.`, { type: 'success' });
}
