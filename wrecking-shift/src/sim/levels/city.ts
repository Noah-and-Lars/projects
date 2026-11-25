import { shaded } from '../build';
import { MAT, pal } from '../materials';
import { hatchback, van } from '../prefabs/vehicles';
import { Rng } from '../rng';
import type { Sim } from '../sim';
import { VoxelGrid } from '../voxels';
import { table, crate, makeBuilding, placeBuilding, sculpture, streetLamp, tree, hedge, fence, container } from './kit';
import type { LevelDef, LevelInfo } from './types';

/**
 * Corvane — a large procedural city (about 307 x 307 m): a 6 x 6 grid of blocks on a street grid with lane
 * markings and sidewalks, a ring road round the edge.
 *   downtown (the 4 centre blocks): 6-8 storey concrete-frame towers with big windows, one plaza block
 *   middle ring: 3-5 storey brick blocks with shops on the ground floor, courtyards with parked cars
 *   outer ring: terraced and detached houses with gardens, hedges, fences
 *   south edge: warehouses and yards; a few park blocks with trees
 * Street lamps along the roads, cars parked at the kerbs. Deterministic (seeded).
 * Budget: buildings are hollow (walls, slabs, windows) and the ground is 0.2 m thick (bedrock + surface), so
 * the whole city stays near harbour-scale voxel counts per square metre of buildings.
 */
const BLOCKS = 6;
/** block edge and road width (m) */
const BLOCK = 38.4, ROAD = 9.6, PITCH = BLOCK + ROAD;
/** sidewalk ring inside each block (m) */
const WALK = 2.4;
const HALF = (BLOCKS * PITCH - ROAD) / 2 + ROAD; // 153.6: one ring road outside the blocks
const B0 = -HALF + ROAD; // first block's min corner

type District = 'downtown' | 'plaza' | 'mid' | 'outer' | 'park' | 'industry';

function district(i: number, j: number): District {
  const c = Math.max(Math.abs(i - 2.5), Math.abs(j - 2.5)); // 0.5 centre, 1.5 middle, 2.5 outer
  if (i === 2 && j === 3) return 'plaza';
  if (c < 1) return 'downtown';
  if ((i === 0 && j === 1) || (i === 5 && j === 4) || (i === 1 && j === 4)) return 'park';
  if (j === 5) return 'industry';
  return c < 2 ? 'mid' : 'outer';
}

/** surface material of the ground at world (x, z) (0.1 m voxel coords), with lane markings */
function surface(x: number, z: number): number {
  const lx = x + HALF, lz = z + HALF; // 0 .. 2 HALF
  const inX = lx - ROAD, inZ = lz - ROAD;
  const bx = Math.floor(inX / PITCH), bz = Math.floor(inZ / PITCH);
  const ox = inX - bx * PITCH, oz = inZ - bz * PITCH;
  const inBlockX = inX >= 0 && bx < BLOCKS && ox < BLOCK, inBlockZ = inZ >= 0 && bz < BLOCKS && oz < BLOCK;
  if (inBlockX && inBlockZ) {
    const edge = Math.min(ox, oz, BLOCK - ox, BLOCK - oz);
    if (edge < WALK) return pal(MAT.concrete, ((Math.floor(ox / 1.2) + Math.floor(oz / 1.2)) & 1) ? 1 : 3); // paving slabs
    const d = district(bx, bz);
    if (d === 'downtown' || d === 'plaza') return pal(MAT.concrete, 2);
    if (d === 'industry') return pal(MAT.asphalt, 2);
    return pal(MAT.grass, 2);
  }
  // road: centre dashes along the road's length (ox / oz of the road strip measured from its start)
  const roadX = !inBlockX; // inside a north-south road strip (x is in a gap)
  const roadZ = !inBlockZ;
  const rx = inX < 0 ? inX + ROAD : ox - BLOCK; // 0..ROAD across the N-S road
  const rz = inZ < 0 ? inZ + ROAD : oz - BLOCK;
  if (roadX && !roadZ && Math.abs(rx - ROAD / 2) < 0.15 && (Math.floor(lz / 1.5) & 1)) return pal(MAT.whitepaint, 2);
  if (roadZ && !roadX && Math.abs(rz - ROAD / 2) < 0.15 && (Math.floor(lx / 1.5) & 1)) return pal(MAT.whitepaint, 2);
  return pal(MAT.asphalt, (Math.floor(x * 0.7) + Math.floor(z * 1.3)) & 1 ? 1 : 2);
}

/** thin city ground: bedrock + one surface layer, tiles of 25.6 m */
function ground(sim: Sim): void {
  const T = 256;
  const n = Math.round((2 * HALF) / 25.6);
  for (let ti = 0; ti < n; ti++) for (let tj = 0; tj < n; tj++) {
    const wx = -HALF + ti * 25.6, wz = -HALF + tj * 25.6;
    const g = new VoxelGrid(T, 2, T);
    g.fill(0, 0, 0, T, 1, T, shaded(MAT.bedrock, 4));
    for (let z = 0; z < T; z++) for (let x = 0; x < T; x++) g.data[g.idx(x, 1, z)] = surface(wx + (x + 0.5) * 0.1, wz + (z + 0.5) * 0.1);
    g.recount();
    const b = sim.addBody(g, { x: wx, y: -0.2, z: wz }, { name: 'street' });
    b.noFracture = true; b.impactProof = true;
  }
}

/** door side facing the nearest street of a lot at (fx, fz) inside the block (0..1) */
const doorSide = (fx: number, fz: number) => (Math.abs(fz - 0.5) >= Math.abs(fx - 0.5) ? (fz < 0.5 ? 'n' : 's') : fx < 0.5 ? 'w' : 'e');

function block(sim: Sim, rng: Rng, i: number, j: number): void {
  const x0 = B0 + i * PITCH + WALK, z0 = B0 + j * PITCH + WALK;
  const inner = BLOCK - 2 * WALK; // 33.6 m
  const d = district(i, j);
  const seed = i * 7 + j * 13;
  const lots = (n: number) => { const s = inner / n; const out: { x: number; z: number; s: number; fx: number; fz: number }[] = []; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) out.push({ x: x0 + a * s, z: z0 + b * s, s, fx: (a + 0.5) / n, fz: (b + 0.5) / n }); return out; };
  if (d === 'downtown') {
    for (const l of lots(2)) {
      const w = Math.round((l.s - 1.6 - rng.range(0, 2)) * 10), dd = Math.round((l.s - 1.6 - rng.range(0, 2)) * 10);
      const g = makeBuilding({ w, d: dd, floors: 6 + rng.int(3), wall: MAT.concrete, frame: MAT.concrete, slab: MAT.concrete, lining: 0, winW: 16, winH: 18, sill: 8, winStep: 20, roof: 'flat', roofMat: MAT.concrete, doors: doorSide(l.fx, l.fz), doorW: 14, stairs: true, lamps: true, seed: seed + l.x });
      placeBuilding(sim, g, l.x + (l.s * 10 - w) / 20, 0, l.z + (l.s * 10 - dd) / 20, 'office tower');
    }
  } else if (d === 'plaza') {
    sculpture(sim, x0 + inner / 2 - 1, 0.1, z0 + inner / 2 - 1, 1);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; tree(sim, x0 + inner / 2 + Math.cos(a) * 11 - 1.5, 0, z0 + inner / 2 + Math.sin(a) * 11 - 1.5, seed + k, 0.8); }
    for (let k = 0; k < 4; k++) table(sim, x0 + 4 + k * 7, 0.05, z0 + 3);
  } else if (d === 'mid') {
    for (const l of lots(2)) {
      if (rng.chance(0.2)) {
        // courtyard with parked cars
        hatchback(sim, l.x + l.s / 2 - 2, 0, l.z + l.s / 2, rng.range(0, 6.28));
        crate(sim, l.x + 2, 0.05, l.z + 2); crate(sim, l.x + 2.9, 0.05, l.z + 2);
        continue;
      }
      const w = Math.round((l.s - 2 - rng.range(0, 3)) * 10), dd = Math.round((l.s - 2 - rng.range(0, 3)) * 10);
      const mat = rng.chance(0.75) ? MAT.brick : MAT.plaster;
      const g = makeBuilding({ w, d: dd, floors: 3 + rng.int(3), wall: mat, lining: MAT.plaster, winW: 10, winH: 14, winStep: 22, roof: 'flat', roofMat: MAT.tile, doors: doorSide(l.fx, l.fz), stairs: true, partitions: rng.chance(0.5), lamps: true, seed: seed + l.z });
      placeBuilding(sim, g, l.x + (l.s * 10 - w) / 20, 0, l.z + (l.s * 10 - dd) / 20, 'apartment block');
    }
  } else if (d === 'outer') {
    for (const l of lots(3)) {
      if (rng.chance(0.12)) { tree(sim, l.x + l.s / 2 - 1.5, 0, l.z + l.s / 2 - 1.5, seed + l.x); continue; }
      const w = Math.round((l.s - 3 - rng.range(0, 1.5)) * 10), dd = Math.round((l.s - 3.5 - rng.range(0, 1.5)) * 10);
      const mat = rng.pick([MAT.brick, MAT.brick, MAT.wood, MAT.plaster]);
      const g = makeBuilding({ w, d: dd, floors: 1 + rng.int(2), wall: mat, lining: MAT.plaster, winW: 10, winH: 12, winStep: 24, roof: 'gable', roofMat: rng.chance(0.6) ? MAT.tile : MAT.sheetmetal, doors: doorSide(l.fx, l.fz), stairs: true, lamps: true, seed: seed + l.x + l.z });
      placeBuilding(sim, g, l.x + 1, 0, l.z + 1.2, 'house');
      if (rng.chance(0.5)) hedge(sim, l.x + 0.3, 0, l.z + 0.2, l.s - 0.6, 0.6, 1.0);
      else fence(sim, l.x + 0.3, 0, l.z + 0.2, l.s - 0.6, false);
    }
  } else if (d === 'park') {
    for (let k = 0; k < 14; k++) tree(sim, x0 + rng.range(1, inner - 4), 0, z0 + rng.range(1, inner - 4), seed + k, rng.range(0.7, 1.2));
    for (let k = 0; k < 3; k++) table(sim, x0 + 6 + k * 9, 0.05, z0 + inner / 2);
  } else { // industry
    const g = makeBuilding({ w: 240, d: 180, floors: 2, floorH: 36, wall: MAT.sheetmetal, slab: MAT.concrete, lining: 0, winW: 12, winH: 8, sill: 22, winStep: 40, roof: 'flat', roofMat: MAT.sheetmetal, doors: 'n', doorW: 40, doorH: 34, stairs: true, frame: MAT.steel, lamps: true, seed });
    placeBuilding(sim, g, x0 + 1, 0, z0 + 1, 'warehouse');
    container(sim, x0 + 27, 0, z0 + 4, MAT.paintedmetal, true);
    container(sim, x0 + 27, 0, z0 + 13, MAT.plastic, true);
    van(sim, x0 + 10, 0, z0 + 25, Math.PI / 2);
    for (let k = 0; k < 5; k++) crate(sim, x0 + 4 + k * 1.1, 0.05, z0 + 29);
  }
}

export const city: LevelDef = {
  id: 'city',
  title: 'Corvane City',
  build(sim: Sim): LevelInfo {
    const rng = new Rng(4711);
    ground(sim);
    for (let i = 0; i < BLOCKS; i++) for (let j = 0; j < BLOCKS; j++) block(sim, rng, i, j);
    // street lamps: on the east kerb of north-south roads (arm over the road, -x) and the south kerb of east-west roads
    for (let i = 0; i <= BLOCKS; i++) for (let j = 0; j < BLOCKS; j++) {
      const xRoadEast = B0 + i * PITCH; // first metre of the block east of the road
      if (i < BLOCKS) for (const f of [0.25, 0.75]) streetLamp(sim, xRoadEast + 0.2 - 0.7, 0, B0 + j * PITCH + BLOCK * f);
    }
    for (let j = 0; j <= BLOCKS; j++) for (let i = 0; i < BLOCKS; i++) {
      const zRoadSouth = B0 + j * PITCH;
      if (j < BLOCKS) for (const f of [0.5]) streetLamp(sim, B0 + i * PITCH + BLOCK * f, 0, zRoadSouth + 0.2 - 0.7, true);
    }
    // cars parked at the kerbs along some streets
    for (let k = 0; k < 18; k++) {
      const i = rng.int(BLOCKS), j = rng.int(BLOCKS);
      const along = B0 + j * PITCH + rng.range(6, BLOCK - 6);
      const x = B0 + i * PITCH - ROAD + 1.6; // west kerb lane of the road west of block i
      (rng.chance(0.75) ? hatchback : van)(sim, x, 0, along, rng.chance(0.5) ? 0 : Math.PI);
    }
    const spawn = { x: -ROAD / 2 + 0.0, y: 0.05, z: -ROAD / 2 + 3 };
    return {
      name: 'Corvane City',
      spawn, spawnYaw: 0,
      bounds: { min: { x: -HALF, y: -6, z: -HALF }, max: { x: HALF, y: 40, z: HALF } },
      waterLevel: null,
      sunDir: { x: -0.4, y: -0.8, z: -0.45 },
      sky: 'day',
      markers: { escape: { x: spawn.x, y: 0, z: spawn.z + 2 }, heli_start: { x: -HALF - 40, y: 45, z: HALF + 40 } },
    };
  },
};
