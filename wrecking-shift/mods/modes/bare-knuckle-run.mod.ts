import { MAT, VoxelGrid, box, checkpoints, defineMod, flat, levelKit, planks, shaded, siteMap, type PalFn } from '../../src/mods/kit';
import type { Sim } from '../../src/sim/sim';
import { beacon } from '../maps/_util';

const { addStatic, crate, tree, fence } = levelKit;

const POINTS = [
  { x: 0, y: 2.4, z: 6 },     // top of the posts
  { x: 0, y: 2.4, z: -6 },    // end of the first beam
  { x: 15.5, y: 3.6, z: -6.5 }, // after the gap jumps
  { x: 15.5, y: 3.6, z: 6.8 },  // end of the long beam
  { x: 15.5, y: 5.4, z: 13.3 }, // summit
  { x: 16, y: 0, z: 19.8 },     // finish line
];

/** hollow block from (x0, z0) to (x1, z1) metres with its top surface at `top` m */
function block(sim: Sim, x0: number, z0: number, x1: number, z1: number, top: number, p: PalFn) {
  const W = Math.round((x1 - x0) * 10), D = Math.round((z1 - z0) * 10), H = Math.round(top * 10) + 1;
  const g = new VoxelGrid(W, H, D);
  if (W <= 8 || D <= 8) box(g, 0, 0, 0, W, H, D, p);
  else {
    box(g, 0, 0, 0, W, H, 2, p); box(g, 0, 0, D - 2, W, H, D, p); box(g, 0, 0, 0, 2, H, D, p); box(g, W - 2, 0, 0, W, H, D, p);
    box(g, 0, H - 3, 0, W, H, D, p);
  }
  return addStatic(sim, g, x0, -0.1, z0, 'course');
}

/** 0.3 m wide beam at height `top` from a to b along x or z, on thin posts every 2 m */
function beam(sim: Sim, x: number, z: number, len: number, alongZ: boolean, top: number) {
  const L = Math.round(len * 10), H = Math.round(top * 10) + 1;
  const g = alongZ ? new VoxelGrid(3, H, L) : new VoxelGrid(L, H, 3);
  for (let a = 0; a < L; a++) {
    const set = (y0: number, y1: number, p: PalFn) => (alongZ ? box(g, 0, y0, a, 3, y1, a + 1, p) : box(g, a, y0, 0, a + 1, y1, 3, p));
    set(H - 2, H, planks(MAT.wood, 2, 3, alongZ ? 'z' : 'x'));
    if (a % 20 === 10) set(0, H - 2, flat(MAT.steel));
  }
  return addStatic(sim, g, x - 0.15 * (alongZ ? 1 : 0), -0.1, z - 0.15 * (alongZ ? 0 : 1), 'beam');
}

/** A freerun course with no tools at all: vault, step up the posts, walk the beams, jump the gaps, climb, drop. */
export default defineMod({
  id: 'bare-knuckle-run', name: 'Bare Knuckle Run', category: 'modes', author: 'Wrecking Shift',
  description: 'No tools, no shortcuts: a freerunning course of posts, balance beams and gap jumps in an empty yard. Six checkpoints in 100 seconds.',
  maps: [siteMap({
    id: 'sprinters-yard', title: "Sprinter's Yard", blurb: 'freerun course', ground: MAT.sand, sky: 'day', seed: 271,
    spawn: { x: 0, y: 0.05, z: 22 }, spawnYaw: 0,
    build(sim, rng) {
      const con = shaded(MAT.concrete, 4, 1), brk = shaded(MAT.brick, 4, 2), wd = planks(MAT.wood, 3, 4);
      block(sim, -2, 17, 2, 17.4, 0.6, brk);                                   // vault wall
      [0.6, 1.2, 1.8, 2.4].forEach((h, i) => block(sim, -0.4, 13.6 - i * 1.5, 0.4, 14.4 - i * 1.5, h, con)); // stepping posts
      block(sim, -2, 4, 2, 8.4, 2.4, con);                                     // P1
      beam(sim, 0, -4, 8, true, 2.4);                                          // beam P1 -> P2
      block(sim, -2, -8, 2, -4, 2.4, con);                                     // P2
      block(sim, 4, -8, 7, -5, 2.4, wd);                                       // gap jumps, each a bit higher
      block(sim, 9, -8, 12, -5, 3.0, wd);
      block(sim, 14, -8, 17, -5, 3.6, brk);                                    // P5
      beam(sim, 15.5, -5, 10, true, 3.6);                                      // long beam south
      block(sim, 14, 5, 17, 8.6, 3.6, brk);                                    // P6
      block(sim, 14, 8.6, 17, 9.6, 4.2, con); block(sim, 14, 9.6, 17, 10.6, 4.8, con); block(sim, 14, 10.6, 17, 11.6, 5.4, con); // steps
      block(sim, 13, 11.6, 18, 15, 5.4, brk);                                  // P7 summit
      for (let i = 0; i < 6; i++) crate(sim, 15 + (i % 3) * 0.9, 0.05 + Math.floor(i / 3) * 0.85, 16.2, 8); // something soft-ish to drop past
      const fl = new VoxelGrid(50, 1, 6);
      box(fl, 0, 0, 0, 50, 1, 6, (x) => (((x / 5) | 0) % 2 ? flat(MAT.whitepaint)(x, 0, 0) : flat(MAT.asphalt)(x, 0, 0)));
      addStatic(sim, fl, 13.5, 0, 19.5, 'finish');
      fence(sim, -25, 0, -25, 50, false, MAT.wood, 12);
      for (let i = 0; i < 6; i++) tree(sim, -20 + rng.range(-2, 2), 0, -20 + i * 8, i, 0.8);
      POINTS.forEach((p, i) => beacon(sim, p, i));
    },
  })],
  modes: [{
    id: 'bare-knuckle-run', title: 'Bare Knuckle Run', level: 'sprinters-yard', tools: [],
    rules: ['No tools: just your legs (Shift sprints, Space jumps).', 'Vault the wall, climb the posts, walk the beams, jump the gaps and climb the summit.', 'Six checkpoints in order within 100 seconds. Falling off means climbing back up.'],
    create: () => checkpoints({
      seconds: 100, radius: 1.8,
      points: POINTS,
    }),
  }],
});
