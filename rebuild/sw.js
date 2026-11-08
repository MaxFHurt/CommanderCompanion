// Service worker: works offline after the first launch.
//
// - The app's own files go to the network first (with revalidation, so a new release is picked up on the next load);
//   the cache is the offline fallback. Every file in precache.json (written by tools/stamp.mjs) is cached as the
//   service worker installs, so screens never opened before still work offline.
// - Card images, symbols, fonts and the PeerJS / Tesseract scripts are kept once seen (cache first).
// - Card data and deck-site lookups (Scryfall, EDHREC, Commander Spellbook) go to the network first; the last answer
//   is kept for offline use. Saved decks keep their own card data on the device (card-cache.js).

const CACHE = 'commander-companion-v85';
const ASSETS = 'commander-companion-assets-v1';   // kept across releases
const DATA = 'commander-companion-data-v1';
const ASSET_HOSTS = /(^|\.)(cards\.scryfall\.io|svgs\.scryfall\.io|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdn\.jsdelivr\.net)$/;
const DATA_HOSTS = /(^|\.)(api\.scryfall\.com|json\.edhrec\.com|json\.commanderspellbook\.com)$/;
const MAX_ASSETS = 4000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      const list = await (await fetch(new URL('precache.json', self.registration.scope), { cache: 'no-cache' })).json();
      // A few at a time; a file that fails is fetched again the next time it is used.
      for (let i = 0; i < list.length; i += 12)
        await Promise.all(list.slice(i, i + 12).map(async path => { try { const r = await fetch(new URL(path, self.registration.scope), { cache: 'no-cache' }); if (r.ok) await cache.put(new URL(path, self.registration.scope), r); } catch { /* offline now */ } }));
    } catch { /* no list: files are cached as they are used */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => ![CACHE, ASSETS, DATA].includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
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
    return;
  }
  if (ASSET_HOSTS.test(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const cached = await cache.match(request.url);
      if (cached) return cached;
      // Fetched with CORS (Scryfall images allow it) so the cached copy is a normal response, not an opaque one.
      let fresh;
      try { fresh = await fetch(request.url, { mode: 'cors', credentials: 'omit' }); } catch { fresh = await fetch(request); }
      if (fresh.ok) { cache.put(request.url, fresh.clone()); if (Math.random() < 0.02) trim(cache, MAX_ASSETS); }
      return fresh;
    })());
    return;
  }
  if (DATA_HOSTS.test(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA);
      try {
        const fresh = await fetch(request);
        if (fresh.ok) { cache.put(request, fresh.clone()); if (Math.random() < 0.02) trim(cache, MAX_ASSETS); }
        return fresh;
      } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
      }
    })());
  }
});
