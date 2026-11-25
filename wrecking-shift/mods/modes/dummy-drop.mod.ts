import { MAT, VoxelGrid, box, defineMod, levelKit, planks, shaded, siteMap, topple } from '../../src/mods/kit';
import { dummy } from '../maps/_util';

const { makeBuilding, placeBuilding, addStatic, crate, barrel, fence, wallSeg, hedge, tree } = levelKit;

/** where the dummies stand: in the open, behind walls, in the barn, around the far hedge maze */
const SPOTS: [number, number][] = [[-6, 0], [4, 2], [12, -6], [-20, -4], [-3, -10], [8, -12], [-18, -16], [17, -17], [-1, -19], [-9, 14], [18, 8], [-20, 6]];

/** Knock over every target dummy on the training ground. */
export default defineMod({
  id: 'dummy-drop', name: 'Dummy Drop', category: 'modes', author: 'Wrecking Shift',
  description: 'Twelve straw target dummies stand around Thornbury training ground: in the open, behind walls and in the old barn. Knock every one flat within 90 seconds.',
  maps: [siteMap({
    id: 'thornbury-range', title: 'Thornbury Range', blurb: 'training ground with dummies', ground: MAT.grass, sky: 'day', seed: 261,
    spawn: { x: 0, y: 0.05, z: 20 }, spawnYaw: 0,
    build(sim) {
      for (let i = 0; i < SPOTS.length; i++) dummy(sim, SPOTS[i][0], 0.05, SPOTS[i][1], i, 'dummy');
      // cover: brick walls, a timber barn the far dummy hides in, sandbag-ish crates
      wallSeg(sim, -8, 0, 2, 4, false, 1.4, 3, MAT.brick);
      wallSeg(sim, 10, 0, -4, 4, false, 1.8, 3, MAT.concrete, MAT.concrete);
      wallSeg(sim, -17, 0, -7, 6, true, 1.6, 3, MAT.brick);
      placeBuilding(sim, makeBuilding({ w: 70, d: 60, floors: 1, floorH: 40, wall: MAT.wood, roof: 'gable', roofMat: MAT.sheetmetal, doors: 's', doorW: 24, doorH: 30, winW: 0, seed: 5 }), -4.5, 0, -23, 'barn');
      hedge(sim, 14, 0, -22, 8, 1, 1.6); hedge(sim, 14, 0, -13, 8, 1, 1.6);
      // firing line
      const fl = new VoxelGrid(120, 10, 10);
      box(fl, 0, 0, 0, 120, 10, 10, planks(MAT.wood, 4, 2));
      addStatic(sim, fl, -6, -0.1, 15, 'firing bench');
      for (let i = 0; i < 6; i++) crate(sim, -5 + i * 1.8, 0.95, 15.1, 7);
      for (let i = 0; i < 4; i++) barrel(sim, 22, 0.05, -4 + i * 0.8, true);
      fence(sim, -25, 0, -25.4, 50, false, MAT.wood, 12);
      const tw = new VoxelGrid(30, 60, 30);
      for (const [a, b] of [[0, 0], [27, 0], [0, 27], [27, 27]]) box(tw, a, 0, b, a + 3, 50, b + 3, shaded(MAT.wood, 2, 1));
      box(tw, 0, 50, 0, 30, 52, 30, planks(MAT.wood, 3, 2));
      for (let y = 0; y < 50; y += 3) box(tw, 13, y, 0, 17, y + 1, 1, shaded(MAT.wood, 2, 3));
      addStatic(sim, tw, 20, -0.1, 14, 'watch tower');
      for (const [x, z] of [[-22, 18], [-23, -10], [23, -22]]) tree(sim, x, 0, z, x | 0, 0.9);
    },
  })],
  modes: [{
    id: 'dummy-drop', title: 'Dummy Drop', level: 'thornbury-range', infiniteAmmo: true,
    rules: ['Twelve target dummies stand around the range.', 'Knock every one over (its top below 1.2 m) or blow it apart within 90 seconds.', 'Every tool, infinite ammo.'],
    create: () => topple({ tag: 'dummy', below: 1.2, seconds: 90, label: 'Dummies down' }),
  }],
});
