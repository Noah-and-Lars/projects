import { MAT, VoxelGrid, box, clear, cylinderY, defineMod, flat, levelKit, pal, planks, shaded, siteMap, sphere } from '../../src/mods/kit';
import type { Sim } from '../../src/sim/sim';
import { van } from '../../src/sim/prefabs/vehicles';
import { slab, track, wagon } from './_util';

const { makeBuilding, placeBuilding, addStatic, lattice, cylinderX, barrel, crate, spool, fence, streetLamp } = levelKit;

const TRACKS = [-10, -4, 2, 8]; // z of each track's north edge

/** stout shunting engine (static until cut loose): boiler, cab, bunker */
function engine(sim: Sim, x: number, z: number) {
  const g = new VoxelGrid(90, 46, 26);
  for (const a of [12, 30, 48, 66]) for (const b of [3, 19]) cylinderX(g, 6, b + 2, 5.5, a, a + 4, b === 3 ? pal(MAT.steel, 1) : pal(MAT.steel, 2));
  box(g, 0, 8, 1, 90, 11, 25, flat(MAT.steel));
  cylinderX(g, 22, 13, 10, 4, 60, shaded(MAT.paintedmetal, 6, 2));
  cylinderY(g, 10, 13, 3, 30, 42, flat(MAT.steel, 0)); // chimney
  sphere(g, 34, 33, 13, 4, pal(MAT.gold, 2)); // dome
  box(g, 60, 11, 1, 84, 40, 25, shaded(MAT.paintedmetal, 6, 3)); clear(g, 62, 11, 3, 82, 38, 23); clear(g, 62, 24, 1, 70, 34, 3); clear(g, 62, 24, 23, 70, 34, 25);
  box(g, 58, 40, 0, 86, 42, 26, flat(MAT.steel));
  box(g, 84, 11, 2, 90, 26, 24, shaded(MAT.char, 4, 1));
  return addStatic(sim, g, x, 0.25, z - 0.1, 'engine', ['engine']);
}

/** A rail goods yard: four tracks, a brick engine shed, wagons, a water tower, a signal box and a passenger platform. */
export default defineMod({
  id: 'cinder-sidings', name: 'Cinder Sidings', category: 'maps', author: 'Wrecking Shift',
  description: 'A sooty rail yard: four tracks of goods wagons, a two-road brick engine shed with a tank engine inside, a timber water tower and a signal box.',
  maps: [siteMap({
    id: 'cinder-sidings', title: 'Cinder Sidings', blurb: 'train yard + engine shed', half: 38.4, ground: MAT.dirt, sky: 'overcast',
    spawn: { x: 6, y: 0.05, z: 28 }, spawnYaw: 0, seed: 121,
    build(sim, rng) {
      for (let i = 0; i < TRACKS.length; i++) track(sim, i < 2 ? -31.6 : -38.4, 0, TRACKS[i], i < 2 ? 70 : 76.8, false);

      // engine shed over the two northern tracks (x -32..-2)
      const shed = makeBuilding({ w: 300, d: 150, floors: 1, floorH: 60, wall: MAT.brick, wallT: 3, roof: 'gable', roofMat: MAT.tile, doors: '', winW: 14, winH: 22, sill: 18, winStep: 30, lamps: true, seed: 5 });
      for (const tz of TRACKS.slice(0, 2)) {
        const a = Math.round((tz - -12.5) * 10);
        clear(shed, 297, 3, a - 3, 300, 50, a + 27);
        for (let y = 50; y < 56; y++) clear(shed, 297, y, a - 3 + (y - 50), 300, y + 1, a + 27 - (y - 50));
      }
      box(shed, 2, 0, 3, 298, 3, 147, 0); // no foundation slab across the tracks
      placeBuilding(sim, shed, -32, 0, -12.5, 'engine shed');
      engine(sim, -24, TRACKS[0]);
      wagon(sim, -14, 0.25, TRACKS[1] - 0.1, false, 1);

      // wagons out in the yard
      const yard: [number, number, number][] = [[4, 0, 2], [13, 0, 3], [-6, 2, 4], [4, 2, 5], [22, 2, 6], [-20, 3, 7], [-11, 3, 8], [16, 3, 9]];
      for (const [x, ti, s] of yard) wagon(sim, x, 0.25, TRACKS[ti] - 0.1, false, s);

      // water tower: lattice legs + timber tank
      const wt = new VoxelGrid(40, 120, 40);
      lattice(wt, 2, 2, 36, 0, 70, flat(MAT.steel), 18);
      box(wt, 0, 70, 0, 40, 72, 40, planks(MAT.wood, 3, 2));
      cylinderY(wt, 20, 20, 19, 72, 110, (x, y, z) => (y % 12 < 1 ? pal(MAT.steel, 1) : planks(MAT.wood, 2, 4)(x, y, z)), 2);
      for (let i = 0; i < 10; i++) cylinderY(wt, 20, 20, 20 - i * 2, 110 + i, 111 + i, shaded(MAT.sheetmetal, 3, 3));
      addStatic(sim, wt, 26, -0.2, -26, 'water tower', ['water tower']);

      // signal box: brick base, glazed upper room
      const sb = makeBuilding({ w: 50, d: 40, floors: 2, wall: MAT.brick, lining: MAT.plaster, roof: 'gable', roofMat: MAT.tile, doors: 'e', winW: 10, winStep: 14, seed: 9 });
      for (let x = 2; x < 48; x++) for (let y = 33 + 6; y < 33 + 26; y++) { sb.set(x, y, 0, pal(MAT.glass, 2)); sb.set(x, y, 1, 0); sb.set(x, y, 39, pal(MAT.glass, 2)); sb.set(x, y, 38, 0); }
      placeBuilding(sim, sb, 28, 0, 12, 'signal box');
      for (let i = 0; i < 6; i++) { const lv = new VoxelGrid(1, 8, 1); box(lv, 0, 0, 0, 1, 8, 1, pal(i % 2 ? MAT.plastic : MAT.paintedmetal, 1)); addStatic(sim, lv, 29 + i * 0.5, 3.1, 13, 'lever'); }

      // passenger platform with canopy along the southern track
      const pf = new VoxelGrid(300, 40, 40);
      box(pf, 0, 0, 0, 300, 8, 40, shaded(MAT.concrete, 6, 4)); box(pf, 0, 7, 0, 300, 8, 3, pal(MAT.whitepaint, 1));
      for (let a = 10; a < 300; a += 40) box(pf, a, 8, 30, a + 2, 36, 32, flat(MAT.paintedmetal, 0));
      for (let b = 10; b < 40; b++) box(pf, 0, 36 + Math.floor((b - 10) / 6), b, 300, 37 + Math.floor((b - 10) / 6), b + 1, shaded(MAT.sheetmetal, 4, 7));
      addStatic(sim, pf, -20, -0.2, TRACKS[3] + 2.6, 'platform');
      placeBuilding(sim, makeBuilding({ w: 80, d: 50, floors: 1, wall: MAT.brick, lining: MAT.plaster, roof: 'gable', roofMat: MAT.tile, doors: 'sn', lamps: true, seed: 11 }), -4, 0, TRACKS[3] + 6.6, 'station hut');
      for (const x of [-16, -8, 8]) { const bn = new VoxelGrid(16, 8, 5); box(bn, 0, 4, 0, 16, 5, 5, planks(MAT.wood, 2, 2)); box(bn, 0, 0, 1, 2, 4, 4, flat(MAT.steel)); box(bn, 14, 0, 1, 16, 4, 4, flat(MAT.steel)); addStatic(sim, bn, x, 0.6, TRACKS[3] + 4.6, 'bench'); }

      // coal heap + yard clutter
      const coal = new VoxelGrid(60, 24, 50);
      sphere(coal, 30, 0, 25, 26, (x, y, z) => pal(MAT.char, (x + y * 3 + z) % 5), 0.25, 3);
      levelKit.dropFloating(coal);
      addStatic(sim, coal, 6, -0.2, -26, 'coal heap');
      for (let i = 0; i < 8; i++) barrel(sim, 14 + (i % 4) * 0.7, 0.05, -18 + Math.floor(i / 4) * 0.7, i % 2 === 0);
      for (let i = 0; i < 9; i++) crate(sim, rng.range(-30, -10), 0.05, rng.range(-24, -16), 8);
      for (let i = 0; i < 3; i++) spool(sim, 20 + i * 1.2, 0.05, 20);
      slab(sim, -38.4, 0, 22, 76.8, 4, shaded(MAT.asphalt, 6, 2), 'yard road');
      for (const x of [-30, -10, 10, 30]) streetLamp(sim, x, 0, 21.6);
      fence(sim, -38.2, 0, -38.2, 76, false, MAT.sheetmetal, 18);
      van(sim, 20, 0.1, 24, Math.PI / 2);
    },
  })],
});
