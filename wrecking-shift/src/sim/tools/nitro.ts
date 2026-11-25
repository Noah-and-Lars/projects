import { MAT, PAL_EXPLOSIVE, pal } from '../materials';
import type { V3 } from '../vec';
import { VoxelGrid } from '../voxels';
import { checkSticky, loadSticky, placeSticky, saveSticky, type Sticky } from './sticky';
import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit } from './util';

export function nitroGrid(): VoxelGrid {
  const g = new VoxelGrid(3, 5, 3);
  for (let y = 0; y < 4; y++) for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) g.set(x, y, z, pal(MAT.explosive, y === 2 ? 0 : 3));
  g.set(1, 4, 1, pal(MAT.explosive, 0)); // cap
  return g;
}

/**
 * Nitro canister: sticky, no fuse. Made of the explosive material and tagged 'explosive', so the
 * core chain-reaction logic blows it up as soon as any voxel of it breaks (shoot it, blast it).
 * Also goes off on a hard knock once it has come loose.
 */
export class Nitro extends Tool {
  readonly id: string = 'nitro';
  readonly name: string = 'Nitro Canister';
  override hint = 'LMB place, shoot to detonate';
  override ammo = 4;
  override maxAmmo = 4;
  range = 3;
  /** sudden velocity change (m/s per tick) that sets a loose canister off */
  shockLimit = 6;
  readonly placed: (Sticky & { v: V3 })[] = [];

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    const { sim, player } = ctx;
    const hit = sim.raycast(player.eye, player.forward, this.range);
    if (!hit) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = 30;
    this.anim = 1;
    const s = placeSticky(sim, nitroGrid(), hit, player.forward, { name: 'nitro', mass: 3, tags: ['explosive', 'tool', 'nograb'] });
    this.placed.push({ ...s, v: { x: 0, y: 0, z: 0 } });
    emit(sim, 'tool:place', { tool: this.id, pos: hit.point });
  }

  override save(): any { return this.placed.filter((n) => !n.body.removed).map(saveSticky); }
  override load(ctx: ToolContext, data: any): void {
    for (const d of data ?? []) { const s = loadSticky(ctx.sim, d, 3); if (s) { const lv = s.body.rb.linvel(); this.placed.push({ ...s, v: { x: lv.x, y: lv.y, z: lv.z } }); } }
  }

  override tick(ctx: ToolContext): void {
    const sim = ctx.sim;
    for (let i = this.placed.length - 1; i >= 0; i--) {
      const n = this.placed[i];
      if (n.body.removed) { this.placed.splice(i, 1); continue; }
      if (sim.tick % 10 === 0) checkSticky(sim, n);
      const v = n.body.rb.linvel();
      if (!n.joint && sim.tick > n.body.createdTick + 5) {
        const dv = Math.hypot(v.x - n.v.x, v.y - n.v.y, v.z - n.v.z);
        if (dv > this.shockLimit) {
          const pos = n.body.center();
          sim.removeBody(n.body);
          this.placed.splice(i, 1);
          sim.explodeLater(pos, PAL_EXPLOSIVE[pal(MAT.explosive)], 1);
          continue;
        }
      }
      n.v = { x: v.x, y: v.y, z: v.z };
    }
  }
}
