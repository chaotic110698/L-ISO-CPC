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
| `code` | `lines` : `[['N10 G00 X20.', 'explication'], …]` ou `code` (texte), `caption?`, `open?` | extrait coloré ; `open` : nom du programme créé par « Ouvrir dans l'éditeur » ; `exercise: true` : programme volontairement fautif |
| `figure` | `figure`, `turret?`, `caption?` | schéma de `src/modules/courses/figures.js` ; `turret: true` le dessine outil derrière et/ou devant l'axe selon « Votre machine » |
| `table` | `head?`, `rows` | tableau |
| `anatomy` | `parts` : `[{ text: 'G01', label: '…' }]` | bloc décomposé mot par mot |
| `variants` | `pref` (`turret` ou `system`), `cases` : `{ valeur: [blocs] }`, `titles?` | explication propre à chaque machine, selon « Votre machine » (toutes par défaut) |

### Dictionnaire des définitions

Par défaut, les codes d'une leçon sont expliqués avec les **profils actifs** de l'utilisateur.
Un passage propre à un système de codes Fanuc utilise le sien, quel que soit le profil :

- `dictionary: 'a'` (système A), `'bc'` (systèmes B/C) ou `'iso'` (ISO générique) sur un
  bloc : vaut pour lui et ses blocs imbriqués ;
- `dictionaries: { A: 'a', BC: 'bc' }` sur un bloc `variants` : un dictionnaire par cas.

## Quiz

Champ `quiz` de la leçon : une liste de questions, corrigées une par une (bonne réponse et
explication), puis score ; le meilleur score est enregistré.

| type | champs | correction |
|---|---|---|
| `choice` | `options`, `answer` (index, ou liste d'index si plusieurs réponses) | toutes les bonnes cases, et elles seules |
| `block` | `expect` (bloc, ou liste de variantes acceptées) | mots comparés sans tenir compte de l'ordre, des zéros (`G1` = `G01`) ni du N ; point décimal exigé sur X, Z, U, W, R, I, K |
| `number` | `answer`, `tolerance?`, `unit?` | saisie « 1 273 » ou « 1273,0 » acceptée |
| `error` | `lines`, `answer` (index de la ligne fautive) | l'utilisateur touche la ligne |

Toutes les questions ont `question` et `explain` (texte enrichi), et acceptent `dictionary`.

## Vérifications automatiques (`npm test`)

`tests/unit/courses.test.js` contrôle chaque leçon : types de blocs, tons, schémas,
variantes complètes, **aucun code inconnu** dans les textes, extraits et quiz, **aucune erreur
du vérificateur** dans les programmes ouvrables dans l'éditeur, et que la bonne réponse de
chaque question est bien acceptée.
