import { h } from '../../core/dom.js';
import { formatRelativeTime } from '../../core/util.js';
import { diffLines, diffStats, diffHunks } from '../../engine/index.js';
import { icon } from '../../ui/icons.js';

/** Vue unifiée d'une comparaison : lignes ajoutées / supprimées, contexte, plages identiques résumées. */
function renderDiff(oldText, newText, { oldLabel, newLabel }) {
  const ops = diffLines(oldText.split('\n'), newText.split('\n'));
  const { added, removed } = diffStats(ops);
  const rows = diffHunks(ops, 3).map((op) => {
    if (op.type === 'skip') return h('li', { class: 'diff-skip' }, `… ${op.count} ligne${op.count > 1 ? 's' : ''} identique${op.count > 1 ? 's' : ''} …`);
    const sign = op.type === 'insert' ? '+' : op.type === 'delete' ? '−' : ' ';
    return h(
      'li',
      { class: `diff-line is-${op.type}` },
      h('span', { class: 'diff-num' }, op.aLine ?? ''),
      h('span', { class: 'diff-num' }, op.bLine ?? ''),
      h('span', { class: 'diff-sign', 'aria-hidden': 'true' }, sign),
      h('code', null, op.text || ' '),
    );
  });
  return h(
    'div',
    { class: 'diff-view' },
    h(
      'p',
      { class: 'diff-legend' },
      h('span', { class: 'diff-badge is-delete' }, `− ${removed} supprimée${removed > 1 ? 's' : ''}`),
      h('span', { class: 'diff-badge is-insert' }, `+ ${added} ajoutée${added > 1 ? 's' : ''}`),
      h('small', null, `1re colonne : ${oldLabel} · 2e colonne : ${newLabel}`),
    ),
    added || removed ? h('ol', { class: 'diff-list' }, rows) : h('p', { class: 'card-description' }, 'Les deux versions sont identiques.'),
  );
}

/**
 * Versions d'un programme et comparaison : enregistrer une version nommée, comparer une
 * version (ou un autre programme) avec le texte actuel, restaurer une version.
 * Une version automatique est créée à l'ouverture d'un programme modifié depuis la dernière.
 */
export default {
  id: 'versions',
  label: 'Versions et comparaison',
  description: 'Enregistre des versions d’un programme (automatiquement à l’ouverture, ou à la demande), les compare ligne à ligne avec le texte actuel ou un autre programme, et permet de les restaurer.',
  group: 'outils',
  activate(ctx) {
    const { versions, workspace } = ctx;

    ctx.bus.on('workspace:opened', ({ program }) => versions.snapshot(program.id, program.content).catch(() => {}));
    if (workspace.current) versions.snapshot(workspace.current.id, workspace.current.content).catch(() => {});

    async function compare(oldText, labels) {
      await ctx.ui.openDialog({ title: 'Comparaison', body: renderDiff(oldText, workspace.text, labels), className: 'dialog-wide dialog-tall', actions: [{ label: 'Fermer' }] });
    }

    async function restore(version) {
      const ok = await ctx.ui.confirm({
        title: 'Restaurer cette version',
        message: 'Le texte actuel sera remplacé par cette version (le texte actuel est d’abord enregistré comme version, et Ctrl+Z annule la restauration).',
        confirmLabel: 'Restaurer',
      });
      if (!ok) return false;
      await versions.create(workspace.current.id, workspace.text, { label: 'Avant restauration', auto: true });
      const view = ctx.editor.view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: version.content }, userEvent: 'restore' });
      ctx.ui.toast('Version restaurée.', { type: 'success' });
      return true;
    }

    async function openManager() {
      const program = workspace.current;
      if (!program) return;
      const list = h('ul', { class: 'version-list' });
      const otherSelect = h('select', { class: 'input', 'aria-label': 'Autre programme' });

      const fill = async () => {
        const items = await versions.list(program.id);
        const current = workspace.text;
        list.replaceChildren(
          ...(items.length
            ? items.map((version) => {
                const { added, removed } = diffStats(diffLines(version.content.split('\n'), current.split('\n')));
                const same = !added && !removed;
                return h(
                  'li',
                  { class: 'version-item', dataset: { version: version.id } },
                  h(
                    'div',
                    { class: 'version-text' },
                    h('span', { class: 'version-name' }, version.label || 'Version', version.auto ? h('span', { class: 'badge' }, 'auto') : null),
                    h('small', null, `${formatRelativeTime(version.createdAt)} · ${same ? 'identique au texte actuel' : `+${added} / −${removed} lignes par rapport au texte actuel`}`),
                  ),
                  h(
                    'div',
                    { class: 'version-actions' },
                    h('button', { type: 'button', class: 'btn btn-small', disabled: same, onclick: () => compare(version.content, { oldLabel: version.label || 'version', newLabel: 'texte actuel' }) }, 'Comparer'),
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'btn btn-small',
                        disabled: same,
                        onclick: async () => {
                          if (await restore(version)) dialog?.close('');
                        },
                      },
                      'Restaurer',
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'icon-btn',
                        'aria-label': 'Supprimer cette version',
                        onclick: async () => {
                          await versions.remove(version.id);
                          fill();
                        },
                      },
                      icon('trash'),
                    ),
                  ),
                );
              })
            : [h('li', { class: 'card-description' }, 'Aucune version enregistrée pour ce programme.')]),
        );
        const others = (await workspace.list()).filter((p) => p.id !== program.id);
        otherSelect.replaceChildren(...others.map((p) => h('option', { value: p.id }, p.name)));
        otherSelect.disabled = !others.length;
      };

      let dialog = null;
      const body = h(
        'div',
        { class: 'code-editor' },
        h(
          'div',
          { class: 'button-row' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-primary',
              onclick: async () => {
                const label = await ctx.ui.prompt({ title: 'Enregistrer une version', label: 'Nom de la version', value: `Version du ${new Date().toLocaleDateString('fr-FR')}`, confirmLabel: 'Enregistrer' });
                if (label == null) return;
                await versions.create(program.id, workspace.text, { label });
                ctx.ui.toast('Version enregistrée.', { type: 'success' });
                fill();
              },
            },
            icon('plus'),
            'Enregistrer une version',
          ),
        ),
        h('h3', { class: 'var-heading' }, `Versions de « ${program.name} »`),
        list,
        h('h3', { class: 'var-heading' }, 'Comparer avec un autre programme'),
        h(
          'div',
          { class: 'range-form' },
          otherSelect,
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: async () => {
                const other = (await workspace.list()).find((p) => p.id === otherSelect.value);
                if (other) compare(other.content, { oldLabel: other.name, newLabel: program.name });
              },
            },
            'Comparer',
          ),
        ),
      );
      fill();
      await ctx.ui.openDialog({
        title: 'Versions et comparaison',
        body,
        className: 'dialog-wide',
        actions: [{ label: 'Fermer' }],
        onOpen: (element) => (dialog = element),
      });
    }

    ctx.ui.toolbar.add({ id: 'versions', icon: 'history', label: 'Versions et comparaison', title: 'Enregistrer, comparer, restaurer des versions', order: 75, menu: true, onClick: openManager });
  },
};
