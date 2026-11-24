import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit } from './util';

/**
 * Unlimited melee tool: breaks soft materials only (wood, plaster, glass, plastic...). Medium and
 * hard materials (brick, dirt, sheet metal, concrete) just clang. Hold LMB to keep swinging.
 */
export class Sledge extends Tool {
  readonly id = 'sledge';
  readonly name = 'Sledgehammer';
  override hint = 'LMB swing';
  reach = 2.6;
  /** full swing length in ticks; the head lands at `impactTick` */
  rate = 48;
  impactTick = 15;
  /** ticks since the current swing started (-1 = idle) */
  swingT = -1;

  update(_ctx: ToolContext, input: ToolInput): void {
    if (!input.primary || this.swingT >= 0) return;
    this.swingT = 0;
    this.cooldown = this.rate;
    emit(_ctx.sim, 'tool:swing', { tool: this.id, hit: false });
  }

  /** the swing plays out even if the button is released: wind-up, heavy blow, slow recovery */
  override tick(ctx: ToolContext): void {
    if (this.swingT < 0) return;
    const t = this.swingT++;
    this.anim = Math.max(0.001, 1 - t / this.rate);
    if (t === this.impactTick) this.strike(ctx);
    if (this.swingT >= this.rate) { this.swingT = -1; this.anim = 0; }
  }

  private strike(ctx: ToolContext): void {
    const { sim, player } = ctx;
    const eye = player.eye, dir = player.forward;
    const hit = sim.raycast(eye, dir, this.reach);
    if (!hit) return;
    const c = { x: hit.point.x + dir.x * 0.15, y: hit.point.y + dir.y * 0.15, z: hit.point.z + dir.z * 0.15 };
    // soft only: medium / hard radius 0 (sledge never breaks brick, metal, concrete).
    // A ragged bite; a good part of it comes away as loose chunks knocked through to the far side.
    const res = sim.carve(c, 0.55, 0, 0, { cause: 'sledge', rough: 0.6, debris: 9, pushDir: dir, debrisSpeed: 5 });
    if (res.removed === 0) emit(sim, 'tool:clang', { pos: hit.point, pal: hit.palette });
    emit(sim, 'tool:impact', { tool: this.id, pos: hit.point, power: res.removed > 0 ? 0.9 : 0.6, kick: res.removed > 0 ? 1.5 : 2.2, broke: res.removed > 0 });
    // shove dynamic bodies (light debris flies, heavy props barely move)
    if (hit.body.dynamic && !hit.body.removed) {
      const m = hit.body.rb.mass();
      const j = Math.min(600, m * 8);
      hit.body.rb.applyImpulseAtPoint({ x: dir.x * j, y: dir.y * j + j * 0.15, z: dir.z * j }, hit.point, true);
    }
  }
}
