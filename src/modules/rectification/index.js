import { X_CHOICES, Z_CHOICES, Z_SETTING, createSimulator, splitLegacySession } from '../simulation-2d/simulator.js';
import { DIAMONDS, Z_DEFAULTS, sanitizeWheel } from '../simulation-2d/wheel.js';

const choices = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));

/**
 * Simulateur rectification (section Simulateur › Rectification) : taillage de meule vu de dessus,
 * en miroir comme à la machine (meule au-dessus, diamant en dessous). Un programme par diamant,
 * exécutés à la suite avec leurs variables communes ; chaque diamant a son repère (origine et
 * sens de Z+). Page commune aux simulateurs : ../simulation-2d/simulator.js ; meule et
 * diamants : ../simulation-2d/wheel.js.
 */
export default {
  id: 'rectification',
  label: 'Simulateur rectification (taillage de meule)',
  description:
    'Section Simulateur › Rectification : taillage de meule vu de dessus, en miroir comme à la machine (meule au-dessus, diamant en dessous). Un programme par diamant (droit, flanc gauche, flanc droit), exécutés à la suite avec leurs variables communes ; chaque diamant a son origine (angle gauche, angle droit) et son sens de Z+. Largeur lue dans « (MEULE L40) » ou saisie, alertes (rapide à travers la meule).',
  group: 'analyse',
  where: 'Menu latéral › Simulateur › Rectification ; bouton « Simuler (rectification) » de l’éditeur (charge le programme ouvert)',
  settings: [
    { key: 'rectification.xMode', type: 'choice', label: 'Cotes X des programmes de taillage', options: choices({ diameter: 'Au diamètre', radius: 'Au rayon' }), default: 'diameter' },
    { key: 'rectification.xDirection', type: 'choice', label: 'Sens de X+ (tous les diamants)', options: choices(X_CHOICES), default: 'away' },
    ...Object.entries(Z_SETTING).map(([kind, name]) => ({
      key: `rectification.${name}`,
      type: 'choice',
      label: `Sens de Z+ — diamant ${DIAMONDS[kind].short}`,
      description: kind === 'rightFlank' ? 'Deux diamants en miroir : Z+ vers l’intérieur de la meule pour chacun (flanc gauche →, flanc droit ←).' : undefined,
      options: choices(Z_CHOICES),
      default: Z_DEFAULTS[kind],
    })),
    { key: 'rectification.straightOrigin', type: 'choice', label: 'Origine du diamant droit', options: choices({ left: 'Angle gauche', center: 'Milieu', right: 'Angle droit' }), default: 'left' },
    { key: 'rectification.rapidRate', type: 'number', label: 'Vitesse des rapides (estimation du temps)', unit: 'mm/min', min: 1000, max: 60000, step: 1000, default: 10000 },
  ],
  activate(ctx) {
    splitLegacySession(ctx.kv);
    // Réglages du simulateur unique d'avant (par programme) : sens des axes, cotes X, origine du
    // diamant droit deviennent des réglages de la machine. Le flanc droit reste l'inverse du
    // flanc gauche (ancien « Z inversé » : les deux étaient dans le même sens).
    const legacy = ctx.kv.get('rectification.legacyWheel', null);
    if (legacy) {
      ctx.kv.remove('rectification.legacyWheel');
      const old = sanitizeWheel(legacy);
      if (legacy.xMode) ctx.settings.set('rectification.xMode', old.xMode);
      if (legacy.straightOrigin) ctx.settings.set('rectification.straightOrigin', old.straightOrigin);
      if (legacy.invertX) ctx.settings.set('rectification.xDirection', 'toward');
      if (legacy.invertZ) for (const [kind, name] of Object.entries(Z_SETTING)) ctx.settings.set(`rectification.${name}`, old.zDirections[kind]);
    }
    createSimulator(ctx, {
      machine: 'dressing',
      id: 'rectification',
      path: '/rectification',
      label: 'Rectification',
      title: 'Simulateur rectification',
      icon: 'wheel',
      order: 25,
      prefix: 'rectification',
      toolbar: { label: 'Simuler (rectification)', title: 'Charger ce programme dans le simulateur rectification (taillage de meule)', order: 31 },
    });
  },
};
