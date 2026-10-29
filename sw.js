// GradeCalc service worker: network-first navigation with bounded wait and offline fallback.
const CACHE_NAME = 'gradecalc-v3';
const NAVIGATION_TIMEOUT_MS = 3000;
const ASSETS = ['/', '/manifest.json', '/calc.js', '/icons/icon-192.png', '/icons/icon-512.png', '/offline.html'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension:')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      let timer;
      try {
        const network = fetch(event.request).then(response => {
          if (response && response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone())).catch(() => {});
          return response;
        });
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Navigation timed out')), NAVIGATION_TIMEOUT_MS); });
        return await Promise.race([network, timeout]);
      } catch (_) {
        return (await caches.match(event.request)) || (await caches.match('/offline.html')) || (await caches.match('/')) || Response.error();
      } finally { clearTimeout(timer); }
    })());
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response && response.status === 200 && (event.request.url.startsWith(self.location.origin) || event.request.url.includes('fonts.googleapis.com') || event.request.url.includes('fonts.gstatic.com'))) {
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone())).catch(() => {});
    }
    return response;
  }).catch(() => Response.error())));
});
