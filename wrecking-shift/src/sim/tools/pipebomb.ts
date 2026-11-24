import type { VoxelBody } from '../body';
import { MAT, pal } from '../materials';
import { qyaw, type V3 } from '../vec';
import { VoxelGrid } from '../voxels';
import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit, setBodyMass } from './util';

export interface LiveCharge {
  body: VoxelBody;
  /** sim tick at which it goes off */
  at: number;
  size: number;
  /** last known centre */
  pos: V3;
}

/** pipe: 3×3 cross-section (corners cut) × 6 long, end caps darker */
export function pipeGrid(): VoxelGrid {
  const g = new VoxelGrid(3, 3, 6);
  for (let z = 0; z < 6; z++) for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    if ((x === 0 || x === 2) && (y === 0 || y === 2)) continue;
    const cap = z === 0 || z === 5;
    g.set(x, y, z, cap ? pal(MAT.steel, 0) : pal(MAT.steel, 3));
  }
  g.set(1, 2, 2, pal(MAT.wire, 1)); // fuse wire
  return g;
}

/**
 * Thrown pipe bomb: small dynamic voxel body, 2.5 s fuse, explosion size 1.0 (breaks hard).
 * Breaking the pipe (shooting it) sets it off early.
 */
export class PipeBomb extends Tool {
  readonly id = 'pipebomb';
  readonly name = 'Pipe Bomb';
  override hint = 'LMB throw';
  override ammo = 6;
  override maxAmmo = 6;
  fuse = Math.round(2.5 * 60);
  size = 1.0;
  throwSpeed = 14;
  /** live bombs (render / tests) */
  readonly live: LiveCharge[] = [];

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = 30;
    this.anim = 1;
    const { sim, player } = ctx;
    const eye = player.eye, f = player.forward;
    // spawn a bit ahead and to the right so it clears the player capsule
    const right = { x: Math.cos(player.yaw), y: 0, z: -Math.sin(player.yaw) };
    const spawn: V3 = { x: eye.x + f.x * 0.55 + right.x * 0.12, y: eye.y + f.y * 0.55 - 0.12, z: eye.z + f.z * 0.55 + right.z * 0.12 };
    // spawn may be inside a wall when hugging it: pull back to the eye ray hit
    const block = sim.raycast(eye, f, 0.75);
    const p0 = block ? { x: eye.x + f.x * Math.max(0, block.dist - 0.25), y: eye.y + f.y * Math.max(0, block.dist - 0.25) - 0.1, z: eye.z + f.z * Math.max(0, block.dist - 0.25) } : spawn;
    const v = player.vel;
    const s = this.throwSpeed;
    const body = sim.addBody(pipeGrid(), { x: p0.x - 0.15, y: p0.y - 0.15, z: p0.z - 0.3 }, {
      dynamic: true, kind: 'prop', name: 'pipebomb', tags: ['tool', 'nograb'],
      rot: qyaw(player.yaw),
      linvel: { x: f.x * s + v.x, y: f.y * s + 2.5 + v.y * 0.5, z: f.z * s + v.z },
      angvel: { x: (sim.rng.next() - 0.5) * 14, y: (sim.rng.next() - 0.5) * 4, z: (sim.rng.next() - 0.5) * 6 },
    });
    body.noSplit = true;
    setBodyMass(body, 2.5);
    this.live.push({ body, at: sim.tick + this.fuse, size: this.size, pos: body.center() });
    emit(sim, 'tool:throw', { tool: this.id });
  }

  override tick(ctx: ToolContext): void {
    tickCharges(ctx, this.live);
  }
}

/** shared fuse handling for pipe bombs / bombs: explode when due, when broken, or drop if the body vanished */
export function tickCharges(ctx: ToolContext, live: LiveCharge[], beep?: (c: LiveCharge) => void): void {
  const sim = ctx.sim;
  for (let i = live.length - 1; i >= 0; i--) {
    const c = live[i];
    if (!c.body.removed) c.pos = c.body.center();
    const broken = c.body.removed || c.body.grid.count < c.body.initialCount;
    if (sim.tick >= c.at || broken) {
      live.splice(i, 1);
      if (!c.body.removed) sim.removeBody(c.body);
      // fell out of the world: just gone
      if (c.pos.y > -50) sim.explode(c.pos, c.size);
      continue;
    }
    beep?.(c);
  }
}
