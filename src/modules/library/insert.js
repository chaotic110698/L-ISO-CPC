import { EditorView } from '@codemirror/view';

/** Insère un bloc de lignes sous la ligne du curseur (ou à sa place si elle est vide). */
export function insertBlockAtCursor(view, text) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const empty = !line.text.trim();
  const from = empty ? line.from : line.to;
  const insert = empty ? text : `\n${text}`;
  view.dispatch({
    changes: { from, to: empty ? line.to : from, insert },
    selection: { anchor: from + insert.length },
    effects: EditorView.scrollIntoView(from + insert.length, { y: 'center' }),
    userEvent: 'input.paste',
  });
  view.focus();
}
