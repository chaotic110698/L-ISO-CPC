import { h } from '../../core/dom.js';
import { shiftCoordinates } from '../../engine/index.js';
import { parseNumber } from '../calculators/calculator.js';

/** Décalage des cotes absolues (X au diamètre, Z, Y) sur la sélection ou tout le programme. */
export default {
  id: 'coordinateShift',
  label: 'Décalage de coordonnées',
  description: 'Décale les cotes absolues X (au diamètre), Z ou Y d’une valeur, sur la sélection ou tout le programme. Les cotes relatives (U, W), G28/G50/G53, temporisations et paramètres de cycles ne sont pas modifiés.',
  group: 'outils',
  where: 'Menu Outils de la barre d’outils',
  activate(ctx) {
    ctx.ui.toolbar.add({
      id: 'shift',
      icon: 'move',
      label: 'Décaler les coordonnées',
      title: 'Décaler X / Z sur la sélection ou tout le programme',
      order: 72,
      menu: true,
      onClick: async () => {
        const view = ctx.editor.view;
        const selection = view.state.selection.main;
        const fields = ['X', 'Z', 'Y'].map((letter) => ({
          letter,
          input: h('input', { class: 'input mono', inputmode: 'decimal', value: '0', autocomplete: 'off' }),
        }));
        const onlySelection = h('input', { type: 'checkbox', checked: !selection.empty, disabled: selection.empty });
        const labels = { X: 'Décalage en X (au diamètre)', Z: 'Décalage en Z', Y: 'Décalage en Y (outils motorisés)' };
        const choice = await ctx.ui.openDialog({
          title: 'Décaler les coordonnées',
          body: h(
            'div',
            { class: 'code-editor' },
            h('div', { class: 'field-row' }, fields.slice(0, 2).map((f) => h('div', { class: 'field' }, h('label', null, labels[f.letter], f.input)))),
            h('div', { class: 'field' }, h('label', null, labels.Y, fields[2].input)),
            h('label', { class: 'check' }, onlySelection, h('span', null, 'Lignes sélectionnées uniquement', selection.empty ? h('small', null, ' — aucune sélection : tout le programme') : null)),
            h('p', { class: 'card-description' }, 'Seules les cotes absolues sont modifiées. Une seule annulation (Ctrl+Z) rétablit tout.'),
          ),
          actions: [{ label: 'Décaler', value: 'ok', primary: true }, { label: 'Annuler' }],
          validate: () => (fields.every((f) => Number.isFinite(parseNumber(f.input.value) || 0)) ? null : 'Valeurs numériques attendues (ex. -2,5).'),
        });
        if (choice !== 'ok') return;
        const offsets = Object.fromEntries(fields.map((f) => [f.letter, parseNumber(f.input.value) || 0]));
        const doc = view.state.doc;
        const options = onlySelection.checked && !selection.empty ? { fromLine: doc.lineAt(selection.from).number, toLine: doc.lineAt(selection.to).number } : {};
        const result = shiftCoordinates(doc.iterLines(), ctx.codes, offsets, options);
        const changes = [];
        result.lines.forEach((text, i) => {
          const line = doc.line(i + 1);
          if (text !== line.text) changes.push({ from: line.from, to: line.to, insert: text });
        });
        if (changes.length) view.dispatch({ changes, userEvent: 'shift' });
        const skipped = result.skippedExpressions ? ` · ${result.skippedExpressions} valeur(s) calculée(s) (#…) non modifiée(s)` : '';
        ctx.ui.toast(result.changed ? `${result.changed} cote(s) décalée(s)${skipped}.` : `Aucune cote à décaler${skipped}.`, { type: result.changed ? 'success' : 'info' });
      },
    });
  },
};
