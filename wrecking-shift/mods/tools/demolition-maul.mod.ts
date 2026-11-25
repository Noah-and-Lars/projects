import { defineMod } from '../../src/mods/kit';
import { Tool, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import { add, fx } from './_util';

/**
 * Heavy long-handled maul: a long wind-up, then a big bite that also cracks brick and dirt (medium), never
 * steel or concrete. Hold LMB to keep swinging.
 */
class DemolitionMaul extends Tool {
  readonly id = 'demolition-maul';
  readonly name = 'Demolition Maul';
  override look = 'sledge';
  override hint = 'LMB heavy swing';
  reach = 3.2;
  rate = 84;
  impactTick = 30;
  swingT = -1;

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primary || this.swingT >= 0) return;
    this.swingT = 0;
    this.cooldown = this.rate;
    fx(ctx.sim, 'tool:swing', { tool: this.id, hit: false });
  }

  override tick(ctx: ToolContext): void {
    if (this.swingT < 0) return;
    const t = this.swingT++;
    this.anim = Math.max(0.001, 1 - t / this.rate);
    if (t === this.impactTick) this.strike(ctx);
    if (this.swingT >= this.rate) { this.swingT = -1; this.anim = 0; }
  }

  override save(): any { return this.swingT; }
  override load(_ctx: ToolContext, data: any): void { if (typeof data === 'number') this.swingT = data; }

  private strike(ctx: ToolContext): void {
    const { sim, player } = ctx;
    const eye = player.eye, dir = player.forward;
    const hit = sim.raycast(eye, dir, this.reach);
    if (!hit) return;
    const c = add(hit.point, dir, 0.2);
    const res = sim.carve(c, 0.85, 0.4, 0, { cause: 'sledge', rough: 0.3, fracture: 0.25, debris: 14, pushDir: dir, debrisSpeed: 6 });
    if (res.removed === 0) fx(sim, 'tool:clang', { pos: hit.point, pal: hit.palette });
    fx(sim, 'tool:impact', { tool: this.id, pos: hit.point, power: res.removed > 0 ? 1.3 : 0.8, kick: res.removed > 0 ? 2.2 : 3, broke: res.removed > 0 });
    if (hit.body.dynamic && !hit.body.removed) {
      const j = Math.min(1400, hit.body.rb.mass() * 12);
      hit.body.rb.applyImpulseAtPoint({ x: dir.x * j, y: dir.y * j + j * 0.2, z: dir.z * j }, hit.point, true);
    }
  }
}

export default defineMod({
  id: 'demolition-maul', name: 'Demolition Maul', category: 'tools', author: 'Wrecking Shift',
  description: 'A slow, two-handed maul with a long wind-up. Each blow takes a big bite and even cracks brick.',
  tools: [{ id: 'demolition-maul', create: () => new DemolitionMaul() }],
});
