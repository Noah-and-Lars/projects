import { defineMod } from '../../src/mods/kit';
import { Tool, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import { add, fx } from './_util';

/**
 * Core drill: hold LMB and a diamond bit bores a round tunnel straight along the view ray, through any
 * breakable material (hard material just slower). Battery powered.
 */
class CoreDrill extends Tool {
  readonly id = 'core-drill';
  readonly name = 'Core Drill';
  override look = 'blowtorch';
  override hint = 'LMB hold to bore';
  override ammo = 25 * 60;
  override maxAmmo = 25 * 60;
  /** the bit reaches this far (the blowtorch look reads `range` for its flame) */
  range = 2.2;
  radius = 0.32;
  private spin = 0;

  override get ammoLabel(): string { return this.ammo === Infinity ? '' : (Math.max(0, this.ammo) / 60).toFixed(1) + 's'; }

  update(ctx: ToolContext, input: ToolInput): void {
    const want = input.primary && this.hasAmmo(ctx);
    if (input.primaryPressed && !this.hasAmmo(ctx)) this.empty(ctx);
    this.active = want;
    if (!want) { this.spin = 0; return; }
    this.useAmmo(ctx);
    this.anim = Math.max(this.anim, 0.25);
    const { sim, player } = ctx;
    const eye = player.eye, dir = player.forward;
    this.spin++;
    // bite every 5 ticks; hard material needs every third bite to give
    if (this.spin % 5 !== 0) return;
    const hit = sim.raycast(eye, dir, this.range);
    if (!hit) return;
    const hard = (this.spin / 5) % 3 === 0 ? this.radius * 0.8 : 0;
    const res = sim.carve(add(hit.point, dir, 0.12), this.radius, this.radius, hard, { cause: 'drill', rough: 0.05 });
    fx(sim, 'tool:impact', { tool: this.id, pos: hit.point, power: 0.15, kick: 0.2, broke: res.removed > 0 });
    // push loose bodies away from the bit
    if (hit.body.dynamic && !hit.body.removed) hit.body.rb.applyImpulseAtPoint({ x: dir.x * 8, y: dir.y * 8, z: dir.z * 8 }, hit.point, true);
  }

  override onDeselect(): void { this.active = false; this.spin = 0; }
}

export default defineMod({
  id: 'core-drill', name: 'Core Drill', category: 'tools', author: 'Wrecking Shift',
  description: 'Hold to bore a clean round tunnel straight ahead, even through steel and concrete. Walk forward to keep drilling.',
  tools: [{ id: 'core-drill', create: () => new CoreDrill() }],
});
