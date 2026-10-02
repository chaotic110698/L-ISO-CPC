/** Leçon 1 — structure d'un programme ISO. Format : voir README.md de ce dossier. */
export default {
  id: 'programme-iso',
  level: 'debutant',
  number: 1,
  title: 'Qu’est-ce qu’un programme ISO ?',
  summary: 'Blocs, mots, adresses : lire et écrire la structure d’un programme, du % de début au M30 de fin.',
  duration: 15,
  goals: [
    'reconnaître un bloc et ses mots (adresse + valeur) ;',
    'distinguer les fonctions G et M ;',
    'repérer le début, la fin et les commentaires d’un programme ;',
    'éviter le piège du point décimal.',
  ],
  sections: [
    {
      id: 'role',
      title: 'Le rôle du programme',
      blocks: [
        {
          type: 'p',
          text: 'Une machine à commande numérique (CN) exécute une suite d’instructions écrites en texte, **ligne après ligne**. Ce langage est appelé **ISO** (norme ISO 6983) ou **G-code**.',
        },
        {
          type: 'p',
          text: 'La base est commune à presque toutes les commandes : Fanuc, Siemens, Num, Mazak, Okuma, Haas… Chaque constructeur ajoute ensuite ses propres codes et ses variantes. Ces cours suivent **Fanuc**, la commande la plus répandue, et signalent les différences importantes.',
        },
        {
          type: 'note',
          tone: 'info',
          text: 'Les profils machines du site (menu « Profils machines ») servent justement à décrire les codes propres à **votre** machine : les définitions affichées au tap en tiennent compte.',
        },
      ],
    },
    {
      id: 'bloc',
      title: 'Le bloc et ses mots',
      blocks: [
        {
          type: 'p',
          text: 'Chaque ligne du programme est un **bloc**. Un bloc contient des **mots** ; un mot est une **adresse** (une lettre) suivie d’une **valeur**. Touchez un élément pour afficher sa définition.',
        },
        {
          type: 'anatomy',
          parts: [
            { text: 'N40', label: 'numéro de bloc (facultatif)' },
            { text: 'G01', label: 'fonction préparatoire : déplacement en ligne droite' },
            { text: 'X20.', label: 'cote X (diamètre 20)' },
            { text: 'Z-5.', label: 'cote Z' },
            { text: 'F0.1', label: 'avance : 0,1 mm par tour' },
          ],
        },
        {
          type: 'table',
          head: ['Adresse', 'Rôle', 'Exemple'],
          rows: [
            ['N', 'Numéro de bloc : repère pour les sauts et les cycles', '`N40`'],
            ['G', 'Fonction préparatoire : type de déplacement, mode, cycle', '`G01`'],
            ['X, Z', 'Cotes de destination (absolues)', '`X20. Z-5.`'],
            ['U, W', 'Déplacements relatifs (système A, voir leçon 4)', '`U-2.`'],
            ['F', 'Avance', '`F0.1`'],
            ['S', 'Vitesse de broche (ou vitesse de coupe)', '`S800`'],
            ['T', 'Outil et correcteur', '`T0101`'],
            ['M', 'Fonction auxiliaire : broche, arrosage, fin…', '`M08`'],
            ['R, I, K', 'Rayon ou centre d’un arc (leçon 3)', '`R5.`'],
          ],
        },
        {
          type: 'note',
          tone: 'retenir',
          text: 'Une lettre + un nombre = un mot. L’ordre des mots dans un bloc n’a en général pas d’importance pour la CN, mais l’usage (N, G, X, Z, F, S, T, M) rend le programme lisible par tous.',
        },
      ],
    },
    {
      id: 'g-et-m',
      title: 'Fonctions G et fonctions M',
      blocks: [
        {
          type: 'list',
          items: [
            '**G** — fonctions *préparatoires* : comment se déplacer et dans quel mode travailler. Exemples : `G00` (rapide), `G01` (ligne droite à l’avance), `G21` (millimètres).',
            '**M** — fonctions *auxiliaires* : ce que fait la machine. Exemples : `M03` (broche sens horaire), `M05` (arrêt broche), `M08` / `M09` (arrosage marche / arrêt), `M30` (fin de programme).',
          ],
        },
        {
          type: 'note',
          tone: 'machine',
          text: 'Les codes G de base sont très stables d’une machine à l’autre. Les codes M, eux, varient beaucoup au-delà des plus courants : ouverture du mandrin, contre-pointe, porte, lunette, embarreur… sont propres à chaque constructeur. Consultez la liste de votre machine et ajoutez-les à votre profil.',
        },
        {
          type: 'note',
          tone: 'rectif',
          text: 'Sur une rectifieuse, on retrouve les mêmes G de base (`G00`, `G01`…), mais beaucoup de fonctions spécifiques (rotation de la meule, diamantage, mesure en cours d’usinage) passent par des codes M ou des cycles propres au constructeur.',
        },
      ],
    },
    {
      id: 'debut-fin',
      title: 'Début, fin et commentaires',
      blocks: [
        {
          type: 'list',
          items: [
            '`%` — début et fin du fichier, utile lors des transferts (souvent ajouté automatiquement).',
            '`O1000` — numéro du programme dans la mémoire de la CN.',
            '`(EBAUCHE)` — commentaire entre parenthèses : ignoré par la machine, précieux pour le régleur. Écrivez-les en majuscules, sans accent.',
            '`M30` — fin de programme avec retour au début. `M02` termine aussi, sans forcément revenir au début selon la machine.',
            '`/` en début de bloc — saut de bloc optionnel : le bloc est ignoré si l’interrupteur « saut de bloc » du pupitre est actif.',
          ],
        },
        {
          type: 'note',
          tone: 'machine',
          text: 'Sur Siemens, les commentaires suivent un point-virgule (`;` en fin de ligne) et les programmes portent un nom de fichier au lieu d’un numéro O.',
        },
      ],
    },
    {
      id: 'point-decimal',
      title: 'Le piège du point décimal',
      blocks: [
        {
          type: 'p',
          text: 'Sur Fanuc, une cote écrite **sans point décimal** est souvent lue dans la plus petite unité de la machine, le micron : `X20` peut signifier **0,020 mm**, alors que `X20.` signifie bien 20 mm.',
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Écrivez toujours le point : `X20.`, `Z-5.`, `R2.`. Certaines machines sont réglées en « mode calculatrice » (paramètre Fanuc 3401, bit 0) et lisent `X20` comme 20 mm, mais un programme écrit avec les points fonctionne partout. Le vérificateur de l’éditeur signale les cotes sans point.',
        },
        {
          type: 'p',
          text: 'Les valeurs entières par nature (`S800`, `T0101`, `M08`, `N40`) s’écrivent sans point.',
        },
      ],
    },
    {
      id: 'premier-programme',
      title: 'Lire un premier programme',
      blocks: [
        {
          type: 'p',
          text: 'Voici un programme complet qui chariote un diamètre 42 sur 30 mm de long. Chaque ligne est expliquée ; touchez un code pour sa définition détaillée.',
        },
        {
          type: 'code',
          open: 'Cours 1 - premier programme',
          caption: 'Brut Ø45 en acier, outil d’ébauche extérieur en position 1.',
          lines: [
            ['%', 'Début du fichier'],
            ['O0001 (PREMIER PROGRAMME)', 'Numéro et nom du programme'],
            ['N10 G21 G40 G97 G99', 'Millimètres, pas de compensation de rayon, vitesse en tr/min, avance en mm/tr'],
            ['N20 T0101', 'Outil 1 avec son correcteur 1'],
            ['N30 S800 M03', 'Broche à 800 tr/min, sens horaire'],
            ['N40 G00 X42. Z2. M08', 'Approche rapide à 2 mm de la face, arrosage'],
            ['N50 G01 Z-30. F0.2', 'Chariotage du Ø42 sur 30 mm à 0,2 mm/tr'],
            ['N60 G00 X50.', 'Dégagement rapide en X'],
            ['N70 Z2.', 'Retour en Z : G00 est toujours actif (code modal, leçon 7)'],
            ['N80 M09', 'Arrêt de l’arrosage'],
            ['N90 M05', 'Arrêt de la broche'],
            ['N100 G28 U0. W0.', 'Retour au point de référence machine'],
            ['N110 M30', 'Fin de programme'],
            ['%', 'Fin du fichier'],
          ],
        },
        {
          type: 'note',
          tone: 'retenir',
          text: 'Un programme suit presque toujours le même plan : réglages de sécurité, appel d’outil, démarrage de la broche, approche, usinage, dégagement, arrêts, fin. La leçon 8 détaille ce plan type.',
        },
      ],
    },
  ],
  quiz: [
    {
      type: 'choice',
      question: 'Combien de mots contient le bloc `N40 G01 X20. Z-5. F0.1` ?',
      options: ['3', '4', '5', '6'],
      answer: 2,
      explain: '`N40`, `G01`, `X20.`, `Z-5.` et `F0.1` : cinq mots, chacun formé d’une adresse (lettre) et d’une valeur.',
    },
    {
      type: 'choice',
      question: 'Quel code arrête la broche ?',
      options: ['`M03`', '`M05`', '`M08`', '`M30`'],
      answer: 1,
      explain: '`M05` arrête la broche. `M03` la démarre (sens horaire), `M08` lance l’arrosage, `M30` termine le programme.',
    },
    {
      type: 'choice',
      question: 'Sur un Fanuc réglé normalement (sans « mode calculatrice »), que vaut `X20` écrit sans point ?',
      options: ['20 mm', '2 mm', '0,020 mm', 'La machine refuse le bloc'],
      answer: 2,
      explain: 'Sans point décimal, la valeur est lue dans la plus petite unité (le micron) : 0,020 mm. Écrivez toujours `X20.`.',
    },
    {
      type: 'choice',
      question: 'Que fait la machine du texte `(EBAUCHE)` ?',
      options: ['Elle l’ignore : c’est un commentaire', 'Elle lance un cycle d’ébauche', 'Elle s’arrête en attendant l’opérateur', 'Elle signale une erreur'],
      answer: 0,
      explain: 'Tout ce qui est entre parenthèses est un commentaire : la CN l’affiche mais ne l’exécute pas. Il sert au régleur et au programmeur.',
    },
    {
      type: 'block',
      question: 'Écrivez le bloc qui démarre la broche à 800 tr/min dans le sens horaire.',
      expect: ['S800 M03', 'G97 S800 M03'],
      explain: '`S800` donne la vitesse, `M03` démarre la rotation dans le sens horaire. `G97` (tr/min) peut être ajouté par sécurité.',
    },
    {
      type: 'error',
      question: 'Quelle ligne contient une erreur ?',
      lines: ['O0010 (ESSAI)', 'N10 G21 G40 G97 G99', 'N20 T0101', 'N30 S800 M03', 'N40 G00 X42. Z2. M08', 'N50 G01 Z-30 F0.2', 'N60 G00 X50.'],
      answer: 5,
      explain: '`Z-30` n’a pas de point décimal : sur beaucoup de Fanuc, l’outil ne bougerait que de 0,030 mm. Il faut `Z-30.`.',
    },
  ],
};
