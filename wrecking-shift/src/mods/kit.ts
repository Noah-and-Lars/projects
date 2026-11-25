/**
 * Authoring helpers for mods (see mods/README.md). Everything here is deterministic sim code.
 *   props : vox() + place() — build a VoxelGrid with a callback and drop it at a bottom-centre point
 *   maps  : siteMap() — ground (flat or hilly) + bounds + sky in one call, your build() adds the content
 *   modes : rule templates (wreckQuota, checkpoints, collect, survive, demolish, topple) returning ModeRules
 */
import type { VoxelBody } from '../sim/body';
import { MAT } from '../sim/materials';
import { Heightmap, buildTerrain, fbm2 } from '../sim/levels/terrain';
import { groundTile } from '../sim/levels/testyard';
import { shaded } from '../sim/build';
import type { LevelInfo } from '../sim/levels/types';
import { Rng } from '../sim/rng';
import { DT, type Sim } from '../sim/sim';
import { VehicleSystem } from '../sim/vehicle';
import { qrot, qyaw, type V3 } from '../sim/vec';
import { VoxelGrid } from '../sim/voxels';
import type { MapDef, ModContext, ModeRules, ModeStatus } from './api';

export * from '../sim/build';
export { MAT, pal, matOf, PAL_FLAMMABILITY, PAL_HARDNESS } from '../sim/materials';
export { DT } from '../sim/sim';
export { qyaw, qrot } from '../sim/vec';
export { shootRay, spreadDir } from '../sim/tools/gun';
export { emit } from '../sim/tools/util';
export { VoxelGrid } from '../sim/voxels';
export { carBlueprint, type CarParams } from './vehicleKit';
export { Blue, slant, wheels } from '../sim/prefabs/vehicles';
export { defineMod } from './api';
export * as levelKit from '../sim/levels/kit';

// ------------------------------------------------------------------------------------------------ props

/** new grid filled by `fill` (voxel coords, 0.1 m) */
export function vox(sx: number, sy: number, sz: number, fill: (g: VoxelGrid) => void): VoxelGrid {
  const g = new VoxelGrid(sx, sy, sz);
  fill(g);
  g.recount();
  return g;
}

/**
 * Add a grid with its bottom centre at `pos`, rotated by `yaw` (player convention). Dynamic prop by default;
 * `static: true` anchors it to the world (its bottom layer is the anchor).
 */
export function place(sim: Sim, g: VoxelGrid, pos: V3, yaw: number, name: string, opts: { static?: boolean; tags?: string[] } = {}): VoxelBody {
  g.recount();
  const rot = qyaw(yaw);
  const half = qrot(rot, { x: (g.sx * 0.1) / 2, y: 0, z: (g.sz * 0.1) / 2 });
  const corner = { x: pos.x - half.x, y: pos.y, z: pos.z - half.z };
  const b = sim.addBody(g, corner, { dynamic: !opts.static, kind: opts.static ? 'world' : 'prop', name, rot, tags: opts.tags });
  if (opts.tags?.includes('explosive')) b.tags.add('explosive');
  return b;
}

// ------------------------------------------------------------------------------------------------ maps

export interface SiteOptions {
  id: string;
  title: string;
  blurb?: string;
  /** half size of the square site in metres (multiple of 12.8; default 25.6 -> 51.2 m square) */
  half?: number;
  /** ground surface material */
  ground?: number;
  /** rolling hills: amplitude in metres (0 = flat tiles, fastest) */
  hills?: number;
  sky?: LevelInfo['sky'];
  weather?: LevelInfo['weather'];
  water?: number | null;
  spawn?: V3;
  spawnYaw?: number;
  seed?: number;
  /** build the content; `h(x, z)` = ground height at a point */
  build(sim: Sim, rng: Rng, h: (x: number, z: number) => number, info: LevelInfo): void;
}

/** a square sandbox site: ground + bounds + sky; `o.build` places buildings, props, vehicles */
export function siteMap(o: SiteOptions): MapDef {
  return {
    id: o.id, title: o.title, blurb: o.blurb,
    site: { half: o.half ?? 25.6, ground: o.ground ?? MAT.grass, flat: !(o.hills && o.hills > 0) && o.water == null },
    build(sim: Sim): LevelInfo {
      const half = o.half ?? 25.6;
      const T = 25.6;
      const n = Math.max(1, Math.round((half * 2) / T));
      const x0 = -n * T / 2;
      let h: (x: number, z: number) => number = () => 0;
      if (o.hills && o.hills > 0) {
        const amp = o.hills, seed = o.seed ?? 3;
        const hm = new Heightmap((x, z) => amp * (fbm2(x * 0.02, z * 0.02, seed, 3) - 0.35));
        // flat pad around the spawn so the player starts on level ground
        const sp = o.spawn ?? { x: 0, y: 0, z: 0 };
        hm.addPad(sp.x - 4, sp.z - 4, sp.x + 4, sp.z + 4, 0, 6);
        const t = buildTerrain(sim, { x0, z0: x0, tilesX: n, tilesZ: n, heightmap: hm, waterLevel: o.water ?? null, seed, surface: o.ground != null ? () => o.ground! : undefined });
        h = (x, z) => t.heightAt(x, z);
      } else if (!(sim as any).compositeGround) {
        // (inside compositeMap the composite lays one ground for all sites)
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) groundTile(sim, x0 + i * T, x0 + j * T, 256, 256, o.ground ?? MAT.grass);
      }
      const ext = (n * T) / 2;
      const spawn = o.spawn ?? { x: 0, y: 0.05, z: 0 };
      const info: LevelInfo = {
        name: o.title,
        spawn: { x: spawn.x, y: Math.max(spawn.y, h(spawn.x, spawn.z) + 0.05), z: spawn.z },
        spawnYaw: o.spawnYaw ?? 0,
        bounds: { min: { x: -ext, y: -8, z: -ext }, max: { x: ext, y: 48, z: ext } },
        waterLevel: o.water ?? null,
        sunDir: { x: -0.45, y: -0.75, z: -0.5 },
        sky: o.sky ?? 'day',
        weather: o.weather ?? null,
        markers: { escape: { x: spawn.x, y: 0, z: spawn.z + 1.5 }, heli_start: { x: -ext - 40, y: 32, z: ext + 40 } },
      };
      o.build(sim, new Rng(o.seed ?? 7), h, info);
      return info;
    },
  };
}

// ------------------------------------------------------------------------------------------------ big maps

/**
 * A Sim seen through an offset: everything a builder adds lands shifted by (dx, dz). Vehicles go to the real
 * sim's vehicle system (so they are drivable), raycasts are shifted both ways. Build-time only.
 */
export function offsetSim(sim: Sim, dx: number, dz: number): Sim {
  const add = (p: V3): V3 => ({ x: p.x + dx, y: p.y, z: p.z + dz });
  const vehicles = {
    spawn: (_s: unknown, bp: any, x: number, y: number, z: number, yaw: number) => VehicleSystem.of(sim).spawn(sim, bp, x + dx, y, z + dz, yaw),
  };
  const own: Record<string | symbol, unknown> = {
    compositeGround: true,
    previewVehicles: new Proxy(vehicles, { get: (t, k) => (k in t ? (t as any)[k] : (VehicleSystem.of(sim) as any)[k]) }),
    addBody: (g: VoxelGrid, pos: V3, opts?: any) => sim.addBody(g, add(pos), opts),
    raycast: (o: V3, d: V3, max: number) => { const h = sim.raycast(add(o), d, max); return h ? { ...h, point: { x: h.point.x - dx, y: h.point.y, z: h.point.z - dz } } : h; },
  };
  return new Proxy(sim, {
    get: (t, k) => (k in own ? own[k] : (t as any)[k]),
    set: (t, k, v) => { (t as any)[k] = v; return true; },
  }) as Sim;
}

export interface CompositeOptions {
  id: string;
  title: string;
  blurb?: string;
  /** rows of site maps (from siteMap; flat ones), laid out on a grid with roads between them */
  cells: (MapDef & { site?: { half: number; ground: number; flat: boolean } })[][];
  /** grid pitch: cell size in metres (default 76.8) and road width (default 12.8) */
  cell?: number;
  road?: number;
  sky?: LevelInfo['sky'];
  /** extra content (vehicles on the roads...) in world coordinates; `roads` = road centre lines */
  extra?(sim: Sim, rng: Rng, roads: { x: number[]; z: number[] }): void;
}

/**
 * A big map made of several sites: each site is built in its own cell through `offsetSim`, the composite lays the
 * ground (each cell in its site's ground material) and asphalt roads between the cells.
 */
export function compositeMap(o: CompositeOptions): MapDef {
  return {
    id: o.id, title: o.title, blurb: o.blurb,
    build(sim: Sim): LevelInfo {
      const C = o.cell ?? 76.8, R = o.road ?? 12.8;
      const rows = o.cells.length, cols = Math.max(...o.cells.map((r) => r.length));
      const W = cols * C + (cols - 1) * R, D = rows * C + (rows - 1) * R;
      const x0 = -W / 2, z0 = -D / 2;
      const tile = (x: number, z: number, w: number, d: number, mat: number) => {
        // ground in pieces of at most 25.6 m (256 voxels)
        // thin ground (0.4 m: bedrock, 2 soil, surface) keeps big maps light; craters stop 0.3 m down
        for (let a = 0; a < w - 1e-6; a += 25.6) for (let b = 0; b < d - 1e-6; b += 25.6) {
          const nx = Math.round(Math.min(25.6, w - a) * 10), nz = Math.round(Math.min(25.6, d - b) * 10);
          const g = new VoxelGrid(nx, 4, nz);
          g.fill(0, 0, 0, nx, 1, nz, shaded(MAT.bedrock, 4));
          g.fill(0, 1, 0, nx, 3, nz, shaded(MAT.dirt, 2));
          g.fill(0, 3, 0, nx, 4, nz, shaded(mat, 2, 3));
          g.recount();
          const body = sim.addBody(g, { x: x + a, y: -0.4, z: z + b }, { name: 'ground' });
          body.noFracture = true; body.impactProof = true;
        }
      };
      const roads = { x: [] as number[], z: [] as number[] };
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const cx = x0 + i * (C + R), cz = z0 + j * (C + R);
        const site = o.cells[j][i];
        tile(cx, cz, C, C, site?.site?.ground ?? MAT.grass);
        if (site) site.build(offsetSim(sim, cx + C / 2, cz + C / 2));
      }
      // roads: vertical strips between columns (full length), horizontal strips between rows (between the strips)
      for (let i = 1; i < cols; i++) { const x = x0 + i * C + (i - 1) * R; roads.x.push(x + R / 2); tile(x, z0, R, D, MAT.asphalt); }
      for (let j = 1; j < rows; j++) {
        const z = z0 + j * C + (j - 1) * R; roads.z.push(z + R / 2);
        for (let i = 0; i < cols; i++) tile(x0 + i * (C + R), z, C, R, MAT.asphalt);
      }
      const spawn = { x: roads.x[Math.floor((roads.x.length - 1) / 2)] ?? 0, y: 0.05, z: roads.z[Math.floor((roads.z.length - 1) / 2)] ?? 0 };
      o.extra?.(sim, new Rng(17), roads);
      return {
        name: o.title, spawn, spawnYaw: 0,
        bounds: { min: { x: x0, y: -8, z: z0 }, max: { x: x0 + W, y: 56, z: z0 + D } },
        waterLevel: null, sunDir: { x: -0.45, y: -0.75, z: -0.5 }, sky: o.sky ?? 'day', weather: null,
        markers: { escape: { x: spawn.x, y: 0, z: spawn.z + 2 }, heli_start: { x: x0 - 40, y: 40, z: z0 + D + 40 } },
      };
    },
  };
}

// ------------------------------------------------------------------------------------------------ modes

const TICKS = Math.round(1 / DT);

/** shared clock / score bookkeeping for rule templates */
abstract class BaseRules implements ModeRules {
  score = 0;
  ticks = 0;
  ended = false;
  won = false;
  text = '';
  constructor(readonly seconds: number | null) {}
  get timeLeft(): number | null { return this.seconds == null ? null : Math.max(0, this.seconds - this.ticks / TICKS); }
  abstract start(ctx: ModContext): void;
  tick(ctx: ModContext): void {
    if (this.ended) return;
    this.ticks++;
    if (ctx.player.dead) { this.finish(false, 'Knocked out'); return; }
    this.step(ctx);
    if (!this.ended && this.seconds != null && this.ticks >= this.seconds * TICKS) this.timeUp(ctx);
  }
  protected abstract step(ctx: ModContext): void;
  protected timeUp(_ctx: ModContext): void { this.finish(false, 'Time is up'); }
  protected finish(won: boolean, text: string): void { if (this.ended) return; this.ended = true; this.won = won; this.text = text; }
  status(): ModeStatus { return { text: this.text, score: Math.round(this.score), timeLeft: this.timeLeft, ended: this.ended, won: this.won }; }
}

/** break `target` voxels of buildings / props / terrain within the time */
export function wreckQuota(o: { seconds: number; target: number; label?: string; filter?: (b: VoxelBody) => boolean }): ModeRules {
  return new (class extends BaseRules {
    private hook = (b: VoxelBody) => { if (!this.ended && (b.kind === 'world' || b.kind === 'prop') && (!o.filter || o.filter(b))) this.score++; };
    start(ctx: ModContext) { ctx.sim.onRemoved.push(this.hook); this.text = `${o.label ?? 'Break'} ${o.target} voxels`; }
    step(ctx: ModContext) {
      this.text = `${o.label ?? 'Wrecked'} ${Math.round(this.score)} / ${o.target}`;
      if (this.score >= o.target) { this.finish(true, `Quota met: ${Math.round(this.score)} voxels`); this.unhook(ctx); }
    }
    protected override timeUp(ctx: ModContext) { this.unhook(ctx); this.finish(false, `Time up at ${Math.round(this.score)} / ${o.target}`); }
    private unhook(ctx: ModContext) { const i = ctx.sim.onRemoved.indexOf(this.hook); if (i >= 0) ctx.sim.onRemoved.splice(i, 1); }
  })(o.seconds);
}

/** reach the points in order (on foot or driving) */
export function checkpoints(o: { points: V3[]; seconds: number; radius?: number }): ModeRules {
  return new (class extends BaseRules {
    next = 0;
    start() { this.text = `Checkpoint 1 / ${o.points.length}`; }
    step(ctx: ModContext) {
      const p = o.points[this.next], q = ctx.player.pos;
      const r = o.radius ?? 3;
      if (Math.hypot(p.x - q.x, p.z - q.z) < r && Math.abs(p.y - q.y) < 4) {
        this.next++; this.score += 100 + Math.round(this.timeLeft ?? 0);
        ctx.sim.out.push({ type: 'custom', name: 'mode:checkpoint', data: { index: this.next } });
        if (this.next >= o.points.length) { this.finish(true, 'Finish!'); return; }
      }
      const d = o.points[this.next];
      this.text = `Checkpoint ${this.next + 1} / ${o.points.length} — ${Math.round(Math.hypot(d.x - q.x, d.z - q.z))} m`;
    }
  })(o.seconds);
}

/** pick up glowing tokens by walking into them (spawned at `spots`) */
export function collect(o: { spots: V3[]; seconds: number; name?: string; spawn: (sim: Sim, p: V3, i: number) => VoxelBody }): ModeRules {
  return new (class extends BaseRules {
    items: { body: VoxelBody; taken: boolean }[] = [];
    start(ctx: ModContext) { this.items = o.spots.map((p, i) => ({ body: o.spawn(ctx.sim, p, i), taken: false })); this.text = `${o.name ?? 'Tokens'} 0 / ${o.spots.length}`; }
    step(ctx: ModContext) {
      const q = ctx.player.pos;
      let got = 0;
      for (const it of this.items) {
        if (!it.taken) {
          const b = it.body;
          const t = b.removed ? null : b.rb.translation();
          if (t) {
            const c = { x: t.x + b.grid.sx * 0.05, y: t.y, z: t.z + b.grid.sz * 0.05 };
            if (Math.hypot(c.x - q.x, c.z - q.z) < 1.4 && Math.abs(c.y - q.y) < 2.2) {
              it.taken = true; this.score += 100; ctx.sim.removeBody(b);
              ctx.sim.out.push({ type: 'custom', name: 'mode:pickup', data: {} });
            }
          } else { it.taken = true; } // destroyed tokens are lost (no points)
        }
        if (it.taken) got++;
      }
      this.text = `${o.name ?? 'Tokens'} ${Math.round(this.score / 100)} / ${o.spots.length}`;
      if (got === this.items.length) { this.score += Math.round((this.timeLeft ?? 0) * 10); this.finish(this.score > 0, 'All collected'); }
    }
  })(o.seconds);
}

/** stay alive while `hazard` runs every tick */
export function survive(o: { seconds: number; hazard: (ctx: ModContext, t: number) => void; label?: string }): ModeRules {
  return new (class extends BaseRules {
    start() { this.text = o.label ?? 'Survive'; }
    step(ctx: ModContext) { o.hazard(ctx, this.ticks); this.score = Math.floor(this.ticks / TICKS) * 10; this.text = `${o.label ?? 'Survive'} — ${Math.ceil(this.timeLeft ?? 0)} s`; }
    protected override timeUp() { this.finish(true, 'Survived!'); }
  })(o.seconds);
}

/** destroy `fraction` of the voxels of bodies tagged `tag` */
export function demolish(o: { tag: string; fraction: number; seconds: number; label?: string }): ModeRules {
  return new (class extends BaseRules {
    total = 0; gone = 0;
    private hook = (b: VoxelBody) => { if (b.tags.has(o.tag) || b.tags.has(o.tag + ':piece')) this.gone++; };
    start(ctx: ModContext) {
      for (const b of ctx.sim.bodies.values()) if (b.tags.has(o.tag)) this.total += b.grid.count;
      ctx.sim.onRemoved.push(this.hook);
    }
    step(ctx: ModContext) {
      // pieces that fall off a tagged body count as demolished
      let left = 0;
      for (const b of ctx.sim.bodies.values()) if (b.tags.has(o.tag) && !b.dynamic) left += b.grid.count;
      const frac = this.total ? 1 - left / this.total : 1;
      this.score = Math.round(frac * 1000);
      this.text = `${o.label ?? 'Demolish'} ${Math.round(frac * 100)} % / ${Math.round(o.fraction * 100)} %`;
      if (frac >= o.fraction) { this.score += Math.round((this.timeLeft ?? 0) * 5); this.finish(true, 'Demolished!'); const i = ctx.sim.onRemoved.indexOf(this.hook); if (i >= 0) ctx.sim.onRemoved.splice(i, 1); }
    }
  })(o.seconds);
}

/** knock every body tagged `tag` over / off its base (its highest point drops below `below` m, or it is gone) */
export function topple(o: { tag: string; below: number; seconds: number; label?: string }): ModeRules {
  return new (class extends BaseRules {
    total = 0;
    tops = new Map<number, number>();
    start(ctx: ModContext) { for (const b of ctx.sim.bodies.values()) if (b.tags.has(o.tag)) this.total++; }
    step(ctx: ModContext) {
      let standing = 0;
      for (const b of ctx.sim.bodies.values()) {
        if (!b.tags.has(o.tag) || b.removed) continue;
        if (!b.dynamic) {
          // anchored: standing while voxels remain above the line (its base always stays)
          if (this.ticks % 15 === 1 || !this.tops.has(b.id)) this.tops.set(b.id, topVoxel(b));
          const top = b.toWorld({ x: 0, y: this.tops.get(b.id)! + 1, z: 0 }).y;
          if (top > o.below) standing++;
          continue;
        }
        const t = b.rb.translation();
        // top of the body's box in world space, roughly: centre of mass height + half height when upright
        const up = b.toWorld({ x: b.grid.sx / 2, y: b.grid.sy, z: b.grid.sz / 2 });
        if (up.y > o.below && t.y > o.below - 5) standing++;
      }
      const down = this.total - standing;
      this.score = down * 100;
      this.text = `${o.label ?? 'Knocked over'} ${down} / ${this.total}`;
      if (this.total > 0 && standing === 0) { this.score += Math.round((this.timeLeft ?? 0) * 10); this.finish(true, 'All down!'); }
    }
  })(o.seconds);
}

/** highest occupied voxel layer of a body (-1 = empty) */
function topVoxel(b: VoxelBody): number {
  const g = b.grid;
  for (let y = g.sy - 1; y >= 0; y--) for (let z = 0; z < g.sz; z++) for (let x = 0; x < g.sx; x++) if (g.data[g.idx(x, y, z)]) return y;
  return -1;
}

/** deterministic ring of points around a centre (for checkpoint / collect layouts) */
export function ring(c: V3, r: number, n: number, y = 0, phase = 0): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) { const a = phase + (i / n) * Math.PI * 2; out.push({ x: c.x + Math.cos(a) * r, y, z: c.z + Math.sin(a) * r }); }
  return out;
}

// ------------------------------------------------------------------------------------------------ tools

import type { Tool } from '../sim/tools/tool';
import type { ToolDef } from './api';
export * as tools from '../sim/tools';

/**
 * A tool that is a tuned variant of a built-in one: `variant(Shotgun, { id: 'x', name: 'X', pellets: 16 })`.
 * It looks and sounds like the base tool (`look`), with your numbers.
 */
export function variant<T extends Tool>(Base: new () => T, o: { id: string; name: string; hint?: string } & Partial<Omit<T, 'id' | 'name'>>): ToolDef {
  return {
    id: o.id,
    create: () => {
      const t = new Base();
      const look = t.look ?? t.id;
      Object.assign(t, o);
      t.look = look;
      if (o.maxAmmo != null && o.ammo == null) t.ammo = o.maxAmmo;
      return t;
    },
  };
}
