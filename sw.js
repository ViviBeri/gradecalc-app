// GradeCalc Service Worker v2.1
// Network-first app shell with a deployment-prefix-aware cache for GitHub Pages
// (/<repository>/) and root-hosted deployments.

const BASE_PATH = new URL('.', self.registration.scope).pathname;
const CACHE_NAME = 'gradecalc-v11';
const ASSETS = [
  '',
  'manifest.json',
  'offline.html',
  'gradecalc-icon.svg?v=20261029-green-v2',
  'calc.js',
  'analytics.js',
  'icons/icon-192.png?v=20261029-green-v2',
  'icons/icon-512.png?v=20261029-green-v2'
].map(path => BASE_PATH + path);

const APP_ROOT = BASE_PATH;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension:')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(event.request, { signal: controller.signal });
        if (!response.ok) throw new Error('Navigation network response was not OK');
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
        return response;
      } catch (_) {
        return (await caches.match(event.request)) ||
          (await caches.match(APP_ROOT + 'offline.html')) ||
          (await caches.match(APP_ROOT)) ||
          new Response('You are offline. Reconnect and try again.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      } finally {
        clearTimeout(timeoutId);
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      return fetch(event.request, { signal: controller.signal }).then(response => {
        if (
          response.status === 200 &&
          (event.request.url.startsWith(self.location.origin) ||
           event.request.url.includes('fonts.googleapis.com') ||
           event.request.url.includes('fonts.gstatic.com'))
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => new Response('', { status: 504, statusText: 'Offline' }))
        .finally(() => clearTimeout(timeoutId));
    })
  );
});
