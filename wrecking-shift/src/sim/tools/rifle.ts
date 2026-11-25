import { PAL_HARDNESS } from '../materials';
import type { V3 } from '../vec';
import { shootRay } from './gun';
import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit } from './util';

/**
 * Hunting rifle: slow, very long range, the bullet punches through up to `penetrate` surfaces of
 * soft / medium material. Hard material stops it (guns never break hard).
 */
export class Rifle extends Tool {
  readonly id: string = 'rifle';
  readonly name: string = 'Rifle';
  override hint = 'LMB shoot (penetrates)';
  override ammo = 6;
  override maxAmmo = 6;
  range = 120;
  rate = 75;
  penetrate = 4;

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = this.rate;
    this.anim = 1;
    const { player } = ctx;
    const dir = player.forward;
    let o: V3 = player.eye;
    let left = this.range;
    const hits: V3[] = [];
    for (let i = 0; i < this.penetrate && left > 0; i++) {
      const h = shootRay(ctx, o, dir, { range: left, rSoft: 0.17, rMed: 0.12, impulse: 120, cause: 'bullet' });
      if (!h) break;
      hits.push(h.point);
      if (PAL_HARDNESS[h.palette] >= 2) break;
      // continue from just inside the hole
      const step = h.dist + 0.05;
      o = { x: o.x + dir.x * step, y: o.y + dir.y * step, z: o.z + dir.z * step };
      left -= step;
    }
    emit(ctx.sim, 'tool:shot', { tool: this.id, pos: player.eye, dir, hits });
  }
}
