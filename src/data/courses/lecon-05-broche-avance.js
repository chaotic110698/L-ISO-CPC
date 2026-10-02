/** Leçon 5 — broche (sens, vitesse, G96/G97, limitation) et avance (par tour / par minute). */
export default {
  id: 'broche-avance',
  level: 'debutant',
  number: 5,
  title: 'Broche et avance',
  summary: 'M03/M04/M05, vitesse de coupe constante G96 et sa limitation, vitesse fixe G97, avance par tour ou par minute.',
  duration: 20,
  goals: [
    'démarrer, inverser et arrêter la broche ;',
    'choisir entre vitesse de coupe constante (`G96`) et vitesse de rotation fixe (`G97`) ;',
    'limiter la vitesse de rotation avant tout `G96` ;',
    'programmer l’avance par tour ou par minute selon votre système de codes.',
  ],
  sections: [
    {
      id: 'sens',
      title: 'Sens de rotation',
      blocks: [
        {
          type: 'list',
          items: [
            '`M03` : rotation dans le sens horaire ;',
            '`M04` : rotation dans le sens anti-horaire ;',
            '`M05` : arrêt de la broche.',
          ],
        },
        {
          type: 'note',
          tone: 'machine',
          text: 'Le bon sens dépend de l’outil et de son montage (outil à droite ou à gauche, plaquette dessus ou dessous, outil devant ou derrière l’axe). Sur un même tour, certains outils tournent en `M03`, d’autres en `M04` : la fiche de réglage ou les programmes existants de la machine l’indiquent. Une plaquette qui coupe « à l’envers » se casse immédiatement.',
        },
      ],
    },
    {
      id: 'vitesse',
      title: 'Vitesse de coupe et vitesse de rotation',
      blocks: [
        {
          type: 'p',
          text: 'Ce qui compte pour l’outil, c’est la **vitesse de coupe** Vc (en m/min) : la vitesse de la matière qui défile sous l’arête. Elle dépend de la matière usinée et de la plaquette (catalogue du fabricant). La broche, elle, tourne en tr/min. Le lien entre les deux :',
        },
        {
          type: 'note',
          tone: 'retenir',
          title: 'Formule',
          text: '**N = 1000 × Vc / (π × D)** — N en tr/min, Vc en m/min, D en mm. Exemple : Vc = 180 m/min sur Ø40 → N = 180 000 / 125,7 ≈ 1 432 tr/min. Le calculateur « Vitesse de coupe » du site fait ce calcul dans les deux sens.',
        },
        {
          type: 'table',
          head: ['Code', 'S signifie', 'Usage'],
          rows: [
            ['`G97`', 'vitesse de rotation en tr/min, fixe', 'perçage et taraudage au centre, filetage'],
            ['`G96`', 'vitesse de coupe en m/min, constante', 'chariotage, dressage, profils, tronçonnage (avec limitation) : la broche accélère quand le diamètre diminue'],
          ],
        },
        {
          type: 'p',
          text: 'En `G96`, la commande recalcule la vitesse de rotation en permanence selon le diamètre X où se trouve l’outil. Sur un dressage jusqu’au centre, le diamètre tend vers zéro… et la vitesse de rotation vers l’infini : d’où la **limitation obligatoire**.',
        },
      ],
    },
    {
      id: 'limitation',
      title: 'Limiter la vitesse de rotation',
      blocks: [
        {
          type: 'p',
          text: 'Avant tout `G96`, on fixe une vitesse de rotation maximale, adaptée au serrage, au mandrin et au balourd de la pièce. Le code dépend du système de codes :',
        },
        {
          type: 'variants',
          pref: 'system',
          titles: { A: 'Système A', BC: 'Systèmes B et C' },
          dictionaries: { A: 'a', BC: 'bc' },
          cases: {
            A: [
              {
                type: 'code',
                lines: [
                  ['G50 S2500', 'Jamais plus de 2 500 tr/min'],
                  ['G96 S180 M03', 'Vc = 180 m/min, rotation horaire'],
                ],
              },
            ],
            BC: [
              {
                type: 'code',
                lines: [
                  ['G92 S2500', 'Jamais plus de 2 500 tr/min'],
                  ['G96 S180 M03', 'Vc = 180 m/min, rotation horaire'],
                ],
              },
            ],
          },
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'En `G96`, `S180` ne veut pas dire 180 tr/min mais 180 **m/min**. Recopier un `S` d’un programme en `G97` vers un programme en `G96` (ou l’inverse) donne une vitesse totalement fausse.',
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Pour un outil qui travaille au centre (foret, pointe à centrer, taraud), repassez en `G97` avec une vitesse fixe : en `G96` à X0, la broche monterait à la limite.',
        },
        {
          type: 'note',
          tone: 'machine',
          text: 'Sur Siemens, la limitation s’écrit **LIMS=2500** et la vitesse de coupe constante **G96 S180** comme sur Fanuc.',
        },
      ],
    },
    {
      id: 'avance',
      title: 'L’avance',
      blocks: [
        {
          type: 'p',
          text: 'L’avance `F` est la vitesse de déplacement de l’outil pendant l’usinage. En tournage, on la donne presque toujours **par tour** de broche : l’épaisseur de copeau reste la même quelle que soit la vitesse de rotation.',
        },
        {
          type: 'variants',
          pref: 'system',
          titles: { A: 'Système A', BC: 'Systèmes B et C' },
          dictionaries: { A: 'a', BC: 'bc' },
          cases: {
            A: [
              {
                type: 'list',
                items: ['`G99` : avance en mm/tr (habituel en tournage) ;', '`G98` : avance en mm/min.'],
              },
            ],
            BC: [
              {
                type: 'list',
                items: ['`G95` : avance en mm/tr (habituel en tournage) ;', '`G94` : avance en mm/min.'],
              },
            ],
          },
        },
        {
          type: 'table',
          head: ['Opération (acier, ordre de grandeur)', 'Avance'],
          rows: [
            ['Ébauche', '0,2 à 0,4 mm/tr'],
            ['Finition', '0,05 à 0,15 mm/tr'],
            ['Tronçonnage, gorges', '0,03 à 0,1 mm/tr'],
          ],
        },
        {
          type: 'p',
          text: 'Ces valeurs ne sont qu’indicatives : la plaquette et son rayon de bec fixent la plage réelle (voir le calculateur « Rugosité » pour l’effet de l’avance sur l’état de surface).',
        },
        {
          type: 'note',
          tone: 'rectif',
          text: 'En rectification, les avances de plongée sont souvent très faibles et peuvent être exprimées en mm/min (ou en mm par tour de pièce selon la machine). La vitesse de la meule est en général réglée à part : le `S` du programme pilote alors la rotation de la pièce. Vérifiez sur votre machine ce que commandent `S` et `F`.',
        },
      ],
    },
    {
      id: 'programme',
      title: 'Exemple (système A)',
      blocks: [
        {
          type: 'code',
          open: 'Cours 5 - broche et avance',
          lines: [
            ['%', null],
            ['O0005 (BROCHE ET AVANCE)', null],
            ['N10 G21 G40 G97 G99', 'Départ en tr/min, avance par tour'],
            ['N20 T0101', null],
            ['N30 G50 S2500', 'Limitation avant le G96'],
            ['N40 G96 S180 M03', 'Vitesse de coupe constante'],
            ['N50 G00 X52. Z2. M08', null],
            ['N60 G01 Z-40. F0.25', 'Chariotage à 0,25 mm/tr'],
            ['N70 G00 X60.', null],
            ['N80 Z2.', null],
            ['N90 G97 S600', 'Retour à une vitesse fixe avant le retour au point de référence'],
            ['N100 M09', null],
            ['N110 M05', null],
            ['N120 G28 U0. W0.', null],
            ['N130 M30', null],
            ['%', null],
          ],
        },
      ],
    },
  ],
  quiz: [
    {
      type: 'number',
      question: 'Vc = 200 m/min sur un Ø50. Quelle vitesse de rotation (arrondie) ?',
      answer: 1273,
      tolerance: 5,
      unit: 'tr/min',
      explain: 'N = 1000 × 200 / (π × 50) = 200 000 / 157,1 ≈ 1 273 tr/min.',
    },
    {
      type: 'choice',
      question: 'En `G96`, que signifie `S180` ?',
      options: ['180 tr/min', '180 m/min de vitesse de coupe', '180 mm/min d’avance'],
      answer: 1,
      explain: 'En `G96`, S est une vitesse de coupe en m/min ; la commande calcule les tr/min selon le diamètre.',
    },
    {
      type: 'choice',
      question: 'Pourquoi faut-il limiter la vitesse de rotation avant un `G96` ?',
      options: ['Pour économiser l’outil', 'Parce que la vitesse de rotation augmente quand le diamètre diminue, jusqu’à l’infini au centre', 'Parce que la commande l’exige pour démarrer la broche'],
      answer: 1,
      explain: 'Près du centre, le diamètre tend vers zéro et la vitesse de rotation calculée explose : la limite protège la machine et la pièce.',
    },
    {
      type: 'block',
      question: 'Système A : écrivez le bloc qui limite la broche à 3 000 tr/min.',
      expect: 'G50 S3000',
      dictionary: 'a',
      explain: 'En système A, `G50` suivi de S fixe la vitesse de rotation maximale (en systèmes B/C, c’est **G92 S3000**).',
    },
    {
      type: 'choice',
      question: 'Pour percer au centre avec un foret, on travaille en…',
      options: ['`G96`', '`G97`'],
      answer: 1,
      explain: 'Au centre (X0), `G96` ferait monter la broche à sa limite : on perce en `G97`, à vitesse de rotation fixe.',
    },
    {
      type: 'choice',
      question: 'Système A : quel code donne une avance en mm par tour ?',
      dictionary: 'a',
      options: ['`G98`', '`G99`'],
      answer: 1,
      explain: 'Système A : `G99` mm/tr, `G98` mm/min. En systèmes B/C, ce sont **G95** (mm/tr) et **G94** (mm/min).',
    },
  ],
};
