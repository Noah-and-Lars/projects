/**
 * Parametric voxel vehicle builder for mods: one call describes a whole drivable vehicle (body style, size,
 * colours, wheels, drive, power). Grid frame like src/sim/prefabs/vehicles.ts: x across (x = 0 right side),
 * y up (y = 0 underside), z forward (front at z = sz), 1 voxel = 0.1 m.
 */
import { flat, shaded, type PalFn } from '../sim/build';
import { MAT, VOXEL, pal } from '../sim/materials';
import { Blue, wheels } from '../sim/prefabs/vehicles';
import type { VehicleBlueprint, VehicleSpec } from '../sim/vehicle';

export type BodyStyle =
  | 'hatch' | 'sedan' | 'wagon' | 'coupe' | 'limo' | 'pickup' | 'van' | 'bus'
  | 'boxtruck' | 'flatbed' | 'tanker' | 'dump' | 'kart' | 'buggy' | 'tractor' | 'plow';

export interface CarParams {
  id: string;
  name: string;
  style: BodyStyle;
  /** metres */
  length: number;
  width: number;
  /** roof height above the ground (m); a sensible default per style */
  height?: number;
  /** body material (MAT id) and accent material */
  paint?: number;
  accent?: number;
  /** cargo / bed material (trucks) */
  cargo?: number;
  wheelR?: number;
  wheelW?: number;
  axles?: 2 | 3 | 4;
  drive?: 'front' | 'rear' | 'all';
  /** total mass (kg); default from the size */
  mass?: number;
  /** drive force per kg (N/kg); hatchback 5.6, van 3.9, loader 2.8 */
  power?: number;
  /** m/s */
  topSpeed?: number;
  /** ramming bonus (loader 3.5) */
  ram?: number;
  /** grip (frictionSlip) */
  grip?: number;
  /** rear axle counter-steers (long vehicles turn tighter) */
  rearSteer?: boolean;
  /** front bumper / blade / ram plate of steel */
  bumper?: 'none' | 'bar' | 'blade' | 'ram';
  /** roof lamp bar */
  lights?: boolean;
}

const DEFAULT_H: Record<BodyStyle, number> = {
  hatch: 1.4, sedan: 1.4, wagon: 1.5, coupe: 1.2, limo: 1.45, pickup: 1.7, van: 2.1, bus: 2.9,
  boxtruck: 3.0, flatbed: 2.5, tanker: 2.8, dump: 2.8, kart: 0.9, buggy: 1.5, tractor: 2.5, plow: 2.6,
};

/** build a vehicle blueprint from parameters */
export function carBlueprint(p: CarParams): VehicleBlueprint {
  const SX = Math.max(8, Math.round(p.width / VOXEL)), SZ = Math.max(16, Math.round(p.length / VOXEL));
  const H = Math.max(6, Math.round((p.height ?? DEFAULT_H[p.style]) / VOXEL));
  const SY = H + 2;
  const b = new Blue(SX, SY, SZ);
  const paintMat = p.paint ?? MAT.sheetmetal;
  const paint: PalFn = shaded(paintMat, 8, (p.id.length * 7) % 13);
  const accent: PalFn = flat(p.accent ?? MAT.paintedmetal, 2);
  const glass = flat(MAT.glass, 2);
  const trim = flat(MAT.sheetmetal, 0);
  const seatP = flat(MAT.fabric, 1), seatB = flat(MAT.fabric, 2);
  const cargoP: PalFn = shaded(p.cargo ?? MAT.wood, 4, 3);
  const heavy = ['bus', 'boxtruck', 'flatbed', 'tanker', 'dump', 'tractor', 'plow'].includes(p.style);
  const open = p.style === 'kart' || p.style === 'buggy';

  const r = p.wheelR ?? (heavy ? 0.5 : open ? 0.24 : 0.32);
  const ww = p.wheelW ?? Math.min(0.45, Math.max(0.16, r * 0.7));
  const wellW = Math.ceil((ww + 0.1) / VOXEL);
  const clearance = open ? 0.1 : heavy ? 0.25 : 0.2;
  const floorY = 1; // floor plate y = 1 .. 2
  // frame rails just inside the wheel wells + cross members
  const rx0 = wellW, rx1 = SX - wellW;
  b.frame(rx0, 0, 1, rx0 + 2, 1, SZ - 1); b.frame(rx1 - 2, 0, 1, rx1, 1, SZ - 1);
  for (let z = 3; z < SZ - 3; z += 12) b.frame(rx0 + 2, 0, z, rx1 - 2, 1, z + 2);
  b.box(1, floorY, 1, SX - 1, floorY + 1, SZ - 1, flat(MAT.sheetmetal, 1));

  // ---- body by style; record the cabin span for seat / camera
  const cabin = { z0: 0, z1: 0, roof: H };
  const L = SZ;
  const hoodH = Math.min(H - 3, Math.round(H * 0.5));
  const wall = (z0: number, z1: number, y0: number, y1: number, windows: boolean, pillarEvery = 12) => {
    // side walls + front / back walls of a box [1, SX-1) x [y0, y1) x [z0, z1), windows in the upper half
    const belt = y0 + Math.max(2, Math.round((y1 - y0) * 0.45));
    for (const x of [0, SX - 1]) {
      b.box(x, y0, z0, x + 1, belt, z1, paint);
      if (windows) {
        b.box(x, belt, z0, x + 1, y1, z1, glass);
        for (let z = z0; z < z1; z += pillarEvery) b.box(x, belt, z, x + 1, y1, z + 1, paint);
        b.box(x, belt, z1 - 1, x + 1, y1, z1, paint);
      } else b.box(x, belt, z0, x + 1, y1, z1, paint);
    }
    b.box(0, y0, z0, SX, belt, z0 + 1, paint); b.box(0, y0, z1 - 1, SX, belt, z1, paint);
    b.box(1, belt, z0, SX - 1, y1, z0 + 1, windows ? glass : paint);
    b.box(1, belt, z1 - 1, SX - 1, y1, z1, glass); // the front of a cabin is always the windscreen
    b.box(0, y1, z0, SX, y1 + 1, z1, paint); // roof
  };
  const seats = (z: number, y: number) => {
    const half = SX >> 1;
    b.box(2, y, z, half - 1, y + 2, z + 4, seatP); b.box(2, y + 2, z - 1, half - 1, y + 6, z, seatB);
    b.box(half + 1, y, z, SX - 2, y + 2, z + 4, seatP); b.box(half + 1, y + 2, z - 1, SX - 2, y + 6, z, seatB);
  };
  const hood = (z0: number, z1: number, h: number) => {
    b.box(0, floorY + 1, z0, SX, h, z1, paint);
    b.box(1, h - 1, z1 - 1, SX - 1, h - 3 > floorY ? h - 1 : h, z1, trim); // grille line
    b.box(1, h - 2, z1 - 1, 3, h - 1, z1, flat(MAT.lamp)); b.box(SX - 3, h - 2, z1 - 1, SX - 1, h - 1, z1, flat(MAT.lamp));
  };
  let engine: number[] = [1, floorY + 1, Math.round(L * 0.75), SX - 1, hoodH, L];
  switch (p.style) {
    case 'hatch': case 'sedan': case 'wagon': case 'coupe': case 'limo': {
      const front = Math.round(L * (p.style === 'limo' ? 0.2 : 0.27));
      const rear = p.style === 'sedan' || p.style === 'coupe' ? Math.round(L * 0.2) : p.style === 'limo' ? Math.round(L * 0.15) : 1;
      hood(L - front, L, hoodH);
      if (rear > 1) b.box(0, floorY + 1, 1, SX, hoodH, rear, paint);
      cabin.z0 = rear; cabin.z1 = L - front + 1;
      wall(cabin.z0, cabin.z1, floorY + 1, H - 1, true);
      b.box(1, hoodH - 1, cabin.z1 - 5, SX - 1, hoodH, cabin.z1 - 1, flat(MAT.electronics, 1)); // dashboard
      seats(cabin.z1 - 12, floorY + 1);
      if (cabin.z1 - cabin.z0 > 24) seats(cabin.z0 + 5, floorY + 1);
      engine = [1, floorY + 1, L - front, SX - 1, hoodH, L];
      break;
    }
    case 'pickup': {
      const front = Math.round(L * 0.25), cab = Math.round(L * 0.25);
      hood(L - front, L, hoodH);
      cabin.z0 = L - front - cab; cabin.z1 = L - front + 1;
      wall(cabin.z0, cabin.z1, floorY + 1, H - 1, true);
      seats(cabin.z1 - 11, floorY + 1);
      // open bed with low sides
      b.box(0, floorY + 1, 1, 1, hoodH, cabin.z0, paint); b.box(SX - 1, floorY + 1, 1, SX, hoodH, cabin.z0, paint);
      b.box(0, floorY + 1, 1, SX, hoodH, 2, paint);
      b.box(1, floorY + 1, 2, SX - 1, floorY + 2, cabin.z0, cargoP);
      engine = [1, floorY + 1, L - front, SX - 1, hoodH, L];
      break;
    }
    case 'van': case 'bus': {
      const nose = p.style === 'van' ? Math.round(L * 0.12) : 2;
      if (nose > 2) hood(L - nose, L, hoodH);
      cabin.z0 = 1; cabin.z1 = L - nose + 1;
      wall(cabin.z0, cabin.z1, floorY + 1, H - 1, true, p.style === 'bus' ? 10 : 14);
      seats(cabin.z1 - 10, floorY + 1);
      if (p.style === 'bus') for (let z = cabin.z0 + 6; z < cabin.z1 - 16; z += 9) seats(z, floorY + 1);
      engine = p.style === 'bus' ? [1, floorY + 1, 1, SX - 1, floorY + 6, 8] : [1, floorY + 1, L - nose, SX - 1, hoodH, L];
      break;
    }
    case 'boxtruck': case 'flatbed': case 'tanker': case 'dump': case 'plow': {
      const cab = Math.min(Math.round(L * 0.32), 26);
      cabin.z0 = L - cab; cabin.z1 = L + 1 - 1;
      const cabH = Math.min(H - 1, 26);
      wall(cabin.z0, L, floorY + 1, cabH - 1, true);
      cabin.roof = cabH;
      seats(L - 10, floorY + 3);
      b.box(1, floorY + 1, L - 6, SX - 1, floorY + 6, L - 1, flat(MAT.electronics, 1));
      const bedTop = floorY + 3;
      const cz1 = cabin.z0 - 1;
      b.frame(2, floorY + 1, 1, SX - 2, bedTop, cz1); // cargo deck base (strong)
      if (p.style === 'boxtruck') {
        b.box(0, bedTop, 1, SX, H, cz1, cargoP);
        b.clear(1, bedTop + 1, 2, SX - 1, H - 1, cz1 - 1);
      } else if (p.style === 'flatbed') {
        b.box(0, bedTop, 1, SX, bedTop + 1, cz1, cargoP);
        b.box(0, bedTop + 1, 1, SX, bedTop + 3, 2, accent);
      } else if (p.style === 'tanker') {
        const cy = bedTop + Math.round((H - bedTop) / 2), rr = Math.min((SX >> 1) - 1, (H - bedTop) >> 1);
        for (let z = 1; z < cz1; z++) for (let y = cy - rr; y <= cy + rr; y++) for (let x = 0; x < SX; x++) {
          const dx = x + 0.5 - SX / 2, dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= rr * rr && dx * dx + dy * dy > (rr - 1.3) ** 2) b.box(x, y, z, x + 1, y + 1, z + 1, paint);
        }
        for (const z of [1, cz1 - 1]) for (let y = cy - rr; y <= cy + rr; y++) for (let x = 0; x < SX; x++) {
          const dx = x + 0.5 - SX / 2, dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= rr * rr) b.box(x, y, z, x + 1, y + 1, z + 1, accent);
        }
      } else if (p.style === 'dump') {
        const top = Math.min(H, bedTop + 10);
        b.box(0, bedTop, 1, SX, bedTop + 1, cz1, flat(MAT.steel, 1));
        b.box(0, bedTop, 1, 1, top, cz1, accent); b.box(SX - 1, bedTop, 1, SX, top, cz1, accent);
        b.box(0, bedTop, 1, SX, top, 2, accent); b.box(0, bedTop, cz1 - 1, SX, top + 2, cz1, accent);
      } else { // plow: tipper body + front blade below
        b.box(0, bedTop, 1, SX, bedTop + 6, cz1, cargoP);
        b.clear(1, bedTop + 1, 2, SX - 1, bedTop + 6, cz1 - 1);
      }
      engine = [1, floorY + 1, L - cab, SX - 1, floorY + 8, L];
      break;
    }
    case 'kart': case 'buggy': {
      // open tube frame, seat in the middle, engine at the back
      const mid = L >> 1;
      b.box(SX >> 2, floorY + 1, mid - 4, SX - (SX >> 2), floorY + 3, mid + 2, seatP);
      b.box(SX >> 2, floorY + 3, mid - 5, SX - (SX >> 2), floorY + 8, mid - 3, seatB);
      b.box(SX >> 2, floorY + 1, 1, SX - (SX >> 2), floorY + 5, 6, flat(MAT.steel, 1));
      b.box(1, floorY + 1, L - 3, SX - 1, floorY + 3, L - 1, paint); // nose
      b.box((SX >> 1) - 1, floorY + 1, mid + 4, (SX >> 1) + 1, floorY + 6, mid + 6, flat(MAT.rubber, 1)); // steering column
      if (p.style === 'buggy') {
        for (const x of [1, SX - 2]) for (const z of [mid - 6, mid + 6]) b.frame(x, floorY + 1, z, x + 1, H - 1, z + 1);
        b.frame(1, H - 1, mid - 6, SX - 1, H, mid + 7);
        for (const x of [1, SX - 2]) b.box(x, floorY + 1, 2, x + 1, floorY + 4, L - 2, paint);
      }
      cabin.z0 = mid - 6; cabin.z1 = mid + 7; cabin.roof = H;
      engine = [SX >> 2, floorY + 1, 1, SX - (SX >> 2), floorY + 5, 6];
      break;
    }
    case 'tractor': {
      const front = Math.round(L * 0.45);
      hood(L - front, L, hoodH + 2);
      cabin.z0 = Math.round(L * 0.12); cabin.z1 = L - front + 1;
      wall(cabin.z0, cabin.z1, floorY + 2, H - 1, true, 8);
      seats(cabin.z0 + 4, floorY + 2);
      b.frame(2, floorY + 1, 0, SX - 2, floorY + 3, 3); // hitch
      engine = [1, floorY + 1, L - front, SX - 1, hoodH + 2, L];
      break;
    }
  }
  // bumpers / blades
  const bump = p.bumper ?? (heavy ? 'bar' : 'none');
  if (bump !== 'none') {
    const bh = bump === 'blade' ? Math.min(SY - 1, 9) : bump === 'ram' ? 6 : 3;
    b.frame(0, 0, SZ - 1, SX, Math.min(SY, bh), SZ);
    if (bump === 'blade' || bump === 'ram') b.frame(rx0, 0, SZ - 3, rx1, 2, SZ - 1);
  }
  if (p.lights) { b.box(2, SY - 1, Math.max(cabin.z0, cabin.z1 - 6), SX - 2, SY, Math.max(cabin.z0 + 1, cabin.z1 - 4), flat(MAT.lamp)); }

  // ---- wheels: axle positions along z, clear the wells
  const n = p.axles ?? 2;
  const zs: number[] = n === 2 ? [0.2, 0.8] : n === 3 ? [0.14, 0.3, 0.82] : [0.13, 0.28, 0.7, 0.85];
  const axleZ = zs.map((f) => Math.round(f * SZ));
  const wellLen = Math.ceil((r + 0.08) / VOXEL), wellH = Math.ceil((2 * r - clearance + 0.12) / VOXEL);
  for (const z of axleZ) {
    b.clear(0, 0, z - wellLen, wellW, Math.min(SY, wellH), z + wellLen);
    b.clear(SX - wellW, 0, z - wellLen, SX, Math.min(SY, wellH), z + wellLen);
  }
  const k = heavy ? 42 : 38;
  const sag = 9.81 / (4 * k), susp = heavy ? 0.16 : 0.12;
  const hpY = r - clearance + susp;
  const drive = p.drive ?? (heavy ? 'rear' : 'front');
  const front = n - 1;
  const axleDefs = axleZ.map((z, i) => ({
    z: z * VOXEL + 0.05,
    steer: i === front ? 1 : p.rearSteer && i === 0 ? -0.35 : 0,
    drive: drive === 'all' || (drive === 'front' ? i === front : i !== front),
    handbrake: i !== front,
  }));
  const width = SX * VOXEL;
  const xs: [number, number] = [ww / 2 + 0.04, width - ww / 2 - 0.04];
  const mass = p.mass ?? Math.round(Math.max(250, p.length * p.width * (heavy ? 900 : open ? 110 : 190)));
  const power = p.power ?? (heavy ? 3.2 : open ? 6.5 : 5.2);
  const seatZ = Math.max(cabin.z0 + 3, Math.min(cabin.z1 - 6, cabin.z1 - 9)) * VOXEL;
  const seatY = (floorY + (heavy ? 3 : 1)) * VOXEL + clearance * 0 + (open ? 0.75 : 0.86);
  const spec: VehicleSpec = {
    id: p.id,
    wheels: wheels(r, ww, hpY, xs, axleDefs),
    restLength: susp + sag, stiffness: k, compression: 4.4, relaxation: 2.3, maxTravel: heavy ? 0.22 : 0.18,
    frictionSlip: p.grip ?? (open ? 2.1 : heavy ? 1.5 : 1.8), sideFriction: 1.0,
    engineForce: mass * power, brake: Math.max(30, mass * 0.035), handbrake: Math.max(60, mass * 0.06),
    topSpeed: p.topSpeed ?? (heavy ? 17 : open ? 22 : 28), reverseSpeed: heavy ? 5 : 7,
    maxSteer: open ? 0.65 : heavy ? 0.5 : 0.58, steerFalloff: heavy ? 8 : 11, antiRoll: heavy ? 5 : 4.5,
    seat: { x: width * 0.72, y: seatY + 0.2, z: seatZ },
    hoodCam: { x: width / 2, y: Math.min(cabin.roof * VOXEL - 0.15, seatY + 0.15), z: Math.min(SZ * VOXEL + 0.05, cabin.z1 * VOXEL + 0.3) },
    camDist: Math.max(4.5, p.length * 1.35), camHeight: Math.max(1.5, (p.height ?? DEFAULT_H[p.style]) * 1.1),
    ramPush: p.ram ?? (bump === 'blade' || bump === 'ram' ? 3 : 0), ramMinSpeed: heavy ? 1.5 : 3,
    engine: { x: width / 2, y: (engine[1] + engine[4]) * 0.5 * VOXEL, z: (engine[2] + engine[5]) * 0.5 * VOXEL },
  };
  // keep voxel: on a frame rail near the middle
  const keep: [number, number, number] = [rx0, 0, SZ >> 1];
  return b.finish(p.name, spec, mass, engine, keep);
}

/** paint helper for mods that want a striped body: returns a PalFn alternating two materials along z */
export const stripes = (a: number, c: number, every = 4): PalFn => (_x, _y, z) => pal(Math.floor(z / every) % 2 ? a : c, 2);
