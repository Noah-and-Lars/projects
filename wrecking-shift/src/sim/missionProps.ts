/**
 * Small voxel props for heist missions: targets, alarm boxes, valuables.
 * All builders take the world position of the grid's min corner (bottom-left-front) and return the body.
 * Tags follow the conventions documented at the top of `mission.ts`.
 */
import type { VoxelBody } from './body';
import { box, cylinderY, flat, shaded } from './build';
import { MAT, pal } from './materials';
import type { Sim } from './sim';
import type { V3 } from './vec';
import { VoxelGrid } from './voxels';

function prop(sim: Sim, g: VoxelGrid, pos: V3, name: string, tags: string[]): VoxelBody {
  const b = sim.addBody(g, pos, { dynamic: true, kind: 'prop', name, tags });
  b.keepIndex = 0;
  for (let i = 0; i < g.data.length; i++) if (g.data[i]) { b.keepIndex = i; break; }
  return b;
}

/** squat golden idol on a plinth (0.5 x 0.8 x 0.5 m) */
export function goldIdol(sim: Sim, pos: V3, targetId: string, name = 'Gold Idol'): VoxelBody {
  const g = new VoxelGrid(5, 8, 5);
  const gold = shaded(MAT.gold, 1, 3);
  box(g, 0, 0, 0, 5, 1, 5, pal(MAT.marble, 1));
  box(g, 1, 1, 1, 4, 4, 4, gold);
  box(g, 0, 3, 2, 5, 4, 3, gold); // arms
  box(g, 1, 4, 1, 4, 7, 4, gold); // head
  box(g, 2, 7, 2, 3, 8, 3, pal(MAT.gold, 4)); // top knot
  g.set(1, 5, 0, 0); g.set(3, 5, 0, 0);
  box(g, 1, 5, 1, 2, 6, 2, pal(MAT.lamp)); // glowing eyes
  box(g, 3, 5, 1, 4, 6, 2, pal(MAT.lamp));
  return prop(sim, g, pos, name, ['target:' + targetId]);
}

/** rack server with blinking-light front (0.6 x 0.9 x 0.5 m), front faces -z */
export function serverBox(sim: Sim, pos: V3, targetId: string, name = 'Server Box'): VoxelBody {
  const g = new VoxelGrid(6, 9, 5);
  box(g, 0, 0, 0, 6, 9, 5, flat(MAT.steel, 2));
  box(g, 1, 1, 0, 5, 8, 1, shaded(MAT.electronics, 1, 5));
  for (let y = 2; y < 8; y += 2) { g.set(1, y, 0, pal(MAT.lamp)); g.set(4, y, 0, pal(MAT.alarmbox, 1)); }
  box(g, 0, 8, 0, 6, 9, 5, flat(MAT.sheetmetal, 1));
  return prop(sim, g, pos, name, ['target:' + targetId]);
}

/** paint can with a wire handle (0.4 x 0.5 x 0.4 m) */
export function paintCan(sim: Sim, pos: V3, targetId: string, name = 'Paint Can'): VoxelBody {
  const g = new VoxelGrid(4, 5, 4);
  cylinderY(g, 2, 2, 2, 0, 4, (_x, y) => pal(y === 1 || y === 2 ? MAT.whitepaint : MAT.paintedmetal, y === 1 ? 2 : 1));
  g.set(0, 4, 2, pal(MAT.wire)); g.set(3, 4, 2, pal(MAT.wire)); g.set(1, 4, 2, pal(MAT.wire));
  return prop(sim, g, pos, name, ['target:' + targetId]);
}

/**
 * Static red alarm box with a lamp, wired to target `targetId`. `depthAxis` = the axis that points
 * into the wall it hangs on ('z': box is 0.4 wide in x, 0.2 deep in z).
 * Place it touching solid matter: it triggers when that matter is gone (comes loose).
 */
export function alarmBox(sim: Sim, pos: V3, targetId: string, depthAxis: 'x' | 'z' = 'z'): VoxelBody {
  const sx = depthAxis === 'z' ? 4 : 2, sz = depthAxis === 'z' ? 2 : 4;
  const g = new VoxelGrid(sx, 5, sz);
  box(g, 0, 0, 0, sx, 5, sz, pal(MAT.alarmbox, 1));
  box(g, 0, 0, 0, sx, 1, sz, flat(MAT.steel, 1));
  if (depthAxis === 'z') { g.set(1, 3, 0, pal(MAT.lamp)); g.set(2, 3, 0, pal(MAT.lamp)); g.set(1, 3, 1, pal(MAT.lamp)); g.set(2, 3, 1, pal(MAT.lamp)); }
  else { g.set(0, 3, 1, pal(MAT.lamp)); g.set(0, 3, 2, pal(MAT.lamp)); g.set(1, 3, 1, pal(MAT.lamp)); g.set(1, 3, 2, pal(MAT.lamp)); }
  const b = sim.addBody(g, pos, { name: 'Alarm Box', tags: ['alarm:' + targetId] });
  return b;
}

export type ValuableKind = 'coins' | 'trophy' | 'bottle' | 'watch' | 'record';

/** small cash item tagged `valuable:<amount>` */
export function valuable(sim: Sim, pos: V3, kind: ValuableKind, amount: number, name: string): VoxelBody {
  let g: VoxelGrid;
  switch (kind) {
    case 'coins': // glass jar full of coins
      g = new VoxelGrid(3, 4, 3);
      box(g, 0, 0, 0, 3, 3, 3, pal(MAT.glass, 2));
      box(g, 1, 0, 1, 2, 2, 2, pal(MAT.gold, 2));
      box(g, 0, 3, 0, 3, 4, 3, pal(MAT.paintedmetal, 0));
      break;
    case 'trophy': // darts trophy
      g = new VoxelGrid(3, 5, 3);
      box(g, 0, 0, 0, 3, 1, 3, pal(MAT.wood, 0));
      box(g, 1, 1, 1, 2, 3, 2, pal(MAT.gold, 3));
      box(g, 0, 3, 0, 3, 5, 3, pal(MAT.gold, 2));
      g.set(1, 4, 1, 0);
      break;
    case 'bottle':
      g = new VoxelGrid(2, 6, 2);
      box(g, 0, 0, 0, 2, 4, 2, pal(MAT.glass, 0));
      box(g, 0, 1, 0, 2, 2, 2, pal(MAT.whitepaint, 1));
      box(g, 0, 4, 0, 1, 6, 1, pal(MAT.glass, 1));
      g.set(0, 5, 0, pal(MAT.wood, 2));
      break;
    case 'watch':
      g = new VoxelGrid(3, 1, 3);
      box(g, 0, 0, 0, 3, 1, 3, pal(MAT.gold, 1));
      g.set(1, 0, 1, pal(MAT.glass, 3));
      break;
    case 'record':
    default:
      g = new VoxelGrid(4, 1, 4);
      cylinderY(g, 2, 2, 2, 0, 1, pal(MAT.rubber, 1));
      g.set(2, 0, 2, pal(MAT.alarmbox, 0));
      break;
  }
  return prop(sim, g, pos, name, ['valuable:' + Math.round(amount)]);
}
