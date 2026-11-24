import type { RayHit } from '../sim';
import type { V3 } from '../vec';
import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit } from './util';

export interface Preview {
  a: V3;
  b: V3;
  /** length between the points (m) */
  len: number;
  /** a second click here would place it */
  valid: boolean;
}

/**
 * Click a first point, click a second point (planks, cables). A second click that is out of range or
 * misses cancels. `preview` is updated every tick while the first point is set (render: ghost line).
 */
export abstract class TwoPointTool extends Tool {
  reach = 5;
  maxLen = 4;
  minLen = 0.3;
  /** first click (null = none yet) */
  first: RayHit | null = null;
  firstPoint: V3 | null = null;
  /** first point in the first body's voxel space (follows moving bodies) */
  private firstLocal: V3 | null = null;
  preview: Preview | null = null;

  protected abstract place(ctx: ToolContext, a: RayHit, b: RayHit): boolean;
  /** can these two hits be connected (besides the length check)? */
  protected accepts(_a: RayHit, _b: RayHit): boolean { return true; }

  update(ctx: ToolContext, input: ToolInput): void {
    const { sim, player } = ctx;
    const eye = player.eye, f = player.forward;
    if (this.first && (this.first.body.removed || !this.first.body.grid.get(this.first.vx, this.first.vy, this.first.vz))) this.cancel();
    const hit = (this.first || input.primaryPressed) ? sim.raycast(eye, f, this.reach) : null;
    if (this.first && this.firstLocal) this.firstPoint = this.first.body.toWorld(this.firstLocal);
    if (this.first && this.firstPoint) {
      const b = hit ? hit.point : { x: eye.x + f.x * this.reach, y: eye.y + f.y * this.reach, z: eye.z + f.z * this.reach };
      const a = this.firstPoint;
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      this.preview = { a, b, len, valid: !!hit && len <= this.maxLen && len >= this.minLen && this.accepts(this.first, hit) && this.hasAmmo(ctx) };
    } else this.preview = null;
    if (!input.primaryPressed || this.cooldown > 0) return;
    if (!this.first) {
      if (!hit) return;
      if (!this.hasAmmo(ctx)) { this.empty(ctx); return; }
      this.first = hit;
      this.firstPoint = { ...hit.point };
      this.firstLocal = hit.body.toLocal(hit.point);
      this.anim = 0.5;
      emit(sim, 'tool:place', { tool: this.id, pos: hit.point, first: true });
      return;
    }
    const first = { ...this.first, point: this.firstPoint! };
    const ok = this.preview?.valid && hit;
    this.cancel();
    this.cooldown = 10;
    if (!ok || !hit) { emit(sim, 'tool:empty', { tool: this.id, reason: 'invalid' }); return; }
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    if (this.place(ctx, first, hit)) {
      this.anim = 1;
      emit(sim, 'tool:place', { tool: this.id, pos: hit.point });
    } else if (this.ammo !== Infinity && !ctx.infiniteAmmo) this.ammo++;
  }

  cancel(): void {
    this.first = null;
    this.firstPoint = null;
    this.firstLocal = null;
    this.preview = null;
  }

  override onDeselect(): void { this.cancel(); }
}
