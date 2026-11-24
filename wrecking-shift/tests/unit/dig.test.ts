import { beforeAll, describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/game/levels';
import { MAT, PAL_RGB, pal } from '../../src/sim/materials';
import { Sim, initPhysics } from '../../src/sim/sim';

beforeAll(async () => { await initPhysics(); });

// "when I destroy something like the ground it shows below the map": crater floors (the unbreakable layer 0.5 m down)
// rendered near-black and read as a hole into the void
describe('digging into the terrain', () => {
  it('never opens the ground, and the crater floor looks like earth', () => {
    const sim = new Sim(1);
    LEVELS.harbor.build(sim);
    for (const [x, z] of [[6, -45], [12.83, -38.37], [-20, 10]]) { // the second one sits on a four-tile seam
      const h0 = sim.raycast({ x, y: 40, z }, { x: 0, y: -1, z: 0 }, 80)!;
      for (let k = 0; k < 6; k++) sim.carve({ x, y: h0.point.y - k * 0.4, z }, 1.5, 1.2, 0.8, { silent: true });
      sim.step();
      for (let dx = -1; dx <= 1; dx += 0.25) {
        const h = sim.raycast({ x: x + dx, y: 40, z }, { x: 0, y: -1, z: 0 }, 80);
        expect(h, `ground below ${x + dx},${z}`).not.toBeNull();
        expect(h!.body.tags.has('terrain')).toBe(true);
      }
    }
    const lum = (p: number) => 0.2126 * PAL_RGB[p * 3] + 0.7152 * PAL_RGB[p * 3 + 1] + 0.0722 * PAL_RGB[p * 3 + 2];
    expect(lum(pal(MAT.bedrock, 2))).toBeGreaterThan(0.8 * lum(pal(MAT.dirt, 2)));
  }, 60000);
});
