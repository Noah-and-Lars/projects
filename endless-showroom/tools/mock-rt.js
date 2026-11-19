// A stand-in for the arcade's realtime client (rt.js), for tests only.
// Pages in the same browser context talk over BroadcastChannel, with the same
// API the game uses: channel(), on('broadcast' | 'presence'), subscribe(),
// send(), track(), untrack(), presenceState(), removeChannel().
(function () {
  const ALL = [];
  addEventListener('pagehide', () => { for (const c of ALL) if (c.meta) c.untrack(); });
  function Channel(name, opts) {
    ALL.push(this);
    const c = (opts && opts.config) || {};
    this.name = name; this.key = (c.presence && c.presence.key) || Math.random().toString(36).slice(2);
    this.binds = []; this.others = {}; this.meta = null; this.state = 'closed';
    this.bc = new BroadcastChannel('mockrt:' + name);
    this.bc.onmessage = (e) => this.onMsg(e.data);
  }
  Channel.prototype.on = function (type, filter, fn) { this.binds.push({ type, event: (filter && filter.event) || '*', fn }); return this; };
  Channel.prototype.fire = function (type, event, arg) { for (const b of this.binds) if (b.type === type && (b.event === '*' || b.event === event)) b.fn(arg); };
  Channel.prototype.sync = function () { setTimeout(() => this.fire('presence', 'sync', {}), 0); };
  // Like the real server noticing a dropped connection: members that go quiet
  // for 6 s are removed (a closing page's last 'leave' can get lost).
  Channel.prototype.beat = function () {
    if (this.timer) return;
    this.heard = {};
    this.timer = setInterval(() => {
      if (this.state !== 'joined') return;
      if (this.meta) this.bc.postMessage({ t: 'alive', k: this.key });
      const now = Date.now(); let gone = false;
      for (const k in this.others) if (now - (this.heard[k] || now) > 6000) { delete this.others[k]; gone = true; }
      if (gone) this.sync();
    }, 1500);
  };
  Channel.prototype.onMsg = function (m) {
    if (this.state !== 'joined') return;
    if (m.k && this.heard) this.heard[m.k] = Date.now();
    if (m.t === 'b') this.fire('broadcast', m.e, { type: 'broadcast', event: m.e, payload: m.p });
    else if (m.t === 'alive') { if (!(m.k in this.others)) this.bc.postMessage({ t: 'hello' }); }
    else if (m.t === 'track') { this.others[m.k] = m.meta; this.heard[m.k] = Date.now(); this.sync(); }
    else if (m.t === 'leave') { delete this.others[m.k]; this.sync(); }
    else if (m.t === 'hello' && this.meta) this.bc.postMessage({ t: 'track', k: this.key, meta: this.meta });
  };
  Channel.prototype.subscribe = function (cb) {
    setTimeout(() => { this.state = 'joined'; this.beat(); this.bc.postMessage({ t: 'hello' }); cb && cb('SUBSCRIBED'); }, 20);
    return this;
  };
  Channel.prototype.send = function (m) { if (this.state === 'joined') this.bc.postMessage({ t: 'b', k: this.key, e: m.event, p: m.payload }); return Promise.resolve('ok'); };
  Channel.prototype.track = function (meta) { this.meta = meta; this.bc.postMessage({ t: 'track', k: this.key, meta }); this.sync(); return Promise.resolve('ok'); };
  Channel.prototype.untrack = function () { this.bc.postMessage({ t: 'leave', k: this.key }); this.meta = null; return Promise.resolve('ok'); };
  Channel.prototype.presenceState = function () {
    const s = {};
    for (const k in this.others) s[k] = [this.others[k]];
    if (this.meta) s[this.key] = [this.meta];
    return s;
  };
  window.supabase = {
    arcadeRealtime: true,
    createClient() {
      return {
        channel: (name, opts) => new Channel(name, opts),
        removeChannel: (ch) => { ch.untrack(); ch.state = 'closed'; clearInterval(ch.timer); ch.bc.close(); return Promise.resolve('ok'); },
      };
    },
  };
})();
