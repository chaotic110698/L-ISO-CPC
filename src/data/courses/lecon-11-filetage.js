/** Leçon 11 — filetage : G32, G92 (G78 en B/C), G76. */
export default {
  id: 'filetage',
  level: 'confirme',
  number: 11,
  title: 'Filetage : G92 et G76',
  summary: 'Pas, hauteur de filet, diamètre à fond de filet, passes : fileter avec le cycle simple G92 ou le cycle complet G76.',
  duration: 30,
  goals: [
    'calculer la hauteur de filet et le diamètre à fond de filet ;',
    'respecter les règles du filetage (vitesse fixe, point de départ) ;',
    'enchaîner des passes avec `G92` (système A) ;',
    'écrire un cycle `G76` complet sur deux blocs.',
  ],
  sections: [
    {
      id: 'calcul',
      title: 'Les cotes d’un filet',
      blocks: [
        {
          type: 'p',
          text: 'Pour un filetage ISO métrique, tout part du **pas** P (la distance entre deux filets, en mm) :',
        },
        {
          type: 'table',
          head: ['Filet', 'Hauteur au rayon', 'Exemple M20 × 1,5'],
          rows: [
            ['extérieur (vis)', '0,6134 × P', '0,920 mm → fond de filet Ø20 − 2 × 0,920 = Ø18,16'],
            ['intérieur (écrou)', '0,5413 × P', '0,812 mm'],
          ],
        },
        {
          type: 'note',
          tone: 'machine',
          text: 'Les fabricants de plaquettes donnent souvent leur propre hauteur (légèrement différente selon la forme du fond de filet). En atelier, on ajuste toujours au calibre (bague ou tampon) : la dernière passe se règle avec l’usure X de l’outil.',
        },
        {
          type: 'note',
          tone: 'info',
          text: 'Le formulaire « Cycles » de l’éditeur calcule ces valeurs et génère le `G76` à partir du diamètre, du pas et de la longueur.',
        },
      ],
    },
    {
      id: 'regles',
      title: 'Les règles du filetage',
      blocks: [
        {
          type: 'list',
          items: [
            '**Vitesse de rotation fixe** : toujours en `G97`. En `G96`, la vitesse changerait à chaque passe et les passes ne tomberaient plus dans le même sillon.',
            '**L’avance F est le pas** : `F1.5` pour un pas de 1,5 mm (en avance par tour).',
            '**Point de départ en amont** : au moins 2 à 3 pas avant le début du filet (`Z5.` par exemple), le temps que l’axe atteigne sa vitesse.',
            '**Vitesse limitée** : la vitesse d’avance vaut N × P. À 1 200 tr/min avec un pas de 1,5, l’axe Z avance à 1 800 mm/min ; les machines ont une limite, et le dégagement en fin de filet doit avoir la place.',
          ],
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Pendant un filetage, le bouton de correction d’avance et l’arrêt d’avance sont sans effet (ou retardés à la fin de la passe) : surveillez le premier essai avec la main sur l’arrêt d’urgence et le correcteur de vitesse broche bloqué à 100 %.',
        },
      ],
    },
    {
      id: 'g92',
      title: 'Cycle simple : une passe par bloc',
      blocks: [
        {
          type: 'p',
          text: 'Comme le cycle de chariotage, le cycle simple de filetage fait une passe complète par bloc et reste actif : on n’écrit ensuite que les diamètres successifs, de plus en plus petits (passes dégressives).',
        },
        {
          type: 'variants',
          pref: 'system',
          titles: { A: 'Système A : G92', BC: 'Systèmes B et C : G78' },
          dictionaries: { A: 'a', BC: 'bc' },
          cases: {
            A: [
              {
                type: 'code',
                caption: 'M20 × 1,5 sur 22 mm.',
                lines: [
                  ['G97 S800 M03', 'Vitesse fixe'],
                  ['G00 X22. Z5.', 'Départ 5 mm en amont'],
                  ['G92 X19.4 Z-22. F1.5', 'Passe 1'],
                  ['X18.9', 'Passe 2'],
                  ['X18.55', null],
                  ['X18.3', null],
                  ['X18.16', 'Fond de filet'],
                  ['X18.16', 'Passe à vide (lissage)'],
                  ['G00 X100. Z100.', null],
                ],
              },
            ],
            BC: [
              {
                type: 'code',
                caption: 'M20 × 1,5 sur 22 mm.',
                lines: [
                  ['G97 S800 M03', 'Vitesse fixe'],
                  ['G00 X22. Z5.', 'Départ 5 mm en amont'],
                  ['G78 X19.4 Z-22. F1.5', 'Passe 1'],
                  ['X18.9', 'Passe 2'],
                  ['X18.55', null],
                  ['X18.3', null],
                  ['X18.16', 'Fond de filet'],
                  ['X18.16', 'Passe à vide (lissage)'],
                  ['G00 X100. Z100.', null],
                ],
              },
            ],
          },
        },
        {
          type: 'p',
          text: 'Les passes pénètrent ici perpendiculairement (pénétration radiale) : simple, mais les deux flancs de l’outil coupent en même temps. Sur les grands pas, on préfère `G76`.',
        },
      ],
    },
    {
      id: 'g76',
      title: 'G76 : le filetage complet',
      blocks: [
        {
          type: 'p',
          text: '`G76` calcule lui-même toutes les passes, avec une pénétration **oblique** le long d’un flanc (copeau mieux formé, moins de vibrations). Il s’écrit sur deux blocs :',
        },
        {
          type: 'code',
          lines: [
            ['G76 P020060 Q50 R0.05', 'P : 02 passes de finition, chanfrein 0 (×0,1 pas), angle 60° ; Q : passe mini 0,05 mm ; R : surépaisseur de finition'],
            ['G76 X18.16 Z-22. P920 Q300 F1.5', 'X : fond de filet ; P : hauteur 0,920 mm ; Q : 1re passe 0,3 mm ; F : pas'],
          ],
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Dans `G76`, P et Q s’écrivent **en microns, sans point décimal** : `P920` = 0,920 mm, `Q300` = 0,3 mm. Un `Q0.3` serait refusé ou mal interprété. Le premier P, lui, regroupe trois valeurs à deux chiffres.',
        },
        {
          type: 'code',
          open: 'Cours 11 - filetage G76',
          caption: 'Filetage M20 × 1,5 sur 22 mm (pièce déjà tournée au Ø19,85).',
          lines: [
            ['%', null],
            ['O0011 (FILETAGE M20X1.5)', null],
            ['N10 G21 G40 G97 G99 G18', null],
            ['N20 T0303 (OUTIL A FILETER 60 DEG)', null],
            ['N30 G97 S800 M03', 'Vitesse de rotation fixe'],
            ['N40 G00 X22. Z5. M08', 'Départ en amont'],
            ['N50 G76 P020060 Q50 R0.05', null],
            ['N60 G76 X18.16 Z-22. P920 Q300 F1.5', null],
            ['N70 G00 X100. Z100. M09', null],
            ['N80 M05', null],
            ['N90 M30', null],
            ['%', null],
          ],
        },
        {
          type: 'note',
          tone: 'info',
          text: 'Le diamètre extérieur d’une vis se tourne légèrement sous la cote nominale (ici Ø19,85 environ pour M20) : le sommet du filet n’est pas pointu et le filet se monte plus facilement.',
        },
      ],
    },
  ],
  quiz: [
    {
      type: 'number',
      question: 'Filet extérieur M16 × 2 : quelle est la hauteur de filet au rayon (0,6134 × P), arrondie au centième ?',
      answer: 1.23,
      tolerance: 0.01,
      unit: 'mm',
      explain: '0,6134 × 2 = 1,227 mm, soit environ 1,23 mm.',
    },
    {
      type: 'number',
      question: 'Toujours pour M16 × 2 : quel diamètre à fond de filet (X) programmez-vous, arrondi au centième ?',
      answer: 13.55,
      tolerance: 0.01,
      unit: 'mm',
      explain: '16 − 2 × 1,227 = 13,546, soit X13.55 environ (à ajuster au calibre).',
    },
    {
      type: 'choice',
      question: 'Pourquoi fileter en `G97` ?',
      options: ['Pour aller plus vite', 'Pour que chaque passe retombe exactement dans le même sillon', 'Parce que `G96` est interdit avec un outil à fileter'],
      answer: 1,
      explain: 'La synchronisation broche / axe Z suppose une vitesse de rotation constante d’une passe à l’autre.',
    },
    {
      type: 'choice',
      question: 'Dans `G76 X18.16 Z-22. P920 Q300 F1.5`, que vaut Q300 ?',
      options: ['300 mm', '3 mm', '0,3 mm'],
      answer: 2,
      explain: 'Dans G76, Q s’écrit en microns sans point : Q300 = 0,3 mm de profondeur pour la première passe.',
    },
    {
      type: 'block',
      question: 'Système A, outil en `X22. Z5.` : écrivez la première passe de filetage au Ø19,4 jusqu’à Z-22., pas 1,5.',
      dictionary: 'a',
      expect: 'G92 X19.4 Z-22. F1.5',
      explain: '`G92` (cycle de filetage en système A), diamètre de passe, fin du filet, et F = pas.',
    },
    {
      type: 'error',
      question: 'Quelle ligne empêche un filetage correct ?',
      lines: ['T0303', 'G96 S120 M03', 'G00 X22. Z5. M08', 'G76 P020060 Q50 R0.05', 'G76 X18.16 Z-22. P920 Q300 F1.5'],
      answer: 1,
      explain: 'Le filetage doit se faire en `G97` (vitesse de rotation fixe), par exemple `G97 S800 M03`.',
    },
  ],
};
