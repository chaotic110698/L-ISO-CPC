import { h, domId, downloadText, pickFile, readTextFile } from '../../core/dom.js';
import { isoDate } from '../../core/util.js';
import { STORES } from '../../storage/database.js';
import { SETTINGS_SECTIONS, MODULE_GROUPS } from '../../settings/schema.js';
import { APP_VERSION } from '../../version.js';
import { icon } from '../icons.js';
import { openDialog, confirmDialog } from '../dialogs.js';
import { toast } from '../toast.js';

/** Raccourcis clavier ; `module` : fonctionnalité qui le fournit (absent : toujours présent). */
const SHORTCUTS = [
  { keys: ['Ctrl+S'], action: 'Enregistrer le programme' },
  { keys: ['Ctrl+Z'], action: 'Annuler', module: 'history' },
  { keys: ['Ctrl+Y', 'Ctrl+Maj+Z'], action: 'Rétablir', module: 'history' },
  { keys: ['Ctrl+F'], action: 'Rechercher et remplacer', module: 'search' },
  { keys: ['F3', 'Maj+F3'], action: 'Occurrence suivante / précédente', module: 'search' },
  { keys: ['Ctrl+Alt+G'], action: 'Aller à la ligne', module: 'search' },
  { keys: ['F1', 'Ctrl+I'], action: 'Définition de l’élément sous le curseur', module: 'definitions' },
  { keys: ['Ctrl+Espace'], action: 'Ouvrir les suggestions', module: 'autocomplete' },
  { keys: ['Ctrl+Maj+M'], action: 'Liste des erreurs et avertissements', module: 'checker' },
  { keys: ['Ctrl+Maj+['], action: 'Replier le bloc sous le curseur', module: 'folding' },
  { keys: ['Ctrl+Maj+]'], action: 'Déplier le bloc sous le curseur', module: 'folding' },
  { keys: ['Ctrl+Alt+[', 'Ctrl+Alt+]'], action: 'Tout replier / tout déplier', module: 'folding' },
  { keys: ['Échap'], action: 'Fermer l’infobulle, la liste ou le panneau ouvert' },
];

/** Texte sans accents ni majuscules, pour une recherche tolérante. */
const normalize = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .toLowerCase();

/**
 * Page « Paramètres », générée à partir du schéma des réglages et de la liste des modules :
 * toute nouvelle entrée de schéma ou tout nouveau module y apparaît sans code supplémentaire.
 * Les changements sont appliqués immédiatement.
 *
 * En-tête fixe : recherche dans les réglages (masque les lignes et sections sans rapport)
 * et raccourcis vers chaque section.
 */
export function createSettingsPage({ settings, registry, backup, workspace, db, kv, profiles, bus }) {
  const page = h('section', { class: 'settings-page', 'aria-label': 'Paramètres' });
  const inner = h('div', { class: 'settings-inner' });

  const searchInput = h('input', {
    type: 'search',
    class: 'input settings-search-input',
    placeholder: 'Rechercher un réglage…',
    'aria-label': 'Rechercher dans les paramètres',
    autocomplete: 'off',
    oninput: () => applyFilter(),
    onkeydown: (event) => {
      if (event.key === 'Escape' && searchInput.value) {
        event.stopPropagation();
        searchInput.value = '';
        applyFilter();
      }
    },
  });
  const chips = h('nav', { class: 'settings-chips', 'aria-label': 'Sections des paramètres' });
  const header = h(
    'div',
    { class: 'settings-header' },
    h(
      'div',
      { class: 'settings-header-inner' },
      h('h1', { class: 'page-title' }, 'Paramètres'),
      h('label', { class: 'settings-search' }, icon('search'), searchInput),
      chips,
    ),
  );
  const noResult = h('p', { class: 'settings-empty card-description', hidden: true });
  inner.append(noResult);
  page.append(header, inner);

  const renderers = {
    profils: renderProfiles,
    modules: renderModules,
    donnees: renderData,
    apropos: renderAbout,
  };

  const cards = [];
  for (const section of SETTINGS_SECTIONS) {
    const body = renderers[section.id]?.() ?? renderEntries(settings.entries().filter((e) => e.section === section.id));
    if (!body) continue;
    const card = h(
      'section',
      { class: 'card settings-card', 'aria-labelledby': `section-${section.id}`, dataset: { section: section.id } },
      h('h2', { id: `section-${section.id}`, class: 'card-title' }, section.title),
      section.description ? h('p', { class: 'card-description' }, section.description) : null,
      body,
    );
    cards.push(card);
    inner.append(card);
    chips.append(
      h(
        'button',
        {
          type: 'button',
          class: 'chip',
          dataset: { section: section.id },
          onclick: () => {
            if (card.classList.contains('is-filtered')) {
              searchInput.value = '';
              applyFilter();
            }
            page.scrollTo({ top: Math.max(0, card.offsetTop - header.offsetHeight - 12), behavior: 'smooth' });
          },
        },
        section.title,
      ),
    );
  }

  // ---- Recherche --------------------------------------------------------------------
  // Unités de recherche : éléments marqués [data-search] (une ligne de réglage, une
  // fonctionnalité avec ses sous-réglages…). Une section dont le titre correspond reste
  // entière ; une section sans unité est recherchée dans tout son texte.

  function applyFilter() {
    const query = normalize(searchInput.value.trim());
    let visibleCards = 0;
    for (const card of cards) {
      const units = [...card.querySelectorAll('[data-search]')];
      let visible;
      if (!query || normalize(card.querySelector('.card-title').textContent).includes(query)) {
        units.forEach((unit) => unit.classList.remove('is-filtered'));
        visible = true;
      } else if (units.length) {
        visible = false;
        for (const unit of units) {
          const match = normalize(unit.textContent).includes(query);
          unit.classList.toggle('is-filtered', !match);
          visible ||= match;
        }
      } else {
        visible = normalize(card.textContent).includes(query);
      }
      for (const group of card.querySelectorAll('.module-group')) {
        group.classList.toggle('is-filtered', Boolean(query) && !group.querySelector('[data-search]:not(.is-filtered)'));
      }
      card.classList.toggle('is-filtered', !visible);
      card.classList.toggle('is-searching', Boolean(query));
      chips.querySelector(`[data-section="${card.dataset.section}"]`)?.classList.toggle('is-dimmed', !visible);
      if (visible) visibleCards++;
    }
    noResult.hidden = !query || visibleCards > 0;
    noResult.textContent = `Aucun réglage ne correspond à « ${searchInput.value.trim()} ».`;
  }

  // ---- Réglages simples -------------------------------------------------------------

  function renderEntries(entries) {
    if (!entries.length) return null;
    return h('div', { class: 'setting-list' }, entries.map(renderEntry));
  }

  function renderEntry(entry) {
    const id = domId('setting');
    const label = h('label', { class: 'setting-label', for: id }, entry.label);
    const description = entry.description ? h('p', { class: 'setting-description' }, entry.description) : null;
    const text = h('div', { class: 'setting-text' }, label, description);
    let control;

    if (entry.type === 'boolean') {
      control = switchControl(id, entry.key);
    } else if (entry.type === 'choice') {
      label.removeAttribute('for');
      control = segmentedControl(entry);
    } else if (entry.type === 'number') {
      control = rangeControl(id, entry);
    } else {
      control = h('input', { id, class: 'input', value: settings.get(entry.key), onchange: (e) => settings.set(entry.key, e.target.value) });
    }
    return h('div', { class: `setting setting-${entry.type}`, dataset: { key: entry.key, search: '' } }, text, control);
  }

  function switchControl(id, key) {
    const input = h('input', {
      id,
      type: 'checkbox',
      role: 'switch',
      checked: settings.get(key),
      onchange: (e) => settings.set(key, e.target.checked),
    });
    settings.subscribe(key, (value) => (input.checked = value));
    return h('span', { class: 'switch' }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' }));
  }

  function segmentedControl(entry) {
    const name = domId('choice');
    const inputs = [];
    const group = h(
      'div',
      { class: 'segmented', role: 'radiogroup', 'aria-label': entry.label },
      entry.options.map((option) => {
        const input = h('input', {
          type: 'radio',
          name,
          value: option.value,
          checked: settings.get(entry.key) === option.value,
          onchange: () => settings.set(entry.key, option.value),
        });
        inputs.push(input);
        return h('label', { class: 'segment' }, input, option.icon ? icon(option.icon) : null, h('span', null, option.label));
      }),
    );
    settings.subscribe(entry.key, (value) => inputs.forEach((input) => (input.checked = input.value === value)));
    return group;
  }

  function rangeControl(id, entry) {
    const output = h('output', { for: id, class: 'range-value' });
    const show = (value) => (output.textContent = `${value}${entry.unit ? ' ' + entry.unit : ''}`);
    const input = h('input', {
      id,
      type: 'range',
      min: entry.min,
      max: entry.max,
      step: entry.step ?? 1,
      value: settings.get(entry.key),
      oninput: (e) => {
        show(e.target.value);
        settings.set(entry.key, Number(e.target.value));
      },
    });
    show(settings.get(entry.key));
    settings.subscribe(entry.key, (value) => {
      input.value = value;
      show(value);
    });
    return h('div', { class: 'range' }, input, output);
  }

  // ---- Profils machines ---------------------------------------------------------------

  function renderProfiles() {
    const list = h('div', { class: 'setting-list' });
    const fill = () => {
      list.replaceChildren(
        ...profiles.list().map((profile) => {
          const id = domId('profile');
          const input = h('input', {
            id,
            type: 'checkbox',
            role: 'switch',
            checked: profile.enabled,
            onchange: (e) => profiles.update(profile.id, { enabled: e.target.checked }).catch((error) => toast(error.message, { type: 'error' })),
          });
          return h(
            'div',
            { class: 'setting', dataset: { profile: profile.id, search: '' } },
            h(
              'div',
              { class: 'setting-text' },
              h('label', { class: 'setting-label', for: id }, profile.name),
              h('p', { class: 'setting-description' }, profile.builtin ? 'Profil intégré' : 'Profil personnel'),
            ),
            h('span', { class: 'switch' }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' })),
          );
        }),
      );
      if (searchInput.value) applyFilter();
    };
    bus.on('profiles:changed', fill);
    fill();
    return h(
      'div',
      { class: 'data-section' },
      list,
      h('div', { class: 'button-row' }, h('a', { class: 'btn', href: '#/profils' }, icon('machine'), 'Gérer les profils machines')),
    );
  }

  // ---- Fonctionnalités (modules) ------------------------------------------------------

  function renderModules() {
    const modules = registry.list();
    const container = h('div', { class: 'module-groups' });
    const statusEls = new Map();
    const counters = [];

    const setAll = (mods, enabled) => {
      for (const mod of mods) settings.set(registry.toggleKey(mod.id), enabled);
    };
    const bulkButtons = (mods, scopeLabel) =>
      h(
        'div',
        { class: 'bulk-actions' },
        h('button', { type: 'button', class: 'btn btn-small', 'aria-label': `Tout activer : ${scopeLabel}`, dataset: { bulk: 'on' }, onclick: () => setAll(mods, true) }, 'Tout activer'),
        h('button', { type: 'button', class: 'btn btn-small', 'aria-label': `Tout désactiver : ${scopeLabel}`, dataset: { bulk: 'off' }, onclick: () => setAll(mods, false) }, 'Tout désactiver'),
      );
    const counter = (mods) => {
      const el = h('span', { class: 'module-count' });
      counters.push({ el, mods });
      return el;
    };

    container.append(h('div', { class: 'module-summary' }, counter(modules), bulkButtons(modules, 'toutes les fonctionnalités')));

    for (const group of MODULE_GROUPS) {
      const inGroup = modules.filter((mod) => (mod.group ?? 'outils') === group.id);
      if (!inGroup.length) continue;
      container.append(
        h(
          'div',
          { class: 'module-group', dataset: { group: group.id } },
          h(
            'div',
            { class: 'module-group-head' },
            h('h3', { class: 'module-group-title' }, group.label, ' ', counter(inGroup)),
            bulkButtons(inGroup, group.label),
          ),
          h(
            'div',
            { class: 'setting-list' },
            inGroup.map((mod) => {
              const row = renderEntry(settings.entry(registry.toggleKey(mod.id)));
              delete row.dataset.search;
              const text = row.querySelector('.setting-text');
              if (mod.where) text.append(h('p', { class: 'module-where' }, icon('info'), h('span', null, mod.where)));
              const status = h('p', { class: 'module-status', hidden: true });
              text.append(status);
              statusEls.set(mod.id, status);
              const own = settings.entries().filter((e) => e.parentModule === mod.id);
              const info = mod.renderInfo?.();
              const sub =
                own.length || info
                  ? h('div', { class: 'module-settings', dataset: { module: mod.id } }, own.map((entry) => {
                      const el = renderEntry(entry);
                      delete el.dataset.search;
                      return el;
                    }), info)
                  : null;
              return h('div', { class: 'module-row', dataset: { search: '', moduleRow: mod.id } }, row, sub);
            }),
          ),
        ),
      );
    }

    const refresh = () => {
      for (const [id, el] of statusEls) {
        const status = registry.status(id);
        const messages = {
          blocked: 'Inactif : une fonctionnalité dont il dépend est désactivée.',
          error: `Erreur au chargement : ${registry.error(id)?.message ?? 'inconnue'}`,
        };
        el.hidden = !messages[status];
        el.textContent = messages[status] ?? '';
        el.dataset.tone = status === 'error' ? 'error' : 'warning';
        const sub = container.querySelector(`.module-settings[data-module="${id}"]`);
        if (sub) sub.hidden = status !== 'active';
      }
      for (const { el, mods } of counters) {
        const active = mods.filter((mod) => registry.isActive(mod.id)).length;
        el.textContent = mods.length === modules.length ? `${active} fonctionnalité${active > 1 ? 's' : ''} active${active > 1 ? 's' : ''} sur ${mods.length}` : `${active}/${mods.length}`;
      }
    };
    registry.onChange(refresh);
    refresh();
    return container;
  }

  // ---- Données : sauvegarde / restauration ----------------------------------------------

  function renderData() {
    const info = h('p', { class: 'data-info' });
    const updateInfo = async () => {
      const programs = await workspace.list();
      const kinds = { indexeddb: 'IndexedDB', localstorage: 'stockage local (repli)', memory: 'mémoire uniquement — rien ne sera conservé !' };
      let usage = '';
      try {
        const estimate = await navigator.storage?.estimate?.();
        if (estimate?.usage != null) usage = ` · ${(estimate.usage / 1024 / 1024).toFixed(1)} Mo utilisés`;
      } catch {
        // estimation indisponible (file://, ancien navigateur)
      }
      info.textContent = `${programs.length} programme${programs.length > 1 ? 's' : ''} · stockage : ${kinds[db.kind] ?? db.kind}${usage}`;
      info.dataset.tone = db.kind === 'memory' ? 'error' : '';
    };
    updateInfo();
    page.addEventListener('page:show', updateInfo);

    return h(
      'div',
      { class: 'data-section' },
      info,
      h(
        'p',
        { class: 'card-description' },
        'Vos données restent dans ce navigateur. Exportez une sauvegarde pour les conserver, les transférer sur un autre appareil ou les restaurer.',
      ),
      h(
        'div',
        { class: 'button-row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: exportBackup }, icon('download'), 'Exporter une sauvegarde'),
        h('button', { type: 'button', class: 'btn', onclick: () => importBackup().then(updateInfo) }, icon('upload'), 'Importer une sauvegarde'),
      ),
      h(
        'div',
        { class: 'button-row' },
        h('button', { type: 'button', class: 'btn btn-danger-outline', onclick: resetSettings }, 'Réinitialiser les paramètres'),
        h('button', { type: 'button', class: 'btn btn-danger-outline', dataset: { action: 'wipe' }, onclick: wipeAll }, icon('trash'), 'Tout effacer'),
      ),
      h('p', { class: 'card-description' }, '« Tout effacer » supprime de ce navigateur tous les programmes, profils, macros, versions, la bibliothèque et les réglages (utile sur un poste partagé).'),
    );
  }

  function sectionCheckboxes(items) {
    return h(
      'fieldset',
      { class: 'checklist' },
      h('legend', null, 'Contenu'),
      items.map((item) =>
        h(
          'label',
          { class: 'check' },
          h('input', { type: 'checkbox', name: 'section', value: item.id, checked: item.known !== false, disabled: item.known === false }),
          h('span', null, item.label, item.description ? h('small', null, ` — ${item.description}`) : null, item.known === false ? h('small', null, ' (non reconnu, ignoré)') : null),
        ),
      ),
    );
  }

  const checkedSections = (form) => [...form.querySelectorAll('input[name="section"]:checked')].map((input) => input.value);

  async function exportBackup() {
    const body = h('div', null, h('p', null, 'Choisissez les données à inclure dans le fichier de sauvegarde (.json).'), sectionCheckboxes(backup.list()));
    let sections = [];
    const choice = await openDialog({
      title: 'Exporter une sauvegarde',
      body,
      actions: [{ label: 'Exporter', value: 'export', primary: true }, { label: 'Annuler' }],
      validate: (_value, form) => {
        sections = checkedSections(form);
        return sections.length ? null : 'Sélectionnez au moins un élément.';
      },
    });
    if (choice !== 'export') return;
    try {
      await workspace.save();
      const data = await backup.export(sections);
      downloadText(`l-iso-cpc-sauvegarde-${isoDate()}.json`, JSON.stringify(data, null, 2), 'application/json');
      toast('Sauvegarde exportée.', { type: 'success' });
    } catch (error) {
      console.error(error);
      toast(`Échec de l’export : ${error.message}`, { type: 'error' });
    }
  }

  async function importBackup() {
    const file = await pickFile({ accept: '.json,application/json' });
    if (!file) return;
    let parsed;
    try {
      parsed = backup.parse(await readTextFile(file));
    } catch (error) {
      toast(error.message, { type: 'error' });
      return;
    }

    const exportedAt = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('fr-FR') : 'date inconnue';
    const modeName = domId('mode');
    const body = h(
      'div',
      null,
      h('p', null, `Sauvegarde du ${exportedAt} (version ${parsed.appVersion ?? '?'}).`),
      sectionCheckboxes(backup.summarize(parsed)),
      h(
        'fieldset',
        { class: 'checklist' },
        h('legend', null, 'Mode d’import'),
        h(
          'label',
          { class: 'check' },
          h('input', { type: 'radio', name: modeName, value: 'merge', checked: true }),
          h('span', null, 'Fusionner', h('small', null, ' — ajoute les éléments absents et met à jour ceux qui sont plus récents dans le fichier')),
        ),
        h(
          'label',
          { class: 'check' },
          h('input', { type: 'radio', name: modeName, value: 'replace' }),
          h('span', null, 'Remplacer', h('small', null, ' — efface les données actuelles des éléments cochés avant l’import')),
        ),
      ),
    );
    let sections = [];
    let mode = 'merge';
    const choice = await openDialog({
      title: 'Importer une sauvegarde',
      body,
      actions: [{ label: 'Importer', value: 'import', primary: true }, { label: 'Annuler' }],
      validate: (_value, form) => {
        sections = checkedSections(form);
        mode = form.querySelector(`input[name="${modeName}"]:checked`)?.value ?? 'merge';
        return sections.length ? null : 'Sélectionnez au moins un élément.';
      },
    });
    if (choice !== 'import') return;

    if (mode === 'replace') {
      const ok = await confirmDialog({
        title: 'Remplacer les données',
        message: 'Les données actuelles des éléments cochés seront effacées puis remplacées par celles du fichier. Continuer ?',
        confirmLabel: 'Remplacer',
        danger: true,
      });
      if (!ok) return;
    }

    try {
      await workspace.save();
      const results = await backup.import(parsed, { sections, mode });
      await workspace.reload();
      toast(describeImport(results), { type: 'success', timeout: 5000 });
    } catch (error) {
      console.error(error);
      toast(`Échec de l’import : ${error.message}`, { type: 'error' });
    }
  }

  function describeImport(results) {
    const parts = [];
    const programs = results.programmes;
    if (programs) parts.push(`${programs.added} programme(s) ajouté(s), ${programs.updated} mis à jour`);
    if (results.profils) parts.push(`${results.profils.added} profil(s) ajouté(s), ${results.profils.updated} mis à jour`);
    if (results.parametres) parts.push(`${results.parametres.applied} réglage(s) appliqué(s)`);
    return parts.length ? `Import terminé : ${parts.join(' ; ')}.` : 'Import terminé.';
  }

  async function resetSettings() {
    const ok = await confirmDialog({
      title: 'Réinitialiser les paramètres',
      message: 'Tous les réglages (thème, fonctionnalités…) reprendront leur valeur par défaut. Vos programmes ne sont pas touchés.',
      confirmLabel: 'Réinitialiser',
      danger: true,
    });
    if (!ok) return;
    settings.resetAll();
    toast('Paramètres réinitialisés.');
  }

  async function wipeAll() {
    const WORD = 'EFFACER';
    const input = h('input', { class: 'input', name: 'confirm', autocomplete: 'off', 'aria-label': `Tapez ${WORD} pour confirmer` });
    const choice = await openDialog({
      title: 'Tout effacer',
      body: h(
        'div',
        { class: 'data-section' },
        h('p', null, 'Tous les programmes, profils personnels, macros, versions, éléments de bibliothèque et réglages de ce navigateur seront définitivement supprimés. Exportez d’abord une sauvegarde si nécessaire.'),
        h('p', null, 'Pour confirmer, tapez ', h('strong', null, WORD), ' :'),
        input,
      ),
      actions: [{ label: 'Tout effacer', value: 'wipe', danger: true }, { label: 'Annuler' }],
      validate: (value) => (value === 'wipe' && input.value.trim().toUpperCase() !== WORD ? `Tapez ${WORD} pour confirmer.` : null),
    });
    if (choice !== 'wipe') return;
    try {
      workspace.detach();
      for (const store of STORES) await db.clear(store);
      for (const key of kv.keys()) kv.remove(key);
    } catch (error) {
      console.error(error);
      toast(`Échec de l’effacement : ${error.message}`, { type: 'error' });
      return;
    }
    location.hash = '#/accueil';
    location.reload();
  }

  // ---- À propos ------------------------------------------------------------------------

  function renderShortcuts() {
    const rows = SHORTCUTS.map((shortcut) => {
      const row = h(
        'tr',
        { dataset: { search: '' } },
        h(
          'td',
          { class: 'shortcut-keys' },
          shortcut.keys.flatMap((combo, i) => [
            i ? h('span', { class: 'shortcut-or' }, ' ou ') : null,
            h('span', { class: 'shortcut-combo' }, combo.split(/\+(?=.)/).flatMap((key, j) => [j ? '+' : null, h('kbd', null, key)])),
          ]),
        ),
        h('td', null, shortcut.action, h('small', { class: 'shortcut-off', hidden: true }, ' — fonctionnalité désactivée')),
      );
      return { row, shortcut };
    });
    const refresh = () => {
      for (const { row, shortcut } of rows) {
        const off = Boolean(shortcut.module) && !registry.isActive(shortcut.module);
        row.classList.toggle('is-off', off);
        row.querySelector('.shortcut-off').hidden = !off;
      }
    };
    registry.onChange(refresh);
    refresh();
    return h(
      'div',
      { class: 'shortcuts' },
      h('h3', { class: 'module-group-title' }, 'Raccourcis clavier'),
      h('table', { class: 'shortcut-table' }, h('tbody', null, rows.map(({ row }) => row))),
      h('p', { class: 'card-description' }, 'Sur Mac : ⌘ Cmd au lieu de Ctrl.'),
    );
  }

  function renderAbout() {
    return h(
      'div',
      { class: 'about' },
      h(
        'div',
        { class: 'about-text', dataset: { search: '' } },
        h('p', null, h('strong', null, `L-ISO-CPC ${APP_VERSION}`), ' — éditeur et documentation de programmation ISO / G-code.'),
        h('p', null, 'Fonctionne entièrement dans le navigateur, sans connexion internet : aucune donnée n’est envoyée.'),
        h(
          'p',
          null,
          'Composant d’édition : CodeMirror 6 (licence MIT). ',
          h('a', { href: 'dist/THIRD_PARTY_LICENSES.txt', target: '_blank', rel: 'noopener' }, 'Licences des bibliothèques'),
        ),
      ),
      renderShortcuts(),
    );
  }

  return page;
}
