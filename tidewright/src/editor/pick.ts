// Voxel picking: Amanatides–Woo DDA through the occupancy grid, plus the build floor (y = 0).
import { VehicleGrid, type Cell } from '../sim-core/grid';
import { CELL } from '../sim-core/parts';
import { partOffsets } from '../sim-core/grid';

export interface Pick { cell: Cell; normal: Cell; partId: number | null; floor: boolean }

export function pickGrid(grid: VehicleGrid, origin: [number, number, number], dir: [number, number, number], maxCells = 240): Pick | null {
  const o = [origin[0] / CELL, origin[1] / CELL, origin[2] / CELL];
  const c = [Math.floor(o[0]), Math.floor(o[1]), Math.floor(o[2])];
  const step = dir.map((d) => (d > 0 ? 1 : d < 0 ? -1 : 0));
  const tDelta = dir.map((d) => (d !== 0 ? Math.abs(1 / d) : Infinity));
  const tMax = dir.map((d, i) => (d > 0 ? (c[i] + 1 - o[i]) / d : d < 0 ? (o[i] - c[i]) / -d : Infinity));
  const floorT = dir[1] < 0 ? -o[1] / dir[1] : Infinity;
  let normal: Cell = [0, 0, 0];
  let t = 0;
  for (let i = 0; i < maxCells; i++) {
    if (t > floorT) break;
    const id = grid.cells.get(((c[0] + 512) & 1023) | (((c[1] + 512) & 1023) << 10) | (((c[2] + 512) & 1023) << 20));
    if (id !== undefined && c[1] >= 0) return { cell: [c[0], c[1], c[2]], normal, partId: id, floor: false };
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
    t = tMax[a];
    c[a] += step[a];
    tMax[a] += tDelta[a];
    normal = [0, 0, 0];
    normal[a] = -step[a];
  }
  if (floorT < Infinity) {
    const x = o[0] + dir[0] * floorT, z = o[2] + dir[2] * floorT;
    if (Math.abs(x) < 200 && Math.abs(z) < 200) return { cell: [Math.floor(x), -1, Math.floor(z)], normal: [0, 1, 0], partId: null, floor: true };
  }
  return null;
}

/** Anchor so the part grows out of the picked face, centred on the target cell. */
export function placementAnchor(type: string, rot: number, pick: Pick): Cell {
  const target: Cell = [pick.cell[0] + pick.normal[0], pick.cell[1] + pick.normal[1], pick.cell[2] + pick.normal[2]];
  const offs = partOffsets(type, rot);
  const mn: Cell = [1e9, 1e9, 1e9], mx: Cell = [-1e9, -1e9, -1e9];
  for (const o of offs) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], o[i]); mx[i] = Math.max(mx[i], o[i]); }
  const desiredMin: Cell = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const ext = mx[i] - mn[i] + 1;
    if (pick.normal[i] > 0) desiredMin[i] = target[i];
    else if (pick.normal[i] < 0) desiredMin[i] = target[i] - ext + 1;
    else desiredMin[i] = target[i] - Math.floor((ext - 1) / 2);
  }
  return [desiredMin[0] - mn[0], desiredMin[1] - mn[1], desiredMin[2] - mn[2]];
}
