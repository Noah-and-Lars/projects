import { defineMod } from '../../src/mods/kit';
import { Tool, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import { dynamicNear, fx } from './_util';

/**
 * Ground slam: a pneumatic ram you drive into the floor. Cracks the ground a little in front of you,
 * breaks soft things at the foot of walls, and throws every loose body around you up and outward.
 */
class QuakeStomp extends Tool {
  readonly id = 'quake-stomp';
  readonly name = 'Quake Ram';
  override look = 'sledge';
  override hint = 'LMB slam the ground';
  override ammo = 12;
  override maxAmmo = 12;
  radius = 6;
  rate = 75;
  /** upward / outward velocity change at the centre (m/s) */
  dv = 9;

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = this.rate;
    this.anim = 1;
    const { sim, player } = ctx;
    fx(sim, 'tool:swing', { tool: this.id, hit: true });
    const f = player.forward;
    const fh = Math.hypot(f.x, f.z) || 1;
    const foot = player.pos;
    // slam point: on the ground ~1 m ahead
    const from = { x: foot.x + (f.x / fh) * 1.0, y: foot.y + 1, z: foot.z + (f.z / fh) * 1.0 };
    const g = sim.raycast(from, { x: 0, y: -1, z: 0 }, 3);
    const at = g ? g.point : { x: from.x, y: foot.y, z: from.z };
    // a shallow crater and a ring of cracks: soft breaks, medium chips
    const res = sim.carve(at, 0.9, 0.45, 0, { cause: 'slam', rough: 0.5, fracture: 0.3, debris: 10, pushDir: { x: 0, y: 1, z: 0 }, debrisSpeed: 4 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + sim.rng.next() * 0.5;
      sim.carve({ x: at.x + Math.cos(a) * 1.6, y: at.y + 0.1, z: at.z + Math.sin(a) * 1.6 }, 0.35, 0.15, 0, { cause: 'slam', rough: 0.6, silent: true });
    }
    let thrown = 0;
    for (const { body, com, d } of dynamicNear(sim, at, this.radius)) {
      const m = Math.max(1, body.rb.mass());
      const k = this.dv * (1 - d / this.radius) * Math.min(1, 800 / m);
      if (k < 0.1) continue;
      const hx = com.x - at.x, hz = com.z - at.z, hl = Math.hypot(hx, hz) || 1;
      body.rb.applyImpulse({ x: (hx / hl) * m * k * 0.5, y: m * k, z: (hz / hl) * m * k * 0.5 }, true);
      body.rb.applyTorqueImpulse({ x: (sim.rng.next() - 0.5) * m * 0.5, y: 0, z: (sim.rng.next() - 0.5) * m * 0.5 }, true);
      thrown++;
    }
    sim.wakeNear(at, this.radius);
    player.vel.y += 2.5;
    fx(sim, 'tool:impact', { tool: this.id, pos: at, power: 1.4, kick: 2.5, broke: res.removed > 0, thrown });
  }
}

export default defineMod({
  id: 'quake-stomp', name: 'Quake Ram', category: 'tools', author: 'Wrecking Shift',
  description: 'Drive a pneumatic ram into the ground: the floor cracks and every loose object around you is flung into the air.',
  tools: [{ id: 'quake-stomp', create: () => new QuakeStomp() }],
});
