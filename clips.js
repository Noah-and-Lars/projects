/* clips.js (2026-11-10): the 🎬 Clip button on play.html. Records the game you're playing and posts it to Social
   (social.html). Loaded by play.html after account.js; window.ArcadeClips is the interface.

   How it records: the game runs in a same-origin iframe, so this page can reach its canvases. Every visible canvas is
   captured with captureStream() (which gets a WebGL canvas's real picture) into a tiny hidden video; each frame those
   are drawn into one canvas of at most 1280x720 at their places on screen, and that canvas is recorded with
   MediaRecorder (WebM, or MP4 on Safari). HTML overlays (menus made of page elements) aren't in the clip.
   Sound: when the game makes its AudioContext after this page has hooked the frame (most games wait for a click),
   its output also goes to a MediaStream that is recorded with the picture. Games that made theirs earlier are silent.
   F8 (in the game or on the page) starts and stops a clip; a clip stops by itself at MAX_S seconds.
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
            taps.push(out.stream);
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

  /* ---------- recording ---------- */
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
  function pickType() {
    var types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
    for (var i = 0; i < types.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) return types[i];
    return '';
  }

  function start() {
    if (rec) return;
    var w;
    try { w = frameEl.contentWindow; if (!w || !w.document) throw 0; } catch (e) { say('This game can’t be clipped.'); return; }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { say('This browser can’t record clips. Try Chrome, Edge or Firefox.'); return; }
    if (!visibleCanvases(w).length) { say('Start playing first: there’s nothing on screen to record yet.'); return; }
    var type = pickType();
    var vw = w.innerWidth, vh = w.innerHeight, s = Math.min(1, OUT_W / vw, OUT_H / vh);
    var out = document.createElement('canvas');
    out.width = Math.max(2, Math.round(vw * s / 2) * 2); out.height = Math.max(2, Math.round(vh * s / 2) * 2);
    var g = out.getContext('2d', { alpha: false });
    var stream = out.captureStream(FPS);
    var audio = taps.filter(function (t) { var a = t.getAudioTracks()[0]; return a && a.readyState === 'live'; }).pop(); // the newest live one
    if (audio) stream.addTrack(audio.getAudioTracks()[0]);
    var mr;
    try { mr = new MediaRecorder(stream, { mimeType: type || undefined, videoBitsPerSecond: 1300000, audioBitsPerSecond: 96000 }); }
    catch (e) { try { mr = new MediaRecorder(stream); } catch (e2) { say('This browser can’t record clips.'); return; } }
    var r = rec = { mr: mr, chunks: [], t0: performance.now(), out: out, g: g, w: w, list: visibleCanvases(w), scan: 0, lastDraw: 0, posters: [], audio: !!audio, type: mr.mimeType || type || 'video/webm', srcs: new Map() };

    // Each game canvas is captured by the browser (captureStream gets a WebGL canvas's real picture whatever the game's
    // settings) into a tiny hidden video, and those videos are drawn into `out` at the canvas's place on screen.
    var follow = function () {
      var keep = new Set();
      r.list.forEach(function (it) {
        keep.add(it.c);
        if (r.srcs.has(it.c)) return;
        try {
          var st = it.c.captureStream(FPS), v = document.createElement('video');
          v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.srcObject = st;
          v.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;opacity:0.01;pointer-events:none;z-index:-1';
          document.body.appendChild(v); v.play().catch(function () {});
          r.srcs.set(it.c, { v: v, st: st });
        } catch (e) {}
      });
      r.srcs.forEach(function (s, c) { if (!keep.has(c)) { drop(s); r.srcs.delete(c); } });
    };
    follow();
    var draw = function () {
      if (rec !== r) return;
      r.raf = requestAnimationFrame(draw);
      var now = performance.now();
      if (now - r.lastDraw < 1000 / FPS - 3) return;
      r.lastDraw = now;
      if (now - r.scan > 700) { r.scan = now; try { r.list = visibleCanvases(w); follow(); } catch (e) {} } // canvases come and go (menus, maps)
      var sx = out.width / w.innerWidth, sy = out.height / w.innerHeight;
      g.fillStyle = '#000'; g.fillRect(0, 0, out.width, out.height);
      for (var i = 0; i < r.list.length; i++) {
        var it = r.list[i], s = r.srcs.get(it.c);
        if (s && s.v.readyState >= 2) try { g.drawImage(s.v, it.r.left * sx, it.r.top * sy, it.r.width * sx, it.r.height * sy); } catch (e) {}
      }
      // a poster candidate every 2 seconds; the middle one is used
      if (now - (r.lastPoster || 0) > 2000 && now - r.t0 > 400) { r.lastPoster = now; try { r.posters.push(poster(out)); } catch (e) {} }
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

  function drop(s) { try { s.st.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} s.v.srcObject = null; s.v.remove(); }
  function poster(src) {
    var c = document.createElement('canvas'), k = Math.min(1, 360 / src.width);
    c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    var d = c.toDataURL('image/jpeg', 0.72);
    if (d.length > 55000) d = c.toDataURL('image/jpeg', 0.45);
    return d;
  }

  function stop() {
    var r = rec;
    if (!r) return;
    rec = null;
    clearInterval(r.timer);
    cancelAnimationFrame(r.raf);
    r.dur = (performance.now() - r.t0) / 1000;
    if (r.pill) r.pill.remove();
    btn.classList.remove('on'); btn.textContent = '🎬 Clip'; btn.title = 'Record a clip of your game (F8)';
    try { r.mr.stop(); } catch (e) { finish(r); }
  }

  function finish(r) {
    r.srcs.forEach(drop); r.srcs.clear();
    var blob = new Blob(r.chunks, { type: r.type.split(';')[0] });
    if (r.dur < 1 || !blob.size) { say('That clip was too short.'); return; }
    last = { blob: blob, dur: Math.min(r.dur, MAX_S + 1), w: r.out.width, h: r.out.height, poster: r.posters[Math.floor(r.posters.length / 2)] || '', audio: r.audio };
    if (!last.poster) try { last.poster = poster(r.out); } catch (e) {}
    review(last);
  }

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
        .then(function (id) {
          c.posted = true;
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
      body: JSON.stringify({ g: game.id, t: String(title || '').slice(0, 80), dur: Math.round(c.dur * 10) / 10, w: c.w, h: c.h, sz: c.blob.size, poster: c.poster })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw WHY[j.error] || 'Couldn’t post it (' + (j.error || r.status) + ').'; return j; }); },
      function (e) { throw typeof e === 'string' ? e : 'Couldn’t reach the server. Check your connection.'; })
      .then(function (n) {
        return new Promise(function (ok, no) {
          var x = new XMLHttpRequest();
          x.open('PUT', api() + 'v/' + n.id + q({ k: n.k }));
          x.setRequestHeader('content-type', c.blob.type || 'video/webm');
          x.upload.onprogress = function (e) { if (e.lengthComputable) progress(e.loaded / e.total); };
          x.onload = function () { var j = {}; try { j = JSON.parse(x.responseText); } catch (e) {} if (x.status === 200) ok(n.id); else no(WHY[j.error] || 'Couldn’t post it (' + (j.error || x.status) + ').'); };
          x.onerror = function () { no('The upload failed. Check your connection and try again.'); };
          x.send(c.blob);
        });
      });
  }

  /* ---------- set-up (called by play.html) ---------- */
  function onKey(e) { if (e.key === 'F8' && !e.repeat) { e.preventDefault(); if (rec) stop(); else start(); } }
  function attach(frame, g, button) {
    frameEl = frame; game = g; btn = button;
    btn.onclick = function () { if (rec) stop(); else start(); };
    document.addEventListener('keydown', onKey);
    // reach the game's window as soon as its document exists, for the sound hook and F8
    var poll = setInterval(function () {
      var w; try { w = frame.contentWindow; if (!w || !w.document || w.location.href === 'about:blank') return; } catch (e) { clearInterval(poll); return; }
      hookAudio(w);
      if (!w.__arcadeClipKey) { w.__arcadeClipKey = 1; try { w.addEventListener('keydown', onKey, true); } catch (e) {} }
    }, 20); // keeps going: a game reloaded in place (new saves from the cloud) gets a new window to hook
  }
  window.ArcadeClips = { attach: attach, start: start, stop: stop, recording: function () { return !!rec; } };
})();
