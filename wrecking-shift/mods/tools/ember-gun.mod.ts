import { defineMod } from '../../src/mods/kit';
import { PAL_FLAMMABILITY, isScorched, scorch } from '../../src/sim/materials';
import { spreadDir } from '../../src/sim/tools/gun';
import { Tool, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import { fx } from './_util';

/**
 * Ember gun: fires a burning pellet. Flammable material where it lands catches fire; anything else gets
 * a scorch mark. Breaks nothing by itself; let the fire do the work.
 */
class EmberGun extends Tool {
  readonly id = 'ember-gun';
  readonly name = 'Ember Gun';
  override look = 'pistol';
  override hint = 'LMB shoot embers';
  override ammo = 24;
  override maxAmmo = 24;
  range = 30;
  rate = 20;

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = this.rate;
    this.anim = 1;
    const { sim, player, fire } = ctx;
    const eye = player.eye;
    const dir = spreadDir(ctx, player.forward, 0.01);
    const hit = sim.raycast(eye, dir, this.range);
    fx(sim, 'tool:shot', { tool: this.id, pos: eye, dir, hit: hit ? hit.point : null });
    if (!hit) return;
    let lit = 0;
    if (fire) {
      fire.heat(hit.point, 1);
      if (PAL_FLAMMABILITY[hit.palette] > 0) lit = fire.igniteNear(hit.point, 0.35, 4);
    }
    // scorch the surface around the hit
    const b = hit.body;
    if (!b.indestructible) {
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = hit.vx + dx, y = hit.vy + dy, z = hit.vz + dz;
        const p = b.grid.get(x, y, z);
        if (p && !isScorched(p) && sim.rng.next() < 0.6) sim.setVoxel(b, x, y, z, scorch(p, x + z));
      }
    }
    fx(sim, 'tool:impact', { tool: this.id, pos: hit.point, power: 0.05, kick: 0.3, lit });
  }
}

export default defineMod({
  id: 'ember-gun', name: 'Ember Gun', category: 'tools', author: 'Wrecking Shift',
  description: 'Shoots burning pellets that set wood, fabric and leaves alight from thirty metres away. Bring an extinguisher.',
  tools: [{ id: 'ember-gun', create: () => new EmberGun() }],
});
