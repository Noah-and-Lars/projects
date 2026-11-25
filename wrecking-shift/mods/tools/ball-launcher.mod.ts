import { defineMod, MAT, pal, VoxelGrid } from '../../src/mods/kit';
import { Tool, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import { add, fx, SpawnedBodies } from './_util';

function ballGrid(d: number): VoxelGrid {
  const g = new VoxelGrid(d, d, d);
  const c = d / 2, r2 = c * c;
  for (let z = 0; z < d; z++) for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, dz = z + 0.5 - c;
    if (dx * dx + dy * dy + dz * dz <= r2) g.set(x, y, z, pal(MAT.steel, (x + z) % 2 ? 1 : 2));
  }
  g.recount();
  return g;
}

/**
 * Wrecking-ball cannon: fires a solid steel ball (roughly 340 kg) that smashes through by sheer momentum:
 * the physics impacts do the damage. Old balls are cleared after a while.
 */
class BallLauncher extends Tool {
  readonly id = 'ball-launcher';
  readonly name = 'Ball Cannon';
  override look = 'shotgun';
  override hint = 'LMB launch a steel ball';
  override ammo = 8;
  override maxAmmo = 8;
  speed = 26;
  diameter = 6;
  rate = 60;
  private balls = new SpawnedBodies(8, 40 * 60);

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = this.rate;
    this.anim = 1;
    const { sim, player } = ctx;
    const eye = player.eye, f = player.forward;
    const r = this.diameter * 0.05;
    // spawn ahead of the player capsule, pulled back if a wall is right there
    const block = sim.raycast(eye, f, 1.0 + r);
    const k = block ? Math.max(0.35, block.dist - r - 0.05) : 0.8;
    const c = add(eye, f, k);
    const s = this.speed;
    const body = sim.addBody(ballGrid(this.diameter), { x: c.x - r, y: c.y - r, z: c.z - r }, {
      dynamic: true, kind: 'prop', name: 'wrecking ball', tags: ['tool'],
      linvel: { x: f.x * s + player.vel.x, y: f.y * s + 1, z: f.z * s + player.vel.z },
    });
    body.noSplit = true;
    body.impactProof = true;
    this.balls.add(sim, body);
    player.vel.x -= f.x * 2.5; player.vel.z -= f.z * 2.5;
    fx(sim, 'tool:shot', { tool: this.id, pos: eye, dir: f });
  }

  override tick(ctx: ToolContext): void { this.balls.tick(ctx.sim); }
  override save(): any { return this.balls.save(); }
  override load(ctx: ToolContext, data: any): void { this.balls.load(ctx.sim, data); }
}

export default defineMod({
  id: 'ball-launcher', name: 'Ball Cannon', category: 'tools', author: 'Wrecking Shift',
  description: 'Launches a solid steel ball that bowls through walls by momentum alone. Great for knocking over towers.',
  tools: [{ id: 'ball-launcher', create: () => new BallLauncher() }],
});
