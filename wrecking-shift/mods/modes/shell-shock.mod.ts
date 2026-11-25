import { MAT, VoxelGrid, box, clear, defineMod, levelKit, shaded, siteMap, survive } from '../../src/mods/kit';
import { TPS, telegraphBlast } from '../maps/_util';

const { addStatic, makeBuilding, placeBuilding, crate, barrel, rock, wallSeg, container } = levelKit;

const SECONDS = 75;

/** Survive a bombardment that follows you around: every blast is marked by a glowing post first. */
export default defineMod({
  id: 'shell-shock', name: 'Shell Shock', category: 'modes', author: 'Wrecking Shift',
  description: 'Bombs rain on Cobble Flats and they are aimed at you. A red post marks each one a second and a half before it lands. Keep moving for 75 seconds.',
  maps: [siteMap({
    id: 'cobble-flats', title: 'Cobble Flats', blurb: 'bunkers and cover', ground: MAT.dirt, sky: 'overcast', seed: 241,
    spawn: { x: 0, y: 0.05, z: 0 }, spawnYaw: 0,
    build(sim, rng) {
      // concrete bunkers with two openings each
      for (const [x, z] of [[-14, -14], [10, -16], [-16, 10], [12, 12]]) {
        const g = new VoxelGrid(50, 28, 40);
        box(g, 0, 0, 0, 50, 28, 40, shaded(MAT.concrete, 4, x * z));
        clear(g, 4, 0, 4, 46, 24, 36);
        clear(g, 20, 0, 0, 30, 20, 4); clear(g, 0, 0, 16, 4, 20, 24);
        clear(g, 10, 14, 36, 40, 18, 40); // firing slit
        addStatic(sim, g, x, -0.2, z, 'bunker');
      }
      placeBuilding(sim, makeBuilding({ w: 70, d: 60, floors: 2, wall: MAT.brick, lining: MAT.plaster, roof: 'flat', doors: 'nsew', winStep: 20, seed: 7 }), -3.5, 0, -22, 'watch house');
      for (const [x, z, l, along] of [[-6, 6, 5, false], [3, -6, 5, true], [-22, -2, 6, true], [18, -3, 6, true], [-4, 18, 8, false]] as const) wallSeg(sim, x, 0, z, l, along, 1.2, 3, MAT.brick);
      container(sim, 4, 0, 18, MAT.paintedmetal);
      container(sim, -21, 0, 20, MAT.plastic, true);
      for (let i = 0; i < 10; i++) { const x = rng.range(-22, 22), z = rng.range(-22, 22); if (Math.hypot(x, z) > 5) rock(sim, x, 0, z, 5 + (i % 5), i); }
      for (let i = 0; i < 6; i++) crate(sim, rng.range(-8, 8), 0.05, rng.range(8, 14), 8);
      for (let i = 0; i < 3; i++) barrel(sim, 20, 0.05, 6 + i * 0.8, false);
    },
  })],
  modes: [{
    id: 'shell-shock', title: 'Shell Shock', level: 'cobble-flats',
    rules: ['Bombs fall around you, faster and faster.', 'A glowing red post marks each landing point 1.5 s before the blast.', `Stay alive for ${SECONDS} seconds. Bunkers help, but they do not last.`],
    create: () => {
      let next = Math.round(TPS * 1.5);
      return survive({
        seconds: SECONDS, label: 'Incoming',
        hazard: ({ sim, player }, t) => {
          if (t < next) return;
          // interval shrinks from 2.6 s to 0.9 s over the round; later blasts are bigger and land closer
          const k = Math.min(1, t / (SECONDS * TPS));
          next = t + Math.round(TPS * (2.6 - 1.7 * k));
          telegraphBlast(sim, player.pos, 0.5, 7 - 3 * k, 1.1 + 0.5 * k, Math.round(TPS * 1.5));
        },
      });
    },
  }],
});
