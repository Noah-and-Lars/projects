// The staff. Only the host runs this; everybody else draws the snapshots the
// host sends (net.js).
//
// Day: they wander slowly and ignore you.
// Night: the same, until they see you (line of sight), hear you sprint, or
// hear a whistle. Then they chase at just under sprinting speed, climbing up
// to about a metre at a time and scaling shelving and bookcases, and punch
// you when they're close. Break their line of sight and they lose you after a
// few seconds. A shove knocks one down for a moment.
// Crimson Night: more of them, twice as fast, they climb and jump higher and
// hit faster (but softer). Fog Day: they hunt in daylight, slowly, and hit
// very hard; shoving doesn't work.
//
// Paths are found on a 0.5 m grid of standing surfaces (the floor and the
// tops of things), so a member of staff can walk up a staircase of furniture
// you built, but not up a single wardrobe.
import { moveBody, bodyFits } from './physics.js';
import { TYPES } from './furniture.js';
import { CEIL } from './world.js';

const CELL = 0.5, MAX_EXPAND = 3200, RADIUS = 0.28;
// Headroom each height class needs (tall, average, short, very short).
const NEED = [2.2, 1.95, 1.6, 1.25];

let nextId = 1, nextManager = 1000000; // managers get ids from MANAGER_ID up
// What a member of staff looks like follows from its id (models.js reads the same).
export const MANAGER_ID = 1000000;
export function staffLook(id) {
  if (id >= MANAGER_ID) return { size: 0, width: 1, skin: 0, heightScale: 1.2, widthScale: 1.05, speedScale: 0.6, manager: true };
  let h = (id * 2654435761) >>> 0;
  const size = h % 4; h = (h / 4) | 0;
  const width = h % 4; h = (h / 4) | 0;
  const skin = h % 6;
  const heightScale = [1.12, 1.0, 0.82, 0.64][size];
  const widthScale = [0.85, 1.0, 1.2, 1.4][width];
  return { size, width, skin, heightScale, widthScale, speedScale: 1.22 - 0.28 * heightScale - 0.08 * (widthScale - 1) };
}

function params(env) {
  const ev = env.event;
  if (ev === 'crimson') return { climb: 2.2, chase: 11.5, sight: 45, hear: 22, dmg: [5, 8], cd: 0.55, stun: 1.2, per: 1.7, push: true };
  if (ev === 'fog' && env.hostile) return { climb: 1.0, chase: 2.2, sight: 11, hear: 8, dmg: [38, 45], cd: 1.6, stun: 0, per: 1, push: false };
  return { climb: 1.15, chase: 6.4, sight: 32, hear: 14, dmg: [7, 13], cd: 1.0, stun: 2.6, per: 1, push: true };
}

export class StaffSim {
  constructor(world) {
    this.world = world;
    this.staff = new Map();
    this.cache = new Map();
    this.cacheVer = -1;
    this.spawnT = 0;
    this.noises = []; // { x, z, r, t } whistles and the like
  }

  clear() { this.staff.clear(); }

  // Standing surfaces in a grid cell: heights you could stand at with 1.9 m
  // of headroom. climb = the surface is the top of something climbable.
  surfaces(cx, cz, hc = 1) {
    if (this.cacheVer !== this.world.version) { this.cache.clear(); this.cacheVer = this.world.version; }
    const k = (cx * 100003 + cz) * 4 + hc, BODY_H = NEED[hc];
    let v = this.cache.get(k);
    if (v === undefined) {
      const x = (cx + 0.5) * CELL, z = (cz + 0.5) * CELL, boxes = [];
      this.world.forBoxes(x - RADIUS, z - RADIUS, x + RADIUS, z + RADIUS, (o) => boxes.push(o));
      v = [];
      const cand = [{ h: 0, climb: false }];
      for (const o of boxes) if (o.x0 <= x && o.x1 >= x && o.z0 <= z && o.z1 >= z) cand.push({ h: o.y1, climb: !!o.climb });
      for (const c of cand) {
        if (c.h + BODY_H > CEIL + 0.01 && c.h > 0) continue;
        let ok = true;
        // Something right overhead, or a wall too tall to climb beside you,
        // rules the spot out. Something lower beside you is just a step.
        for (const o of boxes) {
          if (!(o.y0 < c.h + BODY_H && o.y1 > c.h + 0.05)) continue;
          const over = o.x0 <= x && o.x1 >= x && o.z0 <= z && o.z1 >= z;
          if (over || o.y1 > c.h + 2.3) { ok = false; break; }
        }
        if (ok && !v.some((s) => Math.abs(s.h - c.h) < 0.05)) v.push(c);
      }
      v.sort((a, b) => a.h - b.h);
      this.cache.set(k, v);
      if (this.cache.size > 120000) this.cache.clear();
    }
    return v;
  }

  // The surface index in a cell nearest to (and not above) height y.
  surfaceAt(cx, cz, y, hc) {
    const s = this.surfaces(cx, cz, hc);
    let best = -1;
    for (let i = 0; i < s.length; i++) if (s[i].h <= y + 0.3) best = i;
    return best;
  }

  // Breadth-first search over (cell, surface). Returns waypoints [x, z, h]
  // to the target, or to the reachable spot nearest it.
  path(sx, sy, sz, tx, ty, tz, climb, hc = 1) {
    const s0 = Math.floor(sx / CELL), s1 = Math.floor(sz / CELL), t0 = Math.floor(tx / CELL), t1 = Math.floor(tz / CELL);
    let si = this.surfaceAt(s0, s1, sy, hc);
    if (si < 0) si = 0;
    const ti = this.surfaceAt(t0, t1, ty, hc);
    const key = (a, b, i) => (a * 100003 + b) * 8 + i;
    const prev = new Map(), q = [[s0, s1, si]];
    prev.set(key(s0, s1, si), null);
    const th = ti >= 0 ? this.surfaces(t0, t1, hc)[ti].h : ty;
    const score = (a, b, h) => Math.hypot(t0 - a, t1 - b) * CELL + Math.abs(th - h) * 1.5;
    let best = [s0, s1, si], bestD = Infinity, n = 0, head = 0, found = false;
    const lim = 40;
    while (head < q.length && n < MAX_EXPAND) {
      const [a, b, i] = q[head++]; n++;
      const ss = this.surfaces(a, b, hc), h = ss[i] ? ss[i].h : 0;
      const d = score(a, b, h);
      if (d < bestD) { bestD = d; best = [a, b, i]; }
      if (a === t0 && b === t1 && i === ti) { found = true; break; }
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const na = a + da, nb = b + db;
        if (Math.abs(na - s0) > lim || Math.abs(nb - s1) > lim) continue;
        if (da && db && (!this.surfaces(a + da, b, hc).length || !this.surfaces(a, b + db, hc).length)) continue;
        const ns = this.surfaces(na, nb, hc);
        for (let j = 0; j < ns.length; j++) {
          const up = ns[j].h - h;
          if (up > climb + 0.01 && !(ns[j].climb && climb > 0.5)) continue; // too high (unless it's shelving)
          if (up < -6) continue;
          const k = key(na, nb, j);
          if (prev.has(k)) continue;
          prev.set(k, [a, b, i]); q.push([na, nb, j]);
        }
      }
    }
    const pts = [];
    let c = best;
    while (c) { const ss = this.surfaces(c[0], c[1], hc); pts.push([(c[0] + 0.5) * CELL, (c[1] + 0.5) * CELL, ss[c[2]] ? ss[c[2]].h : 0]); c = prev.get(key(c[0], c[1], c[2])); }
    pts.reverse(); pts.shift();
    return { pts, reached: found, gap: bestD };
  }

  // Can (x0, y0, z0) see (x1, y1, z1)? A ray against the solid boxes.
  canSee(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz);
    let clear = true;
    this.world.forBoxes(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), (b) => {
      if (!clear) return;
      let t0 = 0.02, t1 = 0.98;
      const o = [x0, y0, z0], d = [dx, dy, dz], lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return; continue; }
        let ta = (lo[a] - o[a]) / d[a], tb = (hi[a] - o[a]) / d[a];
        if (ta > tb) { const q = ta; ta = tb; tb = q; }
        if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
        if (t0 > t1) return;
      }
      clear = false;
    });
    return clear && len > 0;
  }

  spawnNear(p, manager = false) {
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 16;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (!bodyFits(this.world, x, 0, z, 0.32, 2.4)) continue;
      const id = manager ? nextManager++ : nextId++, look = staffLook(id);
      this.staff.set(id, {
        id, look, x, y: 0, z, ry: Math.random() * 6.28, vy: 0, radius: RADIUS * look.widthScale, height: 2.0 * look.heightScale, step: 0.36, gravity: 20, onGround: true,
        mode: 'wander', goal: null, path: [], pathT: 0, waitT: Math.random() * 3, cd: 0, target: null, lastSeen: 0, lastPos: null,
        senseT: Math.random() * 0.3, stunT: 0, kx: 0, kz: 0, stuckT: 0, anim: 0, speed: 0, climbing: false, canClimb: false,
      });
      return;
    }
  }

  // A shove from a player. Returns 'ok', 'immune' (fog) or ''.
  push(id, fromX, fromZ, env) {
    const s = this.staff.get(id);
    if (!s) return '';
    const P = params(env);
    if (!env.hostile) return '';
    if (!P.push || s.look.manager) return 'immune';
    const dx = s.x - fromX, dz = s.z - fromZ, d = Math.hypot(dx, dz) || 1;
    if (d > 3.2) return '';
    s.kx = dx / d * 7; s.kz = dz / d * 7; s.vy = 3.5; s.onGround = false;
    s.stunT = P.stun;
    s.path = []; s.pathT = 0;
    return 'ok';
  }

  noise(x, z, r) { this.noises.push({ x, z, r, t: 6 }); }

  update(dt, players, env, day) {
    const out = { hits: [] };
    const alive = players.filter((p) => p.alive);
    const P = params(env);
    const night = env.hostile;
    const perPlayer = night ? Math.round(Math.min(3 + Math.floor(day / 2), 12) * P.per) : 2;
    for (const n of this.noises) n.t -= dt;
    this.noises = this.noises.filter((n) => n.t > 0);

    // Spawn and despawn around the players.
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.staff.size < 50) {
      this.spawnT = night ? 0.8 : 3;
      for (const p of alive) {
        let near = 0;
        for (const s of this.staff.values()) if (Math.hypot(s.x - p.x, s.z - p.z) < 42) near++;
        if (near < perPlayer) this.spawnNear(p);
      }
    }
    // On a Crimson Night the Floor Manager walks the aisles: one near each shopper.
    if (env.event === 'crimson' && night) {
      this.mgrT = (this.mgrT || 0) - dt;
      if (this.mgrT <= 0) {
        this.mgrT = 5;
        for (const p of alive) {
          let has = false;
          for (const s of this.staff.values()) if (s.look.manager && Math.hypot(s.x - p.x, s.z - p.z) < 55) has = true;
          if (!has) this.spawnNear(p, true);
        }
      }
    } else for (const s of this.staff.values()) if (s.look.manager) this.staff.delete(s.id);
    for (const s of this.staff.values()) {
      let nearest = Infinity;
      for (const p of players) nearest = Math.min(nearest, Math.hypot(s.x - p.x, s.z - p.z));
      if (nearest > 65) this.staff.delete(s.id);
    }
    if (!night) {
      let extra = this.staff.size - Math.max(2, alive.length * perPlayer);
      for (const s of this.staff.values()) { if (extra <= 0) break; let n = Infinity; for (const p of alive) n = Math.min(n, Math.hypot(s.x - p.x, s.z - p.z)); if (n > 24) { this.staff.delete(s.id); extra--; } }
    }

    // At most a few path searches per update, so a crowd re-planning at once
    // can't stall a frame; the rest wait a frame and follow their old path.
    let budget = 1;
    for (const s of this.staff.values()) {
      s.cd -= dt; s.anim = Math.max(0, s.anim - dt);
      const climb = night ? P.climb : 0.36;
      s.step = climb; s.canClimb = night && P.climb > 0.5;
      let mx = 0, mz = 0, speed = 0;

      if (s.stunT > 0) { // knocked down
        s.stunT -= dt;
        moveBody(this.world, s, s.kx * dt, s.kz * dt, dt);
        s.kx *= Math.max(0, 1 - dt * 4); s.kz *= Math.max(0, 1 - dt * 4);
        s.speed = 0; s.target = null; s.mode = 'stunned';
        continue;
      }

      // Senses (a few times a second).
      s.senseT -= dt;
      if (night && s.senseT <= 0) {
        s.senseT = 0.25;
        let tgt = null, td = Infinity;
        const sight = s.look.manager ? 60 : P.sight;
        for (const p of alive) {
          const d = Math.hypot(p.x - s.x, p.z - s.z);
          if (d > sight) continue;
          const heard = p.sprinting && d < P.hear;
          const seen = d < (p.crouch ? sight * 0.6 : sight) && this.canSee(s.x, s.y + 1.6 * s.look.heightScale, s.z, p.x, p.y + (p.crouch ? 0.8 : 1.5), p.z);
          if ((seen || heard || (s.target && s.target.id === p.id && d < 3)) && d < td) { td = d; tgt = p; }
        }
        if (tgt) { s.target = tgt; s.lastSeen = 0; s.lastPos = [tgt.x, tgt.y, tgt.z]; s.mode = 'chase'; }
        else if (!s.lastPos) for (const n of this.noises) if (Math.hypot(n.x - s.x, n.z - s.z) < n.r) { s.lastPos = [n.x, 0, n.z]; s.mode = 'search'; s.pathT = 0; break; }
      }
      if (!night) { s.target = null; s.lastPos = null; s.mode = 'wander'; }
      if (s.target) {
        s.lastSeen += dt;
        const cur = alive.find((p) => p.id === s.target.id);
        if (!cur || s.lastSeen > 5) { s.target = null; s.mode = s.lastPos ? 'search' : 'wander'; }
        else s.target = cur;
      }

      const goTo = (gx, gy, gz, spd) => {
        s.pathT -= dt;
        if ((s.pathT <= 0 || !s.goalPt || Math.hypot(s.goalPt[0] - gx, s.goalPt[2] - gz) > 1.2) && budget-- > 0) {
          s.pathT = 0.45 + Math.random() * 0.3;
          s.goalPt = [gx, gy, gz];
          const r = this.path(s.x, s.y, s.z, gx, gy, gz, climb, s.look.size);
          s.path = r.pts; s.reached = r.reached;
        }
        if (s.path.length) {
          const [wx, wz] = s.path[0];
          const dx = wx - s.x, dz = wz - s.z, d = Math.hypot(dx, dz);
          if (d < 0.3) s.path.shift();
          else { mx = dx / d; mz = dz / d; speed = spd; }
        } else if (s.reached) {
          const ex = gx - s.x, ez = gz - s.z, e = Math.hypot(ex, ez);
          if (e > 0.6) { mx = ex / e; mz = ez / e; speed = spd; }
        }
      };

      const chase = P.chase * s.look.speedScale;
      if (s.mode === 'chase' && s.target) {
        const t = s.target, d = Math.hypot(t.x - s.x, t.z - s.z), dy = t.y - s.y;
        if (d < 1.2 && dy < 1.6 && dy > -1.2) {
          s.ry = Math.atan2(t.x - s.x, t.z - s.z);
          if (s.cd <= 0) {
            s.cd = s.look.manager ? 1.4 : P.cd; s.anim = 0.4;
            out.hits.push({ to: t.id, d: s.look.manager ? 22 + Math.round(Math.random() * 6) : Math.round(P.dmg[0] + Math.random() * (P.dmg[1] - P.dmg[0])) });
          }
        } else goTo(t.x, t.y, t.z, chase);
      } else if (s.mode === 'search' && s.lastPos) {
        goTo(s.lastPos[0], s.lastPos[1], s.lastPos[2], chase * 0.7);
        if (Math.hypot(s.lastPos[0] - s.x, s.lastPos[2] - s.z) < 1.2 || (!s.path.length && !speed)) { s.lastPos = null; s.mode = 'wander'; s.waitT = 1 + Math.random() * 2; }
      } else {
        s.mode = 'wander';
        if (s.waitT > 0) s.waitT -= dt;
        else {
          if (!s.goal && budget-- > 0) {
            const a = Math.random() * 6.28, d = 3 + Math.random() * 9;
            s.goal = [s.x + Math.cos(a) * d, 0, s.z + Math.sin(a) * d];
            s.path = this.path(s.x, s.y, s.z, s.goal[0], 0, s.goal[2], 0.36, s.look.size).pts;
          }
          if (s.path.length) {
            const [wx, wz] = s.path[0];
            const dx = wx - s.x, dz = wz - s.z, d = Math.hypot(dx, dz);
            if (d < 0.3) s.path.shift(); else { mx = dx / d; mz = dz / d; speed = (night ? 1.7 : 1.25) * s.look.speedScale; }
          } else if (s.goal) { s.goal = null; s.waitT = 2 + Math.random() * 5; }
        }
      }
      // keep apart from other staff
      for (const o of this.staff.values()) {
        if (o === s) continue;
        const dx = s.x - o.x, dz = s.z - o.z, d = Math.hypot(dx, dz);
        if (d < 0.55 && d > 0.001 && Math.abs(s.y - o.y) < 1.5) { mx += dx / d * 0.5; mz += dz / d * 0.5; }
      }
      if (speed > 0) {
        const want = Math.atan2(mx, mz);
        s.ry += Math.atan2(Math.sin(want - s.ry), Math.cos(want - s.ry)) * Math.min(1, dt * 10);
      }
      const ox = s.x, oz = s.z, oy = s.y;
      moveBody(this.world, s, mx * speed * dt, mz * speed * dt, dt);
      s.speed = Math.hypot(s.x - ox, s.z - oz) / Math.max(dt, 1e-3);
      s.rising = s.y - oy > 0.02 || s.climbing;
      if (speed > 0 && s.speed < 0.3 && !s.climbing) { s.stuckT += dt; if (s.stuckT > 1.5) { s.stuckT = 0; s.pathT = 0; s.path = []; s.goal = null; } }
      else s.stuckT = 0;
    }
    return out;
  }

  // [id, x, y, z, ry, flags, speed, targetId] — flags: 1 hunting, 2 punching, 4 knocked down, 8 climbing
  snapshot() {
    const out = [];
    for (const s of this.staff.values()) {
      const f = (s.mode === 'chase' || s.mode === 'search' ? 1 : 0) | (s.anim > 0 ? 2 : 0) | (s.stunT > 0 ? 4 : 0) | (s.rising ? 8 : 0);
      out.push([s.id, Math.round(s.x * 100), Math.round(s.y * 100), Math.round(s.z * 100), Math.round(s.ry * 100), f, Math.round(s.speed * 10), s.mode === 'chase' && s.target ? s.target.id : 0]);
    }
    return out;
  }
}
