/* The Arcade on consoles and TVs (2026-11-11). Loaded by every site page after account.js.
   - Detects PlayStation, Xbox, Nintendo and smart-TV browsers from the user agent. ?console=on|off (or the banner's
     button) overrides it and is remembered in 'arcade-console'.
   - The console version: html.console (bigger text and buttons, a strong focus ring), and a banner saying so.
   - Navigation without a mouse: arrow keys, a TV remote's arrows/OK/Back, and a controller (D-pad or left stick to
     move, A/✕ to choose, B/○ to go back, L1/R1 or LB/RB to switch tabs). Games in play.html's frame get the
     controller to themselves while they're focused.
   2026-11-19 (console.js?v=4):
   - 10-foot layout on every page: the page (not the game) is zoomed to suit the screen (`--tvz`, setting "Text size").
   - TV-safe margins: on TVs everything stays 5% in from the screen edges (setting "TV-safe margins").
   - Colour buttons: red Search, green Chat, yellow Profile, blue Home (remote keys 403-406, webOS and Tizen), and on
     a controller X/□ Search, Y/△ Chat, View/Share/− Profile, Menu/Options/+ Home. A legend shows them.
   - Controller rumble when the focus moves or something is chosen (setting).
   - tv.js (loaded from here) adds the TV menu: settings, the on-screen keyboard, the sleep timer, per-game volume,
     family profiles, signing in with a phone and the first-time tour.
   Settings live in 'arcade-acct-tv' (the arcade-acct prefix keeps them on this device, out of the cloud sync).
   2026-11-22 (console.js?v=5): Up/Down scroll a focused scrollable box (the Terms of Service) before moving on.
   On an Apple Watch (html.watch) this file only loads watch.js. */
(function () {
  var me = document.currentScript && document.currentScript.src, base = me ? me.replace(/console\.js(\?.*)?$/, '') : '';
  function load(src) { var s = document.createElement('script'); s.src = base + src; s.async = true; document.head.appendChild(s); }
  if (window.ARCADE_WATCH) { if (!window.ArcadeWatch) load('watch.js?v=1'); return; } // Apple Watch: glances and buzzes, no TV mode
  if (window.ArcadeConsole) return;
  var UA = navigator.userAgent || '';
  var DEVICES = [
    ['playstation', 'PlayStation', /PlayStation|PS4|PS5|PLAYSTATION/],
    ['xbox', 'Xbox', /Xbox|XBOX/],
    ['nintendo', 'Nintendo Switch', /Nintendo/],
    ['tv', 'TV', /SMART-?TV|SmartTV|Tizen|Web0S|WebOS|webOS|NetCast|BRAVIA|AFT[A-Z]|Android TV|GoogleTV|CrKey|HbbTV|Roku|VIDAA|Hisense|Philips|TV Safari|Large Screen|Vizio|AppleTV|Opera TV|OMI\/|DTV/]
  ];
  var found = null;
  for (var i = 0; i < DEVICES.length; i++) if (DEVICES[i][2].test(UA)) { found = DEVICES[i]; break; }

  /* ---------- settings (this device only) ---------- */
  var K_SET = 'arcade-acct-tv';
  var S = {};
  try { S = JSON.parse(localStorage.getItem(K_SET) || '{}') || {}; } catch (e) { S = {}; }
  function saveSet() { try { localStorage.setItem(K_SET, JSON.stringify(S)); } catch (e) {} }

  var pref = '';
  try {
    var q = (location.search.match(/[?&]console=(on|off|auto|playstation|xbox|tv)\b/) || [])[1];
    if (q) localStorage.setItem('arcade-console', q === 'auto' ? '' : q);
    pref = localStorage.getItem('arcade-console') || '';
    // a family profile switch (tv.js) can lose 'arcade-console' to the new account's cloud copy: keep our own note of it
    if (q) { S.pref = q === 'auto' ? '' : q; saveSet(); } else if (!pref && S.pref) { pref = S.pref; localStorage.setItem('arcade-console', pref); }
  } catch (e) {}
  if (/^(playstation|xbox|tv)$/.test(pref)) { found = DEVICES.filter(function (d) { return d[0] === pref; })[0]; pref = 'on'; }
  var on = pref === 'on' || (pref !== 'off' && !!found);
  var device = found ? found[0] : 'tv', label = found ? found[1] : 'TV or console';
  var html = document.documentElement;
  function set(v) { try { localStorage.setItem('arcade-console', v); S.pref = v; saveSet(); } catch (e) {} location.reload(); }
  // defaults: TV-safe margins on TVs only (consoles already keep their picture inside the screen), the sleep timer on TVs
  var DEF = { safe: device === 'tv' ? 'on' : 'off', size: 'large', legend: 1, rumble: 1, osk: 1, sleep: device === 'tv' ? 30 : 0, autovol: 1 };
  function opt(k) { return S[k] === undefined ? DEF[k] : S[k]; }
  function setOpt(k, v) { S[k] = v; saveSet(); apply(); }
  window.ArcadeConsole = { on: on, device: device, label: label, detected: !!found, set: set, opt: opt, setOpt: setOpt, settings: S, saveSettings: saveSet, base: base };

  // offer the console version to a detected device that turned it off
  if (!on) {
    if (found) document.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('button'); b.id = 'consoleBack'; b.type = 'button'; b.textContent = '🎮 Console version';
      b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9000;padding:10px 16px;border-radius:999px;border:0;background:#6c5ce7;color:#fff;font:800 15px system-ui,sans-serif;box-shadow:0 6px 20px #0008';
      b.onclick = function () { set('on'); }; document.body.appendChild(b);
    });
    return;
  }
  html.classList.add('console', 'console-' + device);
  var isPlayer = function () { return !!(document.body && document.body.classList.contains('player')) || /play\.html/.test(location.pathname); };

  /* ---------- 10-foot size and TV-safe margins ---------- */
  // The page is zoomed so it is laid out like a ~1100-1300 px wide screen whatever the TV reports; the game player
  // isn't zoomed (a zoom would also scale the game's own frame), it gets bigger type instead.
  var SIZES = { normal: 0, large: 1.15, xl: 1.35 };
  function apply() {
    var w = innerWidth || 1280, h = innerHeight || 720, m = SIZES[opt('size')];
    var z = m ? Math.max(1, Math.min(2.2, w / 1280 * m)) : 1, zb = isPlayer() ? 1 : z, safe = opt('safe') === 'on';
    var st = html.style;
    st.setProperty('--tvz', String(Math.round(zb * 1000) / 1000));
    st.setProperty('--tv-sx', (safe ? Math.round(w * 0.05 / zb) : 0) + 'px');
    st.setProperty('--tv-sy', (safe ? Math.round(h * 0.05 / zb) : 0) + 'px');
    html.classList.toggle('console-safe', safe);
    html.classList.toggle('console-legend', !!opt('legend'));
  }
  apply(); addEventListener('resize', apply);
  document.addEventListener('DOMContentLoaded', apply);

  var css = document.createElement('style');
  css.textContent = [
    'html.console{--tvz:1;--tv-sx:0px;--tv-sy:0px;--tv-bar:52px}',
    'html.console body{zoom:var(--tvz);padding-top:calc(var(--tv-bar) + var(--tv-sy));padding-right:var(--tv-sx);padding-bottom:var(--tv-sy);min-height:calc(100vh / var(--tvz))}',
    'html.console:not(.mob-phone) body:not(.player){padding-left:calc(var(--rail,84px) + var(--tv-sx) + 8px)}',
    'html.console.mob-phone body:not(.player){padding-left:var(--tv-sx)}',
    // the rail sits under the banner, inside the safe area
    'html.console:not(.mob-phone) body:not(.player)>.top{top:calc(var(--tv-bar) + var(--tv-sy)) !important;bottom:var(--tv-sy) !important;left:var(--tv-sx) !important;height:auto !important;overflow-y:auto;overflow-x:hidden}',
    'html.console-safe:not(.mob-phone) body:not(.player)>.top{border-radius:16px;border:1px solid var(--line,#ffffff1a)}',
    // a shorter rail so it fits a zoomed TV screen; app downloads mean nothing on a TV or console
    'html.console:not(.mob-phone) body:not(.player)>.top .tab{height:52px;gap:3px}',
    'html.console:not(.mob-phone) body:not(.player)>.top .brand{margin-bottom:4px}html.console:not(.mob-phone) body:not(.player)>.top .search-btn{margin-bottom:4px}',
    'html.console .tab[href^="app/"]{display:none !important}',
    // the strip above the banner (inside the TV's overscan) stays plain
    'html.console-safe #consoleBar::before{content:"";position:absolute;left:calc(-1 * var(--tv-sx) - 2px);right:calc(-1 * var(--tv-sx) - 2px);bottom:100%;height:calc(var(--tv-sy) + 2px);background:var(--bg,#050506)}',
    'html.console body.player>.top{top:calc(var(--tv-bar) + var(--tv-sy))}',
    'html.console body.player{padding-left:var(--tv-sx)}',
    'html.console body.player .stage{max-height:calc(100vh - 150px - var(--tv-bar) - var(--tv-sy) * 2)}',
    '#consoleBar{position:fixed;top:var(--tv-sy,0);left:var(--tv-sx,0);right:var(--tv-sx,0);z-index:9000;display:flex;align-items:center;gap:12px;padding:8px 16px;min-height:var(--tv-bar);box-sizing:border-box;background:linear-gradient(90deg,#6c5ce7,#3a2f9e);color:#fff;font:700 15px system-ui,sans-serif;box-shadow:0 4px 18px #0007}',
    'html.console-safe #consoleBar{border-radius:14px}',
    '#consoleBar .ic{font-size:20px}#consoleBar .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#consoleBar .keys{opacity:.85;font-weight:600;font-size:13px;white-space:nowrap}',
    '#consoleBar button{border:0;border-radius:999px;padding:7px 14px;background:#ffffff26;color:#fff;font:800 13px system-ui,sans-serif;cursor:pointer}',
    '@media (max-width:900px){#consoleBar .keys{display:none}}',
    // pop-ups and toasts stay inside the safe area too
    'html.console-safe #acctOv,html.console-safe .notice,html.console-safe .pp-wrap,html.console-safe #trailerOv,html.console-safe #aiPanel{box-sizing:border-box}',
    'html.console-safe #acctOv,html.console-safe .notice,html.console-safe .pp-wrap,html.console-safe #trailerOv{padding:calc(var(--tv-sy) + 10px) calc(var(--tv-sx) + 10px) !important}',
    'html.console-safe #aiPanel{top:calc(var(--tv-sy) + var(--tv-bar)) !important;bottom:var(--tv-sy) !important;right:var(--tv-sx) !important;height:auto !important}',
    'html.console #acctToasts{top:calc(var(--tv-bar) + var(--tv-sy) + 10px) !important;right:calc(var(--tv-sx) + 10px) !important}',
    'html.console-safe #liveNotice,html.console-safe #siteNoticeBar{margin-left:var(--tv-sx);margin-right:var(--tv-sx)}',
    // big, obvious focus everywhere: the remote and the controller move it
    'html.console :focus{outline:none}',
    'html.console :focus-visible,html.console .cfocus{outline:4px solid #ffd23f !important;outline-offset:3px !important;box-shadow:0 0 0 8px #ffd23f40 !important;border-radius:10px}',
    'html.console .tile.cfocus,html.console .tile:focus-visible{transform:scale(1.04) translateY(-4px)}',
    'html.console .tab{padding:10px 20px;font-size:17px}',
    'html.console button,html.console .btn,html.console a.btn{min-height:44px}',
    'html.console .grid{grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px}',
    'html.console input,html.console select,html.console textarea{font-size:18px !important}',
    // 10-foot text on the other pages (on top of the zoom): nothing below ~14px
    'html.console .chat-log,html.console .msg,html.console .bub{font-size:17px}',
    'html.console .chat-send input,html.console .dm-form input{min-height:48px}',
    'html.console .pl-row,html.console .pl-list a,html.console .t-card,html.console .ig-post{font-size:16px}',
    'html.console .sec-sub,html.console .meta,html.console .note,html.console .dm-note,html.console .foot{font-size:14px}',
    'html.console .ig-nav a,html.console .seg button,html.console .chip{min-height:44px;font-size:15px}',
    // the player: no zoom (it would scale the game's frame), so bigger type in the bar and under the game
    'html.console body.player>.top{height:68px}',
    'html.console body.player .ptitle{font-size:22px}html.console body.player .pbest{font-size:15px}',
    'html.console body.player .back{font-size:17px;height:44px}',
    'html.console body.player .actions .btn{font-size:16px;padding:0 16px}',
    'html.console body.player .howto,html.console body.player .howto li{font-size:18px}html.console body.player kbd{font-size:15px}',
    'html.console body.player .more-h{font-size:22px}html.console body.player #more .info h2{font-size:17px}',
    // hover-only bits make no sense with a remote
    'html.console .tile:hover:not(.cfocus){transform:none}',
    // the colour-button legend
    '#tvLegend{position:fixed;right:calc(var(--tv-sx,0px) + 12px);bottom:calc(var(--tv-sy,0px) + 12px);z-index:8990;display:none;gap:4px;padding:6px 8px;border-radius:14px;background:#0b0b10e6;border:1px solid #ffffff1f;box-shadow:0 8px 24px #0009;font:700 13px system-ui,sans-serif;color:#eee}',
    'html.console-legend #tvLegend{display:flex}',
    '#tvLegend button{display:flex;align-items:center;gap:6px;min-height:34px !important;padding:4px 10px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer}',
    '#tvLegend button:hover,#tvLegend button.cfocus{background:#ffffff14}',
    '#tvLegend i{display:inline-grid;place-items:center;min-width:18px;height:18px;border-radius:50%;font:800 10px system-ui,sans-serif;font-style:normal;color:#111}',
    '#tvLegend .r i{background:#ff4d4d}#tvLegend .g i{background:#3ddc6f}#tvLegend .y i{background:#ffd23f}#tvLegend .b i{background:#4d8bff;color:#fff}',
    '#tvLegend small{opacity:.6;font-weight:600}',
    'html.console.tv-ingame #tvLegend{display:none}',
    '@media (max-width:760px){#tvLegend small{display:none}}'
  ].join('\n');
  document.head.appendChild(css);

  // the four shortcuts, with what each device calls the matching controller button
  var PADK = device === 'xbox' ? ['X', 'Y', 'View', 'Menu'] : device === 'nintendo' ? ['Y', 'X', '−', '+'] : device === 'playstation' ? ['□', '△', 'Share', 'Options'] : ['X', 'Y', 'Select', 'Start'];
  var SHORT = [
    { c: 'r', name: 'Search', run: function () { if (/index\.html$|\/$/.test(location.pathname) && document.getElementById('searchBtn')) document.getElementById('searchBtn').click(); else location.href = base + 'index.html?tvsearch=1'; } },
    { c: 'g', name: 'Chat', run: function () { location.href = base + 'chat.html'; } },
    { c: 'y', name: 'Profile', run: function () { var A = window.ArcadeAccount; if (A && A.kind && A.kind() === 'online') location.href = base + 'players.html#p=' + encodeURIComponent(A.name()); else if (A && A.open) A.open(); } },
    { c: 'b', name: 'Home', run: function () { location.href = base + 'index.html'; } }
  ];
  function shortcut(n) { var s = SHORT[n]; if (s) { buzz(30, 0.5); s.run(); } }

  var KEYS_HINT = device === 'tv' ? 'Arrows: move · OK: choose · Back: go back' : device === 'xbox' ? 'D-pad: move · A: choose · B: back · LB/RB: tabs' : device === 'nintendo' ? 'D-pad: move · A: choose · B: back' : 'D-pad: move · ✕: choose · ○: back · L1/R1: tabs';
  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.createElement('div'); bar.id = 'consoleBar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span class="ic">🎮</span><span class="t"></span><span class="keys"></span><button type="button" id="tvMenuBtn">TV menu</button><button type="button" id="consoleOff">Full website</button>';
    bar.querySelector('.t').textContent = 'You’re on the console version of The Arcade' + (found ? ' · ' + label : '');
    bar.querySelector('.keys').textContent = KEYS_HINT;
    bar.querySelector('#consoleOff').onclick = function () { set('off'); };
    bar.querySelector('#tvMenuBtn').onclick = function () { if (window.ArcadeTV) ArcadeTV.menu(); };
    document.body.insertBefore(bar, document.body.firstChild);
    var lg = document.createElement('nav'); lg.id = 'tvLegend'; lg.setAttribute('aria-label', 'Shortcuts');
    SHORT.forEach(function (s, n) {
      var b = document.createElement('button'); b.type = 'button'; b.className = s.c; b.tabIndex = -1;
      b.innerHTML = '<i>' + (device === 'tv' ? '' : PADK[n].charAt(0)) + '</i><span></span>' + (device === 'tv' ? '' : '<small></small>');
      b.querySelector('span').textContent = s.name;
      if (device !== 'tv') b.querySelector('small').textContent = PADK[n];
      b.title = s.name + (device === 'tv' ? ' (' + ['red', 'green', 'yellow', 'blue'][n] + ' button)' : ' (' + PADK[n] + ')');
      b.onclick = function () { shortcut(n); }; lg.appendChild(b);
    });
    document.body.appendChild(lg);
    apply();
    // start with something focused, so the remote works straight away
    setTimeout(function () { if (!document.activeElement || document.activeElement === document.body) { var f = firstFocus(); if (f) focus(f); } }, 400);
    load('tv.js?v=1');
  });
  // Tizen only sends the colour keys to pages that ask for them
  try { if (window.tizen && tizen.tvinputdevice) ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'Info'].forEach(function (k) { try { tizen.tvinputdevice.registerKey(k); } catch (e) {} }); } catch (e) {}

  /* ---------- controller rumble ---------- */
  var lastPad = null;
  function buzz(ms, mag) {
    if (!opt('rumble') || !lastPad) return;
    try {
      var p = navigator.getGamepads()[lastPad.index] || lastPad, a = p.vibrationActuator;
      if (a && a.playEffect) a.playEffect(a.type === 'trigger-rumble' ? 'trigger-rumble' : 'dual-rumble', { duration: ms, strongMagnitude: mag * 0.5, weakMagnitude: mag }).catch(function () {});
      else if (p.hapticActuators && p.hapticActuators[0]) p.hapticActuators[0].pulse(mag, ms);
    } catch (e) {}
  }

  /* ---------- spatial navigation ---------- */
  var SEL = 'a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"]),summary';
  var OVERLAYS = '#acctOv,.ov:not(.hidden):not([hidden]),[role=dialog]:not([hidden]),dialog[open],#tosPop';
  function visible(el) {
    if (!el || el.disabled) return false;
    var r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    var s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false;
    return !el.closest('[hidden],.hidden,[aria-hidden=true]');
  }
  function scope() { // the top-most open pop-up, else the page
    var ovs = Array.prototype.filter.call(document.querySelectorAll(OVERLAYS), function (o) { return visible(o) && o.querySelector(SEL); });
    return ovs.length ? ovs[ovs.length - 1] : document;
  }
  function list() { return Array.prototype.filter.call(scope().querySelectorAll(SEL), function (el) { return el.id !== 'consoleOff' && visible(el); }); }
  function firstFocus() { var l = list(); return document.querySelector('.tile') && visible(document.querySelector('.tile')) && scope() === document ? document.querySelector('.tile') : l.filter(function (el) { return !el.closest('#consoleBar'); })[0] || l[0]; }
  var cur = null;
  function focus(el) {
    if (cur) cur.classList.remove('cfocus');
    cur = el; el.classList.add('cfocus');
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    // instant, so the next press measures where things really are (the fixed header and banner cover the top)
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    var r = el.getBoundingClientRect(), top = el.closest('header,.top,#consoleBar') ? 0 : 130; if (r.top < top) scrollBy(0, r.top - top - 10); else if (r.bottom > innerHeight - 10) scrollBy(0, r.bottom - innerHeight + 20);
  }
  document.addEventListener('focusin', function (e) { if (cur && cur !== e.target) cur.classList.remove('cfocus'); cur = e.target; if (cur.classList) cur.classList.add('cfocus'); });
  // 2026-11-22 (v=5): Up/Down on a scrollable box that has the focus (the Terms of Service text, long pop-ups) scroll it a
  // page at a time until it reaches the end, then move the focus on as usual. Before this the arrows only ever moved the
  // focus, so the terms never scrolled to the bottom and their tick box stayed locked on TVs and consoles.
  function scrollBox(a, dir) {
    if (!a || a === document.body || a === document.documentElement || a.tagName === 'IFRAME' || (dir !== 'up' && dir !== 'down')) return false;
    if (!/auto|scroll/.test(getComputedStyle(a).overflowY) || a.scrollHeight <= a.clientHeight + 2) return false;
    if (dir === 'down' ? a.scrollTop + a.clientHeight >= a.scrollHeight - 2 : a.scrollTop <= 0) return false;
    a.scrollTop += (dir === 'down' ? 1 : -1) * Math.max(60, a.clientHeight * 0.8);
    return true;
  }
  function move(dir) {
    var l = list(), a = document.activeElement;
    if (scrollBox(a, dir)) return;
    if (!a || a === document.body || l.indexOf(a) < 0) { var f = firstFocus(); if (f) focus(f); return; }
    var ra = a.getBoundingClientRect(), ax = ra.left + ra.width / 2, ay = ra.top + ra.height / 2, best = null, bd = 1e18;
    // the pinned header is its own layer: it is only reached by going up from the top of the page, and down leaves it
    var HDR = 'header.top', inHdr = !!a.closest(HDR);
    if (inHdr && dir === 'down') { var c = l.filter(function (el) { return !el.closest(HDR) && el.getBoundingClientRect().top > ra.bottom - 4; }).sort(function (x, y) { return x.getBoundingClientRect().top - y.getBoundingClientRect().top || x.getBoundingClientRect().left - y.getBoundingClientRect().left; })[0]; if (c) { focus(c); buzz(18, 0.25); } return; }
    if (inHdr && dir === 'up') return;
    for (var i = 0; i < l.length; i++) {
      var el = l[i]; if (el === a) continue;
      if (!inHdr && el.closest(HDR)) continue;
      var r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, dx = x - ax, dy = y - ay;
      var horiz = dir === 'left' || dir === 'right', main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy, side = horiz ? Math.abs(dy) : Math.abs(dx);
      if (main <= 4) continue;
      // left and right stay on the same row (the boxes must overlap up and down)
      if (horiz && (r.bottom < ra.top + 4 || r.top > ra.bottom - 4)) continue;
      // up and down prefer things that overlap side to side
      var overlap = r.right > ra.left + 4 && r.left < ra.right - 4;
      var d = main + side * (horiz ? 2.5 : overlap ? 0.5 : 3); if (d < bd) { bd = d; best = el; }
    }
    if (best) { focus(best); buzz(18, 0.25); }
    else if (dir === 'up' && !inHdr && scrollY < 40 && scope() === document) { /* never out of an open pop-up (2026-11-18) */ var t = document.querySelector(HDR + ' .tab.on') || document.querySelector(HDR + ' a'); if (t) { focus(t); buzz(18, 0.25); } }
    else if (dir === 'up') scrollBy(0, -300);
    else if (dir === 'down') scrollBy(0, 300);
  }
  function typing() { var a = document.activeElement; return a && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range)$/i.test(a.type))); }
  function textField(a) { return a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|password|email|url|tel|number|)$/i.test(a.type || ''))); }
  function back() {
    if (window.ArcadeTV && ArcadeTV.back && ArcadeTV.back()) return; // tv.js's own pop-ups (keyboard, menu, tour)
    var s = scope();
    if (s !== document) { // close the pop-up the way its own Escape handler would, else click its close button
      var ev = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }); document.dispatchEvent(ev);
      var x = s.querySelector('.x,.close,[aria-label=Close],[data-close]'); if (x && visible(x)) x.click();
      return;
    }
    if (history.length > 1) history.back();
  }
  function choose() {
    var a = document.activeElement; if (!a || a === document.body) return;
    buzz(40, 0.6);
    if (a.tagName === 'INPUT' && /^(checkbox|radio)$/i.test(a.type)) a.click();
    else if (textField(a) && window.ArcadeTV && ArcadeTV.osk && opt('osk')) ArcadeTV.osk(a); // the on-screen keyboard (tv.js)
    else if (a.tagName !== 'INPUT' && a.tagName !== 'TEXTAREA') a.click();
    else a.focus();
  }
  function tab(d) {
    var tabs = Array.prototype.filter.call(document.querySelectorAll('.tabs .tab'), visible); if (!tabs.length) return;
    var i = tabs.findIndex(function (t) { return t.classList.contains('on'); }); var t = tabs[(i + d + tabs.length) % tabs.length]; if (t) location.href = t.href;
  }
  var inGame = function () { var f = document.getElementById('frame'); return !!(f && f.src && document.activeElement === f); };
  setInterval(function () { html.classList.toggle('tv-ingame', inGame()); }, 500);
  var COLOR = { 403: 0, 404: 1, 405: 2, 406: 3 }; // red, green, yellow, blue on webOS, Tizen and most HbbTV remotes
  // TV remotes: arrows, OK (Enter), Back (webOS 461, Tizen 10009, others Escape/BrowserBack/GoBack/Backspace)
  document.addEventListener('keydown', function (e) {
    if (inGame()) return;
    if (window.ArcadeTV && ArcadeTV.key && ArcadeTV.key(e)) { e.stopPropagation(); return; } // the on-screen keyboard takes the keys while it's open
    var k = e.key, c = e.keyCode;
    if (c in COLOR || /^Color?F[0-3]/.test(k)) { e.preventDefault(); shortcut(c in COLOR ? COLOR[c] : +k.replace(/\D/g, '').charAt(1)); return; }
    if (c === 457 || k === 'Info' || k === 'ContextMenu') { if (window.ArcadeTV) { e.preventDefault(); ArcadeTV.menu(); } return; }
    if (c === 461 || c === 10009 || k === 'BrowserBack' || k === 'GoBack' || (k === 'Backspace' && !typing())) { e.preventDefault(); back(); return; }
    // OK on an empty text box opens the on-screen keyboard; with text in it, Enter still sends
    if (k === 'Enter' && textField(document.activeElement) && !document.activeElement.value && window.ArcadeTV && ArcadeTV.osk && opt('osk')) { e.preventDefault(); e.stopPropagation(); ArcadeTV.osk(document.activeElement); return; }
    if (typing() && (k === 'ArrowLeft' || k === 'ArrowRight')) return;
    var dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k];
    if (dir) { e.preventDefault(); if (typing()) document.activeElement.blur(); move(dir); }
  }, true);

  /* ---------- controllers (standard mapping) ---------- */
  var prev = {}, rep = {};
  function poll() {
    var t = Date.now();
    if (document.hidden || inGame()) { prev = {}; return; }
    var pads = navigator.getGamepads ? navigator.getGamepads() : [], p = null;
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { p = pads[i]; break; }
    if (!p) return;
    lastPad = p;
    var b = function (n) { return !!(p.buttons[n] && (p.buttons[n].pressed || p.buttons[n].value > 0.5)); };
    var ax = p.axes || [], lx = ax[0] || 0, ly = ax[1] || 0;
    var now = {
      up: b(12) || ly < -0.6, down: b(13) || ly > 0.6, left: b(14) || lx < -0.6, right: b(15) || lx > 0.6,
      a: b(0), back: b(1), x: b(2), y: b(3), l1: b(4), r1: b(5), sel: b(8), start: b(9), l3: b(10)
    };
    var acts = window.ArcadeTV && ArcadeTV.pad ? ArcadeTV.pad : null; // tv.js's keyboard uses X/Y itself while open
    ['up', 'down', 'left', 'right'].forEach(function (d) {
      if (now[d] && (!prev[d] || t - rep[d] > (rep[d + 'n'] ? 130 : 380))) { if (!prev[d]) rep[d + 'n'] = 0; else rep[d + 'n'] = 1; rep[d] = t; move(d); }
    });
    if (now.a && !prev.a) choose();
    if (now.back && !prev.back) back();
    if (now.x && !prev.x && !(acts && acts('x'))) shortcut(0);
    if (now.y && !prev.y && !(acts && acts('y'))) shortcut(1);
    if (now.sel && !prev.sel) shortcut(2);
    if (now.start && !prev.start) shortcut(3);
    if (now.l3 && !prev.l3 && window.ArcadeTV) ArcadeTV.menu();
    if (now.l1 && !prev.l1) tab(-1);
    if (now.r1 && !prev.r1) tab(1);
    prev = now;
  }
  setInterval(poll, 40); // a timer, not animation frames: browsers pause those in some cases, and 25 checks a second is plenty

  window.ArcadeConsole.focus = focus; window.ArcadeConsole.buzz = buzz; window.ArcadeConsole.shortcuts = SHORT; window.ArcadeConsole.padKeys = PADK;
  window.ArcadeConsole.inGame = inGame; window.ArcadeConsole.firstFocus = firstFocus;
})();
