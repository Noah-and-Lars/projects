/* avatars.js (2026-11-15): Social profile pictures everywhere on the site.
   ArcadeAvatars.fill(span, name) paints a player's Social picture onto a round letter avatar (it keeps the letter if they have none).
   Names are gathered and fetched together from /clips/avatars (60 at a time) and kept for 10 minutes in sessionStorage,
   the same cache Social uses (arcade-social-av), so a new picture shows up on every page. ArcadeAvatars.scan(root) fills
   every element with data-av="<name>". Needs account.js (for the server address). */
(function () {
  if (window.ArcadeAvatars) return;
  var KEY = 'arcade-social-av', cache = {}, wait = {}, q = [], t = 0, at = Date.now();
  try { var c = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (c && Date.now() - c.at < 600000) { cache = c.av || {}; at = c.at; } } catch (e) {}
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ at: at, av: cache })); } catch (e) {} }
  function css() {
    if (document.getElementById('arcade-av-css')) return;
    var s = document.createElement('style'); s.id = 'arcade-av-css';
    s.textContent = '.av-pic{background-size:cover!important;background-position:center!important;color:transparent!important;text-shadow:none!important}';
    (document.head || document.documentElement).appendChild(s);
  }
  function paint(span, url) {
    if (span.classList.contains("grp")) url = "";
    if (url) { css(); span.classList.add('av-pic'); span.style.backgroundImage = 'url("' + url + '")'; }
    else if (span.classList.contains('av-pic')) { span.classList.remove('av-pic'); span.style.backgroundImage = ''; }
  }
  function server() { return window.ArcadeAccount && ArcadeAccount.server ? ArcadeAccount.server : ''; }
  function room() { var m = /[?&]clipsroom=([a-z0-9-]+)/i.exec(location.search); return m ? '&r=' + m[1].toLowerCase() : ''; }
  function fetchAll() {
    var ks = q.splice(0, 60); if (!ks.length || !server()) return;
    fetch(server() + '/clips/avatars?n=' + ks.join(',') + room(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
      ks.forEach(function (k) {
        var url = j && j.av ? j.av[k] || '' : '';
        if (j) cache[k] = url;
        (wait[k] || []).forEach(function (sp) { paint(sp, url); }); delete wait[k];
      });
      if (j) save();
      if (q.length) fetchAll();
    });
  }
  function fill(span, name) {
    if (!span) return span;
    var k = String(name || '').toLowerCase();
    if (!/^[a-z0-9_]{3,16}$/.test(k)) return span;
    span.dataset.avn = k;
    if (Object.prototype.hasOwnProperty.call(cache, k)) { paint(span, cache[k]); return span; }
    if (!wait[k]) { wait[k] = []; q.push(k); }
    wait[k].push(span);
    clearTimeout(t); t = setTimeout(fetchAll, 40);
    return span;
  }
  // a picture changed (on Social): repaint it everywhere on this page
  function set(name, url) {
    var k = String(name || '').toLowerCase(); cache[k] = url || ''; save();
    document.querySelectorAll('[data-avn="' + k + '"]').forEach(function (sp) { paint(sp, url); });
  }
  function scan(root) { (root || document).querySelectorAll('[data-av]').forEach(function (sp) { if (sp.dataset.avn !== sp.dataset.av.toLowerCase()) fill(sp, sp.dataset.av); }); }
  window.ArcadeAvatars = { fill: fill, set: set, scan: scan, get: function (n) { return cache[String(n || '').toLowerCase()]; } };
})();
