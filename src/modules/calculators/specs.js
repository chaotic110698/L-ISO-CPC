import { h } from '../../core/dom.js';
import {
  SPEED_UNITS,
  convertSpeed,
  cuttingSpeed,
  spindleSpeed,
  limitDiameter,
  feedRate,
  feedPerRevolution,
  roughness,
  feedForRoughness,
  noseRadiusCompensation,
  grindingSpeedRatio,
} from '../../engine/cutting.js';
import { formatResult } from './calculator.js';

const ALL_UNITS = Object.keys(SPEED_UNITS); // mm/min, mm/s, m/min, m/s
const ok = (...values) => values.every((v) => Number.isFinite(v) && v > 0);

/** Une vitesse exprimée dans toutes les unités, une pastille par unité. */
function allUnits(value, unit, decimals = { 'mm/min': 1, 'mm/s': 2, 'm/min': 2, 'm/s': 3 }) {
  if (!Number.isFinite(value)) return '—';
  return h(
    'span',
    { class: 'calc-units' },
    ALL_UNITS.map((u) => h('span', { class: u === unit ? 'is-current' : null }, h('b', null, formatResult(convertSpeed(value, unit, u), decimals[u])), ` ${u}`)),
  );
}

const line = (label, value, tone) =>
  h('div', { class: tone ? `calc-line is-${tone}` : 'calc-line' }, h('span', null, label), typeof value === 'string' ? h('strong', null, value) : value);

/** Conversion de la valeur affichée lors d'un changement d'unité (même vitesse physique). */
const convertOnUnitChange = (pairs) => (state, unitKey, previous) => {
  const key = pairs[unitKey];
  if (Number.isFinite(state[key])) state[key] = convertSpeed(state[key], previous, state[unitKey]);
};

export const CALCULATORS = [
  // ---------------------------------------------------------------------------------------
  {
    id: 'cutting',
    title: 'Vitesse de coupe ↔ vitesse de rotation',
    description: 'Saisissez la vitesse de coupe pour obtenir les tr/min, ou l’inverse. Unités au choix, y compris mm/min et mm/s.',
    defaults: { d: 50, vc: 200, vcUnit: 'm/min', n: NaN, nmax: NaN, source: 'vc' },
    fields: [
      { key: 'd', label: 'Diamètre', unit: 'mm', decimals: 3 },
      { key: 'vc', label: 'Vitesse de coupe Vc', units: ALL_UNITS, unitKey: 'vcUnit', decimals: 3 },
      { key: 'n', label: 'Vitesse de rotation N', unit: 'tr/min', decimals: 0 },
      { key: 'nmax', label: 'Vitesse maxi (G50), facultatif', unit: 'tr/min', decimals: 0 },
    ],
    onUnitChange: convertOnUnitChange({ vcUnit: 'vc' }),
    compute(s, changed) {
      if (changed === 'vc' || changed === 'n') s.source = changed;
      if (s.source === 'n') s.vc = ok(s.d, s.n) ? cuttingSpeed(s.d, s.n, s.vcUnit) : NaN;
      else s.n = ok(s.d, s.vc) ? spindleSpeed(s.d, s.vc, s.vcUnit) : NaN;
    },
    results(s) {
      const lines = [line('Vc', allUnits(s.vc, s.vcUnit)), line('N', `${formatResult(s.n, 0)} tr/min`)];
      if (ok(s.nmax, s.vc)) {
        const dLimit = limitDiameter(s.vc, s.nmax, s.vcUnit);
        lines.push(line('Limite G50 atteinte sous', `Ø ${formatResult(dLimit, 2)} mm`));
        if (s.n > s.nmax) lines.push(line('Attention', `N dépasse la vitesse maxi (${formatResult(s.nmax, 0)} tr/min)`, 'warning'));
      }
      return lines;
    },
    formula: 'Vc (m/min) = π × D × N / 1000   ·   N = 1000 × Vc / (π × D)',
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'feed',
    title: 'Avance',
    description: 'Avance par tour (tournage) ou par dent (fraisage) ↔ vitesse d’avance en mm/min ou mm/s.',
    defaults: { mode: 'turning', f: 0.2, fz: 0.1, z: 4, n: 1500, vf: NaN, vfUnit: 'mm/min', source: 'f' },
    fields: [
      { key: 'mode', label: 'Usinage', kind: 'choice', options: [{ value: 'turning', label: 'Tournage (mm/tr)' }, { value: 'milling', label: 'Fraisage (mm/dent)' }] },
      { key: 'f', label: 'Avance par tour f', unit: 'mm/tr', decimals: 4, hidden: (s) => s.mode !== 'turning' },
      { key: 'fz', label: 'Avance par dent fz', unit: 'mm/dent', decimals: 4, hidden: (s) => s.mode !== 'milling' },
      { key: 'z', label: 'Nombre de dents Z', unit: 'dents', decimals: 0, hidden: (s) => s.mode !== 'milling' },
      { key: 'n', label: 'Vitesse de rotation N', unit: 'tr/min', decimals: 0 },
      { key: 'vf', label: 'Vitesse d’avance Vf', units: ['mm/min', 'mm/s', 'm/min'], unitKey: 'vfUnit', decimals: 3 },
    ],
    onUnitChange: convertOnUnitChange({ vfUnit: 'vf' }),
    compute(s, changed) {
      if (['f', 'fz', 'z'].includes(changed)) s.source = 'f';
      if (changed === 'vf') s.source = 'vf';
      const teeth = s.mode === 'milling' ? s.z : 1;
      if (s.source === 'vf') {
        const perRev = ok(s.vf, s.n) ? feedPerRevolution(convertSpeed(s.vf, s.vfUnit, 'mm/min'), s.n) : NaN;
        if (s.mode === 'milling') s.fz = ok(teeth) ? perRev / teeth : NaN;
        else s.f = perRev;
      } else {
        const perRev = s.mode === 'milling' ? s.fz * s.z : s.f;
        s.vf = ok(perRev, s.n) ? convertSpeed(feedRate(perRev, s.n), 'mm/min', s.vfUnit) : NaN;
      }
    },
    results: (s) => [line('Vf', allUnits(s.vf, s.vfUnit))],
    formula: 'Vf (mm/min) = f × N   ·   fraisage : Vf = fz × Z × N   ·   1 mm/s = 60 mm/min',
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'grinding',
    title: 'Rectification',
    description: 'Vitesse périphérique de la meule, vitesse de la pièce, rapport q et vitesse d’avance longitudinale (traverse), en mm/min ou mm/s.',
    defaults: {
      ds: 400, ns: 1500, vs: NaN, vsUnit: 'm/s', sourceS: 'ns',
      dw: 50, nw: 120, vw: NaN, vwUnit: 'mm/s', sourceW: 'nw',
      fa: 10, vfa: NaN, vfaUnit: 'mm/s', sourceA: 'fa',
    },
    fields: [
      { key: 'ds', label: 'Diamètre de la meule', unit: 'mm', decimals: 1 },
      { key: 'ns', label: 'Rotation de la meule', unit: 'tr/min', decimals: 0 },
      { key: 'vs', label: 'Vitesse périphérique meule Vs', units: ALL_UNITS, unitKey: 'vsUnit', decimals: 3 },
      { key: 'dw', label: 'Diamètre de la pièce', unit: 'mm', decimals: 3 },
      { key: 'nw', label: 'Rotation de la pièce', unit: 'tr/min', decimals: 1 },
      { key: 'vw', label: 'Vitesse périphérique pièce Vw', units: ALL_UNITS, unitKey: 'vwUnit', decimals: 3 },
      { key: 'fa', label: 'Avance longitudinale par tour de pièce', unit: 'mm/tr', decimals: 3, hint: 'Ordre de grandeur : 1/3 à 2/3 de la largeur de meule en ébauche, moins en finition.' },
      { key: 'vfa', label: 'Vitesse d’avance longitudinale (table)', units: ['mm/min', 'mm/s', 'm/min'], unitKey: 'vfaUnit', decimals: 3 },
    ],
    onUnitChange: convertOnUnitChange({ vsUnit: 'vs', vwUnit: 'vw', vfaUnit: 'vfa' }),
    compute(s, changed) {
      if (changed === 'ns' || changed === 'vs') s.sourceS = changed;
      if (changed === 'nw' || changed === 'vw') s.sourceW = changed;
      if (changed === 'fa' || changed === 'vfa') s.sourceA = changed;

      if (s.sourceS === 'vs') s.ns = ok(s.ds, s.vs) ? spindleSpeed(s.ds, s.vs, s.vsUnit) : NaN;
      else s.vs = ok(s.ds, s.ns) ? cuttingSpeed(s.ds, s.ns, s.vsUnit) : NaN;

      if (s.sourceW === 'vw') s.nw = ok(s.dw, s.vw) ? spindleSpeed(s.dw, s.vw, s.vwUnit) : NaN;
      else s.vw = ok(s.dw, s.nw) ? cuttingSpeed(s.dw, s.nw, s.vwUnit) : NaN;

      if (s.sourceA === 'vfa') s.fa = ok(s.vfa, s.nw) ? feedPerRevolution(convertSpeed(s.vfa, s.vfaUnit, 'mm/min'), s.nw) : NaN;
      else s.vfa = ok(s.fa, s.nw) ? convertSpeed(feedRate(s.fa, s.nw), 'mm/min', s.vfaUnit) : NaN;
    },
    results(s) {
      const q = ok(s.vs, s.vw) ? grindingSpeedRatio(s.vs, s.vsUnit, s.vw, s.vwUnit) : NaN;
      return [
        line('Vs meule', allUnits(s.vs, s.vsUnit)),
        line('Vw pièce', allUnits(s.vw, s.vwUnit)),
        line('Rapport q = Vs / Vw', formatResult(q, 0)),
        line('Avance table', allUnits(s.vfa, s.vfaUnit)),
      ];
    },
    formula: 'Vs (m/s) = π × Ds × Ns / 60 000   ·   q = Vs / Vw (même unité ; souvent 60 à 120 en rectification cylindrique)   ·   Va = fa × Nw',
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'convert',
    title: 'Conversion de vitesses',
    description: 'Convertit une vitesse entre mm/min, mm/s, m/min et m/s.',
    defaults: { v: 1000, unit: 'mm/min' },
    fields: [{ key: 'v', label: 'Vitesse', units: ALL_UNITS, unitKey: 'unit', decimals: 4 }],
    compute() {},
    results: (s) =>
      ALL_UNITS.map((u) => line(u, Number.isFinite(s.v) ? formatResult(convertSpeed(s.v, s.unit, u), 4) : '—')),
    formula: '1 mm/s = 60 mm/min   ·   1 m/min = 1000 mm/min   ·   1 m/s = 60 m/min',
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'roughness',
    title: 'Rugosité théorique (tournage)',
    description: 'Rugosité laissée par le rayon de bec pour une avance donnée, ou avance maximale pour une rugosité visée.',
    defaults: { f: 0.2, r: 0.8, ra: NaN, source: 'f' },
    fields: [
      { key: 'f', label: 'Avance f', unit: 'mm/tr', decimals: 4 },
      { key: 'r', label: 'Rayon de bec r', unit: 'mm', decimals: 2, hint: 'Rayons courants : 0,2 · 0,4 · 0,8 · 1,2 · 1,6 mm' },
      { key: 'ra', label: 'Rugosité Ra', unit: 'µm', decimals: 3 },
    ],
    compute(s, changed) {
      if (changed === 'f' || changed === 'ra') s.source = changed;
      if (s.source === 'ra') s.f = ok(s.ra, s.r) ? feedForRoughness(s.ra, s.r) : NaN;
      else s.ra = ok(s.f, s.r) ? roughness(s.f, s.r).ra : NaN;
    },
    results(s) {
      const rt = ok(s.f, s.r) ? roughness(s.f, s.r).rt : NaN;
      return [line('Ra', `${formatResult(s.ra, 2)} µm`), line('Rt (crête-creux)', `${formatResult(rt, 2)} µm`), line('Avance', `${formatResult(s.f, 3)} mm/tr`)];
    },
    formula: 'Rt = f² / (8 r) · Ra ≈ f² / (18 √3 r) ≈ 32 × f² / r (µm, f en mm/tr, r en mm). Valeur théorique : la rugosité réelle est souvent plus élevée.',
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'nose',
    title: 'Compensation de rayon de bec',
    description:
      'Programmation de la pointe théorique sans G41/G42 : décalages à appliquer sur un cône ou un chanfrein pour obtenir la bonne cote malgré le rayon de bec.',
    defaults: { r: 0.8, angle: 45 },
    fields: [
      { key: 'r', label: 'Rayon de bec r', unit: 'mm', decimals: 2 },
      { key: 'angle', label: 'Angle du cône par rapport à l’axe Z', unit: '°', decimals: 3, hint: '45° : chanfrein · 0° : cylindre · 90° : face' },
    ],
    compute() {},
    results(s) {
      if (!ok(s.r) || !Number.isFinite(s.angle) || s.angle < 0 || s.angle > 90) {
        return [line('Saisir', 'un rayon > 0 et un angle entre 0 et 90°', 'warning')];
      }
      const { dz, dxDiameter, dxRadius } = noseRadiusCompensation(s.r, s.angle);
      return [
        line('Décalage en Z (ΔZ)', `${formatResult(dz, 3)} mm`),
        line('Décalage en X au diamètre (ΔX)', `${formatResult(dxDiameter, 3)} mm`),
        line('Décalage en X au rayon', `${formatResult(dxRadius, 3)} mm`),
      ];
    },
    formula:
      'ΔZ = r × (1 − tan(α/2))   ·   ΔX (diamètre) = 2 r × (1 − tan((90° − α)/2)). Avec G41/G42 et l’orientation de plaquette (T) renseignée dans le correcteur, la commande fait ce calcul elle-même.',
  },
];
