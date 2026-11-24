import type { VoxelBody } from './body';
import { DT } from './sim';
import type { ToolContext, ToolInput } from './tools/tool';
import { emit } from './tools/util';
import { clamp, vlen, vsub, type V3 } from './vec';

/**
 * Grab / carry / throw (not a tool: works with any selected tool).
 * Hold RMB on a dynamic body within `reach` to hold it in front of the camera; the wheel changes
 * the hold distance; LMB while holding throws it. Bodies above `massLimit` are only dragged weakly.
 * Deterministic sim code (velocity-driven spring, no randomness).
 */
export class Grabber {
  reach = 3;
  massLimit = 250;
  minDist = 1;
  maxDist = 3;
  /** held body (null = nothing) */
  body: VoxelBody | null = null;
  /** hold distance from the eye to the body's centre of mass (metres) */
  dist = 1.8;
  /** a grabbable body is under the crosshair (HUD hint) */
  hover: VoxelBody | null = null;
  /** LMB is swallowed until released (after a throw) */
  private swallow = false;
  /** heavy = dragged weakly */
  heavy = false;

  get holding(): boolean { return !!this.body; }

  canGrab(b: VoxelBody): boolean {
    return b.dynamic && !b.removed && b.kind !== 'vehicle' && !b.tags.has('nograb') && b.mass > 0;
  }

  release(): void {
    this.body = null;
    this.heavy = false;
  }

  /**
   * Called by the ToolBelt every tick before the selected tool. Returns true when the primary
   * button was consumed (throwing / holding) so the tool must not fire.
   */
  update(ctx: ToolContext, input: ToolInput): boolean {
    const { sim, player } = ctx;
    if (this.swallow) {
      if (!input.primary) this.swallow = false;
    }
    const eye = player.eye, fwd = player.forward;
    if (this.body && (this.body.removed || !input.secondary)) this.release();

    if (!this.body) {
      const hit = sim.raycast(eye, fwd, this.reach);
      this.hover = hit && this.canGrab(hit.body) ? hit.body : null;
      if (input.secondary && this.hover) {
        this.body = this.hover;
        this.heavy = this.body.rb.mass() > this.massLimit;
        const com = this.body.rb.worldCom();
        this.dist = clamp(vlen(vsub(com, eye)), Math.max(this.minDist, this.body.radius * 0.6 + 0.45), this.maxDist);
        emit(sim, 'grab:start', { mass: this.body.rb.mass(), heavy: this.heavy });
      }
    } else this.hover = null;

    const b = this.body;
    if (!b) return this.swallow;

    if (input.scroll) this.dist = clamp(this.dist - input.scroll * 0.25, Math.max(this.minDist, b.radius * 0.6 + 0.45), this.maxDist);
    const rb = b.rb;
    const m = rb.mass();
    const com = rb.worldCom();
    const target: V3 = { x: eye.x + fwd.x * this.dist, y: eye.y + fwd.y * this.dist, z: eye.z + fwd.z * this.dist };
    const err = vsub(target, com);
    const errLen = vlen(err);
    // lost it (stuck behind something / pulled away)
    if (errLen > 2.2 || vlen(vsub(com, eye)) > this.reach + 1.5) {
      this.release();
      emit(sim, 'grab:drop', {});
      return this.swallow;
    }
    rb.wakeUp();
    const pv = player.vel;
    if (!this.heavy) {
      // velocity spring: converge on the hold point within ~0.1 s, follow the player's motion
      const k = 14, maxV = 14;
      let vx = err.x * k + pv.x, vy = err.y * k + pv.y * 0.5, vz = err.z * k + pv.z;
      const vl = Math.hypot(vx, vy, vz);
      if (vl > maxV) { vx *= maxV / vl; vy *= maxV / vl; vz *= maxV / vl; }
      const v = rb.linvel();
      const a = 0.6; // blend (avoids jitter when resting against walls)
      rb.setLinvel({ x: v.x + (vx - v.x) * a, y: v.y + (vy - v.y) * a, z: v.z + (vz - v.z) * a }, true);
      const w = rb.angvel();
      rb.setAngvel({ x: w.x * 0.8, y: w.y * 0.8, z: w.z * 0.8 }, true);
    } else {
      // too heavy: weak capped pull (drag along the ground), partly counters gravity
      const F = 2600;
      const s = Math.min(1, errLen / 0.5);
      const dir = errLen > 1e-4 ? { x: err.x / errLen, y: err.y / errLen, z: err.z / errLen } : { x: 0, y: 0, z: 0 };
      rb.applyImpulse({ x: dir.x * F * s * DT, y: dir.y * F * s * DT, z: dir.z * F * s * DT }, true);
    }

    if (input.primaryPressed && !this.swallow) {
      // throw: lighter things fly further
      const dv = this.heavy ? 1.5 : clamp(900 / Math.max(m, 1), 3.5, 12);
      rb.applyImpulse({ x: fwd.x * dv * m, y: (fwd.y + 0.12) * dv * m, z: fwd.z * dv * m }, true);
      emit(sim, 'tool:throw', { tool: 'grab' });
      this.release();
      this.swallow = true;
      return true;
    }
    return true;
  }
}
