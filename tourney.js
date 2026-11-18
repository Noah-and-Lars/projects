/* tourney.js (2026-11-17): open tournaments. Anyone signed in can host one; everyone on the site sees it (home page,
   tourney.html) and anyone with an online account can join until it starts. At the start time everyone who signed up
   and is still around is drawn into a 1v1 knockout bracket that climbs from round 1 to the final.
   No server storage: the host's page runs the tournament (and keeps a copy in its localStorage, so a reload carries
   on). Everyone else gets the bracket from the host over the realtime channel.
   - Chess and Checkers matches open straight into their private table (play.html?tmatch=…) and report the result
     themselves (the game posts {arcadeMatch} to play.html, which sends it here). Other games: players report.
   Channels (rt.js): "tourn:index" presence (the host lists the tournament: {id, t, g, at, n, cap, st, h, w, r});
   "tourn:<id>" broadcast state / hello / join / leave / result, presence {role: 'host' | 'p' | 'w', n}. */
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

  /* ---------- who's hosting what (home page, tourney.html) ---------- */
  var dirCh = null, dirSubs = [];
  function directory(f) {
    dirSubs.push(f);
    if (dirCh) return;
    client(function (c) {
      if (!c) { dirSubs.forEach(function (g) { g([]); }); return; }
      dirCh = c.channel('tourn:index', { config: { presence: { key: 'v' + key } } });
      dirCh.on('presence', { event: 'sync' }, function () {
        var st = dirCh.presenceState(), list = [];
        Object.keys(st).forEach(function (k) { (st[k] || []).forEach(function (m) { if (m && m.id && /^[A-Z0-9]{6}$/.test(m.id) && !list.some(function (x) { return x.id === m.id; })) list.push(m); }); });
        var rank = { live: 0, open: 1, done: 2 };
        list.sort(function (a, b) { return (rank[a.st] - rank[b.st]) || (a.at - b.at); });
        dirSubs.forEach(function (g) { try { g(list); } catch (e) {} });
      });
      dirCh.subscribe();
    });
  }

  /* ---------- the bracket ---------- */
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // single elimination; byes go to the first seeds so nobody gets two in a row
  function draw(players) {
    var n = players.length, size = 1; while (size < n) size *= 2;
    var seeds = shuffle(players), slots = [];
    var byes = size - n;
    for (var i = 0; i < size / 2; i++) {
      var a = seeds.shift() || null, b = i < byes ? null : (seeds.shift() || null);
      slots.push([a, b]);
    }
    var rounds = [], first = slots.map(function (p, i) { return mk(0, i, p[0], p[1]); });
    rounds.push(first);
    for (var r = 1, c = size / 4; c >= 1; r++, c /= 2) { var row = []; for (var j = 0; j < c; j++) row.push(mk(r, j, null, null)); rounds.push(row); }
    if (size === 2) rounds = [first];
    return rounds;
  }
  function mk(r, i, a, b) { return { id: r + '-' + i, a: a, b: b, w: null, code: rid(5), st: 'wait', rep: {}, g: 1 }; }
  function settle(T) { // fill in byes and send winners up, until nothing changes
    var moved = true;
    while (moved) {
      moved = false;
      T.rounds.forEach(function (row, r) {
        row.forEach(function (m, i) {
          if (!m.w && r === 0 && m.a && !m.b) { m.w = m.a; m.st = 'bye'; moved = true; }
          if (!m.w && r === 0 && !m.a && m.b) { m.w = m.b; m.st = 'bye'; moved = true; }
          if (!m.w && m.a && m.b && m.st === 'wait') { m.st = 'ready'; m.at = Date.now(); moved = true; }
          if (m.w && T.rounds[r + 1]) {
            var up = T.rounds[r + 1][Math.floor(i / 2)], side = i % 2 ? 'b' : 'a';
            if (up[side] !== m.w) { up[side] = m.w; moved = true; }
          }
          // an empty branch (two byes in a row can't happen, but a removed player can leave one): pass the other side up
          if (!m.w && r > 0 && (m.a || m.b) && !(m.a && m.b)) {
            var feeders = T.rounds[r - 1].slice(i * 2, i * 2 + 2);
            if (feeders.every(function (f) { return f.w || f.st === 'void'; })) { m.w = m.a || m.b; m.st = 'bye'; moved = true; }
          }
        });
      });
    }
    var fin = T.rounds[T.rounds.length - 1][0];
    if (fin.w && T.st !== 'done') { T.st = 'done'; T.champ = fin.w; T.ended = Date.now(); }
  }
  function findMatch(T, mid) { for (var r = 0; r < (T.rounds || []).length; r++) for (var i = 0; i < T.rounds[r].length; i++) if (T.rounds[r][i].id === mid) return T.rounds[r][i]; return null; }
  function matchOf(T, name) { // the match this player plays next
    if (!T.rounds) return null;
    for (var r = 0; r < T.rounds.length; r++) for (var i = 0; i < T.rounds[r].length; i++) { var m = T.rounds[r][i]; if (!m.w && (same(m.a, name) || same(m.b, name)) && m.a && m.b) return m; }
    return null;
  }
  function roundName(T, r) { var left = T.rounds.length - r; return left === 1 ? 'Final' : left === 2 ? 'Semi-finals' : left === 3 ? 'Quarter-finals' : 'Round ' + (r + 1); }

  /* ======================================================================================================
     A tournament channel. The host runs it; everyone else listens.
     ====================================================================================================== */
  function open(id, ui) {
    var hostKey = 'arcade-tourn-' + id, T = null, ch = null, idx = null, amHost = false, present = {}, timer = 0, lastSeen = 0;
    var saved = JSON.parse(ls.get(hostKey) || 'null');
    if (saved && saved.hostKey === key) { T = saved; amHost = true; }
    function publish() {
      if (!amHost || !T) return;
      T.v = (T.v || 0) + 1; T.n = (T.players || []).length;
      ls.set(hostKey, JSON.stringify(T));
      if (ch) ch.send({ type: 'broadcast', event: 'state', payload: T });
      if (idx) idx.track({ id: T.id, t: T.t, g: T.g, at: T.at, n: T.n, cap: T.cap, st: T.st, h: T.host, w: T.champ || '', r: T.rounds ? T.rounds.length : 0 });
      ui.state(T, me());
    }
    function me() { return { name: myName(), host: amHost, joined: !!(T && (T.players || []).some(function (p) { return same(p, myName()); })), online: online() }; }
    client(function (c) {
      if (!c) { ui.error('Can’t connect right now.'); return; }
      ch = c.channel('tourn:' + id, { config: { presence: { key: key } } });
      ch.on('broadcast', { event: 'state' }, function (e) {
        var s = e.payload; if (!s || amHost || s.id !== id) return;
        if (T && s.v < T.v && s.t === T.t) return;
        T = s; lastSeen = Date.now(); ui.state(T, me());
      });
      ch.on('broadcast', { event: 'hello' }, function () { if (amHost) publish(); });
      ch.on('broadcast', { event: 'join' }, function (e) { if (amHost) hostJoin(e.payload || {}); });
      ch.on('broadcast', { event: 'leave' }, function (e) { if (amHost) hostLeave(e.payload || {}); });
      ch.on('broadcast', { event: 'result' }, function (e) { if (amHost) hostResult(e.payload || {}); });
      ch.on('presence', { event: 'sync' }, function () {
        var st = ch.presenceState(); present = {}; var hostHere = false, watching = 0;
        Object.keys(st).forEach(function (k) { (st[k] || []).forEach(function (m) { if (m.role === 'host') hostHere = true; if (m.n) present[String(m.n).toLowerCase()] = 1; watching++; }); });
        ui.presence({ host: hostHere || amHost, watching: watching, present: present });
      });
      ch.subscribe(function (s) {
        if (s !== 'SUBSCRIBED') return;
        ch.track({ role: amHost ? 'host' : (me().joined ? 'p' : 'w'), n: myName() });
        if (amHost) publish(); else ch.send({ type: 'broadcast', event: 'hello', payload: {} });
      });
      if (amHost) startHosting(c);
    });
    function startHosting(c) {
      if (idx) return;
      idx = c.channel('tourn:index', { config: { presence: { key: 'h' + id } } });
      idx.subscribe(function (s) { if (s === 'SUBSCRIBED') publish(); });
      clearInterval(timer);
      timer = setInterval(function () { // starts on time by itself, with whoever is around
        if (T && T.st === 'open' && T.at && Date.now() >= T.at) begin(false);
      }, 1000);
    }

    /* ----- what the host does ----- */
    function hostJoin(m) {
      if (!T || T.st !== 'open' || !/^[A-Za-z0-9_]{3,16}$/.test(m.n || '')) return;
      if (T.players.some(function (p) { return same(p, m.n); }) || T.players.length >= T.cap) return publish();
      T.players.push(m.n); publish();
    }
    function hostLeave(m) {
      if (!T || T.st !== 'open') return;
      T.players = T.players.filter(function (p) { return !same(p, m.n); }); publish();
    }
    function begin(force) {
      if (!T || T.st !== 'open') return;
      // only players who are still around get a place (if almost nobody is, keep the sign-up list)
      var here = T.players.filter(function (p) { return present[p.toLowerCase()]; });
      var list = here.length >= 2 ? here : T.players;
      if (list.length < 2) { if (force) ui.toast('At least 2 players are needed to start.'); else { T.at = Date.now() + 5 * 60000; publish(); ui.toast('Not enough players yet: the start moved back 5 minutes.'); } return; }
      T.dropped = T.players.filter(function (p) { return list.indexOf(p) < 0; });
      T.players = list; T.rounds = draw(list); T.st = 'live'; T.started = Date.now();
      settle(T); publish();
    }
    function other(m, name) { return same(m.a, name) ? m.b : m.a; }
    function hostResult(p) {
      if (!T || T.st !== 'live') return;
      var m = findMatch(T, p.mid); if (!m || m.w || !(same(m.a, p.by) || same(m.b, p.by)) || m.code !== p.code) return;
      var res = p.res;
      if (res === 'aborted') return;
      if (res === 'd') { m.code = rid(5); m.g++; m.rep = {}; m.st = 'ready'; m.note = 'Draw: play again'; return publish(); }
      var winner = res === 'w' || res === 'left' ? (same(m.a, p.by) ? m.a : m.b) : other(m, p.by);
      m.rep[p.by.toLowerCase()] = winner;
      var reps = Object.keys(m.rep).map(function (k) { return m.rep[k]; });
      if (reps.length === 2 && !same(reps[0], reps[1])) { m.st = 'dispute'; return publish(); }
      decide(m, winner);
    }
    function decide(m, winner) { m.w = winner; m.st = 'done'; m.note = ''; settle(T); publish(); }
    return {
      get: function () { return T; },
      isHost: function () { return amHost; },
      // host only: create the tournament this page runs
      create: function (opts) {
        T = { id: id, hostKey: key, host: myName(), t: opts.t, g: opts.g, at: opts.at, cap: opts.cap, st: 'open', players: opts.play ? [myName()] : [], v: 0, created: Date.now() };
        ls.set(hostKey, JSON.stringify(T)); amHost = true;
        client(function (c) { if (c) { if (ch) ch.track({ role: 'host', n: myName() }); startHosting(c); } });
        publish();
      },
      join: function () {
        if (!online()) { var a = A(); if (a && a.welcome) a.welcome('signup', 'Tournaments need an online account. Make one (free, just a username and a password) or log in.'); return; }
        var p = { n: myName() };
        if (amHost) hostJoin(p); else if (ch) ch.send({ type: 'broadcast', event: 'join', payload: p });
        if (ch) ch.track({ role: amHost ? 'host' : 'p', n: myName() });
      },
      leave: function () { var p = { n: myName() }; if (amHost) hostLeave(p); else if (ch) ch.send({ type: 'broadcast', event: 'leave', payload: p }); },
      start: function () { if (amHost) begin(true); },
      setWinner: function (mid, w) { if (!amHost || !T) return; var m = findMatch(T, mid); if (m && !m.w && (same(w, m.a) || same(w, m.b))) decide(m, same(w, m.a) ? m.a : m.b); },
      report: function (mid, won) { // games that don't report by themselves
        var m = T && findMatch(T, mid); if (!m) return;
        var p = { mid: mid, by: myName(), res: won ? 'w' : 'l', code: m.code };
        if (amHost) hostResult(p); else if (ch) ch.send({ type: 'broadcast', event: 'result', payload: p });
      },
      cancel: function () { if (!amHost || !T) return; T.st = 'done'; T.cancelled = true; publish(); ls.del(hostKey); },
      moveStart: function (at) { if (amHost && T && T.st === 'open') { T.at = at; publish(); } },
      hostAlive: function () { return amHost || Date.now() - lastSeen < 20000; },
    };
  }

  /* ---------- play.html: a match's result goes back to its tournament ---------- */
  function reporter(tid, mid, code) {
    var ch = null, queue = [];
    client(function (c) {
      if (!c) return;
      ch = c.channel('tourn:' + tid, { config: { presence: { key: 'r' + key } } });
      ch.subscribe(function (s) { if (s === 'SUBSCRIBED') queue.splice(0).forEach(function (p) { ch.send({ type: 'broadcast', event: 'result', payload: p }); }); });
    });
    addEventListener('message', function (e) {
      var m = e.data && e.data.arcadeMatch; if (!m || e.origin !== location.origin || m.code !== code) return;
      var p = { mid: mid, code: code, res: m.res, by: myName() };
      // the bracket needs to know: send now (or once connected), and once more to be safe
      if (ch && ch.state === 'joined') ch.send({ type: 'broadcast', event: 'result', payload: p }); else queue.push(p);
      setTimeout(function () { if (ch) ch.send({ type: 'broadcast', event: 'result', payload: p }); }, 2500);
      if (window.ArcadeTourney && ArcadeTourney.onMatchEnd) ArcadeTourney.onMatchEnd(m.res);
    });
  }

  window.ArcadeTourney = {
    GAMES: GAMES, directory: directory, open: open, reporter: reporter, matchOf: matchOf, roundName: roundName, newId: function () { return rid(6); },
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
