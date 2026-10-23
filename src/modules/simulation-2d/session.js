import { REFERENCE, simulate } from '../../engine/index.js';
import { DIAMONDS, isDressingProgram } from './wheel.js';

/**
 * Programmes chargés dans le simulateur, indépendamment de l'éditeur : une copie de leur texte
 * est prise au chargement. Ils s'exécutent l'un après l'autre, comme à la machine : chacun part
 * de la position où le précédent s'est arrêté, et les variables de macro (#…) ne sont jamais
 * remises à zéro entre deux programmes (taillage à deux diamants, variables communes).
 * Fonctions pures.
 *
 * Session : { programs: [{ id, name, text, diamond: 'auto' | 'straight' | 'leftFlank' | 'rightFlank' }] }
 */

export const MAX_PROGRAMS = 8;

/** Session corrigée (programmes sans texte écartés, diamant connu ou « auto »). */
export function sanitizeSession(raw) {
  const programs = Array.isArray(raw?.programs) ? raw.programs : [];
  return {
    programs: programs
      .filter((p) => typeof p?.text === 'string')
      .slice(0, MAX_PROGRAMS)
      .map((p) => ({ id: typeof p.id === 'string' ? p.id : null, name: String(p.name || 'Programme'), text: p.text, diamond: DIAMONDS[p.diamond] ? p.diamond : 'auto' })),
  };
}

/**
 * Exécute les programmes à la suite. Chaque déplacement, alerte et outil porte l'indice de son
 * programme (`program`) ; les numéros de ligne restent ceux de son programme.
 * → { moves, warnings, tools, end, variables (Map finale), starts (1er déplacement de chaque programme) }
 */
export function simulateChain(programs, dictionary, { reference = REFERENCE } = {}) {
  const variables = new Map();
  const chain = { moves: [], warnings: [], tools: [], starts: [], end: reference, variables };
  let from = reference;
  programs.forEach((program, index) => {
    const result = simulate(program.text.split('\n'), dictionary, { reference: from, variables });
    chain.starts.push(chain.moves.length);
    const tag = (item) => ({ ...item, program: index });
    chain.moves.push(...result.moves.map(tag));
    chain.warnings.push(...result.warnings.map(tag));
    chain.tools.push(...result.tools.map(tag));
    from = result.end;
  });
  chain.end = from;
  return chain;
}

/** Même bloc : même programme et même ligne. */
export const sameBlock = (a, b) => a?.line === b?.line && (a?.program ?? 0) === (b?.program ?? 0);

/**
 * Avant la séparation des simulateurs (tour / rectification), un seul simulateur : sa session de
 * taillage de meule (machine choisie « taillage », ou commentaire MEULE / DIAMANT / TAILLAGE)
 * passe au simulateur rectification, et ses réglages de meule sont mis de côté pour lui
 * (`rectification.legacyWheel`). Une seule fois ; appelée par les deux modules.
 */
export function splitLegacySession(kv) {
  if (kv.get('simulation.split', false)) return;
  kv.set('simulation.split', true);
  const session = sanitizeSession(kv.get('simulation.session', null));
  if (!session.programs.length) return;
  const id = session.programs[0].id ?? 'sans-id';
  const machine = kv.get(`simulation.machine.${id}`, null);
  const dressing = machine ? machine === 'dressing' : isDressingProgram(session.programs.flatMap((p) => p.text.split('\n')));
  if (!dressing) return;
  if (!kv.get('rectification.session', null)) kv.set('rectification.session', session);
  const wheel = kv.get(`simulation.wheel.${id}`, null);
  if (wheel) kv.set('rectification.legacyWheel', wheel);
  kv.remove('simulation.session');
}
