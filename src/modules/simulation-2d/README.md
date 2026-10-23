# Simulateurs 2D (tour, rectification)

Deux modules partagent ce dossier : `simulation-2d` (page `#/simulation`, menu Simulateur › Tour)
et `../rectification/` (page `#/rectification`, menu Simulateur › Rectification). Chacun a ses
programmes chargés, ses réglages et son bouton dans l'éditeur ; le centre d'usinage est à venir.

- `src/engine/toolpath.js` (moteur, sans DOM) interprète le programme : liste des déplacements
  `{ line, kind: 'rapid' | 'cut', points: [{ x (diamètre), z }], feed, speed… }` et alertes ;
  `src/engine/macro-eval.js` calcule les expressions de macro.
- `src/engine/turning-cycles.js` : cycles développés en passes (G71/G72/G73, G90/G92/G94,
  G74/G75, G76), appelés par l'interpréteur.
- `session.js` : programmes chargés (copie de leur texte), exécutés l'un après l'autre avec des
  variables partagées et la position reprise.
- `wheel.js` : taillage de meule (rectification) — diamants droit / 45°, repère de chaque diamant
  (origine : angle gauche, angle droit ou milieu ; sens de Z+), cotes ramenées dans le repère de
  la meule, largeur lue dans « (MEULE L40) ».
- `stock.js` : brut lu dans un commentaire « (BRUT D50 X 80) », estimé, ou saisi (par programme).
- `material.js` : matière restante en pixels ; l'outil balayé le long du trajet l'efface.
- `playback.js` : chronologie (durée de chaque déplacement, position de l'outil à un instant).
- `view.js` : dessin dans un `<canvas>`, zoom / déplacement au doigt ou à la souris.
- `simulator.js` : page d'un simulateur (machine `lathe` ou `dressing`) — programmes chargés,
  commandes de lecture, alertes, lien avec l'éditeur.
- `index.js` : module Tour (réglages : tourelle, vitesse des rapides).

Tourelle avant ou arrière : simple miroir à l'affichage (réglage du module). Prochaine étape :
`../machining-time/` (temps d'usinage détaillé) s'appuiera sur `moveMinutes`.
