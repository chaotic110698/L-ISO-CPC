/** Leçon 7 — codes modaux, groupes, codes incompatibles. */
export default {
  id: 'codes-modaux',
  level: 'debutant',
  number: 7,
  title: 'Codes modaux et groupes',
  summary: 'Ce qui reste actif d’un bloc à l’autre, ce qui ne vaut que pour un bloc, et les codes qui s’excluent sur une même ligne.',
  duration: 15,
  goals: [
    'savoir quels codes restent actifs (modaux) et lesquels ne valent que pour leur bloc ;',
    'reconnaître les groupes modaux ;',
    'éviter les codes incompatibles dans un même bloc ;',
    'lire l’état de la machine à n’importe quelle ligne.',
  ],
  sections: [
    {
      id: 'modal',
      title: 'Modal ou non modal',
      blocks: [
        {
          type: 'p',
          text: 'Un code **modal** reste actif tant qu’un autre code du même groupe ne le remplace pas. C’est pourquoi on n’écrit pas `G01` à chaque ligne d’un profil : il reste actif jusqu’au prochain `G00`, `G02` ou `G03`.',
        },
        {
          type: 'p',
          text: 'Un code **non modal** ne vaut que pour son bloc : `G04` (temporisation), `G28` (retour au point de référence), `G50` (limitation de vitesse, système A). Le bloc suivant revient au mode précédent.',
        },
        {
          type: 'code',
          caption: 'Lecture d’un profil : seul le premier bloc porte G01.',
          lines: [
            ['G01 Z-15. F0.1', 'G01 activé, avance 0,1 mm/tr'],
            ['X26.', 'toujours G01, toujours F0.1'],
            ['Z-30.', 'toujours G01'],
            ['G00 X40.', 'G00 remplace G01'],
            ['Z2.', 'toujours G00'],
          ],
        },
      ],
    },
    {
      id: 'groupes',
      title: 'Les groupes modaux',
      blocks: [
        {
          type: 'p',
          text: 'Les codes G sont rangés en **groupes** : un seul code de chaque groupe est actif à la fois. Les principaux en tournage :',
        },
        {
          type: 'table',
          head: ['Groupe', 'Codes (système A)', 'Remarque'],
          rows: [
            ['Déplacement', '`G00` `G01` `G02` `G03`', 'et les cycles comme `G90`'],
            ['Vitesse de broche', '`G96` `G97`', 'm/min ou tr/min'],
            ['Unité d’avance', '`G98` `G99`', 'mm/min ou mm/tr'],
            ['Compensation de rayon', '`G40` `G41` `G42`', ''],
            ['Unités', '`G20` `G21`', 'pouces ou mm'],
            ['Plan', '`G18`', 'ZX, le plan du tour'],
            ['Origine pièce', '`G54` à `G59`', ''],
          ],
        },
        {
          type: 'p',
          text: 'Les **adresses** suivent la même logique : `F` et `S` restent en mémoire jusqu’à la valeur suivante. Pour les axes, c’est différent : seuls ceux écrits dans le bloc se déplacent, un axe absent reste où il est.',
        },
        {
          type: 'p',
          text: 'Certains codes M ont aussi un effet durable : `M03` / `M04` / `M05` pour la broche, `M08` / `M09` pour l’arrosage.',
        },
      ],
    },
    {
      id: 'incompatibles',
      title: 'Codes incompatibles',
      blocks: [
        {
          type: 'p',
          text: 'Deux codes du **même groupe** dans un bloc se contredisent : `G00 G01 X20.` ne peut pas être à la fois rapide et à l’avance. Fanuc retient en général le dernier écrit, d’autres commandes déclenchent une alarme. Dans tous les cas, c’est une erreur de programmation.',
        },
        {
          type: 'p',
          text: 'De même, la plupart des machines n’acceptent qu’**un seul code M par bloc** (certaines en acceptent jusqu’à trois, si l’option est active). Écrivez `M05` et `M09` sur deux lignes.',
        },
        {
          type: 'note',
          tone: 'info',
          text: 'Le vérificateur de l’éditeur signale ces conflits, et le panneau « État modal » affiche, pour la ligne du curseur, tous les modes actifs : déplacement, vitesse, avance, outil, compensation…',
        },
      ],
    },
    {
      id: 'pieges',
      title: 'Le piège du mode resté actif',
      blocks: [
        {
          type: 'p',
          text: 'L’erreur classique : un `G00` d’approche reste actif, et le bloc d’usinage suivant, écrit sans `G01`, part **en rapide dans la matière**.',
        },
        {
          type: 'code',
          lines: [
            ['G00 X42. Z2.', 'approche rapide'],
            ['Z-30. F0.2', 'DANGER : toujours G00, l’outil traverse la pièce en rapide'],
          ],
        },
        {
          type: 'note',
          tone: 'retenir',
          text: 'Écrivez toujours explicitement `G01` sur le premier bloc d’usinage qui suit un `G00`. Et avant de lancer un programme modifié, demandez-vous pour chaque bloc : quel mode de déplacement est actif ici ?',
        },
      ],
    },
  ],
  quiz: [
    {
      type: 'choice',
      question: 'Après `G01 Z-15. F0.1`, le bloc suivant ne contient que `X26.`. Comment se déplace l’outil ?',
      options: ['En rapide', 'En ligne droite à 0,1 mm/tr', 'Il ne bouge pas : il manque le code G'],
      answer: 1,
      explain: '`G01` et `F` sont modaux : ils restent actifs jusqu’à leur remplacement.',
    },
    {
      type: 'choice',
      question: 'Lesquels de ces codes sont non modaux (valables pour leur seul bloc) ?',
      options: ['`G04`', '`G01`', '`G28`', '`G96`'],
      answer: [0, 2],
      explain: '`G04` (temporisation) et `G28` (retour au point de référence) ne valent que pour leur bloc. `G01` et `G96` restent actifs.',
    },
    {
      type: 'error',
      question: 'Quel bloc contient deux codes incompatibles ?',
      lines: ['G00 X42. Z2.', 'G01 Z-30. F0.2', 'G00 G01 X50.', 'Z2.'],
      answer: 2,
      explain: '`G00` et `G01` appartiennent au même groupe (déplacement) : un bloc ne peut pas être à la fois en rapide et à l’avance.',
    },
    {
      type: 'error',
      question: 'Dans cette séquence, quel bloc est dangereux ?',
      lines: ['T0101', 'G96 S180 M03', 'G00 X42. Z2. M08', 'Z-30. F0.2', 'G00 X50.'],
      answer: 3,
      explain: 'Le `G00` de l’approche est resté actif : `Z-30.` part en rapide dans la matière. Il fallait écrire `G01 Z-30. F0.2`.',
    },
    {
      type: 'choice',
      question: 'Un axe absent d’un bloc…',
      options: ['reprend sa dernière valeur programmée, donc ne bouge pas', 'revient à zéro', 'déclenche une alarme'],
      answer: 0,
      explain: 'Seuls les axes écrits dans le bloc se déplacent : les autres restent où ils sont.',
    },
  ],
};
