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
const ALLOWED_ORIGINS = ['https://noah-and-lars.github.io', 'https://thearcade.pages.dev']; // 2026-11-13: the Cloudflare Pages copy shares this server

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/acct/')) return accounts(req, env, url);
    if (url.pathname === '/chat/ws') return chatSocket(req, env, url);
    if (url.pathname === '/notice') return siteNotice(req, env);
    if (url.pathname.startsWith('/kd/')) return krill(req, env, url);
    if (url.pathname.startsWith('/ttt/')) return turnBoard(req, env, url);
    if (url.pathname.startsWith('/clips/')) return clips(req, env, url);
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
const ACCT_ORIGINS = ['https://noah-and-lars.github.io', 'https://thearcade.pages.dev'];
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const RESERVED = /admin|moderator|^mods?$|official|staff|owner|^arcade|gametester|imacheater|^system$|^support$|^server$|^null$|^undefined$|^guest$|^anonymous$/;
const BAD_NAME = /fuck|fuk|shit|bitch|cunt|dick|pussy|asshole|bastard|slut|whore|nigg|niga|fag|retard|twat|wank|porn|penis|vagina|rape|nazi|hitler/;
const KEY_RE = /^[0-9a-f]{64}$/, GAME_RE = /^[a-z0-9-]{1,32}$/;
const ADMIN_HASH = '899ba39fe0b4ce0b8d4994cf7449cc63c2a8ade12fa77e590cfaf5999256ccf2';
const ROUTES = ['check', 'signup', 'login', 'recover', 'sync', 'game', 'password', 'logout', 'delete', 'social', 'friend', 'block', 'dm', 'profile', 'call', 'turn', 'group', 'rename', 'hbcheat', 'chess']; // what a browser may ask an account for
const HB_CHEATERS = ['noah', 'archiemccarthy', 'lars']; // Havoc Bay cheat menu accounts
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
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, authorization, x-arcade-dev', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
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
  if (route === 'admin') return admin(env, body, out, req.headers.get('Authorization') || '');
  if (route === 'check') name = String(url.searchParams.get('name') || '');
  else if (route === 'signup' || route === 'login' || route === 'recover') name = String(body && body.name || '');
  else {
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    name = tok.split('.')[0] || '';
    if (!NAME_RE.test(name)) return out({ error: 'auth' }, 401);
  }
  if (route === 'check' || route === 'signup') { const p = nameProblem(name); if (p) return out(route === 'check' ? { free: false, why: p } : { error: p }, route === 'check' ? 200 : 400); }
  else if (!NAME_RE.test(name)) return out({ error: 'no_account' }, 404);
  // device bans (2026-11-12): a banned device can't sign up, log in, recover or sync any account
  const dev = DEV_RE.test(req.headers.get('x-arcade-dev') || '') ? req.headers.get('x-arcade-dev') : '';
  if (dev && ['signup', 'login', 'recover', 'sync'].includes(route) && await devBanned(env, dev)) return out({ error: 'device_banned' }, 403);
  const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName('u:' + name.toLowerCase()));
  const r = await stub.fetch(new Request('https://acct/' + route + url.search, { method: req.method, headers: { 'authorization': req.headers.get('Authorization') || '', 'content-type': 'application/json', 'x-arcade-dev': dev }, body: body ? JSON.stringify(body) : undefined }));
  return new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
}
/* Device bans (2026-11-12, the owner's request for "hardware bans"; real hardware ids can't be read by a website):
   every browser keeps a random device id (account.js `devId`, sent as x-arcade-dev). Each account remembers the last
   DEV_KEEP devices it was used on ('devs'). The admin op 'devban' bans the account and puts all its devices on the list
   kept by the '__devbans__' object; a listed device can't sign up, log in, recover or sync. Clearing the browser's data
   or using another browser gives a new id, so it stops casual ban dodging, not determined people. */
const DEV_RE = /^[a-z0-9]{12,40}$/, DEV_KEEP = 12, DEV_MAX = 5000;
let devCache = { at: 0, set: null };
const devStore = env => env.ACCOUNTS.get(env.ACCOUNTS.idFromName('__devbans__'));
async function devBanned(env, dev) {
  if (!devCache.set || Date.now() - devCache.at > 60000) {
    const r = await devStore(env).fetch(new Request('https://acct/devlist', { method: 'POST', headers: { 'content-type': 'application/json', 'x-arcade-admin': '1' }, body: '{}' })).catch(() => null);
    const j = r && r.ok ? await r.json().catch(() => ({})) : {};
    devCache = { at: Date.now(), set: new Set(j.list || []) };
  }
  return devCache.set.has(dev);
}
const noteDev = (a, dev) => { if (!dev || !DEV_RE.test(dev) || (a.devs || []).includes(dev)) return false; a.devs = (a.devs || []).concat(dev).slice(-DEV_KEEP); return true; };
// the owner's tools: the password is checked (and wrong tries counted) by one guard object, then the account's own
// object is asked through a header only this Worker ever sets. Since 2026-11-11 a signed-in admin account (ADMIN_ACCOUNTS)
// needs no password, and can also ban, unban and rename accounts.
const ADMIN_ACCOUNTS = ['noah', 'lars', 'claude']; // the owner's request (2026-11-12): lars and Claude get the same powers
async function admin(env, body, out, auth) {
  const name = String(body.name || ''), op = body.op;
  if (!['info', 'delete', 'chatdel', 'clipdel', 'avatardel', 'ban', 'unban', 'rename', 'pending', 'approve', 'deny', 'newcode', 'devban', 'devunban', 'devinfo', 'noticeget', 'noticeset', 'noticeclear', 'chessset'].includes(op)) return out({ error: 'bad' }, 400);
  const call = (id, route, b) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName(id)).fetch(new Request('https://acct/' + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-arcade-admin': '1' }, body: JSON.stringify(b || {}) }));
  const who = auth ? await whoami(env, auth) : '';
  // 2026-11-11: uploaded photos and videos wait for approval, and only an admin account (not the password) can review them
  if (op === 'pending' || op === 'approve' || op === 'deny') {
    if (!ADMIN_ACCOUNTS.includes(who.toLowerCase())) return out({ error: 'not_admin' }, 403);
    const room = String(body.r || '').replace(/[^a-z0-9-]/gi, '').slice(0, 24).toLowerCase();
    const r = await clipIndex(env, room).fetch(new Request('https://clips/review', { method: 'POST', body: JSON.stringify({ op, id: String(body.id || ''), int: 1 }) }));
    return out(await r.json().catch(() => ({})), r.status);
  }
  if (!ADMIN_ACCOUNTS.includes(who.toLowerCase())) {
    const g = await call('__admin_guard__', 'guard', { pw: String(body.pw || '') });
    if (g.status !== 200) return out(await g.json().catch(() => ({ error: 'wrong' })), g.status);
  }
  if (op === 'noticeget' || op === 'noticeset' || op === 'noticeclear') { // the site announcement (see siteNotice)
    let n = null;
    if (op === 'noticeset') { n = cleanNotice(body, who); if (!n) return out({ error: 'bad' }, 400); }
    const r = await call('__notice__', op === 'noticeget' ? 'noticeget' : 'noticeput', { n });
    noticeCache = { at: 0, v: null };
    return out(await r.json().catch(() => ({})), r.status);
  }
  if ((op === 'ban' || op === 'rename' || op === 'delete' || op === 'newcode' || op === 'devban') && ADMIN_ACCOUNTS.includes(name.toLowerCase())) return out({ error: 'protected' }, 400);
  if (op === 'devban' || op === 'devunban') { // the account's ban plus every device it was used on
    if (!NAME_RE.test(name)) return out({ error: 'no_account' }, 404);
    const d = await call('u:' + name.toLowerCase(), 'admindevs');
    if (d.status !== 200) return out(await d.json().catch(() => ({})), d.status);
    const { devs } = await d.json();
    const ds = await devStore(env).fetch(new Request('https://acct/' + (op === 'devban' ? 'devadd' : 'devdel'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-arcade-admin': '1' }, body: JSON.stringify({ devs }) }));
    if (ds.status !== 200) return out({ error: 'failed' }, 502);
    devCache = { at: 0, set: null };
    await call('u:' + name.toLowerCase(), 'admindevflag', { on: op === 'devban' ? 1 : 0 });
    const r = await call('u:' + name.toLowerCase(), op === 'devban' ? 'adminban' : 'adminunban');
    const x = await r.json().catch(() => ({}));
    return out(Object.assign(x, { devices: devs.length, devbanned: op === 'devban' ? 1 : 0 }), r.status);
  }
  if (op === 'chatdel') { // take a message out of the Global chat
    const r = await env.CHAT.get(env.CHAT.idFromName('chat:global')).fetch(new Request('https://chat/del', { method: 'POST', headers: { 'content-type': 'application/json', 'x-arcade-int': '1' }, body: JSON.stringify({ id: String(body.id || '') }) }));
    return out(await r.json().catch(() => ({})), r.status);
  }
  if (op === 'clipdel') { // take a clip off Social (body.r: a ?clipsroom= test room)
    const room = String(body.r || '').replace(/[^a-z0-9-]/gi, '').slice(0, 24).toLowerCase();
    const r = await clipIndex(env, room).fetch(new Request('https://clips/admindel', { method: 'POST', body: JSON.stringify({ id: String(body.id || ''), me: 'admin_' }) }));
    return out(await r.json().catch(() => ({})), r.status);
  }
  if (op === 'avatardel') { // take a player's Social profile picture down
    const room = String(body.r || '').replace(/[^a-z0-9-]/gi, '').slice(0, 24).toLowerCase();
    const r = await clipIndex(env, room).fetch(new Request('https://clips/adminav', { method: 'POST', body: JSON.stringify({ name, me: 'admin_' }) }));
    return out(await r.json().catch(() => ({})), r.status);
  }
  if (!NAME_RE.test(name)) return out({ error: 'no_account' }, 404);
  // 2026-11-12: 'devinfo' (read only) is 'info' plus the account's device ids and activity times, for the admin console's
  // Accounts tab, which groups accounts that share a device to find each person's main account and their alts.
  const r = await call('u:' + name.toLowerCase(), { info: 'admininfo', devinfo: 'admindevinfo', delete: 'adminwipe', ban: 'adminban', unban: 'adminunban', rename: 'adminrename', newcode: 'adminnewcode', chessset: 'adminchess' }[op], { to: String(body.to || ''), r: body.r });
  return out(await r.json().catch(() => ({})), r.status);
}
/* Site announcement (2026-11-13): a banner on every page of the arcade, written in the admin console
   (admin ops noticeget / noticeset / noticeclear). Stored as one value on the '__notice__' object.
   GET /notice -> { n: { id, text, level: 'info'|'warn'|'alert', until, link, linkText, at, by } | null }
   Each Worker instance keeps it for a minute so page views don't each wake the object; account.js keeps it for 2 minutes. */
let noticeCache = { at: 0, v: null };
const NOTICE_LINK = /^(https:\/\/(noah-and-lars\.github\.io|thearcade\.pages\.dev)\/[^\s"'<>]*|[a-z0-9][a-z0-9_\-./?=&#]*)$/i;
function cleanNotice(b, who) {
  const text = tidy(b.text).slice(0, 280), level = ['info', 'warn', 'alert'].includes(b.level) ? b.level : 'info', now = Date.now();
  const until = +b.until || 0, link = String(b.link || '').trim().slice(0, 300), linkText = tidy(b.linkText).slice(0, 40);
  if (!text || (until && (until < now || until > now + 31 * 864e5)) || (link && (!NOTICE_LINK.test(link) || link.startsWith('//')))) return null;
  return { id: rnd(6), text, level, until, link, linkText, at: now, by: who || 'password' };
}
async function siteNotice(req, env) {
  const origin = req.headers.get('Origin') || '';
  if (!ACCT_ORIGINS.includes(origin)) return new Response('only available on the official website', { status: 403 });
  if (Date.now() - noticeCache.at > 60000) {
    const r = await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('__notice__')).fetch(new Request('https://acct/noticeget', { method: 'POST', headers: { 'content-type': 'application/json', 'x-arcade-admin': '1' }, body: '{}' })).catch(() => null);
    const x = r && r.ok ? await r.json().catch(() => ({})) : {};
    noticeCache = { at: Date.now(), v: x.n || null };
  }
  const n = noticeCache.v && (!noticeCache.v.until || noticeCache.v.until > Date.now()) ? noticeCache.v : null;
  return new Response(JSON.stringify({ n }), { headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Cache-Control': 'max-age=60' } });
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
    if (req.headers.get('x-arcade-move') === '1') return this.moveIn(body || {}, j, now);
    if (req.headers.get('x-arcade-cg') === '1') return this.chessGame(body || {}, j, now); // a Chess game's result (only this Worker sets the header)
    let a = await S.get('acct');
    if (route === 'check') return j(a && a.kn ? { free: false, kn: a.kn } : { free: !a }); // kn: the name the password key was made with (2026-11-11)
    // an account that moved to a new name (renameTo). Since 2026-11-13 ('keep') its devices stay signed in: their old
    // token (old name + random part) is passed on to the new name's object, which checks the part against its sessions,
    // and account.js swaps in the new name when sync answers (or the live socket says 'renamed'). Older moves sign out.
    if (!a && !['signup', 'login', 'recover'].includes(route)) {
      const mv = await S.get('moved');
      if (mv && mv.keep && NAME_RE.test(mv.to || '')) {
        const part = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').split('.')[1] || '';
        if (!part) return j({ error: 'auth' }, 401);
        const h = new Headers(req.headers); h.set('authorization', 'Bearer ' + mv.to + '.' + part);
        return this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('u:' + mv.to.toLowerCase())).fetch(new Request('https://acct/' + route + url.search, { method: req.method, headers: h, body: body ? JSON.stringify(body) : undefined }));
      }
      if (mv) return j({ error: 'auth' }, 401);
    }
    if (route === 'signup') {
      if (a) return j({ error: 'taken' }, 409);
      if (!KEY_RE.test(body.key || '')) return j({ error: 'bad' }, 400);
      const code = newCode();
      a = { name: String(body.name), salt: rnd(16), created: now, fails: 0, lockUntil: 0, sess: [], games: {}, rs: rnd(16) };
      a.h = await sha(a.salt + body.key); a.rh = await sha(a.rs + normCode(code));
      noteDev(a, req.headers.get('x-arcade-dev'));
      const token = await this.session(a);
      await dirCall(this.env, 'add', { n: a.name, c: a.created }); a.listed = 1;
      await S.put('acct', a);
      return j({ token, name: a.name, recovery: code });
    }
    if (!a) return j({ error: 'no_account' }, 404);
    if (a.banned) return j({ error: 'banned' }, 403);
    if (route === 'login' || route === 'recover') {
      if (a.lockUntil > now) return j({ error: 'locked', wait: Math.ceil((a.lockUntil - now) / 1000) }, 429);
      if (!KEY_RE.test(body.key || '')) return j({ error: 'bad' }, 400);
      const ok = route === 'login' ? same(await sha(a.salt + body.key), a.h) : same(await sha(a.rs + normCode(body.code)), a.rh);
      if (!ok) { a.fails = (a.fails || 0) + 1; if (a.fails >= 8) { a.fails = 0; a.lockUntil = now + 10 * 60 * 1000; } await S.put('acct', a); return j({ error: 'wrong' }, 401); }
      a.fails = 0;
      let recovery;
      if (route === 'recover') { a.salt = rnd(16); a.h = await sha(a.salt + body.key); a.sess = []; delete a.kn; recovery = newCode(); a.rs = rnd(16); a.rh = await sha(a.rs + normCode(recovery)); }
      noteDev(a, req.headers.get('x-arcade-dev'));
      const token = await this.session(a);
      await S.put('acct', a);
      return j(recovery ? { token, name: a.name, recovery } : { token, name: a.name });
    }
    // everything else needs a signed-in device
    const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), part = tok.split('.')[1] || '';
    const th = part ? await sha(part) : '', si = (a.sess || []).findIndex(x => same(x.h, th));
    if (si < 0) return j({ error: 'auth' }, 401);
    if (now - (a.sess[si].seen || 0) > 864e5 | noteDev(a, req.headers.get('x-arcade-dev'))) { a.sess[si].seen = now; await S.put('acct', a); }
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
    if (route === 'group') return this.group(req, url, body, a, j, now);
    if (route === 'chess') return this.chess(req, body, a, j, now);
    if (route === 'turn') return this.turn(j, now);
    if (route === 'logout') { a.sess.splice(si, 1); await S.put('acct', a); return j({ ok: true }); }
    if (route === 'password') {
      if (!KEY_RE.test(body.key || '') || !same(await sha(a.salt + (body.old || '')), a.h)) return j({ error: 'wrong' }, 401);
      a.salt = rnd(16); a.h = await sha(a.salt + body.key); a.sess = []; delete a.kn;
      const token = await this.session(a); await S.put('acct', a); return j({ token });
    }
    if (route === 'delete') { // the player deletes their own account (they type their password again)
      if (!KEY_RE.test(body.key || '') || !same(await sha(a.salt + body.key), a.h)) return j({ error: 'wrong' }, 401);
      await this.goodbye(a); await S.deleteAll(); return j({ deleted: true });
    }
    if (route === 'hbcheat') { // Havoc Bay's cheat menu: a short signed ticket, only for these accounts
      if (!HB_CHEATERS.includes(String(a.name).toLowerCase()) || !this.env.HB_CHEAT_KEY) return j({ error: 'no' }, 403);
      const id = String(url.searchParams.get('id') || '').replace(/[^a-z0-9]/g, '').slice(0, 12);
      const msg = `hb|${String(a.name).toLowerCase()}|${id}|${now + 30 * 60000}`;
      const key = await crypto.subtle.importKey('jwk', JSON.parse(this.env.HB_CHEAT_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
      const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(msg)));
      return j({ t: msg + '|' + btoa(String.fromCharCode(...sig)) });
    }
    if (route === 'sync') return j({ name: a.name, created: a.created, games: a.games || {}, soc: socCounts(await this.soc()), mustRename: mustRename(a) ? 1 : 0 });
    if (route === 'rename') return this.renameTo(a, body || {}, j, now);
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
    if (route === 'noticeget') return j({ n: (await S.get('notice')) || null }); // only on the '__notice__' object
    if (route === 'noticeput') { if (body && body.n) await S.put('notice', body.n); else await S.delete('notice'); return j({ ok: 1, n: (body && body.n) || null }); }
    if (route === 'devlist' || route === 'devadd' || route === 'devdel') { // only on the '__devbans__' object
      let list = (await S.get('devbans')) || [];
      if (route === 'devlist') return j({ list });
      const ds = (Array.isArray(body.devs) ? body.devs : []).filter(d => DEV_RE.test(d));
      list = route === 'devadd' ? [...new Set(list.concat(ds))].slice(-DEV_MAX) : list.filter(d => !ds.includes(d));
      await S.put('devbans', list);
      return j({ ok: 1, n: list.length });
    }
    const a = await S.get('acct');
    if (!a) return j({ error: 'no_account' }, 404);
    if (route === 'admindevs') return j({ name: a.name, devs: a.devs || [] });
    if (route === 'admindevinfo') {
      const games = {}; for (const [k, m] of Object.entries(a.games || {})) games[k] = { size: m.size, at: m.at };
      return j({ name: a.name, created: a.created, seenAt: a.seenAt || 0, sessSeen: Math.max(0, ...(a.sess || []).map(x => x.seen || 0)), devices: (a.sess || []).length,
        games, banned: a.banned ? 1 : 0, devban: a.devban ? 1 : 0, devs: a.devs || [] });
    }
    if (route === 'admininfo') {
      const games = {}; for (const [k, m] of Object.entries(a.games || {})) games[k] = { size: m.size, at: m.at };
      return j({ name: a.name, created: a.created, devices: (a.sess || []).length, games, banned: a.banned ? 1 : 0, devs: (a.devs || []).length, devban: a.devban ? 1 : 0 });
    }
    // 2026-11-11: a ban signs the account out everywhere, stops it logging in, and takes it off the Players list
    if (route === 'adminban') {
      a.banned = { at: now }; a.sess = []; await S.put('acct', a);
      await dirCall(this.env, 'del', { n: a.name }).catch(() => null);
      for (const ws of this.ctx.getWebSockets()) try { ws.close(1000, 'banned'); } catch (e) {}
      return j({ banned: true, name: a.name });
    }
    // 2026-11-12: a new recovery code for a player who can't get in (the owner gives it to them; they choose a new password
    // with Forgot password). The old code stops working, a lockout from wrong tries is cleared, devices stay signed in.
    // Codes are only ever stored hashed, so the old one can't be shown.
    if (route === 'adminnewcode') {
      const code = newCode(); a.rs = rnd(16); a.rh = await sha(a.rs + normCode(code)); a.fails = 0; a.lockUntil = 0;
      await S.put('acct', a);
      return j({ name: a.name, code });
    }
    if (route === 'admindevflag') { if (body.on) a.devban = { at: now }; else delete a.devban; await S.put('acct', a); return j({ ok: 1 }); }
    if (route === 'adminunban') { delete a.banned; await S.put('acct', a); await dirCall(this.env, 'add', { n: a.name, c: a.created }).catch(() => null); return j({ unbanned: true, name: a.name }); }
    if (route === 'adminrename') return this.renameTo(a, { name: body && body.to }, j, now, true);
    if (route === 'adminchess') { // 2026-11-14: set a player's Chess Elo (it lives here since Chess 1.6.1)
      const r = Math.round(+(body && body.r)); if (!isFinite(r) || r < 0 || r > 4000) return j({ error: 'bad' }, 400);
      const c = await this.chessOf(a); c.r = r; c.peak = r; c.at = now; await this.chessSave(a, c); return j({ name: a.name, elo: r });
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
    c.n = n; c.seq = (c.seq || 0) + 1; c.ts = m.ts; c.t = m.t.slice(0, 80); c.me = mine ? 1 : 0; c.by = m.by || '';
    if (!mine) c.un = (c.un || 0) + 1;
    const rec = { id: m.id, f: mine ? 1 : 0, t: m.t, ts: m.ts, q: c.seq };
    if (m.by) rec.by = m.by;
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
      // Chess 1.6.1: the Elo on the leaderboard is the server's, whatever the browser says
      if (clean.chess) { const c = await this.chessOf(a), e = 'Elo ' + Math.round(c.r); clean.chess = /Elo \d+/.test(clean.chess || '') ? clean.chess.replace(/Elo \d+/, e) : [e, clean.chess].filter(Boolean).join(' · '); }
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
      if (this.calls.length >= 240) return j({ error: 'slow' }, 429); // a 15-person call sends a lot of set-up
      this.calls.push(now);
      if (d.k === 'ring') { // at most 6 new calls a minute, each ringing at most 20 people, so nobody can ring the whole Players list
        this.rings = (this.rings || []).filter(x => now - x.t < 60000);
        const cid = String(d.id || ''), mine = this.rings.filter(x => x.id === cid).length, calls = new Set(this.rings.map(x => x.id));
        if ((!mine && calls.size >= 6) || mine >= 20) return j({ error: 'slow' }, 429);
        this.rings.push({ t: now, id: cid });
      }
      const r = await peerCall(this.env, other, 'p-call', { from: a.name, d });
      if (r.status === 404) return j({ error: 'no_account' }, 404);
      if (r.status !== 200) return j({ error: 'failed' }, 502);
      return j({ on: r.on || 0, fr: r.fr || 0 });
    }
    return j({ error: 'not_found' }, 404);
  }
  /* ---------- group chats (2026-11-11) ----------
     Up to GROUP_MAX people. Like private chats, every member keeps their own copy: the group is the conversation
     'g~<id>' in each member's 'soc'.c ({n: group name, g: 1, mem: [names], own: who made it, seq, un, ts, t, me, by}),
     and each message is stored by every member ('m:g~<id>:<seq>', with by = who wrote it). Whoever changes the group
     tells every member ('p-grp' set: the whole member list), a message goes to every member ('p-gmsg'). Anyone in a
     group can add people (up to the limit) or rename it; leaving takes you out of everyone's list. Someone who has
     blocked you can't be put in a group by you, and you don't get messages from people you've blocked.
       GET  /acct/group?id=<id>[&before=<seq>]       -> { n, mem, own, msgs, more }
       POST /acct/group { op: 'make', name, mem }     -> { k, c }
                        { op: 'add', id, mem } | { op: 'rename', id, name } | { op: 'leave', id } | { op: 'say', id, text } */
  async group(req, url, body, a, j, now) {
    const S = this.ctx.storage, s = await this.soc(), me = a.name;
    const gid = String((body && body.id) || url.searchParams.get('id') || ''), k = 'g~' + gid, c = s.c[k];
    const gname = v => plain(v).slice(0, 40);
    const tell = (names, b) => Promise.all(names.map(n => peerCall(this.env, n, b.op ? 'p-grp' : 'p-gmsg', Object.assign({ from: me, id: gid }, b)).then(r => ({ n, r }), () => ({ n, r: { status: 0 } }))));
    if (req.method === 'GET') {
      if (!c || !c.g) return j({ error: 'not_found' }, 404);
      const before = +url.searchParams.get('before') || 0, opt = { prefix: 'm:' + k + ':', reverse: true, limit: 50 };
      if (before > 0) opt.end = 'm:' + k + ':' + pad(before);
      const list = [...(await S.list(opt)).values()].reverse();
      if (c.un) { c.un = 0; await S.put('soc', s); this.push({ t: 'read', k }); }
      return j({ n: c.n, mem: c.mem, own: c.own, msgs: list, more: list.length === 50 });
    }
    if (!body || typeof body !== 'object') return j({ error: 'bad' }, 400);
    const names = v => [...new Map((Array.isArray(v) ? v : []).map(String).filter(n => NAME_RE.test(n) && n.toLowerCase() !== me.toLowerCase()).map(n => [n.toLowerCase(), n])).values()];
    // tell the new members, keep the ones who could be added (real accounts that haven't blocked you)
    const invite = async (list, mem, name, own, id) => {
      const res = await tell(list, { op: 'set', name, mem, own, id });
      return res.filter(x => x.r.status === 200 && x.r.ok).map(x => x.r.n || x.n);
    };
    if (body.op === 'make') {
      const name = gname(body.name), want = names(body.mem).filter(n => !s.b[n.toLowerCase()]);
      if (!name || !want.length) return j({ error: 'bad' }, 400);
      if (want.length > GROUP_MAX - 1) return j({ error: 'too_many' }, 400);
      this.grps = (this.grps || []).filter(x => now - x < 3600e3);
      if (this.grps.length >= 10) return j({ error: 'slow' }, 429);
      this.grps.push(now);
      const id = rnd(5);
      return this.groupSet(s, id, name, me, [me].concat(want), want, j, now, invite, me);
    }
    if (!c || !c.g) return j({ error: 'not_found' }, 404);
    const others = c.mem.filter(n => n.toLowerCase() !== me.toLowerCase());
    if (body.op === 'add') {
      const have = new Set(c.mem.map(n => n.toLowerCase())), want = names(body.mem).filter(n => !have.has(n.toLowerCase()) && !s.b[n.toLowerCase()]);
      if (!want.length) return j({ error: 'bad' }, 400);
      if (c.mem.length + want.length > GROUP_MAX) return j({ error: 'too_many' }, 400);
      return this.groupSet(s, gid, c.n, c.own, c.mem.concat(want), want, j, now, invite, me, others);
    }
    if (body.op === 'rename') {
      const name = gname(body.name); if (!name) return j({ error: 'bad' }, 400);
      c.n = name; await S.put('soc', s); await tell(others, { op: 'set', name, mem: c.mem, own: c.own });
      this.push({ t: 'grp', k, c }); return j({ k, c });
    }
    if (body.op === 'leave') {
      const mem = others, own = c.own && c.own.toLowerCase() === me.toLowerCase() ? (mem[0] || '') : c.own;
      delete s.c[k]; await this.dropMsgs(k); await S.put('soc', s);
      await tell(mem, { op: 'set', name: c.n, mem, own });
      this.push({ t: 'grp', k, c: null }); return j({ ok: true });
    }
    if (body.op === 'say') {
      const t = plain(body.text).slice(0, DM_LEN);
      if (!t) return j({ error: 'bad' }, 400);
      this.sent = (this.sent || []).filter(x => now - x < 10000);
      if (this.sent.length >= 8) return j({ error: 'slow' }, 429);
      this.sent.push(now);
      const m = { id: rnd(6), t, ts: now, by: me };
      const rec = await this.addMsg(s, k, c.n, m, true);
      this.push({ t: 'gm', k, n: c.n, m: rec });
      this.ctx.waitUntil(tell(others, { m }));
      return j({ m: rec, n: c.n });
    }
    return j({ error: 'bad' }, 400);
  }
  // a new or bigger member list: the new people are asked first (some can't be added), then everyone gets the final list
  async groupSet(s, id, name, own, mem, fresh, j, now, invite, me, old) {
    const k = 'g~' + id, ok = await invite(fresh, mem, name, own, id), okL = new Set(ok.map(n => n.toLowerCase()));
    if (!ok.length && !old) return j({ error: 'no_one' }, 400);
    const final = mem.filter(n => !fresh.some(f => f.toLowerCase() === n.toLowerCase()) || okL.has(n.toLowerCase()))
      .map(n => ok.find(x => x.toLowerCase() === n.toLowerCase()) || n);
    const tellAll = final.filter(n => n.toLowerCase() !== me.toLowerCase());
    if (final.length !== mem.length || old) await Promise.all(tellAll.map(n => peerCall(this.env, n, 'p-grp', { from: me, id, op: 'set', name, mem: final, own }).catch(() => null)));
    const c = s.c[k] || (s.c[k] = { seq: 0, un: 0, ts: now, t: 'You made the group', me: 1 });
    Object.assign(c, { n: name, g: 1, mem: final, own });
    await this.ctx.storage.put('soc', s);
    this.push({ t: 'grp', k, c });
    return j({ k, c, skipped: fresh.filter(n => !okL.has(n.toLowerCase())) });
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
    if (route === 'p-chessget') { const c = await this.chessOf(a); return j({ r: c.r, rd: chessRd(c, now) }); }
    if (route === 'p-chessapply') return j(await this.chessApply(a, String(body.kind || ''), body.o || {}, now));
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
    if (route === 'p-grp') { // a group you're in (or are being put in) changed: its name and whole member list
      const gk = 'g~' + String(body.id || '').replace(/[^0-9a-f]/g, '').slice(0, 16);
      if (gk === 'g~') return j({ error: 'bad' }, 400);
      const mem = (Array.isArray(body.mem) ? body.mem : []).map(String).filter(n => NAME_RE.test(n)).slice(0, GROUP_MAX);
      const cur = s.c[gk];
      if (!cur && s.b[k]) return j({ ok: 0, n: a.name }); // blocked them: they can't put you in a group
      if (cur && !cur.mem.some(n => n.toLowerCase() === k)) return j({ ok: 0, n: a.name }); // only members change a group
      if (!mem.some(n => n.toLowerCase() === a.name.toLowerCase())) { // you were taken out
        if (cur) { delete s.c[gk]; await this.dropMsgs(gk); await S.put('soc', s); this.push({ t: 'grp', k: gk, c: null }); }
        return j({ ok: 1, n: a.name });
      }
      const c = cur || (s.c[gk] = { seq: 0, un: 1, ts: now, t: from + ' added you', me: 0, by: '' });
      Object.assign(c, { n: plain(body.name).slice(0, 40) || 'Group', g: 1, mem, own: NAME_RE.test(String(body.own || '')) ? String(body.own) : from });
      await S.put('soc', s);
      this.push({ t: 'grp', k: gk, c, by: from, fresh: !cur });
      return j({ ok: 1, n: a.name });
    }
    if (route === 'p-gmsg') { // a message in a group you're in
      const gk = 'g~' + String(body.id || '').replace(/[^0-9a-f]/g, '').slice(0, 16), c = s.c[gk], m0 = body.m || {};
      if (!c || !c.mem.some(n => n.toLowerCase() === k)) return j({ ok: 0 });
      if (s.b[k]) return j({ ok: 1 });
      const m = { id: String(m0.id || '').slice(0, 16), t: plain(m0.t).slice(0, DM_LEN), ts: +m0.ts || now, by: from };
      if (!m.t) return j({ error: 'bad' }, 400);
      const rec = await this.addMsg(s, gk, c.n, m, false);
      this.push({ t: 'gm', k: gk, n: c.n, m: rec });
      return j({ ok: 1 });
    }
    if (route === 'p-rename') { // someone this account knows changed their name: friends, blocks, chats and groups follow
      const to = String(body.to || ''), nk = to.toLowerCase();
      if (!NAME_RE.test(to)) return j({ error: 'bad' }, 400);
      if (s.f[k]) { s.f[nk] = Object.assign(s.f[k], { n: to }); delete s.f[k]; }
      if (s.b[k]) { s.b[nk] = to; delete s.b[k]; }
      if (s.c[k] && !s.c[k].g) {
        s.c[nk] = Object.assign(s.c[k], { n: to }); delete s.c[k];
        const msgs = await S.list({ prefix: 'm:' + k + ':' }), put = {};
        for (const [mk, v] of msgs) put['m:' + nk + ':' + mk.slice(k.length + 3)] = v;
        const ks = Object.keys(put); for (let i = 0; i < ks.length; i += 100) await S.put(Object.fromEntries(ks.slice(i, i + 100).map(x => [x, put[x]])));
        if (msgs.size) { const old = [...msgs.keys()]; for (let i = 0; i < old.length; i += 100) await S.delete(old.slice(i, i + 100)); }
      }
      for (const c of Object.values(s.c)) if (c.g) { c.mem = (c.mem || []).map(n => n.toLowerCase() === k ? to : n); if (String(c.own || '').toLowerCase() === k) c.own = to; }
      await S.put('soc', s);
      this.push({ t: 'social' });
      return j({ ok: 1 });
    }
    if (route === 'p-gone') {
      delete s.f[k]; delete s.c[k];
      await this.dropMsgs(k); await S.put('soc', s);
      this.push({ t: 'social' });
      return j({ ok: true });
    }
    return j({ error: 'not_found' }, 404);
  }
  /* ---------- a forced name change (2026-11-11) ----------
     The owner gave a name to someone else (RENAME_NAMES: accounts with that name made before RENAME_BEFORE). Such an
     account is asked once (sync's mustRename) to pick a new name; everything moves to the new name's object
     ('x-arcade-move', in batches), the Players list and everyone it knows (friends, chats, groups: 'p-rename') get the new
     name, this device gets a new token, and the old object keeps only 'moved' {to, keep}. Every signed-in device keeps
     working (2026-11-13: an admin renaming a player no longer signs them out): the sessions move with the account, the
     old object passes old tokens on, and the live sockets are told { t: 'renamed', name } before they close. */
  async renameTo(a, body, j, now, byAdmin) {
    // anyone can change their name (2026-11-11), once a week; a forced change (or the owner's) is always allowed
    if (!byAdmin && !mustRename(a) && a.renamedAt && now - a.renamedAt < 7 * 864e5) return j({ error: 'slow', wait: Math.ceil((a.renamedAt + 7 * 864e5 - now) / 864e5) }, 429);
    const nn = String(body.name || ''), p = nameProblem(nn);
    if (p) return j({ error: p }, 400);
    if (nn.toLowerCase() === a.name.toLowerCase()) return j({ error: 'taken' }, 409);
    const S = this.ctx.storage, old = a.name, dest = this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('u:' + nn.toLowerCase()));
    const move = async b => { const r = await dest.fetch(new Request('https://acct/move', { method: 'POST', headers: { 'content-type': 'application/json', 'x-arcade-move': '1' }, body: JSON.stringify(Object.assign({ from: old }, b)) })); return r.status; };
    if (await move({ begin: 1 }) !== 200) return j({ error: 'taken' }, 409);
    const all = [...(await S.list()).entries()].filter(([k]) => k !== 'acct' && k !== 'moved');
    for (let i = 0; i < all.length; i += 100) if (await move({ e: all.slice(i, i + 100) }) !== 200) return j({ error: 'failed' }, 502);
    if (!a.kn) a.kn = old.toLowerCase(); // the password key was stretched with the old name: keep using it until the password changes
    a.name = nn; a.listed = 1; a.renamedAt = now;
    const token = byAdmin ? '' : await this.session(a); // an admin's rename adds no session (the player's own carry over)
    if (await move({ e: [['acct', a]], end: 1 }) !== 200) return j({ error: 'failed' }, 502);
    // the Players list, with the scores carried over
    const prof = await (await dirCall(this.env, 'get?name=' + encodeURIComponent(old))).json().catch(() => ({}));
    await dirCall(this.env, 'del', { n: old }).catch(() => null);
    await dirCall(this.env, 'add', { n: nn, c: a.created }).catch(() => null);
    if (prof && prof.s && Object.keys(prof.s).length) await dirCall(this.env, 'stats', { n: nn, c: a.created, s: prof.s }).catch(() => null);
    // everyone this account knows
    const s = await this.soc(), names = new Set();
    for (const f of Object.values(s.f)) names.add(f.n);
    for (const [k, c] of Object.entries(s.c)) { if (c.g) (c.mem || []).forEach(n => names.add(n)); else names.add(c.n); }
    names.delete(old); names.delete(nn);
    await Promise.all([...names].slice(0, 600).map(n => peerCall(this.env, n, 'p-rename', { from: old, to: nn }).catch(() => null)));
    await clipIndex(this.env, '').fetch(new Request('https://clips/rename', { method: 'POST', body: JSON.stringify({ int: 1, from: old, to: nn }) })).catch(() => null);
    const note = JSON.stringify({ t: 'renamed', name: nn, from: old, admin: byAdmin ? 1 : 0 });
    for (const ws of this.ctx.getWebSockets()) try { ws.send(note); ws.close(1000, 'renamed'); } catch (e) {}
    await S.deleteAll(); await S.put('moved', { to: nn, at: now, keep: 1 });
    return j(token ? { token, name: nn } : { name: nn });
  }
  // the new name's object, filled in by renameTo()
  async moveIn(b, j, now) {
    const S = this.ctx.storage;
    if (await S.get('acct')) return j({ error: 'taken' }, 409);
    const m = await S.get('moving');
    if (b.begin) { if (m && m.from !== b.from && now - m.at < 120000) return j({ error: 'taken' }, 409); await S.deleteAll(); await S.put('moving', { from: b.from, at: now }); return j({ ok: 1 }); }
    if (!m || m.from !== b.from) return j({ error: 'bad' }, 400);
    const put = {}; for (const [k, v] of (Array.isArray(b.e) ? b.e : [])) put[k] = v;
    if (Object.keys(put).length) await S.put(put);
    if (b.end) await S.delete('moving');
    return j({ ok: 1 });
  }
  // the account is being deleted: off the Players list, and out of everyone's friends and messages
  async goodbye(a) {
    const s = await this.soc(), names = new Set([...Object.values(s.f).map(x => x.n), ...Object.values(s.c).map(x => x.n)]);
    await Promise.all([...names].slice(0, 400).map(n => peerCall(this.env, n, 'p-gone', { from: a.name }).catch(() => null)));
    await dirCall(this.env, 'del', { n: a.name }).catch(() => null);
    await clipIndex(this.env, '').fetch(new Request('https://clips/purge', { method: 'POST', body: JSON.stringify({ int: 1, from: a.name }) })).catch(() => null);
    for (const ws of this.ctx.getWebSockets()) try { ws.close(1000, 'deleted'); } catch (e) {}
  }
  /* ---------- Chess Elo (1.6.1, 2026-11-14) ----------
     The Elo lives here (storage key 'chess' {r, rd, at, n, peak, lpn}), not in the player's browser. It started from the number on
     the leaderboard (the Players list's chess line) the first time this account was asked, except ELO_FIXED (1000).
     GET /acct/chess: your Elo. POST /acct/chess {g, opp, res, n}: a game's result, res 'w' | 'l' | 'd' | 'quit' (you left)
     | 'left' (they left); it goes to that game's own object ('cg:<g>:<both names>'), which changes a rating only when it
     hurts the player who reported it (a loss, leaving) or when both players' reports agree. The Players list's chess
     line always carries this number, so editing a browser's save can't change the leaderboard. */
  async chessOf(a) {
    const have = await this.ctx.storage.get('chess'); // its own key, so other requests saving 'acct' never undo a game
    if (have && isFinite(have.r)) return have;
    let r = CHESS.start, rd = CHESS.rd0, n = 0;
    if (String(a.name).toLowerCase() === ELO_FIXED[0]) { r = ELO_FIXED[1]; rd = 100; n = 1; }
    else {
      const p = await (await dirCall(this.env, 'get?name=' + encodeURIComponent(a.name))).json().catch(() => ({}));
      const m = /Elo (\d+)/.exec((p && p.s && p.s.chess) || '');
      if (m) { r = Math.min(4000, +m[1]); if (r !== CHESS.start) { rd = 100; n = 1; } }
    }
    const c = { r, rd, at: Date.now(), n, peak: r, lpn: 0 };
    await this.chessSave(a, c);
    return c;
  }
  async chessSave(a, c) {
    await this.ctx.storage.put('chess', c);
    await dirCall(this.env, 'stat1', { n: a.name, c: a.created, g: 'chess', v: 'Elo ' + Math.round(c.r) }).catch(() => null);
  }
  async chess(req, body, a, j, now) {
    const c = await this.chessOf(a);
    const me = x => ({ r: Math.round(x.r), rd: Math.round(chessRd(x, now)), n: x.n, peak: Math.round(x.peak || x.r) });
    if (req.method === 'GET') return j(me(c));
    const g = String(body.g || ''), opp = String(body.opp || ''), res = String(body.res || '');
    if (!/^[a-z0-9:]{3,40}$/i.test(g) || !NAME_RE.test(opp) || opp.toLowerCase() === a.name.toLowerCase() || !['w', 'l', 'd', 'quit', 'left'].includes(res)) return j({ error: 'bad' }, 400);
    const pair = [a.name.toLowerCase(), opp.toLowerCase()].sort().join(':');
    const r = await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('cg:' + g + ':' + pair)).fetch(new Request('https://acct/cg', { method: 'POST', headers: { 'content-type': 'application/json', 'x-arcade-cg': '1' }, body: JSON.stringify({ me: a.name, opp, res, n: body.n | 0 }) }));
    const x = await r.json().catch(() => ({}));
    const fresh = (await this.ctx.storage.get('chess')) || c; // the game's object may have just changed it
    return j(Object.assign({ pending: !!x.pending, d: x.d || 0, error: x.error }, me(fresh)), r.ok ? 200 : r.status);
  }
  // one rating change, told by a game's object (peer route 'p-chessapply'); o is the opponent's rating when the game was reported
  async chessApply(a, kind, o, now) {
    const c = await this.chessOf(a), before = c.r, ro = +o.r, rdo = +o.rd;
    if (kind === 'quit') { // leaving a game: a flat 100 (ELO_FIXED's account: 1000 the first two times, as in 1.5.2)
      let pen = 100; if (String(a.name).toLowerCase() === ELO_FIXED[0] && (c.lpn || 0) < 2) { pen = 1000; c.lpn = (c.lpn || 0) + 1; }
      c.r = Math.max(CHESS.floor, c.r - pen);
    } else {
      if (!isFinite(ro) || !isFinite(rdo) || !['win', 'loss', 'draw', 'left'].includes(kind)) return { error: 'bad' };
      const sc = kind === 'win' || kind === 'left' ? 1 : kind === 'draw' ? 0.5 : 0, g = glickoOne(c.r, chessRd(c, now), ro, Math.max(CHESS.rdMin, Math.min(CHESS.rd0, rdo)), sc);
      if (kind === 'left') c.r = Math.max(CHESS.floor, c.r + Math.max(0, g.r - c.r) / 2); // the other player walked out: half a win
      else { c.r = Math.max(CHESS.floor, g.r); c.rd = Math.max(CHESS.rdMin, g.rd); }
    }
    c.at = now; c.n = (c.n || 0) + 1; c.peak = Math.max(c.peak || 0, c.r);
    await this.chessSave(a, c);
    return { r: Math.round(c.r), d: Math.round(c.r) - Math.round(before) };
  }
  // the object of one game (one pair of players): collects both reports and applies each side once
  async chessGame(b, j, now) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const S = this.ctx.storage, me = String(b.me || '').toLowerCase(), opp = String(b.opp || '').toLowerCase();
      let st = await S.get('cg');
      if (!st || now - st.at > 6 * 3600e3) st = { at: now, rep: {}, done: {}, out: {}, snap: null };
      if (!st.rep[me]) st.rep[me] = { res: String(b.res), n: b.n | 0 };
      if (!st.snap) { // both ratings as the game ended: each side is worked out against the other's number from here
        const get = async n => { const x = await peerCall(this.env, n, 'p-chessget', { from: n }); return x.status === 200 && isFinite(x.r) ? { r: x.r, rd: x.rd } : null; };
        const [x, y] = await Promise.all([get(me), get(opp)]);
        if (!x || !y) return j({ error: 'no_account' }, 404);
        st.snap = { [me]: x, [opp]: y };
      }
      const kindFor = (k, o) => { // what to apply to k now, or '' to wait for the other report
        const r = st.rep[k] && st.rep[k].res, t = st.rep[o] && st.rep[o].res;
        if (r === 'l') return 'loss'; if (r === 'quit') return 'quit';
        if ((r === 'w' || r === 'left') && (t === 'l' || t === 'quit')) return t === 'quit' ? 'left' : 'win';
        if (r === 'd' && t === 'd') return 'draw';
        return '';
      };
      for (const [k, o] of [[me, opp], [opp, me]]) {
        if (st.done[k] || !st.rep[k]) continue;
        const kind = kindFor(k, o); if (!kind) continue;
        const x = await peerCall(this.env, k, 'p-chessapply', { from: o, kind, o: st.snap[o] });
        if (x.status === 200 && !x.error) { st.done[k] = 1; st.out[k] = { r: x.r, d: x.d }; }
      }
      await S.put('cg', st);
      return j({ pending: !st.done[me], d: (st.out[me] && st.out[me].d) || 0 });
    });
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
// 2026-11-11: the owner gave the name lars to a friend: the account that had it (made 2026-11-09) is asked to pick a new one
const RENAME_NAMES = ['lars'], RENAME_BEFORE = 1794280371000;
const mustRename = a => RENAME_NAMES.includes(String(a.name || '').toLowerCase()) && (a.created || 0) < RENAME_BEFORE;
// Chess Elo (1.6.1): Glicko like chess.com, the same numbers Chess 1.5.1 used in the browser
const CHESS = { start: 2000, rd0: 350, rdMin: 30, c: 18, floor: 0 };
const ELO_FIXED = [String.fromCharCode(101,112,115,116,101,105,110,104,97,116,101,110,108,103,103,97), 1000]; // the owner's request (2026-11-14): starts at 1000
const CGQ = Math.log(10) / 400, cgRD = rd => 1 / Math.sqrt(1 + 3 * CGQ * CGQ * rd * rd / (Math.PI * Math.PI));
const chessRd = (c, t) => { const days = c.at ? Math.max(0, (t - c.at) / 864e5) : 0; return Math.min(CHESS.rd0, Math.sqrt(c.rd * c.rd + CHESS.c * CHESS.c * days)); };
function glickoOne(r, rd, ro, rdo, s) {
  const g = cgRD(rdo), E = 1 / (1 + Math.pow(10, -g * (r - ro) / 400)), d2 = 1 / (CGQ * CGQ * g * g * E * (1 - E)), k = 1 / (1 / (rd * rd) + 1 / d2);
  return { r: r + CGQ * k * g * (s - E), rd: Math.sqrt(k) };
}
const MAX_FRIENDS = 300, MAX_CONVOS = 300, KEEP_DM = 300, DM_LEN = 500, CALL_MAX = 24000, TURN_TTL = 4 * 3600, GROUP_MAX = 15;
const pad = n => String(n).padStart(10, '0');
// stars out swear words and slurs (the same list as the chat page's tidy())
const BAD = /\b(f+u+c+k+\w*|f+u+k+\w*|s+h+i+t+\w*|b+i+t+c+h+\w*|c+u+n+t+\w*|d+i+c+k+s?\b|p+u+s+s+y+\w*|a+s+s+h+o+l+e+\w*|bastard\w*|slut\w*|whore\w*|nigg\w*|n+i+g+a+\w*|fag\w*|retard\w*|twat\w*|wank\w*|porn\w*|penis\w*|vagina\w*|rape\w*)/gi;
const tidy = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().replace(BAD, w => w[0] + '*'.repeat(w.length - 1));
// Social captions and group names are stored as written too (2026-11-11); each player can turn on a filter in their account
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
// links the owner banned from the Global chat (2026-11-13: another games site). Checked with spaces, dots and
// look-alike characters taken out, so 'playforge-3pb . pages . dev' or 'p l a y f o r g e' is caught too.
const CHAT_BANNED = ['playforge'];
const chatBanned = t => { const s = String(t || '').toLowerCase().normalize('NFKD').replace(/[0]/g, 'o').replace(/[1!|]/g, 'l').replace(/[^a-z]/g, ''); return CHAT_BANNED.some(w => s.includes(w)); };
// One room's chat. The newest CHAT_KEEP messages are one stored value ('log'), so waking up costs one read and
// each message one write. Everyone connected is the "In the chat" list.
export class Chat extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.log = null;
  }
  async getLog() { if (!this.log) this.log = ((await this.ctx.storage.get('log')) || []).filter(m => !chatBanned(m.t)); return this.log; }
  async delMsg(id) {
    const log = await this.getLog(), i = log.findIndex(m => m.id === id);
    if (i < 0) return false;
    log.splice(i, 1); await this.ctx.storage.put('log', log);
    this.all({ t: 'del', id });
    return true;
  }
  async fetch(req) {
    const url = new URL(req.url), now = Date.now();
    if (url.pathname === '/del') { // the owner's tools (admin() in the Worker)
      if (req.headers.get('x-arcade-int') !== '1') return new Response('{}', { status: 403 });
      const b = await req.json().catch(() => ({}));
      if (!(await this.delMsg(String(b.id || '')))) return new Response('{"error":"not_found"}', { status: 404 });
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
    if (!m) return;
    const a = ws.deserializeAttachment() || {}, now = Date.now();
    // 2026-11-13: a signed-in admin account (checked by its token when the socket opened) deletes a message for everyone
    if (m.t === 'del') { if (a.a && ADMIN_ACCOUNTS.includes(String(a.u).slice(2))) await this.delMsg(String(m.id || '').slice(0, 20)); return; }
    if (m.t !== 'say') return;
    a.sent = (a.sent || []).filter(x => now - x < 10000);
    const k = String(m.k || '').slice(0, 20);
    if (a.sent.length >= 5) { try { ws.send(JSON.stringify({ t: 'slow', k })); } catch (e) {} return; }
    const text = plain(m.text).slice(0, CHAT_LEN);
    if (!text) return;
    if (chatBanned(text)) { try { ws.send(JSON.stringify({ t: 'banned', k })); } catch (e) {} return; }
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
      // Chess 1.6.1: once, every player with a chess line moves their Elo to their account (which rewrites the line)
      if (g === 'chess' && !(await S.get('chessSeeded'))) {
        const ns = []; for (let i = 0; i < list.length; i += 128) { const m = await S.get(list.slice(i, i + 128).filter(x => x[2]).map(x => 'u:' + x[0].toLowerCase())); for (const [k, u] of m) if (u && u.s && u.s.chess) { const e = list.find(x => 'u:' + x[0].toLowerCase() === k); if (e) ns.push(e[0]); } }
        for (let i = 0; i < ns.length; i += 8) await Promise.all(ns.slice(i, i + 8).map(n => peerCall(this.env, n, 'p-chessget', { from: n }).catch(() => null)));
        await S.put('chessSeeded', 1); if (this.topCache) delete this.topCache.chess;
      }
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
    if (route === 'stat1') { // one game's line (Chess's Elo, set by the account itself), the rest kept
      const u = (await S.get('u:' + k)) || {}, sv = Object.assign({}, u.s || {}, { [String(b.g)]: String(b.v).slice(0, 60) });
      await S.put('u:' + k, { s: sv, at: Date.now() });
      if (i < 0) { list.push([n, +b.c || Date.now(), 1]); await this.saveNames(); } else if (!list[i][2]) { list[i][2] = 1; await this.saveNames(); }
      if (this.topCache) delete this.topCache[String(b.g)];
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
// Solo runs (1.3, with the AI co-driver) have their own board per stage, each driver's best: 'ls:<stage>' = [{ d, ms, at }]
//   GET  /ttt/sboard?s=<stage>   -> { list: [{ d, ms, at }] }      POST /ttt/solo {s, ms} (Bearer token) -> { rank, best }
const TTT_STAGE = /^[a-z0-9-]{2,24}$/, TTT_KEEP = 60, TTT_SHOW = 25, TTT_STAGES = 800;
async function turnBoard(req, env, url) {
  const origin = req.headers.get('Origin') || '';
  if (!ACCT_ORIGINS.includes(origin)) return new Response('only available on the official website', { status: 403 });
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const out = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...cors, 'content-type': 'application/json' } });
  const route = url.pathname.slice(5), tally = env.TALLY.get(env.TALLY.idFromName('ttt-board'));
  const call = body => tally.fetch(new Request('https://tally/ttt-' + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  if (route === 'sboard' && req.method === 'GET') {
    const s = url.searchParams.get('s') || '';
    if (!TTT_STAGE.test(s)) return out({ error: 'bad' }, 400);
    const r = await call({ s }); return new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
  }
  if (route === 'board' && req.method === 'GET') {
    const s = url.searchParams.get('s') || '';
    if (!TTT_STAGE.test(s)) return out({ error: 'bad' }, 400);
    const r = await call({ s }); return new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
  }
  if ((route === 'run' || route === 'solo') && req.method === 'POST') {
    if (+(req.headers.get('content-length') || 0) > 2048) return out({ error: 'bad' }, 400);
    let b; try { b = await req.json(); } catch (e) { return out({ error: 'bad' }, 400); }
    const auth = req.headers.get('authorization') || '', nm = auth.replace(/^Bearer\s+/i, '').split('.')[0] || '';
    if (!NAME_RE.test(nm)) return out({ error: 'auth' }, 401);
    const w = await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('u:' + nm.toLowerCase())).fetch(new Request('https://acct/whoami', { headers: { authorization: auth } }));
    const who = w.ok ? await w.json().catch(() => ({})) : {};
    if (!who.name) return out({ error: 'auth' }, 401);
    if (!TTT_STAGE.test(b.s || '') || !(b.ms >= 20000 && b.ms <= 3600000)) return out({ error: 'bad' }, 400);
    if (route === 'run' && (!NAME_RE.test(b.n || '') || b.n.toLowerCase() === who.name.toLowerCase())) return out({ error: 'bad' }, 400);
    const r = await call(route === 'run' ? { s: b.s, ms: Math.round(b.ms), d: who.name, n: b.n } : { s: b.s, ms: Math.round(b.ms), d: who.name });
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
    if (route === 'ttt-sboard') return j({ list: ((await S.get('ls:' + b.s)) || []).slice(0, TTT_SHOW) });
    if (route === 'ttt-solo') { // a solo run: one entry per driver, keeping their best
      let list = await S.get('ls:' + b.s);
      if (!list) { const ns = (await S.get('nss')) || 0; if (ns >= TTT_STAGES) return j({ error: 'full' }, 507); await S.put('nss', ns + 1); list = []; }
      const me = b.d.toLowerCase(), i = list.findIndex(e => e.d.toLowerCase() === me);
      if (i >= 0 && list[i].ms <= b.ms) return j({ rank: i + 1, best: list[i].ms });
      if (i >= 0) list.splice(i, 1);
      list.push({ d: b.d, ms: b.ms, at: Date.now() }); list.sort((x, y) => x.ms - y.ms); list.length = Math.min(list.length, TTT_KEEP);
      await S.put('ls:' + b.s, list);
      const k = list.findIndex(e => e.d.toLowerCase() === me);
      return j({ rank: k >= 0 ? k + 1 : 0, best: b.ms });
    }
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

/* ==========================================================================
   Social (2026-11-10): gameplay clips, like a small Instagram for the arcade. Players record a clip on the play page
   (play.html, the 🎬 Clip button) and publish it here; social.html shows the feeds, profiles and comments.
   One Durable Object class, two kinds of object:
     'index' (or 'index-test-<room>' for ?clipsroom= tests): every clip's details, likes, comments, views, follows.
       'm:<id>' = { id, by, k, g, t, at, dur, w, h, sz, ty, lk, ll, vw, wf, cm, sh, rp }   (k = 'clip' | 'video' | 'photo'; ll = the
       latest liker's name)   (wf = sum of the share of the clip
       each view watched, so wf / vw is how much of it people watch); 'p:<id>' = the poster (a small JPEG data URL);
       'l:<id>' = [lower names who liked]; 'c:<id>' = [{ i, n, t, at, re, lk: [lower names] }]; 'v:<id>' = [viewer
       keys] (one view per viewer: an account name or a device id); 'u:<lower>' = { n, f: [following], fr: [followers],
       lk: [liked ids], day, k (clips published that day) }; 'a:<lower>' = their profile picture (a data URL, at most AVATAR_MAX); 'q:<id>' = an upload waiting for its video.
       All the 'm:' rows are read once when the object wakes and kept in memory (they're small; posters aren't).
     'clip:<id>': one clip's video, in 1 MB pieces 'v:0'... ('vn' pieces, 'ty' type). Served with a year-long cache.
   Publishing is two steps: POST /clips/new (details + poster, checked against the account) gives an id and a one-time
   key; PUT /clips/v/<id>?k= sends the video, and the video's object asks the index to put the clip live ('commit').
   The free plan has 5 GB of storage in all, so when clips pass CLIP_STORE the weakest clip older than 3 days goes.
   Feeds:
     GET  /clips/feed?tab=foryou|new|top|following&me=&by=a,b&before=   (foryou: candidates for the browser to rank)
     GET  /clips/user?name=&me=   GET /clips/one?id=&me=   GET /clips/comments?id=&me=   GET /clips/v/<id> (the video)
     POST /clips/seen { v: viewer key, l: [[id, share watched 0-1]] }   POST /clips/share { id }
   With "Authorization: Bearer <token>" (an online account):
     POST /clips/new { kind, g, t, dur, w, h, sz, poster } -> { id, k }   PUT /clips/v/<id>?k= <video or picture bytes>
       (kind 'clip' = recorded from a game; 'video' and 'photo' = the player's own uploads, game optional)
     POST /clips/like { id, on }   /clips/comment { id, t, re }   /clips/cdel { id, i }   /clips/clike { id, i, on }
     POST /clips/follow { name, on }   /clips/del { id } (yours, or any post for CLIP_MODS)   /clips/report { id }   /clips/avatar { img: data URL or '' }
     GET  /clips/avatars?n=a,b,c  -> { av: { lower: data URL } }   (profile pictures, up to 60 names at once)
   The owner deletes any clip with /acct/admin op 'clipdel', and a profile picture with op 'avatardel' {name}. Every route takes ?r=<room> for test rooms.
   ========================================================================== */
const CLIP_MAX = 12 * 1024 * 1024, CLIP_PIECE = 1024 * 1024, CLIP_STORE = 3.5e9, CLIP_DAY = 25, CLIP_PER_USER = 100;
const CLIP_ID = /^[a-z0-9]{10}$/, CLIP_TITLE = 80, CLIP_COMMENT = 300, CLIP_COMMENTS = 500, CLIP_VIEWERS = 5000;
const CLIP_POSTER = 60000, AVATAR_MAX = 40000, CLIP_REPORTS = 3, VIEWER_RE = /^[A-Za-z0-9_:.-]{3,40}$/;
// Social moderators: these accounts can delete anyone's post or comment (the owner's choice, 2026-11-11). Lower case.
const CLIP_MODS = ['claude'];
const clipIndex = (env, room) => env.CLIPS.get(env.CLIPS.idFromName(room ? 'index-test-' + room : 'index'));
const clipMedia = (env, id) => env.CLIPS.get(env.CLIPS.idFromName('clip:' + id));
async function whoami(env, auth) {
  const nm = auth.replace(/^Bearer\s+/i, '').split('.')[0] || '';
  if (!NAME_RE.test(nm)) return '';
  const w = await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('u:' + nm.toLowerCase())).fetch(new Request('https://acct/whoami', { headers: { authorization: auth } }));
  return w.ok ? ((await w.json().catch(() => ({}))).name || '') : '';
}
// The site's own announcer: POST /clips/bot { key, replace, pin, g, t, img, poster, w, h } (pin = always first on the profile; links in its captions are clickable) with header x-bot-key = the BOT_KEY secret.
// Called by the repo's GitHub Action when NEWS gets a new entry; posts a photo as BOT_NAME. `key` makes it post once.
const BOT_NAME = 'Claude', BOT_CAP = 700;
async function clipsBot(req, env) {
  const out = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
  if (!env.BOT_KEY || !same(req.headers.get('x-bot-key') || '', env.BOT_KEY)) return out({ error: 'auth' }, 401);
  let b; try { b = await req.json(); } catch (e) { return out({ error: 'bad' }, 400); }
  const room = String(b.r || '').replace(/[^a-z0-9-]/gi, '').slice(0, 24).toLowerCase();
  // 2026-11-11: Claude's profile description, and one comment per post on other players' posts
  if (b.op === 'bio' || b.op === 'comment') { const r = await clipIndex(env, room).fetch(new Request('https://clips/bot' + b.op, { method: 'POST', body: JSON.stringify({ me: BOT_NAME, t: b.t, id: b.id, int: 1 }) })); return out(await r.json(), r.status); }
  const img = Uint8Array.from(atob(String(b.img || '')), c => c.charCodeAt(0));
  if (!img.length || img.length > CLIP_MAX) return out({ error: 'bad' }, 400);
  const r = await clipIndex(env, room).fetch(new Request('https://clips/botnew', { method: 'POST', body: JSON.stringify({ me: BOT_NAME, key: b.key, replace: b.replace, pin: b.pin, g: b.g, t: b.t, w: b.w, h: b.h, sz: img.length, poster: b.poster, int: 1 }) }));
  const q = await r.json();
  if (!q.k) return out(q, r.status);
  const put = await clipMedia(env, q.id).fetch(new Request('https://clips/media-put?' + new URLSearchParams({ id: q.id, k: q.k, r: room }), { method: 'PUT', body: img }));
  return out(await put.json(), put.status);
}
async function clips(req, env, url) {
  if (url.pathname === '/clips/bot' && req.method === 'POST') return clipsBot(req, env);
  const origin = req.headers.get('Origin') || '';
  if (!ACCT_ORIGINS.includes(origin)) return new Response('only available on the official website', { status: 403 });
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const out = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...cors, 'content-type': 'application/json' } });
  const pass = r => new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': r.headers.get('cache-control') || 'no-store' } });
  const room = (url.searchParams.get('r') || '').replace(/[^a-z0-9-]/gi, '').slice(0, 24).toLowerCase();
  const route = url.pathname.slice(7);
  if (route.startsWith('v/')) { // a clip's video
    const id = route.slice(2);
    if (!CLIP_ID.test(id)) return out({ error: 'bad' }, 400);
    if (req.method === 'GET') return pass(await clipMedia(env, id).fetch(new Request('https://clips/media-get')));
    if (req.method !== 'PUT') return out({ error: 'bad' }, 400);
    if (+(req.headers.get('content-length') || 0) > CLIP_MAX) return out({ error: 'too_big' }, 413);
    const q = new URLSearchParams({ id, k: url.searchParams.get('k') || '', r: room });
    return pass(await clipMedia(env, id).fetch(new Request('https://clips/media-put?' + q, { method: 'PUT', headers: { 'content-type': req.headers.get('content-type') || '' }, body: req.body })));
  }
  const idx = clipIndex(env, room);
  if (req.method === 'GET') {
    if (!['feed', 'user', 'one', 'comments', 'avatars'].includes(route)) return out({ error: 'not_found' }, 404);
    return pass(await idx.fetch(new Request('https://clips/' + route + url.search)));
  }
  if (req.method !== 'POST' || +(req.headers.get('content-length') || 0) > 100000) return out({ error: 'bad' }, 400);
  let b; try { b = await req.json(); } catch (e) { return out({ error: 'bad' }, 400); }
  if (!b || typeof b !== 'object') return out({ error: 'bad' }, 400);
  if (route === 'seen' || route === 'share') return pass(await idx.fetch(new Request('https://clips/' + route, { method: 'POST', body: JSON.stringify(b) })));
  if (!['new', 'like', 'comment', 'cdel', 'clike', 'follow', 'del', 'report', 'avatar'].includes(route)) return out({ error: 'not_found' }, 404);
  const who = await whoami(env, req.headers.get('authorization') || '');
  if (!who) return out({ error: 'auth' }, 401);
  b.me = who;
  return pass(await idx.fetch(new Request('https://clips/' + route, { method: 'POST', body: JSON.stringify(b) })));
}

export class Clips extends DurableObject {
  async fetch(req) {
    const url = new URL(req.url), route = url.pathname.slice(1);
    const j = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
    if (route.startsWith('media-')) return this.media(route, req, url, j);
    await this.load();
    if (req.method === 'GET') return this.read(route, url.searchParams, j);
    const b = await req.json().catch(() => ({}));
    return this.write(route, b, j);
  }

  /* ---------- one clip's video ---------- */
  async media(route, req, url, j) {
    const S = this.ctx.storage;
    if (route === 'media-get') {
      const n = await S.get('vn');
      if (!n) return j({ error: 'not_found' }, 404);
      const parts = await S.get([...Array(n).keys()].map(i => 'v:' + i)), ty = (await S.get('ty')) || 'video/webm';
      const bufs = []; let len = 0;
      for (let i = 0; i < n; i++) { const p = parts.get('v:' + i); if (!p) return j({ error: 'not_found' }, 404); bufs.push(p); len += p.byteLength; }
      const all = new Uint8Array(len); let o = 0; for (const p of bufs) { all.set(new Uint8Array(p), o); o += p.byteLength; }
      return new Response(all, { headers: { 'content-type': ty, 'cache-control': 'public, max-age=31536000, immutable' } });
    }
    if (route === 'media-del') { await S.deleteAll(); return j({ ok: 1 }); }
    if (route === 'media-put') {
      if (await S.get('vn')) return j({ error: 'taken' }, 409);
      const p = url.searchParams, buf = await req.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > CLIP_MAX) return j({ error: 'too_big' }, 413);
      const u = new Uint8Array(buf, 0, Math.min(12, buf.byteLength));
      const webm = u[0] === 0x1a && u[1] === 0x45 && u[2] === 0xdf && u[3] === 0xa3;
      const mp4 = u[4] === 0x66 && u[5] === 0x74 && u[6] === 0x79 && u[7] === 0x70; // 'ftyp' (MP4 and MOV)
      const jpg = u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff, png = u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47;
      const gif = u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46, webp = u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 && u[8] === 0x57 && u[9] === 0x45;
      const ty = webm ? 'video/webm' : mp4 ? 'video/mp4' : jpg ? 'image/jpeg' : png ? 'image/png' : gif ? 'image/gif' : webp ? 'image/webp' : '';
      if (!ty) return j({ error: 'not_video' }, 415);
      const head = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, Math.min(4096, buf.byteLength))), own = ty === 'video/webm' && head.includes('The Arcade') ? 1 : 0;
      const n = Math.ceil(buf.byteLength / CLIP_PIECE), put = { vn: n, ty };
      for (let i = 0; i < n; i++) put['v:' + i] = buf.slice(i * CLIP_PIECE, (i + 1) * CLIP_PIECE);
      // pieces go in a few at a time (each put is one transaction, kept well under its size limit)
      const keys = Object.keys(put);
      for (let i = 0; i < keys.length; i += 4) { const part = {}; for (const k of keys.slice(i, i + 4)) part[k] = put[k]; await S.put(part); }
      const r = await this.env.CLIPS.get(this.env.CLIPS.idFromName(p.get('r') ? 'index-test-' + p.get('r') : 'index')).fetch(new Request('https://clips/commit', { method: 'POST', body: JSON.stringify({ id: p.get('id'), k: p.get('k'), sz: buf.byteLength, ty: put.ty, own, int: 1 }) }));
      if (r.status !== 200) { await S.deleteAll(); return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json' } }); }
      return j(await r.json());
    }
    return j({ error: 'not_found' }, 404);
  }

  /* ---------- the index ---------- */
  async load() {
    if (this.m) return;
    const m = await this.ctx.storage.list({ prefix: 'm:' });
    this.m = new Map(); this.users = new Map(); this.dirty = new Set();
    for (const v of m.values()) this.m.set(v.id, v);
  }
  async user(name) {
    const k = String(name || '').toLowerCase();
    if (!k) return null;
    if (this.users.has(k)) return this.users.get(k);
    const u = (await this.ctx.storage.get('u:' + k)) || { n: name, f: [], fr: [], lk: [] };
    this.users.set(k, u);
    return u;
  }
  saveUser(u) { return this.ctx.storage.put('u:' + u.n.toLowerCase(), u); }
  hot(m, now) {
    const age = (now - m.at) / 36e5, watched = m.vw ? m.wf / m.vw : 0.5;
    return (1 + m.lk * 4 + m.cm * 6 + (m.sh || 0) * 5 + m.vw * watched) / Math.pow(age + 2, 1.4);
  }
  // what the browser gets for each clip: the details, the poster, whether "me" liked it
  async show(list, me) {
    const S = this.ctx.storage, posters = new Map();
    for (let i = 0; i < list.length; i += 128) for (const [k, v] of await S.get(list.slice(i, i + 128).map(m => 'p:' + m.id))) posters.set(k, v);
    const u = me ? await this.user(me) : null, liked = new Set(u ? u.lk : []), now = Date.now();
    return list.map(m => ({ id: m.id, by: m.by, k: m.k || 'clip', ll: m.ll || '', g: m.g, t: m.t, at: m.at, dur: m.dur, w: m.w, h: m.h, lk: m.lk, vw: m.vw, cm: m.cm, sh: m.sh || 0,
      wr: m.vw ? Math.round(m.wf / m.vw * 100) / 100 : 0, bot: m.bot ? 1 : 0, pin: m.pin ? 1 : 0, pend: m.pend ? 1 : 0, ty: m.ty || '', rp: (m.rp || []).length, hot: Math.round(this.hot(m, now) * 1e4) / 1e4, p: posters.get('p:' + m.id) || '', me: liked.has(m.id) ? 1 : 0 }));
  }
  live() { return [...this.m.values()].filter(m => !m.pend && (m.rp || []).length < CLIP_REPORTS); }
  async read(route, q, j) {
    const me = String(q.get('me') || ''), now = Date.now();
    if (route === 'feed') {
      const tab = q.get('tab') || 'foryou', before = +q.get('before') || Infinity, all = this.live();
      const newest = all.slice().sort((a, b) => b.at - a.at);
      let list;
      if (tab === 'new') list = newest.filter(m => m.at < before).slice(0, 30);
      else if (tab === 'top') list = all.filter(m => now - m.at < 7 * 864e5).sort((a, b) => (b.lk * 4 + b.cm * 6 + b.vw) - (a.lk * 4 + a.cm * 6 + a.vw)).slice(0, 40);
      else if (tab === 'following') {
        const u = me ? await this.user(me) : null, by = new Set([...(u ? u.f : []), ...String(q.get('by') || '').toLowerCase().split(',').filter(Boolean).slice(0, 300)]);
        list = newest.filter(m => by.has(m.by.toLowerCase()) && m.at < before).slice(0, 30);
      } else { // For you: the hottest 120 and the newest 40 (so new clips get seen); the browser ranks them for this player
        const ids = new Set(), pick = [];
        for (const m of all.slice().sort((a, b) => this.hot(b, now) - this.hot(a, now)).slice(0, 120).concat(newest.slice(0, 40))) if (!ids.has(m.id)) { ids.add(m.id); pick.push(m); }
        list = pick;
      }
      const u = me ? await this.user(me) : null;
      return j({ clips: await this.show(list, me), following: u ? u.f : [] });
    }
    if (route === 'user') {
      const name = String(q.get('name') || ''), k = name.toLowerCase();
      if (!NAME_RE.test(name)) return j({ error: 'bad' }, 400);
      const theirs = [...this.m.values()].filter(m => !m.pend && m.by.toLowerCase() === k).sort((a, b) => (b.pin || 0) - (a.pin || 0) || b.at - a.at); // pinned first
      const u = await this.user(name), mine = me ? await this.user(me) : null;
      return j({ n: theirs.length ? theirs[0].by : u.n, clips: await this.show(theirs, me), followers: u.fr.length, following: u.f.length,
        views: theirs.reduce((s, m) => s + m.vw, 0), likes: theirs.reduce((s, m) => s + m.lk, 0), iFollow: mine && mine.f.includes(k) ? 1 : 0, followsMe: mine && u.f.includes(me.toLowerCase()) ? 1 : 0,
        fl: u.fr.slice(-500).reverse(), fg: u.f.slice(-500).reverse(), bio: u.bio || '' }); // follower and following names (lower case), newest first
    }
    if (route === 'one') {
      const m = this.m.get(q.get('id') || '');
      if (!m || m.pend) return j({ error: 'not_found' }, 404);
      return j({ clip: (await this.show([m], me))[0] });
    }
    if (route === 'avatars') { // profile pictures: ?n=name,name,... (up to 60) -> { av: { lower: data URL } } (no entry = none)
      const ks = String(q.get('n') || '').toLowerCase().split(',').filter(k => NAME_RE.test(k)).slice(0, 60), av = {};
      if (ks.length) for (const [k, v] of await this.ctx.storage.get(ks.map(k => 'a:' + k))) if (v) av[k.slice(2)] = v;
      return j({ av });
    }
    if (route === 'comments') {
      const id = q.get('id') || '', mk = me.toLowerCase();
      if (!this.m.has(id) || this.m.get(id).pend) return j({ error: 'not_found' }, 404);
      const list = (await this.ctx.storage.get('c:' + id)) || [];
      return j({ list: list.map(c => ({ i: c.i, n: c.n, t: c.t, at: c.at, re: c.re || '', lk: (c.lk || []).length, me: mk && (c.lk || []).includes(mk) ? 1 : 0 })) });
    }
    return j({ error: 'not_found' }, 404);
  }
  async write(route, b, j) {
    const S = this.ctx.storage, now = Date.now(), me = String(b.me || ''), mk = me.toLowerCase();
    if (route === 'commit') { // from the video's object: the video is in, so the clip goes live
      if (!b.int) return j({ error: 'bad' }, 400);
      const q = await S.get('q:' + b.id);
      if (!q || !same(String(b.k || ''), q.k) || now - q.at > 30 * 60000) return j({ error: 'expired' }, 410);
      if ((q.m.k === 'photo') !== String(b.ty || '').startsWith('image/')) return j({ error: 'not_video' }, 415); // a photo post takes a picture, the others a video
      const m = Object.assign(q.m, { sz: +b.sz || 0, ty: b.ty, at: now });
      // 2026-11-11: game clips made by the site's recorder and Claude's posts go live; uploaded photos and videos wait
      // for an admin account to approve them ('pend', hidden everywhere until then)
      if (!m.bot && !(m.k === 'clip' && b.own)) m.pend = 1;
      this.m.set(m.id, m);
      await S.put({ ['m:' + m.id]: m, ['p:' + m.id]: q.p });
      await S.delete('q:' + b.id);
      await this.prune(now);
      return j({ ok: 1, id: m.id, pend: m.pend ? 1 : 0 });
    }
    if ((route === 'purge' || route === 'rename') && b.int) { // from Account: the account was deleted (its clips go) or renamed
      const from = String(b.from || '').toLowerCase(), to = String(b.to || '');
      for (const m of [...this.m.values()].filter(x => x.by.toLowerCase() === from)) {
        if (route === 'purge') await this.drop(m.id); else { m.by = to; await S.put('m:' + m.id, m); }
      }
      const pic = await S.get('a:' + from);
      if (pic) { await S.delete('a:' + from); if (route === 'rename') await S.put('a:' + to.toLowerCase(), pic); }
      const u = await S.get('u:' + from);
      if (u) {
        await S.delete('u:' + from); this.users.delete(from);
        // the people they followed and who followed them
        for (const k of new Set([...(u.f || []), ...(u.fr || [])])) {
          const o = await this.user(k); if (!o || !o.n) continue;
          o.f = o.f.filter(x => x !== from); o.fr = o.fr.filter(x => x !== from);
          if (route === 'rename') { if ((u.fr || []).includes(k)) o.f.push(to.toLowerCase()); if ((u.f || []).includes(k)) o.fr.push(to.toLowerCase()); }
          await this.saveUser(o);
        }
        if (route === 'rename') { u.n = to; this.users.set(to.toLowerCase(), u); await S.put('u:' + to.toLowerCase(), u); }
      }
      return j({ ok: 1 });
    }
    if (route === 'review' && b.int) {
      if (b.op === 'pending') return j({ list: await this.show([...this.m.values()].filter(m => m.pend).sort((a, c) => a.at - c.at).slice(0, 200), '') });
      const m = this.m.get(String(b.id || ''));
      if (!m || !m.pend) return j({ error: 'not_found' }, 404);
      if (b.op === 'approve') { delete m.pend; m.at = now; await S.put('m:' + m.id, m); return j({ ok: 1, approved: m.id }); }
      if (b.op === 'deny') { await this.drop(m.id); return j({ ok: 1, denied: m.id }); }
      return j({ error: 'bad' }, 400);
    }
    if (route === 'seen') { // views: one per viewer per clip; also how much of the clip they watched
      const v = String(b.v || '');
      if (!VIEWER_RE.test(v) || !Array.isArray(b.l)) return j({ error: 'bad' }, 400);
      const ids = b.l.slice(0, 50).filter(x => Array.isArray(x) && this.m.has(x[0]));
      if (!ids.length) return j({ ok: 1 });
      const lists = await S.get(ids.map(x => 'v:' + x[0])), put = {};
      for (const [id, f] of ids) {
        const seen = lists.get('v:' + id) || [], m = this.m.get(id);
        if (seen.includes(v)) continue;
        if (seen.length < CLIP_VIEWERS) seen.push(v);
        m.vw++; m.wf = Math.round(((m.wf || 0) + Math.max(0, Math.min(1, +f || 0))) * 100) / 100;
        put['v:' + id] = seen; put['m:' + id] = m;
      }
      if (Object.keys(put).length) await S.put(put);
      return j({ ok: 1 });
    }
    if (route === 'share') {
      const m = this.m.get(String(b.id || ''));
      if (m) { m.sh = (m.sh || 0) + 1; await S.put('m:' + m.id, m); }
      return j({ ok: 1, sh: m ? m.sh : 0 });
    }
    if (!NAME_RE.test(me)) return j({ error: 'auth' }, 401);
    if (route === 'botbio' && b.int) { const u = await this.user(me); u.bio = String(b.t || '').replace(/\r/g, '').trim().slice(0, 300); await this.saveUser(u); return j({ ok: 1 }); }
    if (route === 'botcomment' && b.int) { // at most one Claude comment per post, never on Claude's own posts
      const id = String(b.id || ''), m = this.m.get(id), t = plain(b.t).slice(0, CLIP_COMMENT);
      if (!m || m.pend || !t) return j({ error: 'not_found' }, 404);
      if (m.by.toLowerCase() === mk || await S.get('bc:' + id)) return j({ dup: 1 });
      const list = (await S.get('c:' + id)) || [];
      list.push({ i: rnd(4), n: me, t, at: now, lk: [] }); if (list.length > CLIP_COMMENTS) list.shift();
      m.cm = list.length;
      await S.put({ ['c:' + id]: list, ['m:' + id]: m, ['bc:' + id]: now });
      return j({ ok: 1, cm: m.cm });
    }
    if (route === 'botnew' && b.int) { // only from clipsBot (the route isn't reachable from a browser)
      const bk = 'bk:' + String(b.key || '').slice(0, 120);
      if (bk === 'bk:') return j({ error: 'bad' }, 400);
      if (await S.get(bk)) return j({ dup: 1 });
      // a repost takes the earlier post(s) down: 'bk:' holds the post id (older ones hold the time it was asked for)
      for (const old of (Array.isArray(b.replace) ? b.replace : []).slice(0, 5)) {
        const was = await S.get('bk:' + String(old).slice(0, 120));
        if (typeof was === 'string') { if (this.m.has(was) && this.m.get(was).bot) await this.drop(was); }
        else if (was) for (const m of [...this.m.values()].filter(m => m.bot && m.g === (b.g || '') && Math.abs(m.at - was) < 5 * 60000)) await this.drop(m.id);
      }
      const p = String(b.poster || '');
      if ((b.g && !GAME_RE.test(b.g)) || !/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(p) || p.length > CLIP_POSTER) return j({ error: 'bad' }, 400);
      const mine = [...this.m.values()].filter(m => m.by.toLowerCase() === mk).sort((a, c) => a.at - c.at);
      while (mine.length >= CLIP_PER_USER) await this.drop(mine.shift().id);
      let id; do { id = rnd(5); } while (this.m.has(id));
      const m = { id, by: me, k: 'photo', g: b.g || '', t: String(b.t || '').replace(/\r/g, '').replace(/[^\S\n]+/g, ' ').trim().slice(0, BOT_CAP), at: now, dur: 0, w: Math.min(4096, b.w | 0), h: Math.min(4096, b.h | 0), sz: 0, ty: '', lk: 0, vw: 0, wf: 0, cm: 0, sh: 0, rp: [], bot: 1, pin: b.pin ? 1 : 0 };
      const k = rnd(16);
      await S.put({ ['q:' + id]: { k, m, p, at: now }, [bk]: id });
      return j({ id, k });
    }
    if (route === 'new') {
      const u = await this.user(me), day = new Date(now).toISOString().slice(0, 10);
      if (u.day !== day) { u.day = day; u.k = 0; }
      if (u.k >= CLIP_DAY) return j({ error: 'slow' }, 429);
      if ([...this.m.values()].filter(m => m.by.toLowerCase() === mk).length >= CLIP_PER_USER) return j({ error: 'too_many' }, 400);
      const p = String(b.poster || '');
      // kinds: 'clip' (recorded on play.html, always from a game), 'video' and 'photo' (the player's own uploads; a game is optional)
      const kind = ['clip', 'video', 'photo'].includes(b.kind) ? b.kind : 'clip';
      if (b.g ? !GAME_RE.test(b.g) : kind === 'clip') return j({ error: 'bad' }, 400);
      if (!(kind === 'photo' ? true : b.dur > 0.5 && b.dur <= (kind === 'clip' ? 75 : 185)) || !(b.sz > 0 && b.sz <= CLIP_MAX)) return j({ error: 'bad' }, 400);
      if (!/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(p) || p.length > CLIP_POSTER) return j({ error: 'bad' }, 400);
      let id; do { id = rnd(5); } while (this.m.has(id));
      const m = { id, by: me, k: kind, g: b.g || '', t: plain(b.t).slice(0, CLIP_TITLE), at: now, dur: kind === 'photo' ? 0 : Math.round(b.dur * 10) / 10, w: Math.min(4096, b.w | 0), h: Math.min(4096, b.h | 0), sz: 0, ty: '', lk: 0, vw: 0, wf: 0, cm: 0, sh: 0, rp: [] };
      const k = rnd(16);
      u.k++; await this.saveUser(u);
      await S.put('q:' + id, { k, m, p, at: now });
      // forget uploads that never sent their video
      const old = [...(await S.list({ prefix: 'q:' })).entries()].filter(([, x]) => now - x.at > 60 * 60000).map(([key]) => key);
      if (old.length) await S.delete(old);
      return j({ id, k });
    }
    if (route === 'avatar') { // your profile picture: a small square JPEG/WebP/PNG data URL, or '' to remove it
      const img = String(b.img || '');
      if (!img) { await S.delete('a:' + mk); return j({ ok: 1 }); }
      if (!/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(img) || img.length > AVATAR_MAX) return j({ error: 'bad' }, 400);
      await S.put('a:' + mk, img);
      return j({ ok: 1 });
    }
    if (route === 'adminav') { await S.delete('a:' + String(b.name || '').toLowerCase()); return j({ ok: 1 }); } // only from admin()
    if (route === 'follow') {
      const other = String(b.name || ''), ok = other.toLowerCase();
      if (!NAME_RE.test(other) || ok === mk) return j({ error: 'bad' }, 400);
      const u = await this.user(me), them = await this.user(other);
      u.f = u.f.filter(x => x !== ok); them.fr = them.fr.filter(x => x !== mk);
      if (b.on) { if (u.f.length >= 2000) return j({ error: 'too_many' }, 400); u.f.push(ok); them.fr.push(mk); }
      await S.put({ ['u:' + mk]: u, ['u:' + ok]: them });
      return j({ on: b.on ? 1 : 0, followers: them.fr.length });
    }
    const id = String(b.id || ''), m = this.m.get(id);
    if (!m || (m.pend && route !== 'del' && route !== 'admindel')) return j({ error: 'not_found' }, 404);
    if (route === 'like') {
      const u = await this.user(me), likes = (await S.get('l:' + id)) || [], had = likes.includes(mk);
      if (!!b.on !== had) {
        if (b.on) { likes.push(mk); u.lk.push(id); if (u.lk.length > 3000) u.lk.splice(0, u.lk.length - 3000); m.ll = me; } // "Liked by <ll> and others"
        else { likes.splice(likes.indexOf(mk), 1); u.lk = u.lk.filter(x => x !== id); }
        m.lk = likes.length;
        await S.put({ ['l:' + id]: likes, ['u:' + mk]: u, ['m:' + id]: m });
      }
      return j({ on: b.on ? 1 : 0, lk: m.lk });
    }
    if (route === 'comment') { // comments aren't word-filtered, like the chats (the owner's choice); shown as plain text
      const t = plain(b.t).slice(0, CLIP_COMMENT);
      if (!t) return j({ error: 'bad' }, 400);
      const list = (await S.get('c:' + id)) || [];
      if (list.filter(c => c.n.toLowerCase() === mk && now - c.at < 60000).length >= 5) return j({ error: 'slow' }, 429);
      const c = { i: rnd(4), n: me, t, at: now, lk: [] };
      if (b.re && NAME_RE.test(String(b.re))) c.re = String(b.re);
      list.push(c); if (list.length > CLIP_COMMENTS) list.shift();
      m.cm = list.length;
      await S.put({ ['c:' + id]: list, ['m:' + id]: m });
      return j({ c: { i: c.i, n: c.n, t: c.t, at: c.at, re: c.re || '', lk: 0, me: 0 }, cm: m.cm });
    }
    if (route === 'cdel' || route === 'clike') {
      const list = (await S.get('c:' + id)) || [], c = list.find(x => x.i === b.i);
      if (!c) return j({ error: 'not_found' }, 404);
      if (route === 'cdel') { // your own comment, or any comment on your clip
        if (c.n.toLowerCase() !== mk && m.by.toLowerCase() !== mk && !CLIP_MODS.includes(mk)) return j({ error: 'not_yours' }, 403);
        list.splice(list.indexOf(c), 1); m.cm = list.length;
        await S.put({ ['c:' + id]: list, ['m:' + id]: m });
        return j({ ok: 1, cm: m.cm });
      }
      c.lk = (c.lk || []).filter(x => x !== mk); if (b.on) c.lk.push(mk);
      await S.put('c:' + id, list);
      return j({ on: b.on ? 1 : 0, lk: c.lk.length });
    }
    if (route === 'report') {
      m.rp = m.rp || [];
      if (!m.rp.includes(mk) && m.by.toLowerCase() !== mk) { m.rp.push(mk); await S.put('m:' + id, m); }
      return j({ ok: 1 });
    }
    if (route === 'del') {
      if (m.by.toLowerCase() !== mk && !CLIP_MODS.includes(mk)) return j({ error: 'not_yours' }, 403); // your own post, or a moderator
      await this.drop(id); return j({ ok: 1 });
    }
    if (route === 'admindel') { await this.drop(id); return j({ ok: 1 }); } // only from admin() (it checks the owner's password)
    return j({ error: 'not_found' }, 404);
  }
  async drop(id) {
    const S = this.ctx.storage, m = this.m.get(id);
    if (!m) return;
    this.m.delete(id);
    const likes = (await S.get('l:' + id)) || [];
    for (const k of likes.slice(0, 500)) { const u = await this.user(k); if (u) { u.lk = u.lk.filter(x => x !== id); await this.saveUser(u); } }
    await S.delete(['m:' + id, 'p:' + id, 'l:' + id, 'c:' + id, 'v:' + id]);
    await this.env.CLIPS.get(this.env.CLIPS.idFromName('clip:' + id)).fetch(new Request('https://clips/media-del', { method: 'POST' })).catch(() => null);
  }
  // keep the clips under CLIP_STORE: the weakest clip older than 3 days goes first
  async prune(now) {
    let total = 0; for (const m of this.m.values()) total += m.sz || 0;
    while (total > CLIP_STORE) {
      const old = [...this.m.values()].filter(m => !m.bot && now - m.at > 3 * 864e5).sort((a, b) => this.hot(a, now) - this.hot(b, now))[0];
      if (!old) break;
      total -= old.sz || 0; await this.drop(old.id);
    }
  }
}
