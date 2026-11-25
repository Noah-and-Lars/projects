import { MAT, pal } from '../materials';
import { DT } from '../sim';
import { qrot, type V3 } from '../vec';
import { VoxelGrid } from '../voxels';
import { checkSticky, loadSticky, placeSticky, saveSticky, type Sticky } from './sticky';
import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit } from './util';

/** squat can: 3x5x3, red body, white band, dark nozzle cap at the top (local +Y = away from the surface) */
export function boosterGrid(): VoxelGrid {
  const g = new VoxelGrid(3, 5, 3);
  for (let y = 0; y < 4; y++) for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) {
    if ((x === 0 || x === 2) && (z === 0 || z === 2) && y > 0) continue; // rounded corners
    g.set(x, y, z, y === 2 ? pal(MAT.plastic, 0) : pal(MAT.paintedmetal, 2));
  }
  g.set(1, 4, 1, pal(MAT.steel, 0)); // nozzle
  return g;
}

export interface LiveBooster {
  stick: Sticky;
  /** tick it lights */
  at: number;
  /** tick it burns out */
  end: number;
  lit: boolean;
}

/**
 * Booster can: stick it on a loose object or a vehicle; after a short fuse it burns for a few seconds,
 * shoving whatever it is glued to along the surface normal (into the surface, flame out the other way).
 * Thrust is capped by an acceleration limit so small props do not reach orbit. A can knocked loose
 * flies on by itself. Burnt-out cans fall off and vanish.
 *
 * Events: `tool:boost` { pos, dir (flame direction), start? } every 6 ticks while burning, `tool:boostEnd` { pos }.
 */
export class Booster extends Tool {
  readonly id: string = 'booster';
  readonly name: string = 'Booster Can';
  override hint = 'LMB stick on something loose';
  override ammo = 4;
  override maxAmmo = 4;
  range = 3;
  /** ticks between sticking and lighting */
  fuse = 60;
  /** burn length (ticks); raised by the 'Long-burn fuel' upgrade */
  burn = 210;
  /** push (N) */
  thrust = 9000;
  /** acceleration cap for the pushed body (m/s²) */
  maxAccel = 28;
  readonly live: LiveBooster[] = [];

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    const { sim, player } = ctx;
    const hit = sim.raycast(player.eye, player.forward, this.range);
    if (!hit) return;
    // a booster on a building does nothing: only loose things and vehicles
    if (!hit.body.dynamic) { this.cooldown = 20; emit(sim, 'tool:empty', { tool: this.id, why: 'static' }); return; }
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = 30;
    this.anim = 1;
    const stick = placeSticky(sim, boosterGrid(), hit, player.forward, { name: 'booster', mass: 2, tags: ['tool', 'nograb'] });
    this.live.push({ stick, at: sim.tick + this.fuse, end: sim.tick + this.fuse + this.burn, lit: false });
    emit(sim, 'tool:place', { tool: this.id, pos: hit.point });
  }

  /** world direction of the flame (= can's local +Y) */
  flameDir(b: LiveBooster): V3 { return qrot(b.stick.body.rb.rotation(), { x: 0, y: 1, z: 0 }); }
  /** world position of the nozzle */
  nozzle(b: LiveBooster): V3 { return b.stick.body.toWorld({ x: 1.5, y: 5, z: 1.5 }); }

  private saveTick = 0;
  override save(): any {
    return this.live.filter((b) => !b.stick.body.removed).map((b) => ({ s: saveSticky(b.stick), at: b.at - this.saveTick, end: b.end - this.saveTick, lit: b.lit }));
  }
  override load(ctx: ToolContext, data: any): void {
    for (const d of data ?? []) {
      const stick = loadSticky(ctx.sim, d.s, 2);
      if (stick) this.live.push({ stick, at: ctx.sim.tick + d.at, end: ctx.sim.tick + Math.max(1, d.end), lit: !!d.lit });
    }
  }

  override tick(ctx: ToolContext): void {
    const sim = ctx.sim;
    this.saveTick = sim.tick;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      const can = b.stick.body;
      if (can.removed) { this.live.splice(i, 1); continue; }
      if (sim.tick % 10 === 0) checkSticky(sim, b.stick);
      if (sim.tick < b.at) continue;
      if (sim.tick >= b.end) {
        emit(sim, 'tool:boostEnd', { pos: this.nozzle(b) });
        sim.removeBody(can);
        this.live.splice(i, 1);
        continue;
      }
      const flame = this.flameDir(b);
      const pos = can.center();
      if (!b.lit) { b.lit = true; emit(sim, 'tool:boost', { pos: this.nozzle(b), dir: flame, start: true }); }
      else if ((sim.tick - b.at) % 6 === 0) emit(sim, 'tool:boost', { pos: this.nozzle(b), dir: flame });
      // glued: push the partner (the joint is rigid, pushing the 2 kg can would only strain it); loose: the can flies
      const glued = !!b.stick.joint && !b.stick.anchor.body.removed;
      const target = glued ? b.stick.anchor.body : can;
      if (!target.dynamic || target.removed) continue;
      const m = Math.max(0.5, target.rb.mass());
      const f = Math.min(this.thrust, m * this.maxAccel) * DT;
      target.rb.applyImpulseAtPoint({ x: -flame.x * f, y: -flame.y * f, z: -flame.z * f }, pos, true);
    }
  }
}
