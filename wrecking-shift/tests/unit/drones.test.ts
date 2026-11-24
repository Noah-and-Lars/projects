import { beforeAll, describe, expect, it } from 'vitest';
import { DroneSystem } from '../../src/sim/drones';
import { MAT, pal } from '../../src/sim/materials';
import { Player } from '../../src/sim/player';
import { Sim, initPhysics } from '../../src/sim/sim';
import { VoxelGrid } from '../../src/sim/voxels';
import { WaterSystem } from '../../src/sim/water';

beforeAll(async () => { await initPhysics(); });

function world(seed = 1) {
  const sim = new Sim(seed);
  const g = new VoxelGrid(256, 4, 256); g.fill(0, 0, 0, 256, 4, 256, pal(MAT.bedrock));
  sim.addBody(g, { x: -12.8, y: -0.4, z: -12.8 }).impactProof = true;
  const ds = new DroneSystem(sim);
  sim.systems.push(ds);
  return { sim, ds };
}
const events = (sim: Sim, name: string) => sim.out.filter((e) => e.type === 'custom' && e.name === name).length;

describe('drones', () => {
  it('watcher hovers, patrols and raises the alarm after 2 s of sight', () => {
    const { sim, ds } = world();
    const d = ds.spawn('watcher', { x: 0, y: 1.2, z: 0 }, [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -6 }]);
    for (let i = 0; i < 200; i++) sim.step();
    expect(d.pos.y).toBeGreaterThan(0.9); expect(d.pos.y).toBeLessThan(2);
    expect(d.pos.z).toBeLessThan(-2);
    expect(d.alarmRaised).toBe(false);
    const p = new Player(sim, { x: 0, y: 0, z: -10 });
    let alarms = 0;
    for (let i = 0; i < 400 && !d.alarmRaised; i++) { p.update(); sim.step(); }
    alarms += events(sim, 'drone:alarm');
    expect(d.alarmRaised).toBe(true);
    expect(alarms).toBe(1);
  });
  it('a wall blocks sight', () => {
    const { sim, ds } = world();
    const w = new VoxelGrid(60, 40, 3); w.fill(0, 0, 0, 60, 40, 3, pal(MAT.concrete));
    sim.addBody(w, { x: -3, y: 0, z: -4 });
    const d = ds.spawn('watcher', { x: 0, y: 1.2, z: 0 }, [{ x: 0, y: 0, z: 0 }]);
    const p = new Player(sim, { x: 0, y: 0, z: -8 });
    for (let i = 0; i < 300; i++) { p.update(); sim.step(); }
    expect(d.alarmRaised).toBe(false);
    expect(d.seeTime).toBe(0);
  });
  it('gunner hurts the player; explosions stun; water kills', () => {
    const { sim, ds } = world(4);
    const d = ds.spawn('gunner', { x: 0, y: 1.2, z: 0 }, [{ x: 0, y: 0, z: 0 }]);
    const p = new Player(sim, { x: 0, y: 0, z: -8 });
    for (let i = 0; i < 600 && p.health > 0.7; i++) { p.update(); sim.step(); }
    expect(p.health).toBeLessThan(1);
    p.godMode = true;
    sim.explode({ x: d.pos.x + 1.5, y: 0.5, z: d.pos.z }, 1.2);
    sim.step();
    expect(d.state).toBe('stunned');
    for (let i = 0; i < 400; i++) { p.update(); sim.step(); }
    expect(d.state).not.toBe('stunned');
    // flood
    sim.waterLevel = 3; sim.systems.push(new WaterSystem(3));
    for (let i = 0; i < 30; i++) sim.step();
    expect(d.state).toBe('dead');
    expect(ds.alive()).toBe(0);
  });
});
