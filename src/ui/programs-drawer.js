import { h, clear } from '../core/dom.js';
import { formatRelativeTime, countLines, foldText } from '../core/util.js';
import { icon } from './icons.js';
import { actionSheet, confirmDialog } from './dialogs.js';
import { segmented } from './segmented.js';
import { toast } from './toast.js';
import {
  switchProgram,
  newProgram,
  openProgramFile,
  renameProgram,
  duplicateProgram,
  deleteProgram,
} from './program-actions.js';

/**
 * Options du tiroir, activées par les modules :
 *   listTools : recherche (nom et contenu), tri par date ou par nom, programmes épinglés ;
 *   trash     : corbeille (programmes supprimés récupérables).
 */
export const drawerOptions = { listTools: false, trash: false, trashDays: 30 };

const SORTS = [
  { value: 'recent', label: 'Récents' },
  { value: 'name', label: 'Nom' },
];
const byName = (a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' });

/**
 * Filtre et trie les programmes : épinglés d'abord, puis selon `sort`. Une recherche porte sur
 * le nom (sans accents ni majuscules) et sur le contenu ; `match` indique où elle a trouvé.
 */
export function filterPrograms(programs, { query = '', sort = 'recent', pins = true } = {}) {
  const q = foldText(query.trim());
  const needle = query.trim().toUpperCase();
  const found = [];
  for (const program of programs) {
    if (!q) found.push({ program, match: null });
    else if (foldText(program.name).includes(q)) found.push({ program, match: 'name' });
    else if (program.content.toUpperCase().includes(needle)) found.push({ program, match: 'content' });
  }
  const order = sort === 'name' ? (a, b) => byName(a.program, b.program) : (a, b) => b.program.updatedAt - a.program.updatedAt;
  return found.sort((a, b) => (pins ? Number(Boolean(b.program.pinned)) - Number(Boolean(a.program.pinned)) : 0) || order(a, b));
}

/** Tiroir latéral listant les programmes enregistrés dans le navigateur. */
export function openProgramsDrawer({ workspace, bus, kv }) {
  const tools = drawerOptions.listTools;
  let view = 'list'; // 'list' | 'trash'
  let query = '';
  let sort = kv?.get('programs.sort', 'recent') ?? 'recent';

  const list = h('ul', { class: 'program-list', 'aria-label': 'Programmes enregistrés' });
  const title = h('h2', null, 'Programmes');
  const search = h('input', {
    class: 'input program-search',
    type: 'search',
    placeholder: 'Nom ou contenu (O1234, T0303…)',
    'aria-label': 'Rechercher un programme',
    autocomplete: 'off',
    oninput: () => {
      query = search.value;
      render();
    },
  });
  const sortControl = segmented({
    label: 'Trier par',
    options: SORTS,
    value: sort,
    onChange: (value) => {
      sort = value;
      kv?.set('programs.sort', value);
      render();
    },
  });
  const listTools = tools ? h('div', { class: 'program-tools' }, search, sortControl) : null;
  const actions = h(
    'div',
    { class: 'drawer-actions' },
    h('button', { type: 'button', class: 'btn btn-primary', onclick: () => act(() => newProgram(workspace), true) }, icon('plus'), 'Nouveau'),
    h('button', { type: 'button', class: 'btn', onclick: () => act(() => openProgramFile(workspace), true) }, icon('folder'), 'Ouvrir un fichier'),
  );
  const trashButton = h('button', { type: 'button', class: 'btn btn-small program-trash-link', dataset: { action: 'show-trash' }, onclick: () => showView('trash') });
  const backButton = h('button', { type: 'button', class: 'btn btn-small', dataset: { action: 'trash-back' }, onclick: () => showView('list') }, icon('arrowLeft'), 'Retour aux programmes');
  const emptyButton = h('button', { type: 'button', class: 'btn btn-small btn-danger', dataset: { action: 'empty-trash' }, onclick: emptyTrash }, icon('trash'), 'Vider la corbeille');
  const trashHead = h(
    'div',
    { class: 'program-trash-head' },
    h('p', { class: 'drawer-note' }, `Programmes supprimés, récupérables pendant ${drawerOptions.trashDays} jours puis effacés automatiquement.`),
    h('div', { class: 'button-row' }, backButton, emptyButton),
  );
  const note = h(
    'p',
    { class: 'drawer-note' },
    'Les programmes sont enregistrés dans ce navigateur, sur cet appareil. Pensez à exporter régulièrement une sauvegarde (Paramètres › Données).',
  );

  const dialog = h(
    'dialog',
    { class: 'drawer', 'aria-label': 'Programmes' },
    h(
      'div',
      { class: 'drawer-inner' },
      h('header', { class: 'drawer-header' }, title, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fermer', onclick: () => dialog.close() }, icon('close'))),
      actions,
      listTools,
      trashHead,
      list,
      drawerOptions.trash ? trashButton : null,
      note,
    ),
  );

  function showView(next) {
    view = next;
    const trash = view === 'trash';
    title.textContent = trash ? 'Corbeille' : 'Programmes';
    actions.hidden = trash;
    if (listTools) listTools.hidden = trash;
    trashHead.hidden = !trash;
    trashButton.hidden = trash;
    list.setAttribute('aria-label', trash ? 'Programmes supprimés' : 'Programmes enregistrés');
    return render();
  }

  /** Lance une action ; ferme le tiroir si elle a abouti et que `closeOnSuccess` est demandé. */
  async function act(action, closeOnSuccess = false) {
    const done = await action();
    if (done && closeOnSuccess) dialog.close();
    else await render();
  }

  async function render() {
    if (view === 'trash') return renderTrash();
    const programs = await workspace.list();
    const currentId = workspace.current?.id;
    const shown = filterPrograms(programs, { query: tools ? query : '', sort: tools ? sort : 'recent', pins: tools });
    clear(list);
    if (!shown.length) list.append(h('li', { class: 'program-empty' }, `Aucun programme ne contient « ${query.trim()} ».`));
    for (const { program, match } of shown) {
      const isCurrent = program.id === currentId;
      const lines = countLines(program.content);
      list.append(
        h(
          'li',
          { class: `program-item${isCurrent ? ' is-current' : ''}${program.pinned && tools ? ' is-pinned' : ''}`, dataset: { program: program.id } },
          h(
            'button',
            {
              type: 'button',
              class: 'program-open',
              'aria-current': isCurrent ? 'true' : null,
              onclick: () => act(() => switchProgram(workspace, program.id), true),
            },
            h('span', { class: 'program-name' }, program.pinned && tools ? icon('bookmark') : null, program.name),
            h(
              'span',
              { class: 'program-meta' },
              `${lines} ligne${lines > 1 ? 's' : ''} · ${formatRelativeTime(program.updatedAt)}`,
              match === 'content' ? ` · contient « ${query.trim()} »` : '',
            ),
          ),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Actions pour ${program.name}`, onclick: () => showActions(program) }, icon('more')),
        ),
      );
    }
    if (drawerOptions.trash) {
      const count = (await workspace.listTrash()).length;
      trashButton.replaceChildren(icon('trash'), count ? `Corbeille (${count})` : 'Corbeille');
    }
  }

  async function renderTrash() {
    const trashed = await workspace.listTrash();
    clear(list);
    emptyButton.disabled = !trashed.length;
    if (!trashed.length) list.append(h('li', { class: 'program-empty' }, 'La corbeille est vide.'));
    for (const program of trashed) {
      const left = Math.max(0, Math.ceil(drawerOptions.trashDays - (Date.now() - program.deletedAt) / 86400000));
      list.append(
        h(
          'li',
          { class: 'program-item is-trashed', dataset: { program: program.id } },
          h(
            'div',
            { class: 'program-open' },
            h('span', { class: 'program-name' }, program.name),
            h('span', { class: 'program-meta' }, `supprimé ${formatRelativeTime(program.deletedAt)} · effacé dans ${left} jour${left > 1 ? 's' : ''}`),
          ),
          h('button', { type: 'button', class: 'btn btn-small', dataset: { action: 'restore' }, onclick: () => restore(program) }, icon('undo'), 'Restaurer'),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Supprimer définitivement ${program.name}`, dataset: { action: 'purge' }, onclick: () => purge(program) }, icon('close')),
        ),
      );
    }
  }

  async function restore(program) {
    const restored = await workspace.restore(program.id);
    toast(`« ${restored.name} » est revenu dans vos programmes.`, { type: 'success' });
    await render();
  }

  async function purge(program) {
    const ok = await confirmDialog({ title: 'Supprimer définitivement', message: `Effacer « ${program.name} » ? Il ne pourra plus être récupéré.`, confirmLabel: 'Supprimer', danger: true });
    if (ok) await workspace.purge(program.id);
    await render();
  }

  async function emptyTrash() {
    const ok = await confirmDialog({ title: 'Vider la corbeille', message: 'Effacer définitivement tous les programmes de la corbeille ?', confirmLabel: 'Vider la corbeille', danger: true });
    if (!ok) return;
    const count = await workspace.emptyTrash();
    toast(`${count} programme${count > 1 ? 's' : ''} effacé${count > 1 ? 's' : ''} définitivement.`);
    await render();
  }

  async function showActions(program) {
    const choice = await actionSheet({
      title: program.name,
      actions: [
        ...(tools ? [{ label: program.pinned ? 'Désépingler' : 'Épingler en tête de liste', value: 'pin', icon: 'bookmark' }] : []),
        { label: 'Renommer', value: 'rename', icon: 'edit' },
        { label: 'Dupliquer', value: 'duplicate', icon: 'copy' },
        { label: drawerOptions.trash ? 'Mettre à la corbeille' : 'Supprimer', value: 'delete', icon: 'trash', danger: true },
      ],
    });
    if (choice === 'pin') await act(() => workspace.setPinned(program.id, !program.pinned));
    if (choice === 'rename') await act(() => renameProgram(workspace, program));
    if (choice === 'duplicate') await act(() => duplicateProgram(workspace, program));
    if (choice === 'delete') await act(() => deleteProgram(workspace, program, { trash: drawerOptions.trash }));
  }

  const stopListening = bus.on('workspace:list-changed', () => {
    if (dialog.open) render();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    stopListening();
    dialog.remove();
  });

  document.body.append(dialog);
  showView('list').then(() => {
    dialog.showModal();
    list.querySelector('[aria-current="true"]')?.focus();
  });
}
