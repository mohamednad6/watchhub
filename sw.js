/* Watch Hub — service worker
   Network-first for app assets so a deploy is picked up on the next load;
   the cache is only a fallback for offline use.
   Network-only for TMDB and Google Fonts. */

const VERSION = 'v4.0';
const CACHE = 'watch-hub-v4.0';

const ASSETS = [
  'index.html',
  'movies.html',
  'series.html',
  'anime.html',
  'watchlist.html',
  'style.css',
  'common.js',
  'page.js',
  'nav.js',
  'auth.js',
  'manifest.json'
];

const NETWORK_ONLY = [
  '.themoviedb.org',
  'image.tmdb.org',
  'fonts.gstatic.com',
  'fonts.googleapis.com'
];

function isNetworkOnly(url) {
  return NETWORK_ONLY.some(function (host) {
    return url.hostname === host || url.hostname.endsWith(host);
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .catch(function () {})
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          if (key !== CACHE) return caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  /* third-party APIs and fonts: always straight to the network */
  if (isNetworkOnly(url)) return;

  /* network-first: fresh files when online, cache only when offline */
  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        if (response && response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      })
      .catch(function () {
        return caches.match(event.request).then(function (hit) {
          if (hit) return hit;
          if (event.request.mode === 'navigate') return caches.match('index.html');
        });
      })
  );
});
