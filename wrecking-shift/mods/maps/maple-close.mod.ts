import { MAT, VoxelGrid, box, defineMod, levelKit, pal, shaded, siteMap } from '../../src/mods/kit';
import { hatchback, van } from '../../src/sim/prefabs/vehicles';
import { slab } from './_util';

const { makeBuilding, placeBuilding, addStatic, hedge, fence, tree, wallSeg, streetLamp, crate, barrel, sofa, table, bed } = levelKit;

/** A quiet suburban cul-de-sac: seven family houses around a turning circle, gardens, garages and parked cars. */
export default defineMod({
  id: 'maple-close', name: 'Maple Close', category: 'maps', author: 'Wrecking Shift',
  description: 'A sleepy cul-de-sac of brick and timber family homes around a turning circle, with garages, hedges and cars in the drives.',
  maps: [siteMap({
    id: 'maple-close', title: 'Maple Close', blurb: 'suburban cul-de-sac', ground: MAT.grass, sky: 'day',
    spawn: { x: 0, y: 0.05, z: 21 }, spawnYaw: 0, seed: 21,
    build(sim, rng) {
      // road: straight run from the south edge into a round turning circle
      slab(sim, -3, 0, 4, 6, 21.5, shaded(MAT.asphalt, 6, 1), 'road');
      const R = 90;
      const disc = new VoxelGrid(R * 2, 1, R * 2);
      for (let z = 0; z < R * 2; z++) for (let x = 0; x < R * 2; x++) if (Math.hypot(x + 0.5 - R, z + 0.5 - R) < R) disc.set(x, 0, z, pal(MAT.asphalt, (x * 3 + z) % 3));
      for (let z = 60; z < 120; z++) for (let x = 60; x < 120; x++) if (Math.hypot(x + 0.5 - R, z + 0.5 - R) < 26) disc.set(x, 0, z, pal(MAT.grass, 2));
      addStatic(sim, disc, -9, 0, -13, 'turning circle');
      tree(sim, 0, 0.1, -4, 3, 0.8);

      // houses: [x, z, w, d, door, wall, roof, seed]
      const houses: [number, number, number, number, string, number, number, number][] = [
        [-4, -25, 80, 60, 's', MAT.brick, MAT.tile, 1],
        [-18, -23, 70, 60, 's', MAT.wood, MAT.sheetmetal, 2],
        [10, -23, 70, 60, 's', MAT.brick, MAT.tile, 3],
        [-24, -9, 60, 80, 'e', MAT.concrete, MAT.tile, 4],
        [18, -9, 60, 80, 'w', MAT.wood, MAT.tile, 5],
        [-23, 6, 60, 70, 'e', MAT.brick, MAT.sheetmetal, 6],
        [17, 6, 60, 70, 'w', MAT.brick, MAT.tile, 7],
      ];
      for (const [x, z, w, d, door, wall, roof, seed] of houses) {
        const g = makeBuilding({ w, d, floors: 2, wall, lining: MAT.plaster, roof: 'gable', roofMat: roof, slab: MAT.wood, doors: door, partitions: true, lamps: true, winStep: 22, seed });
        placeBuilding(sim, g, x, 0, z, 'house');
        // a bit of furniture on the ground floor
        const cx = x + 0.5, cz = z + 0.5;
        sofa(sim, cx + 1, 0.15, cz + 1.2, rng.range(-0.3, 0.3), [MAT.fabric, MAT.plastic, MAT.rubber][seed % 3]);
        table(sim, cx + 2.2, 0.15, cz + 3);
        bed(sim, cx + 1, 3.15, cz + 1, 0);
      }
      // garages beside the side houses
      for (const [x, z, door] of [[-23, 14, 'e'], [18.5, 14, 'w']] as const) {
        placeBuilding(sim, makeBuilding({ w: 50, d: 60, floors: 1, wall: MAT.brick, roof: 'flat', doors: door, doorW: 32, winW: 0, seed: 9 }), x, 0, z, 'garage');
      }
      // driveways
      for (const [x, z, w, d] of [[-17, 16, 14, 4], [3, 16, 15.5, 4], [-1, -17, 2, 4], [-14, -17, 2, 6], [14, -17, 2, 6]]) slab(sim, x, 0, z, w, d, shaded(MAT.concrete, 5, 2), 'drive');
      // garden boundaries
      hedge(sim, -10.5, 0, -17, 0.8, 10);
      hedge(sim, 9.7, 0, -17, 0.8, 10);
      hedge(sim, -24.8, 0, 2.2, 7.5, 0.8);
      hedge(sim, 17.3, 0, 2.2, 7.5, 0.8);
      fence(sim, -25.2, 0, -25.2, 50, false, MAT.wood, 14);
      fence(sim, -25.4, 0, -25, 50, true, MAT.wood, 14);
      fence(sim, 25.1, 0, -25, 50, true, MAT.wood, 14);
      wallSeg(sim, -9, 0, 21, 5.5, false, 0.8, 3, MAT.brick);
      wallSeg(sim, 3.5, 0, 21, 5.5, false, 0.8, 3, MAT.brick);
      for (const [x, z] of [[-12, 22], [12, 22], [-22, 23], [22, 23], [-15, -2], [15, -2]]) tree(sim, x, 0, z, (x * 7 + z) | 0, 0.9);
      streetLamp(sim, 4, 0, 10); streetLamp(sim, 4, 0, 18);
      // mailbox posts at the drives
      for (const x of [-4.5, 4.5]) {
        const g = new VoxelGrid(4, 12, 4);
        box(g, 1, 0, 1, 3, 9, 3, pal(MAT.wood, 1)); box(g, 0, 9, 0, 4, 12, 4, pal(MAT.paintedmetal, 2));
        addStatic(sim, g, x, -0.2, 14.5, 'mailbox');
      }
      // clutter: bins, crates, a garden barbecue barrel
      for (let i = 0; i < 6; i++) crate(sim, rng.range(-20, -14), 0.05, rng.range(18, 21), 7);
      barrel(sim, 13, 0.05, 19, true);
      barrel(sim, 14, 0.05, 19.8, false);
      // cars in the drives
      hatchback(sim, -12, 0, 18, Math.PI / 2);
      van(sim, 9, 0, 18, -Math.PI / 2);
      hatchback(sim, 6, 0, 0, 0.3);
    },
  })],
});
