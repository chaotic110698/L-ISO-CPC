import { h, domId } from '../../core/dom.js';
import { FANUC_TURNING_CYCLES } from '../../data/cycles/fanuc-turning.js';
import { parseNumber } from '../calculators/calculator.js';
import { insertBlockAtCursor } from '../library/insert.js';

/** Modèles de cycles par profil intégré : proposés seulement si ce profil est activé. */
const CYCLES_BY_PROFILE = [{ profile: 'fanuc-turning', cycles: FANUC_TURNING_CYCLES }];

function defaults(cycle) {
  return Object.fromEntries(cycle.fields.map((f) => [f.key, f.default]));
}

/** Formulaire d'un cycle, avec aperçu du code généré mis à jour pendant la saisie. */
async function openCycleForm(ctx, cycle) {
  const saved = ctx.kv.get(`cycle.${cycle.id}`, null);
  const values = { ...defaults(cycle), ...(saved ?? {}) };
  const preview = h('pre', { class: 'cycle-preview', 'aria-live': 'polite' });
  const notes = h('ul', { class: 'def-notes' });
  const error = h('p', { class: 'dialog-error', hidden: true });

  const read = () => {
    const out = {};
    for (const field of cycle.fields) {
      const raw = values[field.key];
      if (field.type === 'boolean' || field.type === 'choice') out[field.key] = raw;
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
    const result = cycle.generate(clean);
    preview.textContent = result.lines.join('\n');
    notes.replaceChildren(...(result.notes ?? []).map((n) => h('li', null, n)));
    return { clean, result };
  };

  const fieldRows = cycle.fields.map((field) => {
    const id = domId('cycle');
    let control;
    if (field.type === 'boolean') {
      control = h('input', { id, type: 'checkbox', checked: Boolean(values[field.key]), onchange: (e) => ((values[field.key] = e.target.checked), update()) });
      return h('label', { class: 'check cycle-check' }, control, h('span', null, field.label));
    }
    if (field.type === 'choice') {
      control = h('select', { id, class: 'input', onchange: (e) => ((values[field.key] = e.target.value), update()) }, field.options.map((o) => h('option', { value: o.value }, o.label)));
      control.value = values[field.key];
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
    title: cycle.title,
    className: 'dialog-wide dialog-tall',
    body: h(
      'div',
      { class: 'cycle-form' },
      h('p', { class: 'card-description' }, cycle.description),
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
  ctx.kv.set(`cycle.${cycle.id}`, clean);
  insertBlockAtCursor(ctx.editor.view, result.lines.join('\n'));
  ctx.ui.toast(`${cycle.title} : ${result.lines.length} lignes insérées.`, { type: 'success' });
}

export default {
  id: 'cycles',
  label: 'Formulaires de cycles',
  description: 'Panneau « Cycles » : formulaires qui génèrent les blocs des cycles FANUC (G71/G70, G72, G76, G92, G90, G74, G75) avec aperçu, conversions mm → µm et calcul de la hauteur de filet.',
  group: 'outils',
  where: 'Panneau « Cycles » (barre d’outils, menu latéral)',
  activate(ctx) {
    ctx.ui.panels.add({
      id: 'cycles',
      title: 'Cycles',
      icon: 'cycle',
      order: 62,
      render(container) {
        const render = () => {
          const enabled = new Set(ctx.profiles.enabledProfiles().map((p) => p.id));
          const groups = CYCLES_BY_PROFILE.filter((g) => enabled.has(g.profile));
          container.replaceChildren(
            h('p', { class: 'var-summary' }, 'Remplissez le formulaire : le code est inséré sous la ligne du curseur.'),
            ...(groups.length
              ? groups.flatMap((group) =>
                  group.cycles.map((cycle) =>
                    h(
                      'button',
                      { type: 'button', class: 'cycle-item', dataset: { cycle: cycle.id }, onclick: () => openCycleForm(ctx, cycle) },
                      h('span', { class: 'cycle-codes' }, cycle.codes.map((code) => h('code', { class: 'tok-cycle' }, code))),
                      h('span', { class: 'cycle-title' }, cycle.title),
                      h('small', null, cycle.description),
                    ),
                  ),
                )
              : [h('p', { class: 'var-empty' }, 'Aucun modèle de cycle pour les profils activés (activez « FANUC tournage »).')]),
          );
        };
        const off = ctx.bus.on('profiles:changed', render);
        render();
        return { dispose: off };
      },
    });
    ctx.ui.addNavItem({ id: 'bibliotheque', label: 'Cycles (formulaires)', icon: 'cycle', order: 45, onSelect: () => ctx.ui.showPanel('cycles') });
  },
};
