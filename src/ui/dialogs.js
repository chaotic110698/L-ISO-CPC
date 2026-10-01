import { h, domId } from '../core/dom.js';
import { icon } from './icons.js';

/**
 * Boîte de dialogue modale générique, basée sur <dialog> (focus piégé, Échap, fond grisé).
 * Résout avec la valeur (`value`) du bouton choisi, ou null si la boîte est fermée/annulée.
 *
 * actions : [{ label, value, primary?, danger? }] ; une action sans `value` ferme (annuler).
 * validate(value, form) : renvoie un message d'erreur pour empêcher la fermeture.
 */
export function openDialog({ title, body, actions = [], className = '', validate, onOpen }) {
  return new Promise((resolve) => {
    const titleId = domId('dialog-title');
    const error = h('p', { class: 'dialog-error', role: 'alert', hidden: true });
    const buttons = actions.map((action) =>
      action.value == null
        ? h('button', { type: 'button', class: 'btn', onclick: () => dialog.close('') }, action.label)
        : h(
            'button',
            {
              type: 'submit',
              value: action.value,
              class: `btn${action.primary ? ' btn-primary' : ''}${action.danger ? ' btn-danger' : ''}`,
            },
            action.label,
          ),
    );
    // Le premier bouton de validation du DOM est celui déclenché par Entrée : on y place l'action principale.
    const footer = h('footer', { class: 'dialog-actions' }, buttons);

    const form = h(
      'form',
      { method: 'dialog', class: 'dialog-inner' },
      h(
        'header',
        { class: 'dialog-header' },
        h('h2', { id: titleId, class: 'dialog-title' }, title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fermer', onclick: () => dialog.close('') }, icon('close')),
      ),
      h('div', { class: 'dialog-body' }, body, error),
      actions.length ? footer : null,
    );

    const dialog = h('dialog', { class: `dialog ${className}`.trim(), 'aria-labelledby': titleId }, form);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = event.submitter?.value ?? actions.find((a) => a.primary)?.value ?? '';
      const message = validate?.(value, form);
      if (message) {
        error.textContent = message;
        error.hidden = false;
        return;
      }
      dialog.close(value);
    });
    // Clic sur le fond grisé : fermeture.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close('');
    });
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === '' ? null : dialog.returnValue);
      dialog.remove();
    });

    document.body.append(dialog);
    dialog.showModal();
    onOpen?.(dialog);
  });
}

export async function confirmDialog({ title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false }) {
  const result = await openDialog({
    title,
    body: h('p', null, message),
    actions: [
      { label: confirmLabel, value: 'ok', primary: !danger, danger },
      { label: cancelLabel },
    ],
  });
  return result === 'ok';
}

/** Demande un texte. Résout avec la chaîne saisie (rognée) ou null. */
export async function promptDialog({ title, label, value = '', confirmLabel = 'Valider', required = true }) {
  const inputId = domId('prompt');
  const input = h('input', { id: inputId, class: 'input', type: 'text', value, autocomplete: 'off', spellcheck: 'false' });
  const result = await openDialog({
    title,
    body: h('div', { class: 'field' }, h('label', { for: inputId }, label), input),
    actions: [{ label: confirmLabel, value: 'ok', primary: true }, { label: 'Annuler' }],
    validate: (choice) => (choice === 'ok' && required && !input.value.trim() ? 'Ce champ est obligatoire.' : null),
    onOpen: () => {
      input.focus();
      input.select();
    },
  });
  return result === 'ok' ? input.value.trim() : null;
}

/**
 * Liste d'actions (menu contextuel) : en bas de l'écran sur mobile, centrée sur ordinateur.
 * actions : [{ label, value, icon?, danger?, description? }]. Résout avec la valeur choisie ou null.
 */
export function actionSheet({ title, actions }) {
  const list = h(
    'div',
    { class: 'action-list' },
    actions.map((action) =>
      h(
        'button',
        { type: 'submit', value: action.value, class: `action-item${action.danger ? ' is-danger' : ''}` },
        action.icon ? icon(action.icon) : null,
        h('span', { class: 'action-text' }, h('span', null, action.label), action.description ? h('small', null, action.description) : null),
      ),
    ),
  );
  return openDialog({ title, body: list, className: 'sheet' });
}
