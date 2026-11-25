import { MAT, VoxelGrid, box, clear, defineMod, levelKit, pal, planks, shaded, siteMap } from '../../src/mods/kit';
import { plinth } from './_util';

const { makeBuilding, placeBuilding, addStatic, pine, tree, rock, fence, crate, barrel, table, chair } = levelKit;

/** A timber hamlet scattered over pine-covered hills: log cabins on stone plinths, a meeting hall with a bell tower. */
export default defineMod({
  id: 'pinecrest-hamlet', name: 'Pinecrest Hamlet', category: 'maps', author: 'Wrecking Shift',
  description: 'Rolling wooded hills with a handful of timber cabins on stone plinths, a meeting hall with a bell tower and a sawmill shed. Everything burns.',
  maps: [siteMap({
    id: 'pinecrest-hamlet', title: 'Pinecrest Hamlet', blurb: 'timber village on hills', half: 38.4, ground: MAT.grass, hills: 4, seed: 61, sky: 'sunset',
    spawn: { x: 0, y: 0.05, z: 30 }, spawnYaw: 0,
    build(sim, rng, h) {
      // cabins: [x, z, w, d, door, seed]
      const cabins: [number, number, number, number, string, number][] = [
        [-26, -26, 60, 50, 's', 1], [-8, -30, 70, 50, 's', 2], [14, -24, 60, 50, 's', 3],
        [-30, -2, 50, 60, 'e', 4], [22, 0, 50, 60, 'w', 5], [-18, 14, 60, 50, 'n', 6], [12, 16, 60, 50, 'n', 7],
      ];
      for (const [x, z, w, d, door, seed] of cabins) {
        const gy = plinth(sim, h, x - 0.3, z - 0.3, w / 10 + 0.6, d / 10 + 0.6, MAT.rock);
        const g = makeBuilding({ w, d, floors: 1 + (seed % 2), wall: MAT.wood, wallT: 3, lining: 0, slab: MAT.wood, roof: 'gable', roofMat: seed % 3 ? MAT.wood : MAT.sheetmetal, doors: door, lamps: true, winStep: 20, seed });
        placeBuilding(sim, g, x, gy, z, 'cabin');
        table(sim, x + 1.2, gy + 0.15, z + 1.5);
        chair(sim, x + 1.4, gy + 0.15, z + 2.6, rng.range(0, 6));
      }

      // meeting hall with a bell tower in the middle of the hamlet
      const hx = -6, hz = -10, hw = 110, hd = 70;
      const gy = plinth(sim, h, hx - 0.4, hz - 0.4, hw / 10 + 0.8, hd / 10 + 0.8 + 3, MAT.rock);
      const hall = makeBuilding({ w: hw, d: hd, floors: 1, floorH: 45, wall: MAT.wood, wallT: 3, roof: 'gable', roofMat: MAT.wood, doors: 's', doorW: 16, doorH: 28, winW: 8, winH: 20, sill: 12, winStep: 18, lamps: true, seed: 11 });
      placeBuilding(sim, hall, hx, gy, hz, 'hall');
      const tw = new VoxelGrid(30, 160, 30);
      box(tw, 0, 0, 0, 30, 3, 30, shaded(MAT.rock, 3, 2));
      for (let y = 3; y < 120; y++) for (const [a, b] of [[0, 0], [27, 0], [0, 27], [27, 27]]) box(tw, a, y, b, a + 3, y + 1, b + 3, pal(MAT.wood, 0));
      for (let y = 3; y < 96; y++) { box(tw, 0, y, 0, 30, y + 1, 2, planks(MAT.wood, 3, 4)); box(tw, 0, y, 28, 30, y + 1, 30, planks(MAT.wood, 3, 4)); box(tw, 0, y, 0, 2, y + 1, 30, planks(MAT.wood, 3, 5, 'z')); box(tw, 28, y, 0, 30, y + 1, 30, planks(MAT.wood, 3, 5, 'z')); }
      clear(tw, 10, 3, 28, 20, 24, 30);
      box(tw, 0, 96, 0, 30, 98, 30, planks(MAT.wood, 3, 6));
      box(tw, 11, 104, 11, 19, 114, 19, pal(MAT.gold, 2)); clear(tw, 12, 104, 12, 18, 112, 18); // bell
      box(tw, 14, 114, 14, 16, 120, 16, pal(MAT.wood, 1));
      for (let i = 0; i < 16; i++) box(tw, i, 120 + i * 2, i, 30 - i, 122 + i * 2, 30 - i, shaded(MAT.wood, 3, 7));
      clear(tw, 2, 122, 2, 28, 150, 28);
      for (let i = 0; i < 14; i++) clear(tw, i + 2, 120 + i * 2 + 2, i + 2, 28 - i, 122 + i * 2, 28 - i);
      addStatic(sim, tw, hx + hw / 10 - 3, gy - 0.3, hz + hd / 10, 'bell tower', ['tower']);

      // sawmill shed: open-sided roof on posts with log piles
      const sx = 26, sz = 18;
      const sgy = plinth(sim, h, sx - 0.2, sz - 0.2, 9.4, 6.4, MAT.rock);
      const saw = new VoxelGrid(90, 50, 60);
      box(saw, 0, 0, 0, 90, 3, 60, planks(MAT.wood, 4, 9));
      for (const [a, b] of [[0, 0], [86, 0], [0, 56], [86, 56], [43, 0], [43, 56]]) box(saw, a, 3, b, a + 4, 38, b + 4, pal(MAT.wood, 0));
      for (let i = 0; i < 30; i++) { box(saw, 0, 38 + Math.floor(i / 3), i, 90, 40 + Math.floor(i / 3), i + 1, shaded(MAT.sheetmetal, 4, 3)); box(saw, 0, 38 + Math.floor(i / 3), 59 - i, 90, 40 + Math.floor(i / 3), 60 - i, shaded(MAT.sheetmetal, 4, 3)); }
      addStatic(sim, saw, sx, sgy - 0.3, sz, 'sawmill');
      for (let i = 0; i < 6; i++) {
        const lg = new VoxelGrid(50, 5, 5);
        levelKit.cylinderX(lg, 2.5, 2.5, 2.5, 0, 50, (xx, yy, zz) => pal(MAT.wood, (xx + yy + zz) % 5));
        levelKit.addProp(sim, lg, sx + 1.5, sgy + 0.2 + Math.floor(i / 3) * 0.55, sz + 1 + (i % 3) * 0.6, 'log');
      }

      // pines everywhere else
      const keep = (x: number, z: number) => Math.hypot(x - 0, z - 30) > 6 && !cabins.some(([cx, cz, w, d]) => x > cx - 2 && x < cx + w / 10 + 2 && z > cz - 2 && z < cz + d / 10 + 2)
        && !(x > hx - 2 && x < hx + hw / 10 + 2 && z > hz - 2 && z < hz + hd / 10 + 5) && !(x > sx - 2 && x < sx + 11 && z > sz - 2 && z < sz + 8);
      for (let i = 0; i < 46; i++) {
        const x = rng.range(-36, 36), z = rng.range(-36, 36);
        if (!keep(x, z)) continue;
        (i % 4 ? pine : tree)(sim, x, h(x, z), z, i);
      }
      for (let i = 0; i < 8; i++) { const x = rng.range(-34, 34), z = rng.range(-34, 34); if (keep(x, z)) rock(sim, x, h(x, z), z, 6 + (i % 5), i); }
      fence(sim, -6, h(-6, 26), 26, 12, false, MAT.wood, 12);
      for (let i = 0; i < 4; i++) crate(sim, 3 + i * 0.9, h(3, 27) + 0.3, 27, 8);
      barrel(sim, -4, h(-4, 28) + 0.3, 28, true);
    },
  })],
});
