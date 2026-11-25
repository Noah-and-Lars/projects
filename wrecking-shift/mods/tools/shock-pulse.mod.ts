import { defineMod } from '../../src/mods/kit';
import { Tool, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import { dynamicNear, fx, norm, sub } from './_util';

/** Pressure pulse: a cone-shaped shove that throws loose bodies away from the player. Breaks only glass-thin bits. */
class ShockPulse extends Tool {
  readonly id = 'shock-pulse';
  readonly name = 'Shock Pulse';
  override look = 'leafblower';
  override hint = 'LMB pulse';
  override ammo = 16;
  override maxAmmo = 16;
  range = 9;
  cone = Math.cos(0.7);
  /** velocity change at point blank (m/s), capped for heavy bodies */
  dv = 14;
  rate = 40;

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = this.rate;
    this.anim = 1;
    const { sim, player } = ctx;
    const eye = player.eye, f = player.forward;
    let pushed = 0;
    for (const { body, com, d } of dynamicNear(sim, eye, this.range, f, this.cone)) {
      const m = Math.max(1, body.rb.mass());
      const k = this.dv * (1 - d / this.range) * Math.min(1, 400 / m);
      if (k < 0.1) continue;
      const dir = norm(sub(com, eye));
      const j = m * k;
      body.rb.applyImpulse({ x: dir.x * j, y: dir.y * j + j * 0.25, z: dir.z * j }, true);
      pushed++;
    }
    // the wave also knocks glass and leaves off the surface it hits
    const hit = sim.raycast(eye, f, this.range);
    if (hit) sim.carve(hit.point, 0.05, 0, 0, { cause: 'pulse', silent: true, filter: (b) => !b.indestructible });
    player.vel.x -= f.x * 2; player.vel.z -= f.z * 2;
    fx(sim, 'tool:blow', { pos: eye, dir: f });
    fx(sim, 'tool:shot', { tool: this.id, pos: eye, dir: f, pushed });
  }
}

export default defineMod({
  id: 'shock-pulse', name: 'Shock Pulse', category: 'tools', author: 'Wrecking Shift',
  description: 'Fires a cone of air pressure that hurls loose debris, crates and planks away from you. Kicks you back a little too.',
  tools: [{ id: 'shock-pulse', create: () => new ShockPulse() }],
});
