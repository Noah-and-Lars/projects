import { defineMod } from '../../src/mods/kit';
import { shootRay, spreadDir } from '../../src/sim/tools/gun';
import { Tool, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import { fx } from './_util';

/** Fully automatic nail gun: hold LMB for a stream of small, short-range nails that nibble soft material. */
class NailDriver extends Tool {
  readonly id = 'nail-driver';
  readonly name = 'Nail Driver';
  override look = 'pistol';
  override hint = 'LMB hold to fire';
  override ammo = 90;
  override maxAmmo = 90;
  range = 14;
  rate = 5;

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primary || this.cooldown > 0) return;
    if (!this.useAmmo(ctx)) { if (input.primaryPressed) this.empty(ctx); return; }
    this.cooldown = this.rate;
    this.anim = 0.6;
    const eye = ctx.player.eye;
    const dir = spreadDir(ctx, ctx.player.forward, 0.025);
    const hit = shootRay(ctx, eye, dir, { range: this.range, rSoft: 0.11, rMed: 0.04, impulse: 15, falloff: 0.6, cause: 'bullet' });
    fx(ctx.sim, 'tool:shot', { tool: this.id, pos: eye, dir, hit: hit ? hit.point : null });
  }
}

export default defineMod({
  id: 'nail-driver', name: 'Nail Driver', category: 'tools', author: 'Wrecking Shift',
  description: 'A fully automatic nail gun. Short range and weak per shot, but a held trigger chews through boards fast.',
  tools: [{ id: 'nail-driver', create: () => new NailDriver() }],
});
