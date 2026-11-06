// One step of Loop subdivision for a triangle mesh, for tools/gear/build_gear.mjs
// (a low-poly glove, so its bent fingers come out round rather than folding
// into slivers at the joints).
//
// Each triangle becomes four; the new points sit on the smooth (Loop)
// surface, and the old ones move onto it too. Points at the same place are
// treated as one for the shape (so a texture seam doesn't open), but each
// side of a seam keeps its own texture coordinates and normals. Open edges
// (a cuff's opening) and edges shared by more than two triangles keep their
// line (the boundary rules).
//
// g: { pos, nor, uv, index } (Float32Array x3, x3, x2, Uint32Array);
// smooth(p): optional, how far (0..1) to round the surface at point p: 0
// just splits the triangles where they are (for layered parts, such as a
// strap over a cuff, that rounding would sink into each other). Returns
// the same, subdivided.
export function subdivide(g, smooth = () => 1) {
  const count = g.pos.length / 3;
  // One id for each place.
  const place = new Map();
  const wid = new Uint32Array(count);
  const wpos = [];
  for (let v = 0; v < count; v++) {
    const key = `${g.pos[3 * v].toFixed(6)},${g.pos[3 * v + 1].toFixed(6)},${g.pos[3 * v + 2].toFixed(6)}`;
    if (!place.has(key)) {
      place.set(key, wpos.length / 3);
      wpos.push(g.pos[3 * v], g.pos[3 * v + 1], g.pos[3 * v + 2]);
    }
    wid[v] = place.get(key);
  }
  const W = wpos.length / 3;
  const P = (w) => [wpos[3 * w], wpos[3 * w + 1], wpos[3 * w + 2]];
  const round = Float32Array.from({ length: W }, (_, w) => Math.min(1, Math.max(0, smooth(P(w)))));
  // Edges between places, with the third corner of each triangle on them.
  const edges = new Map(); // "a,b" (a < b) -> [opposite places]
  const ekey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const tris = g.index.length / 3;
  for (let t = 0; t < tris; t++) {
    const w = [0, 1, 2].map((k) => wid[g.index[3 * t + k]]);
    for (let k = 0; k < 3; k++) {
      const a = w[k], b = w[(k + 1) % 3], c = w[(k + 2) % 3];
      if (a === b) continue;
      const key = ekey(a, b);
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push(c);
    }
  }
  // Each place's neighbours, and those along boundary edges.
  const ring = Array.from({ length: W }, () => new Set());
  const border = Array.from({ length: W }, () => new Set());
  for (const [key, opp] of edges) {
    const [a, b] = key.split(',').map(Number);
    ring[a].add(b);
    ring[b].add(a);
    if (opp.length !== 2) {
      border[a].add(b);
      border[b].add(a);
    }
  }
  // Old places moved onto the surface (even rule).
  const even = new Float32Array(W * 3);
  for (let w = 0; w < W; w++) {
    const p = P(w);
    let out = p;
    if (border[w].size === 2) {
      const [b1, b2] = [...border[w]].map(P);
      out = [0, 1, 2].map((k) => 0.75 * p[k] + 0.125 * (b1[k] + b2[k]));
    } else if (border[w].size === 0 && ring[w].size >= 3) {
      const n = ring[w].size;
      const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
      const sum = [0, 0, 0];
      for (const u of ring[w]) { const q = P(u); for (let k = 0; k < 3; k++) sum[k] += q[k]; }
      out = [0, 1, 2].map((k) => (1 - n * beta) * p[k] + beta * sum[k]);
    }
    even.set([0, 1, 2].map((k) => p[k] + (out[k] - p[k]) * round[w]), 3 * w);
  }
  // New points on each edge (odd rule).
  const odd = new Map();
  for (const [key, opp] of edges) {
    const [wa, wb] = key.split(',').map(Number);
    const [a, b] = [P(wa), P(wb)];
    const half = [0, 1, 2].map((k) => 0.5 * (a[k] + b[k]));
    if (opp.length === 2) {
      const [c, d] = opp.map(P);
      const r = 0.5 * (round[wa] + round[wb]);
      odd.set(key, [0, 1, 2].map((k) => half[k] + (0.375 * (a[k] + b[k]) + 0.125 * (c[k] + d[k]) - half[k]) * r));
    } else {
      odd.set(key, half);
    }
  }
  // The new mesh: the old points, then a point for each edge of each side of
  // a seam (by the old points' own ids, so seams stay split).
  const pos = [], nor = [], uv = [];
  for (let v = 0; v < count; v++) {
    pos.push(...even.subarray(3 * wid[v], 3 * wid[v] + 3));
    nor.push(g.nor[3 * v], g.nor[3 * v + 1], g.nor[3 * v + 2]);
    uv.push(g.uv[2 * v], g.uv[2 * v + 1]);
  }
  const mid = new Map();
  const midOf = (a, b) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (mid.has(key)) return mid.get(key);
    const i = pos.length / 3;
    const at = odd.get(ekey(wid[a], wid[b])) || [0, 1, 2].map((k) => 0.5 * (g.pos[3 * a + k] + g.pos[3 * b + k]));
    pos.push(...at);
    const n = [0, 1, 2].map((k) => g.nor[3 * a + k] + g.nor[3 * b + k]);
    const l = Math.hypot(...n) || 1;
    nor.push(n[0] / l, n[1] / l, n[2] / l);
    uv.push(0.5 * (g.uv[2 * a] + g.uv[2 * b]), 0.5 * (g.uv[2 * a + 1] + g.uv[2 * b + 1]));
    mid.set(key, i);
    return i;
  };
  const index = [];
  for (let t = 0; t < tris; t++) {
    const [a, b, c] = [0, 1, 2].map((k) => g.index[3 * t + k]);
    const ab = midOf(a, b), bc = midOf(b, c), ca = midOf(c, a);
    index.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
  }
  return { ...g, pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), index: new Uint32Array(index) };
}
