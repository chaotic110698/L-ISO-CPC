import { h } from '../../core/dom.js';
import { countLines } from '../../core/util.js';
import { icon } from '../../ui/icons.js';
import { insertBlockAtCursor } from './insert.js';

/** Boîte de saisie d'un élément de bibliothèque (nom, description, contenu). */
async function editItem(ctx, { title, item }) {
  const name = h('input', { class: 'input', value: item.name ?? '', autocomplete: 'off' });
  const description = h('textarea', { class: 'input textarea', rows: 2 }, item.description ?? '');
  const content = h('textarea', { class: 'input textarea mono', rows: 10, spellcheck: 'false' }, item.content ?? '');
  const choice = await ctx.ui.openDialog({
    title,
    className: 'dialog-wide',
    body: h(
      'div',
      { class: 'code-editor' },
      h('div', { class: 'field' }, h('label', null, 'Nom', name)),
      h('div', { class: 'field' }, h('label', null, 'Description (facultatif)', description)),
      h('div', { class: 'field' }, h('label', null, 'Contenu', content)),
    ),
    actions: [{ label: 'Enregistrer', value: 'ok', primary: true }, { label: 'Annuler' }],
    validate: () => (!name.value.trim() ? 'Donnez un nom.' : !content.value.trim() ? 'Le contenu est vide.' : null),
    onOpen: () => name.focus(),
  });
  return choice === 'ok' ? { name: name.value, description: description.value, content: content.value } : null;
}

/**
 * Bibliothèque personnelle de sous-programmes et d'extraits : ajouter la sélection (ou tout le
 * programme), insérer au curseur, modifier, supprimer. Incluse dans la sauvegarde JSON.
 */
export default {
  id: 'library',
  label: 'Bibliothèque de sous-programmes',
  description: 'Panneau « Bibliothèque » : vos sous-programmes et extraits réutilisables, à insérer en un clic dans n’importe quel programme.',
  group: 'outils',
  activate(ctx) {
    const { library } = ctx;

    ctx.ui.panels.add({
      id: 'library',
      title: 'Bibliothèque',
      icon: 'bookmark',
      order: 63,
      render(container) {
        const search = h('input', { class: 'input', type: 'search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher dans la bibliothèque' });
        const list = h('ul', { class: 'var-list' });

        const addSelection = async () => {
          const view = ctx.editor.view;
          const { main } = view.state.selection;
          const text = main.empty ? view.state.doc.toString() : view.state.sliceDoc(main.from, main.to);
          const values = await editItem(ctx, { title: main.empty ? 'Ajouter le programme à la bibliothèque' : 'Ajouter la sélection à la bibliothèque', item: { name: main.empty ? ctx.workspace.current?.name : '', content: text } });
          if (!values) return;
          await library.create(values);
          ctx.ui.toast(`« ${values.name} » ajouté à la bibliothèque.`, { type: 'success' });
        };

        const render = async () => {
          const term = search.value.trim().toLowerCase();
          const items = (await library.list()).filter((i) => !term || `${i.name} ${i.description} ${i.content}`.toLowerCase().includes(term));
          list.replaceChildren(
            ...(items.length
              ? items.map((item) =>
                  h(
                    'li',
                    { class: 'var-row', dataset: { item: item.name } },
                    h(
                      'div',
                      { class: 'var-text' },
                      h('span', { class: 'code-name' }, item.name),
                      item.description ? h('small', null, item.description) : null,
                      h('small', null, `${countLines(item.content)} ligne(s)`),
                    ),
                    h(
                      'div',
                      { class: 'code-actions' },
                      h('button', { type: 'button', class: 'btn btn-small', onclick: () => insertBlockAtCursor(ctx.editor.view, item.content) }, 'Insérer'),
                      h(
                        'button',
                        {
                          type: 'button',
                          class: 'icon-btn',
                          'aria-label': `Modifier ${item.name}`,
                          onclick: async () => {
                            const values = await editItem(ctx, { title: 'Modifier', item });
                            if (values) await library.update(item.id, values);
                          },
                        },
                        icon('edit'),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          class: 'icon-btn',
                          'aria-label': `Supprimer ${item.name}`,
                          onclick: async () => {
                            if (await ctx.ui.confirm({ title: 'Supprimer', message: `Supprimer « ${item.name} » de la bibliothèque ?`, confirmLabel: 'Supprimer', danger: true })) await library.remove(item.id);
                          },
                        },
                        icon('trash'),
                      ),
                    ),
                  ),
                )
              : [h('li', { class: 'var-empty' }, term ? 'Aucun résultat.' : 'Bibliothèque vide : sélectionnez un sous-programme dans l’éditeur puis « Ajouter ».')]),
          );
        };

        search.addEventListener('input', render);
        const off = ctx.bus.on('library:changed', render);
        container.replaceChildren(
          h('div', { class: 'var-summary' }, h('p', null, 'Sélectionnez des lignes (ou rien, pour tout le programme) puis :'), h('button', { type: 'button', class: 'btn btn-small btn-primary', onclick: addSelection }, icon('plus'), 'Ajouter à la bibliothèque')),
          search,
          list,
        );
        render();
        return { dispose: off };
      },
    });
    ctx.ui.addNavItem({ id: 'ma-bibliotheque', label: 'Ma bibliothèque', icon: 'bookmark', order: 46, onSelect: () => ctx.ui.showPanel('library') });
  },
};
