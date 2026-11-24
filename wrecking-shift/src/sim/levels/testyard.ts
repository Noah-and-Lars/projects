import { bricks, box, clear, flat, gableRoofX, planks, shaded, shell, windowX, windowZ } from '../build';
import { MAT, pal } from '../materials';
import { hatchback, van } from '../prefabs/vehicles';
import type { Sim } from '../sim';
import { VoxelGrid } from '../voxels';
import { barrel, crate, tree } from './kit';
import type { LevelDef, LevelInfo } from './types';

/** ground tile with grass / dirt / bedrock layers; top surface at world y = 0 */
export function groundTile(sim: Sim, wx: number, wz: number, nx = 256, nz = 256, top: number = MAT.grass) {
  const g = new VoxelGrid(nx, 8, nz);
  g.fill(0, 0, 0, nx, 2, nz, shaded(MAT.bedrock, 4));
  g.fill(0, 2, 0, nx, 7, nz, shaded(MAT.dirt, 2));
  g.fill(0, 7, 0, nx, 8, nz, shaded(top, 2, 3));
  const b = sim.addBody(g, { x: wx, y: -0.8, z: wz }, { name: 'ground' });
  b.noFracture = true;
  b.impactProof = true;
  return b;
}

export function brickHouse(sim: Sim, wx: number, wz: number, seed = 1) {
  const W = 80, H = 60, D = 60;
  const g = new VoxelGrid(W, H, D);
  const wallH = 32;
  // foundation + floor
  box(g, 0, 0, 0, W, 2, D, shaded(MAT.concrete, 3));
  box(g, 3, 2, 3, W - 3, 3, D - 3, planks(MAT.wood, 4, seed));
  // walls
  shell(g, 0, 2, 0, W, wallH, D, 3, bricks(MAT.brick, seed));
  // door (front, z = 0 side)
  clear(g, 34, 2, 0, 44, 23, 3);
  // windows
  windowX(g, 10, 24, 12, 24, 0, 3);
  windowX(g, 54, 68, 12, 24, 0, 3);
  windowX(g, 14, 30, 12, 24, D - 3, D);
  windowX(g, 50, 66, 12, 24, D - 3, D);
  windowZ(g, 20, 40, 12, 24, 0, 3);
  windowZ(g, 20, 40, 12, 24, W - 3, W);
  // ceiling beams + ceiling
  for (let x = 6; x < W; x += 12) box(g, x, wallH - 3, 0, x + 2, wallH, D, planks(MAT.wood, 3, seed + 1, 'z'));
  box(g, 0, wallH, 0, W, wallH + 1, D, planks(MAT.wood, 4, seed + 2));
  // gable ends + roof
  for (let i = 0; i < D / 2; i++) {
    box(g, 0, wallH + 1 + i, i, 2, wallH + 2 + i, D - i, bricks(MAT.brick, seed));
    box(g, W - 2, wallH + 1 + i, i, W, wallH + 2 + i, D - i, bricks(MAT.brick, seed));
  }
  gableRoofX(g, 0, W, wallH + 1, 0, D, shaded(MAT.tile, 2, seed), 2);
  // interior: table + lamp
  box(g, 50, 3, 30, 66, 4, 44, 0);
  for (const [x, z] of [[50, 30], [65, 30], [50, 43], [65, 43]]) box(g, x, 3, z, x + 1, 10, z + 1, pal(MAT.wood, 0));
  box(g, 50, 10, 30, 66, 11, 44, planks(MAT.wood, 2, 9));
  box(g, 38, wallH - 5, 28, 42, wallH - 3, 32, pal(MAT.lamp));
  return sim.addBody(g, { x: wx, y: 0, z: wz }, { name: 'house' });
}

export function shed(sim: Sim, wx: number, wz: number) {
  const W = 60, H = 40, D = 50;
  const g = new VoxelGrid(W, H, D);
  box(g, 0, 0, 0, W, 2, D, shaded(MAT.concrete, 4));
  // concrete pillars
  for (const [x, z] of [[0, 0], [W - 4, 0], [0, D - 4], [W - 4, D - 4], [28, 0], [28, D - 4]]) box(g, x, 2, z, x + 4, 30, z + 4, shaded(MAT.concrete, 2));
  // sheet metal walls (1 voxel) on three sides
  box(g, 4, 2, 1, W - 4, 30, 2, shaded(MAT.sheetmetal, 6, 1));
  box(g, 1, 2, 4, 2, 30, D - 4, shaded(MAT.sheetmetal, 6, 2));
  box(g, W - 2, 2, 4, W - 1, 30, D - 4, shaded(MAT.sheetmetal, 6, 3));
  clear(g, 4, 2, 1, 26, 24, 2);
  // steel roof frame + metal roof
  box(g, 0, 30, 0, W, 32, D, shaded(MAT.sheetmetal, 8, 4));
  box(g, 0, 28, 0, W, 30, 2, flat(MAT.steel));
  box(g, 0, 28, D - 2, W, 30, D, flat(MAT.steel));
  return sim.addBody(g, { x: wx, y: 0, z: wz }, { name: 'shed' });
}

export const testYard: LevelDef = {
  id: 'testyard',
  title: 'Test Yard',
  build(sim: Sim): LevelInfo {
    for (let i = -1; i <= 0; i++) for (let j = -1; j <= 0; j++) groundTile(sim, i * 25.6, j * 25.6);
    brickHouse(sim, -4, -14);
    shed(sim, 8, -2);
    tree(sim, -9, 0, 2, 4);
    tree(sim, 3, 0, 9, 7);
    crate(sim, 0, 0.05, -4);
    crate(sim, 0.9, 0.05, -4);
    crate(sim, 0.4, 0.9, -4);
    barrel(sim, 10, 0.25, 0);
    barrel(sim, 3, 0.05, 2);
    // vehicles: the escape van faces the back of the house, the hatchback parked by the tree
    van(sim, -2.4, 0, 9, 0);
    hatchback(sim, -15, 0, 6, 0.4);
    return {
      name: 'Test Yard',
      spawn: { x: 0, y: 0.05, z: 4 },
      spawnYaw: 0,
      bounds: { min: { x: -25.6, y: -5, z: -25.6 }, max: { x: 25.6, y: 40, z: 25.6 } },
      waterLevel: null,
      sunDir: { x: -0.45, y: -0.75, z: -0.5 },
      sky: 'day',
      // mission markers (see src/sim/mission.ts): escape point next to the spawn, helicopter approach
      markers: { escape: { x: 0, y: 0, z: 5 }, heli_start: { x: -70, y: 32, z: 70 } },
    };
  },
};
