// The static valley: flat-shaded low-poly terrain in 100 m tiles, coloured
// per face (grass treads, sandstone risers, slate crags, snow, river gravel),
// with a trimesh collider per tile that skips claim plots and the adit mouth.
import * as THREE from 'three';
import { SIZE, HALF, GRID, height, isHole, floorY, riverX, RIVER_HALF_WIDTH } from '../world/valley.js';
import { noise2 } from '../core/noise.js';

const TILE = 50; // cells per tile edge (100 m)
const C = {
  grass: new THREE.Color(0x8fb35c), grassDry: new THREE.Color(0xb9b968), pine: new THREE.Color(0x5f8c4a),
  sand: new THREE.Color(0xdcc69a), sandDark: new THREE.Color(0xc4a676), slate: new THREE.Color(0x7d8994),
  slateDark: new THREE.Color(0x5c6772), snow: new THREE.Color(0xf4f6f8), gravel: new THREE.Color(0xbfb59a), bed: new THREE.Color(0x8c8a74),
};
const tmp = new THREE.Color();

function faceColor(cx, cy, cz, ny) {
  const slope = 1 - ny; // 0 flat .. 1 vertical
  const rd = Math.abs(cx - riverX(cz)) - RIVER_HALF_WIDTH(cz);
  const above = cy - floorY(cz);
  const n = noise2(cx / 9, cz / 9, 11), n2 = noise2(cx / 31, cz / 31, 12);
  if (rd < 1.5 && above < 0.2) return tmp.copy(C.bed).lerp(C.gravel, n * 0.5);
  if (rd < 5 && above < 1.2) return tmp.copy(C.gravel).lerp(C.sand, n * 0.4);
  if (cy > 92 && slope < 0.5) return tmp.copy(C.snow).lerp(C.slate, n * 0.25);
  if (slope > 0.32) {
    // Risers: pale sandstone low down, slate higher up.
    const t = Math.min(1, Math.max(0, (cy - 30) / 40 + (n2 - 0.5)));
    tmp.copy(C.sand).lerp(C.sandDark, n * 0.6);
    return tmp.lerp(n > 0.5 ? C.slate : C.slateDark, t);
  }
  tmp.copy(C.grass).lerp(C.grassDry, n2 * 0.7).lerp(C.pine, Math.max(0, n - 0.6));
  if (slope > 0.18) tmp.lerp(C.sand, (slope - 0.18) * 4);
  return tmp;
}

export function buildTerrain(scene, materials) {
  const N = SIZE / GRID;
  // Height samples on the grid (N+1)^2.
  const H = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = height(-HALF + i * GRID, -HALF + j * GRID);
  const hAt = (i, j) => H[j * (N + 1) + i];
  const mat = materials.terrain;
  const group = new THREE.Group();
  const colliders = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let tj = 0; tj < N / TILE; tj++) for (let ti = 0; ti < N / TILE; ti++) {
    const pos = [], col = [], cv = [], ci = [];
    const vmap = new Map();
    const cvert = (i, j) => { const k = j * (N + 1) + i; let v = vmap.get(k); if (v === undefined) { v = cv.length / 3; vmap.set(k, v); cv.push(-HALF + i * GRID, hAt(i, j), -HALF + j * GRID); } return v; };
    for (let j = tj * TILE; j < (tj + 1) * TILE; j++) for (let i = ti * TILE; i < (ti + 1) * TILE; i++) {
      const x0 = -HALF + i * GRID, z0 = -HALF + j * GRID;
      if (isHole(x0, z0)) continue;
      // Split along the diagonal that follows the terrain better.
      const h00 = hAt(i, j), h10 = hAt(i + 1, j), h01 = hAt(i, j + 1), h11 = hAt(i + 1, j + 1);
      const tris = Math.abs(h00 - h11) < Math.abs(h10 - h01)
        ? [[i, j, i, j + 1, i + 1, j + 1], [i, j, i + 1, j + 1, i + 1, j]]
        : [[i, j, i, j + 1, i + 1, j], [i + 1, j, i, j + 1, i + 1, j + 1]];
      for (const t of tris) {
        a.set(-HALF + t[0] * GRID, hAt(t[0], t[1]), -HALF + t[1] * GRID);
        b.set(-HALF + t[2] * GRID, hAt(t[2], t[3]), -HALF + t[3] * GRID);
        c.set(-HALF + t[4] * GRID, hAt(t[4], t[5]), -HALF + t[5] * GRID);
        nrm.subVectors(b, a).cross(c.clone().sub(a)).normalize();
        const fc = faceColor((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3, nrm.y);
        // A whisper of per-vertex variation so big flat areas aren't one colour.
        for (const v of [a, b, c]) {
          pos.push(v.x, v.y, v.z);
          const jit = 0.94 + noise2(v.x * 0.37, v.z * 0.37, 21) * 0.1;
          col.push(fc.r * jit, fc.g * jit, fc.b * jit);
        }
        ci.push(cvert(t[0], t[1]), cvert(t[2], t[3]), cvert(t[4], t[5]));
      }
    }
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true; m.castShadow = true;
    group.add(m);
    colliders.push({ key: `valley-${ti}-${tj}`, vertices: new Float32Array(cv), indices: new Uint32Array(ci) });
  }
  scene.add(group);
  return { group, colliders, heightAt: (x, z) => height(x, z) };
}
