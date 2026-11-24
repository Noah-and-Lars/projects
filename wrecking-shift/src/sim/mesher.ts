import { CHUNK } from './body';
import { PAL_EMISSIVE, PAL_GLASS, PAL_RGB, VOXEL } from './materials';
import type { VoxelGrid } from './voxels';

/** Output of meshing one 32^3 chunk. Positions are body-local metres. */
export interface ChunkMesh {
  positions: Float32Array;
  /** rgb = albedo (0..255), a = ambient occlusion (255 = open) */
  colors: Uint8Array;
  normals: Int8Array;
  /** x = emissive (0..255), y = glass flag */
  aux: Uint8Array;
  indices: Uint32Array;
  quads: number;
}

const P = CHUNK + 2;
const pad = new Uint8Array(P * P * P);
const mask = new Int32Array(CHUNK * CHUNK);

// growable output buffers (reused between calls, sliced at the end)
let cap = 4096;
let oPos = new Float32Array(cap * 12);
let oCol = new Uint8Array(cap * 16);
let oNor = new Int8Array(cap * 12);
let oAux = new Uint8Array(cap * 8);
let oIdx = new Uint32Array(cap * 6);
function grow() {
  cap *= 2;
  const p = new Float32Array(cap * 12); p.set(oPos); oPos = p;
  const c = new Uint8Array(cap * 16); c.set(oCol); oCol = c;
  const n = new Int8Array(cap * 12); n.set(oNor); oNor = n;
  const a = new Uint8Array(cap * 8); a.set(oAux); oAux = a;
  const i = new Uint32Array(cap * 6); i.set(oIdx); oIdx = i;
}

const base = [0, 0, 0], du = [0, 0, 0], dv = [0, 0, 0];
const AO_LEVELS = [255, 190, 135, 90];

/**
 * Greedy mesher with per-vertex ambient occlusion.
 * Faces merge when palette index matches and their AO is uniform; faces with an AO gradient
 * are emitted as single quads so the gradient stays correct.
 */
export function meshChunk(grid: VoxelGrid, cx: number, cy: number, cz: number): ChunkMesh | null {
  const { sx, sy, sz, data } = grid;
  const bx = cx * CHUNK, by = cy * CHUNK, bz = cz * CHUNK;
  // copy chunk with 1-voxel border into pad
  let any = false;
  for (let z = 0; z < P; z++) {
    const gz = bz + z - 1;
    for (let y = 0; y < P; y++) {
      const gy = by + y - 1;
      const row = (z * P + y) * P;
      if (gz < 0 || gz >= sz || gy < 0 || gy >= sy) { pad.fill(0, row, row + P); continue; }
      const src = (gz * sy + gy) * sx;
      for (let x = 0; x < P; x++) {
        const gx = bx + x - 1;
        const v = gx < 0 || gx >= sx ? 0 : data[src + gx];
        pad[row + x] = v;
        if (v && x > 0 && x <= CHUNK && y > 0 && y <= CHUNK && z > 0 && z <= CHUNK) any = true;
      }
    }
  }
  if (!any) return null;

  let q = 0;
  const strides = [1, P, P * P];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const sd = strides[d], su = strides[u], sv = strides[v];
    for (let dir = -1; dir <= 1; dir += 2) {
      const nOff = dir * sd;
      for (let s = 0; s < CHUNK; s++) {
        // build mask
        let nonEmpty = false;
        for (let j = 0; j < CHUNK; j++) {
          for (let i = 0; i < CHUNK; i++) {
            const idx = (s + 1) * sd + (i + 1) * su + (j + 1) * sv;
            const p = pad[idx];
            let key = 0;
            if (p && !pad[idx + nOff]) {
              const a = idx + nOff;
              const e0 = pad[a - su] ? 1 : 0, e1 = pad[a + su] ? 1 : 0, e2 = pad[a - sv] ? 1 : 0, e3 = pad[a + sv] ? 1 : 0;
              const c00 = pad[a - su - sv] ? 1 : 0, c10 = pad[a + su - sv] ? 1 : 0, c01 = pad[a - su + sv] ? 1 : 0, c11 = pad[a + su + sv] ? 1 : 0;
              const a00 = e0 && e2 ? 3 : e0 + e2 + c00;
              const a10 = e1 && e2 ? 3 : e1 + e2 + c10;
              const a01 = e0 && e3 ? 3 : e0 + e3 + c01;
              const a11 = e1 && e3 ? 3 : e1 + e3 + c11;
              key = p | (a00 << 8) | (a10 << 10) | (a01 << 12) | (a11 << 14);
              nonEmpty = true;
            }
            mask[j * CHUNK + i] = key;
          }
        }
        if (!nonEmpty) continue;
        // greedy merge
        for (let j = 0; j < CHUNK; j++) {
          for (let i = 0; i < CHUNK; ) {
            const key = mask[j * CHUNK + i];
            if (!key) { i++; continue; }
            const ao = key >> 8;
            const a00 = ao & 3, a10 = (ao >> 2) & 3, a01 = (ao >> 4) & 3, a11 = (ao >> 6) & 3;
            const uniform = a00 === a10 && a00 === a01 && a00 === a11;
            let w = 1, h = 1;
            if (uniform) {
              while (i + w < CHUNK && mask[j * CHUNK + i + w] === key) w++;
              outer: while (j + h < CHUNK) {
                for (let k = 0; k < w; k++) if (mask[(j + h) * CHUNK + i + k] !== key) break outer;
                h++;
              }
              for (let hh = 0; hh < h; hh++) for (let k = 0; k < w; k++) mask[(j + hh) * CHUNK + i + k] = 0;
            } else mask[j * CHUNK + i] = 0;

            if (q >= cap) grow();
            const p = key & 255;
            const r = (PAL_RGB[p * 3] * 255) | 0, g = (PAL_RGB[p * 3 + 1] * 255) | 0, b = (PAL_RGB[p * 3 + 2] * 255) | 0;
            const em = (PAL_EMISSIVE[p] * 255) | 0, gl = PAL_GLASS[p] * 255;
            // quad corners in (d,u,v) space
            const pd = s + (dir > 0 ? 1 : 0);
            base[d] = pd; base[u] = i; base[v] = j;
            du[0] = du[1] = du[2] = 0; du[u] = w;
            dv[0] = dv[1] = dv[2] = 0; dv[v] = h;
            const o = q * 12;
            const ox = bx, oy = by, oz = bz;
            // v0=(0,0) v1=(w,0) v2=(0,h) v3=(w,h)
            for (let c = 0; c < 4; c++) {
              const fu = c & 1, fv = c >> 1;
              oPos[o + c * 3] = (ox + base[0] + du[0] * fu + dv[0] * fv) * VOXEL;
              oPos[o + c * 3 + 1] = (oy + base[1] + du[1] * fu + dv[1] * fv) * VOXEL;
              oPos[o + c * 3 + 2] = (oz + base[2] + du[2] * fu + dv[2] * fv) * VOXEL;
              oNor[o + c * 3] = 0; oNor[o + c * 3 + 1] = 0; oNor[o + c * 3 + 2] = 0;
              oNor[o + c * 3 + d] = dir * 127;
              const a = c === 0 ? a00 : c === 1 ? a10 : c === 2 ? a01 : a11;
              oCol[q * 16 + c * 4] = r; oCol[q * 16 + c * 4 + 1] = g; oCol[q * 16 + c * 4 + 2] = b;
              oCol[q * 16 + c * 4 + 3] = AO_LEVELS[a];
              oAux[q * 8 + c * 2] = em; oAux[q * 8 + c * 2 + 1] = gl;
            }
            // triangulate; flip diagonal for AO anisotropy; winding by direction
            const vi = q * 4, ii = q * 6;
            const flip = a00 + a11 > a10 + a01;
            if (!flip) {
              if (dir > 0) { oIdx[ii] = vi; oIdx[ii + 1] = vi + 1; oIdx[ii + 2] = vi + 3; oIdx[ii + 3] = vi; oIdx[ii + 4] = vi + 3; oIdx[ii + 5] = vi + 2; }
              else { oIdx[ii] = vi; oIdx[ii + 1] = vi + 3; oIdx[ii + 2] = vi + 1; oIdx[ii + 3] = vi; oIdx[ii + 4] = vi + 2; oIdx[ii + 5] = vi + 3; }
            } else {
              if (dir > 0) { oIdx[ii] = vi; oIdx[ii + 1] = vi + 1; oIdx[ii + 2] = vi + 2; oIdx[ii + 3] = vi + 1; oIdx[ii + 4] = vi + 3; oIdx[ii + 5] = vi + 2; }
              else { oIdx[ii] = vi; oIdx[ii + 1] = vi + 2; oIdx[ii + 2] = vi + 1; oIdx[ii + 3] = vi + 1; oIdx[ii + 4] = vi + 2; oIdx[ii + 5] = vi + 3; }
            }
            q++;
            i += w;
          }
        }
      }
    }
  }
  if (q === 0) return null;
  return {
    positions: oPos.slice(0, q * 12),
    colors: oCol.slice(0, q * 16),
    normals: oNor.slice(0, q * 12),
    aux: oAux.slice(0, q * 8),
    indices: oIdx.slice(0, q * 6),
    quads: q,
  };
}

export function chunkDims(grid: VoxelGrid): [number, number, number] {
  return [Math.ceil(grid.sx / CHUNK), Math.ceil(grid.sy / CHUNK), Math.ceil(grid.sz / CHUNK)];
}
