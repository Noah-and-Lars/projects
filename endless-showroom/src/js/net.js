// Online play over the arcade's realtime server (rt.js, the same Cloudflare
// Worker every arcade game uses): broadcast messages and presence per room.
//
// There's no game server, so one screen is the host: whoever has been in the
// room longest. The host runs the clock, the staff and every change to the
// store's furniture; everyone else sends requests and draws what the host
// says. Every screen keeps the full list of changes, so when the host leaves
// the next-oldest player carries on from where things were.
//
// Messages:  p  a player's own state (10 a second)
//            q  a request to the host (take / place / break)
//            w  furniture and food changes, from the host
//            s  staff positions, from the host (8 a second)
//            g  the clock and today's event, from the host
//            h  a member of staff hit someone, from the host
//            c  chat;  x  someone was caught
//            pu a shove, to the host;  wh  someone whistled
//            nz someone made a noise with a toy (the host lets the staff hear it)
//            of a newcomer to a public store offers its saved copy of this week's store, to the host
//            rs the host opens this week's fresh public store (Sunday)
//            need / full  a newcomer asks for, and gets, the store's changes
const RT_LIB = 'https://noah-and-lars.github.io/projects/rt.js?v=2';
const MAX = 8;
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TEST = (new URLSearchParams(location.search).get('esroom') || '').replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase();
const BASE = TEST ? 'es1-test-' + TEST : 'es1';

export const cleanName = (n) => String(n || '').replace(/[^A-Za-z0-9_ .'-]/g, '').trim().slice(0, 16);
export const cleanChat = (m) => String(m || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120);

export function myName() {
  try {
    const a = JSON.parse(localStorage.getItem('arcade-acct') || 'null');
    if (a && a.name) return cleanName(a.name);
    const l = JSON.parse(localStorage.getItem('arcade-local') || 'null');
    if (l && l.name) return cleanName(l.name);
    const s = localStorage.getItem('es-name');
    if (s) return cleanName(s);
  } catch (_) {}
  return 'Shopper';
}

// Public stores are this week's store: the same store for everyone from the
// start of Sunday to the end of Saturday (Sydney time), then a fresh one.
// storeWeek() is the day number of the Sunday the week started on.
export function storeWeek(now = Date.now()) {
  let y, m, d, wd;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(new Date(now));
    const g = (t) => parts.find((p) => p.type === t).value;
    y = +g('year'); m = +g('month'); d = +g('day'); wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday'));
    if (!(y > 0) || wd < 0) throw new Error('no time zone');
  } catch (_) { const t = new Date(now + 10 * 3600e3); y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate(); wd = t.getUTCDay(); }
  return Math.round(Date.UTC(y, m - 1, d) / 864e5) - wd;
}
// The store a public room has this week (the same on every screen).
export function publicSeed(room, week = storeWeek()) {
  let h = 2166136261;
  for (const ch of room + ':' + week) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function myShirt() { try { const v = parseInt(localStorage.getItem('es-shirt'), 10); return v >= 0 && v < 10 ? v : -1; } catch (_) { return -1; } }

export function createNet(h) {
  const myId = (Math.random().toString(36) + '00000000').slice(2, 10);
  let client = null, libLoad = null, ch = null, me = null, members = [], hostId = null;
  const api = { id: myId, on: false, room: null, isPublic: false, seed: 0, week: 0, members: () => members };

  function getClient() {
    if (client) return Promise.resolve(client);
    try { const A = window.parent !== window && window.parent.ArcadeOnline, c = A && A.client && A.client(); if (c) return Promise.resolve(client = c); } catch (_) {}
    if (!libLoad) libLoad = new Promise((res, rej) => {
      if (window.supabase && window.supabase.createClient) return res();
      const s = document.createElement('script'); s.src = RT_LIB; s.async = true; s.onload = res; s.onerror = () => { libLoad = null; rej(new Error('offline')); };
      document.head.appendChild(s);
    });
    return libLoad.then(() => client || (client = window.supabase.createClient()));
  }
  const listMembers = () => {
    const st = ch ? ch.presenceState() : {}, out = [];
    for (const k in st) { const m = st[k] && st[k][0]; if (m && typeof m.id === 'string') out.push(m); }
    return out.sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : 1));
  };
  api.host = () => members[0] || null;
  api.isHost = () => !api.on || (!!members[0] && members[0].id === myId);
  api.send = (event, payload) => {
    if (!ch || ch.state !== 'joined') return;
    try { const p = ch.send({ type: 'broadcast', event, payload: Object.assign({ f: myId }, payload) }); if (p && p.catch) p.catch(() => {}); } catch (_) {}
  };
  function track() {
    if (!ch || ch.state !== 'joined') return;
    try { const p = ch.track(me); if (p && p.catch) p.catch(() => {}); } catch (_) {}
  }
  api.set = (patch) => { if (!me) return; Object.assign(me, patch); track(); };
  api.nameOf = (id) => { const m = members.find((x) => x.id === id); return m ? cleanName(m.n) || 'Shopper' : 'Shopper'; };

  function drop() {
    if (ch) { const c = ch; ch = null; try { c.untrack && c.untrack(); } catch (_) {} try { const p = client.removeChannel(c); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
    members = []; hostId = null;
  }

  // Join a room. Resolves 'ok' (with api.seed set to the room's store) or 'full'.
  function enter(name, fixedSeed) {
    return new Promise((res, rej) => {
      drop();
      const joinedAt = Date.now();
      api.seed = fixedSeed != null ? fixedSeed >>> 0 : (Math.random() * 4294967296) >>> 0;
      me = { id: myId, n: myName(), t: joinedAt, sd: api.seed, lk: myShirt() };
      ch = client.channel(BASE + '-' + name, { config: { broadcast: { self: false, ack: false }, presence: { key: myId } } });
      const c = ch;
      let done = false;
      const to = setTimeout(() => { if (!done) { done = true; rej(new Error('offline')); } }, 10000);
      ch.on('presence', { event: 'sync' }, () => {
        if (c !== ch) return;
        members = listMembers();
        const i = members.findIndex((m) => m.id === myId);
        if (i < 0) return;
        if (!done) {
          // Give presence a moment to settle (everyone already in the room
          // shows up), then take on the room's store: the host's seed.
          done = true; clearTimeout(to);
          setTimeout(() => {
            if (c !== ch) return;
            members = listMembers();
            const j = members.findIndex((m) => m.id === myId);
            if (j >= MAX) { drop(); res('full'); return; }
            // Don't trust our own clock to make us the oldest: if anyone else is
            // already here, join after them and take on their store.
            const others = members.filter((m) => m.id !== myId);
            if (others.length && (j === 0 || members[0].id === myId)) {
              me.t = Math.max(...others.map((m) => +m.t || 0)) + 1;
              members = listMembers().map((m) => (m.id === myId ? Object.assign({}, m, { t: me.t }) : m)).sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : 1));
            }
            if (members[0] && members[0].id !== myId && members[0].sd) { api.seed = members[0].sd >>> 0; me.sd = api.seed; }
            track();
            hostId = members[0].id;
            res('ok');
            h.members?.(members.slice(0, MAX));
          }, 800);
          return;
        }
        if (!hostId) return;
        members = members.slice(0, MAX);
        const nh = members[0] && members[0].id;
        if (nh && nh !== hostId) { hostId = nh; h.hostChanged?.(nh === myId); }
        h.members?.(members);
      });
      const on = (ev, fn) => ch.on('broadcast', { event: ev }, (m) => { if (c === ch) { const p = m.payload || {}; if (typeof p.f === 'string') fn(p); } });
      const fromHost = (p) => api.host() && p.f === api.host().id;
      on('p', (p) => h.player?.(p.f, p));
      on('q', (p) => { if (api.isHost()) h.request?.(p.f, p); });
      on('w', (p) => { if (fromHost(p) && Array.isArray(p.u)) h.world?.(p.u); });
      on('s', (p) => { if (fromHost(p) && Array.isArray(p.s)) h.staff?.(p.s); });
      on('g', (p) => { if (fromHost(p)) h.clock?.(p); });
      on('h', (p) => { if (fromHost(p) && p.to === myId) h.hit?.(+p.d || 0); });
      on('c', (p) => h.chat?.(p.f, cleanChat(p.m)));
      on('x', (p) => h.caught?.(p.f, p));
      on('need', (p) => { if (api.isHost()) h.need?.(p.f); });
      on('pu', (p) => { if (api.isHost()) h.push?.(p.f, p); });
      on('wh', (p) => h.whistle?.(p.f, p));
      on('nz', (p) => h.noise?.(p.f, p));
      on('of', (p) => { if (api.isHost()) h.offer?.(p.f, p); });
      on('rs', (p) => { if (fromHost(p)) h.reset?.(p); });
      on('full', (p) => { if (fromHost(p) && p.to === myId) h.full?.(p); });
      ch.subscribe((st) => {
        if (st === 'SUBSCRIBED') track();
        else if ((st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') && !done) { done = true; clearTimeout(to); rej(new Error('offline')); }
      });
    });
  }

  api.quick = async () => {
    await getClient();
    for (let n = 1; n <= 20; n++) {
      const week = storeWeek();
      if (await enter('pub' + n, publicSeed('pub' + n, week)) === 'ok') { api.on = true; api.room = 'pub' + n; api.isPublic = true; api.week = week; return 'ok'; }
    }
    return 'full';
  };
  api.create = async () => {
    await getClient();
    let code = '';
    for (let i = 0; i < 4; i++) code += ALPH[Math.floor(Math.random() * ALPH.length)];
    await enter('r-' + code);
    api.on = true; api.room = code; api.isPublic = false;
    return code;
  };
  api.join = async (code) => {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (!code) return 'bad';
    await getClient();
    const r = await enter('r-' + code);
    if (r === 'ok') { api.on = true; api.room = code; api.isPublic = false; }
    return r;
  };
  api.leave = () => { drop(); api.on = false; api.room = null; };
  return api;
}
