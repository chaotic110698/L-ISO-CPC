/**
 * Base de données documentaire minimale. Toutes les implémentations exposent la même API
 * asynchrone, ce qui permet de changer de support sans toucher au reste du code :
 *
 *   get(store, id) · getAll(store) · put(store, record) · putMany(store, records)
 *   delete(store, id) · clear(store) · kind ('indexeddb' | 'localstorage' | 'memory')
 *
 * Chaque enregistrement possède une clé `id` (chaîne).
 */

export const DB_NAME = 'l-iso-cpc';

/**
 * Migrations du schéma IndexedDB : la migration d'indice i fait passer la base de la version i
 * à la version i + 1. Ne jamais modifier une migration déjà publiée : en ajouter une nouvelle.
 * Prévu pour les étapes suivantes : profils machines, bibliothèque de sous-programmes, versions.
 */
const MIGRATIONS = [
  (db) => {
    db.createObjectStore('programs', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'id' });
  },
];

export const STORES = ['programs', 'meta'];

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction annulée'));
  });
}

export async function openIndexedDb({ indexedDB = globalThis.indexedDB, name = DB_NAME, onVersionChange } = {}) {
  if (!indexedDB) throw new Error('IndexedDB indisponible');

  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, MIGRATIONS.length);
    request.onupgradeneeded = (event) => {
      for (let version = event.oldVersion; version < MIGRATIONS.length; version++) {
        MIGRATIONS[version](request.result, request.transaction);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => console.warn('Mise à jour de la base en attente : fermez les autres onglets du site.');
  });

  // Un autre onglet plus récent veut migrer la base : on libère la connexion.
  db.onversionchange = () => {
    db.close();
    onVersionChange?.();
  };

  const write = async (store, fn) => {
    const transaction = db.transaction(store, 'readwrite');
    fn(transaction.objectStore(store));
    await transactionDone(transaction);
  };

  return {
    kind: 'indexeddb',
    get: (store, id) => requestToPromise(db.transaction(store).objectStore(store).get(id)),
    getAll: (store) => requestToPromise(db.transaction(store).objectStore(store).getAll()),
    put: async (store, record) => {
      await write(store, (os) => os.put(record));
      return record;
    },
    putMany: (store, records) => write(store, (os) => records.forEach((record) => os.put(record))),
    delete: (store, id) => write(store, (os) => os.delete(id)),
    clear: (store) => write(store, (os) => os.clear()),
  };
}

/**
 * Implémentation de repli au-dessus d'un stockage clé/valeur (localStorage ou mémoire) :
 * chaque magasin est un objet JSON { id: enregistrement }.
 */
export function createKvDatabase(kv, kind = kv.available ? 'localstorage' : 'memory') {
  const read = (store) => kv.get(`db:${store}`, {}) ?? {};
  const write = (store, data) => {
    if (!kv.set(`db:${store}`, data)) throw new Error('Espace de stockage du navigateur plein.');
  };

  return {
    kind,
    get: async (store, id) => clone(read(store)[id]),
    getAll: async (store) => Object.values(read(store)).map(clone),
    put: async (store, record) => {
      const data = read(store);
      data[record.id] = clone(record);
      write(store, data);
      return record;
    },
    putMany: async (store, records) => {
      const data = read(store);
      for (const record of records) data[record.id] = clone(record);
      write(store, data);
    },
    delete: async (store, id) => {
      const data = read(store);
      delete data[id];
      write(store, data);
    },
    clear: async (store) => write(store, {}),
  };
}

/** Ouvre IndexedDB, ou se replie sur le stockage clé/valeur si le navigateur le refuse. */
export async function openDatabase({ kv, indexedDB = globalThis.indexedDB, onVersionChange } = {}) {
  if (indexedDB) {
    try {
      return await openIndexedDb({ indexedDB, onVersionChange });
    } catch (error) {
      console.warn('IndexedDB indisponible, repli sur le stockage local.', error);
    }
  }
  return createKvDatabase(kv);
}
