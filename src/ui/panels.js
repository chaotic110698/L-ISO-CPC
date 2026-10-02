import { h } from '../core/dom.js';
import { icon } from './icons.js';

/**
 * Panneaux de l'éditeur (tableau des variables, état modal…). Un seul est ouvert à la fois ;
 * chaque panneau a son bouton dans la barre d'outils. Colonne à droite de l'éditeur sur grand
 * écran, volet en bas de l'écran sur smartphone.
 *
 * add({ id, title, icon, order, render(body) → { refresh?(), dispose?() } }) → retrait
 */
export function createPanels({ sideEl, toolbar, kv, onResize }) {
  const panels = new Map();
  let openId = null;

  const titleEl = h('h2', { class: 'side-title' });
  const body = h('div', { class: 'side-body' });
  sideEl.append(
    h(
      'header',
      { class: 'side-header' },
      titleEl,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fermer le panneau', onclick: () => open(null) }, icon('close')),
    ),
    body,
  );

  function open(id) {
    const current = openId ? panels.get(openId) : null;
    current?.instance?.dispose?.();
    if (current) current.instance = null;
    openId = id && panels.has(id) ? id : null;
    body.replaceChildren();
    for (const [panelId, panel] of panels) panel.button.element.setAttribute('aria-pressed', String(panelId === openId));
    if (openId) {
      const panel = panels.get(openId);
      titleEl.textContent = panel.title;
      const container = h('div', { class: 'side-panel-content', dataset: { panel: openId } });
      body.append(container);
      panel.instance = panel.render(container) ?? null;
    }
    sideEl.hidden = !openId;
    kv.set('openPanel', openId);
    onResize?.();
  }

  return {
    add({ id, title, icon: iconName, order = 60, render }) {
      const button = toolbar.add({ id: `panel-${id}`, icon: iconName, label: title, title, order, onClick: () => open(openId === id ? null : id) });
      panels.set(id, { title, render, button, instance: null });
      button.element.setAttribute('aria-pressed', 'false');
      if (kv.get('openPanel') === id) open(id);
      return () => {
        if (openId === id) open(null);
        button.remove();
        panels.delete(id);
      };
    },
    open,
    get openId() {
      return openId;
    },
    scoped(scope) {
      return { add: (options) => scope.add(this.add(options)) };
    },
  };
}
