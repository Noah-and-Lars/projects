import { MAT, VoxelGrid, box, defineMod, flat, levelKit, pal, shaded, siteMap } from '../../src/mods/kit';
import { loader } from '../../src/sim/prefabs/vehicles';
import { carWreck } from './_util';

const { makeBuilding, placeBuilding, addStatic, container, fence, lattice, scrap, barrel, crate, tank, spool } = levelKit;

/** A fenced scrapyard: walls of stacked containers, towers of crushed car shells, a crane and a weigh office. */
export default defineMod({
  id: 'rustbelt-scrapyard', name: 'Rustbelt Scrapyard', category: 'maps', author: 'Wrecking Shift',
  description: 'A sprawling scrapyard: container mazes, stacks of crushed car shells, a lattice crane and an office full of paperwork. Mind the fuel drums.',
  maps: [siteMap({
    id: 'rustbelt-scrapyard', title: 'Rustbelt Scrapyard', blurb: 'containers + car wrecks', half: 38.4, ground: MAT.dirt, sky: 'overcast',
    spawn: { x: 0, y: 0.05, z: 32 }, spawnYaw: 0, seed: 41,
    build(sim, rng) {
      const cols = [MAT.paintedmetal, MAT.sheetmetal, MAT.plastic, MAT.paintedmetal, MAT.fabric];
      let k = 0;
      // container walls (two rows, partly double-stacked) forming lanes
      for (let i = 0; i < 6; i++) {
        const x = -34 + i * 6.4;
        container(sim, x, 0, -30, cols[k++ % cols.length]);
        if (i % 2 === 0) container(sim, x, 2.6, -30, cols[k++ % cols.length]);
      }
      for (let i = 0; i < 4; i++) {
        const z = -22 + i * 6.4;
        container(sim, 26, 0, z, cols[k++ % cols.length], true);
        if (i !== 1) container(sim, 26, 2.6, z, cols[k++ % cols.length], true);
        if (i === 2) container(sim, 26, 5.2, z, cols[k++ % cols.length], true);
      }
      for (let i = 0; i < 3; i++) container(sim, -10 + i * 6.4, 0, -12, cols[k++ % cols.length]);
      container(sim, -3.6, 2.6, -12, cols[k++ % cols.length]);

      // stacks of car wrecks (crushed ones piled up)
      for (let s = 0; s < 7; s++) {
        const x = -30 + (s % 4) * 6, z = -4 + Math.floor(s / 4) * 7;
        const n = 2 + (s % 3);
        for (let j = 0; j < n; j++) carWreck(sim, x + rng.range(-0.2, 0.2), j * 0.85, z + rng.range(-0.2, 0.2), false, s + j, true);
      }
      // loose wrecks scattered around
      for (let i = 0; i < 6; i++) carWreck(sim, rng.range(0, 16), 0, rng.range(2, 13), i % 2 === 0, 10 + i, false);

      // lattice crane with a boom
      const cr = new VoxelGrid(150, 170, 16);
      lattice(cr, 0, 0, 16, 0, 150, flat(MAT.paintedmetal, 1), 16);
      for (let x = 0; x < 150; x++) { box(cr, x, 150, 4, x + 1, 152, 6, flat(MAT.paintedmetal, 2)); box(cr, x, 150, 10, x + 1, 152, 12, flat(MAT.paintedmetal, 2)); if (x % 8 === 0) box(cr, x, 150, 4, x + 1, 160 - Math.min(8, Math.abs(x - 40) / 10), 12, flat(MAT.steel)); }
      box(cr, 0, 160, 4, 60, 162, 12, flat(MAT.steel));
      box(cr, 0, 140, 0, 16, 150, 16, shaded(MAT.sheetmetal, 3, 2)); // cab
      for (let y = 100; y < 150; y++) cr.set(140, y, 8, pal(MAT.steel, 1)); // hook cable
      box(cr, 136, 94, 4, 146, 100, 12, flat(MAT.steel)); // magnet
      addStatic(sim, cr, 4, -0.2, -24, 'crane', ['crane']);

      // weigh office + workshop
      placeBuilding(sim, makeBuilding({ w: 70, d: 50, floors: 2, wall: MAT.concrete, lining: MAT.plaster, roof: 'flat', doors: 's', partitions: true, lamps: true, seed: 4 }), -34, 0, 20, 'office');
      placeBuilding(sim, makeBuilding({ w: 100, d: 70, floors: 1, floorH: 45, wall: MAT.sheetmetal, wallT: 1, roof: 'flat', roofMat: MAT.sheetmetal, doors: 'w', doorW: 40, doorH: 36, winW: 0, seed: 6 }), 14, 0, 22, 'workshop');
      // weighbridge plate
      const wb = new VoxelGrid(80, 3, 34);
      box(wb, 0, 0, 0, 80, 3, 34, shaded(MAT.steel, 5, 4));
      addStatic(sim, wb, -12, -0.25, 24, 'weighbridge');

      // perimeter: corrugated fence with a gate gap at the spawn
      fence(sim, -38.2, 0, 37.8, 34, false, MAT.sheetmetal, 22);
      fence(sim, 4.2, 0, 37.8, 34, false, MAT.sheetmetal, 22);
      fence(sim, -38.2, 0, -38.2, 76, true, MAT.sheetmetal, 22);
      fence(sim, 38, 0, -38.2, 76, true, MAT.sheetmetal, 22);
      fence(sim, -38.2, 0, -38.2, 76, false, MAT.sheetmetal, 22);

      // fuel corner
      tank(sim, 33, 0, 30, 12, 34, true);
      for (let i = 0; i < 8; i++) barrel(sim, 30 + (i % 4) * 0.7, 0.05, 24 + Math.floor(i / 4) * 0.7, i % 3 !== 2);
      // scrap heaps
      for (let i = 0; i < 24; i++) scrap(sim, rng.range(-24, -1), 0.1 + (i % 3) * 0.3, rng.range(-21, -14.5), i);
      for (let i = 0; i < 4; i++) spool(sim, -20 + i * 1.3, 0.05, 14);
      for (let i = 0; i < 6; i++) crate(sim, 8 + (i % 3) * 0.9, 0.05 + (i >= 3 ? 0.85 : 0), 16, 8);
      loader(sim, -6, 0.1, 16, Math.PI / 2);
    },
  })],
});
