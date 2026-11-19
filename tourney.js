/* tourney.js (2026-11-17, server-run since 2026-11-18): open tournaments. Anyone with an online Arcade account can
   host one (local accounts can't); everyone sees it (home page, tourney.html) and online accounts can join until it
   starts. At the start time everyone who signed up and is still around is drawn into a 1v1 knockout bracket that
   climbs from round 1 to the final.
   The arcade's server keeps every tournament (Worker /tourn), so it shows for everyone and starts and carries on
   even when the host has closed their page. Pages read it every few seconds; players on the page say "here" every
   30 s (the start only draws players seen in the last 2 minutes, unless fewer than 2 are around).
   - Chess and Checkers matches open straight into their private table (play.html?tmatch=…) and report the result
     themselves (the game posts {arcadeMatch} to play.html, which sends it to the server). Other games: players report. */
(function () {
  if (window.ArcadeTourney || window.ARCADE_WATCH) return;
  var ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var GAMES = { chess: 'auto', checkers: 'auto', 'card-royale': 'report', 'rocket-rivals': 'report' };
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del: function (k) { try { localStorage.removeItem(k); } catch (e) {} } };
  var rid = function (n) { var s = ''; for (var i = 0; i < n; i++) s += ALPH[Math.floor(Math.random() * ALPH.length)]; return s; };
  var A = function () { return window.ArcadeAccount; };
  var online = function () { var a = A(); return !!(a && a.kind && a.kind() === 'online'); };
  var myName = function () { return online() ? A().name() : ''; };
  var client = function (f) { if (window.ArcadeOnline) ArcadeOnline.ready(f); else f(null); };
  var key = (function () { var k = ls.get('arcade-online-id'); return (k || Math.random().toString(36).slice(2)).slice(0, 24); })();
  var same = function (a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); };

  /* ---------- talking to the server ---------- */
  var base = function () {
    try { if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && ls.get('arcade-acct-api')) return ls.get('arcade-acct-api').replace(/\/acct\/?$/, '') + '/tourn'; } catch (e) {} // tests only
    var a = A(); return ((a && a.server) || 'https://arcade-realtime.arcade-realtime.workers.dev') + '/tourn';
  };
  var token = function () { try { var a = A(); return (a && a.token && a.token()) || ''; } catch (e) { return ''; } };
  function get(q) { return fetch(base() + (q || ''), { cache: 'no-store' }).then(function (r) { return r.json(); }); }
  function post(body) {
    return fetch(base(), { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token() }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || j.error) throw new Error(j.error === 'auth' ? 'Log in with your online account first.' : j.error === 'bad' || !j.error ? 'That didn’t work. Try again.' : j.error); return j; }); });
  }
  // keep asking while the page is on screen (slower when it's hidden)
  function every(ms, f) { var t = 0, go = function () { f(); t = setTimeout(go, document.hidden ? ms * 5 : ms); }; go(); addEventListener('visibilitychange', function () { if (!document.hidden) { clearTimeout(t); go(); } }); }

  /* ---------- every tournament (home page, tourney.html) ---------- */
  var dirSubs = [], dirOn = false;
  function directory(f) {
    dirSubs.push(f);
    if (dirOn) return; dirOn = true;
    every(15000, function () {
      get('').then(function (j) { var list = (j && j.list) || []; dirSubs.forEach(function (g) { try { g(list); } catch (e) {} }); })
        .catch(function () {});
    });
  }

  /* ---------- the bracket ---------- */
  function findMatch(T, mid) { for (var r = 0; r < (T.rounds || []).length; r++) for (var i = 0; i < T.rounds[r].length; i++) if (T.rounds[r][i].id === mid) return T.rounds[r][i]; return null; }
  function matchOf(T, name) { // the match this player plays next
    if (!T.rounds) return null;
    for (var r = 0; r < T.rounds.length; r++) for (var i = 0; i < T.rounds[r].length; i++) { var m = T.rounds[r][i]; if (!m.w && (same(m.a, name) || same(m.b, name)) && m.a && m.b) return m; }
    return null;
  }
  function roundName(T, r) { var left = T.rounds.length - r; return left === 1 ? 'Final' : left === 2 ? 'Semi-finals' : left === 3 ? 'Quarter-finals' : 'Round ' + (r + 1); }

  /* ======================================================================================================
     One tournament. The server runs it; this page shows it and sends what you do.
     ====================================================================================================== */
  function open(id, ui) {
    var T = null, lastV = -1, skew = 0;
    function me() { var n = myName(); return { name: n, host: !!(T && n && same(T.host, n)), joined: !!(T && (T.players || []).some(function (p) { return same(p, n); })), online: online() }; }
    function take(j) {
      if (!j || !j.T) return;
      if (j.now) skew = j.now - Date.now();
      T = j.T;
      var now = Date.now() + skew, seen = T.seen || {}, present = {};
      Object.keys(seen).forEach(function (k) { if (now - seen[k] < 120000) present[k] = 1; });
      ui.presence({ host: !!present[String(T.host).toLowerCase()] || me().host, watching: Object.keys(present).length, present: present });
      var k = T.v + '|' + myName(); if (k !== lastV) { lastV = k; ui.state(T, me()); }
      try { dispatchEvent(new CustomEvent('arcade:tourney', { detail: { T: T, me: me() } })); } catch (e) {} // 2026-11-19: notify.js (match ready alerts)
    }
    function load() { return get('?id=' + encodeURIComponent(id)).then(function (j) { if (j && j.error === 'not_found') ui.error('This tournament doesn’t exist any more.'); else take(j); }).catch(function () { ui.error('Can’t connect right now.'); }); }
    every(3000, load);
    // say you're here (only counts for online accounts), so you get a place when it starts
    every(30000, function () { if (online() && T && T.st !== 'done') post({ op: 'here', id: id }).catch(function () {}); });
    var act = function (body) { body.id = id; return post(body).then(take).catch(function (e) { ui.toast(e.message || 'That didn’t work.'); }); };
    return {
      get: function () { return T; },
      isHost: function () { return me().host; },
      join: function () {
        if (!online()) { var a = A(); if (a && a.welcome) a.welcome('signup', 'Tournaments need an online account. Make one (free, just a username and a password) or log in.'); return; }
        act({ op: 'join' });
      },
      leave: function () { act({ op: 'leave' }); },
      start: function () { act({ op: 'start' }); },
      setWinner: function (mid, w) { act({ op: 'win', mid: mid, w: w }); },
      report: function (mid, won) { var m = T && findMatch(T, mid); if (m) act({ op: 'result', mid: mid, code: m.code, res: won ? 'w' : 'l' }); },
      cancel: function () { act({ op: 'cancel' }); },
      moveStart: function (at) { act({ op: 'later', at: at }); },
      hostAlive: function () { return true; },
    };
  }
  // host a new one: resolves with the tournament (its id comes from the server)
  function create(opts) {
    if (!online()) return Promise.reject(new Error('Hosting a tournament needs an online account.'));
    return post({ op: 'create', t: opts.t, g: opts.g, at: opts.at, cap: opts.cap, play: !!opts.play }).then(function (j) { return j.T; });
  }

  /* ---------- play.html: a match's result goes back to its tournament ---------- */
  function reporter(tid, mid, code) {
    addEventListener('message', function (e) {
      var m = e.data && e.data.arcadeMatch; if (!m || e.origin !== location.origin || m.code !== code) return;
      var body = { op: 'result', id: tid, mid: mid, code: code, res: m.res }, tries = 0;
      var send = function () { post(body).catch(function (err) { if (/connect|fetch|network/i.test(String(err && err.message)) && ++tries < 5) setTimeout(send, 3000); }); };
      if (m.res !== 'aborted') send();
      if (window.ArcadeTourney && ArcadeTourney.onMatchEnd) ArcadeTourney.onMatchEnd(m.res);
    });
  }

  window.ArcadeTourney = {
    GAMES: GAMES, directory: directory, open: open, create: create, reporter: reporter, matchOf: matchOf, roundName: roundName, newId: function () { return rid(6); },
    name: myName, online: online, same: same,
    // the link that plays a match: Chess and Checkers go straight to the table, the others just open the game
    playUrl: function (T, m) {
      var me = myName(), host = same(m.a, me);
      var u = 'play.html?game=' + encodeURIComponent(T.g) + '&tid=' + T.id + '&tm=' + encodeURIComponent(m.id) + '&tcode=' + m.code;
      if (GAMES[T.g] === 'auto') u += '&tmatch=' + m.code + '&tside=' + (host ? 'host' : 'guest') + '&tname=' + encodeURIComponent(me);
      return u;
    },
  };
})();
