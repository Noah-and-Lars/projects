// Where a gun is solid, for the soldier's fingers to rest on rather than go
// into (src/player/fpArms.js): a signed distance field of the gun in its own
// space, made once per gun and set of attachments.
//
// Every triangle of the gun's solid parts is sampled onto a grid of small
// cells (its surface); cells the outside can't reach without crossing the
// surface are inside it; and each cell gets its distance to the surface
// (two chamfer passes), less than zero inside. The magazine and rounds are
// left out (they leave the gun on a reload), as are its flashes and smoke.

import * as THREE from 'three';

const CELL = 0.003; // metres
const PAD = 0.03; // metres of room round the gun
const FAR = 1; // metres: the distance anywhere off the grid

// The gun's meshes that count: drawn, opaque and part of the gun itself.
export function solidMeshes(gun) {
  const out = [];
  gun.updateMatrixWorld(true);
  gun.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) return;
    for (let p = o; p && p !== gun; p = p.parent) if (!p.visible) return; // (the gun itself may be put away)
    if ([].concat(o.material).some((m) => m.transparent || m.blending !== THREE.NormalBlending)) return;
    if (/magazine|round/i.test(o.name)) return;
    out.push(o);
  });
  return out;
}

export class GunVolume {
  // `gun`: the gun's root; `meshes`: solidMeshes(gun).
  constructor(gun, meshes) {
    const toGun = gun.matrixWorld.clone().invert();
    const scale = gun.matrixWorld.getMaxScaleOnAxis(); // metres per unit of the gun's space
    this.cell = CELL / scale; // in the gun's space
    this.metres = scale;
    // Each mesh's triangles in the gun's space.
    const tris = [];
    const box = new THREE.Box3();
    const p = new THREE.Vector3();
    for (const mesh of meshes) {
      const m = toGun.clone().multiply(mesh.matrixWorld);
      const pos = mesh.geometry.attributes.position;
      const pts = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(m);
        pts[i * 3] = p.x; pts[i * 3 + 1] = p.y; pts[i * 3 + 2] = p.z;
        box.expandByPoint(p);
      }
      const index = mesh.geometry.index;
      tris.push({ pts, index: index ? index.array : null, count: index ? index.count : pos.count });
    }
    if (box.isEmpty()) box.set(p.set(0, 0, 0), p.clone());
    const pad = PAD / scale;
    box.min.subScalar(pad);
    box.max.addScalar(pad);
    this.min = box.min.clone();
    this.middle = box.getCenter(new THREE.Vector3()); // (its sides are either side of this, across x)
    const size = box.getSize(new THREE.Vector3());
    const n = this.n = [0, 1, 2].map((a) => Math.max(2, Math.ceil(size.getComponent(a) / this.cell) + 1));
    const [nx, ny] = n;
    const count = n[0] * n[1] * n[2];
    const at = (x, y, z) => x + nx * (y + ny * z);

    // The surface: each triangle sampled finer than the cells.
    const surface = new Uint8Array(count);
    const cell = this.cell;
    const mark = (x, y, z) => {
      const i = Math.floor((x - this.min.x) / cell + 0.5);
      const j = Math.floor((y - this.min.y) / cell + 0.5);
      const k = Math.floor((z - this.min.z) / cell + 0.5);
      if (i >= 0 && j >= 0 && k >= 0 && i < n[0] && j < n[1] && k < n[2]) surface[at(i, j, k)] = 1;
    };
    for (const { pts, index, count: c } of tris) {
      for (let t = 0; t + 2 < c; t += 3) {
        const a = (index ? index[t] : t) * 3, b = (index ? index[t + 1] : t + 1) * 3, d = (index ? index[t + 2] : t + 2) * 3;
        const ax = pts[a], ay = pts[a + 1], az = pts[a + 2];
        const ux = pts[b] - ax, uy = pts[b + 1] - ay, uz = pts[b + 2] - az;
        const vx = pts[d] - ax, vy = pts[d + 1] - ay, vz = pts[d + 2] - az;
        const longest = Math.sqrt(Math.max(ux * ux + uy * uy + uz * uz, vx * vx + vy * vy + vz * vz,
          (ux - vx) ** 2 + (uy - vy) ** 2 + (uz - vz) ** 2));
        const steps = Math.max(1, Math.ceil(longest / (cell * 0.5)));
        for (let i = 0; i <= steps; i++) {
          for (let j = 0; i + j <= steps; j++) {
            const s = i / steps, r = j / steps;
            mark(ax + ux * s + vx * r, ay + uy * s + vy * r, az + uz * s + vz * r);
          }
        }
      }
    }

    // Outside: everything reached from the grid's edge without crossing the
    // surface.
    const outside = new Uint8Array(count);
    const queue = new Int32Array(count);
    let head = 0, tail = 0;
    const visit = (i) => { if (!surface[i] && !outside[i]) { outside[i] = 1; queue[tail++] = i; } };
    for (let z = 0; z < n[2]; z++) {
      for (let y = 0; y < n[1]; y++) {
        for (let x = 0; x < n[0]; x++) {
          if (x === 0 || y === 0 || z === 0 || x === n[0] - 1 || y === n[1] - 1 || z === n[2] - 1) visit(at(x, y, z));
        }
      }
    }
    while (head < tail) {
      const i = queue[head++];
      const x = i % nx, y = ((i - x) / nx) % ny, z = Math.floor(i / (nx * ny));
      if (x > 0) visit(i - 1);
      if (x < n[0] - 1) visit(i + 1);
      if (y > 0) visit(i - nx);
      if (y < n[1] - 1) visit(i + nx);
      if (z > 0) visit(i - nx * ny);
      if (z < n[2] - 1) visit(i + nx * ny);
    }

    // Distance to the surface (in cells), forward then backward over the
    // grid with its 26 neighbours.
    const dist = new Float32Array(count).fill(1e6);
    for (let i = 0; i < count; i++) if (surface[i]) dist[i] = 0;
    const offsets = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const before = dz < 0 || (dz === 0 && (dy < 0 || (dy === 0 && dx < 0)));
          if (before) offsets.push([dx, dy, dz, Math.hypot(dx, dy, dz)]);
        }
      }
    }
    const pass = (sign) => {
      const z0 = sign > 0 ? 0 : n[2] - 1, y0 = sign > 0 ? 0 : n[1] - 1, x0 = sign > 0 ? 0 : n[0] - 1;
      for (let z = z0; z >= 0 && z < n[2]; z += sign) {
        for (let y = y0; y >= 0 && y < n[1]; y += sign) {
          for (let x = x0; x >= 0 && x < n[0]; x += sign) {
            const i = at(x, y, z);
            let d = dist[i];
            if (d === 0) continue;
            for (const [dx, dy, dz, w] of offsets) {
              const X = x + dx * sign, Y = y + dy * sign, Z = z + dz * sign;
              if (X < 0 || Y < 0 || Z < 0 || X >= n[0] || Y >= n[1] || Z >= n[2]) continue;
              const e = dist[at(X, Y, Z)] + w;
              if (e < d) d = e;
            }
            dist[i] = d;
          }
        }
      }
    };
    pass(1);
    pass(-1);
    // In metres, less than zero inside.
    for (let i = 0; i < count; i++) dist[i] = (outside[i] || surface[i] ? 1 : -1) * dist[i] * CELL;
    this.dist = dist;
  }

  // The distance (metres) from a point in the gun's space to its surface:
  // less than zero inside.
  distance(p) {
    const n = this.n;
    const fx = (p.x - this.min.x) / this.cell, fy = (p.y - this.min.y) / this.cell, fz = (p.z - this.min.z) / this.cell;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= n[0] - 1 || fy >= n[1] - 1 || fz >= n[2] - 1) return FAR;
    const x = Math.floor(fx), y = Math.floor(fy), z = Math.floor(fz);
    const u = fx - x, v = fy - y, w = fz - z;
    const nx = n[0], nxy = n[0] * n[1];
    const i = x + nx * y + nxy * z;
    const d = this.dist;
    const lerp = (a, b, t) => a + (b - a) * t;
    return lerp(
      lerp(lerp(d[i], d[i + 1], u), lerp(d[i + nx], d[i + nx + 1], u), v),
      lerp(lerp(d[i + nxy], d[i + nxy + 1], u), lerp(d[i + nxy + nx], d[i + nxy + nx + 1], u), v),
      w,
    );
  }

  // Which way is out of the gun from a point (in the gun's space, unit
  // length): the way its distance grows.
  outward(p, out = new THREE.Vector3()) {
    const h = this.cell;
    const q = p.clone();
    const along = (axis) => {
      q.copy(p).setComponent(axis, p.getComponent(axis) + h);
      const a = this.distance(q);
      q.copy(p).setComponent(axis, p.getComponent(axis) - h);
      return a - this.distance(q);
    };
    out.set(along(0), along(1), along(2));
    return out.lengthSq() > 0 ? out.normalize() : out.set(0, 0, 0);
  }
}
