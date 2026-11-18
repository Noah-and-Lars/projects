/* sw.js (2026-11-15): a backup copy of the pages you've opened, used ONLY if Cloudflare Pages can't be reached.
   Network first, always: while the site is up every request goes to the network as normal (updates show
   straight away); each good same-site answer is copied into the cache. If the network fails or Cloudflare
   answers with a 5xx error, the saved copy is served instead, so the site (and offline games) still open and
   outage.js can show the "servers are down" banner. Registered by outage.js on thearcade.pages.dev only. */
var CACHE = 'arcade-offline-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request, url;
  try { url = new URL(req.url); } catch (x) { return; }
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range')) return;
  if (url.searchParams.has('probe')) return; // outage.js's check: always the real network
  e.respondWith(fetch(req).then(function (r) {
    if (r.status >= 500) return fromCache(req).then(function (c) { return c || r; });
    if (r.ok && r.type === 'basic' && !(+r.headers.get('content-length') > 15e6)) {
      var copy = r.clone();
      caches.open(CACHE).then(function (c) { return c.put(req, copy); }).catch(function () {});
    }
    return r;
  }, function (err) {
    return fromCache(req).then(function (c) { if (c) return c; throw err; });
  }));
});
function fromCache(req) {
  return caches.open(CACHE).then(function (c) {
    return c.match(req).then(function (m) { return m || c.match(req, { ignoreSearch: true }); });
  }).catch(function () { return null; });
}
