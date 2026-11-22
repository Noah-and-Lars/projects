// Pines and boulders, scattered with a fixed seed onto gentle ground away
// from the river, town, claims and the adit. Drawn as InstancedMeshes;
// trunks and big boulders get static colliders.
import * as THREE from 'three';
import { paint, merge, place } from './geom.js';
import { mulberry32 } from '../core/rng.js';
import { noise2 } from '../core/noise.js';
import { HALF, height, riverX, RIVER_HALF_WIDTH, TOWN, HAMLET, CLAIMS, ADIT } from '../world/valley.js';

function pineGeometry() {
  const parts = [paint(place(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6), 0, 0.8, 0), 0x7a5a3a, 0.1)];
  const tiers = [[1.5, 2.2, 1.6], [1.15, 1.9, 2.7], [0.8, 1.6, 3.7], [0.42, 1.2, 4.6]];
  tiers.forEach(([r, h, y], i) => parts.push(paint(place(new THREE.ConeGeometry(r, h, 7), 0, y, 0, 0, i * 0.6, 0), i % 2 ? 0x3f7a4a : 0x4a8a50, 0.18, i + 3)));
  return merge(parts);
}
function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position, r = mulberry32(seed);
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(k)) seen.set(k, 0.75 + r() * 0.5);
    const s = seen.get(k);
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.75, p.getZ(i) * s);
  }
  return paint(g, 0x8a949c, 0.22, seed);
}

function blocked(x, z, margin) {
  const rd = Math.abs(x - riverX(z)) - RIVER_HALF_WIDTH(z);
  if (rd < 5 + margin) return true;
  if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.r + 10 + margin) return true;
  if (Math.hypot(x - HAMLET.x, z - HAMLET.z) < HAMLET.r + 6 + margin) return true;
  for (const c of CLAIMS) if (x > c.x0 - 6 - margin && x < c.x1 + 6 + margin && z > c.z0 - 6 - margin && z < c.z1 + 6 + margin) return true;
  if (x > ADIT.x - 32 && x < ADIT.x + 6 && Math.abs(z - ADIT.z) < 24) return true;
  return Math.abs(x) > HALF - 8 || Math.abs(z) > HALF - 8;
}
const slopeAt = (x, z) => Math.hypot(height(x + 1, z) - height(x - 1, z), height(x, z + 1) - height(x, z - 1)) / 2;

export function buildFlora(scene, materials, seed = 99) {
  const r = mulberry32(seed);
  const trees = [], rocks = [];
  for (let gz = -HALF; gz < HALF; gz += 7) for (let gx = -HALF; gx < HALF; gx += 7) {
    const x = gx + r() * 7, z = gz + r() * 7;
    const dens = noise2(x / 60, z / 60, 4);
    const y = height(x, z);
    const roll = r();
    if (dens > 0.52 && roll < (dens - 0.5) * 2.2 && y < 88 && !blocked(x, z, 0) && slopeAt(x, z) < 0.45) trees.push({ x, y, z, s: 0.8 + r() * 0.7, ry: r() * 6.28 });
    else if (roll > 0.985 && !blocked(x, z, -2) && y < 110) rocks.push({ x, y, z, s: 0.5 + r() * r() * 2.4, ry: r() * 6.28, v: r.int(0, 3) });
  }
  // A few riverside boulders for character.
  for (let i = 0; i < 90; i++) {
    const z = -HALF + r() * HALF * 2, side = r() < 0.5 ? -1 : 1;
    const x = riverX(z) + side * (RIVER_HALF_WIDTH(z) + 1 + r() * 5);
    if (blocked(x, z, -6) && Math.hypot(x - TOWN.x, z - TOWN.z) > TOWN.r) { /* allowed near the river */ }
    let inClaim = false; for (const c of CLAIMS) if (x > c.x0 - 3 && x < c.x1 + 3 && z > c.z0 - 3 && z < c.z1 + 3) inClaim = true;
    if (inClaim || Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.r + 4) continue;
    rocks.push({ x, y: height(x, z), z, s: 0.4 + r() * 1.2, ry: r() * 6.28, v: r.int(0, 3) });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sv = new THREE.Vector3();
  const pine = new THREE.InstancedMesh(pineGeometry(), materials.vcolor, trees.length);
  trees.forEach((t, i) => { q.setFromEuler(e.set(0, t.ry, 0)); m.compose(v.set(t.x, t.y - 0.2, t.z), q, sv.set(t.s, t.s, t.s)); pine.setMatrixAt(i, m); });
  pine.castShadow = pine.receiveShadow = true;
  pine.computeBoundingSphere();
  scene.add(pine);
  const rockGeos = [0, 1, 2, 3].map(i => rockGeometry(40 + i));
  const rockMeshes = rockGeos.map((g, k) => {
    const list = rocks.filter(x => x.v === k);
    const im = new THREE.InstancedMesh(g, materials.vcolor, Math.max(1, list.length));
    im.count = list.length;
    list.forEach((t, i) => { q.setFromEuler(e.set(0, t.ry, 0)); m.compose(v.set(t.x, t.y - t.s * 0.25, t.z), q, sv.set(t.s, t.s, t.s)); im.setMatrixAt(i, m); });
    im.castShadow = im.receiveShadow = true; im.computeBoundingSphere();
    scene.add(im);
    return im;
  });
  const colliders = [];
  trees.forEach((t, i) => colliders.push({ op: 'setStaticBox', key: 'tree' + i, hx: 0.22 * t.s, hy: 1.2, hz: 0.22 * t.s, pos: [t.x, t.y + 1, t.z] }));
  rocks.forEach((t, i) => { if (t.s > 0.9) colliders.push({ op: 'setStaticBox', key: 'rock' + i, hx: t.s * 0.75, hy: t.s * 0.5, hz: t.s * 0.75, pos: [t.x, t.y, t.z], quat: [0, Math.sin(t.ry / 2), 0, Math.cos(t.ry / 2)] }); });
  return { pine, rockMeshes, colliders, counts: { trees: trees.length, rocks: rocks.length } };
}
