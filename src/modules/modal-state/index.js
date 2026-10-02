import { h } from '../../core/dom.js';
import { debounce } from '../../core/util.js';
import { modalStateAt } from '../../engine/index.js';
import { MODAL_GROUPS, M_STATES } from '../../data/modal-groups.js';

const FEED_UNITS = { G99: 'mm/tr', G95: 'mm/tr', G98: 'mm/min', G94: 'mm/min' };
const SPEED_UNITS = { G96: 'm/min', G97: 'tr/min' };
// Valeurs écrites comme dans un programme ISO (S1200, F0.15), pas à la française.
const format = (n) => (n == null ? '—' : String(Number(n.toFixed(4))));

/** Résumé court : « G01 · G99 · G96 S220 · G42 · T0202 · M03 ». */
function summary(state) {
  const g = state.groups;
  const parts = [g.motion, g.distance, g.feedMode, g.spindleMode ? `${g.spindleMode}${state.speed != null ? ` S${format(state.speed)}` : ''}` : null, g.cutterComp, state.tool?.word, state.spindle];
  return parts.filter(Boolean).join(' · ');
}

/**
 * État modal à la ligne du curseur : codes actifs de chaque groupe (déplacement, cotation,
 * unité d'avance, vitesse de broche, correction de rayon…), outil, broche, arrosage, F et S.
 */
export default {
  id: 'modalState',
  label: 'État modal à la ligne du curseur',
  description: 'Résumé dans la barre d’état (G01 · G99 · G96 S220 · G42 · T0202…) et panneau détaillé : codes actifs, outil, broche, arrosage, avance et vitesse.',
  group: 'analyse',
  where: 'Barre d’état et panneau « État modal »',
  settings: [{ key: 'modalState.statusbar', type: 'boolean', label: 'Résumé dans la barre d’état', default: true }],
  activate(ctx) {
    const { editor, codes } = ctx;
    const status = ctx.ui.statusbar.add({ id: 'modal-state', order: 15, title: 'État modal à la ligne du curseur' });
    const listeners = new Set();

    const compute = () => {
      const state = modalStateAt(editor.state.doc.iterLines(), editor.cursor.line, codes);
      status.set(ctx.settings.get('modalState.statusbar') ? summary(state) : '');
      for (const listener of listeners) listener(state);
    };
    const refresh = debounce(compute, 120);
    editor.onUpdate((update) => (update.docChanged || update.selectionSet) && refresh());
    editor.onDocReplaced(compute);
    ctx.settings.subscribe('modalState.statusbar', compute);
    ctx.onDispose(codes.onChange(compute));
    ctx.onDispose(() => refresh.cancel());

    ctx.ui.panels.add({
      id: 'modal',
      title: 'État modal',
      icon: 'layers',
      order: 61,
      render(container) {
        const render = (state) => {
          const row = (label, value, detail) =>
            h('div', { class: 'modal-row' }, h('dt', null, label), h('dd', null, h('code', null, value ?? '—'), detail ? h('small', null, detail) : null));
          const groupRows = MODAL_GROUPS.filter((group) => state.groups[group.id] || ['motion', 'feedMode', 'spindleMode', 'cutterComp'].includes(group.id)).map((group) => {
            const code = state.groups[group.id];
            return row(group.label, code, code ? codes.lookup(code)?.name : 'non programmé (état machine à la mise sous tension)');
          });
          const feedUnit = FEED_UNITS[state.groups.feedMode] ?? '';
          const speedUnit = SPEED_UNITS[state.groups.spindleMode] ?? '';
          container.replaceChildren(
            h('p', { class: 'var-summary' }, `Après la ligne ${state.line}${state.program != null ? ` · programme O${state.program}` : ''}`),
            h(
              'dl',
              { class: 'modal-list' },
              groupRows,
              row('Outil', state.tool?.word, state.tool ? `outil ${String(state.tool.number).padStart(2, '0')}${state.tool.offset != null ? ` · correcteur ${String(state.tool.offset).padStart(2, '0')}` : ''}` : null),
              ...Object.entries(M_STATES).map(([key, info]) => row(info.label, state[key], state[key] ? info.codes[state[key]] : null)),
              row('Avance F', state.feed != null ? `F${format(state.feed)}` : null, feedUnit),
              row('Vitesse S', state.speed != null ? `S${format(state.speed)}` : null, speedUnit),
              state.maxSpeed != null ? row('Vitesse maxi (G50)', `S${format(state.maxSpeed)}`, 'tr/min') : null,
            ),
          );
        };
        listeners.add(render);
        compute();
        return { dispose: () => listeners.delete(render) };
      },
    });
    compute();
  },
};
