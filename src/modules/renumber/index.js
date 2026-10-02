import { h } from '../../core/dom.js';
import { renumber, MAX_BLOCK_NUMBER } from '../../engine/index.js';

/** Renumérotation des blocs N, avec mise à jour des références (P/Q de cycles, GOTO, M99 P). */
export default {
  id: 'renumber',
  label: 'Renumérotation des blocs N',
  description: 'Bouton « Renuméroter » : début et pas au choix, ajout des N manquants, sélection seule ; les références P/Q des cycles, GOTO et M99 P suivent.',
  group: 'outils',
  activate(ctx) {
    ctx.ui.toolbar.add({
      id: 'renumber',
      icon: 'renumber',
      label: 'Renuméroter',
      title: 'Renuméroter les blocs N',
      order: 70,
      onClick: async () => {
        const view = ctx.editor.view;
        const selection = view.state.selection.main;
        const start = h('input', { class: 'input', inputmode: 'numeric', value: ctx.kv.get('renumber.start', 10) });
        const step = h('input', { class: 'input', inputmode: 'numeric', value: ctx.kv.get('renumber.step', 10) });
        const addMissing = h('input', { type: 'checkbox', checked: ctx.kv.get('renumber.addMissing', false) });
        const onlySelection = h('input', { type: 'checkbox', checked: !selection.empty, disabled: selection.empty });
        const body = h(
          'div',
          { class: 'code-editor' },
          h('div', { class: 'field-row' }, h('div', { class: 'field' }, h('label', null, 'Premier numéro', start)), h('div', { class: 'field' }, h('label', null, 'Pas', step))),
          h('label', { class: 'check' }, addMissing, h('span', null, 'Numéroter aussi les blocs sans N', h('small', null, ' — sauf %, O…, commentaires seuls et lignes vides'))),
          h('label', { class: 'check' }, onlySelection, h('span', null, 'Lignes sélectionnées uniquement', selection.empty ? h('small', null, ' — aucune sélection') : null)),
          h('p', { class: 'card-description' }, 'Les références sont mises à jour : P / Q des cycles G70 à G73, GOTO, M99 P. Une seule annulation (Ctrl+Z) rétablit tout.'),
        );
        const read = () => ({ start: Number(start.value), step: Number(step.value) });
        const choice = await ctx.ui.openDialog({
          title: 'Renuméroter les blocs',
          body,
          actions: [{ label: 'Renuméroter', value: 'ok', primary: true }, { label: 'Annuler' }],
          validate: () => {
            const { start: s, step: p } = read();
            if (!Number.isInteger(s) || s < 0 || !Number.isInteger(p) || p < 1) return 'Premier numéro et pas : nombres entiers (pas ≥ 1).';
            return null;
          },
        });
        if (choice !== 'ok') return;
        const options = { ...read(), addMissing: addMissing.checked };
        ctx.kv.set('renumber.start', options.start);
        ctx.kv.set('renumber.step', options.step);
        ctx.kv.set('renumber.addMissing', options.addMissing);
        const doc = view.state.doc;
        if (onlySelection.checked && !selection.empty) {
          options.fromLine = doc.lineAt(selection.from).number;
          options.toLine = doc.lineAt(selection.to).number;
        }
        const result = renumber(doc.iterLines(), ctx.codes, options);
        const changes = [];
        result.lines.forEach((text, i) => {
          const line = doc.line(i + 1);
          if (text !== line.text) changes.push({ from: line.from, to: line.to, insert: text });
        });
        if (!changes.length) {
          ctx.ui.toast('Aucun bloc à renuméroter.');
          return;
        }
        view.dispatch({ changes, userEvent: 'renumber' });
        ctx.ui.toast(`${result.changed} ligne${result.changed > 1 ? 's' : ''} modifiée${result.changed > 1 ? 's' : ''}.`, { type: 'success' });
        if (result.last > MAX_BLOCK_NUMBER) ctx.ui.toast(`Attention : N${result.last} dépasse ${MAX_BLOCK_NUMBER}, refusé par la plupart des commandes.`, { type: 'error' });
      },
    });
  },
};
