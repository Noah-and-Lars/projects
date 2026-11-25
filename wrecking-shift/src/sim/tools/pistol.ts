import { shootRay, spreadDir } from './gun';
import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit } from './util';

/** Precise long-range handgun. Breaks soft + medium (brick, sheet metal), never hard. Detonates barrels / nitro. */
export class Pistol extends Tool {
  readonly id: string = 'pistol';
  readonly name: string = 'Handgun';
  override hint = 'LMB shoot';
  override ammo = 18;
  override maxAmmo = 18;
  range = 60;
  rate = 15;

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = this.rate;
    this.anim = 1;
    const { player } = ctx;
    const eye = player.eye;
    const dir = spreadDir(ctx, player.forward, 0.002);
    const hit = shootRay(ctx, eye, dir, { range: this.range, rSoft: 0.2, rMed: 0.12, impulse: 60, cause: 'bullet' });
    emit(ctx.sim, 'tool:shot', { tool: this.id, pos: eye, dir, hit: hit ? hit.point : null });
  }
}
