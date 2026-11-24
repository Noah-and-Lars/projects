// Voxel test world + occupancy volumes for the "Teardown-like look" prototypes.
// Pure JS, no three.js dependency (usable in Node for tests).
//
// Conventions: voxel (x,y,z) occupies world box [x,x+1)*VS etc., y is up.
// Material 0 = air. index = x + NX*(y + NY*z).

export const VS = 0.1; // 10 cm voxels

// palette: [r,g,b] linear-ish albedo in 0..1 (sRGB values, converted in shader/material)
export const PALETTE = [
  [0, 0, 0],          // 0 air
  [0.42, 0.40, 0.36], // 1 concrete ground
  [0.30, 0.45, 0.22], // 2 grass
  [0.72, 0.62, 0.50], // 3 plaster wall
  [0.55, 0.25, 0.18], // 4 brick red
  [0.35, 0.22, 0.14], // 5 wood dark
  [0.25, 0.26, 0.30], // 6 roof slate
  [0.60, 0.70, 0.78], // 7 window frame/pale
  [0.80, 0.78, 0.70], // 8 white trim
];

export class World {
  constructor(nx, ny, nz) {
    this.nx = nx; this.ny = ny; this.nz = nz;
    this.data = new Uint8Array(nx * ny * nz);
  }
  idx(x, y, z) { return x + this.nx * (y + this.ny * z); }
  get(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return 0;
    return this.data[x + this.nx * (y + this.ny * z)];
  }
  set(x, y, z, m) {
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return;
    this.data[x + this.nx * (y + this.ny * z)] = m;
  }
  box(x0, y0, z0, x1, y1, z1, m) { // inclusive-exclusive
    for (let z = Math.max(0, z0); z < Math.min(this.nz, z1); z++)
      for (let y = Math.max(0, y0); y < Math.min(this.ny, y1); y++)
        for (let x = Math.max(0, x0); x < Math.min(this.nx, x1); x++) this.data[x + this.nx * (y + this.ny * z)] = m;
  }
  sphere(cx, cy, cz, r, m) {
    const r2 = r * r;
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz;
          if (dx * dx + dy * dy + dz * dz <= r2) this.set(x, y, z, m);
        }
    // return touched voxel AABB (inclusive-exclusive)
    return [Math.floor(cx - r), Math.floor(cy - r), Math.floor(cz - r), Math.ceil(cx + r) + 1, Math.ceil(cy + r) + 1, Math.ceil(cz + r) + 1];
  }
}

// A deterministic small town: ground slab, grass patches, 4 houses with windows,
// doors, slanted roofs, a fence, and a spherical hole blasted into one house.
export function buildTestWorld(nx = 256, ny = 96, nz = 256) {
  const w = new World(nx, ny, nz);
  // ground: 4 voxels concrete, top grass layer in patches
  w.box(0, 0, 0, nx, 4, nz, 1);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const h = Math.sin(x * 0.07) + Math.cos(z * 0.05) + Math.sin((x + z) * 0.11);
    if (h > -0.3) w.set(x, 4, z, 2);
  }
  // road (concrete strip, no grass)
  w.box(0, 4, 118, nx, 5, 138, 0);
  w.box(0, 3, 118, nx, 4, 138, 1);

  const house = (x0, z0, sx, sz, floors, wallMat, roofMat) => {
    const fh = 30; // 3 m per floor
    const H = floors * fh;
    const y0 = 4;
    // shell
    w.box(x0, y0, z0, x0 + sx, y0 + H, z0 + sz, wallMat);
    w.box(x0 + 2, y0 + 1, z0 + 2, x0 + sx - 2, y0 + H, z0 + sz - 2, 0); // hollow, walls 2 voxels (20 cm)
    // floors (slabs)
    for (let f = 1; f < floors; f++) w.box(x0, y0 + f * fh - 2, z0, x0 + sx, y0 + f * fh, z0 + sz, 8);
    // windows: 12 x 14 voxels, sill at 9
    for (let f = 0; f < floors; f++) {
      const wy = y0 + f * fh + 9;
      for (let wx = x0 + 8; wx + 12 < x0 + sx - 6; wx += 24) {
        w.box(wx, wy, z0, wx + 12, wy + 14, z0 + 2, 0);
        w.box(wx, wy, z0 + sz - 2, wx + 12, wy + 14, z0 + sz, 0);
        w.box(wx - 1, wy - 1, z0 - 1, wx + 13, wy, z0, 8); // sill
        w.box(wx - 1, wy - 1, z0 + sz, wx + 13, wy, z0 + sz + 1, 8);
      }
      for (let wz = z0 + 8; wz + 12 < z0 + sz - 6; wz += 24) {
        w.box(x0, wy, wz, x0 + 2, wy + 14, wz + 12, 0);
        w.box(x0 + sx - 2, wy, wz, x0 + sx, wy + 14, wz + 12, 0);
      }
    }
    // door
    w.box(x0 + (sx >> 1) - 5, y0, z0, x0 + (sx >> 1) + 5, y0 + 21, z0 + 2, 0);
    w.box(x0 + (sx >> 1) - 6, y0 + 21, z0 - 1, x0 + (sx >> 1) + 6, y0 + 22, z0, 5);
    // gable roof along x, overhang 3
    const ry = y0 + H;
    const half = (sz >> 1) + 3;
    for (let i = 0; i <= half; i++) {
      const y = ry + Math.floor(i * 0.8);
      w.box(x0 - 3, y, z0 - 3 + i, x0 + sx + 3, y + 2, z0 - 3 + i + 1, roofMat);
      w.box(x0 - 3, y, z0 + sz + 2 - i, x0 + sx + 3, y + 2, z0 + sz + 3 - i, roofMat);
      // gable wall infill
      if (i > 2) {
        w.box(x0, ry, z0 - 3 + i, x0 + 2, y, z0 - 3 + i + 1, wallMat);
        w.box(x0 + sx - 2, ry, z0 - 3 + i, x0 + sx, y, z0 - 3 + i + 1, wallMat);
        w.box(x0, ry, z0 + sz + 2 - i, x0 + 2, y, z0 + sz + 3 - i, wallMat);
        w.box(x0 + sx - 2, ry, z0 + sz + 2 - i, x0 + sx, y, z0 + sz + 3 - i, wallMat);
      }
    }
  };
  house(20, 20, 80, 60, 2, 3, 6);
  house(140, 30, 60, 50, 1, 4, 6);
  house(30, 160, 60, 60, 1, 4, 5);
  house(150, 160, 80, 56, 2, 3, 6);
  // fence along road
  for (let x = 4; x < nx - 4; x += 6) w.box(x, 5, 112, x + 1, 14, 113, 5);
  w.box(4, 11, 112, nx - 4, 12, 113, 5);
  // a few crates
  w.box(110, 5, 60, 118, 13, 68, 5);
  w.box(112, 13, 62, 117, 18, 67, 5);
  // blast hole in house 1 front wall (+ crater)
  w.sphere(60, 22, 20, 14, 0);
  w.sphere(170, 4, 100, 7, 0);
  return w;
}

// ---------- occupancy volumes ----------
// Bit volume: one byte per 2x2x2 brick; bit = (x&1) | (y&1)<<1 | (z&1)<<2.
export function bitDims(w) { return [Math.ceil(w.nx / 2), Math.ceil(w.ny / 2), Math.ceil(w.nz / 2)]; }
export function buildBitVolume(w, out) {
  const [bx, by, bz] = bitDims(w);
  out = out || new Uint8Array(bx * by * bz);
  updateBitRegion(w, out, 0, 0, 0, w.nx, w.ny, w.nz);
  return out;
}
// Recompute bricks covering voxel box [x0,x1)x[y0,y1)x[z0,z1). Returns brick box.
export function updateBitRegion(w, bits, x0, y0, z0, x1, y1, z1) {
  const [bx, by] = bitDims(w);
  const b0 = [Math.max(0, x0 >> 1), Math.max(0, y0 >> 1), Math.max(0, z0 >> 1)];
  const b1 = [Math.min(Math.ceil(w.nx / 2), (x1 + 1) >> 1), Math.min(Math.ceil(w.ny / 2), (y1 + 1) >> 1), Math.min(Math.ceil(w.nz / 2), (z1 + 1) >> 1)];
  for (let k = b0[2]; k < b1[2]; k++) for (let j = b0[1]; j < b1[1]; j++) for (let i = b0[0]; i < b1[0]; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) if (w.get(2 * i + (b & 1), 2 * j + ((b >> 1) & 1), 2 * k + ((b >> 2) & 1))) v |= 1 << b;
    bits[i + bx * (j + by * k)] = v;
  }
  return [b0, b1];
}
// Density volume: one byte per CxCxC cell, value = round(255 * solidCount / C^3), but never 0 if any solid.
export const COARSE = 4;
export function densDims(w) { return [Math.ceil(w.nx / COARSE), Math.ceil(w.ny / COARSE), Math.ceil(w.nz / COARSE)]; }
export function buildDensityVolume(w, out) {
  const [cx, cy, cz] = densDims(w);
  out = out || new Uint8Array(cx * cy * cz);
  updateDensityRegion(w, out, 0, 0, 0, w.nx, w.ny, w.nz);
  return out;
}
export function updateDensityRegion(w, dens, x0, y0, z0, x1, y1, z1) {
  const C = COARSE; const [cx, cy, cz] = densDims(w);
  const c0 = [Math.max(0, Math.floor(x0 / C)), Math.max(0, Math.floor(y0 / C)), Math.max(0, Math.floor(z0 / C))];
  const c1 = [Math.min(cx, Math.ceil(x1 / C)), Math.min(cy, Math.ceil(y1 / C)), Math.min(cz, Math.ceil(z1 / C))];
  for (let k = c0[2]; k < c1[2]; k++) for (let j = c0[1]; j < c1[1]; j++) for (let i = c0[0]; i < c1[0]; i++) {
    let n = 0;
    for (let z = 0; z < C; z++) for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) if (w.get(i * C + x, j * C + y, k * C + z)) n++;
    dens[i + cx * (j + cy * k)] = n === 0 ? 0 : Math.max(1, Math.round(255 * n / (C * C * C)));
  }
  return [c0, c1];
}

// CPU reference DDA (voxel units). Returns true if a solid voxel is hit for t in (0, tMax].
// Used to validate the GLSL trace.
export function cpuTrace(w, ro, rd, tMax) {
  let x = Math.floor(ro[0]), y = Math.floor(ro[1]), z = Math.floor(ro[2]);
  const sx = rd[0] >= 0 ? 1 : -1, sy = rd[1] >= 0 ? 1 : -1, sz = rd[2] >= 0 ? 1 : -1;
  const ix = 1 / Math.max(Math.abs(rd[0]), 1e-6), iy = 1 / Math.max(Math.abs(rd[1]), 1e-6), iz = 1 / Math.max(Math.abs(rd[2]), 1e-6);
  let tx = (sx > 0 ? x + 1 - ro[0] : ro[0] - x) * ix;
  let ty = (sy > 0 ? y + 1 - ro[1] : ro[1] - y) * iy;
  let tz = (sz > 0 ? z + 1 - ro[2] : ro[2] - z) * iz;
  let t = 0;
  for (let i = 0; i < 4096; i++) {
    if (t > tMax) return false;
    if (x < 0 || y < 0 || z < 0 || x >= w.nx || y >= w.ny || z >= w.nz) {
      // outside: stop if moving away
      if ((x < 0 && sx < 0) || (x >= w.nx && sx > 0) || (y < 0 && sy < 0) || (y >= w.ny && sy > 0) || (z < 0 && sz < 0) || (z >= w.nz && sz > 0)) return false;
    } else if (w.data[x + w.nx * (y + w.ny * z)]) return true;
    if (tx < ty && tx < tz) { t = tx; tx += ix; x += sx; }
    else if (ty < tz) { t = ty; ty += iy; y += sy; }
    else { t = tz; tz += iz; z += sz; }
  }
  return false;
}

// ---------- density mip chain (CPU mirror, box filter, sub-region updatable) ----------
// level 0 = density volume (COARSE^3 voxels per texel); level k size = max(1, floor(size0 >> k)),
// matching WebGL/GL NPOT mip sizing. Returns [{data, size:[x,y,z]}...] including level 0.
export function buildDensityMips(dens0, size0, levels) {
  const out = [{ data: dens0, size: size0.slice() }];
  for (let k = 1; k < levels; k++) {
    const p = out[k - 1]; const s = p.size.map(v => Math.max(1, v >> 1));
    out.push({ data: new Uint8Array(s[0] * s[1] * s[2]), size: s });
  }
  for (let k = 1; k < levels; k++) updateMipLevelBox(out[k - 1], out[k], [0, 0, 0], out[k].size);
  return out;
}
function updateMipLevelBox(src, dst, b0, b1) {
  const [sx, sy, sz] = src.size, [dx, dy] = dst.size;
  for (let k = b0[2]; k < b1[2]; k++) for (let j = b0[1]; j < b1[1]; j++) for (let i = b0[0]; i < b1[0]; i++) {
    let sum = 0, n = 0;
    for (let c = 0; c < 8; c++) {
      const x = 2 * i + (c & 1), y = 2 * j + ((c >> 1) & 1), z = 2 * k + ((c >> 2) & 1);
      if (x < sx && y < sy && z < sz) { sum += src.data[x + sx * (y + sy * z)]; n++; }
    }
    dst.data[i + dx * (j + dy * k)] = n ? Math.round(sum / n) : 0;
  }
}
// propagate a changed level-0 texel box [c0,c1) up the chain; returns per-level boxes
export function updateDensityMipsRegion(mips, c0, c1) {
  const boxes = [[c0.slice(), c1.slice()]];
  let a = c0.slice(), b = c1.slice();
  for (let k = 1; k < mips.length; k++) {
    a = a.map(v => v >> 1); b = b.map((v, i) => Math.min(mips[k].size[i], (v + 1) >> 1));
    updateMipLevelBox(mips[k - 1], mips[k], a, b);
    boxes.push([a.slice(), b.slice()]);
  }
  return boxes;
}
