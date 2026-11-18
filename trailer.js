/* trailer.js (2026-11-17): "Welcome to the new Arcade", a ~44 second feature trailer on the home page.
   Plays once for each visitor (after the 3D logo), and again from the footer or search ("Watch the trailer").
   Built from the site's own art and interface, scene by scene, with clean wipes and cross-fades and a few slow
   moments. An optional soundtrack is synthesised with Web Audio (no files); browsers only allow it after a tap,
   so the Sound button turns it on. Any key, Skip or Esc ends it.
   ArcadeTrailer.play({ onDone }) runs it; ArcadeTrailer.shouldPlay() says whether this visitor hasn't seen it. */
(function () {
  if (window.ArcadeTrailer || window.ARCADE_WATCH) return;
  var KEY = 'arcade-trailer-seen', VERSION = '1';
  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var EASE = 'cubic-bezier(.2,.7,.2,1)', IO = 'cubic-bezier(.65,0,.35,1)';
  function anim(node, frames, o) { try { return node.animate(frames, Object.assign({ fill: 'both', easing: EASE }, o)); } catch (e) { return null; } }

  /* ---------- art ---------- */
  var G = function () { return window.GAMES || []; };
  var byId = function (id) { return G().find(function (g) { return g.id === id; }) || {}; };
  var SHOT = {};
  (window.NEWS || []).forEach(function (n) { if (n.game && n.imgs && n.imgs.length && !SHOT[n.game]) SHOT[n.game] = n.imgs[0]; });
  var shot = function (id) { return SHOT[id] || byId(id).thumb || ''; };
  var thumb = function (id) { return byId(id).thumb || ''; };
  var preload = function (srcs) { srcs.forEach(function (s) { if (s) { var i = new Image(); i.src = s; } }); };

  /* ---------- sound: a low pad, soft whooshes on cuts, one deep hit at the end ---------- */
  var ac = null, master = null, padNodes = [];
  function soundOn() {
    try {
      if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination); }
      ac.resume();
      master.gain.cancelScheduledValues(ac.currentTime); master.gain.setTargetAtTime(0.55, ac.currentTime, 0.8);
      if (!padNodes.length) {
        var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.6; lp.connect(master);
        [55, 82.41, 110.3, 164.8].forEach(function (f, i) {
          var o = ac.createOscillator(), g = ac.createGain();
          o.type = i % 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = (i - 1.5) * 6;
          g.gain.value = 0.05 / (i + 1); o.connect(g); g.connect(lp); o.start();
          var l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 0.07 + i * 0.03; lg.gain.value = 140; l.connect(lg); lg.connect(lp.frequency); l.start();
          padNodes.push(o, l);
        });
      }
      return true;
    } catch (e) { return false; }
  }
  function soundOff() { if (ac && master) master.gain.setTargetAtTime(0, ac.currentTime, 0.25); }
  function whoosh(strong) {
    if (!ac || ac.state !== 'running') return;
    var n = ac.sampleRate * 1.2, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime;
    s.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(strong ? 2600 : 1600, t + 0.9);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(strong ? 0.5 : 0.22, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  function boom() {
    if (!ac || ac.state !== 'running') return;
    var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(32, t + 1.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 2.5);
    whoosh(true);
  }

  /* ---------- pieces used in several scenes ---------- */
  function caption(scene, kicker, line, at) {
    var c = el('div', 'trl-cap', '<small></small><h2></h2>');
    c.querySelector('small').textContent = kicker; c.querySelector('h2').textContent = line;
    scene.appendChild(c);
    anim(c.querySelector('small'), [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: at || 300 });
    anim(c.querySelector('h2'), [{ opacity: 0, transform: 'translateY(22px)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 1100, delay: (at || 300) + 120 });
    return c;
  }
  function words(node, text, delay, step) { // reveal word by word
    node.innerHTML = text.split(' ').map(function (w) { return '<span class="trl-w"><i>' + esc(w) + '</i></span>'; }).join(' ');
    node.querySelectorAll('.trl-w i').forEach(function (i, k) { anim(i, [{ transform: 'translateY(110%)' }, { transform: 'none' }], { duration: 900, delay: delay + k * (step || 90), easing: EASE }); });
  }
  function bgImage(scene, src, zoom, dur) {
    var b = el('div', 'trl-bg', '<img alt="">'); b.querySelector('img').src = src; scene.appendChild(b);
    anim(b.querySelector('img'), [{ transform: 'scale(' + zoom[0] + ')' }, { transform: 'scale(' + zoom[1] + ')' }], { duration: dur, easing: 'linear' });
    return b;
  }
  var CUR = {
    star: '<path d="m12 2.6 2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z"/>',
    orb: '<circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="9.2" fill="none" stroke-width="1.6"/>',
    arrow: '<path d="M4 2.5 20 11l-7 1.8-3.4 6.7z"/>',
    heart: '<path d="M12 20.3S3.2 15 3.2 8.9A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.8 2.3c0 6.1-8.8 11.4-8.8 11.4z"/>',
  };

  /* ---------- the scenes ---------- */
  var SCENES = [
    { dur: 5200, slow: true, build: function (s) { // 1. Everything you love… rebuilt.
      s.classList.add('trl-black');
      var a = el('p', 'trl-line'), b = el('h1', 'trl-big');
      s.append(a, b);
      a.textContent = 'Everything you love about The Arcade.';
      anim(a, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 1400, delay: 300 });
      words(b, 'Rebuilt from the ground up.', 2100, 140);
      anim(a, [{ opacity: 1 }, { opacity: .35 }], { duration: 1200, delay: 2300, fill: 'forwards' });
    } },
    { dur: 7600, build: function (s) { // 2. The console home screen
      var ids = ['havoc-bay', 'storm-drop', 'turn-turn-turn', 'throttle-ridge'];
      var bgs = ids.map(function (id, i) { var b = bgImage(s, shot(id), [1.14, 1.0], 7600); b.style.opacity = i ? 0 : 1; return b; });
      s.appendChild(el('div', 'trl-shade-l'));
      var t = el('h1', 'trl-title'); s.appendChild(t);
      var setTitle = function (txt, d) { words(t, txt.toUpperCase(), d, 70); };
      setTitle(byId(ids[0]).title || 'Havoc Bay', 900);
      var shelf = el('div', 'trl-shelf'); s.appendChild(shelf);
      ['chess', 'havoc-bay', 'storm-drop', 'turn-turn-turn', 'throttle-ridge', 'krill-dive', 'cube-assault'].forEach(function (id) { var c = el('div', 'trl-card', '<img alt="">'); c.querySelector('img').src = thumb(id); c.dataset.id = id; shelf.appendChild(c); });
      anim(shelf, [{ opacity: 0, transform: 'translateY(60px)' }, { opacity: 1, transform: 'none' }], { duration: 1200, delay: 1900 });
      var sel = function (id) { shelf.querySelectorAll('.trl-card').forEach(function (c) { c.classList.toggle('sel', c.dataset.id === id); }); };
      sel('havoc-bay');
      [[3400, 1], [4800, 2], [6100, 3]].forEach(function (x) {
        s.timer(function () {
          sel(ids[x[1]]); whoosh();
          bgs.forEach(function (b, i) { anim(b, [{ opacity: +b.style.opacity }, { opacity: i === x[1] ? 1 : 0 }], { duration: 900, easing: IO, fill: 'forwards' }); b.style.opacity = i === x[1] ? 1 : 0; });
          setTitle(byId(ids[x[1]]).title || '', 120);
        }, x[0]);
      });
      caption(s, '01 · The home screen', 'A home screen that moves with you.', 500).classList.add('top');
    } },
    { dur: 5400, build: function (s) { // 3. Search
      bgImage(s, shot('poly-racer'), [1.05, 1.12], 5400).classList.add('dim');
      var box = el('div', 'trl-cmdk', '<div class="tc-in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="tc-q"></span><i class="tc-caret"></i><kbd>⌘K</kbd></div><div class="tc-list"></div>');
      s.appendChild(box);
      anim(box, [{ opacity: 0, transform: 'translateY(-12px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 400 });
      var q = box.querySelector('.tc-q'), list = box.querySelector('.tc-list');
      'rac'.split('').forEach(function (ch, i) { s.timer(function () { q.textContent += ch; }, 1300 + i * 230); });
      s.timer(function () {
        ['poly-racer', 'turn-turn-turn', 'throttle-ridge'].forEach(function (id, i) {
          var g = byId(id), r = el('div', 'tc-row' + (i ? '' : ' on'), '<img alt=""><b></b><small></small>');
          r.querySelector('img').src = g.thumb || ''; r.querySelector('b').textContent = g.title || id; r.querySelector('small').textContent = g.category || '';
          list.appendChild(r); anim(r, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: i * 110 });
        });
      }, 2100);
      s.timer(function () { var rows = list.querySelectorAll('.tc-row'); rows.forEach(function (r, i) { r.classList.toggle('on', i === 1); }); }, 3500);
      caption(s, '02 · Search', 'Find any game in a keystroke.', 600);
    } },
    { dur: 7000, slow: true, build: function (s) { // 4. Phone as a steering wheel (slow)
      s.classList.add('trl-black');
      var game = el('div', 'trl-race', '<img alt="">'); game.querySelector('img').src = shot('turn-turn-turn'); s.appendChild(game);
      var phone = el('div', 'trl-phone land', '<div class="tp-screen"><div class="tp-ped">BRAKE</div><svg class="tp-wheel" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6"><circle cx="50" cy="50" r="42"/><circle cx="50" cy="50" r="9" fill="currentColor" stroke="none"/><path d="M12 54h29M59 54h29M50 59v32" stroke-linecap="round"/><path d="M50 8v8" stroke="#ff5a2c" stroke-linecap="round"/></svg><div class="tp-ped gas">GAS</div></div>');
      s.appendChild(phone);
      anim(game, [{ opacity: 0, transform: 'translateX(-40px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 1600, delay: 200 });
      anim(phone, [{ opacity: 0, transform: 'translateY(60px) rotate(0)' }, { opacity: 1, transform: 'translateY(0) rotate(0)' }], { duration: 1600, delay: 700 });
      var tilt = [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-20deg)', offset: .3 }, { transform: 'rotate(16deg)', offset: .7 }, { transform: 'rotate(0deg)' }];
      s.timer(function () {
        anim(phone, tilt, { duration: 4200, easing: IO, fill: 'none', composite: 'add' });
        anim(game.querySelector('img'), [{ transform: 'rotate(0) scale(1.08)' }, { transform: 'rotate(5deg) scale(1.1)', offset: .3 }, { transform: 'rotate(-4deg) scale(1.1)', offset: .7 }, { transform: 'rotate(0) scale(1.08)' }], { duration: 4200, easing: IO });
        anim(phone.querySelector('.tp-wheel'), [{ transform: 'rotate(0)' }, { transform: 'rotate(-60deg)', offset: .3 }, { transform: 'rotate(50deg)', offset: .7 }, { transform: 'rotate(0)' }], { duration: 4200, easing: IO });
        phone.querySelector('.gas').classList.add('down');
      }, 2100);
      caption(s, '03 · Phone controller', 'Tilt your phone. Steer the race.', 900).classList.add('side');
    } },
    { dur: 4800, build: function (s) { // 5. Player two
      s.classList.add('trl-black');
      var qr = el('div', 'trl-qr'); for (var i = 0; i < 49; i++) qr.appendChild(el('i', Math.random() > .48 || i % 8 === 0 ? 'on' : ''));
      var wrap = el('div', 'trl-pads');
      ['P1', 'P2'].forEach(function (p, i) {
        var ph = el('div', 'trl-phone pad', '<div class="tp-screen"><span class="tp-slot">' + p + '</span><i class="tp-stick"></i><i class="tp-abxy"></i></div>');
        wrap.appendChild(ph);
        anim(ph, [{ opacity: 0, transform: 'translateY(50px) rotate(' + (i ? 8 : -8) + 'deg)' }, { opacity: 1, transform: 'rotate(' + (i ? 4 : -4) + 'deg)' }], { duration: 1100, delay: 500 + i * 900 });
      });
      s.append(wrap, qr);
      anim(qr, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 150 });
      anim(qr, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 1300, fill: 'forwards' });
      caption(s, 'Friend on the sofa?', 'Scan the code. Player two in seconds.', 700);
    } },
    { dur: 6400, build: function (s) { // 6. Live cursors
      s.classList.add('trl-black');
      var grid = el('div', 'trl-grid');
      ['havoc-bay', 'storm-drop', 'turn-turn-turn', 'krill-dive', 'cube-assault', 'uno', 'free-criminal', 'sproutling', 'rocket-rivals'].forEach(function (id) { var c = el('div', 'trl-gc', '<img alt="">'); c.querySelector('img').src = thumb(id); grid.appendChild(c); });
      s.appendChild(grid);
      anim(grid, [{ opacity: 0, transform: 'scale(1.06)' }, { opacity: .55, transform: 'scale(1)' }], { duration: 1400 });
      var people = [['Nova', 'star', '#ff5a2c', 'rb'], ['Kai', 'orb', '#3ddc97', 'glow'], ['Guest', 'arrow', '#4cc3ff', ''], ['Mika', 'heart', '#ff6fa8', '']];
      var paths = [[[46, 72], [60, 40], [76, 54], [86, 30]], [[92, 20], [78, 46], [64, 34], [54, 62]], [[50, 18], [58, 30], [70, 70], [80, 74]], [[88, 82], [90, 60], [56, 50], [48, 36]]];
      if (innerWidth < innerHeight) paths = paths.map(function (p) { return p.map(function (q) { return [Math.max(8, q[0] - 40) * 1.6, q[1] * .7]; }); });
      people.forEach(function (p, i) {
        var c = el('div', 'trl-cur ' + p[3], '<svg viewBox="0 0 24 24" fill="' + p[2] + '" stroke="#050506" stroke-width="1.3" stroke-linejoin="round">' + CUR[p[1]] + '</svg><span style="background:' + (p[0] === 'Guest' ? 'rgba(40,40,46,.92)' : p[2]) + ';color:' + (p[0] === 'Guest' ? '#d4d4d8' : '#08080a') + '">' + p[0] + '</span>');
        c.style.setProperty('--col', p[2]);
        s.appendChild(c);
        anim(c, paths[i].map(function (pt) { return { left: pt[0] + '%', top: pt[1] + '%' }; }), { duration: 5600, delay: 300 + i * 150, easing: 'cubic-bezier(.45,.05,.55,.95)' });
        anim(c, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 300 + i * 150 });
      });
      s.timer(function () { var k = s.querySelector('.trl-cur.glow'); if (k) { k.classList.add('wave'); } }, 3600);
      caption(s, '04 · Live cursors', 'You’re never browsing alone.', 800).classList.add('side');
    } },
    { dur: 4400, build: function (s) { // 8. Montage: quick cuts
      s.classList.add('trl-black');
      var ids = ['sproutling', 'space-strike', 'cube-assault', 'uno', 'football', 'rocket-rivals', 'poly-racer', 'throttle-ridge'];
      ids.forEach(function (id, i) {
        var b = el('div', 'trl-bg cut', '<img alt="">'); b.querySelector('img').src = shot(id); s.appendChild(b);
        anim(b, [{ opacity: 0, transform: 'scale(1.15)' }, { opacity: 1, transform: 'scale(1.05)', offset: .25 }, { opacity: 1, transform: 'scale(1)', offset: .8 }, { opacity: 0, transform: 'scale(.98)' }], { duration: 650, delay: i * 380, easing: 'linear' });
      });
      var big = el('div', 'trl-count', '<b>0</b><span>games</span>'); s.appendChild(big);
      anim(big, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 200 });
      var total = G().length || 24, k = 0, b = big.querySelector('b');
      var t = setInterval(function () { k = Math.min(total, k + 1); b.textContent = k; if (k >= total) clearInterval(t); }, 110); s.cleanup.push(function () { clearInterval(t); });
      var tag = el('p', 'trl-tagline', 'Always updating.'); s.appendChild(tag);
      anim(tag, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 2900 });
    } },
    { dur: 6600, slow: true, build: function (s) { // 9. Made to be played. + the logo
      s.classList.add('trl-black');
      var l = el('p', 'trl-line big'); l.textContent = 'Made to be played.'; s.appendChild(l);
      anim(l, [{ opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'blur(0)', offset: .3 }, { opacity: 1, filter: 'blur(0)', offset: .75 }, { opacity: 0, filter: 'blur(6px)' }], { duration: 3000, delay: 200 });
      var mark = el('div', 'trl-mark', '<img src="logo.svg?v=2" alt=""><h1>The Arcade</h1><hr><p>Press any key to play</p>');
      s.appendChild(mark);
      anim(mark.querySelector('img'), [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 1200, delay: 3300, easing: 'cubic-bezier(.2,1.3,.3,1)' });
      words(mark.querySelector('h1'), 'THE ARCADE', 3600, 130);
      anim(mark.querySelector('hr'), [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 1100, delay: 4200, easing: IO });
      anim(mark.querySelector('p'), [{ opacity: 0 }, { opacity: 1 }], { duration: 800, delay: 4900 });
      s.timer(boom, 3300);
    } },
  ];

  /* ---------- running it ---------- */
  function play(opts) {
    opts = opts || {};
    if (document.querySelector('.trl')) return;
    ls.set(KEY, VERSION);
    preload(['havoc-bay', 'storm-drop', 'turn-turn-turn', 'throttle-ridge', 'poly-racer', 'sproutling', 'space-strike', 'cube-assault', 'uno', 'football', 'rocket-rivals', 'siege'].map(shot));
    var root = el('div', 'trl', '<div class="trl-stage"></div><div class="trl-bars"><i></i><i></i></div><div class="trl-grain"></div>' +
      '<div class="trl-ui"><button type="button" class="trl-sound" aria-pressed="false"><span class="ic"></span><span class="tx">Sound off</span></button><div class="trl-prog"><i></i></div><button type="button" class="trl-skip">Skip trailer</button></div>');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Welcome to the new Arcade');
    document.body.appendChild(root);
    document.documentElement.classList.add('trl-on');
    var stage = root.querySelector('.trl-stage'), total = SCENES.reduce(function (a, s) { return a + s.dur; }, 0);
    var timers = [], live = [], ended = false, t0 = performance.now();
    var later = function (f, ms) { var id = setTimeout(f, ms); timers.push(id); return id; };
    anim(root.querySelector('.trl-bars'), [{ opacity: 0 }, { opacity: 1 }], { duration: 900 });
    anim(root.querySelector('.trl-prog i'), [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: total, easing: 'linear' });

    var snd = root.querySelector('.trl-sound');
    var paintSound = function (on) { snd.setAttribute('aria-pressed', on); snd.querySelector('.tx').textContent = on ? 'Sound on' : 'Sound off'; snd.classList.toggle('on', on); };
    snd.onclick = function (e) { e.stopPropagation(); var on = snd.getAttribute('aria-pressed') !== 'true'; if (on) { if (soundOn()) { ls.set('arcade-trailer-sound', '1'); paintSound(true); } } else { soundOff(); ls.set('arcade-trailer-sound', '0'); paintSound(false); } };
    // if this browser already allows sound (someone tapped to skip the logo), start it quietly
    if (ls.get('arcade-trailer-sound') !== '0' && (navigator.userActivation ? navigator.userActivation.hasBeenActive : false)) { if (soundOn()) paintSound(true); }

    var at = 0;
    SCENES.forEach(function (sc, i) {
      later(function () {
        var s = el('section', 'trl-sc');
        s.cleanup = [];
        s.timer = function (f, ms) { later(f, ms); };
        stage.appendChild(s);
        try { sc.build(s); } catch (e) {}
        // in: a clean wipe for most cuts, a slow dissolve for the quiet moments
        if (i === 0) anim(s, [{ opacity: 0 }, { opacity: 1 }], { duration: 1200 });
        else if (sc.slow) anim(s, [{ opacity: 0, filter: 'blur(14px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 1300, easing: IO });
        else anim(s, [{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 900, easing: IO });
        if (i) whoosh();
        live.push(s);
        // out: hand over to the next scene, then clean up
        later(function () {
          anim(s, [{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: IO, fill: 'forwards' });
          later(function () { s.cleanup.forEach(function (f) { f(); }); s.remove(); }, 950);
        }, sc.dur - (i === SCENES.length - 1 ? 0 : 200));
      }, at);
      at += sc.dur - 600; // scenes overlap by a moment, so cuts never show black by accident
    });
    later(finish, at + 600);

    function finish() {
      if (ended) return; ended = true;
      timers.forEach(clearTimeout);
      removeEventListener('keydown', onKey, true);
      soundOff();
      anim(root, [{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: IO, fill: 'forwards' });
      setTimeout(function () { root.remove(); document.documentElement.classList.remove('trl-on'); live.forEach(function (s) { (s.cleanup || []).forEach(function (f) { f(); }); }); if (opts.onDone) opts.onDone(); }, 950);
    }
    var onKey = function (e) { if (e.key === 'Tab') return; e.preventDefault(); e.stopPropagation(); finish(); };
    addEventListener('keydown', onKey, true);
    root.querySelector('.trl-skip').onclick = function (e) { e.stopPropagation(); finish(); };
    root.querySelector('.trl-skip').focus({ preventScroll: true });
    return { skip: finish, total: total };
  }

  window.ArcadeTrailer = {
    play: play,
    // first visit to the new site, on a screen big enough to enjoy it, and not with Reduce Motion
    shouldPlay: function () { return ls.get(KEY) !== VERSION && !REDUCED && !/[?&]notrailer\b/.test(location.search) && innerWidth >= 360; },
  };
})();
