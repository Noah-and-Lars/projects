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
  var PING_MS = 25000, DEAD_MS = 120000, JOIN_MS = 10000, BACKOFF = [1000, 2000, 5000, 10000];

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
    this.connect();
    return this;
  };
  Channel.prototype.connect = function () {
    var self = this;
    if (this.gone) return;
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
        joined = true;
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
    this.tries++;
    clearTimeout(this.timers.retry);
    this.timers.retry = setTimeout(function () { if (!self.gone && !self.ws) self.connect(); }, wait);
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

  window.supabase = {
    arcadeRealtime: true,
    createClient: function () { return new Client(); },
  };
})();
