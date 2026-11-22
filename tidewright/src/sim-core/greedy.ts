// Greedy box merging of a voxel set: few, large boxes for collision.
import { cellKey, keyToCell, type Cell } from './grid';

export interface Box { min: Cell; max: Cell } // inclusive cell ranges

export function greedyBoxes(cellKeys: Iterable<number>): Box[] {
  const solid = new Set(cellKeys);
  const used = new Set<number>();
  const cells = [...solid].map(keyToCell).sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0]);
  const free = (x: number, y: number, z: number) => {
    const k = cellKey(x, y, z);
    return solid.has(k) && !used.has(k);
  };
  const boxes: Box[] = [];
  for (const [x0, y0, z0] of cells) {
    if (!free(x0, y0, z0)) continue;
    let x1 = x0;
    while (free(x1 + 1, y0, z0)) x1++;
    let z1 = z0;
    outerZ: for (;;) {
      for (let x = x0; x <= x1; x++) if (!free(x, y0, z1 + 1)) break outerZ;
      z1++;
    }
    let y1 = y0;
    outerY: for (;;) {
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (!free(x, y1 + 1, z)) break outerY;
      y1++;
    }
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) used.add(cellKey(x, y, z));
    boxes.push({ min: [x0, y0, z0], max: [x1, y1, z1] });
  }
  return boxes;
}
