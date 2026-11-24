import { beforeAll, describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/game/levels';
import { MAT, pal } from '../../src/sim/materials';
import { Player } from '../../src/sim/player';
import { Sim, initPhysics } from '../../src/sim/sim';
import { VoxelGrid } from '../../src/sim/voxels';

beforeAll(async () => { await initPhysics(); });

/** largest eye movement (m) over `ticks` ticks without input */
function eyeDrift(sim: Sim, p: Player, ticks: number): number {
  const e0 = p.eye; let r = 0;
  for (let i = 0; i < ticks; i++) {
    p.update(); sim.step();
    const e = p.eye;
    r = Math.max(r, Math.abs(e.x - e0.x), Math.abs(e.y - e0.y), Math.abs(e.z - e0.z));
  }
  return r;
}

// "the ground is glitched even when I am standing still": Rapier's controller nudged a standing player by
// 0.1 mm every tick (and made it creep on terraced slopes); every sub-pixel edge of the distant ground flickered.
describe('a standing player keeps the camera perfectly still', () => {
  it('on flat ground, on a 1:2 voxel staircase slope, and after walking', () => {
    const sim = new Sim(1);
    const g = new VoxelGrid(120, 40, 60);
    g.fill(0, 0, 0, 120, 4, 60, pal(MAT.grass));
    for (let x = 40; x < 120; x++) g.fill(x, 4, 0, x + 1, 4 + ((x - 40) >> 1), 60, pal(MAT.grass)); // 1 voxel up every 2
    sim.addBody(g, { x: -4, y: -0.4, z: -3 });
    const p = new Player(sim, { x: 0, y: 0.05, z: 0 });
    for (let i = 0; i < 120; i++) { p.update(); sim.step(); }
    expect(eyeDrift(sim, p, 240)).toBe(0);
    for (const x of [1.5, 3.3, 5.05, 6.77]) { // on the slope, at and between steps
      p.teleport({ x, y: (4 + Math.max(0, Math.floor((x + 4) / 0.1) - 40) / 2) * 0.1 - 0.4 + 0.15, z: 0 });
      for (let i = 0; i < 120; i++) { p.update(); sim.step(); }
      expect(eyeDrift(sim, p, 240), 'slope x=' + x).toBe(0);
    }
    // walk, stop, settle: still again
    p.teleport({ x: 0, y: 0.05, z: 0 });
    p.yaw = -Math.PI / 2; // face +x (up the slope)
    for (let i = 0; i < 90; i++) { p.input.moveZ = 1; p.update(); sim.step(); }
    expect(p.pos.x).toBeGreaterThan(5);
    p.input.moveZ = 0;
    for (let i = 0; i < 90; i++) { p.update(); sim.step(); }
    expect(eyeDrift(sim, p, 240)).toBe(0);
  });

  it('at spawn and around it on the big maps', () => {
    for (const id of ['harbor', 'ridge', 'works']) {
      const sim = new Sim(1);
      const info = LEVELS[id].build(sim);
      const p = new Player(sim, info.spawn);
      for (let k = 0; k < 6; k++) {
        const x = info.spawn.x + ((k % 3) - 1) * 9, z = info.spawn.z + (Math.floor(k / 3) - 0.5) * 9;
        const h = sim.raycast({ x, y: 60, z }, { x: 0, y: -1, z: 0 }, 120);
        if (!h) continue;
        p.teleport({ x, y: h.point.y + 0.1, z });
        for (let i = 0; i < 150; i++) { p.update(); sim.step(); }
        expect(eyeDrift(sim, p, 180), `${id} ${x.toFixed(1)},${z.toFixed(1)}`).toBe(0);
      }
    }
  }, 120000);
});
