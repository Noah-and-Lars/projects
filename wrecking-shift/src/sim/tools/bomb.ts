import { MAT, pal } from '../materials';
import { VoxelGrid } from '../voxels';
import { tickCharges, type LiveCharge } from './pipebomb';
import { checkSticky, loadSticky, placeSticky, saveSticky, type Sticky } from './sticky';
import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit } from './util';

export function bombGrid(): VoxelGrid {
  const g = new VoxelGrid(4, 3, 4);
  g.fill(0, 0, 0, 4, 2, 4, pal(MAT.steel, 1));
  g.fill(1, 2, 1, 3, 3, 3, pal(MAT.steel, 4));
  g.set(1, 2, 1, pal(MAT.alarmbox, 0)); // blinking light
  g.fill(0, 1, 0, 4, 2, 1, pal(MAT.paintedmetal, 2)); // stripe
  return g;
}

/** Placed sticky charge: 3 s timer with beeps each second, explosion size 1.6. */
export class Bomb extends Tool {
  readonly id: string = 'bomb';
  readonly name: string = 'Bomb';
  override hint = 'LMB place';
  override ammo = 6;
  override maxAmmo = 6;
  range = 3;
  timer = 3 * 60;
  size = 1.6;
  readonly live: (LiveCharge & { stick: Sticky })[] = [];

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    const { sim, player } = ctx;
    const hit = sim.raycast(player.eye, player.forward, this.range);
    if (!hit) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = 30;
    this.anim = 1;
    const stick = placeSticky(sim, bombGrid(), hit, player.forward, { name: 'bomb', mass: 4, tags: ['tool', 'nograb'] });
    this.live.push({ body: stick.body, at: sim.tick + this.timer, size: this.size, pos: stick.body.center(), stick });
    emit(sim, 'tool:place', { tool: this.id, pos: hit.point });
    emit(sim, 'tool:beep', { pos: hit.point });
  }

  private saveTick = 0;
  override save(): any { return this.live.filter((c) => !c.body.removed).map((c) => ({ s: saveSticky(c.stick), left: c.at - this.saveTick, size: c.size })); }
  override load(ctx: ToolContext, data: any): void {
    for (const d of data ?? []) {
      const stick = loadSticky(ctx.sim, d.s, 4);
      if (stick) this.live.push({ body: stick.body, at: ctx.sim.tick + Math.max(1, d.left), size: d.size, pos: stick.body.center(), stick });
    }
  }

  override tick(ctx: ToolContext): void {
    this.saveTick = ctx.sim.tick;
    const sim = ctx.sim;
    if (sim.tick % 10 === 0) for (const c of this.live) checkSticky(sim, c.stick);
    tickCharges(ctx, this.live, (c) => {
      const left = c.at - sim.tick;
      // beep every second, faster in the last second
      if ((left % 60 === 0 && left > 0) || (left < 60 && left % 15 === 0 && left > 0)) emit(sim, 'tool:beep', { pos: c.pos, left });
    });
  }
}
