import { StateEffect } from '@codemirror/state';
import { linter, lintGutter, openLintPanel } from '@codemirror/lint';
import { checkProgram, CHECKER_RULES } from '../../engine/index.js';

/** Relance l'analyse sans modification du texte (règles ou profil changés). */
const relintEffect = StateEffect.define();

/**
 * Vérificateur de syntaxe : erreurs et avertissements soulignés dans l'éditeur, signalés dans
 * la marge, détaillés au survol et dans la liste (clic sur le résumé de la barre d'état ou
 * Ctrl+Maj+M). Chaque règle s'active ou se désactive dans Paramètres.
 */
export default {
  id: 'checker',
  label: 'Vérificateur de syntaxe',
  description:
    'Signale parenthèses non fermées, codes incompatibles sur une même ligne, M30 manquant, G40 oublié, avance non définie, blocs P/Q introuvables, cotes sans point décimal…',
  group: 'analyse',
  settings: CHECKER_RULES.map((rule) => ({ key: `checker.${rule.id}`, type: 'boolean', label: rule.label, default: true })),
  activate(ctx) {
    const status = ctx.ui.statusbar.add({ id: 'checker', order: 25 });
    status.element.classList.add('is-clickable');
    status.element.setAttribute('role', 'button');
    status.element.tabIndex = 0;
    const openList = () => openLintPanel(ctx.editor.view);
    ctx.listen(status.element, 'click', openList);
    ctx.listen(status.element, 'keydown', (e) => (e.key === 'Enter' || e.key === ' ') && openList());

    const showSummary = (diagnostics) => {
      const errors = diagnostics.filter((d) => d.severity === 'error').length;
      const warnings = diagnostics.length - errors;
      const parts = [];
      if (errors) parts.push(`${errors} erreur${errors > 1 ? 's' : ''}`);
      if (warnings) parts.push(`${warnings} avertissement${warnings > 1 ? 's' : ''}`);
      status.set(parts.length ? `✕ ${parts.join(' · ')}` : '✓ Aucune erreur', {
        tone: errors ? 'error' : warnings ? 'warning' : 'ok',
        title: 'Afficher la liste des diagnostics',
      });
    };

    const source = (view) => {
      const rules = Object.fromEntries(CHECKER_RULES.map((rule) => [rule.id, ctx.settings.get(`checker.${rule.id}`)]));
      const found = checkProgram(view.state.doc.iterLines(), ctx.codes, { rules });
      showSummary(found);
      return found.map((d) => {
        const line = view.state.doc.line(d.line);
        return {
          from: Math.min(line.from + d.from, line.to),
          to: Math.min(line.from + d.to, line.to),
          severity: d.severity,
          message: d.message,
          source: 'Vérificateur',
        };
      });
    };

    ctx.editor.addExtension([
      linter(source, {
        delay: 400,
        needsRefresh: (update) => update.transactions.some((tr) => tr.effects.some((e) => e.is(relintEffect))),
      }),
      lintGutter(),
    ]);
    const relint = () => ctx.editor.view.dispatch({ effects: relintEffect.of(null) });
    ctx.onDispose(ctx.codes.onChange(relint));
    for (const rule of CHECKER_RULES) ctx.settings.subscribe(`checker.${rule.id}`, relint);
  },
};
