import { flat, shaded, type PalFn } from '../build';
import { MAT, VOXEL, pal } from '../materials';
import type { Sim } from '../sim';
import { VehicleSystem, type Vehicle, type VehicleBlueprint, type VehicleSpec, type WheelDef } from '../vehicle';
import { VoxelGrid } from '../voxels';

/**
 * Voxel vehicle prefabs (original generic blocky designs).
 * Grid frame: x across (x = 0 is the right side), y up (y = 0 = underside), z forward (front at z = sz).
 * 1 voxel = 0.1 m.
 */

export interface VehicleOpts {
  name?: string;
}

/** authoring helper: grid + bookkeeping of the frame (steel) and engine bay */
class Blue {
  readonly g: VoxelGrid;
  private frameBoxes: number[][] = [];
  constructor(sx: number, sy: number, sz: number) { this.g = new VoxelGrid(sx, sy, sz); }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: PalFn | number): void {
    this.g.fill(x0, y0, z0, x1, y1, z1, p as any);
  }
  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void { this.g.fill(x0, y0, z0, x1, y1, z1, 0); }
  /** steel frame member (vital, keeps the vehicle together) */
  frame(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.box(x0, y0, z0, x1, y1, z1, (x, y, z) => pal(MAT.steel, (x + y * 3 + z) % 3));
    this.frameBoxes.push([x0, y0, z0, x1, y1, z1]);
  }
  finish(name: string, spec: VehicleSpec, mass: number, engineBox: number[], keep: [number, number, number]): VehicleBlueprint {
    const g = this.g;
    const isFrame = new Uint8Array(g.data.length);
    const frame: number[] = [];
    for (const [x0, y0, z0, x1, y1, z1] of this.frameBoxes)
      for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = g.idx(x, y, z);
        if (g.data[i] >> 3 === MAT.steel && !isFrame[i]) { isFrame[i] = 1; frame.push(i); }
      }
    const engineBay: number[] = [];
    const [ex0, ey0, ez0, ex1, ey1, ez1] = engineBox;
    for (let z = ez0; z < ez1; z++) for (let y = ey0; y < ey1; y++) for (let x = ex0; x < ex1; x++) {
      const i = g.idx(x, y, z);
      if (g.data[i] && !isFrame[i]) engineBay.push(i);
    }
    g.recount();
    return { grid: g, spec, name, mass, frame, engineBay, keep };
  }
}

/** windshield / rear-window rows: 2 voxels deep so consecutive slanted rows stay face-connected */
function slant(b: Blue, x0: number, x1: number, y0: number, y1: number, zAt: (y: number) => number, p: PalFn | number): void {
  for (let y = y0; y < y1; y++) { const z = zAt(y); b.box(x0, y, z, x1, y + 1, z + 2, p); }
}

function wheels(r: number, width: number, hpY: number, xs: [number, number], axles: { z: number; steer: number; drive: boolean; handbrake: boolean }[]): WheelDef[] {
  const out: WheelDef[] = [];
  for (const a of axles) for (const x of xs) out.push({ x, y: hpY, z: a.z, radius: r, width, steer: a.steer, drive: a.drive, handbrake: a.handbrake });
  return out;
}

// ---------------------------------------------------------------------------------------------- hatchback

/** small fast car: 4.0 x 1.6 x 1.4 m, ~1150 kg, front-wheel drive */
export function hatchbackBlueprint(opts: VehicleOpts = {}): VehicleBlueprint {
  const SX = 16, SY = 14, SZ = 40;
  const b = new Blue(SX, SY, SZ);
  const paint = shaded(MAT.sheetmetal, 8, 11);
  const trim = flat(MAT.sheetmetal, 0);
  const rubber = flat(MAT.rubber, 1);
  const glass = flat(MAT.glass, 2);
  const stripe = flat(MAT.paintedmetal, 2);
  // floor pan + frame
  b.box(1, 1, 1, 15, 2, 39, flat(MAT.sheetmetal, 1));
  b.frame(3, 0, 2, 5, 1, 38); b.frame(11, 0, 2, 13, 1, 38);
  b.frame(5, 0, 5, 11, 1, 7); b.frame(5, 0, 19, 11, 1, 21); b.frame(5, 0, 33, 11, 1, 35);
  // lower body
  b.box(0, 1, 1, 1, 7, 39, paint); b.box(15, 1, 1, 16, 7, 39, paint);
  b.box(0, 4, 2, 1, 5, 38, stripe); b.box(15, 4, 2, 16, 5, 38, stripe);
  // front: fascia, bumper, lamps, grille
  b.box(0, 1, 39, 16, 6, 40, paint);
  b.box(4, 3, 39, 12, 5, 40, trim);
  b.box(0, 1, 39, 16, 3, 40, rubber);
  b.box(1, 4, 39, 4, 6, 40, flat(MAT.lamp)); b.box(12, 4, 39, 15, 6, 40, flat(MAT.lamp));
  // rear: tail panel, bumper, tail lights
  b.box(0, 1, 0, 16, 7, 1, paint);
  b.box(0, 1, 0, 16, 3, 1, rubber);
  b.box(1, 4, 0, 3, 6, 1, flat(MAT.plastic, 1)); b.box(13, 4, 0, 15, 6, 1, flat(MAT.plastic, 1));
  // engine bay: block + hood
  b.box(5, 2, 31, 11, 5, 37, flat(MAT.steel, 1));
  b.box(6, 5, 32, 10, 6, 36, flat(MAT.electronics, 2));
  b.box(0, 6, 28, 16, 7, 40, paint);
  // cabin: windshield (z = 28 at y 7 slanting back to 24 at y 11), roof, rear hatch
  const zW = (y: number) => 27 - (y - 7);
  const zR = (y: number) => 1 + (y - 7);
  slant(b, 1, 15, 7, 12, zW, glass);
  slant(b, 1, 15, 8, 12, zR, glass);
  b.box(0, 6, 1, 16, 8, 3, paint); // tail gate lower part
  b.box(0, 12, 5, 16, 13, 27, paint); // roof
  for (const x of [0, 15]) {
    for (let y = 7; y < 12; y++) {
      const za = zW(y), zr = zR(y);
      b.box(x, y, zr, x + 1, y + 1, za + 2, glass); // side windows
      b.box(x, y, za, x + 1, y + 1, za + 2, paint); // A pillar
      b.box(x, y, zr, x + 1, y + 1, zr + 2, paint); // C pillar
      b.box(x, y, 17, x + 1, y + 1, 19, paint); // B pillar
    }
  }
  // interior: dashboard, steering wheel, seats
  b.box(1, 6, 24, 15, 8, 28, flat(MAT.electronics, 1));
  b.box(9, 8, 22, 13, 10, 25, rubber);
  b.box(9, 2, 14, 14, 4, 19, flat(MAT.fabric, 1)); b.box(9, 4, 13, 14, 10, 15, flat(MAT.fabric, 2));
  b.box(2, 2, 14, 7, 4, 19, flat(MAT.fabric, 1)); b.box(2, 4, 13, 7, 10, 15, flat(MAT.fabric, 2));
  b.box(3, 2, 8, 13, 4, 12, flat(MAT.fabric, 1)); b.box(3, 4, 7, 13, 9, 9, flat(MAT.fabric, 2));
  // wheel wells
  const axles = [7, 33];
  for (const z of axles) { b.clear(0, 0, z - 4, 3, 6, z + 4); b.clear(13, 0, z - 4, 16, 6, z + 4); }
  const r = 0.3, clearance = 0.2, k = 40;
  const sag = 9.81 / (4 * k), susp = 0.12;
  const hpY = r - clearance + susp;
  const spec: VehicleSpec = {
    id: 'hatchback',
    wheels: wheels(r, 0.22, hpY, [0.15, 1.45], [
      { z: axles[0] * VOXEL + 0.05, steer: 0, drive: false, handbrake: true },
      { z: axles[1] * VOXEL + 0.05, steer: 1, drive: true, handbrake: false },
    ]),
    restLength: susp + sag, stiffness: k, compression: 3.0, relaxation: 4.0, maxTravel: 0.18,
    frictionSlip: 1.9, sideFriction: 1.0,
    engineForce: 6500, brake: 40, handbrake: 70,
    topSpeed: 30, reverseSpeed: 8, maxSteer: 0.6, steerFalloff: 11, antiRoll: 4.5,
    seat: { x: 1.15, y: 1.06, z: 1.6 }, camDist: 5.6, camHeight: 1.7,
    ramPush: 0, ramMinSpeed: 3, engine: { x: 0.8, y: 0.6, z: 3.4 },
  };
  return b.finish(opts.name ?? 'hatchback', spec, 1150, [1, 1, 28, 15, 7, 40], [4, 0, 20]);
}

// ---------------------------------------------------------------------------------------------- van

/** the escape van: 5.0 x 1.9 x 2.1 m, ~2300 kg, rear-wheel drive, boxy cargo area */
export function vanBlueprint(opts: VehicleOpts = {}): VehicleBlueprint {
  const SX = 19, SY = 21, SZ = 50;
  const b = new Blue(SX, SY, SZ);
  const paint = shaded(MAT.paintedmetal, 10, 5);
  const trim = flat(MAT.sheetmetal, 0);
  const rubber = flat(MAT.rubber, 1);
  const glass = flat(MAT.glass, 2);
  // frame + floor
  b.frame(4, 0, 2, 6, 2, 48); b.frame(13, 0, 2, 15, 2, 48);
  b.frame(6, 0, 6, 13, 1, 8); b.frame(6, 0, 23, 13, 1, 25); b.frame(6, 0, 41, 13, 1, 43);
  b.box(1, 2, 1, 18, 3, 49, flat(MAT.sheetmetal, 1));
  // cargo box
  b.box(0, 2, 1, 1, 20, 35, paint); b.box(18, 2, 1, 19, 20, 35, paint);
  b.box(0, 20, 1, 19, 21, 36, paint);
  b.box(0, 9, 2, 1, 10, 34, trim); b.box(18, 9, 2, 19, 10, 34, trim); // side rub strip
  // rear doors
  b.box(0, 2, 0, 19, 21, 1, paint);
  b.box(9, 3, 0, 10, 20, 1, trim);
  b.box(2, 13, 0, 8, 18, 1, glass); b.box(11, 13, 0, 17, 18, 1, glass);
  b.box(0, 2, 0, 19, 4, 1, rubber);
  b.box(1, 5, 0, 3, 8, 1, flat(MAT.plastic, 1)); b.box(16, 5, 0, 18, 8, 1, flat(MAT.plastic, 1));
  // bulkhead behind the seats
  b.box(1, 3, 34, 18, 20, 35, paint);
  // cab lower body
  b.box(0, 2, 35, 1, 10, 49, paint); b.box(18, 2, 35, 19, 10, 49, paint);
  // front face + hood
  b.box(0, 2, 49, 19, 10, 50, paint);
  b.box(4, 4, 49, 15, 8, 50, trim);
  b.box(1, 6, 49, 4, 8, 50, flat(MAT.lamp)); b.box(15, 6, 49, 18, 8, 50, flat(MAT.lamp));
  b.box(0, 2, 49, 19, 4, 50, rubber);
  b.box(0, 9, 44, 19, 10, 50, paint);
  // engine
  b.box(6, 3, 43, 13, 8, 49, flat(MAT.steel, 1));
  b.box(7, 8, 44, 12, 9, 48, flat(MAT.electronics, 2));
  // windshield (z 46 at y 10 back to 43 at y 17), cab roof, side windows + pillars
  const zW = (y: number) => 46 - Math.floor((y - 10) / 2);
  slant(b, 1, 18, 10, 18, zW, glass);
  b.box(0, 18, 34, 19, 20, 45, paint);
  for (const x of [0, 18]) {
    for (let y = 10; y < 18; y++) {
      const za = zW(y);
      b.box(x, y, 35, x + 1, y + 1, za, glass);
      b.box(x, y, za, x + 1, y + 1, za + 2, paint);
      b.box(x, y, 35, x + 1, y + 1, 37, paint);
    }
  }
  // interior
  b.box(1, 8, 42, 18, 11, 45, flat(MAT.electronics, 1)); // dashboard
  b.box(12, 10, 41, 16, 13, 42, rubber); // steering wheel
  b.box(11, 3, 37, 17, 6, 41, flat(MAT.fabric, 1)); b.box(11, 6, 35, 17, 13, 37, flat(MAT.fabric, 2));
  b.box(2, 3, 37, 8, 6, 41, flat(MAT.fabric, 1)); b.box(2, 6, 35, 8, 13, 37, flat(MAT.fabric, 2));
  // wheel wells
  const axles = [11, 40];
  for (const z of axles) { b.clear(0, 0, z - 5, 4, 8, z + 5); b.clear(15, 0, z - 5, 19, 8, z + 5); }
  const r = 0.36, clearance = 0.22, k = 35;
  const sag = 9.81 / (4 * k), susp = 0.14;
  const hpY = r - clearance + susp;
  const spec: VehicleSpec = {
    id: 'van',
    wheels: wheels(r, 0.26, hpY, [0.2, 1.7], [
      { z: axles[0] * VOXEL + 0.05, steer: 0, drive: true, handbrake: true },
      { z: axles[1] * VOXEL + 0.05, steer: 1, drive: false, handbrake: false },
    ]),
    restLength: susp + sag, stiffness: k, compression: 3.0, relaxation: 4.0, maxTravel: 0.2,
    frictionSlip: 1.6, sideFriction: 1.0,
    engineForce: 9000, brake: 80, handbrake: 140,
    topSpeed: 21, reverseSpeed: 7, maxSteer: 0.55, steerFalloff: 9, antiRoll: 5,
    seat: { x: 1.4, y: 1.6, z: 3.85 }, camDist: 7.2, camHeight: 2.3,
    ramPush: 0, ramMinSpeed: 3, engine: { x: 0.95, y: 0.8, z: 4.6 },
  };
  return b.finish(opts.name ?? 'van', spec, 2300, [1, 2, 42, 18, 10, 50], [4, 0, 24]);
}

// ---------------------------------------------------------------------------------------------- loader

/** heavy front loader with a steel bucket: 6.0 x 2.4 x 2.8 m, ~7500 kg, all-wheel drive, slow and strong */
export function loaderBlueprint(opts: VehicleOpts = {}): VehicleBlueprint {
  const SX = 24, SY = 28, SZ = 60;
  const b = new Blue(SX, SY, SZ);
  const paint = shaded(MAT.paintedmetal, 10, 9);
  const trim = flat(MAT.sheetmetal, 0);
  const glass = flat(MAT.glass, 2);
  const steel = shaded(MAT.steel, 4, 2);
  // heavy frame (also counterweight) + axle beams
  b.frame(6, 2, 2, 18, 6, 48);
  b.frame(4, 3, 9, 20, 5, 13); b.frame(4, 3, 35, 20, 5, 39);
  b.frame(5, 3, 0, 19, 8, 2); // rear counterweight / bumper
  // rear engine housing
  b.box(5, 6, 2, 19, 15, 16, paint);
  b.clear(6, 6, 3, 18, 14, 15);
  b.box(8, 6, 3, 16, 12, 14, flat(MAT.steel, 1));
  b.box(9, 12, 5, 15, 14, 12, flat(MAT.electronics, 2));
  b.box(7, 8, 1, 17, 13, 2, trim); // grille
  b.box(15, 15, 9, 16, 22, 10, flat(MAT.steel, 0)); // exhaust stack
  // fenders over the wheels
  for (const z of [11, 37]) { b.box(0, 11, z - 7, 6, 12, z + 7, paint); b.box(18, 11, z - 7, 24, 12, z + 7, paint); }
  // cab
  b.box(5, 6, 16, 19, 7, 32, paint); // floor
  for (const [x, z] of [[5, 16], [17, 16], [5, 30], [17, 30]]) b.box(x, 7, z, x + 2, 25, z + 2, steel);
  b.box(5, 7, 16, 19, 10, 17, paint); b.box(5, 7, 31, 19, 10, 32, paint);
  b.box(5, 7, 16, 6, 10, 32, paint); b.box(18, 7, 16, 19, 10, 32, paint);
  b.box(7, 10, 16, 17, 25, 17, glass); b.box(7, 10, 31, 17, 25, 32, glass);
  b.box(5, 10, 18, 6, 25, 30, glass); b.box(18, 10, 18, 19, 25, 30, glass);
  b.box(4, 25, 15, 20, 27, 33, paint);
  b.box(8, 7, 20, 16, 10, 25, flat(MAT.fabric, 1)); b.box(8, 7, 18, 16, 17, 20, flat(MAT.fabric, 2));
  b.box(11, 7, 28, 13, 13, 29, flat(MAT.steel, 0)); b.box(10, 13, 27, 14, 14, 29, flat(MAT.rubber, 1));
  // front chassis + lift arms
  b.box(7, 6, 32, 17, 10, 45, paint);
  b.box(5, 6, 32, 7, 11, 50, steel); b.box(17, 6, 32, 19, 11, 50, steel);
  // bucket (steel: only explosives dent it)
  b.box(0, 1, 49, 24, 15, 51, steel); // back plate
  b.box(0, 1, 51, 24, 3, 60, steel); // floor
  for (const x of [0, 23]) for (let z = 51; z < 60; z++) b.box(x, 3, z, x + 1, 15 - (z - 51), z + 1, steel);
  b.box(0, 1, 58, 24, 4, 60, flat(MAT.steel, 0)); // cutting edge
  b.box(2, 14, 50, 6, 15, 51, flat(MAT.lamp)); b.box(18, 14, 50, 22, 15, 51, flat(MAT.lamp));
  const axles = [11, 37];
  const r = 0.6, clearance = 0.15, k = 45;
  const sag = 9.81 / (4 * k), susp = 0.15;
  const hpY = r - clearance + susp;
  const spec: VehicleSpec = {
    id: 'loader',
    wheels: wheels(r, 0.45, hpY, [0.225, 2.175], [
      { z: axles[0] * VOXEL + 0.05, steer: -0.35, drive: true, handbrake: true },
      { z: axles[1] * VOXEL + 0.05, steer: 1, drive: true, handbrake: false },
    ]),
    restLength: susp + sag, stiffness: k, compression: 3.5, relaxation: 4.5, maxTravel: 0.2,
    frictionSlip: 1.5, sideFriction: 1.0,
    engineForce: 21000, brake: 260, handbrake: 400,
    topSpeed: 8.5, reverseSpeed: 5, maxSteer: 0.5, steerFalloff: 8, antiRoll: 4,
    seat: { x: 1.2, y: 1.95, z: 2.3 }, camDist: 9, camHeight: 3.2,
    ramPush: 3.5, ramMinSpeed: 1.2, engine: { x: 1.2, y: 1.6, z: 0.8 },
  };
  return b.finish(opts.name ?? 'loader', spec, 7500, [5, 6, 2, 19, 15, 16], [12, 3, 24]);
}

// ---------------------------------------------------------------------------------------------- spawning

export const VEHICLE_BLUEPRINTS: Record<string, (opts?: VehicleOpts) => VehicleBlueprint> = {
  hatchback: hatchbackBlueprint,
  van: vanBlueprint,
  loader: loaderBlueprint,
};

/** spawn any vehicle prefab by id at ground point (x, y, z) facing yaw (player convention: 0 = -Z) */
export function spawnVehicle(sim: Sim, id: string, x: number, y: number, z: number, yaw = 0, opts: VehicleOpts = {}): Vehicle {
  const f = VEHICLE_BLUEPRINTS[id];
  if (!f) throw new Error('unknown vehicle ' + id);
  return VehicleSystem.of(sim).spawn(sim, f(opts), x, y, z, yaw);
}

export const hatchback = (sim: Sim, x: number, y: number, z: number, yaw = 0, opts: VehicleOpts = {}): Vehicle =>
  VehicleSystem.of(sim).spawn(sim, hatchbackBlueprint(opts), x, y, z, yaw);
export const van = (sim: Sim, x: number, y: number, z: number, yaw = 0, opts: VehicleOpts = {}): Vehicle =>
  VehicleSystem.of(sim).spawn(sim, vanBlueprint(opts), x, y, z, yaw);
export const loader = (sim: Sim, x: number, y: number, z: number, yaw = 0, opts: VehicleOpts = {}): Vehicle =>
  VehicleSystem.of(sim).spawn(sim, loaderBlueprint(opts), x, y, z, yaw);
