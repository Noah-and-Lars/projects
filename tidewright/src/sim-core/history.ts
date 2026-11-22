// Undo/redo command history for the Yard editor (command pattern).
import type { VehicleGrid, PartInstance, Props } from './grid';

export interface Command {
  label: string;
  apply(g: VehicleGrid): void;
  revert(g: VehicleGrid): void;
}

const copy = (p: PartInstance): PartInstance => ({ ...p, pos: [...p.pos] as PartInstance['pos'], props: { ...p.props } });

export function placeCmd(parts: PartInstance[], label = 'Place'): Command {
  const ps = parts.map(copy);
  return {
    label,
    apply: (g) => ps.forEach((p) => g.add(copy(p))),
    revert: (g) => ps.forEach((p) => g.remove(p.id)),
  };
}

export function removeCmd(parts: PartInstance[], label = 'Erase'): Command {
  const inv = placeCmd(parts, label);
  return { label, apply: inv.revert, revert: inv.apply };
}

export function paintCmd(changes: { id: number; from: number; to: number }[]): Command {
  return {
    label: 'Paint',
    apply: (g) => changes.forEach((c) => { const p = g.parts.get(c.id); if (p) p.color = c.to; }),
    revert: (g) => changes.forEach((c) => { const p = g.parts.get(c.id); if (p) p.color = c.from; }),
  };
}

export function propCmd(changes: { id: number; from: Props; to: Props }[]): Command {
  return {
    label: 'Edit part',
    apply: (g) => changes.forEach((c) => { const p = g.parts.get(c.id); if (p) p.props = { ...c.to }; }),
    revert: (g) => changes.forEach((c) => { const p = g.parts.get(c.id); if (p) p.props = { ...c.from }; }),
  };
}

export class History {
  private done: Command[] = [];
  private undone: Command[] = [];
  constructor(private grid: VehicleGrid, private limit = 500) {}

  run(cmd: Command): void {
    cmd.apply(this.grid);
    this.done.push(cmd);
    if (this.done.length > this.limit) this.done.shift();
    this.undone.length = 0;
  }
  undo(): Command | undefined {
    const c = this.done.pop();
    if (c) { c.revert(this.grid); this.undone.push(c); }
    return c;
  }
  redo(): Command | undefined {
    const c = this.undone.pop();
    if (c) { c.apply(this.grid); this.done.push(c); }
    return c;
  }
  get canUndo(): boolean { return this.done.length > 0; }
  get canRedo(): boolean { return this.undone.length > 0; }
  get labels(): string[] { return this.done.map((c) => c.label); }
  reset(grid?: VehicleGrid): void {
    if (grid) this.grid = grid;
    this.done.length = 0;
    this.undone.length = 0;
  }
}
