// Rillstone server: multiplayer saves and the leaderboards.
// A Cloudflare Worker in front of one Durable Object ("Hub", SQLite-backed,
// key-value API). Deploy with tools/deploy-server.mjs.
//
// Players are named by their Arcade name and proved by a secret key their
// game makes once and keeps (localStorage); the server stores only a hash.
//
// Storage keys:
//   w:<id>            world meta { id, name, owner: n, ownerKh, members: [{ n, kh }], invite, rev, savedAt, day, scrip, ores, kg, parts }
//   c:<id>:<i>        the world's save, split in pieces (≤ 100 000 chars each)
//   s:<name>          solo leaderboard row { n, kh, s, o, kg, d, t }
//   plot:s:<name>     a picture of a solo player's plot (JPEG data URL)
//   plot:m:<id>       a picture of a multiplayer world's plot
const PART = 100000, MAX_SAVE = 6_000_000, MAX_PLOT = 120_000, MAX_MEMBERS = 4, MAX_WORLDS_PER_OWNER = 6;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const cleanName = (n) => String(n || '').replace(/[^A-Za-z0-9_ .'-]/g, '').trim().slice(0, 16);
const cleanTitle = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
const num = (v, max = 1e12) => Math.max(0, Math.min(max, Number(v) || 0));
async function hash(k) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('rill1:' + String(k || '')));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
const newId = (n = 10) => { const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = new Uint8Array(n); crypto.getRandomValues(b); return [...b].map(x => a[x % a.length]).join(''); };

export class Hub {
  constructor(state) { this.state = state; this.s = state.storage; }
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (req.method === 'GET' && url.pathname === '/lb') return json(await this.boards());
      if (req.method === 'GET' && url.pathname === '/plot') { const img = await this.s.get(`plot:${url.searchParams.get('kind') === 'm' ? 'm' : 's'}:${String(url.searchParams.get('ref') || '').slice(0, 40)}`); return img ? json({ img }) : json({ error: 'none' }, 404); }
      if (req.method !== 'POST') return json({ error: 'method' }, 405);
      const b = await req.json();
      const n = cleanName(b.n), kh = b.k && String(b.k).length >= 16 ? await hash(b.k) : null;
      if (!n || !kh) return json({ error: 'who' }, 401);
      const route = url.pathname;
      if (route === '/lb/solo') return json(await this.soloRow(n, kh, b));
      if (route === '/plot') return json(await this.putPlot(n, kh, b));
      if (route === '/mp/create') return json(await this.create(n, kh, b));
      if (route === '/mp/meta') return json(await this.metas(kh, b.ids));
      const id = String(b.id || '').slice(0, 16), w = await this.s.get(`w:${id}`);
      if (!w) return json({ error: 'gone' }, 404);
      const member = w.members.find(m => m.kh === kh), owner = w.ownerKh === kh;
      if (route === '/mp/join') {
        if (member) return json({ ok: true, meta: this.pub(w, kh) });
        if (b.invite !== w.invite) return json({ error: 'invite' }, 403);
        if (w.members.length >= MAX_MEMBERS) return json({ error: 'full' }, 409);
        w.members.push({ n, kh }); await this.s.put(`w:${id}`, w); return json({ ok: true, meta: this.pub(w, kh) });
      }
      if (!member) return json({ error: 'member' }, 403);
      if (route === '/mp/get') { const parts = []; for (let i = 0; i < w.parts; i++) parts.push(await this.s.get(`c:${id}:${i}`) || ''); return json({ meta: this.pub(w, kh), save: parts.join('') }); }
      if (route === '/mp/save') return json(await this.save(w, kh, b));
      if (route === '/mp/leave') {
        if (owner) return json({ error: 'owner' }, 403); // the owner deletes instead
        w.members = w.members.filter(m => m.kh !== kh); await this.s.put(`w:${id}`, w); return json({ ok: true });
      }
      if (route === '/mp/delete') {
        if (!owner) return json({ error: 'owner' }, 403);
        for (let i = 0; i < w.parts; i++) await this.s.delete(`c:${id}:${i}`);
        await this.s.delete(`plot:m:${id}`); await this.s.delete(`w:${id}`); return json({ ok: true });
      }
      return json({ error: 'route' }, 404);
    } catch (e) { return json({ error: 'bad', detail: String(e && e.message || e).slice(0, 200) }, 400); }
  }
  // What a member sees of a world (no keys).
  pub(w, kh) { return { id: w.id, name: w.name, owner: w.owner, isOwner: w.ownerKh === kh, members: w.members.map(m => m.n), invite: w.members.some(m => m.kh === kh) ? w.invite : undefined, rev: w.rev, savedAt: w.savedAt, day: w.day, scrip: w.scrip, ores: w.ores, kg: w.kg }; }
  async writeSave(id, save, old = 0) {
    const parts = Math.ceil(save.length / PART);
    for (let i = 0; i < parts; i++) await this.s.put(`c:${id}:${i}`, save.slice(i * PART, (i + 1) * PART));
    for (let i = parts; i < old; i++) await this.s.delete(`c:${id}:${i}`);
    return parts;
  }
  async create(n, kh, b) {
    const save = String(b.save || ''); if (!save || save.length > MAX_SAVE) return { error: 'save' };
    const mine = await this.s.list({ prefix: 'w:' }); let owned = 0; for (const w of mine.values()) if (w.ownerKh === kh) owned++;
    if (owned >= MAX_WORLDS_PER_OWNER) return { error: 'too many' };
    const id = newId(10), w = { id, name: cleanTitle(b.name) || `${n}'s claim`, owner: n, ownerKh: kh, members: [{ n, kh }], invite: newId(12), rev: 1, savedAt: Date.now(), day: num(b.day, 1e6), scrip: num(b.scrip), ores: num(b.ores), kg: num(b.kg), parts: 0 };
    w.parts = await this.writeSave(id, save);
    await this.s.put(`w:${id}`, w);
    return { ok: true, meta: this.pub(w, kh) };
  }
  async save(w, kh, b) {
    const save = String(b.save || ''); if (!save || save.length > MAX_SAVE) return { error: 'save' };
    w.parts = await this.writeSave(w.id, save, w.parts);
    Object.assign(w, { rev: w.rev + 1, savedAt: Date.now(), day: num(b.day, 1e6), scrip: num(b.scrip), ores: num(b.ores), kg: num(b.kg), savedBy: cleanName(b.n) });
    await this.s.put(`w:${w.id}`, w);
    if (typeof b.plot === 'string' && b.plot.length < MAX_PLOT && b.plot.startsWith('data:image/jpeg;base64,')) await this.s.put(`plot:m:${w.id}`, b.plot);
    return { ok: true, rev: w.rev };
  }
  async metas(kh, ids) {
    const out = {};
    for (const id of (Array.isArray(ids) ? ids : []).slice(0, 12)) { const w = await this.s.get(`w:${String(id).slice(0, 16)}`); out[id] = !w ? { gone: true } : w.members.some(m => m.kh === kh) ? this.pub(w, kh) : { removed: true }; }
    return { worlds: out };
  }
  async soloRow(n, kh, b) {
    const old = await this.s.get(`s:${n}`);
    if (old && old.kh !== kh) return { error: 'name taken' };
    await this.s.put(`s:${n}`, { n, kh, s: num(b.s), o: num(b.o), kg: num(b.kg), d: num(b.d, 1e6), t: Date.now() });
    return { ok: true };
  }
  async putPlot(n, kh, b) {
    const img = String(b.img || ''); if (img.length > MAX_PLOT || !img.startsWith('data:image/jpeg;base64,')) return { error: 'img' };
    if (b.kind === 'm') { const w = await this.s.get(`w:${String(b.id || '').slice(0, 16)}`); if (!w || !w.members.some(m => m.kh === kh)) return { error: 'member' }; await this.s.put(`plot:m:${w.id}`, img); }
    else { const old = await this.s.get(`s:${n}`); if (old && old.kh !== kh) return { error: 'name taken' }; await this.s.put(`plot:s:${n}`, img); }
    return { ok: true };
  }
  async boards() {
    const solo = [], mp = [];
    for (const r of (await this.s.list({ prefix: 's:' })).values()) solo.push({ n: r.n, s: r.s, o: r.o, kg: r.kg, d: r.d, t: r.t });
    for (const w of (await this.s.list({ prefix: 'w:' })).values()) mp.push({ id: w.id, name: w.name, owner: w.owner, players: w.members.length, members: w.members.map(m => m.n), s: w.scrip, o: w.ores, kg: w.kg, d: w.day, t: w.savedAt });
    solo.sort((a, b) => b.s - a.s); mp.sort((a, b) => b.s - a.s);
    return { solo: solo.slice(0, 200), mp: mp.slice(0, 200) };
  }
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const len = +(req.headers.get('content-length') || 0); if (len > MAX_SAVE + 200_000) return json({ error: 'too big' }, 413);
    const hub = env.HUB.get(env.HUB.idFromName('rillstone'));
    return hub.fetch(req);
  },
};
