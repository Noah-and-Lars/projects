/**
 * Shared helpers for the built-in tool mods in this folder (not a mod itself: no `.mod.ts` suffix).
 * Everything here is deterministic sim code.
 *
 * Presentation contracts by `look` (src/game/toolsModule.ts duck-types tools by their look):
 *   look 'rocket'   -> the tool must expose `projectiles: { id, pos, vel, age }[]` (smoke trails)
 *   look 'pipebomb' -> the tool must expose `live: { pos }[]` (fuse sparks)
 *   look 'blowtorch'-> the tool must expose `range` (flame)
 *   look 'cable' / 'plank' -> `ends()` / `preview` (only use these looks for TwoPointTool subclasses)
 */
import type { VoxelBody } from '../../src/sim/body';
import { DT, type Sim } from '../../src/sim/sim';
import type { ToolContext } from '../../src/sim/tools/tool';
import type { V3 } from '../../src/sim/vec';

export const add = (a: V3, b: V3, s = 1): V3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
export const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const len = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };

/** emit a custom tool event (same shape as the built-ins) */
export function fx(sim: Sim, name: string, data: Record<string, unknown>): void {
  sim.out.push({ type: 'custom', name, data });
}

/** view direction tilted up by `elev` radians (for lobbed projectiles) */
export function lofted(ctx: ToolContext, elev: number): V3 {
  const p = ctx.player;
  const pitch = Math.min(1.45, p.pitch + elev);
  const cp = Math.cos(pitch);
  return { x: -Math.sin(p.yaw) * cp, y: Math.sin(pitch), z: -Math.cos(p.yaw) * cp };
}

/** dynamic, non-vehicle bodies whose centre of mass lies within `r` of `c` (optionally inside a cone along `dir`) */
export function dynamicNear(sim: Sim, c: V3, r: number, dir?: V3, cosCone = -1): { body: VoxelBody; com: V3; d: number }[] {
  const out: { body: VoxelBody; com: V3; d: number }[] = [];
  for (const b of sim.bodiesNear(c, r)) {
    if (!b.dynamic || b.removed || b.kind === 'vehicle') continue;
    const w = b.rb.worldCom();
    const com = { x: w.x, y: w.y, z: w.z };
    const v = sub(com, c);
    const d = len(v);
    if (d > r) continue;
    if (dir && d > 1e-3 && (v.x * dir.x + v.y * dir.y + v.z * dir.z) / d < cosCone) continue;
    out.push({ body: b, com, d });
  }
  return out;
}

/** a ballistic shell (render: pos + vel; `id` keeps trails apart) */
export interface Shell { id: number; pos: V3; vel: V3; age: number; kind: number }

/**
 * A set of live ballistic projectiles: gravity, segment raycast per tick (no tunnelling), `onHit` when it
 * strikes something or its life runs out. Exposes `list` (assign it to a tool's `projectiles` for the
 * rocket look's smoke trail).
 */
export class ShellSet {
  readonly list: Shell[] = [];
  private nextId = 1;
  constructor(public gravity: number, public life: number, private onHit: (ctx: ToolContext, s: Shell, at: V3, hit: boolean) => void) {}

  launch(ctx: ToolContext, from: V3, vel: V3, kind = 0): void {
    const s: Shell = { id: this.nextId++, pos: { ...ctx.player.eye }, vel: { ...vel }, age: 0, kind };
    // first segment from the eye so point-blank walls are not skipped
    if (!this.advance(ctx, s, from)) this.list.push(s);
  }

  private advance(ctx: ToolContext, s: Shell, to: V3): boolean {
    const d = sub(to, s.pos);
    const l = len(d);
    if (l > 1e-6) {
      const dir = { x: d.x / l, y: d.y / l, z: d.z / l };
      const hit = ctx.sim.raycast(s.pos, dir, l);
      if (hit) { this.onHit(ctx, s, add(hit.point, dir, -0.05), true); return true; }
    }
    s.pos = to;
    return false;
  }

  tick(ctx: ToolContext): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.age++;
      s.vel.y -= this.gravity * DT;
      if (this.advance(ctx, s, add(s.pos, s.vel, DT))) { this.list.splice(i, 1); continue; }
      if (s.age >= this.life || s.pos.y < -50) {
        this.list.splice(i, 1);
        if (s.pos.y > -50) this.onHit(ctx, s, s.pos, false);
      }
    }
  }

  save(): any { return this.list.map((s) => ({ id: s.id, pos: { ...s.pos }, vel: { ...s.vel }, age: s.age, kind: s.kind })); }
  load(data: any): void {
    for (const s of data ?? []) {
      this.list.push({ id: s.id, pos: { ...s.pos }, vel: { ...s.vel }, age: s.age, kind: s.kind ?? 0 });
      this.nextId = Math.max(this.nextId, s.id + 1);
    }
  }
}

/** bodies this tool spawned: keeps at most `max`, drops the oldest (and bodies past `lifeTicks`) */
export class SpawnedBodies {
  readonly list: { body: VoxelBody; until: number }[] = [];
  constructor(public max: number, public lifeTicks: number) {}
  add(sim: Sim, body: VoxelBody): void {
    this.list.push({ body, until: sim.tick + this.lifeTicks });
    while (this.list.length > this.max) { const o = this.list.shift()!; if (!o.body.removed) sim.removeBody(o.body); }
  }
  private now = 0;
  tick(sim: Sim): void {
    this.now = sim.tick;
    if (sim.tick % 15 !== 0) return;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      if (o.body.removed) { this.list.splice(i, 1); continue; }
      if (sim.tick >= o.until || o.body.center().y < -40) { sim.removeBody(o.body); this.list.splice(i, 1); }
    }
  }
  save(): any { return this.list.filter((o) => !o.body.removed).map((o) => ({ id: o.body.id, left: o.until - this.now })); }
  load(sim: Sim, data: any): void {
    for (const d of data ?? []) { const b = sim.bodies.get(d.id); if (b) this.list.push({ body: b, until: sim.tick + Math.max(1, d.left) }); }
  }
}
