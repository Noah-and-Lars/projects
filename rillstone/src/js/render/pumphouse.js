// The old Rillstone Pumphouse: a stone engine house on the bank with a wheel
// over the river. Each restoration stage shows a new part. Local frame: +x
// faces away from the river (toward town), the wheel hangs at -x.
import * as THREE from 'three';
import { paint, merge, place } from './geom.js';

const STONE = 0xa8a090, STONE_D = 0x8a8274, MOSS = 0x6a7a4a, SLATE = 0x56616e, SLATE2 = 0x4a5460, WOOD = 0xb07a44, WOOD_D = 0x7a5232, BRASS = 0xc89a48, GOLD = 0xe8b830, VIOLET = 0x7a5ad8, IRON = 0x4a4e54;
const P = (g, hex, j = 0.08, s = 1) => paint(g.index ? g.toNonIndexed() : g, hex, j, s);
const B = (w, h, d, x, y, z, hex, j = 0.08, s = 1, ry = 0) => P(place(new THREE.BoxGeometry(w, h, d), x, y, z, 0, ry), hex, j, s);
function rod(a, b, r, hex, seg = 8) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(Bv).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1)));
  return P(g, hex, 0.05);
}
const W = 9, D = 8, H = 5; // footprint (x by z) and wall height

// Coursed stone walls up to height h(x, z) per block (ragged for the ruin).
function walls(hOf, seed) {
  const parts = [];
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const course = 0.5, block = 0.9;
  const side = (len, fn) => {
    for (let u = -len / 2 + block / 2; u < len / 2; u += block) {
      const top = hOf(u, rnd);
      for (let y = 0; y < top; y += course) {
        const off = (Math.floor(y / course) % 2) * block / 2;
        const ww = block - 0.04, hh = Math.min(course, top - y) - 0.03;
        parts.push(fn(u + off * 0, y + hh / 2, ww, hh, rnd() < 0.15 ? MOSS : rnd() < 0.5 ? STONE : STONE_D, parts.length));
      }
    }
  };
  side(W, (u, y, ww, hh, c, i) => B(ww, hh, 0.5, u, y, -D / 2, c, 0.1, i));
  side(W, (u, y, ww, hh, c, i) => B(ww, hh, 0.5, u, y, D / 2, c, 0.1, i));
  side(D - 0.5, (u, y, ww, hh, c, i) => B(0.5, hh, ww, -W / 2 + 0.25, y, u, c, 0.1, i));
  side(D - 0.5, (u, y, ww, hh, c, i) => B(0.5, hh, ww, W / 2 - 0.25, y, u, c, 0.1, i));
  return merge(parts);
}

export function pumphouseParts() {
  const parts = {};
  // Stage 0: the ruin. Broken walls, rubble, a rotten wheel hub.
  parts.ruin = merge([
    walls((u, r) => Math.max(0.5, 1.6 + Math.sin(u * 1.7) * 1.2 + r() * 1.4), 7),
    ...[[-2, 1], [1.5, -2], [3, 2], [-3.4, -2.6]].map(([x, z], i) => P(place(new THREE.DodecahedronGeometry(0.4 + i * 0.08, 0), x, 0.25, z, i, i * 2, 0), STONE_D, 0.15, i)),
    rod([-W / 2 - 1.2, 2.2, -0.5], [-W / 2 - 1.2, 2.2, 0.5], 0.18, WOOD_D),
    B(0.2, 1.6, 0.3, -W / 2 - 1.2, 1.4, 0.7, WOOD_D, 0.1, 3, 0.4),
  ]);
  // Stage 1: walls whole again, a lintelled door, the wheel race.
  parts.walls = merge([
    walls(() => H, 11),
    B(1.6, 0.3, 0.6, W / 2 - 0.25, 2.4, 0, STONE_D, 0.06, 2, Math.PI / 2),
    B(0.1, 2.2, 1.4, W / 2 + 0.01, 1.1, 0, WOOD_D, 0.08, 3),
    ...[-2.6, 2.6].map((z, i) => B(0.1, 1.0, 1.0, W / 2 + 0.01, 3.0, z, 0x2a3a44, 0.05, 4 + i)),
    B(3.2, 0.4, 2.4, -W / 2 - 1.2, -0.6, 0, STONE_D, 0.1, 6),
    B(0.4, 3, 0.4, -W / 2 - 1.2, 1.5, -1.3, STONE, 0.1, 7), B(0.4, 3, 0.4, -W / 2 - 1.2, 1.5, 1.3, STONE, 0.1, 8),
  ]);
  // Stage 2: the slate roof, with the brass governor on the ridge.
  const roof = [];
  const slope = Math.hypot(D / 2 + 0.4, 2.2), ang = Math.atan2(2.2, D / 2 + 0.4);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4; roof.push(P(place(new THREE.BoxGeometry(W + 0.8, 0.1, slope / 4 + 0.05), 0, H + 2.2 * (1 - t) + 0.05, s * (D / 2 + 0.4) * t, s * ang, 0, 0), k % 2 ? SLATE : SLATE2, 0.08, k + s * 9)); }
  for (const x of [-W / 2 + 0.25, W / 2 - 0.25]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([x, H, -D / 2, x, H + 2.2, 0, x, H, D / 2, x, H, D / 2, x, H + 2.2, 0, x, H, -D / 2], 3)); roof.push(P(g, STONE, 0.06)); }
  roof.push(rod([0, H + 2.3, 0], [0, H + 3.0, 0], 0.03, BRASS));
  for (const s of [-1, 1]) roof.push(P(place(new THREE.SphereGeometry(0.12, 8, 6), s * 0.32, H + 2.75, 0), BRASS, 0.08), rod([0, H + 3.0, 0], [s * 0.32, H + 2.75, 0], 0.015, BRASS));
  parts.roof = merge(roof);
  // Stage 3: the great wheel's frame (the wheel itself spins, see wheel()).
  // The axle runs out from the wall (along x) over the bank to an outer post.
  const WX = WHEEL.x, WY = WHEEL.y;
  parts.frame = merge([
    rod([-W / 2, WY, 0], [WX - 1.3, WY, 0], 0.11, IRON),
    B(0.4, WY + 3.2, 0.4, WX - 1.3, (WY - 3.2) / 2, 0, STONE_D, 0.08, 9),
    B(0.4, WY + 3.2, 0.4, -W / 2 - 0.4, (WY - 3.2) / 2, 0, STONE_D, 0.08, 10),
    P(place(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 12), WX - 1.3, WY, 0, 0, 0, Math.PI / 2), GOLD, 0.05),
    P(place(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 12), -W / 2 - 0.4, WY, 0, 0, 0, Math.PI / 2), GOLD, 0.05),
  ]);
  // Stage 4: glimmer-lined pump barrels and pipes along the town-side wall.
  parts.lining = merge([
    // Along the downstream (+z) wall, clear of the door and the sign.
    ...[-2.4, 2.4].map((x, i) => P(place(new THREE.CylinderGeometry(0.45, 0.45, 2.4, 14), x, 1.2, D / 2 + 0.7), VIOLET, 0.06, i)),
    ...[-2.4, 2.4].map(x => rod([x, 2.4, D / 2 + 0.7], [x, 3.4, D / 2 + 0.7], 0.12, VIOLET)),
    rod([-2.4, 3.4, D / 2 + 0.7], [2.4, 3.4, D / 2 + 0.7], 0.12, VIOLET),
    ...[-2.4, 2.4].map(x => P(place(new THREE.TorusGeometry(0.46, 0.04, 6, 16), x, 2.0, D / 2 + 0.7, Math.PI / 2), BRASS, 0.04)),
  ]);
  // Stage 5: the ember boiler chimney and gilded trim.
  parts.heart = merge([
    B(1.2, 4.2, 1.2, W / 2 - 1.4, H + 2.1, D / 2 - 1.6, 0x9a4a3a, 0.1, 1),
    B(1.4, 0.3, 1.4, W / 2 - 1.4, H + 4.3, D / 2 - 1.6, STONE_D, 0.06, 2),
    B(W + 0.9, 0.12, 0.12, 0, H + 0.02, -D / 2 - 0.3, GOLD, 0.04, 3), B(W + 0.9, 0.12, 0.12, 0, H + 0.02, D / 2 + 0.3, GOLD, 0.04, 4),
    rod([W / 2 + 0.2, H + 2.2, 0], [W / 2 + 0.2, H + 4.2, 0], 0.04, IRON), B(0.03, 0.6, 0.9, W / 2 + 0.2, H + 3.85, 0.46, GOLD, 0.04, 5),
  ]);
  return parts;
}
// The great wheel: spins once stage 3 is done. Its rim turns in the y-z
// plane (with the current); it hangs over the bank so it dips into the river.
export const WHEEL = { x: -W / 2 - 4.5, y: 0.4, r: 2.3 };
export function pumpWheel() {
  const r = WHEEL.r, parts = [];
  for (const z of [-0.8, 0.8]) parts.push(P(new THREE.TorusGeometry(r, 0.08, 6, 24).translate(0, 0, z), WOOD_D, 0.08));
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; parts.push(P(place(new THREE.BoxGeometry(0.05, 0.45, 1.7), Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, a), WOOD, 0.1, i)); if (i % 2 === 0) for (const z of [-0.8, 0.8]) parts.push(rod([0, 0, z], [Math.cos(a) * r, Math.sin(a) * r, z], 0.04, WOOD_D)); }
  parts.push(P(new THREE.CylinderGeometry(0.14, 0.14, 2.4, 10).rotateX(Math.PI / 2), IRON, 0.05));
  const g = merge(parts); g.rotateY(Math.PI / 2); return g;
}
export const PUMP_DIMS = { W, D, H };
