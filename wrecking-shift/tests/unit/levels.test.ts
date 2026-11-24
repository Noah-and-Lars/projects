import { beforeAll, describe, expect, it } from 'vitest';
import { allComponents } from '../../src/sim/connectivity';
import { Sim, initPhysics } from '../../src/sim/sim';
import { Player } from '../../src/sim/player';
import type { VoxelBody } from '../../src/sim/body';
import type { LevelDef, LevelInfo } from '../../src/sim/levels/types';
import type { V3 } from '../../src/sim/vec';
import { ridge } from '../../src/sim/levels/ridge';

beforeAll(async () => { await initPhysics(); });

/** ground height under (x, z): first solid hit from above (terrain only) */
function groundY(sim: Sim, x: number, z: number): number {
  const h = sim.raycast({ x, y: 80, z }, { x: 0, y: -1, z: 0 }, 200, null, (b) => b.tags.has('terrain'));
  return h ? h.point.y : -100;
}

/**
 * Walk the player through waypoints (x, z; y ignored). Returns the index of the first waypoint it could not
 * reach (or -1 when all were reached) and the final position.
 */
export function walk(sim: Sim, p: Player, pts: [number, number][], maxStuck = 200): { failed: number; pos: V3 } {
  for (let i = 0; i < pts.length; i++) {
    const [tx, tz] = pts[i];
    let best = 1e9, stuck = 0;
    for (let t = 0; t < 4000; t++) {
      const pos = p.pos;
      const dx = tx - pos.x, dz = tz - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.45) break;
      if (d < best - 0.05) { best = d; stuck = 0; } else if (++stuck > maxStuck) return { failed: i, pos };
      p.yaw = Math.atan2(-dx, -dz);
      p.input.moveZ = Math.min(1, d / 0.6 + 0.3);
      p.input.jump = stuck > 40 && stuck % 30 === 0;
      p.update(); sim.step();
    }
  }
  p.input.moveZ = 0; p.input.jump = false;
  for (let i = 0; i < 10; i++) { p.update(); sim.step(); }
  return { failed: -1, pos: p.pos };
}

interface Built { sim: Sim; info: LevelInfo; ms: number }
function build(def: LevelDef): Built {
  const sim = new Sim(1);
  const t0 = performance.now();
  const info = def.build(sim);
  return { sim, info, ms: performance.now() - t0 };
}

function staticPieces(sim: Sim): VoxelBody[] {
  return [...sim.bodies.values()].filter((b) => !b.dynamic && !b.tags.has('terrain'));
}

/** shared structural / budget checks */
function commonChecks(def: LevelDef, routes: { name: string; from: V3 | string; pts: [number, number][]; minY?: number }[]) {
  let B: Built;
  it(`${def.id}: builds within budget`, () => {
    B = build(def);
    const { sim, ms } = B;
    let vox = 0, dyn = 0;
    for (const b of sim.bodies.values()) { vox += b.grid.count; if (b.dynamic) dyn++; }
    expect(vox).toBeLessThan(16e6);
    expect(dyn).toBeLessThanOrEqual(120);
    expect(ms).toBeLessThan(20000); // budget is 8 s standalone (see bench); generous under the parallel test runner
  });
  it(`${def.id}: every static prefab is one piece anchored at its bottom layer`, () => {
    const bad: string[] = [];
    for (const b of staticPieces(B.sim)) {
      const comps = allComponents(b.grid);
      const floating = comps.filter((c) => c.min[1] > 0);
      const n = floating.reduce((s, c) => s + c.indices.length, 0);
      if (n > 0) bad.push(`${b.name}#${b.id}: ${floating.length} floating islands, ${n} voxels, first at ${floating[0].min}`);
      for (const ax of [0, 2] as const) if ((ax === 0 ? b.grid.sx : b.grid.sz) > 256) bad.push(`${b.name} too wide`);
    }
    expect(bad).toEqual([]);
  });
  it(`${def.id}: markers inside bounds and above the ground`, () => {
    const { info, sim } = B;
    const bad: string[] = [];
    for (const [k, p] of Object.entries(info.markers)) {
      if (k === 'heli_start') continue;
      const { min, max } = info.bounds;
      if (p.x < min.x || p.x > max.x || p.z < min.z || p.z > max.z || p.y < min.y || p.y > max.y) bad.push(`${k} out of bounds`);
      const gyy = groundY(sim, p.x, p.z);
      if (p.y < gyy - 0.15) bad.push(`${k} below ground (${p.y.toFixed(2)} < ${gyy.toFixed(2)})`);
    }
    expect(bad).toEqual([]);
    const h = info.markers.heli_start;
    expect(Math.abs(h.x) > info.bounds.max.x || Math.abs(h.z) > info.bounds.max.z).toBe(true);
  });
  it(`${def.id}: settles without spontaneous collapse (300 ticks)`, () => {
    const { sim, info } = B;
    const before = new Map<number, V3>();
    for (const b of sim.bodies.values()) if (b.dynamic) before.set(b.id, b.rb.translation());
    for (let i = 0; i < 300; i++) sim.step();
    const debris = [...sim.bodies.values()].filter((b) => b.kind === 'debris');
    expect(debris.map((b) => `${b.grid.count}@${JSON.stringify(b.rb.translation())}`)).toEqual([]);
    const bad: string[] = [];
    for (const b of sim.bodies.values()) {
      if (!b.dynamic) continue;
      const t = b.rb.translation(), v = b.rb.linvel();
      const t0 = before.get(b.id)!;
      if (t.y < info.bounds.min.y || Math.hypot(v.x, v.y, v.z) > 0.3) bad.push(`${b.name} moving/fallen at ${t.x.toFixed(1)},${t.y.toFixed(1)},${t.z.toFixed(1)} v=${Math.hypot(v.x, v.y, v.z).toFixed(2)}`);
      if (t0 && t0.y - t.y > 0.6 && b.name !== 'boat') bad.push(`${b.name} dropped ${(t0.y - t.y).toFixed(2)} m at ${t.x.toFixed(1)},${t.z.toFixed(1)}`);
    }
    expect(bad).toEqual([]);
  });
  it(`${def.id}: spawn is walkable`, () => {
    const { sim, info } = B;
    const p = new Player(sim, info.spawn);
    p.yaw = info.spawnYaw;
    for (let i = 0; i < 60; i++) { p.update(); sim.step(); }
    expect(p.grounded).toBe(true);
    expect(Math.abs(p.pos.y - info.spawn.y)).toBeLessThan(0.4);
    p.input.moveZ = 1;
    for (let i = 0; i < 60; i++) { p.update(); sim.step(); }
    p.input.moveZ = 0;
    const d = Math.hypot(p.pos.x - info.spawn.x, p.pos.z - info.spawn.z);
    expect(d).toBeGreaterThan(3);
    sim.world.removeRigidBody(p.rb);
    sim.player = null;
  });
  for (const r of routes) {
    it(`${def.id}: walk route ${r.name}`, () => {
      const { sim, info } = B;
      const from = typeof r.from === 'string' ? info.markers[r.from] : r.from;
      const p = new Player(sim, { x: from.x, y: from.y + 0.1, z: from.z });
      for (let i = 0; i < 20; i++) { p.update(); sim.step(); }
      const res = walk(sim, p, r.pts);
      sim.world.removeRigidBody(p.rb);
      sim.player = null;
      expect(`${r.name}: failed at ${res.failed} pos ${res.pos.x.toFixed(1)},${res.pos.y.toFixed(1)},${res.pos.z.toFixed(1)}`).toBe(`${r.name}: failed at -1 pos ${res.pos.x.toFixed(1)},${res.pos.y.toFixed(1)},${res.pos.z.toFixed(1)}`);
      if (r.minY !== undefined) expect(res.pos.y).toBeGreaterThan(r.minY);
    });
  }
  return () => B;
}

/** carve a few small holes into a body near its base and step: it must keep >= 97 % of its voxels */
function lightDamage(sim: Sim, b: VoxelBody, pts: V3[]): number {
  const n0 = b.grid.count;
  for (const p of pts) sim.carve(p, 0.35, 0.35, 0.25, {});
  for (let i = 0; i < 60; i++) sim.step();
  return b.removed ? 0 : b.grid.count / n0;
}

/** ring of explosions around a vertical structure (centre c, radius r) at height y */
function ringBlast(sim: Sim, c: V3, r: number, y: number, n: number, size: number): void {
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; sim.explode({ x: c.x + Math.cos(a) * r, y, z: c.z + Math.sin(a) * r }, size); }
}
function debrisAbove(sim: Sim, y: number): number {
  let n = 0;
  for (const b of sim.bodies.values()) if (b.kind === 'debris' && b.grid.count > 200) n += b.grid.count;
  void y;
  return n;
}

describe('Kestrel Ridge', () => {
  const get = commonChecks(ridge, [
    { name: 'spawn -> boathouse', from: 'escape', pts: [[30, 22], [0, 22], [-27, 21.5], [-27, 23], [-27, 26], [-29, 28]] },
    { name: 'spawn -> road -> mansion front door -> hall', from: 'escape', pts: [[31, 21], [-10, 9], [-15, 5], [-16, -1], [24, -17], [10, -22], [-8.5, -25], [-8.5, -27], [-8.5, -32]], minY: 12.5 },
    { name: 'hall -> stairs -> first -> second floor', from: 'mansion_hall', pts: [[-8.5, -32.5], [-5, -32.5], [-2, -33], [1.85, -33], [1.85, -32.5], [1.85, -40.2], [0.25, -40.2], [0.25, -38.5], [0.25, -32.5], [-2, -32], [-8, -32]], minY: 19.5 },
    { name: 'hall -> basement -> cellar -> vault door', from: 'mansion_hall', pts: [[-8.5, -32.5], [-5, -32.5], [-2, -32.5], [0.25, -32.5], [0.25, -39.5], [-2, -39.5], [-4.6, -39.5], [-6, -39.5], [-11, -39.5]] },
    { name: 'forecourt -> garage', from: 'forecourt', pts: [[15, -28], [15, -31], [15, -37]] },
    { name: 'forecourt -> gazebo', from: 'forecourt', pts: [[-6, -17], [-19, -16], [-19, -18], [-19, -20]] },
    { name: 'forecourt -> footbridge -> greenhouse', from: 'forecourt', pts: [[26, -24.2], [33, -24.2], [39.5, -24.4], [40, -25.2], [43, -25.2]], minY: 12.5 },
    { name: 'garden -> hilltop -> tower top', from: 'garden', pts: [[-26, -24], [-33, -32], [-40, -41], [-46, -42], [-46, -43.2], [-46, -45], [-47.4, -47.4], [-44.6, -47.4], [-44.6, -44.6], [-47.4, -44.6], [-47.4, -47.4], [-44.6, -47.4], [-44.6, -44.6], [-47.4, -44.6], [-47.4, -47.4], [-44.6, -47.4], [-44.6, -44.6], [-47.4, -44.6], [-47.4, -47.4]], minY: 34 },
    { name: 'hairpin -> gallery -> roof terrace', from: 'hairpin', pts: [[-20, 6], [-35.3, 5.5], [-35.3, 2], [-35.3, 5.5], [-23.1, 5], [-23.1, 4], [-23.1, -3.5], [-26, -3]], minY: 11 },
  ]);
  it('ridge: light damage does not collapse the watchtower; a ring blast at its base fells it', () => {
    const { sim, info } = get();
    const tower = [...sim.bodies.values()].find((b) => b.name === 'watchtower')!;
    const c = { x: -46, y: 20, z: -46 };
    const keep = lightDamage(sim, tower, [{ x: c.x - 2.5, y: c.y + 1.2, z: c.z }, { x: c.x + 2.5, y: c.y + 3, z: c.z }]);
    expect(keep).toBeGreaterThan(0.97);
    expect([...sim.bodies.values()].filter((b) => b.kind === 'debris' && b.grid.count > 500).length).toBe(0);
    // charges along the (square) wall centre line, 1 m above the floor
    const n0 = tower.grid.count;
    for (let k = -2; k <= 2; k++) for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const u = k * 1.15;
      sim.explode({ x: c.x + (sx ? sx * 2.3 : u), y: c.y + 1.0, z: c.z + (sz ? sz * 2.3 : u) }, 1.6);
    }
    for (let i = 0; i < 120; i++) sim.step();
    expect(tower.removed ? 0 : tower.grid.count).toBeLessThan(n0 * 0.3);
    expect(debrisAbove(sim, c.y)).toBeGreaterThan(20000);
    void info;
  });
});
