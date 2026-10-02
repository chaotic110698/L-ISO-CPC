import { h, domId, downloadText, pickFile, readTextFile } from '../../core/dom.js';
import { isoDate } from '../../core/util.js';
import { SETTINGS_SECTIONS, MODULE_GROUPS } from '../../settings/schema.js';
import { APP_VERSION } from '../../version.js';
import { icon } from '../icons.js';
import { openDialog, confirmDialog } from '../dialogs.js';
import { toast } from '../toast.js';

/**
 * Page « Paramètres », générée à partir du schéma des réglages et de la liste des modules :
 * toute nouvelle entrée de schéma ou tout nouveau module y apparaît sans code supplémentaire.
 * Les changements sont appliqués immédiatement.
 */
export function createSettingsPage({ settings, registry, backup, workspace, db, profiles, bus }) {
  const page = h('section', { class: 'settings-page', 'aria-label': 'Paramètres' });
  const inner = h('div', { class: 'settings-inner' }, h('h1', { class: 'page-title' }, 'Paramètres'));
  page.append(inner);

  const renderers = {
    profils: renderProfiles,
    modules: renderModules,
    donnees: renderData,
    apropos: renderAbout,
  };

  for (const section of SETTINGS_SECTIONS) {
    const body = renderers[section.id]?.() ?? renderEntries(settings.entries().filter((e) => e.section === section.id));
    if (!body) continue;
    inner.append(
      h(
        'section',
        { class: 'card', 'aria-labelledby': `section-${section.id}` },
        h('h2', { id: `section-${section.id}`, class: 'card-title' }, section.title),
        section.description ? h('p', { class: 'card-description' }, section.description) : null,
        body,
      ),
    );
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
    return h('div', { class: `setting setting-${entry.type}`, dataset: { key: entry.key } }, text, control);
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
            { class: 'setting', dataset: { profile: profile.id } },
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
    for (const group of MODULE_GROUPS) {
      const inGroup = modules.filter((mod) => (mod.group ?? 'outils') === group.id);
      if (!inGroup.length) continue;
      container.append(
        h(
          'div',
          { class: 'module-group' },
          h('h3', { class: 'module-group-title' }, group.label),
          h(
            'div',
            { class: 'setting-list' },
            inGroup.map((mod) => {
              const row = renderEntry(settings.entry(registry.toggleKey(mod.id)));
              const status = h('p', { class: 'module-status', hidden: true });
              row.querySelector('.setting-text').append(status);
              statusEls.set(mod.id, status);
              const own = settings.entries().filter((e) => e.parentModule === mod.id);
              const info = mod.renderInfo?.();
              const sub =
                own.length || info
                  ? h('div', { class: 'module-settings', dataset: { module: mod.id } }, own.map(renderEntry), info)
                  : null;
              return h('div', { class: 'module-row' }, row, sub);
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
      ),
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

  // ---- À propos ------------------------------------------------------------------------

  function renderAbout() {
    return h(
      'div',
      { class: 'about' },
      h('p', null, h('strong', null, `L-ISO-CPC ${APP_VERSION}`), ' — éditeur et documentation de programmation ISO / G-code.'),
      h('p', null, 'Fonctionne entièrement dans le navigateur, sans connexion internet : aucune donnée n’est envoyée.'),
      h(
        'p',
        null,
        'Composant d’édition : CodeMirror 6 (licence MIT). ',
        h('a', { href: 'dist/THIRD_PARTY_LICENSES.txt', target: '_blank', rel: 'noopener' }, 'Licences des bibliothèques'),
      ),
    );
  }

  return page;
}
