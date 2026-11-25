import { MAT, VoxelGrid, box, clear, cylinderY, defineMod, flat, levelKit, pal, planks, shaded, siteMap } from '../../src/mods/kit';
import { hatchback, van } from '../../src/sim/prefabs/vehicles';
import { slab } from './_util';

const { makeBuilding, placeBuilding, addStatic, tree, streetLamp, sculpture, plant, table, chair, sofa, bookcase, shelf } = levelKit;

/** A city plaza in front of a ten-storey office block: glass café, fountain, planters, bus shelter and a street of parked cars. */
export default defineMod({
  id: 'copperleaf-plaza', name: 'Copperleaf Plaza', category: 'maps', author: 'Wrecking Shift',
  description: 'A ten-storey glass-and-concrete office block towering over a paved plaza with a café pavilion, a fountain, planters and a row of parked cars.',
  maps: [siteMap({
    id: 'copperleaf-plaza', title: 'Copperleaf Plaza', blurb: 'one tall office block', half: 38.4, ground: MAT.concrete, sky: 'day',
    spawn: { x: 0, y: 0.05, z: 30 }, spawnYaw: 0, seed: 101,
    build(sim, rng) {
      // street along the south edge + paved plaza
      const asph = shaded(MAT.asphalt, 6, 1);
      slab(sim, -38.4, 0, 22, 76.8, 6, (x, y, z) => (z >= 28 && z < 31 && x % 80 < 40 ? pal(MAT.whitepaint, 1) : asph(x, y, z)), 'street');
      slab(sim, -24, 0, -6, 48, 27.8, (x, _y, z) => pal(MAT.marble, ((x >> 3) + (z >> 3)) % 2 ? 1 : 3), 'plaza');

      // the tower: 10 storeys, concrete frame, ribbon windows
      const tw = makeBuilding({ w: 140, d: 100, floors: 10, floorH: 24, wall: MAT.concrete, wallT: 2, lining: MAT.plaster, slab: MAT.concrete, roof: 'flat', doors: 'sn', doorW: 20, winW: 18, winH: 13, sill: 6, winStep: 22, frame: MAT.steel, partitions: true, lamps: true, seed: 7 });
      // rooftop skylights + vents inside the parapet
      const roof = 3 + 10 * 24;
      for (let a = 20; a < 120; a += 30) { box(tw, a, roof, 30, a + 14, roof + 4, 44, pal(MAT.glass, 1)); box(tw, a, roof, 60, a + 8, roof + 5, 68, shaded(MAT.sheetmetal, 3, a)); }
      tw.recount();
      placeBuilding(sim, tw, -7, 0, -24, 'office tower');
      // ground-floor lobby furniture
      for (let i = 0; i < 3; i++) sofa(sim, -4 + i * 2.5, 0.15, -16.5, 0, MAT.fabric);
      for (let i = 0; i < 4; i++) table(sim, -5 + i * 3, 2.55, -20);
      for (let i = 0; i < 4; i++) chair(sim, -4.5 + i * 3, 2.55, -18.8, i);
      for (let i = 0; i < 3; i++) bookcase(sim, -6 + i * 1.7, 4.95, -23.6, 0, i);
      for (let i = 0; i < 3; i++) shelf(sim, -5 + i * 2.2, 7.35, -23.5);

      // annex: low two-storey brick wing to the east
      placeBuilding(sim, makeBuilding({ w: 90, d: 70, floors: 2, wall: MAT.brick, lining: MAT.plaster, roof: 'flat', doors: 'sw', partitions: true, lamps: true, seed: 9 }), 14, 0, -20, 'annex');

      // café pavilion: glass box on steel posts
      const cf = new VoxelGrid(80, 36, 50);
      box(cf, 0, 0, 0, 80, 3, 50, shaded(MAT.concrete, 4, 3));
      box(cf, 0, 3, 0, 80, 30, 1, pal(MAT.glass, 2)); box(cf, 0, 3, 49, 80, 30, 50, pal(MAT.glass, 2));
      box(cf, 0, 3, 0, 1, 30, 50, pal(MAT.glass, 2)); box(cf, 79, 3, 0, 80, 30, 50, pal(MAT.glass, 2));
      for (const [a, b] of [[0, 0], [78, 0], [0, 48], [78, 48], [39, 0], [39, 48]]) box(cf, a, 3, b, a + 2, 30, b + 2, flat(MAT.steel));
      box(cf, -0, 30, 0, 80, 33, 50, shaded(MAT.paintedmetal, 4, 5));
      clear(cf, 34, 3, 49, 46, 24, 50);
      box(cf, 4, 3, 4, 40, 13, 10, planks(MAT.wood, 3, 2)); // counter
      addStatic(sim, cf, -22, -0.2, 2, 'cafe');
      for (let i = 0; i < 4; i++) { table(sim, -20 + i * 1.8, 0.15, 5.4); chair(sim, -19.6 + i * 1.8, 0.15, 6.2, i * 1.3); }

      // fountain
      const fn = new VoxelGrid(80, 30, 80);
      for (let z = 0; z < 80; z++) for (let x = 0; x < 80; x++) {
        const d = Math.hypot(x + 0.5 - 40, z + 0.5 - 40);
        if (d < 40 && d >= 36) box(fn, x, 0, z, x + 1, 6, z + 1, pal(MAT.marble, 2));
        else if (d < 36) { fn.set(x, 0, z, pal(MAT.concrete, 2)); fn.set(x, 1, z, pal(MAT.ice, 1)); }
      }
      cylinderY(fn, 40, 40, 6, 0, 16, pal(MAT.marble, 3));
      cylinderY(fn, 40, 40, 14, 16, 18, pal(MAT.marble, 1));
      cylinderY(fn, 40, 40, 3, 18, 28, pal(MAT.marble, 4));
      addStatic(sim, fn, 4, -0.1, 4, 'fountain');
      sculpture(sim, 7.7, 2.85, 7.7, 1);

      // planters with trees
      for (const [x, z] of [[-20, -4], [-12, -4], [-20, 13], [16, 14], [20, 4], [-6, 15]]) {
        const pl = new VoxelGrid(30, 8, 30);
        box(pl, 0, 0, 0, 30, 8, 30, shaded(MAT.concrete, 3, 4)); box(pl, 2, 2, 2, 28, 8, 28, pal(MAT.dirt, 2));
        addStatic(sim, pl, x - 1.5, -0.1, z - 1.5, 'planter');
        tree(sim, x, 0.7, z, (x * 13 + z) | 0, 0.7);
      }
      // benches
      for (const [x, z] of [[-16, 18], [-10, 18], [10, 18], [16, 18]]) {
        const b = new VoxelGrid(20, 9, 6);
        box(b, 0, 4, 0, 20, 5, 4, planks(MAT.wood, 2, 1)); box(b, 0, 5, 4, 20, 9, 5, planks(MAT.wood, 2, 2));
        for (const a of [1, 17]) box(b, a, 0, 0, a + 2, 4, 5, flat(MAT.steel));
        addStatic(sim, b, x, -0.1, z, 'bench');
      }
      // bus shelter on the pavement
      const bs = new VoxelGrid(50, 28, 16);
      for (const a of [0, 48]) box(bs, a, 0, 0, a + 2, 26, 2, flat(MAT.steel));
      box(bs, 0, 26, 0, 50, 28, 16, pal(MAT.glass, 1)); box(bs, 0, 3, 0, 50, 26, 1, pal(MAT.glass, 2)); box(bs, 0, 3, 0, 1, 26, 14, pal(MAT.glass, 2));
      box(bs, 4, 6, 4, 46, 7, 10, planks(MAT.wood, 2, 4));
      addStatic(sim, bs, 22, -0.2, 18.5, 'bus shelter');
      for (const x of [-30, -15, 0, 15, 30]) streetLamp(sim, x, 0, 21.5);
      for (let i = 0; i < 6; i++) plant(sim, -6 + i * 1.2, 0.05, -14.6, i);

      // parked cars along the street
      hatchback(sim, -28, 0.1, 23.5, Math.PI / 2);
      van(sim, -18, 0.1, 23.5, Math.PI / 2);
      hatchback(sim, 12, 0.1, 23.5, -Math.PI / 2);
      hatchback(sim, 28, 0.1, 26.5, -Math.PI / 2 + rng.range(-0.05, 0.05));
    },
  })],
});
