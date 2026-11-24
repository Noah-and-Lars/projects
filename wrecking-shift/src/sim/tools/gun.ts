import type { RayHit, Sim } from '../sim';
import type { V3 } from '../vec';
import type { ToolContext } from './tool';

export interface ShotParams {
  range: number;
  /** carve radii (soft, medium) — guns never break hard */
  rSoft: number;
  rMed: number;
  /** impulse (N·s) on dynamic bodies */
  impulse: number;
  /** radius multiplier at max range (linear falloff from 1 at 0 m) */
  falloff?: number;
  cause: string;
}

type ShotListener = (origin: V3, dir: V3, dist: number) => void;
const shotListeners = new WeakMap<Sim, ShotListener[]>();
/** be told about every bullet / pellet fired in this sim (ropes get cut by shots) */
export function onShot(sim: Sim, fn: ShotListener): void {
  let l = shotListeners.get(sim);
  if (!l) shotListeners.set(sim, (l = []));
  l.push(fn);
}

/** one hitscan bullet / pellet: carve at the hit, push dynamic bodies. Returns the hit. */
export function shootRay(ctx: ToolContext, origin: V3, dir: V3, p: ShotParams): RayHit | null {
  const { sim } = ctx;
  const hit = sim.raycast(origin, dir, p.range);
  const ls = shotListeners.get(sim);
  if (ls) for (const f of ls) f(origin, dir, hit ? hit.dist : p.range);
  if (!hit) return null;
  const f = 1 - (1 - (p.falloff ?? 1)) * Math.min(1, hit.dist / p.range);
  const c = { x: hit.point.x + dir.x * 0.05, y: hit.point.y + dir.y * 0.05, z: hit.point.z + dir.z * 0.05 };
  const body = hit.body;
  sim.carve(c, p.rSoft * f, p.rMed * f, 0, { cause: p.cause, rough: 0.3 });
  if (body.dynamic && !body.removed) {
    const j = p.impulse * f;
    body.rb.applyImpulseAtPoint({ x: dir.x * j, y: dir.y * j, z: dir.z * j }, hit.point, true);
  }
  return hit;
}

/** random direction within a cone of half-angle `spread` radians around `dir` (deterministic via sim.rng) */
export function spreadDir(ctx: ToolContext, dir: V3, spread: number): V3 {
  const rng = ctx.sim.rng;
  const up = Math.abs(dir.y) < 0.95 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let ux = up.y * dir.z - up.z * dir.y, uy = up.z * dir.x - up.x * dir.z, uz = up.x * dir.y - up.y * dir.x;
  const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const vx = dir.y * uz - dir.z * uy, vy = dir.z * ux - dir.x * uz, vz = dir.x * uy - dir.y * ux;
  const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * spread;
  const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
  const x = dir.x + ux * ca + vx * sa, y = dir.y + uy * ca + vy * sa, z = dir.z + uz * ca + vz * sa;
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
}
