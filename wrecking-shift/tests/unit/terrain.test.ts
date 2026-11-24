import { beforeAll, describe, expect, it } from 'vitest';
import { Sim, initPhysics } from '../../src/sim/sim';
import { Heightmap, buildTerrain, fbm2 } from '../../src/sim/levels/terrain';
import { Player } from '../../src/sim/player';

beforeAll(async () => { await initPhysics(); });

describe('terrain', () => {
  it('builds tiles, pads are flat, player walks on it', () => {
    const sim = new Sim(1);
    const hm = new Heightmap((x, z) => fbm2(x * 0.03, z * 0.03, 5) * 6 - 1).addPad(10, 10, 20, 20, 2.0, 3);
    const t0 = performance.now();
    const ter = buildTerrain(sim, { x0: 0, z0: 0, tilesX: 2, tilesZ: 2, tile: 128, heightmap: hm, waterLevel: 0 });
    const ms = performance.now() - t0;
    expect(ter.bodies.length).toBe(4);
    expect(ter.heightAt(15, 15)).toBeCloseTo(2.0, 5);
    expect(ms).toBeLessThan(4000);
    // ray from the sky hits the surface at the reported height
    const hit = sim.raycast({ x: 7.33, y: 50, z: 18.21 }, { x: 0, y: -1, z: 0 }, 100)!;
    expect(hit.point.y).toBeCloseTo(ter.heightAt(7.33, 18.21), 3);
    const p = new Player(sim, { x: 15, y: 2.3, z: 15 });
    p.input.moveZ = 1;
    for (let i = 0; i < 120; i++) { p.update(); sim.step(); }
    expect(p.grounded).toBe(true);
    expect(p.pos.z).toBeLessThan(11);
    expect(Math.abs(p.pos.y - ter.heightAt(p.pos.x, p.pos.z))).toBeLessThan(0.3);
  });
});
