// GradeCalc Service Worker v3.0
// Network-first for navigations with a short timeout; cached app shell and
// a lightweight offline page keep the app responsive on unreliable networks.

const CACHE_NAME = 'gradecalc-v3';
const NAVIGATION_TIMEOUT_MS = 3000;

const ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension:')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const networkRequest = fetch(event.request).then(response => {
        if (response && response.ok) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseCopy)).catch(() => {});
        }
        return response;
      });

      let timeoutId;
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Navigation network timeout')), NAVIGATION_TIMEOUT_MS);
      });

      try {
        return await Promise.race([networkRequest, timeout]);
      } catch (_) {
        return (await caches.match(event.request)) ||
          (await caches.match('/offline.html')) ||
          (await caches.match('/'));
      } finally {
        clearTimeout(timeoutId);
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (
          response && response.status === 200 &&
          (event.request.url.startsWith(self.location.origin) ||
           event.request.url.includes('fonts.googleapis.com') ||
           event.request.url.includes('fonts.gstatic.com'))
        ) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseCopy)).catch(() => {});
        }
        return response;
      }).catch(() => undefined);
    })
  );
});
