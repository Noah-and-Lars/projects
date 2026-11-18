/* live.js (2026-11-17): live broadcasts and predictions.
   - play.html: "Go live" (signed-in players) streams the game to viewers, peer to peer (WebRTC, the same STUN/TURN
     setup as the video calls). It captures the game area with its sound (the browser asks which tab; Chrome crops to
     the game), or, where tab capture isn't available, the game's canvas.
   - live.html?u=<name>: watch, chat (signed-in players; the server filters links and bad words on "chat" messages),
     react, and bet tickets on the streamer's predictions.
   - Everyone streaming shows on the home page and on live.html (presence on "live:index").
   Channels (rt.js): "live:index" presence {n, g, t, at, v};  "live:<lower name>" presence host {role:'host', ...} /
   viewers {role:'viewer', n}; broadcast sig {to, from, d}, hello {from}, chat {n, x}, react {e}, pred {...}, vote {...}.
   Tickets for predictions are kept on this device ('arcade-tickets', 1000 to start, topped up to 200 each day). */
(function () {
  if (window.ArcadeLive || window.ARCADE_WATCH) return;
  var STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
  var MAX_VIEWERS = 12;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var uid = function () { return (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 12); };
  var A = function () { return window.ArcadeAccount; };
  var online = function () { var a = A(); return !!(a && a.kind && a.kind() === 'online'); };
  var myName = function () { var a = A(); return online() ? a.name() : ''; };
  var client = function (f) { if (window.ArcadeOnline) ArcadeOnline.ready(f); else f(null); };
  function ice() {
    var a = A();
    if (!online() || !a.api) return Promise.resolve(STUN);
    return a.api('turn', { auth: true }).then(function (r) { return r && r.status === 200 && Array.isArray(r.iceServers) ? STUN.concat(r.iceServers) : STUN; }, function () { return STUN; });
  }
  var REACTS = { fire: '🔥', clap: '👏', wow: '😮', lol: '😂', gg: 'GG' };

  /* ---------- tickets ---------- */
  var Tickets = {
    get: function () {
      var t = JSON.parse(ls.get('arcade-tickets') || 'null') || { n: 1000, day: '' };
      var today = new Date().toISOString().slice(0, 10);
      if (t.day !== today) { t.n = Math.max(t.n, 200); t.day = today; ls.set('arcade-tickets', JSON.stringify(t)); }
      return t.n;
    },
    add: function (d) { var n = Tickets.get() + d; ls.set('arcade-tickets', JSON.stringify({ n: Math.max(0, Math.round(n)), day: new Date().toISOString().slice(0, 10) })); return n; },
  };

  /* ---------- who's live (home page, live.html) ---------- */
  var dirCh = null, dirSubs = [];
  function directory(f) {
    dirSubs.push(f);
    if (dirCh) return;
    client(function (c) {
      if (!c) { dirSubs.forEach(function (g) { g([]); }); return; }
      dirCh = c.channel('live:index', { config: { presence: { key: 'v' + uid() } } });
      dirCh.on('presence', { event: 'sync' }, function () {
        var st = dirCh.presenceState(), list = [];
        Object.keys(st).forEach(function (k) { (st[k] || []).forEach(function (m) { if (m && m.n && /^[A-Za-z0-9_]{3,16}$/.test(m.n) && !list.some(function (x) { return x.n === m.n; })) list.push(m); }); });
        list.sort(function (a, b) { return (b.v || 0) - (a.v || 0) || a.at - b.at; });
        dirSubs.forEach(function (g) { try { g(list); } catch (e) {} });
      });
      dirCh.subscribe();
    });
  }

  /* ======================================================================================================
     Broadcasting (play.html)
     ====================================================================================================== */
  function host(game, stage, frame, btn) {
    var stream = null, ch = null, idx = null, peers = {}, viewers = {}, dock = null, chatLog = [], pred = null, t0 = 0, iceList = STUN;
    btn.onclick = function () { stream ? stop() : start(); };

    function capture() {
      var force = /[?&]livecanvas\b/.test(location.search);
      var gdm = navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && !force;
      if (gdm) {
        return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, width: { ideal: 1920 } }, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' }).then(function (s) {
          // Chrome: crop the shared tab down to the game itself
          var tr = s.getVideoTracks()[0];
          if (tr && tr.cropTo && window.CropTarget && CropTarget.fromElement) return CropTarget.fromElement(stage).then(function (t) { return tr.cropTo(t); }).then(function () { return s; }, function () { return s; });
          return s;
        });
      }
      // no tab capture: stream the game's canvas instead (picture only)
      try {
        var area = function (c) { var r = c.getBoundingClientRect(); return r.width * r.height; };
        var cv = frame.contentDocument && Array.prototype.slice.call(frame.contentDocument.querySelectorAll('canvas')).filter(function (c) { return area(c) > 0; }).sort(function (a, b) { return area(b) - area(a); })[0];
        if (cv && cv.captureStream) return Promise.resolve(cv.captureStream(30));
      } catch (e) {}
      return Promise.reject(new Error('This browser can’t stream this game.'));
    }
    function start() {
      if (!online()) { var a = A(); if (a && a.welcome) a.welcome('signup', 'Going live needs an online account. Make one (free, just a username and a password) or log in.'); return; }
      btn.disabled = true;
      Promise.all([capture(), ice()]).then(function (r) {
        stream = r[0]; iceList = r[1]; t0 = Date.now(); btn.disabled = false;
        stream.getVideoTracks().forEach(function (t) { t.onended = stop; });
        open();
      }, function (e) { btn.disabled = false; if (e && e.name !== 'NotAllowedError') alert(e.message || 'Couldn’t start the stream.'); });
    }
    function open() {
      var me = myName(), lower = me.toLowerCase();
      client(function (c) {
        if (!c) { stop(); return; }
        ch = c.channel('live:' + lower, { config: { presence: { key: 'host' } } });
        ch.on('broadcast', { event: 'hello' }, function (e) { var m = e.payload || {}; if (m.from) offer(m.from); });
        ch.on('broadcast', { event: 'sig' }, function (e) { onSig(e.payload || {}); });
        ch.on('broadcast', { event: 'chat' }, function (e) { var m = e.payload || {}; if (m.n && m.x) addChat(m.n, m.x); });
        ch.on('broadcast', { event: 'react' }, function (e) { var m = e.payload || {}; if (REACTS[m.e]) floatReact(m.e); });
        ch.on('broadcast', { event: 'vote' }, function (e) { onVote(e.payload || {}); });
        ch.on('presence', { event: 'sync' }, function () {
          var st = ch.presenceState(); viewers = {};
          Object.keys(st).forEach(function (k) { (st[k] || []).forEach(function (m) { if (m.role === 'viewer' && m.id) viewers[m.id] = m.n || ''; }); });
          Object.keys(peers).forEach(function (id) { if (!viewers[id]) drop(id); });
          paintDock(); trackIndex();
        });
        ch.subscribe(function (s) {
          if (s === 'SUBSCRIBED') { ch.track({ role: 'host', n: me, g: game.id, t: game.title, at: t0 }); ch.send({ type: 'broadcast', event: 'live', payload: { on: 1 } }); }
        });
        idx = c.channel('live:index', { config: { presence: { key: 'h-' + lower } } });
        idx.subscribe(function (s) { if (s === 'SUBSCRIBED') trackIndex(); });
      });
      makeDock(); paintDock();
      btn.classList.add('on'); btn.querySelector('span').textContent = 'Live';
    }
    function trackIndex() { if (idx && stream) idx.track({ n: myName(), g: game.id, t: game.title, th: new URL(game.thumb, location.href).href, at: t0, v: Object.keys(viewers).length }); }
    function offer(id) {
      if (!stream || peers[id] || Object.keys(peers).length >= MAX_VIEWERS) return;
      var pc = new RTCPeerConnection({ iceServers: iceList });
      peers[id] = pc;
      stream.getTracks().forEach(function (t) { pc.addTrack(t, stream); });
      pc.onicecandidate = function (e) { if (e.candidate) sig(id, { c: e.candidate }); };
      pc.onconnectionstatechange = function () { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(id); };
      pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () { sig(id, { sdp: pc.localDescription }); }).catch(function () { drop(id); });
      if (pred) ch.send({ type: 'broadcast', event: 'pred', payload: pred });
    }
    function onSig(m) {
      if (m.to !== 'host' || !peers[m.from]) return;
      var pc = peers[m.from];
      if (m.d && m.d.sdp) pc.setRemoteDescription(m.d.sdp).catch(function () {});
      else if (m.d && m.d.c) pc.addIceCandidate(m.d.c).catch(function () {});
    }
    function sig(to, d) { if (ch) ch.send({ type: 'broadcast', event: 'sig', payload: { to: to, from: 'host', d: d } }); }
    function drop(id) { var pc = peers[id]; if (pc) { try { pc.close(); } catch (e) {} delete peers[id]; } }
    function stop() {
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
      Object.keys(peers).forEach(drop);
      if (ch) { try { ch.send({ type: 'broadcast', event: 'live', payload: { on: 0 } }); ch.untrack(); } catch (e) {} setTimeout(function () { try { ch.unsubscribe(); } catch (e) {} ch = null; }, 300); }
      if (idx) { try { idx.untrack(); idx.unsubscribe(); } catch (e) {} idx = null; }
      if (dock) { dock.remove(); dock = null; }
      pred = null;
      btn.classList.remove('on'); btn.querySelector('span').textContent = 'Go live';
    }
    addEventListener('pagehide', function () { if (stream) stop(); });

    /* the streamer's dock: viewers, chat, predictions, stop */
    function makeDock() {
      dock = document.createElement('div'); dock.className = 'ldock';
      dock.innerHTML = '<div class="ld-head"><span class="ld-live">LIVE</span><span class="ld-t" id="ldTime">0:00</span><span class="ld-v"><b id="ldV">0</b> watching</span>' +
        '<a class="ld-link" id="ldLink" target="_blank" rel="noopener">Open stream</a><button type="button" class="ld-stop" id="ldStop">End</button></div>' +
        '<div class="ld-pred" id="ldPred"></div><ol class="ld-chat" id="ldChat"><li class="sys">Chat from your viewers shows up here.</li></ol>';
      document.body.appendChild(dock);
      dock.querySelector('#ldStop').onclick = stop;
      dock.querySelector('#ldLink').href = 'live.html?u=' + encodeURIComponent(myName());
      var tick = setInterval(function () { if (!dock) return clearInterval(tick); var s = Math.floor((Date.now() - t0) / 1000); dock.querySelector('#ldTime').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 1000);
      paintPred();
    }
    function paintDock() { if (dock) dock.querySelector('#ldV').textContent = Object.keys(viewers).length; }
    function addChat(n, x) {
      if (!dock) return;
      var li = document.createElement('li'); li.innerHTML = '<b></b> <span></span>'; li.querySelector('b').textContent = n; li.querySelector('span').textContent = x;
      var log = dock.querySelector('#ldChat'); log.appendChild(li); while (log.children.length > 60) log.firstChild.remove(); log.scrollTop = log.scrollHeight;
    }
    function floatReact(e) {
      var f = document.createElement('span'); f.className = 'lreact'; f.textContent = REACTS[e];
      f.style.left = (70 + Math.random() * 25) + '%'; document.body.appendChild(f); setTimeout(function () { f.remove(); }, 2400);
    }
    /* predictions, run by the streamer */
    function paintPred() {
      if (!dock) return;
      var box = dock.querySelector('#ldPred');
      if (!pred) {
        box.innerHTML = '<form class="ld-new" id="ldNew"><input id="ldQ" maxlength="60" placeholder="Prediction: Will I win this round?"><div class="ld-opts"><input id="ldA" maxlength="20" value="Yes"><input id="ldB" maxlength="20" value="No"></div><button class="btn accent" type="submit">Start prediction</button></form>';
        box.querySelector('#ldNew').onsubmit = function (e) {
          e.preventDefault();
          var q = box.querySelector('#ldQ').value.trim() || 'Will I win this round?';
          pred = { id: uid(), q: q, o: [{ t: box.querySelector('#ldA').value.trim() || 'Yes', p: 0, n: 0 }, { t: box.querySelector('#ldB').value.trim() || 'No', p: 0, n: 0 }], open: true, ends: Date.now() + 60000, win: -1, by: {} };
          sendPred(); paintPred();
          setTimeout(function () { if (pred && pred.open) { pred.open = false; sendPred(); paintPred(); } }, 60000);
        };
        return;
      }
      var tot = pred.o[0].p + pred.o[1].p || 1;
      box.innerHTML = '<div class="ld-q"></div>' + pred.o.map(function (o, i) { return '<div class="ld-bar"><span style="width:' + Math.round(o.p / tot * 100) + '%"></span><b>' + esc(o.t) + '</b><em>' + o.p + ' tickets · ' + o.n + '</em>' + (pred.win < 0 && !pred.open ? '<button type="button" class="btn ghost" data-win="' + i + '">Winner</button>' : '') + '</div>'; }).join('') +
        '<div class="ld-row">' + (pred.open ? '<button type="button" class="btn ghost" id="ldLock">Lock bets</button>' : pred.win >= 0 ? '<button type="button" class="btn ghost" id="ldClear">New prediction</button>' : '<span class="ld-hint">Pick the winner to pay out.</span>') + '<button type="button" class="btn ghost" id="ldCancel">' + (pred.win >= 0 ? 'Close' : 'Cancel and refund') + '</button></div>';
      box.querySelector('.ld-q').textContent = pred.q;
      var lk = box.querySelector('#ldLock'); if (lk) lk.onclick = function () { pred.open = false; sendPred(); paintPred(); };
      var cl = box.querySelector('#ldClear'); if (cl) cl.onclick = function () { pred = null; paintPred(); };
      box.querySelector('#ldCancel').onclick = function () { if (pred.win < 0) { pred.cancel = true; pred.open = false; sendPred(); } pred = null; paintPred(); };
      box.querySelectorAll('[data-win]').forEach(function (b) { b.onclick = function () { pred.win = +b.dataset.win; sendPred(); paintPred(); }; });
    }
    function sendPred() { if (ch && pred) { var p = JSON.parse(JSON.stringify(pred)); delete p.by; ch.send({ type: 'broadcast', event: 'pred', payload: p }); } }
    function onVote(m) {
      if (!pred || !pred.open || m.id !== pred.id || pred.by[m.who]) return;
      var o = pred.o[m.o === 1 ? 1 : 0], amt = Math.max(1, Math.min(10000, Math.round(+m.amt || 0)));
      pred.by[m.who] = 1; o.p += amt; o.n += 1;
      sendPred(); paintPred();
    }
  }

  /* ======================================================================================================
     Watching (live.html)
     ====================================================================================================== */
  function watch(name, ui) {
    var lower = String(name).toLowerCase(), me = uid(), ch = null, pc = null, live = false, ended = false, pred = null, myBet = null, retry = 0;
    var video = ui.video;
    // the stream counts as on once pictures actually arrive
    video.addEventListener('playing', function () { ui.status('live'); });
    video.addEventListener('resize', function () { if (video.videoWidth) ui.status('live'); });
    client(function (c) {
      if (!c) { ui.status('offline', 'Can’t connect right now.'); return; }
      ch = c.channel('live:' + lower, { config: { presence: { key: me } } });
      ch.on('broadcast', { event: 'sig' }, function (e) { var m = e.payload || {}; if (m.to === me) onSig(m.d || {}); });
      ch.on('broadcast', { event: 'live' }, function (e) { if (e.payload && e.payload.on === 0) { live = false; ended = true; close(); ui.status('ended', name + ' ended the stream.'); } else hello(); });
      ch.on('broadcast', { event: 'chat' }, function (e) { var m = e.payload || {}; if (m.n && m.x) ui.chat(m.n, m.x); });
      ch.on('broadcast', { event: 'react' }, function (e) { var m = e.payload || {}; if (REACTS[m.e]) ui.react(REACTS[m.e]); });
      ch.on('broadcast', { event: 'pred' }, function (e) { onPred(e.payload || {}); });
      ch.on('presence', { event: 'sync' }, function () {
        var st = ch.presenceState(), h = null, n = 0;
        Object.keys(st).forEach(function (k) { (st[k] || []).forEach(function (m) { if (m.role === 'host') h = m; else if (m.role === 'viewer') n++; }); });
        ui.meta(h, n);
        if (h && !live) { live = true; hello(); }
        if (!h && live) { live = false; ended = true; close(); ui.status('ended', name + ' ended the stream.'); }
        if (!h && !live && !ended) ui.status('offline', name + ' isn’t live right now.');
        if (h) ended = false;
      });
      ch.subscribe(function (s) { if (s === 'SUBSCRIBED') ch.track({ role: 'viewer', id: me, n: myName() }); });
    });
    function hello() { if (pc) return; ui.status('connecting', 'Joining the stream…'); ch.send({ type: 'broadcast', event: 'hello', payload: { from: me } }); }
    function onSig(d) {
      if (d.sdp && d.sdp.type === 'offer') {
        close();
        ice().then(function (list) {
          pc = new RTCPeerConnection({ iceServers: list });
          pc.ontrack = function (e) { if (video.srcObject !== e.streams[0]) { video.srcObject = e.streams[0]; video.play().catch(function () { ui.status('tap', 'Tap to start watching'); }); } };
          window.__livePc = pc; // tests
          pc.onicecandidate = function (e) { if (e.candidate) ch.send({ type: 'broadcast', event: 'sig', payload: { to: 'host', from: me, d: { c: e.candidate } } }); };
          pc.onconnectionstatechange = function () { if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) { close(); if (live && retry++ < 3) setTimeout(hello, 1500); } };
          return pc.setRemoteDescription(d.sdp).then(function () { return pc.createAnswer(); }).then(function (a) { return pc.setLocalDescription(a); }).then(function () {
            ch.send({ type: 'broadcast', event: 'sig', payload: { to: 'host', from: me, d: { sdp: pc.localDescription } } });
          });
        }).catch(function () { ui.status('offline', 'Couldn’t join the stream.'); });
      } else if (d.c && pc) pc.addIceCandidate(d.c).catch(function () {});
    }
    function close() { if (pc) { try { pc.close(); } catch (e) {} pc = null; } }
    function onPred(p) {
      var was = pred; pred = p;
      if (p.cancel) { if (myBet && myBet.id === p.id) { Tickets.add(myBet.amt); ui.toast('Prediction cancelled. Your ' + myBet.amt + ' tickets are back.'); myBet = null; } pred = null; }
      else if (p.win >= 0 && myBet && myBet.id === p.id && !myBet.paid) {
        myBet.paid = true;
        var side = p.o[p.win].p || 1, pot = p.o[0].p + p.o[1].p;
        if (myBet.o === p.win) { var gain = Math.round(myBet.amt * pot / side); Tickets.add(gain); ui.toast('You won ' + gain + ' tickets!'); } else ui.toast('Not this time. Better luck next round.');
      }
      ui.pred(pred, myBet, Tickets.get());
      if (!was && p && p.open) ui.toast('New prediction: ' + p.q);
    }
    return {
      say: function (x) {
        x = String(x || '').trim().slice(0, 200); if (!x || !ch) return false;
        if (!online()) { var a = A(); if (a && a.welcome) a.welcome('signup', 'Chatting on a stream needs an online account. Make one (free) or log in.'); return false; }
        ch.send({ type: 'broadcast', event: 'chat', payload: { n: myName(), x: x } });
        ui.chat(myName(), x, true); return true;
      },
      react: function (e) { if (ch && REACTS[e]) { ch.send({ type: 'broadcast', event: 'react', payload: { e: e } }); ui.react(REACTS[e]); } },
      bet: function (o, amt) {
        if (!pred || !pred.open || myBet && myBet.id === pred.id) return;
        amt = Math.max(1, Math.min(Tickets.get(), Math.round(amt)));
        if (!amt) return;
        Tickets.add(-amt); myBet = { id: pred.id, o: o, amt: amt };
        ch.send({ type: 'broadcast', event: 'vote', payload: { id: pred.id, o: o, amt: amt, who: me } });
        ui.pred(pred, myBet, Tickets.get());
      },
      tickets: Tickets.get,
      play: function () { if (video.paused) video.play().then(function () { ui.status('live'); }).catch(function () {}); },
    };
  }

  window.ArcadeLive = { host: host, watch: watch, directory: directory, tickets: Tickets, REACTS: REACTS };
})();
