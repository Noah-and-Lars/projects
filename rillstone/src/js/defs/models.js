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
const rivet = (x, y, z, hex = BRASS, r = 0.009) => P(place(new THREE.SphereGeometry(r, 6, 4), x, y, z), hex, 0.05);

// ---- Shovel: ash shaft, D-grip, brass collar, dished steel blade. Blade points +z.
export function shovel(load) {
  const parts = [];
  parts.push(handle(0.019, 0.023, -0.36, 0.42, ASH));
  // D-grip: two cheeks and a crossbar.
  parts.push(P(place(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), 0, 0, -0.42, Math.PI / 2, 0, Math.PI), ASH_DARK, 0.06));
  parts.push(P(place(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8), 0, 0, -0.48, 0, 0, Math.PI / 2), ASH, 0.05));
  // Brass collar + steel socket tapering into the blade.
  parts.push(P(place(lathe([[0.024, 0], [0.027, 0.01], [0.027, 0.05], [0.024, 0.06]], 10), 0, 0, 0.4, Math.PI / 2), BRASS, 0.05));
  parts.push(P(place(lathe([[0.024, 0], [0.03, 0.06], [0.05, 0.12]], 10), 0, 0, 0.46, Math.PI / 2), STEEL_DARK, 0.05));
  rivetRing(parts, 0.43, 0.028);
  // Blade: rounded point outline, dished by bending the sides up.
  const outline = [[-0.12, 0], [-0.04, -0.015], [0.04, -0.015], [0.12, 0], [0.135, 0.1], [0.12, 0.19], [0.075, 0.26], [0, 0.31], [-0.075, 0.26], [-0.12, 0.19], [-0.135, 0.1]];
  const blade = extrude(outline, 0.008, 0.002);
  const p = blade.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, p.getZ(i) + x * x * 3.4 - y * y * 0.25); }
  blade.computeVertexNormals();
  // The outline's +y (the tip) must point down the handle (+z).
  parts.push(P(place(blade, 0, -0.01, 0.55, Math.PI / 2 - 0.12), STEEL, 0.06, 4));
  // Centre ridge (the frog) running from the socket down the blade.
  { const r = new THREE.CylinderGeometry(0.003, 0.012, 0.14, 5); place(r, 0, 0.004, 0.62, Math.PI / 2 - 0.12); parts.push(P(r, STEEL_DARK, 0.05)); }
  // Worn bright edge and a rolled step on top of the blade.
  parts.push(P(place(new THREE.BoxGeometry(0.22, 0.012, 0.02), 0, 0.004, 0.555, -0.12), STEEL_DARK, 0.04)); // rolled step
  parts.push(P(place(new THREE.TorusGeometry(0.1, 0.006, 3, 10, Math.PI * 0.7), 0, -0.012, 0.75, -Math.PI / 2 - 0.12, 0, Math.PI * 0.15 - Math.PI), STEEL_EDGE, 0.03)); // worn bright tip
  if (load) parts.push(P(place(new THREE.DodecahedronGeometry(0.09, 1), 0, 0.03, 0.7, 0, 0, 0, 1.25, 0.45, 1.4), load, 0.3, 9));
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
export function nugget(seed = 3) {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
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
      let f = 0.78 + rnd() * 0.22;
      for (const l of lobes) f += Math.max(0, dir.dot(l)) ** 3 * 0.35;
      map.set(k, f);
    }
    const f = map.get(k);
    p.setXYZ(i, v.x * f, v.y * f * 0.7, v.z * f);
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
