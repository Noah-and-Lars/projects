// Starter vehicles built in code, so a new player can press Test straight away.
import { VehicleGrid, type Cell } from './grid';

function box(g: VehicleGrid, type: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++)
    if (g.canPlace(type, [x, y, z], 0)) g.add(g.make(type, [x, y, z], 0, color));
}
function put(g: VehicleGrid, type: string, pos: Cell, color: number, rot = 0, props?: Record<string, string | number | boolean>) {
  g.add(g.make(type, pos, rot, color, props));
}

/** "Runabout": a small 4-wheel buggy. Symmetric about x = 0. */
export function runabout(): VehicleGrid {
  const g = new VehicleGrid();
  box(g, 'plate', -4, 3, 1, 1, -8, 7, 4); // floor
  put(g, 'burner_s', [-1, 2, -7], 3);
  put(g, 'gearstack', [-1, 2, -4], 3);
  put(g, 'differential', [-1, 2, 4], 3);
  put(g, 'tank_s', [1, 2, 4], 9);
  put(g, 'cell_s', [-3, 2, 5], 10);
  put(g, 'helm', [-3, 2, -1], 11);
  box(g, 'plate', -4, -4, 2, 2, -8, 7, 6); // side walls
  box(g, 'plate', 3, 3, 2, 2, -8, 7, 6);
  box(g, 'plate', -3, 2, 2, 2, -8, -8, 6); // nose
  box(g, 'plate', -3, 2, 2, 2, 7, 7, 6); // tail
  for (let x = -3; x <= 2; x++) if (g.canPlace('ramp', [x, 3, -8], 0)) put(g, 'ramp', [x, 3, -8], 8);
  box(g, 'frame', -4, -4, 3, 5, 2, 2, 5); // roll hoop
  box(g, 'frame', 3, 3, 3, 5, 2, 2, 5);
  box(g, 'frame', -3, 2, 5, 5, 2, 2, 5);
  put(g, 'lamp', [-3, 1, -9], 8);
  put(g, 'lamp', [2, 1, -9], 8);
  for (const [x, z] of [[-6, -7], [4, -7], [-6, 4], [4, 4]] as const) put(g, 'spring_m', [x, 0, z], 23);
  return g;
}

export const PRESETS: { id: string; name: string; build: () => VehicleGrid }[] = [{ id: 'runabout', name: 'Runabout (starter buggy)', build: runabout }];
