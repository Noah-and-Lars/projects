import type RAPIER from '@dimforge/rapier3d-compat';
import { VOXEL } from './materials';
import type { VoxelGrid } from './voxels';
import { qconj, qrot, type Quat, type V3 } from './vec';

export const CHUNK = 32;
export const chunkKey = (cx: number, cy: number, cz: number) => cx | (cy << 4) | (cz << 8);

export type BodyKind = 'world' | 'debris' | 'prop' | 'vehicle';

/** A rigid voxel object: static world piece, prop, vehicle chassis or debris chunk. */
export class VoxelBody {
  readonly id: number;
  grid: VoxelGrid;
  rb: RAPIER.RigidBody;
  col: RAPIER.Collider;
  dynamic: boolean;
  kind: BodyKind;
  /** static bodies: voxels with y == 0 hold everything connected to them in place */
  anchorBottom = true;
  /** never split this body into islands (still carvable) */
  noSplit = false;
  /** cannot be carved at all */
  indestructible = false;
  /** carve plain holes only (terrain) */
  noFracture = false;
  /** free-form tags, e.g. 'target', 'valuable', 'alarm' */
  tags = new Set<string>();
  name = '';
  /** arbitrary gameplay payload */
  user: Record<string, any> = {};
  /** chunks needing remesh (render side clears) */
  dirty = new Set<number>();
  /** bump whenever the whole body should be remeshed */
  allDirty = true;
  /** solid voxels adjacent to removed ones -> connectivity search pending */
  pendingSeeds: number[] = [];
  massDirty = false;
  createdTick = 0;
  removed = false;
  /** original voxel count (for "destroy N%" objectives) */
  initialCount: number;
  /** half diagonal of the grid box in metres */
  radius: number;
  mass = 0;

  constructor(id: number, grid: VoxelGrid, rb: RAPIER.RigidBody, col: RAPIER.Collider, dynamic: boolean, kind: BodyKind) {
    this.id = id; this.grid = grid; this.rb = rb; this.col = col; this.dynamic = dynamic; this.kind = kind;
    this.initialCount = grid.count;
    this.radius = 0.5 * VOXEL * Math.hypot(grid.sx, grid.sy, grid.sz);
  }

  get pos(): V3 { return this.rb.translation(); }
  get rot(): Quat { return this.rb.rotation(); }

  /** world -> voxel-space (float voxel units) */
  toLocal(p: V3): V3 {
    const t = this.rb.translation();
    if (!this.dynamic && this.identityRot) {
      return { x: (p.x - t.x) / VOXEL, y: (p.y - t.y) / VOXEL, z: (p.z - t.z) / VOXEL };
    }
    const l = qrot(qconj(this.rb.rotation()), { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z });
    return { x: l.x / VOXEL, y: l.y / VOXEL, z: l.z / VOXEL };
  }
  /** voxel-space (float) -> world */
  toWorld(l: V3): V3 {
    const t = this.rb.translation();
    if (!this.dynamic && this.identityRot) {
      return { x: t.x + l.x * VOXEL, y: t.y + l.y * VOXEL, z: t.z + l.z * VOXEL };
    }
    const w = qrot(this.rb.rotation(), { x: l.x * VOXEL, y: l.y * VOXEL, z: l.z * VOXEL });
    return { x: w.x + t.x, y: w.y + t.y, z: w.z + t.z };
  }
  dirToLocal(d: V3): V3 {
    if (!this.dynamic && this.identityRot) return d;
    return qrot(qconj(this.rb.rotation()), d);
  }
  dirToWorld(d: V3): V3 {
    if (!this.dynamic && this.identityRot) return d;
    return qrot(this.rb.rotation(), d);
  }
  identityRot = false;

  /** world position of the centre of the grid box */
  center(): V3 {
    return this.toWorld({ x: this.grid.sx / 2, y: this.grid.sy / 2, z: this.grid.sz / 2 });
  }

  markDirtyVoxel(x: number, y: number, z: number): void {
    const cx = x >> 5, cy = y >> 5, cz = z >> 5;
    this.dirty.add(chunkKey(cx, cy, cz));
    const lx = x & 31, ly = y & 31, lz = z & 31;
    // neighbours (faces + AO need a 1-voxel border)
    const xs = lx === 0 ? -1 : lx === 31 ? 1 : 0;
    const ys = ly === 0 ? -1 : ly === 31 ? 1 : 0;
    const zs = lz === 0 ? -1 : lz === 31 ? 1 : 0;
    if (xs | ys | zs) {
      for (let dz = 0; dz <= 1; dz++)
        for (let dy = 0; dy <= 1; dy++)
          for (let dx = 0; dx <= 1; dx++) {
            if (!(dx | dy | dz)) continue;
            if ((dx && !xs) || (dy && !ys) || (dz && !zs)) continue;
            const nx = cx + dx * xs, ny = cy + dy * ys, nz = cz + dz * zs;
            if (nx < 0 || ny < 0 || nz < 0) continue;
            this.dirty.add(chunkKey(nx, ny, nz));
          }
    }
  }
}
