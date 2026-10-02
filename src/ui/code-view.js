import { h } from '../core/dom.js';
import { parseLine, tokenCategory, explainToken } from '../engine/index.js';
import { renderExplanation } from './editor/definition-view.js';

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

  const findAssignments = (index) =>
    parsed.filter((line) => line.parsed.block.variables.some((v) => v.assigned && v.index === index)).map((line, i) => ({ line: i + 1, text: line.code }));

  const close = () => {
    definition.hidden = true;
    definition.replaceChildren();
    selected?.classList.remove('is-selected');
    selected = null;
  };

  const show = (element, token, block) => {
    const explanation = explainToken(token, { block, dictionary, findAssignments, variableInfo: () => ({}) });
    if (!explanation) return close();
    selected?.classList.remove('is-selected');
    if (selected === element) return close();
    selected = element;
    element.classList.add('is-selected');
    definition.replaceChildren(renderExplanation(explanation, { onClose: close }));
    definition.hidden = false;
    // Sous la ligne touchée : visible même dans un long extrait.
    element.closest('.code-view-line').after(definition);
    definition.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  };

  const renderLine = ({ code, parsed: { tokens, block } }) => {
    const parts = [];
    let pos = 0;
    for (const token of tokens) {
      if (token.from > pos) parts.push(code.slice(pos, token.from));
      const text = code.slice(token.from, token.to);
      const category = tokenCategory(token, dictionary);
      const explainable = Boolean(explainToken(token, { block, dictionary, findAssignments, variableInfo: () => ({}) }));
      let content = text;
      if (category === 'address' && token.valueKind === 'number') {
        content = [h('span', { class: 'tok-address' }, token.letter), h('span', { class: 'tok-value' }, text.slice(token.letter.length))];
      }
      if (explainable) {
        const button = h('button', { type: 'button', class: `code-token${category ? ` tok-${category}` : ''}`, title: 'Afficher la définition' }, content);
        button.addEventListener('click', () => show(button, token, block));
        parts.push(button);
      } else {
        parts.push(category && !Array.isArray(content) ? h('span', { class: `tok-${category}` }, content) : content);
      }
      pos = token.to;
    }
    if (pos < code.length) parts.push(code.slice(pos));
    return parts.length ? parts : ' ';
  };

  const body = h(
    'div',
    { class: `code-view-lines${annotated ? ' is-annotated' : ''}` },
    parsed.map((line) =>
      h(
        'div',
        { class: 'code-view-line' },
        h('code', { class: 'code-view-code' }, renderLine(line)),
        annotated ? h('span', { class: 'code-view-note' }, line.note ?? '') : null,
      ),
    ),
  );

  body.append(definition);
  return h(
    'figure',
    { class: 'code-view' },
    body,
    caption || actions.length
      ? h(
          'figcaption',
          { class: 'code-view-caption' },
          caption ? h('span', null, caption) : null,
          actions.length ? h('span', { class: 'code-view-actions' }, actions) : null,
        )
      : null,
  );
}
