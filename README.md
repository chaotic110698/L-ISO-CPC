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
| 4 | Profils machines (ISO générique, Fanuc tournage, profils personnels) | ✅ |
| 5 | Macros : plages libres, tableau des variables, avertissements | ✅ |
| 6a | Autocomplétion G/M, vérificateur de syntaxe, état modal, renumérotation | ✅ |
| 6b | Recherche / remplacement et décalage, repliage, comparaison de versions, cycles et bibliothèque | ✅ |
| 7 | Calculateurs (Vc ↔ tr/min, avance, rectification en mm/min et mm/s, conversions, rugosité, rayon de bec) | ✅ (réalisée avant les étapes 4 à 6) |
| 8 | Page Paramètres complète (recherche, sections, activation groupée, raccourcis, effacement) | ✅ |

### Cours d'ISO

| Étape | Contenu | État |
|---|---|---|
| C1 | Page Cours, catalogue, lecteur de leçon (schémas, exemples interactifs, « Ouvrir dans l'éditeur »), préférences « Votre machine », progression et sauvegarde JSON, leçons 1 à 4 | ✅ |
| C2 | Quiz de fin de leçon, leçons 5 à 8 (parcours débutant complet) | à venir |
| C3 | Parcours confirmé, leçons 9 à 15 | à venir |
| C4 | Mode révision (questions générées par le profil, répétition espacée) | à venir |

Prévus ensuite (emplacements déjà réservés) : simulation 2D tour, autres types de machines,
estimation du temps d'usinage.

## Pages

- **Accueil** (page d'ouverture) : présentation du site et bouton **« Commencer à
  programmer »** qui ouvre l'éditeur.
- **Menu latéral** (☰) : Accueil, Éditeur, Mes programmes, Profils machines, Cours d'ISO,
  Calculateurs, Cycles, Ma bibliothèque, Paramètres, et les fonctions à venir (grisées). Affiché sur grand
  écran (repliable), escamoté sur smartphone. Une page dont la fonctionnalité est désactivée
  disparaît du menu.
- **Éditeur** : barre d'outils (Programmes, Enregistrer, puis les outils des fonctionnalités
  actives ; les actions ponctuelles sont dans le menu **« Outils »**), éditeur, panneau latéral
  (en volet bas sur smartphone) et barre d'état.
- **Profils machines** : profils intégrés (ISO générique, FANUC tournage) et personnels,
  activables et ordonnables ; codes propriétaires ou redéfinis, codes retirés, **plages de
  macros libres** (une ou plusieurs portions), export / import d'un profil, onglet « Codes
  actifs » (documentation effective). Depuis une infobulle : « Personnaliser pour ma machine »
  ou « Ajouter ce code à un profil ».
- **Calculateurs** : vitesse de coupe ↔ tr/min, avance (tournage / fraisage), rectification
  (meule, pièce, rapport q, avance de table, en mm/min et mm/s), conversion mm/min ↔ mm/s ↔
  m/min ↔ m/s, rugosité théorique, compensation de rayon de bec. Chaque calculateur fonctionne
  dans les deux sens et peut être masqué.
- **Cours d'ISO** : leçons courtes (débutant, puis confirmé) avec objectifs, sommaire,
  schémas, encadrés « À retenir », « Piège courant », « En rectification », « Selon votre
  machine », exemples colorés dont chaque code s'explique au tap et qui s'ouvrent dans
  l'éditeur. **« Votre machine »** : outil (ou meule) derrière ou devant l'axe, système de
  codes Fanuc A ou B/C — les leçons n'affichent que votre cas, ou toutes les versions côte à
  côte. Progression enregistrée (et incluse dans la sauvegarde JSON). Ajouter ou corriger une
  leçon : voir `src/data/courses/README.md`.
- **Paramètres** : en-tête fixe avec **recherche** dans tous les réglages (sans tenir compte
  des accents) et raccourcis vers chaque section ; apparence, éditeur, profils, fonctionnalités,
  données (sauvegarde / restauration JSON, réinitialisation des réglages, **« Tout effacer »**
  pour un poste partagé, avec confirmation par saisie de EFFACER), à propos et **raccourcis
  clavier**.

## Fonctionnalités

Chaque fonctionnalité est un module **désactivable individuellement** dans Paramètres ›
Fonctionnalités (avec « Tout activer / Tout désactiver » par groupe ou pour l'ensemble, et un
compteur des fonctionnalités actives). La désactivation est **réelle** : extensions de
l'éditeur, boutons, panneaux, pages et raccourcis sont retirés, sans rechargement. Tout
désactivé, il reste le socle : saisie, gestion des programmes, Ctrl+S.

Sous chaque interrupteur, Paramètres indique **où se trouve** la fonctionnalité (champ
`where` du module).

| Groupe | Fonctionnalité | Où la trouver | Dossier |
|---|---|---|---|
| Édition | Numérotation des lignes | Marge gauche de l'éditeur | `line-numbers` |
| Édition | Coloration syntaxique par catégorie | Texte de l'éditeur (légende dans Paramètres) | `highlighting` |
| Édition | Mise en évidence des variables et valeurs (occurrences d'une macro, d'un code ou d'une valeur) | Texte de l'éditeur et barre d'état | `occurrences` |
| Édition | Définitions au clic / tap : codes, paramètres de cycle selon le bloc (le U de `G71 U2. R0.5` n'est pas celui de `G71 P… Q… U0.4`), macros, décodage de T0101, G76 P020060, M98 P… | Clic / tap, F1 ou Ctrl+I | `definitions` |
| Édition | Autocomplétion des codes G et M du profil, avec définition | En tapant G ou M, Ctrl+Espace | `autocomplete` |
| Édition | Proposition de la prochaine macro libre | En tapant # | `macro-suggest` |
| Édition | Repliage des sous-programmes, boucles WHILE et opérations par outil | Marge, Ctrl+Maj+[ / ], menu Outils | `folding` |
| Édition | Annuler / rétablir | Barre d'outils, Ctrl+Z / Ctrl+Y | `history` |
| Analyse | Vérificateur de syntaxe (parenthèses, caractères invalides, codes inconnus ou incompatibles, adresses répétées, plusieurs M, cotes sans point décimal, avance non définie, broche sans S, G96 sans G50, G40 oublié, P/Q/GOTO introuvables, N en double, M30 manquant — chaque règle désactivable) | Soulignements, marge, barre d'état, Ctrl+Maj+M | `checker` |
| Analyse | État modal à la ligne du curseur | Barre d'état et panneau « État modal » | `modal-state` |
| Analyse | Tableau des variables (nom et description personnels, utilisations, valeurs répétées transformables en macro) | Panneau « Variables » | `variables` |
| Analyse | Avertissements de macros (hors des plages libres du profil, double utilisation entre programmes — non bloquants) | Soulignement orange, barre d'état | `macro-warnings` |
| Outils | Recherche et remplacement (expressions régulières) | Loupe, Ctrl+F | `search` |
| Outils | Formulaires de cycles FANUC (G71/G70, G72, G76, G92, G90, G74, G75) avec aperçu et conversions mm → µm | Panneau « Cycles » | `cycles` |
| Outils | Bibliothèque personnelle de sous-programmes | Panneau « Bibliothèque » | `library` |
| Outils | Renumérotation des N avec mise à jour des P/Q, GOTO, M99 P | Menu Outils | `renumber` |
| Outils | Décalage de coordonnées (cotes absolues X/Z/Y, sélection ou tout le programme) | Menu Outils | `coordinate-shift` |
| Outils | Versions (automatiques ou nommées), comparaison ligne à ligne, restauration | Menu Outils | `versions` |
| Fichiers | Sauvegarde automatique (avec copie de secours à la fermeture) | Barre d'état | `autosave` |
| Fichiers | Export en fichier `.nc` / `.txt` (fins de ligne au choix) | Menu Outils | `export-file` |
| Calculateurs | Calculateurs d'atelier | Page « Calculateurs » | `calculators` |
| Apprendre | Cours d'ISO | Page « Cours d'ISO » | `courses` |

Toujours présents (socle) : gestion de plusieurs programmes (créer, ouvrir un fichier
`.nc`/`.txt`, renommer, dupliquer, supprimer), enregistrement (Ctrl+S), thème clair/sombre,
taille du texte, retour à la ligne, sauvegarde/restauration JSON, profils machines.

### Raccourcis clavier

Sur Mac, ⌘ Cmd remplace Ctrl. La liste figure aussi dans Paramètres › À propos (un
raccourci dont la fonctionnalité est désactivée y est signalé).

| Raccourci | Action |
|---|---|
| Ctrl+S | Enregistrer |
| Ctrl+Z · Ctrl+Y (ou Ctrl+Maj+Z) | Annuler · rétablir |
| Ctrl+F · F3 / Maj+F3 · Ctrl+Alt+G | Rechercher et remplacer · suivant / précédent · aller à la ligne |
| F1 ou Ctrl+I | Définition de l'élément sous le curseur |
| Ctrl+Espace | Suggestions |
| Ctrl+Maj+M | Liste des erreurs et avertissements |
| Ctrl+Maj+[ · Ctrl+Maj+] | Replier · déplier le bloc |
| Ctrl+Alt+[ · Ctrl+Alt+] | Tout replier · tout déplier |
| Échap | Fermer l'infobulle, la liste ou le panneau |

## Structure du projet

```
index.html              page unique ; charge css/ et dist/app.js
css/                    tokens.css (couleurs des 2 thèmes), base, layout, components
assets/                 icône
dist/                   GÉNÉRÉ par « npm run build » (versionné pour que le site marche sans outil)
src/
  main.js, app.js       démarrage et assemblage des services
  version.js            version de l'application (= package.json)
  core/                 bus d'événements, registre des modules, routeur, espace de travail,
                        profils machines, utilitaires
  data/                 données pures : codes ISO / Fanuc, profils, cycles, langage macro, exemples,
                        leçons des cours (data/courses/, format dans son README)
  engine/               moteur d'analyse ISO, indépendant de l'interface (réutilisable par la simulation)
  storage/              localStorage (kv), IndexedDB + repli (database), programmes, sauvegarde JSON
  settings/             schéma déclaratif des réglages et magasin persistant
  ui/                   coque (barre du haut + menu latéral), éditeur (enveloppe CodeMirror),
                        pages (accueil, éditeur, paramètres, profils), dialogues, barre d'outils…
  modules/              fonctionnalités branchables, une par dossier (+ emplacements futurs :
                        simulation-2d, machining-time)
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
     group: 'outils',                       // editeur | analyse | outils | fichiers | calculateurs | apprendre
     where: 'Menu Outils de la barre d’outils', // affiché sous l'interrupteur dans Paramètres
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
(programme courant), `codes` (dictionnaire), `profiles`, `macros`, `settings`, `bus`, `backup`
(section de sauvegarde JSON), `ui` (barre d'outils, barre d'état, panneaux latéraux
`ui.panels.add`, pages `ui.addPage`, dialogues, notifications), `kv`, `listen()` (écouteur
DOM), `signal`.

### Ajouter une page et son entrée de menu

Depuis un module (page retirée automatiquement si le module est désactivé, comme
`src/modules/calculators/`) :

```js
ctx.ui.addPage({ id: 'calculateurs', path: '/calculateurs', label: 'Calculateurs', icon: 'calculator', order: 40, mount: () => element });
```

Une entrée de même `id` remplace l'entrée « à venir » du menu. Pour une page du socle, dans `src/app.js` : `router.register('/ma-page', { title, mount: () => element })` puis
`shell.addNavItem({ id, path: '/ma-page', label, icon })`. Retirer l'entrée « à venir »
correspondante et mettre à jour la carte de la page d'accueil (`src/ui/pages/home-page.js`).

### Ajouter un formulaire de cycle

Dans `src/data/cycles/fanuc-turning.js` (ou un nouveau fichier pour une autre commande, déclaré
dans `CYCLES_BY_PROFILE` de `src/modules/cycles/index.js`) :

```js
{
  id: 'g83', title: 'Perçage frontal G83', codes: ['G83'], description: '…',
  fields: [{ key: 'z', label: 'Profondeur', unit: 'mm', default: -20 }, …],
  generate: (v) => ({ lines: [`G83 Z${mm(v.z)} …`], notes: ['…'] }),
}
```

Un test vérifie que chaque formulaire génère, avec ses valeurs par défaut, un code accepté
par le vérificateur.

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
- `group` : groupe modal (`src/data/modal-groups.js`) ; deux codes du même groupe s'excluent
  dans un bloc (vérificateur) et le dernier reste actif (état modal). `nonModal` : groupe 00.

Pour **votre** machine, inutile de toucher aux fichiers : créez un profil personnel dans la
page Profils machines et ajoutez-y vos codes (ou « Personnaliser » un code depuis son
infobulle).

### Ajouter un profil machine

- **Profil personnel** : depuis l'interface (page Profils machines). Il est enregistré dans le
  navigateur, inclus dans la sauvegarde JSON, et exportable seul pour être partagé.
- **Profil intégré** (nouvelle commande : Siemens, Heidenhain…) : créer sa couche de codes
  dans `src/data/codes/` (même format que `fanuc-turning.js`), puis l'ajouter à
  `BUILTIN_PROFILES` dans `src/data/profiles.js` avec son état par défaut (activé, ordre,
  plages de macros).

Les profils activés s'empilent dans l'ordre de la liste : chacun complète ou remplace les
codes des précédents ; le dernier (le plus spécifique) l'emporte. Les plages de macros libres
en vigueur sont celles du profil activé le plus spécifique qui en déclare.

### Moteur d'analyse

`src/engine/` ne dépend ni du DOM ni de CodeMirror (réutilisable par la future simulation) :
`tokenizeLine` (jetons d'une ligne), `parseLine` / `parseProgram` (blocs : mots, codes,
variables, commentaires, N, O, saut de bloc), `createCodeDictionary` (couches de codes),
`modalStateAt` (état modal), `checkProgram` (vérificateur, règles dans `CHECKER_RULES`),
`renumber`, `shiftCoordinates`, `foldRanges`, `diffLines` (comparaison), `formatIso`, `cutting` (formules de coupe et conversions d'unités), `analyzeMacros` / `variableWarnings`
(variables, valeurs répétées, avertissements), plages de macros (`parseRanges`, `nextFreeVariable`…), `tokenCategory` (catégorie d'affichage), `explainToken` (définition d'un jeton dans son bloc),
`occurrenceKey` (identité d'une macro, d'un code ou
d'une valeur ; X25. et X25 sans point sont distingués, car sur Fanuc X25 peut valoir 0,025 mm).

## Sauvegarde JSON

```json
{
  "format": "l-iso-cpc/sauvegarde",
  "formatVersion": 1,
  "appVersion": "0.1.0",
  "exportedAt": "2026-10-01T12:00:00.000Z",
  "sections": { "programmes": [ … ], "profils": [ … ], "macros": [ … ],
                "bibliotheque": [ … ], "versions": [ … ], "parametres": { … } }
}
```

Chaque domaine de données s'enregistre comme une section (`backup.register`). À l'import :
**Fusionner** (ajoute les absents, met à jour les plus récents) ou **Remplacer**.

## Licences

Composant d'édition : [CodeMirror 6](https://codemirror.net/) (licence MIT, libre y compris
pour un usage commercial). Le détail des bibliothèques embarquées et de leurs licences est
généré dans `dist/THIRD_PARTY_LICENSES.txt`.
