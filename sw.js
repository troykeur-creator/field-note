/* Field Note — service worker (drop next to index.html on GitHub Pages) */
const SHELL_CACHE = 'fieldnote-shell-v4';
const IMG_CACHE = 'fieldnote-img-v4';
const SHELL = ['./', './index.html'];
const KEEP = [SHELL_CACHE, IMG_CACHE];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => KEEP.indexOf(k) < 0).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

/* Cache iNaturalist photos and map tiles so a find's pictures are there even with no signal.
   Cross-origin images load no-cors and return opaque (status 0); cache those too. */
function cacheImage(req) {
  return fetch(req).then((resp) => {
    if (resp && (resp.ok || resp.type === 'opaque')) {
      const copy = resp.clone();
      caches.open(IMG_CACHE).then((c) => {
        c.put(req, copy).then(() => c.keys().then((ks) => { if (ks.length > 350) c.delete(ks[0]); })).catch(() => {});
      });
    }
    return resp;
  });
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const host = url.hostname;

  // Never intercept JSON APIs — identification and species/observation lookups must hit the network fresh.
  if (host.indexOf('api.anthropic.com') >= 0 || host.indexOf('api.inaturalist.org') >= 0 || host.indexOf('bigdatacloud') >= 0) return;

  // Actual image hosts / image files only (NOT the iNaturalist JSON API): cache-first, refresh in background.
  const isImg = /static\.inaturalist\.org|inaturalist-open-data|tile\.openstreetmap/.test(host)
             || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(url.pathname);
  if (isImg) {
    e.respondWith(caches.match(e.request).then((hit) => hit || cacheImage(e.request).catch(() => hit)));
    return;
  }

  // App shell (same origin): cache-first for an instant launch, refreshed in the background.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        const net = fetch(e.request).then((resp) => {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(e.request, copy));
          return resp;
        }).catch(() => hit || caches.match('./index.html'));
        return hit || net;
      })
    );
  }
});
