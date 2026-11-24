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
