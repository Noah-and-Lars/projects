// Rigs a downloaded glove (a static mesh in a flat, open-hand pose) onto the
// soldier's hand bones, for tools/gear/build_gear.mjs.
//
// The glove keeps its own pose: it's skinned in it. A copy of his hand
// skeleton is posed to match it (his palm where the glove's palm is, each
// finger and thumb bone turned to point along the glove's), and the glove is
// bound to his real bones with that pose's inverse bind matrices. So in the
// game his bones bend it straight from its own pose into his, whatever they
// do (every grip, reload and inspect, and his idle pose), with nothing new at
// run time: each bone's turn from the glove's pose is the turn it's given.
//
// 1. The glove's joints are found from its own shape, in its hand frame (u
//    along the fingers, v towards the thumb, w out of the back of the hand;
//    `axes` in the item say which way those are in the download):
//    - the fingertips and the webs between the fingers from its outline
//      seen from the back;
//    - each finger's middle line, followed from its tip down through the
//      middle of the finger (and on into the palm) slice by slice;
//    - the knuckle a little further down than the web (`web`, of the
//      finger's length beyond it), and the two joints between knuckle and
//      tip spaced as his are;
//    - the thumb's tip as its outline's furthest point, its two joints
//      spaced as his from there, and its root (deep in the palm) where his
//      is.
// 2. It's turned, scaled (his knuckles' span over its) and placed so its
//    knuckle row lies on his, in his hand's frame. The right hand is the
//    left glove mirrored.
// 3. Each point's weights: the finger (or thumb) it's nearest, shared softly
//    between neighbours, and along that finger the bones either side of each
//    joint, blended across it; the cuff on his lower forearm (like his own
//    glove's).
// 4. His hand skeleton posed as the glove (each bone turned the least way
//    from his rest to point as the glove's does), and the glove stretched a
//    little along each bone so its joints sit exactly on his.
// 5. The cuff: lengthened if it would stop short of his sleeve, and narrowed
//    where it goes up inside the sleeve, so it meets the sleeve with no gap
//    and never pokes through.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulS = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const addS = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mulS(a, 1 / (len(a) || 1));
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ortho = (a, b) => norm(addS(a, b, -dot(a, b)));
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
// 3x3 matrices as rows [[..],[..],[..]].
const m3 = (cols) => [[cols[0][0], cols[1][0], cols[2][0]], [cols[0][1], cols[1][1], cols[2][1]], [cols[0][2], cols[1][2], cols[2][2]]];
const m3mul = (A, B) => A.map((row) => [0, 1, 2].map((c) => row[0] * B[0][c] + row[1] * B[1][c] + row[2] * B[2][c]));
const m3T = (A) => [0, 1, 2].map((r) => [A[0][r], A[1][r], A[2][r]]);
const m3v = (A, v) => [dot(A[0], v), dot(A[1], v), dot(A[2], v)];
// The least turn taking direction a to b (both unit).
function swing(a, b) {
  const axis = cross(a, b);
  const s = len(axis), c = dot(a, b);
  if (s < 1e-9) return c > 0 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : [[-1, 0, 0], [0, -1, 0], [0, 0, 1]];
  const k = mulS(axis, 1 / s);
  const t = 1 - c;
  const [x, y, z] = k;
  return [
    [c + x * x * t, x * y * t - z * s, x * z * t + y * s],
    [y * x * t + z * s, c + y * y * t, y * z * t - x * s],
    [z * x * t - y * s, z * y * t + x * s, c + z * z * t],
  ];
}
// 4x4 column-major (glTF) helpers.
const pointOf = (m) => [m[12], m[13], m[14]];
const rot3Of = (m) => [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
// T(to) * R3 * T(-from) * M: M turned by R3 about `from` and moved to `to`.
function turnAbout(M, R, from, to) {
  const out = M.slice();
  for (let c = 0; c < 4; c++) {
    const col = [M[c * 4], M[c * 4 + 1], M[c * 4 + 2]];
    const w = M[c * 4 + 3];
    // (R * (col - from * w)) + to * w
    const shifted = addS(col, from, -w);
    const r = m3v(R, shifted);
    out[c * 4] = r[0] + to[0] * w;
    out[c * 4 + 1] = r[1] + to[1] * w;
    out[c * 4 + 2] = r[2] + to[2] * w;
  }
  return out;
}

// Rigid moves (rotation, translation) and their blend as dual quaternions.
function quatOf(R) {
  const [[a, b, c], [d, e, f], [g, h, k]] = R;
  const tr = a + e + k;
  let q;
  if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; q = [(h - f) / S, (c - g) / S, (d - b) / S, 0.25 * S]; }
  else if (a > e && a > k) { const S = Math.sqrt(1 + a - e - k) * 2; q = [0.25 * S, (b + d) / S, (c + g) / S, (h - f) / S]; }
  else if (e > k) { const S = Math.sqrt(1 + e - a - k) * 2; q = [(b + d) / S, 0.25 * S, (f + h) / S, (c - g) / S]; }
  else { const S = Math.sqrt(1 + k - a - e) * 2; q = [(c + g) / S, (f + h) / S, 0.25 * S, (d - b) / S]; }
  const l = Math.hypot(...q);
  return q.map((x) => x / l);
}
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const identityMove = () => ({ real: [0, 0, 0, 1], dual: [0, 0, 0, 0] });
// The move taking a bone from `from` (world matrix) to `to`: to * from^-1
// (both with the model's scale, which cancels).
function moveOf(to, from) {
  const Rt = normCols(rot3Of(to)), Rf = normCols(rot3Of(from));
  const R = m3mul(Rt, m3T(Rf));
  const t = sub(pointOf(to), m3v(R, pointOf(from)));
  const real = quatOf(R);
  const dual = qmul([t[0], t[1], t[2], 0], real).map((x) => x * 0.5);
  return { real, dual };
}
function blendMoves(moves, w) {
  const real = [0, 0, 0, 0], dual = [0, 0, 0, 0];
  let pivot = null;
  for (let b = 0; b < moves.length; b++) {
    if (!w[b]) continue;
    const m = moves[b];
    if (!pivot) pivot = m.real;
    const sgn = dot4(pivot, m.real) < 0 ? -w[b] : w[b];
    for (let k = 0; k < 4; k++) { real[k] += sgn * m.real[k]; dual[k] += sgn * m.dual[k]; }
  }
  const l = Math.hypot(...real);
  const r = real.map((x) => x / l), d = dual.map((x) => x / l);
  const [x, y, z, ww] = r;
  const R = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * ww), 2 * (x * z + y * ww)],
    [2 * (x * y + z * ww), 1 - 2 * (x * x + z * z), 2 * (y * z - x * ww)],
    [2 * (x * z - y * ww), 2 * (y * z + x * ww), 1 - 2 * (x * x + y * y)],
  ];
  const tq = qmul(d, [-x, -y, -z, ww]);
  return [R, [2 * tq[0], 2 * tq[1], 2 * tq[2]]];
}
// A turn of `a` radians about unit axis k.
function axisAngle(k, a) {
  const c = Math.cos(a), s2 = Math.sin(a), t = 1 - c;
  const [x, y, z] = k;
  return [
    [c + x * x * t, x * y * t - z * s2, x * z * t + y * s2],
    [y * x * t + z * s2, c + y * y * t, y * z * t - x * s2],
    [z * x * t - y * s2, z * y * t + x * s2, c + z * z * t],
  ];
}
// Rotation part of the way from A to B (both 3x3 rotations).
function slerpR(A, B, t) {
  const qa = quatOf(A);
  let qb = quatOf(B);
  if (dot4(qa, qb) < 0) qb = qb.map((x) => -x);
  const c = Math.min(1, dot4(qa, qb));
  const ang = Math.acos(c);
  let q;
  if (ang < 1e-6) q = qa;
  else { const s0 = Math.sin((1 - t) * ang) / Math.sin(ang), s1 = Math.sin(t * ang) / Math.sin(ang); q = qa.map((x, i) => s0 * x + s1 * qb[i]); }
  const [x, y, z, w] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}
// A joint's world matrix M with its rotation replaced (keeping its scale)
// and moved to `at`.
function withRotation(M, R, at) {
  const out = M.slice();
  for (let c = 0; c < 3; c++) {
    const l = Math.hypot(M[c * 4], M[c * 4 + 1], M[c * 4 + 2]);
    for (let r = 0; r < 3; r++) out[c * 4 + r] = R[r][c] * l;
  }
  out[12] = at[0]; out[13] = at[1]; out[14] = at[2];
  return out;
}
// Part of the way (t) from joint matrix A to B, turning about its own place.
function between(A, B, t) {
  const R = slerpR(normCols(rot3Of(A)), normCols(rot3Of(B)), t);
  return withRotation(B, R, lerp(pointOf(A), pointOf(B), t));
}
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

const DIGITS = ['Index', 'Mid', 'Ring', 'Pinky', 'Thumb'];
// How widely each joint's bend is blended (metres either side): the
// fingers' knuckle, middle and last joints, and the thumb's root, middle
// and last (as the game's own gloves, src/viewmodel/handRig.js).
const FINGER_BLEND = [0.010, 0.007, 0.0055];
const THUMB_BLEND = [0.014, 0.007, 0.005];
const ARC_SHARE = 0.004; // how softly a point is shared between a line's segments (metres)
const SHARE_OVER = 0.005; // how far over the glove's surface a digit's share fades (metres)
// The cuff follows his lower forearm: fully this far up his arm from the
// wrist, none this far down the hand (metres; as his own glove).
const CUFF = { forearm: -0.024, hand: 0.014 };

// His hand, at rest, from the soldier data build_gear.mjs reads.
export function soldierHand(soldier, side) {
  const S = side;
  const index = (name) => {
    const i = soldier.joints.findIndex((j) => j.getName().replace(/_\d+$/, '') === `CC_Base_${S}_${name}`);
    if (i < 0) throw new Error(`no joint CC_Base_${S}_${name}`);
    return i;
  };
  const world = (i) => soldier.joints[i].getWorldMatrix();
  const hand = index('Hand');
  const fore = index('Forearm');
  const twist = index('ForearmTwist02');
  const digits = DIGITS.map((d) => [1, 2, 3].map((k) => index(`${d}${k}`)));
  const at = (i) => pointOf(world(i));
  const wrist = at(hand);
  const forearmAxis = norm(sub(wrist, at(fore)));
  // His own glove's points on this hand (for its fingertips' length and its
  // fingers' thickness) and his sleeve's (for the cuff).
  const own = soldier.meshes.get('Object_129');
  const sleeve = soldier.meshes.get('Mark_Kitel_1_arms');
  const onSide = (m) => {
    const out = [];
    for (let v = 0; v < m.pos.length / 3; v++) {
      const p = [m.pos[3 * v], m.pos[3 * v + 1], m.pos[3 * v + 2]];
      if (sub(p, wrist).reduce((s, x) => s + x * x, 0) < 0.25 ** 2) out.push(v);
    }
    return out;
  };
  // Each bone's rest direction (the last bone of each: as the one before it
  // turns into it, in its own frame).
  const chains = digits.map((ids) => {
    const J = ids.map(at);
    const R = ids.map((i) => rot3Of(world(i)));
    const d0 = norm(sub(J[1], J[0]));
    const d1 = norm(sub(J[2], J[1]));
    const local = m3v(m3T(normCols(R[1])), d1);
    const d2 = norm(m3v(normCols(R[2]), local));
    return { ids, J, dirs: [d0, d1, d2], lengths: [len(sub(J[1], J[0])), len(sub(J[2], J[1]))] };
  });
  // Fingertips: how far his glove reaches past each last joint.
  const ownPoints = onSide(own);
  for (const chain of chains) {
    const last = chain.ids[2];
    let tip = 0;
    for (const v of ownPoints) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (own.joints[4 * v + k] === last) w += own.weights[4 * v + k];
      if (w < 0.5) continue;
      tip = Math.max(tip, dot(sub(pointOf3(own.pos, v), chain.J[2]), chain.dirs[2]));
    }
    chain.lengths.push(tip);
  }
  const mcp = chains.slice(0, 4).map((c) => c.J[0]);
  // His hand's frame: v across the knuckles towards the thumb, w out of the
  // back of the hand (the fingers curl the other way), u along it.
  const mcpMean = mulS(mcp.reduce(add, [0, 0, 0]), 1 / 4);
  const U = norm(sub(mcpMean, wrist));
  const V = ortho(sub(mcp[0], mcp[3]), U);
  let W = norm(cross(U, V));
  if (dot(W, sub(chains[1].J[2], chains[1].J[0])) > 0) W = mulS(W, -1);
  return {
    side, hand, twist, digits, chains, wrist, forearmAxis, world, U, V, W, mcp,
    mcpMean,
    span: len(sub(mcp[0], mcp[3])),
    own, ownPoints, sleeve, sleevePoints: onSide(sleeve),
  };
}
function normCols(R) {
  // (A joint's world matrix may carry the model's scale.)
  const out = R.map((r) => r.slice());
  for (let c = 0; c < 3; c++) {
    const l = Math.hypot(R[0][c], R[1][c], R[2][c]) || 1;
    for (let r = 0; r < 3; r++) out[r][c] = R[r][c] / l;
  }
  return out;
}
const pointOf3 = (pos, v) => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];

// The glove's own joints, in its hand frame (H: u, v, w), from its shape.
function findJoints(Hv, index, cfg, his, log) {
  // (Points spread over its surface, not just its corners: a coarse mesh
  // has too few for its outline and slices.)
  const H = dense(Hv, index, 0.003);
  const n = H.length / 3;
  const P = (i) => [H[3 * i], H[3 * i + 1], H[3 * i + 2]];
  let uLo = Infinity, uHi = -Infinity;
  for (let i = 0; i < n; i++) { uLo = Math.min(uLo, H[3 * i]); uHi = Math.max(uHi, H[3 * i]); }
  const length = uHi - uLo;
  // Its outline seen from the back: the highest u in each strip across.
  const BIN = 0.004 * length;
  const top = new Map();
  for (let i = 0; i < n; i++) {
    const b = Math.round(H[3 * i + 1] / BIN);
    if (!top.has(b) || top.get(b) < H[3 * i]) top.set(b, H[3 * i]);
  }
  const bins = [...top.keys()].sort((a, b) => a - b);
  const contour = bins.map((b) => [b * BIN, top.get(b)]);
  // Fingertips: the outline's peaks that stand out (each the highest point
  // within a finger's width, and well above the dip on either side before
  // anything higher); the four highest.
  const apart = cfg.apart || 0.03 * length;
  const candidates = [];
  contour.forEach(([v, u], i) => {
    if (u < uLo + 0.55 * length) return;
    if (contour.some(([v2, u2]) => Math.abs(v2 - v) < apart && u2 > u)) return;
    const dip = (dirn) => {
      // (Off the end of the outline: it stands out that side.)
      let low = u;
      for (let j = i + dirn; j >= 0 && j < contour.length; j += dirn) {
        if (contour[j][1] > u) return u - low;
        low = Math.min(low, contour[j][1]);
      }
      return Infinity;
    };
    if (Math.min(dip(1), dip(-1)) < 0.015 * length) return;
    if (!candidates.some((c) => Math.abs(c[0] - v) < apart)) candidates.push([v, u]);
  });
  candidates.sort((a, b) => b[1] - a[1]);
  const peaks = candidates.slice(0, 4);
  if (peaks.length < 4) throw new Error(`found ${peaks.length} fingertips, not four: ${JSON.stringify(candidates)} ${JSON.stringify(contour.filter((c, i) => i % 4 === 0).map((c) => c.map((x) => +x.toFixed(3))))}`);
  peaks.sort((a, b) => b[0] - a[0]); // index (nearest the thumb) first
  // Each finger's middle line, slice by slice down from its tip to the web
  // beside it (`webs`: how high the webs between the fingers are, index to
  // little finger, in u): in each slice across the hand, the middle of the
  // extent (across and through) of the glove's points between it and the
  // fingers either side (the middle of their extent, so finer detail on one
  // side doesn't pull it). From the web the line goes straight on into the
  // palm.
  const step = 0.008 * length, slab = 0.006 * length;
  const spacing = (peaks[0][0] - peaks[3][0]) / 3;
  const roughScale = his.span / (3 * spacing);
  const fingers = peaks.map(([pv], k) => {
    const lo = k < 3 ? (pv + peaks[k + 1][0]) / 2 : pv - 0.6 * spacing;
    const hi = k > 0 ? (pv + peaks[k - 1][0]) / 2 : pv + 0.6 * spacing;
    const webU = Math.max(...[cfg.webs[k - 1], cfg.webs[k]].filter((x) => x !== undefined));
    // (Its tip: the highest point near the outline's peak.)
    let tipI = -1;
    for (let i = 0; i < n; i++) if (Math.abs(H[3 * i + 1] - pv) < 0.2 * spacing && (tipI < 0 || H[3 * i] > H[3 * tipI])) tipI = i;
    const tip = P(tipI);
    const centres = [];
    for (let u = tip[0] - 1.5 * step; u > webU; u -= step) {
      let a = Infinity, b = -Infinity, w0 = Infinity, w1 = -Infinity, count = 0;
      for (let i = 0; i < n; i++) {
        if (Math.abs(H[3 * i] - u) > slab || H[3 * i + 1] < lo || H[3 * i + 1] > hi) continue;
        a = Math.min(a, H[3 * i + 1]); b = Math.max(b, H[3 * i + 1]);
        w0 = Math.min(w0, H[3 * i + 2]); w1 = Math.max(w1, H[3 * i + 2]);
        count++;
      }
      if (count >= 3) centres.push([u, (a + b) / 2, (w0 + w1) / 2]);
    }
    if (centres.length < 4) throw new Error(`finger ${k}: too few slices above its web (${centres.length})`);
    // (Smoothed a little.)
    const smooth = centres.map((c, i) => {
      const near = centres.slice(Math.max(0, i - 1), i + 2);
      return [c[0], near.reduce((s2, x) => s2 + x[1], 0) / near.length, near.reduce((s2, x) => s2 + x[2], 0) / near.length];
    });
    // From the tip, through the slices, on past the web.
    const line = [{ at: tip, arc: 0 }];
    for (const c of smooth) line.push({ at: c, arc: line[line.length - 1].arc + len(sub(c, line[line.length - 1].at)) });
    const tail = smooth.slice(-Math.max(3, smooth.length >> 1));
    const dir = norm(sub(tail[tail.length - 1], tail[0]));
    const last = line[line.length - 1];
    for (let a = step; a < 0.4 * length; a += step) line.push({ at: addS(last.at, dir, a), arc: last.arc + a });
    const webArc = last.arc;
    const ch = his.chains[k];
    const parts = [ch.lengths[2], ch.lengths[1], ch.lengths[0]]; // tip, middle, first bone
    const whole = parts[0] + parts[1] + parts[2];
    // (The knuckle below the web by a share of his finger's length, scaled
    // roughly to the glove: his hand's span over the fingertips' spread.)
    const mcpArc = webArc + (cfg.web ?? 0.3) * whole / roughScale + (cfg.knuckleShift?.[k] || 0) * length;
    const arcs = [mcpArc, mcpArc * (parts[0] + parts[1]) / whole, mcpArc * parts[0] / whole];
    const joints = arcs.map((a) => along(line, a));
    return { tip, line, joints, webArc, webU };
  });
  const mcpG = fingers.map((f) => f.joints[0]);
  const scale = his.span / len(sub(mcpG[0], mcpG[3]));
  // Its wrist: the middle of the glove's slice as far below its knuckles as
  // his wrist is below his.
  const mcpGMean = mulS(mcpG.reduce(add, [0, 0, 0]), 1 / 4);
  const wu = mcpGMean[0] - len(sub(his.mcpMean, his.wrist)) / scale;
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (let i = 0; i < n; i++) {
    if (Math.abs(H[3 * i] - wu) > 0.01 * length) continue;
    a0 = Math.min(a0, H[3 * i + 1]); a1 = Math.max(a1, H[3 * i + 1]);
    b0 = Math.min(b0, H[3 * i + 2]); b1 = Math.max(b1, H[3 * i + 2]);
  }
  const wristG = [wu, (a0 + a1) / 2, (b0 + b1) / 2];
  // The thumb: its tip the furthest point near `thumb.tip` (a rough place,
  // u v w), going `thumb.toward` (a rough place down it), and its middle
  // line followed from there.
  const roughTip = cfg.thumb.tip, roughBase = cfg.thumb.toward;
  const thumbDir = norm(sub(roughTip, roughBase));
  let tb = -1;
  for (let i = 0; i < n; i++) {
    if (len(sub(P(i), roughTip)) > 0.1 * length) continue;
    if (tb < 0 || dot(P(i), thumbDir) > dot(P(tb), thumbDir)) tb = i;
  }
  const thumbTip = P(tb);
  const tc = his.chains[4];
  const thumbLine = follow(H, thumbTip, mulS(thumbDir, -1), (tc.lengths[2] + tc.lengths[1]) / scale * 1.05, (cfg.thumbReach || 0.5) * spacing, length);
  const thumbJoints = [null, along(thumbLine, (tc.lengths[2] + tc.lengths[1]) / scale), along(thumbLine, tc.lengths[2] / scale)];
  log(`  joints: fingertips at u ${peaks.map((p) => p[1].toFixed(3)).join(' ')}, webs ${fingers.map((f) => f.webU.toFixed(3)).join(' ')}, scale ${scale.toFixed(4)}`);
  return { fingers, thumb: { tip: thumbTip, line: thumbLine, joints: thumbJoints }, wrist: wristG, scale, length, contour, peaks, webs: fingers.map((f, k) => [peaks[k][0], f.webU]) };
}

// Splits points (indices into H) into clumps, by their v and w: points
// within `gap` of each other are in the same clump.
function clumps(H, list, gap) {
  const cell = new Map();
  const key = (a, b) => `${a},${b}`;
  for (const i of list) {
    const k = key(Math.floor(H[3 * i + 1] / gap), Math.floor(H[3 * i + 2] / gap));
    if (!cell.has(k)) cell.set(k, []);
    cell.get(k).push(i);
  }
  const seen = new Set();
  const out = [];
  for (const start of cell.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const queue = [start];
    const run = [];
    while (queue.length) {
      const k = queue.pop();
      run.push(...cell.get(k));
      const [a, b] = k.split(',').map(Number);
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
        const k2 = key(a + da, b + db);
        if (cell.has(k2) && !seen.has(k2)) { seen.add(k2); queue.push(k2); }
      }
    }
    out.push(run);
  }
  return out;
}

// Points over every triangle, about `spacing` apart (of the glove's length).
function dense(H, index, spacing) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < H.length; i += 3) { lo = Math.min(lo, H[i]); hi = Math.max(hi, H[i]); }
  const gap = spacing * (hi - lo);
  const out = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = 3 * index[t], b = 3 * index[t + 1], c = 3 * index[t + 2];
    const A = [H[a], H[a + 1], H[a + 2]], U = sub([H[b], H[b + 1], H[b + 2]], A), V = sub([H[c], H[c + 1], H[c + 2]], A);
    const steps = Math.max(1, Math.ceil(Math.max(len(U), len(V), len(sub(U, V))) / gap));
    for (let i = 0; i <= steps; i++) for (let j = 0; i + j <= steps; j++) out.push(...addS(addS(A, U, i / steps), V, j / steps));
  }
  return new Float32Array(out);
}

// A finger's middle line from its tip: slice by slice across it, the middle
// of the glove's points in each slice (the middle of their extent, so the
// finer detail on one side doesn't pull it), turning gently to follow.
function follow(H, start, dir0, total, reach, length) {
  const n = H.length / 3;
  const step = 0.006 * length;
  const slab = 0.018 * length;
  let c = start.slice();
  let d = norm(dir0);
  const start0 = d;
  const out = [{ at: c, arc: 0 }];
  let arc = 0;
  while (arc < total) {
    const guess = addS(c, d, step);
    const e1 = ortho(Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0], d);
    const e2 = cross(d, e1);
    let lo1 = Infinity, hi1 = -Infinity, lo2 = Infinity, hi2 = -Infinity, count = 0;
    for (let i = 0; i < n; i++) {
      const q = sub([H[3 * i], H[3 * i + 1], H[3 * i + 2]], guess);
      if (Math.abs(dot(q, d)) > slab) continue;
      const a = dot(q, e1), b = dot(q, e2);
      if (a * a + b * b > reach * reach) continue;
      lo1 = Math.min(lo1, a); hi1 = Math.max(hi1, a); lo2 = Math.min(lo2, b); hi2 = Math.max(hi2, b);
      count++;
    }
    let next = guess;
    if (count >= 4) next = addS(addS(guess, e1, (lo1 + hi1) / 2), e2, (lo2 + hi2) / 2);
    const moved = sub(next, c);
    arc += len(moved);
    d = norm(lerp(d, norm(moved), 0.2));
    // (Never more than 35 degrees off where it set out.)
    const off = Math.acos(Math.min(1, dot(d, start0)));
    if (off > 0.61) d = norm(lerp(start0, d, 0.61 / off));
    c = next;
    out.push({ at: c, arc });
  }
  return out;
}
// The point `arc` along a line (or past its end, straight on).
function along(line, arc) {
  for (let i = 1; i < line.length; i++) {
    if (line[i].arc >= arc) {
      const t = (arc - line[i - 1].arc) / (line[i].arc - line[i - 1].arc || 1);
      return lerp(line[i - 1].at, line[i].at, t);
    }
  }
  const a = line[line.length - 2], b = line[line.length - 1];
  return addS(b.at, norm(sub(b.at, a.at)), arc - b.arc);
}

// Each point's share of each digit (5 a point): its own (the digit whose
// line is nearest; a point all of whose neighbours disagree takes theirs),
// shared with others by how far over the surface their points are
// (Gaussian, `over` metres). Points at the same place (texture seams) count
// as one.
function surfaceShare(pos, index, near, over) {
  const n = pos.length / 3;
  const key = new Map();
  const node = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[3 * i] * 1e5)},${Math.round(pos[3 * i + 1] * 1e5)},${Math.round(pos[3 * i + 2] * 1e5)}`;
    if (!key.has(k)) key.set(k, key.size);
    node[i] = key.get(k);
  }
  const m = key.size;
  const where = new Float32Array(m * 3);
  for (let i = 0; i < n; i++) where.set(pointOf3(pos, i), 3 * node[i]);
  const links = Array.from({ length: m }, () => new Map());
  for (let t = 0; t < index.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = node[index[t + e]], b = node[index[t + (e + 1) % 3]];
      if (a === b) continue;
      const d = len(sub(pointOf3(where, a), pointOf3(where, b)));
      links[a].set(b, d);
      links[b].set(a, d);
    }
  }
  // Nearest line, by node.
  const label = new Int8Array(m).fill(-1);
  const bestD = new Float32Array(m).fill(Infinity);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 5; c++) {
      if (near[i * 5 + c] < bestD[node[i]]) { bestD[node[i]] = near[i * 5 + c]; label[node[i]] = c; }
    }
  }
  // (Odd points out: twice over, a point whose neighbours mostly agree on
  // another digit takes theirs.)
  for (let pass = 0; pass < 2; pass++) {
    const next = label.slice();
    for (let a = 0; a < m; a++) {
      const votes = [0, 0, 0, 0, 0];
      for (const b of links[a].keys()) votes[label[b]]++;
      const total = votes.reduce((x, y) => x + y, 0);
      const top = votes.indexOf(Math.max(...votes));
      if (top !== label[a] && votes[top] > total / 2 && votes[label[a]] === 0) next[a] = top;
    }
    label.set(next);
  }
  // Distance over the surface to each digit's points (Dijkstra from all of
  // them at once), out to 3 x `over`.
  const out = new Float32Array(n * 5);
  const nodeShare = new Float32Array(m * 5);
  for (let c = 0; c < 5; c++) {
    const dist = new Float32Array(m).fill(Infinity);
    const heap = [];
    const push = (d, a) => {
      heap.push([d, a]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let s2 = i;
          if (l < heap.length && heap[l][0] < heap[s2][0]) s2 = l;
          if (r < heap.length && heap[r][0] < heap[s2][0]) s2 = r;
          if (s2 === i) break;
          [heap[s2], heap[i]] = [heap[i], heap[s2]];
          i = s2;
        }
      }
      return top;
    };
    for (let a = 0; a < m; a++) if (label[a] === c) { dist[a] = 0; push(0, a); }
    while (heap.length) {
      const [d, a] = pop();
      if (d > dist[a] || d > 3 * over) continue;
      for (const [b, e] of links[a]) if (d + e < dist[b]) { dist[b] = d + e; push(d + e, b); }
    }
    for (let a = 0; a < m; a++) nodeShare[a * 5 + c] = Number.isFinite(dist[a]) ? Math.exp(-((dist[a] / over) ** 2)) : 0;
  }
  for (let a = 0; a < m; a++) {
    let t = 0;
    for (let c = 0; c < 5; c++) t += nodeShare[a * 5 + c];
    for (let c = 0; c < 5; c++) nodeShare[a * 5 + c] = t ? nodeShare[a * 5 + c] / t : (label[a] === c ? 1 : 0);
  }
  for (let i = 0; i < n; i++) for (let c = 0; c < 5; c++) out[i * 5 + c] = nodeShare[node[i] * 5 + c] < 0.01 ? 0 : nodeShare[node[i] * 5 + c];
  return out;
}

// Distance from p to segment ab, and how far along it (0..1).
function toSegment(p, a, b) {
  const ab = sub(b, a);
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return [len(sub(p, addS(a, ab, t))), t];
}

// Rigs one glove (`g`: the left glove's points, normals, uvs and triangles in
// the download's space) onto his hand on `side` ('L' or 'R').
export function rigGlove(item, g, soldier, side, log = console.log) {
  const cfg = item.glove;
  const his = soldierHand(soldier, side);
  const n = g.pos.length / 3;
  // Into the glove's hand frame (u along, v to the thumb, w out of its back).
  const centre = [0, 1, 2].map((k) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { lo = Math.min(lo, g.pos[3 * i + k]); hi = Math.max(hi, g.pos[3 * i + k]); }
    return (lo + hi) / 2;
  });
  const ax = [cfg.axes.along, cfg.axes.thumb, cfg.axes.back].map(norm);
  const H = new Float32Array(n * 3);
  const HN = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = sub(pointOf3(g.pos, i), centre);
    const q = pointOf3(g.nor, i);
    for (let k = 0; k < 3; k++) { H[3 * i + k] = dot(p, ax[k]); HN[3 * i + k] = dot(q, ax[k]); }
  }
  const found = findJoints(H, g.index, cfg, his, log);
  const s = found.scale;

  // Its knuckle row onto his: frames from the knuckles (and the back of the
  // hand), the same way on both.
  const mcpG = found.fingers.map((f) => f.joints[0]);
  const mcpGMean = mulS(mcpG.reduce(add, [0, 0, 0]), 1 / 4);
  // (Along: its wrist to its knuckles; across: its knuckle row; out of its
  // back: w, as his.)
  const Ug = norm(sub(mcpGMean, found.wrist));
  const Vg = ortho(sub(mcpG[0], mcpG[3]), Ug);
  let Wg = norm(cross(Ug, Vg));
  if (Wg[2] < 0) Wg = mulS(Wg, -1);
  // (H is a left-handed frame for the left glove; his right hand's frame is
  // right-handed, so R mirrors it there.)
  const R = m3mul(m3([his.U, his.V, his.W]), m3T(m3([Ug, Vg, Wg])));
  const mirrored = side === 'R';
  const toHis = (p) => add(his.mcpMean, mulS(m3v(R, sub(p, mcpGMean)), s));
  const toGlove = (p) => add(mcpGMean, mulS(m3v(m3T(R), sub(p, his.mcpMean)), 1 / s));
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos.set(toHis(pointOf3(H, i)), 3 * i);
    nor.set(norm(m3v(R, pointOf3(HN, i))), 3 * i);
  }

  // The glove's bones, in his space: for each finger and the thumb, its
  // joints and tip.
  const chainsG = found.fingers.map((f) => [...f.joints.map(toHis), toHis(f.tip)]);
  const thumbRoot = his.chains[4].J[0]; // (his: deep in the palm)
  chainsG.push([thumbRoot, toHis(found.thumb.joints[1]), toHis(found.thumb.joints[2]), toHis(found.thumb.tip)]);

  // His hand skeleton posed as the glove: each bone the least turn from his
  // rest to point along the glove's, his bone lengths, his palm as it rests.
  const posed = his.chains.map((ch, c) => {
    const G = chainsG[c];
    const dirs = [0, 1, 2].map((k) => norm(sub(G[k + 1], G[k])));
    const J = [ch.J[0]];
    for (let k = 0; k < 3; k++) J.push(addS(J[k], dirs[k], ch.lengths[k]));
    // (twist: turned about its own length too, by that many radians.)
    const worldAt = (twist) => ch.ids.map((id, k) => turnAbout(his.world(id), m3mul(axisAngle(dirs[k], twist), swing(ch.dirs[k], dirs[k])), ch.J[k], J[k]));
    // Stretched along each bone to fit his: x -> J + D (x - G).
    const stretch = [0, 1, 2].map((k) => ch.lengths[k] / len(sub(G[k + 1], G[k])));
    return { J, dirs, world: worldAt(0), worldAt, stretch };
  });
  log(`  ${side}: stretch along bones ${posed.map((p) => p.stretch.map((x) => x.toFixed(2)).join('/')).join(' ')}; knuckles off his by ${chainsG.slice(0, 4).map((G, c) => (len(sub(G[0], his.chains[c].J[0])) * 1000).toFixed(1)).join(' ')} mm`);

  // Weights over the glove's bones: 0 hand, 1 forearm, 2 + 3c + k digit c's
  // bone k.
  const B = 2 + 15;
  const wts = new Float32Array(n * B);
  const handAxis = norm(sub(his.mcpMean, his.wrist));
  // Each digit's line from the wrist through its joints to its tip, and its
  // joints' places along it.
  const lines = chainsG.map((G) => {
    const line = [his.wrist, ...G];
    const at = [];
    let a = 0;
    for (let k = 0; k < line.length - 1; k++) { a += len(sub(line[k + 1], line[k])); at.push(a); }
    return { line, joints: at.slice(0, 3) };
  });
  // For each point and digit: how far it is from the digit's line, and the
  // weights it would have along that digit (hand, then each bone in turn,
  // blended across each joint).
  const near = new Float32Array(n * 5);
  const along = new Float32Array(n * 5 * 4);
  for (let i = 0; i < n; i++) {
    const p = pointOf3(pos, i);
    lines.forEach(({ line, joints }, c) => {
      // (How far along: each segment's nearest point, shared between the
      // segments by how near they are, so it doesn't jump on the inside of
      // a bend in the line.)
      let best = Infinity, arc = 0;
      const per = [];
      for (let k = 0; k < line.length - 1; k++) {
        const segLen = len(sub(line[k + 1], line[k]));
        const [d, t] = toSegment(p, line[k], line[k + 1]);
        per.push([d, arc + t * segLen]);
        best = Math.min(best, d);
        arc += segLen;
      }
      let sw = 0, arcAt = 0;
      for (const [d, a] of per) { const w = Math.exp(-(d - best) / ARC_SHARE); sw += w; arcAt += w * a; }
      arcAt /= sw;
      near[i * 5 + c] = best;
      const blend = c === 4 ? THUMB_BLEND : FINGER_BLEND;
      const into = joints.map((j, k) => smoothstep(j - blend[k], j + blend[k], arcAt));
      along.set([1 - into[0], into[0] - into[1], into[1] - into[2], into[2]], (i * 5 + c) * 4);
    });
  }
  // Which digit each point belongs to: the nearest line, then shared with
  // the digits next to it on the glove's surface (by distance over the
  // surface, so fingers that touch but aren't joined don't share, and the
  // webs and palm blend smoothly).
  const share = surfaceShare(pos, g.index, near, SHARE_OVER);
  for (let i = 0; i < n; i++) {
    let hand = 0;
    for (let c = 0; c < 5; c++) {
      const m = share[i * 5 + c];
      if (!m) continue;
      const bw = along.subarray((i * 5 + c) * 4, (i * 5 + c) * 4 + 4);
      hand += m * bw[0];
      for (let k = 0; k < 3; k++) wts[i * B + 2 + 3 * c + k] += m * Math.max(0, bw[k + 1]);
    }
    // The cuff on his lower forearm.
    const a = dot(sub(pointOf3(pos, i), his.wrist), handAxis);
    const fore = 1 - smoothstep(CUFF.forearm, CUFF.hand, a);
    wts[i * B] = hand * (1 - fore);
    wts[i * B + 1] = hand * fore;
  }

  // The glove fitted to his bones in its pose: each bone's part stretched
  // along it so the joints sit on his.
  const D = (dir, k) => (x) => addS(x, dir, (k - 1) * dot(x, dir));
  for (let i = 0; i < n; i++) {
    const p = pointOf3(pos, i);
    const q = pointOf3(nor, i);
    let out = mulS(p, wts[i * B] + wts[i * B + 1]);
    let nn = mulS(q, wts[i * B] + wts[i * B + 1]);
    for (let c = 0; c < 5; c++) {
      for (let k = 0; k < 3; k++) {
        const w = wts[i * B + 2 + 3 * c + k];
        if (!w) continue;
        const G = chainsG[c];
        const P2 = posed[c];
        const stretch = D(P2.dirs[k], P2.stretch[k]);
        out = addS(out, add(P2.J[k], stretch(sub(p, G[k]))), w);
        nn = addS(nn, D(P2.dirs[k], 1 / P2.stretch[k])(q), w);
      }
    }
    pos.set(out, 3 * i);
    nor.set(norm(nn), 3 * i);
  }

  // The thumb's turn about its own length in the glove's pose: the least
  // turn into his pose alone can leave the thumb's pad facing the wrong way
  // (the downloads' thumbs lie out flat, his is opposed). So it's turned so
  // that, in his rest pose, its pad faces his index finger, as his does:
  // the glove's pad taken to face `thumb.pad` degrees from straight out of
  // its palm towards its fingers (45 by default).
  {
    const ids = his.digits[4];
    const padDeg = ((cfg.thumb.pad ?? 45) * Math.PI) / 180;
    const padH = [0, -Math.sin(padDeg), -Math.cos(padDeg)];
    const padFlat = norm(m3v(R, padH));
    const tc2 = his.chains[4];
    const wantRaw = sub(his.chains[0].J[1], tc2.J[2]);
    const want = ortho(wantRaw, tc2.dirs[2]);
    let best = null;
    for (let deg = -180; deg < 180; deg += 5) {
      const world = posed[4].worldAt((deg * Math.PI) / 180);
      const move = moveOf(his.world(ids[2]), world[2]);
      const [R2] = blendMoves([move], [1]);
      const pad = ortho(m3v(R2, ortho(padFlat, posed[4].dirs[2])), tc2.dirs[2]);
      const score = dot(pad, want);
      if (!best || score > best.score) best = { deg, score };
    }
    const twist = cfg.thumbTwist ?? best.deg;
    posed[4].world = posed[4].worldAt((twist * Math.PI) / 180);
    log(`  thumb turned ${twist} degrees about its length`);
  }

  // How thick its fingers are, to his own glove's (for fitting the fingers
  // to the gun, src/player/fpArms.js).
  const thickness = measureThickness(pos, wts, B, chainsG.map((G, c) => [posed[c].J[0], posed[c].J[1], posed[c].J[2], addS(posed[c].J[2], posed[c].dirs[2], his.chains[c].lengths[2])]), his);

  // Into his rest pose (his fingers curled as he stands), each point taken
  // by its bones' blend as rigid turns (dual quaternions, so a bend keeps
  // the glove's volume instead of pinching it), and bound there: in the
  // game his bones then only bend it from his rest to his hands' poses,
  // which are near it. (His forearm in the glove's pose: turned about the
  // wrist so the cuff, along his hand, lies along his forearm at rest.)
  const foreFlat = turnAbout(his.world(his.twist), swing(his.forearmAxis, handAxis), his.wrist, his.wrist);
  const flatPos = process.env.GLOVE_STRETCH ? pos.slice() : null;
  // (Bound part of the way from the glove's pose to his rest, `bindAt`: so
  // what's bent here and what his bones bend in the game are each smaller.)
  const bindAt = cfg.bindAt ?? 0.5;
  const bind = new Map([[his.hand, his.world(his.hand)], [his.twist, between(foreFlat, his.world(his.twist), bindAt, null, null)]]);
  his.digits.forEach((ids, c) => {
    let parentFlat = normCols(rot3Of(his.world(his.hand))), parentRest = parentFlat, parentBind = parentFlat;
    let at = his.chains[c].J[0];
    ids.forEach((id, k) => {
      const flat = posed[c].world[k], rest = his.world(id);
      const Rf = normCols(rot3Of(flat)), Rr = normCols(rot3Of(rest));
      const local = slerpR(m3mul(m3T(parentFlat), Rf), m3mul(m3T(parentRest), Rr), bindAt);
      const Rb = m3mul(parentBind, local);
      if (k > 0) {
        const prev = his.chains[c].J[k - 1];
        const offset = m3v(m3T(parentRest), sub(his.chains[c].J[k], prev));
        at = add(at, m3v(parentBind, offset));
      }
      bind.set(id, withRotation(rest, Rb, at));
      parentFlat = Rf; parentRest = Rr; parentBind = Rb;
    });
  });
  const moves = [identityMove(), moveOf(bind.get(his.twist), foreFlat)];
  his.digits.forEach((ids, c) => ids.forEach((id, k) => moves.push(moveOf(bind.get(id), posed[c].world[k]))));
  for (let i = 0; i < n; i++) {
    const [R2, t] = blendMoves(moves, wts.subarray(i * B, i * B + B));
    pos.set(add(m3v(R2, pointOf3(pos, i)), t), 3 * i);
    nor.set(norm(m3v(R2, pointOf3(nor, i))), 3 * i);
  }

  if (process.env.GLOVE_STRETCH) {
    const bad = [];
    for (let t = 0; t < g.index.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = g.index[t + e], b = g.index[t + (e + 1) % 3];
      const l0 = len(sub(pointOf3(flatPos, a), pointOf3(flatPos, b))), l1 = len(sub(pointOf3(pos, a), pointOf3(pos, b)));
      if (l1 > 2 * l0 + 0.002) bad.push([a, b, l0, l1]);
    }
    log(`  stretched edges: ${bad.length}`);
    const names = ['hand', 'fore', ...DIGITS.flatMap((d) => [1, 2, 3].map((k) => d + k))];
    for (const [a, b, l0, l1] of bad.slice(0, 12)) {
      const w = (i) => [...wts.subarray(i * B, i * B + B)].map((x, j) => [names[j], x]).filter(([, x]) => x > 0.05).map(([nm, x]) => `${nm}:${x.toFixed(2)}`).join(' ');
      log(`    ${(l0 * 1000).toFixed(1)} -> ${(l1 * 1000).toFixed(1)} mm  a[${w(a)}] b[${w(b)}] H a ${[...pointOf3(H, a)].map((x) => x.toFixed(3))} b ${[...pointOf3(H, b)].map((x) => x.toFixed(3))}`);
    }
  }

  // The cuff: up into his sleeve far enough, and inside it.
  fitCuff(pos, wts, B, his, cfg, log);

  // Into the file's terms: up to four joints each.
  const jointOf = [his.hand, his.twist, ...his.digits.flatMap((ids) => ids)];
  const joints = new Uint16Array(n * 4);
  const weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const list = [];
    for (let b = 0; b < B; b++) if (wts[i * B + b] > 1e-3) list.push([b, wts[i * B + b]]);
    list.sort((x, y) => y[1] - x[1]);
    const top = list.slice(0, 4);
    const t = top.reduce((x, [, w]) => x + w, 0);
    top.forEach(([b, w], k) => { joints[4 * i + k] = jointOf[b]; weights[4 * i + k] = w / t; });
  }
  // Inverse bind matrices: that pose.
  const pose = bind;

  // (Triangles wind the other way on the mirrored hand.)
  const index = Uint32Array.from(g.index);
  if (mirrored) for (let t = 0; t < index.length; t += 3) { const x = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = x; }
  return {
    pos, nor, uv: g.uv, index, joints, weights, pose, thickness,
    debug: { H, found, chainsG, posed, R, s, toGlove, wrist: his.wrist },
  };
}

// The cuff, at his rest pose: if it ends short of `cuffTo` (metres up his
// forearm from the wrist) it's drawn out to there; and wherever it's inside
// his sleeve it's narrowed to fit inside it, easing back to its own width
// past the sleeve's end.
function fitCuff(pos, wts, B, his, cfg, log) {
  const n = pos.length / 3;
  const axis = his.forearmAxis;
  const w0 = his.wrist;
  const cuffIdx = [];
  for (let i = 0; i < n; i++) if (dot(sub(pointOf3(pos, i), w0), axis) < 0.03) cuffIdx.push(i);
  // Draw it out.
  let lowest = Infinity;
  const restPos = new Map();
  for (const i of cuffIdx) {
    const r = pointOf3(pos, i);
    restPos.set(i, r);
    lowest = Math.min(lowest, dot(sub(r, w0), axis));
  }
  const cuffTo = cfg.cuffTo ?? -0.032;
  const from = -0.004;
  if (lowest > cuffTo) {
    const k = (cuffTo - from) / (lowest - from);
    for (const [i, r] of restPos) {
      const a = dot(sub(r, w0), axis);
      if (a < from) restPos.set(i, addS(r, axis, (a - from) * (k - 1)));
    }
    log(`  cuff drawn out from ${(lowest * 1000).toFixed(0)} to ${(cuffTo * 1000).toFixed(0)} mm`);
  }
  // His sleeve's inside, round his forearm: its radius by angle and height.
  const e1 = ortho(his.W, axis);
  const e2 = cross(axis, e1);
  const ANG = 24, STEP = 0.004;
  const sleeveR = new Map();
  let sleeveEnd = -Infinity;
  for (const v of his.sleevePoints) {
    const p = pointOf3(his.sleeve.pos, v);
    const d = sub(p, w0);
    const a = dot(d, axis);
    if (a < -0.09 || a > 0.03) continue;
    const r = Math.hypot(dot(d, e1), dot(d, e2));
    if (r > 0.09) continue;
    sleeveEnd = Math.max(sleeveEnd, a);
    const key = `${Math.round(a / STEP)},${((Math.round(Math.atan2(dot(d, e2), dot(d, e1)) / (2 * Math.PI) * ANG) % ANG) + ANG) % ANG}`;
    sleeveR.set(key, Math.min(sleeveR.get(key) ?? Infinity, r));
  }
  const MARGIN = cfg.sleeveMargin ?? 0.004;
  const allowed = (a, ang) => {
    // The sleeve's inner radius here (the nearest strips with any), less
    // the margin; past its end it opens out at 45 degrees.
    const ai = Math.round(Math.min(a, sleeveEnd) / STEP);
    const s = ((Math.round(ang / (2 * Math.PI) * ANG) % ANG) + ANG) % ANG;
    let r = Infinity;
    for (let da = -1; da <= 1; da++) for (let ds = -1; ds <= 1; ds++) {
      const x = sleeveR.get(`${ai + da},${(s + ds + ANG) % ANG}`);
      if (x !== undefined) r = Math.min(r, x);
    }
    if (r === Infinity || a > sleeveEnd + 0.015) return Infinity;
    return r - MARGIN + Math.max(0, a - sleeveEnd);
  };
  let narrowed = 0, most = 0;
  const squeeze = new Map();
  for (const [i, r] of restPos) {
    const d = sub(r, w0);
    const a = dot(d, axis);
    const x = dot(d, e1), y = dot(d, e2);
    const rad = Math.hypot(x, y);
    // (Only the cuff: what's on his forearm.)
    const lim = wts[i * B + 1] > 0.2 ? allowed(a, Math.atan2(y, x)) : Infinity;
    squeeze.set(i, rad > lim ? lim / rad : 1);
  }
  // (Spread smoothly over the cuff so straps and seams keep their shape:
  // each point takes the tightest squeeze near it, eased off with distance.)
  const list = [...restPos.keys()];
  for (const i of list) {
    const ri = restPos.get(i);
    let k = squeeze.get(i);
    for (const j of list) {
      const sj = squeeze.get(j);
      if (sj >= k) continue;
      const dist = len(sub(restPos.get(j), ri));
      if (dist > 0.012) continue;
      const ease = Math.exp(-((dist / 0.006) ** 2));
      k = Math.min(k, 1 - (1 - sj) * ease);
    }
    if (k < 1) {
      const d = sub(ri, w0);
      const a = dot(d, axis);
      const radial = addS(d, axis, -a);
      restPos.set(i, add(add(w0, mulS(axis, a)), mulS(radial, k)));
      narrowed++;
      most = Math.max(most, len(radial) * (1 - k));
    }
  }
  for (const [i, r] of restPos) pos.set(r, 3 * i);
  log(`  cuff: sleeve ends ${(sleeveEnd * 1000).toFixed(0)} mm from the wrist; ${narrowed} points narrowed to fit inside it, by up to ${(most * 1000).toFixed(1)} mm`);
}

// Median distance of each bone's points (weighted mostly to it) from the
// bone, for the glove and for his own glove; their ratios by kind.
function measureThickness(pos, wts, B, chains, his) {
  const radius = (P, J, W, count, chainsAt) => chainsAt.map((ch, c) => [0, 1, 2].map((k) => {
    const id = his.digits[c][k];
    const ds = [];
    for (let v = 0; v < count; v++) {
      let w = 0;
      for (let q = 0; q < 4; q++) if (J[4 * v + q] === id) w += W[4 * v + q];
      if (w < 0.7) continue;
      ds.push(toSegment(pointOf3(P, v), ch[k], ch[k + 1])[0]);
    }
    ds.sort((a, b) => a - b);
    return ds.length ? ds[ds.length >> 1] : NaN;
  }));
  // (The glove's own weights by bone, 4 a point, as the file's.)
  const count = pos.length / 3;
  const jointOf = [his.hand, his.twist, ...his.digits.flatMap((ids) => ids)];
  const J = new Uint16Array(count * 4), W = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) {
    const top = [...wts.subarray(v * B, v * B + B)].map((w, b) => [b, w]).sort((x, y) => y[1] - x[1]).slice(0, 4);
    top.forEach(([b, w], k) => { J[4 * v + k] = jointOf[b]; W[4 * v + k] = w; });
  }
  const glove = radius(pos, J, W, count, chains);
  const own = his.own;
  const ownChains = his.chains.map((ch) => [ch.J[0], ch.J[1], ch.J[2], addS(ch.J[2], ch.dirs[2], ch.lengths[2])]);
  const mine = radius(own.pos, own.joints, own.weights, own.pos.length / 3, ownChains);
  const ratio = (cs) => [0, 1, 2].map((k) => {
    const r = cs.map((c) => glove[c][k] / mine[c][k]).filter((x) => Number.isFinite(x));
    return +(r.reduce((a, b) => a + b, 0) / r.length).toFixed(3);
  });
  const finger = ratio([0, 1, 2, 3]);
  return {
    finger, thumb: ratio([4]), palm: finger[0],
    mm: { glove: glove.map((c) => c.map((x) => +(x * 1000).toFixed(1))), own: mine.map((c) => c.map((x) => +(x * 1000).toFixed(1))) },
  };
}
