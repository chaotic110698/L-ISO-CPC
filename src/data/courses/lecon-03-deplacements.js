/** Leçon 3 — déplacements G00, G01, G02, G03. */
export default {
  id: 'deplacements',
  level: 'debutant',
  number: 3,
  title: 'Les déplacements : G00, G01, G02, G03',
  summary: 'Rapide, ligne droite, arcs : choisir le bon déplacement, le bon sens d’arc, et approcher la pièce sans risque.',
  duration: 20,
  goals: [
    'utiliser G00 pour approcher et dégager en sécurité ;',
    'usiner en ligne droite avec G01 (chariotage, dressage, chanfrein) ;',
    'choisir entre G02 et G03 quelle que soit votre machine ;',
    'écrire un arc avec R ou avec I et K.',
  ],
  sections: [
    {
      id: 'g00',
      title: 'G00 : déplacement rapide',
      blocks: [
        {
          type: 'p',
          text: '`G00` déplace l’outil à la vitesse maximale de la machine, **sans usiner**. On l’utilise pour approcher la pièce, la quitter et aller au point de changement d’outil.',
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'En `G00`, la trajectoire n’est pas toujours une ligne droite : sur beaucoup de Fanuc, chaque axe part à sa vitesse maxi et l’un arrive avant l’autre (trajectoire « en coude », selon le paramètre 1401). Pour passer près de la pièce, déplacez un axe après l’autre.',
        },
        {
          type: 'list',
          items: [
            '**Approche** : s’arrêter à un point de sécurité hors matière, par exemple `G00 X42. Z2.` (2 mm devant la face).',
            '**Dégagement après un usinage extérieur** : d’abord X (on s’écarte de la pièce), puis Z.',
            '**Dégagement après un alésage** : l’inverse, d’abord Z (on sort du trou), puis X.',
          ],
        },
      ],
    },
    {
      id: 'g01',
      title: 'G01 : ligne droite à l’avance',
      blocks: [
        {
          type: 'p',
          text: '`G01` déplace l’outil en ligne droite à l’avance programmée par `F`. C’est le déplacement d’usinage. Selon les axes indiqués :',
        },
        {
          type: 'list',
          items: [
            'Z seul : **chariotage** (le diamètre reste constant), par exemple `G01 Z-30. F0.2` ;',
            'X seul : **dressage** ou plongée, par exemple `G01 X0. F0.15` ;',
            'X et Z ensemble : **cône ou chanfrein**. Depuis `X18. Z0.`, le bloc `G01 X20. Z-1.` fait un chanfrein de 1 × 45° (1 mm au rayon et 1 mm en Z).',
          ],
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Le premier `G01` d’un programme doit avoir une avance `F`. Sans elle, la machine s’arrête en alarme ou, pire, reprend une avance précédente inadaptée.',
        },
        {
          type: 'note',
          tone: 'rectif',
          text: 'En rectification, presque tout se fait en `G01` : plongée de la meule (X), passes de table (Z), avec des avances très faibles. Les arcs servent surtout au diamantage de forme de la meule, selon les machines.',
        },
      ],
    },
    {
      id: 'arcs',
      title: 'G02 et G03 : les arcs',
      blocks: [
        {
          type: 'p',
          text: '`G02` décrit un arc dans le **sens horaire**, `G03` dans le **sens anti-horaire**. Mais « horaire » dépend du côté d’où l’on regarde : c’est ici que la position de l’outil compte.',
        },
        {
          type: 'figure',
          figure: 'arcs',
          turret: true,
          caption: 'Même programme sur les deux machines : arrondi convexe en `G03`, congé concave en `G02`.',
        },
        {
          type: 'variants',
          pref: 'turret',
          titles: { rear: 'Outil derrière l’axe (tourelle arrière, meule de rectifieuse)', front: 'Outil devant l’axe (tourelle avant)' },
          cases: {
            rear: [
              {
                type: 'p',
                text: 'Dessinez la pièce avec X+ vers le haut et Z+ vers la droite : `G02` tourne dans le sens des aiguilles d’une montre **sur votre dessin**, `G03` dans l’autre sens.',
              },
            ],
            front: [
              {
                type: 'p',
                text: 'Avec X+ vers le bas sur le dessin (l’outil est devant), le dessin est retourné : un `G02` **paraît** anti-horaire. Le code, lui, ne change pas. Astuce : retournez votre croquis (X+ vers le haut) avant de lire le sens.',
              },
            ],
          },
        },
        {
          type: 'note',
          tone: 'retenir',
          title: 'Règle valable sur toutes les machines',
          text: 'Profil **extérieur** usiné **vers le mandrin** (Z diminue) : un arrondi **convexe** (bosse) est un `G03`, un congé **concave** (creux) est un `G02`. Pour un alésage, ou en remontant vers la face, le sens s’inverse : refaites le croquis.',
        },
      ],
    },
    {
      id: 'r-ou-ik',
      title: 'Définir l’arc : R ou I et K',
      blocks: [
        {
          type: 'p',
          text: 'Le bloc d’arc donne le **point d’arrivée** (X et Z) et la taille de l’arc, de deux façons :',
        },
        {
          type: 'list',
          items: [
            '**R** : le rayon de l’arc. Simple et lisible, c’est la forme la plus utilisée : `G03 X20. Z-2. R2.`',
            '**I et K** : la position du **centre** par rapport au **point de départ**. I en X (donné **au rayon**, même si X est au diamètre), K en Z : `G03 X20. Z-2. I0. K-2.`',
          ],
        },
        {
          type: 'p',
          text: 'Les deux blocs ci-dessus sont équivalents : partant de `X16. Z0.` (rayon 8), le centre est au même rayon 8 (I = 0) et 2 mm plus loin en Z (K = –2).',
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Avec R, un même point d’arrivée accepte deux arcs (petit ou grand). Avec un R positif, la CN prend l’arc de moins de 180° (sur Fanuc, un R négatif demande le grand arc). Pour un cercle complet, utilisez I et K. Vérifiez aussi que le rayon est possible : un écart entre départ et arrivée plus grand que le diamètre de l’arc provoque une alarme.',
        },
      ],
    },
    {
      id: 'programme',
      title: 'Un profil complet',
      blocks: [
        {
          type: 'p',
          text: 'Passe de finition du profil du schéma (la pièce est supposée déjà ébauchée) :',
        },
        {
          type: 'code',
          open: 'Cours 3 - profil avec arcs',
          lines: [
            ['%', null],
            ['O0003 (PROFIL AVEC ARCS)', null],
            ['N10 G21 G40 G97 G99', 'Réglages de sécurité'],
            ['N20 T0202 (FINITION)', 'Outil de finition'],
            ['N30 S1500 M03', 'Broche à 1 500 tr/min'],
            ['N40 G00 X16. Z2. M08', 'Approche devant la face'],
            ['N50 G01 Z0. F0.1', 'Contact sur la face, avance de finition'],
            ['N60 G03 X20. Z-2. R2.', 'Arrondi convexe R2'],
            ['N70 G01 Z-15.', 'Ø20 sur 15 mm'],
            ['N80 G02 X26. Z-18. R3.', 'Congé concave R3 au pied de l’épaulement'],
            ['N90 G01 X30.', 'Face de l’épaulement'],
            ['N100 Z-30.', 'Ø30 (G01 toujours actif)'],
            ['N110 G00 X40.', 'Dégagement en X d’abord'],
            ['N120 Z2. M09', 'Puis en Z, arrêt arrosage'],
            ['N130 M05', null],
            ['N140 G28 U0. W0.', 'Retour au point de référence'],
            ['N150 M30', null],
            ['%', null],
          ],
        },
        {
          type: 'note',
          tone: 'info',
          text: 'La pointe d’un outil de tournage est arrondie (rayon de bec). Sur les arcs et les cônes, cela fausse légèrement le profil : la compensation de rayon `G41` / `G42` corrige cet écart (leçon 6).',
        },
      ],
    },
  ],
  quiz: [
    {
      type: 'choice',
      question: 'Quel déplacement utilise-t-on pour approcher la pièce, hors matière ?',
      options: ['`G00`', '`G01`', '`G02`'],
      answer: 0,
      explain: '`G00` : déplacement rapide, sans usiner, jusqu’à un point de sécurité (par exemple 2 mm devant la face).',
    },
    {
      type: 'block',
      question: 'L’outil est en `X18. Z0.`. Écrivez le chanfrein 1 × 45° qui arrive sur le Ø20, à 0,1 mm/tr.',
      expect: 'G01 X20. Z-1. F0.1',
      explain: 'Le diamètre passe de 18 à 20 (1 mm au rayon) pendant que Z avance de 1 mm : chanfrein à 45°, en `G01` à l’avance `F0.1`.',
    },
    {
      type: 'choice',
      question: 'Profil extérieur usiné vers le mandrin : un congé concave (creux) au pied d’un épaulement se programme en…',
      options: ['`G02`', '`G03`'],
      answer: 0,
      explain: 'En extérieur vers le mandrin : creux = `G02`, bosse (arrondi convexe) = `G03`. C’est vrai que l’outil soit devant ou derrière l’axe.',
    },
    {
      type: 'block',
      question: 'Depuis `X16. Z0.`, écrivez l’arrondi convexe de rayon 2 qui arrive en `X20. Z-2.` (avec R).',
      expect: 'G03 X20. Z-2. R2.',
      explain: 'Arrondi convexe en extérieur vers le mandrin : `G03`, point d’arrivée `X20. Z-2.`, rayon `R2.`.',
    },
    {
      type: 'choice',
      question: 'Après un alésage (usinage intérieur), dans quel ordre dégage-t-on l’outil ?',
      options: ['D’abord X, puis Z', 'D’abord Z, puis X', 'Les deux ensemble en G00'],
      answer: 1,
      explain: 'Dans un trou, on sort d’abord en Z ; un mouvement en X ferait toucher la paroi. En extérieur, c’est l’inverse.',
    },
    {
      type: 'error',
      question: 'Ce profil extérieur (vers le mandrin) comporte un congé concave R3 au pied de l’épaulement. Quelle ligne est fausse ?',
      lines: ['N40 G00 X16. Z2.', 'N50 G01 Z0. F0.1', 'N60 G03 X20. Z-2. R2.', 'N70 G01 Z-15.', 'N80 G03 X26. Z-18. R3.', 'N90 G01 X30.'],
      answer: 4,
      explain: 'Le congé au pied de l’épaulement est concave : il faut `G02`, pas `G03`. L’arrondi de la ligne N60 est convexe, en `G03` : il est juste.',
    },
  ],
};
