import { h, domId } from '../core/dom.js';
import { openDialog, promptDialog } from './dialogs.js';
import { toast } from './toast.js';
import { CODE_CATEGORIES, parseCodeKey } from '../core/profiles.js';
import { MODAL_GROUPS, NON_MODAL } from '../data/modal-groups.js';

/** « X : signification » par ligne ↔ { X: 'signification' }. */
const paramsToText = (params) =>
  Object.entries(params ?? {})
    .map(([letter, text]) => `${letter} : ${text}`)
    .join('\n');

function textToParams(text) {
  const params = {};
  for (const line of String(text).split('\n')) {
    const match = line.match(/^\s*(,?[A-Za-z])\s*[:=–-]\s*(.+)$/);
    if (match) params[match[1].toUpperCase()] = match[2].trim();
  }
  return params;
}

/**
 * Profil personnel où enregistrer une modification. S'il n'en existe aucun, propose d'en
 * créer un (« Ma machine »). Renvoie l'identifiant, ou null si l'utilisateur annule.
 */
export async function chooseCustomProfile(profiles) {
  const custom = profiles.list().filter((p) => !p.builtin);
  if (custom.length) return custom.at(-1).id;
  const name = await promptDialog({
    title: 'Créer un profil personnel',
    label: 'Les codes propres à votre machine sont enregistrés dans un profil personnel, placé après les profils intégrés dans la liste (il l’emporte sur eux). Nom du profil :',
    value: 'Ma machine',
    confirmLabel: 'Créer le profil',
  });
  if (!name) return null;
  const created = await profiles.create({ name });
  toast(`Profil « ${created.name} » créé.`, { type: 'success' });
  return created.id;
}

/**
 * Ajout ou modification d'un code dans un profil personnel.
 *   key       code existant à modifier (verrouillé) ; absent : nouveau code à saisir
 *   initial   définition de départ (copie d'un code intégré, ou définition actuelle)
 *   profileId profil cible ; absent : choisi parmi les profils personnels
 * Résout avec true si un enregistrement a eu lieu.
 */
export async function openCodeEditor({ profiles, key = null, initial = null, profileId = null }) {
  const targetId = profileId ?? (await chooseCustomProfile(profiles));
  if (!targetId) return false;
  const custom = profiles.list().filter((p) => !p.builtin);
  const base = initial ?? {};
  const removedInitially = initial === null && key !== null && profiles.get(targetId).codes[key] === null;

  const ids = {};
  const field = (name, label, control, hint) => {
    ids[name] = control;
    const id = domId('code');
    control.id = id;
    return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('small', null, hint) : null);
  };

  const profileSelect = h(
    'select',
    { class: 'input' },
    custom.map((p) => h('option', { value: p.id }, p.name)),
  );
  profileSelect.value = targetId;
  const keyInput = h('input', { class: 'input', value: key ?? '', placeholder: 'G100, M50…', autocomplete: 'off', spellcheck: 'false', disabled: Boolean(key) });
  const removed = h('input', { type: 'checkbox', checked: removedInitially });
  const nameInput = h('input', { class: 'input', value: base.name ?? '', autocomplete: 'off' });
  const categorySelect = h('select', { class: 'input' }, CODE_CATEGORIES.map((c) => h('option', { value: c.id }, c.label)));
  categorySelect.value = base.category ?? 'mcode';
  const modalSelect = h(
    'select',
    { class: 'input' },
    h('option', { value: '' }, 'Non précisé'),
    h('option', { value: 'true' }, 'Modal (reste actif)'),
    h('option', { value: 'false' }, 'Non modal (ce bloc seulement)'),
  );
  modalSelect.value = base.modal === undefined ? '' : String(base.modal);
  const groupSelect = h(
    'select',
    { class: 'input' },
    h('option', { value: '' }, 'Non précisé'),
    h('option', { value: NON_MODAL }, 'Aucun (code non modal, groupe 00)'),
    MODAL_GROUPS.map((g) => h('option', { value: g.id }, g.label)),
  );
  groupSelect.value = base.group ?? '';
  const description = h('textarea', { class: 'input textarea', rows: 3 }, base.description ?? '');
  const syntax = h('input', { class: 'input mono', value: base.syntax ?? '', autocomplete: 'off', spellcheck: 'false' });
  const params = h('textarea', { class: 'input textarea mono', rows: 3, placeholder: 'X : Diamètre de serrage\nP : Temporisation (ms)' }, paramsToText(base.params));
  const notes = h('textarea', { class: 'input textarea', rows: 2 }, (base.notes ?? []).join('\n'));
  const example = h('textarea', { class: 'input textarea mono', rows: 2 }, base.example ?? '');

  const details = h(
    'div',
    { class: 'code-editor-details' },
    field('name', 'Nom', nameInput),
    field('category', 'Catégorie (couleur dans l’éditeur)', categorySelect),
    field('modal', 'Comportement', modalSelect),
    field('group', 'Groupe modal', groupSelect, 'Deux codes du même groupe s’excluent dans un bloc ; sert au vérificateur et à l’état modal.'),
    field('description', 'Description', description),
    field('syntax', 'Syntaxe', syntax),
    base.forms
      ? h('p', { class: 'card-description' }, 'Ce code a plusieurs variantes de paramètres (cycle sur plusieurs blocs) : elles sont conservées.')
      : field('params', 'Paramètres (un par ligne)', params, 'Format : lettre : signification'),
    field('notes', 'Remarques (une par ligne)', notes),
    field('example', 'Exemple', example),
  );
  const syncRemoved = () => (details.hidden = removed.checked);
  removed.addEventListener('change', syncRemoved);
  syncRemoved();

  const body = h(
    'div',
    { class: 'code-editor' },
    custom.length > 1 ? field('profile', 'Profil', profileSelect) : h('p', { class: 'card-description' }, `Profil : ${profiles.get(targetId).name}`),
    field('key', 'Code', keyInput, key ? null : 'Code G ou M, par exemple M50 ou G12.1'),
    h('label', { class: 'check' }, removed, h('span', null, 'Ce code n’existe pas sur cette machine', h('small', null, ' — il sera signalé comme inconnu'))),
    details,
  );

  let codeKey = key;
  const choice = await openDialog({
    title: key ? `Modifier ${key}` : 'Ajouter un code',
    body,
    className: 'dialog-wide',
    actions: [{ label: 'Enregistrer', value: 'save', primary: true }, { label: 'Annuler' }],
    validate: () => {
      codeKey = key ?? parseCodeKey(keyInput.value);
      if (!codeKey) return 'Code invalide : une lettre G ou M suivie d’un nombre (ex. M50).';
      if (!removed.checked && !nameInput.value.trim()) return 'Donnez un nom au code.';
      return null;
    },
    onOpen: () => (key ? nameInput : keyInput).focus(),
  });
  if (choice !== 'save') return false;

  const definition = removed.checked
    ? null
    : {
        ...(base.forms ? { forms: base.forms } : {}),
        name: nameInput.value,
        category: categorySelect.value,
        ...(modalSelect.value ? { modal: modalSelect.value === 'true' } : {}),
        ...(groupSelect.value ? { group: groupSelect.value } : {}),
        description: description.value,
        syntax: syntax.value,
        params: base.forms ? undefined : textToParams(params.value),
        notes: notes.value.split('\n'),
        example: example.value,
      };
  const destination = custom.length > 1 ? profileSelect.value : targetId;
  try {
    await profiles.setCode(destination, codeKey, definition);
    toast(`${codeKey} enregistré dans « ${profiles.get(destination).name} ».`, { type: 'success' });
    return true;
  } catch (error) {
    toast(error.message, { type: 'error' });
    return false;
  }
}
