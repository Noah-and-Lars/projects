import { beforeAll, describe, expect, it } from 'vitest';
import { MAT, pal } from '../../src/sim/materials';
import { Sim, initPhysics } from '../../src/sim/sim';
import { VoxelGrid } from '../../src/sim/voxels';
import { WaterSystem } from '../../src/sim/water';

beforeAll(async () => { await initPhysics(); });

describe('water', () => {
  it('wood floats, steel sinks', () => {
    const sim = new Sim(1);
    const g0 = new VoxelGrid(100, 2, 100); g0.fill(0, 0, 0, 100, 2, 100, pal(MAT.bedrock));
    sim.addBody(g0, { x: -5, y: -4.2, z: -5 });
    sim.systems.push(new WaterSystem(0));
    const mk = (mat: number, x: number) => { const g = new VoxelGrid(8, 8, 8); g.fill(0, 0, 0, 8, 8, 8, pal(mat)); return sim.addBody(g, { x, y: 1, z: 0 }, { dynamic: true }); };
    const wood = mk(MAT.wood, -2), steel = mk(MAT.steel, 2);
    for (let i = 0; i < 600; i++) sim.step();
    const yw = wood.rb.worldCom().y, ys = steel.rb.worldCom().y;
    expect(yw).toBeGreaterThan(-0.5); expect(yw).toBeLessThan(0.5);
    expect(ys).toBeLessThan(-3);
    expect(Math.abs(wood.rb.linvel().y)).toBeLessThan(0.3);
  });
});
