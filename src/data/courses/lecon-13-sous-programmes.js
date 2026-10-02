/** Leçon 13 — sous-programmes : M98, M99. */
export default {
  id: 'sous-programmes',
  level: 'confirme',
  number: 13,
  title: 'Sous-programmes : M98, M99',
  summary: 'Écrire une fois une séquence répétée, l’appeler plusieurs fois, la décaler en incrémental, revenir au programme principal.',
  duration: 20,
  goals: [
    'appeler un sous-programme et le répéter avec `M98` ;',
    'terminer un sous-programme avec `M99` ;',
    'utiliser l’incrémental pour décaler chaque répétition ;',
    'connaître les limites (imbrication, numéros, rangement).',
  ],
  sections: [
    {
      id: 'principe',
      title: 'Appeler et revenir',
      blocks: [
        {
          type: 'p',
          text: 'Un sous-programme est un programme à part (son propre numéro O), rangé dans la mémoire de la commande. Le programme principal l’appelle avec `M98` ; le sous-programme se termine par `M99`, qui renvoie au bloc suivant l’appel.',
        },
        {
          type: 'table',
          head: ['Écriture', 'Signification'],
          rows: [
            ['`M98 P1001`', 'appelle O1001 une fois'],
            ['`M98 P31001`', 'appelle O1001 trois fois : les 4 derniers chiffres sont le numéro du programme, ceux d’avant le nombre de répétitions'],
            ['`M99`', 'fin du sous-programme : retour au programme appelant'],
          ],
        },
        {
          type: 'note',
          tone: 'machine',
          text: 'Selon la commande, la répétition s’écrit aussi `M98 P1001 L3` (adresse L), ou le sous-programme est appelé par son nom (Siemens : nom du fichier, ou **CALL**). Les appels peuvent s’imbriquer sur plusieurs niveaux (souvent 4 sur Fanuc, davantage sur les modèles récents).',
        },
      ],
    },
    {
      id: 'repetition',
      title: 'Répéter en décalant',
      blocks: [
        {
          type: 'p',
          text: 'L’intérêt principal : une séquence identique à plusieurs endroits. En écrivant le sous-programme en **incrémental**, chaque appel repart de là où le précédent s’est arrêté.',
        },
        {
          type: 'code',
          open: 'Cours 13 - sous-programme',
          caption: 'Trois gorges de 3 mm, espacées de 10 mm, sur un Ø40 (outil à gorge de 3 mm). Le programme principal et le sous-programme sont dans le même fichier pour l’exemple ; sur la machine, O1001 est un programme séparé.',
          lines: [
            ['%', null],
            ['O0013 (TROIS GORGES)', 'Programme principal'],
            ['N10 G21 G40 G97 G99 G18', null],
            ['N20 T0404 (GORGE 3MM)', null],
            ['N30 G97 S600 M03', null],
            ['N40 G00 X42. Z0. M08', 'Point de départ, 10 mm avant la première gorge'],
            ['N50 M98 P31001', 'Appelle O1001 trois fois'],
            ['N60 G00 X100. Z50. M09', 'Retour au programme principal après la 3e gorge'],
            ['N70 M05', null],
            ['N80 M30', null],
            ['O1001 (UNE GORGE)', 'Sous-programme'],
            ['N10 G00 W-10.', 'Avance de 10 mm vers le mandrin (incrémental)'],
            ['N20 G01 X30. F0.05', 'Plongée au Ø30'],
            ['N30 G00 X42.', 'Remontée'],
            ['N40 M99', 'Retour'],
            ['%', null],
          ],
        },
        {
          type: 'p',
          text: 'Premier appel : `W-10.` amène l’outil en Z-10, gorge. Deuxième appel : Z-20. Troisième : Z-30. Un sous-programme en absolu (`Z-10.`) referait trois fois la même gorge.',
        },
        {
          type: 'note',
          tone: 'piege',
          text: 'Un sous-programme qui change un mode (`G41`, une vitesse, l’incrémental en systèmes B/C…) le laisse actif au retour. Remettez-le dans l’état d’origine avant `M99`, ou rétablissez les modes dans le programme principal après l’appel.',
        },
      ],
    },
    {
      id: 'autres',
      title: 'Autres usages',
      blocks: [
        {
          type: 'list',
          items: [
            '**Contour partagé** : le même profil appelé pour l’ébauche et la finition, ou pour deux pièces semblables.',
            '**Séquences d’atelier** : retour au point de changement d’outil, purge, contrôle… écrites une fois pour tous les programmes de la machine.',
            '**Saut** : dans le programme principal, `M99 P50` (sans appel en cours) renvoie au bloc N50, ce qui permet de boucler un programme sur un embarreur.',
          ],
        },
        {
          type: 'note',
          tone: 'rectif',
          text: 'Les rectifieuses utilisent beaucoup les sous-programmes constructeur (diamantage, mesure, cycles de rectification). Ils sont souvent protégés (plage O9000 sur Fanuc, selon un paramètre) : ne les modifiez pas, appelez-les avec les arguments prévus par la notice.',
        },
      ],
    },
  ],
  quiz: [
    {
      type: 'choice',
      question: 'Que fait `M98 P21005` ?',
      options: ['Appelle O2100 cinq fois', 'Appelle O1005 deux fois', 'Appelle O21005 une fois'],
      answer: 1,
      explain: 'Les 4 derniers chiffres (1005) sont le numéro du programme ; le chiffre d’avant (2) le nombre de répétitions.',
    },
    {
      type: 'block',
      question: 'Écrivez le bloc qui termine un sous-programme et revient au programme appelant.',
      expect: 'M99',
      explain: '`M99` termine le sous-programme et reprend au bloc qui suit le `M98`.',
    },
    {
      type: 'choice',
      question: 'Pourquoi écrire le déplacement de la gorge en `W-10.` plutôt qu’en `Z-10.` dans le sous-programme ?',
      options: ['W est plus précis', 'En incrémental, chaque appel repart de la position laissée par le précédent : les gorges se décalent', 'Z est interdit dans un sous-programme'],
      answer: 1,
      explain: 'En absolu, les trois appels iraient au même Z. En incrémental, chaque appel avance de 10 mm.',
    },
    {
      type: 'block',
      question: 'Écrivez l’appel du sous-programme O2000 quatre fois (format Fanuc à 4 chiffres de numéro).',
      expect: ['M98 P42000', 'M98 P2000 L4'],
      explain: '`M98 P42000` : 4 répétitions de O2000. Selon la commande, `M98 P2000 L4` est aussi possible.',
    },
    {
      type: 'error',
      question: 'Ce sous-programme est appelé trois fois pour faire trois gorges espacées. Quelle ligne l’en empêche ?',
      lines: ['O1001 (UNE GORGE)', 'N10 G00 Z-10.', 'N20 G01 X30. F0.05', 'N30 G00 X42.', 'N40 M99'],
      answer: 1,
      explain: '`Z-10.` est absolu : les trois appels plongent au même endroit. Il faut `W-10.` (incrémental en système A).',
    },
  ],
};
