import { defineMod, MAT, pal, VoxelGrid } from '../../src/mods/kit';
import { Tool, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import { fx, SpawnedBodies } from './_util';

function crateGrid(n: number): VoxelGrid {
  const g = new VoxelGrid(n, n, n);
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const ex = x === 0 || x === n - 1, ey = y === 0 || y === n - 1, ez = z === 0 || z === n - 1;
    // dark frame on the edges, lighter boards on the faces
    const edge = (ex ? 1 : 0) + (ey ? 1 : 0) + (ez ? 1 : 0) >= 2;
    g.set(x, y, z, edge ? pal(MAT.wood, 0) : pal(MAT.crate, (x + y * 2 + z) % 3 + 1));
  }
  g.recount();
  return g;
}

/**
 * Supply beacon: mark a spot and a heavy wooden crate drops onto it from high above. Stack them, crush
 * roofs with them, or build a ramp. The oldest crates vanish once too many are around.
 */
class CrateDrop extends Tool {
  readonly id = 'crate-drop';
  readonly name = 'Crate Beacon';
  override look = 'bomb';
  override hint = 'LMB call a crate';
  override ammo = 12;
  override maxAmmo = 12;
  range = 40;
  height = 9;
  size = 8;
  rate = 40;
  private crates = new SpawnedBodies(16, 120 * 60);

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    const { sim, player } = ctx;
    const hit = sim.raycast(player.eye, player.forward, this.range);
    if (!hit) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = this.rate;
    this.anim = 1;
    const h = this.size * 0.1;
    const top = { x: hit.point.x + hit.normal.x * h * 0.6, y: hit.point.y + this.height, z: hit.point.z + hit.normal.z * h * 0.6 };
    // do not spawn inside a ceiling: drop from just under whatever is above the mark
    const up = sim.raycast({ x: top.x, y: hit.point.y + 0.3, z: top.z }, { x: 0, y: 1, z: 0 }, this.height);
    if (up) top.y = Math.max(hit.point.y + h + 0.3, up.point.y - h - 0.1);
    const body = sim.addBody(crateGrid(this.size), { x: top.x - h / 2, y: top.y, z: top.z - h / 2 }, {
      dynamic: true, kind: 'prop', name: 'crate', massScale: 3,
      linvel: { x: 0, y: -6, z: 0 }, angvel: { x: 0, y: (sim.rng.next() - 0.5) * 2, z: 0 },
    });
    this.crates.add(sim, body);
    fx(sim, 'tool:place', { tool: this.id, pos: hit.point });
    fx(sim, 'tool:beep', { pos: hit.point });
  }

  override tick(ctx: ToolContext): void { this.crates.tick(ctx.sim); }
  override save(): any { return this.crates.save(); }
  override load(ctx: ToolContext, data: any): void { this.crates.load(ctx.sim, data); }
}

export default defineMod({
  id: 'crate-drop', name: 'Crate Beacon', category: 'tools', author: 'Wrecking Shift',
  description: 'Point at a spot and a heavy wooden crate falls on it from nine metres up. Stack them, or drop a pile onto a weak roof.',
  tools: [{ id: 'crate-drop', create: () => new CrateDrop() }],
});
