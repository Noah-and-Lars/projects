/* appbridge.js (2026-11-19): the web side of The Arcade app (Tauri 2; its source is on the owner's Mac, not in this
   repo). Loaded by appbanner.js on index, play, chat, players, social, support and tourney; never in a game's frame.
   Everything native goes through window.__TAURI__ and only when it's there; in a normal browser those parts do
   nothing. The app opts into features by listing them in window.ARCADE_APP.features (e.g. ['shortcut']).
   - Update notes (341): ARCADE_APP.version vs localStorage 'arcade-app-seen-version'; after an update it shows
     app/notes.json's notes for that version once (or just the version when there are none).
   - Recent games (342) and presence (348): emits Tauri events 'arcade:recent' {games: [{id, title, url}]} and
     'arcade:presence' {game, title, page, since} for the tray menu and Discord; ArcadeBridge.recent() / .current.
   - Notifications (343): call invites, friend requests, being added to a group (account.js live messages) and
     tournaments you opened on tourney.html going live, only while the window is hidden or not focused. In the app:
     Tauri's notification plugin (on unless turned off); in a browser: the Notification API, only after the player
     turns it on in Settings. One tab notifies (a short localStorage claim).
   - Offline launcher (344): the app reuses offline.js's Games section; first launch also caches the trailer's
     pictures (482, ArcadeOffline.cacheTrailer()).
   - Desktop icon for one game (345): ArcadeBridge.createShortcut(game) -> invoke('arcade_create_shortcut').
   - Controllers (346): a "Controllers" section in the offline.js panel with every connected gamepad's live buttons.
   - Low-power mode (349, opt-in, 'arcade-low-power' = off | battery | on): html.low-power, window.ARCADE_LOW_POWER
     (games can read parent.ARCADE_LOW_POWER), and on play.html the game frame's requestAnimationFrame is capped at
     30 frames a second while it's on.
   - Crash reports (350, opt-in, 'arcade-crash-reports' = '1'): errors from the page and the game frame go to
     localStorage 'arcade-crash-log' (newest 20, addresses without their ?query). Settings shows the report to read,
     copy and send through the bug form. Nothing is ever sent by itself. */
(function () {
  if (window.ArcadeBridge) return;
  try { if (window.top !== window) return; } catch (e) { return; }
  var html = document.documentElement, T = window.__TAURI__ || null, APP = window.ARCADE_APP || null;
  var SELF = document.currentScript && document.currentScript.src || '';
  var ROOT = SELF ? SELF.replace(/[^\/]*$/, '') : new URL('.', location.href).href;
  var native = !!(T && ((T.core && T.core.invoke) || (T.event && T.event.emit)));
  var FEATURES = (APP && APP.features) || [];
  var page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
  var Q = new URLSearchParams(location.search), gameId = page === 'play' ? Q.get('game') || '' : '';
  var BUG_FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSeOQOSz6bS6-2aBxjDZSSdxpBYECQlmbnOWhmeAk34R3wU-7g/viewform'; // support.html's feedback form
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    json: function (k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var game = function (id) { return (window.GAMES || []).filter(function (g) { return g.id === id; })[0] || null; };
  var toast = function (a, b) { if (window.ArcadeOffline) ArcadeOffline.toast(a, b); };

  function emit(name, data) {
    if (!T || !T.event || !T.event.emit) return;
    try { var p = T.event.emit(name, data); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }
  function invoke(cmd, args) {
    if (!T || !T.core || !T.core.invoke) return Promise.reject(new Error('Not in the app'));
    try { return Promise.resolve(T.core.invoke(cmd, args || {})); } catch (e) { return Promise.reject(e); }
  }
  function can(f) { return native && FEATURES.indexOf(f) >= 0; }

  /* ---------- recent games and what you're playing (tray menu, Discord) ---------- */
  function recent() {
    var A = window.Arcade; if (!A || !A.recent) return [];
    return A.recent(8).map(function (g) { return { id: g.id, title: g.title, url: ROOT + 'play.html?game=' + encodeURIComponent(g.id) }; });
  }
  var current = { page: page, game: game(gameId) ? gameId : '', title: game(gameId) ? game(gameId).title : '', since: Date.now() };
  if (native) {
    emit('arcade:recent', { games: recent() });
    emit('arcade:presence', current);
    addEventListener('pagehide', function () { if (current.game) emit('arcade:presence', { page: '', game: '', title: '', since: Date.now() }); });
  }

  /* ---------- notifications ---------- */
  var nativeN = !!(T && T.notification);
  function notifyOn() { return nativeN ? ls.get('arcade-notify') !== '0' : ls.get('arcade-notify') === '1'; }
  function notify(title, body, url) {
    if (!notifyOn()) return Promise.resolve(false);
    var k = title + '|' + body, c = ls.json('arcade-bridge-nclaim', {});
    if (c.k === k && Date.now() - c.t < 15000) return Promise.resolve(false); // another tab already showed it
    ls.set('arcade-bridge-nclaim', JSON.stringify({ k: k, t: Date.now() }));
    if (nativeN) {
      var N = T.notification;
      return Promise.resolve(N.isPermissionGranted()).then(function (g) { return g || Promise.resolve(N.requestPermission()).then(function (p) { return p === 'granted'; }); })
        .then(function (ok) { if (ok) N.sendNotification({ title: title, body: body }); return ok; }).catch(function () { return false; });
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return Promise.resolve(false);
    try {
      var n = new Notification(title, { body: body, icon: ROOT + 'icon-192.png', tag: k.slice(0, 60) });
      n.onclick = function () { try { window.focus(); } catch (e) {} if (url) location.href = url; n.close(); };
      return Promise.resolve(true);
    } catch (e) { return Promise.resolve(false); }
  }
  var away = function () { return document.hidden || !document.hasFocus(); };
  function hookLive() {
    var A = window.ArcadeAccount; if (!A || !A.onLive) return;
    A.onLive(function (m) {
      if (!m || !away()) return;
      if (m.t === 'call' && m.d && m.d.k === 'ring') notify((m.n || 'Someone') + ' is calling you', m.d.gn ? 'Group call: ' + m.d.gn : 'Open The Arcade to answer.');
      else if (m.t === 'friend' && m.v && m.v.st === 'in') notify(m.v.n + ' wants to be your friend', 'Open Players to say yes or no.', ROOT + 'players.html#p=' + encodeURIComponent(m.v.n));
      else if (m.t === 'grp' && m.fresh && m.c) notify(m.c.n || 'Group chat', (m.by || 'Someone') + ' added you to this group chat', ROOT + 'players.html');
    });
  }
  // tournaments: the ones you've opened on tourney.html (kept 3 days), told when one goes from open to live
  var TW = 'arcade-bridge-tourneys';
  function hookTourneys() {
    var w = ls.json(TW, {}), now = Date.now();
    Object.keys(w).forEach(function (id) { if (now - (w[id].seen || 0) > 3 * 864e5) delete w[id]; });
    var tid = page === 'tourney' ? (Q.get('t') || '').replace(/[^A-Za-z0-9]/g, '') : '';
    if (tid) w[tid] = { seen: now, st: (w[tid] && w[tid].st) || '' };
    ls.set(TW, JSON.stringify(w));
    if (!notifyOn() || !Object.keys(w).length || !window.ArcadeTourney || !ArcadeTourney.directory) return;
    ArcadeTourney.directory(function (list) {
      var w2 = ls.json(TW, {}), changed = false;
      (list || []).forEach(function (t) {
        var r = w2[t.id]; if (!r) return;
        if (r.st === 'open' && t.st === 'live' && away()) notify('Tournament starting', (t.t || 'Your tournament') + ' is starting now.', ROOT + 'tourney.html?t=' + encodeURIComponent(t.id));
        if (r.st !== t.st) { r.st = t.st; changed = true; }
      });
      if (changed) ls.set(TW, JSON.stringify(w2));
    });
  }

  /* ---------- update notes (the app only) ---------- */
  function showNotes(ver, list) {
    var ov = document.createElement('div');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'abNotesT');
    ov.style.cssText = 'position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.6);font:15px/1.5 var(--font,system-ui);color:var(--text,#f4f4f5)';
    ov.innerHTML = '<div style="width:min(440px,100%);max-height:80vh;overflow:auto;padding:22px;border-radius:16px;background:var(--bg-2,#0b0b0d);border:1px solid var(--line-2,#ffffff24);box-shadow:0 40px 100px -20px #000">' +
      '<h2 id="abNotesT" style="margin:0 0 6px;font-size:20px">The app is up to date</h2><p style="margin:0 0 12px;color:var(--muted,#a1a1aa)">The Arcade app is now on version ' + esc(ver) + '.</p>' +
      (list && list.length ? '<h3 style="margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim,#74747f)">What’s new</h3><ul style="margin:0 0 14px;padding-left:20px">' + list.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '') +
      '<button type="button" id="abNotesOk" data-close style="height:40px;padding:0 18px;border-radius:10px;border:0;background:var(--accent,#ff5a2c);color:var(--accent-ink,#160500);font:700 14px var(--font,system-ui);cursor:pointer">OK</button></div>';
    var done = function () { ov.remove(); };
    ov.querySelector("#abNotesOk").onclick = done;
    ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(); });
    ov.addEventListener('click', function (e) { if (e.target === ov) done(); });
    document.body.appendChild(ov); ov.querySelector("#abNotesOk").focus();
  }
  function loadNotes(ver) {
    return fetch(ROOT + 'app/notes.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
      .then(function (j) { return (j && j.notes && j.notes[ver]) || []; });
  }
  function updateNotes() {
    if (!APP || !APP.version || page !== 'index') return;
    var ver = String(APP.version), seen = ls.get('arcade-app-seen-version');
    ls.set('arcade-app-seen-version', ver);
    if (!seen) return; // first launch: nothing to compare with
    if (seen !== ver) loadNotes(ver).then(function (list) { setTimeout(function () { showNotes(ver, list); }, 6000); }); // after the intro
  }
  // first launch of the app or the installed site: keep the trailer's pictures for offline (482)
  function firstLaunch() {
    if (!(APP || native || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)) || ls.get('arcade-app-trailer-cached')) return;
    setTimeout(function () { if (window.ArcadeOffline && navigator.onLine !== false) ArcadeOffline.cacheTrailer().then(function () { ls.set('arcade-app-trailer-cached', String(Date.now())); }); }, 8000);
  }

  /* ---------- low-power mode ---------- */
  var LP = 'arcade-low-power', bat = null, MIN_MS = 1000 / 30;
  function lpMode() { var m = ls.get(LP); return m === 'on' || m === 'battery' ? m : 'off'; }
  function lowPower() { var m = lpMode(); return m === 'on' || (m === 'battery' && !!bat && !bat.charging); }
  function applyLP() {
    var a = lowPower();
    html.classList.toggle('low-power', a); window.ARCADE_LOW_POWER = a;
    try { dispatchEvent(new CustomEvent('arcade-lowpower', { detail: a })); } catch (e) {}
    if (a) watchFrame();
    try { var f = document.getElementById('frame'); if (f && f.contentDocument) f.contentDocument.documentElement.classList.toggle('low-power', a); } catch (e) {}
  }
  if (navigator.getBattery) navigator.getBattery().then(function (b) { bat = b; b.addEventListener('chargingchange', applyLP); applyLP(); }).catch(function () {});
  // the game frame on play.html: requestAnimationFrame runs at most 30 times a second while low power is on
  function shim(w) {
    if (w.__arcadeLP || !w.requestAnimationFrame) return;
    w.__arcadeLP = 1;
    var raf = w.requestAnimationFrame.bind(w), caf = w.cancelAnimationFrame.bind(w), ids = {}, seq = 1e7, curT = -1e9;
    w.requestAnimationFrame = function (cb) {
      var id = ++seq;
      var tick = function (t) {
        if (lowPower() && t !== curT) {
          if (t - curT < MIN_MS - 2) { ids[id] = raf(tick); return; }
          curT = t;
        }
        delete ids[id]; cb(t);
      };
      ids[id] = raf(tick); return id;
    };
    w.cancelAnimationFrame = function (id) { if (ids[id] != null) { caf(ids[id]); delete ids[id]; } else caf(id); };
    try { Object.defineProperty(w, 'ARCADE_LOW_POWER', { get: lowPower, configurable: true }); } catch (e) {}
  }
  var frameWatch = 0;
  function frameWin() { try { var f = document.getElementById('frame'), w = f && f.contentWindow; return w && w.location.href !== 'about:blank' ? w : null; } catch (e) { return null; } }
  function watchFrame() {
    if (page !== 'play' || frameWatch) return;
    var f = document.getElementById('frame'); if (!f) return;
    var go = function () { var w = frameWin(); if (!w) return; if (lowPower()) { shim(w); try { w.document.documentElement.classList.add('low-power'); } catch (e) {} } };
    f.addEventListener('load', go); frameWatch = setInterval(go, 400); go();
  }

  /* ---------- crash reports (opt-in) ---------- */
  var CR = 'arcade-crash-reports', CL = 'arcade-crash-log';
  var crashOn = function () { return ls.get(CR) === '1'; };
  var clean = function (s) { return String(s || '').replace(/https?:\/\/[^\s\/)]+/g, '').replace(/\?[^\s:)]*/g, ''); };
  function record(kind, msg, src, line, col, stack, where) {
    if (!crashOn()) return;
    var log = ls.json(CL, []), e = { t: Date.now(), p: page, g: gameId, k: kind, w: where, m: clean(msg).slice(0, 300), s: clean(src), l: line || 0, c: col || 0, st: clean(stack).split('\n').slice(0, 4).join('\n').slice(0, 600) };
    var last = log[log.length - 1];
    if (last && last.m === e.m && last.s === e.s && last.l === e.l) { last.n = (last.n || 1) + 1; last.t = e.t; }
    else { log.push(e); while (log.length > 20) log.shift(); }
    ls.set(CL, JSON.stringify(log));
  }
  function listen(w, where) {
    if (!w || w.__arcadeCR) return; w.__arcadeCR = 1;
    w.addEventListener('error', function (e) { if (e && e.message) record('error', e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack, where); });
    w.addEventListener('unhandledrejection', function (e) { var r = e && e.reason; record('promise', r && r.message || String(r), '', 0, 0, r && r.stack, where); });
  }
  listen(window, 'page');
  if (page === 'play') { var f0 = document.getElementById('frame'); if (f0) { var lf = function () { var w = frameWin(); if (w) listen(w, 'game'); }; f0.addEventListener('load', lf); setTimeout(lf, 1500); } }
  function report() {
    var log = ls.json(CL, []), lines = ['The Arcade crash report', 'Made: ' + new Date().toISOString(), 'App: ' + (APP ? 'The Arcade app ' + (APP.version || '?') + ' (' + (APP.os || '?') + ')' : 'website'), 'Browser: ' + (navigator.userAgent || '').slice(0, 200), 'Errors: ' + log.length, ''];
    log.forEach(function (e, i) {
      lines.push((i + 1) + '. ' + new Date(e.t).toISOString() + ' · ' + e.p + (e.g ? ' (' + e.g + ')' : '') + ' · ' + e.w + (e.n ? ' · ' + e.n + ' times' : ''));
      lines.push('   ' + e.m);
      if (e.s) lines.push('   at ' + e.s + ':' + e.l + ':' + e.c);
      if (e.st) lines.push(e.st.split('\n').map(function (x) { return '   ' + x.trim(); }).join('\n'));
    });
    return lines.join('\n');
  }

  /* ---------- panel sections (offline.js's "Offline & device" panel) ---------- */
  function el(tag, cls, h) { var e = document.createElement(tag); if (cls) e.className = cls; if (h != null) e.innerHTML = h; return e; }
  function btn(text, cls, fn) { var b = el('button', 'ob' + (cls ? ' ' + cls : ''), esc(text)); b.type = 'button'; b.onclick = fn; return b; }
  var NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L stick', 'R stick', 'Up', 'Down', 'Left', 'Right', 'Home'];
  function renderPads(body) {
    body.appendChild(el('p', '', 'Plug in a controller or connect it with Bluetooth, then press any button. Lit buttons are pressed right now.'));
    var box = el('div'), said = el('p'); said.setAttribute('aria-live', 'polite');
    body.appendChild(box); body.appendChild(said);
    var raf = 0, lastKey = '', lastSaid = '';
    function paint() {
      var pads = navigator.getGamepads ? Array.prototype.filter.call(navigator.getGamepads(), Boolean) : [];
      var key = pads.map(function (p) { return p.index + p.id + p.buttons.length; }).join('|');
      if (key !== lastKey) {
        lastKey = key; box.innerHTML = '';
        if (!pads.length) box.appendChild(el('p', '', '<b>No controller found yet.</b>'));
        pads.forEach(function (p) {
          var card = el('div', '', '<b style="display:block;margin:10px 0 2px;color:var(--text,#fff)">' + esc(p.id.replace(/\s*\(.*?\)\s*/g, ' ').trim() || 'Controller') + '</b><small style="color:var(--dim,#74747f)">' + (p.mapping === 'standard' ? 'Standard layout' : 'Its own layout (some games may not know its buttons)') + ' · player ' + (p.index + 1) + '</small>');
          var bs = el('div'); bs.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:8px 0';
          p.buttons.forEach(function (_, i) { var d = el('span', '', esc(p.mapping === 'standard' && NAMES[i] || 'B' + i)); d.style.cssText = 'min-width:34px;padding:4px 6px;border-radius:8px;border:1px solid var(--line-2,#ffffff24);text-align:center;font:600 11px var(--mono,monospace);transition:background .05s'; d.dataset.b = i; bs.appendChild(d); });
          var ax = el('div'); ax.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:6px';
          p.axes.forEach(function (_, i) { var a = el('div', '', '<small style="color:var(--dim,#74747f)">Axis ' + i + '</small><div style="position:relative;height:6px;border-radius:3px;background:var(--line,#ffffff14)"><i style="position:absolute;top:-2px;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:var(--accent,#ff5a2c);left:50%"></i></div>'); a.dataset.a = i; ax.appendChild(a); });
          card.dataset.p = p.index; card.appendChild(bs); card.appendChild(ax); box.appendChild(card);
          if (p.vibrationActuator && p.vibrationActuator.playEffect) card.appendChild(btn('Test rumble', '', function () { try { p.vibrationActuator.playEffect('dual-rumble', { duration: 300, strongMagnitude: .8, weakMagnitude: .5 }); } catch (e) {} }));
        });
      }
      var pressed = [];
      pads.forEach(function (p) {
        var card = box.querySelector('[data-p="' + p.index + '"]'); if (!card) return;
        p.buttons.forEach(function (b, i) { var d = card.querySelector('[data-b="' + i + '"]'); if (!d) return; var v = b.value || (b.pressed ? 1 : 0); d.style.background = v > 0.05 ? 'rgba(255,90,44,' + (0.3 + v * 0.7) + ')' : 'transparent'; d.style.color = v > 0.5 ? '#160500' : ''; if (b.pressed) pressed.push(d.textContent); });
        p.axes.forEach(function (v, i) { var a = card.querySelector('[data-a="' + i + '"] i'); if (a) a.style.left = (50 + v * 50) + '%'; });
      });
      var s = pressed.length ? 'Pressed: ' + pressed.join(', ') : pads.length ? 'Nothing pressed.' : '';
      if (s !== lastSaid) { lastSaid = s; said.textContent = s; }
      raf = requestAnimationFrame(paint);
    }
    paint();
    body._leave = function () { cancelAnimationFrame(raf); };
  }
  function renderDevice(body) {
    // the app
    body.appendChild(el('h3', '', 'App'));
    if (APP) {
      body.appendChild(el('p', '', 'The Arcade app <b>' + esc(APP.version || '') + '</b>' + (APP.os ? ' on ' + esc(APP.os) : '') + '.'));
      var a0 = el('div', 'off-acts'); a0.appendChild(btn('What’s new', '', function () { loadNotes(String(APP.version)).then(function (l) { showNotes(String(APP.version), l); }); })); body.appendChild(a0);
    } else body.appendChild(el('p', '', 'You’re on the website. <a href="' + ROOT + 'app/" style="color:inherit">Get the app</a> for Mac, Windows, Chromebook and Android.'));

    // low power
    body.appendChild(el('h3', '', 'Low-power mode'));
    body.appendChild(el('p', '', 'Caps games at 30 frames a second to save battery and keep things cool. Some games may run a little slower.'));
    var sel = el('select'); sel.setAttribute('aria-label', 'Low-power mode');
    [['off', 'Off'], ['battery', 'On when not charging'], ['on', 'Always on']].forEach(function (o) { sel.appendChild(new Option(o[1], o[0])); });
    if (!navigator.getBattery) sel.options[1].text += ' (this browser can’t tell)';
    sel.value = lpMode(); sel.onchange = function () { ls.set(LP, sel.value); applyLP(); st.textContent = lowPower() ? 'Low power is on now.' : 'Low power is off now.'; };
    var st = el('p', '', lowPower() ? 'Low power is on now.' : 'Low power is off now.');
    body.appendChild(sel); body.appendChild(st);

    // notifications
    body.appendChild(el('h3', '', 'Notifications'));
    body.appendChild(el('p', '', 'Calls, friend requests and tournaments you’ve opened starting, while The Arcade is in the background.'));
    var nl = el('label', 'off-chk'), nc = el('input'); nc.type = 'checkbox'; nc.checked = notifyOn();
    nl.appendChild(nc); nl.appendChild(document.createTextNode(nativeN ? 'Show app notifications' : 'Show browser notifications'));
    body.appendChild(nl);
    if (!nativeN && !('Notification' in window)) { nc.disabled = true; body.appendChild(el('p', '', 'This browser doesn’t have notifications.')); }
    nc.onchange = function () {
      if (!nc.checked) { ls.set('arcade-notify', '0'); return; }
      if (nativeN) { ls.set('arcade-notify', '1'); return; }
      Notification.requestPermission().then(function (p) {
        if (p === 'granted') { ls.set('arcade-notify', '1'); toast('Notifications on'); hookTourneys(); }
        else { nc.checked = false; ls.set('arcade-notify', '0'); toast('Notifications are blocked', 'Allow them for this site in your browser’s settings.'); }
      });
    };

    // crash reports
    body.appendChild(el('h3', '', 'Crash reports'));
    body.appendChild(el('p', '', 'Keep a list of errors on this device so you can send it to us when something breaks. Nothing is sent unless you send it.'));
    var cl = el('label', 'off-chk'), cc = el('input'); cc.type = 'checkbox'; cc.checked = crashOn();
    cl.appendChild(cc); cl.appendChild(document.createTextNode('Keep a list of errors'));
    body.appendChild(cl);
    var cbox = el('div'); body.appendChild(cbox);
    function paintCrash() {
      cbox.innerHTML = '';
      var n = ls.json(CL, []).length;
      cbox.appendChild(el('p', '', n ? '<b>' + n + '</b> error' + (n === 1 ? '' : 's') + ' saved.' : crashOn() ? 'No errors saved yet.' : ''));
      if (!n) return;
      var ta = el('textarea'); ta.readOnly = true; ta.value = report(); ta.setAttribute('aria-label', 'Crash report'); cbox.appendChild(ta);
      var acts = el('div', 'off-acts');
      acts.appendChild(btn('Copy report', 'go', function () { (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(function () { toast('Copied', 'Paste it into the bug form.'); }, function () { ta.select(); try { document.execCommand('copy'); toast('Copied'); } catch (e) {} }); }));
      var f = el('a', 'ob', 'Open the bug form ↗'); f.href = BUG_FORM; f.target = '_blank'; f.rel = 'noopener noreferrer'; acts.appendChild(f);
      acts.appendChild(btn('Clear', 'bad', function () { ls.del(CL); paintCrash(); }));
      cbox.appendChild(acts);
      cbox.appendChild(el('p', '', 'Read it first: it has the page, the game, error messages and your browser’s name. No account details.'));
    }
    cc.onchange = function () { if (cc.checked) ls.set(CR, '1'); else { ls.del(CR); ls.del(CL); } paintCrash(); };
    paintCrash();
  }
  function sections() {
    if (!window.ArcadeOffline || !ArcadeOffline.addSection) return;
    ArcadeOffline.addSection('pads', 'Controllers', renderPads, 40);
    ArcadeOffline.addSection('device', 'Settings', renderDevice, 50);
  }

  // a controller plugged in: say so once per visit
  var padSeen = {};
  addEventListener('gamepadconnected', function (e) {
    var id = e.gamepad && e.gamepad.id; if (!id || padSeen[id] || page === 'play') return; padSeen[id] = 1;
    toast('Controller connected', id.replace(/\s*\(.*?\)\s*/g, ' ').trim());
  });

  window.ArcadeBridge = {
    native: native, app: APP, can: can, invoke: invoke, emit: emit, notify: notify,
    recent: recent, current: current, lowPower: lowPower, report: report,
    createShortcut: function (g) { return can('shortcut') ? invoke('arcade_create_shortcut', { id: g.id, title: g.title, url: ROOT + 'play.html?game=' + encodeURIComponent(g.id) }) : Promise.reject(new Error('Not in the app')); },
    showNotes: function () { if (APP && APP.version) loadNotes(String(APP.version)).then(function (l) { showNotes(String(APP.version), l); }); }
  };
  function boot() { sections(); applyLP(); hookLive(); hookTourneys(); updateNotes(); firstLaunch(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
