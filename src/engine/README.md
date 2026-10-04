# Moteur d'analyse ISO

Fonctions **pures**, sans aucune dépendance au DOM ni à CodeMirror : elles servent à l'éditeur,
au vérificateur, aux cours, aux tests Node, et serviront à la future simulation 2D. L'API
publique est réexportée par `index.js`.

| Fichier | Rôle |
|---|---|
| `tokenizer.js` | découpe une ligne en jetons (mots N/G/M/X…, `#macros`, mots-clés, commentaires, `%`…) |
| `parser.js` | regroupe les jetons d'une ligne en bloc structuré ; `parseProgram` analyse un programme entier |
| `code-dictionary.js` | superpose les couches de codes des profils actifs en un dictionnaire effectif |
| `classify.js` | catégorie d'affichage d'un jeton (couleur de la coloration syntaxique) |
| `explain.js` | définition d'un jeton dans le contexte de son bloc (infobulles, cours) |
| `occurrences.js` | identité d'un jeton, pour repérer ses autres occurrences |
| `modal-state.js` | état modal ligne par ligne : groupes G actifs, outil, broche, arrosage, F, S, limitation |
| `checker.js` | vérificateur de syntaxe et de cohérence (règles `CHECKER_RULES`) |
| `macro-ranges.js` | plages de macros libres : validation, lecture, prochaine variable libre |
| `macros.js` | variables de macro, valeurs répétées, avertissements de plage et de double utilisation |
| `renumber.js` | renumérotation des blocs N avec mise à jour des références P/Q, GOTO, M99 P |
| `shift.js` | décalage des cotes absolues |
| `folding.js` | zones repliables (sous-programmes, boucles, opérations) |
| `format.js` | écriture d'une valeur à la manière d'un programme ISO (point décimal, sans zéros inutiles) |
| `diff.js` | comparaison ligne à ligne (algorithme de Myers) pour les versions |
| `cutting.js` | formules de coupe des calculateurs (tournage, fraisage, rectification) |
| `outline.js` | plan du programme (programmes, sections, outils, cycles, appels, fins) |
| `goto.js` | « Aller à… » (ligne, N, O, T) et lignes exécutables (mode pupitre) |
| `toolpath.js` | interpréteur de trajectoire pour la simulation : déplacements, alertes, durées |
| `turning-cycles.js` | cycles de tournage développés en passes (G71…G76, G90/G92/G94) |
| `macro-eval.js` | calcul des expressions de macro (#…, [ ], fonctions) |

Règle : **aucun import depuis `src/ui/` ni depuis `@codemirror/*`** dans ce dossier.
