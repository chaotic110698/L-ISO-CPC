/** Leçon 14 — macros Fanuc (Custom Macro B) : variables, calculs, conditions, boucles. */
export default {
  id: 'macros',
  level: 'confirme',
  number: 14,
  title: 'Macros : variables et conditions',
  summary: 'Variables #, calculs, IF, GOTO, WHILE : rendre un programme paramétrable, et respecter les plages libres de la machine.',
  duration: 30,
  goals: [
    'distinguer les familles de variables et choisir une plage libre ;',
    'calculer avec des variables et les utiliser comme cotes ;',
    'écrire une condition `IF` et une boucle `WHILE` ;',
    'appeler une macro avec arguments (`G65`).',
  ],
  sections: [
    {
      id: 'variables',
      title: 'Les variables',
      blocks: [
        {
          type: 'p',
          text: 'Une variable s’écrit `#` suivi d’un numéro : `#100`, `#501`. Elle contient un nombre, que l’on affecte avec `=` et que l’on utilise à la place d’une valeur : `X#501`.',
        },
        {
          type: 'table',
          head: ['Variables (Fanuc)', 'Portée', 'Conservées à l’arrêt ?'],
          rows: [
            ['#1 à #33', 'locales : propres à chaque appel de macro (arguments)', 'non'],
            ['#100 à #199', 'communes à tous les programmes', 'non (remises à vide)'],
            ['#500 à #999', 'communes à tous les programmes', 'oui'],
            ['#1000 et plus', 'système : positions, correcteurs, état de la machine', 'selon la variable'],
          ],
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Sur une machine en production, une partie des variables communes est souvent utilisée par le constructeur ou par d’autres programmes (compteurs, mesures, cycles). Écrire dans une variable déjà utilisée dérègle silencieusement autre chose. Demandez quelle plage vous est réservée.',
        },
        {
          type: 'note',
          tone: 'info',
          text: 'C’est le rôle des **plages de macros libres** de votre profil machine : l’éditeur propose la prochaine variable libre en tapant #, signale une variable hors plage ou déjà utilisée par un autre programme, et le panneau « Variables » permet de leur donner un nom.',
        },
      ],
    },
    {
      id: 'calculs',
      title: 'Calculer',
      blocks: [
        {
          type: 'code',
          lines: [
            ['#501 = 25.', 'Diamètre du tenon'],
            ['#502 = #501 + 0.4', 'Diamètre d’ébauche : 0,4 mm de surépaisseur'],
            ['#503 = [#501 - 20.] / 2', 'Crochets pour grouper un calcul'],
            ['G01 X#502 F0.2', 'Variable utilisée comme cote'],
            ['Z-[#503 + 10.]', 'Expression entre crochets dans une cote'],
          ],
        },
        {
          type: 'list',
          items: [
            'opérateurs : `+`, `-`, `*`, `/` ; crochets `[ ]` (jamais de parenthèses, réservées aux commentaires) ;',
            'fonctions : `SIN`, `COS`, `TAN`, `ATAN`, `SQRT`, `ABS`, `ROUND`, `FIX` (partie entière), `FUP` (arrondi supérieur) ;',
            'les angles sont en degrés.',
          ],
        },
        {
          type: 'note',
          tone: 'machine',
          text: 'Ces instructions supposent l’option « Custom Macro B » de Fanuc, présente sur la grande majorité des tours récents. Sur Siemens, les variables sont nommées (R-paramètres **R1**, **R2**… ou variables déclarées) et la syntaxe des conditions est différente.',
        },
      ],
    },
    {
      id: 'conditions',
      title: 'Conditions et boucles',
      blocks: [
        {
          type: 'table',
          head: ['Comparaison', 'Sens'],
          rows: [
            ['`EQ` / `NE`', 'égal / différent'],
            ['`GT` / `GE`', 'supérieur / supérieur ou égal'],
            ['`LT` / `LE`', 'inférieur / inférieur ou égal'],
          ],
        },
        {
          type: 'list',
          items: [
            '`IF [#1 GT 10.] GOTO 100` : saute au bloc N100 si la condition est vraie ;',
            '`IF [#1 EQ 0] THEN #2 = 5.` : affectation conditionnelle ;',
            '`WHILE [#1 LE 3] DO 1` … `END 1` : répète les blocs tant que la condition est vraie (numéros de boucle 1 à 3).',
          ],
        },
        {
          type: 'code',
          open: 'Cours 14 - boucle WHILE',
          caption: 'Les trois gorges de la leçon 13, avec une boucle au lieu d’un sous-programme. Plage libre supposée : #500 à #999.',
          lines: [
            ['%', null],
            ['O0014 (GORGES EN BOUCLE)', null],
            ['N10 G21 G40 G97 G99 G18', null],
            ['N20 T0404 (GORGE 3MM)', null],
            ['N30 G97 S600 M03', null],
            ['N40 G00 X42. Z0. M08', null],
            ['N50 #501 = 3', 'Nombre de gorges'],
            ['N60 #502 = 10.', 'Pas entre les gorges'],
            ['N70 #503 = 1', 'Compteur'],
            ['N80 WHILE [#503 LE #501] DO 1', 'Tant que le compteur ne dépasse pas 3'],
            ['N90 G00 Z-[#503 * #502]', 'Position de la gorge : Z-10., Z-20., Z-30.'],
            ['N100 G01 X30. F0.05', null],
            ['N110 G00 X42.', null],
            ['N120 #503 = #503 + 1', 'Gorge suivante'],
            ['N130 END 1', 'Fin de la boucle'],
            ['N140 G00 X100. Z50. M09', null],
            ['N150 M05', null],
            ['N160 M30', null],
            ['%', null],
          ],
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Une boucle dont la condition reste toujours vraie (compteur oublié) tourne indéfiniment : testez d’abord en mode bloc par bloc, sans pièce.',
        },
      ],
    },
    {
      id: 'g65',
      title: 'Appeler une macro avec des arguments',
      blocks: [
        {
          type: 'p',
          text: '`G65 P9010 A25. B3.` appelle le programme O9010 en lui passant des valeurs : chaque lettre remplit une variable locale. Les plus courantes : A → #1, B → #2, C → #3, I → #4, J → #5, K → #6, D → #7, E → #8, F → #9.',
        },
        {
          type: 'p',
          text: 'Une macro bien écrite devient un « cycle maison » : on change seulement les arguments d’une pièce à l’autre.',
        },
        {
          type: 'note',
          tone: 'rectif',
          text: 'Les cycles de rectification, de diamantage et de mesure des rectifieuses sont très souvent des macros constructeur appelées avec `G65` (ou par un code G ou M personnalisé). Les variables qu’elles utilisent sont réservées : c’est pourquoi il est important de déclarer vos plages libres dans le profil de la machine.',
        },
      ],
    },
  ],
  quiz: [
    {
      type: 'choice',
      question: 'Quelles variables conservent leur valeur après la mise hors tension (Fanuc standard) ?',
      options: ['#1 à #33', '#100 à #199', '#500 à #999'],
      answer: 2,
      explain: '#500 à #999 sont conservées ; #100 à #199 sont remises à vide à l’arrêt ; #1 à #33 sont locales à chaque appel.',
    },
    {
      type: 'number',
      question: 'Après `#501 = 25.` puis `#502 = [#501 - 20.] / 2`, que vaut #502 ?',
      answer: 2.5,
      explain: '(25 − 20) / 2 = 2,5.',
    },
    {
      type: 'choice',
      question: 'Quel bloc saute au bloc N100 si #1 est supérieur à 10 ?',
      options: ['`IF [#1 GT 10.] GOTO 100`', '`IF [#1 LT 10.] GOTO 100`', '`IF (#1 GT 10.) GOTO 100`'],
      answer: 0,
      explain: '`GT` = supérieur. La condition s’écrit entre crochets : entre parenthèses, ce serait un commentaire et la commande s’arrêterait en alarme.',
    },
    {
      type: 'choice',
      question: 'Pourquoi les calculs s’écrivent-ils entre crochets `[ ]` et pas entre parenthèses ?',
      options: ['Par convention, sans importance', 'Parce que les parenthèses délimitent les commentaires', 'Parce que les crochets sont plus rapides'],
      answer: 1,
      explain: 'Tout ce qui est entre parenthèses est un commentaire, ignoré par la commande.',
    },
    {
      type: 'choice',
      question: 'Dans `G65 P9010 A25. B3.`, quelle variable reçoit la valeur 3 ?',
      options: ['#2', '#3', '#503'],
      answer: 0,
      explain: 'A → #1, B → #2, C → #3 : B3. remplit #2.',
    },
    {
      type: 'error',
      question: 'Cette boucle doit faire trois gorges, mais elle ne s’arrête jamais. Quelle ligne est fausse ?',
      lines: ['#503 = 1', 'WHILE [#503 LE 3] DO 1', 'G00 Z-[#503 * 10.]', 'G01 X30. F0.05', 'G00 X42.', '#503 = #503', 'END 1'],
      answer: 5,
      explain: 'Le compteur n’augmente jamais : `#503 = #503` laisse la condition vraie pour toujours. Il faut `#503 = #503 + 1`.',
    },
  ],
};
