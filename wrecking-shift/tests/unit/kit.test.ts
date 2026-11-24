import { beforeAll, describe, expect, it } from 'vitest';
import { allComponents } from '../../src/sim/connectivity';
import { MAT } from '../../src/sim/materials';
import { Sim, initPhysics } from '../../src/sim/sim';
import { makeBuilding, placeBuilding } from '../../src/sim/levels/kit';
import { VoxelGrid } from '../../src/sim/voxels';
import { pal } from '../../src/sim/materials';

beforeAll(async () => { await initPhysics(); });

describe('level kit', () => {
  it('buildings are one connected, self-supporting piece', () => {
    for (const spec of [
      { w: 80, d: 60, floors: 2, wall: MAT.brick, lining: MAT.plaster, roof: 'gable' as const, partitions: true, lamps: true },
      { w: 120, d: 90, floors: 3, wall: MAT.concrete, slab: MAT.concrete, roof: 'flat' as const, frame: MAT.concrete, doors: 'ns', doorW: 28, doorH: 26 },
      { w: 60, d: 50, floors: 1, wall: MAT.wood, roof: 'gable' as const, roofMat: MAT.wood, wallT: 1, doors: 'e' },
    ]) {
      const g = makeBuilding(spec);
      const comps = allComponents(g);
      const big = comps.filter((c) => c.indices.length > 30);
      expect(big.length).toBe(1);
      // nothing but tiny bits may float
      const floating = comps.filter((c) => c.min[1] > 0).reduce((n, c) => n + c.indices.length, 0);
      expect(floating).toBeLessThan(40);
      const sim = new Sim(1);
      const g0 = new VoxelGrid(200, 2, 200); g0.fill(0, 0, 0, 200, 2, 200, pal(MAT.bedrock));
      sim.addBody(g0, { x: -4, y: -0.2, z: -4 });
      const b = placeBuilding(sim, g, 0, 0, 0);
      const n0 = b.grid.count;
      // a small hit must not bring the house down (crush check sanity)
      sim.carve({ x: 2, y: 1.5, z: 0.1 }, 0.5, 0.5, 0.2, {});
      for (let i = 0; i < 30; i++) sim.step();
      expect(b.grid.count).toBeGreaterThan(n0 * 0.97);
    }
  });
});
