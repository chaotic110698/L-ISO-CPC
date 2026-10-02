import { h } from '../core/dom.js';
import { parseLine, tokenCategory, explainToken } from '../engine/index.js';
import { renderExplanation } from './editor/definition-view.js';

/** Types de jetons qui ont une définition (voir explainToken) : les autres sont du texte simple. */
const EXPLAINABLE = new Set(['word', 'variable', 'keyword', 'function', 'percent', 'eob', 'blockDelete', 'unknown']);

/**
 * Ligne de programme colorée comme dans l'éditeur, en nœuds DOM. Avec `onSelect`, chaque
 * élément explicable devient un bouton : onSelect(bouton, jeton, bloc) au clic ou au tap.
 */
export function renderTokens(code, dictionary, { onSelect, parsed = parseLine(code) } = {}) {
  const { tokens, block } = parsed;
  const parts = [];
  let pos = 0;
  for (const token of tokens) {
    if (token.from > pos) parts.push(code.slice(pos, token.from));
    const text = code.slice(token.from, token.to);
    const category = tokenCategory(token, dictionary);
    const className = category ? `tok-${category}` : '';
    // Adresse : lettre et valeur colorées séparément, pour faire ressortir les valeurs.
    const content = category === 'address' && token.valueKind === 'number' ? [h('span', { class: 'tok-address' }, token.letter), h('span', { class: 'tok-value' }, text.slice(token.letter.length))] : text;
    if (onSelect && EXPLAINABLE.has(token.type)) {
      const button = h('button', { type: 'button', class: `code-token ${className}`, title: 'Afficher la définition' }, content);
      button.addEventListener('click', () => onSelect(button, token, block));
      parts.push(button);
    } else if (Array.isArray(content) || !className) {
      parts.push(...[content].flat());
    } else {
      parts.push(h('span', { class: className }, content));
    }
    pos = token.to;
  }
  if (pos < code.length) parts.push(code.slice(pos));
  return parts;
}

/** Ligne colorée sans interaction (dans un bouton, par exemple). */
export function highlightCode(code, dictionary) {
  const parts = renderTokens(code, dictionary);
  return h('code', { class: 'code-view-code' }, parts.length ? parts : ' ');
}

/**
 * Extrait de programme en lecture seule, coloré comme dans l'éditeur. Un clic ou un tap sur un
 * élément affiche sa définition (selon le profil machine actif) juste sous la ligne touchée.
 *
 * lines : [{ code, note? }] — `note` : explication affichée en regard de la ligne.
 */
export function createCodeView({ lines, dictionary, caption, actions = [] }) {
  const parsed = lines.map((line) => ({ ...line, parsed: parseLine(line.code) }));
  const annotated = lines.some((line) => line.note);
  const definition = h('div', { class: 'code-view-def', hidden: true });
  let selected = null;

  // Affectations d'une variable dans l'extrait (numéros de ligne de l'extrait).
  const findAssignments = (index) =>
    parsed.flatMap((line, i) => (line.parsed.block.variables.some((v) => v.assigned && v.index === index) ? [{ line: i + 1, text: line.code }] : []));

  const close = () => {
    definition.hidden = true;
    definition.replaceChildren();
    selected?.classList.remove('is-selected');
    selected = null;
  };

  const show = (element, token, block) => {
    const explanation = explainToken(token, { block, dictionary, findAssignments, variableInfo: () => ({}) });
    if (!explanation || selected === element) return close();
    selected?.classList.remove('is-selected');
    selected = element;
    element.classList.add('is-selected');
    definition.replaceChildren(renderExplanation(explanation, { onClose: close }));
    definition.hidden = false;
    // Sous la ligne touchée : visible même dans un long extrait.
    element.closest('.code-view-line').after(definition);
    definition.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  };

  const body = h(
    'div',
    { class: `code-view-lines${annotated ? ' is-annotated' : ''}` },
    parsed.map((line) => {
      const parts = renderTokens(line.code, dictionary, { onSelect: show, parsed: line.parsed });
      return h(
        'div',
        { class: 'code-view-line' },
        h('code', { class: 'code-view-code' }, parts.length ? parts : ' '),
        annotated ? h('span', { class: 'code-view-note' }, line.note ?? '') : null,
      );
    }),
    definition,
  );

  return h(
    'figure',
    { class: 'code-view' },
    body,
    caption || actions.length
      ? h('figcaption', { class: 'code-view-caption' }, caption ? h('span', null, caption) : null, actions.length ? h('span', { class: 'code-view-actions' }, actions) : null)
      : null,
  );
}
