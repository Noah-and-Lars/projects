/* sw.js (2026-11-15): a backup copy of the pages you've opened, used ONLY if Cloudflare Pages can't be reached.
   Network first, always: while the site is up every request goes to the network as normal (updates show
   straight away); each good same-site answer is copied into the cache. If the network fails or Cloudflare
   answers with a 5xx error, the saved copy is served instead, so the site (and offline games) still open and
   outage.js can show the "servers are down" banner. Registered by outage.js on thearcade.pages.dev only
   (offline.js also registers it there, and on localhost for tests).
   v2 (2026-11-19, offline play): the saved copy is looked up in every cache the site keeps, so games saved
   (offline.js saves each game you play: caches 'arcade-game-<id>' and 'arcade-shell-v1') open without
   internet. When the browser says it's offline, the saved copy is tried first (no waiting for a network that
   isn't there). A page that isn't saved anywhere gets offline.html (the "You're offline" page with a mini game).
   Three.js and similar files from cdn.jsdelivr.net / unpkg.com / cdnjs.cloudflare.com: still network first; a
   downloaded copy is used only when the network fails. Share target (manifest.webmanifest): a photo or video
   shared to the installed site is POSTed to ./share-target; it's kept in the 'arcade-share' cache and the
   player is sent to social.html?share=1, where offline.js hands it to the post composer.
   Never deletes the backup copy or saved games; only old 'arcade-sw-*' caches of this file. */
var CACHE = 'arcade-offline-v1';   // the passive backup copy (unchanged since v1)
var OWN = 'arcade-sw-v2';          // this file's own small cache (offline.html)
var SHARE = 'arcade-share';
var CDN = /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)\//;
function scoped(p) { return new URL(p, self.registration ? self.registration.scope : location.href).href; }

self.addEventListener('install', function (e) {
  self.skipWaiting();
  // never let this fail the install: without offline.html the site still works exactly as before
  e.waitUntil(caches.open(OWN).then(function (c) { return c.add(new Request(scoped('offline.html'), { cache: 'reload' })); }).catch(function () {}));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return /^arcade-sw-/.test(k) && k !== OWN; }).map(function (k) { return caches.delete(k); }));
  }).catch(function () {}).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url;
  try { url = new URL(req.url); } catch (x) { return; }
  // a screenshot or video shared to the installed site (manifest share_target)
  if (req.method === 'POST' && url.origin === location.origin && /\/share-target\/?$/.test(url.pathname)) { e.respondWith(shared(req)); return; }
  if (req.method !== 'GET' || req.headers.has('range')) return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  if (url.origin !== location.origin) {
    // libraries a downloaded game needs (e.g. Cube Assault's three.js): the downloaded copy only if the network fails
    if (CDN.test(req.url)) e.respondWith(fetch(req).catch(function (err) { return caches.match(req).then(function (m) { if (m) return m; throw err; }); }));
    return;
  }
  if (url.searchParams.has('probe')) return; // outage.js's check: always the real network
  if (self.navigator && self.navigator.onLine === false) { // offline: the saved copy straight away, else try anyway
    e.respondWith(fromCache(req).then(function (c) { return c || fetch(req).catch(function (err) { return fallback(req, err); }); }));
    return;
  }
  e.respondWith(fetch(req).then(function (r) {
    if (r.status >= 500) return fromCache(req).then(function (c) { return c || r; });
    if (r.ok && r.type === 'basic' && !(+r.headers.get('content-length') > 15e6)) {
      var copy = r.clone();
      caches.open(CACHE).then(function (c) { return c.put(req, copy); }).catch(function () {});
    }
    return r;
  }, function (err) {
    return fromCache(req).then(function (c) { return c || fallback(req, err); });
  }));
});
// every cache the site keeps (the backup copy is made first, so its newer copy wins), then without the ?v=N part
function fromCache(req) {
  return caches.match(req).then(function (m) { return m || caches.match(req, { ignoreSearch: true }); })
    .then(function (m) { return m && !/__share__\//.test(m.url || '') ? m : null; }).catch(function () { return null; });
}
// nothing saved: a page gets the offline page, anything else fails as it would have
function fallback(req, err) {
  if (req.mode !== 'navigate') throw err;
  return caches.match(scoped('offline.html'), { ignoreSearch: true }).then(function (m) { if (m) return m; throw err; });
}
function shared(req) {
  var to = scoped('social.html?share=1');
  return req.formData().then(function (f) {
    var files = f.getAll('media').filter(function (x) { return x && typeof x !== 'string' && x.size > 0; }).slice(0, 5);
    var meta = { t: Date.now(), title: String(f.get('title') || '').slice(0, 200), text: String(f.get('text') || '').slice(0, 500), url: String(f.get('url') || '').slice(0, 500), n: files.length, names: [], types: [] };
    return caches.open(SHARE).then(function (c) {
      return c.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return c.delete(k); })); }).then(function () {
        return Promise.all(files.map(function (file, i) {
          meta.names[i] = String(file.name || 'shared').slice(0, 120); meta.types[i] = file.type || '';
          return c.put(scoped('__share__/' + i), new Response(file, { headers: { 'content-type': file.type || 'application/octet-stream' } }));
        }));
      }).then(function () { return c.put(scoped('__share__/meta'), new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } })); });
    });
  }).catch(function () {}).then(function () { return Response.redirect(to, 303); });
}
// 2026-11-19: notify.js shows browser alerts through this registration on phones; a tap opens (or focuses) its page
self.addEventListener('notificationclick', function (e) {
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.notification.close();
  try { if (new URL(url).origin !== location.origin) url = '/'; } catch (x) { url = '/'; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if (list[i].url === url && 'focus' in list[i]) return list[i].focus();
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
