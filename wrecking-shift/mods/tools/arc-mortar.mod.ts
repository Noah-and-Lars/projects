import { defineMod } from '../../src/mods/kit';
import { Tool, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import { add, fx, lofted, ShellSet, type Shell } from './_util';

/**
 * Hand mortar: lobs a shell in a high arc (launched well above the crosshair), so it drops over walls
 * onto whatever is behind them. Explodes on impact.
 */
class ArcMortar extends Tool {
  readonly id = 'arc-mortar';
  readonly name = 'Arc Mortar';
  override look = 'rocket';
  override hint = 'LMB lob shell';
  override ammo = 8;
  override maxAmmo = 8;
  speed = 13;
  /** launch angle above the view direction (rad) */
  elev = 0.6;
  size = 1.3;
  rate = 70;
  private shells = new ShellSet(12, 6 * 60, (ctx, _s, at) => { ctx.sim.explode(at, this.size); fx(ctx.sim, 'tool:impact', { tool: this.id, pos: at, power: 0.4, kick: 0 }); });
  /** live shells (the rocket look draws trails for `projectiles`) */
  get projectiles(): Shell[] { return this.shells.list; }

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = this.rate;
    this.anim = 1;
    const { sim, player } = ctx;
    const d = lofted(ctx, this.elev);
    const v = { x: d.x * this.speed, y: d.y * this.speed, z: d.z * this.speed };
    this.shells.launch(ctx, add(player.eye, d, 0.3), v);
    fx(sim, 'tool:shot', { tool: this.id, pos: player.eye, dir: d });
  }

  override tick(ctx: ToolContext): void { this.shells.tick(ctx); }
  override save(): any { return this.shells.save(); }
  override load(_ctx: ToolContext, data: any): void { this.shells.load(data); }
}

export default defineMod({
  id: 'arc-mortar', name: 'Arc Mortar', category: 'tools', author: 'Wrecking Shift',
  description: 'A shoulder mortar that lobs shells in a steep arc. Drop rounds over a wall onto the roof behind it.',
  tools: [{ id: 'arc-mortar', create: () => new ArcMortar() }],
});
