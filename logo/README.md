# Logo de l'application

Déposez **une image** dans ce dossier : elle devient le logo du site et de l'application
installée (écran d'accueil du téléphone, onglet du navigateur, haut de page).

## Depuis GitHub (sans rien installer)

1. Sur la page du dépôt, ouvrez le dossier `logo`.
2. **Add file › Upload files**, choisissez votre image, puis **Commit changes**.
3. Patientez une à deux minutes : GitHub fabrique les icônes (onglet **Actions**,
   « Icônes de l'application »), les enregistre dans `assets/`, puis GitHub Pages met le site à jour.
4. Sur le téléphone, l'icône d'une application **déjà installée** ne change souvent qu'après
   l'avoir désinstallée puis réinstallée (menu Outils › Installer l'application).

## L'image

- Formats acceptés : **PNG, JPG, WEBP, SVG, GIF, AVIF**. Le nom du fichier est libre.
- Idéalement **carrée**, d'au moins **512 × 512 pixels**. Une image rectangulaire est gardée
  entière (jamais rognée) et centrée.
- Fond transparent possible : il devient blanc pour les icônes de téléphone, qui exigent un fond plein.
- Gardez une marge autour du dessin : Android découpe l'icône en cercle ou en carré arrondi.
- **Une seule image** dans ce dossier (s'il y en a plusieurs, la première par ordre alphabétique
  est utilisée).

Pour revenir au logo « ISO » d'origine : supprimez l'image de ce dossier.

À la main, sur un ordinateur où le projet est installé : `node tools/make-icons.mjs`.
