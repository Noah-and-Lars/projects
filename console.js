/* The Arcade on consoles and TVs (2026-11-11). Loaded by every site page after account.js.
   - Detects PlayStation, Xbox, Nintendo and smart-TV browsers from the user agent. ?console=on|off (or the banner's
     button) overrides it and is remembered in 'arcade-console'.
   - The console version: html.console (bigger text and buttons, a strong focus ring), and a banner saying so.
   - Navigation without a mouse: arrow keys, a TV remote's arrows/OK/Back, and a controller (D-pad or left stick to
     move, A/✕ to choose, B/○ to go back, L1/R1 or LB/RB to switch tabs). Games in play.html's frame get the
     controller to themselves while they're focused. */
(function () {
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
  var pref = '';
  try {
    var q = (location.search.match(/[?&]console=(on|off|auto|playstation|xbox|tv)\b/) || [])[1];
    if (q) localStorage.setItem('arcade-console', q === 'auto' ? '' : q);
    pref = localStorage.getItem('arcade-console') || '';
  } catch (e) {}
  if (/^(playstation|xbox|tv)$/.test(pref)) { found = DEVICES.filter(function (d) { return d[0] === pref; })[0]; pref = 'on'; }
  var on = pref === 'on' || (pref !== 'off' && !!found);
  var device = found ? found[0] : 'tv', label = found ? found[1] : 'TV or console';
  var html = document.documentElement;
  window.ArcadeConsole = { on: on, device: device, label: label, detected: !!found, set: set };
  function set(v) { try { localStorage.setItem('arcade-console', v); } catch (e) {} location.reload(); }

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

  var css = document.createElement('style');
  css.textContent = [
    'html.console{font-size:118%}',
    'html.console body{padding-top:52px}',
    '#consoleBar{position:fixed;top:0;left:0;right:0;z-index:9000;display:flex;align-items:center;gap:12px;padding:8px 16px;background:linear-gradient(90deg,#6c5ce7,#3a2f9e);color:#fff;font:700 15px system-ui,sans-serif;box-shadow:0 4px 18px #0007}',
    '#consoleBar .ic{font-size:20px}#consoleBar .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#consoleBar .keys{opacity:.85;font-weight:600;font-size:13px;white-space:nowrap}',
    '#consoleBar button{border:0;border-radius:999px;padding:7px 14px;background:#ffffff26;color:#fff;font:800 13px system-ui,sans-serif;cursor:pointer}',
    '@media (max-width:760px){#consoleBar .keys{display:none}}',
    // big, obvious focus everywhere: the remote and the controller move it
    'html.console :focus{outline:none}',
    'html.console :focus-visible,html.console .cfocus{outline:4px solid #ffd23f !important;outline-offset:3px !important;box-shadow:0 0 0 8px #ffd23f40 !important;border-radius:10px}',
    'html.console .tile.cfocus,html.console .tile:focus-visible{transform:scale(1.04) translateY(-4px)}',
    'html.console .tab{padding:10px 20px;font-size:17px}',
    'html.console button,html.console .btn,html.console a.btn{min-height:44px}',
    'html.console .grid{grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px}',
    'html.console input,html.console select,html.console textarea{font-size:18px !important}',
    // hover-only bits make no sense with a remote
    'html.console .tile:hover:not(.cfocus){transform:none}'
  ].join('\n');
  document.head.appendChild(css);

  var KEYS_HINT = device === 'tv' ? 'Arrows: move · OK: choose · Back: go back' : device === 'xbox' ? 'D-pad: move · A: choose · B: back · LB/RB: tabs' : device === 'nintendo' ? 'D-pad: move · A: choose · B: back' : 'D-pad: move · ✕: choose · ○: back · L1/R1: tabs';
  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.createElement('div'); bar.id = 'consoleBar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span class="ic">🎮</span><span class="t"></span><span class="keys"></span><button type="button" id="consoleOff">Full website</button>';
    bar.querySelector('.t').textContent = 'You’re on the console version of The Arcade' + (found ? ' · ' + label : '');
    bar.querySelector('.keys').textContent = KEYS_HINT;
    bar.querySelector('#consoleOff').onclick = function () { set('off'); };
    document.body.insertBefore(bar, document.body.firstChild);
    // start with something focused, so the remote works straight away
    setTimeout(function () { if (!document.activeElement || document.activeElement === document.body) { var f = firstFocus(); if (f) focus(f); } }, 400);
  });

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
  function move(dir) {
    var l = list(), a = document.activeElement;
    if (!a || a === document.body || l.indexOf(a) < 0) { var f = firstFocus(); if (f) focus(f); return; }
    var ra = a.getBoundingClientRect(), ax = ra.left + ra.width / 2, ay = ra.top + ra.height / 2, best = null, bd = 1e18;
    // the pinned header is its own layer: it is only reached by going up from the top of the page, and down leaves it
    var HDR = 'header.top', inHdr = !!a.closest(HDR);
    if (inHdr && dir === 'down') { var c = l.filter(function (el) { return !el.closest(HDR) && el.getBoundingClientRect().top > ra.bottom - 4; }).sort(function (x, y) { return x.getBoundingClientRect().top - y.getBoundingClientRect().top || x.getBoundingClientRect().left - y.getBoundingClientRect().left; })[0]; if (c) focus(c); return; }
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
    if (best) focus(best);
    else if (dir === 'up' && !inHdr && scrollY < 40) { var t = document.querySelector(HDR + ' .tab.on') || document.querySelector(HDR + ' a'); if (t) focus(t); }
    else if (dir === 'up') scrollBy(0, -300);
    else if (dir === 'down') scrollBy(0, 300);
  }
  function typing() { var a = document.activeElement; return a && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range)$/i.test(a.type))); }
  function back() {
    var s = scope();
    if (s !== document) { // close the pop-up the way its own Escape handler would, else click its close button
      var ev = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }); document.dispatchEvent(ev);
      var x = s.querySelector('.x,.close,[aria-label=Close],[data-close]'); if (x && visible(x)) x.click();
      return;
    }
    if (history.length > 1) history.back();
  }
  function choose() { var a = document.activeElement; if (a && a !== document.body) { if (a.tagName === 'INPUT' && /^(checkbox|radio)$/i.test(a.type)) a.click(); else if (a.tagName !== 'INPUT' && a.tagName !== 'TEXTAREA') a.click(); else a.focus(); } }
  function tab(d) {
    var tabs = Array.prototype.filter.call(document.querySelectorAll('.tabs .tab'), visible); if (!tabs.length) return;
    var i = tabs.findIndex(function (t) { return t.classList.contains('on'); }); var t = tabs[(i + d + tabs.length) % tabs.length]; if (t) location.href = t.href;
  }
  var inGame = function () { var f = document.getElementById('frame'); return !!(f && f.src && document.activeElement === f); };
  // TV remotes: arrows, OK (Enter), Back (webOS 461, Tizen 10009, others Escape/BrowserBack/GoBack/Backspace)
  document.addEventListener('keydown', function (e) {
    if (inGame()) return;
    var k = e.key, c = e.keyCode;
    if (c === 461 || c === 10009 || k === 'BrowserBack' || k === 'GoBack' || (k === 'Backspace' && !typing())) { e.preventDefault(); back(); return; }
    if (typing() && (k === 'ArrowLeft' || k === 'ArrowRight')) return;
    var dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k];
    if (dir) { e.preventDefault(); if (typing()) document.activeElement.blur(); move(dir); }
  }, true);

  /* ---------- controllers (standard mapping) ---------- */
  var prev = {}, rep = {}, t0 = 0;
  function poll() {
    var t = Date.now();
    if (document.hidden || inGame()) { prev = {}; return; }
    var pads = navigator.getGamepads ? navigator.getGamepads() : [], p = null;
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { p = pads[i]; break; }
    if (!p) return;
    var b = function (n) { return !!(p.buttons[n] && (p.buttons[n].pressed || p.buttons[n].value > 0.5)); };
    var ax = p.axes || [], lx = ax[0] || 0, ly = ax[1] || 0;
    var now = {
      up: b(12) || ly < -0.6, down: b(13) || ly > 0.6, left: b(14) || lx < -0.6, right: b(15) || lx > 0.6,
      a: b(0), back: b(1), l1: b(4), r1: b(5)
    };
    ['up', 'down', 'left', 'right'].forEach(function (d) {
      if (now[d] && (!prev[d] || t - rep[d] > (rep[d + 'n'] ? 130 : 380))) { if (!prev[d]) rep[d + 'n'] = 0; else rep[d + 'n'] = 1; rep[d] = t; move(d); }
    });
    if (now.a && !prev.a) choose();
    if (now.back && !prev.back) back();
    if (now.l1 && !prev.l1) tab(-1);
    if (now.r1 && !prev.r1) tab(1);
    prev = now;
  }
  setInterval(poll, 40); // a timer, not animation frames: browsers pause those in some cases, and 25 checks a second is plenty
})();
