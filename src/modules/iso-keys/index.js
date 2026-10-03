import { cursorCharLeft, cursorCharRight } from '@codemirror/commands';
import { h } from '../../core/dom.js';

/** Rangées de touches : adresses ISO, puis chiffres et signes (bouton « 123 » / « ABC »). */
const ROWS = {
  letters: ['G', 'M', 'X', 'Z', 'U', 'W', 'F', 'S', 'T', 'N', 'P', 'Q', 'R', 'I', 'K', 'O', '#', '.', '-', '='],
  digits: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', '-', '#', '=', '[', ']', '(', ')', '+', '*', '/'],
};
const COMMANDS = [
  { key: 'left', label: '←', title: 'Caractère précédent', run: cursorCharLeft, repeat: true },
  { key: 'right', label: '→', title: 'Caractère suivant', run: cursorCharRight, repeat: true },
];
const touchScreen = () => matchMedia('(any-pointer: coarse)').matches;

/**
 * Barre de touches ISO sous l'éditeur : adresses (G, M, X, Z…), chiffres et signes (# . - [ ]),
 * déplacement du curseur, sans basculer sans cesse le clavier du téléphone entre lettres et
 * chiffres. Les touches ne prennent pas le focus : le clavier reste ouvert.
 */
export default {
  id: 'isoKeys',
  label: 'Barre de touches ISO',
  description:
    'Rangée de touches sous l’éditeur : G, M, X, Z, U, W, F, S, T, N…, chiffres et signes (# . - = [ ] ( )…) et flèches pour déplacer le curseur. Évite de basculer le clavier du téléphone entre lettres et chiffres.',
  group: 'editeur',
  where: 'Sous l’éditeur',
  settings: [
    {
      key: 'isoKeys.show',
      type: 'choice',
      label: 'Affichage',
      options: [
        { value: 'touch', label: 'Écran tactile, pendant la saisie' },
        { value: 'always', label: 'Toujours' },
      ],
      default: 'touch',
    },
  ],
  activate(ctx) {
    const { editor } = ctx;
    let mode = 'letters';
    let repeatTimer = null;

    const insert = (text) => {
      const view = editor.view;
      view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input.type' });
    };
    const stopRepeat = () => {
      clearTimeout(repeatTimer);
      clearInterval(repeatTimer);
      repeatTimer = null;
    };

    /**
     * Touche : l'action part au pointerdown, dont le comportement par défaut est annulé pour
     * que l'éditeur garde le focus (le clavier du téléphone ne se ferme pas). Les flèches se
     * répètent tant qu'on appuie.
     */
    const key = ({ label, title, className = '', action, repeat = false, dataset }) => {
      const button = h('button', { type: 'button', class: `iso-key ${className}`, title, 'aria-label': title ?? label, tabindex: -1, dataset }, label);
      button.addEventListener('pointerdown', (event) => {
        if (event.button > 0) return;
        event.preventDefault();
        action();
        if (repeat) {
          stopRepeat();
          repeatTimer = setTimeout(() => (repeatTimer = setInterval(action, 70)), 400);
        }
      });
      // Clavier physique ou lecteur d'écran : le clic (sans pointerdown) déclenche aussi la touche.
      button.addEventListener('click', (event) => event.detail === 0 && action());
      return button;
    };

    const keysEl = h('div', { class: 'iso-keys-row' });
    const toggle = key({ label: '123', title: 'Chiffres et signes', className: 'is-toggle', dataset: { key: 'toggle' }, action: () => setMode(mode === 'letters' ? 'digits' : 'letters') });
    const bar = h(
      'div',
      { class: 'iso-keys', role: 'toolbar', 'aria-label': 'Touches ISO', hidden: true },
      toggle,
      keysEl,
      h(
        'div',
        { class: 'iso-keys-commands' },
        COMMANDS.map((command) =>
          key({ label: command.label, title: command.title, className: 'is-command', repeat: command.repeat, dataset: { key: command.key }, action: () => command.run(editor.view) }),
        ),
      ),
    );

    function setMode(next) {
      mode = next;
      toggle.textContent = mode === 'letters' ? '123' : 'ABC';
      toggle.title = mode === 'letters' ? 'Chiffres et signes' : 'Adresses ISO';
      toggle.setAttribute('aria-label', toggle.title);
      keysEl.replaceChildren(...ROWS[mode].map((text) => key({ label: text, title: `Insérer ${text}`, dataset: { key: text }, action: () => insert(text) })));
      keysEl.scrollLeft = 0;
    }
    setMode('letters');

    // Visible pendant la saisie sur écran tactile (ou toujours, selon le réglage). Un court délai
    // à la perte du focus évite le clignotement lors d'un tap ailleurs dans la page.
    let hideTimer = null;
    const setHidden = (hidden) => {
      if (bar.hidden === hidden) return;
      bar.hidden = hidden;
      editor.remeasure();
    };
    const sync = () => {
      clearTimeout(hideTimer);
      const show = ctx.settings.get('isoKeys.show') === 'always' || (touchScreen() && editor.view.hasFocus);
      if (show) setHidden(false);
      else hideTimer = setTimeout(() => setHidden(true), 150);
    };

    // iOS ne réduit pas la page sous le clavier : la barre est alors posée au-dessus du clavier
    // (visualViewport). Sur Android, la page est déjà réduite et la barre reste à sa place.
    const viewport = window.visualViewport;
    const place = () => {
      const hidden = viewport ? Math.round(window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      const floating = hidden > 60 && editor.view.hasFocus;
      bar.classList.toggle('is-floating', floating);
      bar.style.bottom = floating ? `${hidden}px` : '';
    };
    if (viewport) {
      ctx.listen(viewport, 'resize', place);
      ctx.listen(viewport, 'scroll', place);
    }

    editor.onUpdate((u) => {
      if (u.focusChanged) {
        sync();
        place();
      }
    });
    ctx.settings.subscribe('isoKeys.show', sync);
    ctx.onDispose(() => {
      stopRepeat();
      clearTimeout(hideTimer);
    });
    ctx.listen(window, 'pointerup', stopRepeat);
    ctx.listen(window, 'pointercancel', stopRepeat);
    ctx.ui.accessories.add(bar);
    if (ctx.settings.get('isoKeys.show') === 'always') setHidden(false);
  },
};
