import { beforeAll, describe, expect, it } from 'vitest';
import { MAT, pal } from '../../src/sim/materials';
import { Sim, initPhysics } from '../../src/sim/sim';
import { VoxelGrid, computeMassProps } from '../../src/sim/voxels';
import { allComponents, findIslands } from '../../src/sim/connectivity';

beforeAll(async () => { await initPhysics(); });

function slab(sim: Sim) {
  const g = new VoxelGrid(128, 4, 128);
  g.fill(0, 0, 0, 128, 4, 128, pal(MAT.bedrock));
  return sim.addBody(g, { x: -6.4, y: -0.4, z: -6.4 });
}

/** table: 4 wooden legs + concrete top, standing on y=0 of its own grid */
function table(): VoxelGrid {
  const g = new VoxelGrid(40, 30, 40);
  for (const [x, z] of [[2, 2], [34, 2], [2, 34], [34, 34]]) g.fill(x, 0, z, x + 4, 24, z + 4, pal(MAT.wood));
  g.fill(0, 24, 0, 40, 30, 40, pal(MAT.concrete));
  return g;
}

describe('voxels', () => {
  it('mass props of a uniform box', () => {
    const g = new VoxelGrid(10, 20, 10);
    g.fill(0, 0, 0, 10, 20, 10, pal(MAT.concrete));
    const mp = computeMassProps(g);
    expect(mp.mass).toBeCloseTo(2000 * 1 * 2 * 1, 3);
    expect(mp.com.x).toBeCloseTo(0.5); expect(mp.com.y).toBeCloseTo(1.0);
    const sorted = [mp.inertia.x, mp.inertia.y, mp.inertia.z].sort((a, b) => a - b);
    // Iyy = m/12*(1+1), Ixx = m/12*(4+1)
    expect(sorted[0]).toBeCloseTo((4000 / 12) * 2, 0);
    expect(sorted[2]).toBeCloseTo((4000 / 12) * 5, 0);
  });
  it('connectivity: islands vs anchors', () => {
    const g = table();
    expect(allComponents(g).length).toBe(1);
    // cut all four legs at y=10
    const seeds: number[] = [];
    for (const [x, z] of [[2, 2], [34, 2], [2, 34], [34, 34]])
      for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 4; dz++) {
        g.set(x + dx, 10, z + dz, 0);
        seeds.push(g.idx(x + dx, 9, z + dz), g.idx(x + dx, 11, z + dz));
      }
    const isl = findIslands(g, seeds, 0);
    expect(isl.length).toBe(1);
    expect(isl[0].indices.length).toBe(40 * 40 * 6 + 4 * 16 * 13);
    // free mode: 5 components (4 stumps + top) -> 4 islands, one stays
    expect(findIslands(g, seeds, -1).length).toBe(4);
  });
});

describe('sim', () => {
  it('raycast hits and carve respects hardness', () => {
    const sim = new Sim(1);
    slab(sim);
    const g = new VoxelGrid(20, 20, 20);
    g.fill(0, 0, 0, 20, 20, 10, pal(MAT.wood));
    g.fill(0, 0, 10, 20, 20, 20, pal(MAT.concrete));
    const b = sim.addBody(g, { x: 0, y: 0, z: 0 });
    const hit = sim.raycast({ x: 1.05, y: 1.05, z: -3 }, { x: 0, y: 0, z: 1 }, 10);
    expect(hit).not.toBeNull();
    expect(hit!.body).toBe(b);
    expect(hit!.dist).toBeCloseTo(3, 3);
    expect(hit!.normal.z).toBe(-1);
    const before = g.count;
    const r = sim.carve({ x: 1, y: 1, z: 0.5 }, 0.5, 0.3, 0, { rough: 0 });
    expect(r.removed).toBeGreaterThan(300);
    expect(g.count).toBe(before - r.removed);
    expect(r.byMat[MAT.concrete]).toBe(0);
    expect(r.byMat[MAT.wood]).toBe(r.removed);
  });

  it('cut all legs -> top falls as a dynamic body and lands', () => {
    const sim = new Sim(1);
    slab(sim);
    const t = sim.addBody(table(), { x: -2, y: 0, z: -2 });
    for (const [x, z] of [[2, 2], [34, 2], [2, 34], [34, 34]]) {
      sim.carve({ x: -2 + (x + 2) * 0.1, y: 1.0, z: -2 + (z + 2) * 0.1 }, 0.45, 0.3, 0.1, { rough: 0 });
    }
    sim.step();
    const dyn = [...sim.bodies.values()].filter((b) => b.dynamic);
    expect(dyn.length).toBe(1);
    const top = dyn[0];
    expect(top.grid.count).toBeGreaterThan(40 * 40 * 6);
    expect(top.rb.mass()).toBeGreaterThan(1000);
    const y0 = top.rb.worldCom().y;
    for (let i = 0; i < 240; i++) sim.step();
    const y1 = top.rb.worldCom().y;
    expect(y1).toBeLessThan(y0 - 0.5);
    expect(y1).toBeGreaterThan(0.2); // resting on stumps / ground, not fallen through
    expect(t.grid.count).toBeGreaterThan(0);
    const v = top.rb.linvel();
    expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(0.5);
  });

  it('explosion throws debris and is deterministic', () => {
    const run = () => {
      const sim = new Sim(7);
      slab(sim);
      const g = new VoxelGrid(40, 30, 6);
      g.fill(0, 0, 0, 40, 30, 6, (x, y) => pal(MAT.brick, (x + y) % 5));
      sim.addBody(g, { x: -2, y: 0, z: 0 });
      sim.explode({ x: 0, y: 1.0, z: 0.3 }, 1.2);
      for (let i = 0; i < 120; i++) sim.step();
      let sum = 0;
      for (const b of sim.bodies.values()) { const p = b.rb.translation(); sum += p.x * 3 + p.y * 5 + p.z * 7 + b.grid.count; }
      return { sum, n: sim.bodies.size, count: g.count };
    };
    const a = run(), b = run();
    expect(a.count).toBeLessThan(40 * 30 * 6 - 500);
    expect(a.n).toBeGreaterThan(2);
    expect(a.sum).toBe(b.sum);
    expect(a.n).toBe(b.n);
  });
});
