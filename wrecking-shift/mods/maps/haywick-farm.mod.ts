import { MAT, VoxelGrid, box, clear, defineMod, flat, levelKit, pal, planks, shaded, siteMap } from '../../src/mods/kit';
import { loader, van } from '../../src/sim/prefabs/vehicles';
import { silo, slab } from './_util';

const { makeBuilding, placeBuilding, addStatic, addProp, fence, tree, lattice, cylinderZ, crate, barrel, hedge } = levelKit;

/** round hay bale (dynamic, rolls) */
function bale(sim: Parameters<typeof addProp>[0], x: number, y: number, z: number, seed: number) {
  const g = new VoxelGrid(12, 12, 10);
  cylinderZ(g, 6, 6, 6, 0, 10, (xx, yy) => pal(MAT.crate, (xx * 3 + yy * 5 + seed) % 5));
  return addProp(sim, g, x, y, z, 'hay bale', seed * 0.7);
}

/** A working farmstead: timber barn with a hayloft, two silos, a farmhouse, sheds and paddocks. */
export default defineMod({
  id: 'haywick-farm', name: 'Haywick Farm', category: 'maps', author: 'Wrecking Shift',
  description: 'A farmstead on open pasture: a big timber barn full of hay, twin grain silos, a brick farmhouse, a wind pump and fenced paddocks.',
  maps: [siteMap({
    id: 'haywick-farm', title: 'Haywick Farm', blurb: 'barns, silos, paddocks', half: 38.4, ground: MAT.grass, sky: 'sunset',
    spawn: { x: 4, y: 0.05, z: 30 }, spawnYaw: 0, seed: 31,
    build(sim, rng) {
      // farmyard
      slab(sim, -20, 0, -10, 36, 26, shaded(MAT.dirt, 6, 3), 'farmyard');
      slab(sim, 2, 0, 16, 4, 22, shaded(MAT.dirt, 6, 4), 'track');

      // big barn: tall single storey, open both ends, hayloft inside
      const bw = 150, bd = 100;
      const barn = makeBuilding({ w: bw, d: bd, floors: 1, floorH: 56, wall: MAT.wood, wallT: 2, roof: 'gable', roofMat: MAT.sheetmetal, doors: 'ns', doorW: 40, doorH: 40, winW: 8, winH: 8, sill: 30, winStep: 30, seed: 3 });
      // hayloft deck along the back half + ladder
      box(barn, 2, 31, 50, bw - 2, 33, bd - 2, planks(MAT.wood, 4, 6));
      for (const x of [30, 70, 110]) box(barn, x, 3, 48, x + 2, 31, 50, pal(MAT.wood, 0));
      for (let y = 3; y < 31; y += 3) box(barn, 20, y, 49, 26, y + 1, 50, pal(MAT.wood, 2));
      placeBuilding(sim, barn, -22, 0, -24, 'barn');
      for (let i = 0; i < 6; i++) bale(sim, -20 + i * 1.3, 3.4, -18 + (i % 2) * 1.2, i);
      for (let i = 0; i < 5; i++) bale(sim, -12 + i * 1.3, 0.15, -21.5, i + 9);

      // silos beside the barn
      silo(sim, -2, 0, -20, 20, 120, MAT.sheetmetal);
      silo(sim, 3.2, 0, -20, 17, 100, MAT.paintedmetal);
      // conveyor gantry between them
      const gan = new VoxelGrid(10, 110, 10);
      lattice(gan, 0, 0, 10, 0, 110, flat(MAT.steel), 10);
      addStatic(sim, gan, 0.1, -0.2, -15.5, 'gantry');

      // equipment shed (open front)
      const shed = makeBuilding({ w: 110, d: 60, floors: 1, floorH: 40, wall: MAT.sheetmetal, wallT: 1, roof: 'flat', roofMat: MAT.sheetmetal, doors: 's', doorW: 70, doorH: 34, winW: 0, seed: 7 });
      placeBuilding(sim, shed, 10, 0, -6, 'machine shed');
      loader(sim, 15, 0.1, -2, Math.PI);
      for (let i = 0; i < 4; i++) barrel(sim, 19.5 + (i % 2) * 0.7, 0.15, -5 + (i >> 1) * 0.7, i === 0);

      // farmhouse
      placeBuilding(sim, makeBuilding({ w: 90, d: 70, floors: 2, wall: MAT.brick, lining: MAT.plaster, roof: 'gable', roofMat: MAT.tile, doors: 'e', partitions: true, lamps: true, seed: 12 }), -34, 0, 6, 'farmhouse');
      hedge(sim, -35, 0, 15, 11, 0.8);
      tree(sim, -28, 0, 18, 4, 1.1);
      tree(sim, -36, 0, 2, 6, 1);

      // chicken coop on stilts
      const coop = new VoxelGrid(30, 30, 20);
      for (const [x, z] of [[0, 0], [28, 0], [0, 18], [28, 18]]) box(coop, x, 0, z, x + 2, 10, z + 2, pal(MAT.wood, 0));
      box(coop, 0, 10, 0, 30, 12, 20, planks(MAT.wood, 2, 2));
      box(coop, 0, 12, 0, 30, 24, 20, planks(MAT.wood, 3, 5, 'x')); clear(coop, 1, 12, 1, 29, 24, 19); clear(coop, 12, 12, 19, 18, 20, 20);
      for (let i = 0; i < 10; i++) box(coop, 0, 24 + Math.min(i, 5), i, 30, 25 + Math.min(i, 5), i + 1, pal(MAT.sheetmetal, 2));
      for (let i = 10; i < 20; i++) box(coop, 0, 24 + Math.min(19 - i, 5), i, 30, 25 + Math.min(19 - i, 5), i + 1, pal(MAT.sheetmetal, 2));
      addStatic(sim, coop, -16, -0.2, 12, 'coop');

      // wind pump: lattice tower with a bladed wheel + water trough
      const wp = new VoxelGrid(34, 120, 12);
      lattice(wp, 11, 1, 10, 0, 100, flat(MAT.steel), 12);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        for (let r = 2; r < 16; r++) box(wp, Math.round(17 + Math.cos(a) * r), Math.round(106 + Math.sin(a) * r * 0.85), 0, Math.round(17 + Math.cos(a) * r) + 1, Math.round(106 + Math.sin(a) * r * 0.85) + 1, 1, pal(MAT.sheetmetal, k % 5));
      }
      box(wp, 16, 100, 0, 18, 108, 11, flat(MAT.steel));
      addStatic(sim, wp, 22, -0.2, 14, 'wind pump');
      const trough = new VoxelGrid(30, 7, 8);
      box(trough, 0, 0, 0, 30, 7, 8, shaded(MAT.sheetmetal, 4, 2)); clear(trough, 1, 1, 1, 29, 7, 7);
      addStatic(sim, trough, 20, -0.2, 18, 'trough');

      // paddocks
      fence(sim, 8, 0, 10, 28, false, MAT.wood, 12);
      fence(sim, 36, 0, 10, 26, true, MAT.wood, 12);
      fence(sim, 8, 0, 36, 28, false, MAT.wood, 12);
      fence(sim, 8, 0, 10, 4, true, MAT.wood, 12);
      fence(sim, 8, 0, 20, 16, true, MAT.wood, 12);
      fence(sim, -36, 0, 22, 30, false, MAT.wood, 12);
      fence(sim, -36, 0, 22, 14, true, MAT.wood, 12);
      for (let i = 0; i < 8; i++) bale(sim, rng.range(-30, -12), 0.15, rng.range(25, 33), 20 + i);

      // field edge trees and crates of produce
      for (let i = 0; i < 9; i++) tree(sim, -36 + i * 9, 0, -35 + (i % 2) * 2, 40 + i, 0.8 + (i % 3) * 0.15);
      for (let i = 0; i < 6; i++) crate(sim, -8 + (i % 3) * 0.9, 0.05 + (i >= 3 ? 0.85 : 0), 4, 8);
      van(sim, -2, 0.1, 8, 0.4);
    },
  })],
});
