import { DT } from '../sim';
import type { V3 } from '../vec';
import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit } from './util';

export interface Projectile {
  id: number;
  pos: V3;
  vel: V3;
  /** ticks alive */
  age: number;
}

/**
 * Rocket launcher: slow projectile with a little drop, simulated here (segment raycast every tick
 * so it never tunnels). Explodes (size 1.3) on impact or after 6 s.
 */
export class RocketLauncher extends Tool {
  readonly id = 'rocket';
  readonly name = 'Rocket Launcher';
  override hint = 'LMB fire';
  override ammo = 6;
  override maxAmmo = 6;
  speed = 28;
  gravity = 2;
  life = 6 * 60;
  size = 1.3;
  rate = 66;
  /** live rockets (render: position + velocity) */
  readonly projectiles: Projectile[] = [];
  private nextId = 1;

  update(ctx: ToolContext, input: ToolInput): void {
    if (!input.primaryPressed || this.cooldown > 0) return;
    if (!this.useAmmo(ctx)) { this.empty(ctx); return; }
    this.cooldown = this.rate;
    this.anim = 1;
    const { sim, player } = ctx;
    const eye = player.eye, f = player.forward;
    const pos = { x: eye.x + f.x * 0.3, y: eye.y + f.y * 0.3 - 0.05, z: eye.z + f.z * 0.3 };
    const vel = { x: f.x * this.speed, y: f.y * this.speed, z: f.z * this.speed };
    // first segment from the eye so point-blank walls are not skipped
    const p: Projectile = { id: this.nextId++, pos: { ...eye }, vel, age: 0 };
    this.projectiles.push(p);
    if (this.advance(ctx, p, pos)) this.projectiles.pop();
    emit(sim, 'tool:shot', { tool: this.id, pos: eye, dir: f });
    player.vel.x -= f.x * 1.2; player.vel.z -= f.z * 1.2;
  }

  /** move projectile to `to`, exploding on the first hit. returns true if it exploded */
  private advance(ctx: ToolContext, p: Projectile, to: V3): boolean {
    const sim = ctx.sim;
    const dx = to.x - p.pos.x, dy = to.y - p.pos.y, dz = to.z - p.pos.z;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-6) {
      const dir = { x: dx / len, y: dy / len, z: dz / len };
      const hit = sim.raycast(p.pos, dir, len);
      if (hit) {
        const at = { x: hit.point.x - dir.x * 0.05, y: hit.point.y - dir.y * 0.05, z: hit.point.z - dir.z * 0.05 };
        sim.explode(at, this.size);
        emit(sim, 'rocket:end', { id: p.id, pos: at });
        return true;
      }
    }
    p.pos = to;
    return false;
  }

  override save(): any { return this.projectiles.map((p) => ({ id: p.id, pos: { ...p.pos }, vel: { ...p.vel }, age: p.age })); }
  override load(_ctx: ToolContext, data: any): void { for (const p of data ?? []) this.projectiles.push(p); }

  override tick(ctx: ToolContext): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age++;
      p.vel.y -= this.gravity * DT;
      const to = { x: p.pos.x + p.vel.x * DT, y: p.pos.y + p.vel.y * DT, z: p.pos.z + p.vel.z * DT };
      if (this.advance(ctx, p, to)) { this.projectiles.splice(i, 1); continue; }
      if (p.age >= this.life || p.pos.y < -50) {
        this.projectiles.splice(i, 1);
        if (p.pos.y > -50) ctx.sim.explode(p.pos, this.size);
        emit(ctx.sim, 'rocket:end', { id: p.id, pos: p.pos });
      }
    }
  }
}
