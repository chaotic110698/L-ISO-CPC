// Test de bout en bout : ouvre index.html directement (file://) dans Chromium, comme un
// utilisateur qui double-clique sur le fichier, et vérifie les parcours principaux.
// Captures d'écran (PC et smartphone, clair et sombre) dans test-results/screenshots/
// (ou dans le dossier indiqué par la variable SCREENSHOT_DIR).
//
//   npm run build && npm run e2e
//
// Nécessite un Chromium utilisable par Playwright (variable PLAYWRIGHT_BROWSERS_PATH,
// `npx playwright-core install chromium`, ou Google Chrome installé).

import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const url = pathToFileURL(join(root, 'index.html')).href;
const shots = process.env.SCREENSHOT_DIR ?? join(root, 'test-results', 'screenshots');
await mkdir(shots, { recursive: true });

const DESKTOP = { viewport: { width: 1280, height: 800 } };
const MOBILE = { viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ channel: 'chrome' });
}

let failures = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures++;
    console.log(`  ✗ ${name}\n    ${String(error.stack ?? error).split('\n').slice(0, 6).join('\n    ')}`);
  }
}

async function open(device) {
  const context = await browser.newContext({ ...device, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(url);
  await waitReady(page);
  return { context, page, errors };
}

const waitReady = (page) => page.waitForSelector('html[data-ready="true"]', { timeout: 10000 });
const editorText = (page) => page.evaluate(() => window.isoApp.editor.getText());
const saveState = (page) => page.locator('[data-status="save-state"]');
const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.png`), animations: 'disabled' });

async function typeAtEnd(page, text) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
}

async function gotoSettings(page) {
  await page.locator('a[href="#/parametres"]').click();
  await page.waitForSelector('.settings-page:not([hidden])');
}

async function gotoEditor(page) {
  await page.locator('a[href="#/editeur"]').click();
  await page.waitForSelector('.editor-page:not([hidden])');
}

const toggle = (page, key) => page.locator(`.setting[data-key="${key}"] input`).click();

console.log(`Test de bout en bout sur ${url}`);

// ---------------------------------------------------------------------------------------
console.log('Ordinateur');
const desktop = await open(DESKTOP);
{
  const { page } = desktop;

  await step('démarrage : programme d’exemple, IndexedDB, aucune erreur', async () => {
    assert.match(await editorText(page), /O1000 \(EXEMPLE TOURNAGE FANUC\)/);
    assert.equal(await page.evaluate(() => window.isoApp.db.kind), 'indexeddb');
    assert.equal(await page.locator('.program-title-text').textContent(), 'Exemple — tournage Fanuc');
    assert.ok((await page.locator('.cm-lineNumbers .cm-gutterElement').count()) > 10, 'numéros de ligne visibles');
    await shot(page, 'pc-clair-editeur');
  });

  await step('saisie, sauvegarde automatique et persistance après rechargement', async () => {
    await typeAtEnd(page, '\n(TEST E2E)');
    await page.waitForFunction(() => document.querySelector('[data-status="save-state"]').textContent === 'Enregistré');
    await page.reload();
    await waitReady(page);
    assert.match(await editorText(page), /\(TEST E2E\)$/);
  });

  await step('annuler / rétablir (boutons)', async () => {
    const before = await editorText(page);
    await typeAtEnd(page, 'X');
    assert.equal(await editorText(page), before + 'X');
    await page.locator('[data-tool="undo"]').click();
    assert.equal(await editorText(page), before);
    await page.locator('[data-tool="redo"]').click();
    assert.equal(await editorText(page), before + 'X');
    await page.locator('[data-tool="undo"]').click();
  });

  await step('thème sombre appliqué immédiatement et conservé', async () => {
    await page.locator('.topbar button[aria-label^="Passer en thème"]').click();
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
    await page.reload();
    await waitReady(page);
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
    await shot(page, 'pc-sombre-editeur');
  });

  await step('nouveau programme, renommage, bascule entre programmes', async () => {
    await page.locator('button[aria-label="Programmes"]').click();
    await page.locator('.drawer .btn', { hasText: 'Nouveau' }).click();
    await page.locator('.dialog input').fill('Arbre 25');
    await page.locator('.dialog button', { hasText: 'Créer' }).click();
    await page.waitForFunction(() => document.querySelector('.program-title-text').textContent === 'Arbre 25');
    assert.match(await editorText(page), /O0001/);

    await page.locator('.program-title').click();
    await page.locator('.dialog input').fill('Arbre 25 — reprise');
    await page.locator('.dialog button', { hasText: 'Renommer' }).click();
    await page.waitForFunction(() => document.querySelector('.program-title-text').textContent === 'Arbre 25 — reprise');

    await page.locator('button[aria-label="Programmes"]').click();
    await page.waitForSelector('.drawer[open] .program-item');
    assert.equal(await page.locator('.program-item').count(), 2);
    await shot(page, 'pc-sombre-tiroir');
    await page.locator('.program-open', { hasText: 'Exemple' }).click();
    await page.waitForFunction(() => document.querySelector('.program-title-text').textContent.startsWith('Exemple'));
    assert.match(await editorText(page), /O1000/);
  });

  await step('désactivation réelle d’un module (numéros de ligne, historique) puis réactivation', async () => {
    await gotoSettings(page);
    await shot(page, 'pc-sombre-parametres');
    await toggle(page, 'modules.lineNumbers');
    await toggle(page, 'modules.history');
    await gotoEditor(page);
    assert.equal(await page.locator('.cm-lineNumbers').count(), 0);
    assert.equal(await page.locator('[data-tool="undo"]').count(), 0);
    await gotoSettings(page);
    await toggle(page, 'modules.lineNumbers');
    await toggle(page, 'modules.history');
    await gotoEditor(page);
    assert.equal(await page.locator('.cm-lineNumbers').count(), 1);
    assert.equal(await page.locator('[data-tool="undo"]').count(), 1);
  });

  await step('sauvegarde automatique coupée : « Non enregistré » puis Ctrl+S', async () => {
    await gotoSettings(page);
    await toggle(page, 'modules.autosave');
    await gotoEditor(page);
    await typeAtEnd(page, '\n(MANUEL)');
    await page.waitForTimeout(1200);
    assert.equal(await saveState(page).textContent(), 'Non enregistré');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => document.querySelector('[data-status="save-state"]').textContent === 'Enregistré');
    await gotoSettings(page);
    await toggle(page, 'modules.autosave');
    await gotoEditor(page);
  });

  await step('taille du texte appliquée immédiatement', async () => {
    await page.evaluate(() => window.isoApp.settings.set('editor.fontSize', 20));
    const size = await page.locator('.cm-content').evaluate((el) => getComputedStyle(el).fontSize);
    assert.equal(size, '20px');
    await page.evaluate(() => window.isoApp.settings.reset('editor.fontSize'));
  });

  await step('export du programme en .nc (fins de ligne CRLF)', async () => {
    await page.locator('[data-tool="download"]').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.action-item', { hasText: '.nc' }).click(),
    ]);
    assert.equal(download.suggestedFilename(), 'Exemple - tournage Fanuc.nc');
    const content = await readFile(await download.path(), 'utf8');
    assert.match(content, /^%\r\nO1000/);
  });
}

let backupPath;
await step('export d’une sauvegarde JSON globale', async () => {
  const { page } = desktop;
  await gotoSettings(page);
  await page.locator('button', { hasText: 'Exporter une sauvegarde' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.dialog button', { hasText: 'Exporter' }).click(),
  ]);
  assert.match(download.suggestedFilename(), /^l-iso-cpc-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);
  backupPath = await download.path();
  const data = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.equal(data.format, 'l-iso-cpc/sauvegarde');
  assert.equal(data.sections.programmes.length, 2);
  assert.equal(data.sections.parametres.theme, 'dark');
});

await step('import de la sauvegarde dans un navigateur vierge (remplacement)', async () => {
  const fresh = await open(DESKTOP);
  const { page } = fresh;
  await gotoSettings(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('button', { hasText: 'Importer une sauvegarde' }).click(),
  ]);
  await chooser.setFiles(backupPath);
  await page.locator('.dialog .check', { hasText: 'Remplacer' }).click();
  await page.locator('.dialog button', { hasText: 'Importer' }).click();
  await page.locator('.dialog button', { hasText: 'Remplacer' }).click();
  await page.waitForSelector('.toast-success');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  const names = await page.evaluate(async () => (await window.isoApp.workspace.list()).map((p) => p.name).sort());
  assert.deepEqual(names, ['Arbre 25 — reprise', 'Exemple — tournage Fanuc']);
  assert.deepEqual(fresh.errors, []);
  await fresh.context.close();
});

await step('aucune erreur dans la console (ordinateur)', async () => {
  assert.deepEqual(desktop.errors, []);
});
await desktop.context.close();

// ---------------------------------------------------------------------------------------
console.log('Smartphone (375 px)');
const mobile = await open(MOBILE);
{
  const { page } = mobile;
  const noHorizontalScroll = () =>
    page.evaluate(() => [...document.querySelectorAll('html, body, .page:not([hidden])')].every((el) => el.scrollWidth <= el.clientWidth));

  await step('éditeur lisible, sans défilement horizontal', async () => {
    assert.equal(await noHorizontalScroll(), true);
    assert.equal(await page.locator('.tool-label').first().isVisible(), false, 'libellés masqués, icônes seules');
    await shot(page, 'mobile-clair-editeur');
  });

  await step('saisie au toucher', async () => {
    await page.locator('.cm-content').tap();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nN310 M30');
    assert.match(await editorText(page), /N310 M30$/);
  });

  await step('tiroir des programmes et menu d’actions', async () => {
    await page.locator('button[aria-label="Programmes"]').tap();
    await page.waitForSelector('.drawer[open]');
    await shot(page, 'mobile-clair-tiroir');
    await page.locator('.program-item .icon-btn').first().tap();
    await page.waitForSelector('.dialog.sheet[open]');
    await shot(page, 'mobile-clair-actions');
    await page.locator('.action-item', { hasText: 'Dupliquer' }).tap();
    await page.waitForSelector('.drawer[open] .program-item:nth-child(2)');
    // La notification doit apparaître au-dessus du tiroir ouvert (couche supérieure).
    const onTop = await page.locator('.toast').evaluate((el) => el.parentElement.matches(':popover-open'));
    assert.equal(onTop, true);
    await shot(page, 'mobile-clair-notification');
    await page.keyboard.press('Escape');
  });

  await step('paramètres lisibles, sans défilement horizontal', async () => {
    await gotoSettings(page);
    assert.equal(await noHorizontalScroll(), true);
    await shot(page, 'mobile-clair-parametres');
  });

  await step('thème sombre', async () => {
    await page.locator('.setting[data-key="theme"] .segment', { hasText: 'Sombre' }).tap();
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
    await shot(page, 'mobile-sombre-parametres');
    await gotoEditor(page);
    await shot(page, 'mobile-sombre-editeur');
  });

  await step('aucune erreur dans la console (smartphone)', async () => {
    assert.deepEqual(mobile.errors, []);
  });
}
await mobile.context.close();
await browser.close();

console.log(failures ? `\n${failures} échec(s).` : `\nTout est passé. Captures : ${shots}`);
process.exit(failures ? 1 : 0);
