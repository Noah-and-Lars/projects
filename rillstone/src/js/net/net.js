// Co-op rooms (BUILD_BRIEF 7) over the arcade realtime server (rt.js), in
// the room-and-presence pattern of throttle-ridge/src/js/net.js.
//
// A room is the channel `rill1-r-CODE` (CODE: 5 characters). Presence is the
// member list: { id, n: name, t: joined, h: 1 for the host, c: colour }. The
// host is the member who created the world; at most 4 members.
// The client library loads only when you go online (the offline game makes
// no outside requests). Online play needs an Arcade account: rt.js asks for
// one itself and refuses the channel otherwise.
const RT_LIB = 'https://noah-and-lars.github.io/projects/rt.js?v=2';
export const MAX = 4;
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const BASE = 'rill1';
// Big messages (the world package) go out in chunks this size.
export const CHUNK = 16000;

export const cleanName = (n) => String(n || '').replace(/[^A-Za-z0-9_ .'-]/g, '').trim().slice(0, 16);
function myName() {
  try {
    // A name typed on the Co-op page wins; then the Arcade account's.
    const own = cleanName(localStorage.getItem('rill-name')); if (own) return own;
    const a = JSON.parse(localStorage.getItem('arcade-acct') || 'null'); if (a && a.name) return cleanName(a.name);
    const l = JSON.parse(localStorage.getItem('arcade-local') || 'null'); if (l && l.name) return cleanName(l.name);
  } catch (_) {}
  return 'Miner';
}

export function createNet() {
  const myId = (Math.random().toString(36) + '00000000').slice(2, 10);
  let client = null, libLoad = null, ch = null, me = null;
  const handlers = new Map(); // event -> fn(payload)
  const api = { id: myId, on: false, room: null, members: [], name: myName, stats: { out: 0, in: 0, outBytes: 0, inBytes: 0 } };

  function getClient() {
    if (client) return Promise.resolve(client);
    try { const A = window.parent !== window && window.parent.ArcadeOnline, c = A && A.client && A.client(); if (c) return Promise.resolve(client = c); } catch (_) {}
    if (!libLoad) libLoad = new Promise((res, rej) => {
      if (window.supabase && window.supabase.createClient) return res();
      const s = document.createElement('script'); s.src = window.RILL_RT_LIB || RT_LIB; s.async = true; s.onload = res; s.onerror = () => { libLoad = null; rej(new Error('offline')); };
      document.head.appendChild(s);
    });
    return libLoad.then(() => client || (client = window.supabase.createClient()));
  }
  const listMembers = () => {
    const st = ch ? ch.presenceState() : {}, out = [];
    for (const k in st) { const m = st[k] && st[k][0]; if (m && typeof m.id === 'string') out.push(m); }
    // Order by when this client first saw each member, not by the join
    // time members report (their clocks can disagree). Members seen in the
    // same sync are ordered by reported time, with this client last: so a
    // newcomer always counts as the newest, and a full room turns it away
    // instead of bumping someone already playing.
    for (const id of [...firstSeen.keys()]) if (!out.some(m => m.id === id)) firstSeen.delete(id);
    const fresh = out.filter(m => !firstSeen.has(m.id)).sort((a, b) => (a.id === myId) - (b.id === myId) || (a.t - b.t) || (a.id < b.id ? -1 : 1));
    for (const m of fresh) firstSeen.set(m.id, seenSeq++);
    return out.sort((a, b) => (b.h | 0) - (a.h | 0) || firstSeen.get(a.id) - firstSeen.get(b.id));
  };
  const firstSeen = new Map(); let seenSeq = 0;
  api.host = () => api.members.find(m => m.h) || null;
  api.self = () => me;
  api.isHost = () => !!me && !!me.h;
  api.on_ = (event, fn) => handlers.set(event, fn);
  api.send = (event, payload) => {
    if (!ch || ch.state !== 'joined') return false;
    const p = Object.assign({}, payload, { f: myId }); // the sender id can't be overridden
    if (api.countBytes) api.stats.bytes = (api.stats.bytes || 0) + JSON.stringify(p).length + event.length;
    try { const r = ch.send({ type: 'broadcast', event, payload: p }); if (r && r.catch) r.catch(() => {}); } catch (_) { return false; }
    api.stats.out++; return true;
  };
  function drop() {
    firstSeen.clear(); seenSeq = 0;
    if (ch) { const c = ch; ch = null; try { c.untrack && c.untrack(); } catch (_) {} try { const p = client.removeChannel(c); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
    api.members = [];
  }
  // Join a channel; resolves 'ok', 'full', or rejects 'offline'.
  function enter(code, host) {
    return new Promise((res, rej) => {
      drop();
      me = { id: myId, n: myName(), t: Date.now(), h: host ? 1 : 0, ...(host && api.world ? { w: api.world } : {}) };
      ch = client.channel(`${BASE}-r-${code}`, { config: { broadcast: { self: false, ack: false }, presence: { key: myId } } });
      const c = ch;
      let done = false;
      const to = setTimeout(() => { if (!done) { done = true; if (c === ch) drop(); rej(new Error('offline')); } }, 10000);
      ch.on('presence', { event: 'sync' }, () => {
        if (c !== ch) return;
        const before = api.members;
        api.members = listMembers();
        const i = api.members.findIndex(m => m.id === myId);
        if (i < 0) return;
        if (!done) {
          done = true; clearTimeout(to);
          if (i >= MAX) { drop(); res('full'); return; }
          if (!host && !api.host()) { drop(); res('nohost'); return; }
          res('ok');
        }
        api.members = api.members.slice(0, MAX);
        handlers.get('members')?.(api.members, before);
      });
      ch.on('broadcast', { event: '*' }, (m) => {
        if (c !== ch || !m || !m.payload) return;
        api.stats.in++; if (api.countBytes) api.stats.bytes = (api.stats.bytes || 0) + JSON.stringify(m.payload).length + (m.event || '').length;
        const fn = handlers.get(m.event); if (fn) try { fn(m.payload); } catch (e) { console.error(e); }
      });
      ch.subscribe((st) => {
        if (st === 'SUBSCRIBED') { try { const p = ch.track(me); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
        else if ((st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') && !done) { done = true; clearTimeout(to); if (c === ch) drop(); rej(new Error('offline')); }
      });
    });
  }
  // Open a room: a random code, or a fixed one (a multiplayer world's room).
  api.create = async (fixed) => {
    await getClient();
    let code = typeof fixed === 'string' && /^[A-Z0-9]{5}$/.test(fixed) ? fixed : '';
    if (!code) for (let i = 0; i < 5; i++) code += ALPH[Math.floor(Math.random() * ALPH.length)];
    const r = await enter(code, true);
    if (r === 'ok') { api.on = true; api.room = code; }
    return r === 'ok' ? code : r;
  };
  api.join = async (code) => {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (code.length !== 5) return 'bad';
    await getClient();
    const r = await enter(code, false);
    if (r === 'ok') { api.on = true; api.room = code; }
    return r;
  };
  api.leave = () => { drop(); api.on = false; api.room = null; };

  // ---- Big payloads: split into numbered chunks, reassembled by id ----
  const parts = new Map(); // id -> { n, got: [], have }
  api.sendBig = (event, to, str) => {
    const id = Math.random().toString(36).slice(2, 8), n = Math.max(1, Math.ceil(str.length / CHUNK));
    for (let i = 0; i < n; i++) api.send(event, { to, k: id, i, n, d: str.slice(i * CHUNK, (i + 1) * CHUNK) });
    return n;
  };
  api.clearParts = () => parts.clear();
  // Feed chunk messages; returns the whole string when the last one lands.
  api.takeBig = (p) => {
    let e = parts.get(p.k);
    if (!e) { e = { n: p.n, got: new Array(p.n), have: 0 }; parts.set(p.k, e); }
    if (e.got[p.i] == null) { e.got[p.i] = p.d; e.have++; }
    if (e.have < e.n) return null;
    parts.delete(p.k);
    const s = e.got.join('');
    return s;
  };
  return api;
}
