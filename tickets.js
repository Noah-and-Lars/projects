/* tickets.js (2026-11-19): Tickets, The Arcade's play currency. Loaded by account.js (its add-on list) on every page
   with an account button, and directly by tickets.html (the page: balance, earning, shop, history, settings).
   No real money, ever: tickets can't be bought, sold or swapped for anything outside The Arcade.
   - Earning: play.html counts time on screen (15 s steps, one tab at a time through `lt`): +5 for the first 2 minutes
     of play each day, then 1 per 4 minutes, at most DAILY_CAP (20) a day from playing. Helping bonuses (`bonus(id)`):
     once each, outside the cap: 'tour' (the tickets tour on tickets.html) and 'tutorial:<game id>' for games that
     add a tutorial (`ArcadeTickets.bonus('tutorial:<id>')`). Accurate reports need the team to confirm them on the
     server: not built.
   - Spending (the shop): your own cursor trail (drawn here on mouse/trackpad pages), a site colour theme and stickers
     (one worn on your account button). Only you see them for now: showing them to others needs a profile field.
   - Saved in localStorage 'arcade-tickets' (v, b balance, e earned ever, s spent ever, d day, dp/dt/ps today's play
     tickets / play seconds, db daily bonus day, lt last tick, h history newest 100, own, use, done (bonuses), np
     prediction-free mode). account.js GROUPS has it as its own group 'tickets' (score = earned ever), so it rides the
     account's cloud save sync and follows the account to other devices. It is still a browser save, so it is easy to
     edit: that is why tickets only buy looks and can't be gifted until the server keeps the balance.
   - Server mode (2026-11-22): with an online account, the account's server keeps the tickets (/acct/tickets, the
     private Worker's Account.tickets). `check()` asks it; if it answers, `SRV.on` is set and 'arcade-tickets' becomes
     a cache of the server's state (`merge`): play.html sends 'play' every PLAY_MS while a game is on screen (the server
     counts only real time, so editing the browser save changes nothing), the shop and bonuses go to the server, and
     gifts to friends work (`gift`). The first time, the browser's own tickets are moved over once ('import', capped by
     the server). A server without the route (404) or a guest/local account keeps the browser-only behaviour above, so
     the page works before and after the Worker deploy. A gift arrives as { t: 'tk' } on the account's live socket.
   - Prediction-free mode (the player's own switch, `np`) hides predictions but keeps tickets.
     ArcadeTickets.noPredict() tells other code; html gets .arcade-no-predictions and 'arcade:predictions' fires when
     it changes. */
(function () {
  if (window.ArcadeTickets) return;
  var K = 'arcade-tickets';
  var DAILY_CAP = 20, BONUS = 5, BONUS_SECS = 120, STEP = 240, HIST = 100;
  var HELP = { tour: [5, 'Finished the tickets tour'] }; // 'tutorial:<id>': 3 each, see bonus()
  var PLAY_MS = 120000, GIFT_MAX = 20, GIFT_DAY = 30;
  var SRV = { on: false, at: 0, busy: null, lastPlay: 0 };
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    json: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    put: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  var day = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var N = function (v) { v = Math.floor(+v || 0); return v > 0 ? v : 0; };

  /* ---------- the shop ---------- */
  var ITEMS = [
    { id: 'trail:sparkle', k: 'trail', n: 'Sparkles', p: 40, d: 'Little sparks follow your pointer.' },
    { id: 'trail:bubbles', k: 'trail', n: 'Bubbles', p: 40, d: 'Bubbles float up behind your pointer.' },
    { id: 'trail:stars', k: 'trail', n: 'Stars', p: 60, d: 'A trail of tiny gold stars.' },
    { id: 'trail:rainbow', k: 'trail', n: 'Rainbow', p: 80, d: 'A rainbow ribbon of dots.' },
    { id: 'theme:ocean', k: 'theme', n: 'Ocean', p: 50, c: ['#4cc3ff', '#6fd0ff', '#001722'] },
    { id: 'theme:mint', k: 'theme', n: 'Mint', p: 50, c: ['#3ddc97', '#5fe6aa', '#00190d'] },
    { id: 'theme:grape', k: 'theme', n: 'Grape', p: 50, c: ['#a78bfa', '#b9a1ff', '#120a24'] },
    { id: 'theme:gold', k: 'theme', n: 'Gold', p: 50, c: ['#ffb224', '#ffc14d', '#1a1000'] },
    { id: 'theme:rose', k: 'theme', n: 'Rose', p: 50, c: ['#ff6fa8', '#ff8cbb', '#22000d'] },
    { id: 'sticker:controller', k: 'sticker', n: 'Controller', p: 15, e: '🎮' },
    { id: 'sticker:star', k: 'sticker', n: 'Star', p: 15, e: '⭐' },
    { id: 'sticker:rocket', k: 'sticker', n: 'Rocket', p: 20, e: '🚀' },
    { id: 'sticker:alien', k: 'sticker', n: 'Alien', p: 20, e: '👾' },
    { id: 'sticker:fire', k: 'sticker', n: 'Fire', p: 20, e: '🔥' },
    { id: 'sticker:octopus', k: 'sticker', n: 'Octopus', p: 25, e: '🐙' },
    { id: 'sticker:dino', k: 'sticker', n: 'Dino', p: 25, e: '🦖' },
    { id: 'sticker:trophy', k: 'sticker', n: 'Trophy', p: 30, e: '🏆' },
  ];
  var item = function (id) { for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i]; return null; };

  /* ---------- the save ---------- */
  function read() {
    var s = ls.json(K) || {};
    var o = { v: 1, b: N(s.b), e: N(s.e), s: N(s.s), d: s.d || '', dp: N(s.dp), ps: N(s.ps), db: s.db || '', lt: +s.lt || 0, h: Array.isArray(s.h) ? s.h.slice(0, HIST) : [], own: s.own && typeof s.own === 'object' ? s.own : {}, use: s.use && typeof s.use === 'object' ? s.use : {}, done: s.done && typeof s.done === 'object' ? s.done : {}, np: s.np ? 1 : 0, cap: s.cap || '' };
    if (o.d !== day()) { o.d = day(); o.dp = 0; o.ps = 0; } // a new day
    return o;
  }
  function write(o) { o.h = o.h.slice(0, HIST); ls.put(K, o); fire(); }
  function log(o, n, why) { o.h.unshift({ t: Date.now(), n: n, w: String(why).slice(0, 80) }); }
  function earn(o, n, why) { o.b += n; o.e += n; log(o, n, why); }
  var subs = [];
  function fire() { applyLooks(); subs.forEach(function (f) { try { f(); } catch (e) {} }); }
  addEventListener('storage', function (e) { if (e.key === K) { applyPredict(); fire(); } });

  /* ---------- the account's server (server mode) ---------- */
  function acc() { var A = window.ArcadeAccount; return A && A.kind && A.kind() === 'online' && A.token && A.token() ? A : null; }
  function srv(method, body) { var A = acc(); if (!A) return Promise.resolve({ error: 'auth', status: 401 }); return A.api('tickets', { method: method, auth: true, body: body }); }
  function merge(tk) {
    if (!tk || typeof tk !== 'object') return;
    var o = read();
    o.b = N(tk.b); o.e = N(tk.e); o.s = N(tk.s); o.dp = N(tk.dp); o.ps = N(tk.ps); o.db = tk.db === tk.d ? o.d : ''; o.srv = 1;
    o.own = tk.own && typeof tk.own === 'object' ? tk.own : {}; o.done = tk.done && typeof tk.done === 'object' ? tk.done : {};
    o.h = Array.isArray(tk.h) ? tk.h.slice(0, HIST) : [];
    if (typeof tk.giftMax === 'number') GIFT_MAX = tk.giftMax; if (typeof tk.giftDay === 'number') GIFT_DAY = tk.giftDay; SRV.go = N(tk.go);
    for (var k in o.use) if (o.use[k] && !o.own[o.use[k]]) delete o.use[k]; // a look you don't own on the server comes off
    write(o);
  }
  // ask the server once in a while (and after a sign-in); resolves true when server mode is on
  function check(force) {
    if (!acc()) { SRV.on = false; return Promise.resolve(false); }
    if (SRV.busy) return SRV.busy;
    if (!force && Date.now() - SRV.at < 60000) return Promise.resolve(SRV.on);
    SRV.at = Date.now();
    SRV.busy = srv('GET').then(function (j) {
      if (j && j.tk) {
        SRV.on = true;
        if (!j.tk.im) { // move this browser's tickets over, once (the server caps it)
          var o = read();
          return srv('POST', { op: 'import', b: o.b, own: o.own, done: o.done }).then(function (k) { merge(k && k.tk ? k.tk : j.tk); return true; });
        }
        merge(j.tk); return true;
      }
      if (j && j.status === 404) SRV.on = false; // a server from before tickets moved: stay browser-only
      return SRV.on;
    }).catch(function () { return SRV.on; }).then(function (v) { SRV.busy = null; return v; });
    return SRV.busy;
  }
  var ERR = {
    short: function (j) { return 'You need ' + (j.need || 'more') + ' more tickets.'; },
    owned: function () { return 'You already have it.'; },
    not_in_shop: function () { return 'That isn’t in the shop.'; },
    not_friends: function () { return 'You can only send tickets to a friend (you both need to have added each other).'; },
    day_limit: function (j) { return j.left ? 'You can send ' + j.left + ' more today.' : 'That’s today’s gifts sent. More tomorrow!'; },
    their_limit: function () { return 'They’ve had all the gifts they can get today. Try tomorrow!'; },
    amount: function (j) { return 'Send 1 to ' + (j.max || GIFT_MAX) + ' tickets at a time.'; },
    bad: function () { return 'That didn’t work. Check the name and try again.'; },
    offline: function () { return 'Couldn’t reach The Arcade’s server. Check your connection.'; },
    auth: function () { return 'Sign in with your online account first.'; },
  };
  function errText(j) { var f = j && ERR[j.error]; return f ? f(j) : 'That didn’t work. Try again in a moment.'; }

  /* ---------- prediction-free mode ---------- */
  var lastNp = null;
  function applyPredict() {
    var np = !!read().np; document.documentElement.classList.toggle('arcade-no-predictions', np);
    if (np !== lastNp) { lastNp = np; try { dispatchEvent(new CustomEvent('arcade:predictions', { detail: { hidden: np } })); } catch (e) {} }
  }

  /* ---------- earning by playing (play.html) ---------- */
  var onPlay = /play\.html$/.test(location.pathname) && /[?&]game=/.test(location.search);
  function tick() {
    if (document.hidden) return;
    if (SRV.on) return tickServer();
    var o = read(), now = Date.now();
    if (now - o.lt < 14000) return; // another tab counted this moment
    o.lt = now; o.ps += 15;
    var got = 0, msg = '';
    if (o.db !== o.d && o.ps >= BONUS_SECS && o.dp < DAILY_CAP) { var b = Math.min(BONUS, DAILY_CAP - o.dp); o.db = o.d; o.dp += b; earn(o, b, 'Daily bonus for playing'); got += b; msg = 'daily'; }
    var want = Math.min(DAILY_CAP, (o.db === o.d ? BONUS : 0) + Math.floor(Math.max(0, o.ps - BONUS_SECS) / STEP));
    if (o.db === o.d && want > o.dp) { var n = want - o.dp; o.dp += n; earn(o, n, 'Playing ' + gameTitle()); got += n; }
    var capped = o.dp >= DAILY_CAP && o.cap !== o.d; if (capped) o.cap = o.d;
    write(o);
    if (got) pill('🎟️ +' + got + (msg === 'daily' ? ' daily bonus' : ''));
    if (msg === 'daily' && window.ArcadeNotify) ArcadeNotify.push({ ty: 'tickets', who: 'Daily ticket bonus', tx: '+' + BONUS + ' tickets for playing today. Up to ' + DAILY_CAP + ' a day.', href: 'tickets.html', quiet: true });
    if (capped) setTimeout(function () { pill('That’s today’s ' + DAILY_CAP + ' tickets. Play on for fun!'); }, got ? 3000 : 0);
  }
  function tickServer() {
    var o = read(), now = Date.now();
    if (o.dp >= DAILY_CAP && o.srv) return; // today's tickets are in: no more calls today
    if (now - SRV.lastPlay < PLAY_MS - 5000) return;
    if (now - o.lt < PLAY_MS - 20000) return; // another tab sent one just now
    SRV.lastPlay = now; o.lt = now; ls.put(K, o);
    var before = o.dp;
    srv('POST', { op: 'play', g: gameTitle() }).then(function (j) {
      if (!j || !j.tk) { if (j && j.status === 404) SRV.on = false; return; }
      merge(j.tk);
      var got = N(j.got);
      if (got) pill('🎟️ +' + got + (before < BONUS && j.tk.dp >= BONUS && got >= BONUS ? ' daily bonus' : ''));
      if (got && j.tk.dp >= DAILY_CAP) setTimeout(function () { pill('That’s today’s ' + DAILY_CAP + ' tickets. Play on for fun!'); }, 3000);
    });
  }
  function gameTitle() { try { var id = new URLSearchParams(location.search).get('game'); var g = (typeof GAMES !== 'undefined' ? GAMES : []).filter(function (x) { return x.id === id; })[0]; return g ? g.title : 'a game'; } catch (e) { return 'a game'; } }
  function pill(text) {
    var host = document.querySelector('.ptitle-wrap'); if (!host) return;
    var p = document.createElement('span'); p.className = 'tk-pill'; p.setAttribute('role', 'status'); p.textContent = text;
    host.appendChild(p); setTimeout(function () { p.classList.add('out'); setTimeout(function () { p.remove(); }, 500); }, 3200);
  }

  /* ---------- bonuses and the shop ---------- */
  function bonus(id, why) {
    id = String(id || '');
    var h = HELP[id] || (/^tutorial:[a-z0-9-]{1,40}$/.test(id) ? [3, why || 'Finished a tutorial'] : null);
    if (!h) return 0;
    var o = read(); if (o.done[id]) return 0;
    if (/^tutorial:/.test(id) && Object.keys(o.done).filter(function (k) { return /^tutorial:/.test(k); }).length >= 20) return 0;
    if (SRV.on) { srv('POST', { op: 'bonus', k: id }).then(function (j) { if (j && j.tk) merge(j.tk); }); return h[0]; }
    o.done[id] = Date.now(); earn(o, h[0], h[1]); write(o);
    return h[0];
  }
  function buy(id) {
    var it = item(id); if (!it) return { error: 'That isn’t in the shop.' };
    var o = read();
    if (o.own[id]) return { error: 'You already have it.' };
    if (o.b < it.p) return { error: 'You need ' + (it.p - o.b) + ' more tickets.' };
    if (SRV.on) return srv('POST', { op: 'buy', id: id }).then(function (j) {
      if (j && j.tk) merge(j.tk);
      if (!j || !j.ok) return { error: errText(j) };
      var p = read(); p.use[it.k] = id; write(p); return { ok: true };
    });
    o.b -= it.p; o.s += it.p; o.own[id] = Date.now(); log(o, -it.p, 'Bought ' + it.n + ' (' + it.k + ')'); o.use[it.k] = id; write(o);
    return { ok: true };
  }
  function use(kind, id) { // id '' takes it off
    var o = read(); if (id && !o.own[id]) return false;
    if (id) o.use[kind] = id; else delete o.use[kind];
    write(o); return true;
  }
  // gifts (server mode only): a promise of { ok } or { error: text }
  function gift(to, n) {
    to = String(to || '').trim().replace(/^@/, ''); n = Math.floor(+n || 0);
    if (!SRV.on) return Promise.resolve({ error: 'Gifts need an online account.' });
    if (!/^[A-Za-z0-9_]{3,16}$/.test(to)) return Promise.resolve({ error: 'Type your friend’s username.' });
    if (!(n >= 1 && n <= GIFT_MAX)) return Promise.resolve({ error: 'Send 1 to ' + GIFT_MAX + ' tickets at a time.' });
    return srv('POST', { op: 'gift', to: to, n: n }).then(function (j) {
      if (j && j.tk) merge(j.tk);
      return j && j.ok ? { ok: true } : { error: errText(j) };
    });
  }
  function setNoPredict(v) { var o = read(); o.np = v ? 1 : 0; write(o); applyPredict(); }

  /* ---------- your looks on every page ---------- */
  var themeEl = null, stickerT = 0;
  function applyLooks() {
    var o = read(), hide = false;
    // colour theme
    var th = !hide && o.use.theme && o.own[o.use.theme] && item(o.use.theme);
    if (th) {
      if (!themeEl) { themeEl = document.createElement('style'); themeEl.id = 'tkTheme'; document.head.appendChild(themeEl); }
      themeEl.textContent = ':root{--accent:' + th.c[0] + ';--accent-hi:' + th.c[1] + ';--accent-ink:' + th.c[2] + '}';
    } else if (themeEl) themeEl.textContent = '';
    // sticker on your account button (keeps trying until account.js has added it)
    var st = !hide && o.use.sticker && o.own[o.use.sticker] && item(o.use.sticker);
    clearTimeout(stickerT);
    (function put(n) {
      var b = document.getElementById('acctBtn'), old = document.getElementById('tkSticker');
      if (!st) { if (old) old.remove(); return; }
      if (!b) { if (n < 40) stickerT = setTimeout(function () { put(n + 1); }, 250); return; }
      if (!old) { old = document.createElement('span'); old.id = 'tkSticker'; old.setAttribute('aria-hidden', 'true'); }
      old.textContent = st.e; old.title = st.n + ' sticker';
      if (old.parentNode !== b) b.appendChild(old);
    })(0);
    trailKind = !hide && o.use.trail && o.own[o.use.trail] ? o.use.trail.split(':')[1] : '';
  }

  // the cursor trail: only with a mouse or trackpad, never on phones/consoles or with reduced motion
  var trailKind = '', lastDot = 0, hue = 0, layer = null;
  var FINE = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var CALM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  addEventListener('pointermove', function (e) {
    if (!trailKind || !FINE || CALM || e.pointerType !== 'mouse' || document.documentElement.classList.contains('console') || document.documentElement.classList.contains('mob')) return;
    var now = performance.now(); if (now - lastDot < 32) return; lastDot = now;
    if (!layer) { layer = document.createElement('div'); layer.className = 'tk-trail'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); }
    if (layer.childNodes.length > 24) layer.firstChild.remove();
    var d = document.createElement('i'); d.className = 'tk-' + trailKind;
    if (trailKind === 'sparkle') d.textContent = '✦';
    else if (trailKind === 'stars') d.textContent = '★';
    else if (trailKind === 'rainbow') { hue = (hue + 24) % 360; d.style.background = 'hsl(' + hue + ' 90% 60%)'; }
    d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px';
    d.style.setProperty('--dx', (Math.random() * 16 - 8).toFixed(1) + 'px');
    layer.appendChild(d);
    setTimeout(function () { d.remove(); }, 700);
  }, { passive: true });

  var CSS = '' +
    '.tk-trail{position:fixed;inset:0;pointer-events:none;z-index:2147483100;overflow:hidden}' +
    '.tk-trail i{position:absolute;transform:translate(-50%,-50%);font-style:normal;animation:tkF .7s ease-out forwards;will-change:transform,opacity}' +
    '.tk-trail .tk-sparkle{color:#fff3b0;font-size:12px;text-shadow:0 0 6px #ffd84d}' +
    '.tk-trail .tk-stars{color:#ffb224;font-size:11px}' +
    '.tk-trail .tk-bubbles{width:9px;height:9px;border-radius:50%;border:1.5px solid #8fdcff;animation-name:tkB}' +
    '.tk-trail .tk-rainbow{width:7px;height:7px;border-radius:50%}' +
    '@keyframes tkF{to{opacity:0;transform:translate(calc(-50% + var(--dx)),calc(-50% + 10px)) scale(.4)}}' +
    '@keyframes tkB{to{opacity:0;transform:translate(calc(-50% + var(--dx)),calc(-50% - 22px)) scale(1.4)}}' +
    '#tkSticker{position:absolute;left:-2px;top:-4px;font-size:15px;line-height:1;pointer-events:none;filter:drop-shadow(0 1px 2px #000)}.top #acctBtn{position:relative}' +
    '.tk-pill{display:inline-block;margin-left:10px;padding:3px 10px;border-radius:999px;background:#ffb22422;border:1px solid #ffb22466;color:#ffd27a;font:700 12.5px/1.5 var(--font,system-ui);white-space:nowrap;animation:tkP .3s ease-out;transition:opacity .5s}' +
    '.tk-pill.out{opacity:0}@keyframes tkP{from{opacity:0;transform:translateY(-4px)}}' +
    'html.arcade-no-predictions [data-predictions]{display:none!important}';
  function css() { if (document.getElementById('tkCss')) return; var s = document.createElement('style'); s.id = 'tkCss'; s.textContent = CSS; document.head.appendChild(s); }

  function start() {
    css(); applyPredict(); applyLooks();
    if (onPlay) setInterval(tick, 15000);
    setTimeout(function () { check(true).then(function (on) { if (on && onPlay) { SRV.lastPlay = 0; tick(); } }); }, 600);
    var A = window.ArcadeAccount;
    if (A && A.onPulled) A.onPulled(function () { check(); });
    if (A && A.onLive) A.onLive(function (m) {
      if (!m || m.t !== 'tk') return;
      check(true);
      var who = String(m.from || 'A friend').slice(0, 20), n = N(m.n);
      if (window.ArcadeNotify) ArcadeNotify.push({ ty: 'tickets', who: who + ' sent you ' + n + ' tickets', tx: 'A gift! Spend them on looks in the tickets shop.', href: 'tickets.html' });
      else if (A.toast) A.toast('🎟️ ' + who + ' sent you ' + n + ' tickets!');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.ArcadeTickets = {
    DAILY_CAP: DAILY_CAP, BONUS: BONUS, STEP: STEP, ITEMS: ITEMS, HELP: HELP,
    state: read, balance: function () { return read().b; },
    today: function () { var o = read(); return { earned: o.dp, cap: DAILY_CAP, secs: o.ps, bonus: o.db === o.d }; },
    history: function () { return read().h; },
    owns: function (id) { return !!read().own[id]; }, using: function (k) { return read().use[k] || ''; },
    buy: buy, use: use, bonus: bonus,
    noPredict: function () { return !!read().np; }, setNoPredict: setNoPredict,
    onChange: function (f) { subs.push(f); },
    // gifts need the server to hold the balance: only in server mode (there is no browser-only version on purpose)
    canGift: function () { return SRV.on; }, gift: gift, giftLimits: function () { return { max: GIFT_MAX, day: GIFT_DAY, sent: SRV.go || 0 }; },
    server: function () { return SRV.on; }, refresh: function () { return check(true); },
    _test: { tick: tick },
  };
})();
