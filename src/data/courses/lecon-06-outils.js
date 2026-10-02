/** Leçon 6 — outils, correcteurs et compensation de rayon de bec. */
export default {
  id: 'outils-corrections',
  level: 'debutant',
  number: 6,
  title: 'Outils et corrections',
  summary: 'Appeler un outil avec son correcteur, corriger une cote avec l’usure, compenser le rayon de bec avec G41/G42/G40.',
  duration: 25,
  goals: [
    'lire et écrire un appel d’outil `T0101` ;',
    'distinguer correcteur de géométrie et correcteur d’usure ;',
    'rattraper une cote hors tolérance avec l’usure ;',
    'activer et annuler la compensation de rayon de bec au bon moment.',
  ],
  sections: [
    {
      id: 'appel',
      title: 'Appeler un outil',
      blocks: [
        {
          type: 'p',
          text: 'Sur un tour Fanuc, `T0101` fait deux choses : il amène le **poste 01** de la tourelle en position de travail et applique le **correcteur 01**. Les deux premiers chiffres désignent le poste, les deux derniers le correcteur.',
        },
        {
          type: 'table',
          head: ['Écriture', 'Signification'],
          rows: [
            ['`T0101`', 'poste 1, correcteur 1 (cas le plus courant : même numéro)'],
            ['`T0313`', 'poste 3, correcteur 13 (deuxième jeu de corrections pour le même outil)'],
            ['`T0300`', 'poste 3, correction annulée'],
          ],
        },
        {
          type: 'note',
          tone: 'machine',
          text: 'Selon la machine, l’écriture change : certaines attendent `T0101` puis un `M06`, d’autres numérotent sur 2 chiffres seulement. Sur Siemens, on écrit **T1 D1** (outil, puis numéro de correcteur). Reprenez la forme des programmes existants de votre machine.',
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Avant un changement d’outil, la tourelle doit pouvoir tourner sans toucher la pièce ni la contre-pointe : dégagez toujours à une position sûre (point de changement d’outil, ou `G28`).',
        },
      ],
    },
    {
      id: 'correcteurs',
      title: 'Géométrie et usure',
      blocks: [
        {
          type: 'p',
          text: 'Chaque correcteur contient deux séries de valeurs, saisies sur la page des correcteurs de la commande :',
        },
        {
          type: 'list',
          items: [
            '**Géométrie** : les longueurs X et Z de l’outil (et souvent la position de la face pièce), mesurées au réglage ou au banc de préréglage, ainsi que le rayon de bec R et le code de position de la pointe.',
            '**Usure** : de petites corrections ajoutées pendant la production pour tenir la cote quand la plaquette s’use.',
          ],
        },
        {
          type: 'note',
          tone: 'retenir',
          title: 'Rattraper une cote',
          text: 'Diamètre mesuré 20,04 pour 20,00 demandé : la pièce est trop grosse de 0,04 mm. Entrez **−0,04** dans l’usure X de l’outil (au diamètre, comme X), puis usinez la pièce suivante. Ne modifiez pas le programme pour ça.',
        },
        {
          type: 'note',
          tone: 'machine',
          text: 'Selon un paramètre de la commande, l’usure X s’entre au diamètre (le plus courant en tournage) ou au rayon. En cas de doute, faites une petite correction et vérifiez à la mesure.',
        },
        {
          type: 'note',
          tone: 'rectif',
          text: 'En rectification, le diamètre de la meule diminue à chaque diamantage. Selon la machine, la commande compense automatiquement (le diamantage met à jour un correcteur de meule) ou il faut saisir le nouveau diamètre. Les corrections de cote se font comme en tournage, dans un correcteur d’usure, avec des valeurs de l’ordre du micron.',
        },
      ],
    },
    {
      id: 'rayon-de-bec',
      title: 'Le rayon de bec',
      blocks: [
        {
          type: 'p',
          text: 'Une plaquette de tournage n’a pas une pointe vive : elle est arrondie (rayon de bec de 0,2 à 1,6 mm, souvent 0,4 ou 0,8). Le réglage mesure une pointe **théorique**, à l’intersection des deux arêtes.',
        },
        {
          type: 'list',
          items: [
            'sur un **cylindre** ou une **face**, l’arrondi n’a pas d’effet : la cote est juste ;',
            'sur un **cône**, un **chanfrein** ou un **arc**, la vraie zone de coupe n’est pas la pointe théorique : le profil est décalé (trop de matière sur les chanfreins, rayons faux).',
          ],
        },
        {
          type: 'p',
          text: 'La **compensation de rayon de bec** corrige automatiquement ce décalage, à partir du rayon R et du code de position de la pointe saisis dans le correcteur.',
        },
        {
          type: 'table',
          head: ['Code', 'Effet'],
          rows: [
            ['`G42`', 'outil à **droite** du profil, en regardant dans le sens du déplacement : cas d’un profil **extérieur** usiné vers le mandrin'],
            ['`G41`', 'outil à **gauche** du profil : cas d’un profil **intérieur** (alésage) usiné vers le mandrin'],
            ['`G40`', 'annulation de la compensation'],
          ],
        },
        {
          type: 'note',
          tone: 'info',
          text: 'Comme pour `G02` / `G03`, le choix entre `G41` et `G42` ne dépend pas de la position de l’outil devant ou derrière l’axe : le programme est le même. Le **code de position de la pointe** (de 0 à 9, saisi avec le rayon dans le correcteur) se lit sur le schéma de la notice : un outil d’extérieur classique y est le plus souvent en position 3.',
        },
      ],
    },
    {
      id: 'activer',
      title: 'Activer et annuler la compensation',
      blocks: [
        {
          type: 'list',
          ordered: true,
          items: [
            'activer `G42` (ou `G41`) sur un déplacement **en ligne droite** (`G00` ou `G01`), hors matière, plus long que le rayon de bec ;',
            'usiner le profil normalement, avec les cotes du plan ;',
            'annuler avec `G40` sur un déplacement de **dégagement** en ligne droite, hors matière.',
          ],
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Activer ou annuler la compensation sur un arc, ou sur un déplacement trop court, provoque une alarme ou une entaille dans la pièce. Et un `G40` oublié décale les déplacements de l’outil suivant : on le met aussi dans le bloc de sécurité du début de programme.',
        },
        {
          type: 'code',
          open: 'Cours 6 - compensation de rayon',
          caption: 'Le profil de la leçon 3, en finition avec compensation (rayon de bec saisi dans le correcteur 02).',
          lines: [
            ['%', null],
            ['O0006 (COMPENSATION DE RAYON)', null],
            ['N10 G21 G40 G97 G99', 'G40 par sécurité'],
            ['N20 T0202 (FINITION R0.4)', null],
            ['N30 G50 S3000', null],
            ['N40 G96 S200 M03', null],
            ['N50 G00 G42 X16. Z2. M08', 'Activation de G42 sur l’approche, hors matière'],
            ['N60 G01 Z0. F0.1', null],
            ['N70 G03 X20. Z-2. R2.', 'Arrondi : maintenant exact'],
            ['N80 G01 Z-15.', null],
            ['N90 G02 X26. Z-18. R3.', null],
            ['N100 G01 X30.', null],
            ['N110 Z-30.', null],
            ['N120 G00 G40 X40.', 'Annulation sur le dégagement'],
            ['N130 Z2. M09', null],
            ['N140 G97 S600', null],
            ['N150 M05', null],
            ['N160 G28 U0. W0.', null],
            ['N170 M30', null],
            ['%', null],
          ],
        },
      ],
    },
  ],
  quiz: [
    {
      type: 'choice',
      question: 'Que signifie `T0313` ?',
      options: ['Outil 13, correcteur 3', 'Poste 3, correcteur 13', 'Outil 313'],
      answer: 1,
      explain: 'Les deux premiers chiffres désignent le poste de tourelle, les deux derniers le correcteur.',
    },
    {
      type: 'number',
      question: 'Diamètre demandé 30,00, mesuré 30,06. Quelle valeur ajoutez-vous à l’usure X (au diamètre) ?',
      answer: -0.06,
      tolerance: 0.0001,
      unit: 'mm',
      explain: 'La pièce est trop grosse de 0,06 mm : on corrige de −0,06 mm dans l’usure X, sans toucher au programme.',
    },
    {
      type: 'choice',
      question: 'Sur quelle forme le rayon de bec fausse-t-il le profil si la compensation n’est pas active ?',
      options: ['Un cylindre', 'Une face', 'Un chanfrein ou un arc'],
      answer: 2,
      explain: 'Sur les cylindres et les faces, la pointe théorique et la zone de coupe sont alignées. Sur les cônes, chanfreins et arcs, elles ne le sont pas.',
    },
    {
      type: 'choice',
      question: 'Profil extérieur usiné vers le mandrin : quelle compensation ?',
      options: ['`G41`', '`G42`', '`G40`'],
      answer: 1,
      explain: 'En extérieur vers le mandrin, l’outil est à droite du profil dans le sens du déplacement : `G42`. En alésage, `G41`.',
    },
    {
      type: 'error',
      question: 'Quelle ligne active ou annule la compensation au mauvais moment ?',
      lines: ['N50 G00 X16. Z2. M08', 'N60 G01 Z0. F0.1', 'N70 G03 G42 X20. Z-2. R2.', 'N80 G01 Z-15.', 'N90 G00 G40 X40.'],
      answer: 2,
      explain: 'La compensation ne s’active pas sur un arc : il faut la mettre sur un déplacement en ligne droite hors matière, par exemple sur l’approche `G00 G42 X16. Z2.`.',
    },
    {
      type: 'block',
      question: 'Écrivez le dégagement rapide en `X40.` qui annule la compensation.',
      expect: 'G00 G40 X40.',
      explain: '`G40` s’annule sur un déplacement en ligne droite de dégagement, ici en rapide.',
    },
  ],
};
