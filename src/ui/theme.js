// Application du thème (clair / sombre), de la taille de l'interface et du texte de l'éditeur.
// Le thème initial est déjà posé par le petit script en tête d'index.html (pas de clignotement).

const THEME_COLORS = { light: '#ffffff', dark: '#1b1e23' };

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme] ?? THEME_COLORS.light);
}

/** Taille de l'interface : 'normal' ou 'large' (zones tactiles agrandies, voir components.css). */
export function applyUiSize(size) {
  document.documentElement.dataset.uiSize = size;
}

export function applyEditorFontSize(size) {
  document.documentElement.style.setProperty('--editor-font-size', `${size}px`);
}
