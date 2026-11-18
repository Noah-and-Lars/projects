/* voice.js (2026-11-15): voice notes. Record with the mic, then send them in chats (DMs, group chats, the Global chat)
   or post them on Social. Not moderated (like game clips).
   - ArcadeVoice.record({ max, title, action }) -> Promise<{ blob, dur, type } | null>  (a recorder pop-up: record, stop, listen, send)
   - ArcadeVoice.upload(rec) -> Promise<id>   (POST /clips/vnote { dur, sz } -> { id, k }, then PUT /clips/v/<id>?k=)
   - ArcadeVoice.button(input, form) -> a 🎤 button: records, uploads, puts the voice note's token in the box and sends the form
   - A chat message is a token: "🎤 Voice note [vn:<id>:<seconds>]". ArcadeVoice.parse(text), .label(text) (for previews),
     .player(id, dur) (a play button + bars + time). Old pages just show the token text.
   Needs account.js (server address + sign-in token). */
(function () {
  if (window.ArcadeVoice) return;
  var RE = /\[vn:([a-z0-9]{10}):(\d{1,3})\]/;
  function srv() { return window.ArcadeAccount && ArcadeAccount.server ? ArcadeAccount.server + '/clips/' : ''; }
  function room(first) { var m = /[?&]clipsroom=([a-z0-9-]+)/i.exec(location.search); return m ? (first ? '?' : '&') + 'r=' + m[1].toLowerCase() : ''; }
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); }
  function css() {
    if (document.getElementById('arcade-vn-css')) return;
    var s = document.createElement('style'); s.id = 'arcade-vn-css';
    s.textContent =
      '.vn{display:inline-flex;align-items:center;gap:9px;min-width:180px;max-width:260px;padding:2px 0;vertical-align:middle}' +
      '.vn button{flex:none;width:34px;height:34px;border-radius:50%;border:0;background:#ffffff22;color:inherit;font-size:14px;cursor:pointer;display:grid;place-items:center}' +
      '.vn button:hover{background:#ffffff33}.vn .bars{flex:1;display:flex;align-items:center;gap:2px;height:26px;cursor:pointer}' +
      '.vn .bars i{flex:1;min-width:2px;border-radius:2px;background:currentColor;opacity:.35}.vn .bars i.on{opacity:1}' +
      '.vn small{flex:none;font-size:12px;opacity:.8;font-variant-numeric:tabular-nums;min-width:30px;text-align:right}' +
      '.vn-mic{flex:none;border:0;border-radius:10px;background:#ffffff14;color:inherit;font-size:18px;padding:0 11px;cursor:pointer;min-height:38px}' +
      '.vn-mic:hover{background:#ffffff24}.vn-mic:disabled{opacity:.5;cursor:default}' +
      '#vnRec{position:fixed;inset:0;z-index:2147483000;background:#0009;display:grid;place-items:center;padding:16px;font:15px/1.4 system-ui,-apple-system,sans-serif;color:#fff}' +
      '#vnRec .box{width:min(360px,100%);background:#17172a;border:1px solid #ffffff22;border-radius:18px;padding:20px;text-align:center;box-shadow:0 20px 60px #000a}' +
      '#vnRec h3{margin:0 0 4px;font-size:18px}#vnRec p{margin:0 0 14px;color:#fffa;font-size:13px}' +
      '#vnRec .t{font-size:34px;font-weight:800;font-variant-numeric:tabular-nums;margin:6px 0}' +
      '#vnRec canvas{width:100%;height:60px;display:block;margin:6px 0 14px}' +
      '#vnRec .dot{display:inline-block;width:11px;height:11px;border-radius:50%;background:#ff4d5e;margin-right:6px;animation:vnb 1s infinite}' +
      '@keyframes vnb{50%{opacity:.25}}#vnRec .row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}' +
      '#vnRec .row button{border:0;border-radius:12px;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer;background:#ffffff1c;color:#fff}' +
      '#vnRec .row button.go{background:linear-gradient(135deg,#6c5ce7,#00d2a8)}#vnRec .row button.stop{background:#ff4d5e}' +
      '.vn-q{display:flex;flex-direction:column;gap:1px;margin:0 0 5px;padding:4px 8px;border-left:3px solid #00d2a8;border-radius:6px;background:#0000002a;font-size:12px;max-width:100%;overflow:hidden}.vn-q b{font-size:11px;color:#00d2a8}.vn-q span{opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.vn-rbar{display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid #ffffff12;background:#00d2a812;font-size:13px}.vn-rbar span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.9}.vn-rbar b{color:#00d2a8;margin-right:4px}.vn-rbar button{border:0;background:none;color:inherit;cursor:pointer;font-size:15px}' +
      '.vn-rbar[hidden],.vn-mic[hidden],#vnRec canvas[hidden]{display:none!important}' +
      '.vn-rb{border:0;background:#ffffff14;color:inherit;border-radius:8px;cursor:pointer;font-size:12px;padding:2px 7px;margin-left:4px;opacity:.7}.vn-rb:hover{opacity:1}' +
      '.vn-seen{align-self:flex-end;text-align:right;font-size:11px;opacity:.65;margin:2px 4px 4px;clear:both}' +
      '#vnRec .err{color:#ff8a95}#vnRec .vn{margin:4px auto 14px;display:flex;max-width:100%}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- recording ---------- */
  function record(o) {
    o = o || {}; css();
    var max = o.max || 60;
    return new Promise(function (done) {
      var ov = el('div'), box = el('div', 'box'), h = el('h3', '', o.title || 'Voice note'), p = el('p', '', 'Up to ' + fmt(max) + '. Your browser asks to use the microphone.');
      var tm = el('div', 't', '0:00'), cv = el('canvas'), row = el('div', 'row'), stream = null, mr = null, chunks = [], t0 = 0, tick = 0, ac = null, an = null, res = null, closed = false;
      ov.id = 'vnRec'; cv.width = 640; cv.height = 120;
      box.append(h, p, tm, cv, row); ov.append(box); document.body.appendChild(ov);
      function btn(t, cls, fn) { var b = el('button', cls || '', t); b.type = 'button'; b.onclick = fn; row.append(b); return b; }
      function cleanup() { clearInterval(tick); cancelAnimationFrame(draw.r); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; if (ac) { try { ac.close(); } catch (e) {} ac = null; } }
      function close(v) { if (closed) return; closed = true; cleanup(); try { if (mr && mr.state !== 'inactive') mr.stop(); } catch (e) {} ov.remove(); document.removeEventListener('keydown', key); done(v); }
      function key(e) { if (e.key === 'Escape') close(null); }
      document.addEventListener('keydown', key);
      ov.addEventListener('click', function (e) { if (e.target === ov) close(null); });
      function draw() {
        var g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
        if (an) {
          var d = new Uint8Array(an.frequencyBinCount); an.getByteTimeDomainData(d);
          var n = 48, w = cv.width / n;
          for (var i = 0; i < n; i++) {
            var m = 0; for (var j = 0; j < 8; j++) m = Math.max(m, Math.abs(d[(i * 8 + j) % d.length] - 128));
            var bh = Math.max(6, m / 128 * cv.height * 1.6); g.fillStyle = '#00d2a8'; g.fillRect(i * w + 2, (cv.height - bh) / 2, w - 4, Math.min(cv.height, bh));
          }
        }
        draw.r = requestAnimationFrame(draw);
      }
      function start() {
        row.replaceChildren(); p.textContent = 'Starting the microphone…';
        if (!supported()) { p.className = 'err'; p.textContent = 'This browser can’t record audio.'; btn('Close', '', function () { close(null); }); return; }
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (s) {
          if (closed) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
          stream = s;
          try { ac = new (window.AudioContext || window.webkitAudioContext)(); an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(s).connect(an); } catch (e) { an = null; }
          var types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'], type = types.filter(function (t) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); })[0] || '';
          mr = new MediaRecorder(s, type ? { mimeType: type, audioBitsPerSecond: 48000 } : { audioBitsPerSecond: 48000 }); chunks = [];
          mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          mr.onstop = function () {
            var dur = (Date.now() - t0) / 1000; cleanup();
            if (closed) return;
            res = { blob: new Blob(chunks, { type: (mr.mimeType || type || 'audio/webm').split(';')[0] }), dur: Math.min(max, dur) };
            review();
          };
          mr.start(250); t0 = Date.now(); draw();
          h.innerHTML = ''; h.append(el('span', 'dot'), document.createTextNode('Recording'));
          p.textContent = 'Up to ' + fmt(max) + '.';
          tick = setInterval(function () { var s2 = (Date.now() - t0) / 1000; tm.textContent = fmt(s2); if (s2 >= max) stop(); }, 200);
          btn('Cancel', '', function () { close(null); }); btn('■ Stop', 'stop', stop);
        }, function () { p.className = 'err'; p.textContent = 'Microphone blocked. Allow the microphone for this site and try again.'; btn('Close', '', function () { close(null); }); btn('Try again', 'go', function () { p.className = ''; start(); }); });
      }
      function stop() { clearInterval(tick); if (mr && mr.state !== 'inactive') mr.stop(); }
      function review() {
        if (res.dur < 0.5 || !res.blob.size) { h.textContent = 'Too short'; p.textContent = 'Hold on a little longer.'; row.replaceChildren(); btn('Cancel', '', function () { close(null); }); btn('Record again', 'go', start); return; }
        h.textContent = o.title || 'Voice note'; tm.textContent = fmt(res.dur); p.textContent = 'Listen back, then ' + (o.action || 'send') + ' it.';
        var g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); cv.hidden = true;
        var pl = localPlayer(URL.createObjectURL(res.blob), res.dur); box.insertBefore(pl, row);
        row.replaceChildren();
        btn('Cancel', '', function () { close(null); });
        btn('Record again', '', function () { pl.remove(); cv.hidden = false; start(); });
        var sv = btn('⬇ Save MP3', '', function () {
          sv.disabled = true; sv.textContent = 'Saving…';
          saveMp3(res.blob).then(function () { sv.textContent = '✓ Saved'; }, function () { sv.textContent = 'Couldn’t save'; }).then(function () { setTimeout(function () { sv.disabled = false; sv.textContent = '⬇ Save MP3'; }, 2000); });
        });
        btn(o.action ? o.action.charAt(0).toUpperCase() + o.action.slice(1) : 'Send', 'go', function () { close({ blob: res.blob, dur: res.dur }); });
      }
      start();
    });
  }

  /* ---------- saving as MP3 (2026-11-15): decode the recording, encode with lamejs (loaded on first use) ---------- */
  var lame = null;
  function loadLame() {
    if (window.lamejs) return Promise.resolve();
    return lame || (lame = new Promise(function (ok, no) { var sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js'; sc.onload = ok; sc.onerror = function () { lame = null; no(new Error('load')); }; document.head.appendChild(sc); }));
  }
  function decode(blob) {
    return blob.arrayBuffer().then(function (buf) {
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      return new Promise(function (ok, no) { var p = ac.decodeAudioData(buf, ok, no); if (p && p.then) p.then(ok, no); }).then(function (ab) { try { ac.close(); } catch (e) {} return ab; });
    });
  }
  function mp3(ab) {
    return loadLame().then(function () {
      var d = ab.getChannelData(0), n = d.length, pcm = new Int16Array(n);
      for (var i = 0; i < n; i++) { var v = Math.max(-1, Math.min(1, d[i])); pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
      var enc = new lamejs.Mp3Encoder(1, ab.sampleRate, 96), out = [];
      for (var j = 0; j < n; j += 1152) { var b = enc.encodeBuffer(pcm.subarray(j, j + 1152)); if (b.length) out.push(new Uint8Array(b)); }
      var e = enc.flush(); if (e.length) out.push(new Uint8Array(e));
      return new Blob(out, { type: 'audio/mpeg' });
    });
  }
  function saveMp3(blob) {
    return (blob.type === 'audio/mpeg' ? Promise.resolve(blob) : decode(blob).then(mp3)).then(function (mb) {
      var url = URL.createObjectURL(mb), a = document.createElement('a'), t = new Date();
      a.href = url; a.download = 'voice-note-' + t.getFullYear() + ('0' + (t.getMonth() + 1)).slice(-2) + ('0' + t.getDate()).slice(-2) + '-' + ('0' + t.getHours()).slice(-2) + ('0' + t.getMinutes()).slice(-2) + '.mp3';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    });
  }

  /* ---------- uploading ---------- */
  function upload(rec) {
    var tok = window.ArcadeAccount && ArcadeAccount.token && ArcadeAccount.token();
    if (!tok || !srv()) return Promise.reject(new Error('Sign in to an online account to send voice notes.'));
    return fetch(srv() + 'vnote' + room(true), { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ dur: Math.round(rec.dur * 10) / 10, sz: rec.blob.size }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error === 'slow' ? 'You’ve sent a lot of voice notes today. Try again tomorrow.' : j.error === 'auth' ? 'You’re signed out. Sign in again.' : 'Couldn’t send the voice note (' + (j.error || r.status) + ').'); return j; }); })
      .then(function (n) {
        return fetch(srv() + 'v/' + n.id + '?k=' + n.k + room(), { method: 'PUT', headers: { 'content-type': rec.blob.type || 'audio/webm' }, body: rec.blob })
          .then(function (r) { if (!r.ok) throw new Error('Couldn’t upload the voice note. Check your connection.'); return n.id; });
      });
  }
  function token(id, dur) { return '🎤 Voice note [vn:' + id + ':' + Math.max(1, Math.round(dur)) + ']'; }
  function parse(t) { var m = RE.exec(String(t || '')); return m ? { id: m[1], dur: +m[2] } : null; }
  function label(t) { return String(t || '').replace(/🎤?\s*Voice note\s*\[vn:[a-z0-9]{10}:\d{1,3}\]/g, '🎤 Voice note').replace(RE, '🎤 Voice note'); }

  /* ---------- playing ---------- */
  var urls = {}, playing = null;
  function audioUrl(id) {
    if (!urls[id]) urls[id] = fetch(srv() + 'v/' + id + room(true)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(function (b) { return URL.createObjectURL(b); });
    return urls[id];
  }
  function bars(seed, n) {
    var h = 0, out = []; for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    for (var j = 0; j < n; j++) { h = (h * 1103515245 + 12345) >>> 0; out.push(25 + (h >>> 16) % 75); }
    return out;
  }
  function makePlayer(getUrl, dur, seed) {
    css();
    var w = el('div', 'vn'), b = el('button', '', '▶'), bs = el('div', 'bars'), tm = el('small', '', fmt(dur)), a = null, hs = bars(seed || 'x', 28);
    b.type = 'button'; b.setAttribute('aria-label', 'Play voice note');
    hs.forEach(function (v) { var i = el('i'); i.style.height = v + '%'; bs.append(i); });
    w.append(b, bs, tm);
    function paint() {
      var f = a && dur ? Math.min(1, a.currentTime / dur) : 0, on = Math.round(f * hs.length);
      [].forEach.call(bs.children, function (i, n) { i.classList.toggle('on', n < on); });
      tm.textContent = fmt(a && !a.paused ? a.currentTime : a && a.currentTime ? dur - a.currentTime : dur);
    }
    function toggle(e, seek) {
      if (e) { e.stopPropagation(); e.preventDefault(); }
      if (a && !seek) { if (a.paused) { if (playing && playing !== a) playing.pause(); playing = a; a.play().catch(function () {}); } else a.pause(); return; }
      b.textContent = '…';
      Promise.resolve(getUrl()).then(function (u) {
        if (!a) {
          a = new Audio(u); a.preload = 'auto';
          a.addEventListener('play', function () { b.textContent = '❚❚'; });
          a.addEventListener('pause', function () { b.textContent = '▶'; paint(); });
          a.addEventListener('ended', function () { b.textContent = '▶'; a.currentTime = 0; paint(); });
          a.addEventListener('timeupdate', paint);
        }
        if (seek != null) { try { a.currentTime = seek * dur; } catch (x) {} }
        if (playing && playing !== a) playing.pause(); playing = a; a.play().catch(function () { b.textContent = '▶'; });
      }, function () { b.textContent = '⚠'; b.title = 'Couldn’t load this voice note'; });
    }
    b.onclick = function (e) { toggle(e); };
    bs.onclick = function (e) { var r = bs.getBoundingClientRect(); toggle(e, Math.max(0, Math.min(0.98, (e.clientX - r.left) / r.width))); };
    return w;
  }
  function player(id, dur) { return makePlayer(function () { return audioUrl(id); }, dur, id); }
  function localPlayer(url, dur) { return makePlayer(function () { return url; }, dur, url); }
  // a chat message's content: the player for a voice-note token, otherwise null
  function render(t) { var v = parse(t); return v ? player(v.id, v.dur) : null; }

  /* ---------- the mic button for a chat box ---------- */
  function button(input, form, o) {
    css(); o = o || {};
    var b = el('button', 'vn-mic', '🎤'); b.type = 'button'; b.title = 'Record a voice note'; b.setAttribute('aria-label', 'Record a voice note');
    if (!supported()) b.hidden = true;
    b.onclick = function () {
      if (o.check && !o.check()) return;
      if (!(window.ArcadeAccount && ArcadeAccount.token && ArcadeAccount.token())) { alert('Sign in to an online account to send voice notes.'); return; }
      record({ max: o.max || 60 }).then(function (rec) {
        if (!rec) return;
        b.disabled = true; b.textContent = '⏳';
        return upload(rec).then(function (id) {
          var keep = input.value; input.value = token(id, rec.dur);
          if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
          setTimeout(function () { if (input.value === token(id, rec.dur)) input.value = keep; }, 8000);
        });
      }).catch(function (e) { alert(String(e && e.message || e)); }).then(function () { b.disabled = false; b.textContent = '🎤'; });
    };
    return b;
  }
  // a card picture for a voice post on Social: the waveform on a gradient
  function poster(rec, name) {
    var c = document.createElement('canvas'); c.width = c.height = 360;
    var g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 360, 360);
    gr.addColorStop(0, '#6c5ce7'); gr.addColorStop(1, '#00d2a8'); g.fillStyle = gr; g.fillRect(0, 0, 360, 360);
    function fin(peaks) {
      g.fillStyle = '#fff'; var n = peaks.length, w = 280 / n;
      peaks.forEach(function (v, i) { var h = Math.max(6, v * 150); g.globalAlpha = 0.9; g.fillRect(40 + i * w + 1, 200 - h / 2, Math.max(2, w - 3), h); });
      g.globalAlpha = 1; g.font = '64px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('🎤', 180, 100);
      g.font = 'bold 22px system-ui, sans-serif'; g.fillText('Voice note · ' + fmt(rec.dur), 180, 310);
      return c.toDataURL('image/jpeg', 0.8);
    }
    return rec.blob.arrayBuffer().then(function (buf) {
      var ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
      return new Promise(function (ok, no) { var p = ac.decodeAudioData(buf, ok, no); if (p && p.then) p.then(ok, no); });
    }).then(function (ab) {
      var d = ab.getChannelData(0), n = 40, step = Math.floor(d.length / n) || 1, out = [], top = 0.01;
      for (var i = 0; i < n; i++) { var m = 0; for (var j = i * step; j < (i + 1) * step && j < d.length; j += 16) m = Math.max(m, Math.abs(d[j])); out.push(m); top = Math.max(top, m); }
      return fin(out.map(function (v) { return v / top; }));
    }).catch(function () { return fin(bars(name || 'voice', 40).map(function (v) { return v / 100; })); });
  }

  /* ---------- replies (2026-11-15): a message that answers another starts with "↪[re:<name>|<snippet>] " ---------- */
  var RRE = /^↪\[re:([^|\]]{1,20})\|([^\]]{0,60})\]\s?/;
  function split(t) { t = String(t || ''); var m = RRE.exec(t); return m ? { re: { n: m[1], s: m[2] }, t: t.slice(m[0].length) } : { re: null, t: t }; }
  function short(t) { return label(split(t).t).replace(/[\[\]|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40); }
  function quote(re) { css(); var q = el('div', 'vn-q'); q.append(el('b', '', '↪ ' + re.n), el('span', '', re.s || '…')); return q; }
  // a message's content: [reply quote] + voice player or text (text through fw, e.g. a swear filter)
  function content(t, fw) {
    var x = split(t), f = document.createDocumentFragment();
    if (x.re) f.append(quote(x.re));
    var v = render(x.t); f.append(v || document.createTextNode(fw ? fw(x.t) : x.t));
    return f;
  }
  function preview(t) { var x = split(t); return (x.re ? '↪ ' : '') + label(x.t); }
  // reply bar above a chat box: r = ArcadeVoice.replyBar(form, input); r.set(name, text); sends prefix the reply
  function replyBar(form, input) {
    css();
    var bar = el('div', 'vn-rbar'), tx = el('span'), x = el('button', '', '✕'), cur = null;
    x.type = 'button'; x.setAttribute('aria-label', 'Cancel reply'); bar.hidden = true; bar.append(tx, x);
    form.parentNode.insertBefore(bar, form);
    function clear() { cur = null; bar.hidden = true; }
    x.onclick = function () { clear(); input.focus(); };
    form.addEventListener('submit', function () {
      if (!cur || !input.value.trim() || RRE.test(input.value)) return;
      input.value = '↪[re:' + cur.n + '|' + cur.s + '] ' + input.value;
      var sent = cur; clear();
      setTimeout(function () { if (input.value.indexOf('↪[re:') === 0) { var y = split(input.value); input.value = y.t; cur = sent; bar.hidden = false; } }, 7000);
    }, true);
    return { set: function (n, t) { cur = { n: String(n).replace(/[|\]]/g, '').slice(0, 20), s: short(t) }; tx.textContent = ''; tx.append(el('b', '', 'Replying to ' + cur.n), document.createTextNode(' ' + cur.s)); bar.hidden = false; input.focus(); }, clear: clear };
  }
  function replyBtn(fn) { css(); var b = el('button', 'vn-rb', '↪'); b.type = 'button'; b.title = 'Reply'; b.setAttribute('aria-label', 'Reply'); b.onclick = function (e) { e.stopPropagation(); fn(); }; return b; }
  /* ---------- read receipts (2026-11-15) ----------
     seen(msgs, rd, names, group): under your newest message: "Seen 4:05 pm" (private chat) or "Seen by A, B" / "Seen by everyone" (group).
     msgs = the chat's messages ({ f: yours, ts }), rd = { lower name: time they last read }, names = the other people. */
  function seen(msgs, rd, names, group) {
    rd = rd || {}; var last = null;
    for (var i = msgs.length - 1; i >= 0; i--) { if (msgs[i].f) { last = msgs[i]; break; } }
    if (!last) return null;
    if (msgs[msgs.length - 1] !== last) return null; // like most apps: only under your message when it's the newest one
    var who = (names || []).filter(function (n) { return (rd[String(n).toLowerCase()] || 0) >= last.ts; });
    if (!who.length) return null;
    css();
    var d = el('div', 'vn-seen'), t = Math.max.apply(null, who.map(function (n) { return rd[String(n).toLowerCase()]; }));
    if (!group) d.textContent = 'Seen ' + new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    else d.textContent = who.length === names.length && names.length > 1 ? 'Seen by everyone' : 'Seen by ' + (who.length > 4 ? who.slice(0, 4).join(', ') + ' and ' + (who.length - 4) + ' more' : who.join(', '));
    return d;
  }
  window.ArcadeVoice = { seen: seen,  saveMp3: saveMp3, split: split, content: content, preview: preview, replyBar: replyBar, replyBtn: replyBtn, quote: quote, supported: supported, record: record, upload: upload, token: token, parse: parse, label: label, player: player, render: render, button: button, poster: poster, fmt: fmt };
})();
