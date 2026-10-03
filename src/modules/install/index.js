import { h } from '../../core/dom.js';

/** Site servi en http(s) : seule situation où l'installation et le hors-ligne sont possibles. */
const served = () => /^https?:$/.test(location.protocol) && 'serviceWorker' in navigator;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Installation comme application (PWA) : manifeste, icônes et service worker (fonctionnement
 * hors ligne), bouton « Installer » quand le navigateur le propose. Ne fonctionne que si le site
 * est hébergé (https, ou http://localhost), pas en ouvrant index.html par double-clic.
 */
export default {
  id: 'install',
  label: 'Installation comme application',
  description:
    'Icône sur l’écran d’accueil du téléphone ou du PC, plein écran, fonctionnement sans connexion. Possible seulement si le site est hébergé en ligne (GitHub Pages, par exemple) : en ouvrant le fichier index.html directement, cette fonction reste inactive.',
  group: 'fichiers',
  where: 'Menu Outils › Installer l’application',
  activate(ctx) {
    let deferred = null; // événement beforeinstallprompt (Chrome, Edge, Android)

    if (served()) {
      const links = [h('link', { rel: 'manifest', href: 'manifest.webmanifest' }), h('link', { rel: 'apple-touch-icon', href: 'assets/apple-touch-icon.png' })];
      document.head.append(...links);
      ctx.onDispose(() => links.forEach((link) => link.remove()));
      navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Service worker non enregistré :', error));
      // Désactivation : plus de fonctionnement hors ligne (le navigateur oublie le service worker).
      ctx.onDispose(() =>
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => registrations.forEach((registration) => registration.unregister()))
          .catch(() => {}),
      );
    }

    ctx.listen(window, 'beforeinstallprompt', (event) => {
      event.preventDefault();
      deferred = event;
    });
    ctx.listen(window, 'appinstalled', () => {
      deferred = null;
      ctx.ui.toast('Application installée : retrouvez L-ISO-CPC sur votre écran d’accueil.', { type: 'success' });
    });

    async function install() {
      if (deferred) {
        const prompt = deferred;
        deferred = null;
        await prompt.prompt();
        return;
      }
      const p = (text) => h('p', null, text);
      let body;
      if (standalone()) body = [p('L-ISO-CPC fonctionne déjà comme une application installée sur cet appareil.')];
      else if (!served())
        body = [
          p('Le site est ouvert depuis un fichier (index.html sur l’appareil) : l’installation demande qu’il soit hébergé en ligne, en https.'),
          p('Le plus simple : publier le dépôt avec GitHub Pages (Settings › Pages › branche main). Ouvrez ensuite l’adresse obtenue sur le téléphone et revenez ici.'),
          p('Ce qui est enregistré dans ce navigateur (programmes, profils) n’est pas transféré automatiquement : exportez une sauvegarde (Paramètres › Données) puis importez-la dans la version en ligne.'),
        ];
      else if (isIos())
        body = [p('Sur iPhone et iPad, dans Safari : touchez le bouton Partager (carré avec une flèche), puis « Sur l’écran d’accueil ».')];
      else
        body = [
          p('Le navigateur ne propose pas l’installation pour l’instant (déjà installée, ou navigateur qui ne le permet pas).'),
          p('Sur Android avec Chrome : menu ⋮ › « Installer l’application » ou « Ajouter à l’écran d’accueil ». Sur PC avec Chrome ou Edge : icône d’installation dans la barre d’adresse.'),
        ];
      await ctx.ui.openDialog({ title: 'Installer l’application', body: h('div', { class: 'install-help' }, body), actions: [{ label: 'Fermer' }] });
    }

    ctx.ui.toolbar.add({ id: 'install', icon: 'download', label: 'Installer l’application', title: 'Icône sur l’écran d’accueil, plein écran, hors ligne', order: 99, menu: true, onClick: install });
  },
};
