// Vehicle assembly: block grid -> physical VehicleModel (mass, colliders, wheels, drivetrain).
import type { Vec3 } from './math';
import { VehicleGrid, partCenter, partCells, cellKey } from './grid';
import { CELL, partDef, type WheelSim, type EngineSim } from './parts';
import { ROTATIONS, mulMV } from './rotations';
import { greedyBoxes } from './greedy';
import { analyseHull, type HullModel } from './hydro';

export const FUEL_DENSITY = 0.74; // kg per litre
export const GRAVITY = 9.81;

export interface WheelModel {
  partId: number;
  center: Vec3; // body-local metres, rest position
  radius: number;
  width: number;
  travel: number;
  k: number; // spring N/m
  c: number; // damper N·s/m
  steer: number; // +1 front steer, -1 rear steer, 0 none
  driven: boolean;
  side: number; // -1 left, +1 right
  grip: number;
  inertia: number;
}

export interface EngineModel {
  peakTorque: number;
  idleRps: number;
  peakRps: number;
  maxRps: number;
  inertia: number;
  burn: number; // litres per second per rev/s
  count: number;
}

export interface ScrewModel { pos: Vec3; dir: Vec3; diameter: number; pitchSpeed: number }
export interface RudderModel { pos: Vec3; normal: Vec3; up: Vec3; area: number }

export interface VehicleModel {
  mass: number;
  com: Vec3;
  inertia: Vec3; // diagonal, about COM, body axes
  boxes: { center: Vec3; half: Vec3 }[];
  wheels: WheelModel[];
  engine: EngineModel | null;
  gears: number[]; // forward ratios (overall incl. final drive)
  reverse: number; // overall reverse ratio (positive number)
  autoShift: boolean;
  diff: 'open' | 'limited' | 'locked';
  fuel: number; // litres
  battery: number; // capacity units
  seat: { center: Vec3 } | null;
  lamps: Vec3[];
  cdA: number;
  bounds: { min: Vec3; max: Vec3 };
  wheelbase: number;
  track: number;
  hull: HullModel;
  screws: ScrewModel[];
  rudders: RudderModel[];
}

const toM = (c: Vec3): Vec3 => [c[0] * CELL, c[1] * CELL, c[2] * CELL];

export const TOP_SPEED_TARGET = 46; // m/s at red line in top gear (with a gear stack)
const BASE_RATIOS = [3.3, 2.1, 1.5, 1.14, 0.9];

export function assemble(grid: VehicleGrid): VehicleModel {
  let mass = 0;
  const mc: Vec3 = [0, 0, 0];
  const pts: { m: number; p: Vec3; half: Vec3 }[] = [];
  const solidKeys: number[] = [];
  let fuel = 0, battery = 0;
  let seat: VehicleModel['seat'] = null;
  const lamps: Vec3[] = [];
  const engines: EngineSim[] = [];
  let hasGear = false, autoShift = true;
  let diff: VehicleModel['diff'] = 'locked';
  const rawWheels: { id: number; center: Vec3; sim: WheelSim; props: Record<string, unknown> }[] = [];
  const screws: ScrewModel[] = [];
  const rudders: RudderModel[] = [];

  for (const p of grid.parts.values()) {
    const def = partDef(p.type);
    const center = toM(partCenter(p));
    let m = def.mass;
    const s = def.sim;
    if (s?.kind === 'tank') { fuel += s.litres; m += s.litres * FUEL_DENSITY; }
    if (s?.kind === 'battery') battery += s.capacity;
    if (s?.kind === 'seat' && !seat) seat = { center };
    if (s?.kind === 'lamp') lamps.push(center);
    if (s?.kind === 'engine') engines.push(s);
    if (s?.kind === 'gear') { hasGear = true; if (p.props.mode === 'manual') autoShift = false; }
    if (s?.kind === 'diff') diff = (p.props.mode as VehicleModel['diff']) ?? 'open';
    if (s?.kind === 'screw') screws.push({ pos: center, dir: mulMV(ROTATIONS[p.rot], [0, 0, -1]) as Vec3, diameter: s.diameter, pitchSpeed: s.pitchSpeed });
    if (s?.kind === 'rudder') rudders.push({ pos: center, normal: mulMV(ROTATIONS[p.rot], [1, 0, 0]) as Vec3, up: mulMV(ROTATIONS[p.rot], [0, 1, 0]) as Vec3, area: s.area });
    if (s?.kind === 'wheel') {
      // Axle must lie along body X after rotation.
      const axle = mulMV(ROTATIONS[p.rot], [1, 0, 0]);
      if (Math.abs(axle[0]) === 1) rawWheels.push({ id: p.id, center, sim: s, props: p.props });
    }
    const sz = mulMV(ROTATIONS[p.rot], def.size).map((v) => Math.abs(v) * CELL * 0.5) as Vec3;
    pts.push({ m, p: center, half: sz });
    mass += m;
    mc[0] += m * center[0]; mc[1] += m * center[1]; mc[2] += m * center[2];
    if (def.solid) for (const c of partCells(p)) solidKeys.push(cellKey(c[0], c[1], c[2]));
  }
  const com: Vec3 = mass > 0 ? [mc[0] / mass, mc[1] / mass, mc[2] / mass] : [0, 0, 0];

  // Diagonal inertia about COM: point masses + each part as a solid box.
  const I: Vec3 = [0, 0, 0];
  for (const { m, p, half } of pts) {
    const d = [p[0] - com[0], p[1] - com[1], p[2] - com[2]];
    const [a, b, c] = [half[0] * 2, half[1] * 2, half[2] * 2];
    I[0] += m * (d[1] * d[1] + d[2] * d[2]) + (m * (b * b + c * c)) / 12;
    I[1] += m * (d[0] * d[0] + d[2] * d[2]) + (m * (a * a + c * c)) / 12;
    I[2] += m * (d[0] * d[0] + d[1] * d[1]) + (m * (a * a + b * b)) / 12;
  }
  for (let i = 0; i < 3; i++) I[i] = Math.max(I[i], 0.05 * Math.max(mass, 1));

  const boxes = greedyBoxes(solidKeys).map((b) => ({
    center: [((b.min[0] + b.max[0] + 1) / 2) * CELL, ((b.min[1] + b.max[1] + 1) / 2) * CELL, ((b.min[2] + b.max[2] + 1) / 2) * CELL] as Vec3,
    half: [((b.max[0] - b.min[0] + 1) / 2) * CELL, ((b.max[1] - b.min[1] + 1) / 2) * CELL, ((b.max[2] - b.min[2] + 1) / 2) * CELL] as Vec3,
  }));

  // Wheels: springs auto-tuned so the car rests at half travel on its placed position.
  const n = rawWheels.length;
  const wheels: WheelModel[] = rawWheels.map((w) => {
    const share = (mass * GRAVITY) / Math.max(n, 1);
    const stiff = Number(w.props.stiffness ?? 1);
    const damp = Number(w.props.damping ?? 1);
    const k = (share / (w.sim.travel * 0.5)) * stiff;
    const mCorner = share / GRAVITY;
    const zeta = (w.sim.suspension ? 0.4 : 0.7) * damp;
    const steerProp = String(w.props.steer ?? 'auto');
    let steer = 0;
    if (steerProp === 'yes') steer = w.center[2] <= com[2] ? 1 : -1;
    else if (steerProp === 'auto') steer = w.center[2] < com[2] - 0.2 ? 1 : 0;
    const wheelMass = partDef(grid.parts.get(w.id)!.type).mass;
    return {
      partId: w.id, center: w.center, radius: w.sim.radius, width: w.sim.width, travel: w.sim.travel,
      k, c: 2 * zeta * Math.sqrt(k * mCorner), steer, driven: w.props.driven !== false,
      side: w.center[0] < com[0] ? -1 : 1, grip: w.sim.grip, inertia: 0.5 * wheelMass * w.sim.radius * w.sim.radius + 0.2,
    };
  });

  let engine: EngineModel | null = null;
  if (engines.length) {
    const tot = engines.reduce((s, e) => s + e.peakTorque, 0);
    const wavg = (f: (e: EngineSim) => number) => engines.reduce((s, e) => s + f(e) * e.peakTorque, 0) / tot;
    engine = {
      peakTorque: tot, idleRps: wavg((e) => e.idleRps), peakRps: wavg((e) => e.peakRps), maxRps: wavg((e) => e.maxRps),
      inertia: engines.reduce((s, e) => s + e.inertia, 0) + 0.15, burn: engines.reduce((s, e) => s + e.burn, 0), count: engines.length,
    };
  }

  const driven = wheels.filter((w) => w.driven);
  const rDrive = driven.length ? driven.reduce((s, w) => s + w.radius, 0) / driven.length : 0.375;
  const maxW = (engine?.maxRps ?? 16) * 2 * Math.PI;
  let gears: number[], reverse: number;
  if (hasGear) {
    const final = (maxW * rDrive) / TOP_SPEED_TARGET / BASE_RATIOS[BASE_RATIOS.length - 1];
    gears = BASE_RATIOS.map((r) => r * final);
    reverse = gears[0] * 0.95;
  } else {
    gears = [(maxW * rDrive) / 15];
    reverse = gears[0];
    autoShift = true;
  }

  const bmin: Vec3 = [1e9, 1e9, 1e9], bmax: Vec3 = [-1e9, -1e9, -1e9];
  for (const k of grid.cells.keys()) {
    const c = [(k & 1023) - 512, ((k >> 10) & 1023) - 512, ((k >> 20) & 1023) - 512];
    for (let i = 0; i < 3; i++) { bmin[i] = Math.min(bmin[i], c[i] * CELL); bmax[i] = Math.max(bmax[i], (c[i] + 1) * CELL); }
  }
  if (!grid.cells.size) { bmin.fill(0); bmax.fill(0); }
  const area = (bmax[0] - bmin[0]) * (bmax[1] - bmin[1]);

  const steerW = wheels.filter((w) => w.steer !== 0);
  const fixedW = wheels.filter((w) => w.steer === 0);
  const avgZ = (ws: WheelModel[]) => ws.reduce((s, w) => s + w.center[2], 0) / Math.max(ws.length, 1);
  const wheelbase = steerW.length && fixedW.length ? Math.abs(avgZ(fixedW) - avgZ(steerW)) : Math.max(1, bmax[2] - bmin[2]) * 0.6;
  const xs = wheels.map((w) => w.center[0]);
  const track = xs.length ? Math.max(...xs) - Math.min(...xs) : 1;

  return {
    mass, com, inertia: I, boxes, wheels, engine, gears, reverse, autoShift, diff, fuel, battery, seat, lamps,
    cdA: 0.3 * Math.max(area, 0.5), bounds: { min: bmin, max: bmax }, wheelbase: Math.max(wheelbase, 0.5), track: Math.max(track, 0.5),
    hull: analyseHull(grid), screws, rudders,
  };
}
