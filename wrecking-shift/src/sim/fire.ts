import type { VoxelBody } from './body';
import type { Sim, SimSystem } from './sim';
import type { V3 } from './vec';

/**
 * Fire system interface (implementation: see FireSystem below).
 * Other systems (tools, explosions, missions) only use these methods.
 */
export interface FireApi {
  /** try to ignite the voxel (no-op when not flammable / cap reached). returns true if burning */
  ignite(body: VoxelBody, x: number, y: number, z: number): boolean;
  /** ignite flammable voxels near a world position */
  igniteNear(pos: V3, radius: number, maxNew?: number): number;
  /** add heat at a world position (blowtorch). */
  heat(pos: V3, amount: number): void;
  /** put out fires within radius; returns number extinguished */
  extinguish(pos: V3, radius: number): number;
  /** number of burning voxels */
  count(): number;
  /** world positions of (a sample of) fires for rendering / audio / damage */
  positions(max?: number): V3[];
}

/** Placeholder until the real system lands (keeps callers compiling). */
export class FireSystem implements FireApi, SimSystem {
  constructor(protected sim: Sim) {}
  update(_sim: Sim): void {}
  ignite(): boolean { return false; }
  igniteNear(): number { return 0; }
  heat(): void {}
  extinguish(): number { return 0; }
  count(): number { return 0; }
  positions(): V3[] { return []; }
}
