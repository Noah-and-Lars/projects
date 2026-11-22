// Sparse block grid: cell -> part instance. The editor's data model.
import type { Vec3 } from './math';
import { partDef, defaultProps } from './parts';
import { ROTATIONS, mulM, mulMV, rotIndex, REFLECT } from './rotations';

export type Cell = [number, number, number];
export type Props = Record<string, number | string | boolean>;

export interface PartInstance {
  id: number;
  type: string;
  pos: Cell; // anchor cell (the part's local cell 0,0,0)
  rot: number; // index into ROTATIONS
  color: number; // palette index
  props: Props;
}

export const GRID_LIMIT = 200; // cells from origin on each axis (50 m)

export const cellKey = (x: number, y: number, z: number): number =>
  ((x + 512) & 1023) | (((y + 512) & 1023) << 10) | (((z + 512) & 1023) << 20);

export function keyToCell(k: number): Cell {
  return [(k & 1023) - 512, ((k >> 10) & 1023) - 512, ((k >> 20) & 1023) - 512];
}

/** Local cell offsets of a part after rotation, relative to its anchor. */
export function partOffsets(type: string, rot: number): Cell[] {
  const def = partDef(type);
  const m = ROTATIONS[rot];
  const out: Cell[] = [];
  for (let x = 0; x < def.size[0]; x++)
    for (let y = 0; y < def.size[1]; y++)
      for (let z = 0; z < def.size[2]; z++) out.push(mulMV(m, [x, y, z]) as Cell);
  return out;
}

export function partCells(p: { type: string; pos: Cell; rot: number }): Cell[] {
  return partOffsets(p.type, p.rot).map((o) => [p.pos[0] + o[0], p.pos[1] + o[1], p.pos[2] + o[2]] as Cell);
}

/** Geometric centre of a placed part, in cell units (cell i spans [i, i+1]). */
export function partCenter(p: { type: string; pos: Cell; rot: number }): Vec3 {
  const def = partDef(p.type);
  const c = mulMV(ROTATIONS[p.rot], [(def.size[0] - 1) / 2, (def.size[1] - 1) / 2, (def.size[2] - 1) / 2]);
  return [p.pos[0] + c[0] + 0.5, p.pos[1] + c[1] + 0.5, p.pos[2] + c[2] + 0.5];
}

export class VehicleGrid {
  parts = new Map<number, PartInstance>();
  cells = new Map<number, number>();
  nextId = 1;

  get size(): number {
    return this.parts.size;
  }

  partAt(x: number, y: number, z: number): PartInstance | undefined {
    const id = this.cells.get(cellKey(x, y, z));
    return id === undefined ? undefined : this.parts.get(id);
  }

  occupied(x: number, y: number, z: number): boolean {
    return this.cells.has(cellKey(x, y, z));
  }

  canPlace(type: string, pos: Cell, rot: number, ignoreId?: number): boolean {
    for (const c of partCells({ type, pos, rot })) {
      if (Math.abs(c[0]) > GRID_LIMIT || Math.abs(c[2]) > GRID_LIMIT || c[1] < 0 || c[1] > GRID_LIMIT) return false;
      const id = this.cells.get(cellKey(c[0], c[1], c[2]));
      if (id !== undefined && id !== ignoreId) return false;
    }
    return true;
  }

  /** Make a new instance (not yet added). */
  make(type: string, pos: Cell, rot: number, color: number, props?: Props): PartInstance {
    return { id: this.nextId++, type, pos: [...pos] as Cell, rot, color, props: { ...defaultProps(partDef(type)), ...(props ?? {}) } };
  }

  add(p: PartInstance): void {
    if (this.parts.has(p.id)) throw new Error('duplicate part id ' + p.id);
    if (!this.canPlace(p.type, p.pos, p.rot)) throw new Error('cells occupied for ' + p.type);
    this.parts.set(p.id, p);
    for (const c of partCells(p)) this.cells.set(cellKey(c[0], c[1], c[2]), p.id);
    if (p.id >= this.nextId) this.nextId = p.id + 1;
  }

  remove(id: number): PartInstance | undefined {
    const p = this.parts.get(id);
    if (!p) return undefined;
    for (const c of partCells(p)) this.cells.delete(cellKey(c[0], c[1], c[2]));
    this.parts.delete(id);
    return p;
  }

  clear(): void {
    this.parts.clear();
    this.cells.clear();
  }

  clone(): VehicleGrid {
    const g = new VehicleGrid();
    for (const p of this.parts.values()) g.add({ ...p, pos: [...p.pos] as Cell, props: { ...p.props } });
    g.nextId = this.nextId;
    return g;
  }

  /** Bounding box in cells: [min, max] inclusive. */
  bounds(): [Cell, Cell] | null {
    if (this.cells.size === 0) return null;
    const mn: Cell = [1e9, 1e9, 1e9];
    const mx: Cell = [-1e9, -1e9, -1e9];
    for (const k of this.cells.keys()) {
      const c = keyToCell(k);
      for (let i = 0; i < 3; i++) {
        if (c[i] < mn[i]) mn[i] = c[i];
        if (c[i] > mx[i]) mx[i] = c[i];
      }
    }
    return [mn, mx];
  }
}

/**
 * The mirror image of a placement across the plane x = plane/2 (in cell units,
 * so cell i maps to plane - 1 - i ... see mirrorCellX). Returns null when the
 * mirrored part would coincide with the original (part straddles the plane).
 */
export function mirrorCellX(x: number, plane: number): number {
  // plane is the x coordinate (in cells) of the mirror plane; cell i spans [i, i+1].
  return 2 * plane - 1 - x;
}

export function mirrorPlacement(
  p: { type: string; pos: Cell; rot: number },
  plane: number,
): { pos: Cell; rot: number } | null {
  const def = partDef(p.type);
  const cells = partCells(p).map((c) => [mirrorCellX(c[0], plane), c[1], c[2]] as Cell);
  // R' = M R S where S is the part's own reflection symmetry: a proper rotation.
  const rot = rotIndex(mulM(mulM(REFLECT.x, ROTATIONS[p.rot]), def.symmetry));
  const offs = partOffsets(p.type, rot);
  const minC = (arr: Cell[]): Cell => {
    const m: Cell = [1e9, 1e9, 1e9];
    for (const c of arr) for (let i = 0; i < 3; i++) if (c[i] < m[i]) m[i] = c[i];
    return m;
  };
  const a = minC(cells);
  const b = minC(offs);
  const pos: Cell = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const orig = new Set(partCells(p).map((c) => cellKey(c[0], c[1], c[2])));
  const mirrored = partCells({ type: p.type, pos, rot });
  if (mirrored.some((c) => orig.has(cellKey(c[0], c[1], c[2])))) return null;
  return { pos, rot };
}
