// Claim volumes: each claim is its own voxel grid (0.5 m voxels) split into
// 32^3 chunks. Each voxel has a density (Int8, > 0 is solid) and a band
// (Uint8: 1-4 depth bands, 5 bedrock). Edits are spherical SDF brushes that
// mark the touched chunks (and their neighbours) dirty for remeshing.
//
// The host owns this data; meshes and colliders are derived from it.
import { CLAIMS } from './valley.js';

export const VOXEL = 0.5;
export const CHUNK = 32;
export const BEDROCK = 5;
// Depth band boundaries in metres below the plot top (BUILD_BRIEF 3.2).
export const BAND_DEPTHS = [0, 6, 14, 22, 28];
export const bandAtDepth = (d) => (d < 6 ? 1 : d < 14 ? 2 : d < 22 ? 3 : d < 28 ? 4 : BEDROCK);
const AIR_ABOVE = 2.5;  // metres of air kept above the plot (for fills and mounds)
const MARGIN = 1;       // voxels around the edge that can never be dug

export function createClaimVolume(def) {
  const nx = Math.round(def.w / VOXEL), nz = Math.round(def.d / VOXEL);
  const bottom = def.top - def.depth - 1;            // 1 m of bedrock under the deepest band
  const ny = Math.ceil((def.top + AIR_ABOVE - bottom) / VOXEL);
  const dens = new Int8Array(nx * ny * nz), band = new Uint8Array(nx * ny * nz);
  const idx = (x, y, z) => (y * nz + z) * nx + x;
  for (let y = 0; y < ny; y++) {
    const wy = bottom + (y + 0.5) * VOXEL, depth = def.top - wy;
    const d = Math.max(-127, Math.min(127, Math.round((def.top - wy) / VOXEL * 64)));
    const b = depth > def.depth ? BEDROCK : bandAtDepth(depth);
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) { dens[idx(x, y, z)] = d; band[idx(x, y, z)] = b; }
  }
  const cx = Math.ceil(nx / CHUNK), cy = Math.ceil(ny / CHUNK), cz = Math.ceil(nz / CHUNK);
  const vol = {
    def, id: def.id, nx, ny, nz, cx, cy, cz, dens, band, idx,
    origin: [def.x0, bottom, def.z0],
    dirty: new Set(), modified: new Set(), editSeq: 0,
    chunkKey: (i, j, k) => `${def.id}:${i},${j},${k}`,
    // World position -> voxel coordinates (floating).
    toVoxel: (x, y, z) => [(x - def.x0) / VOXEL - 0.5, (y - bottom) / VOXEL - 0.5, (z - def.z0) / VOXEL - 0.5],
    contains: (x, z) => x > def.x0 && x < def.x1 && z > def.z0 && z < def.z1,
    // Band of the solid voxel nearest a world point (for tool gating and loot).
    bandAt(x, y, z) {
      const v = vol.toVoxel(x, y, z);
      let best = 0, bd = 1e9;
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const ix = Math.round(v[0]) + dx, iy = Math.round(v[1]) + dy, iz = Math.round(v[2]) + dz;
        if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) continue;
        const i = idx(ix, iy, iz);
        if (dens[i] <= 0) continue;
        const dd = (ix - v[0]) ** 2 + (iy - v[1]) ** 2 + (iz - v[2]) ** 2;
        if (dd < bd) { bd = dd; best = band[i]; }
      }
      return best;
    },
    depthAt: (y) => def.top - y,
    markAll() { for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) vol.dirty.add(`${i},${j},${k}`); },
  };
  vol.markAll();
  return vol;
}

function markDirty(vol, x0, y0, z0, x1, y1, z1) {
  // Surface nets vertices near a chunk border depend on the neighbour's
  // samples, so pad by 2 voxels.
  const c = (v, n) => Math.max(0, Math.min(n - 1, Math.floor(v / CHUNK)));
  for (let k = c(z0 - 2, vol.cz); k <= c(z1 + 2, vol.cz); k++)
    for (let j = c(y0 - 2, vol.cy); j <= c(y1 + 2, vol.cy); j++)
      for (let i = c(x0 - 2, vol.cx); i <= c(x1 + 2, vol.cx); i++) { vol.dirty.add(`${i},${j},${k}`); vol.modified.add(`${i},${j},${k}`); }
}

// Spherical brush. mode 'dig' removes, 'fill' adds. maxBand: the hardest
// band the tool can cut. Returns { removed (m^3), blockedBand, bands: {band: m^3} }.
export function brush(vol, centre, radius, mode = 'dig', maxBand = 1) {
  const [vx, vy, vz] = vol.toVoxel(centre[0], centre[1], centre[2]);
  const r = radius / VOXEL;
  const x0 = Math.max(MARGIN, Math.floor(vx - r - 1)), x1 = Math.min(vol.nx - 1 - MARGIN, Math.ceil(vx + r + 1));
  const y0 = Math.max(0, Math.floor(vy - r - 1)), y1 = Math.min(vol.ny - 1, Math.ceil(vy + r + 1));
  const z0 = Math.max(MARGIN, Math.floor(vz - r - 1)), z1 = Math.min(vol.nz - 1 - MARGIN, Math.ceil(vz + r + 1));
  let removed = 0, blockedBand = 0, touched = false;
  const bands = {};
  const cell = VOXEL ** 3;
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x - vx, y - vy, z - vz);
    if (d > r + 1) continue;
    const i = vol.idx(x, y, z);
    const target = Math.max(-127, Math.min(127, Math.round((d - r) * 64)));
    const old = vol.dens[i];
    if (mode === 'dig') {
      if (old <= target) continue;
      const b = vol.band[i];
      if (b === BEDROCK || b > maxBand) { if (old > 0 && d < r) blockedBand = Math.max(blockedBand, b); continue; }
      vol.dens[i] = target;
      // Solid fraction removed, approximated from the density change.
      const fOld = Math.min(1, Math.max(0, old / 128 + 0.5)), fNew = Math.min(1, Math.max(0, target / 128 + 0.5));
      const dv = (fOld - fNew) * cell;
      removed += dv; bands[b] = (bands[b] || 0) + dv;
      touched = true;
    } else {
      const fillT = -target;
      if (old >= fillT) continue;
      vol.dens[i] = fillT; touched = true;
      if (vol.band[i] === 0) vol.band[i] = 1;
    }
  }
  if (touched) { markDirty(vol, x0, y0, z0, x1, y1, z1); vol.editSeq++; }
  return { removed, blockedBand, bands };
}

// Copy the sample region a chunk mesher needs: cells [-1, CHUNK] around the
// chunk, i.e. (CHUNK + 3)^3 samples, clamped at the volume edges.
export function chunkSamples(vol, i, j, k) {
  const S = CHUNK + 3;
  const dens = new Int8Array(S * S * S), band = new Uint8Array(S * S * S);
  const ox = i * CHUNK - 1, oy = j * CHUNK - 1, oz = k * CHUNK - 1;
  let o = 0;
  for (let y = 0; y < S; y++) {
    const yy = Math.max(0, Math.min(vol.ny - 1, oy + y));
    for (let z = 0; z < S; z++) {
      const zz = Math.max(0, Math.min(vol.nz - 1, oz + z));
      const row = (yy * vol.nz + zz) * vol.nx;
      for (let x = 0; x < S; x++, o++) {
        const xx = Math.max(0, Math.min(vol.nx - 1, ox + x));
        dens[o] = vol.dens[row + xx]; band[o] = vol.band[row + xx];
      }
    }
  }
  // Cells this chunk owns (the volume may not fill the last chunk).
  const lim = [Math.min(CHUNK, vol.nx - i * CHUNK), Math.min(CHUNK, vol.ny - j * CHUNK), Math.min(CHUNK, vol.nz - k * CHUNK)];
  return { dens, band, S, lim, origin: [vol.origin[0] + (ox + 0.5) * VOXEL, vol.origin[1] + (oy + 0.5) * VOXEL, vol.origin[2] + (oz + 0.5) * VOXEL], top: vol.def.top };
}

export const VOXEL_CLAIMS = ['gravel', 'willow'];
// Mark them so the valley terrain leaves a hole for each volume.
for (const c of CLAIMS) if (VOXEL_CLAIMS.includes(c.id)) c.voxel = true;
export function claimDefs() { return CLAIMS.filter(c => VOXEL_CLAIMS.includes(c.id)); }
