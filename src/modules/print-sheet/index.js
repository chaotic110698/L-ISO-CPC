import { h } from '../../core/dom.js';
import { highlightCode } from '../../ui/code-view.js';
import { buildSheet } from './sheet.js';

const PARTS = [
  { key: 'tools', label: 'Liste des outils (avec l’opération de chacun)' },
  { key: 'variables', label: 'Variables de macro (noms et descriptions personnels)' },
  { key: 'sections', label: 'Plan (sections du programme)' },
  { key: 'program', label: 'Programme complet' },
  { key: 'numbers', label: 'Numéros de ligne' },
  { key: 'colors', label: 'Couleurs (sinon noir et blanc)' },
  { key: 'notes', label: 'Cadre « Notes et réglages » à remplir à la main' },
];
const DEFAULTS = { tools: true, variables: true, sections: true, program: true, numbers: true, colors: false, notes: true };

const table = (head, rows) =>
  h('table', { class: 'sheet-table' }, h('thead', null, h('tr', null, head.map((cell) => h('th', null, cell)))), h('tbody', null, rows.map((row) => h('tr', null, row.map((cell) => h('td', null, cell))))));

/** Fiche à poser à côté de la machine : en-tête, outils, variables, plan, programme, notes. */
function renderSheet(ctx, options) {
  const doc = ctx.editor.view.state.doc;
  const sheet = buildSheet(doc.iterLines(), ctx.codes, (index) => ctx.macros.name(index));
  const name = ctx.workspace.current?.name ?? 'Programme';
  const profiles = ctx.profiles.enabledProfiles().map((p) => p.name).join(', ');
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const section = (title, ...content) => h('section', { class: 'sheet-section' }, h('h2', null, title), ...content);

  return h(
    'div',
    { class: `print-sheet${options.colors ? ' is-color' : ''}` },
    h(
      'header',
      { class: 'sheet-header' },
      h('h1', null, name),
      h(
        'p',
        null,
        [sheet.programs.map((p) => `${p.number}${p.comment ? ` (${p.comment})` : ''}`).join(' · '), `${sheet.lines.length} lignes`, `profils : ${profiles}`, `imprimé le ${date}`].filter(Boolean).join(' — '),
      ),
    ),
    options.tools
      ? section('Outils', sheet.tools.length ? table(['Outil', 'Opération', 'Commentaire', 'Ligne'], sheet.tools.map((t) => [t.word, t.operation, t.comment, String(t.line)])) : h('p', null, 'Aucun changement d’outil.'))
      : null,
    options.variables
      ? section(
          'Variables',
          sheet.variables.length
            ? table(['Variable', 'Nom', 'Description', 'Affectée', 'Utilisations'], sheet.variables.map((v) => [v.name, v.label, v.description, v.assignments.join(', ') || 'jamais ici', String(v.uses)]))
            : h('p', null, 'Aucune variable #….'),
        )
      : null,
    options.sections && sheet.sections.length ? section('Plan', h('ol', { class: 'sheet-plan' }, sheet.sections.map((s) => h('li', null, `${s.label} — ligne ${s.line}`)))) : null,
    options.notes ? section('Notes et réglages', h('div', { class: 'sheet-notes' })) : null,
    options.program
      ? section(
          'Programme',
          h(
            'ol',
            { class: `sheet-program${options.numbers ? '' : ' no-numbers'}` },
            sheet.lines.map((text) => h('li', null, highlightCode(text, ctx.codes))),
          ),
        )
      : null,
    h('footer', { class: 'sheet-footer' }, 'Fiche générée par L-ISO-CPC — vérifiez toujours le programme sur la machine avant usinage.'),
  );
}

/**
 * Fiche à imprimer ou à enregistrer en PDF (impression du navigateur, « Enregistrer au format
 * PDF ») : le programme avec ses commentaires, la liste des outils et les variables nommées.
 */
export default {
  id: 'printSheet',
  label: 'Fiche à imprimer / PDF',
  description: 'Fiche à poser à côté de la machine : en-tête, outils avec leur opération, variables nommées, plan, cadre de notes et programme complet. Impression ou PDF par le navigateur.',
  group: 'fichiers',
  where: 'Menu Outils › Fiche à imprimer / PDF',
  activate(ctx) {
    async function open() {
      const options = { ...DEFAULTS, ...(ctx.kv.get('printSheet.options', null) ?? {}) };
      const checks = PARTS.map((part) => {
        const input = h('input', { type: 'checkbox', name: part.key, checked: Boolean(options[part.key]) });
        return { part, input, element: h('label', { class: 'check' }, input, h('span', null, part.label)) };
      });
      const choice = await ctx.ui.openDialog({
        title: 'Fiche à imprimer / PDF',
        body: h(
          'div',
          { class: 'sheet-options' },
          h('p', { class: 'card-description' }, 'Choisissez le contenu. La fenêtre d’impression du navigateur permet aussi d’enregistrer la fiche en PDF (destination « Enregistrer au format PDF »).'),
          checks.map((c) => c.element),
        ),
        actions: [{ label: 'Imprimer / PDF', value: 'print', primary: true }, { label: 'Annuler' }],
      });
      if (choice !== 'print') return;
      for (const { part, input } of checks) options[part.key] = input.checked;
      ctx.kv.set('printSheet.options', options);

      document.querySelector('.print-sheet')?.remove();
      const sheet = renderSheet(ctx, options);
      document.body.append(sheet);
      document.documentElement.classList.add('is-printing');
      const done = () => {
        document.documentElement.classList.remove('is-printing');
        sheet.remove();
      };
      window.addEventListener('afterprint', done, { once: true });
      window.print();
    }

    ctx.ui.toolbar.add({ id: 'print-sheet', icon: 'file', label: 'Fiche à imprimer / PDF', title: 'Programme, outils et variables sur une fiche à imprimer ou en PDF', order: 92, menu: true, onClick: open });
    ctx.onDispose(() => document.querySelector('.print-sheet')?.remove());
  },
};
