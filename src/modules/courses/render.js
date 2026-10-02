import { h } from '../../core/dom.js';
import { parseLine, tokenCategory, explainToken } from '../../engine/index.js';
import { createCodeView } from '../../ui/code-view.js';
import { renderExplanation } from '../../ui/editor/definition-view.js';
import { icon } from '../../ui/icons.js';
import { FIGURES } from './figures.js';
import { MACHINE_PREFS } from './progress.js';

/**
 * Rendu des leçons (format décrit dans src/data/courses/README.md).
 *
 * Texte enrichi : `G01` → code coloré (un tap affiche sa définition), **gras**, *italique*.
 */

export const NOTE_TONES = {
  retenir: { label: 'À retenir', icon: 'check' },
  piege: { label: 'Piège courant', icon: 'warning' },
  info: { label: 'Bon à savoir', icon: 'info' },
  rectif: { label: 'En rectification', icon: 'machine' },
  machine: { label: 'Selon votre machine', icon: 'settings' },
};

/** Découpe le texte enrichi : [{ type: 'text'|'code'|'strong'|'em', text }]. */
export function parseInline(text) {
  const parts = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  for (const match of String(text).matchAll(pattern)) {
    if (match.index > last) parts.push({ type: 'text', text: text.slice(last, match.index) });
    if (match[1] != null) parts.push({ type: 'code', text: match[1] });
    else if (match[2] != null) parts.push({ type: 'strong', text: match[2] });
    else parts.push({ type: 'em', text: match[3] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}

/** Infobulle de définition partagée (API popover : se ferme d'un tap ailleurs). */
let popover = null;
function showDefinition(anchor, explanation) {
  if (!popover) {
    popover = h('div', { class: 'course-popover', popover: 'auto' });
    document.body.append(popover);
  }
  popover.replaceChildren(renderExplanation(explanation, { onClose: () => popover.hidePopover() }));
  popover.showPopover();
  const rect = anchor.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  const left = Math.max(8, Math.min(rect.left, innerWidth - width - 8));
  const below = rect.bottom + 6;
  const top = below + height > innerHeight - 8 && rect.top - height - 6 > 8 ? rect.top - height - 6 : Math.min(below, Math.max(8, innerHeight - height - 8));
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

export function hideDefinition() {
  if (popover?.matches(':popover-open')) popover.hidePopover();
}

/** Code en ligne coloré ; chaque élément explicable est un bouton. */
function inlineCode(text, dictionary) {
  const { tokens, block } = parseLine(text);
  const parts = [];
  let pos = 0;
  for (const token of tokens) {
    if (token.from > pos) parts.push(text.slice(pos, token.from));
    const piece = text.slice(token.from, token.to);
    const category = tokenCategory(token, dictionary);
    const explanation = explainToken(token, { block, dictionary, findAssignments: () => [], variableInfo: () => ({}) });
    const className = category ? `tok-${category}` : '';
    if (explanation) {
      const button = h('button', { type: 'button', class: `code-token ${className}`, title: 'Afficher la définition' }, piece);
      button.addEventListener('click', () => showDefinition(button, explanation));
      parts.push(button);
    } else {
      parts.push(className ? h('span', { class: className }, piece) : piece);
    }
    pos = token.to;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return h('code', { class: 'inline-code' }, parts);
}

export function renderInline(text, ctx) {
  return parseInline(text).map((part) => {
    if (part.type === 'code') return inlineCode(part.text, ctx.dictionary);
    if (part.type === 'strong') return h('strong', null, part.text);
    if (part.type === 'em') return h('em', null, part.text);
    return part.text;
  });
}

const prefLabel = (key, value) => MACHINE_PREFS.find((p) => p.key === key)?.options.find((o) => o.value === value)?.label ?? value;

/** Valeurs à afficher pour une préférence : la valeur choisie, ou toutes. */
function shownValues(key, ctx) {
  const pref = MACHINE_PREFS.find((p) => p.key === key);
  const value = ctx.prefs[key];
  const all = pref.options.map((o) => o.value).filter((v) => v !== pref.default);
  return value === pref.default ? all : [value];
}

const TURRET_TITLES = { rear: 'Outil (ou meule) derrière l’axe — tourelle arrière', front: 'Outil devant l’axe — tourelle avant' };

const BLOCKS = {
  p: (block, ctx) => h('p', null, renderInline(block.text, ctx)),

  list: (block, ctx) => h(block.ordered ? 'ol' : 'ul', { class: 'course-list' }, block.items.map((item) => h('li', null, renderInline(item, ctx)))),

  note(block, ctx) {
    const tone = NOTE_TONES[block.tone] ?? NOTE_TONES.info;
    return h(
      'aside',
      { class: `course-note is-${block.tone}` },
      h('p', { class: 'course-note-title' }, icon(tone.icon), h('span', null, block.title ?? tone.label)),
      block.text ? h('p', null, renderInline(block.text, ctx)) : null,
      block.blocks ? renderBlocks(block.blocks, ctx) : null,
    );
  },

  code(block, ctx) {
    const lines = block.lines ? block.lines.map((line) => (Array.isArray(line) ? { code: line[0], note: line[1] } : { code: line })) : block.code.split('\n').map((code) => ({ code }));
    const actions = block.open
      ? [h('button', { type: 'button', class: 'btn btn-small', dataset: { action: 'open-example' }, onclick: () => ctx.openExample(block.open, lines.map((l) => l.code).join('\n')) }, icon('code'), 'Ouvrir dans l’éditeur')]
      : [];
    return createCodeView({ lines, dictionary: ctx.dictionary, caption: block.caption, actions });
  },

  figure(block, ctx) {
    const draw = FIGURES[block.figure];
    if (!draw) throw new Error(`Schéma inconnu : ${block.figure}`);
    const turrets = block.turret ? shownValues('turret', ctx) : ['rear'];
    return h(
      'figure',
      { class: `course-figure${turrets.length > 1 ? ' is-double' : ''}` },
      h(
        'div',
        { class: 'course-figure-items' },
        turrets.map((turret) => {
          const item = h('div', { class: 'course-figure-item', dataset: { turret } });
          item.innerHTML = draw({ turret });
          if (block.turret) item.prepend(h('p', { class: 'course-figure-title' }, TURRET_TITLES[turret]));
          return item;
        }),
      ),
      block.caption ? h('figcaption', null, renderInline(block.caption, ctx)) : null,
    );
  },

  table: (block, ctx) =>
    h(
      'div',
      { class: 'course-table-wrap' },
      h(
        'table',
        { class: 'course-table' },
        block.head ? h('thead', null, h('tr', null, block.head.map((cell) => h('th', null, renderInline(cell, ctx))))) : null,
        h('tbody', null, block.rows.map((row) => h('tr', null, row.map((cell) => h('td', null, renderInline(cell, ctx)))))),
      ),
    ),

  /** Bloc décomposé mot par mot : { code, parts: [{ text, label }] }. */
  anatomy: (block, ctx) =>
    h(
      'div',
      { class: 'course-anatomy', role: 'group', 'aria-label': `Décomposition de ${block.parts.map((p) => p.text).join(' ')}` },
      block.parts.map((part) => h('div', { class: 'course-anatomy-part' }, inlineCode(part.text, ctx.dictionary), h('span', null, part.label))),
    ),

  /** Explication qui dépend de la machine : { pref, cases: { valeur: [blocs] } }. */
  variants(block, ctx) {
    const values = shownValues(block.pref, ctx);
    return h(
      'div',
      { class: `course-variants${values.length > 1 ? ' is-double' : ''}` },
      values.map((value) =>
        h(
          'section',
          { class: 'course-variant', dataset: { variant: value } },
          h('p', { class: 'course-variant-title' }, block.titles?.[value] ?? prefLabel(block.pref, value)),
          renderBlocks(block.cases[value] ?? [], ctx),
        ),
      ),
    );
  },
};

export const BLOCK_TYPES = Object.keys(BLOCKS);

/**
 * `dictionary: 'iso'` sur un bloc : ses codes sont expliqués avec l'ISO générique (exemples
 * en systèmes B/C, où G90/G91 sont absolu/incrémental), lui et ses blocs imbriqués.
 */
export function renderBlocks(blocks, ctx) {
  return blocks.map((block) => {
    const render = BLOCKS[block.type];
    if (!render) throw new Error(`Type de bloc inconnu : ${block.type}`);
    const own = block.dictionary && ctx.dictionaries?.[block.dictionary];
    return render(block, own ? { ...ctx, dictionary: own } : ctx);
  });
}
