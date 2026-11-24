import { spreadDir } from './gun';
import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit } from './util';

/** Unlimited foam: cone of short rays that put out fires where they land. */
export class Extinguisher extends Tool {
  readonly id = 'extinguisher';
  readonly name = 'Extinguisher';
  override hint = 'LMB foam';
  range = 5;
  rays = 6;
  /** cone half-angle (rad) */
  cone = 0.16;
  /** total fires put out (stats / tests) */
  putOut = 0;

  update(ctx: ToolContext, input: ToolInput): void {
    this.active = input.primary;
    if (!input.primary) return;
    this.anim = Math.max(this.anim, 0.25);
    const { sim, player, fire } = ctx;
    if (sim.tick % 3 !== 0) return;
    const eye = player.eye, fwd = player.forward;
    emit(sim, 'tool:foam', { pos: eye, dir: fwd });
    for (let i = 0; i < this.rays; i++) {
      const d = i === 0 ? fwd : spreadDir(ctx, fwd, this.cone);
      const hit = sim.raycast(eye, d, this.range);
      const p = hit ? hit.point : { x: eye.x + d.x * this.range, y: eye.y + d.y * this.range, z: eye.z + d.z * this.range };
      if (fire) this.putOut += fire.extinguish(p, hit ? 0.7 : 0.4);
      // a gentle push on light debris
      if (hit && hit.body.dynamic && hit.body.rb.mass() < 30) {
        hit.body.rb.applyImpulseAtPoint({ x: d.x * 1.5, y: d.y * 1.5, z: d.z * 1.5 }, hit.point, true);
      }
    }
  }
}
