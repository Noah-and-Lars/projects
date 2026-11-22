// Main-thread side of the physics worker. Keeps the latest transform of every
// body it has heard about, and batches ray queries into the next step.
import { startWorker, rpc } from './workers.js';

export async function createPhysics(opts = {}) {
  const w = rpc(await startWorker('physics'));
  const info = await w.call({ op: 'init', gravity: opts.gravity || 22, lengthUnit: opts.lengthUnit });
  const poses = new Map(); // id -> { p:[x,y,z], q:[x,y,z,w], asleep }
  let pending = [], stats = {}, playerState = null, busy = null;
  const api = {
    version: info.version,
    poses, get stats() { return stats; }, get player() { return playerState; },
    call: (m, t) => w.call(m, t),
    post: (m, t) => w.post(m, t),
    addBody(m) { poses.set(m.id, { p: m.pos.slice(), q: (m.quat || [0, 0, 0, 1]).slice(), asleep: !!m.asleep }); w.post({ op: 'addBody', ...m }); },
    removeBody(id) { poses.delete(id); w.post({ op: 'removeBody', id }); },
    setBody(m) { const s = poses.get(m.id); if (s) { if (m.pos) s.p = m.pos.slice(); if (m.quat) s.q = m.quat.slice(); s.asleep = false; } w.post({ op: 'setBody', ...m }); },
    // Queue a query for the next step; resolves with its answer.
    query(q) { return new Promise((res) => pending.push({ q, res })); },
    // Advance n fixed steps. Only one step is in flight at a time.
    async step(n, player) {
      if (busy) await busy;
      const qs = pending; pending = [];
      busy = w.call({ op: 'step', n, player, queries: qs.map(x => x.q) });
      const r = await busy; busy = null;
      const tr = r.tr;
      for (let i = 0; i < tr.length; i += 9) {
        const s = poses.get(tr[i]);
        if (!s) continue;
        s.p[0] = tr[i + 1]; s.p[1] = tr[i + 2]; s.p[2] = tr[i + 3];
        s.q[0] = tr[i + 4]; s.q[1] = tr[i + 5]; s.q[2] = tr[i + 6]; s.q[3] = tr[i + 7];
        s.asleep = tr[i + 8] === 1;
      }
      if (r.lost.length && api.onLost) for (const id of r.lost) api.onLost(id);
      stats = r.stats; playerState = r.player;
      qs.forEach((x, i) => x.res(r.queries[i]));
      return r;
    },
    get inFlight() { return !!busy; },
  };
  return api;
}
