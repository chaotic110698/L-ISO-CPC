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
 * Image personnelle : entière (jamais rognée), centrée.
 * - full (icônes Android « maskable », iPhone) : fond plein de la couleur du coin haut-gauche
 *   (blanc si transparent) et marge de sécurité de 10 % — Android découpe en cercle.
 * - sinon : le fond uni relié aux coins (coins blancs d'un logo carré arrondi, par exemple)
 *   devient transparent, pour un rendu propre sur fond sombre.
 */
const customHtml = (url, { full, size }) => `
<canvas id="c" width="${size}" height="${size}" style="display:block"></canvas>
<script>
  const img = new Image();
  img.src = ${JSON.stringify(url)};
  window.ready = img.decode().then(() => {
    const c = document.getElementById('c');
    const g = c.getContext('2d', { willReadFrequently: true });
    const size = ${size};
    const pad = ${full ? 0.1 : 0} * size;
    const k = Math.min((size - 2 * pad) / img.naturalWidth, (size - 2 * pad) / img.naturalHeight);
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    // Couleur du coin de l'image d'origine.
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const pg = probe.getContext('2d');
    pg.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
    const [cr, cg, cb, ca] = pg.getImageData(0, 0, 1, 1).data;
    if (${full}) {
      g.fillStyle = ca > 200 ? 'rgb(' + cr + ',' + cg + ',' + cb + ')' : '#fff';
      g.fillRect(0, 0, size, size);
    }
    g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    if (${full} || ca < 200) return;
    // Détourage : remplissage par diffusion depuis les quatre coins, couleurs proches du coin.
    const data = g.getImageData(0, 0, size, size);
    const px = data.data;
    // Pixel déjà transparent (bord d'une image non carrée) : on le traverse.
    // Fond blanc (le cas courant) : tout pixel presque blanc et peu coloré ; sinon, couleur proche du coin.
    const whiteBg = Math.min(cr, cg, cb) > 225;
    const close = (i) =>
      px[i + 3] === 0 ||
      (whiteBg
        ? Math.min(px[i], px[i + 1], px[i + 2]) > 200 && Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) < 30
        : Math.abs(px[i] - cr) + Math.abs(px[i + 1] - cg) + Math.abs(px[i + 2] - cb) < 60);
    const seen = new Uint8Array(size * size);
    const stack = [0, size - 1, size * (size - 1), size * size - 1];
    while (stack.length) {
      const p = stack.pop();
      if (seen[p]) continue;
      seen[p] = 1;
      if (!close(p * 4)) continue;
      px[p * 4 + 3] = 0;
      const x = p % size, y = (p / size) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < size - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - size);
      if (y < size - 1) stack.push(p + size);
    }
    g.putImageData(data, 0, 0);
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
