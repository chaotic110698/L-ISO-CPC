/** Leçon 4 — cotes absolues et incrémentales (systèmes de codes A et B/C). */
export default {
  id: 'absolu-incremental',
  level: 'debutant',
  number: 4,
  title: 'Absolu et incrémental',
  summary: 'Donner une position (absolu) ou un déplacement (incrémental) : X/Z et U/W en système A, G90/G91 en systèmes B et C.',
  duration: 15,
  goals: [
    'distinguer une cote absolue d’un déplacement relatif ;',
    'écrire l’incrémental selon le système de codes de votre machine ;',
    'savoir quand l’incrémental est utile, et quand il est dangereux.',
  ],
  sections: [
    {
      id: 'principe',
      title: 'Deux façons de donner une destination',
      blocks: [
        {
          type: 'list',
          items: [
            '**Absolu** : on donne la **position** à atteindre, mesurée depuis l’origine pièce. « Va au Ø30, à 15 mm de la face. »',
            '**Incrémental** (ou relatif) : on donne le **déplacement** depuis la position actuelle. « Monte de 10 mm au diamètre, recule de 15 mm. »',
          ],
        },
        {
          type: 'figure',
          figure: 'absolu-incremental',
          turret: true,
          caption: 'Les points A à D de la leçon 2. En absolu, chaque point a sa cote ; en incrémental, on écrit le chemin d’un point au suivant.',
        },
      ],
    },
    {
      id: 'ecriture',
      title: 'L’écriture dépend du système de codes',
      blocks: [
        {
          type: 'p',
          text: 'Les commandes Fanuc de tour existent en trois « systèmes de codes G » : **A** (le plus répandu sur tour), **B** et **C**. Ils diffèrent justement sur l’incrémental. Choisissez votre système en haut de la leçon, ou affichez-les tous.',
        },
        {
          type: 'variants',
          pref: 'system',
          titles: { A: 'Système A', BC: 'Systèmes B et C' },
          cases: {
            A: [
              {
                type: 'list',
                items: [
                  '`X` et `Z` sont **toujours** absolus ;',
                  '`U` (en X, au diamètre) et `W` (en Z) sont **toujours** incrémentaux ;',
                  'on peut mélanger les deux dans un bloc : `G01 X30. W-15.`',
                ],
              },
              {
                type: 'code',
                caption: 'De A à D en incrémental (départ au point A : X20. Z0.).',
                lines: [
                  ['G01 W-15. F0.2', 'A → B : 15 mm vers le mandrin'],
                  ['U10.', 'B → C : diamètre +10 (de 20 à 30)'],
                  ['W-15.', 'C → D : encore 15 mm'],
                ],
              },
              {
                type: 'note',
                tone: 'piege',
                text: 'En système A, `G90` n’est **pas** le mode absolu : c’est un cycle de chariotage ! Un `G90` recopié d’un programme de fraisage ou d’un autre système provoque un usinage imprévu.',
              },
            ],
            BC: [
              {
                type: 'list',
                dictionary: 'iso',
                items: [
                  '`G90` : mode **absolu** ; `G91` : mode **incrémental** ;',
                  'ces codes sont **modaux** : ils restent actifs jusqu’au suivant ;',
                  '`X` et `Z` changent donc de sens selon le mode actif. En X, le déplacement reste généralement au diamètre.',
                ],
              },
              {
                type: 'code',
                dictionary: 'iso',
                caption: 'De A à D en incrémental. Définitions au tap : ISO générique (G90/G91 absolu/incrémental).',
                lines: [
                  ['G91 G01 Z-15. F0.2', 'Passage en incrémental, A → B'],
                  ['X10.', 'B → C : diamètre +10'],
                  ['Z-15.', 'C → D'],
                  ['G90', 'Retour en absolu, indispensable avant la suite'],
                ],
              },
              {
                type: 'note',
                tone: 'piege',
                dictionary: 'iso',
                text: 'Oublier de revenir en `G90` est une erreur classique : toutes les cotes suivantes sont lues comme des déplacements.',
              },
            ],
          },
        },
        {
          type: 'note',
          tone: 'machine',
          dictionary: 'iso',
          title: 'Comment connaître votre système ?',
          text: 'Regardez un programme existant de la machine : des `U` et `W`, ou des `G90` en tête de cycle de chariotage, indiquent le système A ; des `G90` / `G91` isolés indiquent B ou C. Sinon, la notice ou le paramètre 3401 (bits 6 et 7). Sur Siemens, c’est `G90` / `G91`, ou X=AC(…) / X=IC(…) pour une seule cote.',
        },
      ],
    },
    {
      id: 'quand',
      title: 'Quand utiliser l’incrémental ?',
      blocks: [
        {
          type: 'list',
          items: [
            'pour **répéter un motif** : plusieurs gorges espacées de 10 mm, en sous-programme appelé plusieurs fois ;',
            'pour un **petit déplacement** relatif : `G00 U2.` éloigne l’outil de 1 mm de la surface, où qu’il soit ;',
            'pour le **retour au point de référence** : `G28 U0. W0.` signifie « retourne au point de référence en passant par la position actuelle ».',
          ],
        },
        {
          type: 'note',
          tone: 'retenir',
          text: 'Restez en absolu par défaut : une erreur sur une cote absolue reste locale, alors qu’en incrémental elle décale toutes les positions suivantes.',
        },
        {
          type: 'note',
          tone: 'rectif',
          text: 'En rectification, l’incrémental sert souvent pour les **prises de passe** : chaque passe fait plonger la meule d’une petite valeur, par exemple `U-0.02` (0,01 mm au rayon). Vérifiez comment votre machine gère la compensation d’usure de meule avant d’empiler des passes.',
        },
      ],
    },
    {
      id: 'programme',
      title: 'Exemple complet (système A)',
      blocks: [
        {
          type: 'code',
          open: 'Cours 4 - absolu et incremental',
          caption: 'Finition du contour A → D, mélange d’absolu et d’incrémental.',
          lines: [
            ['%', null],
            ['O0004 (ABSOLU ET INCREMENTAL)', null],
            ['N10 G21 G40 G97 G99', null],
            ['N20 T0202', null],
            ['N30 S1500 M03', null],
            ['N40 G00 X20. Z2. M08', 'Approche en absolu'],
            ['N50 G01 Z0. F0.1', 'Point A'],
            ['N60 W-15.', 'Point B, en incrémental'],
            ['N70 X30.', 'Point C, en absolu'],
            ['N80 Z-30.', 'Point D, en absolu'],
            ['N90 G00 U4.', 'Dégagement de 2 mm au rayon'],
            ['N100 Z2. M09', null],
            ['N110 M05', null],
            ['N120 G28 U0. W0.', null],
            ['N130 M30', null],
            ['%', null],
          ],
        },
      ],
    },
  ],
};
