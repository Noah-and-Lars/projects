/* The Arcade: accounts and cloud saves (2026-11-01)
   - An online account is a unique username and a password (no email). It lives on the arcade's Cloudflare
     Worker (realtime-worker/, routes under /acct/). The browser stretches the password with PBKDF2 and only
     ever sends that key. A recovery code shown once at sign-up resets a forgotten password.
   - A local account is just a name kept in this browser (arcade-local). Choosing it takes three "are you sure"
     popups; it can be turned into an online account later without losing anything.
   - Every game keeps saving in localStorage as before. This file copies each game's entries (GROUPS) up to the
     account and down to other devices: on load, every 45 s when something changed, and when the page is hidden.
     A group that changed on both sides keeps the copy with more progress (score()).
   - The name you see in every game is the account's (or the local account's) name. The games read it from
     localStorage (arcade-acct / arcade-local) in their <script id="arcade-name"> block; it can't be changed in a game.
   Loaded by index.html, play.html and chat.html. window.ArcadeAccount is the interface. */
(function () {
  'use strict';
  var API = 'https://arcade-realtime.arcade-realtime.workers.dev/acct/';
  try { if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && localStorage.getItem('arcade-acct-api')) API = localStorage.getItem('arcade-acct-api'); } catch (e) {} // tests only: a local copy of the server
  var K_ACCT = 'arcade-acct', K_LOCAL = 'arcade-local', K_SYNC = 'arcade-acct-sync';
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    json: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    keys: function () { var o = []; try { for (var i = 0; i < localStorage.length; i++) o.push(localStorage.key(i)); } catch (e) {} return o; }
  };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* ---------- which saved entries belong to which game ---------- */
  var GROUPS = [
    ['throttle-ridge', /^throttle-ridge\./],
    ['turn-turn-turn', /^turnturnturn\./],
    ['siege', /^siege\./],
    ['card-royale', /^cardroyale\./],
    ['uno', /^uno\./],
    ['cube-assault', /^(cubeAssault|caE2$)/],
    ['havoc-bay', /^havocbay\./],
    ['rocket-rivals', /^rivals\./],
    ['football', /^soccer\./],
    ['bull-run', /^bullRun/],
    ['chess', /^chessSave$/],
    ['checkers', /^checkersSave$/],
    ['russian-roulette', /^russianRoulette/],
    ['gamble-your-life-away', /^gambleLife/],
    ['cube-tower-defense', /^cubeTD/],
    ['free-criminal', /^freecriminal\./],
    ['block-drop', /^blockdrop-/],
    ['2048', /^2048-/],
    ['poly-racer', /^polyracer/],
    ['blockcraft', /^blockcraft-(?!.*-backup-1x$)/],
    ['arcade', /^arcade-(played|popup-closed|tos-agreed|chat-muted)$/]
  ];
  // this device's own things, never copied: the account itself, ids, the chat log, anti-cheat bookkeeping, old backups
  var NEVER = /^(arcade-(acct|local|online-id|chat-id|chat-log|chat-cleared|chat-name)|caLedger$|caReset1$|sb-)|-backup-1x$/;
  function groupOf(k) {
    if (!k || NEVER.test(k)) return null;
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i][1].test(k)) return GROUPS[i][0];
    return 'misc';
  }
  function localGroups() {
    var out = {};
    ls.keys().forEach(function (k) { var g = groupOf(k); if (!g) return; var v = ls.get(k); if (v == null) return; (out[g] || (out[g] = {}))[k] = v; });
    return out;
  }
  function hash(d) {
    if (!d) return '';
    var keys = Object.keys(d).sort(), h1 = 0x811c9dc5, h2 = 0x12345;
    for (var i = 0; i < keys.length; i++) {
      var s = keys[i] + '\u0001' + d[keys[i]] + '\u0002';
      for (var j = 0; j < s.length; j++) { var c = s.charCodeAt(j); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822507) + 13; }
    }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + keys.length.toString(36);
  }
  // how much progress a game's saves hold, to pick a side when a device and the account both changed
  function score(g, d) {
    if (!d) return -1;
    var J = function (k) { try { return JSON.parse(d[k] || 'null') || {}; } catch (e) { return {}; } }, N = function (v) { return +v || 0; };
    try {
      switch (g) {
        case 'cube-assault': { var p = J('cubeAssaultProfile'); return N(p.xp) + N(p.best) * 50 + N(p.stats && p.stats.kills) + N(p.coins) * 0.2 + Object.keys(p.owned || {}).length * 100; }
        case 'siege': { var sg = J('siege.profile'); return N(sg.xp) + N(sg.matches) * 50; }
        case 'havoc-bay': { var h = J('havocbay.profile.v1'); return N(h.matches) * 100 + N(h.kills) + N(h.wins) * 50; }
        case 'rocket-rivals': { var r = J('rivals.profile'); return N(r.level) * 1000 + N(r.xp) + N(r.stats && r.stats.matches) * 10; }
        case 'football': { var f = J('soccer.profile'); return N(f.played) * 100 + N(f.wins) * 10 + JSON.stringify(f).length * 0.01; }
        case 'bull-run': { var b = J('bullRunSave'); return N(b.stats && b.stats.best) + N(b.day) * 10; }
        case 'chess': { var c = J('chessSave'), n = 0, o = c.online || {}; Object.keys(c.stats || {}).forEach(function (l) { var s = c.stats[l] || {}; n += N(s.w) + N(s.l) + N(s.d); }); return n + N(o.w) + N(o.l) + N(o.d) + (c.rating ? N(c.rating.n) : 0); }
        case 'checkers': { var ck = J('checkersSave'), kn = 0, ko = ck.online || {}; Object.keys(ck.stats || {}).forEach(function (l) { var s = ck.stats[l] || {}; kn += N(s.w) + N(s.l) + N(s.d); }); return kn + N(ko.w) + N(ko.l) + N(ko.d) + (ck.rating ? N(ck.rating.n) : 0); }
        case 'russian-roulette': { var x = J('russianRouletteSave'); return N(x.best) * 10 + N(x.games) + N(x.onGames); }
        case 'gamble-your-life-away': { var y = J('gambleLifeSave'); return N(y.rounds) + N(y.peak) * 1e-6; }
        case 'cube-tower-defense': { var t = J('cubeTDProfile'); return N(t.level) * 1000 + N(t.best) * 10 + N(t.xp); }
        case 'card-royale': { var cr = J('cardroyale.save'), cn = 0; for (var ck in (cr.cards || {})) cn += 10 + N(cr.cards[ck].lv) * 5; return N(cr.kl) * 1000 + N(cr.xp) + N(cr.tr) + cn + N(cr.wins) + N(cr.losses); }
        case 'turn-turn-turn': { var tt = J('turnturnturn.save'); return N(tt.runs) * 10 + Object.keys(tt.best || {}).length * 100; }
        case 'block-drop': return N(d['blockdrop-best']);
        case '2048': return N(d['2048-best']);
        case 'poly-racer': { var q = J('polyracer'); return Object.keys(q.best || {}).length * 1000 + JSON.stringify(q).length * 0.001; }
      }
    } catch (e) {}
    var len = 0; for (var k in d) len += d[k].length; return len;
  }

  /* ---------- the account in this browser ---------- */
  var acct = ls.json(K_ACCT), local = ls.json(K_LOCAL), syncMap = ls.json(K_SYNC) || {};
  if (acct && (!acct.name || !acct.token)) acct = null;
  var state = { status: acct ? 'idle' : 'off', last: 0, err: '' };
  function saveSync() { ls.set(K_SYNC, JSON.stringify(syncMap)); }
  function name() { return (acct && acct.name) || (local && local.name) || ''; }
  function kind() { return acct ? 'online' : local && local.name ? 'local' : ''; }

  /* ---------- the server ---------- */
  /* this browser's device id (2026-11-12): random, kept in localStorage and a cookie, sent with every account request so
     the owner can ban a device (admin op 'devban'). It says nothing about the person or the hardware. */
  var devId = (function () {
    var re = /^[a-z0-9]{12,40}$/, d = '';
    try { d = localStorage.getItem('arcade-dev-id') || ''; } catch (e) {}
    if (!re.test(d)) { var m = /(?:^|; )arcade_dev=([a-z0-9]+)/.exec(document.cookie || ''); d = m ? m[1] : ''; }
    if (!re.test(d)) { var b = crypto.getRandomValues(new Uint8Array(12)); d = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(36)).slice(-2); }).join('').slice(0, 20).padEnd(16, '0'); }
    try { localStorage.setItem('arcade-dev-id', d); } catch (e) {}
    try { document.cookie = 'arcade_dev=' + d + '; max-age=315360000; path=/; samesite=lax'; } catch (e) {}
    return d;
  })();
  function deviceBanned() { // this device is banned: sign out here and say so
    if (acct) { acct = null; ls.del(K_ACCT); setStatus('off'); refresh(); }
    if (!deviceBanned.shown) { deviceBanned.shown = 1; setTimeout(function () { alert('This device has been banned from The Arcade.'); }, 300); }
  }
  function api(path, opt) {
    opt = opt || {};
    var headers = { 'content-type': 'application/json', 'x-arcade-dev': devId };
    if (opt.auth) { if (!acct) return Promise.resolve({ error: 'auth', status: 401 }); headers.authorization = 'Bearer ' + acct.token; }
    return fetch(API + path, { method: opt.method || 'GET', headers: headers, body: opt.body ? JSON.stringify(opt.body) : undefined, keepalive: !!opt.keepalive, cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j = j || {}; j.status = r.status; if (r.status === 401 && opt.auth && j.error === 'auth') signedOutElsewhere(); if (r.status === 403 && j.error === 'device_banned') deviceBanned(); return j; }); })
      .catch(function () { return { error: 'offline', status: 0 }; });
  }
  // after a rename the password key still uses the name it was made with (the server says which: check's kn)
  function keyName(n) { return api('check?name=' + encodeURIComponent(n)).then(function (r) { return (r && r.kn) || n; }, function () { return n; }); }
  function stretch(n, pw) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) { return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('arcade-account:' + n.toLowerCase()), iterations: 150000 }, k, 256); })
      .then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join(''); });
  }
  // The owner's name is off-limits as a username, in any disguise. Kept as char codes so the name itself
  // never appears in the source. norm() folds case, common leet swaps, spaces and punctuation away first.
  function norm(n) {
    return String(n || '').toLowerCase()
      .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a')
      .replace(/[^a-z]/g, '');
  }
  var OWN_FIRST = String.fromCharCode(110, 111, 97, 104), OWN_LAST = String.fromCharCode(116, 97, 106, 101, 114);
  // the full name, in any form — blocked for everyone, including accounts that already have it (they get locked out)
  function reservedName(n) {
    var s = norm(n);
    if (s === OWN_FIRST) return false; // the one reserved first name is allowed (that account is the owner's)
    return s.indexOf(OWN_FIRST + OWN_LAST) !== -1 || (s.indexOf(OWN_FIRST) !== -1 && s.indexOf(OWN_LAST) !== -1);
  }
  // the bare first name is reserved to the owner: nobody new may take it
  function ownerOnly(n) { return norm(n) === OWN_FIRST; }
  function nameError(n) {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) return 'Use 3 to 16 letters, numbers or underscores (no spaces).';
    if (reservedName(n) || ownerOnly(n)) return 'That name isn’t allowed. Pick another.';
    return '';
  }
  var WHY = { device_banned: 'This device has been banned from The Arcade.', format: 'Use 3 to 16 letters, numbers or underscores (no spaces).', reserved: 'That name is reserved. Pick another.', rude: 'Pick a different name.', taken: 'That username is taken. Pick another.' };

  /* ---------- syncing ---------- */
  var busy = null, pulledHandlers = [];
  function writeGroup(g, d) {
    ls.keys().forEach(function (k) { if (groupOf(k) === g && !(d && k in d)) ls.del(k); });
    if (d) Object.keys(d).forEach(function (k) { if (groupOf(k) === g) ls.set(k, d[k]); });
  }
  function upload(g, d, base, force) {
    var h = hash(d);
    return api('game?g=' + encodeURIComponent(g), { method: 'PUT', auth: true, body: { d: d, h: h, base: base, force: !!force } }).then(function (r) {
      if (r.status === 200 && r.at) { syncMap[g] = { h: h, at: r.at }; return 'up'; }
      if (r.status === 409) return 'conflict';
      return 'fail';
    });
  }
  function download(g) {
    return api('game?g=' + encodeURIComponent(g), { auth: true }).then(function (r) {
      if (r.status !== 200 || !r.at) return null;
      return r;
    });
  }
  // both sides changed (or this device has never synced this game): keep the one with more progress
  function settle(g, L, S) {
    return download(g).then(function (r) {
      if (!r) return 'fail';
      var cloud = r.d || null;
      if (score(g, cloud) > score(g, L)) { writeGroup(g, cloud); syncMap[g] = { h: hash(cloud), at: r.at }; return 'down'; }
      return upload(g, L, r.at, true);
    });
  }
  // one full pass: compare every game with the account and move whatever is newer
  function sync(why) {
    if (!acct) return Promise.resolve(null);
    if (busy) return busy;
    setStatus('syncing');
    busy = api('sync', { auth: true }).then(function (meta) {
      if (meta.status !== 200 || !meta.games) { setStatus(meta.status === 0 ? 'offline' : 'error'); return null; }
      var L = localGroups(), S = meta.games, pulled = [], names = {};
      Object.keys(L).forEach(function (g) { names[g] = 1; }); Object.keys(S).forEach(function (g) { names[g] = 1; });
      var chain = Promise.resolve();
      Object.keys(names).forEach(function (g) {
        chain = chain.then(function () {
          var d = L[g] || null, lh = hash(d), s = S[g], rec = syncMap[g];
          if (!s && !d) return;
          if (!s) return upload(g, d, undefined).then(function (x) { if (x === 'conflict') return settle(g, d, s); });
          if (s.h && s.h === lh) { syncMap[g] = { h: lh, at: s.at }; return; }
          if (!d) return download(g).then(function (r) { if (r && r.d) { writeGroup(g, r.d); syncMap[g] = { h: hash(r.d), at: r.at }; pulled.push(g); } });
          if (rec && rec.h === lh && rec.at !== s.at) return download(g).then(function (r) { if (r && r.d) { writeGroup(g, r.d); syncMap[g] = { h: hash(r.d), at: r.at }; pulled.push(g); } });
          if (rec && rec.at === s.at) return upload(g, d, s.at).then(function (x) { if (x === 'conflict') return settle(g, d, s).then(function (y) { if (y === 'down') pulled.push(g); }); });
          return settle(g, d, s).then(function (y) { if (y === 'down') pulled.push(g); });
        });
      });
      if (meta.mustRename && !$('acRenF')) openRename(true); // 2026-11-11: this account's name went to someone else
      return chain.then(function () {
        saveSync(); state.last = Date.now(); setStatus('ok');
        if (meta.soc) setSocial(meta.soc);
        sendProfile();
        if (pulled.length) pulledHandlers.forEach(function (f) { try { f(pulled); } catch (e) {} });
        return pulled;
      });
    }).catch(function () { setStatus('error'); return null; }).then(function (x) { busy = null; return x; });
    return busy;
  }
  // quick check: upload only the games that changed since the last sync (no request when nothing did)
  function push(keepalive) {
    if (!acct || busy) return;
    var L = localGroups(), todo = Object.keys(L).filter(function (g) { var r = syncMap[g]; return !r || r.h !== hash(L[g]); });
    if (!todo.length) return;
    if (keepalive) { // the page is going away: send what fits in a keepalive request
      todo.forEach(function (g) { var d = L[g], body = JSON.stringify({ d: d, h: hash(d), base: syncMap[g] && syncMap[g].at }); if (body.length < 60000 && syncMap[g]) api('game?g=' + encodeURIComponent(g), { method: 'PUT', auth: true, body: JSON.parse(body), keepalive: true }); });
      return;
    }
    sync('push');
  }

  /* ---------- the Players page: friend requests, unread messages, best scores (2026-11-06) ---------- */
  // the sync answer carries how many friend requests and unread messages are waiting (no extra request)
  var social = null, socialHandlers = [];
  function setSocial(c) {
    social = { req: +c.req || 0, un: +c.un || 0 };
    var n = social.req + social.un, el = $('plN'); // the count on the Players tab in the header
    if (el) { el.textContent = n > 99 ? '99+' : n; el.hidden = !n; el.title = social.req + ' friend request(s), ' + social.un + ' unread message(s)'; }
    socialHandlers.forEach(function (f) { try { f(social); } catch (e) {} });
  }
  // everyone's best in each game (games.js stat(), worked out here from this device's saves), sent only when it changed
  function sendProfile() {
    if (!acct || !window.GAMES || !window.Arcade) return;
    var s = {}; GAMES.forEach(function (g) { var v = Arcade.stat(g); if (v) s[g.id] = String(v); });
    var j = JSON.stringify(s), last = ls.get('arcade-acct-prof');
    if (last === acct.name.toLowerCase() + j) return;
    api('profile', { method: 'PUT', auth: true, body: { s: s } }).then(function (r) { if (r.status === 200) ls.set('arcade-acct-prof', acct.name.toLowerCase() + j); });
  }

  /* ---------- live updates and message pop-ups (2026-11-06) ----------
     Every site page holds one WebSocket to the player's own Account object (/acct/ws, the token as the second
     subprotocol). It sleeps on the server between messages (pings are answered by Cloudflare), so it costs one
     request per page view. A private message (not the Global chat) or friend request shows a pop-up in the top right;
     the Players page listens through onLive() instead of opening its own. */
  var live = null, liveTok = '', liveTries = 0, livePing = 0, liveHandlers = [];
  // a tab left in the background for 15 minutes drops this socket; showing it again reconnects (within 2 s)
  var liveIdle = false, liveIdleT = 0;
  document.addEventListener('visibilitychange', function () {
    clearTimeout(liveIdleT);
    if (document.hidden) liveIdleT = setTimeout(function () { if (!document.hidden) return; liveIdle = true; if (live) { var o = live; live = null; liveTok = ''; clearInterval(livePing); try { o.close(); } catch (e) {} } }, 15 * 60 * 1000);
    else if (liveIdle) { liveIdle = false; liveTries = 0; liveConnect(); }
  });
  // 2026-11-11: a page opened inside a call (call.js keeps the call going by showing other pages in a frame over the
  // page the call started on) shares that page's connection and leaves the pop-ups to it
  function shellTop() { try { return window.top !== window && window.top.ArcadeCall && window.top.ArcadeCall.shell && window.top.ArcadeAccount ? window.top : null; } catch (e) { return null; } }
  var inShell = !!shellTop(), shellHooked = false;
  // the chat open on screen (on this page, or in the call's frame) gets no pop-up
  function chatOpen(k) {
    if (window.ArcadeDmOpen === k) return true;
    try { var f = window.ArcadeShellFrame && window.ArcadeShellFrame(); return !!(f && f.ArcadeDmOpen === k); } catch (e) { return false; }
  }
  function liveConnect() {
    if (inShell) {
      if (!shellHooked) { shellHooked = true; var alive = true; addEventListener('pagehide', function () { alive = false; }); shellTop().ArcadeAccount.onLive(function (m) { if (alive) liveHandlers.forEach(function (f) { try { f(m); } catch (e) {} }); }); }
      return;
    }
    if (liveIdle) return;
    var tok = acct ? acct.token : '';
    if (tok === liveTok && (live || !tok)) return;
    if (live) { var o = live; live = null; try { o.close(); } catch (e) {} }
    liveTok = tok;
    if (!tok || typeof WebSocket === 'undefined') return;
    var s; try { s = new WebSocket(API.replace(/^http/, 'ws') + 'ws', ['arcade', tok]); } catch (e) { return; }
    live = s;
    var heard = Date.now(), opened = false;
    s.onopen = function () { opened = true; if (liveTries) liveHandlers.forEach(function (f) { try { f({ t: 'social' }); } catch (e) {} }); liveTries = 0; };
    s.onmessage = function (ev) {
      heard = Date.now();
      if (ev.data === 'pong') return;
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      liveHandlers.forEach(function (f) { try { f(m); } catch (e) {} });
      var c = social || { req: 0, un: 0 };
      if (m.t === 'dm' && m.m && !m.m.f) {
        if (!chatOpen(m.k)) { setSocial({ req: c.req, un: c.un + 1 }); toast(m.n, m.m.t, 'players.html#dm=' + encodeURIComponent(m.n)); }
      } else if (m.t === 'gm' && m.m && !m.m.f) { // a group message (2026-11-11)
        if (!chatOpen(m.k)) { setSocial({ req: c.req, un: c.un + 1 }); toast(m.n, (m.m.by ? m.m.by + ': ' : '') + m.m.t, 'players.html#g=' + encodeURIComponent(m.k.slice(2))); }
      } else if (m.t === 'grp' && m.fresh && m.c) {
        setSocial({ req: c.req, un: c.un + 1 }); toast(m.c.n, (m.by || 'Someone') + ' added you to this group chat', 'players.html#g=' + encodeURIComponent(m.k.slice(2)));
      } else if (m.t === 'friend' && m.v && m.v.st === 'in') {
        setSocial({ req: c.req + 1, un: c.un }); toast(m.v.n, 'wants to be your friend', 'players.html#p=' + encodeURIComponent(m.v.n));
      } else if (m.t === 'friend' && m.v && m.v.st === 'f') toast(m.v.n, 'is now your friend', 'players.html#p=' + encodeURIComponent(m.v.n));
    };
    s.onclose = function () {
      clearInterval(livePing);
      if (live !== s) return;
      live = null;
      if (!opened && liveTries > 4) return; // the page still works without live updates
      setTimeout(function () { if (liveIdle) return; liveTok = ''; liveConnect(); }, [2000, 5000, 10000, 30000, 60000][Math.min(liveTries++, 4)]);
    };
    clearInterval(livePing);
    livePing = setInterval(function () {
      if (live !== s) return;
      if (Date.now() - heard > 120000) { try { s.close(); } catch (e) {} return; }
      if (s.readyState === 1) try { s.send('ping'); } catch (e) {}
    }, 25000);
  }
  // a pop-up in the top right; other players' text only ever goes in with textContent
  function toast(who, text, href) {
    css();
    var box = $('acctToasts');
    if (!box) { box = document.createElement('div'); box.id = 'acctToasts'; document.body.appendChild(box); }
    var t = document.createElement('a'); t.className = 'acToast'; t.href = href;
    var av = document.createElement('span'); av.className = 'av'; av.textContent = String(who).charAt(0).toUpperCase();
    var tx = document.createElement('span'), b = document.createElement('b'), p = document.createElement('span');
    b.textContent = who; p.textContent = String(text).length > 120 ? String(text).slice(0, 120) + '…' : text;
    tx.appendChild(b); tx.appendChild(p); t.appendChild(av); t.appendChild(tx);
    var x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Close');
    x.onclick = function (e) { e.preventDefault(); e.stopPropagation(); t.remove(); };
    t.appendChild(x);
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 7000);
  }

  /* ---------- signing up, in and out ---------- */
  function signup(n, pw) {
    return stretch(n, pw).then(function (key) { return api('signup', { method: 'POST', body: { name: n, key: key } }); }).then(function (r) {
      if (r.status !== 200 || !r.token) return { error: WHY[r.error] || (r.status === 0 ? 'Couldn’t reach the server. Check your connection.' : 'Something went wrong. Try again.') };
      setAcct({ name: r.name, token: r.token }, true);
      return sync('signup').then(function () { return { ok: true, recovery: r.recovery }; });
    });
  }
  function login(n, pw) {
    return keyName(n).then(function (kn) { return stretch(kn, pw); }).then(function (key) { return api('login', { method: 'POST', body: { name: n, key: key } }); }).then(function (r) {
      if (r.status === 403 && r.error === 'device_banned') return { error: 'This device has been banned from The Arcade.' };
      if (r.status === 403 && r.error === 'banned') return { error: 'This account has been banned.' };
      if (r.status === 429) return { error: 'Too many tries. Wait ' + Math.ceil((r.wait || 600) / 60) + ' minutes and try again.' };
      if (r.status === 404) return { error: 'There’s no account with that username.' };
      if (r.status !== 200 || !r.token) return { error: r.status === 401 ? 'Wrong password.' : r.status === 0 ? 'Couldn’t reach the server. Check your connection.' : 'Something went wrong. Try again.' };
      setAcct({ name: r.name, token: r.token }, true);
      return sync('login').then(function () { return { ok: true }; });
    });
  }
  function recover(n, code, pw) {
    return stretch(n, pw).then(function (key) { return api('recover', { method: 'POST', body: { name: n, code: code, key: key } }); }).then(function (r) {
      if (r.status === 403 && r.error === 'device_banned') return { error: 'This device has been banned from The Arcade.' };
      if (r.status === 403 && r.error === 'banned') return { error: 'This account has been banned.' };
      if (r.status === 429) return { error: 'Too many tries. Wait ' + Math.ceil((r.wait || 600) / 60) + ' minutes and try again.' };
      if (r.status === 404) return { error: 'There’s no account with that username.' };
      if (r.status !== 200 || !r.token) return { error: r.status === 401 ? 'That recovery code isn’t right.' : 'Something went wrong. Try again.' };
      setAcct({ name: r.name, token: r.token }, true);
      return sync('login').then(function () { return { ok: true, recovery: r.recovery }; });
    });
  }
  function setAcct(a, fresh) {
    acct = a; ls.set(K_ACCT, JSON.stringify(a));
    if (fresh) { syncMap = {}; saveSync(); }
    if (local) { local.chose = true; ls.set(K_LOCAL, JSON.stringify(local)); }
    setStatus('idle'); refresh();
  }
  // signing out: the progress is safe in the account, so this device's copy of it is cleared
  function logout() {
    var done = function () {
      ls.keys().forEach(function (k) { if (groupOf(k) && groupOf(k) !== 'arcade') ls.del(k); });
      acct = null; ls.del(K_ACCT); syncMap = {}; ls.del(K_SYNC); local = null; ls.del(K_LOCAL);
      setStatus('off'); refresh(); location.reload();
    };
    return sync('logout').then(function () { return api('logout', { method: 'POST', auth: true, body: {} }); }).then(done, done);
  }
  function signedOutElsewhere() { // the password was changed or reset on another device
    if (!acct) return;
    acct = null; ls.del(K_ACCT); setStatus('off'); refresh();
    setTimeout(function () { openWelcome('login', 'You were signed out of this device. Log in again.'); }, 300);
  }
  function changePassword(oldPw, newPw) {
    return keyName(acct.name).then(function (kn) { return Promise.all([stretch(kn, oldPw), stretch(acct.name, newPw)]); }).then(function (k) { return api('password', { method: 'POST', auth: true, body: { old: k[0], key: k[1] } }); }).then(function (r) {
      if (r.status === 200 && r.token) { acct.token = r.token; ls.set(K_ACCT, JSON.stringify(acct)); return { ok: true }; }
      return { error: r.status === 401 ? 'Your current password is wrong.' : 'Something went wrong. Try again.' };
    });
  }
  function setLocal(n) { local = { name: n, chose: true, at: Date.now() }; ls.set(K_LOCAL, JSON.stringify(local)); refresh(); }

  /* ---------- the look ---------- */
  var CSS = '' +
    '#acctToasts{position:fixed;top:calc(max(12px,env(safe-area-inset-top)) + 58px);right:14px;z-index:2147483000;display:flex;flex-direction:column;gap:8px;width:min(340px,calc(100vw - 28px));pointer-events:none}' +
    '.acToast{pointer-events:auto;display:flex;align-items:center;gap:10px;padding:10px 10px 10px 12px;border-radius:14px;background:rgba(27,24,53,.96);border:1px solid #6c5ce7;box-shadow:0 12px 36px #000a;color:#f1effa;font:14px/1.35 system-ui,sans-serif;text-decoration:none;animation:acT .3s ease-out;transition:opacity .4s,transform .4s}' +
    '.acToast.out{opacity:0;transform:translateX(20px)}@keyframes acT{from{opacity:0;transform:translateX(30px)}}' +
    '.acToast .av{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#6c5ce7,#00d2a8);font-weight:800}' +
    '.acToast>span:nth-child(2){flex:1;min-width:0}.acToast b{display:block}.acToast>span>span{display:block;color:#a9a3c9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.acToast button{flex:none;width:26px;height:26px;border-radius:7px;border:0;background:#ffffff14;color:#f1effa;font-size:16px;line-height:1;cursor:pointer}' +
    '#acctBtn{margin-left:10px;display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:999px;border:1px solid #ffffff22;background:#1b1835;color:#f1effa;font:600 14px system-ui,sans-serif;cursor:pointer;white-space:nowrap;flex:none}' +
    '#acctBtn:hover{border-color:#6c5ce7}#acctBtn .av{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#6c5ce7,#00d2a8);font-weight:800;color:#fff}' +
    '#acctBtn .dot{width:8px;height:8px;border-radius:50%;background:#00d2a8}#acctBtn .dot.local{background:#f5b041}#acctBtn .dot.sync{background:#6cb6ff;animation:acctP 1s infinite}#acctBtn .dot.err{background:#ff6b6b}' +
    '@keyframes acctP{50%{opacity:.3}}@media (max-width:620px){#acctBtn .nm{display:none}#acctBtn{padding:4px}}' +
    '#acctOv{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;background:rgba(8,7,20,.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;font:15px/1.5 system-ui,-apple-system,sans-serif;color:#f1effa}' +
    '#acctOv .box{width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#1b1835;border:1px solid #ffffff1c;border-radius:18px;padding:24px 22px;box-shadow:0 24px 70px rgba(0,0,0,.55)}' +
    '#acctOv h2{margin:0 0 6px;font-size:22px}#acctOv p{margin:0 0 12px;color:#a9a3c9}#acctOv .big{font-size:40px;line-height:1;margin-bottom:8px}' +
    '#acctOv .tabs{display:flex;gap:6px;margin:14px 0 12px;background:#0f0d1f;border-radius:12px;padding:4px}#acctOv .tabs button{flex:1;padding:8px;border:0;border-radius:9px;background:none;color:#a9a3c9;font:600 14px system-ui,sans-serif;cursor:pointer}#acctOv .tabs button.on{background:#6c5ce7;color:#fff}' +
    '#acctOv label{display:block;font-size:13px;font-weight:600;color:#cfcae8;margin:10px 0 4px}#acctOv input[type=text],#acctOv input[type=password]{width:100%;padding:11px 12px;border-radius:10px;border:1px solid #ffffff22;background:#0f0d1f;color:#fff;font:15px system-ui,sans-serif;outline:none}#acctOv input:focus{border-color:#6c5ce7}' +
    '#acctOv .hint{font-size:12px;color:#8f89b3;margin-top:4px;min-height:16px}#acctOv .hint.bad{color:#ff8a80}#acctOv .hint.good{color:#00d2a8}#acctOv .err{color:#ff8a80;font-size:14px;margin:10px 0 0;min-height:18px}' +
    '#acctOv .go{width:100%;margin-top:16px;padding:12px;border:0;border-radius:12px;background:linear-gradient(135deg,#6c5ce7,#5a4bd6);color:#fff;font:700 16px system-ui,sans-serif;cursor:pointer}#acctOv .go:disabled{opacity:.5;cursor:default}' +
    '#acctOv .alt{display:block;width:100%;margin-top:10px;padding:10px;border:1px solid #ffffff22;border-radius:12px;background:none;color:#cfcae8;font:600 14px system-ui,sans-serif;cursor:pointer}#acctOv .link{background:none;border:0;color:#8f89b3;font:13px system-ui,sans-serif;text-decoration:underline;cursor:pointer;display:block;margin:14px auto 0}' +
    '#acctOv .code{font:700 24px ui-monospace,Menlo,monospace;letter-spacing:2px;text-align:center;background:#0f0d1f;border:1px dashed #6c5ce7;border-radius:12px;padding:14px;margin:8px 0 12px;user-select:all}' +
    '#acctOv .perks{margin:4px 0 0;padding:0;list-style:none}#acctOv .perks li{padding:6px 0 6px 28px;position:relative;color:#d8d4f0}#acctOv .perks li:before{content:"\\2714";position:absolute;left:4px;color:#00d2a8;font-weight:800}' +
    '#acctOv .stats{margin:12px 0 0;border-top:1px solid #ffffff14}#acctOv .stats div{display:flex;justify-content:space-between;gap:12px;padding:8px 2px;border-bottom:1px solid #ffffff0d;font-size:14px}#acctOv .stats b{font-weight:600}#acctOv .stats span{color:#a9a3c9;text-align:right}' +
    '#acctOv .head{display:flex;align-items:center;gap:12px;margin-bottom:6px}#acctOv .head .av{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#6c5ce7,#00d2a8);font-weight:800;font-size:22px;color:#fff;flex:none}' +
    '#acctOv .pill{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:#00d2a822;color:#00d2a8}#acctOv .pill.local{background:#f5b04122;color:#f5b041}#acctOv .row{display:flex;gap:8px}#acctOv .row>*{flex:1}' +
    '#acctOv .x{float:right;background:none;border:0;color:#8f89b3;font-size:22px;cursor:pointer;line-height:1;margin:-8px -6px 0 0}#acctOv .warn{background:#f5b04114;border:1px solid #f5b04144;color:#ffd58a;border-radius:12px;padding:10px 12px;font-size:14px;margin:10px 0}';
  function css() { if ($('acctCss')) return; var st = document.createElement('style'); st.id = 'acctCss'; st.textContent = CSS; document.head.appendChild(st); }
  function overlay(html, closable) {
    css(); closeOv();
    var d = document.createElement('div'); d.id = 'acctOv'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = '<div class="box">' + (closable ? '<button class="x" data-x aria-label="Close">×</button>' : '') + html + '</div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (e) { if (closable && (e.target === d || (e.target.closest && e.target.closest('[data-x]')))) closeOv(); });
    d.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape' && closable) closeOv(); });
    d.addEventListener('keyup', function (e) { e.stopPropagation(); });
    var f = d.querySelector('input'); if (f) setTimeout(function () { f.focus(); }, 30);
    return d;
  }
  function closeOv() { var o = $('acctOv'); if (o) o.remove(); }

  /* ---------- the welcome popup: create an account, log in, or a local account ---------- */
  function openWelcome(tab, note) {
    tab = tab || 'signup';
    var html = '<div class="big">☁️</div><h2>' + (tab === 'login' ? 'Welcome back' : 'Save your progress everywhere') + '</h2>' +
      '<p>' + esc(note || 'Make a free Arcade account and your progress in every game is saved online. Play on any device and pick up where you left off.') + '</p>' +
      '<div class="tabs"><button data-tab="signup"' + (tab === 'signup' ? ' class="on"' : '') + '>Create account</button><button data-tab="login"' + (tab === 'login' ? ' class="on"' : '') + '>Log in</button></div>';
    if (tab === 'signup') {
      html += '<form id="acF" autocomplete="off"><label for="acN">Username</label><input type="text" id="acN" maxlength="16" spellcheck="false" autocapitalize="off" value="' + esc(suggest()) + '"><div class="hint" id="acNh">This is your name in every game. Nobody else can ever use it.</div>' +
        '<label for="acP">Password</label><input type="password" id="acP" maxlength="100" autocomplete="new-password"><label for="acP2">Password again</label><input type="password" id="acP2" maxlength="100" autocomplete="new-password">' +
        '<div class="err" id="acE"></div><button class="go" id="acGo">Create my account</button></form>' +
        (localGames() ? '<p style="margin:12px 0 0;font-size:13px">Your progress on this device (' + localGames() + ') moves into your new account.</p>' : '');
    } else if (tab === 'login') {
      html += '<form id="acF" autocomplete="on"><label for="acN">Username</label><input type="text" id="acN" maxlength="16" spellcheck="false" autocapitalize="off" autocomplete="username"><label for="acP">Password</label><input type="password" id="acP" maxlength="100" autocomplete="current-password">' +
        '<div class="err" id="acE"></div><button class="go" id="acGo">Log in</button></form><button class="link" data-tab="recover">Forgot your password?</button>';
    } else {
      html += '<form id="acF" autocomplete="off"><p>Enter your username and the recovery code you got when you made your account, then pick a new password.</p><label for="acN">Username</label><input type="text" id="acN" maxlength="16" spellcheck="false" autocapitalize="off">' +
        '<label for="acC">Recovery code</label><input type="text" id="acC" maxlength="20" spellcheck="false" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX"><label for="acP">New password</label><input type="password" id="acP" maxlength="100" autocomplete="new-password">' +
        '<div class="err" id="acE"></div><button class="go" id="acGo">Reset password</button></form>';
    }
    if (!acct) html += '<button class="link" id="acLocal">' + (kind() === 'local' ? 'Keep playing with my local account' : 'Use a local account instead') + '</button>';
    var d = overlay(html, kind() !== '');
    d.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function (e) { e.preventDefault(); openWelcome(b.dataset.tab); }; });
    var L = $('acLocal'); if (L) L.onclick = function () { if (kind() === 'local') closeOv(); else convince(1); };
    var N = $('acN'), E = $('acE'), go = $('acGo');
    if (tab === 'signup') {
      var t = 0, check = function () {
        var v = N.value.trim(), h = $('acNh'), bad = nameError(v);
        clearTimeout(t);
        if (bad) { h.textContent = v ? bad : 'This is your name in every game. Nobody else can ever use it.'; h.className = 'hint' + (v ? ' bad' : ''); return; }
        h.textContent = 'Checking…'; h.className = 'hint';
        t = setTimeout(function () { api('check?name=' + encodeURIComponent(v)).then(function (r) { if (N.value.trim() !== v) return; if (r.status !== 200) { h.textContent = ''; return; } h.textContent = r.free ? '✔ ' + v + ' is free' : WHY[r.why] || WHY.taken; h.className = 'hint ' + (r.free ? 'good' : 'bad'); }); }, 350);
      };
      N.addEventListener('input', check); if (N.value) check();
    }
    $('acF').onsubmit = function (e) {
      e.preventDefault(); E.textContent = '';
      var n = N.value.trim(), pw = $('acP').value;
      // only a new account's name is checked against the reserved names: an account that already exists (the owner's
      // included) can always log in or reset its password, as long as the name has the right shape
      var bad = tab === 'signup' ? nameError(n) : /^[A-Za-z0-9_]{3,16}$/.test(n) ? '' : WHY.format;
      if (bad) { E.textContent = bad; return; }
      if (pw.length < 6) { E.textContent = 'Use a password with at least 6 characters.'; return; }
      if (tab === 'signup' && pw !== $('acP2').value) { E.textContent = 'The two passwords don’t match.'; return; }
      go.disabled = true; go.textContent = tab === 'signup' ? 'Creating your account…' : tab === 'login' ? 'Logging in…' : 'Resetting…';
      var p = tab === 'signup' ? signup(n, pw) : tab === 'login' ? login(n, pw) : recover(n, $('acC').value, pw);
      p.then(function (r) {
        if (r.error) { E.textContent = r.error; go.disabled = false; go.textContent = tab === 'signup' ? 'Create my account' : tab === 'login' ? 'Log in' : 'Reset password'; return; }
        if (r.recovery) showCode(r.recovery, tab === 'signup'); else done('Welcome back, ' + acct.name + '!', 'Your progress from your account is on this device now.');
      });
    };
  }
  function showCode(code, isNew) {
    var d = overlay('<div class="big">🔑</div><h2>' + (isNew ? 'Your account is ready!' : 'Password reset') + '</h2><p>This is your <b>recovery code</b>. If you ever forget your password, it’s the only way back in. Write it down or take a screenshot. You won’t see it again.</p>' +
      '<div class="code">' + esc(code) + '</div><label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="acOk"> I saved my recovery code</label><button class="go" id="acGo" disabled>Continue</button>', false);
    $('acOk').onchange = function () { $('acGo').disabled = !this.checked; };
    $('acGo').onclick = function () { done(isNew ? 'Welcome, ' + acct.name + '!' : 'You’re back in', isNew ? 'Your progress is saved to your account now, and your name in every game is ' + acct.name + '.' : 'Your progress is on this device again.'); };
    void d;
  }
  function done(title, text) {
    overlay('<div class="big">✅</div><h2>' + esc(title) + '</h2><p>' + esc(text) + '</p><button class="go" data-x>Let’s play</button>', true);
    var b = $('acctOv').querySelector('.go'); b.onclick = function () { closeOv(); if (window.ArcadeAccount.onReady) window.ArcadeAccount.onReady(); };
  }
  // three tries to talk someone out of a local account, then the name for it
  var PITCH = [
    ['🤔', 'Are you sure?', 'With a local account your progress only lives in this browser. An online account saves it for you, for free, and takes ten seconds.', ['Save on any device', 'Your progress is safe if this browser is cleared', 'Your own name that nobody else can take']],
    ['⚠️', 'You could lose everything', 'If this browser’s data is cleared, you switch devices or you play somewhere else, a local account’s progress is gone for good, and it can’t be brought back.', null],
    ['🙏', 'Last chance', 'Online accounts get a username that’s reserved just for them, and every win, level and coin follows you everywhere. You can still make one later, but are you really sure?', null]
  ];
  function convince(n) {
    if (n > 3) return localName();
    var P = PITCH[n - 1];
    overlay('<div class="big">' + P[0] + '</div><h2>' + P[1] + '</h2><p>' + P[2] + '</p>' + (P[3] ? '<ul class="perks">' + P[3].map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : '') +
      '<button class="go" id="acYes">Create an online account</button><button class="alt" id="acNo">' + (n < 3 ? 'No, I want a local account' : 'Yes, use a local account') + '</button><div class="hint" style="text-align:center;margin-top:10px">' + n + ' of 3</div>', false);
    $('acYes').onclick = function () { openWelcome('signup'); };
    $('acNo').onclick = function () { convince(n + 1); };
  }
  function localName() {
    overlay('<div class="big">💾</div><h2>Your local name</h2><p>This is your name in every game on this device. You can change it here any time, or make an online account later and keep all your progress.</p>' +
      '<form id="acF" autocomplete="off"><label for="acN">Name</label><input type="text" id="acN" maxlength="16" spellcheck="false" value="' + esc(name() || suggest()) + '"><div class="err" id="acE"></div><button class="go">Save</button></form>', kind() !== '');
    $('acF').onsubmit = function (e) {
      e.preventDefault(); var v = $('acN').value.trim(), bad = nameError(v);
      if (!bad && /admin|moderator|^mods?$|official|staff|gametester|imacheater/i.test(v)) bad = WHY.reserved;
      if (bad) { $('acE').textContent = bad; return; }
      setLocal(v); closeOv();
    };
  }
  // a starting username: the name already used in the games on this device, cleaned up
  function suggest() {
    var cands = [], J = function (k, f) { try { var o = JSON.parse(localStorage.getItem(k) || 'null'); var v = o && f(o); if (v) cands.push(String(v)); } catch (e) {} };
    J('cubeAssaultProfile', function (o) { return o.name; }); J('havocbay.settings.v1', function (o) { return o.name; }); J('rivals.profile', function (o) { return o.name; }); J('cubeTDProfile', function (o) { return o.name; });
    J('polyracer', function (o) { return o.profile && o.profile.name; }); J('soccer.profile', function (o) { return o.name; });
    try { var c = localStorage.getItem('arcade-chat-name'); if (c) cands.push(JSON.parse(c)); } catch (e) {}
    for (var i = 0; i < cands.length; i++) { var v = cands[i].replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16); if (v.length >= 3 && !/^(imacheater|gametester|admintest)$/i.test(v)) return v; }
    return '';
  }
  function localGames() {
    var L = localGroups(), n = Object.keys(L).filter(function (g) { return g !== 'arcade' && g !== 'misc'; }).length;
    return n ? n + (n === 1 ? ' game' : ' games') : '';
  }

  /* ---------- the account panel (the button in the header) ---------- */
  function openPanel() {
    var k = kind();
    if (!k) return openWelcome('signup');
    var games = (window.GAMES || []).map(function (g) { var s = null; try { s = g.stat && g.stat(); } catch (e) {} return s ? '<div><b>' + esc(g.title) + '</b><span>' + esc(s) + '</span></div>' : ''; }).join('');
    var html = '<div class="head"><div class="av">' + esc(name().charAt(0).toUpperCase()) + '</div><div><h2 style="margin:0">' + esc(name()) + '</h2>' +
      (k === 'online' ? '<span class="pill">☁ Online account</span>' : '<span class="pill local">💾 Local account</span>') + '</div></div>';
    if (k === 'online') html += '<p id="acSt" style="margin-top:10px">' + statusText() + '</p><div class="row"><button class="alt" id="acSync">Sync now</button><button class="alt" id="acPw">Change password</button></div><div class="row"><button class="alt" id="acNm">Change username</button></div>';
    else html += '<div class="warn">Your progress is only saved in this browser. Make an online account to keep it safe and play on any device. Everything you have now comes with you.</div><button class="go" id="acMake">Create an online account</button><div class="row"><button class="alt" id="acIn">Log in</button><button class="alt" id="acRen">Change name</button></div>';
    html += '<h3 style="margin:18px 0 0;font-size:15px">Your games</h3><div class="stats">' + (games || '<div><span>Play a game and your stats show up here.</span></div>') + '</div>';
    // 2026-11-11: Social shows words as people wrote them; this turns a swear filter on (it syncs with the account, in 'misc')
    var filt = false; try { filt = localStorage.getItem('arcade-swear-filter') === '1'; } catch (e) {}
    html += '<h3 style="margin:18px 0 6px;font-size:15px">Settings</h3><label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;font-size:14px;line-height:1.4"><input type="checkbox" id="acFilt"' + (filt ? ' checked' : '') + ' style="margin-top:3px;width:18px;height:18px;flex:none"><span><b>Filter swear words on Social</b><br><span style="opacity:.75">Stars out bad words in posts, comments and messages. Off by default.</span></span></label>';
    if (k === 'online' && isAdmin()) html += '<button class="alt" id="acAdm" style="margin-top:14px;width:100%">🛡️ Admin tools</button>';
    if (k === 'online') html += '<button class="link" id="acOut">Log out of this device</button><button class="link" id="acDel" style="margin-top:6px;color:#ff8a80">Delete my account</button>';
    overlay(html, true);
    var b;
    if ((b = $('acSync'))) b.onclick = function () { b.disabled = true; sync('manual').then(function (p) { b.disabled = false; var s = $('acSt'); if (s) s.textContent = statusText(); if (p && p.length) location.reload(); }); };
    if ((b = $('acPw'))) b.onclick = openPassword;
    if ((b = $('acNm'))) b.onclick = function () { openRename(false); };
    if ((b = $('acMake'))) b.onclick = function () { openWelcome('signup'); };
    if ((b = $('acIn'))) b.onclick = function () { openWelcome('login'); };
    if ((b = $('acRen'))) b.onclick = localName;
    if ((b = $('acDel'))) b.onclick = openDelete;
    if ((b = $('acAdm'))) b.onclick = openAdmin;
    if ((b = $('acFilt'))) b.onchange = function () { try { localStorage.setItem('arcade-swear-filter', this.checked ? '1' : '0'); } catch (e) {} try { window.dispatchEvent(new Event('arcade-filter')); } catch (e) {} };
    if ((b = $('acOut'))) b.onclick = function () { if (confirm('Log out? Your progress stays safe in your account, and this device’s copy is cleared.')) { b.disabled = true; b.textContent = 'Saving and logging out…'; logout(); } };
  }
  // deleting your own account: your password again, then everything in the cloud is gone (this device keeps its copy)
  function openDelete() {
    overlay('<div class="big">\ud83d\uddd1\ufe0f</div><h2>Delete your account?</h2><p>Your account <b>' + esc(acct.name) + '</b> and all the progress saved in it will be deleted for good, and the name becomes free for anyone. The progress on this device stays, as a local account.</p>' +
      '<form id="acF"><label for="acP">Your password</label><input type="password" id="acP" autocomplete="current-password"><div class="err" id="acE"></div><button class="go" id="acGo" style="background:#d63a3a">Delete my account</button></form>', true);
    $('acF').onsubmit = function (e) {
      e.preventDefault(); var E = $('acE'), n = acct.name; $('acGo').disabled = true;
      keyName(n).then(function (kn) { return stretch(kn, $('acP').value); }).then(function (key) { return api('delete', { method: 'POST', auth: true, body: { key: key } }); }).then(function (r) {
        if (!(r.status === 200 && r.deleted)) { E.textContent = r.status === 401 ? 'Wrong password.' : 'Something went wrong. Try again.'; $('acGo').disabled = false; return; }
        acct = null; ls.del(K_ACCT); syncMap = {}; ls.del(K_SYNC); setLocal(n); setStatus('off'); refresh();
        done('Account deleted', 'Your account is gone. You\u2019re playing with a local account called ' + n + ' now.');
      });
    };
  }
  // the owner's tools: open the site with ?admin (admin password), or sign in as an admin account (no password).
  // Look up, ban, unban, rename or delete any account.
  var ADMIN_ACCOUNTS = ['noah', 'lars', 'claude'];
  function isAdmin() { return !!(acct && acct.token && ADMIN_ACCOUNTS.indexOf(String(acct.name).toLowerCase()) >= 0); }
  function openAdmin() {
    var me = isAdmin();
    overlay('<h2>Accounts admin</h2><p>Look up, ban (or device ban), rename or delete an account, or make a new recovery code for a player who can\u2019t get in.</p><form id="acF" autocomplete="off">' +
      (me ? '' : '<label for="acA">Admin password</label><input type="password" id="acA" autocomplete="off">') +
      '<label for="acN">Username</label><input type="text" id="acN" maxlength="16" spellcheck="false" autocapitalize="off">' +
      '<label for="acTo">New username (for Rename)</label><input type="text" id="acTo" maxlength="16" spellcheck="false" autocapitalize="off"><div class="err" id="acE"></div>' +
      '<div class="row"><button class="go" id="acLook" type="button">Look up</button><button class="go" id="acRn" type="button">Rename</button></div>' +
      '<div class="row"><button class="go" id="acBan" type="button" style="background:#c46a1a">Ban</button><button class="go" id="acUnban" type="button">Unban</button><button class="go" id="acKill" type="button" style="background:#d63a3a">Delete</button></div>' +
      '<div class="row"><button class="go" id="acDev" type="button" style="background:#8b1e3f">Device ban</button><button class="go" id="acUndev" type="button">Remove device ban</button></div>' +
      '<button class="go" id="acCode" type="button" style="width:100%;margin-top:8px;background:#3797f0">New recovery code (for a player who can\u2019t get in)</button></form><div id="acRes" class="stats"></div>', true);
    var run = function (op) {
      var E = $('acE'), n = $('acN').value.trim(), to = $('acTo').value.trim(); E.textContent = ''; $('acRes').innerHTML = '';
      if (!n) { E.textContent = 'Type a username.'; return; }
      if (op === 'rename' && !to) { E.textContent = 'Type the new username.'; return; }
      if (op === 'delete' && !confirm('Delete the account ' + n + ' and all its saved progress for good?')) return;
      if (op === 'ban' && !confirm('Ban ' + n + '? They are signed out everywhere, can’t log in, and leave the Players list.')) return;
      if (op === 'rename' && !confirm('Rename ' + n + ' to ' + to + '? They are signed out and log in with the new name (same password).')) return;
      if (op === 'devban' && !confirm('Device ban ' + n + '? The account is banned, and every device it was used on can\u2019t sign up, log in or use any account any more.')) return;
      if (op === 'newcode' && !confirm('Make a new recovery code for ' + n + '? Their old code stops working.\n\nOnly do this if you\u2019re sure the person asking really owns this account.')) return;
      api('admin', { method: 'POST', auth: me, body: { pw: me ? '' : $('acA').value, op: op, name: n, to: to } }).then(function (r) {
        if (r.status === 401) { E.textContent = 'Wrong admin password.'; return; }
        if (r.status === 429) { E.textContent = r.error === 'slow' ? 'Try again later.' : 'Too many wrong tries. Wait ' + Math.ceil((r.wait || 900) / 60) + ' minutes.'; return; }
        if (r.status === 404) { E.textContent = 'There’s no account called ' + n + '.'; return; }
        if (r.error === 'protected') { E.textContent = 'Admin accounts can’t be banned, renamed, deleted or given a new code here.'; return; }
        if (op === 'rename' && r.status !== 200) { E.textContent = r.error === 'taken' ? 'That new name is taken.' : WHY[r.error] || 'Couldn’t rename (' + (r.error || r.status) + ').'; return; }
        if (r.status !== 200) { E.textContent = 'Something went wrong (' + (r.error || r.status) + ').'; return; }
        if (r.code) { // 2026-11-12: give this to the player: Log in > Forgot password > their username, this code, a new password
          $('acRes').innerHTML = '<div><b>New recovery code for ' + esc(r.name) + '</b><span style="font:800 20px/1.4 ui-monospace,monospace;letter-spacing:.06em;user-select:all">' + esc(r.code) + '</span></div>' +
            '<div><b>Tell them</b><span>Log in \u2192 Forgot password, then type ' + esc(r.name) + ', this code and a new password. Any lockout from wrong tries is cleared. After they use it they get a fresh code of their own, so this one works once.</span></div>';
          return;
        }
        if (op === 'devban' || op === 'devunban') { $('acRes').innerHTML = '<div><b>' + esc(r.name || n) + '</b><span>' + (op === 'devban' ? 'banned, with ' : 'unbanned, and ') + r.devices + ' device' + (r.devices === 1 ? '' : 's') + (op === 'devban' ? ' blocked' : ' unblocked') + '</span></div>'; return; }
        var done = r.deleted ? 'deleted' : r.banned ? 'banned' : r.unbanned ? 'unbanned' : op === 'rename' ? 'renamed to ' + r.name : '';
        if (done) { $('acRes').innerHTML = '<div><b>' + esc(op === 'rename' ? n : r.name) + '</b><span>' + esc(done) + '</span></div>'; return; }
        var rows = [['Username', r.name], ['Created', new Date(r.created).toLocaleString()], ['Signed-in devices', r.devices], ['Banned', r.banned ? (r.devban ? 'Yes, device ban' : 'Yes') : 'No'], ['Devices seen', r.devs == null ? '?' : r.devs]];
        Object.keys(r.games || {}).forEach(function (g) { rows.push([g, Math.ceil(r.games[g].size / 1024) + ' KB, saved ' + new Date(r.games[g].at).toLocaleString()]); });
        $('acRes').innerHTML = rows.map(function (x) { return '<div><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('');
      });
    };
    $('acLook').onclick = function () { run('info'); }; $('acKill').onclick = function () { run('delete'); };
    $('acBan').onclick = function () { run('ban'); }; $('acUnban').onclick = function () { run('unban'); }; $('acRn').onclick = function () { run('rename'); }; $('acCode').onclick = function () { run('newcode'); }; $('acDev').onclick = function () { run('devban'); }; $('acUndev').onclick = function () { run('devunban'); };
    $('acF').onsubmit = function (e) { e.preventDefault(); run('info'); };
  }
  function openPassword() {
    overlay('<h2>Change password</h2><form id="acF"><label for="acO">Current password</label><input type="password" id="acO" autocomplete="current-password"><label for="acP">New password</label><input type="password" id="acP" autocomplete="new-password"><label for="acP2">New password again</label><input type="password" id="acP2" autocomplete="new-password"><div class="err" id="acE"></div><button class="go" id="acGo">Change password</button></form>', true);
    $('acF').onsubmit = function (e) {
      e.preventDefault(); var E = $('acE'), np = $('acP').value;
      if (np.length < 6) { E.textContent = 'Use a password with at least 6 characters.'; return; }
      if (np !== $('acP2').value) { E.textContent = 'The two passwords don’t match.'; return; }
      $('acGo').disabled = true;
      changePassword($('acO').value, np).then(function (r) { if (r.error) { E.textContent = r.error; $('acGo').disabled = false; } else done('Password changed', 'Any other device you were logged in on will need the new password.'); });
    };
  }
  function statusText() {
    if (state.status === 'syncing') return 'Syncing your progress…';
    if (state.status === 'offline') return 'Offline right now. Your progress is saved on this device and syncs when you’re back online.';
    if (state.status === 'error') return 'Couldn’t sync just now. It will try again soon.';
    if (state.last) { var s = Math.round((Date.now() - state.last) / 1000); return '✔ Progress saved to your account ' + (s < 10 ? 'just now' : s < 90 ? s + ' seconds ago' : Math.round(s / 60) + ' minutes ago') + '.'; }
    return 'Your progress is saved to your account.';
  }
  function setStatus(s) { state.status = s; refresh(); }
  function refresh() {
    var b = $('acctBtn'); if (!b) return;
    var k = kind();
    b.innerHTML = k ? '<span class="av">' + esc(name().charAt(0).toUpperCase()) + '</span><span class="nm">' + esc(name()) + '</span><span class="dot ' + (k === 'local' ? 'local' : state.status === 'syncing' ? 'sync' : state.status === 'error' || state.status === 'offline' ? 'err' : '') + '"></span>' : '<span class="av">👤</span><span class="nm">Sign in</span>';
    b.title = k === 'online' ? statusText() : k === 'local' ? 'Local account: progress only on this device' : 'Make an account to save your progress';
  }
  function addButton() {
    var top = document.querySelector('header.top'); if (!top || $('acctBtn')) return;
    css();
    var b = document.createElement('button'); b.id = 'acctBtn'; b.type = 'button';
    b.onclick = openPanel; top.appendChild(b); refresh();
  }

  // This account's name isn't allowed: block the whole site until it's changed. Local accounts can rename
  // right here; online names can't be edited, so the only way out is a new account with an allowed name.
  function enforceName() {
    if (!name() || !reservedName(name())) return false;
    css();
    var k = kind(), html = '<div class="big">🔒</div><h2>Change your name to keep playing</h2>' +
      '<p>This account’s name isn’t allowed on the Arcade. You’re locked out until it’s changed.</p>';
    if (k === 'local') html += '<form id="acF" autocomplete="off"><label for="acN">New name</label><input type="text" id="acN" maxlength="16" spellcheck="false" autocapitalize="off"><div class="err" id="acE"></div><button class="go">Save new name</button></form>';
    else html += '<div class="warn">Online account names can’t be edited. Log out and make a new account with an allowed name — everything else about the account would be the same.</div><button class="go" id="acZ">Log out</button>';
    overlay(html, false);
    if (k === 'local') $('acF').onsubmit = function (e) {
      e.preventDefault(); var v = $('acN').value.trim(), bad = nameError(v);
      if (!bad && /admin|moderator|^mods?$|official|staff|gametester|imacheater/i.test(v)) bad = WHY.reserved;
      if (bad) { $('acE').textContent = bad; return; }
      setLocal(v); closeOv();
    };
    else $('acZ').onclick = function () { logout(); };
    return true;
  }

  /* ---------- changing your username (2026-11-11) ----------
     POST /acct/rename {name}: everything (progress, friends, messages, group chats) moves to the new name and this
     device gets a new sign-in; other devices are signed out. Once a week, except when forced: an account whose name
     the owner gave to someone else is shown this until it picks a new one (forced, no way to close it). */
  function openRename(forced) {
    css();
    overlay('<div class="big">✏️</div><h2>' + (forced ? 'Your username needs to change' : 'Change your username') + '</h2>' +
      '<p>' + (forced ? 'The name <b>' + esc(name()) + '</b> is going to someone else, so please pick a new one. Your progress, friends, messages and group chats all stay with you.' : 'Your progress, friends, messages and group chats all move to the new name. You can change it once a week, and your other devices will need to log in again.') + '</p>' +
      '<form id="acRenF" autocomplete="off"><label for="acN">New username</label><input type="text" id="acN" maxlength="16" spellcheck="false" autocapitalize="off"><div class="hint" id="acNh"></div><div class="err" id="acE"></div><button class="go" id="acGo">Change my username</button></form>', !forced);
    var N = $('acN'), E = $('acE'), go = $('acGo'), t = 0;
    N.addEventListener('input', function () {
      var v = N.value.trim(), h = $('acNh'), bad = nameError(v); clearTimeout(t);
      if (bad) { h.textContent = v ? bad : ''; h.className = 'hint' + (v ? ' bad' : ''); return; }
      t = setTimeout(function () { api('check?name=' + encodeURIComponent(v)).then(function (r) { if (N.value.trim() !== v || r.status !== 200) return; h.textContent = r.free ? '✔ ' + v + ' is free' : WHY[r.why] || WHY.taken; h.className = 'hint ' + (r.free ? 'good' : 'bad'); }); }, 350);
    });
    $('acRenF').onsubmit = function (e) {
      e.preventDefault(); E.textContent = '';
      var v = N.value.trim(), bad = nameError(v);
      if (!bad && /admin|moderator|^mods?$|official|staff|gametester|imacheater/i.test(v)) bad = WHY.reserved;
      if (bad) { E.textContent = bad; return; }
      go.disabled = true; go.textContent = 'Moving everything to ' + v + '…';
      api('rename', { method: 'POST', auth: true, body: { name: v } }).then(function (r) {
        if (r.status !== 200 || !r.token) {
          go.disabled = false; go.textContent = 'Change my username';
          E.textContent = r.error === 'slow' ? 'You can change your username once a week. Try again in ' + (r.wait || 7) + ' day' + (r.wait === 1 ? '' : 's') + '.' : WHY[r.error] || (r.status === 0 ? 'Couldn’t reach the server. Check your connection.' : 'Something went wrong. Try again.');
          return;
        }
        setAcct({ name: r.name, token: r.token }, false);
        try { localStorage.removeItem('arcade-acct-prof'); } catch (x) {}
        location.reload();
      });
    };
    setTimeout(function () { N.focus(); }, 50);
  }

  /* ---------- start ---------- */
  var readyRes, ready = new Promise(function (r) { readyRes = r; });
  function start() {
    addButton();
    if (enforceName()) return; // locked out until the name is changed; nothing else runs
    // first visit (after the Terms): ask everyone to make an account
    if (/[?&]admin\b/.test(location.search)) { var adm = function () { if ($('tosPop')) return setTimeout(adm, 500); openAdmin(); }; setTimeout(adm, 300); return finishStart(); }
    var ask = function () {
      if (kind() || /[?&]noacct\b/.test(location.search)) return;
      if ($('tosPop')) return setTimeout(ask, 500);
      openWelcome('signup');
    };
    setTimeout(ask, 600);
    finishStart();
  }
  function finishStart() {
    if (acct) sync('load').then(function () { readyRes(); }); else readyRes();
    liveConnect(); setInterval(liveConnect, 2000); // (re)connects when the player signs in or out
    setTimeout(readyRes, 4000); // never hold a game back for long
    setInterval(function () { push(false); }, 45000);
    setInterval(function () { if (acct && !document.hidden) sync('poll'); }, 5 * 60000);
    document.addEventListener('visibilitychange', function () { if (document.hidden) push(true); else if (acct && Date.now() - state.last > 60000) sync('back'); });
    addEventListener('pagehide', function () { push(true); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.ArcadeAccount = {
    name: name, kind: kind, ready: function () { return ready; }, sync: sync, open: openPanel, welcome: openWelcome,
    onPulled: function (f) { pulledHandlers.push(f); }, onReady: null,
    // for the Players page and the chat: the server's address, the sign-in token, requests to the account
    server: API.replace(/\/acct\/$/, ''), token: function () { return acct ? acct.token : ''; },
    api: function (path, opt) { return api(path, opt); },
    isAdmin: function () { return isAdmin(); },
    onLive: function (f) { liveHandlers.push(f); }, toast: toast,
    social: function () { return social; }, onSocial: function (f) { socialHandlers.push(f); if (social) f(social); }, setSocial: setSocial,
    _test: { groupOf: groupOf, localGroups: localGroups, hash: hash, score: score, syncMap: function () { return syncMap; } }
  };
})();
