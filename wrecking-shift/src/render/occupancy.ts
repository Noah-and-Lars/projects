/**
 * World-space occupancy volumes (pure data, no three.js — runs in Node).
 *
 *  bits : 1 bit per voxel, one byte per 2x2x2 brick, bit = (x&1) | (y&1)<<1 | (z&1)<<2      (GPU: R8UI)
 *  mips : level 0 = density of each 4^3 cell (0 = empty, never 0 if any voxel is solid),
 *         level k = box-filtered level k-1, sizes max(1, size >> k)                          (GPU: R8 + mip chain)
 *
 * The volume is filled from "sources": axis-aligned voxel grids (static bodies) placed at integer voxel
 * offsets. Any sub-box can be recomputed from the sources (`updateRegion`), which is how destruction is
 * mirrored; a region update is bit-identical to a full rebuild.
 */
export const COARSE = 4;

export interface OccSource {
  id: number;
  /** palette bytes, idx = x + sx*(y + sy*z) */
  data: Uint8Array;
  sx: number; sy: number; sz: number;
  /** volume voxel coordinates of the grid's voxel (0,0,0) (may be negative / partly outside) */
  ox: number; oy: number; oz: number;
}

export interface MipLevel { data: Uint8Array; sx: number; sy: number; sz: number }

/** boxes (half-open, texel units of the respective texture) touched by the last `updateRegion` */
export interface UpdateResult {
  /** brick box of the bit texture: x0,y0,z0,x1,y1,z1 */
  bits: Int32Array;
  /** per density mip level: x0,y0,z0,x1,y1,z1 */
  mips: Int32Array[];
}

const POP = new Uint8Array(256);
for (let i = 1; i < 256; i++) POP[i] = POP[i >> 1] + (i & 1);

export class Occupancy {
  /** size in voxels (multiples of 4) */
  readonly nx: number; readonly ny: number; readonly nz: number;
  readonly bx: number; readonly by: number; readonly bz: number;
  readonly bits: Uint8Array;
  readonly mips: MipLevel[] = [];
  readonly sources = new Map<number, OccSource>();
  private result: UpdateResult;

  /**
   * @param opaque 256-entry LUT: 1 if a palette index blocks light (0 for empty / glass ...)
   */
  constructor(nx: number, ny: number, nz: number, readonly opaque: Uint8Array) {
    this.nx = Math.max(COARSE, Math.ceil(nx / COARSE) * COARSE);
    this.ny = Math.max(COARSE, Math.ceil(ny / COARSE) * COARSE);
    this.nz = Math.max(COARSE, Math.ceil(nz / COARSE) * COARSE);
    this.bx = this.nx >> 1; this.by = this.ny >> 1; this.bz = this.nz >> 1;
    this.bits = new Uint8Array(this.bx * this.by * this.bz);
    let sx = this.nx / COARSE, sy = this.ny / COARSE, sz = this.nz / COARSE;
    // three.js allocates floor(log2(max(width, height))) + 1 levels for a mipmapped 3D texture (it ignores depth)
    const levels = Math.floor(Math.log2(Math.max(sx, sy))) + 1;
    for (let k = 0; k < levels; k++) {
      this.mips.push({ data: new Uint8Array(sx * sy * sz), sx, sy, sz });
      sx = Math.max(1, sx >> 1); sy = Math.max(1, sy >> 1); sz = Math.max(1, sz >> 1);
    }
    this.result = { bits: new Int32Array(6), mips: this.mips.map(() => new Int32Array(6)) };
  }

  /** bytes held by the CPU mirrors (the GPU copies cost the same again) */
  get byteLength(): number {
    let n = this.bits.length;
    for (const m of this.mips) n += m.data.length;
    return n;
  }

  addSource(s: OccSource): void { this.sources.set(s.id, s); }
  removeSource(id: number): OccSource | undefined {
    const s = this.sources.get(id);
    this.sources.delete(id);
    return s;
  }

  solid(x: number, y: number, z: number): boolean {
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return false;
    const b = this.bits[(x >> 1) + this.bx * ((y >> 1) + this.by * (z >> 1))];
    return ((b >> ((x & 1) | ((y & 1) << 1) | ((z & 1) << 2))) & 1) !== 0;
  }

  rebuildAll(): UpdateResult {
    return this.updateRegion(0, 0, 0, this.nx, this.ny, this.nz)!;
  }

  /**
   * Recompute the voxel box [x0,x1) x [y0,y1) x [z0,z1) (volume voxel coords) from the sources.
   * Returns the texel boxes that changed (object reused between calls) or null if the box is outside.
   */
  updateRegion(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): UpdateResult | null {
    const { nx, ny, nz, bx, by, bits, opaque } = this;
    // align to coarse cells
    x0 = Math.max(0, x0) & ~3; y0 = Math.max(0, y0) & ~3; z0 = Math.max(0, z0) & ~3;
    x1 = Math.min(nx, (x1 + 3) & ~3); y1 = Math.min(ny, (y1 + 3) & ~3); z1 = Math.min(nz, (z1 + 3) & ~3);
    if (x0 >= x1 || y0 >= y1 || z0 >= z1) return null;
    // 1. clear bricks
    const bx0 = x0 >> 1, bx1 = x1 >> 1, by0 = y0 >> 1, by1 = y1 >> 1, bz0 = z0 >> 1, bz1 = z1 >> 1;
    for (let k = bz0; k < bz1; k++)
      for (let j = by0; j < by1; j++) {
        const row = bx * (j + by * k);
        bits.fill(0, row + bx0, row + bx1);
      }
    // 2. OR the sources in
    for (const s of this.sources.values()) {
      const ax0 = Math.max(x0, s.ox), ax1 = Math.min(x1, s.ox + s.sx);
      const ay0 = Math.max(y0, s.oy), ay1 = Math.min(y1, s.oy + s.sy);
      const az0 = Math.max(z0, s.oz), az1 = Math.min(z1, s.oz + s.sz);
      if (ax0 >= ax1 || ay0 >= ay1 || az0 >= az1) continue;
      const d = s.data;
      for (let z = az0; z < az1; z++) {
        const zb = (z & 1) << 2, bzRow = by * (z >> 1);
        for (let y = ay0; y < ay1; y++) {
          const yzb = zb | ((y & 1) << 1);
          const brow = bx * ((y >> 1) + bzRow);
          let si = (ax0 - s.ox) + s.sx * ((y - s.oy) + s.sy * (z - s.oz));
          for (let x = ax0; x < ax1; x++, si++) {
            if (opaque[d[si]]) bits[brow + (x >> 1)] |= 1 << (yzb | (x & 1));
          }
        }
      }
    }
    // 3. density level 0 from the bits (8 bricks per cell)
    const m0 = this.mips[0];
    const cx0 = x0 >> 2, cx1 = x1 >> 2, cy0 = y0 >> 2, cy1 = y1 >> 2, cz0 = z0 >> 2, cz1 = z1 >> 2;
    const bxy = bx * by;
    for (let k = cz0; k < cz1; k++)
      for (let j = cy0; j < cy1; j++) {
        let di = cx0 + m0.sx * (j + m0.sy * k);
        let bi = 2 * cx0 + bx * (2 * j + by * 2 * k);
        for (let i = cx0; i < cx1; i++, di++, bi += 2) {
          const n = POP[bits[bi]] + POP[bits[bi + 1]] + POP[bits[bi + bx]] + POP[bits[bi + bx + 1]]
            + POP[bits[bi + bxy]] + POP[bits[bi + bxy + 1]] + POP[bits[bi + bxy + bx]] + POP[bits[bi + bxy + bx + 1]];
          m0.data[di] = n === 0 ? 0 : Math.max(1, Math.round((255 * n) / 64));
        }
      }
    // 4. mip chain
    const r = this.result;
    r.bits[0] = bx0; r.bits[1] = by0; r.bits[2] = bz0; r.bits[3] = bx1; r.bits[4] = by1; r.bits[5] = bz1;
    let a0 = cx0, a1 = cy0, a2 = cz0, b0 = cx1, b1 = cy1, b2 = cz1;
    r.mips[0].set([a0, a1, a2, b0, b1, b2]);
    for (let l = 1; l < this.mips.length; l++) {
      const src = this.mips[l - 1], dst = this.mips[l];
      a0 >>= 1; a1 >>= 1; a2 >>= 1;
      b0 = Math.min(dst.sx, (b0 + 1) >> 1); b1 = Math.min(dst.sy, (b1 + 1) >> 1); b2 = Math.min(dst.sz, (b2 + 1) >> 1);
      a0 = Math.min(a0, dst.sx - 1); a1 = Math.min(a1, dst.sy - 1); a2 = Math.min(a2, dst.sz - 1);
      b0 = Math.max(b0, a0 + 1); b1 = Math.max(b1, a1 + 1); b2 = Math.max(b2, a2 + 1);
      mipBox(src, dst, a0, a1, a2, b0, b1, b2);
      r.mips[l].set([a0, a1, a2, b0, b1, b2]);
    }
    return r;
  }

  /**
   * CPU reference of the GLSL `vxTrace`: true if a solid voxel intersects ro + rd * t, t in [0, tMax]
   * (voxel units). Plain single-level DDA.
   */
  trace(rox: number, roy: number, roz: number, rdx: number, rdy: number, rdz: number, tMax: number): boolean {
    const { nx, ny, nz } = this;
    let x = Math.floor(rox), y = Math.floor(roy), z = Math.floor(roz);
    const sx = rdx >= 0 ? 1 : -1, sy = rdy >= 0 ? 1 : -1, sz = rdz >= 0 ? 1 : -1;
    const ix = 1 / Math.max(Math.abs(rdx), 1e-7), iy = 1 / Math.max(Math.abs(rdy), 1e-7), iz = 1 / Math.max(Math.abs(rdz), 1e-7);
    let tx = (sx > 0 ? x + 1 - rox : rox - x) * ix;
    let ty = (sy > 0 ? y + 1 - roy : roy - y) * iy;
    let tz = (sz > 0 ? z + 1 - roz : roz - z) * iz;
    let t = 0;
    for (let i = 0; i < 20000; i++) {
      if (t > tMax) return false;
      if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) {
        if ((x < 0 && sx < 0) || (x >= nx && sx > 0) || (y < 0 && sy < 0) || (y >= ny && sy > 0) || (z < 0 && sz < 0) || (z >= nz && sz > 0)) return false;
      } else if (this.solid(x, y, z)) return true;
      if (tx < ty && tx < tz) { t = tx; tx += ix; x += sx; }
      else if (ty < tz) { t = ty; ty += iy; y += sy; }
      else { t = tz; tz += iz; z += sz; }
    }
    return false;
  }
}

function mipBox(src: MipLevel, dst: MipLevel, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const s = src.data, d = dst.data;
  const ssx = src.sx, ssy = src.sy, ssz = src.sz;
  for (let k = z0; k < z1; k++)
    for (let j = y0; j < y1; j++)
      for (let i = x0; i < x1; i++) {
        let sum = 0, n = 0;
        const xa = 2 * i, ya = 2 * j, za = 2 * k;
        const xb = xa + 1 < ssx, yb = ya + 1 < ssy, zb = za + 1 < ssz;
        const o = xa + ssx * (ya + ssy * za);
        sum += s[o]; n++;
        if (xb) { sum += s[o + 1]; n++; }
        if (yb) { sum += s[o + ssx]; n++; if (xb) { sum += s[o + ssx + 1]; n++; } }
        if (zb) {
          const p = o + ssx * ssy;
          sum += s[p]; n++;
          if (xb) { sum += s[p + 1]; n++; }
          if (yb) { sum += s[p + ssx]; n++; if (xb) { sum += s[p + ssx + 1]; n++; } }
        }
        d[i + dst.sx * (j + dst.sy * k)] = Math.round(sum / n);
      }
}

export interface VolumePlan {
  /** world position of voxel (0,0,0)'s min corner, in whole voxels (multiply by VOXEL for metres) */
  ox: number; oy: number; oz: number;
  nx: number; ny: number; nz: number;
  /** true if the plan had to be cropped to fit the limits */
  cropped: boolean;
}

/**
 * Choose the volume extent (in voxels). `content` = AABB of everything that should be inside (static bodies),
 * `bounds` = level bounds; both as [x0,y0,z0,x1,y1,z1] in voxel units. The volume covers their intersection
 * (plus padding), aligned to 4 voxels, limited to `maxTex` bit-texels per axis (= 2*maxTex voxels) and
 * `maxBytes` bytes of bit texture; when it does not fit, XZ is cropped symmetrically around `focus` (x, z in voxels).
 */
export function planVolume(
  content: ArrayLike<number>, bounds: ArrayLike<number>, maxTex: number, maxBytes: number, focus?: [number, number], pad = 8,
): VolumePlan {
  const lo = [0, 0, 0], hi = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    let l = Math.max(content[a] - pad, bounds[a]), h = Math.min(content[a + 3] + pad, bounds[a + 3]);
    if (!(h > l)) { l = content[a] - pad; h = content[a + 3] + pad; }
    if (!(h > l)) { l = 0; h = COARSE; }
    lo[a] = Math.floor(l / COARSE) * COARSE; hi[a] = Math.ceil(h / COARSE) * COARSE;
  }
  let cropped = false;
  const fx = focus ? focus[0] : (lo[0] + hi[0]) / 2, fz = focus ? focus[1] : (lo[2] + hi[2]) / 2;
  const crop = (a: number, f: number, size: number) => {
    size = Math.max(COARSE, Math.floor(size / COARSE) * COARSE);
    if (hi[a] - lo[a] <= size) return;
    cropped = true;
    let l = Math.round((f - size / 2) / COARSE) * COARSE;
    l = Math.max(lo[a], Math.min(hi[a] - size, l));
    lo[a] = l; hi[a] = l + size;
  };
  const maxVox = maxTex * 2;
  crop(0, fx, maxVox); crop(2, fz, maxVox);
  crop(1, (lo[1] + hi[1]) / 2 - (hi[1] - lo[1]), maxVox); // keep the bottom
  const bytes = () => ((hi[0] - lo[0]) / 2) * ((hi[1] - lo[1]) / 2) * ((hi[2] - lo[2]) / 2);
  if (bytes() > maxBytes) {
    // shrink XZ uniformly
    const k = Math.sqrt(maxBytes / bytes());
    crop(0, fx, (hi[0] - lo[0]) * k); crop(2, fz, (hi[2] - lo[2]) * k);
  }
  return { ox: lo[0], oy: lo[1], oz: lo[2], nx: hi[0] - lo[0], ny: hi[1] - lo[1], nz: hi[2] - lo[2], cropped };
}
