import { EditorView } from '@codemirror/view';

/**
 * Apparence de CodeMirror. Les couleurs viennent des variables CSS (css/tokens.css) :
 * un seul thème sert pour le mode clair et le mode sombre.
 */
export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--editor-text)',
    backgroundColor: 'var(--editor-bg)',
    fontSize: 'var(--editor-font-size)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.6',
  },
  '.cm-content': {
    caretColor: 'var(--editor-cursor)',
    padding: '6px 0 40vh',
  },
  '.cm-line': { padding: '0 10px 0 8px' },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--editor-cursor)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--editor-selection)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
  '.cm-gutters': {
    backgroundColor: 'var(--editor-gutter-bg)',
    color: 'var(--editor-gutter-text)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 10px',
    minWidth: '3ch',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--editor-active-line)',
    color: 'var(--text)',
  },
  '.cm-specialChar': { color: 'var(--danger)' },
});
