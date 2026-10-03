import { h } from '../../core/dom.js';
import { rankEntries } from '../../core/palette.js';
import { explainToken, parseLine } from '../../engine/index.js';
import { renderExplanation } from '../../ui/editor/definition-view.js';
import { icon } from '../../ui/icons.js';
import { switchProgram } from '../../ui/program-actions.js';

const CODE_RE = /^[GM]\d/;

/** Définition d'un code (G71, M30…) selon le profil actif, dans une boîte de dialogue. */
function showCode(ctx, key) {
  const { tokens, block } = parseLine(key);
  const explanation = explainToken(tokens[0], { block, dictionary: ctx.codes, findAssignments: () => [], variableInfo: () => ({}) });
  if (!explanation) return;
  let close = () => {};
  const edit = (code) => {
    close();
    ctx.ui.editCode(code);
  };
  const body = h('div', { class: 'def-pinned' }, renderExplanation(explanation, { onEditCode: edit }));
  ctx.ui.openDialog({ title: `Code ${key}`, body, actions: [{ label: 'Fermer' }], onOpen: (dialog) => (close = () => dialog.close('')) });
}

/**
 * Palette de commandes (Ctrl+K) : un seul champ pour retrouver une action de l'éditeur, une
 * page, un programme, un code G/M du profil actif ou une leçon. Flèches pour choisir, Entrée
 * pour lancer, Échap pour fermer.
 */
export default {
  id: 'palette',
  label: 'Palette de commandes (Ctrl+K)',
  description: 'Un seul champ pour retrouver une action (rechercher, renuméroter, exporter…), une page, un programme, la définition d’un code G/M ou une leçon. Au clavier : Ctrl+K, puis flèches et Entrée.',
  group: 'outils',
  where: 'Ctrl+K, ou menu Outils › Palette de commandes',
  activate(ctx) {
    const go = (path) => ctx.ui.navigate(path);

    // Sources intégrées ; d'autres modules (cours…) ajoutent les leurs via ctx.ui.palette.add.
    ctx.ui.palette.add({
      id: 'actions',
      label: 'Actions de l’éditeur',
      order: 10,
      entries: () =>
        ctx.ui.toolbar
          .list()
          .filter((item) => item.id !== 'palette')
          .map((item) => ({ label: item.label, detail: item.title !== item.label ? item.title : '', icon: item.icon, suggested: true, run: () => (go('/editeur'), item.onClick()) })),
    });
    ctx.ui.palette.add({
      id: 'pages',
      label: 'Pages',
      order: 20,
      entries: () => ctx.ui.navItems().map((item) => ({ label: item.label, detail: 'Page', icon: item.icon, suggested: true, run: () => (item.path ? go(item.path) : item.onSelect?.()) })),
    });
    ctx.ui.palette.add({
      id: 'programs',
      label: 'Programmes',
      order: 30,
      entries: async () =>
        (await ctx.workspace.list()).map((program) => ({
          label: program.name,
          detail: 'Programme',
          keywords: (program.content.match(/^\s*[O:]\d+/m)?.[0] ?? '').trim(),
          icon: 'file',
          run: async () => {
            go('/editeur');
            await switchProgram(ctx.workspace, program.id);
          },
        })),
    });
    ctx.ui.palette.add({
      id: 'codes',
      label: 'Codes du profil actif',
      order: 40,
      entries: () =>
        ctx.codes
          .entries()
          .filter((entry) => CODE_RE.test(entry.key) && entry.name)
          .map((entry) => ({ label: entry.key, detail: entry.name, keywords: entry.sourceLabel, icon: 'info', run: () => showCode(ctx, entry.key) })),
    });

    async function open() {
      if (document.querySelector('dialog.palette')) return;
      const lists = await Promise.all(ctx.ui.palette.sources().map(async (source) => ({ source, entries: await source.entries() })));
      const all = lists.flatMap(({ source, entries }) => entries.map((entry) => ({ ...entry, group: source.label })));

      const input = h('input', { class: 'input palette-input', type: 'search', placeholder: 'Action, page, programme, code G/M, leçon…', 'aria-label': 'Rechercher', autocomplete: 'off', spellcheck: false, role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list' });
      const list = h('ul', { class: 'palette-list', id: 'palette-list', role: 'listbox', 'aria-label': 'Résultats' });
      const dialog = h('dialog', { class: 'dialog palette', 'aria-label': 'Palette de commandes' }, h('div', { class: 'palette-inner' }, input, list, h('p', { class: 'palette-hint' }, '↑ ↓ pour choisir · Entrée pour lancer · Échap pour fermer')));
      let shown = [];
      let active = 0;

      const setActive = (index) => {
        if (!shown.length) return;
        active = (index + shown.length) % shown.length;
        list.querySelectorAll('.palette-item').forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
        const el = list.querySelector(`[data-index="${active}"]`);
        el?.scrollIntoView({ block: 'nearest' });
        input.setAttribute('aria-activedescendant', el?.id ?? '');
      };
      const render = () => {
        shown = rankEntries(all, input.value, 60);
        list.replaceChildren();
        let group = null;
        shown.forEach((entry, index) => {
          if (entry.group !== group) {
            group = entry.group;
            list.append(h('li', { class: 'palette-group', role: 'presentation' }, group));
          }
          list.append(
            h(
              'li',
              { class: 'palette-item', id: `palette-item-${index}`, role: 'option', dataset: { index: String(index) }, onclick: () => run(entry), onmousemove: () => index !== active && setActive(index) },
              entry.icon ? icon(entry.icon) : h('span', { class: 'icon' }),
              h('span', { class: 'palette-label' }, entry.label),
              entry.detail ? h('span', { class: 'palette-detail' }, entry.detail) : null,
            ),
          );
        });
        if (!shown.length) list.append(h('li', { class: 'palette-empty' }, input.value.trim() ? 'Aucun résultat.' : 'Tapez pour chercher.'));
        setActive(0);
      };
      const run = (entry) => {
        dialog.close();
        // Après la fermeture : l'action peut ouvrir sa propre boîte de dialogue.
        setTimeout(() => entry.run(), 0);
      };

      input.addEventListener('input', render);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') setActive(active + 1);
        else if (event.key === 'ArrowUp') setActive(active - 1);
        else if (event.key === 'Enter' && shown[active]) run(shown[active]);
        else return;
        event.preventDefault();
      });
      dialog.addEventListener('click', (event) => event.target === dialog && dialog.close());
      dialog.addEventListener('close', () => dialog.remove());
      document.body.append(dialog);
      render();
      dialog.showModal();
      input.focus();
    }

    ctx.listen(window, 'keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open();
      }
    });
    ctx.ui.toolbar.add({ id: 'palette', icon: 'search', label: 'Palette de commandes', title: 'Retrouver une action, une page, un programme, un code (Ctrl+K)', order: 1, menu: true, onClick: open });
  },
};
