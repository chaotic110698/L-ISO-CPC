# Simulation 2D du tournage (hors phase 1)

Emplacement réservé. Module prévu :

- consomme la sortie du moteur (`src/engine/`) : blocs analysés + état modal ;
- calcule la trajectoire de l'outil dans le plan X/Z (G0/G1/G2/G3, cycles développés en mouvements élémentaires) ;
- l'affiche dans un `<canvas>` (vue de profil, diamètre/rayon selon le profil machine) ;
- enregistre sa propre page via le routeur (`#/simulation`) et son lien de navigation ;
- évolution possible : enlèvement de matière animé, estimation du temps d'usinage (`../machining-time/`).

Comme tout module, il sera activable/désactivable dans Paramètres.
