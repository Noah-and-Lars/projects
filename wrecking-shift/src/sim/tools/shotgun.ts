import type { V3 } from '../vec';
import { shootRay, spreadDir } from './gun';
import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit } from './util';

/** 8 pellets with spread and damage falloff; range 20 m. Breaks soft + medium, never hard. */
export class Shotgun extends Tool {
  readonly id: string = 'shotgun';
  readonly name: string = 'Shotgun';
  override hint = 'LMB shoot';
  override ammo = 12;
  override maxAmmo = 12;
  range = 20;
  pellets = 8;
  /** cone half-angle (rad) */
  spread = 0.07;
  rate = 50;

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = this.rate;
    this.anim = 1;
    const { player } = ctx;
    const eye = player.eye, fwd = player.forward;
    const hits: V3[] = [];
    for (let i = 0; i < this.pellets; i++) {
      const d = spreadDir(ctx, fwd, i === 0 ? this.spread * 0.15 : this.spread);
      const h = shootRay(ctx, eye, d, { range: this.range, rSoft: 0.22, rMed: 0.15, impulse: 30, falloff: 0.45, cause: 'shotgun' });
      if (h) hits.push(h.point);
    }
    emit(ctx.sim, 'tool:shot', { tool: this.id, pos: eye, dir: fwd, hits });
    // a little kick
    player.vel.x -= fwd.x * 0.8; player.vel.z -= fwd.z * 0.8;
  }
}
