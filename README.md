# L-ISO-CPC — éditeur ISO / G-code

Éditeur et documentation de programmation ISO / G-code, pour débutants et confirmés,
avec le **tournage Fanuc** en priorité. Le site fonctionne **entièrement dans le navigateur,
hors ligne** : aucune installation, aucun serveur, aucune donnée envoyée.

## Lancer le site

- **Le plus simple :** double-cliquer sur `index.html` (Chrome, Edge, Firefox, Safari).
- **En ligne :** déposer le dossier tel quel sur n'importe quel hébergement statique
  (GitHub Pages, serveur web d'atelier…). Aucune compilation n'est nécessaire pour l'utiliser.

> Les données (programmes, réglages) sont enregistrées **dans le navigateur**, et séparément
> pour chaque façon d'ouvrir le site : la version ouverte par double-clic et une version en ligne
> ne partagent pas leurs données. Pour transférer ou sauvegarder : **Paramètres › Données ›
> Exporter / Importer une sauvegarde** (fichier `.json`).

## Avancement

| Étape | Contenu | État |
|---|---|---|
| 1 | Socle, thème clair/sombre, stockage, sauvegarde automatique, export/import JSON | ✅ |
| 2 | Moteur d'analyse (tokenizer, parseur) et coloration syntaxique par catégorie | ✅ |
| 3 | Infobulles de définition au clic / tap | ✅ |
| 4 | Profils machines (ISO générique, Fanuc tournage, profils personnels) | à venir |
| 5 | Macros : plages libres, tableau des variables, avertissements | à venir |
| 6 | Autocomplétion, vérificateur, état modal, renumérotation, recherche / décalage, repliage, comparaison, snippets / cycles, bibliothèque | à venir |
| 7 | Calculateurs (Vc ↔ tr/min, avance, rugosité, rayon de bec) | à venir |
| 8 | Page Paramètres complète | à venir |

À l'ouverture, une **page d'accueil** présente le site ; le bouton **« Commencer à
programmer »** ouvre l'éditeur. Un **menu latéral** (☰) donne accès aux fonctions : Accueil,
Éditeur, Mes programmes, Paramètres, et les fonctions à venir (grisées). Il reste affiché sur
grand écran (repliable) et s'escamote sur smartphone.

Déjà disponible : gestion de plusieurs programmes (créer, ouvrir un fichier `.nc`/`.txt`…,
renommer, dupliquer, supprimer), numérotation des lignes, annuler/rétablir, enregistrement
automatique (avec copie de secours à la fermeture), export `.nc`/`.txt`, thème clair/sombre,
taille du texte, retour à la ligne, sauvegarde/restauration JSON, coloration syntaxique par
catégorie (avec légende dans Paramètres), mise en évidence des occurrences d'une macro, d'un
code ou d'une valeur sous le curseur, définition au clic / tap (ou F1, Ctrl+I) de chaque code,
paramètre de cycle (selon le bloc : le U de `G71 U2. R0.5` n'est pas celui de `G71 P… Q… U0.4`),
macro (plage, affectations), mot-clé de macro, avec décodage de T0101, G76 P020060, M98 P…
et alerte sur les cotes sans point décimal.

## Structure du projet

```
index.html              page unique ; charge css/ et dist/app.js
css/                    tokens.css (couleurs des 2 thèmes), base, layout, components
assets/                 icône
dist/                   GÉNÉRÉ par « npm run build » (versionné pour que le site marche sans outil)
src/
  main.js, app.js       démarrage et assemblage des services
  version.js            version de l'application (= package.json)
  core/                 bus d'événements, registre des modules, routeur, espace de travail, utilitaires
  data/                 données pures : types de machines, exemples (codes et profils : étapes 2 et 4)
  engine/               moteur d'analyse ISO, indépendant de l'interface (étape 2)
  storage/              localStorage (kv), IndexedDB + repli (database), programmes, sauvegarde JSON
  settings/             schéma déclaratif des réglages et magasin persistant
  ui/                   coque (barre du haut + menu latéral), éditeur (enveloppe CodeMirror),
                        pages (accueil, éditeur, paramètres), dialogues, barre d'outils…
  modules/              fonctionnalités branchables, une par dossier (+ emplacements futurs :
                        simulation-2d, courses, machining-time)
tests/unit/             tests Node (moteur, stockage, réglages, modules…)
tests/e2e/              test de bout en bout dans Chromium (PC et smartphone)
tools/                  build (esbuild)
```

### Principes d'architecture

- **Couches séparées :** données (`data/`) → moteur (`engine/`, sans DOM) → services
  (`storage/`, `settings/`, `core/`) → interface (`ui/`) et fonctionnalités (`modules/`).
- **Tout est module :** chaque fonctionnalité est un module enregistré auprès du registre
  (`core/module-registry.js`). Son interrupteur apparaît automatiquement dans Paramètres.
  Tout ce qu'un module ajoute (extensions d'éditeur, boutons, écouteurs) est rattaché à une
  *portée* détruite à la désactivation : **désactiver un module le retire réellement**, sans
  rechargement.
- **Le socle de l'éditeur est minimal** (saisie, sélection, thème). Numéros de ligne,
  historique, coloration… sont des modules.
- **Événements :** les parties communiquent par le bus (`workspace:opened`, `workspace:saved`…,
  voir `core/event-bus.js`).

## Développement

Prérequis : Node.js 20 ou plus récent.

```sh
npm install        # outils de développement uniquement (esbuild, CodeMirror, Playwright)
npm run build      # régénère dist/app.js à partir de src/
npm run watch      # reconstruit à chaque modification (non minifié)
npm test           # tests unitaires (Node)
npm run e2e        # test de bout en bout dans Chromium (captures dans test-results/)
```

Le code source est écrit en **modules ES** (`src/`). Les navigateurs refusant de charger des
modules ES depuis un fichier ouvert par double-clic, `tools/build.mjs` les assemble avec
CodeMirror en un seul script classique, `dist/app.js`. **Après toute modification de `src/`,
lancer `npm run build`** : un test vérifie que `dist/` est à jour.

### Ajouter une fonctionnalité (module)

1. Créer `src/modules/mon-module/index.js` :

   ```js
   export default {
     id: 'monModule',
     label: 'Ma fonctionnalité',            // libellé dans Paramètres
     description: 'Ce qu’elle fait.',
     group: 'outils',                       // editeur | analyse | outils | fichiers | calculateurs
     defaultEnabled: true,
     requires: [],                          // ids d'autres modules nécessaires
     settings: [],                          // réglages propres (même format que settings/schema.js)
     activate(ctx) {
       ctx.editor.addExtension(/* extension CodeMirror */);
       ctx.ui.toolbar.add({ id: 'mon-bouton', icon: 'code', label: 'Action', onClick: () => {} });
       ctx.bus.on('workspace:opened', ({ program }) => {});
       // Tout est retiré automatiquement à la désactivation.
       // Nettoyage supplémentaire éventuel : ctx.onDispose(() => …)
     },
   };
   ```

2. L'ajouter à la liste de `src/modules/index.js`, puis `npm run build`.

Le contexte `ctx` fournit : `editor` (extensions, mises à jour, commandes), `workspace`
(programme courant), `settings`, `bus`, `backup` (section de sauvegarde JSON), `ui` (barre
d'outils, barre d'état, dialogues, notifications), `listen()` (écouteur DOM), `signal`.

### Ajouter une page et son entrée de menu

Dans `src/app.js` : `router.register('/ma-page', { title, mount: () => element })` puis
`shell.addNavItem({ id, path: '/ma-page', label, icon })`. Retirer l'entrée « à venir »
correspondante et mettre à jour la carte de la page d'accueil (`src/ui/pages/home-page.js`).

### Ajouter un réglage

Ajouter une entrée dans `CORE_SETTINGS` (`src/settings/schema.js`) ou dans le champ `settings`
d'un module : la page Paramètres l'affiche automatiquement. Types : `boolean`, `number`
(`min`, `max`, `step`), `choice` (`options`), `string`.

### Ajouter un code

Les codes sont des **données** (`src/data/codes/`), organisées en couches superposées :
`iso-base.js` (codes ISO génériques) puis `fanuc-turning.js` (tournage Fanuc), qui complète
ou redéfinit certains codes (G90 devient un cycle, G98/G99 l'unité d'avance…).

```js
// src/data/codes/fanuc-turning.js
codes: {
  G71: { category: 'cycle', name: 'Cycle d’ébauche longitudinale (chariotage)' },
  G43: null,   // null : code retiré par cette couche
}
```

- La clé est normalisée : lettre + valeur sans zéros inutiles (`G1` pour G01, `M3` pour M03,
  `G12.1`).
- `category` doit exister dans `src/data/categories.js` (sa couleur est dans `css/tokens.css`,
  variables `--c-<catégorie>` pour chaque thème).
- Un code absent du dictionnaire est souligné comme « inconnu du profil ».
- Pour l'infobulle, ajouter `description`, `syntax`, `modal`, `params` (`{ lettre: sens }`),
  ou `forms` pour les cycles à plusieurs blocs (la première variante dont toutes les lettres
  `when` sont présentes dans le bloc s'applique), `notes` et `example`. Le format complet est
  documenté en tête de `src/data/codes/iso-base.js`.
- Les couches définissent aussi `addresses` (sens général des lettres) et `variables`
  (plages de macros : locales, communes, système…).
- Un code redéfini par une couche supérieure (G90 en tournage FANUC) est signalé dans son
  infobulle avec son sens d'origine.

Les profils machines (étape 4) permettront d'ajouter ou de redéfinir des codes depuis
l'interface, sans toucher aux fichiers.

### Moteur d'analyse

`src/engine/` ne dépend ni du DOM ni de CodeMirror (réutilisable par la future simulation) :
`tokenizeLine` (jetons d'une ligne), `parseLine` / `parseProgram` (blocs : mots, codes,
variables, commentaires, N, O, saut de bloc), `createCodeDictionary` (couches de codes),
`tokenCategory` (catégorie d'affichage), `explainToken` (définition d'un jeton dans son bloc),
`occurrenceKey` (identité d'une macro, d'un code ou
d'une valeur ; X25. et X25 sans point sont distingués, car sur Fanuc X25 peut valoir 0,025 mm).

## Sauvegarde JSON

```json
{
  "format": "l-iso-cpc/sauvegarde",
  "formatVersion": 1,
  "appVersion": "0.1.0",
  "exportedAt": "2026-10-01T12:00:00.000Z",
  "sections": { "programmes": [ … ], "parametres": { … } }
}
```

Chaque domaine de données s'enregistre comme une section (`backup.register`). À l'import :
**Fusionner** (ajoute les absents, met à jour les plus récents) ou **Remplacer**.

## Licences

Composant d'édition : [CodeMirror 6](https://codemirror.net/) (licence MIT, libre y compris
pour un usage commercial). Le détail des bibliothèques embarquées et de leurs licences est
généré dans `dist/THIRD_PARTY_LICENSES.txt`.
