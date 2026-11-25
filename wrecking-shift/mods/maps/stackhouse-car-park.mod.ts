import { MAT, VoxelGrid, box, defineMod, flat, levelKit, pal, shaded, siteMap } from '../../src/mods/kit';
import type { Sim } from '../../src/sim/sim';
import { hatchback, van } from '../../src/sim/prefabs/vehicles';
import { slab } from './_util';

const { addStatic, streetLamp, barrel, crate, makeBuilding, placeBuilding, fence } = levelKit;

const D1 = 32, D2 = 64; // deck surfaces in voxels above grade

/**
 * One quarter of the deck structure (200 x 140 voxels). `ext` = which sides are outside edges (parapets),
 * `gap1` / `gap2` = parapet openings [side, from, to] on deck 1 / deck 2 where the ramps join.
 */
function quarter(sim: Sim, x: number, z: number, ext: string, gaps: [1 | 2, string, number, number][]) {
  const W = 200, L = 140;
  const g = new VoxelGrid(W, D2 + 11, L);
  const con = shaded(MAT.concrete, 6, (x * 3 + z) | 0);
  box(g, 0, D1 - 3, 0, W, D1, L, con);
  box(g, 0, D2 - 3, 0, W, D2, L, con);
  // bay markings
  for (const y of [D1 - 1, D2 - 1]) for (let a = 4; a < W; a += 26) { box(g, a, y, 6, a + 1, y + 1, 50, pal(MAT.whitepaint, 1)); box(g, a, y, L - 50, a + 1, y + 1, L - 6, pal(MAT.whitepaint, 1)); }
  // columns (4 x 4) and downstand beams
  for (const cx of [0, 64, 128, 196]) for (const cz of [0, 68, 136]) box(g, cx, 0, cz, cx + 4, D2 - 3, cz + 4, shaded(MAT.concrete, 3, 3));
  for (const cz of [0, 68, 136]) { box(g, 0, D1 - 6, cz, W, D1 - 3, cz + 4, con); box(g, 0, D2 - 6, cz, W, D2 - 3, cz + 4, con); }
  // parapets on the outside edges, 1 m high
  for (const [deck, y] of [[1, D1], [2, D2]] as const) {
    const open = (side: string, a: number) => gaps.some(([d, s, a0, a1]) => d === deck && s === side && a >= a0 && a < a1);
    for (let a = 0; a < L; a++) {
      if (ext.includes('w') && !open('w', a)) box(g, 0, y, a, 2, y + 10, a + 1, con);
      if (ext.includes('e') && !open('e', a)) box(g, W - 2, y, a, W, y + 10, a + 1, con);
    }
    for (let a = 0; a < W; a++) {
      if (ext.includes('n') && !open('n', a)) box(g, a, y, 0, a + 1, y + 10, 2, con);
      if (ext.includes('s') && !open('s', a)) box(g, a, y, L - 2, a + 1, y + 10, L, con);
    }
  }
  return addStatic(sim, g, x, -0.2, z, 'car park');
}

/** straight ramp along z: surface falls from `yHigh` at the north end to `yLow` at the south end; curbs + columns */
function ramp(sim: Sim, x: number, z: number, len: number, yLow: number, yHigh: number, flatHigh = 0, flatLow = 0) {
  const W = 70;
  const g = new VoxelGrid(W, yHigh + 6, len);
  const con = shaded(MAT.concrete, 6, 9);
  for (let i = 0; i < len; i++) {
    // high end at z0 (flat for `flatHigh` voxels), low end at z1 (flat for the last `flatLow`)
    const t = 1 - Math.max(0, Math.min(1, (i - flatHigh) / Math.max(1, len - flatHigh - flatLow - 1)));
    const top = Math.round(yLow + (yHigh - yLow) * t);
    box(g, 0, Math.max(0, top - 3), i, W, top, i + 1, con);
    box(g, 0, top, i, 2, top + 6, i + 1, con); box(g, W - 2, top, i, W, top + 6, i + 1, con);
    if (i % 30 < 4 && top > 4) { box(g, 4, 0, i, 8, top - 3, i + 1, con); box(g, W - 8, 0, i, W - 4, top - 3, i + 1, con); }
  }
  return addStatic(sim, g, x, -0.2, z, 'ramp');
}

/** A two-deck concrete car park with external ramps, parked cars and a ticket booth. */
export default defineMod({
  id: 'stackhouse-car-park', name: 'Stackhouse Car Park', category: 'maps', author: 'Wrecking Shift',
  description: 'A bare concrete multi-storey car park: two decks on columns, ramps up the outside, cars on every level and a ticket booth at the barrier.',
  maps: [siteMap({
    id: 'stackhouse-car-park', title: 'Stackhouse Car Park', blurb: 'multi-level, ramps, cars', half: 38.4, ground: MAT.asphalt, sky: 'overcast',
    spawn: { x: 10, y: 0.05, z: 24 }, spawnYaw: 0, seed: 71,
    build(sim, rng) {
      // the deck (x -20..20, z -16..12)
      quarter(sim, -20, -16, 'wn', [[2, 'w', 0, 60]]);
      quarter(sim, 0, -16, 'en', [[1, 'e', 0, 60]]);
      quarter(sim, -20, -2, 'ws', [[1, 'w', 90, 140]]);
      quarter(sim, 0, -2, 'es', []);
      // ramp A: ground -> deck 1 along the east side (high end at the north)
      ramp(sim, 20, -16, 220, 1, D1, 60, 0);
      // ramp B: deck 1 -> deck 2 along the whole west side (joins deck 1 at its south end, deck 2 at the north)
      ramp(sim, -27, -16, 280, D1, D2, 60, 50);

      // ticket booth + barrier at the entrance to ramp A
      placeBuilding(sim, makeBuilding({ w: 24, d: 24, floors: 1, wall: MAT.concrete, roof: 'flat', doors: 'w', winW: 8, winStep: 10, seed: 3 }), 28.5, 0, 7.5, 'booth');
      const bar = new VoxelGrid(70, 12, 3);
      box(bar, 0, 0, 0, 3, 11, 3, flat(MAT.paintedmetal, 0));
      for (let a = 3; a < 70; a++) bar.set(a, 10, 1, pal(a % 10 < 5 ? MAT.whitepaint : MAT.plastic, 1));
      addStatic(sim, bar, 20, -0.2, 8, 'barrier');
      slab(sim, -30, 0, 14, 60, 0.3, pal(MAT.whitepaint, 1), 'kerb line');

      // cars on every level
      hatchback(sim, -14, 0.1, 6, 0);
      van(sim, 6, 0.1, -9, 0);
      hatchback(sim, -6, D1 / 10 - 0.1, -10, Math.PI);
      hatchback(sim, 12, D1 / 10 - 0.1, 6, 0.2);
      van(sim, -12, D2 / 10 - 0.1, 2, Math.PI / 2);
      hatchback(sim, 8, D2 / 10 - 0.1, -6, -Math.PI / 2);
      // things to set off
      for (let i = 0; i < 4; i++) barrel(sim, -18 + i * 0.7, D1 / 10 - 0.15, 9, i % 2 === 0);
      for (let i = 0; i < 3; i++) barrel(sim, 16 + i * 0.7, D2 / 10 - 0.15, 9, true);
      for (let i = 0; i < 6; i++) crate(sim, rng.range(-18, -8), 0.05, rng.range(-14, -12), 8);
      for (const x of [-14, 0, 14]) streetLamp(sim, x, D2 / 10, 10.4);
      fence(sim, -38.2, 0, -38.2, 76, false, MAT.concrete, 10);
    },
  })],
});
