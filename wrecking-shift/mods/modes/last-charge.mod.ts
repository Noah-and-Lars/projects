import { MAT, VoxelGrid, box, cylinderY, defineMod, flat, levelKit, pal, planks, shaded, siteMap } from '../../src/mods/kit';
import type { Sim } from '../../src/sim/sim';
import { fell } from '../maps/_util';

const { addStatic, fence, rock, tree, makeBuilding, placeBuilding, crate } = levelKit;

/**
 * Timber water tower: four raking legs meet in a hub 2-2.8 m up, a single post carries the tank.
 * The hub (or the post just above it) is the one place a single charge brings the whole thing down.
 */
function waterTower(sim: Sim, x: number, z: number) {
  const S = 40, c = S / 2;
  const g = new VoxelGrid(S, 108, S);
  const wood = planks(MAT.wood, 3, 2);
  for (const [cx, cz] of [[2, 2], [S - 5, 2], [2, S - 5], [S - 5, S - 5]]) for (let y = 0; y < 22; y++) {
    const t = y / 21, lx = Math.round(cx + (c - 1.5 - cx) * t), lz = Math.round(cz + (c - 1.5 - cz) * t);
    box(g, lx, y, lz, lx + 3, y + 1, lz + 3, pal(MAT.wood, 0));
  }
  box(g, c - 6, 18, c - 6, c + 6, 28, c + 6, pal(MAT.wood, 1)); // hub
  for (const y of [20, 24]) box(g, c - 6, y, c - 6, c + 6, y + 1, c + 6, flat(MAT.steel)); // steel straps on the hub
  box(g, c - 3, 28, c - 3, c + 3, 70, c + 3, wood); // post
  box(g, c - 12, 68, c - 12, c + 12, 70, c + 12, planks(MAT.wood, 3, 5)); // tank cradle
  cylinderY(g, c, c, 15, 70, 72, planks(MAT.wood, 2, 6));
  cylinderY(g, c, c, 15, 72, 94, (xx, yy, zz) => (yy % 8 === 0 ? pal(MAT.steel, 1) : planks(MAT.wood, 2, 7)(xx, yy, zz)), 2);
  for (let i = 0; i < 12; i++) cylinderY(g, c, c, 16 - i * 1.3, 94 + i, 95 + i, shaded(MAT.sheetmetal, 3, 4));
  for (let y = 0; y < 70; y += 3) box(g, c + 3, y, c - 1, c + 4, y + 1, c + 1, pal(MAT.steel, 2)); // ladder rungs up the post side
  return addStatic(sim, g, x - c * 0.1, -0.1, z - c * 0.1, 'water tower', ['tower']);
}

/** One bomb, one tower: find the weak point. */
export default defineMod({
  id: 'last-charge', name: 'Last Charge', category: 'modes', author: 'Wrecking Shift',
  description: 'The old timber water tower at Saltbrook has to come down and there is exactly one charge left in the truck. Find the weak point. 60 seconds.',
  maps: [siteMap({
    id: 'saltbrook-tower', title: 'Saltbrook Tower', blurb: 'one water tower, one bomb', ground: MAT.grass, sky: 'sunset', seed: 291,
    spawn: { x: 0, y: 0.05, z: 16 }, spawnYaw: 0,
    build(sim, rng) {
      waterTower(sim, 0, -4);
      fence(sim, -6, 0, -10, 12, false, MAT.wood, 12);
      fence(sim, -6, 0, -10, 12, true, MAT.wood, 12);
      fence(sim, 6, 0, -10, 12, true, MAT.wood, 12);
      placeBuilding(sim, makeBuilding({ w: 60, d: 50, floors: 1, wall: MAT.brick, roof: 'gable', roofMat: MAT.tile, doors: 'e', seed: 4 }), -18, 0, -8, 'pump house');
      placeBuilding(sim, makeBuilding({ w: 50, d: 60, floors: 1, wall: MAT.wood, roof: 'gable', roofMat: MAT.sheetmetal, doors: 'w', seed: 5 }), 13, 0, -6, 'store');
      for (let i = 0; i < 4; i++) crate(sim, 10 + (i % 2) * 0.9, 0.05, 6 + Math.floor(i / 2) * 0.9, 8);
      for (let i = 0; i < 6; i++) { const x = rng.range(-22, 22), z = rng.range(-22, -14); rock(sim, x, 0, z, 5 + (i % 4), i); }
      for (const [x, z] of [[-20, 12], [20, 14], [-22, -20], [22, -20]]) tree(sim, x, 0, z, x | 0, 1);
    },
  })],
  modes: [{
    id: 'last-charge', title: 'Last Charge', level: 'saltbrook-tower', tools: ['bomb'],
    rules: ['You have ONE bomb (3 s fuse). There is no second try.', 'Bring the water tower down: nothing of it may stand above 3 m.', '60 seconds. Hint: the legs are not where it is weakest.'],
    create: () => fell({
      tag: 'tower', below: 3, seconds: 60, label: 'Tower down',
      onStart: (ctx) => { const b = ctx.belt?.byId('bomb'); if (b) b.ammo = 1; },
    }),
  }],
});
