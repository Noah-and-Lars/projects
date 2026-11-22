// Claim volumes: each claim is its own voxel grid (0.5 m voxels) split into
// 32^3 chunks. Each voxel has a density (Int8, > 0 is solid) and a band
// (Uint8: 1-4 depth bands, 5 bedrock). Edits are spherical SDF brushes that
// mark the touched chunks (and their neighbours) dirty for remeshing.
//
// The host owns this data; meshes and colliders are derived from it.
import { CLAIMS, slateFloor } from './valley.js';
import { mulberry32, hashString } from '../core/rng.js';

export const VOXEL = 0.5;
export const CHUNK = 32;
export const BEDROCK = 5;
// Depth band boundaries in metres below the plot top (BUILD_BRIEF 3.2).
export const BAND_DEPTHS = [0, 6, 14, 22, 28];
export const bandAtDepth = (d) => (d < 6 ? 1 : d < 14 ? 2 : d < 22 ? 3 : d < 28 ? 4 : BEDROCK);
const AIR_ABOVE = 2.5;  // metres of air kept above the plot (for fills and mounds)
const MARGIN = 1;       // voxels around the edge that can never be dug
// (tunnel claims also keep a bedrock skin top and bottom: see createClaimVolume)

// Depth below the surface that decides band and nugget weight. Ember Seam is
// horizontal: it deepens with distance from the adit door, from slate (14 m
// equivalent) to basalt and then a bedrock wall at the far end.
export function depthFn(def) {
  if (def.tunnel) return (x) => 14 + (x - def.x0) * (14 / 42);
  return (x, y) => def.top - y;
}

export function createClaimVolume(def) {
  const nx = Math.round(def.w / VOXEL), nz = Math.round(def.d / VOXEL);
  const tunnel = !!def.tunnel;
  // Pit claims: 1 m of bedrock under the deepest band, air above. Tunnel
  // claims: solid rock from 3 m under the adit floor to the volume's top,
  // with a bedrock skin top and bottom.
  const bottom = tunnel ? def.floor - 3 : def.top - def.depth - 1;
  const ny = Math.ceil(((tunnel ? def.top : def.top + AIR_ABOVE) - bottom) / VOXEL);
  const dens = new Int8Array(nx * ny * nz), band = new Uint8Array(nx * ny * nz);
  const idx = (x, y, z) => (y * nz + z) * nx + x;
  const dfn = depthFn(def);
  for (let y = 0; y < ny; y++) {
    const wy = bottom + (y + 0.5) * VOXEL, depth = def.top - wy;
    if (tunnel) {
      const skin = y < 2 || y >= ny - 2;
      for (let x = 0; x < nx; x++) {
        const dd = dfn(def.x0 + (x + 0.5) * VOXEL), b = skin || dd > def.depth ? BEDROCK : bandAtDepth(dd);
        for (let z = 0; z < nz; z++) { dens[idx(x, y, z)] = 127; band[idx(x, y, z)] = b; }
      }
      continue;
    }
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
    contains: (x, z, y) => x > def.x0 && x < def.x1 && z > def.z0 && z < def.z1 && (y == null || (y > bottom - 1 && y < (tunnel ? def.top : def.top + 4))),
    // Depth that decides band and weight at a world point.
    depthAt: (x, y) => dfn(x, y),
    vein: VEINS[def.id] || null,
    veinAt(x, y, z) { const v = vol.vein; return v && Math.hypot(x - v.x, y - v.y, z - v.z) < v.r ? v.material : null; },
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
    markAll() { for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) vol.dirty.add(`${i},${j},${k}`); },
  };
  shape(vol);
  vol.markAll();
  return vol;
}

// ---- Hand-shaped claims (deterministic, so they are not saved) ----
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Carve: f(x, y, z) gives the signed distance (m) to the region to remove,
// negative inside. Edge voxels stay solid so the claim keeps its rim.
function carve(vol, f, { openX0 = false, openX1 = false } = {}) {
  const { nx, ny, nz, dens, origin } = vol;
  for (let y = 0; y < ny; y++) for (let z = 1; z < nz - 1; z++) for (let x = openX0 ? 0 : 1; x < (openX1 ? nx : nx - 1); x++) {
    const i = vol.idx(x, y, z);
    const d = Math.max(-127, Math.min(127, Math.round(f(origin[0] + (x + 0.5) * VOXEL, origin[1] + (y + 0.5) * VOXEL, origin[2] + (z + 0.5) * VOXEL) / VOXEL * 64)));
    if (d < dens[i]) dens[i] = d;
  }
}
// Old Cut's pit: an oval dug in two steps, 5 m at the bottom.
export const PIT = { dx: -4, dz: 2, rx: 12, rz: 9, depth: 5 };
// The relic the old diggers left: under the pit floor (Pumphouse stage 2).
export function relicSpot() {
  const c = CLAIMS.find(k => k.id === 'oldcut');
  return [c.cx + PIT.dx + 4.5, c.top - PIT.depth - 0.6, c.cz + PIT.dz - 2.5];
}
function shape(vol) {
  const c = vol.def;
  if (c.id === 'oldcut') {
    const px = c.cx + PIT.dx, pz = c.cz + PIT.dz;
    carve(vol, (x, y, z) => {
      const q = Math.hypot((x - px) / PIT.rx, (z - pz) / PIT.rz);
      const floor = c.top - PIT.depth + 2.5 * sstep(0.5, 0.62, q) + 2.6 * sstep(0.84, 1.0, q);
      return floor - y;
    });
  } else if (c.id === 'slate') {
    // Three terraces stepping down 5 m at a time toward the valley (+x);
    // the lowest opens onto the hillside, which follows it down.
    carve(vol, (x, y) => slateFloor(c, x) - y, { openX1: true });
  } else if (c.id === 'glimmer') {
    // The hollow: a shallow bowl, 3 m at its deepest.
    carve(vol, (x, y, z) => c.top - 3 * (1 - sstep(0, 1, Math.hypot(x - c.cx, z - c.cz) / 15)) - y);
  } else if (c.tunnel) {
    // A short entry cut behind the door, the size of the adit.
    // x = 0 stays open: the adit tunnel joins the volume there.
    const rough = (x, y, z) => 0.18 * Math.sin(x * 2.1 + z * 1.3) * Math.sin(y * 2.7 - x * 0.9) + 0.12 * Math.sin(z * 3.3 + y * 1.7);
    carve(vol, (x, y, z) => Math.max(x - (c.x0 + 5), Math.abs(z - c.cz) - 2.4, c.floor - y, y - (c.floor + 3.9)) + rough(x, y, z) * (y > c.floor + 0.3 ? 1 : 0), { openX0: true });
  }
}

// ---- Veins (BUILD_BRIEF 3.3): one sphere per claim, radius 3-6 m, seeded
// at world generation. Inside it a third of rolls give its material.
export const VEINS = {};
{
  const rng = mulberry32(hashString('rillstone-veins'));
  // Positions are seeded; materials follow each claim's character and price.
  const MAT = { gravel: 'silver', willow: 'gold', oldcut: 'gold', slate: 'glimmerite', glimmer: 'glimmerite', ember: 'emberite' };
  for (const c of CLAIMS) {
    const r = c.id === 'gravel' ? 3 : 3 + rng() * 3;
    const m = r + 1;
    let x = c.x0 + m + rng() * (c.w - 2 * m), z = c.z0 + m + rng() * (c.d - 2 * m), y, material;
    if (c.tunnel) {
      x = c.x0 + 16 + rng() * 20; y = c.floor + 1 + rng() * 3; material = 'emberite';
    } else {
      const depth = c.id === 'glimmer' ? 11 : Math.min(c.depth - r - 1.5, r + 1 + rng() * (c.depth - 2 * r - 2));
      y = c.top - Math.max(c.id === 'gravel' ? 3 : 0, depth);
      material = MAT[c.id] || 'silver';
      if (c.id === 'glimmer') { x = c.cx + 6; z = c.cz - 5; }
      // Glimmerite never shows in band 1: keep that vein below 6 m.
      if (material === 'glimmerite') y = Math.min(y, c.top - 6 - r * 0.5);
    }
    VEINS[c.id] = { x, y, z, r: c.id === 'glimmer' ? 5 : r, material, claim: c.id };
  }
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

// Axis-aligned box brush (the Excavator): cuts cells fixed to the world
// grid, so trenches come out straight whatever the chassis does.
export function boxBrush(vol, min, max, maxBand = 1) {
  const a = vol.toVoxel(min[0], min[1], min[2]), b = vol.toVoxel(max[0], max[1], max[2]);
  const x0 = Math.max(MARGIN, Math.floor(a[0]) - 1), x1 = Math.min(vol.nx - 1 - MARGIN, Math.ceil(b[0]) + 1);
  const y0 = Math.max(0, Math.floor(a[1]) - 1), y1 = Math.min(vol.ny - 1, Math.ceil(b[1]) + 1);
  const z0 = Math.max(MARGIN, Math.floor(a[2]) - 1), z1 = Math.min(vol.nz - 1 - MARGIN, Math.ceil(b[2]) + 1);
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, cz = (a[2] + b[2]) / 2, hx = (b[0] - a[0]) / 2, hy = (b[1] - a[1]) / 2, hz = (b[2] - a[2]) / 2;
  let removed = 0, blockedBand = 0, touched = false;
  const bands = {}, cell = VOXEL ** 3;
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy, qz = Math.abs(z - cz) - hz;
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
    if (d > 1) continue;
    const i = vol.idx(x, y, z), target = Math.max(-127, Math.min(127, Math.round(d * 64))), old = vol.dens[i];
    if (old <= target) continue;
    const bd = vol.band[i];
    if (bd === BEDROCK || bd > maxBand) { if (old > 0 && d < 0) blockedBand = Math.max(blockedBand, bd); continue; }
    vol.dens[i] = target;
    const fOld = Math.min(1, Math.max(0, old / 128 + 0.5)), fNew = Math.min(1, Math.max(0, target / 128 + 0.5)), dv = (fOld - fNew) * cell;
    removed += dv; bands[bd] = (bands[bd] || 0) + dv; touched = true;
  }
  if (touched) { markDirty(vol, x0, y0, z0, x1, y1, z1); vol.editSeq++; }
  return { removed, blockedBand, bands };
}
// Height of the solid surface in a column (world y), or null.
// fromY: start the search below this height (tunnels have a rock ceiling).
export function surfaceY(vol, x, z, fromY = Infinity) {
  const v = vol.toVoxel(x, fromY === Infinity ? 0 : fromY, z), ix = Math.round(v[0]), iz = Math.round(v[2]);
  if (ix < 0 || iz < 0 || ix >= vol.nx || iz >= vol.nz) return null;
  const top = fromY === Infinity ? vol.ny - 1 : Math.min(vol.ny - 1, Math.floor(v[1]));
  for (let y = top; y >= 0; y--) if (vol.dens[vol.idx(ix, y, iz)] > 0) return vol.origin[1] + (y + 0.5) * VOXEL + 0.25;
  return null;
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

export const VOXEL_CLAIMS = ['gravel', 'willow', 'oldcut', 'slate', 'glimmer', 'ember'];
// Mark them so the valley terrain leaves a hole for each volume.
for (const c of CLAIMS) if (VOXEL_CLAIMS.includes(c.id)) c.voxel = true;
export function claimDefs() { return CLAIMS.filter(c => VOXEL_CLAIMS.includes(c.id)); }

// Saves: copy a chunk's voxels out of / back into a volume.
export function readChunk(vol, ck) {
  const [i, j, k] = ck.split(',').map(Number), n = CHUNK ** 3;
  const dens = new Int8Array(n), band = new Uint8Array(n);
  let o = 0;
  for (let y = 0; y < CHUNK; y++) for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++, o++) {
    const X = i * CHUNK + x, Y = j * CHUNK + y, Z = k * CHUNK + z;
    if (X >= vol.nx || Y >= vol.ny || Z >= vol.nz) continue;
    const id = vol.idx(X, Y, Z); dens[o] = vol.dens[id]; band[o] = vol.band[id];
  }
  return { dens, band };
}
export function writeChunk(vol, ck, dens, band) {
  const [i, j, k] = ck.split(',').map(Number);
  let o = 0;
  for (let y = 0; y < CHUNK; y++) for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++, o++) {
    const X = i * CHUNK + x, Y = j * CHUNK + y, Z = k * CHUNK + z;
    if (X >= vol.nx || Y >= vol.ny || Z >= vol.nz) continue;
    const id = vol.idx(X, Y, Z); vol.dens[id] = dens[o]; vol.band[id] = band[o];
  }
  vol.modified.add(ck); vol.markAll();
}
