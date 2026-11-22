// The 24 proper rotations of a cube, as integer 3x3 matrices (row-major).
// Index 0 is identity. Parts store an orientation as an index into this table.
import type { Vec3 } from './math';

export type Mat3i = readonly [number, number, number, number, number, number, number, number, number];

function det(m: Mat3i): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

export function mulM(a: Mat3i, b: Mat3i): Mat3i {
  const r: number[] = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r as unknown as Mat3i;
}

export function mulMV(m: Mat3i, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

const key = (m: Mat3i) => m.join(',');

function build(): Mat3i[] {
  const perms = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];
  const out: Mat3i[] = [[1, 0, 0, 0, 1, 0, 0, 0, 1]];
  for (const p of perms)
    for (let s = 0; s < 8; s++) {
      const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let r = 0; r < 3; r++) m[r * 3 + p[r]] = s & (1 << r) ? -1 : 1;
      const mm = m as unknown as Mat3i;
      if (det(mm) === 1 && key(mm) !== key(out[0])) out.push(mm);
    }
  return out;
}

export const ROTATIONS: readonly Mat3i[] = build();
const INDEX = new Map(ROTATIONS.map((m, i) => [key(m), i]));

export function rotIndex(m: Mat3i): number {
  const i = INDEX.get(key(m));
  if (i === undefined) throw new Error('not a proper cube rotation: ' + key(m));
  return i;
}

const RX: Mat3i = [1, 0, 0, 0, 0, -1, 0, 1, 0];
const RY: Mat3i = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const RZ: Mat3i = [0, -1, 0, 1, 0, 0, 0, 0, 1];
const AX = { x: RX, y: RY, z: RZ };

/** Rotate orientation `r` by +90 degrees about a world axis. */
export function rotateAbout(r: number, axis: 'x' | 'y' | 'z', turns = 1): number {
  let m = ROTATIONS[r];
  const q = ((turns % 4) + 4) % 4;
  for (let i = 0; i < q; i++) m = mulM(AX[axis], m);
  return rotIndex(m);
}

/** Reflection matrices (det -1) used for mirroring. */
export const REFLECT = {
  x: [-1, 0, 0, 0, 1, 0, 0, 0, 1] as Mat3i,
  y: [1, 0, 0, 0, -1, 0, 0, 0, 1] as Mat3i,
  z: [1, 0, 0, 0, 1, 0, 0, 0, -1] as Mat3i,
};
