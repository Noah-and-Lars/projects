import { MAT, VoxelGrid, box, collect, defineMod, flat, levelKit, planks, shaded, siteMap } from '../../src/mods/kit';
import type { V3 } from '../../src/sim/vec';
import { slab, token } from '../maps/_util';

const { makeBuilding, placeBuilding, addStatic, container, stairs, crate, barrel, tree, hedge, fence } = levelKit;

/** token spots: ground, inside houses (ground + upper floor), on a container stack and a roof terrace */
const SPOTS: V3[] = [
  { x: -16, y: 0.1, z: 14 }, { x: 15, y: 0.1, z: 16 }, { x: 0, y: 0.1, z: -21 },
  { x: -15, y: 0.1, z: -9 }, { x: -17, y: 3.1, z: -11 },          // brick house, both floors
  { x: 14, y: 0.1, z: -9 }, { x: 13, y: 3.1, z: -11 },              // timber house, both floors
  { x: 1.2, y: 2.6, z: 4.8 }, { x: 7.6, y: 5.2, z: 4.8 },          // container stack
  { x: 0, y: 6.1, z: -16.5 },                                     // roof terrace of the hall
  { x: -21, y: 0.1, z: 2 }, { x: 21, y: 0.1, z: 3 },
];

/** Gold token hunt around a small square: on the ground, in houses, on a container stack and a roof terrace. */
export default defineMod({
  id: 'gilded-sweep', name: 'Gilded Sweep', category: 'modes', author: 'Wrecking Shift',
  description: 'Twelve gold tokens hidden around Brassgate Square: in houses, up a container stack, on a roof terrace. Grab them all in two minutes, and do not blow any up.',
  maps: [siteMap({
    id: 'brassgate-square', title: 'Brassgate Square', blurb: 'token hunt square', ground: MAT.grass, sky: 'day', seed: 231,
    spawn: { x: 0, y: 0.05, z: 20 }, spawnYaw: 0,
    build(sim, rng) {
      slab(sim, -10, 0, -6, 20, 20, (x, _y, z) => shaded(MAT.concrete, 5, 2)(x, 0, z), 'square');
      placeBuilding(sim, makeBuilding({ w: 80, d: 60, floors: 2, wall: MAT.brick, lining: MAT.plaster, roof: 'gable', roofMat: MAT.tile, doors: 'e', partitions: true, lamps: true, seed: 3 }), -20, 0, -14, 'brick house');
      placeBuilding(sim, makeBuilding({ w: 70, d: 60, floors: 2, wall: MAT.wood, lining: MAT.plaster, roof: 'gable', roofMat: MAT.sheetmetal, doors: 'w', partitions: true, lamps: true, seed: 4 }), 11, 0, -14, 'timber house');
      // hall with a roof terrace reached by an outside stair on its west side
      const hall = makeBuilding({ w: 80, d: 50, floors: 2, wall: MAT.concrete, lining: MAT.plaster, roof: 'flat', doors: 's', winStep: 20, lamps: true, seed: 5 });
      placeBuilding(sim, hall, -4, 0, -19, 'hall');
      const st = new VoxelGrid(20, 64, 95);
      stairs(st, 'z', 95, -1, 0, 20, 0, 62, flat(MAT.steel));
      addStatic(sim, st, -6, -0.1, -19, 'outside stair');
      // container stack with crate steps up the side
      container(sim, -1.8, 0, 3.6, MAT.paintedmetal);
      container(sim, 4.6, 0, 3.6, MAT.plastic);
      container(sim, 4.6, 2.6, 3.6, MAT.sheetmetal);
      const steps = new VoxelGrid(30, 23, 10);
      box(steps, 0, 0, 0, 10, 9, 10, planks(MAT.wood, 2, 1)); box(steps, 10, 0, 0, 20, 17, 10, planks(MAT.wood, 2, 2)); box(steps, 20, 0, 0, 30, 23, 10, planks(MAT.wood, 2, 3));
      addStatic(sim, steps, -4, -0.1, 6.2, 'steps');
      // long timber stair up to the top container (5.2 m), climbing toward -z
      const ls = new VoxelGrid(20, 53, 78);
      stairs(ls, 'z', 78, -1, 0, 20, 0, 53, planks(MAT.wood, 3, 4, 'z'), 6);
      addStatic(sim, ls, 7.6, -0.1, 6.0, 'stair');
      for (let i = 0; i < 6; i++) crate(sim, rng.range(-8, 5), 0.05, rng.range(9, 12), 8);
      barrel(sim, 12, 0.05, 10, true);
      barrel(sim, -9, 0.05, 10, true);
      hedge(sim, -24, 0, 8, 10, 0.8); hedge(sim, 14, 0, 8, 10, 0.8);
      fence(sim, -25, 0, -25, 50, false, MAT.wood, 12);
      for (const [x, z] of [[-18, 18], [18, 20], [-22, -22], [22, -22]]) tree(sim, x, 0, z, (x + z) | 0, 0.9);
    },
  })],
  modes: [{
    id: 'gilded-sweep', title: 'Gilded Sweep', level: 'brassgate-square', infiniteAmmo: true,
    rules: ['Twelve gold tokens are hidden around Brassgate Square.', 'Walk into a token to pick it up. A destroyed token is lost for good.', 'Collect them all within 120 seconds (time left is bonus score).'],
    create: () => collect({ seconds: 120, name: 'Tokens', spots: SPOTS, spawn: (sim, p, i) => token(sim, p, i) }),
  }],
});
