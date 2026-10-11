// Service worker: network first, cache as offline fallback.
//
// Every request for the app's own files goes to the network with revalidation, so a new
// release is picked up on the next load — no per-file cache tokens to maintain. The cache
// is only used when the device is offline.

const CACHE = 'commander-companion-v23';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // card data and images go straight to the network
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(request, { cache: 'no-cache' });
      if (fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    } catch (error) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      throw error;
    }
  })());
});
