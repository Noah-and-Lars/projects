// Editor validator: errors and warnings, each pointing at the parts responsible.
import { VehicleGrid, partCells, cellKey } from './grid';
import { partDef } from './parts';
import { ROTATIONS, mulMV } from './rotations';

export type Level = 'error' | 'warning' | 'info';
export interface Issue { level: Level; code: string; message: string; parts: number[] }

const NEIGH = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** Groups of part ids connected by shared faces. */
export function connectedGroups(grid: VehicleGrid): number[][] {
  const seen = new Set<number>();
  const groups: number[][] = [];
  for (const start of grid.parts.keys()) {
    if (seen.has(start)) continue;
    const group: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const id = stack.pop()!;
      group.push(id);
      for (const c of partCells(grid.parts.get(id)!))
        for (const d of NEIGH) {
          const nid = grid.cells.get(cellKey(c[0] + d[0], c[1] + d[1], c[2] + d[2]));
          if (nid !== undefined && !seen.has(nid)) { seen.add(nid); stack.push(nid); }
        }
    }
    groups.push(group);
  }
  return groups;
}

export function validate(grid: VehicleGrid): Issue[] {
  const issues: Issue[] = [];
  if (grid.size === 0) return [{ level: 'info', code: 'empty', message: 'Pick a part on the left and click the build floor to start.', parts: [] }];
  const byKind = (k: string) => [...grid.parts.values()].filter((p) => partDef(p.type).sim?.kind === k);
  const seats = byKind('seat'), engines = byKind('engine'), wheels = byKind('wheel');
  const tanks = byKind('tank'), cells = byKind('battery');

  if (!seats.length) issues.push({ level: 'error', code: 'no-seat', message: 'No Helm seat: nobody can drive this.', parts: [] });
  if (seats.length > 1) issues.push({ level: 'warning', code: 'multi-seat', message: 'Only the first Helm seat drives the vehicle.', parts: seats.slice(1).map((p) => p.id) });

  const groups = connectedGroups(grid);
  if (groups.length > 1) {
    groups.sort((a, b) => b.length - a.length);
    const floating = groups.slice(1).flat();
    issues.push({ level: 'error', code: 'floating', message: `${floating.length} part(s) are not attached to the main body.`, parts: floating });
  }

  const badAxle = wheels.filter((w) => Math.abs(mulMV(ROTATIONS[w.rot], [1, 0, 0])[0]) !== 1);
  if (badAxle.length) issues.push({ level: 'error', code: 'wheel-axle', message: 'Wheel axle must point left–right. Rotate with R/T/Y.', parts: badAxle.map((p) => p.id) });

  if (!engines.length) issues.push({ level: 'warning', code: 'no-engine', message: 'No engine: the vehicle can only coast.', parts: [] });
  if (engines.length && !tanks.length) issues.push({ level: 'error', code: 'no-fuel', message: 'Engine has no Fuel tank to draw from.', parts: engines.map((p) => p.id) });
  if (engines.length && !cells.length) issues.push({ level: 'error', code: 'no-battery', message: 'Engine needs a Cell battery to start.', parts: engines.map((p) => p.id) });
  if (!wheels.length) issues.push({ level: 'warning', code: 'no-wheels', message: 'No wheels yet.', parts: [] });
  else {
    const driven = wheels.filter((w) => w.props.driven !== false);
    if (engines.length && !driven.length) issues.push({ level: 'warning', code: 'no-driven', message: 'No wheel is set as driven.', parts: wheels.map((p) => p.id) });
    const xs = new Set(wheels.map((w) => Math.sign(w.pos[0] + 0.5)));
    if (wheels.length < 3 || xs.size < 2) issues.push({ level: 'warning', code: 'unstable', message: 'Fewer than 3 wheels or all on one side: it may tip over.', parts: wheels.map((p) => p.id) });
    // Wheel bottoms should be the lowest point, or the body will scrape.
    const lowestWheel = Math.min(...wheels.map((w) => Math.min(...partCells(w).map((c) => c[1]))));
    const scrapers = [...grid.parts.values()].filter((p) => partDef(p.type).solid && Math.min(...partCells(p).map((c) => c[1])) < lowestWheel);
    if (scrapers.length) issues.push({ level: 'warning', code: 'low-body', message: 'Some blocks sit lower than the wheels and will drag on the ground.', parts: scrapers.map((p) => p.id) });
  }
  if (!issues.some((i) => i.level !== 'info')) issues.push({ level: 'info', code: 'ok', message: 'Ready to test. Press Test or Enter.', parts: [] });
  return issues;
}
