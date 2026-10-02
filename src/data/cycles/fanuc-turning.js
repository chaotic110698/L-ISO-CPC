import { formatIso as mm, formatInteger as int } from '../../engine/format.js';

/**
 * Formulaires de cycles FANUC tournage. Chaque modèle :
 *   { id, title, codes, description,
 *     fields: [ { key, label, unit?, default, type: 'number' | 'integer' | 'boolean' | 'choice', options?, hint?, min? } ],
 *     generate(values) → { lines: [texte], notes?: [texte] } }
 *
 * Les valeurs saisies en mm sont converties quand le cycle attend des µm (P, Q de G74/G75/G76).
 * Ajouter un modèle : nouvelle entrée dans ce tableau (voir README).
 */

const um = (millimetres) => int(millimetres * 1000);
/** Nombre dans un texte d'explication (notation française : 0,920). */
const fr = (value, digits = 3) => value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const spindle = (v) => (v.rpm > 0 ? [`G97 S${int(v.rpm)} M03`] : []);

/** Hauteur de filet ISO métrique (au rayon) : extérieur 0,6134 × pas, intérieur 0,5413 × pas. */
export const threadHeight = (pitch, internal) => (internal ? 0.5413 : 0.6134) * pitch;

export const FANUC_TURNING_CYCLES = [
  {
    id: 'g71',
    title: 'Ébauche longitudinale G71 (+ finition G70)',
    codes: ['G71', 'G70'],
    description: 'Chariotage par passes parallèles à Z en suivant un profil (blocs N début à N fin), puis finition optionnelle.',
    fields: [
      { key: 'xStart', label: 'Point de départ X (au-dessus du brut)', unit: 'mm Ø', default: 52 },
      { key: 'zStart', label: 'Point de départ Z', unit: 'mm', default: 2 },
      { key: 'depth', label: 'Profondeur de passe (au rayon)', unit: 'mm', default: 2, min: 0.01 },
      { key: 'retract', label: 'Dégagement en fin de passe', unit: 'mm', default: 0.5, min: 0 },
      { key: 'ns', label: 'N du premier bloc du profil', type: 'integer', default: 100, min: 1 },
      { key: 'nf', label: 'N du dernier bloc du profil', type: 'integer', default: 200, min: 1 },
      { key: 'u', label: 'Surépaisseur de finition en X (au diamètre)', unit: 'mm', default: 0.4, hint: 'Négative pour un alésage.' },
      { key: 'w', label: 'Surépaisseur de finition en Z', unit: 'mm', default: 0.1 },
      { key: 'f', label: 'Avance d’ébauche', unit: 'mm/tr', default: 0.25, min: 0 },
      { key: 'profileX', label: 'Diamètre au début du profil', unit: 'mm Ø', default: 20 },
      { key: 'zFace', label: 'Z de la face (début du profil)', unit: 'mm', default: 0 },
      { key: 'endX', label: 'Diamètre en fin de profil', unit: 'mm Ø', default: 52 },
      { key: 'finish', label: 'Ajouter la finition G70', type: 'boolean', default: true },
      { key: 'ff', label: 'Avance de finition (dans le profil)', unit: 'mm/tr', default: 0.1, min: 0 },
    ],
    generate(v) {
      const lines = [
        `G0 X${mm(v.xStart)} Z${mm(v.zStart)}`,
        `G71 U${mm(v.depth)} R${mm(v.retract)}`,
        `G71 P${int(v.ns)} Q${int(v.nf)} U${mm(v.u)} W${mm(v.w)} F${mm(v.f)}`,
        `N${int(v.ns)} G0 X${mm(v.profileX)}`,
        `G1 Z${mm(v.zFace)} F${mm(v.ff)}`,
        '(--- PROFIL A COMPLETER : G1 / G2 / G3 ---)',
        `N${int(v.nf)} G1 X${mm(v.endX)}`,
      ];
      if (v.finish) lines.push(`G0 G42 X${mm(v.xStart)} Z${mm(v.zStart)}`, `G70 P${int(v.ns)} Q${int(v.nf)}`, `G0 G40 X${mm(v.xStart + 50)} Z${mm(v.zStart + 50)}`);
      const notes = ['Profil de type I : X et Z doivent évoluer dans un seul sens.', 'Le bloc N début ne contient qu’un déplacement en X.'];
      if (v.nf <= v.ns) notes.unshift('Attention : le N de fin doit être supérieur au N de début.');
      return { lines, notes };
    },
  },
  {
    id: 'g72',
    title: 'Ébauche transversale G72 (dressage)',
    codes: ['G72', 'G70'],
    description: 'Passes parallèles à X : pour les pièces courtes de grand diamètre.',
    fields: [
      { key: 'xStart', label: 'Point de départ X', unit: 'mm Ø', default: 82 },
      { key: 'zStart', label: 'Point de départ Z', unit: 'mm', default: 2 },
      { key: 'depth', label: 'Profondeur de passe en Z', unit: 'mm', default: 2, min: 0.01 },
      { key: 'retract', label: 'Dégagement', unit: 'mm', default: 0.5, min: 0 },
      { key: 'ns', label: 'N du premier bloc du profil', type: 'integer', default: 100, min: 1 },
      { key: 'nf', label: 'N du dernier bloc du profil', type: 'integer', default: 200, min: 1 },
      { key: 'u', label: 'Surépaisseur en X (au diamètre)', unit: 'mm', default: 0.4 },
      { key: 'w', label: 'Surépaisseur en Z', unit: 'mm', default: 0.1 },
      { key: 'f', label: 'Avance d’ébauche', unit: 'mm/tr', default: 0.25, min: 0 },
      { key: 'profileZ', label: 'Z au début du profil', unit: 'mm', default: -10 },
      { key: 'endZ', label: 'Z en fin de profil', unit: 'mm', default: 0 },
    ],
    generate(v) {
      return {
        lines: [
          `G0 X${mm(v.xStart)} Z${mm(v.zStart)}`,
          `G72 W${mm(v.depth)} R${mm(v.retract)}`,
          `G72 P${int(v.ns)} Q${int(v.nf)} U${mm(v.u)} W${mm(v.w)} F${mm(v.f)}`,
          `N${int(v.ns)} G0 Z${mm(v.profileZ)}`,
          '(--- PROFIL A COMPLETER : G1 / G2 / G3 ---)',
          `N${int(v.nf)} G1 Z${mm(v.endZ)}`,
        ],
        notes: ['Le bloc N début ne contient qu’un déplacement en Z.'],
      };
    },
  },
  {
    id: 'g76',
    title: 'Filetage multipasses G76',
    codes: ['G76'],
    description: 'Filetage ISO métrique complet. La hauteur de filet et le diamètre à fond de filet sont calculés à partir du pas.',
    fields: [
      { key: 'internal', label: 'Filetage intérieur (taraudage)', type: 'boolean', default: false },
      { key: 'diameter', label: 'Diamètre nominal', unit: 'mm', default: 20, min: 0.1 },
      { key: 'pitch', label: 'Pas', unit: 'mm', default: 1.5, min: 0.01 },
      { key: 'zStart', label: 'Z d’approche (2 à 3 pas avant le filet)', unit: 'mm', default: 5 },
      { key: 'zEnd', label: 'Z de fin du filetage', unit: 'mm', default: -22 },
      { key: 'rpm', label: 'Vitesse de broche (0 : ne pas écrire)', unit: 'tr/min', type: 'integer', default: 1200, min: 0 },
      { key: 'passes', label: 'Passes de finition', type: 'integer', default: 2, min: 1 },
      { key: 'chamfer', label: 'Chanfrein de sortie (dixièmes de pas, 0 à 99)', type: 'integer', default: 0, min: 0 },
      { key: 'angle', label: 'Angle de l’outil', type: 'choice', default: '60', options: ['80', '60', '55', '30', '29', '0'].map((a) => ({ value: a, label: `${a}°` })) },
      { key: 'firstDepth', label: 'Profondeur de la 1re passe (au rayon)', unit: 'mm', default: 0.3, min: 0.001 },
      { key: 'minDepth', label: 'Profondeur de passe minimale', unit: 'mm', default: 0.05, min: 0 },
      { key: 'allowance', label: 'Surépaisseur de finition', unit: 'mm', default: 0.02, min: 0 },
    ],
    generate(v) {
      const k = threadHeight(v.pitch, v.internal);
      const root = v.internal ? v.diameter : v.diameter - 2 * k;
      const approach = v.internal ? v.diameter - 2 * k - 1 : v.diameter + 4;
      const p1 = `${String(int(v.passes)).padStart(2, '0')}${String(int(v.chamfer)).padStart(2, '0')}${String(v.angle).padStart(2, '0')}`;
      return {
        lines: [
          ...spindle(v),
          `G0 X${mm(approach)} Z${mm(v.zStart)}`,
          `G76 P${p1} Q${um(v.minDepth)} R${mm(v.allowance)}`,
          `G76 X${mm(root, 3)} Z${mm(v.zEnd)} P${um(k)} Q${um(v.firstDepth)} F${mm(v.pitch)}`,
        ],
        notes: [
          `Hauteur de filet calculée : ${fr(k)} mm (${v.internal ? '0,5413' : '0,6134'} × pas) → P${um(k)}.`,
          `Diamètre ${v.internal ? 'à fond de filet (intérieur)' : 'à fond de filet'} : ${fr(root)} mm.`,
          'Contrôler le filet avec une bague ou un tampon et ajuster la surépaisseur si besoin.',
        ],
      };
    },
  },
  {
    id: 'g92',
    title: 'Filetage passe par passe G92',
    codes: ['G92'],
    description: 'Une passe par bloc, profondeurs dégressives calculées (pénétration radiale).',
    fields: [
      { key: 'diameter', label: 'Diamètre nominal', unit: 'mm', default: 20, min: 0.1 },
      { key: 'pitch', label: 'Pas', unit: 'mm', default: 1.5, min: 0.01 },
      { key: 'zStart', label: 'Z d’approche', unit: 'mm', default: 5 },
      { key: 'zEnd', label: 'Z de fin du filetage', unit: 'mm', default: -22 },
      { key: 'count', label: 'Nombre de passes', type: 'integer', default: 6, min: 1 },
      { key: 'rpm', label: 'Vitesse de broche (0 : ne pas écrire)', unit: 'tr/min', type: 'integer', default: 1000, min: 0 },
    ],
    generate(v) {
      const k = threadHeight(v.pitch, false);
      const passes = [];
      for (let i = 1; i <= v.count; i++) passes.push(v.diameter - 2 * k * Math.sqrt(i / v.count));
      const [first, ...rest] = passes;
      return {
        lines: [...spindle(v), `G0 X${mm(v.diameter + 4)} Z${mm(v.zStart)}`, `G92 X${mm(first, 3)} Z${mm(v.zEnd)} F${mm(v.pitch)}`, ...rest.map((x) => `X${mm(x, 3)}`), `G0 X${mm(v.diameter + 50)} Z${mm(v.zStart + 50)}`],
        notes: [`Profondeurs dégressives (racine carrée), fond de filet Ø ${fr(passes.at(-1))} mm. Ajouter une passe à vide si nécessaire.`],
      };
    },
  },
  {
    id: 'g90',
    title: 'Chariotage simple G90',
    codes: ['G90'],
    description: 'Passes de chariotage successives sur un même diamètre, sans profil.',
    fields: [
      { key: 'xStart', label: 'Diamètre du brut', unit: 'mm Ø', default: 50 },
      { key: 'zStart', label: 'Point de départ Z', unit: 'mm', default: 2 },
      { key: 'xEnd', label: 'Diamètre final', unit: 'mm Ø', default: 40 },
      { key: 'zEnd', label: 'Z de fin de passe', unit: 'mm', default: -30 },
      { key: 'depth', label: 'Profondeur de passe (au rayon)', unit: 'mm', default: 1.5, min: 0.01 },
      { key: 'f', label: 'Avance', unit: 'mm/tr', default: 0.25, min: 0 },
    ],
    generate(v) {
      const diameters = [];
      for (let x = v.xStart - 2 * v.depth; x > v.xEnd + 1e-9 && diameters.length < 200; x -= 2 * v.depth) diameters.push(x);
      diameters.push(v.xEnd);
      const [first, ...rest] = diameters;
      return {
        lines: [`G0 X${mm(v.xStart + 2)} Z${mm(v.zStart)}`, `G90 X${mm(first)} Z${mm(v.zEnd)} F${mm(v.f)}`, ...rest.map((x) => `X${mm(x)}`), `G0 X${mm(v.xStart + 50)} Z${mm(v.zStart + 50)}`],
        notes: [`${diameters.length} passe(s).`],
      };
    },
  },
  {
    id: 'g74',
    title: 'Perçage profond au centre G74',
    codes: ['G74'],
    description: 'Perçage axial avec débourrage (outil fixe au centre).',
    fields: [
      { key: 'zStart', label: 'Z d’approche', unit: 'mm', default: 2 },
      { key: 'zEnd', label: 'Profondeur (Z du fond)', unit: 'mm', default: -40 },
      { key: 'peck', label: 'Profondeur de chaque passe', unit: 'mm', default: 5, min: 0.01 },
      { key: 'retract', label: 'Recul après chaque passe', unit: 'mm', default: 1, min: 0 },
      { key: 'f', label: 'Avance', unit: 'mm/tr', default: 0.1, min: 0 },
      { key: 'rpm', label: 'Vitesse de broche (0 : ne pas écrire)', unit: 'tr/min', type: 'integer', default: 800, min: 0 },
    ],
    generate(v) {
      return {
        lines: [...spindle(v), `G0 X0. Z${mm(v.zStart)}`, `G74 R${mm(v.retract)}`, `G74 Z${mm(v.zEnd)} Q${um(v.peck)} F${mm(v.f)}`, `G0 Z${mm(v.zStart + 50)}`],
        notes: [`Passe de ${fr(v.peck, 1)} mm → Q${um(v.peck)} (µm, sans point).`],
      };
    },
  },
  {
    id: 'g75',
    title: 'Gorge radiale G75',
    codes: ['G75'],
    description: 'Gorge par plongées successives en X avec débourrage ; plusieurs plongées si la gorge est plus large que l’outil.',
    fields: [
      { key: 'xStart', label: 'Diamètre d’approche', unit: 'mm Ø', default: 52 },
      { key: 'zStart', label: 'Z de la première plongée', unit: 'mm', default: -20 },
      { key: 'xEnd', label: 'Diamètre du fond de gorge', unit: 'mm Ø', default: 40 },
      { key: 'zEnd', label: 'Z de la dernière plongée (= Z de départ si gorge de la largeur de l’outil)', unit: 'mm', default: -24 },
      { key: 'peck', label: 'Profondeur de chaque passe en X (au rayon)', unit: 'mm', default: 1, min: 0.01 },
      { key: 'shift', label: 'Décalage en Z entre deux plongées (≤ largeur de l’outil)', unit: 'mm', default: 2.5, min: 0 },
      { key: 'retract', label: 'Recul après chaque passe', unit: 'mm', default: 0.5, min: 0 },
      { key: 'f', label: 'Avance', unit: 'mm/tr', default: 0.05, min: 0 },
    ],
    generate(v) {
      return {
        lines: [`G0 X${mm(v.xStart)} Z${mm(v.zStart)}`, `G75 R${mm(v.retract)}`, `G75 X${mm(v.xEnd)} Z${mm(v.zEnd)} P${um(v.peck)} Q${um(v.shift)} F${mm(v.f)}`, `G0 X${mm(v.xStart + 50)}`],
        notes: ['Z de départ = position du coin de l’outil mesuré au réglage (coin droit ou gauche selon l’habitude de l’atelier).'],
      };
    },
  },
];
