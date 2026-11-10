/* Video calls between players, one-on-one or up to 15 at once (2026-11-10; 15 and group calls 2026-11-11).
   The call set-up rides the account's live connection (account.js): POST /acct/call {to, d} goes to the other
   player's account (anyone who hasn't blocked you), which pushes {t: 'call', n, d, fr} to their open pages
   (fr = you're friends). The video and sound go straight between the browsers (WebRTC, every pair connected to
   each other), so a call costs the server only its few set-up messages, however long it lasts. When two browsers
   can't reach each other directly, Cloudflare's TURN relay carries it: short-lived logins from /acct/turn (off, and
   direct-only, until the owner adds the TURN secrets to the Worker).
   Messages (d.k, all with the call id): 'ring' (an invite with an offer and who's in the call) -> 'ans' (answer;
   from a friend at once, so their camera shows while it rings; otherwise on pick-up) -> 'ok' (picked up) | 'no' |
   'busy'. The host (who started the call; the next in line if they leave) sends 'roster' to everyone when someone
   joins; then each pair not yet connected connects, the alphabetically first name sending 'join' (an offer) and the
   other 'jans'. 'end' leaves the call. Every message carries the sending page's id (dev); 'to' aims one at a page.
   A video link that isn't up after 6 s is retried with an ICE restart ('re' / 'rea'; the answering side asks with
   'kick'), and given up with a message after about 24 s. If you answer on a different device from the one whose
   preview the caller linked to, the caller re-offers to that device ('ring2') and tells the others ('taken').
   Only one tab per player rings (a localStorage claim, the tab you look at wins).
   Screen sharing (2026-11-10): your screen takes your camera's place in every link (replaceTrack, no new offer), a
   shared tab's sound is mixed with your microphone, and 'scr' {on} tells the others to show it whole.
   Bigger calls (2026-11-11): up to 15 people, every pair still linked directly, so each person's video gets smaller
   (bitrate and resolution, bitrate()) as the call grows. A group chat's 📹 button rings everyone in it (start(list,
   name); 'ring' carries the group's name, gn).
   Calls while you play (2026-11-11): a call lives in the page it started on, so while you're in one, links to other
   arcade pages (a game, the home page, the chats) open in a full-page frame over this page instead of leaving it
   (openShell), and the address bar follows the frame. Pages in that frame hand calls to this page (their call.js
   only forwards start()) and share its live connection (account.js). */
(function () {
  var A = window.ArcadeAccount;
  // a page inside the call frame: the page underneath has the call
  try {
    if (window.top !== window && window.top.ArcadeCall && window.top.ArcadeCall.shell) {
      var T = window.top.ArcadeCall;
      window.ArcadeCall = { start: function (n, g) { T.start(n, g); }, active: function () { return T.active(); }, canAdd: function () { return T.canAdd(); }, inFrame: true };
      return;
    }
  } catch (e) {}
  if (!A || !window.RTCPeerConnection || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { window.ArcadeCall = { start: function () { alert('Video calls don’t work in this browser.'); }, active: function () { return false; }, canAdd: function () { return false; } }; return; }
  var STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }], ICE = STUN, iceUntil = 0;
  // relay logins from the server (empty while the relay is off; asked again every 10 minutes then)
  function iceReady() {
    if (Date.now() < iceUntil) return Promise.resolve();
    return A.api('turn', { auth: true }).then(function (r) {
      var on = r.status === 200 && Array.isArray(r.iceServers) && r.iceServers.length;
      ICE = on ? STUN.concat(r.iceServers) : STUN;
      iceUntil = Date.now() + (on ? Math.max(600, (r.ttl || 3600) - 900) : 600) * 1000;
    });
  }
  var TAB = Math.random().toString(36).slice(2, 10), RING_MS = 40000, MAX = 15;
  // C: this page's call { id, host, who: [names in the order they joined], peers: {lower: P}, st: 'ring' | 'live', local, t0,
  //    share (your screen, while sharing), mix (your mic plus the shared tab's sound) }
  // P: one other person { n, pc, remote, st: 'ring' | 'live', out (we called them), offerer (we made this link's offer),
  //    dev (their page), fr, offer, answering, ringT, bad (seconds the video link hasn't been up), tries }
  var C = null;
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  var lc = function (n) { return String(n).toLowerCase(); };
  var me = function () { return A.name(); };

  /* ---------- talking to the others ---------- */
  function send(to, d, keep) { d.id = d.id || (C && C.id); d.dev = TAB; return A.api('call', { method: 'POST', auth: true, body: { to: to, d: d }, keepalive: !!keep }); }
  // to one person's page (once we know which of their pages is in the call)
  function sendP(P, d, keep) { if (P.dev) d.to = P.dev; return send(P.n, d, keep); }
  function gathered(pc) {
    return new Promise(function (r) {
      if (pc.iceGatheringState === 'complete') return r();
      var t = setTimeout(r, 4000);
      pc.addEventListener('icegatheringstatechange', function () { if (pc.iceGatheringState === 'complete') { clearTimeout(t); r(); } });
    });
  }
  function newPc(P) {
    var pc = new RTCPeerConnection({ iceServers: ICE });
    P.pc = pc; P.remote = new MediaStream();
    pc.ontrack = function (e) { if (P.pc === pc) { P.remote.addTrack(e.track); draw(); } };
    pc.onconnectionstatechange = function () {
      if (P.pc !== pc || !C || C.peers[lc(P.n)] !== P) return;
      if (pc.connectionState === 'connected') { P.bad = 0; P.tries = 0; tellShare(); }
      draw();
    };
    return pc;
  }
  // what we send: the screen instead of the camera while sharing, and the mic mixed with the shared tab's sound
  function outTrack(kind) {
    if (kind === 'video' && C.share) return C.share.getVideoTracks()[0] || null;
    if (kind === 'audio' && C.mix) return C.mix.track;
    return (C.local && C.local.getTracks().find(function (x) { return x.kind === kind; })) || null;
  }
  // into an offer, or into the empty senders of an answer (a video slot even without a camera, so a screen can go in later)
  function addLocal(pc) {
    var s = C.local || C.share; if (!s) return;
    var a = outTrack('audio'), v = outTrack('video');
    if (a) pc.addTrack(a, s); else pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (v) pc.addTrack(v, s); else pc.addTransceiver('video', { direction: 'sendrecv' });
  }
  function fillSenders(pc) {
    pc.getTransceivers().forEach(function (t) {
      var kind = t.receiver.track && t.receiver.track.kind, tr = kind && outTrack(kind);
      if (tr && t.sender.track !== tr) t.sender.replaceTrack(tr).catch(function () {});
    });
  }
  function pushOut() { for (var k in C.peers) if (C.peers[k].pc) fillSenders(C.peers[k].pc); bitrate(); }

  /* ---------- sharing your screen ---------- */
  var canShare = !!(navigator.mediaDevices.getDisplayMedia);
  function share() {
    if (!C || C.st !== 'live') return;
    if (C.share) { stopShare(); return; }
    var c = C;
    navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 }, width: { max: 1920 }, height: { max: 1080 } }, audio: true }).then(function (s) {
      var v = s.getVideoTracks()[0];
      if (C !== c || !v) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      try { v.contentHint = 'detail'; } catch (e) {}
      v.addEventListener('ended', function () { if (C === c && C.share === s) stopShare(); });   // the browser's own "Stop sharing"
      C.share = s;
      var sa = s.getAudioTracks()[0]; if (sa) mixIn(sa);
      for (var k in C.peers) C.peers[k].toldShare = false;
      pushOut(); tellShare(); draw();
    }).catch(function (e) {
      if (e && /system/i.test(e.message || '')) alert('Your computer blocked screen sharing. On a Mac: System Settings → Privacy & Security → Screen Recording, turn it on for this browser, then quit and reopen the browser.');
    });
  }
  function stopShare() {
    if (!C || !C.share) return;
    C.share.getTracks().forEach(function (t) { t.stop(); }); C.share = null;
    if (C.mix) { try { C.mix.ctx.close(); } catch (e) {} C.mix = null; }
    for (var k in C.peers) C.peers[k].toldShare = false;
    pushOut(); tellShare(); draw();
  }
  function mixIn(sa) {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)(), dest = ctx.createMediaStreamDestination();
      var mic = C.local && C.local.getAudioTracks()[0];
      if (mic) ctx.createMediaStreamSource(new MediaStream([mic])).connect(dest);   // a muted mic is silence here too
      ctx.createMediaStreamSource(new MediaStream([sa])).connect(dest);
      C.mix = { ctx: ctx, track: dest.stream.getAudioTracks()[0] };
    } catch (e) { C.mix = null; }
  }
  // each person hears once (when their link is up) whether you're sharing
  function tellShare() {
    for (var k in C.peers) {
      var P = C.peers[k];
      if (P.st !== 'live' || !P.pc || P.pc.connectionState !== 'connected' || P.toldShare) continue;
      P.toldShare = true;
      var on = !!C.share;
      if (on || P.seesShare) { sendP(P, { k: 'scr', on: on ? 1 : 0 }); P.seesShare = on; }
    }
  }
  function offer(P) {
    return iceReady().then(function () {
      var pc = newPc(P); P.offerer = true; addLocal(pc); bitrate();
      return pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () { return gathered(pc); }).then(function () { return pc.localDescription.toJSON(); });
    });
  }
  function answerTo(P, sdp) {
    return iceReady().then(function () {
      var old = P.pc, pc = newPc(P); P.offerer = false;
      if (old) try { old.close(); } catch (e) {}
      return pc.setRemoteDescription(sdp).then(function () {
        pc.getTransceivers().forEach(function (t) { t.direction = 'sendrecv'; });
        fillSenders(pc); bitrate();
        return pc.createAnswer();
      }).then(function (a) { return pc.setLocalDescription(a); }).then(function () { return gathered(pc); }).then(function () { return pc.localDescription.toJSON(); });
    });
  }
  // a link that won't come up: new routes on the same connection (ICE restart), offered by whoever made the first offer
  function restart(P) {
    var pc = P.pc, c = C;
    if (!pc || !P.offerer || pc.signalingState !== 'stable') return;
    P.tries = (P.tries || 0) + 1;
    iceReady().then(function () { try { pc.setConfiguration({ iceServers: ICE }); } catch (e) {} return pc.createOffer({ iceRestart: true }); })
      .then(function (o) { return pc.setLocalDescription(o); }).then(function () { return gathered(pc); })
      .then(function () { if (C === c && P.pc === pc) sendP(P, { k: 're', sdp: pc.localDescription.toJSON() }); })
      .catch(function () {});
  }
  function reAnswer(P, sdp) {
    var pc = P.pc, c = C; if (!pc) return;
    iceReady().then(function () { try { pc.setConfiguration({ iceServers: ICE }); } catch (e) {} return pc.setRemoteDescription(sdp); })
      .then(function () { return pc.createAnswer(); }).then(function (a) { return pc.setLocalDescription(a); }).then(function () { return gathered(pc); })
      .then(function () { if (C === c && P.pc === pc) sendP(P, { k: 'rea', sdp: pc.localDescription.toJSON() }); })
      .catch(function () {});
  }
  // every second: a live link that isn't up gets retried at 6 s and 14 s, and given up at 24 s; late joiners hear about a shared screen
  setInterval(function () {
    if (!C || C.st !== 'live') return;
    tellShare(); // anyone who joined (or whose link came up) since you started sharing
    for (var k in C.peers) {
      var P = C.peers[k]; if (P.st !== 'live' || !P.pc) continue;
      if (P.pc.connectionState === 'connected') { P.bad = 0; continue; }
      P.bad = (P.bad || 0) + 1;
      if (P.bad === 6 || P.bad === 14) { if (P.offerer) restart(P); else sendP(P, { k: 'kick' }); }
      if (P.bad >= 24) { lost(P, 'Couldn’t connect the video with ' + P.n + '. Check both of your connections and try again.'); continue; }
      draw();
    }
  }, 1000);
  // more people, less video each, so everyone's upload keeps up
  // (a shared screen gets more, and keeps its sharpness over smoothness, so text stays readable)
  function bitrate() {
    if (!C) return;
    var n = Object.keys(C.peers).length, scr = !!C.share;
    // every other person gets their own copy of your video, so a big call sends each one less (and smaller)
    var max = scr ? (n <= 1 ? 1800000 : n === 2 ? 1200000 : n <= 3 ? 900000 : n <= 7 ? 600000 : 400000)
      : (n <= 1 ? 900000 : n === 2 ? 600000 : n === 3 ? 450000 : n <= 5 ? 300000 : n <= 8 ? 200000 : 130000);
    var down = scr ? 1 : n <= 3 ? 1 : n <= 5 ? 1.5 : n <= 9 ? 2 : 3;
    for (var k in C.peers) {
      var pc = C.peers[k].pc; if (!pc) continue;
      pc.getSenders().forEach(function (s) {
        if (!s.track || s.track.kind !== 'video' || !s.getParameters) return;
        var p = s.getParameters(); if (!p.encodings || !p.encodings.length) return;
        p.encodings[0].maxBitrate = max; p.encodings[0].scaleResolutionDownBy = down; p.degradationPreference = scr ? 'maintain-resolution' : 'balanced';
        s.setParameters(p).catch(function () {});
      });
    }
  }
  function media() {
    var v = { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' }, a = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    return navigator.mediaDevices.getUserMedia({ video: v, audio: a })
      .catch(function () { return navigator.mediaDevices.getUserMedia({ audio: a }); });
  }
  function hearing(on) { if (C && C.local) C.local.getAudioTracks().forEach(function (t) { t.enabled = on && !C.micOff; }); }
  function live() { var o = []; for (var k in C.peers) if (C.peers[k].st === 'live') o.push(C.peers[k]); return o; }

  /* ---------- calling someone, or adding them to your call ---------- */
  // n: one name, or a list (a group chat's members, with its name g)
  function start(n, g) {
    if (A.kind() !== 'online') { A.welcome('signup'); return; }
    var list = (Array.isArray(n) ? n : [n]).map(String).filter(function (x) { return x && lc(x) !== lc(me()); });
    if (!list.length) return;
    if (C) { if (C.st === 'live') list.forEach(function (x) { if (canAdd()) add(x); }); else alert('Answer or decline the call first.'); return; }
    if (busyElsewhere()) { alert('You are in a call in another tab.'); return; }
    if (list.length > MAX - 1) { alert('A call can have up to ' + MAX + ' people, so the first ' + (MAX - 1) + ' are being called.'); list = list.slice(0, MAX - 1); }
    C = { id: Math.random().toString(36).slice(2, 12), host: me(), who: [me()], peers: {}, st: 'live', t0: 0, gn: typeof g === 'string' ? g.slice(0, 40) : '' };
    var c = C;
    draw(); status('Turning on your camera…');
    Promise.all([media(), iceReady()]).then(function (got) {
      var s = got[0];
      if (C !== c) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      C.local = s; hearing(false); draw(); list.forEach(function (x) { add(x); });
    }).catch(function () { if (C === c) finish('Your browser didn’t let the arcade use your camera or microphone. Allow them and try again.'); });
    busyMark();
  }
  function canAdd() { return !!(C && C.st === 'live' && C.local && lc(C.host) === lc(me()) && Object.keys(C.peers).length < MAX - 1); }
  function add(n) {
    if (!C) return start(n);
    var k = lc(n);
    if (C.peers[k]) return;
    if (lc(C.host) !== lc(me())) { alert('Only ' + C.host + ', who started the call, can add people.'); return; }
    if (Object.keys(C.peers).length >= MAX - 1) { alert('A call can have up to ' + MAX + ' people.'); return; }
    var c = C, P = C.peers[k] = { n: n, st: 'ring', out: true };
    draw(); status('');
    offer(P).then(function (sdp) {
      if (C !== c || C.peers[k] !== P) return;
      return send(n, { k: 'ring', sdp: sdp, who: C.who.slice(), gn: C.gn || '' }).then(function (r) {
        if (C !== c || C.peers[k] !== P) return;
        if (r.status !== 200) drop(P, r.error === 'you_blocked' ? 'You blocked ' + n + '. Unblock them on their profile to call.' : r.error === 'no_account' ? 'There’s no player called ' + n + '.' : r.error === 'slow' ? 'You’re calling a lot. Wait a minute and try again.' : 'Couldn’t reach the server. Check your connection.');
        else if (!r.on) drop(P, C.gn ? '' : n + ' isn’t on the arcade right now.'); // a group call doesn't list everyone who's away
        else { P.fr = !!r.fr; draw(); }
      });
    }).catch(function () { if (C === c) drop(P, 'Couldn’t call ' + n + '.'); });
    P.ringT = setTimeout(function () { if (C === c && C.peers[k] === P && P.st === 'ring') { sendP(P, { k: 'end' }); drop(P, C.gn ? '' : 'No answer from ' + n + '.'); } }, RING_MS);
  }

  /* ---------- messages from the others ---------- */
  function got(from, d, fr) {
    if (!d || typeof d.id !== 'string') return;
    if (d.to && d.to !== TAB) return;
    var k = lc(from);
    if (d.k === 'ring') {
      if (C && C.id === d.id) return;
      if (C || busyElsewhere()) { claim(d.id, function () { send(from, { k: 'busy', id: d.id }); }); return; }
      claim(d.id, function () { ringIn(from, d, fr); });
      return;
    }
    if (!C || C.id !== d.id) return;
    var P = C.peers[k];
    if (d.k === 'ans' && P && P.out && P.pc && !P.pc.currentRemoteDescription && (!P.dev || P.dev === d.dev)) { P.dev = d.dev; P.pc.setRemoteDescription(d.sdp).catch(function () {}); }
    else if (d.k === 'ok' && P && P.out && P.st === 'ring') {
      P.st = 'live'; clearTimeout(P.ringT);
      if (C.who.indexOf(P.n) < 0) C.who.push(P.n);
      send(P.n, { k: 'taken', by: d.dev }); // their other pages stop ringing
      if (P.dev && d.dev && P.dev !== d.dev) {
        // they answered on a different device from the one showing our preview: link to that one instead
        var c2 = C; P.dev = d.dev;
        try { P.pc.close(); } catch (e) {}
        offer(P).then(function (sdp) { if (C === c2 && C.peers[k] === P) sendP(P, { k: 'ring2', sdp: sdp }); });
      }
      goLive(); sendRoster();
    }
    else if (d.k === 'taken' && C.st === 'ring' && d.by !== TAB) finish('');
    else if (d.k === 'ring2' && P && C.st === 'live') { var c3 = C; answerTo(P, d.sdp).then(function (sdp) { if (C === c3 && C.peers[k] === P) sendP(P, { k: 'ans', sdp: sdp }); }); }
    else if (d.k === 're' && P && P.pc && (!P.dev || P.dev === d.dev)) reAnswer(P, d.sdp);
    else if (d.k === 'rea' && P && P.pc && P.pc.signalingState === 'have-local-offer') P.pc.setRemoteDescription(d.sdp).catch(function () {});
    else if (d.k === 'scr' && P) { P.screen = !!d.on; draw(); }
    else if (d.k === 'kick' && P && P.offerer && P.st === 'live' && P.pc && P.pc.connectionState !== 'connected' && (P.bad || 0) >= 3 && (P.tries || 0) < 3) restart(P);
    else if (d.k === 'no' && P && P.st === 'ring') drop(P, from + ' declined the call.');
    else if (d.k === 'busy' && P && P.st === 'ring') drop(P, from + ' is in another call.');
    else if (d.k === 'end') {
      if (C.st === 'ring') finish(lc(C.host) === k ? 'Missed call from ' + C.host + '.' : '');
      else if (P && (!P.dev || !d.dev || P.dev === d.dev)) drop(P, P.st === 'live' ? from + ' left the call.' : '');
    }
    else if (d.k === 'roster' && Array.isArray(d.who) && C.st === 'live') roster(d.who.map(String).slice(0, MAX), from);
    else if (d.k === 'join' && C.st === 'live' && !P && Object.keys(C.peers).length < MAX - 1) {
      // someone new in the call connects to us: answer with our camera straight away
      var c = C, J = C.peers[k] = { n: from, st: 'live', out: false, dev: d.dev };
      if (C.who.indexOf(from) < 0) C.who.push(from);
      answerTo(J, d.sdp).then(function (sdp) { if (C === c && C.peers[k] === J) sendP(J, { k: 'jans', sdp: sdp }); draw(); }).catch(function () { if (C === c) drop(J, ''); });
      draw();
    }
    else if (d.k === 'jans' && P && P.joining && P.pc && !P.pc.currentRemoteDescription) { P.dev = d.dev; P.pc.setRemoteDescription(d.sdp).catch(function () {}); P.joining = false; }
  }
  // the host tells everyone who's in the call; each pair not yet connected connects
  function sendRoster() {
    if (!C || lc(C.host) !== lc(me())) return;
    var who = [me()].concat(live().map(function (P) { return P.n; }));
    C.who = who;
    live().forEach(function (P) { sendP(P, { k: 'roster', who: who, host: C.host }); });
    draw();
  }
  function roster(who, from) {
    C.who = who;
    if (lc(from) === lc(C.host) || !C.peers[lc(C.host)]) C.host = who[0];
    var c = C;
    who.forEach(function (n) {
      var k = lc(n);
      if (k === lc(me()) || C.peers[k] || lc(me()) > k) return; // the alphabetically first of each pair makes the offer
      var P = C.peers[k] = { n: n, st: 'live', out: false, joining: true };
      offer(P).then(function (sdp) { if (C === c && C.peers[k] === P) send(n, { k: 'join', sdp: sdp }); }).catch(function () { if (C === c) drop(P, ''); });
    });
    draw();
  }

  /* ---------- being called ---------- */
  function ringIn(from, d, fr) {
    if (C) return;
    var who = (Array.isArray(d.who) ? d.who.map(String) : [from]).slice(0, MAX);
    C = { id: d.id, host: from, who: who, peers: {}, st: 'ring', fr: !!fr, gn: typeof d.gn === 'string' ? d.gn.slice(0, 40) : '' };
    var c = C, P = C.peers[lc(from)] = { n: from, st: 'ring', out: false, fr: !!fr, offer: d.sdp, dev: d.dev };
    // a friend's camera shows while it rings; anyone else's only once you pick up
    if (fr) answerIn(P).then(function (sdp) { if (C === c && sdp) sendP(P, { k: 'ans', sdp: sdp }); });
    drawRing();
    ringTone(true); flashTitle(true);
    c.ringT = setTimeout(function () { if (C === c && C.st === 'ring') finish('Missed call from ' + from + '.'); }, RING_MS + 2000);
    busyMark();
  }
  function answerIn(P) {
    if (P.answering) return P.answering;
    var c = C;
    return (P.answering = answerTo(P, P.offer).then(function (sdp) { return C === c ? sdp : null; }).catch(function () { if (C === c) finish('The call couldn’t connect.'); return null; }));
  }
  function accept() {
    if (!C || C.st !== 'ring') return;
    var c = C, P = C.peers[lc(C.host)];
    ringTone(false); flashTitle(false); clearTimeout(c.ringT);
    var r = $('acRing'); if (r) r.remove();
    C.st = 'live'; C.t0 = Date.now();
    draw(); status('Turning on your camera…');
    media().catch(function () { return null; }).then(function (s) {
      if (C !== c) { if (s) s.getTracks().forEach(function (t) { t.stop(); }); return; }
      C.local = s; if (!s) status('', 'Your camera and microphone are off. Allow them in the browser to be seen and heard.'); else status('');
      if (P.answering) { fillSenders(P.pc); return; }   // a friend: already answered, now send our camera
      return answerIn(P).then(function (sdp) { if (C === c && sdp) return sendP(P, { k: 'ans', sdp: sdp }); });
    }).then(function () {
      if (C !== c) return;
      P.st = 'live'; bitrate(); hearing(true);
      sendP(P, { k: 'ok' }); goLive();
    });
  }
  function decline() { if (!C || C.st !== 'ring') return; var P = C.peers[lc(C.host)]; if (P) sendP(P, { k: 'no' }); finish(''); }
  function declineBlock() {
    if (!C) return; var n = C.host;
    if (!confirm('Block ' + n + '? They won’t be able to call you, message you or send you friend requests. They aren’t told.')) return;
    decline(); A.api('block', { method: 'POST', auth: true, body: { name: n, on: true } });
  }

  /* ---------- in the call ---------- */
  function goLive() {
    if (!C) return;
    if (!C.t0) C.t0 = Date.now();
    hearing(true); bitrate(); draw();
  }
  function hangUp() {
    if (!C) return;
    for (var k in C.peers) sendP(C.peers[k], { k: 'end' });
    finish('');
  }
  // one person gone (declined, left, or their connection failed); the call goes on while anyone's left
  function drop(P, msg) {
    if (!C) return;
    var k = lc(P.n); if (C.peers[k] !== P) return;
    clearTimeout(P.ringT); clearTimeout(P.dropT);
    try { P.pc && P.pc.close(); } catch (e) {}
    delete C.peers[k];
    C.who = C.who.filter(function (n) { return lc(n) !== k; });
    if (lc(C.host) === k) C.host = C.who[0] || me();
    if (!Object.keys(C.peers).length) { finish(msg || (C.t0 ? 'Everyone left the call.' : C.gn ? 'Nobody in ' + C.gn + ' picked up.' : ''), P.n); return; }
    if (msg) A.toast(P.n, msg, 'players.html#p=' + encodeURIComponent(P.n));
    if (lc(C.host) === lc(me())) sendRoster();
    bitrate(); draw();
  }
  function lost(P, msg) { sendP(P, { k: 'end' }); drop(P, msg); }
  function finish(msg, about) {
    if (!C) return;
    var c = C; C = null;
    clearTimeout(c.ringT); ringTone(false); flashTitle(false);
    for (var k in c.peers) { var P = c.peers[k]; clearTimeout(P.ringT); clearTimeout(P.dropT); try { P.pc && P.pc.close(); } catch (e) {} }
    if (c.local) c.local.getTracks().forEach(function (t) { t.stop(); });
    if (c.share) c.share.getTracks().forEach(function (t) { t.stop(); });
    if (c.mix) try { c.mix.ctx.close(); } catch (e) {}
    ['acRing', 'acCall'].forEach(function (id) { var e = $(id); if (e) e.remove(); });
    try { localStorage.removeItem('arcade-call-busy'); } catch (e) {}
    var other = about || c.who.filter(function (n) { return lc(n) !== lc(me()); })[0] || c.host;
    if (msg) A.toast(other, msg, 'players.html#p=' + encodeURIComponent(other));
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
      '#acRing .acc-who .acc-with{display:block;color:#a9a3c9;font-size:12.5px}' +
      '#acRing .acc-av,#acCall .acc-av{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#6c5ce7,#00d2a8);font-weight:800}' +
      '#acRing .acc-av{animation:acPulse 1.2s ease-in-out infinite}@keyframes acPulse{50%{box-shadow:0 0 0 7px rgba(0,210,168,.25)}}' +
      '#acRing .acc-note{padding:0 14px 10px;color:#9a94bd;font-size:12px}' +
      '#acRing .acc-btns{display:flex;gap:8px;padding:0 12px 12px}#acRing button{flex:1;border:0;border-radius:11px;padding:11px;font:800 14px system-ui,sans-serif;color:#fff;cursor:pointer}' +
      '#acRing .acc-yes{background:#00b894}#acRing .acc-no{background:#e8344c}#acRing button:hover{filter:brightness(1.1)}' +
      '#acRing .acc-block{flex:none;background:transparent;border:1px solid #ffffff33!important;color:#ff9a9a!important}#acRing .acc-who .acc-tag{display:table;margin-top:5px;font:700 11px/1 system-ui,sans-serif;font-style:normal;color:#ffcf6b;background:#ffcf6b1f;border:1px solid #ffcf6b55;padding:3px 7px;border-radius:6px}' +
      '#acCall{position:fixed;right:14px;bottom:14px;z-index:2147483100;width:min(360px,calc(100vw - 28px));border-radius:16px;overflow:hidden;background:#0b0a18;border:1px solid #6c5ce7;box-shadow:0 16px 44px #000c;color:#f1effa;font:14px/1.35 system-ui,sans-serif;animation:acRi .3s ease-out}' +
      '#acCall.acc-big{width:min(720px,calc(100vw - 28px))}#acCall.acc-grp{width:min(440px,calc(100vw - 28px))}#acCall.acc-grp.acc-big{width:min(860px,calc(100vw - 28px))}' +
      '#acCall .acc-stage{position:relative;aspect-ratio:16/9;overflow:hidden;background:#14122a;display:grid;gap:2px}' +
      '#acCall .acc-stage.n2{grid-template-columns:1fr 1fr}#acCall .acc-stage.n3{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}' +
      '#acCall.acc-many{width:min(560px,calc(100vw - 28px))}#acCall.acc-many.acc-big{width:min(1040px,calc(100vw - 28px))}#acCall.acc-many .acc-tile .acc-tn{font-size:11px;padding:3px 6px;left:4px;bottom:4px}' +
      '#acCall.acc-min .acc-stage,#acCall.acc-min #acCallMe,#acCall.acc-min #acCallOver{display:none}#acCall.acc-min{width:min(420px,calc(100vw - 28px))}' +
      '#accShell{position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147482900;background:#0f0d1f}' +
      '#acCall .acc-tile{position:relative;min-width:0;min-height:0;overflow:hidden;background:#1b1838}#acCall .acc-tile video{width:100%;height:100%;object-fit:cover;display:block}' +
      '#acCall .acc-tile .acc-tn{position:absolute;left:8px;bottom:8px;font:700 12px/1 system-ui,sans-serif;background:rgba(11,10,24,.72);padding:5px 8px;border-radius:7px;max-width:calc(100% - 16px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#acCall .acc-tile .acc-ts{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#d9d4f3;font-size:12.5px;text-align:center;padding:10px}' +
      '#acCall .acc-unmute{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:0;border-radius:12px;padding:10px 16px;background:#6c5ce7;color:#fff;font:800 14px system-ui,sans-serif;cursor:pointer;z-index:2}' +
      '#acCall .acc-me{position:absolute;right:8px;top:8px;width:26%;aspect-ratio:16/9;border-radius:9px;overflow:hidden;border:2px solid #ffffff55;background:#000;z-index:3}#acCall .acc-me video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block}' +
      '#acCall .acc-me.acc-solo{inset:0;width:auto;border:0;border-radius:0}' +
      '#acCall .acc-over{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;padding:12px;background:linear-gradient(transparent,rgba(11,10,24,.55));z-index:4}' +
      '#acCall .acc-over b{font-size:17px;text-shadow:0 1px 6px #000}#acCall .acc-over span{color:#d9d4f3;font-size:12.5px;text-shadow:0 1px 6px #000}' +
      '#acCall .acc-bar{display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(27,24,53,.97)}#acCall .acc-bar .acc-nm{flex:1;min-width:0;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#acCall .acc-bar .acc-tm{color:#a9a3c9;font:600 12px ui-monospace,Menlo,monospace;margin-left:6px}' +
      '#acCall .acc-bar button{border:0;border-radius:10px;width:38px;height:34px;background:#ffffff14;color:#fff;cursor:pointer;font-size:16px;display:grid;place-items:center;flex:none}#acCall .acc-bar button:hover{background:#ffffff26}' +
      '#acCall .acc-bar button.acc-on{background:#00b894}#acCall .acc-tile.acc-scr video{object-fit:contain;background:#000}#acCall .acc-tile.acc-wide{order:-1}#acCall .acc-stage.n3 .acc-tile.acc-wide{grid-column:span 2}' +
      '#acCall .acc-me.acc-scr video{transform:none;object-fit:contain}' +
      '#acCall .acc-bar button.acc-off{background:#e8344c55}#acCall .acc-bar button.acc-end{background:#e8344c;width:46px}#acCall .acc-bar button[hidden]{display:none}' +
      '#acCall .acc-bar svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
      '#acCall .acc-add{display:flex;flex-direction:column;gap:8px;padding:10px;background:rgba(27,24,53,.97);border-top:1px solid #ffffff14}' +
      '#acCall .acc-add form{display:flex;gap:6px}#acCall .acc-add input{flex:1;min-width:0;border-radius:9px;border:1px solid #ffffff2a;background:#0b0a18;color:#fff;padding:8px 10px;font:14px system-ui,sans-serif}' +
      '#acCall .acc-add form button,#acCall .acc-add .acc-chips button{border:0;border-radius:9px;padding:8px 12px;background:#6c5ce7;color:#fff;font:700 13px system-ui,sans-serif;cursor:pointer}' +
      '#acCall .acc-add .acc-chips{display:flex;flex-wrap:wrap;gap:6px}#acCall .acc-add .acc-chips button{background:#ffffff14;font-weight:600}#acCall .acc-add .acc-hint{color:#9a94bd;font-size:12px}';
    document.head.appendChild(st);
  }
  var ICON = {
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    micOff: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/></svg>',
    camOff: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3M3 3l18 18"/></svg>',
    screen: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M12 13V7M9 10l3-3 3 3"/></svg>',
    add: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 20c1-4 4-6 7-6s6 2 7 6M19 8v6M16 11h6"/></svg>',
    big: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    end: '<svg viewBox="0 0 24 24"><path d="M3 15c5-5 13-5 18 0l-2 3-4-2v-3c-2-1-4-1-6 0v3l-4 2z"/></svg>',
    min: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>'
  };
  function avatar(n) { return el('span', 'acc-av', String(n).charAt(0).toUpperCase()); }
  function names(list) { return list.length <= 1 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }
  function drawRing() {
    css();
    var P = C.peers[lc(C.host)], others = C.who.filter(function (n) { return lc(n) !== lc(C.host); });
    var box = el('div'); box.id = 'acRing'; box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-label', C.host + ' is video calling you');
    if (C.fr) {
      var vid = el('div', 'acc-vid'), v = el('video'); v.id = 'acRingVid'; v.autoplay = true; v.muted = true; v.playsInline = true;
      vid.appendChild(v); vid.appendChild(el('span', 'acc-live', 'LIVE')); var w = el('span', 'acc-wait', 'Connecting to ' + C.host + '’s camera…'); w.id = 'acRingWait'; vid.appendChild(w);
      box.appendChild(vid);
      v.onplaying = function () { w.remove(); };
      setTimeout(function () { if (P && P.remote && v.srcObject !== P.remote) { v.srcObject = P.remote; v.play().catch(function () {}); } }, 0);
    }
    var who = el('div', 'acc-who'), t = el('div'); t.appendChild(el('b', '', C.host)); t.appendChild(document.createElement('br'));
    t.appendChild(el('span', '', C.gn ? 'is calling ' + C.gn : others.length ? 'is calling you into a group call' : 'is video calling you'));
    if (others.length) t.appendChild(el('span', 'acc-with', 'with ' + (others.length > 4 ? others.slice(0, 3).join(', ') + ' and ' + (others.length - 3) + ' others' : names(others))));
    if (!C.fr) t.appendChild(el('em', 'acc-tag', 'Not your friend'));
    who.appendChild(avatar(C.host)); who.appendChild(t);
    var note = el('div', 'acc-note', C.fr ? 'They can’t see or hear you until you accept.' : 'You’ll see their camera if you accept. They can’t see or hear you until then.');
    var btns = el('div', 'acc-btns'), yes = el('button', 'acc-yes', 'Accept'), no = el('button', 'acc-no', 'Decline');
    yes.type = no.type = 'button'; yes.onclick = accept; no.onclick = decline;
    btns.appendChild(yes); btns.appendChild(no);
    if (!C.fr) { var bl = el('button', 'acc-block', 'Block'); bl.type = 'button'; bl.title = 'Decline and block ' + C.host; bl.onclick = declineBlock; btns.appendChild(bl); }
    box.appendChild(who); box.appendChild(note); box.appendChild(btns);
    document.body.appendChild(box);
  }
  // the call window: a tile for each other person, you in the corner, the buttons underneath
  function draw() {
    if (!C) return;
    var ring = $('acRingVid'), host = C.peers[lc(C.host)];
    if (ring && host && host.remote && ring.srcObject !== host.remote) { ring.srcObject = host.remote; ring.play().catch(function () {}); }
    if (C.st !== 'live') return;
    css();
    var box = $('acCall');
    if (!box) {
      box = el('div'); box.id = 'acCall';
      box.innerHTML = '<div class="acc-stage" id="acStage"></div><div class="acc-me" id="acCallMe"><video id="acCallLocal" autoplay playsinline muted></video></div><div class="acc-over" id="acCallOver"></div>' +
        '<div class="acc-bar"><span class="acc-nm" id="acCallNm"></span><button type="button" id="acMic" title="Mute your microphone">' + ICON.mic + '</button><button type="button" id="acCam" title="Turn your camera off">' + ICON.cam + '</button><button type="button" id="acShare" title="Share your screen">' + ICON.screen + '</button><button type="button" id="acAdd" title="Add someone to the call">' + ICON.add + '</button><button type="button" id="acBig" title="Bigger">' + ICON.big + '</button><button type="button" id="acMin" title="Hide the video (the call goes on)">' + ICON.min + '</button><button type="button" class="acc-end" id="acEnd" title="Leave the call">' + ICON.end + '</button></div>';
      // the corner picture and the message sit over the tiles
      var wrap = el('div'); wrap.style.position = 'relative';
      box.insertBefore(wrap, box.firstChild); ['acStage', 'acCallMe', 'acCallOver'].forEach(function (id) { wrap.appendChild(box.querySelector('#' + id)); });
      document.body.appendChild(box);
      $('acMic').onclick = function () { if (!C) return; C.micOff = !C.micOff; hearing(live().length > 0); this.classList.toggle('acc-off', C.micOff); this.innerHTML = C.micOff ? ICON.micOff : ICON.mic; };
      $('acCam').onclick = function () { if (!C) return; C.camOff = !C.camOff; if (C.local) C.local.getVideoTracks().forEach(function (t) { t.enabled = !C.camOff; }); this.classList.toggle('acc-off', C.camOff); this.innerHTML = C.camOff ? ICON.camOff : ICON.cam; };
      $('acAdd').onclick = toggleAdd;
      $('acShare').onclick = share;
      $('acBig').onclick = function () { box.classList.remove('acc-min'); box.classList.toggle('acc-big'); };
      $('acMin').onclick = function () { box.classList.toggle('acc-min'); this.title = box.classList.contains('acc-min') ? 'Show the video' : 'Hide the video (the call goes on)'; };
      $('acEnd').onclick = hangUp;
    }
    var ps = []; for (var k in C.peers) ps.push(C.peers[k]);
    // a shared screen gets the big spot (in a group of three, the wide top tile)
    var wide = ps.filter(function (P) { return P.screen && P.st === 'live'; })[0] || ps[0];
    var stage = $('acStage'), np = Math.max(1, ps.length);
    stage.className = 'acc-stage n' + Math.min(3, np);
    // 4 or more: a grid with as many columns as it needs (2x2, 3x3, 4x4), the stage getting taller to fit
    if (np >= 4) { var cols = np <= 4 ? 2 : np <= 9 ? 3 : 4, rows = Math.ceil(np / cols); stage.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)'; stage.style.gridTemplateRows = 'repeat(' + rows + ',1fr)'; stage.style.aspectRatio = (16 * cols) + '/' + (9 * rows); }
    else { stage.style.gridTemplateColumns = stage.style.gridTemplateRows = stage.style.aspectRatio = ''; }
    box.classList.toggle('acc-grp', ps.length > 1); box.classList.toggle('acc-many', ps.length >= 4);
    // keep each person's tile (and its playing video) between redraws
    var keep = {};
    ps.forEach(function (P) {
      var t = P.tile;
      if (!t) {
        t = P.tile = el('div', 'acc-tile'); var v = el('video'); v.autoplay = true; v.playsInline = true; v.muted = true; t.appendChild(v);
        t.appendChild(el('span', 'acc-tn', P.n)); var s = el('div', 'acc-ts'); t.appendChild(s);
      }
      t.classList.toggle('acc-scr', !!P.screen); t.classList.toggle('acc-wide', P === wide);
      t.querySelector('.acc-tn').textContent = P.screen ? P.n + ' · sharing their screen' : P.n;
      var v2 = t.querySelector('video'), s2 = t.querySelector('.acc-ts');
      if (P.remote && v2.srcObject !== P.remote) { v2.srcObject = P.remote; }
      var on = P.st === 'live' && C.st === 'live';
      if (on && v2.muted && !v2.dataset.forced) { v2.muted = false; }
      playV(v2);
      var cs = P.pc ? P.pc.connectionState : 'new';
      s2.replaceChildren();
      if (P.st === 'ring' && P.out) { s2.appendChild(avatar(P.n)); s2.appendChild(el('span', '', 'Ringing ' + P.n + '…')); }
      else if (cs !== 'connected') s2.appendChild(el('span', '', (P.bad || 0) < 6 ? 'Connecting video…' : P.bad < 14 ? 'Still connecting… trying another route' : 'Trying one more time…'));
      s2.style.display = s2.childNodes.length ? 'flex' : 'none';
      v2.style.visibility = P.st === 'live' || !P.out ? 'visible' : 'hidden';
      keep[lc(P.n)] = 1;
      if (t.parentNode !== stage) stage.appendChild(t);
    });
    [].slice.call(stage.children).forEach(function (t) { var ok = ps.some(function (P) { return P.tile === t; }); if (!ok) t.remove(); });
    // until somebody picks up, your own camera fills the window
    var anyone = ps.some(function (P) { return P.st === 'live'; });
    $('acCallMe').classList.toggle('acc-solo', !anyone);
    stage.style.visibility = anyone || ps.length > 1 ? 'visible' : 'hidden';
    if (!anyone && ps.length === 1 && ps[0].st === 'ring') status('Calling ' + ps[0].n + '…', ps[0].fr ? ps[0].n + ' can see your camera while it rings.' : ps[0].n + ' sees your camera once they pick up.');
    else if (anyone && $('acCallOver').textContent.indexOf('Calling') === 0) status('');
    var nm = $('acCallNm'), list = ps.map(function (P) { return P.n; });
    nm.textContent = list.length ? names(list) : 'Video call'; var tm = el('span', 'acc-tm'); tm.id = 'acCallTm'; nm.appendChild(tm);
    $('acAdd').hidden = !canAdd();
    if ($('acAddBox') && !canAdd()) $('acAddBox').remove();
    // your corner shows what you're sending: your camera, or your screen while sharing
    var lv = $('acCallLocal'), mine = C.share || C.local; if (lv && mine && lv.srcObject !== mine) { lv.srcObject = mine; lv.play().catch(function () {}); }
    $('acCallMe').classList.toggle('acc-scr', !!C.share);
    var sb = $('acShare'); sb.hidden = !canShare; sb.classList.toggle('acc-on', !!C.share); sb.title = C.share ? 'Stop sharing your screen' : 'Share your screen';
  }
  function status(title, sub) {
    var o = $('acCallOver'); if (!o) return;
    o.replaceChildren(); o.style.display = title || sub ? 'flex' : 'none';
    if (title) o.appendChild(el('b', '', title)); if (sub) o.appendChild(el('span', '', sub));
  }
  // a browser that won't start someone's video with sound starts it muted, with a button to turn the sound on
  function playV(v) {
    if (!v.paused && v.srcObject) return;
    var p = v.play(); if (!p || !p.catch) return;
    p.catch(function () {
      if (v.muted || !v.srcObject) return;
      v.muted = true; v.dataset.forced = '1'; v.play().catch(function () {});
      var t = v.parentNode; if (!t || t.querySelector('.acc-unmute')) return;
      var b = el('button', 'acc-unmute', '🔊 Tap for sound'); b.type = 'button';
      b.onclick = function () { v.muted = false; delete v.dataset.forced; v.play().catch(function () {}); b.remove(); };
      t.appendChild(b);
    });
  }
  // adding someone: type a name, or pick one of your friends
  function toggleAdd() {
    var box = $('acCall'), cur = $('acAddBox');
    if (cur) { cur.remove(); return; }
    if (!canAdd()) return;
    var a = el('div', 'acc-add'); a.id = 'acAddBox';
    var f = el('form'), inp = el('input'), go = el('button', '', 'Call');
    inp.placeholder = 'Player name'; inp.maxLength = 16; inp.autocomplete = 'off'; inp.spellcheck = false; go.type = 'submit';
    f.appendChild(inp); f.appendChild(go);
    f.onsubmit = function (e) { e.preventDefault(); var n = inp.value.trim(); if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) { inp.focus(); return; } a.remove(); add(n); };
    var chips = el('div', 'acc-chips'), hint = el('div', 'acc-hint', 'Up to ' + MAX + ' people in a call (' + (MAX - 1 - Object.keys(C.peers).length) + ' more).');
    a.appendChild(f); a.appendChild(chips); a.appendChild(hint);
    box.appendChild(a); inp.focus();
    A.api('social', { auth: true }).then(function (r) {
      if (!a.isConnected || r.status !== 200 || !r.f) return;
      Object.keys(r.f).filter(function (k) { return r.f[k].st === 'f' && !(C && C.peers[k]); }).slice(0, 12).forEach(function (k) {
        var b = el('button', '', r.f[k].n); b.type = 'button'; b.onclick = function () { a.remove(); add(r.f[k].n); }; chips.appendChild(b);
      });
    });
  }
  setInterval(function () {
    var t = $('acCallTm'); if (t && C && C.st === 'live' && C.t0 && live().length) { var s = Math.floor((Date.now() - C.t0) / 1000); t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
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
    flash.title = document.title; var who = C.host, k = 0;
    flash.t = setInterval(function () { document.title = k++ % 2 ? flash.title : '📹 ' + who + ' is calling…'; }, 1000);
  }

  /* ---------- carrying on the call while you play ---------- */
  var shell = null;
  function openShell(href) {
    css();
    if (!shell) {
      shell = document.createElement('iframe'); shell.id = 'accShell'; shell.title = 'The Arcade';
      shell.setAttribute('allow', 'autoplay; fullscreen; gamepad; microphone; camera; display-capture; clipboard-write; screen-wake-lock');
      shell.setAttribute('allowfullscreen', '');
      shell.addEventListener('load', function () {
        try { var w = shell.contentWindow; history.replaceState(null, '', w.location.href); document.title = w.document.title; } catch (e) {}
      });
      document.body.appendChild(shell);
      document.documentElement.style.overflow = 'hidden';
    }
    shell.src = href;
  }
  window.ArcadeShellFrame = function () { try { return shell && shell.contentWindow; } catch (e) { return null; } };
  document.addEventListener('click', function (e) {
    if (!C || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || (a.closest && a.closest('#acCall,#acRing'))) return;
    var u; try { u = new URL(a.href, location.href); } catch (x) { return; }
    if (u.origin !== location.origin || !/(\.html|\/)$/.test(u.pathname)) return;
    if (!shell && u.pathname === location.pathname && u.search === location.search) return; // a link within this page
    e.preventDefault(); openShell(u.href);
  }, true);

  // leaving the page leaves the call
  addEventListener('beforeunload', function (e) { if (C && C.st === 'live' && live().length) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('pagehide', function () { if (!C) return; if (C.st === 'ring') { var H = C.peers[lc(C.host)]; if (H) sendP(H, { k: 'no' }, true); } else for (var k in C.peers) sendP(C.peers[k], { k: 'end' }, true); });

  A.onLive(function (m) { if (m && m.t === 'call' && m.n) got(m.n, m.d, m.fr); });
  window.ArcadeCall = {
    start: start, active: function () { return !!C; }, canAdd: canAdd, shell: true,
    _test: { state: function () { if (!C) return null; var p = {}; for (var k in C.peers) p[k] = C.peers[k].st + '/' + (C.peers[k].pc ? C.peers[k].pc.connectionState : '-'); return { id: C.id, host: C.host, who: C.who, st: C.st, peers: p, sharing: !!C.share }; }, accept: accept, decline: decline, hangUp: hangUp, share: share, restart: function (n) { if (C && C.peers[lc(n)]) restart(C.peers[lc(n)]); }, ice: function () { return ICE; } }
  };
})();
