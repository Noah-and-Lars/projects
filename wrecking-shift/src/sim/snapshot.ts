import type { BodyKind } from './body';
import { Sim } from './sim';
import type { Quat, V3 } from './vec';
import { VoxelGrid } from './voxels';

/** Serialisable snapshot of all voxel bodies (quicksave). Systems add their own state on top. */
export interface BodySnap {
  id: number; sx: number; sy: number; sz: number;
  /** run-length encoded voxel data: [value, count, value, count ...] */
  rle: number[];
  pos: V3; rot: Quat; lin: V3; ang: V3;
  dynamic: boolean; kind: BodyKind; name: string; tags: string[];
  flags: number; keepIndex: number; initialCount: number; createdTick: number;
  user: Record<string, any>;
  massScale?: number;
}
export interface SimSnap {
  tick: number; rng: number; nextId: number; bodies: BodySnap[];
}

export function rleEncode(d: Uint8Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < d.length) {
    const v = d[i];
    let j = i + 1;
    while (j < d.length && d[j] === v) j++;
    out.push(v, j - i);
    i = j;
  }
  return out;
}
export function rleDecode(rle: number[], n: number): Uint8Array {
  const d = new Uint8Array(n);
  let o = 0;
  for (let i = 0; i < rle.length; i += 2) { const v = rle[i], c = rle[i + 1]; if (v) d.fill(v, o, o + c); o += c; }
  return d;
}

function plainUser(u: Record<string, any>): Record<string, any> {
  const o: Record<string, any> = {};
  for (const k in u) {
    const v = u[k];
    const t = typeof v;
    if (v == null || t === 'number' || t === 'string' || t === 'boolean') o[k] = v;
    else if (t === 'object') { try { o[k] = JSON.parse(JSON.stringify(v)); } catch { /* skip non-serialisable */ } }
  }
  return o;
}

export function snapshotSim(sim: Sim): SimSnap {
  sim.processEdits();
  const bodies: BodySnap[] = [];
  for (const b of sim.bodies.values()) {
    const g = b.grid;
    bodies.push({
      id: b.id, sx: g.sx, sy: g.sy, sz: g.sz, rle: rleEncode(g.data),
      pos: { ...b.rb.translation() }, rot: { ...b.rb.rotation() },
      lin: b.dynamic ? { ...b.rb.linvel() } : { x: 0, y: 0, z: 0 }, ang: b.dynamic ? { ...b.rb.angvel() } : { x: 0, y: 0, z: 0 },
      dynamic: b.dynamic, kind: b.kind, name: b.name, tags: [...b.tags],
      flags: (b.anchorBottom ? 1 : 0) | (b.noSplit ? 2 : 0) | (b.indestructible ? 4 : 0) | (b.impactProof ? 8 : 0) | (b.noFracture ? 16 : 0),
      keepIndex: b.keepIndex, initialCount: b.initialCount, createdTick: b.createdTick, user: plainUser(b.user), massScale: b.massScale,
    });
  }
  return { tick: sim.tick, rng: sim.rng.state, nextId: sim.peekNextId(), bodies };
}

/** Recreate all bodies of a snapshot inside a fresh Sim (ids are preserved). */
export function restoreSim(snap: SimSnap, sim: Sim): void {
  for (const s of snap.bodies) {
    const grid = new VoxelGrid(s.sx, s.sy, s.sz, rleDecode(s.rle, s.sx * s.sy * s.sz));
    const b = sim.addBody(grid, s.pos, { dynamic: s.dynamic, kind: s.kind, rot: s.rot, linvel: s.lin, angvel: s.ang, name: s.name, tags: s.tags, id: s.id, massScale: s.massScale ?? 1 });
    b.anchorBottom = !!(s.flags & 1); b.noSplit = !!(s.flags & 2); b.indestructible = !!(s.flags & 4); b.impactProof = !!(s.flags & 8); b.noFracture = !!(s.flags & 16);
    b.keepIndex = s.keepIndex; b.initialCount = s.initialCount; b.createdTick = s.createdTick;
    Object.assign(b.user, s.user);
  }
  sim.tick = snap.tick; sim.time = snap.tick / 60;
  sim.rng.state = snap.rng;
  sim.setNextId(snap.nextId);
}
