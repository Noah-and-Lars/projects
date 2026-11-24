import { MAT, PAL_FLAMMABILITY, isScorched, matOf, scorch } from '../materials';
import type { VoxelBody } from '../body';
import type { V3 } from '../vec';
import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit } from './util';

/** materials the torch melts through, with the heat (ticks at the flame centre) they need */
const MELT = new Map<number, number>([
  [MAT.wood, 10], [MAT.crate, 9], [MAT.glass, 10], [MAT.plastic, 8], [MAT.leaves, 4], [MAT.grass, 6],
  [MAT.fabric, 5], [MAT.explosive, 10], [MAT.lamp, 10], [MAT.snow, 4], [MAT.ice, 8], [MAT.rubber, 10],
  [MAT.electronics, 12], [MAT.char, 4], [MAT.alarmbox, 14], [MAT.wire, 5],
  // "weak" metal
  [MAT.sheetmetal, 16], [MAT.paintedmetal, 18],
]);

/**
 * Blowtorch: short-range precise cutter. Melts a small hole (r≈0.15 m) through soft materials and
 * sheet metal by accumulating heat per voxel; brick / plaster / concrete / dirt only get scorched.
 * Heats the fire system so flammables catch fire. Fuel in ticks (20 s base).
 */
export class Blowtorch extends Tool {
  readonly id = 'blowtorch';
  readonly name = 'Blowtorch';
  override hint = 'LMB hold to cut';
  override ammo = 20 * 60;
  override maxAmmo = 20 * 60;
  range = 1.6;
  radius = 0.15;
  /** FireApi.heat() units per tick (0.06: wood lights in ~0.6 s with the fire CA) */
  heatRate = 0.06;
  private heat = new Map<number, number>();
  private lastUse = -999;
  private on = false;
  /** voxels melted so far (stats / tests) */
  melted = 0;

  override get ammoLabel(): string {
    return this.ammo === Infinity ? '' : (Math.max(0, this.ammo) / 60).toFixed(1) + 's';
  }

  update(ctx: ToolContext, input: ToolInput): void {
    const { sim, player } = ctx;
    const want = input.primary && this.hasAmmo(ctx);
    if (input.primaryPressed && !this.hasAmmo(ctx)) this.empty(ctx);
    if (!want) {
      if (this.on) { this.on = false; emit(sim, 'tool:torch', { pos: player.eye, on: false }); }
      this.active = false;
      return;
    }
    this.useAmmo(ctx);
    this.active = true;
    this.anim = Math.max(this.anim, 0.2);
    const eye = player.eye, dir = player.forward;
    const hit = sim.raycast(eye, dir, this.range);
    const pos = hit ? hit.point : { x: eye.x + dir.x * this.range, y: eye.y + dir.y * this.range, z: eye.z + dir.z * this.range };
    if (!this.on) { this.on = true; emit(sim, 'tool:torch', { pos, on: true }); }
    else if (sim.tick % 6 === 0) emit(sim, 'tool:torch', { pos, on: true, hit: !!hit });
    if (sim.tick - this.lastUse > 30) this.heat.clear();
    this.lastUse = sim.tick;
    if (hit) ctx.fire?.heat(hit.point, this.heatRate);
    // the flame is the ray segment up to just inside the surface: voxels within `radius` of it
    // heat up. Once the centre melts the ray passes through the hole and keeps widening it.
    const tip = hit ? hit.dist + 0.05 : this.range;
    const a = { x: eye.x + dir.x * 0.3, y: eye.y + dir.y * 0.3, z: eye.z + dir.z * 0.3 };
    const b = { x: eye.x + dir.x * tip, y: eye.y + dir.y * tip, z: eye.z + dir.z * tip };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    let flammableHot = false;
    for (const body of sim.bodiesNear(mid, tip / 2 + this.radius)) {
      if (body.indestructible) continue;
      if (this.heatBody(ctx, body, a, b)) flammableHot = true;
    }
    if (hit && flammableHot && ctx.fire && sim.tick % 15 === 0) ctx.fire.igniteNear(hit.point, 0.25, 1);
  }

  /** heat voxels of one body around segment a-b; returns true if a flammable voxel got hot */
  private heatBody(ctx: ToolContext, body: VoxelBody, aw: V3, bw: V3): boolean {
    const sim = ctx.sim;
    const g = body.grid;
    const a = body.toLocal(aw), b = body.toLocal(bw);
    const r = this.radius / 0.1;
    const x0 = Math.floor(Math.min(a.x, b.x) - r), x1 = Math.floor(Math.max(a.x, b.x) + r);
    const y0 = Math.floor(Math.min(a.y, b.y) - r), y1 = Math.floor(Math.max(a.y, b.y) + r);
    const z0 = Math.floor(Math.min(a.z, b.z) - r), z1 = Math.floor(Math.max(a.z, b.z) + r);
    const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
    const ee = ex * ex + ey * ey + ez * ez || 1e-9;
    let hot = false;
    for (let z = Math.max(0, z0); z <= Math.min(g.sz - 1, z1); z++)
      for (let y = Math.max(0, y0); y <= Math.min(g.sy - 1, y1); y++)
        for (let x = Math.max(0, x0); x <= Math.min(g.sx - 1, x1); x++) {
          const p = g.data[g.idx(x, y, z)];
          if (!p) continue;
          const px = x + 0.5 - a.x, py = y + 0.5 - a.y, pz = z + 0.5 - a.z;
          const t = Math.max(0, Math.min(1, (px * ex + py * ey + pz * ez) / ee));
          const d = Math.hypot(px - ex * t, py - ey * t, pz - ez * t);
          if (d > r + 0.35) continue;
          // hottest at the tip of the flame
          const w = Math.max(0.15, 1 - d / (r + 0.5)) * (0.4 + 0.6 * t);
          const key = body.id * 1e7 + g.idx(x, y, z);
          const h = (this.heat.get(key) ?? 0) + w;
          this.heat.set(key, h);
          const need = MELT.get(matOf(p));
          if (need !== undefined && h >= need) {
            sim.removeVoxel(body, x, y, z);
            this.heat.delete(key);
            this.melted++;
          } else if (need === undefined && h > 40 && !isScorched(p)) {
            sim.setVoxel(body, x, y, z, scorch(p, x + y + z));
          }
          if (PAL_FLAMMABILITY[p] > 0 && h > 6) hot = true;
        }
    return hot;
  }

  override onDeselect(ctx: ToolContext): void {
    if (this.on) { this.on = false; emit(ctx.sim, 'tool:torch', { pos: ctx.player.eye, on: false }); }
    this.active = false;
  }
}
