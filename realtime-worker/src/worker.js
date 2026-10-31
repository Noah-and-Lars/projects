// Arcade realtime: a small stand-in for Supabase Realtime (broadcast + presence) on Cloudflare.
// Every channel topic is one Durable Object; each browser channel is one WebSocket to it.
// Sockets use the Hibernation API, so a quiet room costs nothing, and pings are answered
// by Cloudflare without waking the object.
//
// Client -> server (JSON):
//   { t: 'b', e: event, p: payload, s: self }   broadcast to the room (to the sender too when s)
//   { t: 'track', p: meta }                       set this socket's presence
//   { t: 'untrack' }                              clear it
// Server -> client:
//   { t: 'joined' }                               the socket is in the room
//   { t: 'b', e: event, p: payload }              someone's broadcast
//   { t: 'state', s: { key: [meta, ...] } }       the whole presence state, after any change
// Plain 'ping' gets 'pong' (keep-alive).

import { DurableObject } from 'cloudflare:workers';

const MAX_TOPIC = 200;        // characters
const MAX_MSG = 64 * 1024;    // bytes per message
const MAX_SOCKETS = 400;      // per room
const STALE_MS = 90 * 1000;   // a socket that hasn't pinged for this long is gone
const SWEEP_MS = 5 * 60 * 1000;

// Online play is for the official arcade only. The browser sets the Origin header on the WebSocket
// handshake and page code can't forge it, so a downloaded/edited copy (origin null) or a copy re-hosted
// elsewhere is refused here, on the server, where a cheater can't edit this rule.
const ALLOWED_ORIGINS = ['https://noah-and-lars.github.io'];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/ws') return new Response('arcade realtime ok', { headers: { 'content-type': 'text/plain' } });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
    const origin = req.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('online play is only available on the official website', { status: 403 });
    const topic = url.searchParams.get('topic') || '';
    if (!topic || topic.length > MAX_TOPIC) return new Response('bad topic', { status: 400 });
    return env.ROOMS.get(env.ROOMS.idFromName(topic)).fetch(req);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req) {
    this.sweep();
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('room full', { status: 503 });
    const url = new URL(req.url);
    const key = (url.searchParams.get('key') || '').slice(0, 100) || crypto.randomUUID();
    const pair = new WebSocketPair();
    const ws = pair[1];
    this.ctx.acceptWebSocket(ws);
    ws.serializeAttachment({ key, ref: crypto.randomUUID().slice(0, 8), at: Date.now(), meta: null });
    ws.send('{"t":"joined"}');
    ws.send(JSON.stringify({ t: 'state', s: this.state() }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MSG) return;
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (m.t === 'b') {
      const out = JSON.stringify({ t: 'b', e: String(m.e || ''), p: m.p === undefined ? {} : m.p });
      for (const o of this.ctx.getWebSockets()) if (o !== ws || m.s) try { o.send(out); } catch (e) {}
    } else if (m.t === 'track' || m.t === 'untrack') {
      const a = ws.deserializeAttachment() || {};
      a.meta = m.t === 'track' && m.p && typeof m.p === 'object' ? m.p : null;
      ws.serializeAttachment(a);
      this.sweep();
      this.pushState();
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch (e) {}
    if ((ws.deserializeAttachment() || {}).meta) this.pushState(ws);
  }

  async webSocketError(ws) { this.webSocketClose(ws, 1011); }

  async alarm() { if (this.sweep()) this.pushState(); }

  // close sockets that stopped pinging; true if any of them had presence
  sweep() {
    const now = Date.now();
    let dropped = false, tracked = false;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      const last = Math.max(a.at || 0, +(this.ctx.getWebSocketAutoResponseTimestamp(ws) || 0));
      if (now - last > STALE_MS) { if (a.meta) dropped = true; try { ws.close(1001, 'stale'); } catch (e) {} }
      else if (a.meta) tracked = true;
    }
    // keep a slow sweep going while anyone is shown as online, so a vanished browser doesn't stay listed
    if (tracked) this.ctx.storage.getAlarm().then(t => { if (!t) this.ctx.storage.setAlarm(now + SWEEP_MS); });
    return dropped;
  }

  state(skip) {
    const s = {};
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === skip || ws.readyState !== 1) continue;
      const a = ws.deserializeAttachment();
      if (!a || !a.meta) continue;
      (s[a.key] || (s[a.key] = [])).push(Object.assign({}, a.meta, { presence_ref: a.ref }));
    }
    return s;
  }

  pushState(skip) {
    const out = JSON.stringify({ t: 'state', s: this.state(skip) });
    for (const o of this.ctx.getWebSockets()) if (o !== skip) try { o.send(out); } catch (e) {}
  }
}
