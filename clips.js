/* clips.js (2026-11-10): the 🎬 Clip button on play.html. Records the game you're playing and posts it to Social
   (social.html). Loaded by play.html after account.js; window.ArcadeClips is the interface.

   How it records: the game runs in a same-origin iframe, so this page can reach its canvases. Every visible canvas is
   captured with captureStream() (which gets a WebGL canvas's real picture) into a tiny hidden video; each frame those
   are drawn into one canvas of at most 1280x720 at their places on screen, and that canvas is recorded with
   MediaRecorder (WebM, or MP4 on Safari). HTML overlays (menus made of page elements) aren't in the clip.
   Sound: when the game makes its AudioContext after this page has hooked the frame (most games wait for a click),
   its output also goes to a MediaStream that is recorded with the picture. Games that made theirs earlier are silent.
   Clip (or F8, in the game or on the page) saves the last 30 seconds (the replay buffer, below). Browsers without
   WebCodecs (older Safari) get start/stop recording instead, up to MAX_S seconds.
   Posting: POST /clips/new (details + poster) then PUT /clips/v/<id>?k= with the video (see the Worker). */
(function () {
  'use strict';
  var MAX_S = 60, MAX_BYTES = 12 * 1024 * 1024, OUT_W = 1280, OUT_H = 720, FPS = 30;
  var ROOM = ((/[?&]clipsroom=([a-z0-9-]+)/i.exec(location.search) || [])[1] || '').toLowerCase(); // tests: a separate Social
  var rec = null, last = null, frameEl = null, game = null, btn = null, taps = [];

  function api() { return (window.ArcadeAccount ? ArcadeAccount.server : 'https://arcade-realtime.arcade-realtime.workers.dev') + '/clips/'; }
  function q(extra) { var p = new URLSearchParams(extra || {}); if (ROOM) p.set('r', ROOM); var s = p.toString(); return s ? '?' + s : ''; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmt(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function say(t) { if (window.ArcadeAccount && ArcadeAccount.toast) ArcadeAccount.toast('Clips', t, 'social.html'); else alert(t); }

  function css() {
    if (document.getElementById('clipCss')) return;
    var s = el('style'); s.id = 'clipCss';
    s.textContent = [
      '.clip-rec{position:absolute;z-index:30;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 12px 6px 10px;border-radius:999px;background:rgba(10,9,22,.82);border:1px solid #ff4d5a66;color:#fff;font:700 14px system-ui,sans-serif;cursor:pointer;user-select:none}',
      '.clip-rec i{width:10px;height:10px;border-radius:50%;background:#ff4d5a;box-shadow:0 0 10px #ff4d5a;animation:clipblink 1s steps(2) infinite}',
      '.clip-rec small{color:#ffffffa0;font-weight:600}',
      '@keyframes clipblink{50%{opacity:.25}}',
      '#clip.on{background:#e5484d;border-color:#e5484d;color:#fff}',
      '#clip.live::after{content:"";display:inline-block;width:7px;height:7px;margin-left:7px;border-radius:50%;background:#ff4d5a;box-shadow:0 0 8px #ff4d5a;vertical-align:middle}',
      '.clip-ov{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:16px;background:rgba(5,4,14,.78);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}',
      '.clip-box{width:min(720px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--panel,#1b1835);border:1px solid #ffffff1f;border-radius:18px;padding:18px;box-shadow:0 30px 80px #000c;color:var(--text,#f1effa)}',
      '.clip-box h2{margin:0 0 4px;font-size:20px}',
      '.clip-box p{margin:0 0 12px;color:var(--muted,#a9a3c9);font-size:14px}',
      '.clip-box video{display:block;width:100%;aspect-ratio:16/9;background:#000;border-radius:12px}',
      '.clip-box label{display:block;margin:14px 0 6px;font-size:13px;font-weight:700;color:var(--muted,#a9a3c9)}',
      '.clip-box input{width:100%;padding:10px 14px;border-radius:10px;border:1px solid #ffffff22;background:#0f0d1f;color:inherit;font:inherit}',
      '.clip-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}',
      '.clip-acts .grow{flex:1}',
      '.clip-bar{height:6px;border-radius:9px;background:#ffffff14;overflow:hidden;margin-top:12px}',
      '.clip-bar i{display:block;height:100%;width:0;background:var(--accent-2,#00d2a8);transition:width .2s}',
      '.clip-msg{min-height:1.4em;margin:10px 0 0!important}',
      '.clip-msg.err{color:#ff8a8a!important}',
      '.clip-msg a{color:var(--accent-2,#00d2a8);font-weight:700;text-decoration:underline}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- sound: tap the game's AudioContext ---------- */
  // Every node connected to ctx.destination is really connected to a gain node that feeds both the speakers and a
  // MediaStream we can record. Done as early as we can reach the frame's window; contexts made before that are missed.
  function hookAudio(w) {
    try {
      if (!w || w.__arcadeClipAudio) return;
      ['AudioContext', 'webkitAudioContext'].forEach(function (k) {
        var Real = w[k];
        if (!Real) return;
        var Tapped = function (opt) {
          var ctx = opt === undefined ? new Real() : new Real(opt);
          try {
            var dest = ctx.destination, tap = ctx.createGain(), out = ctx.createMediaStreamDestination();
            tap.connect(dest); tap.connect(out);
            Object.defineProperty(tap, 'maxChannelCount', { get: function () { return dest.maxChannelCount; } });
            Object.defineProperty(ctx, 'destination', { get: function () { return tap; } });
            out.stream.__ctx = ctx; out.stream.__tap = tap; out.stream.__dest = dest; taps.push(out.stream); // the replay buffer reads the sound from here
          } catch (e) {}
          return ctx;
        };
        Tapped.prototype = Real.prototype;
        try { Object.setPrototypeOf(Tapped, Real); } catch (e) {}
        w[k] = Tapped;
      });
      w.__arcadeClipAudio = 1;
    } catch (e) {}
  }

  /* ---------- the picture: every visible game canvas drawn into one canvas ---------- */
  function visibleCanvases(w) {
    var d = w.document, vw = w.innerWidth, vh = w.innerHeight, list = [];
    var all = d.querySelectorAll('canvas');
    for (var i = 0; i < all.length; i++) {
      var c = all[i], r = c.getBoundingClientRect();
      if (!c.width || !c.height || r.width * r.height < vw * vh * 0.02 || r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
      var st = w.getComputedStyle(c);
      if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) continue;
      list.push({ c: c, r: r, z: parseInt(st.zIndex, 10) || 0, i: i });
    }
    list.sort(function (a, b) { return a.z - b.z || a.i - b.i; });
    return list;
  }
  // Each game canvas is captured by the browser (captureStream gets a WebGL canvas's real picture whatever the game's
  // settings) into a tiny hidden video; draw() paints those videos into `out`, letterboxed, at their places on screen.
  function makeComp(w, W, H) {
    var out = document.createElement('canvas'); out.width = W; out.height = H;
    var cp = { w: w, out: out, g: out.getContext('2d', { alpha: false }), srcs: new Map(), list: [], scan: 0 };
    cp.follow = function () {
      var keep = new Set();
      cp.list.forEach(function (it) {
        keep.add(it.c);
        if (cp.srcs.has(it.c)) return;
        try {
          var st = it.c.captureStream(FPS), v = document.createElement('video');
          v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.srcObject = st;
          v.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;opacity:0.01;pointer-events:none;z-index:-1';
          document.body.appendChild(v); v.play().catch(function () {});
          cp.srcs.set(it.c, { v: v, st: st });
        } catch (e) {}
      });
      cp.srcs.forEach(function (s, c) { if (!keep.has(c)) { drop(s); cp.srcs.delete(c); } });
    };
    cp.draw = function (now) { // false when there's nothing on screen to draw
      if (now - cp.scan > 700) { cp.scan = now; try { cp.list = visibleCanvases(w); cp.follow(); } catch (e) { cp.list = []; } }
      if (!cp.list.length) return false;
      var vw = w.innerWidth, vh = w.innerHeight, k = Math.min(W / vw, H / vh), ox = (W - vw * k) / 2, oy = (H - vh * k) / 2, g = cp.g, any = false;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      for (var i = 0; i < cp.list.length; i++) {
        var it = cp.list[i], s = cp.srcs.get(it.c);
        if (s && s.v.readyState >= 2) try { g.drawImage(s.v, ox + it.r.left * k, oy + it.r.top * k, it.r.width * k, it.r.height * k); any = true; } catch (e) {}
      }
      return any;
    };
    cp.close = function () { cp.srcs.forEach(drop); cp.srcs.clear(); };
    return cp;
  }
  function drop(s) { try { s.st.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} s.v.srcObject = null; s.v.remove(); }
  function poster(src) {
    var c = document.createElement('canvas'), k = Math.min(1, 360 / src.width);
    c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    var d = c.toDataURL('image/jpeg', 0.72);
    if (d.length > 55000) d = c.toDataURL('image/jpeg', 0.45);
    return d;
  }
  function gameWindow() { try { var w = frameEl.contentWindow; return w && w.document && w.location.href !== 'about:blank' ? w : null; } catch (e) { return null; } }
  function outSize() { return document.documentElement.classList.contains('mob') ? [960, 540] : [1280, 720]; }

  /* ---------- the replay buffer: the last REPLAY_S seconds, always ready ----------
     WebCodecs encodes the picture (VP8, a keyframe every second) and the sound (Opus) as you play; the encoded pieces
     sit in memory for REPLAY_S + a few seconds. Clip takes them from the keyframe nearest 30 s back and writes a WebM
     file (muxWebm) straight away: nothing is encoded twice and there's no wait. */
  var REPLAY_S = 30, KEEP_S = REPLAY_S + 6, rp = null;
  var canReplay = !!(window.VideoEncoder && window.VideoFrame && window.EncodedVideoChunk);
  function replayStart() {
    if (rp || !canReplay || document.hidden) return;
    var w = gameWindow(); if (!w) return;
    var sz = outSize(), cp = makeComp(w, sz[0], sz[1]);
    var r = rp = { cp: cp, chunks: [], posters: [], n: 0, w: sz[0], h: sz[1], last: 0, t0: performance.now(), err: false };
    var enc = r.enc = new VideoEncoder({
      output: function (ch) { var b = new Uint8Array(ch.byteLength); ch.copyTo(b); r.chunks.push({ a: 0, ts: ch.timestamp, key: ch.type === 'key', d: b }); trim(r); },
      error: function () { r.err = true; replayStop(); }
    });
    var cfg = { codec: 'vp8', width: r.w, height: r.h, bitrate: 1500000, framerate: FPS, latencyMode: 'realtime' };
    VideoEncoder.isConfigSupported(cfg).then(function (ok) {
      if (rp !== r) return;
      if (!ok.supported) { canReplay = false; replayStop(); return; }
      enc.configure(cfg);
      var tick = function () {
        if (rp !== r) return;
        r.raf = requestAnimationFrame(tick);
        var now = performance.now();
        if (!r.ac && now - (r.audioTry || 0) > 1000) { r.audioTry = now; startAudio(r); } // the game may start its sound later
        if (now - r.last < 1000 / FPS - 3 || enc.encodeQueueSize > 4) return;
        if (!cp.draw(now)) return;
        r.last = now;
        var f = new VideoFrame(cp.out, { timestamp: Math.round(now * 1000) });
        var key = now - (r.lastKey || 0) >= 1000; if (key) r.lastKey = now;
        enc.encode(f, { keyFrame: key });
        f.close();
        if (now - (r.lastPoster || 0) > 3000) { r.lastPoster = now; try { r.posters.push({ ts: now * 1000, p: poster(cp.out) }); if (r.posters.length > 14) r.posters.shift(); } catch (e) {} }
      };
      r.raf = requestAnimationFrame(tick);
    }, function () { canReplay = false; replayStop(); });
    paintBtn();
  }
  // sound: an AudioWorklet inside the game's own AudioContext, fed from the tap (see hookAudio), hands over the raw
  // samples; they're resampled to 48 kHz and become AudioData for the Opus encoder (times counted from the samples)
  var WORKLET = 'registerProcessor("clip-tap",class extends AudioWorkletProcessor{process(i){var c=i[0];if(c&&c.length){this.port.postMessage(c.map(function(x){return x.slice(0)}));}return true}})';
  function startAudio(r) {
    var tap = taps.filter(function (t) { return t.__ctx && t.__ctx.state !== 'closed'; }).pop();
    var w = r.cp.w;
    if (!tap || !window.AudioEncoder || !window.AudioData || !w.AudioWorkletNode) return;
    try {
      var ctx = tap.__ctx, rate = ctx.sampleRate, step = rate / 48000;
      r.ac = ctx; // (the game's own context: never closed by us)
      var url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      r.aenc = new AudioEncoder({
        output: function (ch) { var b = new Uint8Array(ch.byteLength); ch.copyTo(b); r.chunks.push({ a: 1, ts: ch.timestamp, d: b }); },
        error: function () { r.aenc = null; }
      });
      r.ach = 2;
      r.aenc.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 96000 });
      ctx.audioWorklet.addModule(url).then(function () {
        URL.revokeObjectURL(url);
        if (rp !== r) return;
        // it has to reach the speakers or the browser stops running it; it outputs silence
        var node = r.anode = new w.AudioWorkletNode(ctx, 'clip-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
        tap.__tap.connect(node); node.connect(tap.__dest);
        // resample the game's rate (often 44.1 kHz) to Opus's 48 kHz, linear, carrying the leftover between blocks
        var L = new Float32Array(0), R = L, pos = 0, frames = 0, t0 = 0;
        var join = function (a, b) { var o = new Float32Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
        node.port.onmessage = function (e) {
          if (rp !== r || !r.aenc || r.aenc.state !== 'configured') return;
          L = join(L, e.data[0]); R = join(R, e.data[1] || e.data[0]);
          if (L.length < 960 * step + 2) return; // hand over 20 ms at a time (Opus's frame), not each 3 ms block
          if (r.aenc.encodeQueueSize > 40) { L = L.slice(-2); R = R.slice(-2); pos = 0; return; } // a slow computer: drop rather than pile up
          var n = Math.floor((L.length - 1 - pos) / step) + 1; if (n <= 0) return;
          var data = new Float32Array(n * 2);
          for (var k = 0; k < n; k++) { var x = pos + k * step, i = Math.floor(x), f = x - i; data[k] = L[i] * (1 - f) + L[i + 1] * f; data[n + k] = R[i] * (1 - f) + R[i + 1] * f; }
          pos += n * step; var drop = Math.floor(pos); L = L.slice(drop); R = R.slice(drop); pos -= drop;
          if (!t0) t0 = Math.round(performance.now() * 1000) - Math.round(n / 48000 * 1e6);
          var ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: t0 + Math.round(frames / 48000 * 1e6), data: data });
          frames += n;
          r.aenc.encode(ad); ad.close();
        };
      }, function () {});
    } catch (e) {}
  }
  function trim(r) {
    // keep KEEP_S seconds, always starting at a keyframe
    var lim = r.chunks.length ? r.chunks[r.chunks.length - 1].ts - KEEP_S * 1e6 : 0, cut = 0;
    for (var i = 0; i < r.chunks.length; i++) { var c = r.chunks[i]; if (c.ts > lim) break; if (!c.a && c.key) cut = i; }
    if (cut > 0) r.chunks.splice(0, cut);
  }
  function replayStop() {
    var r = rp; if (!r) return;
    rp = null;
    cancelAnimationFrame(r.raf);
    try { if (r.enc.state !== 'closed') r.enc.close(); } catch (e) {}
    try { if (r.aenc && r.aenc.state !== 'closed') r.aenc.close(); } catch (e) {}
    try { r.anode && r.anode.disconnect(); } catch (e) {}
    r.cp.close();
    paintBtn();
  }
  function replaySave() {
    var r = rp;
    if (!r) { replayStart(); say('Clipping is starting up. Play for a few seconds, then press Clip again.'); return; }
    var vids = r.chunks.filter(function (c) { return !c.a; });
    if (vids.length < 4 || vids[vids.length - 1].ts - vids[0].ts < 2e6) { say('Play for a few more seconds first, then press Clip again.'); return; }
    var end = vids[vids.length - 1].ts, from = 0;
    for (var i = 0; i < vids.length; i++) if (vids[i].key && vids[i].ts <= end - REPLAY_S * 1e6) from = i;
    if (!vids[from].key) for (; from < vids.length && !vids[from].key; from++);
    var t0 = vids[from].ts, v = vids.slice(from), a = r.chunks.filter(function (c) { return c.a && c.ts >= t0 && c.ts <= end; });
    var blob = muxWebm(v, a, r.w, r.h, r.ach || 2, t0);
    var mid = (t0 + end) / 2, best = null;
    r.posters.forEach(function (p) { if (p.ts >= t0 && (!best || Math.abs(p.ts - mid) < Math.abs(best.ts - mid))) best = p; });
    last = { blob: blob, dur: (end - t0) / 1e6 + 1 / FPS, w: r.w, h: r.h, poster: best ? best.p : poster(r.cp.out), audio: a.length > 0 };
    flash();
    review(last);
  }
  function flash() { var s = document.getElementById('stage'); if (!s) return; var f = el('div'); f.style.cssText = 'position:absolute;inset:0;z-index:31;background:#fff;opacity:.5;pointer-events:none;transition:opacity .35s'; s.appendChild(f); requestAnimationFrame(function () { f.style.opacity = 0; }); setTimeout(function () { f.remove(); }, 400); }

  /* ---------- a minimal WebM writer (EBML): one VP8 track, one Opus track, a cluster per keyframe ---------- */
  function muxWebm(vid, aud, W, H, ch, t0) {
    var enc = new TextEncoder();
    var num = function (n, len) { var b = []; len = len || (n < 256 ? 1 : n < 65536 ? 2 : n < 16777216 ? 3 : 4); for (var i = len - 1; i >= 0; i--) b.push(Math.floor(n / Math.pow(256, i)) & 255); return new Uint8Array(b); };
    var f64 = function (x) { var b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, x); return b; };
    var cat = function (parts) { var n = 0; parts.forEach(function (p) { n += p.length; }); var o = new Uint8Array(n), k = 0; parts.forEach(function (p) { o.set(p, k); k += p.length; }); return o; };
    // shortest size field that fits: Safari refuses WebM files whose sizes are all written in 8 bytes
    var size = function (n) { var l = 1; while (n >= Math.pow(2, 7 * l) - 1) l++; var b = new Uint8Array(l); for (var i = l - 1; i >= 0; i--) { b[i] = n % 256; n = Math.floor(n / 256); } b[0] |= 0x80 >> (l - 1); return b; };
    var E = function (id, body) { if (!(body instanceof Uint8Array)) body = cat(body); return cat([num(id), size(body.length), body]); };
    var U = function (id, n) { return E(id, num(n)); }, S = function (id, s) { return E(id, enc.encode(s)); };
    var ms = function (ts) { return Math.round((ts - t0) / 1000); };
    var lastTs = Math.max(vid[vid.length - 1].ts, aud.length ? aud[aud.length - 1].ts : 0);
    var opusHead = cat([enc.encode('OpusHead'), new Uint8Array([1, ch, 0x38, 0x01]), new Uint8Array([0x80, 0xbb, 0, 0]), new Uint8Array([0, 0, 0])]); // pre-skip 312, 48 kHz
    var tracks = [E(0xAE, [U(0xD7, 1), U(0x73C5, 1), U(0x83, 1), S(0x86, 'V_VP8'), E(0xE0, [U(0xB0, W), U(0xBA, H)])])];
    if (aud.length) tracks.push(E(0xAE, [U(0xD7, 2), U(0x73C5, 2), U(0x83, 2), S(0x86, 'A_OPUS'), E(0x63A2, opusHead), U(0x56AA, 6500000), U(0x56BB, 80000000), E(0xE1, [E(0xB5, f64(48000)), U(0x9F, ch)])]));
    // all blocks in time order; a new cluster at each video keyframe (and before block times would pass 32 s)
    var all = vid.map(function (c) { return { t: 1, c: c }; }).concat(aud.map(function (c) { return { t: 2, c: c }; })).sort(function (x, y) { return x.c.ts - y.c.ts || x.t - y.t; });
    var clusters = [], cur = null, ct = 0;
    var flush = function () { if (cur) clusters.push(E(0x1F43B675, [U(0xE7, ct)].concat(cur))); cur = null; };
    all.forEach(function (b) {
      var t = Math.max(0, ms(b.c.ts));
      if (!cur || (b.t === 1 && b.c.key) || t - ct > 30000) { flush(); cur = []; ct = t; }
      var rel = t - ct, hd = new Uint8Array([0x80 | b.t, (rel >> 8) & 255, rel & 255, b.t === 1 ? (b.c.key ? 0x80 : 0) : 0x80]);
      cur.push(E(0xA3, cat([hd, b.c.d])));
    });
    flush();
    var info = E(0x1549A966, [U(0x2AD7B1, 1000000), S(0x4D80, 'The Arcade'), S(0x5741, 'The Arcade'), E(0x4489, f64(ms(lastTs) + 1000 / FPS))]);
    var head = E(0x1A45DFA3, [U(0x4286, 1), U(0x42F7, 1), U(0x42F2, 4), U(0x42F3, 8), S(0x4282, 'webm'), U(0x4287, 4), U(0x4285, 2)]);
    var seg = E(0x18538067, [info, E(0x1654AE6B, tracks)].concat(clusters));
    return new Blob([head, seg], { type: 'video/webm' });
  }

  /* ---------- start/stop recording (browsers without WebCodecs) ---------- */
  function pickType() {
    var types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
    for (var i = 0; i < types.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) return types[i];
    return '';
  }
  function start() {
    if (rec) return;
    var w = gameWindow();
    if (!w) { say('This game can’t be clipped.'); return; }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { say('This browser can’t record clips. Try Chrome, Edge or Firefox.'); return; }
    if (!visibleCanvases(w).length) { say('Start playing first: there’s nothing on screen to record yet.'); return; }
    var sz = outSize(), cp = makeComp(w, sz[0], sz[1]), type = pickType();
    var stream = cp.out.captureStream(FPS);
    var audio = taps.filter(function (t) { var a = t.getAudioTracks()[0]; return a && a.readyState === 'live'; }).pop(); // the newest live one
    if (audio) stream.addTrack(audio.getAudioTracks()[0]);
    var mr;
    try { mr = new MediaRecorder(stream, { mimeType: type || undefined, videoBitsPerSecond: 1300000, audioBitsPerSecond: 96000 }); }
    catch (e) { try { mr = new MediaRecorder(stream); } catch (e2) { say('This browser can’t record clips.'); cp.close(); return; } }
    var r = rec = { mr: mr, cp: cp, chunks: [], t0: performance.now(), posters: [], audio: !!audio, type: mr.mimeType || type || 'video/webm', last: 0 };
    var draw = function () {
      if (rec !== r) return;
      r.raf = requestAnimationFrame(draw);
      var now = performance.now();
      if (now - r.last < 1000 / FPS - 3) return;
      r.last = now; cp.draw(now);
      if (now - (r.lastPoster || 0) > 2000 && now - r.t0 > 400) { r.lastPoster = now; try { r.posters.push(poster(cp.out)); } catch (e) {} }
    };
    r.raf = requestAnimationFrame(draw);
    mr.ondataavailable = function (e) { if (e.data && e.data.size) r.chunks.push(e.data); };
    mr.onstop = function () { finish(r); };
    mr.start(1000);
    var pill = r.pill = el('div', 'clip-rec');
    pill.title = 'Stop recording (F8)';
    pill.innerHTML = '<i></i><span>REC 0:00</span><small>/ ' + fmt(MAX_S) + ' · F8 to stop</small>';
    pill.onclick = stop;
    document.getElementById('stage').appendChild(pill);
    r.timer = setInterval(function () {
      var sec = (performance.now() - r.t0) / 1000;
      pill.querySelector('span').textContent = 'REC ' + fmt(sec);
      if (sec >= MAX_S) stop();
    }, 250);
    btn.classList.add('on'); btn.textContent = '■ Stop'; btn.title = 'Stop recording (F8)';
    try { frameEl.contentWindow.focus(); } catch (e) {}
  }
  function stop() {
    var r = rec;
    if (!r) return;
    rec = null;
    clearInterval(r.timer);
    cancelAnimationFrame(r.raf);
    r.dur = (performance.now() - r.t0) / 1000;
    if (r.pill) r.pill.remove();
    paintBtn();
    try { r.mr.stop(); } catch (e) { finish(r); }
  }
  function finish(r) {
    var blob = new Blob(r.chunks, { type: r.type.split(';')[0] });
    if (r.dur < 1 || !blob.size) { r.cp.close(); say('That clip was too short.'); return; }
    last = { blob: blob, dur: Math.min(r.dur, MAX_S + 1), w: r.cp.out.width, h: r.cp.out.height, poster: r.posters[Math.floor(r.posters.length / 2)] || '', audio: r.audio };
    if (!last.poster) try { last.poster = poster(r.cp.out); } catch (e) {}
    r.cp.close();
    review(last);
  }
  function paintBtn() {
    if (!btn || rec) return;
    btn.classList.remove('on');
    btn.textContent = canReplay ? '🎬 Clip last 30s' : '🎬 Clip';
    btn.title = canReplay ? 'Save the last 30 seconds of your game (F8)' : 'Record a clip of your game (F8)';
    btn.classList.toggle('live', !!rp);
  }
  function clip() { if (canReplay) replaySave(); else if (rec) stop(); else start(); }

  /* ---------- review and post ---------- */
  function review(c) {
    css();
    var ov = el('div', 'clip-ov'), box = el('div', 'clip-box');
    var url = URL.createObjectURL(c.blob);
    box.innerHTML = '<h2>Your clip</h2><p></p><video controls loop playsinline></video>' +
      '<label for="clipTitle">Caption</label><input id="clipTitle" maxlength="80" placeholder="What happened? (optional)" autocomplete="off">' +
      '<div class="clip-bar" hidden><i></i></div><p class="clip-msg" role="status"></p>' +
      '<div class="clip-acts"><button class="btn post">Post to Social</button><a class="btn ghost save">Save to device</a><span class="grow"></span><button class="btn ghost bin">Discard</button></div>';
    box.querySelector('p').textContent = game.title + ' · ' + fmt(c.dur) + ' · ' + (c.blob.size / 1048576).toFixed(1) + ' MB' + (c.audio ? '' : ' · no game sound');
    var v = box.querySelector('video'); v.src = url; v.muted = false; v.play().catch(function () {});
    var save = box.querySelector('.save'); save.href = url; save.download = game.id + '-clip.' + (c.blob.type.indexOf('mp4') >= 0 ? 'mp4' : 'webm');
    var msg = box.querySelector('.clip-msg'), bar = box.querySelector('.clip-bar'), post = box.querySelector('.post');
    var close = function () { v.pause(); URL.revokeObjectURL(url); ov.remove(); document.removeEventListener('keydown', esc); try { frameEl.contentWindow.focus(); } catch (e) {} };
    var esc = function (e) { if (e.key === 'Escape' && !post.disabled) close(); };
    document.addEventListener('keydown', esc);
    box.querySelector('.bin').onclick = function () { if (c.posted || confirm('Throw this clip away?')) close(); };
    if (c.blob.size > MAX_BYTES) { post.disabled = true; msg.className = 'clip-msg err'; msg.textContent = 'This clip is too big to post (over 12 MB). You can still save it, or record a shorter one.'; }
    post.onclick = function () {
      if (!window.ArcadeAccount || ArcadeAccount.kind() !== 'online') {
        msg.className = 'clip-msg err'; msg.textContent = 'Posting needs an online Arcade account.';
        if (window.ArcadeAccount) ArcadeAccount.welcome();
        return;
      }
      post.disabled = true; msg.className = 'clip-msg'; msg.textContent = 'Posting…'; bar.hidden = false;
      upload(c, box.querySelector('#clipTitle').value, function (p) { bar.firstChild.style.width = Math.round(p * 100) + '%'; })
        .then(function (res) {
          var id = res.id; c.posted = true;
          // 2026-11-11: a clip that didn't come from this recorder (an older browser's recording) waits for approval
          if (res.pend) { msg.textContent = 'Sent for approval. It goes up on Social once it\u2019s checked.'; post.textContent = 'Sent ✓'; box.querySelector('.bin').textContent = 'Close'; return; }
          msg.innerHTML = 'Posted! <a target="_top"></a>';
          var a = msg.querySelector('a'); a.textContent = 'See it on Social →'; a.href = 'social.html' + (ROOM ? '?clipsroom=' + ROOM : '') + '#c=' + id;
          post.textContent = 'Posted ✓';
          box.querySelector('.bin').textContent = 'Close';
        }, function (err) { post.disabled = false; bar.hidden = true; msg.className = 'clip-msg err'; msg.textContent = err; });
    };
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov && !post.disabled && (c.posted || confirm('Throw this clip away?'))) close(); });
    document.body.appendChild(ov);
    box.querySelector('#clipTitle').focus();
  }

  var WHY = { slow: 'You’ve posted a lot of clips today. Try again tomorrow.', too_many: 'You have 60 clips, the most an account can keep. Delete some on your Social profile first.', auth: 'You’re signed out. Sign in again and retry.', too_big: 'This clip is too big to post.', not_video: 'That file isn’t a video the server accepts.', expired: 'The upload took too long. Try again.' };
  function upload(c, title, progress) {
    var tok = ArcadeAccount.token();
    return fetch(api() + 'new' + q(), {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok },
      body: JSON.stringify({ kind: 'clip', g: game.id, t: String(title || '').slice(0, 80), dur: Math.round(c.dur * 10) / 10, w: c.w, h: c.h, sz: c.blob.size, poster: c.poster })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw WHY[j.error] || 'Couldn’t post it (' + (j.error || r.status) + ').'; return j; }); },
      function (e) { throw typeof e === 'string' ? e : 'Couldn’t reach the server. Check your connection.'; })
      .then(function (n) {
        return new Promise(function (ok, no) {
          var x = new XMLHttpRequest();
          x.open('PUT', api() + 'v/' + n.id + q({ k: n.k }));
          x.setRequestHeader('content-type', c.blob.type || 'video/webm');
          x.upload.onprogress = function (e) { if (e.lengthComputable) progress(e.loaded / e.total); };
          x.onload = function () { var j = {}; try { j = JSON.parse(x.responseText); } catch (e) {} if (x.status === 200) ok({ id: n.id, pend: j.pend ? 1 : 0 }); else no(WHY[j.error] || 'Couldn’t post it (' + (j.error || x.status) + ').'); };
          x.onerror = function () { no('The upload failed. Check your connection and try again.'); };
          x.send(c.blob);
        });
      });
  }

  /* ---------- set-up (called by play.html) ---------- */
  function onKey(e) { if (e.key === 'F8' && !e.repeat) { e.preventDefault(); clip(); } }
  function attach(frame, g, button) {
    frameEl = frame; game = g; btn = button; css();
    btn.onclick = clip; paintBtn();
    document.addEventListener('keydown', onKey);
    // reach the game's window as soon as its document exists, for the sound hook and F8
    var poll = setInterval(function () {
      var w; try { w = frame.contentWindow; if (!w || !w.document || w.location.href === 'about:blank') return; } catch (e) { clearInterval(poll); return; }
      hookAudio(w);
      // the replay buffer runs while the game is on screen and the tab is visible
      if (canReplay && !rp && !w.__arcadeClipRp && w.document.readyState === 'complete') { w.__arcadeClipRp = 1; setTimeout(replayStart, 1500); }
      if (rp && rp.cp.w !== w) replayStop(); // the game reloaded: start again on its new window
      if (!w.__arcadeClipKey) { w.__arcadeClipKey = 1; try { w.addEventListener('keydown', onKey, true); } catch (e) {} }
    }, 20); // keeps going: a game reloaded in place (new saves from the cloud) gets a new window to hook
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) replayStop(); else if (canReplay && gameWindow()) setTimeout(replayStart, 500); });
  window.ArcadeClips = { attach: attach, start: start, stop: stop, clip: clip, recording: function () { return !!rec; }, replay: function () { return rp ? { secs: rp.chunks.length ? (rp.chunks[rp.chunks.length - 1].ts - rp.chunks[0].ts) / 1e6 : 0, audio: !!rp.aenc } : null; }, _mux: muxWebm };
})();
