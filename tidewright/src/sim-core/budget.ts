// Budget bar numbers: mass, cost, part count, power, fuel, centre of mass.
import type { VehicleGrid } from './grid';
import { partDef } from './parts';
import { assemble, GRAVITY } from './assembly';
import type { Vec3 } from './math';

export const PART_LIMIT = 2000;
export const COST_LIMIT = 40000;

export interface Budget { parts: number; cost: number; mass: number; powerKw: number; fuel: number; com: Vec3; kwPerTonne: number; topSpeed: number }

export function budget(grid: VehicleGrid): Budget {
  let cost = 0;
  for (const p of grid.parts.values()) cost += partDef(p.type).cost;
  const m = assemble(grid);
  let powerKw = 0;
  if (m.engine) {
    // Peak power occurs near peak-torque rps on our curve.
    powerKw = (m.engine.peakTorque * m.engine.peakRps * 2 * Math.PI) / 1000;
  }
  // Rough flat-road top speed estimate from power vs drag + rolling resistance.
  let topSpeed = 0;
  if (powerKw > 0 && m.wheels.length) {
    for (let v = 1; v < 120; v += 0.5) {
      const need = (0.5 * 1.2 * m.cdA * v * v + 0.015 * m.mass * GRAVITY) * v;
      if (need > powerKw * 1000 * 0.85) break;
      topSpeed = v;
    }
    const gearCap = ((m.engine!.maxRps * 2 * Math.PI) / m.gears[m.gears.length - 1]) * (m.wheels.find((w) => w.driven)?.radius ?? 0.375);
    topSpeed = Math.min(topSpeed, gearCap);
  }
  return { parts: grid.size, cost, mass: m.mass, powerKw, fuel: m.fuel, com: m.com, kwPerTonne: m.mass ? powerKw / (m.mass / 1000) : 0, topSpeed };
}
