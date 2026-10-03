import { h } from '../core/dom.js';
import { icon } from './icons.js';

let host = null;

const supportsPopover = typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;

function ensureHost() {
  if (!host) {
    host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    if (supportsPopover) host.popover = 'manual';
  }
  // Une boîte modale rend le reste de la page inerte : la zone se place dans la plus récente,
  // pour que les boutons des notifications (« Annuler »…) restent utilisables.
  const modals = [...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal'));
  const parent = modals.at(-1) ?? document.body;
  if (host.parentElement !== parent) {
    if (supportsPopover && host.matches(':popover-open')) host.hidePopover();
    parent.append(host);
    // À la fermeture de la boîte, les notifications en cours restent affichées.
    if (parent !== document.body) {
      parent.addEventListener(
        'close',
        () => {
          if (host.parentElement !== parent) return;
          document.body.append(host);
          if (supportsPopover && host.childElementCount) host.showPopover();
        },
        { once: true },
      );
    }
  }
  // Zone « popover » remise au premier plan : visible même au-dessus d'une boîte de dialogue ouverte.
  if (supportsPopover) {
    if (host.matches(':popover-open')) host.hidePopover();
    host.showPopover();
  }
  return host;
}

/**
 * Notification brève en bas de l'écran. type : 'info' | 'success' | 'error'.
 * action : { label, onClick } — bouton dans la notification (« Annuler » après une suppression…).
 */
export function toast(message, { type = 'info', action, timeout = type === 'error' || action ? 6000 : 3000 } = {}) {
  const iconName = type === 'error' ? 'warning' : type === 'success' ? 'check' : 'info';
  const button = action
    ? h('button', { type: 'button', class: 'toast-action', onclick: (event) => (event.stopPropagation(), remove(), action.onClick()) }, action.label)
    : null;
  const item = h('div', { class: `toast toast-${type}` }, icon(iconName), h('span', null, message), button);
  ensureHost().append(item);
  let removed = false;
  function remove() {
    if (removed) return;
    removed = true;
    item.classList.add('toast-leaving');
    setTimeout(() => {
      item.remove();
      if (supportsPopover && !host.childElementCount && host.matches(':popover-open')) host.hidePopover();
    }, 200);
  }
  item.addEventListener('click', remove);
  setTimeout(remove, timeout);
}
