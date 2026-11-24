// Simple (array-based, not binary) greedy mesher for the look prototype.
// withAO = true  -> classic per-vertex voxel AO baked into an `ao` attribute; quads only merge
//                   when material AND the 4 corner AO values match (fewer merges).
// withAO = false -> merge on material only (AO computed in the fragment shader from the
//                   occupancy volume instead, see trace.glsl.js `voxelFaceAO`).
// Output is in VOXEL units (multiply by VS in the mesh's scale / matrix).

const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

export function meshChunk(w, ox, oy, oz, S, withAO, inflate = 0) {
  const pos = [], nrm = [], mat = [], ao = [], idx = [];
  const solid = (x, y, z) => w.get(x, y, z) !== 0;
  const mask = new Int32Array(S * S);
  const sz = [Math.min(S, w.nx - ox), Math.min(S, w.ny - oy), Math.min(S, w.nz - oz)];
  if (sz[0] <= 0 || sz[1] <= 0 || sz[2] <= 0) return null;
  const org = [ox, oy, oz];
  for (let a = 0; a < 3; a++) {
    const ua = (a + 1) % 3, va = (a + 2) % 3;
    const U = AXES[ua], V = AXES[va];
    for (let s = -1; s <= 1; s += 2) {
      const n = [0, 0, 0]; n[a] = s;
      for (let i = 0; i < sz[a]; i++) {
        // build mask
        mask.fill(0);
        for (let v = 0; v < sz[va]; v++) for (let u = 0; u < sz[ua]; u++) {
          const p = [0, 0, 0]; p[a] = org[a] + i; p[ua] = org[ua] + u; p[va] = org[va] + v;
          const m = w.get(p[0], p[1], p[2]);
          if (!m) continue;
          const f = [p[0] + n[0], p[1] + n[1], p[2] + n[2]];
          if (solid(f[0], f[1], f[2])) continue;
          let key = m;
          if (withAO) {
            let aobits = 0;
            for (let c = 0; c < 4; c++) {
              const du = (c === 1 || c === 2) ? 1 : -1, dv = (c >= 2) ? 1 : -1;
              const s1 = solid(f[0] + U[0] * du, f[1] + U[1] * du, f[2] + U[2] * du) ? 1 : 0;
              const s2 = solid(f[0] + V[0] * dv, f[1] + V[1] * dv, f[2] + V[2] * dv) ? 1 : 0;
              const cc = solid(f[0] + U[0] * du + V[0] * dv, f[1] + U[1] * du + V[1] * dv, f[2] + U[2] * du + V[2] * dv) ? 1 : 0;
              const o = (s1 && s2) ? 0 : 3 - (s1 + s2 + cc);
              aobits |= o << (2 * c);
            }
            key |= aobits << 8;
          }
          mask[u + v * S] = key;
        }
        // greedy
        for (let v = 0; v < sz[va]; v++) for (let u = 0; u < sz[ua];) {
          const key = mask[u + v * S];
          if (!key) { u++; continue; }
          let wdt = 1; while (u + wdt < sz[ua] && mask[u + wdt + v * S] === key) wdt++;
          let h = 1;
          outer: for (; v + h < sz[va]; h++) for (let k = 0; k < wdt; k++) if (mask[u + k + (v + h) * S] !== key) break outer;
          for (let hh = 0; hh < h; hh++) for (let k = 0; k < wdt; k++) mask[u + k + (v + hh) * S] = 0;
          // emit quad
          const base = pos.length / 3;
          const plane = org[a] + i + (s > 0 ? 1 : 0);
          // inflate: grow each quad by a tiny epsilon in-plane to hide T-junction cracks
          // (greedy meshes have T-junctions; without this, single background pixels sparkle).
          const e = inflate;
          const corners = [[u - e, v - e], [u + wdt + e, v - e], [u + wdt + e, v + h + e], [u - e, v + h + e]];
          const aov = [];
          for (let c = 0; c < 4; c++) {
            const p = [0, 0, 0]; p[a] = plane; p[ua] = org[ua] + corners[c][0]; p[va] = org[va] + corners[c][1];
            pos.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]); mat.push(key & 255);
            const o = withAO ? ((key >> (8 + 2 * c)) & 3) : 3; aov.push(o);
            ao.push(o / 3);
          }
          // winding: cross(U,V) == +axis a for (ua,va) cyclic, so s>0 => CCW as listed
          const flip = aov[1] + aov[3] > aov[0] + aov[2];
          let tris = flip ? [0, 1, 3, 1, 2, 3] : [0, 1, 2, 0, 2, 3];
          if (s < 0) tris = [tris[0], tris[2], tris[1], tris[3], tris[5], tris[4]];
          for (const t of tris) idx.push(base + t);
          u += wdt;
        }
      }
    }
  }
  return {
    pos: new Float32Array(pos), nrm: new Int8Array(nrm), mat: new Uint8Array(mat), ao: new Float32Array(ao),
    idx: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), quads: idx.length / 6,
  };
}
