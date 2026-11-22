// Mesher worker: naive surface nets over one claim chunk, with per-vertex
// ambient occlusion and depth-band colours baked in. Returns render arrays
// and the collider's vertex/index arrays (the same triangles).
const VOXEL = 0.5;
// Band colours (BUILD_BRIEF 3.2): topsoil brown -> ochre clay, grey-blue
// gravel, dark slate, near-black basalt, patterned bedrock.
const BAND = {
  1: [[0.55, 0.38, 0.24], [0.78, 0.58, 0.30]],
  2: [[0.52, 0.58, 0.64], [0.44, 0.50, 0.58]],
  3: [[0.30, 0.32, 0.38], [0.24, 0.26, 0.31]],
  4: [[0.14, 0.12, 0.12], [0.11, 0.09, 0.10]],
  5: [[0.22, 0.18, 0.26], [0.30, 0.25, 0.34]],
};
const BAND_TOP = { 1: 0, 2: 6, 3: 14, 4: 22, 5: 28 };
const BAND_H = { 1: 6, 2: 8, 3: 8, 4: 6, 5: 1 };
const GRASS = [0.56, 0.70, 0.36]; // matches the valley grass (0x8fb35c)
const lin = (c) => Math.pow(c, 2.2);

function mesh({ dens, band, S, lim, origin, top }) {
  const at = (x, y, z) => (y * S + z) * S + x;
  const solid = (x, y, z) => dens[at(x, y, z)] > 0;
  const vid = new Int32Array(S * S * S).fill(-1);
  const pos = [], col = [], idx = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  // 1. One vertex per cell that straddles the surface.
  for (let z = 0; z < S - 1 && z <= lim[2] + 1; z++) for (let y = 0; y < S - 1 && y <= lim[1] + 1; y++) for (let x = 0; x < S - 1 && x <= lim[0] + 1; x++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const k = corners[c]; v[c] = dens[at(x + k[0], y + k[1], z + k[2])]; if (v[c] > 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((v[a] > 0) === (v[b] > 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      const ka = corners[a], kb = corners[b];
      sx += ka[0] + (kb[0] - ka[0]) * t; sy += ka[1] + (kb[1] - ka[1]) * t; sz += ka[2] + (kb[2] - ka[2]) * t; n++;
    }
    const px = origin[0] + (x + sx / n) * VOXEL, py = origin[1] + (y + sy / n) * VOXEL, pz = origin[2] + (z + sz / n) * VOXEL;
    // Occlusion: share of solid samples in the 4x4x4 block around the cell.
    let s = 0, tot = 0, bnd = 0, bd = 9;
    for (let dz = -1; dz <= 2; dz++) for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy, zz = z + dz;
      if (xx < 0 || yy < 0 || zz < 0 || xx >= S || yy >= S || zz >= S) continue;
      tot++;
      if (solid(xx, yy, zz)) {
        s++;
        const dd = Math.abs(dx - 0.5) + Math.abs(dy - 0.5) + Math.abs(dz - 0.5);
        if (dd < bd) { bd = dd; bnd = band[at(xx, yy, zz)]; }
      }
    }
    const occ = s / tot;
    const ao = Math.max(0.42, Math.min(1.08, 1.45 - occ * 1.05));
    const b = bnd || 1;
    const depth = top - py;
    const pair = BAND[b];
    const t = Math.min(1, Math.max(0, (depth - BAND_TOP[b]) / BAND_H[b]));
    let r = pair[0][0] + (pair[1][0] - pair[0][0]) * t, g = pair[0][1] + (pair[1][1] - pair[0][1]) * t, bl = pair[0][2] + (pair[1][2] - pair[0][2]) * t;
    if (b === 5 && ((Math.floor(px * 2) + Math.floor(pz * 2) + Math.floor(py * 2)) & 1)) { r *= 0.8; g *= 0.8; bl *= 0.8; } // bedrock pattern
    if (b === 3 && Math.sin(px * 12.9898 + py * 78.233 + pz * 37.719) > 0.93) { r = g = bl = 0.85; } // quartz flecks
    if (depth < 0.3 && occ < 0.6) { r = GRASS[0]; g = GRASS[1]; bl = GRASS[2]; } // untouched grassy top
    const aoF = depth < 0.3 ? Math.max(0.82, ao) : ao; // keep grass rims from going murky
    vid[at(x, y, z)] = pos.length / 3;
    pos.push(px, py, pz);
    // Colours above are sRGB; vertex colours are linear.
    col.push(lin(r) * aoF, lin(g) * aoF, lin(bl) * aoF);
  }
  // 2. One quad per sign-changing edge owned by this chunk.
  const own = (p, a) => p >= 1 && p < lim[a] + 1;
  for (let z = 1; z < S - 1; z++) for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    if (!own(x, 0) || !own(y, 1) || !own(z, 2)) continue;
    const s0 = solid(x, y, z);
    // Edges along +x, +y, +z from (x,y,z).
    for (let a = 0; a < 3; a++) {
      const nx = x + (a === 0), ny = y + (a === 1), nz = z + (a === 2);
      if (nx >= S || ny >= S || nz >= S) continue;
      if (s0 === solid(nx, ny, nz)) continue;
      // The 4 cells around this edge.
      let c;
      if (a === 0) c = [at(x, y - 1, z - 1), at(x, y, z - 1), at(x, y, z), at(x, y - 1, z)];
      else if (a === 1) c = [at(x - 1, y, z - 1), at(x - 1, y, z), at(x, y, z), at(x, y, z - 1)];
      else c = [at(x - 1, y - 1, z), at(x, y - 1, z), at(x, y, z), at(x - 1, y, z)];
      const q = c.map(i => vid[i]);
      if (q.some(i => i < 0)) continue;
      if (s0) idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      else idx.push(q[0], q[2], q[1], q[0], q[3], q[2]);
    }
  }
  return { pos: new Float32Array(pos), col: new Float32Array(col), idx: new Uint32Array(idx) };
}

self.onmessage = (e) => {
  const m = e.data;
  const t0 = performance.now();
  const r = mesh(m);
  self.postMessage({ re: m.rq, key: m.key, seq: m.seq, ...r, ms: performance.now() - t0 }, [r.pos.buffer, r.col.buffer, r.idx.buffer]);
};
