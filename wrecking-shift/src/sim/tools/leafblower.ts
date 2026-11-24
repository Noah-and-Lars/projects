import { DT } from '../sim';
import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit } from './util';

/** Leaf blower: unlimited, pushes light dynamic bodies (debris) in a cone in front of the player. Breaks nothing. */
export class LeafBlower extends Tool {
  readonly id = 'leafblower';
  readonly name = 'Leaf Blower';
  override hint = 'LMB blow debris';
  range = 6;
  /** cos of the cone half-angle (~25°) */
  cone = Math.cos(0.45);
  /** push acceleration at the nozzle for light bodies (m/s²) */
  power = 30;

  update(ctx: ToolContext, input: ToolInput): void {
    this.active = input.primary;
    if (!input.primary) return;
    this.anim = Math.max(this.anim, 0.2);
    const { sim, player } = ctx;
    const eye = player.eye, f = player.forward;
    if (sim.tick % 4 === 0) emit(sim, 'tool:blow', { pos: eye, dir: f });
    if (sim.tick % 2 !== 0) return;
    for (const b of sim.bodiesNear(eye, this.range)) {
      if (!b.dynamic || b.removed || b.kind === 'vehicle') continue;
      const c = b.rb.worldCom();
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > this.range || d < 1e-3) continue;
      if ((dx * f.x + dy * f.y + dz * f.z) / d < this.cone) continue;
      const m = Math.max(b.rb.mass(), 1);
      // light things fly, heavy things barely notice
      const a = this.power * (1 - d / this.range) * Math.min(1, 25 / m);
      if (a < 0.2) continue;
      const j = m * a * DT * 2;
      // mostly along the ground: aiming down at debris should sweep it away, not pin it
      const px = f.x, py = f.y * 0.3 + 0.15, pz = f.z;
      const pl = Math.hypot(px, py, pz) || 1;
      b.rb.applyImpulse({ x: (px / pl) * j, y: (py / pl) * j, z: (pz / pl) * j }, true);
    }
  }
}
