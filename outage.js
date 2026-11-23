/* outage.js (2026-11-15): what the site does if Cloudflare goes down.
   Accounts, chat, Social and online play all run on the arcade-realtime Worker, and the site itself is on
   Cloudflare Pages. This file checks both. Only when they really can't be reached (and the player's own internet
   works, checked against a non-Cloudflare address) does it:
     - show a red banner on every page and a pop-up once per outage,
     - straight away back up all account data and progress on this device (localStorage + an IndexedDB copy),
       again every 20 s and when the page closes, so nothing made during the outage is lost,
     - stop logging out from clearing this device (account.js asks ArcadeOutage.down()),
   and when Cloudflare is back it hides the banner, says so, and syncs everything to the account.
   Nothing shows while Cloudflare is up. Test on localhost only: localStorage['arcade-outage-test']='1'.
   It also registers sw.js on thearcade.pages.dev, which keeps a copy of the pages you've opened so the site
   still opens if Cloudflare Pages itself is down. */
(function () {
  if (window.ArcadeOutage) return;
  var H = location.hostname, LOCAL = /^(localhost|127\.0\.0\.1)$/.test(H);
  var OFFICIAL = H === 'thearcade.pages.dev' || /\.thearcade\.pages\.dev$/.test(H) || H === 'noah-and-lars.github.io' || H === 'playthearcade.github.io';
  var TEST = false; try { TEST = LOCAL && localStorage.getItem('arcade-outage-test') === '1'; } catch (e) {}
  var inFrame = false; try { inFrame = window.top !== window && !!window.top.ArcadeOutage; } catch (e) {}
  var WORKER = 'https://arcade-realtime.arcade-realtime.workers.dev/notice';
  var BKEY = 'arcade-outage-backup', FKEY = 'arcade-outage-flag', PKEY = 'arcade-outage-popup';
  var down = false, limit = false, fails = 0, oks = 0, timer = 0, saveT = 0, listeners = [];

  // the offline copy of the site (only on the .dev site, the one that stays)
  if ('serviceWorker' in navigator && /thearcade\.pages\.dev$/.test(H) && !inFrame) {
    try { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {}); } catch (e) {}
  }

  function T(ms, p) { return Promise.race([p, new Promise(function (_, no) { setTimeout(function () { no(new Error('timeout')); }, ms); })]); }
  // true = reachable, false = not
  function workerUp() {
    // 2026-11-15: /notice also says if the Durable Objects can't be used (de 2 = the plan's Durable Objects limit)
    return T(8000, fetch(WORKER + '?t=' + Date.now(), { cache: 'no-store' })).then(function (r) {
      if (r.status >= 500) return false;
      return r.json().then(function (j) { limit = !!(j && j.de === 2); return !(j && j.de); }, function () { return true; });
    }, function () { return false; });
  }
  function pagesUp() {
    if (!/thearcade\.pages\.dev$/.test(H)) return Promise.resolve(true); // GitHub copy isn't on Cloudflare Pages
    // ?probe skips sw.js, so this is the real network
    return T(8000, fetch('/outage.js?probe=' + Date.now(), { cache: 'no-store' })).then(function (r) { return r.status < 500; }, function () { return false; });
  }
  function internetUp() { // a non-Cloudflare address: if this fails too, it's the player's own connection, not Cloudflare
    if (navigator.onLine === false) return Promise.resolve(false);
    return T(8000, fetch('https://www.gstatic.com/generate_204?t=' + Date.now(), { mode: 'no-cors', cache: 'no-store' })).then(function () { return true; }, function () { return false; });
  }
  function check() {
    if (TEST) { try { limit = localStorage.getItem('arcade-outage-test-limit') === '1'; } catch (e) {} return Promise.resolve(setDown(true)); }
    return Promise.all([workerUp(), pagesUp()]).then(function (r) {
      if (r[0] && r[1]) { fails = 0; oks++; if (down && oks >= 1) setDown(false); return; }
      return internetUp().then(function (net) {
        if (!net) return; // the player is offline: not Cloudflare's fault, show nothing
        oks = 0; fails++;
        if (fails >= 2) setDown(true); // two failed checks in a row, so one blip never shows it
        else { clearTimeout(timer); timer = setTimeout(loop, 6000); }
      });
    });
  }
  function loop() { clearTimeout(timer); check().then(sched, sched); }
  function sched() { clearTimeout(timer); timer = setTimeout(loop, down ? 15000 : fails ? 6000 : 60000); }

  /* ---------- backing up this device ---------- */
  var NOT = /^(arcade-outage-|sb-)/;
  function snapshot() {
    var d = {}, n = 0;
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && !NOT.test(k)) { d[k] = localStorage.getItem(k); n++; } } } catch (e) {}
    return { at: Date.now(), n: n, d: d };
  }
  function idb(fn) {
    try {
      var rq = indexedDB.open('arcade-outage', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('b'); };
      rq.onsuccess = function () { try { var tx = rq.result.transaction('b', 'readwrite'); fn(tx.objectStore('b')); tx.oncomplete = function () { rq.result.close(); }; } catch (e) {} };
    } catch (e) {}
  }
  function saveAll() {
    var s = snapshot();
    idb(function (st) { st.put(s, 'latest'); }); // the full copy (lots of room)
    try { localStorage.setItem(FKEY, JSON.stringify({ since: down ? (flag().since || s.at) : 0, at: s.at, n: s.n })); } catch (e) {}
    // a second copy of just the account itself, so the player stays signed in to sync later
    try { var a = {}; ['arcade-acct', 'arcade-local', 'arcade-acct-sync'].forEach(function (k) { if (s.d[k] != null) a[k] = s.d[k]; }); localStorage.setItem(BKEY, JSON.stringify({ at: s.at, d: a })); } catch (e) {}
  }
  function flag() { try { return JSON.parse(localStorage.getItem(FKEY) || '{}') || {}; } catch (e) { return {}; } }
  // after an outage: if the account record was lost on this device, put it back so syncing can carry on
  function restoreAccount() {
    try {
      var b = JSON.parse(localStorage.getItem(BKEY) || 'null'); if (!b || !b.d) return;
      Object.keys(b.d).forEach(function (k) { if (localStorage.getItem(k) == null) localStorage.setItem(k, b.d[k]); });
    } catch (e) {}
  }

  /* ---------- banner + pop-up ---------- */
  var CSS = '#cfDown{position:sticky;top:0;z-index:2147483000;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:9px 14px;background:#c8342a;color:#fff;font:700 14px/1.35 system-ui,-apple-system,sans-serif;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.35)}' +
    '#cfDown .dot{width:9px;height:9px;border-radius:50%;background:#fff;animation:cfP 1.2s infinite}@keyframes cfP{50%{opacity:.25}}' +
    '#cfDown button{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.5);color:#fff;border-radius:8px;padding:3px 10px;font:700 13px system-ui,sans-serif;cursor:pointer}' +
    '#cfPop{position:fixed;inset:0;z-index:2147483001;background:rgba(6,8,16,.72);display:flex;align-items:center;justify-content:center;padding:16px}' +
    '#cfPop .box{max-width:420px;width:100%;background:#141826;color:#eef1ff;border:1px solid #2c3350;border-radius:18px;padding:24px 22px;text-align:center;font:15px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.5)}' +
    '#cfPop .big{font-size:44px;line-height:1}#cfPop h2{margin:10px 0 6px;font-size:21px}#cfPop p{margin:8px 0;color:#c4cae6}#cfPop ul{text-align:left;margin:12px 0;padding-left:20px;color:#c4cae6}' +
    '#cfPop .ok{margin-top:14px;width:100%;padding:11px;border:0;border-radius:12px;background:#4a3fd1;color:#fff;font:700 15px system-ui,sans-serif;cursor:pointer}' +
    '#cfBack{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483001;background:#1f9d55;color:#fff;padding:11px 18px;border-radius:12px;font:700 14px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)}';
  // Cloudflare's daily limits reset at midnight UTC: shown in the player's own time
  function resetAt() { var d = new Date(); d.setUTCHours(24, 0, 0, 0); try { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return 'midnight UTC'; } }
  function style() { if (document.getElementById('cfDownCss')) return; var s = document.createElement('style'); s.id = 'cfDownCss'; s.textContent = CSS; document.head.appendChild(s); }
  function banner() {
    if (inFrame || document.getElementById('cfDown') || !document.body) return;
    style();
    var b = document.createElement('div'); b.id = 'cfDown'; b.setAttribute('role', 'alert');
    b.innerHTML = '<span class="dot"></span><span>' + (limit ? 'The Arcade’s servers have hit their daily limit and are paused until ' + resetAt() + '.' : 'The Arcade’s servers are down right now.') + ' Your progress is being saved on this device and will sync when they’re back.</span><button type="button">What does this mean?</button>';
    b.querySelector('button').onclick = function () { popup(true); };
    document.body.prepend(b);
  }
  function popup(force) {
    if (inFrame || document.getElementById('cfPop') || !document.body) return;
    var since = flag().since || Date.now();
    if (!force) { try { if (sessionStorage.getItem(PKEY) === String(since)) return; sessionStorage.setItem(PKEY, String(since)); } catch (e) {} }
    style();
    var p = document.createElement('div'); p.id = 'cfPop'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true');
    p.innerHTML = '<div class="box"><div class="big">🛠️</div><h2>The Arcade is down</h2>' +
      (limit ? '<p>Our servers (Cloudflare) have used up their daily limit, so they’re paused until about <b>' + resetAt() + '</b>. It’s not your internet.</p>' : '<p>Our servers (Cloudflare) aren’t answering right now. It’s not your internet.</p>') +
      '<ul><li><b>Your progress is safe.</b> Everything is saved on this device right now, and keeps saving while you play.</li>' +
      '<li>When the servers are back it all syncs to your account by itself.</li>' +
      '<li>Online play, chat, Social and logging in won’t work until then. Offline games still work.</li>' +
      '<li>Please don’t log out or clear this browser until it’s back.</li></ul>' +
      '<button type="button" class="ok">OK, got it</button></div>';
    p.querySelector('.ok').onclick = function () { p.remove(); };
    p.onclick = function (e) { if (e.target === p) p.remove(); };
    document.body.appendChild(p);
  }
  function backToast() {
    if (inFrame || !document.body) return;
    style();
    var t = document.createElement('div'); t.id = 'cfBack'; t.textContent = '✅ The Arcade is back! Syncing your progress…';
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 6000);
  }

  function setDown(v) {
    if (v === down) { if (v) { var ob = document.getElementById('cfDown'); if (ob && ob.dataset.l !== String(limit)) ob.remove(); banner(); var nb = document.getElementById('cfDown'); if (nb) nb.dataset.l = String(limit); } return; }
    down = v;
    if (v) {
      saveAll(); // straight away, before anything else
      clearInterval(saveT); saveT = setInterval(saveAll, 20000);
      banner(); var nb = document.getElementById('cfDown'); if (nb) nb.dataset.l = String(limit); popup(false);
    } else {
      clearInterval(saveT); saveAll();
      var b = document.getElementById('cfDown'); if (b) b.remove();
      var p = document.getElementById('cfPop'); if (p) p.remove();
      restoreAccount();
      try { localStorage.removeItem(FKEY); } catch (e) {}
      backToast();
      try { if (window.ArcadeAccount && ArcadeAccount.sync) ArcadeAccount.sync('outage-over'); } catch (e) {}
    }
    listeners.forEach(function (f) { try { f(v); } catch (e) {} });
  }

  addEventListener('pagehide', function () { if (down) saveAll(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && down) saveAll(); if (!document.hidden && (down || fails)) loop(); });
  addEventListener('online', function () { if (down || fails) loop(); });
  // any other script can report a failed request to the servers (a hint only: check() still decides)
  function hint() { if (!down && (OFFICIAL || TEST)) { clearTimeout(timer); timer = setTimeout(loop, 1500); } }

  window.ArcadeOutage = { down: function () { return down; }, onChange: function (f) { listeners.push(f); }, hint: hint, check: loop };

  if (inFrame) { // inside a page that already watches (play.html's game frame, a call's frame): follow it
    try { window.top.ArcadeOutage.onChange(function (v) { if (v) saveAll(); }); if (window.top.ArcadeOutage.down()) saveAll(); } catch (e) {}
    addEventListener('pagehide', function () { try { if (window.top.ArcadeOutage.down()) saveAll(); } catch (e) {} });
    return;
  }
  if (!OFFICIAL && !TEST) return; // downloaded copies / other hosts: nothing to check
  function start() { if (flag().since) check().then(sched, sched); else { timer = setTimeout(loop, 4000); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
