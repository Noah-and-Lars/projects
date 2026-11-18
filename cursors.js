/* cursors.js (2026-11-17): live cursors on the home page. Everyone on the home page with a mouse sees everyone
   else's pointer moving in real time, with their name (signed-in players) or "Guest", and can wave (W, or the Wave
   button). Positions are sent relative to the section under the pointer ([data-cur] elements; the smallest one
   wins), so a pointer on a game card lands on the same card on a different-sized screen.
   Cursors are customisable (shape, colour, trail): the choice is saved in 'arcade-cursor-style', shown to everyone
   else, and your own pointer on the home page takes the same look.
   Channel "cursors:home" (rt.js, no account needed): presence {n, s, c, t}; broadcast "mv" {k, a, fx, fy}, "wave" {k}.
   Phones don't send or show cursors. Hiding them is remembered in 'arcade-cursors' = 'off'. */
(function () {
  if (window.ArcadeCursors || window.ARCADE_WATCH) return;
  var FINE = matchMedia('(hover: hover) and (pointer: fine)').matches && !document.documentElement.classList.contains('mob');
  var MAX = 24, IDLE = 9000, HZ = 80, TRAIL = 7;
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var me = (function () { var id = ls.get('arcade-online-id'); return (id || Math.random().toString(36).slice(2)).slice(0, 24); })();
  var ch = null, layer = null, peers = {}, who = {}, on = ls.get('arcade-cursors') !== 'off', raf = 0, pill = null, pop = null;
  var hash = function (s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  var myName = function () { try { return window.ArcadeAccount && ArcadeAccount.kind && ArcadeAccount.kind() === 'online' ? ArcadeAccount.name() : ''; } catch (e) { return ''; } };
  var anchors = function () { return Array.prototype.slice.call(document.querySelectorAll('[data-cur]')); };

  /* ---------- the looks ---------- */
  // each shape: the drawing (24x24) and its hotspot
  var SHAPES = {
    arrow: { name: 'Arrow', hot: [4, 2.5], d: '<path d="M4 2.5 20 11l-7 1.8-3.4 6.7z"/>' },
    dart: { name: 'Dart', hot: [3, 3], d: '<path d="M3 3l18 6.2-7.6 2.6L11 20z"/><path d="M13.4 11.8 20 18.5" fill="none" stroke-width="2.4" stroke-linecap="round"/>' },
    orb: { name: 'Orb', hot: [12, 12], d: '<circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="9.2" fill="none" stroke-width="1.6" style="stroke:var(--cc)"/>' },
    cross: { name: 'Crosshair', hot: [12, 12], d: '<circle cx="12" cy="12" r="2.6"/><path d="M12 2.5v5.5M12 16v5.5M2.5 12H8M16 12h5.5" fill="none" stroke-width="2.4" stroke-linecap="round" style="stroke:var(--cc)"/>' },
    star: { name: 'Star', hot: [12, 12], d: '<path d="m12 2.6 2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z"/>' },
    heart: { name: 'Heart', hot: [12, 12], d: '<path d="M12 20.3S3.2 15 3.2 8.9A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.8 2.3c0 6.1-8.8 11.4-8.8 11.4z"/>' },
    stick: { name: 'Joystick', hot: [12, 3.5], d: '<circle cx="12" cy="7.5" r="4.6"/><rect x="10.6" y="10.5" width="2.8" height="7" rx="1.2"/><rect x="4.5" y="16.5" width="15" height="4.5" rx="2.25"/>' },
  };
  var COLOURS = { ember: '#ff5a2c', sun: '#ffb224', lime: '#a3e635', mint: '#3ddc97', sky: '#4cc3ff', iris: '#8b9cff', rose: '#ff6fa8', snow: '#f4f4f5', rainbow: 'rainbow' };
  var TRAILS = { none: 'None', glow: 'Glow', comet: 'Comet' };
  var defStyle = function (k) { var keys = Object.keys(COLOURS).filter(function (c) { return c !== 'rainbow'; }); return { s: 'arrow', c: keys[hash(k) % keys.length], t: 'none' }; };
  var clean = function (st, k) { var d = defStyle(k); st = st || {}; return { s: SHAPES[st.s] ? st.s : d.s, c: COLOURS[st.c] ? st.c : d.c, t: TRAILS[st.t] ? st.t : d.t }; };
  var mine = clean(JSON.parse(ls.get('arcade-cursor-style') || 'null'), me);
  function svgFor(st, size, id) {
    var c = COLOURS[st.c], g = '';
    if (c === 'rainbow') { g = '<defs><linearGradient id="rb' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5a2c"/><stop offset=".35" stop-color="#ffb224"/><stop offset=".6" stop-color="#3ddc97"/><stop offset="1" stop-color="#8b9cff"/></linearGradient></defs>'; c = 'url(#rb' + id + ')'; }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" style="--cc:' + c + '" fill="' + c + '" stroke="#050506" stroke-width="1.3" stroke-linejoin="round">' + g + SHAPES[st.s].d.replace(/var\(--cc\)/g, c) + '</svg>';
  }
  // your own pointer on the home page takes your look
  function applyOwn() {
    var root = document.documentElement;
    if (!on || !FINE) { root.style.removeProperty('--own-cursor'); root.classList.remove('own-cursor'); return; }
    var s = SHAPES[mine.s], url = 'data:image/svg+xml,' + encodeURIComponent(svgFor(mine, 28, 'own'));
    root.style.setProperty('--own-cursor', 'url("' + url + '") ' + Math.round(s.hot[0] * 28 / 24) + ' ' + Math.round(s.hot[1] * 28 / 24) + ', auto');
    root.classList.add('own-cursor');
  }

  /* ---------- positions ---------- */
  function where(x, y) {
    // the smallest section under the pointer wins (a card row beats the whole screen), so it lines up closely
    var list = anchors(), best = null, area = Infinity;
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (r.width > 0 && y >= r.top && y <= r.bottom && x >= r.left && x <= r.right && r.width * r.height < area) { best = { el: list[i], r: r }; area = r.width * r.height; }
    }
    if (!best) for (var j = 0; j < list.length; j++) { var q = list[j].getBoundingClientRect(); if (q.width > 0 && y >= q.top && y <= q.bottom) { best = { el: list[j], r: q }; break; } }
    if (!best) return null;
    return { a: best.el.getAttribute('data-cur'), fx: +((x - best.r.left) / best.r.width).toFixed(4), fy: +((y - best.r.top) / best.r.height).toFixed(4) };
  }
  function place(p) { // anchor-relative -> page position on this screen
    var el = document.querySelector('[data-cur="' + p.a + '"]'); if (!el) return null;
    var r = el.getBoundingClientRect();
    return { x: r.left + scrollX + p.fx * r.width, y: r.top + scrollY + p.fy * r.height };
  }

  /* ---------- drawing everyone else ---------- */
  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement('div'); layer.className = 'cur-layer'; layer.setAttribute('aria-hidden', 'true'); layer.hidden = !on;
    document.body.appendChild(layer);
    return layer;
  }
  function peerEl(k) {
    var p = peers[k], w = who[k] || { n: '', st: defStyle(k) }, key = w.st.s + w.st.c + w.st.t;
    if (!p.el) {
      p.el = document.createElement('div'); p.el.className = 'cur';
      p.el.innerHTML = '<i class="cur-art"></i><span></span>';
      p.trail = [];
      ensureLayer().appendChild(p.el);
    }
    if (p.look !== key) {
      p.look = key;
      var s = SHAPES[w.st.s];
      p.el.querySelector('.cur-art').innerHTML = svgFor(w.st, 22, k.replace(/\W/g, ''));
      p.el.style.setProperty('--hx', -(s.hot[0] * 22 / 24) + 'px'); p.el.style.setProperty('--hy', -(s.hot[1] * 22 / 24) + 'px');
      p.el.style.setProperty('--col', COLOURS[w.st.c] === 'rainbow' ? '#ff5a2c' : COLOURS[w.st.c]);
      p.el.classList.toggle('rainbow', w.st.c === 'rainbow');
      p.el.classList.toggle('glow', w.st.t === 'glow');
      p.trail.forEach(function (d) { d.remove(); }); p.trail = []; p.hist = [];
      if (w.st.t === 'comet') for (var i = 0; i < TRAIL; i++) { var d = document.createElement('b'); d.className = 'cur-dot'; d.style.setProperty('--i', i); d.style.background = COLOURS[w.st.c] === 'rainbow' ? 'hsl(' + (i * 45) + ' 90% 60%)' : COLOURS[w.st.c]; ensureLayer().appendChild(d); p.trail.push(d); }
    }
    var span = p.el.querySelector('span');
    span.textContent = w.n || 'Guest';
    p.el.classList.toggle('guest', !w.n);
    return p.el;
  }
  function frame() {
    raf = 0;
    var now = Date.now(), any = false;
    Object.keys(peers).forEach(function (k) {
      var p = peers[k];
      if (!p.t || now - p.at > IDLE || !who.hasOwnProperty(k)) {
        if (p.el) p.el.classList.add('idle');
        (p.trail || []).forEach(function (d) { d.style.opacity = 0; });
        if (now - (p.at || 0) > IDLE * 3) { if (p.el) p.el.remove(); (p.trail || []).forEach(function (d) { d.remove(); }); delete peers[k]; }
        return;
      }
      var to = place(p.t); if (!to) return;
      if (!p.pos) p.pos = { x: to.x, y: to.y };
      p.pos.x += (to.x - p.pos.x) * 0.28; p.pos.y += (to.y - p.pos.y) * 0.28;
      var el = peerEl(k);
      el.classList.remove('idle');
      el.style.transform = 'translate3d(' + p.pos.x.toFixed(1) + 'px,' + p.pos.y.toFixed(1) + 'px,0)';
      if (p.trail.length) { // a comet tail: the last few spots, fading
        p.hist = p.hist || []; p.hist.unshift({ x: p.pos.x, y: p.pos.y }); p.hist.length = Math.min(p.hist.length, TRAIL * 2);
        p.trail.forEach(function (d, i) { var h = p.hist[Math.min(p.hist.length - 1, (i + 1) * 2)]; d.style.transform = 'translate3d(' + h.x.toFixed(1) + 'px,' + h.y.toFixed(1) + 'px,0) scale(' + (1 - i / TRAIL).toFixed(2) + ')'; d.style.opacity = (0.75 * (1 - i / TRAIL)).toFixed(2); });
        if (p.hist.length > 1 && Math.abs(p.hist[0].x - p.hist[p.hist.length - 1].x) + Math.abs(p.hist[0].y - p.hist[p.hist.length - 1].y) > 0.5) any = true;
      }
      if (Math.abs(to.x - p.pos.x) + Math.abs(to.y - p.pos.y) > 0.5) any = true;
    });
    if (any) loop();
  }
  function loop() { if (!raf && on) raf = requestAnimationFrame(frame); }

  /* ---------- the channel ---------- */
  function track() { if (ch) ch.track({ n: myName(), s: mine.s, c: mine.c, t: mine.t }); }
  function connect() {
    if (ch || !window.ArcadeOnline) return;
    ArcadeOnline.ready(function (client) {
      if (!client) return;
      ch = client.channel('cursors:home', { config: { presence: { key: me } } });
      ch.on('presence', { event: 'sync' }, function () {
        var st = ch.presenceState(); who = {};
        Object.keys(st).forEach(function (k) {
          var m = st[k] && st[k][0]; if (k === me || !m) return;
          who[k] = { n: /^[A-Za-z0-9_]{3,16}$/.test(m.n || '') ? m.n : '', st: clean(m, k) };
        });
        paintPill(); loop();
      });
      ch.on('broadcast', { event: 'mv' }, function (e) {
        var m = e.payload || {}; if (!m.k || m.k === me || !on) return;
        if (!peers[m.k] && Object.keys(peers).length >= MAX) return;
        var p = peers[m.k] || (peers[m.k] = {});
        p.t = { a: String(m.a), fx: +m.fx || 0, fy: +m.fy || 0 }; p.at = Date.now();
        loop();
      });
      ch.on('broadcast', { event: 'wave' }, function (e) { var m = e.payload || {}; if (m.k && m.k !== me && on) wave(m.k); });
      ch.subscribe(function (s) { if (s === 'SUBSCRIBED') track(); });
    });
  }
  var lastSent = 0, pending = null, timer = 0;
  function send(pos) {
    if (!ch || !on || document.hidden) return;
    pending = pos;
    var wait = HZ - (Date.now() - lastSent);
    if (wait > 0) { if (!timer) timer = setTimeout(function () { timer = 0; send(pending); }, wait); return; }
    lastSent = Date.now();
    ch.send({ type: 'broadcast', event: 'mv', payload: { k: me, a: pos.a, fx: pos.fx, fy: pos.fy } });
  }
  function toast(t) { var el = document.createElement('div'); el.className = 'cur-wave mine'; el.textContent = t; document.body.appendChild(el); setTimeout(function () { el.remove(); }, 1600); }
  function wave(k) {
    if (k === me) return toast('You waved');
    var p = peers[k]; if (!p || !p.el) return;
    p.el.classList.remove('waving'); void p.el.offsetWidth; p.el.classList.add('waving');
  }
  function sendWave() { if (!ch || !on) return; ch.send({ type: 'broadcast', event: 'wave', payload: { k: me } }); wave(me); }

  /* ---------- the pill and the cursor picker ---------- */
  function paintPill() {
    if (!pill) return;
    var n = Object.keys(who).length;
    pill.querySelector('.cw-n').innerHTML = n ? '<b>' + n + '</b> here with you' : 'Just you here';
    pill.querySelector('.cw-me').innerHTML = svgFor(mine, 15, 'pill');
    pill.querySelector('[data-cw="toggle"]').textContent = on ? 'Hide cursors' : 'Show cursors';
    pill.querySelector('[data-cw="wave"]').hidden = !on || !n;
  }
  function makePill(host) {
    pill = document.createElement('span'); pill.className = 'glass-pill cur-pill';
    pill.innerHTML = '<span class="cw-me" aria-hidden="true"></span><span class="cw-n"></span><button type="button" data-cw="wave">Wave</button><button type="button" data-cw="style" aria-haspopup="dialog">Customise</button><button type="button" data-cw="toggle">Hide cursors</button>';
    pill.querySelector('[data-cw="wave"]').onclick = sendWave;
    pill.querySelector('[data-cw="style"]').onclick = function (e) { e.stopPropagation(); pop && !pop.hidden ? closePop() : openPop(); };
    pill.querySelector('[data-cw="toggle"]').onclick = function () {
      on = !on; ls.set('arcade-cursors', on ? 'on' : 'off');
      if (layer) layer.hidden = !on;
      applyOwn(); if (on) loop();
      paintPill();
    };
    host.prepend(pill);
    paintPill();
  }
  function openPop() {
    if (!pop) {
      pop = document.createElement('div'); pop.className = 'cur-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Your cursor');
      pop.addEventListener('click', function (e) { e.stopPropagation(); });
      document.addEventListener('click', function () { closePop(); });
      addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop(); });
      pill.parentNode.appendChild(pop);
    }
    pop.hidden = false; paintPop();
  }
  function closePop() { if (pop) pop.hidden = true; }
  function paintPop() {
    var row = function (title, items, cur, field) {
      return '<div class="cp-row"><span class="cp-l">' + title + '</span><div class="cp-opts cp-' + field + '">' + items.map(function (it) {
        return '<button type="button" class="' + (it.k === cur ? 'on' : '') + '" data-f="' + field + '" data-v="' + it.k + '" title="' + it.t + '" aria-pressed="' + (it.k === cur) + '">' + it.h + '</button>';
      }).join('') + '</div></div>';
    };
    var name = myName() || 'Guest';
    pop.innerHTML = '<div class="cp-head"><b>Your cursor</b><span>Everyone on the home page sees it</span></div>' +
      '<div class="cp-prev"><div class="cp-cur' + (mine.t === 'glow' ? ' glow' : '') + (mine.c === 'rainbow' ? ' rainbow' : '') + '" style="--col:' + (COLOURS[mine.c] === 'rainbow' ? '#ff5a2c' : COLOURS[mine.c]) + '">' + (mine.t === 'comet' ? '<i class="cp-tail"></i>' : '') + svgFor(mine, 44, 'prev') + '<span class="' + (myName() ? '' : 'guest') + '">' + name.replace(/[<>&]/g, '') + '</span></div></div>' +
      row('Shape', Object.keys(SHAPES).map(function (k) { return { k: k, t: SHAPES[k].name, h: svgFor({ s: k, c: mine.c, t: 'none' }, 22, 'o' + k) }; }), mine.s, 's') +
      row('Colour', Object.keys(COLOURS).map(function (k) { return { k: k, t: k[0].toUpperCase() + k.slice(1), h: '<i class="sw' + (k === 'rainbow' ? ' rb' : '') + '" style="background:' + (k === 'rainbow' ? '' : COLOURS[k]) + '"></i>' }; }), mine.c, 'c') +
      row('Trail', Object.keys(TRAILS).map(function (k) { return { k: k, t: TRAILS[k], h: TRAILS[k] }; }), mine.t, 't');
    pop.querySelectorAll('[data-f]').forEach(function (b) {
      b.onclick = function () {
        mine[b.dataset.f] = b.dataset.v; mine = clean(mine, me);
        ls.set('arcade-cursor-style', JSON.stringify(mine));
        track(); applyOwn(); paintPop(); paintPill();
      };
    });
  }

  window.ArcadeCursors = {
    // index.html: start(element to put the pill in)
    start: function (pillHost) {
      if (!FINE) return;
      if (pillHost) makePill(pillHost);
      applyOwn();
      connect();
      addEventListener('mousemove', function (e) { var p = where(e.clientX, e.clientY); if (p) send(p); }, { passive: true });
      addEventListener('scroll', function () { loop(); }, { passive: true });
      addEventListener('resize', function () { loop(); });
      addEventListener('keydown', function (e) {
        if ((e.key === 'w' || e.key === 'W') && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.querySelector('.sheet, .cmdk-wrap:not([hidden]), .intro, #acctOv, #tosPop')) sendWave();
      });
      setInterval(loop, 1000);
    },
    style: function () { return Object.assign({}, mine); },
    shapes: SHAPES, colours: COLOURS,
  };
})();
