# Simulation 2D du tournage

- `src/engine/toolpath.js` (moteur, sans DOM) interprète le programme : liste des déplacements
  `{ line, kind: 'rapid' | 'cut', points: [{ x (diamètre), z }], feed, speed… }` et alertes ;
  `src/engine/macro-eval.js` calcule les expressions de macro.
- `src/engine/turning-cycles.js` : cycles développés en passes (G71/G72/G73, G90/G92/G94,
  G74/G75, G76), appelés par l'interpréteur.
- `wheel.js` : taillage de meule (rectification) — diamants droit / 45°, origines (angle gauche,
  angle droit), cotes ramenées dans le repère de la meule, largeur lue dans « (MEULE L40) ».
- `stock.js` : brut lu dans un commentaire « (BRUT D50 X 80) », estimé, ou saisi (par programme).
- `material.js` : matière restante en pixels ; l'outil balayé le long du trajet l'efface.
- `playback.js` : chronologie (durée de chaque déplacement, position de l'outil à un instant).
- `view.js` : dessin dans un `<canvas>`, zoom / déplacement au doigt ou à la souris.
- `index.js` : page `#/simulation`, commandes de lecture, alertes, lien avec l'éditeur.

Tourelle avant ou arrière : simple miroir à l'affichage (réglage du module). Prochaine étape :
`../machining-time/` (temps d'usinage détaillé) s'appuiera sur `moveMinutes`.
