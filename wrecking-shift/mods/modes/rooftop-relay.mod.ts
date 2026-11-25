import { MAT, VoxelGrid, box, bricks, checkpoints, defineMod, flat, levelKit, pal, planks, shaded, siteMap } from '../../src/mods/kit';
import type { Sim } from '../../src/sim/sim';
import { beacon } from '../maps/_util';

const { addStatic, stairs, crate, tree } = levelKit;

const POINTS = [
  { x: 0, y: 3, z: 8 },     // roof A
  { x: -2, y: 3, z: -1 },   // roof B after the first gap
  { x: 0, y: 6, z: -13 },   // roof C (top of the stair, second gap)
  { x: 10, y: 3, z: -14 },  // roof D (drop across)
  { x: 10, y: 3, z: -6 },   // beam
  { x: 10, y: 3, z: 2 },    // roof E
  { x: 10, y: 0, z: 13.3 }, // finish line
];

/**
 * hollow roof block: walls + a 3-voxel roof slab, top surface `top` voxels above grade, min corner (x, z) in metres.
 * `extra` may add stairs / features in the grid's coords.
 */
function roofBlock(sim: Sim, x: number, z: number, w: number, d: number, top: number, mat: number, extra?: (g: VoxelGrid) => void, extraH = 0) {
  const W = Math.round(w * 10), D = Math.round(d * 10);
  const g = new VoxelGrid(W, top + extraH + 1, D);
  const wall = mat === MAT.brick ? bricks(MAT.brick, W) : shaded(mat, 4, W);
  box(g, 0, 0, 0, W, top, 3, wall); box(g, 0, 0, D - 3, W, top, D, wall);
  box(g, 0, 0, 0, 3, top, D, wall); box(g, W - 3, 0, 0, W, top, D, wall);
  box(g, 0, top - 3, 0, W, top, D, shaded(MAT.concrete, 5, D));
  for (let a = 12; a < W - 12; a += 24) box(g, a, 9, 0, a + 10, 22, 3, pal(MAT.glass, 2)); // windows
  extra?.(g);
  return addStatic(sim, g, x, -0.1, z, 'rooftop');
}

/** A foot race across the rooftops of a little block: stairs up, gap jumps, a climb, a drop and a beam walk. */
export default defineMod({
  id: 'rooftop-relay', name: 'Rooftop Relay', category: 'modes', author: 'Wrecking Shift',
  description: 'Seven checkpoints over the roofs of Larkspur Yard: climb the fire stair, jump the gaps, walk the beam and drop to the finish inside 75 seconds.',
  maps: [siteMap({
    id: 'larkspur-roofs', title: 'Larkspur Roofs', blurb: 'rooftop race course', ground: MAT.concrete, sky: 'sunset', seed: 211,
    spawn: { x: 0, y: 0.05, z: 22 }, spawnYaw: 0,
    build(sim, rng) {
      // fire stair from the street up to roof A (3.0 m), climbing toward -z
      const fs = new VoxelGrid(30, 41, 52);
      stairs(fs, 'z', 52, -1, 0, 30, 0, 30, flat(MAT.steel));
      box(fs, 0, 27, 0, 30, 30, 7, flat(MAT.steel)); // landing
      addStatic(sim, fs, -1.5, -0.1, 12.4, 'fire stair');
      // A: z 4..12.4, top 3.0
      roofBlock(sim, -4, 4, 8, 8.4, 31, MAT.brick);
      // B: z -6..2.4 (1.6 m gap), with a stair up to 6.0 m at its north end
      roofBlock(sim, -4, -6, 8, 8.4, 31, MAT.concrete, (g) => { stairs(g, 'z', 48, -1, 25, 55, 31, 30, flat(MAT.steel)); }, 30);
      // C: z -18..-8 (2 m gap), top 6.0
      roofBlock(sim, -4, -18, 8, 10, 61, MAT.brick);
      // D: east of C across a 2 m gap, back down at 3.0
      roofBlock(sim, 6, -18, 8, 8, 31, MAT.wood);
      // beam walk from D (z -10) to E (z -2)
      const bm = new VoxelGrid(5, 31, 80);
      box(bm, 0, 28, 0, 5, 31, 80, planks(MAT.wood, 2, 3, 'z'));
      box(bm, 1, 0, 38, 4, 28, 42, flat(MAT.steel));
      addStatic(sim, bm, 9.8, -0.1, -10, 'beam');
      // E: z -2..6, top 3.0, then a stack of crates to drop down on
      roofBlock(sim, 6, -2, 8, 8, 31, MAT.brick);
      for (let i = 0; i < 4; i++) crate(sim, 10 + (i % 2) * 0.9, 0.1 + Math.floor(i / 2) * 0.9, 7.2, 8);
      // finish line paint + spectators' trees
      const fl = new VoxelGrid(60, 1, 6);
      box(fl, 0, 0, 0, 60, 1, 6, (x) => pal(((x / 6) | 0) % 2 ? MAT.whitepaint : MAT.asphalt, 1));
      addStatic(sim, fl, 7, 0, 13, 'finish');
      for (let i = 0; i < 6; i++) tree(sim, -20 + rng.range(-1, 1), 0, -20 + i * 8, i, 0.8);
      for (let i = 0; i < 4; i++) tree(sim, 20, 0, -18 + i * 10, 10 + i, 0.7);
      POINTS.forEach((p, i) => beacon(sim, p, i));
    },
  })],
  modes: [{
    id: 'rooftop-relay', title: 'Rooftop Relay', level: 'larkspur-roofs', tools: ['plank'],
    rules: ['Run the rooftop course: seven checkpoints in order.', 'Fire stair, two gap jumps, a climb, a drop, a beam walk and down to the finish.', '75 seconds. Only the plank tool is allowed (bridge a gap you cannot make).'],
    create: () => checkpoints({
      seconds: 75, radius: 2.2,
      points: POINTS,
    }),
  }],
});
