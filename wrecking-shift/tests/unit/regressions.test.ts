import { beforeAll, describe, expect, it } from 'vitest';
import { FireSystem } from '../../src/sim/fire';
import { MAT, pal } from '../../src/sim/materials';
import { hatchback } from '../../src/sim/prefabs/vehicles';
import { Sim, initPhysics } from '../../src/sim/sim';
import { VoxelGrid } from '../../src/sim/voxels';

beforeAll(async () => { await initPhysics(); });

function floor(sim: Sim) {
  const g = new VoxelGrid(200, 4, 200); g.fill(0, 0, 0, 200, 4, 200, pal(MAT.bedrock));
  sim.addBody(g, { x: -10, y: -0.4, z: -10 }).impactProof = true;
}

describe('regressions from the code review', () => {
  it('fires on a removed body die with it (no use-after-free)', () => {
    const sim = new Sim(1); floor(sim);
    const fire = new FireSystem(sim); sim.systems.push(fire);
    const g = new VoxelGrid(6, 6, 6); g.fill(0, 0, 0, 6, 6, 6, pal(MAT.wood));
    const b = sim.addBody(g, { x: 0, y: 1, z: 0 }, { dynamic: true });
    expect(fire.ignite(b, 0, 5, 0)).toBe(true);
    sim.removeBody(b);
    expect(fire.count()).toBe(0);
    sim.step();
    expect(() => { fire.positions(8); fire.forEachFire(() => {}); fire.extinguish({ x: 0, y: 1, z: 0 }, 2); }).not.toThrow();
  });
  it('vehicles register crashes even when events are drained every tick (as the game does)', () => {
    const sim = new Sim(1); floor(sim);
    const v = hatchback(sim, 0, 6, 0, 0);
    let crashes = 0;
    for (let i = 0; i < 240; i++) { sim.step(); for (const e of sim.drainEvents()) if (e.type === 'custom' && e.name === 'vehicle:crash') crashes++; }
    expect(crashes).toBeGreaterThan(0);
    expect(v.wear).toBeGreaterThan(0);
  });
  it('explosions after a vehicle body was removed do not crash', () => {
    const sim = new Sim(1); floor(sim);
    const v = hatchback(sim, 0, 0, 0, 0);
    sim.removeBody(v.body);
    expect(() => { sim.explode({ x: 1, y: 1, z: 1 }, 1); sim.step(); }).not.toThrow();
  });
  it('pieces broken off props count as debris (capped and cleaned up)', () => {
    const sim = new Sim(2); floor(sim);
    const g = new VoxelGrid(16, 16, 16); g.fill(0, 0, 0, 16, 16, 16, pal(MAT.wood));
    sim.addBody(g, { x: 0, y: 0.1, z: 0 }, { dynamic: true, kind: 'prop' });
    sim.explode({ x: 0.8, y: 0.9, z: 0.8 }, 1.0);
    for (let i = 0; i < 30; i++) sim.step();
    const kinds = [...sim.bodies.values()].filter((b) => b.dynamic).map((b) => b.kind);
    expect(kinds.filter((k) => k === 'prop').length).toBeLessThanOrEqual(1);
  });
});
