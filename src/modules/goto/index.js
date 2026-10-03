import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { h } from '../../core/dom.js';
import { resolveGoTo } from '../../engine/index.js';

/**
 * « Aller à… » : une ligne (42), un bloc (N120), un programme (O2000) ou un changement d'outil
 * (T3, T0303). Depuis la position du curseur dans la barre d'état, le menu Outils ou Ctrl+G.
 */
export default {
  id: 'goto',
  label: 'Aller à… (ligne, bloc N, programme O, outil T)',
  description: 'Saute à un numéro de ligne, à un bloc N, à un programme O ou à un changement d’outil T. Répéter la même saisie passe à l’occurrence suivante (N en double, outil repris).',
  group: 'outils',
  where: 'Position du curseur dans la barre d’état, menu Outils, Ctrl+G',
  activate(ctx) {
    const { editor } = ctx;
    let last = '';

    async function open() {
      const view = editor.view;
      const lines = () => view.state.doc.iterLines();
      const current = () => view.state.doc.lineAt(view.state.selection.main.head).number;
      const input = h('input', { class: 'input mono', name: 'target', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, value: last, placeholder: '42, N120, O2000, T0303', 'aria-describedby': 'goto-preview' });
      const preview = h('p', { class: 'goto-preview', id: 'goto-preview', 'aria-live': 'polite' });
      const showPreview = () => {
        if (!input.value.trim()) return preview.replaceChildren('Ligne, bloc N, programme O ou outil T.');
        const result = resolveGoTo(lines(), input.value, current());
        if (result.error) return preview.replaceChildren(h('span', { class: 'goto-error' }, result.error));
        const text = view.state.doc.line(result.line).text.trim();
        preview.replaceChildren(
          `→ ligne ${result.line}`,
          result.matches.length > 1 ? ` (${result.index + 1} sur ${result.matches.length})` : '',
          ' : ',
          h('code', null, text.length > 48 ? `${text.slice(0, 48)}…` : text || '(ligne vide)'),
        );
      };
      input.addEventListener('input', showPreview);
      showPreview();

      const choice = await ctx.ui.openDialog({
        title: 'Aller à…',
        body: h('div', { class: 'field' }, h('label', null, 'Destination', input), preview),
        actions: [{ label: 'Aller', value: 'go', primary: true }, { label: 'Annuler' }],
        validate: () => resolveGoTo(lines(), input.value, current()).error ?? null,
        onOpen: () => {
          input.focus();
          input.select();
        },
      });
      if (choice !== 'go') return;
      last = input.value.trim().toUpperCase();
      const { line } = resolveGoTo(lines(), input.value, current());
      const target = view.state.doc.line(line);
      view.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: 'center' }) });
      view.focus();
    }

    const run = () => {
      open();
      return true;
    };
    ctx.editor.addExtension(Prec.high(keymap.of([{ key: 'Mod-g', run, preventDefault: true }, { key: 'Mod-Alt-g', run, preventDefault: true }])));
    ctx.ui.toolbar.add({ id: 'goto', icon: 'arrowDown', label: 'Aller à…', title: 'Aller à une ligne, un bloc N, un programme O, un outil T (Ctrl+G)', order: 65, menu: true, onClick: open });
    ctx.ui.statusbar.onClick('cursor', open);
  },
};
