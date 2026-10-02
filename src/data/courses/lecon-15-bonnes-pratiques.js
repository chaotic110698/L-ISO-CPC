/** Leçon 15 — erreurs courantes et bonnes pratiques (synthèse). */
export default {
  id: 'bonnes-pratiques',
  level: 'confirme',
  number: 15,
  title: 'Erreurs courantes et bonnes pratiques',
  summary: 'Les erreurs qui cassent des outils, les vérifications avant le premier lancement, et les habitudes d’écriture qui les évitent.',
  duration: 20,
  goals: [
    'reconnaître les erreurs de programmation les plus fréquentes ;',
    'préparer et lancer un premier essai en sécurité ;',
    'écrire des programmes lisibles et faciles à reprendre.',
  ],
  sections: [
    {
      id: 'erreurs',
      title: 'Les erreurs les plus fréquentes',
      blocks: [
        {
          type: 'table',
          head: ['Erreur', 'Conséquence', 'Parade'],
          rows: [
            ['cote sans point : `X20`', 'cote lue 0,020 mm (ou 20 mm selon le réglage de la machine)', 'toujours `X20.` ; le vérificateur le signale'],
            ['`G00` resté actif avant un usinage', 'l’outil traverse la matière en rapide', '`G01` explicite sur le premier bloc d’usinage'],
            ['`G96` sans limitation', 'survitesse au centre', '`G50 S2500` (A) ou **G92 S2500** (B/C) avant'],
            ['`G96` pour percer au centre', 'broche à la vitesse limite', '`G97` pour les outils au centre'],
            ['`G40` oublié', 'outil suivant décalé', '`G40` sur le dégagement et dans le bloc de sécurité'],
            ['dégagement X et Z ensemble', 'collision en sortie de trou ou d’épaulement', 'un axe après l’autre (alésage : Z d’abord)'],
            ['mauvais correcteur : `T0102`', 'cotes fausses, collision', 'même numéro de poste et de correcteur, sauf choix voulu'],
            ['P / Q de cycle en mm : `Q2.5`', 'alarme, ou passes fausses', 'P et Q des cycles G74 / G75 / G76 en microns'],
            ['`G90` mal compris', 'cycle de chariotage au lieu d’absolu (ou l’inverse)', 'connaître le système de codes de la machine'],
            ['variable de macro déjà utilisée', 'autre programme ou cycle déréglé', 'plages libres déclarées dans le profil'],
          ],
        },
      ],
    },
    {
      id: 'premier-essai',
      title: 'Lancer un nouveau programme',
      blocks: [
        {
          type: 'list',
          ordered: true,
          items: [
            '**Relire** le programme dans l’éditeur : aucune erreur du vérificateur, avertissements compris et acceptés.',
            '**Vérifier les correcteurs** de chaque outil appelé et l’origine pièce.',
            '**Essai à vide** ou visualisation graphique de la commande, si elle existe.',
            '**Premier passage en bloc par bloc**, avance rapide réduite (25 % ou moins), main sur le bouton d’arrêt d’avance.',
            'Avant chaque approche, comparer la distance restante affichée avec la position réelle de l’outil.',
            '**Laisser de la matière** sur la première pièce : ajouter une valeur positive dans l’usure X (+0,4 au diamètre pour garder 0,2 mm au rayon), mesurer, puis corriger.',
          ],
        },
        {
          type: 'note',
          tone: 'retenir',
          text: 'La correction d’avance rapide et le bloc par bloc ne protègent que si l’on regarde : à chaque arrêt, se demander « où va l’outil au prochain bloc ? ».',
        },
        {
          type: 'note',
          tone: 'rectif',
          text: 'En rectification, la première passe se fait au-dessus de la cote (prise de passe réduite, contact repéré à l’oreille ou au capteur d’émission acoustique selon la machine), et la meule doit être à vitesse avant tout contact. Les erreurs de quelques microns comptent : notez toutes les corrections faites.',
        },
      ],
    },
    {
      id: 'ecriture',
      title: 'Écrire des programmes faciles à reprendre',
      blocks: [
        {
          type: 'list',
          items: [
            '**En-tête complet** : nom de la pièce, matière, brut, date, auteur, version.',
            '**Un commentaire par outil** : `(T02 FINITION R0.4)`.',
            '**Numéros de bloc** espacés de 10, renumérotés avant de livrer (outil « Renuméroter » de l’éditeur, qui met aussi à jour les P / Q).',
            '**Séquences indépendantes** : chaque outil redonne vitesse, sens, arrosage et modes, pour pouvoir reprendre le programme à cet outil.',
            '**Versions** : enregistrer une version avant chaque modification importante, et comparer avec la précédente (outil « Versions » de l’éditeur).',
          ],
        },
      ],
    },
    {
      id: 'controle',
      title: 'Exemple : relire un programme',
      blocks: [
        {
          type: 'p',
          text: 'Ce programme contient six erreurs volontaires. Ouvrez-le dans l’éditeur : le vérificateur en signale trois. Les trois autres ne se voient qu’à la relecture. Corrigez-les toutes.',
        },
        {
          type: 'code',
          open: 'Cours 15 - programme a corriger',
          exercise: true,
          caption: 'Programme volontairement fautif, à corriger dans l’éditeur.',
          lines: [
            ['O0015 (A CORRIGER)', null],
            ['N10 G21 G97 G99', 'G40 absent du bloc de sécurité'],
            ['N20 T0101', null],
            ['N30 G96 S180 M03', 'Pas de limitation de vitesse'],
            ['N40 G00 X42. Z2. M08', null],
            ['N50 Z-30 F0.2', 'G00 encore actif, et Z sans point'],
            ['N60 G00 X50. Z2.', 'X et Z ensemble'],
            ['N70 M05', null],
          ],
        },
        {
          type: 'note',
          tone: 'retenir',
          title: 'Ce que le vérificateur ne voit pas',
          text: 'Il signale la limitation de vitesse absente, la cote `Z-30` sans point et la fin de programme `M30` manquante. Mais le `G00` resté actif sur le bloc d’usinage, le dégagement en X et Z ensemble et le `G40` absent du bloc de sécurité sont des erreurs de **logique** : seule une relecture attentive les trouve. Les solutions sont dans les explications de la ligne et dans le tableau ci-dessus.',
        },
      ],
    },
  ],
  quiz: [
    {
      type: 'choice',
      question: 'Pour le premier essai d’un nouveau programme, quelle précaution est la plus efficace ?',
      options: ['Lancer en continu à 100 % pour aller vite', 'Bloc par bloc, rapide réduit, main sur l’arrêt d’avance', 'Lancer sans arrosage'],
      answer: 1,
      explain: 'Le bloc par bloc et le rapide réduit donnent le temps de vérifier chaque déplacement avant qu’il ne se produise.',
    },
    {
      type: 'number',
      question: 'Pour garder 0,2 mm de matière au rayon sur la première pièce, quelle valeur ajoutez-vous à l’usure X (au diamètre) ?',
      answer: 0.4,
      tolerance: 0.0001,
      unit: 'mm',
      explain: '0,2 mm au rayon = 0,4 mm au diamètre : +0,4 dans l’usure X. On mesure, puis on retire ce qu’il faut.',
    },
    {
      type: 'error',
      question: 'Quelle ligne déclenche la collision la plus grave ?',
      lines: ['N40 G00 X42. Z2. M08', 'N50 Z-30. F0.2', 'N60 G00 X50.', 'N70 Z2.'],
      answer: 1,
      explain: '`G00` est encore actif : l’outil part en rapide dans la matière sur 32 mm. Il faut `G01 Z-30. F0.2`.',
    },
    {
      type: 'choice',
      question: 'Lesquelles de ces habitudes facilitent la reprise d’un programme après une casse d’outil ?',
      options: ['Chaque outil redonne sa vitesse, son sens de broche et ses modes', 'Un commentaire par outil', 'Supprimer les numéros de bloc', 'Écrire tout le programme en incrémental'],
      answer: [0, 1],
      explain: 'Des séquences indépendantes et repérées se relancent facilement. L’incrémental et l’absence de numéros rendent au contraire la reprise risquée.',
    },
    {
      type: 'block',
      question: 'Écrivez le bloc de sécurité de début de programme (système A) : mm, sans compensation, tr/min, avance par tour, plan ZX.',
      dictionary: 'a',
      expect: 'G21 G40 G97 G99 G18',
      explain: '`G21 G40 G97 G99 G18` remet la commande dans un état connu.',
    },
  ],
};
