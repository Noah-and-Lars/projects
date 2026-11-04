// Builds smooth, organic meshes (hands, sleeves) out of simple shapes.
//
// Each shape is a "distance function": for any point it says how far that
// point is from the shape's surface (negative inside). Blending shapes with a
// smooth minimum melts them together like clay, which is how the fingers grow
// out of the palm without seams. meshFromDistance() then turns the blended shape
// into triangles once, when the game loads.

import * as THREE from 'three';

// --- Shapes ------------------------------------------------------------------

// A capsule that can be thicker at one end (a finger bone, a forearm).
export function roundCone(a, b, ra, rb) {
  const bax = b.x - a.x;
  const bay = b.y - a.y;
  const baz = b.z - a.z;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const minX = Math.min(a.x - ra, b.x - rb);
  const maxX = Math.max(a.x + ra, b.x + rb);
  const minY = Math.min(a.y - ra, b.y - rb);
  const maxY = Math.max(a.y + ra, b.y + rb);
  const minZ = Math.min(a.z - ra, b.z - rb);
  const maxZ = Math.max(a.z + ra, b.z + rb);
  return {
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    distance(px, py, pz) {
      const pax = px - a.x;
      const pay = py - a.y;
      const paz = pz - a.z;
      const y = pax * bax + pay * bay + paz * baz;
      const z = y - l2;
      const qx = pax * l2 - bax * y;
      const qy = pay * l2 - bay * y;
      const qz = paz * l2 - baz * y;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = y * y * l2;
      const z2 = z * z * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
    },
  };
}

// An ellipsoid with radii (rx, ry, rz) along the axes of `basis` (a Matrix4
// rotation), centred on `center`. Approximate distance, good enough to blend.
export function ellipsoid(center, rx, ry, rz, basis = new THREE.Matrix4()) {
  const e = basis.elements;
  // Columns of the basis are the ellipsoid's local axes in world space.
  const ux = [e[0], e[1], e[2]];
  const uy = [e[4], e[5], e[6]];
  const uz = [e[8], e[9], e[10]];
  const r = Math.max(rx, ry, rz);
  return {
    bounds: {
      minX: center.x - r, maxX: center.x + r,
      minY: center.y - r, maxY: center.y + r,
      minZ: center.z - r, maxZ: center.z + r,
    },
    distance(px, py, pz) {
      const dx = px - center.x;
      const dy = py - center.y;
      const dz = pz - center.z;
      const lx = (dx * ux[0] + dy * ux[1] + dz * ux[2]) / rx;
      const ly = (dx * uy[0] + dy * uy[1] + dz * uy[2]) / ry;
      const lz = (dx * uz[0] + dy * uz[1] + dz * uz[2]) / rz;
      const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz);
      const k1 = Math.sqrt((lx / rx) ** 2 + (ly / ry) ** 2 + (lz / rz) ** 2);
      return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
    },
  };
}

// Smooth minimum: blends two distances over a width of k (metres).
export function smoothMin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Blends a list of shapes into one distance function.
export function blend(shapes, k) {
  return (x, y, z) => {
    let d = Infinity;
    for (const s of shapes) {
      const b = s.bounds;
      // Far from this shape's box: it can't affect the result.
      if (x < b.minX - k || x > b.maxX + k || y < b.minY - k || y > b.maxY + k || z < b.minZ - k || z > b.maxZ + k) continue;
      d = d === Infinity ? s.distance(x, y, z) : smoothMin(d, s.distance(x, y, z), k);
    }
    return d === Infinity ? 1 : d;
  };
}

export function boundsOf(shapes, margin) {
  const box = new THREE.Box3();
  for (const s of shapes) {
    box.expandByPoint(new THREE.Vector3(s.bounds.minX, s.bounds.minY, s.bounds.minZ));
    box.expandByPoint(new THREE.Vector3(s.bounds.maxX, s.bounds.maxY, s.bounds.maxZ));
  }
  return box.expandByScalar(margin);
}

// --- Meshing (naive surface nets) -------------------------------------------

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

// Turns distance function `fn` into a smooth-shaded BufferGeometry, sampling
// the box `bounds` every `step` metres. `colorAt(x, y, z)` may return a
// THREE.Color to colour each vertex.
export function meshFromDistance(fn, bounds, step, colorAt = null) {
  const min = bounds.min;
  const nx = Math.ceil((bounds.max.x - min.x) / step) + 1;
  const ny = Math.ceil((bounds.max.y - min.y) / step) + 1;
  const nz = Math.ceil((bounds.max.z - min.z) / step) + 1;
  const at = (i, j, k) => i + nx * (j + ny * k);

  const values = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        values[at(i, j, k)] = fn(min.x + i * step, min.y + j * step, min.z + k * step);
      }
    }
  }

  // One vertex in every cell the surface passes through, at the average of
  // the points where the surface crosses the cell's edges.
  const cellVertex = new Int32Array(nx * ny * nz).fill(-1);
  const positions = [];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = values[at(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2])];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [c0, c1] of EDGES) {
          if ((v[c0] < 0) === (v[c1] < 0)) continue;
          const t = v[c0] / (v[c0] - v[c1]);
          sx += CORNERS[c0][0] + (CORNERS[c1][0] - CORNERS[c0][0]) * t;
          sy += CORNERS[c0][1] + (CORNERS[c1][1] - CORNERS[c0][1]) * t;
          sz += CORNERS[c0][2] + (CORNERS[c1][2] - CORNERS[c0][2]) * t;
          n++;
        }
        cellVertex[at(i, j, k)] = positions.length / 3;
        positions.push(min.x + (i + sx / n) * step, min.y + (j + sy / n) * step, min.z + (k + sz / n) * step);
      }
    }
  }

  // A quad (two triangles) across every grid edge the surface crosses,
  // joining the four cells around that edge, facing out of the shape.
  const indices = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, d, c, a, c, b);
    else indices.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const inside = values[at(i, j, k)] < 0;
        if (inside !== values[at(i + 1, j, k)] < 0) {
          quad(cellVertex[at(i, j - 1, k - 1)], cellVertex[at(i, j, k - 1)], cellVertex[at(i, j, k)], cellVertex[at(i, j - 1, k)], !inside);
        }
        if (inside !== values[at(i, j + 1, k)] < 0) {
          quad(cellVertex[at(i - 1, j, k - 1)], cellVertex[at(i - 1, j, k)], cellVertex[at(i, j, k)], cellVertex[at(i, j, k - 1)], !inside);
        }
        if (inside !== values[at(i, j, k + 1)] < 0) {
          quad(cellVertex[at(i - 1, j - 1, k)], cellVertex[at(i, j - 1, k)], cellVertex[at(i, j, k)], cellVertex[at(i - 1, j, k)], !inside);
        }
      }
    }
  }

  // Normals straight from the shape (smoother than averaging triangles), and
  // one step to move each vertex exactly onto the surface.
  const normals = new Float32Array(positions.length);
  const colors = colorAt ? new Float32Array(positions.length) : null;
  const e = step * 0.5;
  for (let p = 0; p < positions.length; p += 3) {
    let x = positions[p], y = positions[p + 1], z = positions[p + 2];
    let gx = fn(x + e, y, z) - fn(x - e, y, z);
    let gy = fn(x, y + e, z) - fn(x, y - e, z);
    let gz = fn(x, y, z + e) - fn(x, y, z - e);
    let len = Math.hypot(gx, gy, gz) || 1;
    gx /= len; gy /= len; gz /= len;
    const d = fn(x, y, z);
    x -= gx * d; y -= gy * d; z -= gz * d;
    positions[p] = x; positions[p + 1] = y; positions[p + 2] = z;
    normals[p] = gx; normals[p + 1] = gy; normals[p + 2] = gz;
    if (colors) {
      const c = colorAt(x, y, z);
      colors[p] = c.r; colors[p + 1] = c.g; colors[p + 2] = c.b;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}
