import { beforeAll, describe, expect, it } from 'vitest';
import { MAT, pal } from '../../src/sim/materials';
import { Sim, initPhysics } from '../../src/sim/sim';
import { VoxelGrid } from '../../src/sim/voxels';

beforeAll(async () => { await initPhysics(); });

function floor(sim: Sim) {
  const g = new VoxelGrid(128, 4, 128);
  g.fill(0, 0, 0, 128, 4, 128, pal(MAT.bedrock));
  const b = sim.addBody(g, { x: -6.4, y: -0.4, z: -6.4 });
  b.impactProof = true;
  return b;
}
function slabBody(sim: Sim, mat: number, y: number) {
  const g = new VoxelGrid(20, 4, 20);
  g.fill(0, 0, 0, 20, 4, 20, pal(mat));
  return sim.addBody(g, { x: -1, y, z: -1 }, { dynamic: true, rot: { x: 0.2, y: 0, z: 0.1, w: 0.97 } });
}
const totalVoxels = (sim: Sim) => { let n = 0; for (const b of sim.bodies.values()) if (b.dynamic) n += b.grid.count; return n; };

describe('impact damage', () => {
  it('a wooden panel dropped from 12 m breaks, a resting one does not degrade', () => {
    const sim = new Sim(5);
    floor(sim);
    slabBody(sim, MAT.wood, 12);
    for (let i = 0; i < 240; i++) sim.step();
    const after = totalVoxels(sim);
    const pieces = [...sim.bodies.values()].filter((b) => b.dynamic).length;
    expect(after).toBeLessThan(1600);
    expect(pieces).toBeGreaterThanOrEqual(1);
    // now everything rests: no further loss for 5 s
    for (let i = 0; i < 300; i++) sim.step();
    expect(totalVoxels(sim)).toBe(after);
  });
  it('gently placed objects are not damaged', () => {
    const sim = new Sim(5);
    floor(sim);
    slabBody(sim, MAT.wood, 0.4);
    slabBody(sim, MAT.glass, 1.0);
    for (let i = 0; i < 300; i++) sim.step();
    expect(totalVoxels(sim)).toBe(3200);
  });
});

describe('structural crush', () => {
  // heavy concrete block (4x3x4 m = 96 t) on a brick pillar
  function tower(sim: Sim, pillar: number) {
    const g = new VoxelGrid(40, 60, 40);
    const o = (40 - pillar) >> 1;
    g.fill(o, 0, o, o + pillar, 30, o + pillar, pal(MAT.brick));
    g.fill(0, 30, 0, 40, 60, 40, pal(MAT.concrete));
    return sim.addBody(g, { x: -2, y: 0, z: -2 });
  }
  it('a thick pillar holds, even after being nicked', () => {
    const sim = new Sim(1);
    floor(sim);
    const b = tower(sim, 20);
    sim.carve({ x: -1, y: 1.5, z: 0 }, 0.3, 0.3, 0, { rough: 0 });
    for (let i = 0; i < 60; i++) sim.step();
    expect([...sim.bodies.values()].filter((x) => x.dynamic && x.grid.count > 1000).length).toBe(0);
    expect(b.grid.get(20, 45, 20)).not.toBe(0);
  });
  it('a pillar cut down to a sliver is crushed and the block comes down', () => {
    const sim = new Sim(1);
    floor(sim);
    const b = tower(sim, 20);
    // cut most of the pillar at 1.5 m leaving a 3x3 voxel core (0.09 m^2 for 96 t => ~10 MPa > brick 4 MPa)
    for (let x = 10; x < 30; x++) for (let z = 10; z < 30; z++) for (let y = 14; y < 17; y++)
      if (!(x >= 19 && x < 22 && z >= 19 && z < 22)) sim.removeVoxel(b, x, y, z);
    sim.step();
    const big = [...sim.bodies.values()].filter((x) => x.dynamic && x.grid.count > 10000);
    expect(big.length).toBe(1);
    const y0 = big[0].rb.worldCom().y;
    for (let i = 0; i < 120; i++) sim.step();
    const stillBig = [...sim.bodies.values()].filter((x) => x.dynamic).reduce((m, x) => Math.max(m, x.grid.count), 0);
    expect(stillBig).toBeGreaterThan(1000);
    expect(y0).toBeGreaterThan(4);
  });
});
