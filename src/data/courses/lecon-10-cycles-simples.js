/** Leçon 10 — cycles simples de chariotage et de dressage (G90/G94, ou G77/G79 en B/C). */
export default {
  id: 'cycles-simples',
  level: 'confirme',
  number: 10,
  title: 'Cycles simples : chariotage et dressage',
  summary: 'Une passe complète en un bloc, répétée en ne changeant que la cote : G90 et G94 (système A), G77 et G79 (systèmes B/C).',
  duration: 20,
  goals: [
    'écrire une passe de chariotage ou de dressage en un seul bloc ;',
    'enchaîner les passes en ne changeant que le diamètre ou la profondeur ;',
    'programmer un cône avec R ;',
    'savoir quand préférer un cycle simple à `G71`.',
  ],
  sections: [
    {
      id: 'principe',
      title: 'Une passe complète par bloc',
      blocks: [
        {
          type: 'p',
          text: 'Un cycle simple réalise en **un seul bloc** les quatre mouvements d’une passe : plongée en rapide, passe à l’avance, retrait à l’avance, retour en rapide au point de départ. Le cycle est **modal** : les blocs suivants qui ne contiennent qu’une nouvelle cote refont une passe complète.',
        },
        {
          type: 'list',
          ordered: true,
          items: [
            'plongée rapide du point de départ jusqu’au diamètre de passe ;',
            'passe à l’avance F jusqu’à la cote Z ;',
            'retrait à l’avance jusqu’au diamètre de départ ;',
            'retour rapide au point de départ.',
          ],
        },
      ],
    },
    {
      id: 'chariotage',
      title: 'Chariotage',
      blocks: [
        {
          type: 'p',
          text: 'Ébauche d’un Ø40 sur 30 mm dans un brut Ø50, en trois passes :',
        },
        {
          type: 'variants',
          pref: 'system',
          titles: { A: 'Système A : G90', BC: 'Systèmes B et C : G77' },
          dictionaries: { A: 'a', BC: 'bc' },
          cases: {
            A: [
              {
                type: 'code',
                lines: [
                  ['G00 X52. Z2.', 'Point de départ : au-dessus du brut'],
                  ['G90 X46. Z-30. F0.25', 'Passe 1 au Ø46'],
                  ['X42.', 'Passe 2 : seule la cote change'],
                  ['X40.4', 'Passe 3, 0,2 mm au rayon laissés pour la finition'],
                  ['G00 X100. Z100.', 'G00 termine le cycle'],
                ],
              },
            ],
            BC: [
              {
                type: 'code',
                lines: [
                  ['G00 X52. Z2.', 'Point de départ : au-dessus du brut'],
                  ['G77 X46. Z-30. F0.25', 'Passe 1 au Ø46'],
                  ['X42.', 'Passe 2 : seule la cote change'],
                  ['X40.4', 'Passe 3'],
                  ['G00 X100. Z100.', 'G00 termine le cycle'],
                ],
              },
            ],
          },
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Le cycle reste actif jusqu’à un autre code du groupe déplacement (`G00`, `G01`…). Un bloc `X100.` écrit juste après la dernière passe, sans `G00`, déclencherait une nouvelle passe au Ø100… en partant dans le vide, ou pire selon la position.',
        },
      ],
    },
    {
      id: 'cone',
      title: 'Cône : l’adresse R',
      blocks: [
        {
          type: 'p',
          text: 'R donne la **différence de rayon** entre le début et la fin de la passe : rayon au début − rayon à la fin. Pour un cône dont le diamètre augmente vers le mandrin, le début est plus petit : R est **négatif**.',
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'R se calcule sur la longueur réellement parcourue par la passe, depuis le Z du point de départ (souvent `Z2.`) et non depuis la face `Z0.` : sur 2 mm de plus, la conicité change. Calculez R entre le Z de départ et le Z de fin.',
        },
        {
          type: 'p',
          text: 'Exemple : cône de Ø30 (face) à Ø40 (Z-20.), départ du cycle en `Z2.`. Pente : 5 mm de rayon sur 20 mm, soit 0,25 mm par mm. Sur 22 mm (de Z2. à Z-20.) : 5,5 mm. Le rayon au départ vaut 20 − 5,5 = 14,5, d’où R = 14,5 − 20 = **−5,5**.',
        },
      ],
    },
    {
      id: 'dressage',
      title: 'Dressage',
      blocks: [
        {
          type: 'p',
          text: 'Le cycle de dressage fait la même chose en travers : passe en X, et les blocs suivants ne changent que Z. Exemple : dresser 3 mm de face en trois passes, jusqu’au Ø20 (le centre est percé).',
        },
        {
          type: 'variants',
          pref: 'system',
          titles: { A: 'Système A : G94', BC: 'Systèmes B et C : G79' },
          dictionaries: { A: 'a', BC: 'bc' },
          cases: {
            A: [
              {
                type: 'code',
                lines: [
                  ['G00 X52. Z2.', null],
                  ['G94 X20. Z-1. F0.2', 'Passe 1 : face à Z-1.'],
                  ['Z-2.', null],
                  ['Z-3.', null],
                  ['G00 X100. Z100.', null],
                ],
              },
            ],
            BC: [
              {
                type: 'code',
                lines: [
                  ['G00 X52. Z2.', null],
                  ['G79 X20. Z-1. F0.2', 'Passe 1 : face à Z-1.'],
                  ['Z-2.', null],
                  ['Z-3.', null],
                  ['G00 X100. Z100.', null],
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: 'choix',
      title: 'Cycle simple ou G71 ?',
      blocks: [
        {
          type: 'list',
          items: [
            '**Cycle simple** : formes simples (cylindre, cône, face), nombre de passes maîtrisé, programme facile à retoucher au pied de la machine.',
            '**`G71`** : contours avec chanfreins, rayons et plusieurs diamètres ; une seule description du contour pour l’ébauche et la finition.',
          ],
        },
        {
          type: 'note',
          tone: 'rectif',
          text: 'Sur une rectifieuse, la logique « passe répétée en ne changeant que la cote » se retrouve dans les cycles d’enfilade et de plongée du constructeur. Les numéros de code, eux, sont propres à chaque machine.',
        },
      ],
    },
  ],
  quiz: [
    {
      type: 'choice',
      question: 'Système A : après `G90 X46. Z-30. F0.25`, que fait un bloc ne contenant que `X42.` ?',
      dictionary: 'a',
      options: ['Un déplacement rapide au Ø42', 'Une nouvelle passe complète au Ø42', 'Rien : il manque Z'],
      answer: 1,
      explain: 'Le cycle est modal : chaque nouvelle cote X relance une passe complète avec les mêmes Z et F.',
    },
    {
      type: 'block',
      question: 'Système A, outil en `X52. Z2.` : écrivez la première passe de chariotage au Ø46 jusqu’à Z-30., à 0,25 mm/tr.',
      dictionary: 'a',
      expect: 'G90 X46. Z-30. F0.25',
      explain: '`G90` (cycle de chariotage en système A), diamètre de passe, fin de passe en Z et avance.',
    },
    {
      type: 'choice',
      question: 'Cône dont le diamètre augmente vers le mandrin : quel est le signe de R ?',
      options: ['Positif', 'Négatif'],
      answer: 1,
      explain: 'R = rayon au début − rayon à la fin. Le début (côté face) est plus petit : R est négatif.',
    },
    {
      type: 'choice',
      question: 'Système A : quel cycle fait des passes de dressage ?',
      dictionary: 'a',
      options: ['`G90`', '`G94`', '`G92`'],
      answer: 1,
      explain: '`G94` : dressage ; `G90` : chariotage ; `G92` : filetage (en système A).',
    },
    {
      type: 'error',
      question: 'Système A : quelle ligne provoque une passe imprévue ?',
      dictionary: 'a',
      lines: ['G00 X52. Z2.', 'G90 X46. Z-30. F0.25', 'X42.', 'X40.4', 'X100.', 'Z100.'],
      answer: 4,
      explain: 'Le cycle `G90` est toujours actif : `X100.` lance une passe au Ø100. Il fallait écrire `G00 X100.` pour sortir du cycle.',
    },
  ],
};
