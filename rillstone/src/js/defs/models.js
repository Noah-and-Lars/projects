// Detailed low-poly models for tools and finds, built from shaped parts
// (lathe profiles, extruded outlines, tapered handles) with vertex colours.
// Our own designs: brass-and-ash tools, spun-steel pan, stave bucket.
import * as THREE from 'three';
import { paint, merge, place } from '../render/geom.js';

const ni = (g) => (g.index ? g.toNonIndexed() : g);
const P = (geo, hex, j = 0.08, seed = 1) => paint(ni(geo), hex, j, seed);
// Colours.
const ASH = 0xd9b98a, ASH_DARK = 0xb8956a, STEEL = 0x8a949c, STEEL_DARK = 0x5f6870, STEEL_EDGE = 0xc4ccd2, BRASS = 0xc89a48, IRON = 0x4a4e54, WOOD = 0xa8743e, WOOD_DARK = 0x8a5a2e, ROPE = 0xc8b07a, LEATHER = 0x7a4a2a;

// Lathe from [radius, y] pairs.
const lathe = (pts, seg = 16, phi = 0, len = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phi, len);
// Extrude a 2D outline (in x/y) by depth along z, with a small bevel.
function extrude(outline, depth, bevel = 0.004) {
  const s = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}
// A tapered round handle along +z from z0 to z1.
const handle = (r0, r1, z0, z1, hex, seg = 8) => P(place(new THREE.CylinderGeometry(r1, r0, z1 - z0, seg), 0, 0, (z0 + z1) / 2, Math.PI / 2), hex, 0.06);
// A round rod between two points.
function rod(a, b, r, hex, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1)));
  return P(g, hex, 0.05);
}
const rivet = (x, y, z, hex = BRASS, r = 0.009) => P(place(new THREE.SphereGeometry(r, 6, 4), x, y, z), hex, 0.05);

// ---- Shovel: modelled on a real round-point shovel. Blade points +z, its
// concave (working) face is +y. The blade is bent UP toward its working face
// by the "lift" angle (about 14 degrees): that is what lets the blade lie flat
// on the ground while the shaft rises behind it, and keeps a load level when
// you carry it.
const BLADE_W = 0.125, BLADE_L = 0.34, LIFT = 0.14;
// Half-width along the blade, v = 0 at the top edge, 1 at the point.
function bladeHalfWidth(v) {
  const shoulder = 0.9 + 0.1 * Math.min(1, v / 0.06) ** 0.5;           // rounded shoulders
  if (v < 0.42) return BLADE_W * shoulder * (1 - 0.05 * v);
  const t = (v - 0.42) / 0.58;
  return BLADE_W * 0.98 * Math.pow(Math.max(0, 1 - t * t), 0.62) + 0.002 * (1 - t); // tapers to a point
}
// Height of the working face: concave across, a little dished along.
const bladeY = (x, v) => (x / BLADE_W) ** 2 * 0.028 * (1 - 0.5 * v) + v * v * 0.012;
function shovelBlade() {
  const NU = 12, NV = 16, T = 0.0045, pos = [], col = [];
  const top = new THREE.Color(STEEL), edge = new THREE.Color(STEEL_EDGE), back = new THREE.Color(0x6a737a);
  const P3 = (u, v, off) => { const hw = bladeHalfWidth(v), x = (u * 2 - 1) * hw; return [x, bladeY(x, v) + off, v * BLADE_L]; };
  const quad = (a, b, c, d, color, flip) => {
    const tris = flip ? [[a, c, b], [a, d, c]] : [[a, b, c], [a, c, d]];
    for (const t of tris) for (const p of t) { pos.push(...p); col.push(color.r, color.g, color.b); }
  };
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const u0 = i / NU, u1 = (i + 1) / NU, v0 = j / NV, v1 = (j + 1) / NV;
    // Worn bright band round the cutting edge (sides and point).
    const wear = Math.max(Math.abs(u0 + u1 - 1), v1 > 0.5 ? (v1 - 0.5) * 1.6 : 0) > 0.82;
    quad(P3(u0, v0, 0), P3(u0, v1, 0), P3(u1, v1, 0), P3(u1, v0, 0), wear ? edge : top, false);  // working face (+y)
    quad(P3(u0, v0, -T), P3(u0, v1, -T), P3(u1, v1, -T), P3(u1, v0, -T), back, true);              // back face
  }
  // Edge strip all round, so the blade has thickness.
  for (let j = 0; j < NV; j++) for (const u of [0, 1]) {
    const a = P3(u, j / NV, 0), b = P3(u, (j + 1) / NV, 0), c = P3(u, (j + 1) / NV, -T), d = P3(u, j / NV, -T);
    quad(a, b, c, d, edge, u === 1);
  }
  for (let i = 0; i < NU; i++) {
    const a = P3(i / NU, 0, 0), b = P3((i + 1) / NU, 0, 0), c = P3((i + 1) / NU, 0, -T), d = P3(i / NU, 0, -T);
    quad(a, b, c, d, back, true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
export function shovel(load) {
  const parts = [];
  // Ash shaft, slightly oval, running from the grip down into the socket.
  parts.push(handle(0.0185, 0.021, -0.42, 0.40, ASH, 10));
  // D-grip: a wooden yoke splitting from the shaft into two cheeks, joined
  // by a crossbar you hold.
  const Y0 = [0, 0, -0.43], CL = [-0.052, 0, -0.545], CR = [0.052, 0, -0.545];
  parts.push(rod(Y0, CL, 0.012, ASH_DARK), rod(Y0, CR, 0.012, ASH_DARK));
  parts.push(rod([-0.062, 0, -0.548], [0.062, 0, -0.548], 0.0155, ASH));
  for (const c of [CL, CR]) parts.push(P(place(new THREE.SphereGeometry(0.0145, 8, 6), c[0], c[1], c[2] - 0.003), ASH_DARK, 0.05));
  parts.push(P(place(lathe([[0.02, 0], [0.023, 0.006], [0.023, 0.028], [0.02, 0.034]], 10), 0, 0, -0.43, Math.PI / 2), BRASS, 0.04)); // ferrule
  // Socket: a steel tube round the shaft end, tapering out and flattening
  // where it meets the blade's top edge.
  const sock = lathe([[0.0215, 0], [0.0225, 0.11], [0.027, 0.15], [0.038, 0.18]], 14);
  place(sock, 0, 0, 0.36, Math.PI / 2);
  { const p = sock.attributes.position; for (let i = 0; i < p.count; i++) { const zz = p.getZ(i); if (zz > 0.49) { const f = Math.min(1, (zz - 0.49) / 0.05); p.setY(i, p.getY(i) * (1 - 0.65 * f) - 0.006 * f); } } }
  parts.push(P(sock, STEEL_DARK, 0.04, 5));
  for (const z of [0.4, 0.45]) parts.push(rivet(0, 0.023, z, STEEL_EDGE, 0.0065), rivet(0, -0.023, z, STEEL_EDGE, 0.0065));
  // Blade, joined just under the socket's flattened end, dipped by the lift.
  const bladeAt = (g) => place(g, 0, -0.008, 0.535, -LIFT); // negative x-rotation tips +z toward +y (up)
  parts.push(bladeAt(shovelBlade()));
  // Frog: a tapered strap on the back of the blade, from the socket down to mid-blade.
  { const f = new THREE.CylinderGeometry(0.004, 0.02, 0.15, 6, 1); f.scale(1, 1, 0.35); place(f, 0, -0.008, 0.075, Math.PI / 2); parts.push(P(bladeAt(f), STEEL_DARK, 0.04, 8)); }
  // Rolled footsteps along the top edge either side of the socket.
  for (const s of [-1, 1]) { const st = new THREE.CylinderGeometry(0.0075, 0.0075, 0.085, 7); place(st, s * 0.075, bladeY(s * 0.075, 0) + 0.004, 0.004, 0, 0, Math.PI / 2); parts.push(P(bladeAt(st), STEEL_DARK, 0.04, 9 + s)); }
  if (load) { const l = new THREE.DodecahedronGeometry(0.07, 1); l.translate(0, 0.066, 0); place(l, 0, 0.004, 0.15, 0, 0, 0, 1.3, 0.36, 1.45); parts.push(P(bladeAt(l), load, 0.3, 9)); } // a heap sitting on the working face
  return merge(parts);
}
function rivetRing(parts, z, r) { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; parts.push(rivet(Math.cos(a) * r, Math.sin(a) * r, z)); } }

// ---- Pan: spun steel with a rolled rim, riffle rings and two ears.
export function pan(fillFrac, fill, finds = 0) {
  const parts = [];
  const prof = [[0, -0.035], [0.13, -0.035], [0.14, -0.03], [0.205, 0.02], [0.235, 0.035], [0.245, 0.04], [0.25, 0.035]];
  parts.push(P(lathe(prof, 22), STEEL, 0.05, 2));
  parts.push(P(lathe(prof.map(([r, y]) => [Math.max(0, r - 0.006), y + 0.004]).reverse(), 22), STEEL_DARK, 0.05, 3));
  parts.push(P(new THREE.TorusGeometry(0.247, 0.008, 5, 26).rotateX(Math.PI / 2).translate(0, 0.04, 0), STEEL_EDGE, 0.04));
  // Riffle rings: catch heavy finds.
  for (const r of [0.165, 0.185]) parts.push(P(new THREE.TorusGeometry(r, 0.004, 3, 24).rotateX(Math.PI / 2).translate(0, -0.005 + (r - 0.165) * 0.8, 0), STEEL_DARK, 0.04));
  for (const s of [-1, 1]) parts.push(P(place(new THREE.BoxGeometry(0.05, 0.008, 0.03), s * 0.265, 0.038, 0), STEEL_DARK, 0.04));
  if (fillFrac > 0) parts.push(P(lathe([[0, -0.03], [0.13, -0.03], [0.14 + 0.06 * fillFrac, -0.03 + 0.04 * fillFrac], [0, -0.025 + 0.045 * fillFrac]], 14), fill, 0.25, 7));
  else if (finds) parts.push(P(lathe([[0, -0.031], [0.12, -0.031], [0, -0.028]], 14), 0x6a6a66, 0.2, 8)); // black sand
  return merge(parts);
}

// ---- Bucket: 14 wooden staves, two iron hoops, an iron bail with a wooden grip.
export function bucket(fillFrac, fill) {
  const parts = [], N = 14;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, w = 2 * Math.PI * 0.16 / N;
    const stave = new THREE.BoxGeometry(w * 1.02, 0.34, 0.018);
    // Taper: narrower at the bottom.
    const p = stave.attributes.position; for (let k = 0; k < p.count; k++) if (p.getY(k) < 0) p.setX(k, p.getX(k) * 0.84);
    place(stave, 0, 0, 0);
    stave.translate(0, 0, 0);
    const m = new THREE.Matrix4().makeRotationY(-a).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.15));
    // Lean the stave in toward the base.
    stave.applyMatrix4(new THREE.Matrix4().makeRotationX(0.07));
    stave.applyMatrix4(m);
    parts.push(P(stave, i % 3 === 0 ? WOOD_DARK : WOOD, 0.12, i + 1));
  }
  parts.push(P(new THREE.CylinderGeometry(0.128, 0.128, 0.02, 14).translate(0, -0.15, 0), WOOD_DARK, 0.1));
  for (const [y, r] of [[0.11, 0.166], [-0.1, 0.142]]) parts.push(P(new THREE.CylinderGeometry(r, r - 0.004, 0.028, 18, 1, true).translate(0, y, 0), IRON, 0.05));
  // Bail: half torus with ears and a wooden grip.
  parts.push(P(new THREE.TorusGeometry(0.17, 0.006, 4, 16, Math.PI).translate(0, 0.15, 0), IRON, 0.04));
  for (const s of [-1, 1]) parts.push(P(place(new THREE.BoxGeometry(0.02, 0.04, 0.012), s * 0.168, 0.14, 0), IRON, 0.04));
  parts.push(P(place(new THREE.CylinderGeometry(0.014, 0.014, 0.09, 8), 0, 0.32, 0, 0, 0, Math.PI / 2), ASH_DARK, 0.05));
  if (fillFrac > 0) parts.push(P(lathe([[0, -0.14], [0.125, -0.14], [0.125 + 0.03 * fillFrac, -0.14 + 0.27 * fillFrac], [0.06, -0.12 + 0.3 * fillFrac], [0, -0.115 + 0.31 * fillFrac]], 14), fill, 0.25, 7));
  return merge(parts);
}

// ---- Pick: forged head with a tapered spike and a chisel blade, wedged eye, leather grip.
export function pick() {
  const parts = [];
  parts.push(handle(0.02, 0.026, -0.42, 0.42, ASH));
  for (const z of [-0.36, -0.3, -0.24]) parts.push(P(place(new THREE.CylinderGeometry(0.023, 0.023, 0.05, 8), 0, 0, z, Math.PI / 2), LEATHER, 0.08)); // grip wrap
  // Head: a forged arc across the top of the handle, tapering to a point on
  // one side and a flat chisel on the other.
  parts.push(P(place(new THREE.BoxGeometry(0.07, 0.07, 0.075), 0, 0, 0.42), IRON, 0.05)); // eye
  const R = 0.62, SEG = 7;
  for (const side of [1, -1]) for (let i = 0; i < SEG; i++) {
    const t0 = i / SEG, t1 = (i + 1) / SEG, a0 = t0 * 0.5, a1 = t1 * 0.5;
    const x0 = Math.sin(a0) * R, y0 = R - Math.cos(a0) * R, x1 = Math.sin(a1) * R, y1 = R - Math.cos(a1) * R;
    const len = Math.hypot(x1 - x0, y1 - y0) * 1.08;
    const thick = side > 0 ? 0.05 * (1 - t0 * 0.85) : 0.05 * (1 - t0 * 0.55);
    const wide = side > 0 ? 0.045 * (1 - t0 * 0.8) : 0.045 + t0 * 0.03; // the chisel flares
    const seg = new THREE.BoxGeometry(len, thick, wide);
    place(seg, side * (x0 + x1) / 2, -(y0 + y1) / 2, 0.42, 0, 0, side * -Math.atan2(y1 - y0, x1 - x0));
    parts.push(P(seg, i === SEG - 1 ? STEEL_EDGE : STEEL_DARK, 0.06, i + side * 10));
  }
  parts.push(P(place(new THREE.BoxGeometry(0.012, 0.085, 0.03), 0, 0.03, 0.42), BRASS, 0.04)); // wedge
  return merge(parts);
}

// ---- Finds ----
// Lumpy nugget: subdivided, displaced, with darker crevices (vertex AO).
// Nuggets also differ in shape by metal: 'lump' (lobed), 'block' (angular),
// 'flake' (flat), 'pebble' (smooth), 'shard' (spiky).
export function nugget(seed = 3, form = 'lump') {
  if (form === 'block') { let g = new THREE.DodecahedronGeometry(0.5, 0).scale(1.15, 0.75, 0.85); if (g.index) g = g.toNonIndexed(); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(0.85), 3)); g.computeVertexNormals(); return g; }
  if (form === 'shard') {
    const parts = [];
    for (let i = 0; i < 4; i++) parts.push(P(place(new THREE.OctahedronGeometry(0.28, 0).scale(0.6, 1.4, 0.6), Math.cos(i * 1.7) * 0.15, 0, Math.sin(i * 1.7) * 0.15, Math.cos(i) * 0.5, i, Math.sin(i) * 0.5), 0xffffff, 0.15, i + 1));
    return merge(parts);
  }
  const g = new THREE.IcosahedronGeometry(0.5, form === 'pebble' ? 2 : 1);
  const p = g.attributes.position, map = new Map();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const lobes = Array.from({ length: 3 }, () => new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 0.6, rnd() - 0.5).normalize());
  const v = new THREE.Vector3(), cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!map.has(k)) {
      const dir = v.clone().normalize();
      let f = form === 'pebble' ? 0.95 + rnd() * 0.06 : 0.78 + rnd() * 0.22;
      if (form !== 'pebble') for (const l of lobes) f += Math.max(0, dir.dot(l)) ** 3 * 0.35;
      map.set(k, f);
    }
    const f = map.get(k);
    const fy = form === 'flake' ? 0.3 : form === 'pebble' ? 0.62 : 0.7, fx = form === 'flake' ? 1.25 : 1;
    p.setXYZ(i, v.x * f * fx, v.y * f * fy, v.z * f);
    const shade = 0.62 + Math.min(1, (f - 0.78) / 0.5) * 0.45;
    cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}
// Rough crystal cluster (uncut gems, quartz): hexagonal prisms with points.
export function crystals(seed = 5, n = 4) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const h = 0.45 + rnd() * 0.5, r = 0.1 + rnd() * 0.08;
    const prism = lathe([[0, 0], [r, 0.02], [r, h], [0, h + r * 1.6]], 6);
    place(prism, (rnd() - 0.5) * 0.3, -0.3, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.9, rnd() * 6, (rnd() - 0.5) * 0.9);
    parts.push(P(prism, i === 0 ? 0xffffff : 0xe0e0e0, 0.12, i + 1));
  }
  parts.push(P(new THREE.DodecahedronGeometry(0.22, 0).scale(1, 0.5, 1).translate(0, -0.32, 0), 0x9a948a, 0.2, 9)); // matrix rock
  return merge(parts);
}
// Brilliant-style cut gem (cut stage, M5).
export function cutGem() {
  const g = lathe([[0, -0.42], [0.5, 0.0], [0.5, 0.06], [0.34, 0.2], [0, 0.2]], 8);
  return P(g, 0xffffff, 0.04);
}
// Dirt clod: a lumpy clump with a few pebbles.
export function clod(hex) {
  const base = nugget(11);
  base.scale(0.42, 0.42, 0.42);
  const c = new THREE.Color(hex), col = base.attributes.color;
  for (let i = 0; i < col.count; i++) { const s = col.getX(i); col.setXYZ(i, c.r * s, c.g * s, c.b * s); }
  const parts = [base, P(place(new THREE.DodecahedronGeometry(0.04, 0), 0.12, 0.06, 0.05), 0x8a8a84, 0.2, 3), P(place(new THREE.DodecahedronGeometry(0.03, 0), -0.1, 0.07, -0.06), 0x9a948a, 0.2, 4)];
  return merge(parts);
}

// ---- Workshop tools ----
export function mallet() {
  return merge([handle(0.017, 0.02, -0.25, 0.22, ASH, 8), P(place(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), 0, 0, 0.27, 0, 0, Math.PI / 2), 0xb88a5a, 0.08), ...[-1, 1].map(s2 => P(place(new THREE.CylinderGeometry(0.062, 0.062, 0.02, 10), s2 * 0.09, 0, 0.27, 0, 0, Math.PI / 2), BRASS, 0.04))]);
}
export function wrench() {
  const parts = [P(place(new THREE.BoxGeometry(0.03, 0.012, 0.32), 0, 0, 0), STEEL, 0.05)];
  parts.push(P(place(new THREE.TorusGeometry(0.035, 0.012, 6, 12, Math.PI * 1.5), 0, 0, 0.19, Math.PI / 2, 0, Math.PI * 0.25), STEEL, 0.04));
  parts.push(P(place(new THREE.TorusGeometry(0.028, 0.011, 6, 12), 0, 0, -0.18, Math.PI / 2), STEEL, 0.04));
  return merge(parts);
}
export function repairKit() {
  return merge([P(place(new THREE.BoxGeometry(0.34, 0.18, 0.2), 0, 0, 0), 0x7a4a2a, 0.08), P(place(new THREE.BoxGeometry(0.36, 0.04, 0.22), 0, 0.08, 0), 0x5a3a20, 0.06), P(place(new THREE.TorusGeometry(0.06, 0.012, 4, 10, Math.PI), 0, 0.11, 0), BRASS, 0.04), P(place(new THREE.BoxGeometry(0.05, 0.05, 0.01), 0.1, 0.0, 0.105), BRASS, 0.03)]);
}
// A coil of pipe.
export function coil(hex) {
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push(P(place(new THREE.TorusGeometry(0.2, 0.03, 6, 16), 0, 0.03 + i * 0.055, 0, Math.PI / 2), hex, 0.05, i));
  parts.push(P(place(new THREE.BoxGeometry(0.06, 0.25, 0.03), 0.2, 0.12, 0), 0x8a6a3a, 0.05));
  return merge(parts);
}
// An ingot bar (unit size; scaled per item).
// Ingot casts differ by metal so they read without colour (M8 accessibility):
// 'trap' the classic trapezoid, 'bar' a plain block, 'round' a rounded loaf,
// 'hex' a hexagonal bar.
const mergeG = (a, b) => { const A = a.index ? a.toNonIndexed() : a, B = b.index ? b.toNonIndexed() : b, pos = new Float32Array(A.attributes.position.count * 3 + B.attributes.position.count * 3); pos.set(A.attributes.position.array); pos.set(B.attributes.position.array, A.attributes.position.count * 3); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return g; };
export function ingot(form = 'trap') {
  let g;
  if (form === 'bar') g = new THREE.BoxGeometry(1.15, 0.3, 0.55);
  else if (form === 'round') g = new THREE.CylinderGeometry(0.3, 0.3, 1.1, 8, 1).rotateZ(Math.PI / 2).scale(1, 0.62, 1);
  else if (form === 'hex') g = new THREE.CylinderGeometry(0.3, 0.3, 1.1, 6, 1).rotateZ(Math.PI / 2).scale(1, 0.75, 1);
  // Glimmerite: a long triangular prism; emberite: a stepped double block.
  else if (form === 'tri') g = new THREE.CylinderGeometry(0.36, 0.36, 1.1, 3, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 6).scale(1, 0.7, 1);
  else if (form === 'step') g = mergeG(new THREE.BoxGeometry(1.15, 0.2, 0.6), new THREE.BoxGeometry(0.8, 0.16, 0.42).translate(0, 0.18, 0));
  else g = new THREE.CylinderGeometry(0.42, 0.55, 0.3, 4, 1).rotateY(Math.PI / 4).scale(1.2, 1, 0.6);
  g.computeVertexNormals();
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new Float32Array(ng.attributes.position.count * 3).fill(1);
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3)); return ng;
}
// Crafted goods (unit size).
export function crafted(kind) {
  if (kind === 'ring') return merge([P(new THREE.TorusGeometry(0.32, 0.1, 8, 20), 0xffffff, 0.02)]);
  if (kind === 'chain') return merge([0, 1, 2, 3].map(i => P(place(new THREE.TorusGeometry(0.16, 0.05, 6, 12), 0, 0, -0.36 + i * 0.24, 0, i % 2 ? Math.PI / 2 : 0, 0), 0xffffff, 0.02, i)));
  if (kind === 'chalice') return merge([P(new THREE.LatheGeometry([[0, -0.4], [0.24, -0.4], [0.24, -0.35], [0.05, -0.3], [0.05, 0.05], [0.28, 0.2], [0.32, 0.45], [0.29, 0.45], [0.25, 0.22], [0, 0.12]].map(([x, y]) => new THREE.Vector2(x, y)), 12), 0xffffff, 0.02)]);
  return merge([P(place(new THREE.BoxGeometry(0.6, 0.18, 0.3), 0, 0, 0), 0xffffff, 0.02), P(place(new THREE.ConeGeometry(0.15, 0.3, 4), 0.42, 0, 0, 0, 0, -Math.PI / 2), 0xffffff, 0.02)]); // tool head
}

// The Old Cut relic: the Pumphouse's brass flyball governor, green with age.
export function governor() {
  const AGED = 0x9a8a50, VERD = 0x6a9a7a;
  const parts = [
    P(lathe([[0, 0], [0.14, 0], [0.15, 0.03], [0.1, 0.05], [0.05, 0.07], [0.04, 0.1], [0, 0.1]], 14), IRON, 0.1, 2),
    rod([0, 0.08, 0], [0, 0.5, 0], 0.014, AGED),
    P(lathe([[0, 0], [0.04, 0], [0.045, 0.03], [0.03, 0.05], [0, 0.05]], 10), AGED, 0.1, 3).translate(0, 0.46, 0),
    P(place(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), 0, 0.22, 0), AGED, 0.1, 4),
  ];
  for (const s of [-1, 1]) {
    const ball = [s * 0.17, 0.3, 0];
    parts.push(rod([0, 0.47, 0], ball, 0.008, AGED), rod([0, 0.22, 0], [s * 0.09, 0.36, 0], 0.007, AGED));
    parts.push(P(place(new THREE.SphereGeometry(0.05, 10, 8), ...ball), VERD, 0.18, 5 + s));
  }
  parts.push(P(place(new THREE.TorusGeometry(0.06, 0.01, 6, 14), 0, 0.12, 0, Math.PI / 2), AGED, 0.1, 9));
  return merge(parts);
}

// The Prospector's Lamp: a brass hand lamp with a violet-tinted lens.
export function prospectorLamp() {
  const parts = [
    P(lathe([[0, 0], [0.07, 0], [0.075, 0.02], [0.06, 0.03], [0.06, 0.05], [0, 0.05]], 14), BRASS, 0.08, 1),
    P(place(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12, 1, true), 0, 0.11, 0), 0xb8a8f0, 0.05, 2),
    ...[0, 1, 2, 3].map(i => rod([Math.cos(i * 1.57) * 0.055, 0.05, Math.sin(i * 1.57) * 0.055], [Math.cos(i * 1.57) * 0.055, 0.17, Math.sin(i * 1.57) * 0.055], 0.006, BRASS)),
    P(lathe([[0, 0], [0.065, 0], [0.04, 0.04], [0.015, 0.06], [0, 0.06]], 12), BRASS, 0.08, 3).translate(0, 0.17, 0),
    P(place(new THREE.TorusGeometry(0.05, 0.006, 6, 14, Math.PI), 0, 0.24, 0), IRON, 0.05, 4),
  ];
  return merge(parts);
}

// ---- Camp gear (M8 brief gaps): bedroll, brass lantern, hand scale, firewood.
// A rolled canvas bedroll with two leather straps.
export function bedroll() {
  const CANVAS = 0x6f7f5a, STRAP = 0x5a3a22;
  const parts = [P(place(new THREE.CylinderGeometry(0.13, 0.13, 0.62, 14), 0, 0.13, 0, 0, 0, Math.PI / 2), CANVAS, 0.1, 5)];
  for (const x of [-0.18, 0.18]) parts.push(P(place(new THREE.TorusGeometry(0.135, 0.012, 5, 16), x, 0.13, 0, 0, Math.PI / 2, 0), STRAP, 0.06, 6));
  parts.push(P(place(new THREE.CircleGeometry(0.125, 14), 0.311, 0.13, 0, 0, Math.PI / 2, 0), 0x8a9a70, 0.12, 7));
  parts.push(P(place(new THREE.CircleGeometry(0.125, 14), -0.311, 0.13, 0, 0, -Math.PI / 2, 0), 0x8a9a70, 0.12, 8));
  return merge(parts);
}
// A brass storm lantern: base, glass chimney, cage wires, cap and bail.
export function lantern() {
  const parts = [
    P(lathe([[0, 0], [0.07, 0], [0.075, 0.015], [0.06, 0.04], [0.045, 0.05], [0, 0.05]], 14), BRASS, 0.08, 11),
    P(place(new THREE.CylinderGeometry(0.04, 0.045, 0.13, 12, 1, true), 0, 0.115, 0), 0xfff0c0, 0.04, 12),
    ...[0, 1, 2, 3].map(i => rod([Math.cos(i * 1.57 + 0.78) * 0.05, 0.05, Math.sin(i * 1.57 + 0.78) * 0.05], [Math.cos(i * 1.57 + 0.78) * 0.05, 0.18, Math.sin(i * 1.57 + 0.78) * 0.05], 0.005, BRASS)),
    P(lathe([[0, 0], [0.06, 0], [0.035, 0.035], [0.012, 0.05], [0, 0.05]], 12), BRASS, 0.08, 13).translate(0, 0.18, 0),
    P(place(new THREE.TorusGeometry(0.055, 0.005, 5, 14, Math.PI), 0, 0.235, 0), IRON, 0.05, 14),
  ];
  return merge(parts);
}
// A hand scale: a brass pan hanging from a spring balance with a dial.
export function handScale() {
  const parts = [
    P(lathe([[0, 0], [0.09, 0.0], [0.1, 0.02], [0.095, 0.025], [0, 0.012]], 16), BRASS, 0.08, 21),
    ...[0, 1, 2].map(i => rod([Math.cos(i * 2.09) * 0.085, 0.02, Math.sin(i * 2.09) * 0.085], [0, 0.2, 0], 0.003, IRON)),
    P(place(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10), 0, 0.26, 0), STEEL, 0.05, 22),
    P(place(new THREE.CylinderGeometry(0.045, 0.045, 0.015, 16), 0, 0.27, 0.032, Math.PI / 2), 0xf2ead8, 0.03, 23),
    P(place(new THREE.TorusGeometry(0.02, 0.005, 5, 12), 0, 0.345, 0), IRON, 0.05, 24),
  ];
  return merge(parts);
}
// A bundle of split firewood tied with twine.
export function firewood() {
  const parts = [];
  const logs = [[-0.05, 0.05], [0.05, 0.05], [0, 0.13], [-0.1, 0.13], [0.1, 0.13], [0, 0.04]];
  logs.slice(0, 5).forEach(([x, y], i) => parts.push(P(place(new THREE.CylinderGeometry(0.045, 0.05, 0.42, 6), x, y, 0, Math.PI / 2, 0, i * 0.4), i % 2 ? WOOD : WOOD_DARK, 0.12, 30 + i)));
  for (const z of [-0.12, 0.12]) parts.push(P(place(new THREE.TorusGeometry(0.12, 0.006, 4, 14), 0, 0.1, z), 0xc8b88a, 0.05, 40));
  return merge(parts);
}

// ---- Gems by shape (colour-blind safe, BUILD_BRIEF M8): each gem has its
// own rough habit and its own cut, so they read without colour.
// Rough: garnet a rounded dodecahedron, peridot a stubby squat prism,
// aquamarine one long hexagonal column, starstone a spiky star cluster.
export function gemRough(form, seed = 5) {
  const rock = P(new THREE.DodecahedronGeometry(0.22, 0).scale(1, 0.5, 1).translate(0, -0.32, 0), 0x9a948a, 0.2, 9);
  if (form === 'dodeca') return merge([P(new THREE.DodecahedronGeometry(0.3, 0).translate(0, -0.02, 0), 0xffffff, 0.1, seed), rock]);
  if (form === 'column') return merge([P(lathe([[0, 0], [0.13, 0.02], [0.13, 0.62], [0, 0.78]], 6), 0xffffff, 0.08, seed).translate(0, -0.34, 0).rotateZ(0.25), rock]);
  if (form === 'squat') {
    const parts = [];
    for (const [x, z, h] of [[0, 0, 0.32], [0.14, 0.06, 0.24], [-0.12, 0.1, 0.22]]) parts.push(P(new THREE.BoxGeometry(0.17, h, 0.17).translate(x, -0.3 + h / 2 + 0.05, z).rotateY(x * 3), 0xffffff, 0.1, seed));
    return merge([...parts, rock]);
  }
  if (form === 'star') {
    const parts = [];
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; parts.push(P(new THREE.ConeGeometry(0.07, 0.42, 4).translate(0, 0.21, 0).rotateZ(Math.PI / 2 - 0.3).rotateY(a).translate(0, -0.08, 0), 0xffffff, 0.08, seed + i)); }
    parts.push(P(new THREE.IcosahedronGeometry(0.14, 0).translate(0, -0.08, 0), 0xffffff, 0.08, seed));
    return merge([...parts, rock]);
  }
  return crystals(seed, 3);
}
// Cuts: garnet a round brilliant, peridot a rectangular step cut,
// aquamarine a long oval, starstone a six-pointed star cut.
export function gemCut(form) {
  if (form === 'step') { const g = new THREE.CylinderGeometry(0.36, 0.5, 0.26, 4, 1).rotateY(Math.PI / 4).scale(1.25, 1, 0.8); const p = new THREE.CylinderGeometry(0.5, 0.06, 0.32, 4, 1).rotateY(Math.PI / 4).scale(1.25, 1, 0.8).translate(0, -0.29, 0); return merge([P(g, 0xffffff, 0.04), P(p, 0xffffff, 0.04, 2)]); }
  if (form === 'oval') return P(lathe([[0, -0.4], [0.42, -0.02], [0.42, 0.05], [0.28, 0.18], [0, 0.18]], 10).scale(1.45, 1, 0.8), 0xffffff, 0.04);
  if (form === 'star') { const s = new THREE.Shape(); for (let i = 0; i < 12; i++) { const r = i % 2 ? 0.24 : 0.5, a = i * Math.PI / 6; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } const g = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 1 }); g.rotateX(-Math.PI / 2); return P(g, 0xffffff, 0.04); }
  return cutGem();
}
