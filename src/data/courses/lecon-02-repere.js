/** Leçon 2 — repère du tour : axes, diamètre, origine pièce. */
export default {
  id: 'repere-du-tour',
  level: 'debutant',
  number: 2,
  title: 'Le repère du tour',
  summary: 'Les axes X et Z, la cote X au diamètre, l’origine pièce : savoir où va l’outil avant d’écrire la moindre ligne.',
  duration: 15,
  goals: [
    'situer les axes X et Z et leur sens positif ;',
    'programmer une cote au diamètre ;',
    'comprendre l’origine pièce et pourquoi les Z d’usinage sont négatifs ;',
    'savoir que l’outil peut être devant ou derrière l’axe sans que le programme change.',
  ],
  sections: [
    {
      id: 'axes',
      title: 'Deux axes : X et Z',
      blocks: [
        {
          type: 'list',
          items: [
            '**Z** est l’axe de la broche. **Z+** s’éloigne du mandrin ; **Z–** va vers le mandrin.',
            '**X** est perpendiculaire à la broche : il mesure l’éloignement de l’outil par rapport à l’axe de la pièce. **X+** éloigne l’outil de l’axe ; **X–** l’en rapproche.',
          ],
        },
        {
          type: 'figure',
          figure: 'repere-tour',
          turret: true,
          caption: 'Demi-pièce vue dans le plan X/Z. Le choix « Votre machine » en haut de la leçon affiche votre cas ou les deux.',
        },
        {
          type: 'note',
          tone: 'machine',
          title: 'Outil devant ou derrière l’axe ?',
          blocks: [
            {
              type: 'p',
              text: 'Sur la plupart des tours CN à banc incliné, la tourelle est **derrière** l’axe de la broche (côté opposé à l’opérateur). Sur les tours conventionnels transformés et beaucoup de petits tours, l’outil est **devant**.',
            },
            {
              type: 'p',
              text: 'Dans les deux cas, **X+ éloigne l’outil de l’axe** : le programme est exactement le même. Seul le dessin change : on représente habituellement X+ vers le haut quand l’outil est derrière, vers le bas quand il est devant.',
            },
          ],
        },
        {
          type: 'note',
          tone: 'rectif',
          text: 'Sur une rectifieuse cylindrique CN, le repère est le même : **Z** suit la longueur de la pièce (mouvement de la table), **X** est l’avance de la meule vers la pièce. Faire plonger la meule, c’est diminuer X. La meule est le plus souvent derrière la pièce, comme une tourelle arrière.',
        },
      ],
    },
    {
      id: 'diametre',
      title: 'X se programme au diamètre',
      blocks: [
        {
          type: 'p',
          text: 'En tournage, X se programme presque toujours **au diamètre** : `X24.` place la pointe de l’outil sur un diamètre de 24 mm, c’est-à-dire à 12 mm de l’axe. On recopie ainsi directement les cotes du plan et la mesure du pied à coulisse ou du micromètre.',
        },
        {
          type: 'table',
          head: ['Sur le plan', 'Position de l’outil', 'Programmé'],
          rows: [
            ['Ø24', '12 mm de l’axe', '`X24.`'],
            ['Ø30,5', '15,25 mm de l’axe', '`X30.5`'],
            ['axe de la pièce (pointage, perçage)', '0', '`X0.`'],
          ],
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Une profondeur de passe se donne au rayon, mais X au diamètre : pour enlever **2 mm de matière** sur le rayon, X diminue de **4 mm**. De même, le déplacement relatif `U-1.` réduit le diamètre de 1 mm, soit 0,5 mm de matière.',
        },
        {
          type: 'note',
          tone: 'machine',
          text: 'Quelques machines travaillent au rayon (réglage par paramètre). Sur Siemens, l’instruction **DIAMON** active la programmation au diamètre et **DIAMOF** la désactive. En cas de doute, faites un essai à vide avec la visualisation de position.',
        },
      ],
    },
    {
      id: 'origine',
      title: 'L’origine pièce',
      blocks: [
        {
          type: 'list',
          items: [
            '**X0** est toujours l’axe de la broche.',
            '**Z0** est choisi par le programmeur : le plus souvent la **face avant de la pièce finie** (celle opposée au mandrin). Toutes les cotes Z d’usinage sont alors négatives.',
          ],
        },
        {
          type: 'p',
          text: 'Au réglage, l’opérateur mesure où se trouve cette origine (en touchant la face avec un outil, par exemple) et l’enregistre dans la commande. Le programme n’a plus qu’à utiliser les cotes du plan.',
        },
        {
          type: 'note',
          tone: 'machine',
          title: 'Où est enregistrée l’origine ?',
          blocks: [
            {
              type: 'list',
              items: [
                'dans un **décalage d’origine** `G54` à `G59`, commun à tous les outils ;',
                'ou dans les **correcteurs de géométrie** de chaque outil (méthode très courante sur tour Fanuc : la longueur Z de chaque outil inclut la position de la face) ;',
                'sur d’anciens programmes Fanuc (système A), par un bloc `G50` suivi de X et Z en début de programme, qui déclare la position actuelle de l’outil.',
              ],
            },
            { type: 'p', text: 'Demandez quelle méthode est utilisée dans votre atelier : le programme doit la respecter.' },
          ],
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Un Z positif trop grand fait seulement « couper l’air ». Un Z négatif trop grand envoie l’outil dans le mandrin : vérifiez toujours la longueur de pièce qui dépasse des mors.',
        },
      ],
    },
    {
      id: 'unites',
      title: 'Unités et plan de travail',
      blocks: [
        {
          type: 'list',
          items: [
            '`G21` : cotes en millimètres ; `G20` : en pouces. Une fois choisie, l’unité ne change plus dans le programme.',
            '`G18` : plan de travail ZX, celui du tour. Il est actif par défaut ; on l’écrit parfois en début de programme par sécurité. Il sert aux arcs et à la compensation de rayon.',
          ],
        },
      ],
    },
    {
      id: 'exercice',
      title: 'Du plan au programme',
      blocks: [
        {
          type: 'p',
          text: 'Une pièce présente un Ø20 sur 15 mm depuis la face, puis un Ø30 jusqu’à 30 mm. Origine : face avant. Les points du contour s’écrivent :',
        },
        {
          type: 'table',
          head: ['Point', 'Description', 'X', 'Z'],
          rows: [
            ['A', 'face, sur le Ø20', '`X20.`', '`Z0.`'],
            ['B', 'fin du Ø20', '`X20.`', '`Z-15.`'],
            ['C', 'épaulement, sur le Ø30', '`X30.`', '`Z-15.`'],
            ['D', 'fin du Ø30', '`X30.`', '`Z-30.`'],
          ],
        },
        {
          type: 'note',
          tone: 'retenir',
          text: 'Avant d’écrire un programme, notez les points du contour avec leur X (diamètre) et leur Z (souvent négatif). C’est la moitié du travail, et la leçon 4 réutilise ces points.',
        },
      ],
    },
  ],
};
