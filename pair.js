/* pair.js (2026-11-17): phones as controllers, on play.html.
   The Phone button opens a panel with a QR code. Scanning it opens pad.html on the phone, which joins the realtime
   channel "pair:<code>" (rt.js, no account needed). Up to 4 phones can join; each is a player:
   - Games that read controllers (navigator.getGamepads) see each phone as a standard gamepad inside the game frame,
     so a phone's tilt is real analog steering and phone 2 is player 2.
   - Games that only read the keyboard get key presses from the first phone (arrows, Space, Shift, Esc).
   The panel's second tab is a QR code that opens this game on the phone itself ("Continue on phone").
   Messages on the channel (broadcast):  phone -> page  in {id, x, y, lt, rt, m}  (m: bitmask of the 17 buttons)
                                         phone -> page  act {id, a: 'pause' | 'mute' | 'clip'}
                                         page -> phones info {g, t, th, k, l, slots: {id: n}}
                                         page -> phone  rumble {id, ms}
   Presence: the page tracks {role: 'host'}, each phone {role: 'pad', id}. */
(function () {
  if (window.ArcadePair || window.ARCADE_WATCH) return;
  var MAX = 4;
  var WHEEL = ['turn-turn-turn', 'poly-racer', 'throttle-ridge'];
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var game = null, frame = null, ch = null, code = '', state = 'idle', slots = {}, order = [], pads = {}, panel = null;
  var polled = false, held = {};
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var siteUrl = function (p) { return new URL(p, location.href).href; };

  /* ---------- the phones, as gamepads inside the game frame ---------- */
  function pad(slot) {
    var p = pads[slot];
    if (p) return p;
    var buttons = []; for (var i = 0; i < 17; i++) buttons.push({ pressed: false, touched: false, value: 0 });
    p = pads[slot] = {
      id: 'Arcade phone ' + (slot + 1) + ' (STANDARD GAMEPAD Vendor: 0000 Product: 0000)', index: slot, connected: true, mapping: 'standard', timestamp: performance.now(),
      axes: [0, 0, 0, 0], buttons: buttons,
      vibrationActuator: { type: 'dual-rumble', playEffect: function (t, o) { rumble(slot, (o && o.duration) || 120); return Promise.resolve('complete'); }, reset: function () { return Promise.resolve('complete'); } },
    };
    p.hapticActuators = [{ type: 'vibration', pulse: function (v, ms) { rumble(slot, ms || 100); return Promise.resolve(true); } }];
    announce(p);
    return p;
  }
  function patchFrame() {
    if (!frame) return;
    var w; try { w = frame.contentWindow; if (!w || !w.navigator) return; } catch (e) { return; }
    if (w.__arcadePads) return;
    var nav = w.navigator, real = nav.getGamepads ? nav.getGamepads.bind(nav) : function () { return []; };
    try {
      Object.defineProperty(nav, 'getGamepads', { configurable: true, value: function () {
        polled = true;
        var list = Array.prototype.slice.call(real() || []);
        Object.keys(pads).forEach(function (s) {
          var p = pads[s], at = list.indexOf(null);
          if (!p.connected) return;
          // real controllers keep their places; phones take the free ones
          if (list[p.index] && list[p.index] !== p) { if (at < 0) at = list.length; p.index = at; }
          list[p.index] = p;
        });
        for (var i = 0; i < list.length; i++) if (list[i] === undefined) list[i] = null;
        return list;
      } });
      w.__arcadePads = 1;
    } catch (e) {}
    Object.keys(pads).forEach(function (s) { announce(pads[s]); });
  }
  function announce(p) {
    try { var w = frame.contentWindow, ev = new w.Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: p }); w.dispatchEvent(ev); } catch (e) {}
  }

  /* ---------- keyboard-only games: the first phone presses keys ---------- */
  var KEYS = { left: ['ArrowLeft', 37], right: ['ArrowRight', 39], up: ['ArrowUp', 38], down: ['ArrowDown', 40], a: [' ', 32, 'Space'], b: ['Shift', 16, 'ShiftLeft'], x: ['x', 88, 'KeyX'], y: ['z', 90, 'KeyZ'], start: ['Escape', 27], m: ['m', 77, 'KeyM'], p: ['p', 80, 'KeyP'] };
  function key(name, down) {
    if (!!held[name] === down) return;
    held[name] = down;
    var k = KEYS[name]; if (!k || !frame) return;
    try {
      var w = frame.contentWindow, d = w.document;
      var ev = new w.KeyboardEvent(down ? 'keydown' : 'keyup', { key: k[0], code: k[2] || k[0], bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'keyCode', { get: function () { return k[1]; } });
      Object.defineProperty(ev, 'which', { get: function () { return k[1]; } });
      (d.activeElement || d.body || d).dispatchEvent(ev);
    } catch (e) {}
  }
  function tap(name) { key(name, true); setTimeout(function () { key(name, false); }, 90); }

  /* ---------- input from a phone ---------- */
  function onInput(m) {
    var s = slots[m.id]; if (s === undefined) return;
    var p = pad(s);
    p.axes[0] = clamp(+m.x || 0); p.axes[1] = clamp(+m.y || 0);
    var bits = m.m | 0;
    for (var i = 0; i < 17; i++) { var on = !!(bits & (1 << i)); p.buttons[i].pressed = on; p.buttons[i].touched = on; p.buttons[i].value = on ? 1 : 0; }
    p.buttons[6].value = Math.max(p.buttons[6].value, clamp(+m.lt || 0, 0)); p.buttons[6].pressed = p.buttons[6].value > 0.1;
    p.buttons[7].value = Math.max(p.buttons[7].value, clamp(+m.rt || 0, 0)); p.buttons[7].pressed = p.buttons[7].value > 0.1;
    p.timestamp = performance.now();
    if (s === 0 && !polled) { // the game doesn't read controllers: press keys instead
      var gas = p.buttons[7].value > 0.3 || p.buttons[12].pressed, brake = p.buttons[6].value > 0.3 || p.buttons[13].pressed;
      key('left', p.axes[0] < -0.35 || p.buttons[14].pressed); key('right', p.axes[0] > 0.35 || p.buttons[15].pressed);
      key('up', p.axes[1] < -0.5 || gas); key('down', p.axes[1] > 0.5 || brake);
      key('a', p.buttons[0].pressed); key('b', p.buttons[1].pressed); key('x', p.buttons[2].pressed); key('y', p.buttons[3].pressed);
      key('start', p.buttons[9].pressed);
    }
  }
  function clamp(v, lo) { return Math.max(lo === undefined ? -1 : lo, Math.min(1, v)); }
  function onAct(m) {
    if (slots[m.id] === undefined) return;
    if (m.a === 'pause') tap('start');
    else if (m.a === 'mute') tap('m');
    else if (m.a === 'clip') { var c = document.getElementById('clip'); if (c && !c.hidden) c.click(); }
    focusGame();
  }
  function focusGame() { try { frame.contentWindow.focus(); } catch (e) {} }
  function rumble(slot, ms) {
    var id = Object.keys(slots).find(function (k) { return slots[k] === slot; });
    if (id && ch) ch.send({ type: 'broadcast', event: 'rumble', payload: { id: id, ms: Math.min(ms, 1000) } });
  }

  /* ---------- the channel ---------- */
  function connect() {
    if (ch || state === 'connecting') return;
    state = 'connecting'; render();
    code = ''; for (var i = 0; i < 5; i++) code += ALPHA[Math.floor(Math.random() * ALPHA.length)];
    var go = function (client) {
      if (!client) { state = 'error'; render(); return; }
      ch = client.channel('pair:' + code, { config: { presence: { key: 'host' } } });
      ch.on('broadcast', { event: 'in' }, function (e) { onInput(e.payload || {}); });
      ch.on('broadcast', { event: 'act' }, function (e) { onAct(e.payload || {}); });
      ch.on('presence', { event: 'sync' }, sync);
      ch.subscribe(function (st) {
        if (st === 'SUBSCRIBED') { state = 'ready'; ch.track({ role: 'host', g: game.id }); render(); }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { state = 'error'; render(); }
      });
    };
    if (window.ArcadeOnline) ArcadeOnline.ready(go); else go(null);
  }
  function sync() {
    var st = ch.presenceState(), here = [];
    Object.keys(st).forEach(function (k) { (st[k] || []).forEach(function (m) { if (m.role === 'pad' && m.id && here.indexOf(m.id) < 0) here.push(m.id); }); });
    // phones keep their player number while they stay; gone phones free theirs
    order = order.filter(function (id) { return here.indexOf(id) >= 0; });
    here.forEach(function (id) { if (order.indexOf(id) < 0 && order.length < MAX) order.push(id); });
    var used = {}; Object.keys(slots).forEach(function (id) { if (order.indexOf(id) >= 0) used[slots[id]] = id; else delete slots[id]; });
    order.forEach(function (id) { if (slots[id] === undefined) { for (var s = 0; s < MAX; s++) if (!used[s]) { slots[id] = s; used[s] = id; break; } } });
    Object.keys(pads).forEach(function (s) { var on = !!used[s]; if (pads[s].connected !== on) { pads[s].connected = on; if (!on) Object.keys(held).forEach(function (k) { key(k, false); }); } });
    sendInfo();
    render();
    if (order.length) patchFrame();
  }
  function sendInfo() {
    if (!ch) return;
    ch.send({ type: 'broadcast', event: 'info', payload: {
      g: game.id, t: game.title, th: siteUrl(game.thumb), k: (game.keys || []).slice(0, 12), l: WHEEL.indexOf(game.id) >= 0 ? 'wheel' : 'pad',
      slots: slots, play: siteUrl('play.html?game=' + encodeURIComponent(game.id)),
    } });
  }

  /* ---------- the panel ---------- */
  function qr(text) {
    if (!window.qrcode) return '';
    var q = qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }
  function open(tab) {
    if (!panel) {
      panel = document.createElement('div'); panel.className = 'pp-wrap'; panel.hidden = true;
      panel.innerHTML = '<div class="pp" role="dialog" aria-modal="true" aria-labelledby="ppT"><button type="button" class="pp-x" aria-label="Close">✕</button>' +
        '<h2 id="ppT">Use your phone</h2><div class="pp-tabs" role="tablist"><button type="button" data-t="pad" role="tab">As a controller</button><button type="button" data-t="go" role="tab">Continue on phone</button></div><div class="pp-body"></div></div>';
      document.body.appendChild(panel);
      panel.querySelector('.pp-x').onclick = close;
      panel.addEventListener('mousedown', function (e) { if (e.target === panel) close(); });
      panel.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { panel.dataset.tab = b.dataset.t; render(); }; });
      addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });
    }
    panel.dataset.tab = tab || panel.dataset.tab || 'pad';
    panel.hidden = false;
    connect(); render();
  }
  function close() { if (panel) panel.hidden = true; focusGame(); }
  function render() {
    paintButton();
    if (!panel || panel.hidden) return;
    var tab = panel.dataset.tab;
    panel.querySelectorAll('[data-t]').forEach(function (b) { b.classList.toggle('on', b.dataset.t === tab); b.setAttribute('aria-selected', b.dataset.t === tab); });
    var body = panel.querySelector('.pp-body');
    if (tab === 'go') {
      var url = siteUrl('play.html?game=' + encodeURIComponent(game.id));
      body.innerHTML = '<div class="pp-qr">' + qr(url) + '</div><div class="pp-side"><p class="pp-lead">Scan with your phone’s camera to open <b>' + esc(game.title) + '</b> there.</p>' +
        '<p class="pp-note">' + (window.ArcadeAccount && ArcadeAccount.kind && ArcadeAccount.kind() === 'online' ? 'Log in with the same account on your phone and your progress comes with you.' : 'Make a free online account and your progress follows you to every device.') + '</p></div>';
      return;
    }
    if (state === 'error') { body.innerHTML = '<p class="pp-lead">Couldn’t connect. Check your connection and try again.</p><button type="button" class="btn ghost" id="ppRetry">Try again</button>'; body.querySelector('#ppRetry').onclick = function () { ch = null; state = 'idle'; connect(); }; return; }
    if (state !== 'ready') { body.innerHTML = '<p class="pp-lead">Getting a code…</p>'; return; }
    var link = siteUrl('pad.html?c=' + code);
    var list = ''; for (var s = 0; s < MAX; s++) { var id = Object.keys(slots).find(function (k) { return slots[k] === s; }); list += '<li class="' + (id ? 'on' : '') + '"><b>P' + (s + 1) + '</b><span>' + (id ? 'Connected' : 'Waiting') + '</span></li>'; }
    body.innerHTML = '<div class="pp-qr">' + qr(link) + '</div><div class="pp-side"><p class="pp-lead">Scan with your phone’s camera, or go to <b>' + esc(location.host) + '/pad.html</b> and type</p>' +
      '<div class="pp-code" aria-label="Code ' + code.split('').join(' ') + '">' + code.split('').map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</div>' +
      '<p class="pp-note">' + (WHEEL.indexOf(game.id) >= 0 ? 'Turn your phone sideways and tilt it to steer.' : 'Each phone becomes a controller. Up to 4 players.') + '</p><ul class="pp-slots">' + list + '</ul></div>';
  }
  function paintButton() {
    var b = document.getElementById('padBtn'); if (!b) return;
    var n = order.length;
    b.classList.toggle('live', n > 0);
    b.querySelector('span').textContent = n ? n + (n === 1 ? ' phone' : ' phones') : 'Phone';
  }

  window.ArcadePair = {
    // play.html: attach(game, frame element, button)
    attach: function (g, f, btn) {
      game = g; frame = f;
      f.addEventListener('load', function () { polled = false; held = {}; patchFrame(); });
      if (btn) btn.onclick = function () { open('pad'); };
      // ?pair opens the panel straight away (for tests and shared links)
      if (/[?&]pair\b/.test(location.search)) setTimeout(function () { open('pad'); }, 400);
    },
    open: open,
  };
})();
