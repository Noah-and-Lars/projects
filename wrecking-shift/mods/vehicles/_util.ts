/**
 * Shared helpers for the built-in vehicle mods (not a mod itself: no `.mod.ts` suffix).
 *   decorate()  add / remove voxels on a carBlueprint result (light bars, booms, brushes, open tops)
 *   handSpec()  VehicleSpec for hand-built `Blue` vehicles, with the same suspension recipe as the prefabs
 */
import type { VehicleBlueprint, VehicleSpec } from '../../src/sim/vehicle';
import type { VoxelGrid } from '../../src/sim/voxels';
import { wheels } from '../../src/sim/prefabs/vehicles';

/** grid of a blueprint with fill helpers that never touch the steel frame (its indices are recorded) */
export interface Deco {
  g: VoxelGrid;
  /** fill only empty cells */
  add(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: number | ((x: number, y: number, z: number) => number)): void;
  /** overwrite non-frame cells (p = 0 clears) */
  set(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: number | ((x: number, y: number, z: number) => number)): void;
}

/** edit a finished blueprint's voxels (frame voxels are protected); returns the same blueprint */
export function decorate(bp: VehicleBlueprint, fn: (d: Deco) => void): VehicleBlueprint {
  const g = bp.grid;
  const frame = new Set(bp.frame);
  const each = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, f: (i: number, x: number, y: number, z: number) => void) => {
    for (let z = Math.max(0, z0); z < Math.min(g.sz, z1); z++)
      for (let y = Math.max(0, y0); y < Math.min(g.sy, y1); y++)
        for (let x = Math.max(0, x0); x < Math.min(g.sx, x1); x++) f(g.idx(x, y, z), x, y, z);
  };
  const val = (p: number | ((x: number, y: number, z: number) => number), x: number, y: number, z: number) => (typeof p === 'number' ? p : p(x, y, z));
  fn({
    g,
    add: (x0, y0, z0, x1, y1, z1, p) => each(x0, y0, z0, x1, y1, z1, (i, x, y, z) => { if (!g.data[i]) g.data[i] = val(p, x, y, z); }),
    set: (x0, y0, z0, x1, y1, z1, p) => each(x0, y0, z0, x1, y1, z1, (i, x, y, z) => { if (!frame.has(i)) g.data[i] = val(p, x, y, z); }),
  });
  g.recount();
  bp.engineBay = bp.engineBay.filter((i) => g.data[i] !== 0);
  return bp;
}

export interface HandSpec {
  id: string;
  /** wheel radius / tyre width (m) */
  r: number;
  ww: number;
  /** wheel radius of the front axle if different (tractors) */
  rFront?: number;
  /** gap between ground and the chassis underside (y = 0) at rest (m) */
  clearance: number;
  /** grid width in voxels (wheels sit at the outer edges) */
  sx: number;
  /** wheel centres inset from the sides (m); default half the tyre width + 4 cm */
  inset?: number;
  /** axle positions (grid z in voxels), rear first; the last one steers */
  axles: number[];
  drive: 'front' | 'rear' | 'all';
  rearSteer?: number;
  mass: number;
  /** N/kg */
  power: number;
  topSpeed: number;
  grip?: number;
  stiffness?: number;
  susp?: number;
  maxSteer?: number;
  steerFalloff?: number;
  antiRoll?: number;
  /** chassis-local metres */
  seat: { x: number; y: number; z: number };
  hoodCam: { x: number; y: number; z: number };
  engine: { x: number; y: number; z: number };
  camDist: number;
  camHeight: number;
  ram?: number;
  reverseSpeed?: number;
}

/** VehicleSpec for a hand-built vehicle (suspension recipe of src/sim/prefabs/vehicles.ts) */
export function handSpec(o: HandSpec): VehicleSpec {
  const k = o.stiffness ?? 40, susp = o.susp ?? 0.14;
  const sag = 9.81 / (4 * k);
  const width = o.sx * 0.1;
  const inset = o.inset ?? o.ww / 2 + 0.04;
  const front = o.axles.length - 1;
  const defs = o.axles.map((z, i) => ({
    z: z * 0.1 + 0.05,
    steer: i === front ? 1 : i === 0 && o.rearSteer ? -o.rearSteer : 0,
    drive: o.drive === 'all' || (o.drive === 'front' ? i === front : i !== front),
    handbrake: i !== front,
  }));
  const ws = wheels(o.r, o.ww, o.r - o.clearance + susp, [inset, width - inset], defs);
  if (o.rFront != null) {
    // smaller front wheels: lower hard point so they touch the ground at the same height
    for (const w of ws) if (w.steer > 0) { w.radius = o.rFront; w.y -= o.r - o.rFront; }
  }
  return {
    id: o.id, wheels: ws,
    restLength: susp + sag, stiffness: k, compression: 4.4, relaxation: 2.3, maxTravel: Math.min(0.24, susp + 0.06),
    frictionSlip: o.grip ?? 1.8, sideFriction: 1.0,
    engineForce: o.mass * o.power, brake: Math.max(30, o.mass * 0.035), handbrake: Math.max(60, o.mass * 0.06),
    topSpeed: o.topSpeed, reverseSpeed: o.reverseSpeed ?? 6,
    maxSteer: o.maxSteer ?? 0.58, steerFalloff: o.steerFalloff ?? 10, antiRoll: o.antiRoll ?? 4.5,
    seat: o.seat, hoodCam: o.hoodCam, camDist: o.camDist, camHeight: o.camHeight,
    ramPush: o.ram ?? 0, ramMinSpeed: 2, engine: o.engine,
  };
}
