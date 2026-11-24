import { Tool, type ToolContext, type ToolInput } from './tool';

/** Unlimited melee tool: breaks soft materials, dents medium ones slightly. */
export class Sledge extends Tool {
  readonly id = 'sledge';
  readonly name = 'Sledgehammer';
  override hint = 'LMB swing';
  reach = 2.6;

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primary || this.cooldown > 0) return;
    this.cooldown = 24;
    this.anim = 1;
    const { sim, player } = ctx;
    const eye = player.eye, dir = player.forward;
    const hit = sim.raycast(eye, dir, this.reach);
    sim.out.push({ type: 'custom', name: 'tool:swing', data: { tool: this.id, hit: !!hit } });
    if (!hit) return;
    const c = { x: hit.point.x + dir.x * 0.12, y: hit.point.y + dir.y * 0.12, z: hit.point.z + dir.z * 0.12 };
    const res = sim.carve(c, 0.42, 0.0, 0, { cause: 'sledge', fracture: 0.25 });
    if (res.removed === 0) sim.out.push({ type: 'custom', name: 'tool:clang', data: { pos: hit.point, pal: hit.palette } });
    // shove dynamic bodies a little
    if (hit.body.dynamic) hit.body.rb.applyImpulseAtPoint({ x: dir.x * 180, y: dir.y * 180 + 30, z: dir.z * 180 }, hit.point, true);
  }
}
