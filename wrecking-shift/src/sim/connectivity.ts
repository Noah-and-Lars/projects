import type { VoxelGrid } from './voxels';

/**
 * Connectivity search (6-neighbourhood) started from "seed" voxels next to an edit.
 *
 * Groups grow from every seed in an interleaved fashion (round-robin, depth-first with a
 * downward bias so anchored structures find the ground quickly). Groups that touch are merged
 * (union-find). A group that runs out of voxels without being anchored is a detached island.
 *
 *  - anchored mode (static bodies): `anchorY >= 0` => voxels with y <= anchorY are anchors.
 *    The search of a group stops as soon as it is anchored.
 *  - keep mode: `keepIndex >= 0` => that single voxel is the only anchor (vehicles: the piece
 *    holding the frame voxel stays the body, everything cut off becomes debris).
 *  - free mode (dynamic bodies): `anchorY < 0`. The search stops when a single live group is
 *    left (that one stays "the body"); every exhausted group is a detached island.
 */
export interface Island {
  /** voxel indices into the grid */
  indices: Int32Array;
  min: [number, number, number];
  max: [number, number, number];
}

let scratch = new Int32Array(0);
let base = 1;

function ensureScratch(n: number) {
  if (scratch.length < n) {
    scratch = new Int32Array(Math.max(n, scratch.length * 2));
    base = 1;
  }
}

interface Group {
  parent: number;
  anchored: boolean;
  /** pending stacks (own + merged) */
  stacks: number[][];
  /** all visited voxel lists (own + merged) */
  members: number[][];
  size: number;
  dead: boolean;
}

export function findIslands(grid: VoxelGrid, seeds: ArrayLike<number>, anchorY: number, keepIndex = -1): Island[] {
  const { sx, sy, sz, data } = grid;
  const n = data.length;
  ensureScratch(n);
  if (base > 0x7fffffff - seeds.length - 16) { scratch.fill(0); base = 1; }
  const myBase = base;
  const label = scratch;
  const groups: Group[] = [];
  const sxy = sx * sy;
  // keepIndex: a single voxel acting as the only anchor ("the piece containing this voxel stays the body")
  const keep = keepIndex >= 0 && data[keepIndex] ? keepIndex : -1;
  const anchorLimit = keep >= 0 ? 0 : anchorY >= 0 ? (anchorY + 1) * sx : -1; // (i % sxy) < anchorLimit <=> y <= anchorY

  const find = (g: number): number => {
    while (groups[g].parent !== g) {
      groups[g].parent = groups[groups[g].parent].parent;
      g = groups[g].parent;
    }
    return g;
  };

  for (let s = 0; s < seeds.length; s++) {
    const i = seeds[s];
    if (!data[i] || label[i] >= myBase) continue;
    const gi = groups.length;
    label[i] = myBase + gi;
    const anchored = (anchorLimit >= 0 && i % sxy < anchorLimit) || i === keep;
    groups.push({ parent: gi, anchored, stacks: [[i]], members: [[i]], size: 1, dead: false });
  }
  base = myBase + groups.length + 1;
  if (groups.length === 0) return [];

  const islands: Island[] = [];
  let live: number[] = groups.map((_, i) => i);
  const BATCH = 512;

  const visit = (gi: number, root: Group, stack: number[], mem: number[], j: number): Group => {
    // returns (possibly new) root after merges
    if (!data[j]) return root;
    const l = label[j];
    if (l < myBase) {
      label[j] = myBase + gi;
      stack.push(j);
      mem.push(j);
      root.size++;
      if ((anchorLimit >= 0 && j % sxy < anchorLimit) || j === keep) root.anchored = true;
      return root;
    }
    const other = find(l - myBase);
    const mine = find(gi);
    if (other === mine) return root;
    // merge `other` into `mine`
    const o = groups[other], m = groups[mine];
    o.parent = mine;
    for (const st of o.stacks) if (st.length) m.stacks.push(st);
    for (const mm of o.members) m.members.push(mm);
    m.size += o.size;
    m.anchored = m.anchored || o.anchored;
    o.dead = true;
    o.stacks = []; o.members = [];
    return m;
  };

  for (;;) {
    // compact live list to roots that still need work
    const next: number[] = [];
    let activeFree = 0;
    for (const gi of live) {
      const g = groups[gi];
      if (g.dead || g.parent !== gi) continue;
      if (anchorLimit >= 0 && g.anchored) continue; // safe
      next.push(gi);
      activeFree++;
    }
    live = next;
    if (live.length === 0) break;
    if (anchorLimit < 0 && activeFree <= 1) {
      // free mode: are there any other roots at all (already exhausted => islands emitted)?
      break;
    }
    for (const gi of live) {
      let g = groups[gi];
      if (g.dead || g.parent !== gi) continue;
      let budget = BATCH;
      while (budget > 0) {
        // pick a non-empty stack
        let stack: number[] | undefined;
        while (g.stacks.length) {
          const st = g.stacks[g.stacks.length - 1];
          if (st.length) { stack = st; break; }
          g.stacks.pop();
        }
        if (!stack) break;
        const mem = g.members[0];
        while (budget > 0 && stack.length) {
          const i = stack.pop()!;
          budget--;
          const x = i % sx;
          const y = ((i / sx) | 0) % sy;
          const z = (i / sxy) | 0;
          // push order: up first ... down last (so down is popped first)
          if (y < sy - 1) g = visit(gi, g, stack, mem, i + sx);
          if (x > 0) g = visit(gi, g, stack, mem, i - 1);
          if (x < sx - 1) g = visit(gi, g, stack, mem, i + 1);
          if (z > 0) g = visit(gi, g, stack, mem, i - sxy);
          if (z < sz - 1) g = visit(gi, g, stack, mem, i + sxy);
          if (y > 0) g = visit(gi, g, stack, mem, i - sx);
          if (anchorLimit >= 0 && g.anchored) { budget = 0; break; }
        }
        if (g.parent !== gi) break;
      }
      // `g` may be another root now only if we merged INTO us (we stay root); check exhaustion
      const me = groups[gi];
      if (me.dead || me.parent !== gi) continue;
      if (anchorLimit >= 0 && me.anchored) continue;
      let pending = false;
      for (const st of me.stacks) if (st.length) { pending = true; break; }
      if (!pending) {
        // exhausted => island. In free mode, keep the last one as the body.
        if (anchorLimit < 0) {
          let others = 0;
          for (const oi of live) {
            const o = groups[oi];
            if (oi !== gi && !o.dead && o.parent === oi) others++;
          }
          if (others === 0) { me.dead = true; continue; }
        }
        islands.push(makeIsland(me.members, me.size, sx, sy));
        me.dead = true;
      }
    }
  }
  return islands;
}

function makeIsland(members: number[][], size: number, sx: number, sy: number): Island {
  const indices = new Int32Array(size);
  let o = 0;
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1, y1 = -1, z1 = -1;
  const sxy = sx * sy;
  for (const m of members)
    for (let k = 0; k < m.length; k++) {
      const i = m[k];
      indices[o++] = i;
      const x = i % sx, y = ((i / sx) | 0) % sy, z = (i / sxy) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  return { indices, min: [x0, y0, z0], max: [x1, y1, z1] };
}

/** Label all connected components of a whole grid (used at level build time / tests). */
export function allComponents(grid: VoxelGrid): Island[] {
  const { sx, sy, sz, data } = grid;
  const sxy = sx * sy;
  const seen = new Uint8Array(data.length);
  const out: Island[] = [];
  for (let s = 0; s < data.length; s++) {
    if (!data[s] || seen[s]) continue;
    const mem: number[] = [s];
    seen[s] = 1;
    for (let h = 0; h < mem.length; h++) {
      const i = mem[h];
      const x = i % sx, y = ((i / sx) | 0) % sy, z = (i / sxy) | 0;
      const tryN = (j: number) => { if (data[j] && !seen[j]) { seen[j] = 1; mem.push(j); } };
      if (x > 0) tryN(i - 1);
      if (x < sx - 1) tryN(i + 1);
      if (y > 0) tryN(i - sx);
      if (y < sy - 1) tryN(i + sx);
      if (z > 0) tryN(i - sxy);
      if (z < sz - 1) tryN(i + sxy);
    }
    out.push(makeIsland([mem], mem.length, sx, sy));
  }
  return out;
}
