/**
 * Minimal app-shell cache so the camera still opens when the venue wifi drops.
 *
 * Photos are never cached here; unsent shots live in IndexedDB and are pushed
 * by the app's own upload queue, which handles retries far better than a
 * service worker guessing at replay semantics.
 */
const CACHE = 'ota-cam-shell-v1';
const SHELL = ['/', '/icon.svg', '/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Roll state and uploads must always hit the network.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: fresh when possible, cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Build assets carry a content hash, so a cache hit is always correct.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok && (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname))) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
