// Application du thème (clair / sombre) et de la taille du texte de l'éditeur.
// Le thème initial est déjà posé par le petit script en tête d'index.html (pas de clignotement).

const THEME_COLORS = { light: '#ffffff', dark: '#1b1e23' };

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme] ?? THEME_COLORS.light);
}

export function applyEditorFontSize(size) {
  document.documentElement.style.setProperty('--editor-font-size', `${size}px`);
}
