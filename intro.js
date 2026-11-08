// The "Made by The Arcade" intro: a short cinematic drawn inside the game's frame on play.html (in #stage, over the
// iframe and the loading screen), so it plays in the same spot as the game. It plays first: the game only starts
// loading as the intro fades out (window.ArcadeIntro.load), because a game booting in the iframe runs on the same
// thread and would freeze the animation. Time only moves on with the frames actually drawn, so a stall can't skip it.
// It lasts INTRO_S seconds, then fades into the loading screen or the game. A click skips it, a hidden tab skips it,
// and reduced-motion users get a short fade. window.ArcadeIntro.done is a promise for when it has gone.
(function () {
  var INTRO_S = 2.2, stage = document.getElementById('stage');
  var resolveDone, done = new Promise(function (r) { resolveDone = r; }), resolveLoad, load = new Promise(function (r) { resolveLoad = r; });
  window.ArcadeIntro = { done: done, load: load };
  if (!stage || document.hidden || /[?&]nointro=1/.test(location.search)) { resolveLoad(); resolveDone(); return; }
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var total = reduced ? 0.9 : INTRO_S;

  var cv = document.createElement('canvas');
  cv.className = 'arcade-intro';
  cv.setAttribute('aria-label', 'Made by The Arcade');
  cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:5;display:block;cursor:pointer;background:#05040f';
  stage.appendChild(cv);
  var x = cv.getContext('2d'), W = 0, H = 0, DPR = 1;
  function size() {
    var r = stage.getBoundingClientRect(); DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }
  size(); addEventListener('resize', size); document.addEventListener('fullscreenchange', size);

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var ramp = function (t, a, b) { return clamp((t - a) / (b - a), 0, 1); };
  var ease = function (k) { return 1 - Math.pow(1 - k, 3); };
  var back = function (k) { var c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  var VIOLET = '#7b6cff', TEAL = '#00d2a8';

  // sparks thrown out from the logo
  var sparks = [];
  for (var i = 0; i < 70; i++) { var a = Math.random() * Math.PI * 2; sparks.push({ a: a, v: 0.25 + Math.random() * 0.75, s: 0.6 + Math.random() * 1.6, d: 0.2 + Math.random() * 0.35, c: Math.random() < 0.5 ? VIOLET : TEAL }); }

  // the site's joystick logo (logo.svg), drawn at the origin, 64 units square
  function logo(glow) {
    var g = x.createLinearGradient(-32, -32, 32, 32); g.addColorStop(0, VIOLET); g.addColorStop(1, TEAL);
    x.shadowColor = 'rgba(123,108,255,' + (0.8 * glow) + ')'; x.shadowBlur = 40 * glow;
    rr(-32, -32, 64, 64, 16); x.fillStyle = g; x.fill(); x.shadowBlur = 0;
    x.fillStyle = '#fff';
    rr(-19, 9, 38, 11, 5.5); x.fill(); rr(-2.5, -9, 5, 21, 2.5); x.fill();
    x.beginPath(); x.arc(0, -12, 8.5, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#6c5ce7'; x.beginPath(); x.arc(12.5, 14.5, 2.6, 0, Math.PI * 2); x.fill();
  }
  function rr(px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }

  function draw(t) {
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    var u = Math.min(W, H), cx = W / 2, cy = H / 2;
    // the whole thing fades out at the end and pushes in slightly the whole time
    var out = ease(ramp(t, total - 0.45, total)), alpha = 1 - out;
    cv.style.opacity = alpha;
    var bg = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75);
    bg.addColorStop(0, '#16123a'); bg.addColorStop(0.55, '#0a0820'); bg.addColorStop(1, '#030209');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    if (reduced) { // a plain title card
      x.save(); x.translate(cx, cy - u * 0.08); var sc = u * 0.0024; x.scale(sc, sc); logo(0.6); x.restore();
      title(t, cx, cy, u, 1, 1, 1); return;
    }
    var zoom = 1 + 0.05 * ease(ramp(t, 0, total));
    x.save(); x.translate(cx, cy); x.scale(zoom, zoom); x.translate(-cx, -cy);
    // a beam of light opens across the middle, then the logo pops up out of it
    var beam = ease(ramp(t, 0.05, 0.55)), beamFade = 1 - ramp(t, 0.7, 1.3);
    if (beam > 0 && beamFade > 0) {
      var bw = W * 0.8 * beam, bfs = Math.max(18, u * 0.11), by = cy + u * 0.17 + bfs * 0.62; // just under the title
      var lg = x.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
      lg.addColorStop(0, 'rgba(123,108,255,0)'); lg.addColorStop(0.5, 'rgba(220,235,255,' + 0.95 * beamFade + ')'); lg.addColorStop(1, 'rgba(0,210,168,0)');
      x.fillStyle = lg; x.fillRect(cx - bw / 2, by - 1, bw, 2);
      x.globalCompositeOperation = 'lighter';
      var hg = x.createRadialGradient(cx, by, 0, cx, by, u * 0.5 * beam);
      hg.addColorStop(0, 'rgba(123,108,255,' + 0.35 * beamFade + ')'); hg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = hg; x.fillRect(0, by - u * 0.5, W, u);
      x.globalCompositeOperation = 'source-over';
    }
    // sparks
    var sk = ramp(t, 0.3, 1.9);
    if (sk > 0 && sk < 1) {
      x.globalCompositeOperation = 'lighter';
      for (var i = 0; i < sparks.length; i++) {
        var p = sparks[i], k = ease(sk), r = u * (0.08 + p.v * 0.55 * k), sx = cx + Math.cos(p.a) * r * 1.4, sy = cy - u * 0.08 + Math.sin(p.a) * r * 0.8;
        x.globalAlpha = (1 - sk) * 0.9; x.fillStyle = p.c; x.beginPath(); x.arc(sx, sy, p.s, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    }
    // the logo: pops in with a bounce, glows, then settles
    var lk = ramp(t, 0.25, 0.75);
    if (lk > 0) {
      x.save(); x.globalAlpha = ease(lk); x.translate(cx, cy - u * 0.1);
      var sc = u * 0.0026 * (0.55 + 0.45 * back(lk)); x.scale(sc, sc);
      logo(1 - 0.6 * ramp(t, 0.8, 1.6)); x.restore();
    }
    title(t, cx, cy, u, ramp(t, 0.55, 0.95), ramp(t, 0.7, 1.15), ramp(t, 1.0, 1.55));
    x.restore();
    // letterbox bars slide in at the start and away at the end, and a little film grain
    var bar = H * 0.09 * ease(ramp(t, 0, 0.35)) * (1 - out);
    x.fillStyle = '#000'; x.fillRect(0, 0, W, bar); x.fillRect(0, H - bar, W, bar);
    x.globalAlpha = 0.05;
    for (var n = 0; n < 140; n++) { x.fillStyle = Math.random() < 0.5 ? '#fff' : '#000'; x.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); }
    x.globalAlpha = 1;
  }
  // "MADE BY" (spreading out) over "THE ARCADE" (revealed from the middle, with a shine passing over it)
  function title(t, cx, cy, u, made, word, shine) {
    var fs = Math.max(18, u * 0.11), ty = cy + u * 0.17 + fs * 0.35;
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    if (made > 0) {
      var ms = Math.max(10, u * 0.032), track = (0.25 + 0.35 * ease(made)) * ms;
      x.font = '700 ' + ms + 'px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      x.fillStyle = 'rgba(200,196,235,' + ease(made) + ')';
      spaced('MADE BY', cx, ty - fs * 1.05, track);
    }
    if (word > 0) {
      x.font = '900 ' + fs + 'px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      var tw = x.measureText('THE ARCADE').width, rv = ease(word);
      x.save(); x.beginPath(); x.rect(cx - tw / 2 * rv - 4, ty - fs * 1.1, tw * rv + 8, fs * 1.4); x.clip();
      var g = x.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0); g.addColorStop(0, '#b3a9ff'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#6ff0d4');
      x.shadowColor = 'rgba(123,108,255,.6)'; x.shadowBlur = fs * 0.4; x.fillStyle = g; x.fillText('THE ARCADE', cx, ty); x.shadowBlur = 0;
      if (shine > 0 && shine < 1) { // a bright band sweeping left to right across the letters (the text drawn again, lit only in the band)
        var sx = cx - tw / 2 - fs + (tw + fs * 2) * ease(shine), sg = x.createLinearGradient(sx - fs * 0.6, 0, sx + fs * 0.6, 0);
        sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,.95)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = sg; x.fillText('THE ARCADE', cx, ty);
      }
      x.restore();
    }
  }
  function spaced(s, cx, y, track) {
    var w = 0, i; for (i = 0; i < s.length; i++) w += x.measureText(s[i]).width + (i < s.length - 1 ? track : 0);
    var px = cx - w / 2; x.textAlign = 'left';
    for (i = 0; i < s.length; i++) { x.fillText(s[i], px, y); px += x.measureText(s[i]).width + track; }
    x.textAlign = 'center';
  }

  // a soft whoosh and chime, only if the browser already allows sound on this page
  try {
    var AC = window.AudioContext || window.webkitAudioContext, ac = AC && new AC();
    if (ac && ac.state === 'running') {
      var now = ac.currentTime, len = ac.sampleRate * 0.9, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (var j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 2);
      var src = ac.createBufferSource(), bp = ac.createBiquadFilter(), gn = ac.createGain();
      src.buffer = buf; bp.type = 'bandpass'; bp.frequency.setValueAtTime(300, now); bp.frequency.exponentialRampToValueAtTime(2400, now + 0.6);
      gn.gain.setValueAtTime(0.0001, now); gn.gain.exponentialRampToValueAtTime(0.18, now + 0.25); gn.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      src.connect(bp).connect(gn).connect(ac.destination); src.start(now);
      [523.25, 783.99, 1046.5].forEach(function (f, k) {
        var o = ac.createOscillator(), g = ac.createGain(), at = now + 0.55 + k * 0.06;
        o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.07, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
        o.connect(g).connect(ac.destination); o.start(at); o.stop(at + 1.3);
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
    if (t >= total - 0.45) resolveLoad(); // start loading the game as the intro fades out
    draw(Math.min(t, total));
    if (t >= total) finish(); else requestAnimationFrame(tick);
  })();
  // a hidden tab doesn't run animation frames: don't leave the intro covering the game
  document.addEventListener('visibilitychange', function () { if (document.hidden) finish(); });
})();
