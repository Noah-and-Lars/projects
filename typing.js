/* "… is typing" (2026-11-14, the owner's request) for private chats, group chats and the Global chat.
   Load after account.js. Nothing is stored anywhere: a typing signal is a tiny live message that disappears.
   - Private and group chats: the signal rides the accounts' call set-up route (/acct/call, the same one call.js uses for
     ringing) as d = { k: 'typ', g: <group id or ''>, stop?: 1 }. The server passes it to the other player's open pages
     (nobody you blocked, and only signed-in players). call.js ignores it (it has no id).
   - Global chat: a realtime channel 'chattyping:<room>' (rt.js, via ArcadeOnline.ready) carrying { n: account name }.
     Only signed-in players can send and see it (realtime needs an account); chat.html only shows names that the chat
     server lists as signed-in people in the room, so a name can't be made up.
   While someone types, a signal goes at most every 2.5 s; the line goes away 6 s after their last one, when they send,
   or when their message arrives. */
(function () {
  if (window.ARCADE_WATCH) return; // Apple Watch: no video calls, clip recorder, typing dots or TV mode (lighter)
  if (window.ArcadeTyping) return;
  var A = window.ArcadeAccount, EVERY = 2500, SHOW = 6000;
  var who = {}, subs = [], lc = function (s) { return String(s || '').toLowerCase(); };
  function list(key) {
    var o = who[key], now = Date.now(), out = [];
    if (!o) return out;
    for (var k in o) { if (now - o[k].at < SHOW) out.push(o[k].n); else delete o[k]; }
    return out;
  }
  function fire(key) { subs.forEach(function (s) { if (s.key === key || s.key === '*') { var l = list(s.key === '*' ? key : s.key), sig = key + '|' + l.join(','); if (s.key !== '*' && !s.always && sig === s.last) return; s.last = sig; try { s.f(l, key); } catch (e) {} } }); }
  // someone is typing in `key` (a lower-case player name for a private chat, 'g~<id>' for a group, 'global' for the Global chat)
  function heard(key, n, stop) {
    var o = who[key] || (who[key] = {});
    if (stop) { if (!o[lc(n)]) return; delete o[lc(n)]; } else o[lc(n)] = { n: String(n), at: Date.now() };
    fire(key);
  }
  setInterval(function () { for (var key in who) { var had = Object.keys(who[key]).length; if (had && list(key).length !== had) fire(key); } }, 1000);
  if (A && A.onLive) A.onLive(function (m) {
    if (!m || m.t !== 'call' || !m.n || !m.d || m.d.k !== 'typ') return;
    var g = String(m.d.g || '').replace(/[^0-9a-f]/g, '').slice(0, 16);
    heard(g ? 'g~' + g : lc(m.n), m.n, !!m.d.stop);
  });
  // A sender for one chat. names(): who to tell (a function, so a group's member list stays current).
  function sender(names, g) {
    var last = 0, on = false;
    function tell(d) { if (!A || !A.api || !A.name || !A.name()) return; (names() || []).slice(0, 15).forEach(function (n) { if (n && lc(n) !== lc(A.name())) A.api('call', { method: 'POST', auth: true, body: { to: n, d: d } }); }); }
    return {
      // call on every input event, with the box's current text
      input: function (text) { if (!String(text || '').trim()) { this.stop(); return; } var now = Date.now(); if (now - last < EVERY) return; last = now; on = true; tell({ k: 'typ', g: g || '' }); },
      // sent, cleared or left: tell them straight away
      stop: function () { if (!on) return; on = false; last = 0; tell({ k: 'typ', g: g || '', stop: 1 }); }
    };
  }
  function label(names) {
    if (!names.length) return '';
    if (names.length === 1) return names[0] + ' is typing';
    if (names.length === 2) return names[0] + ' and ' + names[1] + ' are typing';
    if (names.length === 3) return names[0] + ', ' + names[1] + ' and ' + names[2] + ' are typing';
    return 'Several people are typing';
  }
  // the "… is typing" line: an element that fills itself in while it's on the page
  function line(key, filter) {
    var el = document.createElement('div'), t = document.createElement('span'), dots = document.createElement('i');
    el.className = 'arcade-typing'; el.setAttribute('aria-live', 'polite'); dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = '<b></b><b></b><b></b>'; el.append(dots, t);
    var s = { key: key, last: '', always: 1, f: function (l) { if (!el.isConnected && s.seen) { off(); return; } if (el.isConnected) s.seen = 1; if (filter) l = l.filter(filter); var x = label(l); t.textContent = x ? x + '…' : ''; el.classList.toggle('on', !!x); } };
    function off() { var i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }
    subs.push(s); s.f(list(key));
    setTimeout(function () { s.f(list(key)); }, 0);
    return el;
  }
  function watch(key, f) { var s = { key: key, last: '', f: f }; subs.push(s); return function () { var i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; }
  var css = document.createElement('style');
  css.textContent = '.arcade-typing{display:flex;align-items:center;gap:7px;min-height:20px;padding:2px 14px;font-size:13px;color:var(--muted,#a19dbf);visibility:hidden}' +
    '.arcade-typing.on{visibility:visible}.arcade-typing i{display:inline-flex;gap:3px}' +
    '.arcade-typing i b{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.4;animation:arcadeTyp 1.2s infinite}' +
    '.arcade-typing i b:nth-child(2){animation-delay:.15s}.arcade-typing i b:nth-child(3){animation-delay:.3s}' +
    '@keyframes arcadeTyp{0%,60%,100%{transform:none;opacity:.4}30%{transform:translateY(-3px);opacity:1}}' +
    '@media (prefers-reduced-motion:reduce){.arcade-typing i b{animation:none}}';
  (document.head || document.documentElement).appendChild(css);
  window.ArcadeTyping = {
    dm: function (name) { return sender(function () { return [typeof name === 'function' ? name() : name]; }, ''); },
    group: function (id, members) { return sender(members, id); },
    heard: heard, list: list, refresh: fire, label: label, line: line, watch: watch
  };
})();
