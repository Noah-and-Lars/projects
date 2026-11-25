import { defineMod } from '../../src/mods/kit';
import { Tool, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import { add, fx } from './_util';

/**
 * Demolition saw: hold LMB on a wall and the blade cuts a thin vertical slot, sweeping up and down
 * around the aim point. Cuts soft and medium material, scores hard material slowly. Cut two slots and
 * a slab comes free.
 */
class SlotSaw extends Tool {
  readonly id = 'slot-saw';
  readonly name = 'Demolition Saw';
  override look = 'blowtorch';
  override hint = 'LMB hold to cut a slot';
  override ammo = 30 * 60;
  override maxAmmo = 30 * 60;
  /** blade reach (the blowtorch look reads `range`) */
  range = 3.2;
  /** half height of the slot (m) */
  half = 0.8;
  /** blade kerf radius (m) */
  kerf = 0.07;
  private t = 0;

  override get ammoLabel(): string { return this.ammo === Infinity ? '' : (Math.max(0, this.ammo) / 60).toFixed(1) + 's'; }

  update(ctx: ToolContext, input: ToolInput): void {
    const want = input.primary && this.hasAmmo(ctx);
    if (input.primaryPressed && !this.hasAmmo(ctx)) this.empty(ctx);
    this.active = want;
    if (!want) return;
    this.useAmmo(ctx);
    this.anim = Math.max(this.anim, 0.2);
    const { sim, player } = ctx;
    const eye = player.eye, dir = player.forward;
    this.t++;
    if (this.t % 2 !== 0) return;
    // the blade sweeps the slot top to bottom and back (triangle wave), cutting a few cm deeper each pass
    const n = 24, k = (this.t / 2) % (2 * n), s = (k < n ? k : 2 * n - k) / n * 2 - 1;
    const o = { x: eye.x, y: eye.y + s * this.half, z: eye.z };
    const hit = sim.raycast(o, dir, this.range);
    if (!hit) return;
    const hardTick = this.t % 8 === 0 ? this.kerf : 0;
    const res = sim.carve(add(hit.point, dir, 0.04), this.kerf + 0.02, this.kerf, hardTick, { cause: 'saw', rough: 0, silent: this.t % 6 !== 0 });
    if (this.t % 6 === 0) fx(sim, 'tool:impact', { tool: this.id, pos: hit.point, power: 0.08, kick: 0.1, broke: res.removed > 0 });
  }

  override onDeselect(): void { this.active = false; }
}

export default defineMod({
  id: 'slot-saw', name: 'Demolition Saw', category: 'tools', author: 'Wrecking Shift',
  description: 'A cut-off saw that slices a thin vertical slot through walls. Cut two slots side by side and the slab between them drops out.',
  tools: [{ id: 'slot-saw', create: () => new SlotSaw() }],
});
