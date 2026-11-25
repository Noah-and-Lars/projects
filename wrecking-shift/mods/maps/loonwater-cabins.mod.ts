import { MAT, VoxelGrid, box, clear, defineMod, levelKit, pal, planks, shaded } from '../../src/mods/kit';
import { fbm2, smoothstep } from '../../src/sim/levels/terrain';
import { hatchback } from '../../src/sim/prefabs/vehicles';
import { plinth, terrainSite } from './_util';

const { makeBuilding, placeBuilding, addStatic, pier, boat, pine, tree, rock, table, chair, crate, barrel, fence } = levelKit;

const LX = 6, LZ = 16; // lake centre
const lakeD = (x: number, z: number) => Math.hypot((x - LX) / 1.5, z - LZ) + 2.5 * (fbm2(x * 0.06, z * 0.06, 9, 2) - 0.5);

function height(x: number, z: number): number {
  const land = 1.2 + 2.2 * smoothstep(5, -36, z) + 0.8 * fbm2(x * 0.03, z * 0.03, 3, 3);
  const t = smoothstep(16, 11, lakeD(x, z));
  return land + (-2.8 - land) * t;
}

/** A lake in the pines: timber cabins along the shore, a boathouse, a long pier, rowing boats and a lodge. */
export default defineMod({
  id: 'loonwater-cabins', name: 'Loonwater Cabins', category: 'maps', author: 'Wrecking Shift',
  description: 'Holiday cabins around a quiet forest lake: a lodge, a boathouse on stilts, a long pier with rowing boats and picnic tables under the pines.',
  maps: [terrainSite({
    id: 'loonwater-cabins', title: 'Loonwater Cabins', blurb: 'lake, pier, cabins', half: 38.4, height, water: 0, sky: 'sunset', seed: 91,
    spawn: { x: -22, z: -6 }, spawnYaw: -Math.PI / 2,
    pads: [[-34, -30, -14, -16, 3.2, 3, MAT.dirt]],
    build(sim, rng, h) {
      // lodge on the hill (north-west), on a pad
      placeBuilding(sim, makeBuilding({ w: 120, d: 70, floors: 2, wall: MAT.wood, wallT: 3, lining: MAT.plaster, roof: 'gable', roofMat: MAT.sheetmetal, doors: 's', partitions: true, lamps: true, winStep: 20, seed: 4 }), -30, 3.2, -28, 'lodge');
      for (let i = 0; i < 3; i++) table(sim, -28 + i * 3, 3.35, -26.5);
      hatchback(sim, -18, 3.3, -24, Math.PI / 2);

      // cabins around the north and west shore: [x, z, door]
      const cabins: [number, number, string][] = [[-14, 4, 'e'], [-8, -8, 's'], [6, -12, 's'], [20, -6, 's'], [29, 0, 'w']];
      for (let i = 0; i < cabins.length; i++) {
        const [x, z, door] = cabins[i];
        const gy = plinth(sim, h, x - 0.3, z - 0.3, 6.6, 5.6, MAT.rock);
        placeBuilding(sim, makeBuilding({ w: 60, d: 50, floors: 1, wall: MAT.wood, wallT: 3, roof: 'gable', roofMat: i % 2 ? MAT.wood : MAT.tile, doors: door, lamps: true, winStep: 18, seed: 10 + i }), x, gy, z, 'cabin');
        table(sim, x + 1, gy + 0.15, z + 1.2);
        chair(sim, x + 2.6, gy + 0.15, z + 1.3, i);
      }

      // boathouse on stilts at the north shore, half over the water
      const bx = -4, bz = 0;
      const bh = new VoxelGrid(70, 70, 90);
      for (let px = 0; px < 70; px += 22) for (let pz = 0; pz < 90; pz += 22) if (pz < 30 || px < 12 || px > 56) box(bh, Math.min(px, 66), 0, Math.min(pz, 86), Math.min(px, 66) + 4, 40, Math.min(pz, 86) + 4, shaded(MAT.wood, 2, 3));
      box(bh, 0, 40, 0, 70, 42, 30, planks(MAT.wood, 3, 4)); // floor over land
      box(bh, 0, 40, 30, 12, 42, 90, planks(MAT.wood, 3, 4)); box(bh, 58, 40, 30, 70, 42, 90, planks(MAT.wood, 3, 4)); // walkways, slip open
      box(bh, 0, 42, 0, 70, 64, 2, planks(MAT.wood, 3, 5)); box(bh, 0, 42, 0, 2, 64, 90, planks(MAT.wood, 3, 5, 'z')); box(bh, 68, 42, 0, 70, 64, 90, planks(MAT.wood, 3, 5, 'z'));
      clear(bh, 28, 42, 0, 40, 62, 2);
      for (let i = 0; i < 6; i++) box(bh, 0, 64 + i, i * 6, 70, 65 + i, 90, shaded(MAT.sheetmetal, 4, 6));
      addStatic(sim, bh, bx, -2.8, bz, 'boathouse');
      boat(sim, bx + 1.8, 0.1, bz + 6, 0);

      // long pier into the lake from the east shore + boats
      pier(sim, 14, 1.5, 10, 13, 2.4, false, 4.5);
      boat(sim, 22, 0.1, 13.5, 0.3);
      boat(sim, 14, 0.1, 18, 2.2);
      boat(sim, 4, 0.1, 22, -0.8);

      // camp fire ring + benches + wood pile near the spawn
      const ring = new VoxelGrid(16, 4, 16);
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, z - 7.5); if (d < 8 && d > 5.5) box(ring, x, 0, z, x + 1, 4, z + 1, pal(MAT.rock, (x + z) % 5)); else if (d <= 5.5) box(ring, x, 0, z, x + 1, 2, z + 1, pal(MAT.char, 2)); }
      addStatic(sim, ring, -26.8, h(-26, -2) - 0.2, -2.8, 'fire ring');
      for (let i = 0; i < 6; i++) crate(sim, -30 + (i % 3) * 0.9, h(-30, 4) + 0.2 + (i >= 3 ? 0.85 : 0), 4, 8);
      barrel(sim, -31, h(-31, 6) + 0.2, 6, true);
      fence(sim, -37, h(-37, 10), 10, 16, false, MAT.wood, 12);

      // forest
      const clear0 = (x: number, z: number) => lakeD(x, z) > 15 && Math.hypot(x + 22, z + 6) > 6 && !(x > -32 && x < -14 && z > -32 && z < -14)
        && !cabins.some(([cx, cz]) => x > cx - 2 && x < cx + 8 && z > cz - 2 && z < cz + 7) && !(x > bx - 2 && x < bx + 9 && z > bz - 2 && z < bz + 10);
      for (let i = 0; i < 50; i++) { const x = rng.range(-37, 37), z = rng.range(-37, 37); if (clear0(x, z)) (i % 5 ? pine : tree)(sim, x, h(x, z), z, i); }
      for (let i = 0; i < 8; i++) { const x = rng.range(-36, 36), z = rng.range(-36, 36); if (clear0(x, z) || (lakeD(x, z) > 12.5 && lakeD(x, z) < 14)) rock(sim, x, h(x, z), z, 5 + (i % 6), i); }
    },
  })],
});
