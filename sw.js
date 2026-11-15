/* Watch Hub — service worker
   Cache-first for app assets, network-only for TMDB and Google Fonts. */

const VERSION = 'v3.3';
const CACHE = 'watch-hub-v3.3';

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

  if (isNetworkOnly(url)) return; // network-only: let the browser hit the network

  // cache-first for app assets; runtime-cache anything else same-origin (icons, etc.)
  event.respondWith(
    caches.match(event.request).then(function (hit) {
      if (hit) return hit;
      return fetch(event.request).then(function (response) {
        if (response && response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      });
    })
  );
});
