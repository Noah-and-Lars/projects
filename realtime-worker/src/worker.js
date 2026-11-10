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
    if (url.pathname.startsWith('/acct/')) return accounts(req, env, url);
    if (url.pathname === '/chat/ws') return chatSocket(req, env, url);
    if (url.pathname.startsWith('/kd/')) return krill(req, env, url);
    if (url.pathname.startsWith('/ttt/')) return turnBoard(req, env, url);
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


/* ==========================================================================
   Arcade accounts (2026-11-01). One Durable Object per username (by its lower-case form), so a name can only ever
   belong to one account. It keeps the account (password check, recovery code, signed-in devices) and the player's
   saves, one group of localStorage entries per game.
   The browser stretches the password itself (PBKDF2, 150k rounds, salted with the name) and sends only that key;
   the server salts and hashes the key again, so the free plan's tiny CPU budget is never spent on hashing and the
   password itself never leaves the browser.
   Routes (JSON; only from the official site):
     GET  /acct/check?name=      is the name free (and allowed)
     POST /acct/signup  {name, key}           -> {token, name, recovery}
     POST /acct/login   {name, key}           -> {token, name}
     POST /acct/recover {name, code, key}     -> {token, name, recovery}   (new password, every device signed out)
     with "Authorization: Bearer <token>":
     GET  /acct/sync                          -> {name, games: {id: {at, h, size}}}
     GET  /acct/game?g=id                     -> {d, at, h}
     PUT  /acct/game?g=id {d, h, base, force} -> {at}   (409 if the cloud copy changed since base, unless force)
     POST /acct/password {old, key}           -> {token}   (other devices signed out)
     POST /acct/logout
     POST /acct/delete {key}                  -> {deleted}  (the player deletes their own account)
     POST /acct/admin {pw, op: 'info'|'delete', name}      the owner's tools (the same password as Cube Assault's
                                              ADMINTEST; only its SHA-256 is here; 5 wrong tries lock it for 15 minutes)
   Deleting an account wipes its object, so the name can be registered again.
   ========================================================================== */
const ACCT_ORIGINS = ['https://noah-and-lars.github.io'];
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const RESERVED = /admin|moderator|^mods?$|official|staff|owner|^arcade|gametester|imacheater|^system$|^support$|^server$|^null$|^undefined$|^guest$|^anonymous$/;
const BAD_NAME = /fuck|fuk|shit|bitch|cunt|dick|pussy|asshole|bastard|slut|whore|nigg|niga|fag|retard|twat|wank|porn|penis|vagina|rape|nazi|hitler/;
const KEY_RE = /^[0-9a-f]{64}$/, GAME_RE = /^[a-z0-9-]{1,32}$/;
const ADMIN_HASH = '899ba39fe0b4ce0b8d4994cf7449cc63c2a8ade12fa77e590cfaf5999256ccf2';
const ROUTES = ['check', 'signup', 'login', 'recover', 'sync', 'game', 'password', 'logout', 'delete', 'social', 'friend', 'block', 'dm', 'profile', 'call', 'turn']; // what a browser may ask an account for
const CHUNK = 40000, MAX_GAME = 5e6, MAX_TOTAL = 2e7, MAX_GAMES = 40, MAX_SESS = 20;

function nameProblem(n) {
  if (!NAME_RE.test(n)) return 'format';
  const l = n.toLowerCase(), plain = l.replace(/_/g, '').replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
  if (RESERVED.test(l) || RESERVED.test(plain)) return 'reserved';
  if (BAD_NAME.test(l) || BAD_NAME.test(plain)) return 'rude';
  return '';
}
async function accounts(req, env, url) {
  const origin = req.headers.get('Origin') || '';
  if (!ACCT_ORIGINS.includes(origin)) return new Response('accounts are only available on the official website', { status: 403 });
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
  const out = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const route = url.pathname.slice(6);
  if (route === 'players' || route === 'player' || route === 'top') { // the public player list, one player's profile, and (1.5) every player's best in one game
    if (req.method !== 'GET') return out({ error: 'bad' }, 400);
    const r = await dirCall(env, route === 'players' ? 'list' : route === 'top' ? 'top?g=' + encodeURIComponent(url.searchParams.get('g') || '') : 'get?name=' + encodeURIComponent(url.searchParams.get('name') || ''));
    return new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
  }
  if (route === 'ws') { // live friend and message updates: the token comes as the second WebSocket subprotocol
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
    const tok = wsToken(req), nm = tok.split('.')[0] || '';
    if (!NAME_RE.test(nm)) return new Response('sign in first', { status: 401 });
    return env.ACCOUNTS.get(env.ACCOUNTS.idFromName('u:' + nm.toLowerCase())).fetch(new Request('https://acct/ws', { headers: { Upgrade: 'websocket', authorization: 'Bearer ' + tok } }));
  }
  if (route !== 'admin' && !ROUTES.includes(route)) return out({ error: 'not_found' }, 404);
  let name = '', body = null;
  if (req.method === 'POST' || req.method === 'PUT') {
    const len = +(req.headers.get('content-length') || 0);
    if (len > MAX_GAME * 1.2) return out({ error: 'too_big' }, 413);
    try { body = await req.json(); } catch (e) { return out({ error: 'bad' }, 400); }
    if (!body || typeof body !== 'object') return out({ error: 'bad' }, 400);
  }
  if (route === 'admin') return admin(env, body, out);
  if (route === 'check') name = String(url.searchParams.get('name') || '');
  else if (route === 'signup' || route === 'login' || route === 'recover') name = String(body && body.name || '');
  else {
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    name = tok.split('.')[0] || '';
    if (!NAME_RE.test(name)) return out({ error: 'auth' }, 401);
  }
  if (route === 'check' || route === 'signup') { const p = nameProblem(name); if (p) return out(route === 'check' ? { free: false, why: p } : { error: p }, route === 'check' ? 200 : 400); }
  else if (!NAME_RE.test(name)) return out({ error: 'no_account' }, 404);
  const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName('u:' + name.toLowerCase()));
  const r = await stub.fetch(new Request('https://acct/' + route + url.search, { method: req.method, headers: { 'authorization': req.headers.get('Authorization') || '', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }));
  return new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
}
// the owner's tools: the password is checked (and wrong tries counted) by one guard object, then the account's own
// object is asked through a header only this Worker ever sets
async function admin(env, body, out) {
  const name = String(body.name || ''), op = body.op;
  if (op !== 'info' && op !== 'delete' && op !== 'chatdel') return out({ error: 'bad' }, 400);
  const call = (id, route, b) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName(id)).fetch(new Request('https://acct/' + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-arcade-admin': '1' }, body: JSON.stringify(b || {}) }));
  const g = await call('__admin_guard__', 'guard', { pw: String(body.pw || '') });
  if (g.status !== 200) return out(await g.json().catch(() => ({ error: 'wrong' })), g.status);
  if (op === 'chatdel') { // take a message out of the Global chat
    const r = await env.CHAT.get(env.CHAT.idFromName('chat:global')).fetch(new Request('https://chat/del', { method: 'POST', headers: { 'content-type': 'application/json', 'x-arcade-int': '1' }, body: JSON.stringify({ id: String(body.id || '') }) }));
    return out(await r.json().catch(() => ({})), r.status);
  }
  if (!NAME_RE.test(name)) return out({ error: 'no_account' }, 404);
  const r = await call('u:' + name.toLowerCase(), op === 'info' ? 'admininfo' : 'adminwipe');
  return out(await r.json().catch(() => ({})), r.status);
}
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const rnd = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => { const b = crypto.getRandomValues(new Uint8Array(12)); let c = ''; for (let i = 0; i < 12; i++) c += CODE_ABC[b[i] % CODE_ABC.length] + (i === 3 || i === 7 ? '-' : ''); return c; };
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const same = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

export class Account extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  async fetch(req) {
    const url = new URL(req.url), route = url.pathname.slice(1), S = this.ctx.storage, now = Date.now();
    const j = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
    const body = req.method === 'GET' ? null : await req.json().catch(() => ({}));
    if (req.headers.get('x-arcade-admin') === '1') return this.admin(route, body, j, now);
    if (req.headers.get('x-arcade-peer') === '1') return this.peer(route, body || {}, j, now);
    let a = await S.get('acct');
    if (route === 'check') return j({ free: !a });
    if (route === 'signup') {
      if (a) return j({ error: 'taken' }, 409);
      if (!KEY_RE.test(body.key || '')) return j({ error: 'bad' }, 400);
      const code = newCode();
      a = { name: String(body.name), salt: rnd(16), created: now, fails: 0, lockUntil: 0, sess: [], games: {}, rs: rnd(16) };
      a.h = await sha(a.salt + body.key); a.rh = await sha(a.rs + normCode(code));
      const token = await this.session(a);
      await dirCall(this.env, 'add', { n: a.name, c: a.created }); a.listed = 1;
      await S.put('acct', a);
      return j({ token, name: a.name, recovery: code });
    }
    if (!a) return j({ error: 'no_account' }, 404);
    if (route === 'login' || route === 'recover') {
      if (a.lockUntil > now) return j({ error: 'locked', wait: Math.ceil((a.lockUntil - now) / 1000) }, 429);
      if (!KEY_RE.test(body.key || '')) return j({ error: 'bad' }, 400);
      const ok = route === 'login' ? same(await sha(a.salt + body.key), a.h) : same(await sha(a.rs + normCode(body.code)), a.rh);
      if (!ok) { a.fails = (a.fails || 0) + 1; if (a.fails >= 8) { a.fails = 0; a.lockUntil = now + 10 * 60 * 1000; } await S.put('acct', a); return j({ error: 'wrong' }, 401); }
      a.fails = 0;
      let recovery;
      if (route === 'recover') { a.salt = rnd(16); a.h = await sha(a.salt + body.key); a.sess = []; recovery = newCode(); a.rs = rnd(16); a.rh = await sha(a.rs + normCode(recovery)); }
      const token = await this.session(a);
      await S.put('acct', a);
      return j(recovery ? { token, name: a.name, recovery } : { token, name: a.name });
    }
    // everything else needs a signed-in device
    const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), part = tok.split('.')[1] || '';
    const th = part ? await sha(part) : '', si = (a.sess || []).findIndex(x => same(x.h, th));
    if (si < 0) return j({ error: 'auth' }, 401);
    if (now - (a.sess[si].seen || 0) > 864e5) { a.sess[si].seen = now; await S.put('acct', a); }
    // accounts made before the Players list (2026-11-06) join it the next time they're used
    if (!a.listed) { const r = await dirCall(this.env, 'add', { n: a.name, c: a.created }); if (r.ok) { a.listed = 1; await S.put('acct', a); } }
    if (route === 'whoami') return j({ name: a.name });
    if (route === 'ws' && req.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      // "last online" on the Players page: every site page opens this socket, so tell the list at most every 5 minutes
      if (now - (a.seenAt || 0) > 5 * 60000) { a.seenAt = now; await S.put('acct', a); this.ctx.waitUntil(dirCall(this.env, 'seen', { n: a.name }).catch(() => null)); }
      return new Response(null, { status: 101, webSocket: pair[0], headers: { 'Sec-WebSocket-Protocol': 'arcade' } });
    }
    if (['social', 'friend', 'block', 'dm', 'profile', 'call'].includes(route)) return this.social(route, req, url, body, a, j, now);
    if (route === 'turn') return this.turn(j, now);
    if (route === 'logout') { a.sess.splice(si, 1); await S.put('acct', a); return j({ ok: true }); }
    if (route === 'password') {
      if (!KEY_RE.test(body.key || '') || !same(await sha(a.salt + (body.old || '')), a.h)) return j({ error: 'wrong' }, 401);
      a.salt = rnd(16); a.h = await sha(a.salt + body.key); a.sess = [];
      const token = await this.session(a); await S.put('acct', a); return j({ token });
    }
    if (route === 'delete') { // the player deletes their own account (they type their password again)
      if (!KEY_RE.test(body.key || '') || !same(await sha(a.salt + body.key), a.h)) return j({ error: 'wrong' }, 401);
      await this.goodbye(a); await S.deleteAll(); return j({ deleted: true });
    }
    if (route === 'sync') return j({ name: a.name, created: a.created, games: a.games || {}, soc: socCounts(await this.soc()) });
    if (route === 'game') {
      const g = url.searchParams.get('g') || '';
      if (!GAME_RE.test(g)) return j({ error: 'bad' }, 400);
      const m = a.games[g];
      if (req.method === 'GET') {
        if (!m) return j({ d: null, at: 0, h: '' });
        const parts = await S.get([...Array(m.n).keys()].map(i => 'c:' + g + ':' + i));
        let str = ''; for (let i = 0; i < m.n; i++) str += parts.get('c:' + g + ':' + i) || '';
        let d = null; try { d = JSON.parse(str); } catch (e) {}
        return j({ d, at: m.at, h: m.h });
      }
      if (req.method === 'PUT') {
        const d = body.d;
        if (!d || typeof d !== 'object' || Array.isArray(d)) return j({ error: 'bad' }, 400);
        for (const [k, v] of Object.entries(d)) if (typeof v !== 'string' || k.length > 120) return j({ error: 'bad' }, 400);
        if (m && !body.force && body.base !== m.at) return j({ error: 'conflict', at: m.at, h: m.h }, 409);
        if (!m && Object.keys(a.games).length >= MAX_GAMES) return j({ error: 'too_many' }, 400);
        const str = JSON.stringify(d);
        if (str.length > MAX_GAME) return j({ error: 'too_big' }, 413);
        let total = str.length; for (const [k, x] of Object.entries(a.games)) if (k !== g) total += x.size || 0;
        if (total > MAX_TOTAL) return j({ error: 'too_big' }, 413);
        const n = Math.max(1, Math.ceil(str.length / CHUNK)), put = {};
        for (let i = 0; i < n; i++) put['c:' + g + ':' + i] = str.slice(i * CHUNK, (i + 1) * CHUNK);
        if (m && m.n > n) await S.delete([...Array(m.n - n).keys()].map(i => 'c:' + g + ':' + (n + i)));
        const at = Math.max(now, (m ? m.at : 0) + 1);
        a.games[g] = { at, h: String(body.h || '').slice(0, 40), n, size: str.length };
        await S.put(put); await S.put('acct', a);
        return j({ at });
      }
    }
    return j({ error: 'not_found' }, 404);
  }
  // the owner's tools (only reachable through admin() in the Worker)
  async admin(route, body, j, now) {
    const S = this.ctx.storage;
    if (route === 'guard') {
      const g = (await S.get('guard')) || { fails: 0, lockUntil: 0 };
      if (g.lockUntil > now) return j({ error: 'locked', wait: Math.ceil((g.lockUntil - now) / 1000) }, 429);
      if (!same(await sha(String(body.pw || '')), ADMIN_HASH)) { g.fails++; if (g.fails >= 5) { g.fails = 0; g.lockUntil = now + 15 * 60 * 1000; } await S.put('guard', g); return j({ error: 'wrong' }, 401); }
      if (g.fails) { g.fails = 0; await S.put('guard', g); }
      return j({ ok: true });
    }
    const a = await S.get('acct');
    if (!a) return j({ error: 'no_account' }, 404);
    if (route === 'admininfo') {
      const games = {}; for (const [k, m] of Object.entries(a.games || {})) games[k] = { size: m.size, at: m.at };
      return j({ name: a.name, created: a.created, devices: (a.sess || []).length, games });
    }
    // 'list' (admin header only): used once on 2026-11-06 to put every older account on the Players list
    if (route === 'list') { if (!a.listed) { const r = await dirCall(this.env, 'add', { n: a.name, c: a.created }); if (r.ok) { a.listed = 1; await S.put('acct', a); } } return j({ name: a.name }); }
    if (route === 'adminwipe') { await this.goodbye(a); await S.deleteAll(); return j({ deleted: true, name: a.name }); }
    return j({ error: 'not_found' }, 404);
  }
  /* ---------- friends and private messages (2026-11-06) ----------
     'soc' = { f: friends {lower: {n, st: 'f' | 'in' | 'out', at}}, c: conversations {lower: {n, seq, un, ts, t, me}},
     b: blocked {lower: name} }; each message is 'm:<lower>:<seq>' = {id, f (1 = I sent it), t, ts, q}. Both people keep
     their own copy, so deleting an account deletes only that side. The other account is asked through peer() with a
     header only this Worker sets. Open Players pages hold a hibernating WebSocket here and get pushes (no polling). */
  async soc() { const s = (await this.ctx.storage.get('soc')) || {}; s.f = s.f || {}; s.c = s.c || {}; s.b = s.b || {}; return s; }
  push(o) { const out = JSON.stringify(o); for (const ws of this.ctx.getWebSockets()) try { ws.send(out); } catch (e) {} }
  async webSocketMessage() {}
  async webSocketClose(ws, code) { try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch (e) {} }
  async webSocketError(ws) { this.webSocketClose(ws, 1011); }
  async addMsg(s, k, n, m, mine) {
    const S = this.ctx.storage, c = s.c[k] || (s.c[k] = { n, seq: 0, un: 0 });
    c.n = n; c.seq = (c.seq || 0) + 1; c.ts = m.ts; c.t = m.t.slice(0, 80); c.me = mine ? 1 : 0;
    if (!mine) c.un = (c.un || 0) + 1;
    const rec = { id: m.id, f: mine ? 1 : 0, t: m.t, ts: m.ts, q: c.seq };
    const ks = Object.keys(s.c);
    if (ks.length > MAX_CONVOS) { // forget the oldest conversation
      const old = ks.filter(x => x !== k).sort((x, y) => (s.c[x].ts || 0) - (s.c[y].ts || 0))[0];
      delete s.c[old]; await this.dropMsgs(old);
    }
    await S.put({ soc: s, ['m:' + k + ':' + pad(c.seq)]: rec });
    if (c.seq > KEEP_DM) await S.delete('m:' + k + ':' + pad(c.seq - KEEP_DM));
    return rec;
  }
  async dropMsgs(k) { const S = this.ctx.storage, m = await S.list({ prefix: 'm:' + k + ':' }); if (m.size) await S.delete([...m.keys()]); }
  // the signed-in player's own requests
  async social(route, req, url, body, a, j, now) {
    const S = this.ctx.storage, s = await this.soc(), me = a.name.toLowerCase();
    if (route === 'social') return j({ name: a.name, f: s.f, c: s.c, b: s.b });
    if (route === 'profile') { // the player's best in each game, worked out by their browser from the saves (games.js stat())
      const st = body && body.s, clean = {};
      if (!st || typeof st !== 'object') return j({ error: 'bad' }, 400);
      for (const [g, v] of Object.entries(st).slice(0, 60)) if (GAME_RE.test(g) && typeof v === 'string' && v) clean[g] = tidy(v).slice(0, 60);
      const r = await dirCall(this.env, 'stats', { n: a.name, c: a.created, s: clean });
      return j({ ok: r.ok }, r.ok ? 200 : 502);
    }
    if (route !== 'dm' && !body) return j({ error: 'bad' }, 400);
    const other = String((body && (body.name || body.to)) || url.searchParams.get('with') || ''), k = other.toLowerCase();
    if (!NAME_RE.test(other) || k === me) return j({ error: 'bad' }, 400);
    if (route === 'friend') {
      if (body.op === 'add') {
        if (!s.f[k] && Object.keys(s.f).length >= MAX_FRIENDS) return j({ error: 'too_many' }, 400);
        const r = await peerCall(this.env, other, 'p-friend', { from: a.name, op: 'add' });
        if (r.status === 404) return j({ error: 'no_account' }, 404);
        if (r.status !== 200) return j({ error: 'failed' }, 502);
        delete s.b[k];
        s.f[k] = { n: r.n || other, st: r.st === 'f' ? 'f' : 'out', at: now };
      } else {
        delete s.f[k];
        await peerCall(this.env, other, 'p-friend', { from: a.name, op: 'remove' });
      }
      await S.put('soc', s);
      this.push({ t: 'friend', k, v: s.f[k] || null });
      return j({ v: s.f[k] || null });
    }
    if (route === 'block') {
      if (body.on) {
        s.b[k] = (s.f[k] && s.f[k].n) || (s.c[k] && s.c[k].n) || other;
        if (s.f[k]) { delete s.f[k]; await peerCall(this.env, other, 'p-friend', { from: a.name, op: 'remove' }); }
      } else delete s.b[k];
      await S.put('soc', s);
      this.push({ t: 'social' });
      return j({ blocked: !!s.b[k] });
    }
    if (route === 'dm' && req.method === 'GET') { // one conversation, newest 50 (older with ?before=<seq>)
      const before = +url.searchParams.get('before') || 0;
      const opt = { prefix: 'm:' + k + ':', reverse: true, limit: 50 };
      if (before > 0) opt.end = 'm:' + k + ':' + pad(before);
      const list = [...(await S.list(opt)).values()].reverse(), c = s.c[k];
      if (c && c.un) { c.un = 0; await S.put('soc', s); this.push({ t: 'read', k }); }
      return j({ n: (c && c.n) || (s.f[k] && s.f[k].n) || other, msgs: list, more: list.length === 50 });
    }
    if (route === 'dm' && req.method === 'POST') {
      const t = plain(body.text).slice(0, DM_LEN);
      if (!t) return j({ error: 'bad' }, 400);
      if (s.b[k]) return j({ error: 'you_blocked' }, 403);
      this.sent = (this.sent || []).filter(x => now - x < 10000);
      if (this.sent.length >= 8) return j({ error: 'slow' }, 429);
      this.sent.push(now);
      const m = { id: rnd(6), t, ts: now };
      const r = await peerCall(this.env, other, 'p-dm', Object.assign({ from: a.name }, m));
      if (r.status === 404) return j({ error: 'no_account' }, 404);
      if (r.status !== 200) return j({ error: 'failed' }, 502);
      const rec = await this.addMsg(s, k, r.n || other, m, true);
      this.push({ t: 'dm', k, n: s.c[k].n, m: rec });
      return j({ m: rec, n: s.c[k].n });
    }
    if (route === 'call') { // video calls (2026-11-10): passes call set-up to another player's open pages; the video itself goes browser to browser
      const d = body.d, size = JSON.stringify(d || null).length;
      if (!d || typeof d !== 'object' || size > CALL_MAX) return j({ error: 'bad' }, 400);
      if (s.b[k]) return j({ error: 'you_blocked' }, 403);
      this.calls = (this.calls || []).filter(x => now - x < 10000);
      if (this.calls.length >= 20) return j({ error: 'slow' }, 429);
      this.calls.push(now);
      if (d.k === 'ring') { // at most 6 new calls a minute, so nobody can ring the whole Players list
        this.rings = (this.rings || []).filter(x => now - x < 60000);
        if (this.rings.length >= 6) return j({ error: 'slow' }, 429);
        this.rings.push(now);
      }
      const r = await peerCall(this.env, other, 'p-call', { from: a.name, d });
      if (r.status === 404) return j({ error: 'no_account' }, 404);
      if (r.status !== 200) return j({ error: 'failed' }, 502);
      return j({ on: r.on || 0, fr: r.fr || 0 });
    }
    return j({ error: 'not_found' }, 404);
  }
  /* Video-call relay (2026-11-10): short-lived logins for Cloudflare's TURN relay, which carries a call's video only
     when the two browsers can't reach each other directly. Off until the owner adds the secrets TURN_KEY_ID and
     TURN_KEY_TOKEN (deleting them turns it off again). Signed-in players only, at most 30 an hour each. */
  async turn(j, now) {
    const id = this.env.TURN_KEY_ID, tok = this.env.TURN_KEY_TOKEN;
    if (!id || !tok) return j({ iceServers: [] });
    this.turnAsks = (this.turnAsks || []).filter(x => now - x < 3600e3);
    if (this.turnAsks.length >= 30) return j({ error: 'slow' }, 429);
    this.turnAsks.push(now);
    const r = await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(id) + '/credentials/generate-ice-servers', {
      method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ ttl: TURN_TTL })
    }).catch(() => null);
    if (!r || !r.ok) return j({ iceServers: [] });
    const x = await r.json().catch(() => ({}));
    // browsers time out on port 53, so those addresses are left out
    const list = (Array.isArray(x.iceServers) ? x.iceServers : x.iceServers ? [x.iceServers] : [])
      .map(v => Object.assign({}, v, { urls: [].concat(v.urls || []).filter(u => typeof u === 'string' && !/:53(\?|$)/.test(u)) }))
      .filter(v => v.urls.length);
    return j({ iceServers: list, ttl: TURN_TTL });
  }
  // another account asking (friend requests, messages, an account going away)
  async peer(route, body, j, now) {
    const S = this.ctx.storage, a = await S.get('acct');
    if (!a) return j({ error: 'no_account' }, 404);
    const from = String(body.from || ''), k = from.toLowerCase();
    if (!NAME_RE.test(from)) return j({ error: 'bad' }, 400);
    const s = await this.soc();
    if (route === 'p-friend') {
      if (body.op === 'add') {
        if (s.b[k]) return j({ st: 'in', n: a.name }); // blocked: looks sent, nothing arrives
        const cur = s.f[k];
        if (!cur && Object.keys(s.f).length >= MAX_FRIENDS) return j({ st: 'in', n: a.name });
        s.f[k] = { n: from, st: cur && (cur.st === 'out' || cur.st === 'f') ? 'f' : 'in', at: now };
      } else delete s.f[k];
      await S.put('soc', s);
      this.push({ t: 'friend', k, v: s.f[k] || null });
      return j({ st: s.f[k] ? s.f[k].st : '', n: a.name });
    }
    if (route === 'p-dm') {
      if (s.b[k]) return j({ ok: true, n: a.name });
      const m = { id: String(body.id || '').slice(0, 16), t: plain(body.t).slice(0, DM_LEN), ts: +body.ts || now };
      if (!m.t) return j({ error: 'bad' }, 400);
      const rec = await this.addMsg(s, k, from, m, false);
      this.push({ t: 'dm', k, n: from, m: rec });
      return j({ ok: true, n: a.name });
    }
    if (route === 'p-call') { // anyone not blocked gets through (blocked looks the same as offline); fr = they're friends, so their camera may show while it rings
      if (s.b[k]) return j({ on: 0 });
      const fr = s.f[k] && s.f[k].st === 'f' ? 1 : 0, n = this.ctx.getWebSockets().length;
      if (n) this.push({ t: 'call', n: (fr && s.f[k].n) || from, d: body.d, fr });
      return j({ on: n, fr });
    }
    if (route === 'p-gone') {
      delete s.f[k]; delete s.c[k];
      await this.dropMsgs(k); await S.put('soc', s);
      this.push({ t: 'social' });
      return j({ ok: true });
    }
    return j({ error: 'not_found' }, 404);
  }
  // the account is being deleted: off the Players list, and out of everyone's friends and messages
  async goodbye(a) {
    const s = await this.soc(), names = new Set([...Object.values(s.f).map(x => x.n), ...Object.values(s.c).map(x => x.n)]);
    await Promise.all([...names].slice(0, 400).map(n => peerCall(this.env, n, 'p-gone', { from: a.name }).catch(() => null)));
    await dirCall(this.env, 'del', { n: a.name }).catch(() => null);
    for (const ws of this.ctx.getWebSockets()) try { ws.close(1000, 'deleted'); } catch (e) {}
  }
  // a new signed-in device: the token is the name plus a random part; only a hash of that part is kept
  async session(a) {
    const part = rnd(24);
    a.sess = (a.sess || []).filter(x => x && x.h);
    a.sess.push({ h: await sha(part), at: Date.now(), seen: Date.now() });
    if (a.sess.length > MAX_SESS) a.sess.splice(0, a.sess.length - MAX_SESS);
    return a.name + '.' + part;
  }
}


/* ==========================================================================
   Players, friends, private messages and the Global chat (2026-11-06).
   Kept cheap for the free plan: no polling anywhere. Pages fetch when opened, the account's sync answer carries
   the friend-request and unread counts, and live updates go over hibernating WebSockets (pings are answered by
   Cloudflare without waking anything).
   ========================================================================== */
const MAX_FRIENDS = 300, MAX_CONVOS = 300, KEEP_DM = 300, DM_LEN = 500, CALL_MAX = 24000, TURN_TTL = 4 * 3600;
const pad = n => String(n).padStart(10, '0');
// stars out swear words and slurs (the same list as the chat page's tidy())
const BAD = /\b(f+u+c+k+\w*|f+u+k+\w*|s+h+i+t+\w*|b+i+t+c+h+\w*|c+u+n+t+\w*|d+i+c+k+s?\b|p+u+s+s+y+\w*|a+s+s+h+o+l+e+\w*|bastard\w*|slut\w*|whore\w*|nigg\w*|n+i+g+a+\w*|fag\w*|retard\w*|twat\w*|wank\w*|porn\w*|penis\w*|vagina\w*|rape\w*)/gi;
const tidy = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().replace(BAD, w => w[0] + '*'.repeat(w.length - 1));
// chat and private message text is not filtered (the owner asked for uncensored chats, 2026-11-06); names still are
const plain = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const socCounts = s => ({ req: Object.values(s.f).filter(x => x.st === 'in').length, un: Object.values(s.c).reduce((n, c) => n + (c.un || 0), 0) });
const dirCall = (env, route, b) => env.DIR.get(env.DIR.idFromName('players')).fetch(new Request('https://dir/' + route, b ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-arcade-int': '1' }, body: JSON.stringify(b) } : {}));
async function peerCall(env, name, route, b) {
  const r = await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('u:' + name.toLowerCase())).fetch(new Request('https://acct/' + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-arcade-peer': '1' }, body: JSON.stringify(b) }));
  const x = await r.json().catch(() => ({}));
  x.status = r.status;
  return x;
}
// new WebSocket(url, ['arcade', token]): browsers can't set headers on a WebSocket, so the token rides as a subprotocol
const wsToken = req => ((req.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(x => x.trim())[1] || '').slice(0, 120);

// The Global chat socket: /chat/ws?room=&u=<guest id>&n=<guest name>. Signed-in players send their token and
// chat under their account name; others are guests.
function chatSocket(req, env, url) {
  if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
  const origin = req.headers.get('Origin') || '';
  if (!ALLOWED_ORIGINS.includes(origin)) return new Response('the chat is only available on the official website', { status: 403 });
  const room = (url.searchParams.get('room') || '').replace(/[^a-z0-9-]/gi, '').slice(0, 24).toLowerCase();
  const tok = wsToken(req), h = { Upgrade: 'websocket' };
  if (tok) h.authorization = 'Bearer ' + tok;
  const q = new URLSearchParams({ u: url.searchParams.get('u') || '', n: url.searchParams.get('n') || '' });
  return env.CHAT.get(env.CHAT.idFromName(room ? 'chat:test-' + room : 'chat:global')).fetch(new Request('https://chat/ws?' + q, { headers: h }));
}

const CHAT_KEEP = 150, CHAT_LEN = 200, CHAT_MAX = 1000;
// One room's chat. The newest CHAT_KEEP messages are one stored value ('log'), so waking up costs one read and
// each message one write. Everyone connected is the "In the chat" list.
export class Chat extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.log = null;
  }
  async getLog() { if (!this.log) this.log = (await this.ctx.storage.get('log')) || []; return this.log; }
  async fetch(req) {
    const url = new URL(req.url), now = Date.now();
    if (url.pathname === '/del') { // the owner's tools (admin() in the Worker)
      if (req.headers.get('x-arcade-int') !== '1') return new Response('{}', { status: 403 });
      const b = await req.json().catch(() => ({})), log = await this.getLog(), i = log.findIndex(m => m.id === b.id);
      if (i < 0) return new Response('{"error":"not_found"}', { status: 404 });
      log.splice(i, 1); await this.ctx.storage.put('log', log);
      this.all({ t: 'del', id: b.id });
      return new Response('{"deleted":true}');
    }
    this.sweep();
    if (this.ctx.getWebSockets().length >= CHAT_MAX) return new Response('chat full', { status: 503 });
    let who = null;
    const auth = req.headers.get('authorization') || '', nm = auth.replace(/^Bearer\s+/i, '').split('.')[0] || '';
    if (NAME_RE.test(nm)) {
      const r = await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('u:' + nm.toLowerCase())).fetch(new Request('https://acct/whoami', { headers: { authorization: auth } }));
      if (r.ok) { const x = await r.json().catch(() => ({})); if (x.name) who = { u: 'a:' + x.name.toLowerCase(), n: x.name, a: 1 }; }
    }
    if (!who) {
      const id = (url.searchParams.get('u') || '').replace(/[^a-z0-9]/gi, '').slice(0, 16) || rnd(6);
      let n = tidy(url.searchParams.get('n')).slice(0, 20);
      if (n.length < 2 || !/^[\p{L}\p{N} _.\-']+$/u.test(n) || n.includes('*') || /admin|moderator|\bmods?\b|official|staff|the arcade/i.test(n)) n = 'Guest';
      who = { u: 'g:' + id, n, a: 0 };
    }
    const pair = new WebSocketPair(), ws = pair[1];
    this.ctx.acceptWebSocket(ws);
    ws.serializeAttachment(Object.assign({ at: now, sent: [] }, who));
    ws.send(JSON.stringify({ t: 'hello', you: who, log: await this.getLog(), who: this.who() }));
    this.all({ t: 'who', who: this.who() }, ws);
    return new Response(null, { status: 101, webSocket: pair[0], headers: { 'Sec-WebSocket-Protocol': 'arcade' } });
  }
  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > 2000) return;
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || m.t !== 'say') return;
    const a = ws.deserializeAttachment() || {}, now = Date.now();
    a.sent = (a.sent || []).filter(x => now - x < 10000);
    const k = String(m.k || '').slice(0, 20);
    if (a.sent.length >= 5) { try { ws.send(JSON.stringify({ t: 'slow', k })); } catch (e) {} return; }
    const text = plain(m.text).slice(0, CHAT_LEN);
    if (!text) return;
    a.sent.push(now); ws.serializeAttachment(a);
    const log = await this.getLog();
    const msg = { id: rnd(6), u: a.u, n: a.n, a: a.a, t: text, ts: Math.max(now, log.length ? log[log.length - 1].ts + 1 : 0) };
    log.push(msg);
    if (log.length > CHAT_KEEP) log.splice(0, log.length - CHAT_KEEP);
    await this.ctx.storage.put('log', log);
    this.all({ t: 'msg', m: msg, k });
  }
  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch (e) {}
    this.all({ t: 'who', who: this.who(ws) }, ws);
  }
  async webSocketError(ws) { this.webSocketClose(ws, 1011); }
  async alarm() { if (this.sweep()) this.all({ t: 'who', who: this.who() }); }
  // one entry per person (several tabs count once): [u, n, a, at]
  who(skip) {
    const m = new Map();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === skip || ws.readyState !== 1) continue;
      const a = ws.deserializeAttachment();
      if (!a || !a.u) continue;
      const o = m.get(a.u);
      if (!o || a.at < o[3]) m.set(a.u, [a.u, a.n, a.a, a.at]);
    }
    return [...m.values()];
  }
  all(o, skip) { const out = JSON.stringify(o); for (const ws of this.ctx.getWebSockets()) if (ws !== skip) try { ws.send(out); } catch (e) {} }
  // close sockets that stopped pinging; true if any were dropped (the same as Room's)
  sweep() {
    const now = Date.now();
    let dropped = false, any = false;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      const last = Math.max(a.at || 0, +(this.ctx.getWebSocketAutoResponseTimestamp(ws) || 0));
      if (now - last > STALE_MS) { dropped = true; try { ws.close(1001, 'stale'); } catch (e) {} } else any = true;
    }
    if (any) this.ctx.storage.getAlarm().then(t => { if (!t) this.ctx.storage.setAlarm(now + SWEEP_MS); });
    return dropped;
  }
}

// Every account ever made (since the list started: older accounts join when they're next used), for the Players
// page. The list [[name, created, hasScores, lastSeen], ...] is kept in memory and stored as a few big values ('L:0', 'L:1',
// ...), so reading it costs a handful of rows; each player's scores are their own value ('u:<lower>').
const DIR_CHUNK = 100000;
export class Directory extends DurableObject {
  async names() {
    if (this.list) return this.list;
    const S = this.ctx.storage, n = (await S.get('L:n')) || 0;
    let str = '';
    if (n) { const parts = await S.get([...Array(n).keys()].map(i => 'L:' + i)); for (let i = 0; i < n; i++) str += parts.get('L:' + i) || ''; }
    try { this.list = str ? JSON.parse(str) : []; } catch (e) { this.list = []; }
    return this.list;
  }
  async saveNames() {
    const S = this.ctx.storage, str = JSON.stringify(this.list), n = Math.max(1, Math.ceil(str.length / DIR_CHUNK)), old = (await S.get('L:n')) || 0, put = { 'L:n': n };
    for (let i = 0; i < n; i++) put['L:' + i] = str.slice(i * DIR_CHUNK, (i + 1) * DIR_CHUNK);
    await S.put(put);
    if (old > n) await S.delete([...Array(old - n).keys()].map(i => 'L:' + (n + i)));
  }
  async fetch(req) {
    const url = new URL(req.url), route = url.pathname.slice(1), S = this.ctx.storage;
    const j = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
    const list = await this.names();
    if (route === 'list') return j({ players: list });
    if (route === 'top') { // 1.5: each player's stat line for one game (Chess's leaderboard), cached for a minute
      const g = String(url.searchParams.get('g') || ''); if (!GAME_RE.test(g)) return j({ error: 'bad' }, 400);
      const c = (this.topCache = this.topCache || {})[g]; if (c && Date.now() - c.at < 60e3) return j({ top: c.top });
      const ks = list.filter(x => x[2]).map(x => 'u:' + x[0].toLowerCase()), top = [];
      for (let i = 0; i < ks.length; i += 128) { const m = await S.get(ks.slice(i, i + 128)); for (const [k, u] of m) if (u && u.s && u.s[g]) { const e = list.find(x => 'u:' + x[0].toLowerCase() === k); top.push({ n: e ? e[0] : k.slice(2), s: u.s[g] }); } }
      this.topCache[g] = { at: Date.now(), top }; return j({ top });
    }
    if (route === 'get') {
      const n = String(url.searchParams.get('name') || ''), k = n.toLowerCase();
      if (!NAME_RE.test(n)) return j({ error: 'bad' }, 400);
      const e = list.find(x => x[0].toLowerCase() === k);
      if (!e) return j({ error: 'no_account' }, 404);
      const u = (await S.get('u:' + k)) || {};
      return j({ n: e[0], c: e[1], s: u.s || {}, at: u.at || 0, seen: e[3] || 0 });
    }
    if (req.headers.get('x-arcade-int') !== '1') return j({ error: 'not_found' }, 404);
    const b = await req.json().catch(() => ({})), n = String(b.n || ''), k = n.toLowerCase();
    if (!NAME_RE.test(n)) return j({ error: 'bad' }, 400);
    const i = list.findIndex(x => x[0].toLowerCase() === k);
    if (route === 'add' || route === 'stats') {
      const has = route === 'stats' && Object.keys(b.s || {}).length ? 1 : i >= 0 ? list[i][2] : 0;
      if (i < 0) { list.push([n, +b.c || Date.now(), has]); await this.saveNames(); }
      else if (list[i][2] !== has || list[i][0] !== n) { list[i] = [n, list[i][1], has, list[i][3] || 0]; await this.saveNames(); }
      if (route === 'stats') await S.put('u:' + k, { s: b.s || {}, at: Date.now() });
      return j({ ok: true });
    }
    if (route === 'seen') { if (i >= 0) { list[i][3] = Date.now(); await this.saveNames(); } return j({ ok: true }); }
    if (route === 'del') {
      if (i >= 0) { list.splice(i, 1); await this.saveNames(); }
      await S.delete('u:' + k);
      return j({ ok: true });
    }
    return j({ error: 'not_found' }, 404);
  }
}

// Krill Dive's "% of divers": how many divers gave each answer to each prompt. One object holds every prompt as
// 'p:<prompt text>' = { a: { answer: count }, v: { diverId: answer } }; a diver who meets a prompt again (practice
// dives) moves their one vote instead of adding another, so the share is per diver.
// The daily leaderboard (1.3): one board per UTC day, 'lb:<YYYY-MM-DD>' = [{ n, s, at }] (s = rarity points; the
// dive's depth is s * 10 m), one entry per account, best first, ties to whoever dived first. Only today's board
// takes new dives (and yesterday's for KD_LATE after midnight, for a dive that started before it), so a finished
// day never changes. 'lbdays' lists the days that have a board; the oldest are dropped past KD_DAYS.
//   POST /kd/score {d, s}  (Authorization: Bearer <token>; the name is the token's account) -> { rank, n, s }
//   POST /kd/lb {d}        -> { d, list: [{ n, s, at }], n }   (every diver, best first)
//   POST /kd/lb-days {}    -> { days: [{ d, n, top: [{ n, s }] }] }   (newest first, the last KD_DAYS days)
const KD_Q = 160, KD_A = 80, KD_ID = /^[0-9a-z]{8,32}$/, KD_VOTERS = 20000, KD_ANSWERS = 800, KD_PROMPTS = 5000;
const KD_DAY = /^\d{4}-\d{2}-\d{2}$/, KD_MAX = 700, KD_KEEP = 5000, KD_SHOW = 5000, KD_DAYS = 60, KD_LATE = 20 * 60000;
async function krill(req, env, url) {
  const origin = req.headers.get('Origin') || '';
  if (!ACCT_ORIGINS.includes(origin)) return new Response('only available on the official website', { status: 403 });
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const out = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST' || +(req.headers.get('content-length') || 0) > 8192) return out({ error: 'bad' }, 400);
  let body; try { body = await req.json(); } catch (e) { return out({ error: 'bad' }, 400); }
  let route = url.pathname.slice(4);
  if (!['vote', 'lb', 'lb-days', 'score'].includes(route)) return out({ error: 'not_found' }, 404); // 'lb-add' only comes from here
  if (route === 'score') { // a finished daily dive, under the diver's account name
    const auth = req.headers.get('authorization') || '', nm = auth.replace(/^Bearer\s+/i, '').split('.')[0] || '';
    if (!NAME_RE.test(nm)) return out({ error: 'auth' }, 401);
    const w = await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('u:' + nm.toLowerCase())).fetch(new Request('https://acct/whoami', { headers: { authorization: auth } }));
    const who = w.ok ? await w.json().catch(() => ({})) : {};
    if (!who.name) return out({ error: 'auth' }, 401);
    const now = Date.now(), td = new Date(now).toISOString().slice(0, 10), yd = new Date(now - 864e5).toISOString().slice(0, 10);
    const late = now - Date.parse(td + 'T00:00:00Z') < KD_LATE;
    if (!(body.d === td || (late && body.d === yd))) return out({ error: 'closed' }, 409);
    if (!Number.isInteger(body.s) || body.s < 0 || body.s > KD_MAX) return out({ error: 'bad' }, 400);
    body = { d: body.d, s: body.s, n: who.name }; route = 'lb-add';
  }
  const r = await env.TALLY.get(env.TALLY.idFromName('krill-dive')).fetch(new Request('https://tally/' + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }));
  return new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
}
// Turn! Turn! TURN! crew leaderboard: the best crews per stage. Only crew runs count (solo runs with the AI co-driver
// never send). The driver's screen sends the run with its account token; the server checks the driver is that account,
// then keeps each pair of players once (their best), shown as "Driver+Navigator". One Tally object 'ttt-board'.
//   GET  /ttt/board?s=<stage>                          -> { list: [{ d, n, ms, at }] }  (best first, top TTT_SHOW)
//   POST /ttt/run {s, ms, n}   (Authorization: Bearer <token>; the driver is the token's account) -> { rank }
const TTT_STAGE = /^[a-z0-9-]{2,24}$/, TTT_KEEP = 60, TTT_SHOW = 25, TTT_STAGES = 800;
async function turnBoard(req, env, url) {
  const origin = req.headers.get('Origin') || '';
  if (!ACCT_ORIGINS.includes(origin)) return new Response('only available on the official website', { status: 403 });
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const out = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...cors, 'content-type': 'application/json' } });
  const route = url.pathname.slice(5), tally = env.TALLY.get(env.TALLY.idFromName('ttt-board'));
  const call = body => tally.fetch(new Request('https://tally/ttt-' + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  if (route === 'board' && req.method === 'GET') {
    const s = url.searchParams.get('s') || '';
    if (!TTT_STAGE.test(s)) return out({ error: 'bad' }, 400);
    const r = await call({ s }); return new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
  }
  if (route === 'run' && req.method === 'POST') {
    if (+(req.headers.get('content-length') || 0) > 2048) return out({ error: 'bad' }, 400);
    let b; try { b = await req.json(); } catch (e) { return out({ error: 'bad' }, 400); }
    const auth = req.headers.get('authorization') || '', nm = auth.replace(/^Bearer\s+/i, '').split('.')[0] || '';
    if (!NAME_RE.test(nm)) return out({ error: 'auth' }, 401);
    const w = await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('u:' + nm.toLowerCase())).fetch(new Request('https://acct/whoami', { headers: { authorization: auth } }));
    const who = w.ok ? await w.json().catch(() => ({})) : {};
    if (!who.name) return out({ error: 'auth' }, 401);
    if (!TTT_STAGE.test(b.s || '') || !NAME_RE.test(b.n || '') || b.n.toLowerCase() === who.name.toLowerCase() || !(b.ms >= 20000 && b.ms <= 3600000)) return out({ error: 'bad' }, 400);
    const r = await call({ s: b.s, ms: Math.round(b.ms), d: who.name, n: b.n });
    return new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
  }
  return out({ error: 'not_found' }, 404);
}
export class Tally extends DurableObject {
  async fetch(req) {
    const route = new URL(req.url).pathname.slice(1), S = this.ctx.storage, b = await req.json().catch(() => ({}));
    const j = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
    const str = (v, n) => typeof v === 'string' && v.length && v.length <= n ? v : '';
    const total = rec => Object.keys(rec.v).length;
    if (route === 'vote') { // { q, a, id } -> { c: divers who gave this answer, n: divers who answered }
      const q = str(b.q, KD_Q), a = str(b.a, KD_A), id = KD_ID.test(b.id || '') ? b.id : '';
      if (!q || !a || !id) return j({ error: 'bad' }, 400);
      let rec = await S.get('p:' + q);
      if (!rec) { const np = (await S.get('np')) || 0; if (np >= KD_PROMPTS) return j({ error: 'full' }, 507); await S.put('np', np + 1); rec = { a: {}, v: {} }; }
      const old = rec.v[id];
      if (old !== a && (old !== undefined || total(rec) < KD_VOTERS) && (rec.a[a] || Object.keys(rec.a).length < KD_ANSWERS)) {
        if (old !== undefined && rec.a[old] && !--rec.a[old]) delete rec.a[old];
        rec.v[id] = a; rec.a[a] = (rec.a[a] || 0) + 1;
        await S.put('p:' + q, rec);
      }
      return j({ c: rec.a[a] || 0, n: total(rec) });
    }
    if (route === 'lb-add') { // { d, s, n } from krill(): a diver's one entry for the day (their first daily dive)
      let list = await S.get('lb:' + b.d), days = (await S.get('lbdays')) || [];
      if (!list) {
        list = []; days.push(b.d); days.sort();
        while (days.length > KD_DAYS) await S.delete('lb:' + days.shift());
        await S.put('lbdays', days);
      }
      const me = b.n.toLowerCase(); let i = list.findIndex(e => e.n.toLowerCase() === me);
      if (i < 0 && list.length < KD_KEEP) {
        list.push({ n: b.n, s: b.s, at: Date.now() }); list.sort((x, y) => y.s - x.s || x.at - y.at);
        await S.put('lb:' + b.d, list); i = list.findIndex(e => e.n.toLowerCase() === me);
      }
      return j({ rank: i + 1, n: list.length, s: i >= 0 ? list[i].s : b.s });
    }
    if (route === 'lb') { // { d } -> that day's board
      if (!KD_DAY.test(b.d || '')) return j({ error: 'bad' }, 400);
      const list = (await S.get('lb:' + b.d)) || [];
      return j({ d: b.d, list: list.slice(0, KD_SHOW), n: list.length });
    }
    if (route === 'lb-days') {
      const days = ((await S.get('lbdays')) || []).slice().reverse(), lists = await S.get(days.map(d => 'lb:' + d));
      return j({ days: days.map(d => { const l = lists.get('lb:' + d) || []; return { d, n: l.length, top: l.slice(0, 3).map(e => ({ n: e.n, s: e.s })) }; }) });
    }
    if (route === 'ttt-board') return j({ list: ((await S.get('lb:' + b.s)) || []).slice(0, TTT_SHOW) });
    if (route === 'ttt-run') { // a crew's run; one entry per pair of players, keeping their best
      let list = await S.get('lb:' + b.s);
      if (!list) { const ns = (await S.get('ns')) || 0; if (ns >= TTT_STAGES) return j({ error: 'full' }, 507); await S.put('ns', ns + 1); list = []; }
      const pair = [b.d.toLowerCase(), b.n.toLowerCase()].sort().join('+'), i = list.findIndex(e => [e.d.toLowerCase(), e.n.toLowerCase()].sort().join('+') === pair);
      if (i >= 0 && list[i].ms <= b.ms) return j({ rank: i + 1, best: list[i].ms });
      if (i >= 0) list.splice(i, 1);
      list.push({ d: b.d, n: b.n, ms: b.ms, at: Date.now() }); list.sort((x, y) => x.ms - y.ms); list.length = Math.min(list.length, TTT_KEEP);
      await S.put('lb:' + b.s, list);
      const k = list.findIndex(e => e.d === b.d && e.n === b.n && e.ms === b.ms);
      return j({ rank: k >= 0 ? k + 1 : 0, best: b.ms });
    }
    return j({ error: 'not_found' }, 404);
  }
}
