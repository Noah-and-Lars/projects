// The staff. Only the host runs this; everybody else draws the snapshots the
// host sends (net.js). By day staff wander and ignore you. At night they hunt
// the nearest shopper, follow a grid path around furniture, and if you've
// walled yourself in they start breaking the furniture. They can't climb or
// jump, so standing high enough keeps you out of reach.
import { moveBody, bodyFits } from './physics.js';
import { TYPES } from './furniture.js';

const CELL = 0.5, MAX_EXPAND = 2600, RADIUS = 0.3;
const REACH = 1.15, REACH_UP = 1.3;

let nextId = 1;

export class StaffSim {
  constructor(world) {
    this.world = world;
    this.staff = new Map();
    this.cache = new Map();
    this.cacheVer = -1;
    this.spawnT = 0;
  }

  clear() { this.staff.clear(); }

  blocked(cx, cz) {
    if (this.cacheVer !== this.world.version) { this.cache.clear(); this.cacheVer = this.world.version; }
    const k = cx * 100003 + cz;
    let v = this.cache.get(k);
    if (v === undefined) {
      const x = (cx + 0.5) * CELL, z = (cz + 0.5) * CELL;
      v = false;
      this.world.forBoxes(x - RADIUS, z - RADIUS, x + RADIUS, z + RADIUS, (o) => { if (o.y0 < 1.9 && o.y1 > 0.35) v = true; });
      this.cache.set(k, v);
      if (this.cache.size > 60000) this.cache.clear();
    }
    return v;
  }

  // Breadth-first search on a 0.5 m grid. Returns waypoints to the target, or
  // to the reachable cell nearest it.
  path(sx, sz, tx, tz) {
    const s0 = Math.floor(sx / CELL), s1 = Math.floor(sz / CELL), t0 = Math.floor(tx / CELL), t1 = Math.floor(tz / CELL);
    const prev = new Map(), q = [[s0, s1]];
    const key = (a, b) => a * 100003 + b;
    prev.set(key(s0, s1), null);
    let best = [s0, s1], bestD = Math.hypot(t0 - s0, t1 - s1), n = 0, head = 0;
    const lim = 34;
    while (head < q.length && n < MAX_EXPAND) {
      const [a, b] = q[head++]; n++;
      const d = Math.hypot(t0 - a, t1 - b);
      if (d < bestD) { bestD = d; best = [a, b]; }
      if (a === t0 && b === t1) break;
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const na = a + da, nb = b + db, k = key(na, nb);
        if (prev.has(k) || Math.abs(na - s0) > lim || Math.abs(nb - s1) > lim) continue;
        if (this.blocked(na, nb)) continue;
        if (da && db && (this.blocked(a + da, b) || this.blocked(a, b + db))) continue;
        prev.set(k, [a, b]); q.push([na, nb]);
      }
    }
    const pts = [];
    let c = best;
    while (c) { pts.push([(c[0] + 0.5) * CELL, (c[1] + 0.5) * CELL]); c = prev.get(key(c[0], c[1])); }
    pts.reverse(); pts.shift();
    return { pts, reached: bestD < 1.5, gap: bestD * CELL };
  }

  spawnNear(p) {
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 14;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (!bodyFits(this.world, x, 0, z, 0.35, 2.1)) continue;
      const id = nextId++;
      this.staff.set(id, { id, x, y: 0, z, ry: Math.random() * 6.28, vy: 0, radius: RADIUS, height: 2.1, step: 0.36, gravity: 20, onGround: true,
        mode: 'wander', goal: null, path: [], pathT: 0, waitT: Math.random() * 3, cd: 0, target: null, bash: null, stuckT: 0, lx: x, lz: z, anim: 0, speed: 0 });
      return;
    }
  }

  update(dt, players, env) {
    const out = { hits: [], items: [] };
    const alive = players.filter((p) => p.alive);
    const hostile = env.hostile;
    const perPlayer = hostile ? (env.event === 'overtime' ? 9 : env.event === 'calm' ? 3 : 6) : 2;
    const chaseSpeed = (env.event === 'overtime' ? 5.0 : 4.25);
    // Spawn and despawn around the players.
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.staff.size < 40) {
      this.spawnT = hostile ? 1.0 : 3;
      for (const p of alive) {
        let near = 0;
        for (const s of this.staff.values()) if (Math.hypot(s.x - p.x, s.z - p.z) < 42) near++;
        if (near < perPlayer) this.spawnNear(p);
      }
    }
    for (const s of this.staff.values()) {
      let nearest = Infinity;
      for (const p of players) nearest = Math.min(nearest, Math.hypot(s.x - p.x, s.z - p.z));
      if (nearest > 60) this.staff.delete(s.id);
    }
    if (!hostile) { // over the limit after a night: thin out the ones nobody sees
      let extra = this.staff.size - Math.max(2, alive.length * perPlayer);
      for (const s of this.staff.values()) { if (extra <= 0) break; let n = Infinity; for (const p of alive) n = Math.min(n, Math.hypot(s.x - p.x, s.z - p.z)); if (n > 22) { this.staff.delete(s.id); extra--; } }
    }

    for (const s of this.staff.values()) {
      s.cd -= dt; s.anim = Math.max(0, s.anim - dt);
      let mx = 0, mz = 0, speed = 0;
      // pick target
      let tgt = null, td = hostile ? 40 : 0;
      if (hostile) for (const p of alive) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < td) { td = d; tgt = p; } }
      s.bash = null;
      if (tgt) {
        s.mode = 'chase';
        const dy = tgt.y - s.y;
        s.pathT -= dt;
        if (s.pathT <= 0 || !s.target || Math.hypot(s.target[0] - tgt.x, s.target[1] - tgt.z) > 1.2) {
          s.pathT = 0.5 + Math.random() * 0.3;
          s.target = [tgt.x, tgt.z];
          const r = this.path(s.x, s.z, tgt.x, tgt.z);
          s.path = r.pts; s.reached = r.reached; s.gap = r.gap;
        }
        const close = td < REACH;
        if (close && dy < REACH_UP && dy > -1.0) {
          if (s.cd <= 0) { s.cd = 1.1; s.anim = 0.4; out.hits.push({ to: tgt.id, d: env.event === 'overtime' ? 20 : 15 }); }
        } else if (td < 1.6 && dy >= REACH_UP) {
          // Out of reach above us: wait underneath.
        } else if (s.path.length) {
          const [wx, wz] = s.path[0];
          const dx = wx - s.x, dz = wz - s.z, d = Math.hypot(dx, dz);
          if (d < 0.3) s.path.shift();
          else { mx = dx / d; mz = dz / d; speed = chaseSpeed; }
          if (!s.path.length && s.reached) { const ex = tgt.x - s.x, ez = tgt.z - s.z, e = Math.hypot(ex, ez) || 1; mx = ex / e; mz = ez / e; speed = chaseSpeed; }
        } else if (!s.reached && dy < REACH_UP) {
          // Walled off: break the furniture in the way.
          const it = this.blockingItem(s, tgt);
          if (it) {
            s.bash = it;
            s.ry = Math.atan2(it.x - s.x, it.z - s.z);
            it.hp -= dt * 6;
            s.anim = 0.4;
            if (it.hp <= 0) { it.g = true; out.items.push({ it, broke: true }); }
            else if (Math.random() < dt * 2) out.items.push({ it, broke: false });
          } else {
            const ex = tgt.x - s.x, ez = tgt.z - s.z, e = Math.hypot(ex, ez) || 1; mx = ex / e; mz = ez / e; speed = chaseSpeed * 0.6;
          }
        } else if (td > 0.8) {
          const ex = tgt.x - s.x, ez = tgt.z - s.z, e = Math.hypot(ex, ez) || 1; mx = ex / e; mz = ez / e; speed = chaseSpeed;
        }
      } else {
        s.mode = 'wander'; s.target = null;
        if (s.waitT > 0) s.waitT -= dt;
        else {
          if (!s.goal) {
            const a = Math.random() * 6.28, d = 3 + Math.random() * 8;
            s.goal = [s.x + Math.cos(a) * d, s.z + Math.sin(a) * d];
            s.path = this.path(s.x, s.z, s.goal[0], s.goal[1]).pts;
          }
          if (s.path.length) {
            const [wx, wz] = s.path[0];
            const dx = wx - s.x, dz = wz - s.z, d = Math.hypot(dx, dz);
            if (d < 0.3) s.path.shift(); else { mx = dx / d; mz = dz / d; speed = 1.3; }
          } else { s.goal = null; s.waitT = 2 + Math.random() * 5; }
        }
      }
      // keep apart from other staff
      for (const o of this.staff.values()) {
        if (o === s) continue;
        const dx = s.x - o.x, dz = s.z - o.z, d = Math.hypot(dx, dz);
        if (d < 0.6 && d > 0.001) { mx += dx / d * 0.6; mz += dz / d * 0.6; }
      }
      if (speed > 0) {
        const want = Math.atan2(mx, mz);
        s.ry += Math.atan2(Math.sin(want - s.ry), Math.cos(want - s.ry)) * Math.min(1, dt * 10);
      }
      const ox = s.x, oz = s.z;
      moveBody(this.world, s, mx * speed * dt, mz * speed * dt, dt);
      s.speed = Math.hypot(s.x - ox, s.z - oz) / Math.max(dt, 1e-3);
      // unstick
      if (speed > 0 && s.speed < 0.3) { s.stuckT += dt; if (s.stuckT > 1.5) { s.stuckT = 0; s.pathT = 0; s.path = []; s.goal = null; } }
      else s.stuckT = 0;
    }
    return out;
  }

  blockingItem(s, tgt) {
    let best = null, bd = Infinity;
    const dirx = tgt.x - s.x, dirz = tgt.z - s.z, dl = Math.hypot(dirx, dirz) || 1;
    this.world.forItems(s.x - 1.6, s.z - 1.6, s.x + 1.6, s.z + 1.6, (it) => {
      if (it.k !== 'f' || !this.world.active(it) || TYPES[it.t].flat) return;
      const b = this.world.itemBox(it);
      if (b.y0 > 1.5) return;
      const cx = Math.max(b.x0, Math.min(s.x, b.x1)), cz = Math.max(b.z0, Math.min(s.z, b.z1));
      const d = Math.hypot(cx - s.x, cz - s.z);
      if (d > 1.0) return;
      const facing = ((it.x - s.x) * dirx + (it.z - s.z) * dirz) / dl;
      if (facing < -0.2) return;
      if (d < bd) { bd = d; best = it; }
    });
    return best;
  }

  snapshot() {
    const out = [];
    for (const s of this.staff.values()) out.push([s.id, Math.round(s.x * 100), Math.round(s.y * 100), Math.round(s.z * 100), Math.round(s.ry * 100), (s.mode === 'chase' ? 1 : 0) | (s.anim > 0 ? 2 : 0) | (s.bash ? 4 : 0), Math.round(s.speed * 10)]);
    return out;
  }
}
