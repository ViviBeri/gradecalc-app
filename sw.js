// GradeCalc Service Worker v2.0
// Network-first for the app shell (so updates show up immediately for
// returning visitors), cache-first for static assets (fonts/icons) so the
// app still works fully offline.

const CACHE_NAME = 'gradecalc-v10';

const ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html',
  '/gradecalc-icon.svg?v=20261029-green-v2',
  '/calc.js',
  '/analytics.js',
  '/icons/icon-192.png?v=20261029-green-v2',
  '/icons/icon-512.png?v=20261029-green-v2'
];

// ── Install: cache app shell + static assets ───────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches (drops stale v1 cache) ─────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension')) return;

  // App shell: cap network wait so dead-but-connected networks fall back quickly.
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
          (await caches.match('/offline.html')) ||
          (await caches.match('/')) ||
          new Response('You are offline. Reconnect and try again.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      } finally {
        clearTimeout(timeoutId);
      }
    })());
    return;
  }

  // Static assets (fonts, icons, manifest): cache-first for speed + offline.
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
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => new Response('', { status: 504, statusText: 'Offline' })).finally(() => clearTimeout(timeoutId));
    })
  );
});
