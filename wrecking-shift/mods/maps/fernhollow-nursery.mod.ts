import { MAT, VoxelGrid, box, bricks, clear, cylinderY, defineMod, levelKit, pal, planks, shaded, siteMap } from '../../src/mods/kit';
import { van } from '../../src/sim/prefabs/vehicles';
import { glasshouse, slab } from './_util';

const { makeBuilding, placeBuilding, addStatic, plant, hedge, tree, fence, table, shelf, crate } = levelKit;

/** A plant nursery of long glasshouses and a palm-house dome: almost everything here shatters. */
export default defineMod({
  id: 'fernhollow-nursery', name: 'Fernhollow Nursery', category: 'maps', author: 'Wrecking Shift',
  description: 'Rows of long glasshouses, a domed palm house and a brick boiler shed with its stack. A paradise for anyone who likes the sound of breaking glass.',
  maps: [siteMap({
    id: 'fernhollow-nursery', title: 'Fernhollow Nursery', blurb: 'glasshouses everywhere', half: 38.4, ground: MAT.grass, sky: 'day',
    spawn: { x: 0, y: 0.05, z: 32 }, spawnYaw: 0, seed: 51,
    build(sim, rng) {
      // gravel paths
      slab(sim, -2, 0, -34, 4, 70, shaded(MAT.sand, 6, 1), 'path');
      slab(sim, -34, 0, -2, 68, 3, shaded(MAT.sand, 6, 2), 'path');

      // four long glasshouses, doors facing the central path
      const rows: [number, number, number][] = [[-30, -30, 1], [-30, -16, 2], [5, -30, 3], [5, -16, 4]];
      for (const [x, z, s] of rows) {
        glasshouse(sim, x, 0, z, 240, 80, 26, s);
        for (let i = 0; i < 6; i++) plant(sim, x + 1 + i * 3.8, 0.95, z + 0.9, s * 10 + i);
        for (let i = 0; i < 6; i++) plant(sim, x + 1 + i * 3.8, 0.95, z + 6.9, s * 20 + i);
      }
      // a smaller lean-to on the east side of the path
      glasshouse(sim, 6, 0, 4, 120, 50, 22, 7);

      // palm house: glass dome on a brick drum
      const R = 56, S = R * 2 + 2, c = S / 2;
      const dome = new VoxelGrid(S, R + 24, S);
      cylinderY(dome, c, c, R, 0, 3, shaded(MAT.concrete, 3, 5));
      cylinderY(dome, c, c, R, 3, 9, bricks(MAT.brick, 5), 2);
      cylinderY(dome, c, c, R, 9, 24, pal(MAT.glass, 2), 1);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        for (let y = 3; y < 24; y++) dome.set(Math.floor(c + Math.cos(a) * (R - 0.5)), y, Math.floor(c + Math.sin(a) * (R - 0.5)), pal(MAT.steel, 2));
      }
      for (let i = 0; i < R; i++) {
        const r = Math.sqrt(R * R - i * i);
        cylinderY(dome, c, c, r + 0.5, 24 + i, 25 + i, (xx, _yy, zz) => (Math.round(Math.atan2(zz - c, xx - c) * 8 / Math.PI * 2) % 4 === 0 ? pal(MAT.steel, 2) : pal(MAT.glass, 2)), 1.5);
        if (24 + i >= R + 23) break;
      }
      clear(dome, c - 6, 3, S - 4, c + 6, 25, S);
      addStatic(sim, dome, -31, -0.3, 5, 'palm house', ['glasshouse']);
      for (let i = 0; i < 4; i++) tree(sim, -26 + (i % 2) * 3, 0.1, 9 + (i >> 1) * 3, 70 + i, 0.75);

      // boiler shed with a brick stack
      placeBuilding(sim, makeBuilding({ w: 80, d: 60, floors: 1, floorH: 40, wall: MAT.brick, roof: 'gable', roofMat: MAT.tile, doors: 'w', winStep: 26, seed: 8 }), 24, 0, 6, 'boiler house');
      const st = new VoxelGrid(16, 150, 16);
      cylinderY(st, 8, 8, 7.5, 0, 150, bricks(MAT.brick, 6), 2.5);
      addStatic(sim, st, 32.5, -0.2, 13, 'stack', ['stack']);

      // shop / potting shed by the gate
      placeBuilding(sim, makeBuilding({ w: 90, d: 50, floors: 1, wall: MAT.wood, roof: 'gable', roofMat: MAT.sheetmetal, doors: 'w', lamps: true, winStep: 20, seed: 9 }), 6, 0, 20, 'shop');
      for (let i = 0; i < 3; i++) shelf(sim, 8 + i * 2.4, 0.15, 23.5);
      table(sim, 12, 0.15, 21);
      // outdoor plant tables
      for (let t = 0; t < 4; t++) {
        const tb = new VoxelGrid(30, 8, 12);
        box(tb, 0, 7, 0, 30, 8, 12, planks(MAT.wood, 3, t));
        for (const [lx, lz] of [[0, 0], [29, 0], [0, 11], [29, 11]]) box(tb, lx, 0, lz, lx + 1, 7, lz + 1, pal(MAT.wood, 0));
        addStatic(sim, tb, -18 + t * 4, -0.1, 22, 'plant table');
        for (let i = 0; i < 4; i++) plant(sim, -17.8 + t * 4 + i * 0.7, 0.75, 22.3, t * 4 + i);
      }
      // rain water tank
      const wt = new VoxelGrid(26, 34, 26);
      cylinderY(wt, 13, 13, 12, 0, 30, shaded(MAT.plastic, 4, 2), 1);
      cylinderY(wt, 13, 13, 12, 29, 30, shaded(MAT.plastic, 4, 2));
      addStatic(sim, wt, 30, -0.2, -4, 'water tank');

      hedge(sim, -36, 0, 30, 32, 1);
      hedge(sim, 4, 0, 30, 32, 1);
      fence(sim, -38.2, 0, -38.2, 76, true, MAT.wood, 12);
      fence(sim, 38, 0, -38.2, 76, true, MAT.wood, 12);
      for (let i = 0; i < 6; i++) crate(sim, rng.range(-12, -6), 0.05, rng.range(26, 28), 7);
      van(sim, 18, 0.1, 34, Math.PI / 2);
    },
  })],
});
