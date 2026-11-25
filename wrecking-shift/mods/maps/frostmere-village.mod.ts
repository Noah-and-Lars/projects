import { MAT, VoxelGrid, box, clear, cylinderY, defineMod, levelKit, pal, planks, shaded, siteMap, sphere } from '../../src/mods/kit';
import type { Sim } from '../../src/sim/sim';
import { plinth } from './_util';

const { makeBuilding, placeBuilding, addStatic, addProp, pine, rock, fence, crate, barrel, table, chair, cylinderX } = levelKit;

/** snowman (dynamic): three stacked snow balls, coal eyes, a carrot-ish nose */
function snowman(sim: Sim, x: number, y: number, z: number, seed: number) {
  const g = new VoxelGrid(12, 24, 12);
  sphere(g, 6, 4.5, 6, 5, pal(MAT.snow, 1)); sphere(g, 6, 12, 6, 3.8, pal(MAT.snow, 2)); sphere(g, 6, 18.5, 6, 2.8, pal(MAT.snow, 3));
  g.set(5, 19, 3, pal(MAT.char, 1)); g.set(7, 19, 3, pal(MAT.char, 1)); g.set(6, 18, 2, pal(MAT.plastic, 2)); g.set(6, 18, 3, pal(MAT.plastic, 2));
  box(g, 3, 21, 3, 9, 22, 9, pal(MAT.fabric, seed % 5)); box(g, 4, 22, 4, 8, 24, 8, pal(MAT.fabric, seed % 5));
  return addProp(sim, g, x - 0.6, y, z - 0.6, 'snowman', seed);
}

/** A snowed-in mountain village: stone and timber cottages with snow-laden roofs, a chapel, a frozen pond and pines. */
export default defineMod({
  id: 'frostmere-village', name: 'Frostmere Village', category: 'maps', author: 'Wrecking Shift',
  description: 'A mountain village buried in snow: cottages with heavy white roofs, a stone chapel with a steeple, a frozen pond, a well and a few snowmen. It is still snowing.',
  maps: [siteMap({
    id: 'frostmere-village', title: 'Frostmere Village', blurb: 'snow, chapel, frozen pond', half: 38.4, ground: MAT.snow, hills: 2.5, seed: 131,
    sky: 'overcast', weather: 'snow',
    spawn: { x: 0, y: 0.05, z: 30 }, spawnYaw: 0,
    build(sim, rng, h) {
      // cottages: [x, z, w, d, wall, door]
      const homes: [number, number, number, number, number, string][] = [
        [-28, -22, 70, 50, MAT.rock, 's'], [-14, -28, 60, 50, MAT.wood, 's'], [12, -26, 70, 50, MAT.rock, 's'], [26, -12, 50, 70, MAT.wood, 'w'],
        [-30, 2, 50, 70, MAT.wood, 'e'], [22, 10, 60, 50, MAT.rock, 'n'], [-20, 16, 60, 50, MAT.brick, 'n'],
      ];
      for (let i = 0; i < homes.length; i++) {
        const [x, z, w, d, wall, door] = homes[i];
        const gy = plinth(sim, h, x - 0.3, z - 0.3, w / 10 + 0.6, d / 10 + 0.6, MAT.rock);
        const g = makeBuilding({ w, d, floors: 1 + (i % 2), wall, wallT: 3, lining: MAT.plaster, roof: 'gable', roofMat: MAT.snow, doors: door, lamps: true, winStep: 20, seed: 30 + i });
        // chimney through the roof
        const cx = 8, top = g.sy;
        for (let y = 3; y < top; y++) box(g, cx, y, (d >> 1) - 3, cx + 6, y + 1, (d >> 1) + 3, shaded(MAT.rock, 3, i)(cx, y, 0));
        clear(g, cx + 2, 3, (d >> 1) - 1, cx + 4, top, (d >> 1) + 1);
        placeBuilding(sim, g, x, gy, z, 'cottage');
        table(sim, x + 1.6, gy + 0.15, z + 1.6);
        chair(sim, x + 1.8, gy + 0.15, z + 2.6, i);
      }

      // chapel with a steeple, in the middle
      const cxw = 80, cd = 130, chx = -4, chz = -16;
      const cgy = plinth(sim, h, chx - 0.4, chz - 4.4, cxw / 10 + 0.8, cd / 10 + 4.8, MAT.rock);
      const ch = makeBuilding({ w: cxw, d: cd, floors: 1, floorH: 60, wall: MAT.rock, wallT: 4, roof: 'gable', roofMat: MAT.snow, doors: 's', doorW: 14, doorH: 30, winW: 6, winH: 30, sill: 14, winStep: 18, lamps: true, seed: 41 });
      for (let a = 10; a < cxw - 10; a += 16) { const pew = 3; box(ch, a, 4, 30, a + 10, 4 + pew, 100, planks(MAT.wood, 2, 4)); }
      clear(ch, 34, 3, 0, 46, 30, 5); // through into the steeple
      placeBuilding(sim, ch, chx, cgy, chz, 'chapel');
      const st = new VoxelGrid(40, 200, 40);
      box(st, 0, 0, 0, 40, 120, 40, shaded(MAT.rock, 3, 42)); clear(st, 4, 3, 4, 36, 118, 36);
      clear(st, 14, 3, 36, 26, 30, 40);
      for (const [a, b, c2, d2] of [[14, 0, 26, 4], [14, 36, 26, 40], [0, 14, 4, 26], [36, 14, 40, 26]]) clear(st, a, 96, b, c2, 112, d2);
      box(st, 4, 92, 4, 36, 94, 36, planks(MAT.wood, 3, 5));
      cylinderY(st, 20, 20, 6, 98, 108, pal(MAT.gold, 2), 1);
      for (let i = 0; i < 20; i++) box(st, i, 120 + i * 4, i, 40 - i, 124 + i * 4, 40 - i, i % 4 === 3 ? pal(MAT.snow, 1) : shaded(MAT.tile, 3, 7));
      for (let i = 0; i < 19; i++) clear(st, i + 2, 120 + i * 4, i + 2, 38 - i, 124 + i * 4, 38 - i);
      addStatic(sim, st, chx + 2, cgy - 0.3, chz - 4, 'steeple', ['tower']);

      // frozen pond on a level plinth
      const px = 6, pz = 4;
      const pgy = plinth(sim, h, px - 0.2, pz - 0.2, 12.4, 8.4, MAT.rock);
      const pond = new VoxelGrid(120, 3, 80);
      for (let z = 0; z < 80; z++) for (let x = 0; x < 120; x++) { const d = Math.hypot((x - 60) / 1.5, z - 40); if (d < 40) { pond.set(x, 0, z, pal(MAT.rock, 2)); pond.set(x, 1, z, pal(d < 37 ? MAT.ice : MAT.snow, 1)); } }
      addStatic(sim, pond, px, pgy - 0.1, pz, 'pond');
      for (let i = 0; i < 3; i++) snowman(sim, px + 2 + i * 4, pgy + 0.2, pz - 1.6, i);

      // well
      const wx = -10, wz = 6, wgy = h(wx, wz);
      const well = new VoxelGrid(20, 34, 20);
      cylinderY(well, 10, 10, 9, 0, 10, shaded(MAT.rock, 3, 1), 3);
      for (const a of [1, 17]) box(well, a, 10, 9, a + 2, 28, 11, pal(MAT.wood, 0));
      cylinderX(well, 24, 10, 1.5, 1, 19, pal(MAT.wood, 2));
      for (let i = 0; i < 6; i++) { box(well, 0, 28 + i, 10 - 10 + i, 20, 29 + i, 11 - i + 9, pal(MAT.snow, 1)); }
      addStatic(sim, well, wx - 1, wgy - 0.3, wz - 1, 'well');

      // woodpile, sledges, fuel
      for (let i = 0; i < 6; i++) {
        const lg = new VoxelGrid(30, 4, 4);
        cylinderX(lg, 2, 2, 2, 0, 30, (x, y, z) => pal(MAT.wood, (x + y + z) % 5));
        addProp(sim, lg, -26, h(-26, 13) + 0.2 + Math.floor(i / 3) * 0.45, 12.5 + (i % 3) * 0.45, 'log');
      }
      for (let i = 0; i < 3; i++) crate(sim, 14 + i * 0.9, h(14, 24) + 0.2, 24, 8);
      barrel(sim, 18, h(18, 22) + 0.2, 22, true);
      fence(sim, -36, h(-36, 26), 26, 30, false, MAT.wood, 12);

      // forest and boulders
      const near = (x: number, z: number) => Math.hypot(x, z - 30) < 6 || homes.some(([hx, hz, w, d]) => x > hx - 2 && x < hx + w / 10 + 2 && z > hz - 2 && z < hz + d / 10 + 2)
        || (x > chx - 2 && x < chx + 10 && z > chz - 6 && z < chz + 15) || (x > px - 2 && x < px + 14 && z > pz - 3 && z < pz + 10) || Math.hypot(x - wx, z - wz) < 3;
      for (let i = 0; i < 44; i++) { const x = rng.range(-37, 37), z = rng.range(-37, 37); if (!near(x, z)) pine(sim, x, h(x, z), z, i); }
      for (let i = 0; i < 8; i++) { const x = rng.range(-36, 36), z = rng.range(-36, 36); if (!near(x, z)) rock(sim, x, h(x, z), z, 5 + (i % 5), i); }
    },
  })],
});
