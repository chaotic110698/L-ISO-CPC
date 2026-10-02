import { EditorView } from '@codemirror/view';
import { h } from '../../core/dom.js';
import { debounce } from '../../core/util.js';
import { analyzeMacros, variableWarnings } from '../../engine/macros.js';
import { formatRanges } from '../../engine/macro-ranges.js';
import { icon } from '../../ui/icons.js';
import { variableFields, commentText } from './macro-dialogs.js';

/** Sélectionne une occurrence { line, from, to } dans l'éditeur et la fait défiler au centre. */
function revealOccurrence(view, occurrence) {
  const line = view.state.doc.line(occurrence.line);
  view.dispatch({
    selection: { anchor: line.from + occurrence.from, head: line.from + occurrence.to },
    effects: EditorView.scrollIntoView(line.from + occurrence.from, { y: 'center' }),
  });
  view.focus();
}

/** Ligne après laquelle insérer une affectation : celle du numéro de programme O…, sinon après « % ». */
function assignmentInsertLine(doc) {
  let afterPercent = 0;
  for (let n = 1; n <= Math.min(doc.lines, 50); n++) {
    const text = doc.line(n).text.trim();
    if (/^O\d+|^:\d+/i.test(text)) return n;
    if (text === '%' && afterPercent === 0) afterPercent = n;
  }
  return afterPercent;
}

export default {
  id: 'variables',
  label: 'Tableau des variables',
  description:
    'Panneau listant les macros du programme (nom et description personnels, utilisations, affectations, avertissements) et les valeurs répétées (X, Z, F…), transformables en macro en un clic.',
  group: 'analyse',
  where: 'Panneau « Variables » (barre d’outils)',
  activate(ctx) {
    const { macros } = ctx;

    ctx.ui.panels.add({
      id: 'variables',
      title: 'Variables',
      icon: 'variable',
      order: 60,
      render(container) {
        const cursors = new Map(); // dernière occurrence montrée, par clé
        const view = ctx.editor.view;

        const goTo = (key, occurrences) => {
          const next = ((cursors.get(key) ?? -1) + 1) % occurrences.length;
          cursors.set(key, next);
          revealOccurrence(view, occurrences[next]);
        };

        const context = (analysis) => {
          const { profile, ranges } = macros.ranges();
          return { ranges, rangesLabel: profile?.name, usedHere: analysis.used, elsewhere: macros.assignedElsewhere(), macros };
        };

        async function editName(variable) {
          const current = macros.name(variable.index);
          const fields = variableFields({ index: variable.index, name: current?.name, description: current?.description, context: context({ used: new Set() }), lockNumber: true });
          const choice = await ctx.ui.openDialog({
            title: `Nommer ${variable.name}`,
            body: fields.element,
            actions: [{ label: 'Enregistrer', value: 'ok', primary: true }, { label: 'Annuler' }],
            onOpen: fields.focus,
          });
          if (choice === 'ok') await macros.setName(variable.index, fields.read());
        }

        async function newVariable() {
          const analysis = analyzeMacros(view.state.doc.iterLines());
          const ctxInfo = context(analysis);
          const fields = variableFields({ index: macros.nextFree(analysis.used), context: ctxInfo });
          const value = h('input', { class: 'input mono', autocomplete: 'off', placeholder: '25.' });
          fields.extra(h('div', { class: 'field' }, h('label', null, 'Valeur (facultatif)', value)));
          const choice = await ctx.ui.openDialog({
            title: 'Nouvelle variable',
            body: fields.element,
            actions: [{ label: 'Insérer', value: 'ok', primary: true }, { label: 'Annuler' }],
            validate: () => (Number.isInteger(fields.read().index) && fields.read().index > 0 ? null : 'Numéro de variable invalide.'),
            onOpen: fields.focus,
          });
          if (choice !== 'ok') return;
          const { index, name, description } = fields.read();
          if (name || description) await macros.setName(index, { name, description });
          const head = `#${index} = ${value.value.trim()}`;
          const text = `${head}${name ? ` (${commentText(name)})` : ''}`;
          const line = view.state.doc.lineAt(view.state.selection.main.head);
          const insert = line.text.trim() ? `\n${text}` : text;
          const at = line.text.trim() ? line.to : line.from;
          const cursor = at + (line.text.trim() ? 1 : 0) + head.length;
          view.dispatch({ changes: { from: at, to: line.text.trim() ? at : line.to, insert }, selection: { anchor: cursor }, scrollIntoView: true });
          view.focus();
        }

        async function toMacro(entry) {
          const analysis = analyzeMacros(view.state.doc.iterLines());
          const fields = variableFields({ index: macros.nextFree(analysis.used), context: context(analysis) });
          const replace = h('input', { type: 'checkbox', checked: true });
          fields.extra(h('label', { class: 'check' }, replace, h('span', null, `Remplacer les ${entry.count} occurrences de ${entry.label} par la variable`)));
          const choice = await ctx.ui.openDialog({
            title: `Créer une macro pour ${entry.label}`,
            body: fields.element,
            actions: [{ label: 'Créer', value: 'ok', primary: true }, { label: 'Annuler' }],
            validate: () => (Number.isInteger(fields.read().index) && fields.read().index > 0 ? null : 'Numéro de variable invalide.'),
            onOpen: fields.focus,
          });
          if (choice !== 'ok') return;
          const { index, name, description } = fields.read();
          if (name || description) await macros.setName(index, { name, description });

          const doc = view.state.doc;
          const changes = [];
          if (replace.checked) {
            for (const occ of entry.occurrences) {
              const line = doc.line(occ.line);
              changes.push({ from: line.from + occ.valueFrom, to: line.from + occ.to, insert: `#${index}` });
            }
          }
          const after = assignmentInsertLine(doc);
          const assignment = `#${index} = ${entry.valueText}${name ? ` (${commentText(name)})` : ''}`;
          if (after === 0) changes.push({ from: 0, insert: `${assignment}\n` });
          else changes.push({ from: doc.line(after).to, insert: `\n${assignment}` });
          view.dispatch({ changes, scrollIntoView: true });
          ctx.ui.toast(`${entry.label} → #${index}${replace.checked ? ` (${entry.count} occurrences remplacées)` : ''}.`, { type: 'success' });
        }

        function render() {
          const analysis = analyzeMacros(view.state.doc.iterLines());
          const info = context(analysis);
          const next = macros.nextFree(analysis.used);
          const warnOn = macros.warningsEnabled;

          const variableRows = analysis.variables.map((variable) => {
            const named = macros.name(variable.index);
            const warnings = warnOn ? variableWarnings(variable, info) : [];
            return h(
              'li',
              { class: `var-row${warnings.length ? ' has-warning' : ''}`, dataset: { variable: String(variable.index) } },
              h('button', { type: 'button', class: 'var-key tok-macro', title: 'Aller à l’occurrence suivante', onclick: () => goTo(variable.name, variable.uses) }, variable.name),
              h(
                'div',
                { class: 'var-text' },
                h(
                  'button',
                  { type: 'button', class: `var-name${named?.name ? '' : ' is-empty'}`, onclick: () => editName(variable) },
                  named?.name || 'Nommer…',
                  icon('edit'),
                ),
                named?.description ? h('small', null, named.description) : null,
                h(
                  'small',
                  null,
                  `${variable.uses.length} utilisation${variable.uses.length > 1 ? 's' : ''}`,
                  variable.assignments.length ? ` · affectée ${variable.assignments.map((a) => `l.${a.line}${a.expression ? ` = ${a.expression}` : ''}`).join(', ')}` : ' · jamais affectée ici',
                ),
                warnings.map((w) => h('small', { class: 'var-warning' }, icon('warning'), w.message)),
              ),
            );
          });

          const repeatedRows = analysis.repeated.map((entry) =>
            h(
              'li',
              { class: 'var-row', dataset: { repeated: entry.label } },
              h('button', { type: 'button', class: 'var-key tok-address', title: 'Aller à l’occurrence suivante', onclick: () => goTo(entry.key, entry.occurrences) }, entry.label),
              h('div', { class: 'var-text' }, h('span', null, `× ${entry.count}`), h('small', null, `lignes ${[...new Set(entry.occurrences.map((o) => o.line))].join(', ')}`)),
              h('button', { type: 'button', class: 'btn btn-small', onclick: () => toMacro(entry) }, '→ macro'),
            ),
          );

          container.replaceChildren(
            h(
              'div',
              { class: 'var-summary' },
              h('p', null, 'Plages libres : ', h('strong', null, formatRanges(info.ranges)), info.rangesLabel ? ` (${info.rangesLabel})` : ''),
              h('p', null, 'Prochaine libre : ', h('strong', { class: 'mono' }, next != null ? `#${next}` : info.ranges.length ? 'plage pleine' : '—')),
              h('button', { type: 'button', class: 'btn btn-small btn-primary', onclick: newVariable }, icon('plus'), 'Nouvelle variable'),
            ),
            h('h3', { class: 'var-heading' }, `Macros du programme (${analysis.variables.length})`),
            variableRows.length ? h('ul', { class: 'var-list' }, variableRows) : h('p', { class: 'var-empty' }, 'Aucune variable #… dans ce programme.'),
            h('h3', { class: 'var-heading' }, `Valeurs répétées (${analysis.repeated.length})`),
            repeatedRows.length ? h('ul', { class: 'var-list' }, repeatedRows) : h('p', { class: 'var-empty' }, 'Aucune valeur répétée.'),
          );
        }

        const refresh = debounce(render, 250);
        const offs = [
          ctx.editor.onUpdate((update) => update.docChanged && refresh()),
          ctx.editor.onDocReplaced(render),
          ctx.bus.on('macros:changed', render),
        ];
        macros.refreshOthers();
        render();
        return {
          dispose() {
            refresh.cancel();
            offs.forEach((off) => off());
          },
        };
      },
    });
  },
};
