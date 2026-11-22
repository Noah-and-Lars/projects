// A piece moving on its own after you let go of it in mid-air or throw it: a
// rigid box with gravity that tumbles, bounces and slides, and collides with
// the floor, walls, pillars, racks and other furniture. When it has come to
// rest it's handed back to the world (unanchored) in whatever pose it ended up.
//
// The box is the piece's own size. Collisions are found by testing points on
// its surface (corners, edge middles, face middles, more on long sides)
// against the world's boxes, and each contact gets an impulse with
// restitution and friction, so a chair dropped on one leg corner tips over and
// a plank thrown at a wall bounces off it and clatters down.
import * as THREE from 'three';

const G = 20;             // the same gravity as throws and jumps
const BOUNCE = 0.22, FRICTION = 0.55, SLOP = 0.004;
const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _b2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix3();

// w, h, d: the piece's size; q: its orientation; c: the centre of the box.
export function makeBody(w, h, d, c, q, vel, spin) {
  const he = new THREE.Vector3(w / 2, h / 2, d / 2);
  // sample points over the surface, in the box's own space
  const pts = [];
  const steps = (s) => Math.max(1, Math.min(10, Math.round(s / 0.12)));
  const nx = steps(w), ny = steps(h), nz = steps(d);
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) for (let k = 0; k <= nz; k++) {
    const onX = i === 0 || i === nx, onY = j === 0 || j === ny, onZ = k === 0 || k === nz;
    if (!(onX || onY || onZ)) continue; // surface only
    pts.push(new THREE.Vector3((i / nx * 2 - 1) * he.x, (j / ny * 2 - 1) * he.y, (k / nz * 2 - 1) * he.z));
  }
  // a solid box's inverse inertia (mass 1), in its own space
  const ix = 12 / (h * h + d * d), iy = 12 / (w * w + d * d), iz = 12 / (w * w + h * h);
  return {
    he, pts, inv: new THREE.Vector3(ix, iy, iz),
    p: c.clone(), q: q.clone(), v: vel.clone(), w: spin.clone(),
    still: 0, age: 0, done: false, hits: 0, lastHit: 0,
  };
}

// world inverse inertia times a vector
function invI(b, x, out) {
  _q.copy(b.q).invert();
  out.copy(x).applyQuaternion(_q);
  out.set(out.x * b.inv.x, out.y * b.inv.y, out.z * b.inv.z).applyQuaternion(b.q);
  return out;
}

// Where a world point is inside a box: the shortest way out (normal, depth).
function pushOut(pt, o, n) {
  const dx0 = pt.x - o.x0, dx1 = o.x1 - pt.x, dy0 = pt.y - o.y0, dy1 = o.y1 - pt.y, dz0 = pt.z - o.z0, dz1 = o.z1 - pt.z;
  if (dx0 <= 0 || dx1 <= 0 || dy0 <= 0 || dy1 <= 0 || dz0 <= 0 || dz1 <= 0) return 0;
  // prefer going up out of things: you land on tops far more than you hit their sides
  let d = dy1 * 0.7, ax = 3;
  if (dx0 < d) { d = dx0; ax = 0; } if (dx1 < d) { d = dx1; ax = 1; }
  if (dz0 < d) { d = dz0; ax = 4; } if (dz1 < d) { d = dz1; ax = 5; }
  if (dy0 < d) { d = dy0; ax = 2; }
  if (ax === 3) d = dy1;
  n.set(ax === 0 ? -1 : ax === 1 ? 1 : 0, ax === 2 ? -1 : ax === 3 ? 1 : 0, ax === 4 ? -1 : ax === 5 ? 1 : 0);
  return d;
}

// Advance a body by dt. boxes: the solid boxes near it (static parts and
// furniture), gathered once a frame. Returns the strongest impact speed this
// step (for a sound), or 0.
export function stepBody(b, dt, boxes, ceil) {
  let impact = 0;
  const speed = b.v.length() + b.w.length() * Math.max(b.he.x, b.he.y, b.he.z);
  const n = Math.min(12, Math.max(2, Math.ceil(speed * dt / 0.035)));
  const h = dt / n;
  for (let s = 0; s < n; s++) {
    b.v.y -= G * h;
    b.p.addScaledVector(b.v, h);
    // integrate the orientation
    const wl = b.w.length();
    if (wl > 1e-6) { _q.setFromAxisAngle(_a.copy(b.w).divideScalar(wl), wl * h); b.q.premultiply(_q).normalize(); }
    // contacts: find them all, then solve them together (a few rounds of
    // impulses, each contact's total kept pushing, never pulling), so a box
    // landing flat on four corners lands flat instead of spinning off one
    const cs = [];
    let deepest = 0; const deepN = _b.set(0, 0, 0);
    for (const lp of b.pts) {
      const wp = _v.copy(lp).applyQuaternion(b.q).add(b.p);
      let depth = 0;
      if (wp.y < 0) { depth = -wp.y; _n.set(0, 1, 0); }
      else if (wp.y > ceil) { depth = wp.y - ceil; _n.set(0, -1, 0); }
      else {
        for (const o of boxes) {
          if (wp.x <= o.x0 || wp.x >= o.x1 || wp.z <= o.z0 || wp.z >= o.z1 || wp.y <= o.y0 || wp.y >= o.y1) continue;
          const dd = pushOut(wp, o, _t);
          if (dd > depth) { depth = dd; _n.copy(_t); }
        }
      }
      if (depth <= 0) continue;
      const r = wp.clone().sub(b.p), n = _n.clone();
      const rn = invI(b, r.clone().cross(n), new THREE.Vector3());
      const vn0 = _a.copy(b.w).cross(r).add(b.v).dot(n);
      cs.push({ r, n, k: 1 + rn.cross(r).dot(n), vn0, acc: 0, ft: new THREE.Vector3() });
      if (-vn0 > impact) impact = -vn0;
      if (depth > deepest) { deepest = depth; deepN.copy(n); }
    }
    const touching = cs.length > 0;
    for (let it = 0; it < 10 && touching; it++) {
      for (const c of cs) {
        const vp = _a.copy(b.w).cross(c.r).add(b.v);
        const vn = vp.dot(c.n);
        const target = c.vn0 < -1.5 ? -BOUNCE * c.vn0 : 0; // slow contacts don't bounce: it settles instead of buzzing
        let j = (target - vn) / c.k;
        const old = c.acc; c.acc = Math.max(0, old + j); j = c.acc - old;
        if (j !== 0) { b.v.addScaledVector(c.n, j); b.w.add(invI(b, _t.copy(c.r).cross(c.n).multiplyScalar(j), _t)); }
        // friction against the sliding, up to FRICTION times the push
        const vp2 = _a.copy(b.w).cross(c.r).add(b.v);
        const vt = vp2.addScaledVector(c.n, -vp2.dot(c.n));
        const vtl = vt.length();
        if (vtl > 1e-6) {
          // the total friction at this contact is a vector in the contact plane, kept within FRICTION x the push
          const rt = invI(b, _t.copy(c.r).cross(_r.copy(vt).divideScalar(vtl)), _t);
          const kt = 1 + rt.cross(c.r).dot(_r);
          const old = _b2.copy(c.ft);
          c.ft.addScaledVector(vt, -1 / kt);
          const lim = FRICTION * c.acc, fl = c.ft.length();
          if (fl > lim) c.ft.multiplyScalar(lim / fl);
          const d = old.subVectors(c.ft, old);
          b.v.add(d); b.w.add(invI(b, _t.copy(c.r).cross(d), _t));
        }
      }
    }
    if (deepest > SLOP) b.p.addScaledVector(deepN, (deepest - SLOP) * 0.6);
    // air and contact drag
    b.w.multiplyScalar(touching ? Math.exp(-h * 2.2) : Math.exp(-h * 0.15));
    if (touching) b.v.x *= Math.exp(-h * 1.2), b.v.z *= Math.exp(-h * 1.2);
    b.touching = touching;
  }
  b.age += dt;
  const slow = b.v.length() < 0.12 && b.w.length() < 0.25;
  b.still = slow && b.touching ? b.still + dt : 0;
  if (b.still > 0.25 || b.age > 4) b.done = true;
  return impact;
}

// The piece's pose for the world: x/z centre and base of its bounds, and its
// orientation (nearly square angles snapped square, so a box that landed flat
// stacks and collides as one box).
export function bodyPose(b) {
  _m.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(b.q));
  const e = _m.elements;
  if (e.every((x) => Math.abs(x) < 0.035 || Math.abs(Math.abs(x) - 1) < 0.035)) {
    const r = e.map((x) => (Math.abs(x) < 0.5 ? 0 : Math.sign(x)));
    const m4 = new THREE.Matrix4().set(r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, 0, 0, 0, 1);
    b.q.setFromRotationMatrix(m4).normalize();
  }
  let lo = Infinity;
  for (let i = 0; i < 8; i++) {
    const y = _v.set(i & 1 ? b.he.x : -b.he.x, i & 2 ? b.he.y : -b.he.y, i & 4 ? b.he.z : -b.he.z).applyQuaternion(b.q).y;
    if (y < lo) lo = y;
  }
  return { x: b.p.x, y: Math.max(0, b.p.y + lo), z: b.p.z, o: [b.q.x, b.q.y, b.q.z, b.q.w] };
}

// The model's matrix for a body (the model's origin is the middle of its base).
export function bodyMatrix(b, m4) {
  _v.set(0, -b.he.y, 0).applyQuaternion(b.q).add(b.p);
  return m4.compose(_v, b.q, _a.set(1, 1, 1));
}

// ---------------------------------------------------------------- balls
// A ball is a sphere, not a box: it bounces off the floor, walls and
// furniture with its own bounciness (a rubber bouncy ball keeps going for a
// long time), and rolls along the floor, slowing as it goes. Its spin is just
// for show: it turns as it rolls.
export function makeBall(r, bounce, c, vel) {
  return { ball: true, r, bounce, p: c.clone(), v: vel.clone(), q: new THREE.Quaternion(), still: 0, age: 0, done: false, touching: false };
}
export function stepBall(b, dt, boxes, ceil) {
  let impact = 0;
  const n = Math.min(12, Math.max(1, Math.ceil(b.v.length() * dt / (b.r * 0.5))));
  const h = dt / n;
  // slower than a step's worth of gravity, a contact doesn't bounce (or a ball
  // lying on the floor would hop on its own when the frame rate is low)
  const rest = Math.max(0.35, G * h * 1.6);
  for (let s = 0; s < n; s++) {
    b.v.y -= G * h;
    b.p.addScaledVector(b.v, h);
    let touching = false;
    const hit = (nx, ny, nz, depth) => {
      _n.set(nx, ny, nz);
      b.p.addScaledVector(_n, depth);
      const vn = b.v.dot(_n);
      if (vn < 0) {
        if (-vn > impact) impact = -vn;
        // a bounce, unless it's barely moving into the surface (then it rolls)
        b.v.addScaledVector(_n, -vn * (-vn > rest ? 1 + b.bounce : 1));
      }
      touching = true;
      if (ny > 0.5) { // rolling on something: slows down, and turns as it goes
        b.v.x *= Math.exp(-h * 0.9); b.v.z *= Math.exp(-h * 0.9);
        _t.set(b.v.z, 0, -b.v.x); const sp = _t.length();
        if (sp > 1e-4) { _q.setFromAxisAngle(_t.divideScalar(sp), sp / b.r * h); b.q.premultiply(_q); }
      }
    };
    if (b.p.y - b.r < 0) hit(0, 1, 0, b.r - b.p.y);
    if (b.p.y + b.r > ceil) hit(0, -1, 0, b.p.y + b.r - ceil);
    for (const o of boxes) {
      // the nearest point of the box to the centre
      const cx = Math.max(o.x0, Math.min(b.p.x, o.x1)), cy = Math.max(o.y0, Math.min(b.p.y, o.y1)), cz = Math.max(o.z0, Math.min(b.p.z, o.z1));
      const dx = b.p.x - cx, dy = b.p.y - cy, dz = b.p.z - cz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= b.r * b.r) continue;
      if (d2 > 1e-10) { const d = Math.sqrt(d2); hit(dx / d, dy / d, dz / d, b.r - d); }
      else hit(0, 1, 0, o.y1 - b.p.y + b.r); // the centre's inside it: out of the top
    }
    b.touching = touching;
  }
  b.q.normalize();
  b.age += dt;
  const slow = b.v.length() < 0.08;
  b.still = slow && b.touching ? b.still + dt : 0;
  if (b.still > 0.3 || b.age > 20) b.done = true;
  return impact;
}
// The model's matrix for a ball (the model's origin is the bottom of the ball).
export function ballMatrix(b, m4) {
  _v.set(0, -b.r, 0).applyQuaternion(b.q).add(b.p);
  return m4.compose(_v, b.q, _a.set(1, 1, 1));
}
