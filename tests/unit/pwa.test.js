import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('service worker : chaque fichier mis en cache existe, index.html est entièrement couvert', async () => {
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  const shell = JSON.parse(`[${/const SHELL = \[([\s\S]*?)\];/.exec(sw)[1].replace(/'/g, '"').replace(/,\s*$/, '')}]`);
  for (const path of shell.filter((p) => p !== './')) await access(join(root, path));
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const used = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]);
  for (const path of used) assert.ok(shell.includes(path), `${path} absent du cache hors ligne (sw.js)`);
});

test('manifeste : icônes présentes, une icône « maskable »', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.lang, 'fr');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) await access(join(root, icon.src));
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'));
});
