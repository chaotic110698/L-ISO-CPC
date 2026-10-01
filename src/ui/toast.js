import { h } from '../core/dom.js';
import { icon } from './icons.js';

let host = null;

const supportsPopover = typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;

function ensureHost() {
  if (!host || !host.isConnected) {
    host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    if (supportsPopover) host.popover = 'manual';
    document.body.append(host);
  }
  // Zone « popover » remise au premier plan : visible même au-dessus d'une boîte de dialogue ouverte.
  if (supportsPopover) {
    if (host.matches(':popover-open')) host.hidePopover();
    host.showPopover();
  }
  return host;
}

/** Notification brève en bas de l'écran. type : 'info' | 'success' | 'error'. */
export function toast(message, { type = 'info', timeout = type === 'error' ? 6000 : 3000 } = {}) {
  const iconName = type === 'error' ? 'warning' : type === 'success' ? 'check' : 'info';
  const item = h('div', { class: `toast toast-${type}` }, icon(iconName), h('span', null, message));
  ensureHost().append(item);
  const remove = () => {
    item.classList.add('toast-leaving');
    setTimeout(() => {
      item.remove();
      if (supportsPopover && !host.childElementCount && host.matches(':popover-open')) host.hidePopover();
    }, 200);
  };
  item.addEventListener('click', remove);
  setTimeout(remove, timeout);
}
