import { defineMod, MAT, pal } from '../../src/mods/kit';
import { matOf } from '../../src/sim/materials';
import { spreadDir } from '../../src/sim/tools/gun';
import { Tool, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import { fx } from './_util';

/** materials the foam cannot freeze (already cold, or nothing to freeze into) */
const SKIP = new Set<number>([MAT.ice, MAT.bedrock, MAT.explosive, MAT.gold]);

/**
 * Rime foam: a cryogenic foam spray. Surface voxels it lands on turn into brittle ice (soft, slippery,
 * shatters like glass), so a sledge goes through a frozen brick wall. Also puts out fires.
 */
class RimeFoam extends Tool {
  readonly id = 'rime-foam';
  readonly name = 'Rime Foam';
  override look = 'extinguisher';
  override hint = 'LMB hold to freeze';
  override ammo = 15 * 60;
  override maxAmmo = 15 * 60;
  range = 4.5;
  rays = 4;
  cone = 0.12;
  /** freeze radius around each foam blob (m) */
  radius = 0.18;
  /** voxels frozen so far (stats) */
  frozen = 0;

  override get ammoLabel(): string { return this.ammo === Infinity ? '' : (Math.max(0, this.ammo) / 60).toFixed(1) + 's'; }

  update(ctx: ToolContext, input: ToolInput): void {
    const want = input.primary && this.hasAmmo(ctx);
    if (input.primaryPressed && !this.hasAmmo(ctx)) this.empty(ctx);
    this.active = want;
    if (!want) return;
    this.useAmmo(ctx);
    this.anim = Math.max(this.anim, 0.25);
    const { sim, player, fire } = ctx;
    if (sim.tick % 4 !== 0) return;
    const eye = player.eye, fwd = player.forward;
    fx(sim, 'tool:foam', { pos: eye, dir: fwd });
    for (let i = 0; i < this.rays; i++) {
      const d = i === 0 ? fwd : spreadDir(ctx, fwd, this.cone);
      const hit = sim.raycast(eye, d, this.range);
      if (!hit) continue;
      fire?.extinguish(hit.point, 0.5);
      const body = hit.body;
      if (body.indestructible) continue;
      const g = body.grid;
      const l = body.toLocal(hit.point);
      const r = this.radius / 0.1, r2 = r * r;
      for (let z = Math.floor(l.z - r); z <= Math.ceil(l.z + r); z++)
        for (let y = Math.floor(l.y - r); y <= Math.ceil(l.y + r); y++)
          for (let x = Math.floor(l.x - r); x <= Math.ceil(l.x + r); x++) {
            const p = g.get(x, y, z);
            if (!p || SKIP.has(matOf(p))) continue;
            const dx = x + 0.5 - l.x, dy = y + 0.5 - l.y, dz = z + 0.5 - l.z;
            if (dx * dx + dy * dy + dz * dz > r2) continue;
            sim.setVoxel(body, x, y, z, pal(MAT.ice, (x + y + z) % 3));
            this.frozen++;
          }
    }
  }

  override onDeselect(): void { this.active = false; }
}

export default defineMod({
  id: 'rime-foam', name: 'Rime Foam', category: 'tools', author: 'Wrecking Shift',
  description: 'Sprays a freezing foam that turns any surface it coats into brittle ice. Freeze a brick wall, then smash it with the hammer.',
  tools: [{ id: 'rime-foam', create: () => new RimeFoam() }],
});
