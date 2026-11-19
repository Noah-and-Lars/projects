/* notify.js (2026-11-19): the notification centre. Loaded by account.js (its add-on list) on every page that has an
   account button. A bell in the rail (desktop) / top bar (phones, play.html) with a count opens #ntfPanel, a right-side
   slide-out ([role=dialog], so console.js traps the focus and Back closes it) with every alert in one list.
   Where alerts come from:
   - account.js toast() (private and group messages, friend requests) asks ArcadeNotify.intercept() first: the alert is
     listed here and the pop-up only shows when the settings allow it (type on, not snoozed, not quiet hours, not digest).
   - Tournaments: tourney.js fires a window event 'arcade:tourney' {T, me} whenever it reads a tournament. A tournament
     you joined is remembered ('arcade-ntf-tourn'); "starts in 5 minutes" comes from its start time (no requests), and
     while one you're in is live, other pages ask the server for it every 20 s (60 s hidden) until you're out. A new
     match for you is a high-priority alert with a chime (gets through digest mode; quiet hours only if allowed).
   - Followed games ('arcade-follow-games' {id: updated seen}, synced with the account through the misc group): on
     every visit games.js `updated` is compared and a newer one gives an "updated" alert with its newest NEWS line.
   - Streams: The Arcade has no streams yet. Other code can call ArcadeNotify.push({ty: 'streams', who, tx, href});
     streamer follows are kept in 'arcade-follow-streams' for when it does. Live-socket messages {t: 'stream', n, on}
     are handled too, if the server ever sends them.
   - tickets.js sends its daily bonus here (type 'tickets').
   Settings per device ('arcade-ntf-set'), list ('arcade-ntf-list', newest 60), snooze ('arcade-ntf-snooze'), digest
   queue ('arcade-ntf-digest'): the arcade-ntf- prefix is in account.js NEVER, so none of it is cloud-synced.
   System notifications: with permission, an alert that arrives while the page is in the background is also shown by
   the browser (through the service worker registration where there is one, which sw.js opens on click). Real push
   (alerts with every Arcade tab closed) needs VAPID keys and a server push route; not built.
   The tab title gets the unread count: "(3) The Arcade". */
(function () {
  if (window.ArcadeNotify || window.ARCADE_WATCH) return;
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    json: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } },
    put: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  var K_LIST = 'arcade-ntf-list', K_SET = 'arcade-ntf-set', K_SNOOZE = 'arcade-ntf-snooze', K_DIG = 'arcade-ntf-digest', K_TOURN = 'arcade-ntf-tourn';
  var K_FOLLOW = 'arcade-follow-games', K_STREAMS = 'arcade-follow-streams';
  var TYPES = [
    ['messages', 'Messages', 'Private and group messages'],
    ['friends', 'Friends', 'Friend requests and new friends'],
    ['tournaments', 'Tournaments', 'Your match is ready, your tournament is starting'],
    ['streams', 'Streams', 'A player you follow goes live'],
    ['updates', 'Game updates', 'Only for games you follow'],
    ['tickets', 'Tickets', 'Your daily ticket bonus'],
  ];
  var ICON = { messages: '💬', friends: '👋', tournaments: '🏆', streams: '📺', updates: '🆕', tickets: '🎟️', digest: '🗞️' };
  var DEF = { types: { messages: 1, friends: 1, tournaments: 1, streams: 1, updates: 1, tickets: 1 }, quiet: { on: 0, from: '21:00', to: '07:00', match: 1 }, digest: 0, digestAt: 17, sound: 1, system: 0, title: 1 };
  var $ = function (id) { return document.getElementById(id); };
  var A = function () { return window.ArcadeAccount; };
  var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  var same = function (a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); };
  var myName = function () { try { var a = A(); return a && a.kind && a.kind() === 'online' ? a.name() : ''; } catch (e) { return ''; } };
  var dayKey = function (t) { var d = new Date(t || Date.now()); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

  function settings() {
    var s = ls.json(K_SET, {}) || {}, o = JSON.parse(JSON.stringify(DEF));
    if (s.types) for (var k in o.types) if (k in s.types) o.types[k] = s.types[k] ? 1 : 0;
    if (s.quiet) for (var q in o.quiet) if (q in s.quiet) o.quiet[q] = s.quiet[q];
    ['digest', 'sound', 'system', 'title', 'digestAt'].forEach(function (k) { if (k in s) o[k] = s[k]; });
    return o;
  }
  var S = settings();
  function saveSettings() { ls.put(K_SET, S); }
  var list = ls.json(K_LIST, []); if (!Array.isArray(list)) list = [];
  function saveList() { list = list.slice(0, 60); ls.put(K_LIST, list); }
  // another tab changed something: take its copy
  addEventListener('storage', function (e) {
    if (e.key === K_LIST) { list = ls.json(K_LIST, []) || []; paint(); }
    else if (e.key === K_SET) { S = settings(); paint(); }
    else if (e.key === K_SNOOZE) paint();
  });

  /* ---------- the rules: snooze, quiet hours, digest ---------- */
  function snoozedUntil() { var t = +ls.get(K_SNOOZE) || 0; return t > Date.now() ? t : 0; }
  function mins(hm) { var m = /^(\d{1,2}):(\d{2})$/.exec(hm || ''); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
  function inQuiet() {
    if (!S.quiet.on) return false;
    var d = new Date(), now = d.getHours() * 60 + d.getMinutes(), f = mins(S.quiet.from), t = mins(S.quiet.to);
    if (f === t) return false;
    return f < t ? now >= f && now < t : now >= f || now < t;
  }
  // may this alert make noise (pop-up, sound, system notification)?
  function loud(n) {
    if (n.hp) return !(inQuiet() && !S.quiet.match) && !(snoozedUntil() && !S.quiet.match);
    return !snoozedUntil() && !inQuiet() && !S.digest;
  }

  /* ---------- sound (a short two-note chime for high-priority alerts) ---------- */
  var actx = null;
  function audio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } } return actx; }
  // browsers only allow sound after the player has touched the page: wake the audio on the first tap or key
  ['pointerdown', 'keydown'].forEach(function (ev) { addEventListener(ev, function w() { var c = audio(); if (c && c.state === 'suspended') c.resume().catch(function () {}); removeEventListener(ev, w, true); }, true); });
  function chime() {
    var c = audio(); if (!c || c.state !== 'running') return;
    [[880, 0], [1320, 0.16]].forEach(function (x) {
      var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + x[1];
      o.type = 'sine'; o.frequency.value = x[0]; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.4);
    });
  }

  /* ---------- system notifications (the browser's own, while the page is open or in the background) ---------- */
  function canSystem() { return S.system && typeof Notification !== 'undefined' && Notification.permission === 'granted'; }
  function system(n) {
    if (!canSystem()) return;
    var title = (n.hp ? '❗ ' : '') + (n.who || 'The Arcade'), body = String(n.tx || '').slice(0, 140), url = new URL(n.href || 'index.html', location.href).href;
    var opt = { body: body, icon: new URL('icon-192.png', location.href).href, tag: 'arcade-' + n.id, data: { url: url }, requireInteraction: !!n.hp };
    try {
      var x = new Notification(title, opt);
      x.onclick = function () { try { window.focus(); } catch (e) {} location.href = url; x.close(); };
    } catch (e) { // phones (Android Chrome) only allow them from the service worker
      if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.showNotification(title, opt); }).catch(function () {});
    }
  }

  /* ---------- delivering one alert ---------- */
  var bypass = false, seq = 0;
  // n: { ty, who, tx, href, hp (high priority) }; opts.fromToast: account.js shows the pop-up itself if we say yes;
  // opts.noPop: list it (and chime) but don't pop up (the page already shows it)
  function deliver(n, opts) {
    opts = opts || {};
    if (!S.types[n.ty] && n.ty !== 'digest') return false;
    n.id = Date.now().toString(36) + (seq++).toString(36);
    n.t = Date.now(); n.rd = 0;
    if (window.ArcadeVoice && n.tx) try { n.tx = ArcadeVoice.preview(n.tx); } catch (e) {}
    n.tx = String(n.tx || '').slice(0, 300); n.who = String(n.who || '').slice(0, 60);
    list.unshift(n); saveList();
    var noisy = loud(n);
    if (!noisy && S.digest && !n.hp && n.ty !== 'digest') { var q = ls.json(K_DIG, { q: {} }) || { q: {} }; q.q = q.q || {}; q.q[n.ty] = (q.q[n.ty] || 0) + 1; ls.put(K_DIG, q); }
    if (noisy && document.hidden) system(n);
    if (noisy && n.hp && S.sound) chime();
    if (noisy && n.hp) try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) {}
    paint();
    if (opts.fromToast) return noisy;
    if (noisy && !opts.noPop) popup(n);
    return noisy;
  }
  function popup(n) { var a = A(); if (!a || !a.toast) return; bypass = true; try { a.toast(n.who || 'The Arcade', n.tx, n.href || '#notifications'); } finally { bypass = false; } }
  // account.js toast() asks here first. true = show the pop-up.
  function intercept(who, text, href) {
    if (bypass) return true;
    var ty = /#(dm|g)=/.test(href || '') ? 'messages' : /#p=/.test(href || '') ? 'friends' : 'updates';
    if (/^admin$/i.test(who)) return true; // account notices from the admin (a rename) always show
    return deliver({ ty: ty, who: who, tx: text, href: href }, { fromToast: true });
  }

  /* ---------- daily digest: one summary a day instead of many pop-ups ---------- */
  var WORDS = { messages: ['message', 'messages'], friends: ['friend alert', 'friend alerts'], tournaments: ['tournament alert', 'tournament alerts'], streams: ['stream alert', 'stream alerts'], updates: ['game update', 'game updates'], tickets: ['ticket alert', 'ticket alerts'] };
  function digestCheck() {
    var d = ls.json(K_DIG, { q: {} }) || { q: {} }, today = dayKey();
    if (d.last === today || new Date().getHours() < (+S.digestAt || 17)) return;
    var parts = []; for (var k in d.q || {}) if (d.q[k] > 0 && WORDS[k]) parts.push(d.q[k] + ' ' + WORDS[k][d.q[k] === 1 ? 0 : 1]);
    d.last = today; d.q = {}; ls.put(K_DIG, d);
    if (!parts.length) return;
    var n = { ty: 'digest', who: 'Your daily summary', tx: parts.join(', ') + '. Open the bell to see them.', href: '#notifications' };
    var wasDigest = S.digest; S.digest = 0; deliver(n); S.digest = wasDigest; // the summary itself pops up
  }

  /* ---------- followed games: update alerts ---------- */
  function games() { try { return typeof GAMES !== 'undefined' ? GAMES : []; } catch (e) { return []; } }
  function news() { try { return typeof NEWS !== 'undefined' ? NEWS : []; } catch (e) { return []; } }
  function follows() { var f = ls.json(K_FOLLOW, {}); return f && typeof f === 'object' ? f : {}; }
  function setFollow(id, on) {
    var f = follows(), g = games().filter(function (x) { return x.id === id; })[0];
    if (on && g) f[id] = g.updated; else delete f[id];
    ls.put(K_FOLLOW, f);
  }
  function updateCheck() {
    var f = follows(), changed = false;
    games().forEach(function (g) {
      if (!f[g.id] || !g.updated || !(Date.parse(g.updated) > Date.parse(f[g.id]))) return;
      var seen = f[g.id]; f[g.id] = g.updated; changed = true;
      var line = news().filter(function (x) { return x.game === g.id && x.date >= String(seen).slice(0, 10); })[0];
      deliver({ ty: 'updates', who: g.title + ' was updated', tx: line ? line.text : 'A new version is out. Play it now.', href: 'play.html?game=' + encodeURIComponent(g.id) });
    });
    if (changed) ls.put(K_FOLLOW, f);
  }
  // play.html: a Follow button in "How to play"
  function followButton() {
    var q = new URLSearchParams(location.search).get('game'), howto = document.querySelector('body.player .howto');
    if (!q || !howto || $('ntfFollow') || !games().some(function (g) { return g.id === q; })) return;
    var b = el('button', 'btn ghost ntf-follow'); b.id = 'ntfFollow'; b.type = 'button';
    var draw = function () { var on = !!follows()[q]; b.textContent = on ? '🔔 Following updates' : '🔕 Follow updates'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.title = on ? 'You get an alert when this game is updated. Click to stop.' : 'Get an alert when this game is updated'; };
    b.onclick = function () { setFollow(q, !follows()[q]); draw(); };
    draw();
    var h = howto.querySelector('h2'); if (h) h.after(b); else howto.prepend(b);
  }

  /* ---------- tournaments ---------- */
  function tourns() { var t = ls.json(K_TOURN, {}); return t && typeof t === 'object' ? t : {}; }
  function matchOf(T, name) {
    if (window.ArcadeTourney && ArcadeTourney.matchOf) return ArcadeTourney.matchOf(T, name);
    for (var r = 0; r < (T.rounds || []).length; r++) for (var i = 0; i < T.rounds[r].length; i++) { var m = T.rounds[r][i]; if (!m.w && (same(m.a, name) || same(m.b, name)) && m.a && m.b) return m; }
    return null;
  }
  function stillIn(T, name) { // not knocked out yet
    if (!T.rounds) return true;
    for (var r = 0; r < T.rounds.length; r++) for (var i = 0; i < T.rounds[r].length; i++) { var m = T.rounds[r][i]; if ((same(m.a, name) || same(m.b, name)) && m.w && !same(m.w, name)) return false; }
    return true;
  }
  function viewing(id) { var q = new URLSearchParams(location.search); return (/tourney\.html$/.test(location.pathname) && q.get('t') === id) || q.get('tid') === id; }
  function onTourney(T, me) {
    var name = (me && me.name) || myName(); if (!T || !T.id || !name) return;
    var all = tourns(), w = all[T.id], joined = (T.players || []).some(function (p) { return same(p, name); }) || (me && me.joined);
    if (!w && !joined) return;
    if (T.st === 'done' || T.cancelled || (T.st === 'live' && !stillIn(T, name))) { if (w) { delete all[T.id]; ls.put(K_TOURN, all); } return; }
    w = all[T.id] = w || { last: '' };
    w.at = T.at; w.st = T.st; w.t = String(T.t || 'Tournament').slice(0, 60); w.seen = Date.now();
    var m = T.st === 'live' && matchOf(T, name);
    if (m && m.st !== 'dispute') {
      var key = m.id + (m.code || '');
      if (key !== w.last) {
        w.last = key; ls.put(K_TOURN, all);
        var opp = same(m.a, name) ? m.b : m.a, url = window.ArcadeTourney && ArcadeTourney.playUrl ? ArcadeTourney.playUrl(T, m) : 'tourney.html?t=' + T.id;
        var here = viewing(T.id) && !document.hidden;
        if (!(new URLSearchParams(location.search).get('tid') === T.id)) deliver({ ty: 'tournaments', hp: 1, who: 'Your match is ready', tx: w.t + ': you vs ' + opp + '. Play now!', href: url }, { noPop: here });
        return;
      }
    }
    ls.put(K_TOURN, all);
  }
  addEventListener('arcade:tourney', function (e) { try { onTourney(e.detail && e.detail.T, e.detail && e.detail.me); } catch (x) {} });
  function tournBase() {
    try { if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && ls.get('arcade-acct-api')) return ls.get('arcade-acct-api').replace(/\/acct\/?$/, '') + '/tourn'; } catch (e) {}
    var a = A(); return ((a && a.server) || 'https://arcade-realtime.arcade-realtime.workers.dev') + '/tourn';
  }
  var lastPoll = 0;
  function tournTick() {
    var all = tourns(), now = Date.now(), dirty = false;
    Object.keys(all).forEach(function (id) {
      var w = all[id];
      if (!w.at || now - Math.max(+w.at, +w.seen || 0) > 12 * 3600e3) { delete all[id]; dirty = true; return; } // long gone
      if (w.st === 'open' && w.at - now < 5 * 60e3 && w.at > now && !w.soon) { // "starts in 5 minutes" (just the clock)
        w.soon = 1; dirty = true;
        if (!viewing(id)) deliver({ ty: 'tournaments', who: 'Your tournament starts soon', tx: w.t + ' starts in ' + Math.max(1, Math.round((w.at - now) / 60e3)) + ' minutes. Be on its page to get a place.', href: 'tourney.html?t=' + id });
      }
    });
    if (dirty) ls.put(K_TOURN, all);
    // ask the server only for live ones you're still in (or ones starting about now), not the one this page already reads
    if (now - lastPoll < (document.hidden ? 60000 : 20000)) return;
    var ids = Object.keys(all).filter(function (id) { var w = all[id]; return !viewing(id) && (w.st === 'live' || (w.st === 'open' && w.at - now < 60e3)); });
    if (!ids.length || !myName()) return;
    lastPoll = now;
    ids.slice(0, 3).forEach(function (id) {
      fetch(tournBase() + '?id=' + encodeURIComponent(id), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.error === 'not_found') { var a2 = tourns(); delete a2[id]; ls.put(K_TOURN, a2); return; }
        if (j && j.T) onTourney(j.T, null);
      }).catch(function () {});
    });
  }

  /* ---------- streams (for when The Arcade has them) ---------- */
  function streamFollows() { var s = ls.json(K_STREAMS, []); return Array.isArray(s) ? s : []; }
  function onLive(m) {
    if (!m || m.t !== 'stream' || !m.n || !m.on) return;
    if (!streamFollows().some(function (n) { return same(n, m.n); })) return;
    deliver({ ty: 'streams', who: String(m.n), tx: 'is live now. Come and watch!', href: m.href && /^[\w.\-\/?=&#%]+$/.test(m.href) ? m.href : 'players.html#p=' + encodeURIComponent(m.n) });
  }

  /* ---------- the bell and the panel ---------- */
  var btn = null, badge = null, panel = null, view = 'list', lastFocus = null;
  function unread() { return list.filter(function (n) { return !n.rd; }).length; }
  var CSS = '' +
    '#ntfBtn{flex:none;position:relative;display:inline-grid;place-items:center;width:36px;height:36px;margin-left:8px;border-radius:50%;border:1px solid var(--line,#ffffff22);background:rgba(255,255,255,.04);color:var(--text,#f4f4f5);cursor:pointer;transition:border-color .15s,background .15s}' +
    '#ntfBtn:hover,#ntfBtn[aria-expanded=true]{border-color:var(--line-2,#ffffff33);background:rgba(255,255,255,.08)}#ntfBtn svg{width:19px;height:19px}' +
    '#ntfBtn .ntf-n{position:absolute;top:-4px;right:-4px;min-width:18px;padding:0 5px;border-radius:999px;background:var(--accent,#ff5a2c);color:var(--accent-ink,#160500);font:700 10.5px/18px var(--mono,monospace);text-align:center;box-shadow:0 0 0 2px #08080a}#ntfBtn .ntf-n[hidden]{display:none}' +
    '#ntfBtn.snz::after{content:"z";position:absolute;bottom:-3px;right:-3px;width:15px;height:15px;border-radius:50%;background:#25252c;color:#a1a1aa;font:700 10px/15px var(--font,system-ui);text-align:center}' +
    'html:not(.mob-phone) body:not(.player)>.top #ntfBtn{order:3;margin:auto 0 6px;width:44px;height:44px}html:not(.mob-phone) body:not(.player)>.top #ntfBtn svg{width:22px;height:22px}' +
    'html:not(.mob-phone) body:not(.player)>.top #ntfBtn~#aiBtn,html:not(.mob-phone) body:not(.player)>.top #ntfBtn~#acctBtn{margin-top:0}' +
    '.mob-phone .top #ntfBtn{order:3;margin-left:0}' +
    '#ntfPanel{position:fixed;z-index:2147482500;top:0;right:0;bottom:0;width:380px;max-width:100vw;display:flex;flex-direction:column;background:#0e0e11;border-left:1px solid var(--line,#ffffff14);box-shadow:-30px 0 80px #000a;color:var(--text,#f4f4f5);font:14px/1.4 var(--font,system-ui);transform:translateX(105%);transition:transform .25s var(--ease,ease);visibility:hidden}' +
    '#ntfPanel.open{transform:none;visibility:visible}' +
    '#ntfPanel .ntf-hd{display:flex;align-items:center;gap:8px;padding:14px 14px 10px;padding-top:max(14px,env(safe-area-inset-top));border-bottom:1px solid var(--line,#ffffff14)}' +
    '#ntfPanel .ntf-hd h2{flex:1;margin:0;font-size:17px}' +
    '#ntfPanel .ntf-ib{height:32px;padding:0 10px;border-radius:9px;border:1px solid var(--line,#ffffff1f);background:rgba(255,255,255,.05);color:inherit;font:600 12.5px var(--font,system-ui);cursor:pointer;white-space:nowrap}#ntfPanel .ntf-ib:hover{background:rgba(255,255,255,.1)}#ntfPanel .ntf-ib[aria-pressed=true]{border-color:var(--accent,#ff5a2c);color:var(--accent,#ff5a2c)}' +
    '#ntfPanel .ntf-x{width:32px;padding:0;font-size:18px}' +
    '#ntfPanel .ntf-bar{padding:8px 14px;font-size:12.5px;color:#a1a1aa;border-bottom:1px solid var(--line,#ffffff14);display:flex;gap:8px;align-items:center;flex-wrap:wrap}#ntfPanel .ntf-bar[hidden]{display:none}' +
    '#ntfPanel .ntf-body{flex:1;overflow:auto;overscroll-behavior:contain;padding:6px 0 20px}' +
    '#ntfPanel .ntf-it{display:flex;gap:10px;padding:10px 14px;color:inherit;text-decoration:none;border-left:3px solid transparent}#ntfPanel .ntf-it:hover,#ntfPanel .ntf-it:focus-visible{background:rgba(255,255,255,.05)}' +
    '#ntfPanel .ntf-it.new{border-left-color:var(--accent,#ff5a2c);background:rgba(255,90,44,.06)}#ntfPanel .ntf-it.hp .ntf-ic{background:#ff5a2c33}' +
    '#ntfPanel .ntf-ic{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#1d1d22;font-size:16px}' +
    '#ntfPanel .ntf-tx{flex:1;min-width:0}#ntfPanel .ntf-tx b{display:block}#ntfPanel .ntf-tx span{display:block;color:#c4c4cc;overflow-wrap:anywhere}#ntfPanel .ntf-tx time{display:block;margin-top:2px;color:#74747f;font-size:12px}' +
    '#ntfPanel .ntf-empty{padding:40px 24px;text-align:center;color:#a1a1aa}' +
    '#ntfPanel .ntf-ft{display:flex;gap:8px;padding:10px 14px;padding-bottom:max(10px,env(safe-area-inset-bottom));border-top:1px solid var(--line,#ffffff14)}#ntfPanel .ntf-ft a{flex:1;text-align:center}' +
    '#ntfPanel fieldset{margin:10px 14px;padding:10px 12px 12px;border:1px solid var(--line,#ffffff1a);border-radius:12px}#ntfPanel legend{padding:0 6px;font-weight:700}' +
    '#ntfPanel .ntf-row{display:flex;align-items:flex-start;gap:10px;padding:6px 0;cursor:pointer}#ntfPanel .ntf-row input[type=checkbox]{margin-top:3px;width:17px;height:17px;accent-color:var(--accent,#ff5a2c);flex:none}' +
    '#ntfPanel .ntf-row small{display:block;color:#a1a1aa}#ntfPanel .ntf-note{margin:6px 0 0;color:#a1a1aa;font-size:12.5px}' +
    '#ntfPanel input[type=time],#ntfPanel input[type=text],#ntfPanel select{height:32px;padding:0 8px;border-radius:8px;border:1px solid var(--line-2,#ffffff2a);background:#16161a;color:inherit;font:inherit}' +
    '#ntfPanel .ntf-games{max-height:220px;overflow:auto;margin-top:4px}#ntfPanel .ntf-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}#ntfPanel .ntf-chip{padding:3px 4px 3px 10px;border-radius:999px;background:#1d1d22;display:inline-flex;gap:4px;align-items:center}#ntfPanel .ntf-chip button{border:0;background:none;color:#a1a1aa;cursor:pointer;font-size:15px}' +
    '.ntf-follow{margin:0 0 12px}' +
    '@media (max-width:620px){#ntfPanel{width:100vw;border-left:0}#ntfBtn{width:32px;height:32px}body.player>.top #ntfBtn{margin-left:0}}';
  function css() { if ($('ntfCss')) return; var s = el('style'); s.id = 'ntfCss'; s.textContent = CSS; document.head.appendChild(s); }
  var BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

  function ago(t) { var s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; var d = Math.floor(s / 86400); return d === 1 ? 'yesterday' : d + ' days ago'; }
  var baseTitle = '', titleBusy = false;
  function paintTitle() {
    if (titleBusy) return;
    var cur = document.title, base = cur.replace(/^\(\d+\+?\) /, ''), n = S.title ? unread() : 0, want = (n ? '(' + (n > 99 ? '99+' : n) + ') ' : '') + base;
    baseTitle = base;
    if (cur !== want) { titleBusy = true; document.title = want; titleBusy = false; }
  }
  function paint() {
    var n = unread();
    if (badge) { badge.hidden = !n; badge.textContent = n > 99 ? '99+' : n; }
    if (btn) { btn.classList.toggle('snz', !!snoozedUntil()); btn.setAttribute('aria-label', 'Notifications' + (n ? ', ' + n + ' new' : '')); }
    paintTitle();
    if (panel && panel.classList.contains('open') && view === 'list') renderList();
  }
  function addButton() {
    var top = document.querySelector('header.top'); if (!top) return false;
    if ($('ntfBtn')) return true;
    css();
    btn = el('button'); btn.id = 'ntfBtn'; btn.type = 'button'; btn.title = 'Notifications'; btn.innerHTML = BELL;
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-haspopup', 'dialog');
    badge = el('span', 'ntf-n'); badge.hidden = true; badge.setAttribute('aria-hidden', 'true'); btn.appendChild(badge);
    btn.onclick = function () { if (isOpen()) close(); else open(); };
    place(top);
    return true;
  }
  function place(top) { // just before the assistant's button, or the account button
    var before = $('aiBtn') || $('acctBtn');
    if (before && before.parentNode === top) { if (btn.nextSibling !== before) top.insertBefore(btn, before); } else if (btn.parentNode !== top) top.appendChild(btn);
  }

  function isOpen() { return !!(panel && panel.classList.contains('open')); }
  function open(which) {
    css(); buildPanel();
    view = which || 'list';
    lastFocus = document.activeElement;
    render();
    panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    // opening the bell marks everything read
    setTimeout(function () { list.forEach(function (n) { n.rd = 1; }); saveList(); paint(); }, 1500);
    setTimeout(function () { var f = panel.querySelector('.ntf-x'); if (f) f.focus(); }, 60);
  }
  function close() {
    if (!panel) return;
    panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true');
    if (btn) { btn.setAttribute('aria-expanded', 'false'); }
    list.forEach(function (n) { n.rd = 1; }); saveList(); paint();
    try { (lastFocus && lastFocus.focus ? lastFocus : btn).focus(); } catch (e) {}
  }
  function buildPanel() {
    if (panel) return;
    panel = el('div'); panel.id = 'ntfPanel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'ntfTtl'); panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = '<div class="ntf-hd"><h2 id="ntfTtl">Notifications</h2><button type="button" class="ntf-ib ntf-snz"></button><button type="button" class="ntf-ib ntf-set"></button><button type="button" class="ntf-ib ntf-x" aria-label="Close">×</button></div>' +
      '<div class="ntf-bar" role="status" hidden></div><div class="ntf-body"></div><div class="ntf-ft"></div>';
    document.body.appendChild(panel);
    panel.querySelector('.ntf-x').onclick = close;
    panel.querySelector('.ntf-set').onclick = function () { view = view === 'set' ? 'list' : 'set'; render(); };
    panel.querySelector('.ntf-snz').onclick = function () { ls.set(K_SNOOZE, snoozedUntil() ? '0' : String(Date.now() + 3600e3)); render(); paint(); };
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    document.addEventListener('pointerdown', function (e) { if (isOpen() && !panel.contains(e.target) && !(btn && btn.contains(e.target)) && !e.target.closest('#acctToasts')) close(); }, true);
  }
  function render() {
    var sz = snoozedUntil(), b = panel.querySelector('.ntf-snz'), bar = panel.querySelector('.ntf-bar');
    b.textContent = sz ? 'Snoozed' : 'Snooze 1 h'; b.setAttribute('aria-pressed', sz ? 'true' : 'false');
    b.title = sz ? 'No pop-ups until ' + new Date(sz).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '. Click to turn alerts back on.' : 'No pop-ups or sounds for an hour';
    var sb = panel.querySelector('.ntf-set'); sb.textContent = view === 'set' ? 'Back' : 'Settings'; sb.setAttribute('aria-pressed', view === 'set' ? 'true' : 'false');
    var why = sz ? 'Snoozed until ' + new Date(sz).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '. Alerts still land here.' : inQuiet() ? 'Quiet hours: no pop-ups until ' + S.quiet.to + '.' : S.digest ? 'Digest mode: one summary a day. Alerts still land here.' : '';
    bar.hidden = !why; bar.textContent = why;
    var ft = panel.querySelector('.ntf-ft'); ft.innerHTML = '';
    if (view === 'list') {
      var clr = el('button', 'ntf-ib', 'Clear all'); clr.type = 'button'; clr.onclick = function () { list = []; saveList(); paint(); renderList(); }; ft.appendChild(clr);
      { var tk = el('a', 'ntf-ib', '🎟️ Tickets' + (window.ArcadeTickets ? ': ' + ArcadeTickets.balance() : '')); tk.href = 'tickets.html'; tk.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;text-decoration:none'; ft.appendChild(tk); }
      renderList();
    } else renderSettings();
  }
  function renderList() {
    var body = panel.querySelector('.ntf-body'); body.innerHTML = '';
    if (!list.length) { body.appendChild(el('div', 'ntf-empty', 'No notifications yet. Messages, friend requests, tournament matches and updates to games you follow show up here.')); return; }
    list.forEach(function (n) {
      var a = el('a', 'ntf-it' + (n.rd ? '' : ' new') + (n.hp ? ' hp' : '')); a.href = n.href || '#notifications';
      if (n.href === '#notifications') a.onclick = function (e) { e.preventDefault(); };
      var ic = el('span', 'ntf-ic', ICON[n.ty] || '🔔'); ic.setAttribute('aria-hidden', 'true');
      var tx = el('span', 'ntf-tx'); tx.appendChild(el('b', '', n.who || 'The Arcade')); if (n.tx) tx.appendChild(el('span', '', n.tx));
      var tm = el('time', '', ago(n.t)); tm.dateTime = new Date(n.t).toISOString(); tx.appendChild(tm);
      a.appendChild(ic); a.appendChild(tx); body.appendChild(a);
    });
  }
  function check(label, small, on, set) {
    var l = el('label', 'ntf-row'), c = el('input'); c.type = 'checkbox'; c.checked = !!on;
    c.onchange = function () { set(c.checked); saveSettings(); paint(); };
    var t = el('span'); t.appendChild(document.createTextNode(label)); if (small) t.appendChild(el('small', '', small));
    l.appendChild(c); l.appendChild(t); return l;
  }
  function renderSettings() {
    var body = panel.querySelector('.ntf-body'); body.innerHTML = '';
    var fs = function (title) { var f = el('fieldset'); f.appendChild(el('legend', '', title)); body.appendChild(f); return f; };
    var t = fs('What to tell me about');
    TYPES.forEach(function (x) {
      t.appendChild(check(x[1], x[2], S.types[x[0]], function (v) { S.types[x[0]] = v ? 1 : 0; }));
    });
    t.appendChild(el('p', 'ntf-note', 'Turned off means no pop-up and nothing in the list.'));

    var q = fs('Quiet hours');
    q.appendChild(check('Quiet hours', 'No pop-ups, sounds or browser alerts at these times. Alerts still land in the list.', S.quiet.on, function (v) { S.quiet.on = v ? 1 : 0; render(); }));
    var times = el('div'); times.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:4px 0 4px 27px';
    var mk = function (lab, k) { var l = el('label'); l.style.cssText = 'display:flex;gap:6px;align-items:center'; l.appendChild(document.createTextNode(lab)); var i = el('input'); i.type = 'time'; i.value = S.quiet[k]; i.onchange = function () { if (/^\d{2}:\d{2}$/.test(i.value)) { S.quiet[k] = i.value; saveSettings(); } }; l.appendChild(i); return l; };
    times.appendChild(mk('From', 'from')); times.appendChild(mk('to', 'to')); q.appendChild(times);
    q.appendChild(check('Let tournament matches through', 'A match that’s ready still pops up and chimes.', S.quiet.match, function (v) { S.quiet.match = v ? 1 : 0; }));

    var d = fs('Fewer pop-ups');
    d.appendChild(check('Daily digest', 'One summary a day (after ' + (+S.digestAt > 12 ? (+S.digestAt - 12) + 'pm' : S.digestAt + 'am') + ') instead of a pop-up for each alert. Tournament matches still come straight away.', S.digest, function (v) { S.digest = v ? 1 : 0; render(); }));
    d.appendChild(check('Chime for tournament matches', 'A short sound when your match is ready.', S.sound, function (v) { S.sound = v ? 1 : 0; if (v) chime(); }));
    d.appendChild(check('Count on the browser tab', 'Shows new alerts in the tab’s title, like “(3) The Arcade”.', S.title, function (v) { S.title = v ? 1 : 0; }));

    var s = fs('Alerts outside the page');
    var sup = typeof Notification !== 'undefined';
    var perm = sup ? Notification.permission : 'unsupported';
    s.appendChild(check('Browser alerts', sup ? (perm === 'denied' ? 'Blocked in this browser’s site settings. Allow notifications for The Arcade there first.' : 'Your browser shows alerts while The Arcade is open in another tab or in the background.') : 'This browser can’t show them.', S.system && perm === 'granted', function (v) {
      if (!v) { S.system = 0; return; }
      if (!sup) { S.system = 0; render(); return; }
      Notification.requestPermission().then(function (p) { S.system = p === 'granted' ? 1 : 0; saveSettings(); render(); if (p === 'granted') system({ id: 'test', who: 'The Arcade', tx: 'Browser alerts are on.', href: location.href }); });
    }));
    s.appendChild(el('p', 'ntf-note', 'With every Arcade tab closed you won’t get alerts yet: that needs push from the server, which isn’t built.'));

    var g = fs('Games I follow');
    g.appendChild(el('p', 'ntf-note', 'You get an alert when a game you follow is updated. Nothing for the others.'));
    var f = follows(), box = el('div', 'ntf-games');
    games().slice().sort(function (a, b) { return a.title.localeCompare(b.title); }).forEach(function (x) { box.appendChild(check(x.title, '', !!f[x.id], function (v) { setFollow(x.id, v); })); });
    var played = el('button', 'ntf-ib', 'Follow every game I’ve played'); played.type = 'button'; played.style.marginTop = '6px';
    played.onclick = function () { var p = (window.Arcade && Arcade.played && Arcade.played()) || {}; Object.keys(p).forEach(function (id) { if (!follows()[id]) setFollow(id, true); }); render(); };
    g.appendChild(played); g.appendChild(box);

    var st = fs('Streamers I follow');
    st.appendChild(el('p', 'ntf-note', 'There are no streams on The Arcade yet. When there are, you’ll hear when these players go live.'));
    var chips = el('div', 'ntf-chips');
    streamFollows().forEach(function (n) { var c = el('span', 'ntf-chip', n), x = el('button', '', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Stop following ' + n); x.onclick = function () { ls.put(K_STREAMS, streamFollows().filter(function (y) { return !same(y, n); })); render(); }; c.appendChild(x); chips.appendChild(c); });
    var row = el('div'); row.style.cssText = 'display:flex;gap:6px;margin-top:6px';
    var inp = el('input'); inp.type = 'text'; inp.placeholder = 'Username'; inp.maxLength = 16; inp.setAttribute('aria-label', 'Username to follow'); inp.style.flex = '1';
    var add = el('button', 'ntf-ib', 'Follow'); add.type = 'button';
    add.onclick = function () { var v = inp.value.trim(); if (!/^[A-Za-z0-9_]{3,16}$/.test(v)) { inp.focus(); return; } var l = streamFollows(); if (!l.some(function (y) { return same(y, v); })) { l.push(v); ls.put(K_STREAMS, l.slice(-50)); } render(); };
    row.appendChild(inp); row.appendChild(add); st.appendChild(row); st.appendChild(chips);
  }

  /* ---------- start ---------- */
  function start() {
    if (!addButton()) { paintTitle(); return; }
    // account.js and assistant.js add their buttons on start too: keep the bell just before them
    var tries = 0, t = setInterval(function () { var top = document.querySelector('header.top'); if (top && btn) place(top); if (++tries > 24) clearInterval(t); }, 250);
    paint();
    var tt = document.querySelector('head > title');
    if (tt && window.MutationObserver) new MutationObserver(paintTitle).observe(tt, { childList: true, characterData: true, subtree: true });
    if (location.hash === '#notifications') open();
    addEventListener('hashchange', function () { if (location.hash === '#notifications') { open(); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} } });
    var a = A(); if (a && a.onLive) a.onLive(onLive);
    followButton();
    setTimeout(updateCheck, 1500);
    digestCheck(); tournTick();
    setInterval(function () { tournTick(); digestCheck(); if (isOpen() && view === 'list') renderList(); }, 10000);
    setInterval(function () { if (btn) btn.classList.toggle('snz', !!snoozedUntil()); }, 30000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.ArcadeNotify = {
    intercept: intercept,
    // other code: ArcadeNotify.push({ ty: 'streams' | 'updates' | ..., who, tx, href, hp, quiet })
    push: function (n) { if (!n || !n.ty) return false; return deliver({ ty: String(n.ty), who: n.who, tx: n.tx, href: n.href, hp: n.hp ? 1 : 0 }, { noPop: !!n.quiet }); }, // quiet: list it, no pop-up
    open: open, close: close, isOpen: isOpen, unread: unread,
    follow: setFollow, follows: follows, streamFollows: streamFollows,
    snooze: function (ms) { ls.set(K_SNOOZE, String(Date.now() + (ms || 3600e3))); paint(); },
    _test: { onTourney: onTourney, inQuiet: inQuiet, loud: loud, settings: function () { return S; }, list: function () { return list; }, updateCheck: updateCheck, digestCheck: digestCheck, tournTick: tournTick },
  };
})();
