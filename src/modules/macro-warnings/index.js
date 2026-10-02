import { ViewPlugin, Decoration } from '@codemirror/view';
import { RangeSetBuilder, StateEffect } from '@codemirror/state';
import { analyzeMacros, variableWarnings } from '../../engine/macros.js';

const refresh = StateEffect.define();
const warningMark = Decoration.mark({ class: 'cm-macro-warning' });

/**
 * Souligne (en orange, sans jamais bloquer) les affectations de macros qui posent question :
 * hors des plages libres du profil, ou également affectées dans un autre programme.
 * Le détail s'affiche dans l'infobulle de la variable et dans le tableau des variables.
 */
function warningsPlugin(macros, onCount) {
  const build = (view) => {
    const analysis = analyzeMacros(view.state.doc.iterLines());
    const { profile, ranges } = macros.ranges();
    const context = { ranges, rangesLabel: profile?.name, elsewhere: macros.assignedElsewhere() };
    const marks = [];
    let count = 0;
    for (const variable of analysis.variables) {
      const warnings = variableWarnings(variable, context);
      if (!warnings.length) continue;
      count += warnings.length;
      for (const assignment of variable.assignments) {
        const use = variable.uses.find((u) => u.line === assignment.line);
        const line = view.state.doc.line(assignment.line);
        marks.push([line.from + use.from, line.from + use.to]);
      }
    }
    onCount(count);
    const builder = new RangeSetBuilder();
    for (const [from, to] of marks.sort((a, b) => a[0] - b[0])) builder.add(from, to, warningMark);
    return builder.finish();
  };

  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = build(view);
      }
      update(update) {
        if (update.docChanged || update.transactions.some((tr) => tr.effects.some((e) => e.is(refresh)))) {
          this.decorations = build(update.view);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

export default {
  id: 'macroWarnings',
  label: 'Avertissements de macros',
  description:
    'Signale, sans jamais bloquer, une macro affectée hors des plages libres du profil machine ou déjà affectée dans un autre programme (double utilisation).',
  group: 'analyse',
  where: 'Soulignement orange, barre d’état, panneau « Variables »',
  activate(ctx) {
    const { macros } = ctx;
    macros.warningsEnabled = true;
    ctx.onDispose(() => {
      macros.warningsEnabled = false;
      ctx.bus.emit('macros:changed');
    });
    const status = ctx.ui.statusbar.add({ id: 'macro-warnings', order: 30 });
    const showCount = (count) =>
      status.set(count ? `⚠ ${count} avertissement${count > 1 ? 's' : ''} de macros` : '', { tone: count ? 'warning' : '', title: 'Détail dans le tableau des variables et l’infobulle de la variable' });
    ctx.editor.addExtension(warningsPlugin(macros, showCount));
    ctx.bus.on('macros:changed', () => ctx.editor.view.dispatch({ effects: refresh.of(null) }));
    macros.refreshOthers();
    ctx.bus.emit('macros:changed');
  },
};
