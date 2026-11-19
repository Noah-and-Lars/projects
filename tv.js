/* tv.js (2026-11-19): the extras of the console/TV version. console.js loads it once html.console is on.
   - TV menu (the banner's "TV menu" button, the remote's Info key, or pressing the left stick): settings, family
     profiles, sign in with your phone, per-game volume (on play.html) and the tour again.
   - On-screen keyboard for text boxes (OK / A on a text box; X = delete, Y = space while it's open).
   - Sleep timer: after N idle minutes (no remote, controller, mouse or game input; never in a video call or while a
     video plays) the TV goes back to the home page, with a minute's warning.
   - Per-game volume: play.html's games are on this site, so their sound can be reached. Web Audio sound goes through a
     gain node we add after the game's output (after clips.js's recorder tap, so clips keep the game's own level); an
     analyser learns each game's average loudness and "Even out game volume" trims it towards one level (-12 to +6 dB).
     <audio>/<video> sound only gets the manual trim (its loudness can't be measured without rerouting it).
   - Family profiles: several online accounts remembered on this TV ('arcade-acct-couch', never synced). Switching
     syncs the current account first, clears this device's copy of the progress (like logging out, but the session is
     kept), signs in as the other account and reloads, so account.js downloads that account's progress.
   - Sign in with your phone: the TV shows a QR code and a 5-letter code on the realtime channel pair:<code> (free to
     join without an account, like pair.js). The phone (tvlink.html) types the username and password, stretches the
     password like account.js does and sends {name, key} encrypted for this TV only (ECDH P-256 + AES-GCM; the TV's
     public key is in the QR code, or handed over after the phone commits to its own key, and both screens show a
     6-digit check number). The TV asks before it signs in, then logs in itself with /acct/login, so it gets its own
     session and the phone's stays as it was.
   - First-time tour of the controls the first time console mode starts. */
(function () {
  var C = window.ArcadeConsole;
  if (!C || !C.on || window.ArcadeTV) return;
  var S = C.settings, opt = C.opt, base = C.base || '';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del: function (k) { try { localStorage.removeItem(k); } catch (e) {} } };
  var ss = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }, del: function (k) { try { sessionStorage.removeItem(k); } catch (e) {} } };
  var A = function () { return window.ArcadeAccount; };
  var online = function () { var a = A(); return !!(a && a.kind && a.kind() === 'online'); };
  var gameId = (function () { var m = /[?&]game=([^&]+)/.exec(location.search); return /play\.html/.test(location.pathname) && m ? decodeURIComponent(m[1]) : ''; })();

  /* ---------- pop-ups ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '.tvov{position:fixed;inset:0;z-index:9600;display:flex;align-items:center;justify-content:center;padding:calc(var(--tv-sy,0px) + 16px) calc(var(--tv-sx,0px) + 16px);background:#05050ae0;font:500 17px/1.45 system-ui,sans-serif;color:#f4f4f5;box-sizing:border-box}',
    '.tvov .tvbox{width:min(760px,100%);max-height:100%;overflow:auto;background:#121218;border:1px solid #ffffff22;border-radius:20px;padding:24px 26px;box-shadow:0 30px 80px #000c}',
    '.tvov h2{margin:0 0 6px;font:800 28px/1.15 system-ui,sans-serif}.tvov h3{margin:20px 0 8px;font:800 15px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:#a6a6b3}',
    '.tvov p{margin:0 0 10px;color:#c9c9d3}.tvov .tvrow{display:flex;flex-wrap:wrap;gap:10px;align-items:center}',
    '.tvov button{min-height:48px;padding:0 18px;border-radius:12px;border:1px solid #ffffff24;background:#1d1d26;color:#fff;font:700 17px system-ui,sans-serif;cursor:pointer}',
    '.tvov button.pri{background:#ff6a3d;border-color:#ff6a3d;color:#160a05}.tvov button.dan{color:#ff8b8b}',
    '.tvov .tvset{display:grid;grid-template-columns:1fr auto;gap:8px 16px;align-items:center}.tvov .tvset span{color:#d9d9e2}',
    '.tvov .tvset button{min-width:150px}',
    '.tvov .tvprof{display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid #ffffff12}.tvov .tvprof b{flex:1;font-size:19px}',
    '.tvov .tvprof .av{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font:800 18px system-ui;color:#fff}',
    '.tvov .tvnote{font-size:14px;color:#9a9aa8}',
    '.tvov .tvcode{display:flex;gap:8px;margin:8px 0 12px}.tvov .tvcode span{width:54px;height:66px;display:grid;place-items:center;border-radius:12px;background:#ffffff12;font:800 36px ui-monospace,monospace}',
    '.tvov .tvqr{width:220px;height:220px;background:#fff;border-radius:14px;padding:8px;flex:none}.tvov .tvqr svg{width:100%;height:100%;display:block}',
    '.tvov .tvsas{font:800 34px ui-monospace,monospace;letter-spacing:.12em;color:#ffd23f}',
    // the on-screen keyboard: a strip along the bottom of the screen
    '#tvOsk{position:fixed;left:0;right:0;bottom:0;z-index:9700;padding:12px calc(var(--tv-sx,0px) + 16px) calc(var(--tv-sy,0px) + 12px);background:#0d0d14f5;border-top:1px solid #ffffff22;box-shadow:0 -20px 60px #000c;font:600 18px system-ui,sans-serif;color:#fff}',
    '#tvOsk .ok-top{display:flex;align-items:center;gap:12px;margin:0 auto 10px;max-width:980px}',
    '#tvOsk .ok-text{flex:1;min-height:48px;padding:10px 14px;border-radius:12px;background:#ffffff10;border:2px solid #ffffff26;font:500 20px system-ui,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}',
    '#tvOsk .ok-text::after{content:"";display:inline-block;width:2px;height:1.1em;margin-left:2px;vertical-align:-3px;background:#ffd23f}',
    '#tvOsk .ok-text.ph{color:#8d8d99}',
    '#tvOsk .ok-keys{display:grid;grid-template-columns:repeat(10,1fr);gap:6px;max-width:980px;margin:0 auto}',
    '#tvOsk button{min-height:50px !important;border-radius:10px;border:1px solid #ffffff1c;background:#20202b;color:#fff;font:700 20px system-ui,sans-serif;cursor:pointer;padding:0}',
    '#tvOsk button.w2{grid-column:span 2}#tvOsk button.w3{grid-column:span 3}#tvOsk button.w4{grid-column:span 4}#tvOsk button.go{background:#ff6a3d;color:#160a05;border-color:#ff6a3d}',
    '#tvOsk .ok-help{max-width:980px;margin:8px auto 0;font-size:13px;color:#9a9aa8;text-align:center}',
    '#tvSleep{position:fixed;left:50%;top:calc(var(--tv-sy,0px) + 70px);transform:translateX(-50%);z-index:9650;padding:14px 22px;border-radius:16px;background:#1d1d26;border:1px solid #ffd23f;color:#fff;font:700 18px system-ui,sans-serif;box-shadow:0 12px 40px #000c}',
    '#tvToast{position:fixed;left:50%;bottom:calc(var(--tv-sy,0px) + 70px);transform:translateX(-50%);z-index:9650;padding:12px 20px;border-radius:14px;background:#1d1d26;border:1px solid #ffffff33;color:#fff;font:700 17px system-ui,sans-serif;box-shadow:0 12px 40px #000c}',
    '.tvtour .tvbox{text-align:center}.tvtour .big{font-size:64px;line-height:1;margin:6px 0 10px}.tvtour .dots{display:flex;gap:6px;justify-content:center;margin:14px 0}.tvtour .dots i{width:9px;height:9px;border-radius:50%;background:#ffffff33}.tvtour .dots i.on{background:#ffd23f}',
    '.tvtour .keys{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:10px 0}.tvtour kbd{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:10px;background:#ffffff14;font:700 16px system-ui,sans-serif}',
    '.tvtour kbd i{display:inline-block;width:14px;height:14px;border-radius:50%}'
  ].join('\n');
  document.head.appendChild(css);

  var stack = [];
  function overlay(inner, cls, onClose) {
    var d = document.createElement('div'); d.className = 'tvov ' + (cls || ''); d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = '<div class="tvbox">' + inner + '</div>';
    d._close = onClose; document.body.appendChild(d); stack.push(d);
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(d); } });
    setTimeout(function () { var f = d.querySelector('[data-first]') || d.querySelector('button'); if (f) C.focus(f); }, 30);
    return d;
  }
  function close(d) {
    d = d || stack[stack.length - 1]; if (!d) return;
    stack = stack.filter(function (x) { return x !== d; }); d.remove();
    if (d._close) try { d._close(); } catch (e) {}
    var top = stack[stack.length - 1]; if (top) { var f = top.querySelector('button'); if (f) C.focus(f); }
  }
  function toast(t, ms) {
    var o = $('tvToast'); if (o) o.remove();
    o = document.createElement('div'); o.id = 'tvToast'; o.setAttribute('role', 'status'); o.textContent = t; document.body.appendChild(o);
    setTimeout(function () { if (o.parentNode) o.remove(); }, ms || 3500);
  }

  /* ---------- the TV menu ---------- */
  var SIZE_NAMES = { normal: 'Normal', large: 'Large', xl: 'Extra large' };
  var SETTINGS = [
    { k: 'size', name: 'Text size', vals: ['normal', 'large', 'xl'], show: function (v) { return SIZE_NAMES[v]; } },
    { k: 'safe', name: 'TV-safe margins (5% from the edges)', vals: ['on', 'off'], show: function (v) { return v === 'on' ? 'On' : 'Off'; } },
    { k: 'legend', name: 'Colour button legend', vals: [1, 0], show: onOff },
    { k: 'rumble', name: 'Controller rumble', vals: [1, 0], show: onOff },
    { k: 'osk', name: 'On-screen keyboard', vals: [1, 0], show: onOff },
    { k: 'sleep', name: 'Back to home when idle', vals: [0, 15, 30, 60], show: function (v) { return v ? 'After ' + v + ' min' : 'Off'; } },
    { k: 'autovol', name: 'Even out game volume', vals: [1, 0], show: onOff }
  ];
  function onOff(v) { return v ? 'On' : 'Off'; }
  function menu() {
    var old = document.querySelector('.tvmenu'); if (old) { close(old); return; }
    var h = '<h2>TV menu</h2><p>Settings for this TV. Back closes this.</p>';
    h += '<h3>Profiles</h3><div id="tvProfs"></div>';
    h += '<div class="tvrow" style="margin-top:8px"><button type="button" id="tvAdd">Add another account</button>' + (online() ? '' : '<button type="button" id="tvPhone" class="pri">Sign in with your phone</button>') + '</div>';
    if (gameId) h += '<h3>Volume for this game</h3><div class="tvrow"><button type="button" id="tvVolDn" aria-label="Quieter">− Quieter</button><b id="tvVolV" style="min-width:120px;text-align:center"></b><button type="button" id="tvVolUp" aria-label="Louder">+ Louder</button></div><p class="tvnote" id="tvVolN"></p>';
    h += '<h3>Settings</h3><div class="tvset">' + SETTINGS.map(function (s, i) { return '<span>' + esc(s.name) + '</span><button type="button" data-set="' + i + '"></button>'; }).join('') + '</div>';
    h += '<h3>Help</h3><div class="tvrow"><button type="button" id="tvTour">Show the tour again</button><button type="button" id="tvClose" class="pri">Done</button></div>';
    var d = overlay(h, 'tvmenu');
    var paint = function () {
      d.querySelectorAll('[data-set]').forEach(function (b) { var s = SETTINGS[+b.dataset.set]; b.textContent = s.show(opt(s.k)); });
      if (gameId) { var v = vol(gameId); $('tvVolV').textContent = fmtDb(v.m) + ' dB'; $('tvVolN').textContent = opt('autovol') ? (v.n >= 15 ? 'Evening out adds ' + fmtDb(v.a) + ' dB for this game.' : 'Still learning how loud this game is.') + (audioHooked ? '' : ' (This game hasn’t made any sound yet.)') : 'Evening out is off: only your own setting applies.'; }
      profList(d.querySelector('#tvProfs'));
    };
    d.querySelectorAll('[data-set]').forEach(function (b) { b.onclick = function () { var s = SETTINGS[+b.dataset.set], i = s.vals.indexOf(opt(s.k)); C.setOpt(s.k, s.vals[(i + 1) % s.vals.length]); paint(); applyVol(); }; });
    if (gameId) { $('tvVolDn').onclick = function () { setMan(-3); paint(); }; $('tvVolUp').onclick = function () { setMan(3); paint(); }; }
    $('tvTour').onclick = function () { close(d); tour(); };
    $('tvClose').onclick = function () { close(d); };
    $('tvAdd').onclick = addAccount;
    if ($('tvPhone')) $('tvPhone').onclick = function () { close(d); phoneSignIn(); };
    paint();
  }

  /* ---------- on-screen keyboard ---------- */
  var ROWS = { abc: ['1234567890', 'qwertyuiop', 'asdfghjkl\'', 'zxcvbnm,.?'], sym: ['1234567890', '!@#$%&*()-', '_+=/:;"<>~', '[]{}|\\^`€£'] };
  var osk = null;
  function oskOpen(input) {
    if (osk) return;
    var mode = 'abc', shift = false, pass = input.type === 'password';
    var d = document.createElement('div'); d.id = 'tvOsk'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'On-screen keyboard');
    var im = input.getAttribute('inputmode'); input.setAttribute('inputmode', 'none'); // keeps a TV's own keyboard away
    var label = input.getAttribute('aria-label') || input.placeholder || 'Type here';
    d.innerHTML = '<div class="ok-top"><div class="ok-text" aria-live="polite"></div></div><div class="ok-keys"></div><div class="ok-help"></div>';
    document.body.appendChild(d);
    var keys = d.querySelector('.ok-keys'), text = d.querySelector('.ok-text');
    d.querySelector('.ok-help').textContent = C.device === 'tv' ? 'OK types · Back closes' : 'A types · ' + (C.padKeys[0]) + ' deletes · ' + (C.padKeys[1]) + ' adds a space · B closes';
    function show() { var v = input.value; text.classList.toggle('ph', !v); text.textContent = v ? (pass ? v.replace(/./g, '•') : v) : label; }
    function put(v) {
      var max = input.maxLength > 0 ? input.maxLength : 1e6;
      var nv = v.slice(0, max);
      try { var proto = Object.getPrototypeOf(input), setter = Object.getOwnPropertyDescriptor(proto, 'value').set; setter.call(input, nv); } catch (e) { input.value = nv; }
      input.dispatchEvent(new Event('input', { bubbles: true })); show();
    }
    function type(ch) { put(input.value + ch); if (shift) { shift = false; draw(); } }
    function del() { put(input.value.slice(0, -1)); }
    function submit() {
      finish();
      var f = input.form;
      if (f) { if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }
      else ['keydown', 'keyup'].forEach(function (t) { input.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })); });
    }
    function finish() { if (!osk) return; d.remove(); osk = null; if (im === null) input.removeAttribute('inputmode'); else input.setAttribute('inputmode', im); C.focus(input); }
    var keyEl = function (t, f, cls, aria) { var b = document.createElement('button'); b.type = 'button'; b.textContent = t; if (cls) b.className = cls; if (aria) b.setAttribute('aria-label', aria); b.onclick = f; return b; };
    function draw() {
      var at = document.activeElement && keys.contains(document.activeElement) ? Array.prototype.indexOf.call(keys.children, document.activeElement) : 0;
      keys.innerHTML = '';
      ROWS[mode].forEach(function (row) { row.split('').forEach(function (ch) { var c = shift ? ch.toUpperCase() : ch; keys.appendChild(keyEl(c, function () { type(c); })); }); });
      keys.appendChild(keyEl(shift ? '⇧ ABC' : '⇧', function () { shift = !shift; draw(); }, '', 'Capital letters'));
      keys.appendChild(keyEl(mode === 'abc' ? '#+=' : 'abc', function () { mode = mode === 'abc' ? 'sym' : 'abc'; draw(); }, '', mode === 'abc' ? 'Symbols' : 'Letters'));
      keys.appendChild(keyEl('Space', function () { type(' '); }, 'w4'));
      keys.appendChild(keyEl('⌫', del, '', 'Delete'));
      keys.appendChild(keyEl('Close', finish, ''));
      keys.appendChild(keyEl(input.form || /search|chat|message/i.test(label) ? 'Send' : 'Done', submit, 'go w2'));
      var b = keys.children[Math.min(at, keys.children.length - 1)]; if (b) C.focus(b);
    }
    osk = { close: finish, type: type, del: del, el: d };
    draw(); show();
  }

  /* ---------- sleep timer ---------- */
  var lastAct = Date.now(), warnEl = null;
  function act() { lastAct = Date.now(); if (warnEl) { warnEl.remove(); warnEl = null; } }
  ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'].forEach(function (t) { addEventListener(t, act, { capture: true, passive: true }); });
  var padStamp = '';
  function hookFrameActivity() { // input inside the game counts too (the game is same-origin)
    var f = $('frame'); if (!f) return;
    var w; try { w = f.contentWindow; if (!w || w.__tvAct) return; w.__tvAct = 1; } catch (e) { return; }
    ['keydown', 'pointerdown', 'touchstart', 'mousemove', 'wheel'].forEach(function (t) { try { w.addEventListener(t, act, { capture: true, passive: true }); } catch (e) {} });
  }
  setInterval(function () {
    hookFrameActivity();
    try { var pads = navigator.getGamepads ? navigator.getGamepads() : [], st = ''; for (var i = 0; i < pads.length; i++) if (pads[i]) st += pads[i].timestamp + ','; if (st !== padStamp) { if (padStamp) act(); padStamp = st; } } catch (e) {}
    var mins = +opt('sleep'); if (!mins) return;
    var busy = (window.ArcadeCall && ArcadeCall.active && ArcadeCall.active()) || Array.prototype.some.call(document.querySelectorAll('video'), function (v) { return !v.paused && !v.ended; });
    if (busy) { act(); return; }
    var idle = Date.now() - lastAct, limit = mins * 60000;
    if (idle > limit) { act(); sleepNow(); }
    else if (idle > limit - 60000) {
      if (!warnEl) { warnEl = document.createElement('div'); warnEl.id = 'tvSleep'; warnEl.setAttribute('role', 'alert'); document.body.appendChild(warnEl); }
      warnEl.textContent = 'Nobody there? Going back to the home screen in ' + Math.ceil((limit - idle) / 1000) + ' s. Press any button to stay.';
    }
  }, 1000);
  function sleepNow() {
    if (/(^|\/)(index\.html)?$/.test(location.pathname)) { while (stack.length) close(); if (osk) osk.close(); scrollTo(0, 0); var f = C.firstFocus(); if (f) C.focus(f); return; }
    location.href = base + 'index.html';
  }

  /* ---------- per-game volume ---------- */
  var TARGET = -18; // dBFS (RMS) the evening out aims for
  function vol(id) { var V = S.vol || (S.vol = {}); var v = V[id] || (V[id] = { m: 0, a: 0, n: 0 }); return v; }
  var fmtDb = function (x) { x = Math.round(x * 10) / 10; return (x > 0 ? '+' : '') + x; };
  function trimDb() { if (!gameId) return 0; var v = vol(gameId); return v.m + (opt('autovol') && v.n >= 15 ? v.a : 0); }
  function setMan(d) { var v = vol(gameId); v.m = Math.max(-18, Math.min(9, v.m + d)); C.saveSettings(); applyVol(); }
  var outs = [], audioHooked = false, mediaHooked = null;
  function lin(db) { return Math.pow(10, db / 20); }
  function applyVol() {
    var g = lin(trimDb());
    outs.forEach(function (o) { try { o.out.gain.setTargetAtTime(g, o.ctx.currentTime, 0.3); } catch (e) { try { o.out.gain.value = g; } catch (e2) {} } });
    if (mediaHooked) try { Array.prototype.forEach.call(mediaHooked.document.querySelectorAll('audio,video'), function (m) { if (m.__tvLv !== undefined) m.volume = m.__tvLv; }); } catch (e) {}
  }
  function hookAudio(w) {
    if (!w || w.__tvAudio) return;
    try {
      ['AudioContext', 'webkitAudioContext'].forEach(function (k) {
        var Real = w[k]; if (!Real) return;
        var Wrapped = function (o) {
          var ctx = o === undefined ? new Real() : new Real(o);
          try {
            var P = w.BaseAudioContext ? w.BaseAudioContext.prototype : Real.prototype, real = Object.getOwnPropertyDescriptor(P, 'destination').get.call(ctx), cur = ctx.destination, src;
            if (cur !== real) { src = cur; try { src.disconnect(real); } catch (e) {} } // clips.js's tap: keep it before our trim
            else { src = ctx.createGain(); Object.defineProperty(ctx, 'destination', { configurable: true, get: function () { return src; } }); try { Object.defineProperty(src, 'maxChannelCount', { configurable: true, get: function () { return real.maxChannelCount; } }); } catch (e) {} }
            var out = ctx.createGain(), an = ctx.createAnalyser(); an.fftSize = 2048;
            src.connect(out); out.connect(real); src.connect(an);
            out.gain.value = lin(trimDb());
            outs.push({ ctx: ctx, out: out, an: an, buf: new Float32Array(an.fftSize) });
            audioHooked = true;
          } catch (e) {}
          return ctx;
        };
        Wrapped.prototype = Real.prototype; try { Object.setPrototypeOf(Wrapped, Real); } catch (e) {}
        w[k] = Wrapped;
      });
      // <audio>/<video>: the game's volume times our trim (manual part only)
      var MP = w.HTMLMediaElement && w.HTMLMediaElement.prototype, d = MP && Object.getOwnPropertyDescriptor(MP, 'volume');
      if (d && d.set) {
        var trimMedia = function () { return Math.min(1, lin(gameId ? vol(gameId).m : 0)); };
        Object.defineProperty(MP, 'volume', { configurable: true, get: function () { return this.__tvLv !== undefined ? this.__tvLv : d.get.call(this); }, set: function (v) { this.__tvLv = v; d.set.call(this, Math.max(0, Math.min(1, v * trimMedia()))); } });
        var play = MP.play; MP.play = function () { if (this.__tvLv === undefined) this.volume = d.get.call(this); return play.apply(this, arguments); };
        mediaHooked = w;
      }
      w.__tvAudio = 1;
    } catch (e) {}
  }
  if (gameId) {
    var lastW = null;
    setInterval(function () { var f = $('frame'); if (!f) return; var w; try { w = f.contentWindow; } catch (e) { return; } if (w && w !== lastW) { outs = []; lastW = w; } hookAudio(w); }, 25); // a game reloaded in place gets a new window
    // learn the game's loudness: 4 looks a second while it plays and is on screen
    var acc = 0, cnt = 0;
    setInterval(function () {
      if (document.hidden || !outs.length) return;
      var e = 0, n = 0;
      outs.forEach(function (o) { if (o.ctx.state !== 'running') return; o.an.getFloatTimeDomainData(o.buf); var s = 0; for (var i = 0; i < o.buf.length; i++) s += o.buf[i] * o.buf[i]; e += s / o.buf.length; n++; });
      if (!n || e < 1e-5) return; // silence doesn't count (about -50 dB)
      acc += e; cnt++;
      if (cnt >= 8) { // every 2 s of sound, fold it into the game's long-run level
        var db = 10 * Math.log10(acc / cnt), v = vol(gameId), want = Math.max(-12, Math.min(6, TARGET - db)), wgt = Math.min(v.n, 600);
        v.a = (v.a * wgt + want * 2) / (wgt + 2); v.n = Math.min(v.n + 2, 100000); acc = 0; cnt = 0;
        C.saveSettings(); if (opt('autovol') && v.n >= 15) applyVol();
      }
    }, 250);
  }

  /* ---------- family profiles ---------- */
  var K_COUCH = 'arcade-acct-couch', HUES = [12, 200, 140, 280, 40, 330, 90, 240];
  function couch() { try { var l = JSON.parse(ls.get(K_COUCH) || '[]'); return Array.isArray(l) ? l.filter(function (x) { return x && x.name && x.token; }) : []; } catch (e) { return []; } }
  function saveCouch(l) { ls.set(K_COUCH, JSON.stringify(l.slice(0, 8))); }
  function remember(a) { if (!a || !a.name || !a.token) return; var l = couch().filter(function (x) { return x.name.toLowerCase() !== a.name.toLowerCase(); }); l.unshift({ name: a.name, token: a.token, at: Date.now() }); saveCouch(l); }
  function curAcct() { try { var a = JSON.parse(ls.get('arcade-acct') || 'null'); return a && a.name && a.token ? a : null; } catch (e) { return null; } }
  function profList(box) {
    var me = curAcct(), l = couch();
    if (me && !l.some(function (x) { return x.name.toLowerCase() === me.name.toLowerCase(); })) l.unshift(me); // shown, not stored until a switch
    if (!l.length || (l.length === 1 && me)) { box.innerHTML = '<p class="tvnote">Add the family’s accounts to switch between them here without typing passwords again. Anyone using this TV can switch to them.</p>'; return; }
    box.innerHTML = l.map(function (x, i) { var mine = me && x.name.toLowerCase() === me.name.toLowerCase(); return '<div class="tvprof"><span class="av" style="background:hsl(' + HUES[i % HUES.length] + ' 60% 42%)">' + esc(x.name.charAt(0).toUpperCase()) + '</span><b>' + esc(x.name) + (mine ? ' <small class="tvnote">· playing now</small>' : '') + '</b>' + (mine ? '' : '<button type="button" data-sw="' + i + '" class="pri">Switch</button><button type="button" data-rm="' + i + '" class="dan">Remove</button>') + '</div>'; }).join('') + '<p class="tvnote">Anyone using this TV can switch to these accounts. Remove one to sign it out of this TV.</p>';
    box.querySelectorAll('[data-sw]').forEach(function (b) { b.onclick = function () { switchTo(l[+b.dataset.sw]); }; });
    box.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { var x = l[+b.dataset.rm]; if (!confirm('Sign ' + x.name + ' out of this TV?')) return; signOutToken(x.token); saveCouch(couch().filter(function (y) { return y.name !== x.name; })); profList(box); }; });
  }
  function signOutToken(tok) { try { var a = A(); fetch(((a && a.server) || 'https://arcade-realtime.arcade-realtime.workers.dev') + '/acct/logout', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: '{}' }).catch(function () {}); } catch (e) {} }
  // save the account on screen to the cloud, keep its sign-in for later and clear this device's copy of its progress
  function leaveCurrent() {
    var a = A(), me = curAcct();
    if (!me) {
      if (a && a.kind && a.kind() === 'local') return Promise.reject(new Error('This TV is using a local profile. Make it an online account first (account button, then Make an account), so its progress is kept.'));
      return Promise.resolve();
    }
    if (window.ArcadeOutage && ArcadeOutage.down && ArcadeOutage.down()) return Promise.reject(new Error('The Arcade’s servers are down right now, so switching would lose progress that hasn’t synced. Try again later.'));
    return a.sync('switch').then(function (r) {
      if (r === null) throw new Error('Couldn’t save ' + me.name + '’s progress first. Check the connection and try again.');
      remember(curAcct() || me); // the sync may have renamed it
      var g = a._test && a._test.groupOf;
      var keys = []; for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.forEach(function (k) { var grp = g ? g(k) : null; if (grp && (grp !== 'arcade' || /^arcade-(played|playtime|playdays)$/.test(k))) ls.del(k); });
      ['arcade-acct', 'arcade-acct-sync', 'arcade-acct-prof'].forEach(ls.del);
    });
  }
  function keepConsole() { var v = ls.get('arcade-console'); return function () { if (v) ls.set('arcade-console', v); }; }
  function switchTo(x) {
    var back = keepConsole();
    toast('Saving and switching to ' + x.name + '…', 8000);
    leaveCurrent().then(function () {
      back(); ls.set('arcade-acct', JSON.stringify({ name: x.name, token: x.token })); ls.del('arcade-acct-sync');
      ss.set('arcade-tv-switched', x.name); location.reload();
    }, function (e) { toast(e.message, 6000); });
  }
  function addAccount() {
    var back = keepConsole();
    leaveCurrent().then(function () { back(); ss.set('arcade-tv-add', '1'); location.reload(); }, function (e) { toast(e.message, 6000); });
  }
  // after a reload: open the log-in for "Add another account"; drop a remembered account whose sign-in no longer works
  setTimeout(function () {
    var a = A(); if (!a) return;
    if (ss.get('arcade-tv-add')) { ss.del('arcade-tv-add'); if (!online()) { if (a.welcome) a.welcome('login', 'Log in to add another account to this TV.'); setTimeout(addPhoneButton, 300); } }
    var sw = ss.get('arcade-tv-switched');
    if (sw) setTimeout(function () { ss.del('arcade-tv-switched'); if (online()) { toast('Hi ' + a.name() + '!'); remember(curAcct()); } else { saveCouch(couch().filter(function (y) { return y.name !== sw; })); toast(sw + ' needs to log in again on this TV.', 6000); } }, 5000);
    else if (online()) { var me = curAcct(); if (couch().some(function (y) { return y.name.toLowerCase() === me.name.toLowerCase(); })) remember(me); } // keep a remembered account's token fresh
  }, 1200);

  /* ---------- sign in with your phone ---------- */
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var b64 = function (buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  var unb64 = function (s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  function sas(a, b) { var j = new Uint8Array(a.length + b.length); j.set(a); j.set(b, a.length); return crypto.subtle.digest('SHA-256', j).then(function (h) { var v = new DataView(h).getUint32(0) % 1000000; return ('00000' + v).slice(-6).replace(/(\d{3})(\d{3})/, '$1 $2'); }); }
  function needQr() { return window.qrcode ? Promise.resolve() : new Promise(function (r) { var s = document.createElement('script'); s.src = base + 'vendor/qrcode.js?v=1'; s.onload = s.onerror = function () { r(); }; document.head.appendChild(s); }); }
  function getClient() {
    return new Promise(function (res) {
      if (!window.ArcadeOnline) return res(null);
      var t = setTimeout(function () { res(null); }, 12000);
      try { ArcadeOnline.start(gameId || 'home'); } catch (e) {} // no-op where the page already started it
      ArcadeOnline.ready(function (c) { clearTimeout(t); res(c); });
    });
  }
  function phoneSignIn() {
    if (!window.crypto || !crypto.subtle) { toast('This TV’s browser can’t do a secure phone sign-in. Log in with the on-screen keyboard instead.', 6000); return; }
    var ch = null, keys = null, pubRaw = null, code = '', bound = null, d = null, done = false;
    var cleanup = function () { done = true; if (ch) try { ch.unsubscribe(); } catch (e) {} ch = null; };
    d = overlay('<h2>Sign in with your phone</h2><div id="tlBody"><p>Getting a code…</p></div><div class="tvrow" style="margin-top:14px"><button type="button" id="tlCancel">Cancel</button></div>', 'tvlink', cleanup);
    $('tlCancel').onclick = function () { close(d); };
    var body = function (h) { if (!done) $('tlBody').innerHTML = h; };
    function start() {
      bound = null; code = ''; for (var i = 0; i < 5; i++) code += ALPHA[Math.floor(Math.random() * ALPHA.length)];
      Promise.all([crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']), needQr(), getClient()]).then(function (r) {
        keys = r[0]; var client = r[2];
        if (!client) { body('<p>Couldn’t connect. Check the TV’s internet connection and try again.</p>'); return; }
        return crypto.subtle.exportKey('raw', keys.publicKey).then(function (raw) {
          pubRaw = new Uint8Array(raw); if (done) return;
          if (ch) try { ch.unsubscribe(); } catch (e) {}
          ch = client.channel('pair:' + code, { config: { presence: { key: 'tv-' + code } } });
          ch.on('broadcast', { event: 'tl-hello' }, function (e) { hello(e.payload || {}); });
          ch.on('broadcast', { event: 'tl-pk' }, function (e) { gotPk(e.payload || {}); });
          ch.on('broadcast', { event: 'tl-cred' }, function (e) { gotCred(e.payload || {}); });
          ch.subscribe(function (st) {
            if (st === 'SUBSCRIBED') { try { ch.track({ role: 'tvlogin' }); } catch (e) {} showCode(); }
            else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') body('<p>Couldn’t connect. Check the TV’s internet connection and try again.</p>');
          });
        });
      }).catch(function () { body('<p>Something went wrong. Try again.</p>'); });
    }
    var send = function (ev, p) { if (ch) try { ch.send({ type: 'broadcast', event: ev, payload: p }); } catch (e) {} };
    function showCode() {
      var url = new URL(base + 'tvlink.html?c=' + code, location.href).href + '#k=' + b64(pubRaw), q = '';
      if (window.qrcode) { var qq = qrcode(0, 'M'); qq.addData(url); qq.make(); q = qq.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
      body('<div class="tvrow" style="align-items:flex-start;gap:24px">' + (q ? '<div class="tvqr">' + q + '</div>' : '') + '<div style="flex:1;min-width:240px"><p>Scan the code with your phone’s camera, or open <b>' + esc(location.host) + '/tvlink.html</b> on your phone and type:</p><div class="tvcode" aria-label="Code ' + code.split('').join(' ') + '">' + code.split('').map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</div><p class="tvnote">You type your username and password on the phone. They go to this TV encrypted, and the TV asks you before it signs in.</p></div></div>');
    }
    function hello(m) { // the first phone binds this code; a second one means someone else is listening, so start again
      if (!m.id || !m.c) return;
      if (bound && bound.id !== m.id) { toast('Another device tried to join. Here’s a new code.', 5000); start(); return; }
      bound = bound || { id: m.id, c: m.c };
      send('tl-key', { id: m.id, k: b64(pubRaw) });
      body('<p>Phone connected. Waiting for it…</p>');
    }
    function gotPk(m) {
      if (!bound || m.id !== bound.id || !m.pk) return;
      var pk = unb64(m.pk);
      crypto.subtle.digest('SHA-256', pk).then(function (h) {
        if (b64(h) !== bound.c) { toast('That phone’s check didn’t match. Here’s a new code.', 5000); start(); return; }
        return crypto.subtle.importKey('raw', pk, { name: 'ECDH', namedCurve: 'P-256' }, false, []).then(function (pub) {
          return crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, keys.privateKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        }).then(function (k) { bound.key = k; return sas(pubRaw, pk); }).then(function (n) {
          bound.sas = n;
          body('<p>Your phone should show this number:</p><div class="tvsas">' + n + '</div><p>Now type your username and password on the phone.</p>');
        });
      }).catch(function () {});
    }
    function gotCred(m) {
      if (!bound || m.id !== bound.id || !bound.key || !m.iv || !m.ct) return;
      crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(m.iv) }, bound.key, unb64(m.ct)).then(function (pt) {
        var c = JSON.parse(new TextDecoder().decode(pt));
        if (!c || !/^[A-Za-z0-9_]{3,16}$/.test(c.n || '') || !/^[0-9a-f]{64}$/.test(c.k || '')) throw new Error('bad');
        body('<p>Sign in on this TV as</p><h2>' + esc(c.n) + '</h2><p>Check the number matches your phone: <span class="tvsas" style="font-size:24px">' + bound.sas + '</span></p><div class="tvrow"><button type="button" class="pri" id="tlYes" data-first>Yes, sign in</button><button type="button" id="tlNo">No</button></div>');
        C.focus($('tlYes'));
        $('tlNo').onclick = function () { send('tl-res', { id: bound.id, err: 'The TV said no.' }); start(); };
        $('tlYes').onclick = function () {
          body('<p>Signing in…</p>');
          var a = A(); if (!a || !a.api) return;
          a.api('login', { method: 'POST', body: { name: c.n, key: c.k } }).then(function (r) {
            if (r.status !== 200 || !r.token) {
              var why = r.status === 401 ? 'Wrong password.' : r.status === 404 ? 'There’s no account with that username.' : r.status === 429 ? 'Too many tries. Wait a few minutes.' : r.error === 'banned' ? 'This account has been banned.' : r.error === 'device_banned' ? 'This TV has been banned from The Arcade.' : 'Couldn’t sign in. Try again.';
              send('tl-res', { id: bound.id, err: why }); body('<p>' + esc(why) + '</p><p>Try again on the phone. Your check number is still <b>' + bound.sas + '</b>.</p>'); return;
            }
            send('tl-res', { id: bound.id, ok: 1, n: r.name });
            var wasOnline = !!curAcct(), back = keepConsole();
            (wasOnline ? leaveCurrent() : Promise.resolve()).then(function () {
              back(); ls.set('arcade-acct', JSON.stringify({ name: r.name, token: r.token })); ls.del('arcade-acct-sync');
              if (couch().length || wasOnline) remember({ name: r.name, token: r.token });
              ss.set('arcade-tv-switched', r.name); location.reload();
            }, function (e) { signOutToken(r.token); body('<p>' + esc(e.message) + '</p>'); });
          });
        };
      }).catch(function () { send('tl-res', { id: bound && bound.id, err: 'The TV couldn’t read that. Try again.' }); });
    }
    start();
  }
  // a "Sign in with your phone" button in account.js's log-in pop-up
  function addPhoneButton() {
    var ov = $('acctOv'); if (!ov || ov.querySelector('#tvPhoneBtn') || !ov.querySelector('input[type=password]')) return;
    var f = ov.querySelector('form') || ov.querySelector('.box') || ov;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'tvPhoneBtn'; b.textContent = '📱 Sign in with your phone instead';
    b.style.cssText = 'display:block;width:100%;margin:12px 0 4px;padding:12px;border-radius:12px;border:1px solid #ffd23f;background:#2a2410;color:#ffd23f;font:800 16px system-ui,sans-serif;cursor:pointer';
    b.onclick = function (e) { e.preventDefault(); var o = $('acctOv'); if (o) o.remove(); phoneSignIn(); };
    f.appendChild(b);
  }
  new MutationObserver(function () { if ($('acctOv')) addPhoneButton(); }).observe(document.body, { childList: true });

  /* ---------- first-time tour ---------- */
  function tour() {
    var tv = C.device === 'tv', K = C.padKeys;
    var dot = function (c) { return '<i style="background:' + c + '"></i>'; };
    var steps = [
      { ic: '🎮', h: 'Welcome to The Arcade on the big screen', p: 'Everything works with your ' + (tv ? 'TV remote' : 'controller') + '. Here’s how, in four quick steps.' },
      { ic: '🕹️', h: 'Move around', p: tv ? 'Use the arrow buttons to move the yellow box.' : 'Use the D-pad or the left stick to move the yellow box. LB/RB (L1/R1) switch tabs.', k: tv ? ['◀ ▲ ▼ ▶'] : ['D-pad', 'Left stick'] },
      { ic: '✅', h: 'Choose and go back', p: tv ? 'OK chooses. Back goes back or closes a pop-up.' : 'A (✕) chooses. B (○) goes back or closes a pop-up.', k: tv ? ['OK', 'Back'] : [C.device === 'playstation' ? '✕ choose' : 'A choose', C.device === 'playstation' ? '○ back' : 'B back'] },
      { ic: '🌈', h: 'Shortcuts', p: 'Jump straight to the place you want. They’re also in the corner of the screen.', k: tv ? [dot('#ff4d4d') + 'Search', dot('#3ddc6f') + 'Chat', dot('#ffd23f') + 'Profile', dot('#4d8bff') + 'Home'] : [K[0] + ' Search', K[1] + ' Chat', K[2] + ' Profile', K[3] + ' Home'] },
      { ic: '📺', h: 'The TV menu', p: 'Text size, the sleep timer, game volume, family profiles and signing in with your phone are all in the TV menu at the top of the screen.', k: [tv ? 'Info button' : 'Press the left stick'] }
    ];
    var i = 0, d = overlay('<div id="tvTourIn"></div>', 'tvtour', function () { S.tour = 1; C.saveSettings(); });
    function draw() {
      var s = steps[i];
      $('tvTourIn').innerHTML = '<div class="big" aria-hidden="true">' + s.ic + '</div><h2>' + esc(s.h) + '</h2><p>' + esc(s.p) + '</p>' + (s.k ? '<div class="keys">' + s.k.map(function (k) { return '<kbd>' + k + '</kbd>'; }).join('') + '</div>' : '') +
        '<div class="dots">' + steps.map(function (x, j) { return '<i class="' + (j === i ? 'on' : '') + '"></i>'; }).join('') + '</div><div class="tvrow" style="justify-content:center"><button type="button" class="pri" id="tvNext" data-first>' + (i < steps.length - 1 ? 'Next' : 'Let’s play') + '</button>' + (i < steps.length - 1 ? '<button type="button" id="tvSkip">Skip</button>' : '') + '</div>';
      $('tvNext').onclick = function () { if (++i >= steps.length) close(d); else draw(); };
      if ($('tvSkip')) $('tvSkip').onclick = function () { close(d); };
      C.focus($('tvNext'));
    }
    draw();
  }
  function tourWhenFree(tries) { // after the Terms and the account pop-up have gone
    if (S.tour || /[?&]notour\b/.test(location.search)) return;
    if ($('acctOv') || $('tosPop') || document.querySelector('.notice,.intro,#intro') || stack.length) { if (tries < 60) setTimeout(function () { tourWhenFree(tries + 1); }, 2000); return; }
    tour();
  }
  setTimeout(function () { tourWhenFree(0); }, 1500);

  // the red button from another page: open the home page's search
  if (/[?&]tvsearch=1/.test(location.search)) setTimeout(function () { var b = $('searchBtn'); if (b) b.click(); }, 900);

  window.ArcadeTV = {
    menu: menu, osk: oskOpen, phoneSignIn: phoneSignIn, tour: tour, profiles: couch, switchTo: switchTo,
    back: function () { if (osk) { osk.close(); return true; } if (stack.length) { close(); return true; } return false; },
    key: function (e) {
      if (!osk) return false;
      if (e.key === 'Backspace') { e.preventDefault(); osk.del(); return true; }
      if (e.key === 'Escape') { e.preventDefault(); osk.close(); return true; }
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); osk.type(e.key); return true; }
      return false;
    },
    pad: function (b) { if (!osk) return false; if (b === 'x') osk.del(); else if (b === 'y') osk.type(' '); return true; },
    _vol: function () { return { trim: trimDb(), hooked: audioHooked, outs: outs.length }; }
  };
})();
