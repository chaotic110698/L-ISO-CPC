// Aides communes aux tests unitaires (Node, sans navigateur).
import { createKv, createMemoryStorage } from '../../src/storage/kv.js';
import { createKvDatabase } from '../../src/storage/database.js';

export function memoryKv() {
  return createKv({ storage: createMemoryStorage() });
}

export function memoryDb() {
  return createKvDatabase(memoryKv(), 'memory');
}

/** Horloge contrôlée : chaque appel avance d'une milliseconde. */
export function fakeClock(start = 1_700_000_000_000) {
  let time = start;
  const now = () => time++;
  now.advance = (ms) => (time += ms);
  return now;
}
