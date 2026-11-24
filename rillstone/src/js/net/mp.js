// The Rillstone server's client: multiplayer saves (worlds every member can
// reopen, even when the one who made it is offline) and the stored
// leaderboards. See server/worker.mjs.
//
// You are your Arcade name plus a secret key your game makes once and keeps
// in this browser. Your six multiplayer slots are a list of world ids, kept
// here too; the server holds the worlds and who is in them.
import { arcadeAccount } from './board.js';

// Where the server lives once deployed (tools/deploy-server.mjs prints it).
// Empty: not deployed yet, so multiplayer saves and stored boards are off.
export const MP_SERVER = '';
export const MP_SLOTS = 6;
const SLOTS_KEY = 'rill-mp-slots', KEY_KEY = 'rill-mp-key';

export function createMp() {
  const base = () => { try { return (window.RILL_MP_URL || localStorage.getItem('rill-mp-url') || MP_SERVER || '').replace(/\/$/, ''); } catch (_) { return MP_SERVER; } };
  const key = () => {
    try { let k = localStorage.getItem(KEY_KEY); if (!k || k.length < 16) { const b = new Uint8Array(18); crypto.getRandomValues(b); k = [...b].map(x => x.toString(16).padStart(2, '0')).join(''); localStorage.setItem(KEY_KEY, k); } return k; } catch (_) { return null; }
  };
  const who = () => { const a = arcadeAccount(); return a ? { n: a.name, k: key() } : null; };
  async function post(path, body) {
    const w = who(); if (!w) throw new Error('account');
    const r = await fetch(base() + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...w, ...body }) });
    const d = await r.json().catch(() => ({ error: 'bad' }));
    if (!r.ok || d.error) { const e = new Error(d.error || `http ${r.status}`); e.code = d.error || r.status; throw e; }
    return d;
  }
  const api = {
    available: () => !!base(),
    signedIn: () => !!arcadeAccount(),
    // ---- My six slots (world ids) ----
    slots() { try { const a = JSON.parse(localStorage.getItem(SLOTS_KEY) || '[]'); return Array.from({ length: MP_SLOTS }, (_, i) => (typeof a[i] === 'string' ? a[i] : null)); } catch (_) { return Array(MP_SLOTS).fill(null); } },
    setSlot(i, id) { const s = api.slots(); s[i] = id; try { localStorage.setItem(SLOTS_KEY, JSON.stringify(s)); } catch (_) {} },
    slotOf(id) { return api.slots().indexOf(id); },
    addWorld(id) { const s = api.slots(); if (s.includes(id)) return s.indexOf(id); const i = s.indexOf(null); if (i < 0) return -1; api.setSlot(i, id); return i; },
    // ---- Worlds ----
    create: (name, save, stats) => post('/mp/create', { name, save, ...stats }),
    get: (id) => post('/mp/get', { id }),
    save: (id, save, stats, plot) => post('/mp/save', { id, save, plot, ...stats }),
    join: (id, invite) => post('/mp/join', { id, invite }),
    leave: (id) => post('/mp/leave', { id }),
    remove: (id) => post('/mp/delete', { id }),
    metas: (ids) => post('/mp/meta', { ids }),
    // ---- Boards and plot pictures ----
    async boards() { const r = await fetch(base() + '/lb'); if (!r.ok) throw new Error('http'); return r.json(); },
    soloRow: (row) => post('/lb/solo', row),
    putPlot: (kind, img, id) => post('/plot', { kind, img, id }),
    async plot(kind, ref) { const r = await fetch(`${base()}/plot?kind=${kind}&ref=${encodeURIComponent(ref)}`); if (!r.ok) return null; return (await r.json()).img || null; },
  };
  // The live room for a world: a 5-character code made from its id, so every
  // member finds the same room without being told the code.
  api.roomCode = (id) => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let h = 2166136261; for (const c of 'rill:' + id) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } let s = ''; for (let i = 0; i < 5; i++) { s += A[h % A.length]; h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; } return s; };
  return api;
}
