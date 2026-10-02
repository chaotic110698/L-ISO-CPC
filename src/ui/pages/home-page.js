import { h } from '../../core/dom.js';
import { formatRelativeTime } from '../../core/util.js';
import { icon } from '../icons.js';

/**
 * Fonctions présentées sur la page d'accueil. `path` : page disponible ; sans `path` : à venir.
 * Mettre à jour cette liste quand une fonction devient disponible.
 */
const FEATURES = [
  {
    icon: 'code',
    title: 'Éditeur de programmes',
    text: 'Coloration par catégorie, vérificateur de syntaxe, autocomplétion, état modal, renumérotation, recherche / remplacement, décalage de coordonnées, repliage, versions et comparaison, export .nc / .txt.',
    path: '/editeur',
  },
  {
    icon: 'info',
    title: 'Définitions des codes',
    text: 'Un clic ou un tap sur un code, un paramètre ou une macro affiche sa définition : paramètres du bloc décodés, codes redéfinis par le profil, exemples.',
    path: '/editeur',
  },
  {
    icon: 'variable',
    title: 'Macros et variables',
    text: 'Tableau des variables nommées, valeurs répétées transformées en macro, prochaine macro libre de la plage machine, avertissements non bloquants.',
    path: '/editeur',
  },
  {
    icon: 'machine',
    title: 'Profils machines',
    text: 'ISO générique, FANUC tournage, et vos propres profils : codes propriétaires, codes détournés, plages de macros.',
    path: '/profils',
  },
  {
    icon: 'calculator',
    title: 'Calculateurs',
    text: 'Vitesse de coupe ↔ tr/min, avance, rectification (vitesses en mm/min et mm/s), conversions, rugosité théorique, rayon de bec.',
    path: '/calculateurs',
    module: 'calculators',
  },
  {
    icon: 'library',
    title: 'Cycles et bibliothèque',
    text: 'Formulaires qui génèrent les cycles Fanuc (G71, G76, perçage…) et bibliothèque de sous-programmes personnels.',
    path: '/editeur',
    module: 'cycles',
  },
  {
    icon: 'settings',
    title: 'Tout est réglable',
    text: 'Chaque fonctionnalité s’active ou se désactive séparément, thème clair ou sombre, sauvegarde et restauration de toutes vos données en un fichier.',
    path: '/parametres',
  },
  {
    icon: 'book',
    title: 'Cours d’ISO',
    text: 'Leçons pour débutants puis confirmés : repère du tour, déplacements, cycles, macros, avec schémas et exemples à ouvrir dans l’éditeur.',
    path: '/cours',
    module: 'courses',
  },
  {
    icon: 'simulation',
    title: 'Simulation 2D',
    text: 'Visualisation des trajectoires d’outil en tournage (vue X/Z).',
  },
];

/** Page d'accueil : présentation du site et accès rapide à l'éditeur. */
export function createHomePage({ workspace, bus, registry }) {
  const resume = h('p', { class: 'home-resume' });
  const updateResume = () => {
    const program = workspace.current;
    resume.replaceChildren();
    if (!program) return;
    resume.append(
      icon('clock'),
      h('span', null, 'Dernier programme : ', h('strong', null, program.name), ` · modifié ${formatRelativeTime(program.updatedAt)}`),
    );
  };
  bus.on('workspace:opened', updateResume);
  bus.on('workspace:renamed', updateResume);
  bus.on('workspace:saved', updateResume);

  const page = h(
    'section',
    { class: 'home-page', 'aria-label': 'Accueil' },
    h(
      'div',
      { class: 'home-inner' },
      h(
        'header',
        { class: 'home-hero' },
        h('p', { class: 'home-kicker' }, 'Programmation ISO / G-code · tournage FANUC'),
        h('h1', { class: 'home-title' }, 'Écrire, comprendre et vérifier vos programmes de commande numérique'),
        h(
          'p',
          { class: 'home-lead' },
          'Un éditeur pensé pour l’atelier, pour débutants comme pour confirmés : chaque code est coloré selon son rôle et expliqué, vos variables de macro sont repérées, vos programmes restent sur votre appareil.',
        ),
        h(
          'div',
          { class: 'home-actions' },
          h('a', { class: 'btn btn-primary btn-large', href: '#/editeur', 'data-action': 'start' }, 'Commencer à programmer', icon('arrowRight')),
        ),
        resume,
      ),
      h(
        'ul',
        { class: 'home-badges' },
        h('li', null, icon('offline'), 'Fonctionne hors ligne, sans installation'),
        h('li', null, icon('save'), 'Vos données restent dans votre navigateur'),
        h('li', null, icon('sun'), 'Mode clair et sombre, ordinateur et smartphone'),
      ),
      h('h2', { class: 'home-section-title' }, 'Fonctionnalités'),
      h(
        'ul',
        { class: 'feature-grid' },
        FEATURES.map((feature) => {
          const item = h('li');
          renderFeature(item, feature);
          // Fonction fournie par un module : disponible seulement s'il est actif.
          if (feature.module) registry.onChange(() => renderFeature(item, feature));
          return item;
        }),
      ),
    ),
  );
  updateResume();
  return page;

  function renderFeature(item, feature) {
    const available = feature.path && (!feature.module || registry.isActive(feature.module));
    const body = [
      h('span', { class: 'feature-icon' }, icon(feature.icon)),
      h('span', { class: 'feature-title' }, feature.title, available ? null : h('span', { class: 'badge' }, feature.module ? 'désactivé' : 'bientôt')),
      h('span', { class: 'feature-text' }, feature.text),
    ];
    item.replaceChildren(
      available ? h('a', { class: 'feature-card', href: `#${feature.path}` }, body) : h('div', { class: 'feature-card is-upcoming' }, body),
    );
  }
}
