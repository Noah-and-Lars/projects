// Binned-SAH BVH over the scene triangles, flattened for the GPU.
//
// Node layout (32 bytes): bmin.xyz, leftOrFirst (u32), bmax.xyz, count (u32).
// count == 0  -> interior node, children at leftOrFirst and leftOrFirst + 1.
// count  > 0  -> leaf covering triIdx[leftOrFirst .. leftOrFirst + count).

const TRI_FLOATS = 16;
const BINS = 12;

export interface BvhData {
  nodes: ArrayBuffer;
  nodeCount: number;
  triIdx: Uint32Array;
}

export function buildBvh(tris: Float32Array, triCount: number): BvhData {
  // Precompute centroids and bounds per triangle.
  const cmin = new Float32Array(triCount * 3);
  const cmax = new Float32Array(triCount * 3);
  const cen = new Float32Array(triCount * 3);
  for (let i = 0; i < triCount; i++) {
    const o = i * TRI_FLOATS;
    for (let a = 0; a < 3; a++) {
      const v0 = tris[o + a], v1 = tris[o + 4 + a], v2 = tris[o + 8 + a];
      const lo = Math.min(v0, v1, v2), hi = Math.max(v0, v1, v2);
      cmin[i * 3 + a] = lo;
      cmax[i * 3 + a] = hi;
      cen[i * 3 + a] = (lo + hi) * 0.5;
    }
  }

  const triIdx = new Uint32Array(triCount);
  for (let i = 0; i < triCount; i++) triIdx[i] = i;

  // Nodes stored in growable typed arrays; at most 2N-1 nodes.
  const maxNodes = Math.max(1, 2 * triCount);
  const nf = new Float32Array(maxNodes * 8);
  const nu = new Uint32Array(nf.buffer);
  let nodeCount = 0;

  const bounds = (first: number, count: number, out: Float32Array) => {
    out.fill(Infinity, 0, 3);
    out.fill(-Infinity, 3, 6);
    for (let i = first; i < first + count; i++) {
      const t = triIdx[i] * 3;
      for (let a = 0; a < 3; a++) {
        if (cmin[t + a] < out[a]) out[a] = cmin[t + a];
        if (cmax[t + a] > out[3 + a]) out[3 + a] = cmax[t + a];
      }
    }
  };
  const area = (b: Float32Array | number[], o = 0) => {
    const dx = b[o + 3] - b[o], dy = b[o + 4] - b[o + 1], dz = b[o + 5] - b[o + 2];
    return dx <= 0 || dy <= 0 || dz <= 0 ? 0 : 2 * (dx * dy + dy * dz + dz * dx);
  };

  const tmp = new Float32Array(6);
  const binBounds = new Float32Array(BINS * 6);
  const binCount = new Uint32Array(BINS);
  const leftArea = new Float32Array(BINS);
  const leftCnt = new Uint32Array(BINS);

  // Iterative build with an explicit stack of (nodeIndex, first, count).
  const stack: number[] = [];
  const root = nodeCount++;
  stack.push(root, 0, triCount);

  while (stack.length) {
    const count = stack.pop()!;
    const first = stack.pop()!;
    const node = stack.pop()!;
    bounds(first, count, tmp);
    nf.set(tmp.subarray(0, 3), node * 8);
    nf.set(tmp.subarray(3, 6), node * 8 + 4);

    if (count <= 4) {
      nu[node * 8 + 3] = first;
      nu[node * 8 + 7] = count;
      continue;
    }

    // Centroid bounds decide the split axis.
    let cb0x = Infinity, cb0y = Infinity, cb0z = Infinity, cb1x = -Infinity, cb1y = -Infinity, cb1z = -Infinity;
    for (let i = first; i < first + count; i++) {
      const t = triIdx[i] * 3;
      cb0x = Math.min(cb0x, cen[t]); cb1x = Math.max(cb1x, cen[t]);
      cb0y = Math.min(cb0y, cen[t + 1]); cb1y = Math.max(cb1y, cen[t + 1]);
      cb0z = Math.min(cb0z, cen[t + 2]); cb1z = Math.max(cb1z, cen[t + 2]);
    }
    const ext = [cb1x - cb0x, cb1y - cb0y, cb1z - cb0z];
    const cb0 = [cb0x, cb0y, cb0z];
    let axis = 0;
    if (ext[1] > ext[axis]) axis = 1;
    if (ext[2] > ext[axis]) axis = 2;

    let splitPos = 0;
    let bestCost = Infinity;
    if (ext[axis] > 1e-6) {
      binBounds.fill(Infinity);
      for (let b = 0; b < BINS; b++) binBounds.fill(-Infinity, b * 6 + 3, b * 6 + 6);
      binCount.fill(0);
      const scaleF = BINS / ext[axis];
      for (let i = first; i < first + count; i++) {
        const t = triIdx[i];
        let b = Math.floor((cen[t * 3 + axis] - cb0[axis]) * scaleF);
        if (b >= BINS) b = BINS - 1;
        if (b < 0) b = 0;
        binCount[b]++;
        for (let a = 0; a < 3; a++) {
          if (cmin[t * 3 + a] < binBounds[b * 6 + a]) binBounds[b * 6 + a] = cmin[t * 3 + a];
          if (cmax[t * 3 + a] > binBounds[b * 6 + 3 + a]) binBounds[b * 6 + 3 + a] = cmax[t * 3 + a];
        }
      }
      // Sweep left to right accumulating bounds, then right to left to evaluate SAH.
      const acc = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      let n = 0;
      for (let b = 0; b < BINS - 1; b++) {
        if (binCount[b]) {
          for (let a = 0; a < 3; a++) {
            acc[a] = Math.min(acc[a], binBounds[b * 6 + a]);
            acc[3 + a] = Math.max(acc[3 + a], binBounds[b * 6 + 3 + a]);
          }
          n += binCount[b];
        }
        leftArea[b] = n ? area(acc) : 0;
        leftCnt[b] = n;
      }
      acc.fill(Infinity, 0, 3); acc.fill(-Infinity, 3, 6);
      n = 0;
      for (let b = BINS - 1; b >= 1; b--) {
        if (binCount[b]) {
          for (let a = 0; a < 3; a++) {
            acc[a] = Math.min(acc[a], binBounds[b * 6 + a]);
            acc[3 + a] = Math.max(acc[3 + a], binBounds[b * 6 + 3 + a]);
          }
          n += binCount[b];
        }
        const rightArea = n ? area(acc) : 0;
        const cost = leftArea[b - 1] * leftCnt[b - 1] + rightArea * n;
        if (leftCnt[b - 1] > 0 && n > 0 && cost < bestCost) {
          bestCost = cost;
          splitPos = cb0[axis] + (b / BINS) * ext[axis];
        }
      }
    }

    // Partition. Fall back to a median split when SAH found nothing useful.
    let mid: number;
    if (bestCost === Infinity) {
      const sub = Array.from(triIdx.subarray(first, first + count));
      sub.sort((p, q) => cen[p * 3 + axis] - cen[q * 3 + axis]);
      triIdx.set(sub, first);
      mid = first + (count >> 1);
    } else {
      let i = first, j = first + count - 1;
      while (i <= j) {
        if (cen[triIdx[i] * 3 + axis] < splitPos) i++;
        else { const t = triIdx[i]; triIdx[i] = triIdx[j]; triIdx[j] = t; j--; }
      }
      mid = i;
      if (mid === first || mid === first + count) mid = first + (count >> 1);
    }

    const left = nodeCount;
    nodeCount += 2;
    nu[node * 8 + 3] = left;
    nu[node * 8 + 7] = 0;
    // Push right first so the left child is processed next (better locality).
    stack.push(left + 1, mid, first + count - mid);
    stack.push(left, first, mid - first);
  }

  return { nodes: nf.buffer.slice(0, nodeCount * 32), nodeCount, triIdx };
}
