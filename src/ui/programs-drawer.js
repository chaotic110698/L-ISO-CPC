import { h, clear } from '../core/dom.js';
import { formatRelativeTime, countLines } from '../core/util.js';
import { icon } from './icons.js';
import { actionSheet } from './dialogs.js';
import {
  switchProgram,
  newProgram,
  openProgramFile,
  renameProgram,
  duplicateProgram,
  deleteProgram,
} from './program-actions.js';

/** Tiroir latéral listant les programmes enregistrés dans le navigateur. */
export function openProgramsDrawer({ workspace, bus }) {
  const list = h('ul', { class: 'program-list', 'aria-label': 'Programmes enregistrés' });

  const dialog = h(
    'dialog',
    { class: 'drawer', 'aria-label': 'Programmes' },
    h(
      'div',
      { class: 'drawer-inner' },
      h(
        'header',
        { class: 'drawer-header' },
        h('h2', null, 'Programmes'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fermer', onclick: () => dialog.close() }, icon('close')),
      ),
      h(
        'div',
        { class: 'drawer-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => act(() => newProgram(workspace), true) }, icon('plus'), 'Nouveau'),
        h('button', { type: 'button', class: 'btn', onclick: () => act(() => openProgramFile(workspace), true) }, icon('folder'), 'Ouvrir un fichier'),
      ),
      list,
      h(
        'p',
        { class: 'drawer-note' },
        'Les programmes sont enregistrés dans ce navigateur, sur cet appareil. Pensez à exporter régulièrement une sauvegarde (Paramètres › Données).',
      ),
    ),
  );

  /** Lance une action ; ferme le tiroir si elle a abouti et que `closeOnSuccess` est demandé. */
  async function act(action, closeOnSuccess = false) {
    const done = await action();
    if (done && closeOnSuccess) dialog.close();
    else await render();
  }

  async function render() {
    const programs = await workspace.list();
    const currentId = workspace.current?.id;
    clear(list);
    for (const program of programs) {
      const isCurrent = program.id === currentId;
      const lines = countLines(program.content);
      list.append(
        h(
          'li',
          { class: `program-item${isCurrent ? ' is-current' : ''}` },
          h(
            'button',
            {
              type: 'button',
              class: 'program-open',
              'aria-current': isCurrent ? 'true' : null,
              onclick: () => act(() => switchProgram(workspace, program.id), true),
            },
            h('span', { class: 'program-name' }, program.name),
            h('span', { class: 'program-meta' }, `${lines} ligne${lines > 1 ? 's' : ''} · ${formatRelativeTime(program.updatedAt)}`),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'icon-btn',
              'aria-label': `Actions pour ${program.name}`,
              onclick: () => showActions(program),
            },
            icon('more'),
          ),
        ),
      );
    }
  }

  async function showActions(program) {
    const choice = await actionSheet({
      title: program.name,
      actions: [
        { label: 'Renommer', value: 'rename', icon: 'edit' },
        { label: 'Dupliquer', value: 'duplicate', icon: 'copy' },
        { label: 'Supprimer', value: 'delete', icon: 'trash', danger: true },
      ],
    });
    if (choice === 'rename') await act(() => renameProgram(workspace, program));
    if (choice === 'duplicate') await act(() => duplicateProgram(workspace, program));
    if (choice === 'delete') await act(() => deleteProgram(workspace, program));
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
  render().then(() => {
    dialog.showModal();
    list.querySelector('[aria-current="true"]')?.focus();
  });
}
