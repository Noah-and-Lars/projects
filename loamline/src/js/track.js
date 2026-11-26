// Course geometry: a centreline built from pieces (straights, berms, jumps),
// a height function for the whole world, and the metadata the game needs to
// judge landings (lip, knuckle, sweet spot, flat) and to respawn riders.
//
// Jumps are designed by riding them with the real physics (physics.js): the
// kicker is built, a reference rider rolls up it at the design speed with and
// without a pop, and the landing is placed where those two flights come down.

import { BikeSim, BIKES, emptyInput } from './physics.js';
import { makeNoise2D, fbm, clamp, smoothstep, lerp } from './noise.js';

export const DS = 0.25;           // sample spacing along the trail (m)
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- jumps --

function lineGround(fn, grade) {
  return { height: (x, z) => fn(z) - grade * z };
}

// Ride a 1D profile with the reference bike; return the flight path.
function rideProfile(prof, grade, speed, popAt) {
  const sim = new BikeSim(lineGround(prof, grade), BIKES.trail);
  sim.reset(0, 0, 0.3, 0, speed);
  sim.nearLip = true; // riding a kicker: pops are lip pops
  const inp = emptyInput();
  const dt = 1 / 240;
  let held = false, popped = popAt === null;
  const path = [];
  let tookOff = false;
  for (let i = 0; i < 240 * 6; i++) {
    inp.jumpPressed = false; inp.jumpReleased = false;
    if (!popped) {
      if (!held && sim.pos.z > popAt - 3) { held = true; inp.jumpPressed = false; }
      if (held && sim.pos.z >= popAt - 0.05) { inp.jumpReleased = true; popped = true; held = false; }
    }
    inp.jumpHeld = held;
    // A real rider releases at the lip even if the bike leaves first.
    if (!popped && !sim.grounded && sim.airTime < 0.05 && sim.pos.z > popAt - 0.6) {
      inp.jumpReleased = true; popped = true;
    }
    sim.step(dt, inp);
    if (!sim.grounded) tookOff = true;
    if (tookOff) {
      path.push({ z: sim.pos.z, y: sim.pos.y + grade * sim.pos.z, vz: sim.vel.z, vy: sim.vel.y + grade * sim.vel.z });
      if (sim.pos.y + grade * sim.pos.z < -6) break;
    }
    if (tookOff && sim.grounded) break;
  }
  return path;
}

// Where does a flight path come down through relative height h (descending)?
function crossDown(path, h) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (a.vy < 0 && a.y >= h && b.y < h) {
      const t = (a.y - h) / (a.y - b.y);
      return { z: lerp(a.z, b.z, t), slope: lerp(a.vy / a.vz, b.vy / b.vz, t) };
    }
  }
  return null;
}

// Piecewise profile helper.
class Profile {
  constructor() { this.parts = []; }
  add(x0, x1, fn) { this.parts.push({ x0, x1, fn }); return this; }
  at(x) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (x >= p.x0 && x <= p.x1) return p.fn(x);
    }
    return 0;
  }
}

/**
 * Design one jump. Returns { len, fn(x) (height relative to the sloped base),
 * meta } where meta positions are local x along the piece.
 * opts: kind 'table'|'double'|'step'|'drop'|'gap'|'stepup', speed (m/s),
 *       h (lip height), angle (deg), land (knuckle height), pit (gap depth)
 */
export function designJump(o, grade) {
  const kind = o.kind || 'table';
  const v = o.speed;
  const h = o.h ?? 1.4;
  const run = 3;                     // flat run-in
  const prof = new Profile();
  let lipX, kickStart = run;

  if (kind === 'drop') {
    const up = h / Math.tan(11 * DEG);
    const deck = o.deck ?? 6;
    // Gentle roll-up, flat deck, tiny upturn at the edge.
    prof.add(run, run + up, (x) => {
      const t = (x - run) / up;
      return h * t * t * (3 - 2 * t);
    });
    prof.add(run + up, run + up + deck, () => h);
    lipX = run + up + deck;
  } else {
    const th = (o.angle ?? 28) * DEG;
    const Lk = 2 * h / Math.tan(th);
    prof.add(run, run + Lk, (x) => h * ((x - run) / Lk) ** 2);
    lipX = run + Lk;
  }
  const lipH = prof.at(lipX - 1e-6);

  // Fly it with and without a pop (deck-free profile: ground falls away).
  const flyProf = (x) => (x <= lipX ? prof.at(x) : -50);
  const pathNo = rideProfile(flyProf, grade, v, null);
  const pathPop = rideProfile(flyProf, grade, v, lipX);

  let landH = o.land ?? (kind === 'step' ? h - 0.7 : kind === 'stepup' ? h + 0.8 : kind === 'drop' ? h * 0.85 : h);
  const pit = o.pit ?? (kind === 'gap' ? 3.2 : 0.7);
  const meta = { kind, speed: v, lipX, lipH, run, landH };

  if (kind === 'stepup') {
    const a = crossDown(pathNo, landH + 0.2), b = crossDown(pathPop, landH + 0.2);
    const zLand = a ? a.z : lipX + 6;
    const knuckle = zLand - 1.6;
    const deckLen = Math.max(6, (b ? b.z : zLand + 2) - knuckle + 3);
    const face = 0.45; // steep face run
    const gapStart = lipX + 0.6;
    prof.add(lipX, knuckle, (x) => {
      // lip back side down into a dip, then a steep face up to the knuckle.
      if (x < gapStart) return lerp(lipH, -0.2, (x - lipX) / (gapStart - lipX));
      if (x < knuckle - (landH + 0.2) * face) return -0.2;
      return lerp(-0.2, landH, (x - (knuckle - (landH + 0.2) * face)) / ((landH + 0.2) * face));
    });
    const rollStart = knuckle + deckLen;
    const rollLen = landH / Math.tan(16 * DEG);
    prof.add(knuckle, rollStart, () => landH);
    prof.add(rollStart, rollStart + rollLen, (x) => {
      const t = (x - rollStart) / rollLen;
      return landH * (1 - t * t * (3 - 2 * t));
    });
    meta.knuckleX = knuckle;
    meta.rampEnd = rollStart;
    meta.sweet = [knuckle + 0.2, knuckle + Math.min(deckLen - 1, 4.5)];
    meta.flatX = rollStart + rollLen + 3;
    meta.gap = true;
    meta.len = rollStart + rollLen + 4;
    meta.fn = (x) => prof.at(x);
    return meta;
  }

  // Landing ramp. The knuckle sits just before where a rider who doesn't
  // pop comes down (on tables a little further: not popping clips the deck);
  // the ramp is then made long enough that a full pop at a few percent over
  // the design speed still lands on it, steepening by raising the landing
  // where there's a gap. Everything between is the sweet spot.
  const gapy = kind === 'double' || kind === 'gap' || kind === 'step' || kind === 'drop';
  const pathFast = rideProfile(flyProf, grade, v * 1.05, lipX);
  const minGap = !gapy ? 0.8 : landH < lipH - 0.25 ? 0.5 : 1.6;
  let kn, m, hitB, aK;
  for (let tries = 0; tries < 8; tries++) {
    aK = crossDown(pathNo, landH + 0.12);
    if (!aK) throw new Error(`jump unflyable: ${JSON.stringify(o)}`);
    const popK = crossDown(pathPop, landH) || aK;
    kn = Math.max((gapy ? aK.z - 0.2 : aK.z + (popK.z - aK.z) * 0.3), lipX + minGap);
    hitB = null;
    for (let ang = 42; ang >= 24; ang -= 1) {
      m = Math.tan(ang * DEG);
      hitB = null;
      for (let k = 1; k < pathFast.length; k++) {
        const q = pathFast[k];
        if (q.z < kn) continue;
        const yl = landH - m * (q.z - kn);
        if (q.y <= yl) { hitB = { z: q.z, y: yl }; break; }
      }
      if (hitB && hitB.y >= landH * 0.15) break;
    }
    const apexNo = pathNo.reduce((mx, q) => Math.max(mx, q.y), -Infinity);
    const maxLand = Math.min(kind === 'drop' || kind === 'step' ? lipH - 0.35 : lipH + 0.8, apexNo - 0.35);
    if ((hitB && hitB.y >= landH * 0.15) || !gapy || landH + 0.15 > maxLand) break;
    landH += 0.15;
  }
  meta.landH = landH;
  const hitPop = (() => {
    for (let k = 1; k < pathPop.length; k++) {
      const q = pathPop[k];
      if (q.z >= kn && q.y <= landH - m * (q.z - kn)) return q.z;
    }
    return null;
  })();
  const zb2 = kn + landH / m;   // bottom of the straight ramp
  const Lt = Math.min(4, Math.max(2, (zb2 - kn) * 0.5));
  const Lk = Math.min(1.2, (zb2 - kn) * 0.3);
  const pitY = -pit;
  if (gapy) {
    const back = kind === 'drop' ? 0.25 : 0.9;
    prof.add(lipX, kn, (x) => {
      const yBack = lipH - ((x - lipX) / back) * (lipH - pitY);
      const yFace = landH - ((kn - x) / 0.8) * (landH - pitY);
      return Math.max(pitY, yBack, yFace);
    });
  } else {
    prof.add(lipX, kn, () => landH);
  }
  prof.add(kn, zb2 + Lt / 2, (x) => {
    let y = landH - m * (x - kn);
    const d = x - (kn - Lk / 2);
    if (x < kn + Lk / 2) y = d > 0 ? landH - (m / (2 * Lk)) * d * d : landH;
    if (x > zb2 - Lt / 2) { const e = x - (zb2 + Lt / 2); y = (m / (2 * Lt)) * e * e; }
    return y;
  });
  if (!gapy) {
    prof.add(kn - Lk / 2, kn + Lk / 2, (x) => {
      const d = x - (kn - Lk / 2);
      return landH - (m / (2 * Lk)) * d * d;
    });
  }
  const zNo = Math.max(kn, aK.z + 0.3);
  const zPop = hitPop ?? (hitB ? hitB.z : zb2 - 0.5);
  meta.knuckleX = kn;
  meta.rampEnd = zb2;
  meta.sweet = [Math.max(kn + 0.2, Math.min(zNo, zPop) - 0.5), Math.min(zb2 + 0.8, Math.max(zNo, zPop) + 1.0)];
  meta.flatX = zb2 + Lt / 2 + 1.5;
  meta.gap = gapy;
  meta.pit = gapy ? pit : 0;
  meta.angle = Math.atan(m) / DEG;
  meta.len = zb2 + Lt / 2 + 6;
  meta.fn = (x) => prof.at(x);
  return meta;
}

// -------------------------------------------------------------- course --

export class Track {
  constructor(course) {
    this.course = course;
    this.hw = (course.width ?? 6) / 2;
    this.noise = makeNoise2D(course.seed);
    this.noise2 = makeNoise2D(course.seed + 77);
    this.build();
  }

  build() {
    const c = this.course;
    const cx = [], cz = [], base = [], feat = [], bank = [], yawA = [], kind = [];
    this.features = [];
    this.checkpoints = [];
    let x = 0, z = 0, y = c.startY ?? 0, yaw = c.startYaw ?? 0;
    let s = 0;
    const grades = [];
    const pieceOf = [];

    const emit = (curv, grade, bk, f, k) => {
      cx.push(x); cz.push(z); base.push(y); feat.push(f); bank.push(bk); yawA.push(yaw); kind.push(k);
      grades.push(grade);
      yaw += curv * DS;
      x += Math.sin(yaw) * DS;
      z += Math.cos(yaw) * DS;
      y -= grade * DS;
      s += DS;
    };

    const defGrade = c.grade ?? 0.06;
    for (const p of c.layout) {
      const [type, ...a] = p;
      const s0 = s;
      if (type === 's') {
        const [len, grade = defGrade] = a;
        const n = Math.round(len / DS);
        for (let i = 0; i < n; i++) emit(0, grade, 0, 0, 0);
      } else if (type === 'b' || type === 't') {
        // turn: angle (deg, + = left), radius, grade, bank (deg)
        const [angD, r, grade = defGrade, bankD = type === 'b' ? 28 : 0] = a;
        const A = angD * DEG;
        const L = Math.abs(A) * r / 0.8;
        const n = Math.round(L / DS);
        const kmax = A / (0.8 * L);
        for (let i = 0; i < n; i++) {
          const t = i / n;
          const shape = Math.min(1, t / 0.2, (1 - t) / 0.2);
          const bshape = smoothstep(0, 0.25, t) * (1 - smoothstep(0.75, 1, t));
          emit(kmax * shape, grade, Math.sign(A) * Math.tan(bankD * DEG) * bshape, 0, 0);
        }
        if (type === 'b') this.features.push({ type: 'berm', s0, s1: s, angle: angD });
      } else if (type === 'rollers') {
        const [n, amp = 0.6, wl = 7, grade = defGrade] = a;
        const L = n * wl + 4;
        const m = Math.round(L / DS);
        for (let i = 0; i < m; i++) {
          const lx = i * DS - 2;
          const f = lx > 0 && lx < n * wl ? amp * (1 - Math.cos(2 * Math.PI * lx / wl)) / 2 : 0;
          emit(0, grade, 0, f, 2);
        }
        this.features.push({ type: 'rollers', s0, s1: s, n });
      } else if (type === 'cp') {
        this.checkpoints.push(s);
      } else {
        // jump
        const opt = Object.assign({ kind: type }, a[0] || {});
        const grade = opt.grade ?? Math.min(defGrade, 0.05);
        const j = designJump(opt, grade);
        const n = Math.round(j.len / DS);
        for (let i = 0; i < n; i++) emit(0, grade, 0, j.fn(i * DS), 1);
        this.features.push({
          type: 'jump', kind: j.kind, s0, s1: s, speed: opt.speed, name: opt.name,
          lipS: s0 + j.lipX, knuckleS: s0 + j.knuckleX, rampEndS: s0 + j.rampEnd,
          sweet: [s0 + j.sweet[0], s0 + j.sweet[1]], flatS: s0 + j.flatX, gap: j.gap,
          lipH: j.lipH, landH: j.landH, pit: j.pit || 0,
        });
      }
      pieceOf.push([s0, s]);
    }
    // Run-out after the finish.
    this.finishS = s;
    for (let i = 0; i < 60 / DS; i++) emit(0, 0.02, 0, 0, 0);

    // Smooth the base slope (outside jumps) to avoid kinks between pieces.
    const N = cx.length;
    const g2 = new Float32Array(N);
    const W = 24;
    for (let i = 0; i < N; i++) {
      if (kind[i] === 1) { g2[i] = grades[i]; continue; }
      let sum = 0, cnt = 0;
      for (let k = -W; k <= W; k++) {
        const j = clamp(i + k, 0, N - 1);
        sum += grades[j]; cnt++;
      }
      g2[i] = sum / cnt;
    }
    // Re-integrate base heights; positions stay (heading unchanged).
    const by = new Float32Array(N);
    by[0] = c.startY ?? 0;
    for (let i = 1; i < N; i++) by[i] = by[i - 1] - g2[i - 1] * DS;
    // Smooth bank as well.
    const bk2 = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let sum = 0, cnt = 0;
      for (let k = -12; k <= 12; k++) { sum += bank[clamp(i + k, 0, N - 1)]; cnt++; }
      bk2[i] = sum / cnt;
    }

    this.N = N;
    this.cx = Float32Array.from(cx);
    this.cz = Float32Array.from(cz);
    this.base = by;
    this.feat = Float32Array.from(feat);
    this.bank = bk2;
    this.yaw = Float32Array.from(yawA);
    this.kind = Uint8Array.from(kind);
    this.length = (N - 1) * DS;

    // Side terrain shape: a gentle hillside tilt that wanders along s.
    this.cross = new Float32Array(N);
    for (let i = 0; i < N; i++) this.cross[i] = 0.28 * this.noise(i * DS / 140, 3.7) + (c.cross ?? 0);

    // Decimated samples for global lookups.
    this.coarseStep = 32; // every 8 m
    this.coarse = [];
    for (let i = 0; i < N; i += this.coarseStep) this.coarse.push(i);

    // Bounds.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, this.cx[i]); maxX = Math.max(maxX, this.cx[i]);
      minZ = Math.min(minZ, this.cz[i]); maxZ = Math.max(maxZ, this.cz[i]);
    }
    this.bounds = { minX, maxX, minZ, maxZ };

    if (!this.checkpoints.length) {
      for (let k = 1; k <= 3; k++) this.checkpoints.push(this.finishS * k / 4);
    }
    this.startS = 8;
    this.hint = 0;
  }

  // Nearest sample index to (x, z), searching locally from `hint`.
  nearestIndex(x, z, hint) {
    const cx = this.cx, cz = this.cz, N = this.N;
    let i = clamp(hint | 0, 0, N - 1);
    const d2 = (k) => { const dx = cx[k] - x, dz = cz[k] - z; return dx * dx + dz * dz; };
    let best = d2(i);
    for (const step of [64, 16, 4, 1]) {
      let moved = true;
      while (moved) {
        moved = false;
        if (i + step < N) { const d = d2(i + step); if (d < best) { best = d; i += step; moved = true; continue; } }
        if (i - step >= 0) { const d = d2(i - step); if (d < best) { best = d; i -= step; moved = true; } }
      }
    }
    return i;
  }

  globalNearest(x, z) {
    let bi = 0, bd = Infinity;
    for (const i of this.coarse) {
      const dx = this.cx[i] - x, dz = this.cz[i] - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; bi = i; }
    }
    return this.nearestIndex(x, z, bi);
  }

  // Project a world point onto the trail: s, d (+ = right), and interpolated data.
  project(x, z, hint = this.hint, out = {}) {
    const i = hint < 0 ? this.globalNearest(x, z) : this.nearestIndex(x, z, hint);
    const yaw = this.yaw[i];
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const dx = x - this.cx[i], dz = z - this.cz[i];
    const along = dx * fx + dz * fz;
    const d = dx * -fz + dz * fx;
    let fi = i + along / DS;
    fi = clamp(fi, 0, this.N - 1.001);
    const i0 = Math.floor(fi), t = fi - i0;
    out.i = i;
    out.s = fi * DS;
    out.d = d;
    out.base = this.base[i0] + (this.base[i0 + 1] - this.base[i0]) * t;
    out.feat = this.feat[i0] + (this.feat[i0 + 1] - this.feat[i0]) * t;
    out.bank = this.bank[i0] + (this.bank[i0 + 1] - this.bank[i0]) * t;
    out.cross = this.cross[i0];
    out.yaw = yaw;
    return out;
  }

  heightFromProj(x, z, p) {
    const hw = this.hw;
    const d = p.d, ad = Math.abs(d);
    if (ad <= hw) return p.base + p.feat + p.bank * d;
    const e = ad - hw;
    const sg = Math.sign(d);
    const f = p.feat;
    const fs = f > 0 ? f * (1 - smoothstep(0, 1.1 * f + 0.9, e)) : f * (1 - smoothstep(0, 1.2, e));
    const bankEdge = p.bank * sg * hw * (1 - smoothstep(0, 5, e));
    const rough = this.noise(x * 0.35, z * 0.35) * 0.25 * smoothstep(0, 4, e)
      + this.noise2(x * 0.08, z * 0.08) * 1.6 * smoothstep(2, 20, e);
    const side = p.cross * (e) * smoothstep(0, 14, e) + 0.06 * e * smoothstep(0, 10, e);
    let h = p.base + fs + bankEdge + rough + side;
    const tFar = smoothstep(14, 70, e);
    if (tFar > 0) {
      const far = this.farHeight(x, z, e);
      h = h + (far - h) * tFar;
    }
    return h;
  }

  farHeight(x, z, e) {
    // Inverse-distance blend of the trail's base heights keeps the valley
    // continuous where the trail doubles back; mountains rise away from it.
    let sw = 0, sh = 0;
    for (const i of this.coarse) {
      const dx = this.cx[i] - x, dz = this.cz[i] - z;
      const dd = dx * dx + dz * dz + 100;
      const w = 1 / (dd * dd);
      sw += w; sh += w * this.base[i];
    }
    const b = sh / sw;
    const amp = this.course.mountains ?? 40;
    const m = fbm(this.noise2, x * 0.006, z * 0.006, 4);
    const ridge = 1 - Math.abs(fbm(this.noise, x * 0.004 + 9, z * 0.004, 3));
    return b + e * (this.course.wall ?? 0.22) + (m * 0.6 + ridge * 0.7) * amp * smoothstep(20, 220, e);
  }

  height(x, z, hint = this.hint) {
    const p = this.project(x, z, hint, this._tmp || (this._tmp = {}));
    return this.heightFromProj(x, z, p);
  }

  // Ground interface for the physics, bound to a moving hint.
  groundFor(state) {
    const self = this;
    const tmp = {};
    return {
      height(x, z) {
        const p = self.project(x, z, state.hint, tmp);
        return self.heightFromProj(x, z, p);
      },
    };
  }

  // World position/heading at s on the centreline (d offset).
  pointAt(s, d = 0) {
    const fi = clamp(s / DS, 0, this.N - 1.001);
    const i0 = Math.floor(fi), t = fi - i0;
    const yaw = this.yaw[i0];
    const x = lerp(this.cx[i0], this.cx[i0 + 1], t) + (-Math.cos(yaw)) * d;
    const z = lerp(this.cz[i0], this.cz[i0 + 1], t) + Math.sin(yaw) * d;
    return { x, z, yaw, i: i0 };
  }

  // Ballistic look-ahead: where (and onto what slope) will a rider in the
  // air come down? Used by the air assist.
  predictLanding(pos, vel, hint) {
    let x = pos.x, y = pos.y, z = pos.z, vx = vel.x, vy = vel.y, vz = vel.z;
    const tmp = {};
    let h = hint;
    for (let i = 0; i < 80; i++) {
      const dt = 0.04;
      vy -= 9.81 * dt;
      x += vx * dt; y += vy * dt; z += vz * dt;
      this.project(x, z, h, tmp); h = tmp.i;
      const g = this.heightFromProj(x, z, tmp);
      if (y <= g) {
        const hs = Math.hypot(vx, vz) || 1;
        const ex = vx / hs * 0.6, ez = vz / hs * 0.6;
        const ga = this.height(x - ex, z - ez, h), gb = this.height(x + ex, z + ez, h);
        return { s: tmp.s, slope: (gb - ga) / 1.2, t: i * dt };
      }
    }
    return null;
  }

  featureAt(s) {
    for (const f of this.features) if (s >= f.s0 && s < f.s1) return f;
    return null;
  }

  jumps() { return this.features.filter((f) => f.type === 'jump'); }

  // Next jump ahead of s (for the speed hint and the assist).
  nextJump(s, within = 60) {
    for (const f of this.features) {
      if (f.type !== 'jump') continue;
      if (f.lipS > s - 1 && f.s0 - s < within) return f;
    }
    return null;
  }

  // Judge where a landing at s fell on the jump the rider left from.
  judge(jump, s) {
    if (!jump) return null;
    if (s < jump.knuckleS - 0.3) {
      if (jump.gap) return 'casedGap';
      return s < jump.knuckleS - 2.5 ? 'casedHeavy' : 'cased';
    }
    if (s >= jump.sweet[0] && s <= jump.sweet[1]) return 'sweet';
    if (s > jump.flatS) return 'flat';
    return 'ramp';
  }
}
