/* offline.js (2026-11-19): offline play and installing. Loaded by appbanner.js (index, play, chat, players, social,
   support, tourney), never inside a game's frame.
   - "Offline & device" panel (#offPanel, a [role=dialog] slide-out, so console.js keeps the focus in it and Back
     closes it): opened from the #offBtn button in the home page's header or index.html#offline (the installed app's
     "Offline games" shortcut). Sections: Games, Storage, Install, plus the ones appbridge.js adds (Controllers,
     Settings) through ArcadeOffline.addSection().
   - No download button (the owner's request, 2026-11-19): opening a game on play.html saves it for offline by
     itself, about 12 s after it loads, when the browser is idle (autoSave). Skipped with Data Saver on, on 2G, or
     when storage is over 80% full; at most 12 games / 300 MB, the least recently played is removed past that. A game
     that has updated (games.js `updated`) is saved again next time it's opened. Saving = the game's page and every
     file it names (scripts, pictures, music, three.js from the CDN) into the cache 'arcade-game-<id>'; the home and
     play pages with their scripts and every game's picture into 'arcade-shell-v1'. sw.js serves them when there's no
     internet. What's saved is listed in localStorage 'arcade-offline-games' { id: { t, bytes, files, url, title,
     thumb } }. The browser is asked to keep the storage (persist()). Online modes still need the internet.
   - Offline library: the Games section lists the saved games (Play / Remove); Storage shows each cache's size with
     Delete. Offline, the home page shows a pill with how many are ready; sw.js shows offline.html (a mini game + the
     same list) for pages that aren't saved. Krill Dive's practice prompts are all inside its page, so they're saved
     with it.
   - Back online: account.js has no 'online' hook, so this calls ArcadeAccount.sync('online') and shows "Synced".
   - Install: beforeinstallprompt where the browser has it, otherwise the steps (iPhone/iPad: Share > Add to Home
     Screen), and a desktop icon for one game (a .url / .webloc / .desktop file, or the app's own via appbridge.js).
   - Share target: sw.js keeps a shared photo/video in the 'arcade-share' cache and opens social.html?share=1; this
     hands the files to window.ArcadeShareToSocial (a one-line hook in social.html) once the account is ready.
   ArcadeOffline: { open(section), close(), download(id, onProgress), remove(id), downloaded(), canDownload(id),
     sizes(), cacheTrailer(), addSection(id, label, render), toast(title, text) }. */
(function () {
  if (window.ArcadeOffline) return;
  try { if (window.top !== window) return; } catch (e) { return; }
  var html = document.documentElement, ua = navigator.userAgent || '';
  var H = location.hostname, LOCAL = /^(localhost|127\.0\.0\.1)$/.test(H), DEV = /(^|\.)thearcade\.pages\.dev$/.test(H);
  var SELF = document.currentScript && document.currentScript.src || '';
  var ROOT = SELF ? SELF.replace(/[^\/]*$/, '') : new URL('.', location.href).href;
  var CACHES = 'caches' in window;
  var META = 'arcade-offline-games', SHELL = 'arcade-shell-v1', SHELL_META = 'arcade-offline-shell', PREFIX = 'arcade-game-', TRAILER = 'arcade-trailer-v1';
  var NO_OFFLINE = { 'poly-racer': 'Too big to download: it loads its cars and tracks as you play.' };
  var CDN = /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)\//;
  var EXT = 'js|mjs|css|png|jpe?g|webp|gif|svg|ico|mp3|ogg|wav|m4a|aac|json|woff2?|ttf|otf|glb|gltf|bin|mp4|webm|txt|wasm';
  var MAX_FILE = 25e6, MAX_GAME = 150e6, MAX_FILES = 300;
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    json: function (k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var games = function () { return window.GAMES || []; };
  var game = function (id) { return games().filter(function (g) { return g.id === id; })[0] || null; };
  var abs = function (p) { return new URL(p, ROOT).href; };
  var mb = function (b) { return b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB'; };
  var offline = function () { return navigator.onLine === false; };
  var standalone = function () { try { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true; } catch (e) { return false; } };
  var inApp = function () { return !!window.ARCADE_APP || html.classList.contains('arcade-app') || /TheArcadeApp\//.test(ua); };
  var iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';

  // the backup copy and downloads need sw.js; outage.js registers it on thearcade.pages.dev, this also does on localhost
  if ('serviceWorker' in navigator && (DEV || LOCAL)) {
    try { navigator.serviceWorker.register(DEV ? '/sw.js' : ROOT + 'sw.js', { scope: DEV ? '/' : ROOT }).catch(function () {}); } catch (e) {}
  }

  /* ---------- what's downloaded ---------- */
  function meta() { return ls.json(META, {}); }
  function setMeta(m) { ls.set(META, JSON.stringify(m)); }
  function downloaded() {
    var m = meta();
    return Object.keys(m).filter(function (id) { return game(id); }).map(function (id) { var g = game(id); return { id: id, title: g.title, thumb: g.thumb, path: g.path, t: m[id].t, bytes: m[id].bytes, files: m[id].files, stale: !!(g.updated && Date.parse(g.updated) > m[id].t) }; })
      .sort(function (a, b) { return a.title.localeCompare(b.title); });
  }
  function canDownload(id) { return CACHES && !!game(id) && !NO_OFFLINE[id]; }

  /* ---------- finding a page's files ---------- */
  // the page itself, then every file it names: src/href attributes, url(...) in its CSS and quoted paths in its code
  // (music, pictures, the import map's three.js). One level only: shared scripts aren't searched in turn.
  function crawl(pageUrl, opts) {
    opts = opts || {};
    return fetch(pageUrl, { cache: 'no-store', credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('Could not load ' + pageUrl + ' (' + r.status + ')');
      var keep = r.clone();
      return r.text().then(function (txt) {
        var found = {}, re = new RegExp('["\'`(]\\s*((?:https://[^"\'`\\s)<>]+|[A-Za-z0-9_./-]+)\\.(?:' + EXT + ')(?:\\?[A-Za-z0-9_=&.%-]*)?)\\s*["\'`)]', 'gi'), m;
        while ((m = re.exec(txt))) {
          var raw = m[1];
          if (/^\/\//.test(raw) || raw.indexOf('${') >= 0) continue;
          var u; try { u = new URL(raw, pageUrl); } catch (e) { continue; }
          u.hash = '';
          var same = u.origin === location.origin;
          if (!same && !(CDN.test(u.href) && /\.m?js(\?|$)/.test(u.pathname + u.search))) continue;
          if (same && opts.only && !opts.only.test(u.pathname)) continue;
          if (same && /\/app\//.test(u.pathname)) continue;
          found[u.href] = 1;
        }
        return { page: keep, urls: Object.keys(found).slice(0, MAX_FILES) };
      });
    });
  }
  // fetch each file and put it in the cache, a few at a time; missing files are skipped
  function fill(cache, urls, onFile) {
    var i = 0, bytes = 0, files = 0, done = 0;
    function one() {
      if (i >= urls.length) return Promise.resolve();
      var u = urls[i++], same = u.indexOf(location.origin) === 0;
      return fetch(u, { cache: 'no-cache', mode: same ? 'same-origin' : 'cors', credentials: same ? 'same-origin' : 'omit' }).then(function (r) {
        if (!r.ok) return;
        var len = +r.headers.get('content-length') || 0;
        if (len > MAX_FILE || bytes > MAX_GAME) return;
        return r.clone().blob().then(function (b) { if (b.size > MAX_FILE) return; bytes += b.size; files++; return cache.put(u, r); });
      }).catch(function () {}).then(function () { done++; if (onFile) onFile(done, urls.length, bytes); return one(); });
    }
    return Promise.all([one(), one(), one(), one()]).then(function () { return { bytes: bytes, files: files }; });
  }
  function putPage(cache, url, res) { return res.clone().blob().then(function (b) { return cache.put(url, res).then(function () { return b.size; }); }); }

  /* ---------- the home and play pages, for playing offline (refreshed at most every 12 hours) ---------- */
  function ensureShell(force) {
    var sm = ls.json(SHELL_META, {}), gjs = (document.querySelector('script[src*="games.js"]') || {}).src || '';
    if (!force && sm.t && Date.now() - sm.t < 12 * 3600e3 && sm.g === gjs) return Promise.resolve();
    return caches.open(SHELL).then(function (cache) {
      var assets = /\.(js|css|svg|png|jpe?g|webp|woff2?|webmanifest)$/i, extra = [abs('offline.html'), abs('manifest.webmanifest'), abs('icon-192.png'), abs('icon-512.png'), SELF];
      var bridge = document.querySelector('script[src*="appbridge.js"]'); if (bridge) extra.push(bridge.src);
      games().forEach(function (g) { if (g.thumb) extra.push(abs(g.thumb)); });
      return Promise.all([crawl(abs('index.html'), { only: assets }), crawl(abs('play.html'), { only: assets })]).then(function (r) {
        var urls = {};
        r.forEach(function (x) { x.urls.forEach(function (u) { urls[u] = 1; }); });
        extra.forEach(function (u) { if (u) urls[u] = 1; });
        var rootCopy = r[0].page.clone();
        return Promise.all([cache.put(ROOT, rootCopy), putPage(cache, abs('index.html'), r[0].page), putPage(cache, abs('play.html'), r[1].page)])
          .then(function () { return fill(cache, Object.keys(urls)); });
      }).then(function () { ls.set(SHELL_META, JSON.stringify({ t: Date.now(), g: gjs })); });
    });
  }

  /* ---------- download / remove ---------- */
  var queue = Promise.resolve(), busy = {};
  function download(id, onProgress) {
    var g = game(id);
    if (!g || !canDownload(id)) return Promise.reject(new Error(NO_OFFLINE[id] || 'This game can’t be downloaded here.'));
    if (busy[id]) return busy[id];
    var report = function (p, text) { if (onProgress) try { onProgress(p, text); } catch (e) {} };
    report(0, 'Waiting…');
    busy[id] = queue = queue.catch(function () {}).then(function () {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
      report(2, 'Getting the game page…');
      var url = abs(g.path), name = PREFIX + id;
      return crawl(url).then(function (c) {
        var urls = c.urls.filter(function (u) { return u !== url; });
        if (g.thumb) urls.push(abs(g.thumb));
        return caches.delete(name).then(function () { return caches.open(name); }).then(function (cache) {
          return putPage(cache, url, c.page).then(function (pageBytes) {
            return fill(cache, urls, function (d, n, b) { report(5 + Math.round(80 * d / Math.max(1, n)), d + ' of ' + n + ' files · ' + mb(b + pageBytes)); })
              .then(function (r) { return { bytes: r.bytes + pageBytes, files: r.files + 1 }; });
          });
        });
      }).then(function (r) {
        report(88, 'Saving the home and play pages…');
        return ensureShell().catch(function () {}).then(function () {
          var m = meta(); m[id] = { t: Date.now(), bytes: r.bytes, files: r.files, url: url, title: g.title, thumb: g.thumb ? abs(g.thumb) : '' }; setMeta(m);
          report(100, 'Ready to play offline · ' + mb(r.bytes));
          return m[id];
        });
      });
    });
    busy[id].then(function () { delete busy[id]; }, function () { delete busy[id]; });
    return busy[id];
  }
  function remove(id) {
    var m = meta(); delete m[id]; setMeta(m);
    return CACHES ? caches.delete(PREFIX + id).catch(function () {}) : Promise.resolve();
  }

  /* ---------- storage ---------- */
  function cacheBytes(name) {
    return caches.open(name).then(function (c) {
      return c.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) {
          return c.match(k).then(function (r) { if (!r) return 0; var l = +r.headers.get('content-length'); return l > 0 ? l : r.blob().then(function (b) { return b.size; }, function () { return 0; }); });
        })).then(function (s) { return { name: name, bytes: s.reduce(function (a, b) { return a + b; }, 0), files: ks.length }; });
      });
    }).catch(function () { return { name: name, bytes: 0, files: 0 }; });
  }
  function sizes() {
    if (!CACHES) return Promise.resolve([]);
    return caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return /^arcade-/.test(k); }).map(cacheBytes)); });
  }
  function label(name) {
    if (name.indexOf(PREFIX) === 0) { var g = game(name.slice(PREFIX.length)); return g ? g.title : name.slice(PREFIX.length); }
    return { 'arcade-offline-v1': 'Backup copy of pages you’ve opened', 'arcade-shell-v1': 'Home and game pages (for offline play)', 'arcade-share': 'Shared photo or video waiting to post', 'arcade-trailer-v1': 'Trailer pictures' }[name] || (/^arcade-sw-/.test(name) ? 'Offline page' : name);
  }
  function savesBytes() { var n = 0; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); n += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) {} return n; }

  /* ---------- trailer pictures for the apps' first launch (appbridge.js calls this once) ---------- */
  function cacheTrailer() {
    if (!CACHES) return Promise.resolve();
    var urls = {}, t = document.querySelector('script[src*="trailer.js"]');
    urls[t ? t.src : abs('trailer.js?v=1')] = 1;
    ['intro.js', 'intro3d.js'].forEach(function (f) { var s = document.querySelector('script[src*="' + f + '"]'); if (s) urls[s.src] = 1; });
    games().forEach(function (g) { if (g.thumb) urls[abs(g.thumb)] = 1; });
    var seen = {}; (window.NEWS || []).forEach(function (n) { if (n.game && n.imgs && n.imgs[0] && !seen[n.game]) { seen[n.game] = 1; urls[abs(n.imgs[0])] = 1; } });
    return caches.open(TRAILER).then(function (c) { return fill(c, Object.keys(urls)); }).catch(function () {});
  }

  /* ---------- look ---------- */
  function css() {
    if (document.getElementById('offCss')) return;
    var s = document.createElement('style'); s.id = 'offCss';
    s.textContent =
      '#offBtn{flex:none;display:inline-grid;place-items:center;width:36px;height:36px;margin-left:8px;border-radius:50%;border:1px solid var(--line,#ffffff22);background:rgba(255,255,255,.04);color:var(--text,#f4f4f5);cursor:pointer;position:relative;transition:border-color .15s,background .15s}' +
      '#offBtn:hover,#offBtn[aria-expanded=true]{border-color:var(--line-2,#ffffff33);background:rgba(255,255,255,.08)}#offBtn svg{width:19px;height:19px}' +
      '#offBtn .off-dot{position:absolute;top:3px;right:3px;width:8px;height:8px;border-radius:50%;background:var(--accent,#ff5a2c);box-shadow:0 0 0 2px #08080a}#offBtn .off-dot[hidden]{display:none}' +
      'html:not(.mob-phone) body:not(.player)>.top #offBtn{order:1;width:48px;height:48px;margin:0 0 10px;border-radius:14px}html:not(.mob-phone) body:not(.player)>.top #offBtn svg{width:21px;height:21px}' +
      '.mob-phone .top #offBtn{order:3;margin-left:0;width:32px;height:32px}.mob-phone .top #offBtn svg{width:16px;height:16px}' +
      '#offPanel{position:fixed;z-index:61;top:0;right:0;bottom:0;width:400px;max-width:100vw;display:flex;flex-direction:column;background:var(--bg-2,#0b0b0d);border-left:1px solid var(--line-2,#ffffff24);box-shadow:-30px 0 80px -20px rgba(0,0,0,.8);color:var(--text,#f4f4f5);font:14px/1.45 var(--font,system-ui);transform:translateX(105%);transition:transform .28s var(--ease,ease);padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}' +
      '#offPanel.open{transform:none}#offPanel[hidden]{display:none}' +
      '#offPanel .off-hd{display:flex;align-items:center;gap:10px;padding:14px 14px 10px 18px}#offPanel .off-ttl{font-weight:800;font-size:16px;margin:0 auto 0 0}' +
      '#offPanel .x{width:32px;height:32px;border-radius:8px;border:1px solid var(--line,#ffffff14);background:transparent;color:var(--muted,#a1a1aa);font:20px/1 system-ui;cursor:pointer}#offPanel .x:hover{color:var(--text,#fff)}' +
      '#offPanel .off-tabs{display:flex;gap:4px;padding:0 12px 10px;border-bottom:1px solid var(--line,#ffffff14);overflow-x:auto;scrollbar-width:none}' +
      '#offPanel .off-tabs button{flex:none;height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line,#ffffff14);background:transparent;color:var(--muted,#a1a1aa);font:600 13px var(--font,system-ui);cursor:pointer}' +
      '#offPanel .off-tabs button[aria-selected=true]{background:var(--text,#f4f4f5);color:#08080a;border-color:transparent}' +
      '#offPanel .off-body{flex:1;overflow-y:auto;padding:14px 16px 24px;overscroll-behavior:contain}' +
      '#offPanel h3{margin:18px 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim,#74747f)}#offPanel h3:first-child{margin-top:0}' +
      '#offPanel p{margin:0 0 10px;color:var(--muted,#a1a1aa)}#offPanel p b{color:var(--text,#fff)}' +
      '#offPanel .off-note{padding:10px 12px;border-radius:10px;background:rgba(255,178,36,.08);border:1px solid rgba(255,178,36,.25);color:var(--warn,#ffb224);margin-bottom:12px}' +
      '#offPanel .off-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line,#ffffff10)}' +
      '#offPanel .off-row img{width:52px;height:34px;border-radius:6px;object-fit:cover;background:var(--panel-2,#1a1a1f);flex:none}' +
      '#offPanel .off-row .off-i{flex:1;min-width:0}#offPanel .off-row b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#offPanel .off-row small{display:block;color:var(--dim,#74747f);font-size:12px}#offPanel .off-row small.up{color:var(--accent-2,#3ddc97)}' +
      '#offPanel progress{display:block;width:100%;height:6px;margin-top:4px;accent-color:var(--accent,#ff5a2c)}' +
      '#offPanel .ob{flex:none;height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--line-2,#ffffff24);background:transparent;color:var(--text,#fff);font:600 13px var(--font,system-ui);cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}' +
      '#offPanel .ob:hover{background:rgba(255,255,255,.07)}#offPanel .ob.go{background:var(--accent,#ff5a2c);border-color:transparent;color:var(--accent-ink,#160500)}#offPanel .ob.go:hover{background:var(--accent-hi,#ff6d43)}' +
      '#offPanel .ob.bad{color:var(--danger,#ff5d5d)}#offPanel .ob:disabled{opacity:.5;cursor:default}' +
      '#offPanel .off-bar{height:8px;border-radius:4px;background:var(--line,#ffffff14);overflow:hidden;margin:6px 0 4px}#offPanel .off-bar i{display:block;height:100%;background:var(--accent,#ff5a2c)}' +
      '#offPanel ol,#offPanel ul{margin:0 0 12px;padding-left:20px;color:var(--muted,#a1a1aa)}#offPanel li{margin:3px 0}' +
      '#offPanel select,#offPanel textarea{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--line-2,#ffffff24);background:var(--panel,#121215);color:var(--text,#fff);font:13px var(--font,system-ui)}' +
      '#offPanel textarea{font:12px/1.4 var(--mono,monospace);min-height:150px;resize:vertical}' +
      '#offPanel .off-acts{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px}#offPanel label.off-chk{display:flex;gap:10px;align-items:flex-start;margin:8px 0;color:var(--text,#fff);cursor:pointer}#offPanel label.off-chk input{margin-top:3px}' +
      '#offPill{position:fixed;z-index:55;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:8px 8px 8px 16px;border-radius:999px;background:#18181c;border:1px solid var(--line-2,#ffffff24);color:var(--text,#fff);font:600 13.5px var(--font,system-ui);box-shadow:0 20px 50px -10px rgba(0,0,0,.8);max-width:calc(100vw - 32px)}' +
      '#offPill button{height:30px;padding:0 14px;border-radius:999px;border:0;background:var(--accent,#ff5a2c);color:var(--accent-ink,#160500);font:700 13px var(--font,system-ui);cursor:pointer}' +
      '#offToast{position:fixed;z-index:80;left:50%;top:calc(16px + env(safe-area-inset-top));transform:translateX(-50%);padding:10px 16px;border-radius:12px;background:#18181c;border:1px solid var(--line-2,#ffffff24);color:var(--text,#fff);font:14px/1.35 var(--font,system-ui);box-shadow:0 20px 50px -10px rgba(0,0,0,.8);max-width:calc(100vw - 32px);transition:opacity .3s}' +
      '#offToast b{display:block}#offToast[hidden]{display:none}' +
      '@media (max-width:620px){#offPanel{width:100vw;border-left:0}}html.mob-phone #offPanel{width:100vw;border-left:0}' +
      'html.watch #offPill{display:none}';
    document.head.appendChild(s);
  }
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1 0 8"/><path d="M12 12v8M9 17l3 3 3-3"/></svg>';

  /* ---------- toast ---------- */
  var toastT = 0;
  function toast(title, text) {
    css();
    var t = document.getElementById('offToast');
    if (!t) { t = document.createElement('div'); t.id = 'offToast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
    t.innerHTML = '<b>' + esc(title) + '</b>' + (text ? '<span>' + esc(text) + '</span>' : '');
    t.hidden = false; t.style.opacity = '1';
    clearTimeout(toastT); toastT = setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { t.hidden = true; }, 320); }, 4200);
  }

  /* ---------- the panel ---------- */
  var sections = [], panel = null, cur = 'games', opener = null;
  function addSection(id, name, render, order) {
    sections = sections.filter(function (s) { return s.id !== id; });
    sections.push({ id: id, name: name, render: render, order: order == null ? 50 : order });
    sections.sort(function (a, b) { return a.order - b.order; });
    if (panel && !panel.hidden) paintTabs();
  }
  function build() {
    if (panel) return panel;
    css();
    panel = document.createElement('div'); panel.id = 'offPanel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'offTtl');
    panel.innerHTML = '<div class="off-hd"><h2 class="off-ttl" id="offTtl">Offline &amp; device</h2><button type="button" class="x" aria-label="Close">×</button></div><div class="off-tabs" role="tablist" aria-label="Sections"></div><div class="off-body" role="tabpanel" tabindex="-1"></div>';
    panel.querySelector('.x').onclick = close;
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    document.body.appendChild(panel);
    return panel;
  }
  function paintTabs() {
    var tabs = panel.querySelector('.off-tabs'); tabs.innerHTML = '';
    sections.forEach(function (s) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = s.name;
      b.setAttribute('aria-selected', s.id === cur ? 'true' : 'false'); b.onclick = function () { show(s.id); };
      tabs.appendChild(b);
    });
  }
  function show(id) {
    if (!sections.some(function (s) { return s.id === id; })) id = 'games';
    cur = id; paintTabs();
    var body = panel.querySelector('.off-body'), s = sections.filter(function (x) { return x.id === id; })[0];
    if (body._leave) { try { body._leave(); } catch (e) {} body._leave = null; }
    body.innerHTML = ''; body.scrollTop = 0;
    try { s.render(body); } catch (e) { body.textContent = 'Something went wrong here.'; }
  }
  function open(id) {
    build();
    opener = document.activeElement;
    panel.hidden = false; html.classList.add('off-open');
    requestAnimationFrame(function () { panel.classList.add('open'); });
    var b = document.getElementById('offBtn'); if (b) b.setAttribute('aria-expanded', 'true');
    show(id || cur);
    setTimeout(function () { var f = panel.querySelector('.off-tabs [aria-selected=true]'); if (f) f.focus(); }, 30);
  }
  function close() {
    if (!panel || panel.hidden) return;
    var body = panel.querySelector('.off-body'); if (body._leave) { try { body._leave(); } catch (e) {} body._leave = null; }
    panel.classList.remove('open'); html.classList.remove('off-open');
    setTimeout(function () { panel.hidden = true; }, 280);
    var b = document.getElementById('offBtn'); if (b) b.setAttribute('aria-expanded', 'false');
    if (opener && opener.focus) try { opener.focus(); } catch (e) {}
    if (location.hash === '#offline') try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
  function el(tag, cls, h) { var e = document.createElement(tag); if (cls) e.className = cls; if (h != null) e.innerHTML = h; return e; }
  function btn(text, cls, fn) { var b = el('button', 'ob' + (cls ? ' ' + cls : ''), esc(text)); b.type = 'button'; if (fn) b.onclick = fn; return b; }
  function playUrl(id) { return ls.json(SHELL_META, {}).t ? abs('play.html?game=' + encodeURIComponent(id)) : abs(game(id).path); }

  /* Games: the games you've played that are saved for offline (Play / Remove). Saving is automatic (autoSave). */
  function renderGames(body) {
    if (!CACHES) { body.appendChild(el('p', '', 'This browser can’t keep games for offline play. Try Chrome, Edge, Firefox or Safari.')); return; }
    var off = offline(), have = downloaded();
    if (off) body.appendChild(el('div', 'off-note', '<b>You’re offline.</b> These games are saved on this device and ready to play.'));
    else body.appendChild(el('p', '', 'Games you play are saved on this device by themselves, so they open even without internet. Single-player works offline; online modes, leaderboards and accounts need a connection. Your progress syncs when you’re back online.'));
    body.appendChild(el('h3', '', 'Ready offline (' + have.length + ')'));
    if (!have.length) body.appendChild(el('p', '', 'Nothing saved yet. Play a game while you’re online and it will be here next time.'));
    have.forEach(function (d) {
      var row = el('div', 'off-row'), info = el('div', 'off-i');
      row.appendChild(thumbImg(d.thumb));
      info.innerHTML = '<b>' + esc(d.title) + '</b><small>' + mb(d.bytes || 0) + ' · saved ' + esc(new Date(d.t).toLocaleDateString()) + (d.stale && !off ? ' · updates next time you play it' : '') + '</small>';
      if (d.id === 'krill-dive') info.appendChild(el('small', '', 'Every practice prompt is saved too. The daily board and “% of divers” need internet.'));
      row.appendChild(info);
      var play = el('a', 'ob go', 'Play'); play.href = playUrl(d.id); row.appendChild(play);
      row.appendChild(btn('Remove', 'bad', function () { remove(d.id).then(function () { show('games'); toast('Removed', d.title + ' is no longer kept for offline. Playing it again saves it again.'); }); }));
      body.appendChild(row);
    });
  }
  function thumbImg(src) { var i = el('img'); i.alt = ''; i.loading = 'lazy'; if (src) i.src = abs(src); return i; }

  /* Storage: the browser's estimate, then each cache with its size and Delete */
  function renderStorage(body) {
    if (!CACHES) { body.appendChild(el('p', '', 'This browser doesn’t share storage details.')); return; }
    var top = el('div'); body.appendChild(top);
    top.appendChild(el('p', '', 'Working it out…'));
    var list = el('div'); body.appendChild(list);
    var est = navigator.storage && navigator.storage.estimate ? navigator.storage.estimate().catch(function () { return null; }) : Promise.resolve(null);
    var per = navigator.storage && navigator.storage.persisted ? navigator.storage.persisted().catch(function () { return false; }) : Promise.resolve(false);
    Promise.all([est, sizes(), per]).then(function (r) {
      var e = r[0], all = r[1].sort(function (a, b) { return b.bytes - a.bytes; }), total = all.reduce(function (a, b) { return a + b.bytes; }, 0);
      top.innerHTML = '';
      if (e && e.quota) {
        top.appendChild(el('p', '', 'The Arcade uses <b>' + mb(e.usage || 0) + '</b> of the ' + mb(e.quota) + ' this browser allows it.'));
        var bar = el('div', 'off-bar', '<i></i>'); bar.firstChild.style.width = Math.min(100, Math.max(1, 100 * (e.usage || 0) / e.quota)) + '%'; top.appendChild(bar);
      }
      top.appendChild(el('p', '', 'Offline files: <b>' + mb(total) + '</b>. ' + (r[2] ? 'The browser has agreed to keep them.' : 'The browser may clear them if the device runs low on space.')));
      top.appendChild(el('p', '', 'Game saves on this device: about <b>' + mb(savesBytes()) + '</b> (not deleted here; they sync with your account).'));
      list.appendChild(el('h3', '', 'What’s stored'));
      if (!all.length) list.appendChild(el('p', '', 'Nothing yet.'));
      all.forEach(function (c) {
        var row = el('div', 'off-row'), info = el('div', 'off-i');
        info.innerHTML = '<b>' + esc(label(c.name)) + '</b><small>' + mb(c.bytes) + ' · ' + c.files + ' file' + (c.files === 1 ? '' : 's') + '</small>';
        row.appendChild(info);
        if (!/^arcade-sw-/.test(c.name)) row.appendChild(btn('Delete', 'bad', function () {
          var p = c.name.indexOf(PREFIX) === 0 ? remove(c.name.slice(PREFIX.length)) : caches.delete(c.name).then(function () { if (c.name === SHELL) ls.del(SHELL_META); });
          p.then(function () { show('storage'); });
        }));
        list.appendChild(row);
      });
      if (all.length > 1) {
        var acts = el('div', 'off-acts');
        acts.appendChild(btn('Delete all offline files', 'bad', function () {
          if (!confirm('Delete every saved game and the backup copy? Your game saves stay.')) return;
          Promise.all(all.filter(function (c) { return !/^arcade-sw-/.test(c.name); }).map(function (c) { return caches.delete(c.name); })).then(function () { setMeta({}); ls.del(SHELL_META); show('storage'); });
        }));
        list.appendChild(acts);
      }
    });
  }

  /* Install: the browser's own prompt where it has one, otherwise the steps; and a desktop icon for one game */
  var deferred = null;
  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; dot(); if (panel && !panel.hidden && cur === 'install') show('install'); });
  addEventListener('appinstalled', function () { deferred = null; dot(); toast('Installed', 'The Arcade is on your device. Open it like any other app.'); });
  function install() {
    if (!deferred) return Promise.resolve(false);
    var d = deferred; deferred = null; d.prompt();
    return (d.userChoice || Promise.resolve({})).then(function (c) { dot(); return c && c.outcome === 'accepted'; });
  }
  function renderInstall(body) {
    if (inApp() || standalone()) {
      body.appendChild(el('h3', '', 'Installed'));
      body.appendChild(el('p', '', inApp() ? 'You’re using The Arcade app.' : 'You’re using The Arcade as an installed app.'));
    } else {
      body.appendChild(el('h3', '', 'Install The Arcade'));
      body.appendChild(el('p', '', 'Put The Arcade on your home screen or desktop. It opens in its own window, and games you’ve played work offline.'));
      if (deferred) { var acts = el('div', 'off-acts'); acts.appendChild(btn('Install', 'go', function () { install().then(function (ok) { show('install'); if (ok) toast('Installing…', 'The Arcade will appear with your apps.'); }); })); body.appendChild(acts); }
      else if (iOS) body.appendChild(el('ol', '', '<li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (the square with an arrow).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>'));
      else if (/Firefox\//.test(ua)) body.appendChild(el('p', '', 'Firefox can’t install sites as apps on computers. Use Chrome or Edge, or get <a href="' + abs('app/') + '" style="color:inherit">The Arcade app</a>.'));
      else if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) body.appendChild(el('p', '', 'In Safari on a Mac: <b>File &gt; Add to Dock</b> (or the Share button &gt; Add to Dock).'));
      else body.appendChild(el('p', '', 'In Chrome or Edge, use the install icon at the right end of the address bar, or the browser’s menu &gt; <b>Install The Arcade</b>. If you don’t see it, reload the page once.'));
    }
    // a desktop icon for one game
    body.appendChild(el('h3', '', 'Desktop icon for one game'));
    var B = window.ArcadeBridge, nativeSc = B && B.can && B.can('shortcut');
    body.appendChild(el('p', '', nativeSc ? 'Pick a game and the app puts an icon for it on your desktop.' : 'Pick a game to get an icon that opens it straight away. Double-click the file, or drag it to your desktop.'));
    var sel = el('select'); sel.setAttribute('aria-label', 'Game');
    games().forEach(function (g) { sel.appendChild(new Option(g.title, g.id)); });
    var pid = new URLSearchParams(location.search).get('game'); if (pid && game(pid)) sel.value = pid;
    body.appendChild(sel);
    var acts2 = el('div', 'off-acts');
    acts2.appendChild(btn(nativeSc ? 'Add to desktop' : 'Get icon file', 'go', function () {
      var g = game(sel.value); if (!g) return;
      if (nativeSc) B.createShortcut(g).then(function () { toast('Added', g.title + ' is on your desktop.'); }, function () { toast('Couldn’t add it', 'Try Get icon file instead.'); shortcutFile(g); });
      else shortcutFile(g);
    }));
    acts2.appendChild(btn('Copy link', '', function () {
      var u = abs('play.html?game=' + encodeURIComponent(sel.value));
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('Link copied', u); }, function () { prompt('Copy this link:', u); });
    }));
    body.appendChild(acts2);
    if (!nativeSc) body.appendChild(el('p', '', iOS ? 'On iPhone and iPad: open the game, then Share &gt; Add to Home Screen.' : 'In Chrome you can also open the game, then menu &gt; Cast, save and share &gt; Create shortcut (tick “Open as window”).'));
  }
  function shortcutFile(g) {
    var u = abs('play.html?game=' + encodeURIComponent(g.id)), name = g.title.replace(/[\\\/:*?"<>|]/g, ''), mac = /Mac OS X|Macintosh/.test(ua) && !iOS, linux = /Linux|CrOS/.test(ua) && !/Android/.test(ua), body, ext, type;
    if (mac) { ext = '.webloc'; type = 'application/xml'; body = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>URL</key><string>' + esc(u) + '</string></dict></plist>\n'; }
    else if (linux) { ext = '.desktop'; type = 'application/x-desktop'; body = '[Desktop Entry]\nType=Link\nName=' + name + '\nURL=' + u + '\nIcon=applications-games\n'; }
    else { ext = '.url'; type = 'application/internet-shortcut'; body = '[InternetShortcut]\r\nURL=' + u + '\r\n'; }
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: type })); a.download = name + ext;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  addSection('games', 'Games', renderGames, 10);
  addSection('storage', 'Storage', renderStorage, 20);
  addSection('install', 'Install', renderInstall, 30);

  /* ---------- buttons on the pages ---------- */
  function dot() { var d = document.querySelector('#offBtn .off-dot'); if (d) d.hidden = !(deferred && !standalone()); }
  function headerButton() {
    if (window.ARCADE_WATCH || page !== 'index' || document.getElementById('offBtn')) return;
    var top = document.querySelector('header.top'), search = document.getElementById('searchBtn'); if (!top) return;
    css();
    var b = document.createElement('button'); b.id = 'offBtn'; b.type = 'button';
    b.setAttribute('aria-label', 'Offline games, storage and installing'); b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false'); b.title = 'Offline games and installing';
    b.innerHTML = ICON + '<span class="off-dot" hidden></span>';
    b.onclick = function () { open(offline() ? 'games' : deferred ? 'install' : cur); };
    if (search && search.parentNode === top) top.insertBefore(b, search.nextSibling); else top.appendChild(b);
    dot();
  }
  /* play.html: the game you open is saved for offline by itself, in the background (no button). Skipped with Data Saver
     on, on a metered/2G connection, or when the browser's storage is over 80% full. At most MAX_SAVED games and
     MAX_TOTAL bytes: past that the least recently played saved game is removed. Saved again when the game has updated. */
  var MAX_SAVED = 12, MAX_TOTAL = 300e6;
  function lastPlayed(id) { var p = window.Arcade && Arcade.played ? Arcade.played() : {}; return Date.parse(p[id]) || (meta()[id] || {}).t || 0; }
  function evict(keep) {
    var m = meta(), ids = Object.keys(m).filter(function (id) { return id !== keep; }).sort(function (a, b) { return lastPlayed(a) - lastPlayed(b); });
    var total = Object.keys(m).reduce(function (n, id) { return n + (m[id].bytes || 0); }, 0), drop = [];
    while (ids.length && (ids.length + 1 > MAX_SAVED || total > MAX_TOTAL)) { var id = ids.shift(); total -= m[id].bytes || 0; drop.push(id); }
    return Promise.all(drop.map(remove));
  }
  function roomToSave() {
    var c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return Promise.resolve(false);
    if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(true);
    return navigator.storage.estimate().then(function (e) { return !e.quota || (e.usage || 0) / e.quota < 0.8; }, function () { return true; });
  }
  function autoSave() {
    if (page !== 'play' || offline()) return;
    var id = new URLSearchParams(location.search).get('game'), g = game(id);
    if (!g || !canDownload(id)) return;
    var m = meta()[id];
    if (m && !(g.updated && Date.parse(g.updated) > m.t)) return; // already saved and up to date
    setTimeout(function () {
      if (offline()) return;
      var idle = window.requestIdleCallback || function (f) { setTimeout(f, 1); };
      idle(function () {
        roomToSave().then(function (ok) {
          if (!ok) return;
          return download(id).then(function () { return evict(id); });
        }).catch(function () {}); // quietly: try again next time the game is opened
      }, { timeout: 10000 });
    }, 12000); // after the game has loaded and settled
  }
  // offline on the home page: a pill that says how many games are ready
  function pill() {
    var p = document.getElementById('offPill');
    if (!offline() || page !== 'index') { if (p) p.remove(); return; }
    if (p) return;
    css();
    var n = downloaded().length;
    p = document.createElement('div'); p.id = 'offPill'; p.setAttribute('role', 'status');
    p.innerHTML = '<span>You’re offline · ' + (n ? n + ' game' + (n === 1 ? '' : 's') + ' ready' : 'no games saved yet') + '</span>';
    var b = document.createElement('button'); b.type = 'button'; b.textContent = n ? 'Play offline' : 'See offline'; b.onclick = function () { open('games'); };
    p.appendChild(b); document.body.appendChild(p);
  }

  /* ---------- going offline / back online (479) ---------- */
  var wentOff = offline(); // a page opened while offline counts too
  addEventListener('offline', function () {
    wentOff = true; pill();
    toast('You’re offline', downloaded().length ? 'Games you’ve played still work. Progress syncs when you’re back.' : 'Progress is kept on this device and syncs when you’re back.');
    if (panel && !panel.hidden && cur === 'games') show('games');
  });
  addEventListener('online', function () {
    pill();
    if (panel && !panel.hidden && cur === 'games') show('games');
    if (!wentOff) return; wentOff = false;
    setTimeout(function () {
      var A = window.ArcadeAccount;
      if (!A || !A.kind || A.kind() !== 'online' || !A.sync) { toast('Back online'); return; }
      A.sync('online').then(function (r) { toast(r ? 'Synced' : 'Back online', r ? 'Your progress from offline is saved to your account.' : 'Couldn’t sync yet; it will try again soon.'); }, function () {});
    }, 1500);
  });

  /* ---------- a photo or video shared to the installed site (484) ---------- */
  function takeShare() {
    if (page !== 'social' || !/[?&]share=1/.test(location.search) || !CACHES) return;
    try { history.replaceState(null, '', location.pathname + location.search.replace(/[?&]share=1/, '').replace(/^&/, '?') + location.hash); } catch (e) {}
    caches.open('arcade-share').then(function (c) {
      return c.match(abs('__share__/meta')).then(function (r) { return r ? r.json() : null; }).then(function (m) {
        if (!m) return;
        return Promise.all(Array.apply(null, Array(m.n || 0)).map(function (_, i) {
          return c.match(abs('__share__/' + i)).then(function (r) { return r ? r.blob() : null; }).then(function (b) { return b ? new File([b], m.names[i] || 'shared', { type: m.types[i] || b.type }) : null; });
        })).then(function (files) {
          files = files.filter(Boolean);
          return caches.delete('arcade-share').then(function () {
            var text = [m.title, m.text, m.url].filter(Boolean).join(' ').slice(0, 80);
            var go = function () {
              if (window.ArcadeShareToSocial) window.ArcadeShareToSocial(files, text);
              else toast('Couldn’t open the post maker', 'Press Create and pick the file again.');
            };
            if (window.ArcadeAccount && ArcadeAccount.ready) ArcadeAccount.ready().then(function () { setTimeout(go, 300); }); else go();
          });
        });
      });
    }).catch(function () {});
  }

  window.ArcadeOffline = {
    open: open, close: close, download: download, remove: remove, downloaded: downloaded, canDownload: canDownload,
    sizes: sizes, cacheTrailer: cacheTrailer, addSection: addSection, toast: toast, install: install,
    installable: function () { return !!deferred; }, ensureShell: ensureShell
  };
  function boot() {
    headerButton(); autoSave(); pill(); takeShare();
    if (location.hash === '#offline') open('games');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  addEventListener('hashchange', function () { if (location.hash === '#offline') open('games'); });
})();
