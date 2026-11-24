import type { VoxelBody } from '../../body';
import { box, clear, cylinderY, flat, planks, sphere } from '../../build';
import { MAT, pal } from '../../materials';
import { hash3 } from '../../rng';
import type { Sim } from '../../sim';
import { qyaw } from '../../vec';
import { VoxelGrid } from '../../voxels';
import { addProp, cylinderZ } from './buildings';

/** Dynamic prop prefabs: crates, barrels, furniture, art, scrap, boats. */

export function crate(sim: Sim, x: number, y: number, z: number, n = 8, yaw = 0): VoxelBody {
  const g = new VoxelGrid(n, n, n);
  box(g, 0, 0, 0, n, n, n, pal(MAT.wood, 0));
  for (let a = 1; a < n - 1; a++) for (let b = 1; b < n - 1; b++) {
    const p = pal(MAT.crate, (hash3(a >> 1, 0, 0, n) * 5) | 0);
    g.set(a, b, 0, p); g.set(a, b, n - 1, p); g.set(0, a, b, p); g.set(n - 1, a, b, p); g.set(a, 0, b, p); g.set(a, n - 1, b, p);
  }
  clear(g, 2, 2, 2, n - 2, n - 2, n - 2);
  g.recount();
  return sim.addBody(g, { x, y, z }, { dynamic: true, kind: 'prop', name: 'crate', rot: qyaw(yaw) });
}

export function barrel(sim: Sim, x: number, y: number, z: number, explosive = true): VoxelBody {
  const g = new VoxelGrid(6, 9, 6);
  const m = explosive ? MAT.explosive : MAT.sheetmetal;
  cylinderY(g, 3, 3, 3, 0, 9, pal(m, 2));
  for (const yy of [2, 6]) for (let xx = 0; xx < 6; xx++) for (let zz = 0; zz < 6; zz++) if (g.get(xx, yy, zz)) g.set(xx, yy, zz, pal(m, 0));
  g.recount();
  const b = sim.addBody(g, { x, y, z }, { dynamic: true, kind: 'prop', name: explosive ? 'fuel barrel' : 'barrel' });
  if (explosive) b.tags.add('explosive');
  return b;
}

export function table(sim: Sim, x: number, y: number, z: number, w = 14, d = 8): VoxelBody {
  const g = new VoxelGrid(w, 8, d);
  box(g, 0, 7, 0, w, 8, d, planks(MAT.wood, 2, 4));
  for (const [lx, lz] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) box(g, lx, 0, lz, lx + 1, 7, lz + 1, pal(MAT.wood, 0));
  g.recount();
  return sim.addBody(g, { x, y, z }, { dynamic: true, kind: 'prop', name: 'table' });
}

export function shelf(sim: Sim, x: number, y: number, z: number, alongZ = false): VoxelBody {
  const L = 20;
  const g = alongZ ? new VoxelGrid(5, 20, L) : new VoxelGrid(L, 20, 5);
  const [sx, sz] = alongZ ? [5, L] : [L, 5];
  for (const yy of [0, 6, 12, 19]) box(g, 0, yy, 0, sx, yy + 1, sz, flat(MAT.sheetmetal));
  for (const [lx, lz] of [[0, 0], [sx - 1, 0], [0, sz - 1], [sx - 1, sz - 1]]) box(g, lx, 0, lz, lx + 1, 20, lz + 1, flat(MAT.steel));
  g.recount();
  return sim.addBody(g, { x, y, z }, { dynamic: true, kind: 'prop', name: 'shelf' });
}

/** small rowing boat hull (floats: wood) */
export function boat(sim: Sim, x: number, y: number, z: number, yaw = 0): VoxelBody {
  const g = new VoxelGrid(30, 6, 12);
  for (let xx = 0; xx < 30; xx++) {
    const taper = xx < 6 ? (6 - xx) * 0.8 : 0;
    const z0 = Math.round(taper), z1 = 12 - Math.round(taper);
    box(g, xx, 0, z0, xx + 1, 1, z1, planks(MAT.wood, 2, 3, 'z'));
    box(g, xx, 1, z0, xx + 1, 6, z0 + 1, pal(MAT.wood, 1)); box(g, xx, 1, z1 - 1, xx + 1, 6, z1, pal(MAT.wood, 1));
  }
  box(g, 29, 1, 0, 30, 6, 12, pal(MAT.wood, 1));
  box(g, 12, 3, 1, 15, 4, 11, pal(MAT.wood, 3));
  g.recount();
  return sim.addBody(g, { x, y, z }, { dynamic: true, kind: 'prop', name: 'boat', rot: qyaw(yaw) });
}

export function sofa(sim: Sim, x: number, y: number, z: number, yaw = 0, color: number = MAT.fabric): VoxelBody {
  const g = new VoxelGrid(20, 8, 9);
  box(g, 0, 0, 0, 20, 4, 9, pal(color, 1));
  box(g, 0, 4, 6, 20, 8, 9, pal(color, 2));
  box(g, 0, 4, 0, 2, 6, 6, pal(color, 3)); box(g, 18, 4, 0, 20, 6, 6, pal(color, 3));
  return addProp(sim, g, x, y, z, 'sofa', yaw);
}

export function bed(sim: Sim, x: number, y: number, z: number, yaw = 0): VoxelBody {
  const g = new VoxelGrid(16, 9, 21);
  box(g, 0, 0, 0, 16, 4, 21, planks(MAT.wood, 2, 3));
  box(g, 1, 4, 1, 15, 6, 20, pal(MAT.fabric, 4));
  box(g, 2, 6, 15, 14, 7, 19, pal(MAT.plaster, 3));
  box(g, 0, 0, 20, 16, 9, 21, pal(MAT.wood, 0));
  return addProp(sim, g, x, y, z, 'bed', yaw);
}

export function chair(sim: Sim, x: number, y: number, z: number, yaw = 0): VoxelBody {
  const g = new VoxelGrid(5, 10, 5);
  box(g, 0, 4, 0, 5, 5, 5, pal(MAT.wood, 2));
  for (const [lx, lz] of [[0, 0], [4, 0], [0, 4], [4, 4]]) box(g, lx, 0, lz, lx + 1, 4, lz + 1, pal(MAT.wood, 0));
  box(g, 0, 5, 4, 5, 10, 5, pal(MAT.wood, 1));
  return addProp(sim, g, x, y, z, 'chair', yaw);
}

export function bookcase(sim: Sim, x: number, y: number, z: number, yaw = 0, seed = 0): VoxelBody {
  const g = new VoxelGrid(16, 20, 4);
  box(g, 0, 0, 0, 16, 20, 4, pal(MAT.wood, 0));
  clear(g, 1, 1, 1, 15, 19, 4);
  for (const yy of [6, 12]) box(g, 1, yy, 1, 15, yy + 1, 4, pal(MAT.wood, 0));
  for (const y0 of [1, 7, 13]) for (let i = 1; i < 15; i++) {
    const h = 3 + ((hash3(i, y0, seed) * 3) | 0);
    const m = hash3(i, y0, seed + 1) < 0.5 ? MAT.fabric : MAT.plastic;
    if (hash3(i, y0, seed + 2) < 0.12) continue;
    box(g, i, y0, 1, i + 1, y0 + h, 3, pal(m, (hash3(i >> 1, y0, seed + 3) * 5) | 0));
  }
  return addProp(sim, g, x, y, z, 'bookcase', yaw);
}

/** small art object meant to stand on a plinth: 0 marble bust, 1 gold statuette, 2 glass vase, 3 bronze-ish abstract */
export function sculpture(sim: Sim, x: number, y: number, z: number, kind = 0): VoxelBody {
  const g = new VoxelGrid(6, 9, 6);
  if (kind === 0) { box(g, 1, 0, 1, 5, 2, 5, pal(MAT.marble, 1)); box(g, 2, 2, 2, 4, 4, 4, pal(MAT.marble, 2)); sphere(g, 3, 6, 3, 2.6, pal(MAT.marble, 3)); }
  else if (kind === 1) { box(g, 1, 0, 1, 5, 1, 5, pal(MAT.gold, 0)); box(g, 2, 1, 2, 4, 7, 4, pal(MAT.gold, 2)); box(g, 1, 5, 2, 5, 6, 4, pal(MAT.gold, 3)); sphere(g, 3, 7.5, 3, 1.4, pal(MAT.gold, 1)); }
  else if (kind === 2) { cylinderY(g, 3, 3, 2.2, 0, 7, pal(MAT.glass, 1), 1); cylinderY(g, 3, 3, 2.2, 0, 1, pal(MAT.glass, 1)); cylinderY(g, 3, 3, 1.5, 7, 9, pal(MAT.glass, 3), 1); }
  else { box(g, 2, 0, 2, 4, 9, 4, pal(MAT.paintedmetal, 0)); box(g, 0, 4, 2, 6, 6, 4, pal(MAT.paintedmetal, 1)); box(g, 2, 6, 0, 4, 8, 6, pal(MAT.paintedmetal, 2)); }
  return addProp(sim, g, x, y, z, ['bust', 'statuette', 'vase', 'sculpture'][kind & 3], 0, ['art']);
}

/** potted plant: plastic pot with a leafy top */
export function plant(sim: Sim, x: number, y: number, z: number, seed = 0): VoxelBody {
  const g = new VoxelGrid(6, 10, 6);
  cylinderY(g, 3, 3, 2.4, 0, 4, pal(MAT.plastic, 1));
  sphere(g, 3, 6, 3, 3, pal(MAT.leaves, 1 + (seed % 3)), 0.3, seed);
  return addProp(sim, g, x, y, z, 'plant');
}

/** bent sheet-metal scrap piece */
export function scrap(sim: Sim, x: number, y: number, z: number, seed = 0): VoxelBody {
  const L = 8 + ((hash3(seed, 1, 2) * 10) | 0), W = 5 + ((hash3(seed, 3, 4) * 6) | 0);
  const bend = 2 + ((hash3(seed, 5, 6) * 4) | 0);
  const g = new VoxelGrid(L, bend + 2, W);
  const m = hash3(seed, 7, 8) < 0.6 ? MAT.sheetmetal : hash3(seed, 9, 1) < 0.5 ? MAT.paintedmetal : MAT.steel;
  for (let i = 0; i < L; i++) {
    const yy = i < L * 0.6 ? 0 : Math.min(bend, i - Math.floor(L * 0.6));
    box(g, i, yy, 0, i + 1, yy + 1, W, pal(m, (hash3(i >> 2, seed, 0) * 5) | 0));
    if (yy > 0) box(g, i, yy - 1, 0, i + 1, yy, W, pal(m, 1));
  }
  return addProp(sim, g, x, y, z, 'scrap', hash3(seed, 11, 12) * 6.28);
}

/** wooden cable drum / spool (dynamic, can be rolled) */
export function spool(sim: Sim, x: number, y: number, z: number): VoxelBody {
  const g = new VoxelGrid(10, 10, 8);
  cylinderZ(g, 5, 5, 5, 0, 1, pal(MAT.wood, 1)); cylinderZ(g, 5, 5, 5, 7, 8, pal(MAT.wood, 1));
  cylinderZ(g, 5, 5, 3, 1, 7, pal(MAT.wire, 2));
  return addProp(sim, g, x, y, z, 'spool');
}
