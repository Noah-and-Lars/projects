// Integration test: the real Rapier backend + heightfield + vehicle sim, headless in Node.
import { describe, it, expect } from 'vitest';
import { SimHost } from './sim-host';
import { RapierBackend } from './rapier-backend';
import { serialize } from '../sim-core/vehicle-format';
import { runabout } from '../sim-core/presets';
import { NO_CONTROLS } from '../sim-core/vehicle-sim';
import { heightAt } from '../sim-core/terrain';
import { qrot } from '../sim-core/math';

describe('SimHost with Rapier', () => {
  it('raycasts the heightfield exactly where sim-core says the ground is', async () => {
    const host = new SimHost(new RapierBackend());
    await host.init({ size: 1536, res: 129, seed: 7 });
    for (const [x, z] of [[10.3, 330.7], [-200.2, 100.9], [120.6, -50.1], [33.3, 44.4]]) {
      const hit = host.backend.raycast([x, 500, z], [0, -1, 0], 1000)!;
      expect(500 - hit.dist).toBeCloseTo(heightAt(host.terrain, x, z), 3);
    }
  });

  it('spawns the starter car on the pad, settles, and drives off', async () => {
    const host = new SimHost(new RapierBackend());
    await host.init({ size: 1536, res: 193, seed: 7 });
    const info = host.spawn(1, serialize(runabout(), 'r'));
    expect(info.wheels.length).toBe(4);
    for (let i = 0; i < 120; i++) host.tick();
    let snap = host.snapshot()[0];
    expect(snap.telem.grounded).toBe(4);
    expect(Math.abs(snap.telem.speed)).toBeLessThan(0.2);
    const z0 = snap.data[2];
    host.setControls(1, { ...NO_CONTROLS, throttle: 1 });
    for (let i = 0; i < 300; i++) host.tick();
    snap = host.snapshot()[0];
    expect(snap.telem.speed).toBeGreaterThan(10);
    expect(snap.data[2]).toBeLessThan(z0 - 20);
    const up = qrot([snap.data[3], snap.data[4], snap.data[5], snap.data[6]], [0, 1, 0]);
    expect(up[1]).toBeGreaterThan(0.7);
  });

  it('reset puts a flipped car back on its wheels', async () => {
    const host = new SimHost(new RapierBackend());
    await host.init({ size: 1536, res: 97, seed: 7 });
    host.spawn(1, serialize(runabout(), 'r'));
    const v = host.vehicles.get(1)!;
    const p = host.backend.getPose(v.body);
    host.backend.setPose(v.body, [p.pos[0], p.pos[1] + 2, p.pos[2]], [1, 0, 0, 0], true);
    for (let i = 0; i < 120; i++) host.tick();
    host.reset(1);
    for (let i = 0; i < 180; i++) host.tick();
    const s = host.snapshot()[0];
    expect(s.telem.grounded).toBe(4);
  });
});
