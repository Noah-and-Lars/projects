// The online leaderboard, over the arcade realtime server (rt.js): every
// player with an online Arcade account joins one presence channel while
// they play and shares a line about themselves: their Arcade name, their
// Scrip and how many ores they've sold. The server keeps nothing, so each
// client also remembers the rows it has seen (localStorage), to show
// players who aren't online right now.
//
// "View base": ask an online player for a picture of their base; their
// game renders one from above and sends it back in chunks.
const RT_LIB = 'https://noah-and-lars.github.io/projects/rt.js?v=2';
const CHANNEL = 'rill1-lb';
const CHUNK = 16000;
const KEEP = 'rill-lb';
const MAX_KEPT = 100;
export const cleanName = (n) => String(n || '').replace(/[^A-Za-z0-9_ .'-]/g, '').trim().slice(0, 16);

// The player's online Arcade account (a name and a token), or null.
export function arcadeAccount() {
  try { const a = JSON.parse(localStorage.getItem('arcade-acct') || 'null'); return a && a.name && a.token ? { name: cleanName(a.name) } : null; } catch (_) { return null; }
}

export function createBoard({ entry, picture }) {
  // entry(): { s: scrip, o: ores sold, kg, d: day } or null (don't publish:
  // sandbox games and co-op guests). picture(): Promise<dataURL> of your base.
  const myId = (Math.random().toString(36) + '00000000').slice(2, 10);
  let client = null, ch = null, joining = null, lastSent = '', pushT = 0;
  const api = { on: false, id: myId, rows: [], onChange: null, error: null };
  const kept = (() => { try { return JSON.parse(localStorage.getItem(KEEP) || '{}') || {}; } catch (_) { return {}; } })();
  const save = () => { try { const e = Object.entries(kept).sort((a, b) => b[1].t - a[1].t).slice(0, MAX_KEPT); localStorage.setItem(KEEP, JSON.stringify(Object.fromEntries(e))); } catch (_) {} };

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
  // Everyone: online players first-hand, then remembered ones (by name).
  function rebuild() {
    const now = Date.now(), live = online(), seen = new Set();
    for (const m of live) { const n = cleanName(m.n); if (!n) continue; kept[n] = { s: +m.s || 0, o: +m.o || 0, kg: +m.kg || 0, d: +m.d || 1, t: now }; }
    if (live.length) save();
    const rows = [];
    for (const m of live) { const n = cleanName(m.n); if (!n || seen.has(n)) continue; seen.add(n); rows.push({ name: n, scrip: +m.s || 0, ores: +m.o || 0, kg: +m.kg || 0, day: +m.d || 1, online: true, id: m.id, me: m.id === myId }); }
    for (const [n, r] of Object.entries(kept)) if (!seen.has(n)) rows.push({ name: n, scrip: r.s, ores: r.o, kg: r.kg, day: r.d, online: false, seenAt: r.t, me: false });
    rows.sort((a, b) => b.scrip - a.scrip || b.ores - a.ores);
    api.rows = rows; api.onChange?.(rows);
  }
  const parts = new Map(), waiting = new Map();
  function send(event, payload) { if (!ch || ch.state !== 'joined') return false; try { const r = ch.send({ type: 'broadcast', event, payload: { ...payload, f: myId } }); r?.catch?.(() => {}); } catch (_) { return false; } return true; }
  let lastPic = 0;
  function onMessage(m) {
    const p = m && m.payload; if (!p || typeof p.f !== 'string') return;
    // Someone wants a picture of my base (one answer every 5 s at most).
    if (m.event === 'pic?' && p.to === myId) {
      if (Date.now() - lastPic < 5000) return; lastPic = Date.now();
      picture().then((url) => {
        if (typeof url !== 'string') return;
        const k = Math.random().toString(36).slice(2, 8), n = Math.ceil(url.length / CHUNK);
        for (let i = 0; i < n; i++) send('pic', { to: p.f, k, i, n, d: url.slice(i * CHUNK, (i + 1) * CHUNK) });
      }).catch(() => {});
    }
    if (m.event === 'pic' && p.to === myId && typeof p.d === 'string' && p.n > 0 && p.n < 64) {
      let e = parts.get(p.k); if (!e) { e = { got: new Array(p.n), have: 0 }; parts.set(p.k, e); }
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
    const line = { id: myId, n: acct.name, s: Math.floor(e.s), o: e.o | 0, kg: Math.round(e.kg * 10) / 10, d: e.d | 0 };
    const key = JSON.stringify(line);
    if (key === lastSent || (!force && Date.now() - pushT < 15000)) return;
    lastSent = key; pushT = Date.now();
    try { const r = ch.track(line); r?.catch?.(() => {}); } catch (_) {}
  };
  api.update = (dt) => { if (api.on && (api._t = (api._t || 0) + dt) > 15) { api._t = 0; api.push(); } };
  // Ask an online player for a picture of their base: Promise<dataURL|null>.
  api.viewBase = (row) => {
    if (row.me) return picture();
    if (!row.online || !row.id || !api.on) return Promise.resolve(null);
    return new Promise((res) => {
      waiting.set(row.id, res);
      send('pic?', { to: row.id });
      setTimeout(() => { if (waiting.get(row.id) === res) { waiting.delete(row.id); res(null); } }, 15000);
    });
  };
  api.leave = () => { if (ch) { try { ch.untrack(); } catch (_) {} try { client.removeChannel(ch); } catch (_) {} } ch = null; api.on = false; };
  api.refresh = () => rebuild();
  rebuild();
  return api;
}
