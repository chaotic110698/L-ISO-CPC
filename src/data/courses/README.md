# Cours d'ISO — format des leçons

Une leçon = un fichier `lecon-NN-nom.js` de ce dossier, importé dans `index.js` (liste
`LESSONS`, dans l'ordre). Une entrée sans `sections` est affichée « en préparation ».

```js
export default {
  id: 'repere-du-tour',          // identifiant unique (adresse : #/cours/repere-du-tour)
  level: 'debutant',             // 'debutant' | 'confirme' (voir LEVELS)
  number: 2,                     // numéro affiché (= position dans LESSONS)
  title: 'Le repère du tour',
  summary: 'Une phrase pour le catalogue.',
  duration: 15,                  // minutes
  goals: ['situer les axes…'],   // « Dans cette leçon, vous allez apprendre à : »
  sections: [
    { id: 'axes', title: 'Deux axes : X et Z', blocks: [ /* blocs ci-dessous */ ] },
  ],
};
```

## Texte enrichi

Dans tous les textes : `` `G01` `` → code coloré, avec sa définition au tap ; `**gras**` ;
`*italique*`. N'écrivez entre accents graves que du code ISO valide pour le profil (les tests
le vérifient) ; les mots d'autres commandes (Siemens…) s'écrivent en **gras**.

## Blocs

| type | champs | rendu |
|---|---|---|
| `p` | `text` | paragraphe |
| `list` | `items`, `ordered?` | liste |
| `note` | `tone`, `title?`, `text` ou `blocks` | encadré : `retenir`, `piege`, `info`, `rectif`, `machine` |
| `code` | `lines` : `[['N10 G00 X20.', 'explication'], …]` ou `code` (texte), `caption?`, `open?` | extrait coloré ; `open` : nom du programme créé par « Ouvrir dans l'éditeur » |
| `figure` | `figure`, `turret?`, `caption?` | schéma de `src/modules/courses/figures.js` ; `turret: true` le dessine outil derrière et/ou devant l'axe selon « Votre machine » |
| `table` | `head?`, `rows` | tableau |
| `anatomy` | `parts` : `[{ text: 'G01', label: '…' }]` | bloc décomposé mot par mot |
| `variants` | `pref` (`turret` ou `system`), `cases` : `{ valeur: [blocs] }`, `titles?` | explication propre à chaque machine, selon « Votre machine » (toutes par défaut) |

Tout bloc accepte `dictionary: 'iso'` : ses codes (et ceux des blocs imbriqués) sont alors
expliqués avec l'ISO générique au lieu du profil actif — pour les exemples en systèmes B/C,
où `G90` / `G91` sont absolu / incrémental et non un cycle.

## Vérifications automatiques (`npm test`)

`tests/unit/courses.test.js` contrôle chaque leçon : types de blocs, tons, schémas,
variantes complètes, **aucun code inconnu** dans les textes et extraits, et **aucune erreur
du vérificateur** dans les programmes ouvrables dans l'éditeur.
