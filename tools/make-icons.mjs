// Génère les icônes PNG de l'application (écran d'accueil, onglet, haut de page).
//
// Source : la première image trouvée dans logo/ (PNG, JPG, WEBP, SVG, GIF, AVIF) ; à défaut,
// le logo « ISO » d'origine. Lancé automatiquement par GitHub (.github/workflows/icons.yml)
// quand le dossier logo/ change ; à la main : node tools/make-icons.mjs
//
// Les PNG produits dans assets/ sont versionnés : le site n'a besoin d'aucun outil pour marcher.

import { chromium } from 'playwright-core';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.avif': 'image/avif' };

/** Image déposée dans logo/ (data: URL), ou null. */
async function customLogo() {
  const files = (await readdir(join(root, 'logo')).catch(() => [])).filter((f) => TYPES[extname(f).toLowerCase()]).sort();
  if (!files.length) return null;
  const file = files[0];
  const data = await readFile(join(root, 'logo', file));
  return { file, url: `data:${TYPES[extname(file).toLowerCase()]};base64,${data.toString('base64')}` };
}

/** Logo d'origine : carré bleu arrondi et « ISO ». full : fond plein (icônes « maskable », iPhone). */
const defaultSvg = ({ full }) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  ${full ? '<rect width="64" height="64" fill="#2563eb"/>' : '<rect width="64" height="64" rx="14" fill="#2563eb"/>'}
  <text x="32" y="${full ? 39 : 41}" font-family="DejaVu Sans Mono, Consolas, monospace" font-size="${full ? 17 : 22}" font-weight="700" text-anchor="middle" fill="#fff">ISO</text>
</svg>`;

/**
 * Image personnelle : entière (jamais rognée), centrée. full : fond de la couleur du coin
 * haut-gauche de l'image (blanc si transparent) et marge de sécurité de 10 % — Android découpe
 * les icônes « maskable » en cercle ou en carré arrondi.
 */
const customHtml = (url, { full }) => `
<div id="box" style="width:100%;height:100%;display:grid;place-items:center;box-sizing:border-box;padding:${full ? '10%' : '0'}">
  <img id="logo" src="${url}" style="max-width:100%;max-height:100%;object-fit:contain">
</div>
<script>
  const img = document.getElementById('logo');
  window.ready = img.decode().then(() => {
    if (!${full}) return;
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
    const [r, v, b, a] = g.getImageData(0, 0, 1, 1).data;
    document.getElementById('box').style.background = a > 200 ? 'rgb(' + r + ',' + v + ',' + b + ')' : '#fff';
  });
</script>`;

const ICONS = [
  { file: 'icon-192.png', size: 192, full: false },
  { file: 'icon-512.png', size: 512, full: false },
  { file: 'icon-maskable-512.png', size: 512, full: true },
  { file: 'apple-touch-icon.png', size: 180, full: true },
  { file: 'favicon-64.png', size: 64, full: false },
];

const logo = await customLogo();
console.log(logo ? `Logo personnel : logo/${logo.file}` : 'Aucune image dans logo/ : logo « ISO » d’origine.');

let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ channel: 'chrome' }); // GitHub Actions : Chrome déjà installé
}
for (const icon of ICONS) {
  const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
  const body = logo ? customHtml(logo.url, icon) : defaultSvg(icon);
  await page.setContent(`<!doctype html><style>html,body{margin:0;width:100%;height:100%;background:transparent}</style>${body}`);
  if (logo) await page.evaluate(() => window.ready);
  await page.screenshot({ path: join(root, 'assets', icon.file), omitBackground: true });
  await page.close();
  console.log(`assets/${icon.file} (${icon.size} px)`);
}
await browser.close();
