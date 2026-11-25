import { MAT, VoxelGrid, box, defineMod, flat, levelKit, pal, shaded } from '../../src/mods/kit';
import { fbm2 } from '../../src/sim/levels/terrain';
import { loader } from '../../src/sim/prefabs/vehicles';
import { plinth, terrainSite } from './_util';

const { makeBuilding, placeBuilding, addStatic, lattice, rock, barrel, crate, container, fence, pine, tank, spool } = levelKit;

const RIM = 6;
/** elliptical distance from the pit centre */
const rr = (x: number, z: number) => Math.hypot(x / 1.15, z);
/** haul road strip: x 3..9, from the pit floor (z 12) up to the rim (z 31) */
const onRoad = (x: number, z: number) => x > 3 && x < 9 && z > 12 && z < 31;

function height(x: number, z: number): number {
  const r = rr(x, z);
  let h: number;
  if (r < 15) h = 0;
  else if (r < 28) h = Math.min(RIM, 2 * Math.floor((r - 15) / 3.2) + 2 * Math.max(0, Math.min(1, ((r - 15) % 3.2) - 2.6) / 0.6));
  else h = RIM + 1.2 * fbm2(x * 0.05, z * 0.05, 4, 3);
  // flooded sump in the west of the floor
  const sump = Math.hypot((x + 8) / 1.4, z + 2);
  if (sump < 6) h = Math.min(h, -2.6 * (1 - Math.max(0, sump - 3) / 3) );
  if (onRoad(x, z)) h = Math.max(0, Math.min(RIM, ((z - 12) / 19) * RIM));
  return h;
}

/** A stepped stone quarry with a flooded sump, a crusher plant, conveyors up the benches and blast stock lying around. */
export default defineMod({
  id: 'greywall-quarry', name: 'Greywall Quarry', category: 'maps', author: 'Wrecking Shift',
  description: 'A deep stepped quarry: rock benches, a flooded sump, a crusher plant with conveyors up to the rim and crates of blasting stock nobody locked away.',
  maps: [terrainSite({
    id: 'greywall-quarry', title: 'Greywall Quarry', blurb: 'rock benches, flooded sump', half: 38.4, height, water: -1, sky: 'day', seed: 81,
    surface: (x, z, h, slope) => (h < -0.7 ? MAT.sand : onRoad(x, z) ? MAT.dirt : slope > 1.1 ? MAT.rock : rr(x, z) < 28 ? (rr(x, z) < 15 ? MAT.sand : MAT.rock) : MAT.grass),
    spawn: { x: 6, z: 34 }, spawnYaw: 0,
    build(sim, rng, h) {
      // crusher plant on the pit floor: concrete hopper building + steel frame
      placeBuilding(sim, makeBuilding({ w: 80, d: 70, floors: 2, floorH: 36, wall: MAT.concrete, roof: 'flat', doors: 'se', doorW: 26, doorH: 28, winW: 10, winStep: 30, frame: MAT.steel, seed: 5 }), 2, 0, -10, 'crusher');
      const hop = new VoxelGrid(40, 60, 40);
      lattice(hop, 0, 0, 40, 0, 40, flat(MAT.steel), 20);
      for (let i = 0; i < 18; i++) { box(hop, i, 40 + i, i, 40 - i, 41 + i, i + 1, shaded(MAT.sheetmetal, 3, 1)); box(hop, i, 40 + i, 39 - i, 40 - i, 41 + i, 40 - i, shaded(MAT.sheetmetal, 3, 1)); box(hop, i, 40 + i, i, i + 1, 41 + i, 40 - i, shaded(MAT.sheetmetal, 3, 1)); box(hop, 39 - i, 40 + i, i, 40 - i, 41 + i, 40 - i, shaded(MAT.sheetmetal, 3, 1)); }
      addStatic(sim, hop, -3.5, -0.3, -9, 'hopper');

      // conveyor up the benches to the north rim: an inclined steel belt on trestles
      const len = 160, rise = 70;
      const cv = new VoxelGrid(10, rise + 16, len);
      for (let i = 0; i < len; i++) {
        const y = Math.round(20 + (rise - 10) * (i / len));
        box(cv, 0, y, i, 10, y + 1, i + 1, flat(MAT.steel));
        box(cv, 1, y + 1, i, 9, y + 2, i + 1, pal(MAT.rubber, 2));
        box(cv, 0, y + 1, i, 1, y + 4, i + 1, flat(MAT.steel)); box(cv, 9, y + 1, i, 10, y + 4, i + 1, flat(MAT.steel));
        if (i % 30 < 2) { box(cv, 0, 0, i, 2, y, i + 1, flat(MAT.steel)); box(cv, 8, 0, i, 10, y, i + 1, flat(MAT.steel)); }
      }
      // reversed so it climbs to the north: build along +z then place with the high end at the rim
      const flip = new VoxelGrid(10, cv.sy, len);
      for (let z = 0; z < len; z++) for (let y = 0; y < cv.sy; y++) for (let x = 0; x < 10; x++) flip.data[flip.idx(x, y, z)] = cv.data[cv.idx(x, y, len - 1 - z)];
      addStatic(sim, flip, 4, -0.3, -27, 'conveyor', ['conveyor']);

      // rim: site office, fuel tank, magazine of blasting stock
      const oy = plinth(sim, h, -12.2, 31.8, 7.4, 3.4, MAT.concrete);
      placeBuilding(sim, makeBuilding({ w: 70, d: 30, floors: 1, wall: MAT.sheetmetal, wallT: 1, lining: MAT.plaster, roof: 'flat', doors: 's', winStep: 18, lamps: true, seed: 8 }), -12, oy, 32, 'site office');
      tank(sim, 24, h(24, 30), 30, 12, 30, true);
      container(sim, -30, h(-28, 26), 25, MAT.paintedmetal, true);
      for (let i = 0; i < 6; i++) barrel(sim, -27 + (i % 3) * 0.7, h(-27, 30) + 0.1, 29 + Math.floor(i / 3) * 0.7, true);
      for (let i = 0; i < 4; i++) crate(sim, 14 + i * 0.9, h(14, 33) + 0.1, 33, 8);
      fence(sim, -36, h(-36, 36), 36.5, 72, false, MAT.wood, 12);

      // on the floor: rubble heaps, boulders, the loader, more stock
      for (let i = 0; i < 10; i++) { const x = rng.range(-14, 2), z = rng.range(2, 11); if (!onRoad(x, z) && Math.hypot(x + 8, z + 2) > 6.5) rock(sim, x, h(x, z), z, 6 + (i % 6), i); }
      for (let i = 0; i < 5; i++) { const a = rng.range(0, Math.PI * 2); const x = Math.cos(a) * 19 * 1.15, z = Math.sin(a) * 19; if (!onRoad(x, z) && z < 10) rock(sim, x, h(x, z), z, 9 + (i % 4), 20 + i); }
      loader(sim, 6, 0.2, 9, Math.PI);
      for (let i = 0; i < 3; i++) barrel(sim, 12 + i * 0.7, 0.1, -2, true);
      for (let i = 0; i < 3; i++) spool(sim, 14, 0.1, 2 + i * 1.1);
      // pines around the rim
      for (let i = 0; i < 26; i++) { const x = rng.range(-37, 37), z = rng.range(-37, 37); if (rr(x, z) > 30 && !(z > 26 && Math.abs(x) < 34)) pine(sim, x, h(x, z), z, i); }
    },
  })],
});
