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
const ROUTES = ['check', 'signup', 'login', 'recover', 'sync', 'game', 'password', 'logout', 'delete']; // what a browser may ask an account for
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
  if (op !== 'info' && op !== 'delete') return out({ error: 'bad' }, 400);
  const call = (id, route, b) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName(id)).fetch(new Request('https://acct/' + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-arcade-admin': '1' }, body: JSON.stringify(b || {}) }));
  const g = await call('__admin_guard__', 'guard', { pw: String(body.pw || '') });
  if (g.status !== 200) return out(await g.json().catch(() => ({ error: 'wrong' })), g.status);
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
  async fetch(req) {
    const url = new URL(req.url), route = url.pathname.slice(1), S = this.ctx.storage, now = Date.now();
    const j = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
    const body = req.method === 'GET' ? null : await req.json().catch(() => ({}));
    if (req.headers.get('x-arcade-admin') === '1') return this.admin(route, body, j, now);
    let a = await S.get('acct');
    if (route === 'check') return j({ free: !a });
    if (route === 'signup') {
      if (a) return j({ error: 'taken' }, 409);
      if (!KEY_RE.test(body.key || '')) return j({ error: 'bad' }, 400);
      const code = newCode();
      a = { name: String(body.name), salt: rnd(16), created: now, fails: 0, lockUntil: 0, sess: [], games: {}, rs: rnd(16) };
      a.h = await sha(a.salt + body.key); a.rh = await sha(a.rs + normCode(code));
      const token = await this.session(a);
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
    if (route === 'logout') { a.sess.splice(si, 1); await S.put('acct', a); return j({ ok: true }); }
    if (route === 'password') {
      if (!KEY_RE.test(body.key || '') || !same(await sha(a.salt + (body.old || '')), a.h)) return j({ error: 'wrong' }, 401);
      a.salt = rnd(16); a.h = await sha(a.salt + body.key); a.sess = [];
      const token = await this.session(a); await S.put('acct', a); return j({ token });
    }
    if (route === 'delete') { // the player deletes their own account (they type their password again)
      if (!KEY_RE.test(body.key || '') || !same(await sha(a.salt + body.key), a.h)) return j({ error: 'wrong' }, 401);
      await S.deleteAll(); return j({ deleted: true });
    }
    if (route === 'sync') return j({ name: a.name, created: a.created, games: a.games || {} });
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
    if (route === 'adminwipe') { await S.deleteAll(); return j({ deleted: true, name: a.name }); }
    return j({ error: 'not_found' }, 404);
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
