// The online leaderboard, over the arcade realtime server (rt.js): every
// player with an online Arcade account joins one presence channel while
// they play and shares a line about themselves: their Arcade name, their
// money and how many ores they've sold. The server keeps nothing, so each
// client also remembers the rows it has seen (localStorage), to show
// players who aren't online right now.
//
// Two boards: solo games (by Arcade name) and multiplayer worlds (by world,
// with how many players are in it; the world's money is shared by all of
// them). When the Rillstone server is up (net/mp.js) its stored rows are
// merged in too, so players who aren't online still show.
//
// "View plot": ask an online player for a picture of their plot; their game
// renders one from above and sends it back in chunks.
const RT_LIB = 'https://noah-and-lars.github.io/projects/rt.js?v=3';
const CHANNEL = 'rill1-lb';
const CHUNK = 16000;
const KEEP = 'rill-lb';
const MAX_KEPT = 100;
export const cleanName = (n) => String(n || '').replace(/[^A-Za-z0-9_ .'-]/g, '').trim().slice(0, 16);

// The player's online Arcade account (a name and a token), or null.
export function arcadeAccount() {
  try { const a = JSON.parse(localStorage.getItem('arcade-acct') || 'null'); return a && a.name && a.token ? { name: cleanName(a.name) } : null; } catch (_) { return null; }
}

export function createBoard({ entry, picture, server }) {
  // entry(): { s: scrip, o: ores sold, kg, d: day, w?: world id, wn?: world
  // name, pl?: players } or null (don't publish: sandbox games, co-op guests).
  // picture(): Promise<dataURL> of your plot. server: net/mp.js (optional).
  const myId = (Math.random().toString(36) + '00000000').slice(2, 10);
  let client = null, ch = null, joining = null, lastSent = '', pushT = 0;
  const api = { on: false, id: myId, rows: [], mpRows: [], onChange: null, error: null };
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (_) { return {}; } };
  const kept = load(KEEP), keptMp = load(KEEP + '-mp');
  let stored = { solo: [], mp: [] }, storedT = 0;
  const trim = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1].t - a[1].t).slice(0, MAX_KEPT));
  const save = () => { try { localStorage.setItem(KEEP, JSON.stringify(trim(kept))); localStorage.setItem(KEEP + '-mp', JSON.stringify(trim(keptMp))); } catch (_) {} };

  function getClient() {
    if (client) return Promise.resolve(client);
    try { const A = window.parent !== window && window.parent.ArcadeOnline, c = A && A.client && A.client(); if (c) return Promise.resolve(client = c); } catch (_) {}
    return new Promise((res, rej) => {
      if (window.supabase && window.supabase.createClient) return res();
      const s = document.createElement('script'); s.src = window.RILL_RT_LIB || RT_LIB; s.async = true; s.onload = res; s.onerror = () => rej(new Error('offline'));
      document.head.appendChild(s);
    }).then(() => client || (client = window.supabase.createClient()));
  }
  function online() {
    const out = [], st = ch ? ch.presenceState() : {};
    for (const k in st) { const m = st[k] && st[k][0]; if (m && typeof m.id === 'string' && typeof m.n === 'string') out.push(m); }
    return out;
  }
  // Everyone: online players first-hand, then stored rows from the server,
  // then rows this browser remembers. Solo rows by name, worlds by id.
  function rebuild() {
    const now = Date.now(), live = online();
    for (const m of live) {
      const n = cleanName(m.n); if (!n) continue;
      if (m.w) keptMp[m.w] = { wn: String(m.wn || '').slice(0, 40), host: n, pl: +m.pl || 1, s: +m.s || 0, o: +m.o || 0, kg: +m.kg || 0, d: +m.d || 1, t: now };
      else kept[n] = { s: +m.s || 0, o: +m.o || 0, kg: +m.kg || 0, d: +m.d || 1, t: now };
    }
    if (live.length) save();
    const rows = [], seen = new Set(), mpRows = [], seenW = new Set();
    for (const m of live) {
      const n = cleanName(m.n); if (!n) continue;
      if (m.w) { if (seenW.has(m.w)) continue; seenW.add(m.w); mpRows.push({ world: m.w, name: String(m.wn || 'Multiplayer world').slice(0, 40), host: n, players: +m.pl || 1, scrip: +m.s || 0, ores: +m.o || 0, kg: +m.kg || 0, day: +m.d || 1, online: true, id: m.id, me: m.id === myId }); continue; }
      if (seen.has(n)) continue; seen.add(n);
      rows.push({ name: n, scrip: +m.s || 0, ores: +m.o || 0, kg: +m.kg || 0, day: +m.d || 1, online: true, id: m.id, me: m.id === myId });
    }
    for (const r of stored.solo) if (!seen.has(r.n)) { seen.add(r.n); rows.push({ name: r.n, scrip: r.s, ores: r.o, kg: r.kg, day: r.d, online: false, seenAt: r.t, stored: true }); }
    for (const w of stored.mp) if (!seenW.has(w.id)) { seenW.add(w.id); mpRows.push({ world: w.id, name: w.name, host: w.owner, players: w.players, members: w.members, scrip: w.s, ores: w.o, kg: w.kg, day: w.d, online: false, seenAt: w.t, stored: true }); }
    for (const [n, r] of Object.entries(kept)) if (!seen.has(n)) rows.push({ name: n, scrip: r.s, ores: r.o, kg: r.kg, day: r.d, online: false, seenAt: r.t });
    for (const [w, r] of Object.entries(keptMp)) if (!seenW.has(w)) mpRows.push({ world: w, name: r.wn || 'Multiplayer world', host: r.host, players: r.pl, scrip: r.s, ores: r.o, kg: r.kg, day: r.d, online: false, seenAt: r.t });
    const order = (a, b) => b.scrip - a.scrip || b.ores - a.ores;
    rows.sort(order); mpRows.sort(order);
    api.rows = rows; api.mpRows = mpRows; api.onChange?.(rows);
  }
  // Stored rows from the server (at most once a minute).
  api.fetchStored = async (force) => {
    if (!server?.available() || (!force && Date.now() - storedT < 60000)) return;
    storedT = Date.now();
    try { const d = await server.boards(); stored = { solo: Array.isArray(d.solo) ? d.solo : [], mp: Array.isArray(d.mp) ? d.mp : [] }; rebuild(); } catch (_) {}
  };
  const parts = new Map(), waiting = new Map();
  function send(event, payload) { if (!ch || ch.state !== 'joined') return false; try { const r = ch.send({ type: 'broadcast', event, payload: { ...payload, f: myId } }); r?.catch?.(() => {}); } catch (_) { return false; } return true; }
  let lastPic = 0;
  function onMessage(m) {
    const p = m && m.payload; if (!p || typeof p.f !== 'string') return;
    // Someone wants a picture of my plot (one answer every 5 s at most).
    if (m.event === 'pic?' && p.to === myId && typeof p.f === 'string') {
      if (Date.now() - lastPic < 5000) return; lastPic = Date.now();
      picture().then((url) => {
        if (typeof url !== 'string') return;
        const k = Math.random().toString(36).slice(2, 8), n = Math.ceil(url.length / CHUNK);
        for (let i = 0; i < n; i++) send('pic', { to: p.f, k, i, n, d: url.slice(i * CHUNK, (i + 1) * CHUNK) });
      }).catch(() => {});
    }
    // Picture chunks: only from a player we asked, and well-formed.
    if (m.event === 'pic' && p.to === myId && waiting.has(p.f) && typeof p.d === 'string' && p.d.length <= CHUNK && typeof p.k === 'string' && Number.isInteger(p.n) && p.n > 0 && p.n < 64 && Number.isInteger(p.i) && p.i >= 0 && p.i < p.n) {
      let e = parts.get(p.k); if (!e) { if (parts.size >= 4) parts.delete(parts.keys().next().value); e = { n: p.n, got: new Array(p.n), have: 0 }; parts.set(p.k, e); }
      if (e.n !== p.n) return;
      if (e.got[p.i] == null) { e.got[p.i] = p.d; e.have++; }
      if (e.have === p.n) { parts.delete(p.k); const w = waiting.get(p.f); const url = e.got.join(''); if (w && /^data:image\/(jpeg|png);base64,/.test(url)) { waiting.delete(p.f); w(url); } }
    }
  }
  // Join (or stay in) the channel and share my line. Resolves true/false.
  api.join = () => {
    if (api.on) return Promise.resolve(true);
    const acct = arcadeAccount(); if (!acct) { api.error = 'account'; return Promise.resolve(false); }
    if (joining) return joining;
    joining = getClient().then(() => new Promise((res) => {
      const c = client.channel(CHANNEL, { config: { broadcast: { self: false, ack: false }, presence: { key: myId } } });
      ch = c;
      const to = setTimeout(() => { res(false); }, 10000);
      c.on('presence', { event: 'sync' }, () => { if (c === ch) rebuild(); });
      c.on('broadcast', { event: '*' }, (m) => { if (c === ch) onMessage(m); });
      c.subscribe((st) => {
        if (st === 'SUBSCRIBED') { clearTimeout(to); api.on = true; api.error = null; lastSent = ''; api.push(true); res(true); }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { clearTimeout(to); api.error = 'offline'; res(false); }
      });
    })).catch(() => { api.error = 'offline'; return false; }).finally(() => { joining = null; });
    return joining;
  };
  // Share my line (only when it changed; at most every 15 s unless forced).
  api.push = (force) => {
    if (!api.on || !ch) return;
    const e = entry(), acct = arcadeAccount();
    if (!e || !acct) { if (lastSent !== 'none') { try { ch.untrack(); } catch (_) {} lastSent = 'none'; } return; }
    const line = { id: myId, n: acct.name, s: Math.floor(e.s), o: e.o | 0, kg: Math.round(e.kg * 10) / 10, d: e.d | 0, ...(e.w ? { w: e.w, wn: String(e.wn || '').slice(0, 40), pl: e.pl | 0 } : {}) };
    const key = JSON.stringify(line);
    if (key === lastSent || (!force && Date.now() - pushT < 15000)) return;
    lastSent = key; pushT = Date.now();
    try { const r = ch.track(line); r?.catch?.(() => {}); } catch (_) {}
  };
  api.update = (dt) => {
    if (api.on && (api._t = (api._t || 0) + dt) > 15) { api._t = 0; api.push(); }
    // Solo games keep a stored row (every 2 min) and plot picture (every 10 min) on the server.
    if (server?.available() && server.signedIn()) {
      api._st = (api._st || 100) + dt; api._pt = (api._pt || 580) + dt;
      const e = entry();
      if (e && !e.w && api._st > 120) { api._st = 0; server.soloRow({ s: Math.floor(e.s), o: e.o | 0, kg: e.kg, d: e.d | 0 }).catch(() => {}); }
      if (e && !e.w && api._pt > 600) { api._pt = 0; picture().then(img => img && img.length < 118000 && server.putPlot('s', img)).catch(() => {}); }
    }
  };
  // A picture of a player's (or world's) plot: Promise<dataURL|null>. Online:
  // their game renders it now; offline: the last one stored on the server.
  api.viewPlot = (row) => {
    if (row.me) return picture();
    if (!row.online || !row.id || !api.on) return server?.available() ? server.plot(row.world ? 'm' : 's', row.world || row.name) : Promise.resolve(null);
    return new Promise((res) => {
      waiting.set(row.id, res);
      send('pic?', { to: row.id });
      // No answer in 15 s: the last picture stored on the server, if any.
      setTimeout(() => { if (waiting.get(row.id) === res) { waiting.delete(row.id); res(server?.available() ? server.plot(row.world ? 'm' : 's', row.world || row.name).catch(() => null) : null); } }, 15000);
    });
  };
  api.leave = () => { if (ch) { try { ch.untrack(); } catch (_) {} try { client.removeChannel(ch); } catch (_) {} } ch = null; api.on = false; };
  api.refresh = () => { rebuild(); api.fetchStored(); };
  rebuild();
  return api;
}
