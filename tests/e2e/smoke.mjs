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

/** Navigue via le menu latéral (ouvert d'abord s'il est escamoté, sur mobile). */
async function navTo(page, id, pageSelector) {
  const item = page.locator(`.sidenav li[data-nav="${id}"]:not([hidden]) > *`);
  const box = await item.boundingBox();
  if (!box || box.x < 0) {
    await page.locator('button[aria-label="Menu"]').click();
    await page.waitForFunction(() => document.querySelector('.app').classList.contains('nav-open'));
    await page.waitForTimeout(250); // fin de l'animation d'ouverture
  }
  await item.click();
  await page.waitForSelector(pageSelector);
}

const gotoSettings = (page) => navTo(page, 'parametres', '.settings-page:not([hidden])');
const gotoEditor = (page) => navTo(page, 'editeur', '.editor-page:not([hidden])');

const toggle = (page, key) => page.locator(`.setting[data-key="${key}"] input`).click();

console.log(`Test de bout en bout sur ${url}`);

// ---------------------------------------------------------------------------------------
console.log('Ordinateur');
const desktop = await open(DESKTOP);
{
  const { page } = desktop;

  await step('page d’accueil par défaut, bouton « Commencer à programmer »', async () => {
    assert.equal(await page.locator('.home-page').isVisible(), true);
    assert.equal(await page.locator('.editor-page').isVisible(), false);
    assert.match(await page.locator('.home-resume').textContent(), /Exemple — tournage Fanuc/);
    assert.ok((await page.locator('.sidenav [data-nav]').count()) >= 8, 'menu latéral avec fonctions disponibles et à venir');
    assert.equal(await page.locator('.sidenav [data-nav="accueil"] a').getAttribute('aria-current'), 'page');
    await shot(page, 'pc-clair-accueil');
    await page.locator('[data-action="start"]').click();
    await page.waitForSelector('.editor-page:not([hidden])');
    assert.equal(await page.locator('.sidenav [data-nav="editeur"] a').getAttribute('aria-current'), 'page');
  });

  await step('menu latéral repliable sur grand écran (mémorisé)', async () => {
    await page.locator('button[aria-label="Menu"]').click();
    assert.equal(await page.locator('.sidenav').isVisible(), false);
    await page.reload();
    await waitReady(page);
    assert.equal(await page.locator('.sidenav').isVisible(), false);
    await page.locator('button[aria-label="Menu"]').click();
    assert.equal(await page.locator('.sidenav').isVisible(), true);
  });

  await step('menu « Mes programmes » : ouvre l’éditeur et la liste', async () => {
    await navTo(page, 'accueil', '.home-page:not([hidden])');
    await page.locator('.sidenav [data-nav="programmes"] button').click();
    await page.waitForSelector('.drawer[open] .program-item');
    assert.equal(await page.locator('.editor-page').isVisible(), true);
    await page.keyboard.press('Escape');
  });

  await step('démarrage : programme d’exemple, IndexedDB, aucune erreur', async () => {
    assert.match(await editorText(page), /O1000 \(EXEMPLE TOURNAGE FANUC\)/);
    assert.equal(await page.evaluate(() => window.isoApp.db.kind), 'indexeddb');
    assert.equal(await page.locator('.program-title-text').textContent(), 'Exemple — tournage Fanuc');
    assert.ok((await page.locator('.cm-lineNumbers .cm-gutterElement').count()) > 10, 'numéros de ligne visibles');
    await shot(page, 'pc-clair-editeur');
  });

  await step('coloration syntaxique par catégorie', async () => {
    const classOf = (text) =>
      page.evaluate((t) => [...document.querySelectorAll('.cm-content span')].find((el) => el.textContent === t)?.className ?? null, text);
    assert.match(await classOf('G00'), /tok-motion/);
    assert.match(await classOf('G01'), /tok-motion/);
    assert.match(await classOf('G03'), /tok-motion/);
    assert.match(await classOf('G71'), /tok-cycle/);
    assert.match(await classOf('M03'), /tok-mcode/);
    assert.match(await classOf('T0101'), /tok-tool/);
    assert.match(await classOf('#901'), /tok-macro/);
    assert.match(await classOf('(EXEMPLE TOURNAGE FANUC)'), /tok-comment/);
    assert.equal(await page.locator('.tok-unknown, .tok-invalid').count(), 0);
  });

  await step('mise en évidence des occurrences d’une macro et d’une valeur', async () => {
    const status = page.locator('[data-status="occurrences"]');
    await page.locator('.cm-content .tok-macro').first().click();
    assert.equal(await status.textContent(), '#901 : 2 occurrences · 1 affectation');
    assert.equal(await page.locator('.cm-iso-occurrence').count(), 2);
    await page.locator('.cm-content .tok-value', { hasText: /^52\.$/ }).first().click();
    assert.equal(await status.textContent(), 'X52. : 2 occurrences');
    await shot(page, 'pc-clair-occurrences');
    await page.locator('.cm-content .tok-comment').first().click();
    assert.equal(await status.textContent(), '');
    assert.equal(await page.locator('.cm-iso-occurrence').count(), 0);
  });

  await step('définition au clic : code, paramètre de cycle, fermeture', async () => {
    const tip = page.locator('.def-tip');
    await page.locator('.cm-content .tok-cycle', { hasText: 'G71' }).first().click();
    await tip.waitFor();
    assert.equal(await tip.locator('.def-code').textContent(), 'G71');
    assert.match(await tip.locator('.def-name').textContent(), /Cycle d’ébauche longitudinale/);
    assert.match(await tip.textContent(), /FANUC tournage/);
    await shot(page, 'pc-clair-definition');
    await page.keyboard.press('Escape');
    await tip.waitFor({ state: 'detached' });

    // U du premier bloc G71 : profondeur de passe (variante selon les lettres du bloc).
    await page.locator('.cm-line').nth(11).locator('.tok-address', { hasText: 'U' }).click();
    await tip.waitFor();
    assert.match(await tip.locator('.def-name').textContent(), /Profondeur de passe/);
    await page.keyboard.type(' ');
    await tip.waitFor({ state: 'detached' });
    await page.keyboard.press('Backspace');

    await page.locator('.cm-content .tok-macro').first().click();
    await tip.waitFor();
    assert.match(await tip.textContent(), /Affectée ligne 4/);
    await tip.locator('.def-close').click();
    await tip.waitFor({ state: 'detached' });
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
    await page.locator('[data-tool="programs"]').click();
    await page.locator('.drawer .btn', { hasText: 'Nouveau' }).click();
    await page.locator('.dialog input').fill('Arbre 25');
    await page.locator('.dialog button', { hasText: 'Créer' }).click();
    await page.waitForFunction(() => document.querySelector('.program-title-text').textContent === 'Arbre 25');
    assert.match(await editorText(page), /O0001/);

    await page.locator('.program-title').click();
    await page.locator('.dialog input').fill('Arbre 25 — reprise');
    await page.locator('.dialog button', { hasText: 'Renommer' }).click();
    await page.waitForFunction(() => document.querySelector('.program-title-text').textContent === 'Arbre 25 — reprise');

    await page.locator('[data-tool="programs"]').click();
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

  await step('coloration et occurrences désactivables (réellement retirées)', async () => {
    await gotoSettings(page);
    assert.ok((await page.locator('.color-legend li').count()) >= 10, 'légende des couleurs affichée');
    await toggle(page, 'modules.highlighting');
    await toggle(page, 'modules.occurrences');
    assert.equal(await page.locator('.color-legend').isVisible(), false);
    await gotoEditor(page);
    assert.equal(await page.locator('.cm-content [class*="tok-"]').count(), 0);
    assert.equal(await page.locator('[data-status="occurrences"]').count(), 0);
    await gotoSettings(page);
    await toggle(page, 'modules.highlighting');
    await toggle(page, 'modules.occurrences');
    await gotoEditor(page);
    assert.ok((await page.locator('.cm-content .tok-motion').count()) > 0);
  });

  await step('définitions désactivables', async () => {
    await gotoSettings(page);
    await toggle(page, 'modules.definitions');
    await gotoEditor(page);
    await page.locator('.cm-content .tok-cycle').first().click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.def-tip').count(), 0);
    await gotoSettings(page);
    await toggle(page, 'modules.definitions');
    await gotoEditor(page);
  });

  await step('calculateurs : Vc ↔ tr/min, unités mm/min et mm/s, rectification', async () => {
    await navTo(page, 'calculateurs', '.calc-page:not([hidden])');
    const field = (calc, key) => page.locator(`[data-calc="${calc}"] input[data-key="${key}"]`);
    const unit = (calc, key) => page.locator(`[data-calc="${calc}"] select[data-unit-for="${key}"]`);
    const results = (calc) => page.locator(`[data-calc="${calc}"] .calc-results`).textContent();

    await field('cutting', 'd').fill('50');
    await field('cutting', 'vc').fill('220');
    assert.equal(await field('cutting', 'n').inputValue(), '1401');
    await unit('cutting', 'vc').selectOption('mm/s');
    assert.equal(await field('cutting', 'vc').inputValue(), '3666,667', 'même vitesse convertie en mm/s');
    await field('cutting', 'n').fill('1000');
    assert.equal(await field('cutting', 'vc').inputValue(), '2617,994');
    assert.match(await results('cutting'), /157,08 m\/min/);

    await field('feed', 'f').fill('0,2');
    await field('feed', 'n').fill('1500');
    assert.equal(await field('feed', 'vf').inputValue(), '300');
    await unit('feed', 'vf').selectOption('mm/s');
    assert.equal(await field('feed', 'vf').inputValue(), '5');

    await field('grinding', 'ds').fill('400');
    await field('grinding', 'ns').fill('1500');
    assert.equal(await field('grinding', 'vs').inputValue(), '31,416');
    await field('grinding', 'dw').fill('50');
    await field('grinding', 'nw').fill('120');
    assert.equal(await field('grinding', 'vw').inputValue(), '314,159', 'Vw en mm/s');
    await field('grinding', 'fa').fill('10');
    assert.equal(await field('grinding', 'vfa').inputValue(), '20', '10 mm/tr × 120 tr/min = 1200 mm/min = 20 mm/s');
    assert.match(await results('grinding'), /Rapport q = Vs \/ Vw100/);

    await field('roughness', 'f').fill('0,2');
    await field('roughness', 'r').fill('0,8');
    assert.equal(await field('roughness', 'ra').inputValue(), '1,604');
    await field('nose', 'r').fill('0,8');
    await field('nose', 'angle').fill('45');
    assert.match(await results('nose'), /ΔZ\)0,469 mm.*ΔX\)0,937 mm/); // 0,8 × (1 − tan 22,5°)
    await shot(page, 'pc-sombre-calculateurs');

    await page.reload();
    await waitReady(page);
    assert.equal(await field('cutting', 'n').inputValue(), '1000', 'valeurs mémorisées');
  });

  await step('calculateurs désactivables (page et menu retirés, puis rétablis)', async () => {
    await gotoSettings(page);
    await toggle(page, 'modules.calculators');
    assert.equal(await page.locator('.sidenav [data-nav="calculateurs"] .is-upcoming').isVisible(), true);
    assert.equal(await page.locator('.sidenav [data-nav="calculateurs"] a').count(), 0);
    assert.equal(await page.locator('.calc-page').count(), 0, 'page retirée');
    await toggle(page, 'modules.calculators');
    await page.locator('.setting[data-key="calculators.nose"] input').click();
    await navTo(page, 'calculateurs', '.calc-page:not([hidden])');
    assert.equal(await page.locator('[data-calc="nose"]').isVisible(), false);
    await gotoSettings(page);
    await page.locator('.setting[data-key="calculators.nose"] input').click();
    await gotoEditor(page);
  });

  await step('profils : nouveau profil, plages de macros, code propriétaire', async () => {
    await navTo(page, 'profils', '.profiles-page:not([hidden])');
    assert.deepEqual(await page.locator('.profile-card .profile-name').allTextContents(), ['ISO générique', 'FANUC tournage']);
    await shot(page, 'pc-sombre-profils');
    await page.locator('button', { hasText: 'Nouveau profil' }).click();
    await page.locator('.dialog').getByLabel('Nom', { exact: true }).fill('Tour Okuma');
    await page.locator('.dialog button', { hasText: 'Créer' }).click();
    await page.waitForSelector('.profile-detail');

    await page.locator('.range-form input').fill('900-949, 960-999');
    await page.locator('.range-form button').click();
    await page.waitForFunction(() => document.querySelectorAll('.range-chips li').length === 2);

    await page.locator('button', { hasText: 'Ajouter un code' }).click();
    const dialog = page.locator('.dialog');
    await dialog.getByLabel('Code', { exact: true }).fill('m50');
    await dialog.getByLabel('Nom', { exact: true }).fill('Ouverture du mandrin');
    await dialog.getByLabel('Catégorie (couleur dans l’éditeur)').selectOption('mcode');
    await dialog.getByLabel('Description').fill('Ouvre le mandrin hydraulique.');
    await dialog.locator('button', { hasText: 'Enregistrer' }).click();
    await page.waitForSelector('.code-row[data-code="M50"]');
    assert.match(await page.locator('.code-row[data-code="M50"]').textContent(), /code propriétaire/);
    await shot(page, 'pc-sombre-profil-detail');
  });

  await step('profils : code reconnu dans l’éditeur, code standard personnalisé depuis l’infobulle', async () => {
    await gotoEditor(page);
    await typeAtEnd(page, '\nM50');
    const m50 = page.locator('.cm-line').last().locator('.tok-mcode');
    assert.equal(await m50.textContent(), 'M50');
    await m50.click();
    const tip = page.locator('.def-tip');
    await tip.waitFor();
    assert.match(await tip.textContent(), /Ouverture du mandrin/);
    assert.match(await tip.textContent(), /Tour Okuma/);
    await page.keyboard.press('Escape');

    await page.locator('.cm-content .tok-mcode', { hasText: 'M08' }).first().click();
    await tip.waitFor();
    await tip.locator('.def-edit').click();
    const dialog = page.locator('.dialog');
    assert.equal(await dialog.getByLabel('Nom', { exact: true }).inputValue(), 'Arrosage');
    await dialog.getByLabel('Nom', { exact: true }).fill('Arrosage haute pression');
    await dialog.locator('button', { hasText: 'Enregistrer' }).click();
    await page.waitForSelector('.dialog', { state: 'detached' });
    await page.locator('.cm-content .tok-mcode', { hasText: 'M08' }).first().click();
    await tip.waitFor();
    assert.match(await tip.locator('.def-name').textContent(), /Arrosage haute pression/);
    assert.match(await tip.locator('.def-redefined').textContent(), /En ISO générique : « Arrosage »/);
    await page.keyboard.press('Escape');
  });

  await step('profils : désactivation immédiate (Paramètres), codes actifs', async () => {
    await gotoSettings(page);
    await page.locator('.setting[data-profile="fanuc-turning"] input').click();
    await gotoEditor(page);
    assert.ok((await page.locator('.cm-content .tok-unknown', { hasText: 'G71' }).count()) > 0, 'G71 inconnu sans le profil FANUC');
    await gotoSettings(page);
    await page.locator('.setting[data-profile="fanuc-turning"] input').click();
    await gotoEditor(page);
    assert.equal(await page.locator('.cm-content .tok-unknown').count(), 0);

    await navTo(page, 'profils', '.profiles-page:not([hidden])');
    await page.locator('.tabs button', { hasText: 'Codes actifs' }).click();
    await page.locator('input[type="search"]').fill('mandrin');
    assert.deepEqual(await page.locator('.code-row').evaluateAll((rows) => rows.map((r) => r.dataset.code)), ['M50']);
    await page.locator('input[type="search"]').fill('');
    await page.locator('.tabs button', { hasText: 'Profils' }).click();
    await gotoEditor(page);
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
  assert.ok(data.sections.profils.some((p) => p.name === 'Tour Okuma' && p.codes.M50), 'profil personnel sauvegardé');
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
  assert.ok(await page.evaluate(() => window.isoApp.codes.lookup('M50')?.name === 'Ouverture du mandrin'), 'profil restauré');
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

  await step('accueil lisible, puis menu latéral escamotable', async () => {
    assert.equal(await page.locator('.home-page').isVisible(), true);
    assert.equal(await noHorizontalScroll(), true);
    await shot(page, 'mobile-clair-accueil');
    await page.locator('button[aria-label="Menu"]').tap();
    await page.waitForTimeout(250);
    await shot(page, 'mobile-clair-menu');
    await page.locator('.nav-backdrop').tap({ position: { x: 360, y: 400 } });
    await page.waitForFunction(() => !document.querySelector('.app').classList.contains('nav-open'));
    await page.locator('[data-action="start"]').tap();
    await page.waitForSelector('.editor-page:not([hidden])');
  });

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

  await step('définition au tap, lisible en largeur smartphone', async () => {
    await page.locator('.cm-content .tok-cycle', { hasText: 'G76' }).first().tap();
    const tip = page.locator('.def-tip');
    await tip.waitFor();
    const box = await tip.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 375, `infobulle dans l’écran (${box.x}, ${box.width})`);
    await shot(page, 'mobile-clair-definition');
    await tip.locator('.def-close').tap();
    await tip.waitFor({ state: 'detached' });
  });

  await step('calculateurs lisibles en largeur smartphone', async () => {
    await navTo(page, 'calculateurs', '.calc-page:not([hidden])');
    assert.equal(await noHorizontalScroll(), true);
    await shot(page, 'mobile-clair-calculateurs');
    await page.locator('[data-calc="grinding"]').scrollIntoViewIfNeeded();
    await shot(page, 'mobile-clair-rectification');
    await gotoEditor(page);
  });

  await step('profils lisibles en largeur smartphone', async () => {
    await navTo(page, 'profils', '.profiles-page:not([hidden])');
    assert.equal(await noHorizontalScroll(), true);
    await shot(page, 'mobile-clair-profils');
    await page.locator('.profile-card[data-profile="fanuc-turning"] .profile-name').tap();
    await page.waitForSelector('.profile-detail');
    assert.equal(await noHorizontalScroll(), true);
    await shot(page, 'mobile-clair-profil-fanuc');
    await gotoEditor(page);
  });

  await step('tiroir des programmes et menu d’actions', async () => {
    await page.locator('[data-tool="programs"]').tap();
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
