/* Service worker de L-ISO-CPC (application installable, voir src/modules/install/).
 *
 * Actif seulement quand le site est servi en http(s) (pas en ouvrant index.html par double-clic).
 * Stratégie « réseau d'abord » : en ligne, la version la plus récente est servie et mise en cache ;
 * hors ligne (ou réseau trop lent), la copie en cache prend le relais. Aucune donnée personnelle
 * ne passe par ici : les programmes restent dans le stockage du navigateur.
 */

const CACHE = 'l-iso-cpc-v1';
const SHELL = [
  './',
  'index.html',
  'dist/app.js',
  'css/tokens.css',
  'css/base.css',
  'css/layout.css',
  'css/components.css',
  'css/editor.css',
  'manifest.webmanifest',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'assets/apple-touch-icon.png',
];
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((path) => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('l-iso-cpc-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Réseau d'abord : la réponse est copiée dans le cache. Si le réseau échoue, ou tarde plus de
 * NETWORK_TIMEOUT alors qu'une copie existe, la copie en cache est servie.
 */
async function handle(request) {
  const network = fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT, null));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
  } catch {
    // hors ligne : on passe au cache
  }
  const cached = (await caches.match(request, { ignoreSearch: true })) ?? (request.mode === 'navigate' ? await caches.match('index.html') : undefined);
  return cached ?? network; // rien en cache : on attend quand même le réseau
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(handle(request));
});
