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
  /** ticks between swings */
  rate = 24;

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primary || this.cooldown > 0) return;
    this.cooldown = this.rate;
    this.anim = 1;
    const { sim, player } = ctx;
    const eye = player.eye, dir = player.forward;
    const hit = sim.raycast(eye, dir, this.reach);
    emit(sim, 'tool:swing', { tool: this.id, hit: !!hit });
    if (!hit) return;
    const c = { x: hit.point.x + dir.x * 0.12, y: hit.point.y + dir.y * 0.12, z: hit.point.z + dir.z * 0.12 };
    // soft only: medium / hard radius 0 (sledge never breaks brick, metal, concrete)
    const res = sim.carve(c, 0.42, 0, 0, { cause: 'sledge', fracture: 0.25 });
    if (res.removed === 0) emit(sim, 'tool:clang', { pos: hit.point, pal: hit.palette });
    // shove dynamic bodies (light debris flies, heavy props barely move)
    if (hit.body.dynamic && !hit.body.removed) {
      const m = hit.body.rb.mass();
      const j = Math.min(180, m * 4);
      hit.body.rb.applyImpulseAtPoint({ x: dir.x * j, y: dir.y * j + j * 0.15, z: dir.z * j }, hit.point, true);
    }
  }
}
