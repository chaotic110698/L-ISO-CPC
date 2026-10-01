# Moteur d'analyse ISO (étape 2)

Ce dossier contiendra le **moteur d'analyse**, sans aucune dépendance au DOM ni à CodeMirror,
pour pouvoir être réutilisé tel quel par l'éditeur, le vérificateur, la future simulation 2D
et les tests Node :

- `tokenizer.js` : découpe une ligne en jetons (N, G, M, T, adresses X/Z/F/S…, `#macros`, commentaires, `%`, `O`…) ;
- `parser.js` : regroupe les jetons en blocs structurés (sous-programmes, boucles `WHILE`/`GOTO`…) ;
- `code-resolver.js` : fusionne les profils machines actifs en un dictionnaire de codes effectif ;
- `modal-state.js` : calcule l'état modal (G90/G91, G96/G97, G98/G99, outil…) bloc par bloc ;
- `checker/` : règles du vérificateur de syntaxe, une par fichier.

Règle : **aucun import depuis `src/ui/` ni depuis `@codemirror/*`** dans ce dossier.
