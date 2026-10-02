/** Leçon 12 — perçage au centre et gorges : G74, G75. */
export default {
  id: 'percage-gorges',
  level: 'confirme',
  number: 12,
  title: 'Perçage et gorges : G74, G75',
  summary: 'Percer profond au centre avec débourrage, faire une gorge plus large que l’outil : les cycles G74 et G75.',
  duration: 20,
  goals: [
    'percer au centre avec débourrage (`G74`) ;',
    'réaliser une gorge radiale en plusieurs plongées (`G75`) ;',
    'écrire P et Q en microns ;',
    'tenir compte de la largeur et du point de référence de l’outil à gorge.',
  ],
  sections: [
    {
      id: 'g74',
      title: 'G74 : perçage avec débourrage',
      blocks: [
        {
          type: 'p',
          text: 'Pour un trou profond au centre, le foret doit ressortir régulièrement pour casser et évacuer le copeau (débourrage). `G74` le fait automatiquement : il perce par passes de profondeur Q, recule de R après chaque passe, jusqu’à la profondeur Z.',
        },
        {
          type: 'code',
          open: 'Cours 12 - percage G74',
          caption: 'Foret Ø10, trou de 40 mm de profondeur, passes de 5 mm.',
          lines: [
            ['%', null],
            ['O0012 (PERCAGE G74)', null],
            ['N10 G21 G40 G97 G99 G18', null],
            ['N20 T0505 (FORET D10)', null],
            ['N30 G97 S1000 M03', 'Au centre : vitesse de rotation fixe'],
            ['N40 G00 X0. Z3. M08', 'Sur l’axe, 3 mm devant la face'],
            ['N50 G74 R1.', 'Recul de 1 mm après chaque passe'],
            ['N60 G74 Z-40. Q5000 F0.12', 'Profondeur 40, passes de 5 mm (Q en microns)'],
            ['N70 G00 Z50. M09', 'Le cycle revient au point de départ ; dégagement en Z, puis en X'],
            ['N80 X100.', null],
            ['N90 M05', null],
            ['N100 M30', null],
            ['%', null],
          ],
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'La profondeur Z est celle de la **pointe** du foret. Pour un trou dont la partie cylindrique doit faire 40 mm, ajoutez la longueur de la pointe (environ 0,3 × diamètre pour une pointe à 118°).',
        },
        {
          type: 'note',
          tone: 'machine',
          text: 'Sur les tours avec outils motorisés, on perce aussi avec les cycles de perçage `G83` (en face) ou `G87` (radial), plus proches de ceux du fraisage. Le recul de débourrage de `G74` peut être fixé par un paramètre sur certaines machines.',
        },
      ],
    },
    {
      id: 'g75',
      title: 'G75 : gorge en plusieurs plongées',
      blocks: [
        {
          type: 'p',
          text: '`G75` plonge en X par passes de profondeur P (avec débourrage), remonte, se décale en Z de Q, et recommence jusqu’à la position Z finale : on obtient une gorge plus large que l’outil.',
        },
        {
          type: 'code',
          caption: 'Gorge de 6 mm de large (de Z-10. à Z-16.) jusqu’au Ø30, sur un Ø40, avec un outil de 3 mm.',
          lines: [
            ['G97 S600 M03', null],
            ['G00 X42. Z-10.', 'Au-dessus de la première plongée'],
            ['G75 R0.5', 'Recul de 0,5 mm entre deux passes'],
            ['G75 X30. Z-13. P1000 Q2500 F0.05', 'Fond Ø30 ; dernière plongée à Z-13. ; passes de 1 mm ; décalage 2,5 mm'],
            ['G00 X100.', null],
          ],
        },
        {
          type: 'note',
          tone: 'retenir',
          title: 'Le point de référence de l’outil',
          text: 'Un outil à gorge a deux coins : celui mesuré au réglage (souvent le coin côté face, à droite) est la position programmée. Ici l’outil de 3 mm est réglé sur son coin droit : la plongée à `Z-10.` coupe de Z-10 à Z-13, la dernière à `Z-13.` coupe de Z-13 à Z-16. Si votre outil est réglé sur l’autre coin, décalez toutes les cotes Z de la largeur de l’outil.',
        },
        {
          type: 'list',
          items: [
            '**P** : profondeur de chaque passe en X (au rayon), en microns : `P1000` = 1 mm ;',
            '**Q** : décalage en Z entre deux plongées, en microns, **inférieur à la largeur de l’outil** pour ne pas laisser de matière ;',
            'avance faible : 0,03 à 0,08 mm/tr selon la largeur de l’outil et la matière.',
          ],
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Comme dans `G76`, P et Q s’écrivent sans point décimal. `Q2.5` au lieu de `Q2500` déclenche une alarme sur la plupart des Fanuc (point décimal non admis).',
        },
      ],
    },
  ],
  quiz: [
    {
      type: 'choice',
      question: 'Dans `G74 Z-40. Q5000 F0.12`, que vaut Q ?',
      options: ['5 000 mm', '5 mm par passe', '0,5 mm par passe'],
      answer: 1,
      explain: 'Q s’écrit en microns sans point : Q5000 = 5 mm de profondeur par passe.',
    },
    {
      type: 'choice',
      question: 'Pour percer au centre, on travaille en…',
      options: ['`G96`', '`G97`'],
      answer: 1,
      explain: 'Au centre (X0), `G96` ferait monter la broche à sa vitesse limite : on perce en `G97`.',
    },
    {
      type: 'block',
      question: 'Écrivez le bloc de recul de débourrage de 1 mm, premier bloc du cycle G74.',
      expect: 'G74 R1.',
      explain: 'Premier bloc de `G74` : R = recul après chaque passe.',
    },
    {
      type: 'choice',
      question: 'Gorge avec un outil de 4 mm : quelle valeur de Q (décalage entre plongées) convient ?',
      options: ['`Q5000`', '`Q4000`', '`Q3500`'],
      answer: 2,
      explain: 'Le décalage doit être inférieur à la largeur de l’outil (4 mm) pour que les plongées se recouvrent : Q3500 = 3,5 mm.',
    },
    {
      type: 'error',
      question: 'Quelle ligne de ce perçage contient une erreur ?',
      lines: ['T0505', 'G97 S1000 M03', 'G00 X0. Z3. M08', 'G74 R1.', 'G74 Z-40. Q5. F0.12', 'G00 Z50. M09'],
      answer: 4,
      explain: 'Q s’écrit en microns, sans point : pour des passes de 5 mm, `Q5000`. Sur la plupart des Fanuc, `Q5.` déclenche une alarme : le point décimal n’est pas admis pour cette adresse.',
    },
  ],
};
