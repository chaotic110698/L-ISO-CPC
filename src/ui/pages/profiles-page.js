import { h, clear, downloadText, pickFile, readTextFile } from '../../core/dom.js';
import { safeFileName } from '../../core/util.js';
import { formatRanges, parseRanges, countInRanges } from '../../engine/macro-ranges.js';
import { CATEGORIES } from '../../data/categories.js';
import { MACHINE_TYPES } from '../../data/machine-types.js';
import { icon } from '../icons.js';
import { openDialog, confirmDialog, actionSheet } from '../dialogs.js';
import { toast } from '../toast.js';
import { openCodeEditor } from '../code-editor.js';

const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
const machineLabel = (id) => MACHINE_TYPES.find((m) => m.id === id)?.label ?? 'Toutes machines';

/** Tri naturel des codes : G avant M, puis valeur numérique (G2 avant G10). */
function compareKeys(a, b) {
  if (a[0] !== b[0]) return a[0] === 'G' ? -1 : 1;
  return Number(a.slice(1)) - Number(b.slice(1));
}

function switchInput(checked, onChange, label) {
  return h(
    'span',
    { class: 'switch' },
    h('input', { type: 'checkbox', role: 'switch', checked, 'aria-label': label, onchange: (e) => onChange(e.target.checked) }),
    h('span', { class: 'switch-track', 'aria-hidden': 'true' }),
  );
}

async function run(action, successMessage) {
  try {
    await action();
    if (successMessage) toast(successMessage, { type: 'success' });
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
}

/**
 * Page « Profils machines » :
 *   - onglet Profils : pile de profils (activation, ordre, création, import/export) et détail
 *     d'un profil (plages de macros libres, codes propriétaires ou redéfinis) ;
 *   - onglet Codes actifs : la documentation effective des codes selon les profils activés.
 */
export function createProfilesPage({ profiles, codes, bus }) {
  let view = { tab: 'profils', profileId: null, search: '', category: '' };
  const content = h('div', { class: 'profiles-content' });
  const tabs = h('div', { class: 'segmented tabs', role: 'tablist' });

  const page = h(
    'section',
    { class: 'profiles-page', 'aria-label': 'Profils machines' },
    h(
      'div',
      { class: 'settings-inner' },
      h('h1', { class: 'page-title' }, 'Profils machines'),
      h(
        'p',
        { class: 'card-description' },
        'Les profils activés s’empilent : chacun complète ou redéfinit les codes des profils situés au-dessus de lui dans la liste. Le dernier de la liste est le plus spécifique (votre machine) et l’emporte.',
      ),
      tabs,
      content,
    ),
  );

  function renderTabs() {
    clear(tabs);
    for (const [id, label] of [
      ['profils', 'Profils'],
      ['codes', 'Codes actifs'],
    ]) {
      tabs.append(
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: 'segment',
            'aria-selected': String(view.tab === id),
            onclick: () => {
              view = { ...view, tab: id, profileId: null };
              render();
            },
          },
          label,
        ),
      );
    }
  }

  function render() {
    renderTabs();
    clear(content);
    if (view.tab === 'codes') content.append(renderActiveCodes());
    else if (view.profileId) content.append(renderDetail(profiles.get(view.profileId)));
    else content.append(renderList());
  }

  // ---- Liste des profils -----------------------------------------------------------------

  function renderList() {
    const list = profiles.list();
    const noneEnabled = !list.some((p) => p.enabled);
    const { profile: rangesProfile, ranges } = profiles.macroRanges();

    return h(
      'div',
      { class: 'profiles-list' },
      h(
        'div',
        { class: 'button-row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: createProfile }, icon('plus'), 'Nouveau profil'),
        h('button', { type: 'button', class: 'btn', onclick: importProfile }, icon('upload'), 'Importer un profil'),
      ),
      noneEnabled ? h('p', { class: 'notice is-warning' }, icon('warning'), 'Aucun profil activé : tous les codes apparaissent comme inconnus.') : null,
      h(
        'p',
        { class: 'card-description' },
        'Plages de macros libres en vigueur : ',
        h('strong', null, formatRanges(ranges)),
        rangesProfile ? ` (profil « ${rangesProfile.name} »)` : ' — définissez-les dans le profil de votre machine.',
      ),
      h(
        'ol',
        { class: 'profile-stack' },
        list.map((profile, index) => {
          const codeCount = Object.keys(profile.codes).length;
          return h(
            'li',
            { class: `card profile-card${profile.enabled ? '' : ' is-disabled'}`, dataset: { profile: profile.id } },
            h(
              'div',
              { class: 'profile-head' },
              h(
                'button',
                { type: 'button', class: 'profile-name', onclick: () => openDetail(profile.id) },
                profile.name,
                icon('arrowRight'),
              ),
              switchInput(profile.enabled, (enabled) => run(() => profiles.update(profile.id, { enabled })), `Activer ${profile.name}`),
            ),
            h(
              'p',
              { class: 'profile-badges' },
              h('span', { class: 'badge' }, profile.builtin ? 'Intégré' : 'Personnel'),
              h('span', { class: 'badge' }, machineLabel(profile.machineType)),
              h('span', { class: 'badge' }, `${codeCount} code${codeCount > 1 ? 's' : ''}`),
              h('span', { class: 'badge' }, `Macros libres : ${formatRanges(profile.macroRanges)}`),
            ),
            profile.description ? h('p', { class: 'card-description' }, profile.description) : null,
            h(
              'div',
              { class: 'profile-actions' },
              h('button', { type: 'button', class: 'btn', onclick: () => openDetail(profile.id) }, profile.builtin ? 'Ouvrir' : 'Modifier'),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Monter (plus général)', title: 'Monter (plus général)', disabled: index === 0, onclick: () => run(() => profiles.move(profile.id, -1)) }, icon('arrowUp')),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Descendre (plus spécifique)', title: 'Descendre (plus spécifique)', disabled: index === list.length - 1, onclick: () => run(() => profiles.move(profile.id, 1)) }, icon('arrowDown')),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Autres actions pour ${profile.name}`, onclick: () => profileActions(profile) }, icon('more')),
            ),
          );
        }),
      ),
    );
  }

  async function profileActions(profile) {
    const actions = [{ label: 'Dupliquer', value: 'copy', icon: 'copy', description: profile.builtin ? 'Crée un profil personnel placé au-dessus, avec les mêmes plages de macros' : null }];
    if (!profile.builtin) actions.push({ label: 'Exporter ce profil (.json)', value: 'export', icon: 'download' });
    if (!profile.builtin) actions.push({ label: 'Supprimer', value: 'delete', icon: 'trash', danger: true });
    const choice = await actionSheet({ title: profile.name, actions });
    if (choice === 'copy') await run(() => profiles.create({ name: `${profile.name} (copie)`, copyFrom: profile.id, machineType: profile.machineType ?? undefined }), 'Profil dupliqué.');
    if (choice === 'export') {
      downloadText(`profil-${safeFileName(profile.name)}.json`, JSON.stringify(profiles.exportProfile(profile.id), null, 2), 'application/json');
    }
    if (choice === 'delete') {
      const ok = await confirmDialog({
        title: 'Supprimer le profil',
        message: `Supprimer « ${profile.name} » et ses ${Object.keys(profile.codes).length} code(s) ? Cette action est irréversible.`,
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (ok) await run(() => profiles.remove(profile.id), 'Profil supprimé.');
    }
  }

  async function profileForm({ title, profile = null, confirmLabel }) {
    const name = h('input', { class: 'input', value: profile?.name ?? 'Ma machine', autocomplete: 'off' });
    const description = h('textarea', { class: 'input textarea', rows: 2 }, profile?.description ?? '');
    const machine = h(
      'select',
      { class: 'input' },
      MACHINE_TYPES.map((m) => h('option', { value: m.id, disabled: !m.available }, m.available ? m.label : `${m.label} (bientôt)`)),
    );
    machine.value = profile?.machineType ?? 'tournage';
    const choice = await openDialog({
      title,
      body: h(
        'div',
        { class: 'code-editor' },
        h('div', { class: 'field' }, h('label', null, 'Nom', name)),
        h('div', { class: 'field' }, h('label', null, 'Type de machine', machine)),
        h('div', { class: 'field' }, h('label', null, 'Description (facultatif)', description)),
      ),
      actions: [{ label: confirmLabel, value: 'ok', primary: true }, { label: 'Annuler' }],
      validate: () => (name.value.trim() ? null : 'Donnez un nom au profil.'),
      onOpen: () => name.select(),
    });
    return choice === 'ok' ? { name: name.value, description: description.value, machineType: machine.value } : null;
  }

  async function createProfile() {
    const values = await profileForm({ title: 'Nouveau profil machine', confirmLabel: 'Créer' });
    if (!values) return;
    await run(async () => {
      const created = await profiles.create(values);
      openDetail(created.id);
    }, 'Profil créé. Ajoutez-y vos codes et vos plages de macros.');
  }

  async function importProfile() {
    const file = await pickFile({ accept: '.json,application/json' });
    if (!file) return;
    await run(async () => {
      let data;
      try {
        data = JSON.parse(await readTextFile(file));
      } catch {
        throw new Error('Ce fichier n’est pas un JSON valide.');
      }
      const imported = await profiles.importProfile(data);
      openDetail(imported.id);
    }, 'Profil importé.');
  }

  function openDetail(id) {
    view = { ...view, tab: 'profils', profileId: id };
    render();
    page.scrollTop = 0;
  }

  // ---- Détail d'un profil -------------------------------------------------------------------

  function renderDetail(profile) {
    return h(
      'div',
      { class: 'profile-detail', dataset: { profile: profile.id } },
      h(
        'button',
        { type: 'button', class: 'btn back-btn', onclick: () => ((view = { ...view, profileId: null }), render()) },
        icon('arrowLeft'),
        'Tous les profils',
      ),
      h(
        'section',
        { class: 'card' },
        h(
          'div',
          { class: 'profile-head' },
          h('h2', { class: 'card-title' }, profile.name),
          switchInput(profile.enabled, (enabled) => run(() => profiles.update(profile.id, { enabled })), `Activer ${profile.name}`),
        ),
        h(
          'p',
          { class: 'profile-badges' },
          h('span', { class: 'badge' }, profile.builtin ? 'Intégré (lecture seule)' : 'Personnel'),
          h('span', { class: 'badge' }, machineLabel(profile.machineType)),
        ),
        profile.description ? h('p', { class: 'card-description' }, profile.description) : null,
        profile.builtin
          ? null
          : h(
              'div',
              { class: 'button-row' },
              h('button', { type: 'button', class: 'btn', onclick: () => editProfile(profile) }, icon('edit'), 'Renommer / décrire'),
            ),
      ),
      renderRanges(profile),
      renderProfileCodes(profile),
    );
  }

  async function editProfile(profile) {
    const values = await profileForm({ title: 'Modifier le profil', profile, confirmLabel: 'Enregistrer' });
    if (values) await run(() => profiles.update(profile.id, values));
  }

  function renderRanges(profile) {
    const input = h('input', { class: 'input mono', placeholder: '900-999', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Nouvelle plage de macros' });
    const error = h('p', { class: 'dialog-error', hidden: true });
    const add = () => {
      const { ranges, error: message } = parseRanges(input.value);
      if (message || !ranges.length) {
        error.textContent = message ?? 'Saisissez une plage, par exemple 900-999.';
        error.hidden = false;
        return;
      }
      run(() => profiles.update(profile.id, { macroRanges: [...profile.macroRanges, ...ranges] }));
    };
    return h(
      'section',
      { class: 'card', dataset: { section: 'ranges' } },
      h('h2', { class: 'card-title' }, 'Plages de macros libres'),
      h(
        'p',
        { class: 'card-description' },
        'Variables que vous pouvez utiliser librement sur cette machine (une ou plusieurs portions). Elles servent à proposer la prochaine macro libre et à avertir — sans jamais bloquer — en cas de sortie de plage ou de double utilisation.',
      ),
      profile.macroRanges.length
        ? h(
            'ul',
            { class: 'range-chips' },
            profile.macroRanges.map((range) =>
              h(
                'li',
                null,
                h('span', { class: 'mono' }, formatRanges([range])),
                h('small', null, ` ${countInRanges([range])} variables`),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'icon-btn',
                    'aria-label': `Retirer la plage ${formatRanges([range])}`,
                    onclick: () => run(() => profiles.update(profile.id, { macroRanges: profile.macroRanges.filter((r) => r !== range) })),
                  },
                  icon('close'),
                ),
              ),
            ),
          )
        : h('p', { class: 'card-description' }, 'Aucune plage définie.'),
      h(
        'form',
        { class: 'range-form', onsubmit: (e) => (e.preventDefault(), add()) },
        input,
        h('button', { type: 'submit', class: 'btn' }, icon('plus'), 'Ajouter'),
      ),
      error,
      h('small', null, 'Exemples : « 900-999 », « 500-549, 560-599 ».'),
    );
  }

  function renderProfileCodes(profile) {
    const keys = Object.keys(profile.codes).sort(compareKeys);
    const rows = keys.map((key) => {
      const definition = profile.codes[key];
      const lower = codesBelow(profile, key);
      let status;
      if (definition === null) status = 'retiré sur cette machine';
      else if (profile.builtin) status = null;
      else status = lower ? `redéfinit « ${lower.name} » (${lower.profile})` : 'code propriétaire';
      return codeRow({
        key,
        definition,
        status,
        actions: profile.builtin
          ? [h('button', { type: 'button', class: 'btn btn-small', onclick: () => personalize(key, definition) }, 'Personnaliser')]
          : [
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Modifier ${key}`, onclick: () => openCodeEditor({ profiles, key, initial: definition, profileId: profile.id }) }, icon('edit')),
              h(
                'button',
                {
                  type: 'button',
                  class: 'icon-btn',
                  'aria-label': `Supprimer ${key} de ce profil`,
                  onclick: async () => {
                    const ok = await confirmDialog({ title: `Supprimer ${key}`, message: `Retirer ${key} du profil « ${profile.name} » ? La définition des profils situés au-dessus s’appliquera de nouveau.`, confirmLabel: 'Supprimer', danger: true });
                    if (ok) await run(() => profiles.removeCode(profile.id, key));
                  },
                },
                icon('trash'),
              ),
            ],
      });
    });

    return h(
      'section',
      { class: 'card', dataset: { section: 'codes' } },
      h('h2', { class: 'card-title' }, `Codes de ce profil (${keys.length})`),
      profile.builtin
        ? h('p', { class: 'card-description' }, 'Profil intégré : pour adapter un code à votre machine, utilisez « Personnaliser » ; la nouvelle définition est enregistrée dans votre profil personnel.')
        : h(
            'div',
            { class: 'button-row' },
            h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openCodeEditor({ profiles, profileId: profile.id }) }, icon('plus'), 'Ajouter un code'),
          ),
      rows.length ? h('ul', { class: 'code-list' }, rows) : h('p', { class: 'card-description' }, 'Aucun code : ajoutez vos codes propriétaires (M50 mandrin…) ou redéfinissez un code standard.'),
    );
  }

  /** Définition d'un code dans les profils activés situés sous `profile`, ou null. */
  function codesBelow(profile, key) {
    const list = profiles.list().filter((p) => p.enabled);
    const index = list.findIndex((p) => p.id === profile.id);
    for (let i = (index === -1 ? list.length : index) - 1; i >= 0; i--) {
      const definition = list[i].codes[key];
      if (definition) return { name: definition.name, profile: list[i].name };
    }
    return null;
  }

  function codeRow({ key, definition, status, source, actions }) {
    return h(
      'li',
      { class: 'code-row', dataset: { code: key } },
      h('code', { class: `code-key tok-${definition ? definition.category : 'unknown'}` }, key),
      h(
        'div',
        { class: 'code-text' },
        h('span', { class: 'code-name' }, definition ? definition.name : 'Code retiré'),
        h('small', null, [definition ? categoryLabel(definition.category) : null, source, status].filter(Boolean).join(' · ')),
      ),
      h('div', { class: 'code-actions' }, actions),
    );
  }

  async function personalize(key, definition) {
    await openCodeEditor({ profiles, key, initial: definition ? structuredClone(definition) : null });
  }

  // ---- Codes actifs (documentation effective) -----------------------------------------------

  function renderActiveCodes() {
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Rechercher (G71, filetage, arrosage…)', value: view.search, 'aria-label': 'Rechercher un code' });
    const category = h(
      'select',
      { class: 'input', 'aria-label': 'Catégorie' },
      h('option', { value: '' }, 'Toutes les catégories'),
      CATEGORIES.filter((c) => ['motion', 'cycle', 'mode', 'tool', 'mcode', 'program'].includes(c.id)).map((c) => h('option', { value: c.id }, c.label)),
    );
    category.value = view.category;
    const list = h('ul', { class: 'code-list' });
    const count = h('p', { class: 'card-description' });

    const fill = () => {
      const term = search.value.trim().toLowerCase();
      const entries = codes
        .entries()
        .filter((e) => !category.value || e.category === category.value)
        .filter((e) => !term || `${e.key} ${e.name} ${e.description ?? ''}`.toLowerCase().includes(term))
        .sort((a, b) => compareKeys(a.key, b.key));
      count.textContent = `${entries.length} code${entries.length > 1 ? 's' : ''} actif${entries.length > 1 ? 's' : ''} (profils activés : ${profiles.enabledProfiles().map((p) => p.name).join(' → ') || 'aucun'})`;
      list.replaceChildren(
        ...entries.map((entry) =>
          codeRow({
            key: entry.key,
            definition: entry,
            source: entry.sourceLabel,
            status: entry.previous?.length ? `redéfinit « ${entry.previous.at(-1).name} »` : null,
            actions: [h('button', { type: 'button', class: 'btn btn-small', onclick: () => personalize(entry.key, stripMeta(entry)) }, 'Personnaliser')],
          }),
        ),
      );
    };
    search.addEventListener('input', () => {
      view.search = search.value;
      fill();
    });
    category.addEventListener('change', () => {
      view.category = category.value;
      fill();
    });
    fill();

    return h(
      'section',
      { class: 'card', dataset: { section: 'active-codes' } },
      h('h2', { class: 'card-title' }, 'Codes actifs'),
      h('p', { class: 'card-description' }, 'Définitions en vigueur selon les profils activés : c’est ce qu’affichent les infobulles de l’éditeur.'),
      h('div', { class: 'filters' }, search, category),
      count,
      list,
    );
  }

  /** Définition sans les champs calculés par le dictionnaire (clé, source, historique). */
  function stripMeta(entry) {
    const { key: _k, source: _s, sourceLabel: _l, previous: _p, ...definition } = entry;
    return structuredClone(definition);
  }

  bus.on('profiles:changed', () => {
    if (view.profileId && !profiles.list().some((p) => p.id === view.profileId)) view.profileId = null;
    render();
  });
  render();
  return page;
}
