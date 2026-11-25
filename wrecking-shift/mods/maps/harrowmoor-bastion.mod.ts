import { MAT, VoxelGrid, box, bricks, clear, cylinderY, defineMod, levelKit, pal, planks, shaded, siteMap } from '../../src/mods/kit';
import { hash3 } from '../../src/sim/rng';
import type { Sim } from '../../src/sim/sim';

const { makeBuilding, addStatic, rock, tree, barrel, crate, spool, dropFloating } = levelKit;

const WALL_H = 50, T = 10;

/** stone curtain wall piece along x or z with a ruined (noisy) top, crenels and a hollow rubble core */
function wallPiece(sim: Sim, x: number, z: number, len: number, alongZ: boolean, seed: number, ruinA = 0, ruinB = 0) {
  const L = Math.round(len * 10);
  const g = alongZ ? new VoxelGrid(T, WALL_H + 6, L) : new VoxelGrid(L, WALL_H + 6, T);
  const stone = shaded(MAT.rock, 3, seed), brick = bricks(MAT.brick, seed);
  for (let a = 0; a < L; a++) {
    // ruined ends slope down toward a breach
    const fa = ruinA ? Math.min(1, a / ruinA) : 1, fb = ruinB ? Math.min(1, (L - 1 - a) / ruinB) : 1;
    const ruin = Math.min(fa, fb);
    const top0 = Math.round((WALL_H + (((a / 6) | 0) % 2 ? 5 : 0)) * ruin - hash3(a >> 1, seed, 3) * 8 * (1 - ruin));
    const top = Math.max(ruin < 1 ? 4 : WALL_H, Math.min(WALL_H + 5, top0));
    for (let y = 0; y < top; y++) for (let b = 0; b < T; b++) {
      const shell = b < 3 || b >= T - 3 || y >= top - 3 || y < 3;
      if (!shell) continue;
      const p = y < 22 ? stone(a, y, b) : brick(a, y, b);
      alongZ ? g.set(b, y, a, p) : g.set(a, y, b, p);
    }
  }
  return addStatic(sim, g, x, -0.3, z, 'curtain wall', ['fort']);
}

/** round corner tower, hollow, with a doorway on the inner side and a ragged top */
function tower(sim: Sim, cx: number, cz: number, r: number, h: number, seed: number, doorDx: number, doorDz: number) {
  const S = r * 2 + 2, c = S / 2;
  const g = new VoxelGrid(S, h + 6, S);
  cylinderY(g, c, c, r, 0, h, (x, y, z) => (y < 26 ? pal(MAT.rock, (hash3(x >> 1, y >> 1, z >> 1, seed) * 5) | 0) : bricks(MAT.brick, seed)(x, y, z)), 4);
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - c, z + 0.5 - c);
    if (d > r || d < r - 4) continue;
    const ragged = Math.round(h - hash3(x >> 2, seed, z >> 2) * 22);
    for (let y = ragged; y < h; y++) g.set(x, y, z, 0);
    if (Math.atan2(z - c, x - c) % 0.5 < 0.25) for (let y = ragged; y < ragged + 4 && ragged > h - 12; y++) g.set(x, y, z, pal(MAT.rock, 2));
  }
  cylinderY(g, c, c, r - 4, 0, 2, shaded(MAT.dirt, 4, 1));
  // wooden floor ring halfway up + arrow slits
  cylinderY(g, c, c, r - 3.5, 34, 36, planks(MAT.wood, 3, seed));
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; clear(g, Math.round(c + Math.cos(a) * (r - 2)) - 1, 40, Math.round(c + Math.sin(a) * (r - 2)) - 1, Math.round(c + Math.cos(a) * (r - 2)) + 1, 50, Math.round(c + Math.sin(a) * (r - 2)) + 1); }
  const dx = Math.round(c + doorDx * (r - 2)), dz = Math.round(c + doorDz * (r - 2));
  clear(g, dx - 5, 2, dz - 5, dx + 5, 24, dz + 5);
  dropFloating(g);
  return addStatic(sim, g, cx - c * 0.1, -0.3, cz - c * 0.1, 'tower', ['fort']);
}

/** The broken shell of an old stone fort: curtain walls with breaches, four corner towers, a gatehouse and a gutted keep. */
export default defineMod({
  id: 'harrowmoor-bastion', name: 'Harrowmoor Bastion', category: 'maps', author: 'Wrecking Shift',
  description: 'The ruins of a hilltop fort: breached stone curtain walls, four crumbling corner towers, a gatehouse arch and a gutted brick keep. Finish the job time started.',
  maps: [siteMap({
    id: 'harrowmoor-bastion', title: 'Harrowmoor Bastion', blurb: 'stone fort ruins', half: 38.4, ground: MAT.grass, sky: 'overcast',
    spawn: { x: 0, y: 0.05, z: 30 }, spawnYaw: 0, seed: 111,
    build(sim, rng) {
      const x0 = -20, x1 = 20, z0 = -24, z1 = 16;
      // north wall with a breach in the middle
      wallPiece(sim, x0 + 2, z0, 16, false, 1, 0, 40);
      wallPiece(sim, 3, z0, 15, false, 2, 30, 0);
      // south wall either side of the gatehouse
      wallPiece(sim, x0 + 2, z1 - 1, 15, false, 3);
      wallPiece(sim, 3, z1 - 1, 15, false, 4, 0, 0);
      // west wall: solid; east wall: two pieces with a rubble gap
      wallPiece(sim, x0, z0 + 2, 36, true, 5, 0, 0);
      wallPiece(sim, x1 - 1, z0 + 2, 14, true, 6, 0, 30);
      wallPiece(sim, x1 - 1, z0 + 20, 18, true, 7, 50, 0);
      tower(sim, x0 + 0.5, z0 + 0.5, 32, 70, 1, 1, 1);
      tower(sim, x1 - 0.5, z0 + 0.5, 30, 60, 2, -1, 1);
      tower(sim, x0 + 0.5, z1 - 0.5, 30, 64, 3, 1, -1);
      tower(sim, x1 - 0.5, z1 - 0.5, 34, 76, 4, -1, -1);

      // gatehouse: thick block with an arched passage
      const gh = new VoxelGrid(60, 80, 40);
      box(gh, 0, 0, 0, 60, 70, 40, shaded(MAT.rock, 3, 9));
      clear(gh, 4, 0, 4, 56, 66, 36);
      box(gh, 4, 36, 4, 56, 38, 36, planks(MAT.wood, 3, 8));
      for (let x = 0; x < 60; x += 8) box(gh, x, 70, 0, x + 4, 76, 40, shaded(MAT.rock, 3, 10));
      for (let x = 18; x < 42; x++) for (let y = 0; y < 34; y++) {
        const dx = x + 0.5 - 30;
        if (y < 22 || Math.hypot(dx, y - 22) < 12) for (let z = 0; z < 40; z++) gh.set(x, y, z, 0);
      }
      for (let y = 26; y < 34; y++) box(gh, 18, y, 18, 42, y + 1, 20, y % 2 ? pal(MAT.steel, 1) : 0); // portcullis remains
      clear(gh, 8, 38, 0, 14, 50, 4); clear(gh, 46, 38, 0, 52, 50, 4);
      addStatic(sim, gh, -3, -0.3, z1 - 2.5, 'gatehouse', ['fort']);

      // keep: two-storey brick block, roofless, partly collapsed
      const keep = makeBuilding({ w: 100, d: 80, floors: 2, floorH: 34, wall: MAT.brick, wallT: 4, roof: 'none', doors: 's', doorW: 14, doorH: 26, winW: 6, winH: 14, sill: 12, winStep: 20, seed: 13 });
      for (let x = 0; x < keep.sx; x++) for (let z = 0; z < keep.sz; z++) {
        const cut = Math.round(keep.sy - 1 - hash3(x >> 3, 13, z >> 3) * 30 - (x > 60 && z < 40 ? 30 : 0));
        for (let y = cut; y < keep.sy; y++) keep.set(x, y, z, 0);
      }
      for (let x = 60; x < 96; x++) for (let z = 4; z < 40; z++) for (let y = 34; y < 40; y++) keep.set(x, y, z, 0); // collapsed upper floor
      dropFloating(keep);
      addStatic(sim, keep, -6, -0.2, -16, 'keep', ['fort', 'keep']);

      // rubble, powder kegs, overgrowth
      for (let i = 0; i < 14; i++) { const x = rng.range(-18, 18), z = rng.range(-22, 14); if (!(x > -7 && x < 5 && z > -17 && z < -7)) rock(sim, x, 0, z, 4 + (i % 6), i); }
      for (const [x, z] of [[-1, -24], [19.5, -6], [19.5, -3]]) rock(sim, x, 0, z, 8, (x * 3) | 0);
      for (let i = 0; i < 5; i++) barrel(sim, -16 + (i % 3) * 0.7, 0.05, -20 + Math.floor(i / 3) * 0.7, true);
      for (let i = 0; i < 4; i++) crate(sim, 12 + (i % 2) * 0.9, 0.05 + (i >= 2 ? 0.85 : 0), 10, 8);
      spool(sim, 10, 0.05, -20);
      for (const [x, z] of [[-14, 4], [14, -14], [8, 8], [-30, -30], [30, 26], [-28, 22], [32, -20]]) tree(sim, x, 0, z, (x * 5 + z) | 0, 1);
    },
  })],
});
