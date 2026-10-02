import { EditorView, showTooltip, keymap } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import { parseLine, tokenAt, explainToken } from '../../engine/index.js';
import { analyzeMacros, variableWarnings } from '../../engine/macros.js';
import { renderExplanation } from '../../ui/editor/definition-view.js';

const setDefinition = StateEffect.define();

/** Affectations d'une variable #index dans tout le document : [{ line, text }]. */
function assignmentsIn(doc) {
  return (index) => {
    const found = [];
    let number = 0;
    for (const text of doc.iterLines()) {
      number++;
      if (parseLine(text).block.variables.some((v) => v.assigned && v.index === index)) found.push({ line: number, text });
    }
    return found;
  };
}

/** Nom personnel, description et avertissements d'une variable (service des macros). */
function variableInfoIn(doc, macros) {
  return (index) => {
    if (!macros) return {};
    const named = macros.name(index);
    let warnings = [];
    if (macros.warningsEnabled) {
      const variable = analyzeMacros(doc.iterLines()).variables.find((v) => v.index === index);
      const { profile, ranges } = macros.ranges();
      if (variable) warnings = variableWarnings(variable, { ranges, rangesLabel: profile?.name, elsewhere: macros.assignedElsewhere() }).map((w) => w.message);
    }
    return { name: named?.name, description: named?.description, warnings };
  };
}

/** Explication du jeton situé à la position `pos`, ou null. */
function explainAt(state, pos, dictionary, macros) {
  const line = state.doc.lineAt(pos);
  const { tokens, block } = parseLine(line.text);
  const token = tokenAt(tokens, pos - line.from);
  const explanation = explainToken(token, { block, dictionary, findAssignments: assignmentsIn(state.doc), variableInfo: variableInfoIn(state.doc, macros) });
  return explanation && { pos: line.from + token.from, end: line.from + token.to, explanation };
}

function definitionsExtension(dictionary, editCode, macros) {
  const field = StateField.define({
    create: () => null,
    update(value, tr) {
      for (const effect of tr.effects) if (effect.is(setDefinition)) return effect.value;
      if (!value) return value;
      // Saisie, ou curseur déplacé hors de l'élément expliqué : l'infobulle se referme.
      if (tr.docChanged) return null;
      if (tr.selection) {
        const { head, empty } = tr.newSelection.main;
        if (!empty || head < value.pos || head > value.end) return null;
      }
      return value;
    },
    provide: (f) =>
      showTooltip.from(f, (value) =>
        value
          ? {
              pos: value.pos,
              end: value.end,
              above: false,
              create: (view) => ({
                dom: renderExplanation(value.explanation, {
                  onClose: () => {
                    view.dispatch({ effects: setDefinition.of(null) });
                    view.focus();
                  },
                  onEditCode: editCode
                    ? (key) => {
                        view.dispatch({ effects: setDefinition.of(null) });
                        editCode(key);
                      }
                    : null,
                }),
              }),
            }
          : null,
      ),
  });

  let pressed = null;
  const open = (view, pos) => {
    const found = pos == null ? null : explainAt(view.state, pos, dictionary, macros);
    view.dispatch({ effects: setDefinition.of(found) });
    return Boolean(found);
  };

  return [
    field,
    EditorView.domEventHandlers({
      // Clic ou tap simple sur un élément : appui puis relâchement au même endroit.
      // (L'événement « click » n'est pas fiable ici : les décorations redessinées pendant
      // le clic remplacent l'élément visé, et le navigateur ne l'émet alors pas.)
      mousedown(event) {
        pressed = { x: event.clientX, y: event.clientY, detail: event.detail };
        return false;
      },
      mouseup(event, view) {
        const start = pressed;
        pressed = null;
        if (!start || start.detail > 1 || event.button !== 0) return false;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return false;
        const coords = { x: event.clientX, y: event.clientY };
        // Après le traitement de la sélection par CodeMirror.
        setTimeout(() => {
          if (view.state.selection.main.empty) open(view, view.posAtCoords(coords));
        }, 0);
        return false;
      },
    }),
    keymap.of([
      { key: 'F1', run: (view) => open(view, view.state.selection.main.head) || true },
      { key: 'Mod-i', run: (view) => open(view, view.state.selection.main.head) || true },
      {
        key: 'Escape',
        run: (view) => {
          if (!view.state.field(field)) return false;
          view.dispatch({ effects: setDefinition.of(null) });
          return true;
        },
      },
    ]),
  ];
}

export default {
  id: 'definitions',
  label: 'Définitions au clic / tap',
  description:
    'Un clic (ou un tap) sur un code, une adresse ou une macro affiche sa définition, selon le profil machine actif : paramètres du bloc, codes redéfinis, exemples. Au clavier : F1 ou Ctrl+I sur l’élément sous le curseur.',
  group: 'editeur',
  activate(ctx) {
    ctx.editor.addExtension(definitionsExtension(ctx.codes, ctx.ui.editCode, ctx.macros));
    // Dictionnaire modifié (changement de profil) : on referme une éventuelle infobulle périmée.
    ctx.onDispose(ctx.codes.onChange(() => ctx.editor.view.dispatch({ effects: setDefinition.of(null) })));
  },
};
