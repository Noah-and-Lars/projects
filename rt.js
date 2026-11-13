// Arcade realtime client: a drop-in for the parts of supabase-js the arcade uses
// (Realtime broadcast + presence), talking to our Cloudflare Worker instead of Supabase.
// It sets window.supabase.createClient, so the games' existing code works unchanged:
// client.channel(name, { config: { broadcast: { self }, presence: { key } } }),
// ch.on('broadcast' | 'presence', { event }, fn), ch.subscribe(fn), ch.send(), ch.track(),
// ch.untrack(), ch.presenceState(), ch.state, client.removeChannel(ch).
// Each channel is its own WebSocket to the Worker; a dropped one reconnects by itself.
(function () {
  if (window.supabase && window.supabase.arcadeRealtime) return;
  var WS = 'wss://arcade-realtime.arcade-realtime.workers.dev/ws';
  try { if (window.ARCADE_RT_URL) WS = window.ARCADE_RT_URL; } catch (e) {}
  // Online play needs an online Arcade account (2026-11-06): without one (no account, or a local account), every
  // channel except the site's "on now" counter fails to connect and a popup asks the player to make an account.
  // The game then behaves as if it were offline (most fall back to bots or offline play).
  var FREE = /^online:arcade$/;
  function hasAccount() { try { var a = JSON.parse(localStorage.getItem('arcade-acct') || 'null'); return !!(a && a.name && a.token); } catch (e) { return false; } }
  var askedAt = 0;
  function askForAccount() {
    if (Date.now() - askedAt < 20000) return;
    askedAt = Date.now();
    try { if (window.top !== window && window.top.ArcadeAccount && window.top.ArcadeAccount.welcome) { window.top.ArcadeAccount.welcome('signup', 'You need an online account to play online. Make one (free, just a username and a password) or log in.'); return; } } catch (e) {}
    try { if (window.ArcadeAccount && window.ArcadeAccount.welcome) { window.ArcadeAccount.welcome('signup', 'You need an online account to play online. Make one (free, just a username and a password) or log in.'); return; } } catch (e) {}
    var show = function () {
      if (document.getElementById('rtAcct')) return;
      var d = document.createElement('div'); d.id = 'rtAcct';
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#000a;font:15px/1.45 system-ui,sans-serif';
      var b = document.createElement('div');
      b.style.cssText = 'max-width:360px;margin:16px;padding:22px;border-radius:16px;background:#1b1835;color:#f1effa;text-align:center;border:1px solid #6c5ce7';
      var h = document.createElement('h2'); h.textContent = 'Online play needs an account'; h.style.margin = '0 0 8px';
      var p = document.createElement('p'); p.textContent = 'Make a free Arcade account (just a username and a password) or log in on The Arcade to play online. Playing offline and against bots still works.'; p.style.margin = '0 0 14px';
      var a = document.createElement('a'); a.href = location.hostname === 'thearcade.pages.dev' ? 'https://thearcade.pages.dev/' : 'https://noah-and-lars.github.io/projects/'; a.target = '_top'; a.textContent = 'Make an account';
      a.style.cssText = 'display:inline-block;padding:9px 16px;border-radius:10px;background:#6c5ce7;color:#fff;font-weight:700;text-decoration:none;margin:0 6px';
      var x = document.createElement('button'); x.textContent = 'Not now';
      x.style.cssText = 'padding:9px 16px;border-radius:10px;border:1px solid #ffffff33;background:none;color:#f1effa;font:inherit;cursor:pointer;margin:0 6px';
      x.onclick = function () { d.remove(); };
      b.appendChild(h); b.appendChild(p); b.appendChild(a); b.appendChild(x); d.appendChild(b); document.body.appendChild(d);
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }
  /* The move (2026-11-13, the owner's request): from 2:30pm Sydney time on 13 November 2026, online play on the old
     GitHub address (noah-and-lars.github.io) is switched off and every try to go online shows a pop-up with the new
     site. The Worker refuses those connections too (MOVED_AT in worker.js); this only says why. The Cloudflare copy
     (thearcade.pages.dev) loads this same file and is never affected. */
  var MOVED_AT = Date.UTC(2026, 10, 13, 3, 30), NEW_SITE = 'https://thearcade.pages.dev';
  try { if (window.ARCADE_RT_MOVED_AT) MOVED_AT = +window.ARCADE_RT_MOVED_AT; } catch (e) {} // tests only
  var OLD_SITE = location.hostname === 'noah-and-lars.github.io';
  try { if (window.ARCADE_RT_OLD_SITE) OLD_SITE = true; } catch (e) {} // tests only
  function moved() { return OLD_SITE && Date.now() >= MOVED_AT; }
  function movedPopup() {
    var top = window; try { if (window.top !== window && window.top.document) top = window.top; } catch (e) {}
    var doc = top.document;
    var show = function () {
      if (doc.getElementById('rtMoved')) return;
      var d = doc.createElement('div'); d.id = 'rtMoved';
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#000b;font:15px/1.45 system-ui,sans-serif;padding:16px';
      var b = doc.createElement('div');
      b.style.cssText = 'max-width:400px;width:100%;box-sizing:border-box;padding:22px;border-radius:16px;background:#1b1835;color:#f1effa;text-align:center;border:2px solid #c8342a';
      var i = doc.createElement('div'); i.textContent = '🚚'; i.style.cssText = 'font-size:38px;line-height:1';
      var h = doc.createElement('h2'); h.textContent = 'We have moved!'; h.style.margin = '8px 0';
      var p = doc.createElement('p'); p.textContent = 'Online play has moved over to the new site. Online games no longer work here, so play online at:'; p.style.margin = '0 0 8px';
      var l = doc.createElement('p'); l.textContent = NEW_SITE; l.style.cssText = 'margin:0 0 10px;font-weight:800;color:#ffd34d;font-size:17px;word-break:break-all';
      var q = doc.createElement('p'); q.textContent = 'Log in there with your Arcade account and all your progress comes with you. Playing offline still works on this site.'; q.style.margin = '0 0 14px';
      var a = doc.createElement('a'); a.href = NEW_SITE + '/'; a.target = '_top'; a.textContent = 'Go to the new site';
      a.style.cssText = 'display:inline-block;padding:10px 18px;border-radius:12px;background:#c8342a;color:#fff;font-weight:800;text-decoration:none;margin:0 6px';
      var x = doc.createElement('button'); x.textContent = 'Close';
      x.style.cssText = 'padding:10px 16px;border-radius:12px;border:1px solid #ffffff44;background:none;color:#f1effa;font:inherit;font-weight:700;cursor:pointer;margin:0 6px';
      x.onclick = function () { d.remove(); };
      b.appendChild(i); b.appendChild(h); b.appendChild(p); b.appendChild(l); b.appendChild(q); b.appendChild(a); b.appendChild(x); d.appendChild(b); doc.body.appendChild(d);
    };
    if (doc.body) show(); else doc.addEventListener('DOMContentLoaded', show);
  }
  var PING_MS = 25000, DEAD_MS = 120000, JOIN_MS = 10000, BACKOFF = [1000, 2000, 5000, 10000];
  // Saving the server's daily allowance (2026-11-09):
  //  - a tab left in the background for IDLE_MS quietly disconnects every channel (the game isn't told, so nothing
  //    tears down); coming back to the tab reconnects them and re-sends presence, like after a dropped connection.
  //  - a channel that has never got in after PARK_AFTER tries (the server refuses this page) only tries every PARK_MS,
  //    or straight away when the tab is shown again or the network comes back.
  var IDLE_MS = 15 * 60 * 1000, PARK_AFTER = 6, PARK_MS = 5 * 60 * 1000, ALL = [], asleep = false, idleT = 0;
  try { if (window.ARCADE_RT_IDLE_MS) IDLE_MS = +window.ARCADE_RT_IDLE_MS; } catch (e) {} // tests only
  function live() { return ALL.filter(function (c) { return !c.gone; }); }
  function sleepAll() { if (!document.hidden) return; asleep = true; ALL = live(); ALL.forEach(function (c) { c.sleep(); }); }
  function wakeAll() { clearTimeout(idleT); asleep = false; ALL = live(); ALL.forEach(function (c) { c.wake(); }); }
  document.addEventListener('visibilitychange', function () {
    clearTimeout(idleT);
    if (document.hidden) idleT = setTimeout(sleepAll, IDLE_MS); else wakeAll();
  });
  window.addEventListener('online', function () { if (!document.hidden) wakeAll(); });

  function Channel(client, name, opts) {
    var c = (opts && opts.config) || {};
    this.client = client;
    this.subTopic = name;
    this.topic = 'realtime:' + name;
    this.state = 'closed';
    this.self = !!(c.broadcast && c.broadcast.self);
    this.key = (c.presence && c.presence.key) || '';
    this.binds = [];
    this.pstate = {};
    this.meta = null;
    this.ws = null;
    this.cb = null;
    this.tries = 0;
    this.gone = false;
    this.timers = {};
    this.sleeping = false;
    this.everJoined = false;
    ALL.push(this);
  }
  Channel.prototype.on = function (type, filter, fn) {
    this.binds.push({ type: type, event: (filter && filter.event) || '*', fn: fn });
    return this;
  };
  Channel.prototype.emit = function (status, err) {
    if (this.cb) try { this.cb(status, err); } catch (e) { console.error(e); }
  };
  Channel.prototype.fire = function (type, event, arg) {
    for (var i = 0; i < this.binds.length; i++) {
      var b = this.binds[i];
      if (b.type === type && (b.event === '*' || b.event === event)) try { b.fn(arg); } catch (e) { console.error(e); }
    }
  };
  Channel.prototype.subscribe = function (cb) {
    if (cb) this.cb = cb;
    if (this.gone || this.ws) return this;
    if (moved()) { // online play moved to the new site: refuse, and say where to go
      var me = this;
      this.state = 'errored';
      setTimeout(function () { if (!FREE.test(me.subTopic)) movedPopup(); me.emit('CHANNEL_ERROR', new Error('online play has moved to ' + NEW_SITE)); }, 0);
      return this;
    }
    if (!FREE.test(this.subTopic) && !hasAccount()) { // no online account: refuse, like a server that can't be reached
      var self = this;
      this.state = 'errored';
      setTimeout(function () { askForAccount(); self.emit('CHANNEL_ERROR', new Error('an online account is needed to play online')); }, 0);
      return this;
    }
    this.connect();
    return this;
  };
  Channel.prototype.connect = function () {
    var self = this;
    if (this.gone) return;
    if (asleep) { this.sleeping = true; return; } // a background tab stays off until it's shown again
    this.state = 'joining';
    var ws;
    try { ws = new WebSocket(WS + '?topic=' + encodeURIComponent(this.subTopic) + '&key=' + encodeURIComponent(this.key)); }
    catch (e) { this.dropped(); return; }
    this.ws = ws;
    var joined = false, lastHeard = Date.now();
    clearTimeout(this.timers.join);
    this.timers.join = setTimeout(function () {
      if (joined || self.ws !== ws) return;
      self.emit('TIMED_OUT');
      try { ws.close(); } catch (e) {}
    }, JOIN_MS);
    ws.onmessage = function (ev) {
      lastHeard = Date.now();
      if (ev.data === 'pong') return;
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'b') self.fire('broadcast', m.e, { type: 'broadcast', event: m.e, payload: m.p });
      else if (m.t === 'state') self.setState(m.s || {});
      else if (m.t === 'joined') {
        joined = true; self.everJoined = true;
        clearTimeout(self.timers.join);
        self.tries = 0;
        self.state = 'joined';
        if (self.meta) self.raw({ t: 'track', p: self.meta });
        self.emit('SUBSCRIBED');
      }
    };
    ws.onclose = function () { if (self.ws === ws) self.dropped(); };
    ws.onerror = function () {};
    clearInterval(this.timers.ping);
    this.timers.ping = setInterval(function () {
      if (self.ws !== ws) return;
      if (Date.now() - lastHeard > DEAD_MS) { try { ws.close(); } catch (e) {} self.dropped(); return; }
      if (ws.readyState === 1) try { ws.send('ping'); } catch (e) {}
    }, PING_MS);
  };
  // the socket closed or failed: tell the game, then try again with a growing wait
  Channel.prototype.dropped = function () {
    var self = this;
    clearInterval(this.timers.ping);
    clearTimeout(this.timers.join);
    this.ws = null;
    if (this.gone) return;
    var wasJoined = this.state === 'joined';
    this.state = 'errored';
    if (wasJoined || this.tries === 0) this.emit('CHANNEL_ERROR', new Error('connection lost'));
    if (Object.keys(this.pstate).length) this.setState({});
    var wait = BACKOFF[Math.min(this.tries, BACKOFF.length - 1)];
    if (!this.everJoined && this.tries >= PARK_AFTER) { wait = PARK_MS; this.sleeping = true; } // refused: barely try
    this.tries++;
    clearTimeout(this.timers.retry);
    this.timers.retry = setTimeout(function () { if (!self.gone && !self.ws) self.connect(); }, wait);
  };
  // the tab has been in the background a while: close quietly, keep everything needed to come back
  Channel.prototype.sleep = function () {
    if (this.gone) return;
    for (var t in this.timers) { clearTimeout(this.timers[t]); clearInterval(this.timers[t]); }
    var ws = this.ws; this.ws = null;
    if (ws) try { ws.close(1000, 'idle'); } catch (e) {}
    this.sleeping = true;
    if (this.state === 'joined' || this.state === 'joining') this.state = 'sleeping';
  };
  Channel.prototype.wake = function () {
    if (this.gone || !this.sleeping) return;
    this.sleeping = false;
    clearTimeout(this.timers.retry);
    if (!this.ws) { this.tries = 0; this.connect(); }
  };
  Channel.prototype.setState = function (s) {
    var old = this.pstate;
    this.pstate = s;
    for (var k in s) if (!old[k]) this.fire('presence', 'join', { key: k, newPresences: s[k], currentPresences: [] });
    for (var j in old) if (!s[j]) this.fire('presence', 'leave', { key: j, leftPresences: old[j], currentPresences: [] });
    this.fire('presence', 'sync', undefined);
  };
  Channel.prototype.raw = function (m) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify(m)); return true; } catch (e) { return false; }
  };
  Channel.prototype.send = function (msg) {
    if (!msg || this.state !== 'joined') return Promise.resolve('error');
    return Promise.resolve(this.raw({ t: 'b', e: msg.event, p: msg.payload, s: this.self }) ? 'ok' : 'error');
  };
  Channel.prototype.track = function (meta) {
    this.meta = meta || {};
    if (this.state === 'joined') this.raw({ t: 'track', p: this.meta });
    return Promise.resolve('ok');
  };
  Channel.prototype.untrack = function () {
    this.meta = null;
    if (this.state === 'joined') this.raw({ t: 'untrack' });
    return Promise.resolve('ok');
  };
  Channel.prototype.presenceState = function () {
    var out = {};
    for (var k in this.pstate) out[k] = this.pstate[k].slice();
    return out;
  };
  Channel.prototype.unsubscribe = function () {
    if (this.gone) return Promise.resolve('ok');
    this.gone = true;
    for (var t in this.timers) { clearTimeout(this.timers[t]); clearInterval(this.timers[t]); }
    var ws = this.ws; this.ws = null;
    if (ws) try { ws.close(1000, 'bye'); } catch (e) {}
    this.state = 'closed';
    this.emit('CLOSED');
    return Promise.resolve('ok');
  };

  function Client() { this.channels = []; }
  Client.prototype.channel = function (name, opts) {
    var ch = new Channel(this, String(name), opts);
    this.channels.push(ch);
    return ch;
  };
  Client.prototype.removeChannel = function (ch) {
    var i = this.channels.indexOf(ch);
    if (i >= 0) this.channels.splice(i, 1);
    return ch ? ch.unsubscribe() : Promise.resolve('ok');
  };
  Client.prototype.removeAllChannels = function () {
    var all = this.channels.splice(0);
    return Promise.all(all.map(function (c) { return c.unsubscribe(); }));
  };
  Client.prototype.getChannels = function () { return this.channels.slice(); };

  // at the moment of the move, a page that's already online here drops every channel and says why
  if (OLD_SITE && Date.now() < MOVED_AT && MOVED_AT - Date.now() < 7 * 864e5) setTimeout(function () {
    var on = live(), any = on.some(function (c) { return !FREE.test(c.subTopic); });
    on.forEach(function (c) { try { c.state = 'errored'; c.emit('CHANNEL_ERROR', new Error('online play has moved to ' + NEW_SITE)); c.unsubscribe(); } catch (e) {} });
    if (any) movedPopup();
  }, MOVED_AT - Date.now() + 500);

  window.supabase = {
    arcadeRealtime: true,
    createClient: function () { return new Client(); },
  };
})();
