/* Video calls between friends (2026-11-10).
   The call set-up rides the account's live connection (account.js): POST /acct/call {to, d} goes to the friend's
   account, which pushes {t: 'call', n, d} to their open pages. The video and sound go straight between the two
   browsers (WebRTC), so a call costs the server only its handful of set-up messages, however long it lasts.
   d.k: 'ring' (offer) -> 'ans' (answer, sent at once so the caller's camera shows while it rings; nothing comes
   back until 'ok') -> 'ok' (picked up) | 'no' (declined) | 'busy'; 'end' from either side hangs up.
   Only one tab per player rings: the first to claim the call in localStorage (the tab you're looking at wins). */
(function () {
  var A = window.ArcadeAccount;
  if (!A || !window.RTCPeerConnection || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { window.ArcadeCall = { start: function () { alert('Video calls don’t work in this browser.'); }, active: function () { return false; } }; return; }
  var ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  var TAB = Math.random().toString(36).slice(2, 10), RING_MS = 40000;
  var C = null; // this page's call: { id, peer, dir: 'out' | 'in', st: 'ring' | 'live', pc, local, remote, t0 }
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* ---------- talking to the other side ---------- */
  function send(to, d, keep) { return A.api('call', { method: 'POST', auth: true, body: { to: to, d: d }, keepalive: !!keep }); }
  function gathered(pc) {
    return new Promise(function (r) {
      if (pc.iceGatheringState === 'complete') return r();
      var t = setTimeout(r, 2500);
      pc.addEventListener('icegatheringstatechange', function () { if (pc.iceGatheringState === 'complete') { clearTimeout(t); r(); } });
    });
  }
  function newPc() {
    var pc = new RTCPeerConnection({ iceServers: ICE });
    C.remote = new MediaStream();
    pc.ontrack = function (e) { if (C && C.pc === pc) { C.remote.addTrack(e.track); showRemote(); } };
    pc.onconnectionstatechange = function () {
      if (!C || C.pc !== pc) return;
      if (pc.connectionState === 'failed') finish('The connection dropped. One of your networks may block video calls.', true);
      else if (pc.connectionState === 'disconnected') { clearTimeout(C.dropT); C.dropT = setTimeout(function () { if (C && C.pc === pc && pc.connectionState !== 'connected') finish('The connection dropped.', true); }, 8000); }
    };
    return pc;
  }
  function media() {
    var v = { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' }, a = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    return navigator.mediaDevices.getUserMedia({ video: v, audio: a })
      .catch(function () { return navigator.mediaDevices.getUserMedia({ audio: a }); });
  }

  /* ---------- calling a friend ---------- */
  // the server only passes calls between friends (the Players page shows the button only for them)
  function start(n) {
    if (A.kind() !== 'online') { A.welcome('signup'); return; }
    if (C) { alert('You are already in a call.'); return; }
    if (busyElsewhere()) { alert('You are in a call in another tab.'); return; }
    C = { id: Math.random().toString(36).slice(2, 12), peer: n, dir: 'out', st: 'ring' };
    var me = C;
    drawCall();
    status('Turning on your camera…');
    media().then(function (s) {
      if (C !== me) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      C.local = s; showLocal();
      // they see your camera while it rings; they hear you only once they pick up
      s.getAudioTracks().forEach(function (t) { t.enabled = false; });
      var pc = C.pc = newPc();
      s.getTracks().forEach(function (t) { pc.addTrack(t, s); });
      if (!s.getVideoTracks().length) pc.addTransceiver('video', { direction: 'recvonly' });
      return pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () { return gathered(pc); }).then(function () {
        if (C !== me) return;
        status('Calling ' + n + '…', n + ' can see your camera while it rings.');
        return send(n, { k: 'ring', id: me.id, sdp: pc.localDescription.toJSON() }).then(function (r) {
          if (C !== me) return;
          if (r.status !== 200) finish(r.error === 'not_friend' ? 'You can only call friends.' : r.error === 'slow' ? 'Slow down a little and try again.' : 'Couldn’t reach the server. Check your connection.', true);
          else if (!r.on) finish(n + ' isn’t on the arcade right now.', true);
        });
      });
    }).catch(function () { if (C === me) finish('Your browser didn’t let the arcade use your camera or microphone. Allow them and try again.', true); });
    me.ringT = setTimeout(function () { if (C === me && C.st === 'ring') { send(n, { k: 'end', id: me.id }); finish('No answer from ' + n + '.', true); } }, RING_MS);
    busyMark();
  }

  /* ---------- being called ---------- */
  function got(from, d) {
    if (!d || typeof d.id !== 'string') return;
    if (d.k === 'ring') {
      if ((C && C.id !== d.id) || busyElsewhere()) { if (!C || C.id !== d.id) claim(d.id, function () { send(from, { k: 'busy', id: d.id }); }); return; }
      claim(d.id, function () { ringIn(from, d); });
      return;
    }
    if (!C || C.id !== d.id || String(from).toLowerCase() !== C.peer.toLowerCase()) return;
    if (d.k === 'ans' && C.dir === 'out' && C.pc && !C.pc.currentRemoteDescription) C.pc.setRemoteDescription(d.sdp).catch(function () {});
    else if (d.k === 'ok' && C.dir === 'out') goLive();
    else if (d.k === 'no') finish(C.peer + ' declined the call.', true);
    else if (d.k === 'busy') finish(C.peer + ' is in another call.', true);
    else if (d.k === 'end') finish(C.st === 'live' ? C.peer + ' hung up.' : C.dir === 'in' ? 'Missed call from ' + C.peer + '.' : C.peer + ' hung up.', true);
  }
  function ringIn(from, d) {
    if (C) return;
    C = { id: d.id, peer: from, dir: 'in', st: 'ring' };
    var me = C, pc = C.pc = newPc();
    pc.setRemoteDescription(d.sdp).then(function () {
      // ready to send later without asking again: we answer with empty senders and fill them on pick-up
      pc.getTransceivers().forEach(function (t) { t.direction = 'sendrecv'; });
      return pc.createAnswer();
    }).then(function (a) { return pc.setLocalDescription(a); }).then(function () { return gathered(pc); }).then(function () {
      if (C === me) send(from, { k: 'ans', id: me.id, sdp: pc.localDescription.toJSON() });
    }).catch(function () { if (C === me) finish('', false); });
    drawRing();
    ringTone(true); flashTitle(true);
    me.ringT = setTimeout(function () { if (C === me && C.st === 'ring') finish('Missed call from ' + from + '.', true); }, RING_MS + 2000);
    busyMark();
  }
  function accept() {
    if (!C || C.dir !== 'in' || C.st !== 'ring') return;
    var me = C; ringTone(false); flashTitle(false);
    $('acRing') && $('acRing').remove();
    drawCall(); status('Turning on your camera…');
    media().then(function (s) {
      if (C !== me) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      C.local = s; showLocal();
      C.pc.getTransceivers().forEach(function (t) {
        var kind = t.receiver.track && t.receiver.track.kind, tr = kind && s.getTracks().find(function (x) { return x.kind === kind; });
        if (tr) t.sender.replaceTrack(tr);
      });
    }).catch(function () { if (C === me) status('', 'Your camera and microphone are off. Allow them in the browser to be seen and heard.'); })
      .then(function () { if (C === me) { send(me.peer, { k: 'ok', id: me.id }); goLive(); } });
  }
  function decline() { if (!C) return; send(C.peer, { k: 'no', id: C.id }); finish('', false); }
  function hangUp() { if (!C) return; send(C.peer, { k: 'end', id: C.id }); finish('', false); }
  function goLive() {
    if (!C) return;
    clearTimeout(C.ringT); C.st = 'live'; C.t0 = Date.now();
    if (C.local) C.local.getAudioTracks().forEach(function (t) { t.enabled = !C.micOff; });
    var v = $('acCallRemote'); if (v) { v.muted = false; v.play().catch(function () {}); }
    status('');
    drawCall();
  }
  function finish(msg, tell) {
    if (!C) return;
    var c = C; C = null;
    clearTimeout(c.ringT); clearTimeout(c.dropT); ringTone(false); flashTitle(false);
    try { c.pc && c.pc.close(); } catch (e) {}
    if (c.local) c.local.getTracks().forEach(function (t) { t.stop(); });
    ['acRing', 'acCall'].forEach(function (id) { var e = $(id); if (e) e.remove(); });
    try { localStorage.removeItem('arcade-call-busy'); } catch (e) {}
    if (msg && tell) A.toast(c.peer, msg, 'players.html#p=' + encodeURIComponent(c.peer));
  }

  /* ---------- one ringing tab per player ---------- */
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function claim(id, fn) {
    var wait = document.visibilityState === 'visible' ? (document.hasFocus() ? 0 : 90) : 320;
    setTimeout(function () {
      var cur = lsGet('arcade-call-claim');
      if (cur && cur.id === id && cur.tab !== TAB) return;
      lsSet('arcade-call-claim', { id: id, tab: TAB });
      setTimeout(function () { var c = lsGet('arcade-call-claim'); if (!c || c.tab === TAB) fn(); }, 60);
    }, wait);
  }
  function busyMark() { if (C) { lsSet('arcade-call-busy', { tab: TAB, at: Date.now() }); setTimeout(busyMark, 4000); } }
  function busyElsewhere() { var b = lsGet('arcade-call-busy'); return !!(b && b.tab !== TAB && Date.now() - b.at < 10000); }

  /* ---------- what you see ---------- */
  function css() {
    if ($('acCallCss')) return;
    var st = el('style'); st.id = 'acCallCss';
    st.textContent =
      '#acRing{position:fixed;top:calc(max(12px,env(safe-area-inset-top)) + 58px);right:14px;z-index:2147483100;width:min(320px,calc(100vw - 28px));border-radius:16px;overflow:hidden;background:rgba(27,24,53,.97);border:1px solid #6c5ce7;box-shadow:0 16px 44px #000c;color:#f1effa;font:14px/1.35 system-ui,sans-serif;animation:acRi .35s ease-out}' +
      '@keyframes acRi{from{opacity:0;transform:translateX(40px)}}' +
      '#acRing .acc-vid{position:relative;aspect-ratio:16/9;overflow:hidden;background:#0b0a18}#acRing video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block}' +
      '#acRing .acc-live{position:absolute;left:10px;top:10px;font:800 11px/1 system-ui,sans-serif;letter-spacing:.5px;background:#e8344c;color:#fff;padding:4px 7px;border-radius:6px}' +
      '#acRing .acc-wait{position:absolute;inset:0;display:grid;place-items:center;color:#a9a3c9;font-size:13px}' +
      '#acRing .acc-who{display:flex;align-items:center;gap:10px;padding:12px 14px 4px}#acRing .acc-who b{font-size:16px}#acRing .acc-who span{color:#c9c3e6}' +
      '#acRing .acc-av,#acCall .acc-av{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#6c5ce7,#00d2a8);font-weight:800;animation:acPulse 1.2s ease-in-out infinite}' +
      '@keyframes acPulse{50%{box-shadow:0 0 0 7px rgba(0,210,168,.25)}}' +
      '#acRing .acc-note{padding:0 14px 10px;color:#9a94bd;font-size:12px}' +
      '#acRing .acc-btns{display:flex;gap:8px;padding:0 12px 12px}#acRing button{flex:1;border:0;border-radius:11px;padding:11px;font:800 14px system-ui,sans-serif;color:#fff;cursor:pointer}' +
      '#acRing .acc-yes{background:#00b894}#acRing .acc-no{background:#e8344c}#acRing button:hover{filter:brightness(1.1)}' +
      '#acCall{position:fixed;right:14px;bottom:14px;z-index:2147483100;width:min(360px,calc(100vw - 28px));border-radius:16px;overflow:hidden;background:#0b0a18;border:1px solid #6c5ce7;box-shadow:0 16px 44px #000c;color:#f1effa;font:14px/1.35 system-ui,sans-serif;animation:acRi .3s ease-out}' +
      '#acCall.acc-big{width:min(720px,calc(100vw - 28px))}' +
      '#acCall .acc-stage{position:relative;aspect-ratio:16/9;overflow:hidden;background:#14122a}#acCall .acc-stage>video{width:100%;height:100%;object-fit:cover;display:block}' +
      '#acCall .acc-me{position:absolute;right:8px;top:8px;width:28%;aspect-ratio:16/9;border-radius:9px;overflow:hidden;border:2px solid #ffffff55;background:#000}#acCall .acc-me video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block}' +
      '#acCall .acc-me.acc-solo{inset:0;width:auto;border:0;border-radius:0}' +
      '#acCall .acc-over{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;padding:12px;background:linear-gradient(transparent,rgba(11,10,24,.55))}' +
      '#acCall .acc-over b{font-size:17px;text-shadow:0 1px 6px #000}#acCall .acc-over span{color:#d9d4f3;font-size:12.5px;text-shadow:0 1px 6px #000}' +
      '#acCall .acc-bar{display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(27,24,53,.97)}#acCall .acc-bar .acc-nm{flex:1;min-width:0;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#acCall .acc-bar .acc-tm{color:#a9a3c9;font:600 12px ui-monospace,Menlo,monospace;margin-left:6px}' +
      '#acCall .acc-bar button{border:0;border-radius:10px;width:38px;height:34px;background:#ffffff14;color:#fff;cursor:pointer;font-size:16px;display:grid;place-items:center}#acCall .acc-bar button:hover{background:#ffffff26}' +
      '#acCall .acc-bar button.acc-off{background:#e8344c55}#acCall .acc-bar button.acc-end{background:#e8344c;width:46px}' +
      '#acCall .acc-bar svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}';
    document.head.appendChild(st);
  }
  var ICON = {
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    micOff: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/></svg>',
    camOff: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3M3 3l18 18"/></svg>',
    big: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    end: '<svg viewBox="0 0 24 24"><path d="M3 15c5-5 13-5 18 0l-2 3-4-2v-3c-2-1-4-1-6 0v3l-4 2z"/></svg>'
  };
  function avatar(n) { return el('span', 'acc-av', String(n).charAt(0).toUpperCase()); }
  function drawRing() {
    css();
    var box = el('div'); box.id = 'acRing'; box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-label', C.peer + ' is video calling you');
    var vid = el('div', 'acc-vid'), v = el('video'); v.id = 'acRingVid'; v.autoplay = true; v.muted = true; v.playsInline = true;
    vid.appendChild(v); vid.appendChild(el('span', 'acc-live', 'LIVE')); var w = el('span', 'acc-wait', 'Connecting to ' + C.peer + '’s camera…'); w.id = 'acRingWait'; vid.appendChild(w);
    var who = el('div', 'acc-who'), t = el('div'); t.appendChild(el('b', '', C.peer)); t.appendChild(document.createElement('br')); t.appendChild(el('span', '', 'is video calling you'));
    who.appendChild(avatar(C.peer)); who.appendChild(t);
    var note = el('div', 'acc-note', 'They can’t see or hear you until you accept.');
    var btns = el('div', 'acc-btns'), yes = el('button', 'acc-yes', 'Accept'), no = el('button', 'acc-no', 'Decline');
    yes.type = no.type = 'button'; yes.onclick = accept; no.onclick = decline;
    btns.appendChild(yes); btns.appendChild(no);
    box.appendChild(vid); box.appendChild(who); box.appendChild(note); box.appendChild(btns);
    document.body.appendChild(box);
    showRemote();
  }
  function drawCall() {
    css();
    var box = $('acCall');
    if (!box) {
      box = el('div'); box.id = 'acCall';
      box.innerHTML = '<div class="acc-stage"><video id="acCallRemote" autoplay playsinline muted></video><div class="acc-me" id="acCallMe"><video id="acCallLocal" autoplay playsinline muted></video></div><div class="acc-over" id="acCallOver"></div></div>' +
        '<div class="acc-bar"><span class="acc-nm" id="acCallNm"></span><button type="button" id="acMic" title="Mute your microphone">' + ICON.mic + '</button><button type="button" id="acCam" title="Turn your camera off">' + ICON.cam + '</button><button type="button" id="acBig" title="Bigger">' + ICON.big + '</button><button type="button" class="acc-end" id="acEnd" title="Hang up">' + ICON.end + '</button></div>';
      document.body.appendChild(box);
      $('acMic').onclick = function () { if (!C) return; C.micOff = !C.micOff; if (C.local && C.st === 'live') C.local.getAudioTracks().forEach(function (t) { t.enabled = !C.micOff; }); this.classList.toggle('acc-off', C.micOff); this.innerHTML = C.micOff ? ICON.micOff : ICON.mic; };
      $('acCam').onclick = function () { if (!C) return; C.camOff = !C.camOff; if (C.local) C.local.getVideoTracks().forEach(function (t) { t.enabled = !C.camOff; }); this.classList.toggle('acc-off', C.camOff); this.innerHTML = C.camOff ? ICON.camOff : ICON.cam; };
      $('acBig').onclick = function () { box.classList.toggle('acc-big'); };
      $('acEnd').onclick = hangUp;
    }
    var nm = $('acCallNm'); nm.textContent = C.peer; var tm = el('span', 'acc-tm'); tm.id = 'acCallTm'; nm.appendChild(tm);
    // until they pick up, your own camera fills the window
    $('acCallMe').classList.toggle('acc-solo', C.st !== 'live');
    $('acCallRemote').style.visibility = C.st === 'live' ? 'visible' : 'hidden';
    showLocal(); showRemote();
  }
  function status(title, sub) {
    var o = $('acCallOver'); if (!o) return;
    o.replaceChildren(); o.style.display = title || sub ? 'flex' : 'none';
    if (title) o.appendChild(el('b', '', title)); if (sub) o.appendChild(el('span', '', sub));
  }
  function showLocal() { var v = $('acCallLocal'); if (v && C && C.local && v.srcObject !== C.local) { v.srcObject = C.local; v.play().catch(function () {}); } }
  function showRemote() {
    if (!C || !C.remote) return;
    ['acRingVid', 'acCallRemote'].forEach(function (id) { var v = $(id); if (v && v.srcObject !== C.remote) { v.srcObject = C.remote; v.play().catch(function () {}); } });
    var w = $('acRingWait'); if (w && C.remote.getVideoTracks().length) { var v = $('acRingVid'); v.onplaying = function () { w.remove(); }; }
  }
  setInterval(function () {
    var t = $('acCallTm'); if (t && C && C.st === 'live') { var s = Math.floor((Date.now() - C.t0) / 1000); t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  }, 1000);

  // a soft two-note ring while a call comes in
  var ring = { ctx: null, t: 0 };
  function ringTone(on) {
    clearInterval(ring.t); ring.t = 0;
    if (!on) return;
    var beep = function () {
      try {
        var ctx = ring.ctx || (ring.ctx = new (window.AudioContext || window.webkitAudioContext)()); if (ctx.state === 'suspended') ctx.resume();
        [0, 0.22].forEach(function (d, i) {
          var o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + d;
          o.frequency.value = i ? 660 : 880; o.connect(g); g.connect(ctx.destination);
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
          o.start(t); o.stop(t + 0.22);
        });
      } catch (e) {}
    };
    beep(); ring.t = setInterval(beep, 2200);
  }
  var flash = { t: 0, title: '' };
  function flashTitle(on) {
    clearInterval(flash.t);
    if (flash.title) { document.title = flash.title; flash.title = ''; }
    if (!on || !C) return;
    flash.title = document.title; var who = C.peer, k = 0;
    flash.t = setInterval(function () { document.title = k++ % 2 ? flash.title : '📹 ' + who + ' is calling…'; }, 1000);
  }

  // leaving the page ends the call
  addEventListener('beforeunload', function (e) { if (C && C.st === 'live') { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('pagehide', function () { if (C) send(C.peer, { k: C.dir === 'in' && C.st === 'ring' ? 'no' : 'end', id: C.id }, true); });

  A.onLive(function (m) { if (m && m.t === 'call' && m.n) got(m.n, m.d); });
  window.ArcadeCall = { start: start, active: function () { return !!C; }, _test: { state: function () { return C && { id: C.id, peer: C.peer, dir: C.dir, st: C.st }; }, accept: accept, decline: decline, hangUp: hangUp } };
})();
