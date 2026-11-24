import { CHUNK } from './body';
import { PAL_EMISSIVE, PAL_GLASS, PAL_RGB, VOXEL } from './materials';
import type { VoxelGrid } from './voxels';

/** Output of meshing one 32^3 chunk. Positions are body-local metres. */
export interface ChunkMesh {
  positions: Float32Array;
  /** rgb = albedo (0..255), a = ambient occlusion (255 = open) */
  colors: Uint8Array;
  normals: Int8Array;
  /**
   * 3 bytes per vertex: x = emissive (0..255), y = glass flag (0 / 255),
   * z = corner code: bit 0 / 1 = corner is on the +u / +v side of its quad (u = axis after the normal axis, v = the one
   * after that), bit 2 / 3 = the surface continues past that u / v edge (the edge may be overlapped to hide cracks)
   */
  aux: Uint8Array;
  /** triangles of the opaque quads */
  indices: Uint32Array;
  /** triangles of glass quads (same vertex buffers; draw with a translucent material) */
  glassIndices: Uint32Array;
  /** total quads (opaque + glass) */
  quads: number;
  glassQuads: number;
}

export interface MeshOptions {
  /**
   * true (default): per-vertex AO is baked into colour alpha and faces only merge when their AO is uniform.
   * false: AO comes from elsewhere (occupancy volume) -> merge on palette index only (about 2x fewer quads), alpha = 255.
   */
  bakeAO?: boolean;
  /** grow every quad in-plane by this many voxels (0.01 hides T-junction cracks of greedy meshes) */
  inflate?: number;
}

const P = CHUNK + 2;
const pad = new Uint8Array(P * P * P);
const mask = new Int32Array(CHUNK * CHUNK);

// growable output buffers (reused between calls, sliced at the end)
let cap = 4096;
let oPos = new Float32Array(cap * 12);
let oCol = new Uint8Array(cap * 16);
let oNor = new Int8Array(cap * 12);
let oAux = new Uint8Array(cap * 12);
let oOIdx = new Uint32Array(cap * 6);
let oGIdx = new Uint32Array(cap * 6);
function grow() {
  cap *= 2;
  const p = new Float32Array(cap * 12); p.set(oPos); oPos = p;
  const c = new Uint8Array(cap * 16); c.set(oCol); oCol = c;
  const n = new Int8Array(cap * 12); n.set(oNor); oNor = n;
  const a = new Uint8Array(cap * 12); a.set(oAux); oAux = a;
  const i = new Uint32Array(cap * 6); i.set(oOIdx); oOIdx = i;
  const gi = new Uint32Array(cap * 6); gi.set(oGIdx); oGIdx = gi;
}

const base = [0, 0, 0], du = [0, 0, 0], dv = [0, 0, 0];
const AO_LEVELS = [255, 190, 135, 90];
/** neighbour lets an opaque face show: empty or glass */
const SEE = new Uint8Array(256);
/** occludes for baked AO: solid and not glass */
const OCC = new Uint8Array(256);
for (let p = 0; p < 256; p++) { SEE[p] = p === 0 || PAL_GLASS[p] ? 1 : 0; OCC[p] = p !== 0 && !PAL_GLASS[p] ? 1 : 0; }

// occupancy bit rows of the padded chunk (34 x 34 lines, 32 bits each = the chunk's interior span of that axis)
// R*: bits along x, index z * P + y.   C*: bits along y, index z * P + x.   *s = any solid, *o = opaque (not glass)
const Rs = new Int32Array(P * P), Ro = new Int32Array(P * P), Cs = new Int32Array(P * P), Co = new Int32Array(P * P);
const lines = new Int32Array(CHUNK);

/**
 * Greedy mesher with optional per-vertex ambient occlusion.
 * Faces merge when the palette index matches and (with `bakeAO`) their AO is uniform; faces with an AO
 * gradient are emitted as single quads so the gradient stays correct. Glass quads get their own index list.
 *
 * Face detection is bit-parallel (one 32-bit word per voxel line), so empty / solid / hollow chunks cost
 * little more than the padded copy, and only slices that contain faces are visited.
 */
export function meshChunk(grid: VoxelGrid, cx: number, cy: number, cz: number, opts?: MeshOptions): ChunkMesh | null {
  const { sx, sy, sz, data } = grid;
  const bakeAO = opts?.bakeAO ?? true;
  const inflate = (opts?.inflate ?? 0) * VOXEL;
  const bx = cx * CHUNK, by = cy * CHUNK, bz = cz * CHUNK;
  // quick reject: nothing inside the chunk
  {
    const x1 = Math.min(sx, bx + CHUNK), y1 = Math.min(sy, by + CHUNK), z1 = Math.min(sz, bz + CHUNK);
    let any = false;
    outer: for (let z = bz; z < z1; z++)
      for (let y = by; y < y1; y++) {
        const r = (z * sy + y) * sx;
        for (let i = r + bx, e = r + x1; i < e; i++) if (data[i]) { any = true; break outer; }
      }
    if (!any) return null;
  }
  // copy the chunk with a 1-voxel border into pad and build the bit rows
  Cs.fill(0); Co.fill(0);
  const gx0 = Math.max(0, bx - 1), gx1 = Math.min(sx, bx + CHUNK + 1);
  for (let z = 0; z < P; z++) {
    const gz = bz + z - 1;
    for (let y = 0; y < P; y++) {
      const gy = by + y - 1;
      const row = (z * P + y) * P;
      const zy = z * P + y;
      pad.fill(0, row, row + P);
      if (gz < 0 || gz >= sz || gy < 0 || gy >= sy) { Rs[zy] = 0; Ro[zy] = 0; continue; }
      const src = (gz * sy + gy) * sx;
      const zc = z * P;
      const yIn = y >= 1 && y <= CHUNK, ybit = 1 << (y - 1);
      let rs = 0, ro = 0;
      for (let gx = gx0; gx < gx1; gx++) {
        const v = data[src + gx];
        if (!v) continue;
        const x = gx - bx + 1;
        pad[row + x] = v;
        const o = OCC[v];
        if (x >= 1 && x <= CHUNK) { rs |= 1 << (x - 1); if (o) ro |= 1 << (x - 1); }
        if (yIn) { Cs[zc + x] |= ybit; if (o) Co[zc + x] |= ybit; }
      }
      Rs[zy] = rs; Ro[zy] = ro;
    }
  }

  let q = 0, qo = 0, qg = 0;
  const strides = [1, P, P * P];
  const gridSize = [sx, sy, sz], chunkBase = [bx, by, bz];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const sd = strides[d], su = strides[u], sv = strides[v];
    // bit rows for this axis: line index a, bit index b.
    //   d=0: (bit, line) = (i, j) = (y, z)    d=1: (line, bit) = (i, j) = (z, x)    d=2: (bit, line) = (i, j) = (x, y)
    const S_ = d === 0 ? Cs : Rs, O_ = d === 0 ? Co : Ro;
    const bitIsI = d !== 1;
    // may quads be inflated past the grid boundary? only horizontal faces (ground tiles lie side by side);
    // doing it for vertical faces would poke fins through the neighbouring tile's surface
    const edgeOut = d === 1 ? 1 : 0;
    const gu = gridSize[u] - chunkBase[u], gv = gridSize[v] - chunkBase[v], cu = chunkBase[u], cv = chunkBase[v];
    for (let dir = -1; dir <= 1; dir += 2) {
      const nOff = dir * sd;
      for (let s = 0; s < CHUNK; s++) {
        // face words of this slice
        let anyFace = 0;
        const S1 = s + 1, S2 = s + 1 + dir;
        for (let a = 0; a < CHUNK; a++) {
          const li = d === 2 ? S1 * P + (a + 1) : (a + 1) * P + S1;
          const ln = d === 2 ? S2 * P + (a + 1) : (a + 1) * P + S2;
          const o = O_[li];
          // opaque faces show next to air or glass; glass faces only next to air
          const f = (o & ~O_[ln]) | (S_[li] & ~o & ~S_[ln]);
          lines[a] = f;
          anyFace |= f;
        }
        if (!anyFace) continue;
        const sBase = (s + 1) * sd + su + sv;
        // keys for face cells only. mask[a * CHUNK + b]: a = line, b = bit
        for (let a = 0; a < CHUNK; a++) {
          let f = lines[a];
          while (f) {
            const b = 31 - Math.clz32(f & -f);
            f &= f - 1;
            const idx = bitIsI ? sBase + b * su + a * sv : sBase + a * su + b * sv;
            let key = pad[idx];
            if (bakeAO) {
              const n = idx + nOff;
              const e0 = OCC[pad[n - su]], e1 = OCC[pad[n + su]], e2 = OCC[pad[n - sv]], e3 = OCC[pad[n + sv]];
              const c00 = OCC[pad[n - su - sv]], c10 = OCC[pad[n + su - sv]], c01 = OCC[pad[n - su + sv]], c11 = OCC[pad[n + su + sv]];
              const a00 = e0 && e2 ? 3 : e0 + e2 + c00;
              const a10 = e1 && e2 ? 3 : e1 + e2 + c10;
              const a01 = e0 && e3 ? 3 : e0 + e3 + c01;
              const a11 = e1 && e3 ? 3 : e1 + e3 + c11;
              key |= (a00 << 8) | (a10 << 10) | (a01 << 12) | (a11 << 14);
            }
            mask[a * CHUNK + b] = key;
          }
        }
        // greedy merge driven by the remaining face bits: quads grow along the bit axis first, then across lines
        for (let a = 0; a < CHUNK; a++) {
          while (lines[a]) {
            const rowBits = lines[a];
            const b = 31 - Math.clz32(rowBits & -rowBits);
            const key = mask[a * CHUNK + b];
            const ao = key >> 8;
            const a00 = ao & 3, a10 = (ao >> 2) & 3, a01 = (ao >> 4) & 3, a11 = (ao >> 6) & 3;
            const uniform = a00 === a10 && a00 === a01 && a00 === a11;
            let wb = 1, ha = 1;
            if (uniform) {
              while (b + wb < CHUNK && ((rowBits >>> (b + wb)) & 1) && mask[a * CHUNK + b + wb] === key) wb++;
              const wm = wb === 32 ? -1 : ((1 << wb) - 1) << b;
              outer: while (a + ha < CHUNK && (lines[a + ha] & wm) === wm) {
                const r = (a + ha) * CHUNK + b;
                for (let k = 0; k < wb; k++) if (mask[r + k] !== key) break outer;
                ha++;
              }
              for (let k = 0; k < ha; k++) lines[a + k] &= ~wm;
            } else lines[a] = rowBits & ~(1 << b);
            // back to (i, j) / (w along u, h along v)
            const i = bitIsI ? b : a, j = bitIsI ? a : b, w = bitIsI ? wb : ha, h = bitIsI ? ha : wb;

            if (q >= cap) grow();
            const p = key & 255;
            const r = (PAL_RGB[p * 3] * 255) | 0, g = (PAL_RGB[p * 3 + 1] * 255) | 0, bl = (PAL_RGB[p * 3 + 2] * 255) | 0;
            const em = (PAL_EMISSIVE[p] * 255) | 0, gl = PAL_GLASS[p] * 255;
            // Does the surface continue past each edge? (that is where greedy T-junctions can crack; such edges
            // get overlapped: by `inflate` here and / or by a distance-proportional amount in the vertex shader,
            // driven by the corner byte.) Convex edges stay exact, so nothing pokes out of neighbouring surfaces.
            let cU0 = edgeOut, cU1 = edgeOut, cV0 = edgeOut, cV1 = edgeOut;
            {
              const cb = sBase + i * su + j * sv;
              if (i + cu !== 0) { cU0 = 0; for (let k = 0; k < h; k++) { const c = cb - su + k * sv, pp = pad[c]; if (pp && (PAL_GLASS[pp] ? !pad[c + nOff] : SEE[pad[c + nOff]])) { cU0 = 1; break; } } }
              if (i + w !== gu) { cU1 = 0; for (let k = 0; k < h; k++) { const c = cb + w * su + k * sv, pp = pad[c]; if (pp && (PAL_GLASS[pp] ? !pad[c + nOff] : SEE[pad[c + nOff]])) { cU1 = 1; break; } } }
              if (j + cv !== 0) { cV0 = 0; for (let k = 0; k < w; k++) { const c = cb - sv + k * su, pp = pad[c]; if (pp && (PAL_GLASS[pp] ? !pad[c + nOff] : SEE[pad[c + nOff]])) { cV0 = 1; break; } } }
              if (j + h !== gv) { cV1 = 0; for (let k = 0; k < w; k++) { const c = cb + h * sv + k * su, pp = pad[c]; if (pp && (PAL_GLASS[pp] ? !pad[c + nOff] : SEE[pad[c + nOff]])) { cV1 = 1; break; } } }
            }
            const inU0 = cU0 ? inflate : 0, inU1 = cU1 ? inflate : 0, inV0 = cV0 ? inflate : 0, inV1 = cV1 ? inflate : 0;
            // quad corners in (d,u,v) space
            const pd = s + (dir > 0 ? 1 : 0);
            base[d] = pd; base[u] = i; base[v] = j;
            du[0] = du[1] = du[2] = 0; du[u] = w;
            dv[0] = dv[1] = dv[2] = 0; dv[v] = h;
            const o = q * 12;
            // v0=(0,0) v1=(w,0) v2=(0,h) v3=(w,h)
            for (let c = 0; c < 4; c++) {
              const fu = c & 1, fv = c >> 1;
              oPos[o + c * 3] = (bx + base[0] + du[0] * fu + dv[0] * fv) * VOXEL;
              oPos[o + c * 3 + 1] = (by + base[1] + du[1] * fu + dv[1] * fv) * VOXEL;
              oPos[o + c * 3 + 2] = (bz + base[2] + du[2] * fu + dv[2] * fv) * VOXEL;
              if (inflate) {
                oPos[o + c * 3 + u] += fu ? inU1 : -inU0;
                oPos[o + c * 3 + v] += fv ? inV1 : -inV0;
              }
              oNor[o + c * 3] = 0; oNor[o + c * 3 + 1] = 0; oNor[o + c * 3 + 2] = 0;
              oNor[o + c * 3 + d] = dir * 127;
              const a = c === 0 ? a00 : c === 1 ? a10 : c === 2 ? a01 : a11;
              oCol[q * 16 + c * 4] = r; oCol[q * 16 + c * 4 + 1] = g; oCol[q * 16 + c * 4 + 2] = bl;
              oCol[q * 16 + c * 4 + 3] = AO_LEVELS[a];
              oAux[q * 12 + c * 3] = em; oAux[q * 12 + c * 3 + 1] = gl;
              oAux[q * 12 + c * 3 + 2] = fu | (fv << 1) | ((fu ? cU1 : cU0) << 2) | ((fv ? cV1 : cV0) << 3);
            }
            // triangulate; flip diagonal for AO anisotropy; winding by direction
            const vi = q * 4;
            const oIdx = gl ? oGIdx : oOIdx;
            const ii = gl ? qg++ * 6 : qo++ * 6;
            const flip = a00 + a11 > a10 + a01;
            if (!flip) {
              if (dir > 0) { oIdx[ii] = vi; oIdx[ii + 1] = vi + 1; oIdx[ii + 2] = vi + 3; oIdx[ii + 3] = vi; oIdx[ii + 4] = vi + 3; oIdx[ii + 5] = vi + 2; }
              else { oIdx[ii] = vi; oIdx[ii + 1] = vi + 3; oIdx[ii + 2] = vi + 1; oIdx[ii + 3] = vi; oIdx[ii + 4] = vi + 2; oIdx[ii + 5] = vi + 3; }
            } else {
              if (dir > 0) { oIdx[ii] = vi; oIdx[ii + 1] = vi + 1; oIdx[ii + 2] = vi + 2; oIdx[ii + 3] = vi + 1; oIdx[ii + 4] = vi + 3; oIdx[ii + 5] = vi + 2; }
              else { oIdx[ii] = vi; oIdx[ii + 1] = vi + 2; oIdx[ii + 2] = vi + 1; oIdx[ii + 3] = vi + 1; oIdx[ii + 4] = vi + 2; oIdx[ii + 5] = vi + 3; }
            }
            q++;
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
    aux: oAux.slice(0, q * 12),
    indices: oOIdx.slice(0, qo * 6),
    glassIndices: oGIdx.slice(0, qg * 6),
    quads: q,
    glassQuads: qg,
  };
}

export function chunkDims(grid: VoxelGrid): [number, number, number] {
  return [Math.ceil(grid.sx / CHUNK), Math.ceil(grid.sy / CHUNK), Math.ceil(grid.sz / CHUNK)];
}
