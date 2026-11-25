import { defineMod } from '../../src/mods/kit';
import { DT } from '../../src/sim/sim';
import { Tool, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import { add, dynamicNear, fx, sub } from './_util';

/**
 * Tractor magnet: hold LMB to pull loose bodies in front of you toward a point a couple of metres ahead,
 * where they hover (damped spring). Release to drop them.
 */
class TractorMagnet extends Tool {
  readonly id = 'tractor-magnet';
  readonly name = 'Tractor Magnet';
  override look = 'leafblower';
  override hint = 'LMB hold to pull';
  range = 12;
  cone = Math.cos(0.85);
  hold = 2.2;
  /** spring stiffness (1/s²) and damping (1/s) */
  k = 18;
  c = 5;
  /** heaviest body it can lift (kg); heavier ones just get tugged */
  maxMass = 600;

  update(ctx: ToolContext, input: ToolInput): void {
    this.active = input.primary;
    if (!input.primary) return;
    this.anim = Math.max(this.anim, 0.2);
    const { sim, player } = ctx;
    const eye = player.eye, f = player.forward;
    if (sim.tick % 4 === 0) fx(sim, 'tool:blow', { pos: eye, dir: { x: -f.x, y: -f.y, z: -f.z } });
    if (sim.tick % 2 !== 0) return;
    const target = add(eye, f, this.hold);
    for (const { body, com } of dynamicNear(sim, eye, this.range, f, this.cone)) {
      const m = Math.max(1, body.rb.mass());
      const s = Math.min(1, this.maxMass / m);
      const v = body.rb.linvel();
      const off = sub(target, com);
      // spring toward the hover point + damping + gravity compensation, two ticks' worth
      const ax = (off.x * this.k - v.x * this.c) * s;
      const ay = (off.y * this.k - v.y * this.c) * s + 9.81 * s;
      const az = (off.z * this.k - v.z * this.c) * s;
      const j = m * DT * 2;
      body.rb.applyImpulse({ x: ax * j, y: ay * j, z: az * j }, true);
      body.rb.setAngvel({ x: body.rb.angvel().x * 0.9, y: body.rb.angvel().y * 0.9, z: body.rb.angvel().z * 0.9 }, true);
    }
  }

  override onDeselect(): void { this.active = false; }
}

export default defineMod({
  id: 'tractor-magnet', name: 'Tractor Magnet', category: 'tools', author: 'Wrecking Shift',
  description: 'Hold to drag loose debris and props toward you and keep them hovering in front of you. Let go to drop the load.',
  tools: [{ id: 'tractor-magnet', create: () => new TractorMagnet() }],
});
