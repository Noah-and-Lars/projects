import { defineMod, MAT, pal, VoxelGrid } from '../../src/mods/kit';
import type { VoxelBody } from '../../src/sim/body';
import { qyaw, type V3 } from '../../src/sim/vec';
import { setBodyMass } from '../../src/sim/tools/util';
import { Tool, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import { fx } from './_util';

function canisterGrid(): VoxelGrid {
  const g = new VoxelGrid(3, 4, 3);
  for (let y = 0; y < 4; y++) for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) {
    if ((x !== 1 && z !== 1) && (y === 0 || y === 3)) continue;
    g.set(x, y, z, pal(y === 3 ? MAT.paintedmetal : MAT.steel, y % 2 ? 1 : 3));
  }
  g.recount();
  return g;
}

interface Live { body: VoxelBody; at: number; pos: V3 }

/**
 * Cluster grenade: thrown canister that pops after a short fuse and scatters bomblets which go off a
 * moment later in a ring around it: wide, shallow damage.
 */
class ClusterGrenade extends Tool {
  readonly id = 'cluster-grenade';
  readonly name = 'Cluster Grenade';
  override look = 'pipebomb';
  override hint = 'LMB throw';
  override ammo = 5;
  override maxAmmo = 5;
  fuse = 100;
  throwSpeed = 13;
  bomblets = 6;
  spreadR = 2.2;
  /** live canisters (the pipebomb look draws fuse sparks at `live[i].pos`) */
  readonly live: Live[] = [];
  private now = 0;

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = 30;
    this.anim = 1;
    const { sim, player } = ctx;
    const eye = player.eye, f = player.forward;
    const block = sim.raycast(eye, f, 0.8);
    const k = block ? Math.max(0, block.dist - 0.25) : 0.55;
    const p0 = { x: eye.x + f.x * k, y: eye.y + f.y * k - 0.12, z: eye.z + f.z * k };
    const s = this.throwSpeed, v = player.vel;
    const body = sim.addBody(canisterGrid(), { x: p0.x - 0.15, y: p0.y - 0.2, z: p0.z - 0.15 }, {
      dynamic: true, kind: 'prop', name: 'cluster', tags: ['tool', 'nograb'], rot: qyaw(player.yaw),
      linvel: { x: f.x * s + v.x, y: f.y * s + 3 + v.y * 0.5, z: f.z * s + v.z },
      angvel: { x: (sim.rng.next() - 0.5) * 10, y: (sim.rng.next() - 0.5) * 4, z: (sim.rng.next() - 0.5) * 10 },
    });
    body.noSplit = true;
    setBodyMass(body, 1.5);
    this.live.push({ body, at: sim.tick + this.fuse, pos: body.center() });
    fx(sim, 'tool:throw', { tool: this.id });
  }

  override tick(ctx: ToolContext): void {
    const sim = ctx.sim;
    this.now = sim.tick;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const c = this.live[i];
      if (!c.body.removed) c.pos = c.body.center();
      const broken = c.body.removed || c.body.grid.count < c.body.initialCount;
      if (sim.tick < c.at && !broken) continue;
      this.live.splice(i, 1);
      if (!c.body.removed) sim.removeBody(c.body);
      if (c.pos.y < -50) continue;
      // a small pop, then the bomblets
      sim.explode(c.pos, 0.6);
      const phase = sim.rng.next() * Math.PI * 2;
      for (let b = 0; b < this.bomblets; b++) {
        const a = phase + (b / this.bomblets) * Math.PI * 2;
        const r = this.spreadR * (0.6 + 0.4 * sim.rng.next());
        const p = { x: c.pos.x + Math.cos(a) * r, y: c.pos.y + 0.3, z: c.pos.z + Math.sin(a) * r };
        // drop the bomblet onto whatever is below it (within 3 m)
        const down = sim.raycast(p, { x: 0, y: -1, z: 0 }, 3);
        const at = down ? { x: down.point.x, y: down.point.y + 0.1, z: down.point.z } : p;
        sim.explodeLater(at, 0.7, 12 + sim.rng.int(18));
      }
      fx(sim, 'tool:impact', { tool: this.id, pos: c.pos, power: 0.5, kick: 0 });
    }
  }

  override save(): any { return this.live.filter((c) => !c.body.removed).map((c) => ({ body: c.body.id, left: c.at - this.now })); }
  override load(ctx: ToolContext, data: any): void {
    for (const d of data ?? []) {
      const body = ctx.sim.bodies.get(d.body);
      if (body) this.live.push({ body, at: ctx.sim.tick + Math.max(1, d.left), pos: body.center() });
    }
  }
}

export default defineMod({
  id: 'cluster-grenade', name: 'Cluster Grenade', category: 'tools', author: 'Wrecking Shift',
  description: 'A thrown canister that bursts and scatters six bomblets in a ring. Wide, shallow damage, ideal for clearing a yard.',
  tools: [{ id: 'cluster-grenade', create: () => new ClusterGrenade() }],
});
