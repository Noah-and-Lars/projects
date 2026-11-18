// The "Made by The Arcade" intro: a short cinematic drawn inside the game's frame on play.html (in #stage, over the
// iframe and the loading screen), so it plays in the same spot as the game. It plays first: the game only starts
// loading as the intro fades out (window.ArcadeIntro.load), because a game booting in the iframe runs on the same
// thread and would freeze the animation. Time only moves on with the frames actually drawn, so a stall can't skip it.
// It lasts INTRO_S seconds, then fades into the loading screen or the game. A click skips it, a hidden tab skips it,
// and reduced-motion users get a short fade. window.ArcadeIntro.done is a promise for when it has gone.
// 2026-11-18 (v4): redrawn in the "console" look (arcade.css): near-black, the one orange signal colour, the orange
// joystick logo, Archivo expanded for the name and JetBrains Mono for the labels. Same length as before (2.2 s).
// The beat: an orange line scans across, opens up into the logo tile, the joystick knocks over and springs back,
// "MADE BY" types in, THE ARCADE rises letter by letter, then a boot bar fills and it all fades.
(function () {
  var INTRO_S = 2.2, stage = document.getElementById('stage');
  var resolveDone, done = new Promise(function (r) { resolveDone = r; }), resolveLoad, load = new Promise(function (r) { resolveLoad = r; });
  window.ArcadeIntro = { done: done, load: load };
  if (!stage || document.hidden || /[?&]nointro=1/.test(location.search)) { resolveLoad(); resolveDone(); return; }
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var total = reduced ? 0.9 : INTRO_S;

  var BG = '#050506', ORANGE = '#ff5a2c', INK = '#1a0700', TEXT = '#f4f4f5', MUTED = '#a1a1aa', DIM = '#74747f';
  var SANS = '"Archivo", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  var MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';
  try { if (document.fonts) { document.fonts.load('900 40px "Archivo"'); document.fonts.load('600 12px "JetBrains Mono"'); } } catch (e) {}

  var cv = document.createElement('canvas');
  cv.className = 'arcade-intro';
  cv.setAttribute('aria-label', 'Made by The Arcade');
  cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:5;display:block;cursor:pointer;background:' + BG;
  stage.appendChild(cv);
  var x = cv.getContext('2d'), W = 0, H = 0, DPR = 1;
  function size() {
    var r = stage.getBoundingClientRect(); DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }
  size(); addEventListener('resize', size); document.addEventListener('fullscreenchange', size);

  // film grain: one small noise tile made once, drawn shifted each frame (cheaper than random dots every frame)
  var grain = document.createElement('canvas'); grain.width = grain.height = 128;
  (function () {
    var g = grain.getContext('2d'), im = g.createImageData(128, 128), d = im.data;
    for (var i = 0; i < d.length; i += 4) { var v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(im, 0, 0);
  })();
  var grainPat = null;

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var ramp = function (t, a, b) { return clamp((t - a) / (b - a), 0, 1); };
  var ease = function (k) { return 1 - Math.pow(1 - k, 3); };
  var easeIO = function (k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
  var back = function (k) { var c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  // a damped spring from 1 to 0 (for the joystick knock)
  var spring = function (k) { return Math.exp(-5.5 * k) * Math.cos(k * 15); };

  function rr(px, py, w, h, r) { r = Math.min(r, w / 2, h / 2); x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }

  // the site's joystick logo (logo.svg), centred on the origin, 64 units square. open: 0 = a flat line, 1 = the full
  // tile. tilt: the stick's lean in radians (it pivots on the base).
  function logo(open, tilt, glow) {
    var h = Math.max(2, 64 * open);
    if (glow > 0) { x.shadowColor = 'rgba(255,90,44,' + (0.55 * glow) + ')'; x.shadowBlur = 46 * glow; }
    rr(-32, -h / 2, 64, h, 15 * open); x.fillStyle = ORANGE; x.fill(); x.shadowBlur = 0;
    if (open < 0.55) return;
    var ink = ease(ramp(open, 0.55, 1));
    x.save(); x.globalAlpha *= ink; x.fillStyle = INK;
    rr(-18, 10, 36, 9, 4.5); x.fill(); // base
    x.translate(0, 12); x.rotate(tilt); x.translate(0, -12);
    rr(-2.5, -8, 5, 20, 2.5); x.fill(); // stick
    x.beginPath(); x.arc(0, -11.5, 8, 0, Math.PI * 2); x.fill(); // ball
    x.fillStyle = 'rgba(255,90,44,.55)'; x.beginPath(); x.arc(-2.8, -14.2, 2.4, 0, Math.PI * 2); x.fill();
    x.restore();
  }

  function setFont(weight, px, family, stretch) {
    x.font = weight + ' ' + px + 'px ' + family;
    if ('fontStretch' in x) x.fontStretch = stretch || 'normal';
    if ('letterSpacing' in x) x.letterSpacing = '0px';
  }

  function draw(t) {
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    var u = Math.min(W, H), cx = W / 2, cy = H / 2;
    var out = ease(ramp(t, total - 0.42, total));
    cv.style.opacity = 1 - out;

    // background: near-black with a faint warm glow behind the logo and a vignette
    x.fillStyle = BG; x.fillRect(0, 0, W, H);
    var glowK = reduced ? 0.6 : ease(ramp(t, 0.2, 0.9)) * (1 - 0.4 * ramp(t, 1.2, 2.0));
    var lg = x.createRadialGradient(cx, cy - u * 0.08, 0, cx, cy - u * 0.08, u * 0.7);
    lg.addColorStop(0, 'rgba(255,90,44,' + 0.16 * glowK + ')'); lg.addColorStop(0.5, 'rgba(255,90,44,' + 0.04 * glowK + ')'); lg.addColorStop(1, 'rgba(255,90,44,0)');
    x.fillStyle = lg; x.fillRect(0, 0, W, H);
    var vg = x.createRadialGradient(cx, cy, u * 0.35, cx, cy, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.7)');
    x.fillStyle = vg; x.fillRect(0, 0, W, H);

    var LS = u * 0.003, ly = cy - u * 0.13; // logo scale and centre
    if (reduced) {
      x.save(); x.translate(cx, ly); x.scale(LS, LS); logo(1, 0, 0.5); x.restore();
      title(t, cx, cy, u, 1, 1, 1); corners(u, 1); return;
    }

    var zoom = 1 + 0.04 * easeIO(ramp(t, 0, total));
    x.save(); x.translate(cx, cy); x.scale(zoom, zoom); x.translate(-cx, -cy);

    // 1. an orange scan line shoots across the middle of the logo spot, then pulls in to the tile's width
    var shoot = ease(ramp(t, 0.0, 0.32)), pull = easeIO(ramp(t, 0.3, 0.52));
    var full = W * 0.9, tileW = 64 * LS, lineW = full * shoot * (1 - pull) + tileW * pull;
    if (t < 0.6) {
      x.save(); x.globalCompositeOperation = 'lighter';
      var sg = x.createLinearGradient(cx - lineW / 2, 0, cx + lineW / 2, 0);
      sg.addColorStop(0, 'rgba(255,90,44,0)'); sg.addColorStop(0.5, 'rgba(255,170,130,1)'); sg.addColorStop(1, 'rgba(255,90,44,0)');
      x.fillStyle = sg; x.globalAlpha = 1 - ramp(t, 0.5, 0.6);
      x.fillRect(cx - lineW / 2, ly - 1, lineW, 2);
      x.globalAlpha *= 0.5; x.fillRect(cx - lineW / 2, ly - 5, lineW, 10 * (1 - pull));
      x.restore();
    }
    // 2. the line opens up into the logo tile; the joystick knocks over and springs back
    var open = back(ramp(t, 0.46, 0.78));
    if (t >= 0.46) {
      var knock = ramp(t, 0.72, 1.6), tilt = t < 0.72 ? 0 : -0.5 * spring(knock);
      var pop = 1 + 0.06 * Math.sin(Math.PI * ramp(t, 0.7, 0.95));
      x.save(); x.translate(cx, ly); x.scale(LS * pop, LS * pop);
      logo(Math.max(0.03, open), tilt, 1 - 0.55 * ramp(t, 0.9, 1.6));
      x.restore();
      // a ring pulses out from the tile when it lands
      var ring = ramp(t, 0.7, 1.25);
      if (ring > 0 && ring < 1) {
        var rs = tileW * (1 + 0.9 * ease(ring));
        x.save(); x.strokeStyle = ORANGE; x.globalAlpha = 0.6 * (1 - ring); x.lineWidth = Math.max(1, u * 0.004 * (1 - ring));
        rr(cx - rs / 2, ly - rs / 2, rs, rs, rs * 0.23); x.stroke(); x.restore();
      }
    }
    title(t, cx, cy, u, ramp(t, 0.68, 1.05), ramp(t, 0.82, 1.3), ramp(t, 1.15, 1.8));
    x.restore();

    corners(u, ease(ramp(t, 0.05, 0.4)) * (1 - out));

    // grain over everything
    if (!grainPat) grainPat = x.createPattern(grain, 'repeat');
    x.save(); x.globalAlpha = 0.045; x.globalCompositeOperation = 'overlay';
    x.translate(Math.random() * 128, Math.random() * 128); x.fillStyle = grainPat; x.fillRect(-128, -128, W + 256, H + 256);
    x.restore();
  }

  // "MADE BY" typed in (mono), "THE ARCADE" rising letter by letter (Archivo, expanded), then the boot bar
  function title(t, cx, cy, u, made, word, bar) {
    var fs = Math.max(20, Math.min(u * 0.105, W * 0.085)), ty = cy + u * 0.17 + fs * 0.35;
    x.textBaseline = 'alphabetic';
    if (made > 0) {
      var ms = Math.max(10, u * 0.03), s = 'MADE BY', n = Math.ceil(s.length * made), shown = s.slice(0, n);
      setFont('600', ms, MONO); x.textAlign = 'center';
      var track = ms * 0.55, full = 0, i;
      for (i = 0; i < s.length; i++) full += x.measureText(s[i]).width + (i < s.length - 1 ? track : 0);
      var px = cx - full / 2, my = ty - fs * 1.08; x.textAlign = 'left';
      x.fillStyle = MUTED;
      for (i = 0; i < shown.length; i++) { x.fillText(shown[i], px, my); px += x.measureText(shown[i]).width + track; }
      if (made < 1 || Math.floor(t * 6) % 2 === 0) { x.fillStyle = ORANGE; x.fillRect(px - track * 0.5 + 2, my - ms * 0.8, ms * 0.5, ms * 0.95); } // the cursor
    }
    if (word > 0) {
      var s2 = 'THE ARCADE';
      setFont('900', fs, SANS, 'expanded'); x.textAlign = 'left';
      var gap = fs * 0.02, widths = [], tw = 0;
      for (var j = 0; j < s2.length; j++) { widths.push(x.measureText(s2[j]).width); tw += widths[j] + (j < s2.length - 1 ? gap : 0); }
      if (tw > W * 0.9) { fs *= W * 0.9 / tw; setFont('900', fs, SANS, 'expanded'); tw = 0; for (j = 0; j < s2.length; j++) { widths[j] = x.measureText(s2[j]).width; tw += widths[j] + (j < s2.length - 1 ? gap : 0); } }
      x.save(); x.beginPath(); x.rect(0, ty - fs * 1.05, W, fs * 1.3); x.clip(); // letters rise up from under this line
      var lx = cx - tw / 2;
      for (j = 0; j < s2.length; j++) {
        var k = ease(ramp(word, j * 0.06, j * 0.06 + 0.46)), dy = (1 - k) * fs * 1.05;
        x.fillStyle = TEXT;
        x.globalAlpha = k; x.fillText(s2[j], lx, ty + dy);
        lx += widths[j] + gap;
      }
      x.globalAlpha = 1; x.restore();
      // the boot bar: a thin track under the name that fills orange, with a mono label and percentage
      if (bar > 0) {
        var bw = tw, bx = cx - tw / 2, by = ty + fs * 0.42, bh = Math.max(2, u * 0.006), k2 = easeIO(bar);
        x.globalAlpha = ease(ramp(bar, 0, 0.2));
        x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(bx, by, bw, bh);
        x.fillStyle = ORANGE; x.fillRect(bx, by, bw * k2, bh);
        x.shadowColor = 'rgba(255,90,44,.9)'; x.shadowBlur = bh * 5; x.fillRect(bx + bw * k2 - bh * 2, by, bh * 2, bh); x.shadowBlur = 0;
        var ls = Math.max(9, u * 0.022); setFont('500', ls, MONO);
        x.fillStyle = DIM; x.textAlign = 'left'; x.fillText(k2 < 1 ? 'STARTING GAME' : 'READY', bx, by + bh + ls * 1.6);
        x.textAlign = 'right'; x.fillStyle = k2 < 1 ? MUTED : ORANGE; x.fillText(Math.round(k2 * 100) + '%', bx + bw, by + bh + ls * 1.6);
        x.globalAlpha = 1;
      }
    }
  }

  // console-style corner brackets around the frame
  function corners(u, k) {
    if (k <= 0) return;
    var m = Math.max(14, u * 0.05), L = Math.max(14, u * 0.06) * k;
    x.save(); x.strokeStyle = 'rgba(255,255,255,' + 0.22 * k + ')'; x.lineWidth = 1.5; x.beginPath();
    x.moveTo(m, m + L); x.lineTo(m, m); x.lineTo(m + L, m);
    x.moveTo(W - m - L, m); x.lineTo(W - m, m); x.lineTo(W - m, m + L);
    x.moveTo(m, H - m - L); x.lineTo(m, H - m); x.lineTo(m + L, H - m);
    x.moveTo(W - m - L, H - m); x.lineTo(W - m, H - m); x.lineTo(W - m, H - m - L);
    x.stroke(); x.restore();
  }

  // a low thump as the tile opens, then a quick two-note blip; only if the browser already allows sound on this page
  try {
    var AC = window.AudioContext || window.webkitAudioContext, ac = AC && new AC();
    if (ac && ac.state === 'running') {
      var now = ac.currentTime;
      var th = ac.createOscillator(), tg = ac.createGain(), ta = now + 0.46;
      th.type = 'sine'; th.frequency.setValueAtTime(140, ta); th.frequency.exponentialRampToValueAtTime(45, ta + 0.35);
      tg.gain.setValueAtTime(0.0001, ta); tg.gain.exponentialRampToValueAtTime(0.32, ta + 0.015); tg.gain.exponentialRampToValueAtTime(0.0001, ta + 0.45);
      th.connect(tg).connect(ac.destination); th.start(ta); th.stop(ta + 0.5);
      [[659.25, 0.74], [987.77, 0.84]].forEach(function (n) {
        var o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(), at = now + n[1];
        o.type = 'square'; o.frequency.value = n[0]; f.type = 'lowpass'; f.frequency.value = 2600;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.045, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
        o.connect(f).connect(g).connect(ac.destination); o.start(at); o.stop(at + 0.55);
      });
    } else if (ac) ac.close();
  } catch (e) {}

  var t = 0, last = performance.now(), gone = false;
  function finish() {
    if (gone) return; gone = true;
    cv.remove(); removeEventListener('resize', size); document.removeEventListener('fullscreenchange', size);
    resolveLoad(); resolveDone();
  }
  cv.addEventListener('click', function () { if (!gone) total = Math.min(total, t + 0.3); });
  (function tick() {
    if (gone) return;
    var now = performance.now(); t += Math.min(0.05, (now - last) / 1000); last = now; // a long stall counts as one frame
    if (t >= total - 0.42) resolveLoad(); // start loading the game as the intro fades out
    draw(Math.min(t, total));
    if (t >= total) finish(); else requestAnimationFrame(tick);
  })();
  // a hidden tab doesn't run animation frames: don't leave the intro covering the game
  document.addEventListener('visibilitychange', function () { if (document.hidden) finish(); });
})();
