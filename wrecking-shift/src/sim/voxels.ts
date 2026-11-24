import { PAL_DENSITY, VOXEL } from './materials';
import type { V3 } from './vec';

/** Dense voxel grid. data[x + sx*(y + sy*z)] = palette index (0 empty). */
export class VoxelGrid {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly data: Uint8Array;
  /** number of non-empty voxels (maintained by set()) */
  count = 0;

  constructor(sx: number, sy: number, sz: number, data?: Uint8Array) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.data = data ?? new Uint8Array(sx * sy * sz);
    if (data) this.recount();
  }
  recount(): number {
    let c = 0;
    const d = this.data;
    for (let i = 0; i < d.length; i++) if (d[i]) c++;
    return (this.count = c);
  }
  idx(x: number, y: number, z: number): number {
    return x + this.sx * (y + this.sy * z);
  }
  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }
  get(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    return this.data[x + this.sx * (y + this.sy * z)];
  }
  set(x: number, y: number, z: number, p: number): void {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return;
    const i = x + this.sx * (y + this.sy * z);
    const old = this.data[i];
    if (old && !p) this.count--;
    else if (!old && p) this.count++;
    this.data[i] = p;
  }
  /** fill an inclusive-exclusive box */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: number | ((x: number, y: number, z: number) => number)): void {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); z0 = Math.max(0, z0);
    x1 = Math.min(this.sx, x1); y1 = Math.min(this.sy, y1); z1 = Math.min(this.sz, z1);
    const fn = typeof p === 'function' ? p : null;
    for (let z = z0; z < z1; z++)
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) this.set(x, y, z, fn ? fn(x, y, z) : (p as number));
  }
  /** Int32 coordinate triples of all solid voxels (for Rapier voxel colliders) */
  solidCoords(): Int32Array {
    const out = new Int32Array(this.count * 3);
    const { sx, sy, sz, data } = this;
    let o = 0, i = 0;
    for (let z = 0; z < sz; z++)
      for (let y = 0; y < sy; y++)
        for (let x = 0; x < sx; x++, i++)
          if (data[i]) { out[o++] = x; out[o++] = y; out[o++] = z; }
    return out;
  }
  clone(): VoxelGrid {
    const g = new VoxelGrid(this.sx, this.sy, this.sz, this.data.slice());
    return g;
  }
}

export interface MassProps {
  mass: number;
  /** centre of mass, body-local metres */
  com: V3;
  /** principal moments */
  inertia: V3;
  /** principal frame quaternion */
  frame: { x: number; y: number; z: number; w: number };
}

/** Mass, centre of mass and principal inertia of a grid (each voxel = solid cube of its material density). */
export function computeMassProps(g: VoxelGrid): MassProps {
  const { sx, sy, sz, data } = g;
  const vol = VOXEL * VOXEL * VOXEL;
  let m = 0, cx = 0, cy = 0, cz = 0;
  let i = 0;
  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++, i++) {
        const p = data[i];
        if (!p) continue;
        const w = PAL_DENSITY[p] * vol;
        m += w; cx += w * (x + 0.5); cy += w * (y + 0.5); cz += w * (z + 0.5);
      }
  if (m <= 0) return { mass: 0, com: { x: 0, y: 0, z: 0 }, inertia: { x: 0, y: 0, z: 0 }, frame: { x: 0, y: 0, z: 0, w: 1 } };
  cx /= m; cy /= m; cz /= m;
  let ixx = 0, iyy = 0, izz = 0, ixy = 0, ixz = 0, iyz = 0;
  i = 0;
  const self = (VOXEL * VOXEL) / 6; // cube self inertia factor (m * a^2 / 6)
  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++, i++) {
        const p = data[i];
        if (!p) continue;
        const w = PAL_DENSITY[p] * vol;
        const dx = (x + 0.5 - cx) * VOXEL, dy = (y + 0.5 - cy) * VOXEL, dz = (z + 0.5 - cz) * VOXEL;
        ixx += w * (dy * dy + dz * dz + self);
        iyy += w * (dx * dx + dz * dz + self);
        izz += w * (dx * dx + dy * dy + self);
        ixy -= w * dx * dy; ixz -= w * dx * dz; iyz -= w * dy * dz;
      }
  const { values, quat } = eigenSym3(ixx, iyy, izz, ixy, ixz, iyz);
  return {
    mass: m,
    com: { x: cx * VOXEL, y: cy * VOXEL, z: cz * VOXEL },
    inertia: { x: Math.max(values[0], 1e-9), y: Math.max(values[1], 1e-9), z: Math.max(values[2], 1e-9) },
    frame: quat,
  };
}

/** Jacobi eigen-decomposition of a symmetric 3x3; returns eigenvalues and rotation quaternion. */
export function eigenSym3(a00: number, a11: number, a22: number, a01: number, a02: number, a12: number) {
  const A = [a00, a01, a02, a01, a11, a12, a02, a12, a22];
  const V = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 24; sweep++) {
    const off = Math.abs(A[1]) + Math.abs(A[2]) + Math.abs(A[5]);
    if (off < 1e-12 * (Math.abs(A[0]) + Math.abs(A[4]) + Math.abs(A[8]) + 1e-30)) break;
    for (let p = 0; p < 2; p++)
      for (let q = p + 1; q < 3; q++) {
        const apq = A[p * 3 + q];
        if (Math.abs(apq) < 1e-30) continue;
        const theta = (A[q * 3 + q] - A[p * 3 + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = A[k * 3 + p], akq = A[k * 3 + q];
          A[k * 3 + p] = c * akp - s * akq; A[k * 3 + q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = A[p * 3 + k], aqk = A[q * 3 + k];
          A[p * 3 + k] = c * apk - s * aqk; A[q * 3 + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = V[k * 3 + p], vkq = V[k * 3 + q];
          V[k * 3 + p] = c * vkp - s * vkq; V[k * 3 + q] = s * vkp + c * vkq;
        }
      }
  }
  // ensure right-handed
  const det =
    V[0] * (V[4] * V[8] - V[5] * V[7]) - V[1] * (V[3] * V[8] - V[5] * V[6]) + V[2] * (V[3] * V[7] - V[4] * V[6]);
  if (det < 0) { V[2] = -V[2]; V[5] = -V[5]; V[8] = -V[8]; }
  // rotation matrix (columns = eigenvectors) -> quaternion
  const m00 = V[0], m01 = V[1], m02 = V[2], m10 = V[3], m11 = V[4], m12 = V[5], m20 = V[6], m21 = V[7], m22 = V[8];
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; }
  const l = Math.hypot(x, y, z, w) || 1;
  return { values: [A[0], A[4], A[8]], quat: { x: x / l, y: y / l, z: z / l, w: w / l } };
}
