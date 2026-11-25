/**
 * Shared helpers for the built-in map, mode and rule-tweak mods (not a mod itself: no `.mod.ts` suffix, so the
 * registry skips it). Everything here is deterministic sim code.
 */
import type { VoxelBody } from '../../src/sim/body';
import type { Sim } from '../../src/sim/sim';
import { DT } from '../../src/sim/sim';
import { Rng } from '../../src/sim/rng';
import { Heightmap, buildTerrain } from '../../src/sim/levels/terrain';
import type { LevelInfo } from '../../src/sim/levels/types';
import type { V3 } from '../../src/sim/vec';
import type { MapDef, ModContext, ModeRules, ModeStatus } from '../../src/mods/api';
import { MAT, VoxelGrid, box, bricks, clear, cylinderY, flat, levelKit, pal, planks, shaded, sphere, type PalFn } from '../../src/mods/kit';

export const TPS = Math.round(1 / DT);

// ------------------------------------------------------------------------------------------------ terrain maps

export interface TerrainSiteOptions {
  id: string;
  title: string;
  blurb?: string;
  /** half size in metres (multiple of 12.8) */
  half?: number;
  /** natural ground height in metres */
  height: (x: number, z: number) => number;
  /** flattened rectangles: [x0, z0, x1, z1, y, blend, surface?] */
  pads?: [number, number, number, number, number, number, number?][];
  /** surface material for a column (default: grass, sand by the water, rock on steep slopes) */
  surface?: (x: number, z: number, h: number, slope: number) => number;
  water?: number | null;
  sky?: LevelInfo['sky'];
  weather?: LevelInfo['weather'];
  spawn: { x: number; z: number };
  spawnYaw?: number;
  seed?: number;
  build(sim: Sim, rng: Rng, h: (x: number, z: number) => number, info: LevelInfo): void;
}

/** like kit.siteMap, but with a hand-written height function (lakes, pits, valleys) */
export function terrainSite(o: TerrainSiteOptions): MapDef {
  return {
    id: o.id, title: o.title, blurb: o.blurb,
    build(sim: Sim): LevelInfo {
      const half = o.half ?? 25.6;
      const T = 25.6;
      const n = Math.max(1, Math.round((half * 2) / T));
      const x0 = -n * T / 2;
      const hm = new Heightmap(o.height);
      for (const p of o.pads ?? []) hm.addPad(p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
      const t = buildTerrain(sim, { x0, z0: x0, tilesX: n, tilesZ: n, heightmap: hm, waterLevel: o.water ?? null, seed: o.seed ?? 5, surface: o.surface });
      const h = (x: number, z: number) => t.heightAt(x, z);
      const ext = (n * T) / 2;
      const sy = h(o.spawn.x, o.spawn.z) + 0.05;
      const info: LevelInfo = {
        name: o.title,
        spawn: { x: o.spawn.x, y: sy, z: o.spawn.z },
        spawnYaw: o.spawnYaw ?? 0,
        bounds: { min: { x: -ext, y: -10, z: -ext }, max: { x: ext, y: 48, z: ext } },
        waterLevel: o.water ?? null,
        sunDir: { x: -0.45, y: -0.75, z: -0.5 },
        sky: o.sky ?? 'day',
        weather: o.weather ?? null,
        markers: { escape: { x: o.spawn.x, y: sy, z: o.spawn.z + 1.5 }, heli_start: { x: -ext - 40, y: 32, z: ext + 40 } },
      };
      o.build(sim, new Rng(o.seed ?? 7), h, info);
      return info;
    },
  };
}

// ------------------------------------------------------------------------------------------------ placement

/** lowest / highest ground under a rectangle (corners + centre) */
export function groundRange(h: (x: number, z: number) => number, x: number, z: number, w: number, d: number): [number, number] {
  const ys = [h(x, z), h(x + w, z), h(x, z + d), h(x + w, z + d), h(x + w / 2, z + d / 2)];
  return [Math.min(...ys), Math.max(...ys)];
}

/**
 * Level a rectangle (metres, min corner x/z) on sloping ground: a hollow stone plinth from below the lowest point
 * up to the highest one. Returns the plinth top (the ground level to build on).
 */
export function plinth(sim: Sim, h: (x: number, z: number) => number, x: number, z: number, w: number, d: number, mat: number = MAT.rock): number {
  const [lo, hi] = groundRange(h, x, z, w, d);
  if (hi - lo < 0.15) return hi;
  const sx = Math.round(w * 10), sz = Math.round(d * 10), sy = Math.round((hi - lo) * 10) + 5;
  const g = new VoxelGrid(sx, sy, sz);
  const f = mat === MAT.brick ? bricks(MAT.brick, 2) : shaded(mat, 4, 3);
  box(g, 0, 0, 0, sx, sy, 3, f); box(g, 0, 0, sz - 3, sx, sy, sz, f);
  box(g, 0, 0, 0, 3, sy, sz, f); box(g, sx - 3, 0, 0, sx, sy, sz, f);
  box(g, 0, sy - 3, 0, sx, sy, sz, f);
  levelKit.addStatic(sim, g, x, hi - sy * 0.1, z, 'plinth');
  return hi;
}

/** first surface below (x, z) from `top` down (or `fallback`) */
export function groundAt(sim: Sim, x: number, z: number, top = 40, fallback = 0): number {
  const hit = sim.raycast({ x, y: top, z }, { x: 0, y: -1, z: 0 }, top + 10);
  return hit ? hit.point.y : fallback;
}

/** a 1-voxel paving / road slab lying on flat ground (min corner x/z, size w/d metres) */
export function slab(sim: Sim, x: number, y: number, z: number, w: number, d: number, p: PalFn | number, name = 'paving'): VoxelBody {
  const g = new VoxelGrid(Math.round(w * 10), 1, Math.round(d * 10));
  box(g, 0, 0, 0, g.sx, 1, g.sz, p);
  return levelKit.addStatic(sim, g, x, y, z, name);
}

// ------------------------------------------------------------------------------------------------ prefabs

/** gutted car shell (static scrap): rusty sheet metal body, no glass, flat tyres */
export function carWreck(sim: Sim, x: number, y: number, z: number, alongZ = false, seed = 0, crushed = false): VoxelBody {
  const L = 40, W = 18, H = crushed ? 8 : 14;
  const g = alongZ ? new VoxelGrid(W, H, L) : new VoxelGrid(L, H, W);
  const set = (a: number, yy: number, b: number, p: number) => (alongZ ? g.set(b, yy, a, p) : g.set(a, yy, b, p));
  const paint = [MAT.paintedmetal, MAT.plastic, MAT.sheetmetal, MAT.fabric][seed & 3];
  for (let a = 0; a < L; a++) for (let b = 0; b < W; b++) {
    const edge = b === 0 || b === W - 1 || a === 0 || a === L - 1;
    const cabin = a > 10 && a < 30;
    const top = crushed ? H - 1 : cabin ? H - 1 : 7;
    for (let yy = 2; yy <= top; yy++) {
      const rusty = ((a * 7 + yy * 3 + b * 5 + seed * 11) % 9) < 4;
      const p = rusty ? pal(MAT.sheetmetal, 6 + ((a + yy) & 1)) : pal(paint, (a + b + seed) % 5);
      if (yy === 2 || yy === top || edge) {
        // window holes in the cabin sides
        if (!crushed && cabin && yy > 8 && yy < top && (b === 0 || b === W - 1) && a % 9 > 1) continue;
        set(a, yy, b, p);
      }
    }
  }
  for (const a of [5, 6, 7, 32, 33, 34]) for (const b of [0, 1, W - 2, W - 1]) for (let yy = 0; yy < 3; yy++) set(a, yy, b, pal(MAT.rubber, 2));
  return levelKit.addStatic(sim, g, x, y - 0.05, z, 'car wreck', ['scrap']);
}

/** round farm silo: corrugated metal drum with a domed cap and a ladder */
export function silo(sim: Sim, x: number, y: number, z: number, r = 18, h = 110, mat: number = MAT.sheetmetal): VoxelBody {
  const S = r * 2 + 4, c = S / 2;
  const g = new VoxelGrid(S, h + r + 4, S);
  cylinderY(g, c, c, r, 0, 3, shaded(MAT.concrete, 3, 1));
  cylinderY(g, c, c, r, 3, h, (xx, yy, zz) => pal(mat, ((Math.atan2(zz - c, xx - c) * 6) & 1) * 2 + ((yy / 20) | 0) % 2), 2);
  for (let i = 0; i < r; i++) cylinderY(g, c, c, Math.sqrt(r * r - i * i), h + i, h + i + 1, shaded(MAT.paintedmetal, 4, 2), i < r - 2 ? 2 : 0);
  for (let yy = 3; yy < h; yy++) if (yy % 4 === 0) box(g, c - 2, yy, 0, c + 2, yy + 1, 2, flat(MAT.steel)); else { g.set(c - 2, yy, 0, pal(MAT.steel, 2)); g.set(c + 1, yy, 0, pal(MAT.steel, 2)); }
  clear(g, c - 4, 3, S - 4, c + 4, 23, S); // hatch at the base
  return levelKit.addStatic(sim, g, x - c * 0.1, y - 0.3, z - c * 0.1, 'silo', ['silo']);
}

/** glasshouse: steel frame, glass walls, glass gable roof, a door on the short side. w x d in voxels */
export function glasshouse(sim: Sim, x: number, y: number, z: number, w = 120, d = 60, wallH = 26, seed = 0): VoxelBody {
  const roofH = Math.ceil(d / 2);
  const g = new VoxelGrid(w, wallH + roofH + 4, d);
  const steel = flat(MAT.steel), glass = pal(MAT.glass, 2);
  box(g, 0, 0, 0, w, 3, d, shaded(MAT.concrete, 4, seed));
  box(g, 0, 3, 0, w, 6, 1, bricks(MAT.brick, seed)); box(g, 0, 3, d - 1, w, 6, d, bricks(MAT.brick, seed));
  box(g, 0, 3, 0, 1, 6, d, bricks(MAT.brick, seed)); box(g, w - 1, 3, 0, w, 6, d, bricks(MAT.brick, seed));
  box(g, 0, 6, 0, w, wallH, 1, glass); box(g, 0, 6, d - 1, w, wallH, d, glass);
  box(g, 0, 6, 0, 1, wallH, d, glass); box(g, w - 1, 6, 0, w, wallH, d, glass);
  for (let a = 0; a < w; a += 12) { const xx = Math.min(a, w - 1); box(g, xx, 3, 0, xx + 1, wallH, 1, steel); box(g, xx, 3, d - 1, xx + 1, wallH, d, steel); }
  for (let b = 0; b < d; b += 12) { const zz = Math.min(b, d - 1); box(g, 0, 3, zz, 1, wallH, zz + 1, steel); box(g, w - 1, 3, zz, w, wallH, zz + 1, steel); }
  box(g, 0, wallH - 1, 0, w, wallH, 1, steel); box(g, 0, wallH - 1, d - 1, w, wallH, d, steel);
  for (let i = 0; i < d / 2; i++) {
    box(g, 0, wallH + i, i, w, wallH + i + 1, i + 1, glass);
    box(g, 0, wallH + i, d - 1 - i, w, wallH + i + 1, d - i, glass);
    box(g, 0, wallH, i, 1, wallH + i, i + 1, glass); box(g, 0, wallH, d - 1 - i, 1, wallH + i, d - i, glass);
    box(g, w - 1, wallH, i, w, wallH + i, i + 1, glass); box(g, w - 1, wallH, d - 1 - i, w, wallH + i, d - i, glass);
    for (let a = 0; a < w; a += 12) { const xx = Math.min(a, w - 1); g.set(xx, wallH + i, i, pal(MAT.steel, 2)); g.set(xx, wallH + i, d - 1 - i, pal(MAT.steel, 2)); }
  }
  box(g, 0, wallH + (d >> 1) - 1, 0, w, wallH + (d >> 1) + 1, d, steel); // ridge
  // potting benches inside
  for (const bz of [6, d - 14]) for (let a = 6; a < w - 12; a += 26) { box(g, a, 3, bz, a + 20, 9, bz + 8, planks(MAT.wood, 3, seed)); clear(g, a + 1, 3, bz, a + 19, 8, bz + 8); }
  clear(g, 0, 3, (d >> 1) - 6, 1, 24, (d >> 1) + 6); // door (x0 side)
  return levelKit.addStatic(sim, g, x, y - 0.3, z, 'glasshouse', ['glasshouse']);
}

/** railway track along x or z: wooden sleepers + two steel rails, lying on the ground */
export function track(sim: Sim, x: number, y: number, z: number, length: number, alongZ = false): VoxelBody {
  const L = Math.round(length * 10), W = 24;
  const g = alongZ ? new VoxelGrid(W, 3, L) : new VoxelGrid(L, 3, W);
  const set = (a: number, yy: number, b: number, p: number) => (alongZ ? g.set(b, yy, a, p) : g.set(a, yy, b, p));
  for (let a = 0; a < L; a++) for (let b = 0; b < W; b++) {
    if (a % 6 < 2) set(a, 0, b, pal(MAT.wood, (a >> 3) % 5));
    if (b === 5 || b === 6 || b === 17 || b === 18) { set(a, 1, b, pal(MAT.steel, 2)); set(a, 2, b, pal(MAT.steel, 1)); if (a % 6 >= 2) set(a, 0, b, pal(MAT.steel, 3)); }
  }
  return levelKit.addStatic(sim, g, x, y, z, 'track');
}

/** goods wagon on a track (static until cut loose): plank box on a steel underframe with wheels */
export function wagon(sim: Sim, x: number, y: number, z: number, alongZ = false, seed = 0): VoxelBody {
  const L = 80, W = 26, H = 32;
  const g = alongZ ? new VoxelGrid(W, H, L) : new VoxelGrid(L, H, W);
  const B = (a0: number, y0: number, b0: number, a1: number, y1: number, b1: number, p: PalFn | number) => (alongZ ? box(g, b0, y0, a0, b1, y1, a1, p) : box(g, a0, y0, b0, a1, y1, b1, p));
  for (const a of [10, 18, 58, 66]) for (const b of [4, W - 6]) B(a, 0, b, a + 5, 5, b + 2, flat(MAT.steel));
  B(0, 5, 0, L, 7, W, flat(MAT.steel));
  const wall = seed % 2 ? planks(MAT.wood, 3, seed, alongZ ? 'z' : 'x') : shaded(MAT.paintedmetal, 6, seed);
  B(0, 7, 0, L, H - 2, 2, wall); B(0, 7, W - 2, L, H - 2, W, wall);
  B(0, 7, 0, 2, H - 2, W, wall); B(L - 2, 7, 0, L, H - 2, W, wall);
  B(0, H - 2, 0, L, H, W, shaded(MAT.sheetmetal, 6, seed));
  B(30, 7, 0, 50, 26, 2, 0); // sliding door opening
  return levelKit.addStatic(sim, g, x, y, z, 'wagon', ['wagon']);
}

/** target dummy (dynamic): wide base, wooden post, straw-sack body, painted head. About 1.9 m tall */
export function dummy(sim: Sim, x: number, y: number, z: number, seed = 0, tag = 'dummy'): VoxelBody {
  const g = new VoxelGrid(8, 19, 8);
  box(g, 0, 0, 0, 8, 1, 8, planks(MAT.wood, 2, seed));
  box(g, 3, 1, 3, 5, 9, 5, pal(MAT.wood, 1));
  box(g, 2, 9, 2, 6, 15, 6, shaded(MAT.fabric, 2, seed));
  box(g, 0, 12, 3, 8, 13, 5, pal(MAT.wood, 2));
  sphere(g, 4, 16.5, 4, 2.3, pal(MAT.plastic, (seed % 4) + 1));
  return levelKit.addProp(sim, g, x - 0.4, y, z - 0.4, 'dummy', 0, [tag]);
}

/** gold pickup token (static, floats where placed) */
export function token(sim: Sim, p: V3, i = 0): VoxelBody {
  const g = new VoxelGrid(4, 4, 4);
  box(g, 0, 0, 0, 4, 4, 4, pal(MAT.gold, i % 5));
  g.set(1, 1, 0, pal(MAT.lamp)); g.set(2, 2, 3, pal(MAT.lamp));
  return levelKit.addStatic(sim, g, p.x - 0.2, p.y + 0.5, p.z - 0.2, 'token', ['token']);
}

/** glowing warning post where something is about to land (removed by the blast) */
export function warnMarker(sim: Sim, p: V3): VoxelBody {
  const g = new VoxelGrid(3, 10, 3);
  box(g, 1, 0, 1, 2, 10, 2, pal(MAT.alarmbox, 1));
  box(g, 0, 8, 0, 3, 10, 3, pal(MAT.lamp));
  g.set(1, 0, 1, pal(MAT.alarmbox, 2));
  return levelKit.addStatic(sim, g, p.x - 0.15, p.y, p.z - 0.15, 'warning', ['marker']);
}

/**
 * Drop a telegraphed blast near `around`: a marker post appears, the explosion follows after `delay` ticks.
 * Positions come from sim.rng (deterministic). Returns the landing point.
 */
export function telegraphBlast(sim: Sim, around: V3, minR: number, maxR: number, size: number, delay: number): V3 {
  const a = sim.rng.next() * Math.PI * 2, r = minR + (maxR - minR) * sim.rng.next();
  const x = around.x + Math.cos(a) * r, z = around.z + Math.sin(a) * r;
  const y = groundAt(sim, x, z, around.y + 30, around.y);
  const p = { x, y, z };
  warnMarker(sim, p);
  sim.out.push({ type: 'custom', name: 'mode:warning', data: { pos: p, delay } });
  sim.explodeLater({ x, y: y + 0.3, z }, size, delay);
  return p;
}

// ------------------------------------------------------------------------------------------------ rules

/** clock + score bookkeeping for hand-written mode rules (same contract as the kit templates) */
export abstract class ClockRules implements ModeRules {
  score = 0;
  ticks = 0;
  ended = false;
  won = false;
  text = '';
  constructor(readonly seconds: number | null) {}
  get timeLeft(): number | null { return this.seconds == null ? null : Math.max(0, this.seconds - this.ticks / TPS); }
  abstract start(ctx: ModContext): void;
  tick(ctx: ModContext): void {
    if (this.ended) return;
    this.ticks++;
    if (ctx.player.dead) { this.finish(false, 'Knocked out'); return; }
    this.step(ctx);
    if (!this.ended && this.seconds != null && this.ticks >= this.seconds * TPS) this.timeUp(ctx);
  }
  protected abstract step(ctx: ModContext): void;
  protected timeUp(_ctx: ModContext): void { this.finish(false, 'Time is up'); }
  protected finish(won: boolean, text: string): void { if (this.ended) return; this.ended = true; this.won = won; this.text = text; }
  status(): ModeStatus { return { text: this.text, score: Math.round(this.score), timeLeft: this.timeLeft, ended: this.ended, won: this.won }; }
}

/** world height of the highest remaining voxel of a body (scans the grid from the top; static bodies) */
export function topOf(b: VoxelBody): number {
  const g = b.grid;
  for (let y = g.sy - 1; y >= 0; y--) for (let z = 0; z < g.sz; z++) for (let x = 0; x < g.sx; x++) if (g.data[g.idx(x, y, z)]) return b.toWorld({ x: x + 0.5, y: y + 1, z: z + 0.5 }).y;
  return -Infinity;
}

/**
 * Bring every body tagged `tag` down: static ones count as felled when their highest remaining voxel is below
 * `below` m, dynamic ones when their top has dropped below it (fallen over) or they are gone.
 */
export function fell(o: { tag: string; below: number; seconds: number; label?: string; onStart?: (ctx: ModContext) => void }): ModeRules {
  return new (class extends ClockRules {
    bodies: VoxelBody[] = [];
    down = 0;
    start(ctx: ModContext) {
      this.bodies = [...ctx.sim.bodies.values()].filter((b) => b.tags.has(o.tag));
      this.text = `${o.label ?? 'Down'} 0 / ${this.bodies.length}`;
      o.onStart?.(ctx);
    }
    step(_ctx: ModContext) {
      if (this.ticks % 10 !== 1) return;
      let down = 0;
      for (const b of this.bodies) {
        if (b.removed || b.grid.count === 0) { down++; continue; }
        const top = b.dynamic ? b.toWorld({ x: b.grid.sx / 2, y: b.grid.sy, z: b.grid.sz / 2 }).y : topOf(b);
        if (top < o.below) down++;
      }
      this.down = down;
      this.score = down * 100;
      this.text = `${o.label ?? 'Down'} ${down} / ${this.bodies.length}`;
      if (this.bodies.length > 0 && down === this.bodies.length) { this.score += Math.round((this.timeLeft ?? 0) * 10); this.finish(true, 'All down!'); }
    }
    protected override timeUp() { this.finish(false, `Time up: ${this.down} / ${this.bodies.length} down`); }
  })(o.seconds);
}
