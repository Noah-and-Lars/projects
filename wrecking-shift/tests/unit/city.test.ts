// Corvane City: the large procedural city builds, has a street under the spawn, lots of buildings in every
// district, parked cars, and the player can walk at the spawn.
import { beforeAll, describe, expect, it } from 'vitest';
import { Sim, initPhysics } from '../../src/sim/sim';
import { city } from '../../src/sim/levels/city';
import { Player } from '../../src/sim/player';
import { VehicleSystem } from '../../src/sim/vehicle';
import { MAT } from '../../src/sim/materials';

beforeAll(async () => { await initPhysics(); });

describe('Corvane City', () => {
  it('builds a ~300 m city with towers, apartments, houses, warehouses and cars', () => {
    const sim = new Sim(1);
    const info = city.build(sim);
    const b = info.bounds;
    expect(b.max.x - b.min.x).toBeGreaterThan(280);
    const names = new Map<string, number>();
    for (const body of sim.bodies.values()) names.set(body.name, (names.get(body.name) ?? 0) + 1);
    expect(names.get('office tower')).toBeGreaterThanOrEqual(12);
    expect(names.get('apartment block')).toBeGreaterThanOrEqual(20);
    expect(names.get('house')).toBeGreaterThanOrEqual(60);
    expect(names.get('warehouse')).toBeGreaterThanOrEqual(3);
    expect(VehicleSystem.of(sim).list.length).toBeGreaterThanOrEqual(15);
    sim.step();
    const down = sim.raycast({ x: info.spawn.x, y: 2, z: info.spawn.z }, { x: 0, y: -1, z: 0 }, 5);
    expect(down && down.palette >> 3).toBe(MAT.asphalt);
    const p = new Player(sim, info.spawn);
    p.input.moveZ = 1;
    for (let i = 0; i < 90; i++) { p.update(); sim.step(); }
    expect(p.pos.z).toBeLessThan(info.spawn.z - 3); // walked north along the street
    expect(p.pos.y).toBeGreaterThan(-0.5);
    sim.dispose();
  });
});
