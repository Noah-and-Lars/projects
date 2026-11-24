import { beforeAll, describe, expect, it } from 'vitest';
import { bricks, shaded } from '../../src/sim/build';
import { allComponents } from '../../src/sim/connectivity';
import { MAT, pal } from '../../src/sim/materials';
import { VEHICLE_BLUEPRINTS, spawnVehicle } from '../../src/sim/prefabs/vehicles';
import { Sim, initPhysics } from '../../src/sim/sim';
import { VehicleSystem, type Vehicle } from '../../src/sim/vehicle';
import { VoxelGrid } from '../../src/sim/voxels';

beforeAll(async () => { await initPhysics(); });

/** flat asphalt, top at y = 0, x in [-51.2, 51.2), z in [-76.8, 76.8) */
function ground(sim: Sim) {
  for (let i = -2; i < 2; i++) for (let j = -3; j < 3; j++) {
    const g = new VoxelGrid(256, 1, 256);
    g.fill(0, 0, 0, 256, 1, 256, pal(MAT.asphalt));
    sim.addBody(g, { x: i * 25.6, y: -0.1, z: j * 25.6 });
  }
}

function setup(id: string, z = 40, seed = 1): { sim: Sim; v: Vehicle } {
  const sim = new Sim(seed);
  ground(sim);
  const v = spawnVehicle(sim, id, 0, 0, z, 0); // yaw 0: facing -Z
  return { sim, v };
}
const steps = (sim: Sim, n: number, each?: (t: number) => void) => { for (let t = 0; t < n; t++) { sim.step(); each?.(t); } };
const customs = (sim: Sim, name: string) => sim.out.filter((e) => e.type === 'custom' && e.name === name);

const IDS = Object.keys(VEHICLE_BLUEPRINTS);
/** km/h after 5 s of full throttle from rest */
const SPEED_RANGE: Record<string, [number, number]> = { hatchback: [70, 105], van: [50, 78], loader: [24, 32] };

describe('vehicle prefabs', () => {
  it.each(IDS)('%s is one connected voxel body with a steel frame and keep voxel', (id) => {
    const bp = VEHICLE_BLUEPRINTS[id]();
    expect(allComponents(bp.grid).length).toBe(1);
    expect(bp.frame.length).toBeGreaterThan(50);
    expect(bp.engineBay.length).toBeGreaterThan(50);
    const [x, y, z] = bp.keep;
    expect(bp.grid.get(x, y, z) >> 3).toBe(MAT.steel);
  });
});

describe('vehicle driving', () => {
  it.each(IDS)('%s settles level on its wheels within 2 s', (id) => {
    const { sim, v } = setup(id);
    steps(sim, 120);
    expect(Math.abs(v.speed)).toBeLessThan(0.1);
    expect(v.upright).toBeGreaterThan(0.995);
    expect(v.grounded).toBe(4);
    expect(v.body.kind).toBe('vehicle');
    expect(v.body.tags.has('vehicle')).toBe(true);
    // not sunk into the ground, not floating: chassis underside 0.1 .. 0.45 m above the asphalt
    const bottom = v.body.rb.translation().y;
    expect(bottom).toBeGreaterThan(0.1);
    expect(bottom).toBeLessThan(0.45);
    // rests
    steps(sim, 60);
    const lv = v.body.rb.linvel();
    expect(Math.hypot(lv.x, lv.y, lv.z)).toBeLessThan(0.1);
  });

  it.each(IDS)('%s: 5 s full throttle reaches its speed range and stays upright; braking stops it', (id) => {
    const { sim, v } = setup(id);
    steps(sim, 60);
    v.startEngine();
    v.input.throttle = 1;
    let minUp = 1;
    const x0 = v.com.x;
    steps(sim, 300, () => { minUp = Math.min(minUp, v.upright); });
    const [lo, hi] = SPEED_RANGE[id];
    expect(v.speedKmh).toBeGreaterThan(lo);
    expect(v.speedKmh).toBeLessThan(hi);
    expect(minUp).toBeGreaterThan(0.97);
    expect(Math.abs(v.com.x - x0)).toBeLessThan(0.3); // straight
    expect(Math.abs(v.yaw)).toBeLessThan(0.03);
    // brake
    v.input.throttle = -1;
    let stopped = -1;
    steps(sim, 240, (t) => { if (stopped < 0 && v.speed < 0.3) stopped = t; });
    expect(stopped).toBeGreaterThan(0);
    expect(stopped).toBeLessThan(200);
    // holding brake at standstill reverses
    expect(v.speed).toBeLessThan(-1);
  });

  it.each(IDS)('%s: steering changes heading without rolling over', (id) => {
    const { sim, v } = setup(id);
    steps(sim, 60);
    v.startEngine();
    v.input.throttle = 1;
    for (let i = 0; i < 600 && v.speed < v.spec.topSpeed * 0.6; i++) sim.step();
    const y0 = v.yaw;
    v.input.steer = -1; // left
    let minUp = 1;
    steps(sim, 90, () => { minUp = Math.min(minUp, v.upright); });
    expect(v.yaw - y0).toBeGreaterThan(0.6); // turning left increases yaw (player convention)
    expect(minUp).toBeGreaterThan(0.9);
    v.input.steer = 1;
    const y1 = v.yaw;
    steps(sim, 90, () => { minUp = Math.min(minUp, v.upright); });
    expect(v.yaw - y1).toBeLessThan(-0.6);
    expect(minUp).toBeGreaterThan(0.9);
  });

  it('handbrake makes the hatchback slide (skid events)', () => {
    const { sim, v } = setup('hatchback');
    steps(sim, 60);
    v.startEngine();
    v.input.throttle = 1;
    for (let i = 0; i < 600 && v.speed < 16; i++) sim.step();
    sim.out = [];
    v.input.throttle = 0; v.input.steer = 1; v.input.handbrake = true;
    const y0 = v.yaw;
    steps(sim, 60);
    expect(customs(sim, 'vehicle:skid').length).toBeGreaterThan(2);
    expect(Math.abs(v.yaw - y0)).toBeGreaterThan(1);
    expect(v.upright).toBeGreaterThan(0.9);
  });

  it('a parked vehicle without driver does not drive', () => {
    const { sim, v } = setup('van');
    steps(sim, 60);
    v.input.throttle = 1; // engine off: ignored
    steps(sim, 120);
    expect(Math.abs(v.speed)).toBeLessThan(0.1);
  });

  it('is deterministic (same seed -> same final position)', () => {
    const run = () => {
      const { sim, v } = setup('hatchback', 40, 5);
      steps(sim, 60);
      v.startEngine();
      v.input.throttle = 1;
      steps(sim, 120);
      v.input.steer = -1; v.input.handbrake = true;
      steps(sim, 60);
      v.input.steer = 0.5; v.input.handbrake = false; v.input.throttle = -1;
      steps(sim, 90);
      const p = v.body.rb.translation(), r = v.body.rb.rotation();
      return [p.x, p.y, p.z, r.x, r.y, r.z, r.w];
    };
    expect(run()).toEqual(run());
  });
});

function wallSetup(id: string, mat: 'brick' | 'concrete', thick: number, kmh: number) {
  const sim = new Sim(1);
  ground(sim);
  const g = new VoxelGrid(60, 30, thick);
  g.fill(0, 0, 0, 60, 30, thick, mat === 'brick' ? bricks(MAT.brick) : shaded(MAT.concrete, 3));
  const wall = sim.addBody(g, { x: -3, y: 0, z: 0 }, { name: 'wall' });
  const face = thick * 0.1;
  const v = spawnVehicle(sim, id, 0, 0, face + 12, 0);
  steps(sim, 60);
  v.startEngine();
  // cruise at a fixed speed: half throttle and a top-up of the speed each tick until contact
  const sp = kmh / 3.6;
  const fw = v.forward;
  v.body.rb.setLinvel({ x: fw.x * sp, y: 0, z: fw.z * sp }, true);
  return { sim, v, wall, g, face };
}

describe('ramming', () => {
  it('van at 50 km/h breaks through a 2-voxel brick wall and keeps moving', () => {
    const { sim, v, g } = wallSetup('van', 'brick', 2, 50);
    const n0 = g.count;
    v.input.throttle = 0.3;
    steps(sim, 150);
    expect(n0 - g.count).toBeGreaterThan(400); // a hole
    // a ray through the wall at the van's path is free now
    expect(sim.raycast({ x: 0, y: 1.0, z: 3 }, { x: 0, y: 0, z: -1 }, 6, v.body, (b) => b.name === 'wall')).toBeNull();
    expect(v.com.z).toBeLessThan(-4); // out the other side
    expect(v.speedKmh).toBeGreaterThan(15);
    expect(v.upright).toBeGreaterThan(0.9);
    expect(v.body.removed).toBe(false);
    expect(customs(sim, 'vehicle:crash').length).toBeGreaterThan(0);
  });

  it('van at 50 km/h is stopped by a thick concrete wall without making a hole', () => {
    const { sim, v, g, face } = wallSetup('van', 'concrete', 8, 50);
    const n0 = g.count;
    v.input.throttle = 0.3;
    steps(sim, 150);
    expect(g.count).toBe(n0);
    expect(v.com.z).toBeGreaterThan(face);
    expect(Math.abs(v.speed)).toBeLessThan(2.5);
    // the front crumpled a bit
    expect(v.health).toBeLessThan(1);
    expect(v.body.removed).toBe(false);
  });

  it('the loader pushes through a brick wall at its top speed', () => {
    const { sim, v, g } = wallSetup('loader', 'brick', 3, 28);
    const n0 = g.count;
    v.input.throttle = 1;
    steps(sim, 240);
    expect(n0 - g.count).toBeGreaterThan(500);
    expect(v.com.z).toBeLessThan(-3);
  });
});

describe('damage', () => {
  it('an explosion next to the van lowers its health; it stays one drivable body', () => {
    const { sim, v } = setup('van', 20);
    steps(sim, 90);
    const id = v.body.id;
    const c = v.com;
    // a bomb against the side of the cargo box, low near the frame
    const side = v.right;
    sim.explode({ x: c.x + side.x * 1.05, y: 0.6, z: c.z + side.z * 1.05 }, 1.4);
    steps(sim, 90);
    expect(v.health).toBeLessThan(0.9);
    expect(v.health).toBeGreaterThan(0.4);
    expect(v.body.removed).toBe(false);
    expect(v.body.id).toBe(id);
    expect(v.body.grid.data[v.body.keepIndex]).toBeGreaterThan(0);
    expect(sim.bodies.get(id)?.kind).toBe('vehicle');
    // still drives
    v.startEngine();
    v.input.throttle = 1;
    steps(sim, 120);
    expect(v.dead).toBe(false);
    expect(v.speed).toBeGreaterThan(3);
  });

  it('a wrecked engine bay kills the vehicle (no drive force)', () => {
    const { sim, v } = setup('hatchback', 20);
    steps(sim, 60);
    const e = v.localToWorld({ x: 0.8, y: 0.45, z: 3.4 });
    // tear out the engine bay and the frame around it
    v.damageSelf(e, 1.2, 1.2, 1.2);
    const f = v.localToWorld({ x: 0.8, y: 0.05, z: 2.0 });
    v.damageSelf(f, 1.6, 1.6, 1.6);
    sim.out = [];
    steps(sim, 2);
    expect(v.health).toBeLessThan(0.3);
    v.startEngine();
    v.input.throttle = 1;
    steps(sim, 60);
    if (v.dead) {
      expect(Math.abs(v.speed)).toBeLessThan(1);
    } else {
      expect(customs(sim, 'vehicle:smoke').length).toBeGreaterThan(0);
    }
  });

  it('a flooded vehicle stalls', () => {
    const { sim, v } = setup('hatchback', 20);
    VehicleSystem.of(sim).waterLevel = 1.4;
    steps(sim, 30);
    expect(v.drowned).toBe(true);
    expect(customs(sim, 'vehicle:stall').length).toBe(1);
    v.startEngine();
    expect(v.engineOn).toBe(false);
  });

  it('flip assist puts a vehicle on its roof back on its wheels', () => {
    const { sim, v } = setup('hatchback', 20);
    steps(sim, 30);
    const t = v.body.rb.translation();
    v.body.rb.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true); // upside down (180 deg around Z)
    v.body.rb.setTranslation({ x: t.x + 1.6, y: 2.2, z: t.z }, true);
    steps(sim, 120);
    expect(v.upright).toBeLessThan(-0.5);
    expect(v.canFlip).toBe(true);
    v.flip();
    steps(sim, 120);
    expect(v.upright).toBeGreaterThan(0.98);
    expect(v.grounded).toBe(4);
  });
});
