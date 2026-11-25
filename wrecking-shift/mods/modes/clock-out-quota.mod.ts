import { MAT, defineMod, levelKit, shaded, siteMap, wreckQuota } from '../../src/mods/kit';
import { slab } from '../maps/_util';

const { makeBuilding, placeBuilding, tree, fence, crate, barrel, sofa, table, bookcase } = levelKit;

/** Timed wrecking quota on a short terrace street. */
export default defineMod({
  id: 'clock-out-quota', name: 'Clock-Out Quota', category: 'modes', author: 'Wrecking Shift',
  description: 'The demolition contract pays by the voxel and the shift ends in two minutes. Break 8000 voxels of Pellow Row before you clock out.',
  maps: [siteMap({
    id: 'pellow-row', title: 'Pellow Row', blurb: 'terrace street for the quota', ground: MAT.grass, sky: 'sunset', seed: 201,
    spawn: { x: 0, y: 0.05, z: 18 }, spawnYaw: 0,
    build(sim, rng) {
      slab(sim, -25.6, 0, 6, 51.2, 5, shaded(MAT.asphalt, 6, 1), 'street');
      const walls = [MAT.brick, MAT.wood, MAT.brick, MAT.concrete, MAT.brick];
      for (let i = 0; i < 5; i++) {
        const x = -22 + i * 9;
        placeBuilding(sim, makeBuilding({ w: 80, d: 70, floors: 2, wall: walls[i], lining: MAT.plaster, roof: i % 2 ? 'flat' : 'gable', roofMat: MAT.tile, doors: 's', partitions: true, lamps: true, winStep: 22, seed: 40 + i }), x, 0, -6, 'terrace');
        sofa(sim, x + 1, 0.15, -5, 0, MAT.fabric);
        table(sim, x + 4, 0.15, -3);
        bookcase(sim, x + 1, 3.15, -5.6, 0, i);
      }
      for (let i = 0; i < 5; i++) placeBuilding(sim, makeBuilding({ w: 40, d: 40, floors: 1, wall: MAT.wood, roof: 'gable', roofMat: MAT.sheetmetal, doors: 'n', winW: 0, seed: 60 + i }), -21 + i * 9, 0, -16, 'shed');
      fence(sim, -25, 0, -10.5, 50, false, MAT.wood, 12);
      for (let i = 0; i < 6; i++) tree(sim, -22 + i * 9, 0, 13, i, 0.8);
      for (let i = 0; i < 8; i++) crate(sim, rng.range(-20, 20), 0.15, rng.range(6.5, 10), 8);
      for (let i = 0; i < 4; i++) barrel(sim, -18 + i * 11, 0.15, 10.5, true);
    },
  })],
  modes: [{
    id: 'clock-out-quota', title: 'Clock-Out Quota', level: 'pellow-row', infiniteAmmo: true,
    rules: ['Pellow Row is due for demolition and you are paid per voxel.', 'Break 8000 voxels of buildings and props in 120 seconds.', 'Digging the ground does not count. Every tool, infinite ammo.'],
    create: () => wreckQuota({ seconds: 120, target: 8000, label: 'Wrecked', filter: (b) => b.name !== 'ground' && b.name !== 'street' }),
  }],
});
