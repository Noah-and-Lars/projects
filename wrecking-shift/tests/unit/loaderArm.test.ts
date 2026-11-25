import { beforeAll, describe, expect, it } from 'vitest';
import { bricks } from '../../src/sim/build';
import { MAT, pal } from '../../src/sim/materials';
import { adoptVehicle, loaderBlueprint, spawnVehicle } from '../../src/sim/prefabs/vehicles';
import { Sim, initPhysics } from '../../src/sim/sim';
import { restoreSim, snapshotSim } from '../../src/sim/snapshot';
import { VehicleSystem, type Vehicle } from '../../src/sim/vehicle';
import { VoxelGrid } from '../../src/sim/voxels';

beforeAll(async () => { await initPhysics(); });

function ground(sim: Sim) {
  for (let i = -2; i < 2; i++) for (let j = -3; j < 3; j++) {
    const g = new VoxelGrid(256, 1, 256);
    g.fill(0, 0, 0, 256, 1, 256, pal(MAT.asphalt));
    sim.addBody(g, { x: i * 25.6, y: -0.1, z: j * 25.6 });
  }
}
const steps = (sim: Sim, n: number, each?: (t: number) => void) => { for (let t = 0; t < n; t++) { sim.step(); each?.(t); } };

function setup(z = 30): { sim: Sim; v: Vehicle } {
  const sim = new Sim(3);
  ground(sim);
  const v = spawnVehicle(sim, 'loader', 0, 0, z, 0); // facing -Z
  steps(sim, 90);
  v.startEngine();
  v.seated = true;
  return { sim, v };
}
/** height of the bucket's cutting edge (front, middle) */
const edgeY = (v: Vehicle) => v.arm!.body.toWorld({ x: 12, y: 1, z: v.arm!.body.grid.sz - 1 }).y;

describe('loader bucket arm', () => {
  it('the blueprint splits into a chassis and a connected arm body', () => {
    const bp = loaderBlueprint();
    expect(bp.spec.arm).toBeTruthy();
    expect(bp.arm!.grid.count).toBeGreaterThan(500);
    expect(bp.arm!.offset[2]).toBeGreaterThan(25);
  });

  it('holds its carry pose while parked and driving, raises and lowers on input', () => {
    const { sim, v } = setup();
    const arm = v.arm!;
    expect(arm).toBeTruthy();
    expect(arm.body.kind).toBe('vehicle');
    expect(Math.abs(arm.angle(v.body))).toBeLessThan(0.08);
    const y0 = edgeY(v);
    v.input.arm = 1;
    steps(sim, 150);
    v.input.arm = 0;
    steps(sim, 30);
    expect(arm.angle(v.body)).toBeGreaterThan(0.7);
    expect(edgeY(v) - y0).toBeGreaterThan(1.4);
    v.input.arm = -1;
    steps(sim, 240);
    v.input.arm = 0;
    steps(sim, 30);
    expect(arm.angle(v.body)).toBeLessThan(-0.1);
    // lowered: the cutting edge reaches (near) the ground
    expect(edgeY(v)).toBeLessThan(0.25);
    expect(v.upright).toBeGreaterThan(0.97);
  });

  it('lifts a crate placed in the bucket', () => {
    const { sim, v } = setup();
    const arm = v.arm!;
    // crate 0.6 m cube (~170 kg of crate wood) resting on the bucket floor
    const g = new VoxelGrid(6, 6, 6);
    g.fill(0, 0, 0, 6, 6, 6, pal(MAT.crate, 1));
    // the loader faces -Z, so arm-local +X / +Z run along world -X / -Z: the crate box's world corner is the local max corner
    const p = arm.body.toWorld({ x: 15, y: 2.1, z: 25.5 });
    const crate = sim.addBody(g, p, { dynamic: true, kind: 'prop', name: 'crate' });
    steps(sim, 60);
    const c0 = crate.center().y;
    v.input.arm = 1;
    steps(sim, 160);
    v.input.arm = 0;
    steps(sim, 30);
    const c1 = crate.center().y;
    if (process.env.ARM_LOG) console.log('crate', c0, c1, arm.body.toLocal(crate.center()));
    expect(c1 - c0, `crate rose ${(c1 - c0).toFixed(2)} m`).toBeGreaterThan(1.0);
    // still in the bucket (near the arm body), not thrown off
    const l = arm.body.toLocal(crate.center());
    expect(l.x).toBeGreaterThan(-2); expect(l.x).toBeLessThan(arm.body.grid.sx + 2);
    expect(l.z).toBeGreaterThan(10);
  });

  it('scoops a crate off the ground: lower, drive into it, raise', () => {
    const { sim, v } = setup(30);
    const g = new VoxelGrid(5, 5, 5);
    g.fill(0, 0, 0, 5, 5, 5, pal(MAT.crate, 2));
    const crate = sim.addBody(g, { x: -0.25, y: 0, z: 22 }, { dynamic: true, kind: 'prop', name: 'crate' });
    v.input.arm = -1;
    steps(sim, 120);
    v.input.arm = 0;
    v.input.throttle = 0.5;
    // drive until the crate sits against the back plate (arm-local z 19 .. 23)
    steps(sim, 600, (t) => {
      const l = v.arm!.body.toLocal(crate.center());
      if (process.env.ARM_LOG && t % 30 === 0) console.log(t, 'crate local', l.x.toFixed(1), l.y.toFixed(1), l.z.toFixed(1), 'v', v.speed.toFixed(2), 'com', v.com.z.toFixed(2));
      if (l.z < 23 || v.com.z < 18) v.input.throttle = 0;
    });
    v.input.throttle = 0;
    steps(sim, 30);
    v.input.arm = 1;
    steps(sim, 160);
    v.input.arm = 0;
    steps(sim, 30);
    expect(crate.center().y).toBeGreaterThan(1.2);
  });

  it('pushes through a brick wall with the bucket raised to chest height', () => {
    const sim = new Sim(1);
    ground(sim);
    const g = new VoxelGrid(60, 30, 3);
    g.fill(0, 0, 0, 60, 30, 3, bricks(MAT.brick));
    sim.addBody(g, { x: -3, y: 0, z: 0 }, { name: 'wall' });
    const v = spawnVehicle(sim, 'loader', 0, 0, 12.3, 0);
    steps(sim, 60);
    v.startEngine();
    v.input.arm = 1;
    steps(sim, 50);
    v.input.arm = 0;
    const n0 = g.count;
    v.input.throttle = 1;
    steps(sim, 420);
    expect(n0 - g.count).toBeGreaterThan(500);
    expect(v.com.z).toBeLessThan(-2);
  });

  it('survives a snapshot restore with the bucket raised', () => {
    const { sim, v } = setup();
    v.input.arm = 1;
    steps(sim, 90);
    v.input.arm = 0;
    steps(sim, 30);
    const a0 = v.arm!.angle(v.body), t0 = v.arm!.target;
    const snap = JSON.parse(JSON.stringify(snapshotSim(sim)));
    const sim2 = new Sim(3);
    restoreSim(snap, sim2);
    const body = sim2.bodies.get(v.body.id)!;
    const v2 = adoptVehicle(sim2, body)!;
    expect(v2.arm).toBeTruthy();
    expect(v2.arm!.target).toBeCloseTo(t0, 5);
    expect(VehicleSystem.of(sim2).list.length).toBe(1);
    steps(sim2, 90);
    expect(Math.abs(v2.arm!.angle(v2.body) - a0)).toBeLessThan(0.05);
  });
});
