/* watch.js (2026-11-19): extras for the Apple Watch layout (html.watch). console.js loads it on a watch instead of the
   TV mode; glances.html loads it itself.
   - The home page gets a "Glances" card at the top (glances.html: alerts, streak, friends, messages, Krill depth,
     chess, a stopwatch, a reaction game and time played).
   - "Buzz when a friend comes online" (opt-in, 'arcade-acct-watch' on this device only): when one of your friends
     shows up in the on-now counter's names (ArcadeOnline.onNames), the watch vibrates where the browser allows it
     (navigator.vibrate; Apple's own watch browser has no vibration, so it shows a toast there too) and shows a toast.
     The friends list comes from /acct/social, asked at most every 5 minutes. */
(function () {
  if (window.ArcadeWatch) return;
  var K = 'arcade-acct-watch';
  var S = {}; try { S = JSON.parse(localStorage.getItem(K) || '{}') || {}; } catch (e) { S = {}; }
  var ss = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} } };
  var A = function () { return window.ArcadeAccount; };
  var online = function () { var a = A(); return !!(a && a.kind && a.kind() === 'online'); };
  function save() { try { localStorage.setItem(K, JSON.stringify(S)); } catch (e) {} }
  function buzz(p) { try { if (navigator.vibrate) return navigator.vibrate(p || 120); } catch (e) {} return false; }

  // friends (lower name -> shown name), cached for 5 minutes in this tab
  function friends(force) {
    var c = null; try { c = JSON.parse(ss.get('arcade-watch-fr') || 'null'); } catch (e) {}
    var a = A(); if (!online()) return Promise.resolve({});
    if (c && !force && Date.now() - c.at < 300000 && c.me === a.name()) return Promise.resolve(c.f);
    return a.api('social', { auth: true }).then(function (r) {
      if (r.status !== 200) return (c && c.f) || {};
      var f = {}; Object.keys(r.f || {}).forEach(function (k) { if (r.f[k] && r.f[k].st === 'f') f[k] = r.f[k].n || k; });
      ss.set('arcade-watch-fr', JSON.stringify({ at: Date.now(), me: a.name(), f: f, c: r.c || {} }));
      return f;
    });
  }

  /* ---------- buzz when a friend comes online ---------- */
  var lastNames = null, connected = false, fr = null;
  function check() {
    if (!S.buzz || !connected || !lastNames || !fr) return;
    var now = Object.keys(fr).filter(function (k) { return lastNames[k]; }), was = null;
    try { was = JSON.parse(ss.get('arcade-watch-on') || 'null'); } catch (e) {}
    ss.set('arcade-watch-on', JSON.stringify(now));
    if (!was) return; // the first look in this tab is the starting point, no buzz
    var fresh = now.filter(function (k) { return was.indexOf(k) < 0; });
    if (!fresh.length) return;
    buzz([90, 60, 90]);
    var a = A();
    fresh.slice(0, 3).forEach(function (k) { if (a && a.toast) a.toast(fr[k], 'is online now', 'players.html#p=' + encodeURIComponent(fr[k])); });
  }
  function hook() {
    if (!window.ArcadeOnline || hook.done) return; hook.done = 1;
    ArcadeOnline.onNames(function (n) { lastNames = n; check(); });
    ArcadeOnline.subscribe(function (c) { if (c && !connected) { connected = true; check(); } });
  }
  function startBuzz() { if (!S.buzz || !online()) return; friends().then(function (f) { fr = f; hook(); check(); }); }

  /* ---------- the Glances card on the home page ---------- */
  function homeCard() {
    if (!/(^|\/)(index\.html)?$/.test(location.pathname) || document.getElementById('wGlance')) return;
    var top = document.querySelector('header.top'); if (!top || !top.parentNode) return;
    var a = document.createElement('a'); a.id = 'wGlance'; a.href = 'glances.html';
    a.style.cssText = 'position:relative;z-index:5;display:flex;align-items:center;gap:8px;margin:6px 6px 0;padding:9px 10px;border-radius:12px;background:#1b1835;border:1px solid #ffffff22;color:#fff;font:700 13px system-ui,sans-serif;text-decoration:none';
    a.innerHTML = '<span style="font-size:20px" aria-hidden="true">⌚</span><span style="flex:1"><b style="display:block">Glances</b><span style="font-weight:500;font-size:11px;color:#b9b6d6">Streak, friends, alerts, mini game</span></span><span aria-hidden="true">›</span>';
    top.parentNode.insertBefore(a, top.nextSibling); // first thing under the header, above the featured game
  }

  function boot() { homeCard(); setTimeout(startBuzz, 1500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.ArcadeWatch = {
    friends: friends, buzz: buzz, settings: S,
    setBuzz: function (on) { S.buzz = on ? 1 : 0; save(); if (on) { buzz(60); startBuzz(); } },
    canBuzz: function () { return !!navigator.vibrate; }
  };
})();
