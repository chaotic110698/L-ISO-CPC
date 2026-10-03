// Génère les icônes PNG de l'application installable à partir du dessin de assets/icon.svg.
// Outil de développement (playwright-core) : node tools/make-icons.mjs — les PNG sont versionnés.

import { chromium } from 'playwright-core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Logo : carré bleu arrondi et « ISO ». maskable : fond plein, logo dans la zone sûre (80 %). */
const svg = ({ maskable }) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  ${maskable ? '<rect width="64" height="64" fill="#2563eb"/>' : '<rect width="64" height="64" rx="14" fill="#2563eb"/>'}
  <text x="32" y="${maskable ? 39 : 41}" font-family="DejaVu Sans Mono, Consolas, monospace" font-size="${maskable ? 17 : 22}" font-weight="700" text-anchor="middle" fill="#fff">ISO</text>
</svg>`;

const ICONS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

const browser = await chromium.launch();
for (const icon of ICONS) {
  const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg(icon)}`);
  await page.screenshot({ path: join(root, 'assets', icon.file), omitBackground: true });
  await page.close();
  console.log(`assets/${icon.file} (${icon.size} px)`);
}
await browser.close();
