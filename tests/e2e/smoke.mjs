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

/** Remplace tout le texte de l'éditeur (remise en état après un essai). */
const setText = (page, text) =>
  page.evaluate((t) => {
    const view = window.isoApp.editor.view;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } });
  }, text);

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
    assert.equal(await page.locator('.sidenav [data-nav="calculateurs"]').count(), 0, 'entrée retirée du menu');
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
    await page.locator('.profiles-page input[type="search"]').fill('mandrin');
    assert.deepEqual(await page.locator('.code-row').evaluateAll((rows) => rows.map((r) => r.dataset.code)), ['M50']);
    await page.locator('.profiles-page input[type="search"]').fill('');
    await page.locator('.tabs button', { hasText: 'Profils' }).click();
    await gotoEditor(page);
  });

  await step('macros : tableau des variables, nom personnel, plage du profil', async () => {
    await gotoEditor(page);
    await page.locator('[data-tool="panel-variables"]').click();
    const panel = page.locator('.side-panel');
    await panel.locator('.var-row').first().waitFor();
    assert.match(await panel.locator('.var-summary').textContent(), /#900–#949, #960–#999 \(Tour Okuma\)/);
    assert.match(await panel.locator('.var-summary').textContent(), /Prochaine libre : #900/);

    await panel.locator('.var-row[data-variable="901"] .var-name').click();
    await page.locator('.dialog').getByLabel('Nom', { exact: true }).fill('Diamètre épaulement');
    await page.locator('.dialog button', { hasText: 'Enregistrer' }).click();
    await page.waitForFunction(() => document.querySelector('.var-row[data-variable="901"] .var-name').textContent.includes('Diamètre épaulement'));
    await page.locator('.cm-content .tok-macro').first().click();
    await page.locator('.def-tip').waitFor();
    assert.equal(await page.locator('.def-tip .def-name').textContent(), 'Diamètre épaulement');
    await page.keyboard.press('Escape');
    await shot(page, 'pc-sombre-variables');
  });

  await step('macros : valeur répétée transformée en macro (annulable en une fois)', async () => {
    const panel = page.locator('.side-panel');
    const before = await editorText(page);
    await panel.locator('.var-row[data-repeated="X52."] button', { hasText: 'macro' }).click();
    const dialog = page.locator('.dialog');
    assert.equal(await dialog.getByLabel('Variable n°').inputValue(), '900');
    await dialog.getByLabel('Nom', { exact: true }).fill('Diamètre approche');
    await dialog.locator('button', { hasText: 'Créer' }).click();
    await page.waitForFunction(() => window.isoApp.editor.getText().includes('#900 = 52.'));
    const after = await editorText(page);
    assert.match(after, /^O1000 \(EXEMPLE TOURNAGE FANUC\)\n#900 = 52\. \(DIAMETRE APPROCHE\)$/m);
    assert.equal((after.match(/X#900/g) ?? []).length, 2);
    assert.equal((after.match(/X52\./g) ?? []).length, 0);
    await page.locator('[data-tool="undo"]').click();
    assert.equal(await editorText(page), before);
  });

  await step('macros : avertissement hors plage (non bloquant) et désactivable', async () => {
    await typeAtEnd(page, '\n#120 = 1');
    await page.waitForSelector('.cm-macro-warning');
    assert.match(await page.locator('[data-status="macro-warnings"]').textContent(), /1 avertissement de macros/);
    await page.waitForFunction(() => document.querySelector('.var-row[data-variable="120"] .var-warning')?.textContent.includes('hors des plages libres du profil « Tour Okuma »'));
    await page.locator('.cm-macro-warning').click();
    await page.locator('.def-tip').waitFor();
    assert.match(await page.locator('.def-tip').textContent(), /hors des plages libres/);
    await page.keyboard.press('Escape');

    await gotoSettings(page);
    await toggle(page, 'modules.macroWarnings');
    await gotoEditor(page);
    assert.equal(await page.locator('.cm-macro-warning').count(), 0);
    assert.equal(await page.locator('[data-status="macro-warnings"]').count(), 0);
    await gotoSettings(page);
    await toggle(page, 'modules.macroWarnings');
    await gotoEditor(page);
    await page.waitForSelector('.cm-macro-warning');
    await page.locator('[data-tool="undo"]').click();
    await page.waitForFunction(() => !document.querySelector('.cm-macro-warning'));
  });

  await step('macros : « # » propose la prochaine macro libre', async () => {
    await typeAtEnd(page, '\n#');
    const first = page.locator('.cm-tooltip-autocomplete li').first();
    await first.waitFor();
    assert.match(await first.textContent(), /^#902prochaine macro libre/, '#900 et #901 sont nommées : réservées');
    await page.keyboard.press('Enter');
    assert.match(await editorText(page), /\n#902$/);
    await page.locator('[data-tool="undo"]').click();
    await page.locator('[data-tool="undo"]').click();
    await page.locator('[data-tool="panel-variables"]').click();
    assert.equal(await page.locator('.side-panel').isVisible(), false);
  });

  await step('vérificateur : erreurs soulignées, liste, règles désactivables', async () => {
    const status = page.locator('[data-status="checker"]');
    await page.waitForFunction(() => document.querySelector('[data-status="checker"]')?.textContent === '✓ Aucune erreur');
    const before = await editorText(page);
    await typeAtEnd(page, '\nG0 G1 X25 Z-3.');
    await page.waitForFunction(() => document.querySelector('[data-status="checker"]').textContent.includes('1 erreur'));
    assert.match(await status.textContent(), /1 erreur · 1 avertissement/);
    assert.ok((await page.locator('.cm-lintRange-error').count()) > 0);
    await status.click();
    await page.locator('.cm-panel-lint').waitFor();
    assert.match(await page.locator('.cm-panel-lint').textContent(), /G0 et G1 sont incompatibles/);
    await shot(page, 'pc-sombre-verificateur');
    await page.locator('.cm-panel-lint button[name="close"]').click();

    await gotoSettings(page);
    await page.locator('.setting[data-key="checker.decimalPoint"] input').click();
    await gotoEditor(page);
    await page.waitForFunction(() => document.querySelector('[data-status="checker"]').textContent === '✕ 1 erreur');
    await gotoSettings(page);
    await page.locator('.setting[data-key="checker.decimalPoint"] input').click();
    await gotoEditor(page);
    await setText(page, before);
    await page.waitForFunction(() => document.querySelector('[data-status="checker"]').textContent === '✓ Aucune erreur');
  });

  await step('autocomplétion des codes G/M avec définition', async () => {
    const before = await editorText(page);
    await typeAtEnd(page, '\nG7');
    const options = page.locator('.cm-tooltip-autocomplete li');
    await options.first().waitFor();
    assert.match(await options.first().textContent(), /^G7\.1Interpolation cylindrique/);
    await page.keyboard.type('1');
    await page.waitForFunction(() => document.querySelector('.cm-tooltip-autocomplete li')?.textContent.startsWith('G71'));
    await page.keyboard.press('Enter');
    assert.match(await editorText(page), /\nG71$/);
    await typeAtEnd(page, ' M');
    await options.first().waitFor();
    assert.match(await options.first().textContent(), /^M00Arrêt programmé/, 'format G01 / M03 par défaut');
    await page.keyboard.press('Escape');
    await setText(page, before);
  });

  await step('état modal à la ligne du curseur (barre d’état et panneau)', async () => {
    await page.locator('.cm-line').nth(20).click(); // N160 Z-55.
    await page.waitForFunction(() => document.querySelector('[data-status="modal-state"]').textContent === 'G1 · G99 · G96 S220 · G40 · T0101 · M3');
    await page.locator('[data-tool="panel-modal"]').click();
    const panel = page.locator('.side-panel');
    assert.match(await panel.textContent(), /Après la ligne 21/);
    assert.match(await panel.textContent(), /Interpolation linéaire/);
    assert.match(await panel.textContent(), /outil 01 · correcteur 01/);
    assert.match(await panel.textContent(), /F0\.12mm\/tr/);
    assert.match(await panel.textContent(), /S3000tr\/min/);
    await page.locator('.cm-line').nth(33).click(); // N270 G76…
    await page.waitForFunction(() => document.querySelector('.side-panel').textContent.includes('T0303'));
    await shot(page, 'pc-sombre-etat-modal');
    await page.locator('[data-tool="panel-modal"]').click();
  });

  await step('renumérotation des blocs avec mise à jour des références', async () => {
    const before = await editorText(page);
    await page.locator('[data-tool="menu"]').click();
    await page.locator('.action-item', { hasText: 'Renuméroter' }).click();
    const dialog = page.locator('.dialog');
    await dialog.getByLabel('Premier numéro').fill('100');
    await dialog.getByLabel('Pas').fill('5');
    await dialog.locator('button', { hasText: 'Renuméroter' }).click();
    await page.waitForSelector('.dialog', { state: 'detached' });
    const after = await editorText(page);
    assert.match(after, /^N100 G21 G40 G97 G99$/m);
    const [, p, q] = after.match(/G71 P(\d+) Q(\d+)/);
    assert.match(after, new RegExp(`^N${p} G00 X16\\.$`, 'm'), 'P suit le bloc de début de profil');
    assert.match(after, new RegExp(`^N${q} Z-55\\.$`, 'm'), 'Q suit le bloc de fin de profil');
    assert.match(after, new RegExp(`G70 P${p} Q${q}`));
    await page.locator('[data-tool="undo"]').click();
    assert.equal(await editorText(page), before, 'une seule annulation');
  });

  await step('recherche et remplacement (Ctrl+F)', async () => {
    const before = await editorText(page);
    await page.locator('[data-tool="search"]').click();
    const panel = page.locator('.cm-search');
    await panel.waitFor();
    assert.match(await panel.textContent(), /tout remplacer/);
    await panel.locator('input[name="search"]').fill('M08');
    await panel.locator('input[name="replace"]').fill('M07');
    await panel.locator('button[name="replaceAll"]').click();
    assert.equal((await editorText(page)).includes('M08'), false);
    assert.ok((await editorText(page)).includes('M07'));
    await shot(page, 'pc-sombre-recherche');
    await panel.locator('button[name="close"]').click();
    await setText(page, before);
  });

  await step('décalage de coordonnées sur une sélection (cotes absolues seulement)', async () => {
    const before = await editorText(page);
    // Sélection des lignes 14 à 21 (profil N90 à N160).
    await page.evaluate(() => {
      const view = window.isoApp.editor.view;
      view.dispatch({ selection: { anchor: view.state.doc.line(14).from, head: view.state.doc.line(21).to } });
    });
    await page.locator('[data-tool="menu"]').click();
    await page.locator('.action-item', { hasText: 'Décaler les coordonnées' }).click();
    const dialog = page.locator('.dialog');
    await dialog.getByLabel('Décalage en Z').fill('-2');
    await dialog.locator('button', { hasText: 'Décaler' }).click();
    await page.waitForSelector('.dialog', { state: 'detached' });
    const after = await editorText(page);
    assert.match(after, /^N100 G01 Z-2\. F0\.12$/m);
    assert.match(after, /^N160 Z-57\.$/m);
    assert.match(after, /^N60 G00 X52\. Z2\. M08$/m, 'hors sélection : inchangé');
    assert.match(after, /^N20 G28 U0\. W0\.$/m);
    await page.locator('[data-tool="undo"]').click();
    assert.equal(await editorText(page), before);
  });

  await step('repliage d’une opération (changement d’outil)', async () => {
    const lines = await page.locator('.cm-line').count();
    await page.locator('.cm-foldGutter .cm-gutterElement span[title="Replier"]').first().click();
    await page.waitForSelector('.cm-foldPlaceholder');
    assert.match(await page.locator('.cm-foldPlaceholder').first().textContent(), /lignes · (opération|sous-programme)/);
    assert.ok((await page.locator('.cm-line').count()) < lines);
    await page.locator('.cm-foldPlaceholder').first().click();
    await page.waitForFunction(() => !document.querySelector('.cm-foldPlaceholder'));
  });

  await step('formulaire de cycle G76 : aperçu, conversions, insertion', async () => {
    const before = await editorText(page);
    await page.locator('[data-tool="panel-cycles"]').click();
    await page.locator('.cycle-item[data-cycle="g76"]').click();
    const preview = page.locator('.cycle-preview');
    assert.match(await preview.textContent(), /G76 X18\.16 Z-22\. P920 Q300 F1\.5/);
    await page.locator('.dialog input[data-field="pitch"]').fill('2');
    assert.match(await preview.textContent(), /G76 X17\.546 Z-22\. P1227 Q300 F2\./, 'recalcul en direct');
    await shot(page, 'pc-sombre-cycle-g76');
    await page.locator('.dialog button', { hasText: 'Insérer' }).click();
    await page.waitForSelector('.dialog', { state: 'detached' });
    assert.ok((await editorText(page)).includes('G76 X17.546 Z-22. P1227 Q300 F2.'));
    await setText(page, before);
    await page.locator('[data-tool="panel-cycles"]').click();
  });

  await step('bibliothèque : ajouter une sélection, insérer', async () => {
    await page.evaluate(() => {
      const view = window.isoApp.editor.view;
      view.dispatch({ selection: { anchor: view.state.doc.line(36).from, head: view.state.doc.line(37).to } });
    });
    await page.locator('[data-tool="panel-library"]').click();
    await page.locator('.side-panel button', { hasText: 'Ajouter à la bibliothèque' }).click();
    const dialog = page.locator('.dialog');
    assert.match(await dialog.locator('textarea.mono').inputValue(), /^N290 M05\nN300 M30$/);
    await dialog.getByLabel('Nom', { exact: true }).fill('Fin de programme');
    await dialog.locator('button', { hasText: 'Enregistrer' }).click();
    const item = page.locator('.side-panel .var-row[data-item="Fin de programme"]');
    await item.waitFor();
    const before = await editorText(page);
    await page.evaluate(() => window.isoApp.editor.view.dispatch({ selection: { anchor: 0 } }));
    await item.locator('button', { hasText: 'Insérer' }).click();
    assert.equal((await editorText(page)).split('\n').slice(1, 3).join('|'), 'N290 M05|N300 M30');
    await setText(page, before);
    await page.locator('[data-tool="panel-library"]').click();
  });

  await step('versions : enregistrer, comparer, restaurer', async () => {
    const openVersions = async () => {
      await page.locator('[data-tool="menu"]').click();
      await page.locator('.action-item', { hasText: 'Versions' }).click();
      await page.locator('.version-item').first().waitFor();
    };
    await openVersions();
    await page.locator('.dialog button', { hasText: 'Enregistrer une version' }).click();
    await page.locator('.dialog input').last().fill('Avant essai');
    await page.locator('.dialog button', { hasText: 'Enregistrer' }).last().click();
    await page.locator('.version-item', { hasText: 'Avant essai' }).waitFor();
    await page.locator('.dialog button', { hasText: 'Fermer' }).click();
    await page.waitForSelector('.dialog', { state: 'detached' });

    await typeAtEnd(page, '\n(VERSION B)');
    await openVersions();
    const version = page.locator('.version-item', { hasText: 'Avant essai' });
    assert.match(await version.textContent(), /\+1 \/ −0 lignes/);
    await version.locator('button', { hasText: 'Comparer' }).click();
    await page.waitForSelector('.diff-list');
    assert.match(await page.locator('.diff-line.is-insert').textContent(), /\+\(VERSION B\)$/);
    assert.match(await page.locator('.diff-legend').textContent(), /0 supprimée.*1 ajoutée/);
    await shot(page, 'pc-sombre-comparaison');
    await page.locator('.dialog button', { hasText: 'Fermer' }).last().click();
    await version.locator('button', { hasText: 'Restaurer' }).click();
    await page.locator('.dialog button', { hasText: 'Restaurer' }).last().click();
    await page.waitForFunction(() => !window.isoApp.editor.getText().includes('(VERSION B)'));
    await page.waitForSelector('.dialog', { state: 'detached' });
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
    await page.locator('[data-tool="menu"]').click();
    await page.locator('.action-item', { hasText: 'Télécharger' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.action-item', { hasText: '.nc' }).click(),
    ]);
    assert.equal(download.suggestedFilename(), 'Exemple - tournage Fanuc.nc');
    const content = await readFile(await download.path(), 'utf8');
    assert.match(content, /^%\r\nO1000/);
  });

  await step('cours : catalogue, préférences machine, schémas doublés', async () => {
    await navTo(page, 'cours', '.courses-page:not([hidden])');
    assert.equal(await page.locator('.lesson-card[href]').count(), 4, 'quatre leçons rédigées');
    assert.ok((await page.locator('.lesson-card.is-upcoming').count()) >= 10, 'leçons en préparation annoncées');
    await shot(page, 'ordinateur-cours-catalogue');
    await page.locator('.lesson-card[href="#/cours/repere-du-tour"]').click();
    await page.waitForSelector('.lesson-section');
    assert.deepEqual(await page.locator('.course-figure').first().locator('[data-turret]').evaluateAll((els) => els.map((el) => el.dataset.turret)), ['rear', 'front']);
    await page.locator('.course-machine [data-pref="turret"] .segment', { hasText: 'Avant' }).click();
    assert.deepEqual(await page.locator('.course-figure').first().locator('[data-turret]').evaluateAll((els) => els.map((el) => el.dataset.turret)), ['front']);
    await page.locator('.course-machine [data-pref="turret"] .segment', { hasText: 'Afficher les deux' }).click();
    assert.equal(await page.locator('.course-figure').first().locator('[data-turret]').count(), 2);
    await shot(page, 'ordinateur-cours-lecon');
  });

  await step('cours : définitions au clic (texte et exemple), variantes de système', async () => {
    await page.goto(url.split('#')[0] + '#/cours/programme-iso');
    await page.waitForSelector('[data-lesson-loaded], .lesson-section');
    await page.locator('.course-anatomy .code-token', { hasText: 'G01' }).click();
    assert.equal(await page.locator('.course-popover .def-code').textContent(), 'G1');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.course-popover').isVisible(), false);
    const example = page.locator('.code-view').last();
    await example.locator('.code-token', { hasText: 'T0101' }).click();
    assert.match(await example.locator('.code-view-def').textContent(), /outil 01/i);
    await page.goto(url.split('#')[0] + '#/cours/absolu-incremental');
    await page.waitForSelector('.course-variants');
    assert.deepEqual(await page.locator('.course-variant').evaluateAll((els) => els.map((el) => el.dataset.variant)), ['A', 'BC']);
    // En systèmes B/C, G91 est expliqué comme le mode incrémental (ISO générique).
    await page.locator('.course-variant[data-variant="BC"] .code-view .code-token', { hasText: 'G91' }).click();
    assert.match(await page.locator('.course-variant[data-variant="BC"] .code-view-def').textContent(), /incrémental/i);
  });

  await step('cours : ouvrir un exemple dans l’éditeur', async () => {
    await page.goto(url.split('#')[0] + '#/cours/programme-iso');
    await page.waitForSelector('[data-action="open-example"]');
    const previous = await page.evaluate(() => window.isoApp.workspace.current.id);
    await page.locator('[data-action="open-example"]').click();
    await page.waitForSelector('.editor-page:not([hidden])');
    assert.match(await editorText(page), /^%\nO0001 \(PREMIER PROGRAMME\)/);
    assert.equal(await page.evaluate(() => window.isoApp.workspace.current.name), 'Cours 1 - premier programme');
    assert.equal(await page.locator('.cm-lintRange-error').count(), 0, 'exemple sans erreur');
    await page.evaluate(async (id) => {
      const created = window.isoApp.workspace.current.id;
      await window.isoApp.workspace.open(id);
      await window.isoApp.workspace.remove(created);
    }, previous);
  });

  await step('cours : leçon terminée, leçon suivante, retour arrière, progression', async () => {
    await page.goto(url.split('#')[0] + '#/cours/programme-iso');
    await page.waitForSelector('[data-action="toggle-read"]');
    await page.locator('[data-action="toggle-read"]').click();
    await page.waitForFunction(() => location.hash === '#/cours/repere-du-tour');
    assert.equal(await page.locator('.lesson-header h1').textContent(), 'Le repère du tour');
    assert.equal(await page.locator('.courses-page').evaluate((el) => el.scrollTop), 0, 'nouvelle leçon affichée en haut');
    await page.goBack();
    await page.waitForFunction(() => location.hash === '#/cours/programme-iso');
    assert.match(await page.locator('[data-action="toggle-read"]').textContent(), /non lue/);
    await page.locator('.course-back').click();
    assert.equal(await page.locator('li[data-lesson="programme-iso"]').getAttribute('data-status'), 'read');
    assert.equal(await page.locator('li[data-lesson="repere-du-tour"]').getAttribute('data-status'), 'opened');
    assert.match(await page.locator('.course-progress').textContent(), /1 leçon terminée sur 4/);
  });

  await step('cours désactivables (page et menu retirés, puis rétablis)', async () => {
    await gotoSettings(page);
    await toggle(page, 'modules.courses');
    assert.equal(await page.locator('.courses-page').count(), 0);
    assert.equal(await page.locator('.sidenav [data-nav="cours"] a').count(), 0);
    await toggle(page, 'modules.courses');
    assert.equal(await page.locator('.sidenav [data-nav="cours"] a').count(), 1);
  });

  await step('paramètres : recherche, raccourcis vers les sections, emplacement des fonctionnalités', async () => {
    await gotoSettings(page);
    const search = page.locator('.settings-search-input');
    await search.fill('repliage');
    const visibleRows = () => page.locator('.settings-page [data-search]:not(.is-filtered)').evaluateAll((els) => els.filter((el) => el.offsetParent).map((el) => el.dataset.moduleRow ?? el.dataset.key ?? el.textContent.slice(0, 20)));
    assert.deepEqual(await visibleRows(), ['folding']);
    assert.equal(await page.locator('.settings-card[data-section="apparence"]').isVisible(), false, 'section sans rapport masquée');
    assert.match(await page.locator('[data-module-row="folding"] .module-where').textContent(), /Outils|marge/);
    await search.fill('theme'); // sans accent
    assert.equal(await page.locator('.setting[data-key="theme"]').isVisible(), true);
    await search.fill('xyzzy');
    assert.equal(await page.locator('.settings-empty').isVisible(), true);
    await search.press('Escape');
    assert.equal(await search.inputValue(), '');
    assert.equal(await page.locator('.settings-card.is-filtered').count(), 0);
    await page.locator('.settings-chips .chip', { hasText: 'À propos' }).click();
    await page.waitForTimeout(600);
    const inView = await page.locator('#section-apropos').evaluate((el) => {
      const header = document.querySelector('.settings-header').getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return box.top >= header.bottom - 1 && box.top < innerHeight;
    });
    assert.equal(inView, true, 'section visible sous l’en-tête fixe');
    assert.ok((await page.locator('.shortcut-table tr').count()) >= 10, 'raccourcis clavier listés');
    await shot(page, 'ordinateur-parametres-apropos');
  });

  await step('tout désactiver : seul le socle reste, l’éditeur fonctionne', async () => {
    await page.locator('.module-summary [data-bulk="off"]').click();
    const total = await page.evaluate(() => window.isoApp.registry.list().length);
    assert.equal(await page.evaluate(() => window.isoApp.registry.list().filter((m) => window.isoApp.registry.isActive(m.id)).length), 0);
    assert.match(await page.locator('.module-summary .module-count').textContent(), new RegExp(`^0 fonctionnalité active sur ${total}$`));
    assert.equal(await page.locator('.shortcut-table tr.is-off').count() > 0, true);
    await shot(page, 'ordinateur-parametres-tout-desactive');
    assert.equal(await page.locator('.sidenav [data-nav="calculateurs"]').count(), 0, 'page Calculateurs retirée du menu');
    assert.deepEqual(await page.locator('.sidenav .is-upcoming .sidenav-label').allTextContents(), ['Cours d’ISO', 'Simulation 2D']);
    await gotoEditor(page);
    assert.equal(await page.locator('.cm-gutters').count(), 0, 'aucune marge');
    assert.equal(await page.locator('.cm-content [class*="tok-"]').count(), 0, 'aucune coloration');
    const tools = await page.locator('.toolbar [data-tool]:visible').evaluateAll((els) => els.map((el) => el.dataset.tool));
    assert.deepEqual(tools.sort(), ['programs', 'save']);
    const before = await editorText(page);
    await typeAtEnd(page, '\nG0 X10');
    assert.equal(await editorText(page), `${before}\nG0 X10`);
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => !window.isoApp.workspace.dirty);
    await page.locator('.cm-content').click({ position: { x: 20, y: 10 } });
    assert.equal(await page.locator('.cm-tooltip').count(), 0, 'pas d’infobulle de définition');
    await shot(page, 'ordinateur-editeur-socle');
    await setText(page, before);
    await page.keyboard.press('Control+s');
  });

  await step('tout réactiver : toutes les fonctionnalités reviennent', async () => {
    await gotoSettings(page);
    await page.locator('.module-summary [data-bulk="on"]').click();
    const inactive = await page.evaluate(() => window.isoApp.registry.list().filter((m) => !window.isoApp.registry.isActive(m.id)).map((m) => m.id));
    assert.deepEqual(inactive, []);
    await page.locator('.module-group[data-group="outils"] [data-bulk="off"]').click();
    assert.equal(await page.evaluate(() => window.isoApp.registry.isActive('cycles') || window.isoApp.registry.isActive('renumber')), false);
    assert.equal(await page.evaluate(() => window.isoApp.registry.isActive('lineNumbers')), true, 'autres groupes intacts');
    await page.locator('.module-group[data-group="outils"] [data-bulk="on"]').click();
    await gotoEditor(page);
    assert.ok((await page.locator('.cm-gutters').count()) > 0);
    assert.ok((await page.locator('.cm-content [class*="tok-"]').count()) > 0);
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
  assert.ok(data.sections.cours.lessons['programme-iso'].readAt, 'progression des cours sauvegardée');
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
  await navTo(page, 'cours', '.courses-page:not([hidden])');
  assert.equal(await page.locator('li[data-lesson="programme-iso"]').getAttribute('data-status'), 'read', 'progression restaurée');
  await gotoSettings(page);

  // « Tout effacer » : confirmation forte, puis retour à l'état d'un premier lancement.
  await page.locator('[data-action="wipe"]').click();
  await page.locator('.dialog button', { hasText: 'Tout effacer' }).click();
  assert.equal(await page.locator('.dialog').isVisible(), true, 'refusé sans le mot de confirmation');
  await page.locator('.dialog input[name="confirm"]').fill('effacer');
  await Promise.all([page.waitForEvent('load'), page.locator('.dialog button', { hasText: 'Tout effacer' }).click()]);
  await waitReady(page);
  const after = await page.evaluate(async () => ({
    programs: (await window.isoApp.workspace.list()).map((p) => p.name),
    custom: window.isoApp.profiles.list().filter((p) => !p.builtin).length,
    theme: window.isoApp.settings.isExplicit('theme'),
  }));
  assert.deepEqual(after, { programs: ['Exemple — tournage Fanuc'], custom: 0, theme: false });
  assert.equal(await page.locator('.home-page').isVisible(), true);
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
  /** Vrai si rien ne déborde horizontalement ; sinon la liste des éléments fautifs (diagnostic). */
  const noHorizontalScroll = async () => {
    const offenders = await page.evaluate(() => {
      const containers = [...document.querySelectorAll('html, body, .page:not([hidden])')].filter((el) => el.scrollWidth > el.clientWidth);
      if (!containers.length) return [];
      return [...document.querySelectorAll('.page:not([hidden]) *')]
        .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} → ${Math.round(el.getBoundingClientRect().right)}px`)
        .concat(containers.map((el) => `${el.tagName} ${el.scrollWidth}/${el.clientWidth}`));
    });
    return offenders.length ? offenders : true;
  };

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

  await step('tableau des variables en volet bas sur smartphone', async () => {
    await page.locator('[data-tool="panel-variables"]').tap();
    await page.locator('.side-panel .var-row').first().waitFor();
    assert.equal(await noHorizontalScroll(), true);
    const box = await page.locator('.side-panel').boundingBox();
    assert.ok(box.width <= 375 && box.y > 200, 'volet en bas de l’écran');
    await shot(page, 'mobile-clair-variables');
    await page.locator('.side-panel button[aria-label="Fermer le panneau"]').tap();
    assert.equal(await page.locator('.side-panel').isVisible(), false);
  });

  await step('état modal et vérificateur sur smartphone', async () => {
    await page.locator('[data-tool="panel-modal"]').tap();
    await page.locator('.side-panel .modal-row').first().waitFor();
    assert.equal(await noHorizontalScroll(), true);
    await shot(page, 'mobile-clair-etat-modal');
    await page.locator('.side-panel button[aria-label="Fermer le panneau"]').tap();
    assert.match(await page.locator('[data-status="checker"]').textContent(), /✓ Aucune erreur/);
  });

  await step('cycles et menu Outils sur smartphone', async () => {
    await page.locator('[data-tool="panel-cycles"]').tap();
    await page.locator('.cycle-item').first().waitFor();
    assert.equal(await noHorizontalScroll(), true);
    await page.locator('.cycle-item[data-cycle="g71"]').tap();
    await page.waitForSelector('.cycle-preview');
    const overflow = await page.locator('dialog.dialog').evaluate((el) => [el.scrollWidth, el.clientWidth, el.scrollLeft]);
    assert.ok(overflow[0] <= overflow[1] && overflow[2] === 0, `formulaire sans défilement horizontal (${overflow})`);
    await shot(page, 'mobile-clair-cycle-g71');
    await page.locator('.dialog button', { hasText: 'Annuler' }).tap();
    await page.locator('.side-panel button[aria-label="Fermer le panneau"]').tap();
    await page.locator('[data-tool="menu"]').tap();
    await page.waitForSelector('.dialog.sheet[open]');
    await shot(page, 'mobile-clair-outils');
    await page.keyboard.press('Escape');
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

  await step('cours lisibles en largeur smartphone, définition au tap', async () => {
    await navTo(page, 'cours', '.courses-page:not([hidden])');
    assert.equal(await noHorizontalScroll(), true);
    await shot(page, 'mobile-clair-cours');
    await page.locator('.lesson-card[href="#/cours/deplacements"]').tap();
    await page.waitForSelector('.lesson-section');
    assert.equal(await noHorizontalScroll(), true);
    const example = page.locator('.code-view').last();
    await example.scrollIntoViewIfNeeded();
    await example.locator('.code-token', { hasText: 'G03' }).tap();
    assert.equal(await example.locator('.code-view-def').isVisible(), true);
    assert.equal(await noHorizontalScroll(), true);
    await shot(page, 'mobile-clair-cours-exemple');
    await page.locator('.course-figure').first().scrollIntoViewIfNeeded();
    await shot(page, 'mobile-clair-cours-schema');
  });

  await step('paramètres lisibles, sans défilement horizontal', async () => {
    await gotoSettings(page);
    assert.equal(await noHorizontalScroll(), true);
    await shot(page, 'mobile-clair-parametres');
    await page.locator('.settings-chips .chip', { hasText: 'Fonctionnalités' }).tap();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.settings-header').isVisible(), true, 'en-tête toujours visible');
    assert.equal(await noHorizontalScroll(), true);
    await shot(page, 'mobile-clair-parametres-fonctionnalites');
    await page.locator('.settings-search-input').fill('raccourci');
    assert.equal(await noHorizontalScroll(), true);
    await page.locator('.settings-search-input').fill('');
    await page.locator('.settings-chips .chip', { hasText: 'À propos' }).tap();
    await page.waitForTimeout(600);
    assert.equal(await noHorizontalScroll(), true);
    await shot(page, 'mobile-clair-parametres-raccourcis');
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
