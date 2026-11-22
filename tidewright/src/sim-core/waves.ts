// Gerstner ocean shared EXACTLY by the CPU (buoyancy) and the GPU (vertex shader).
// The shader displaces grid points p0 -> p0 + D(p0); the CPU inverts that to find
// the surface height at a world (x, z) with a few fixed-point iterations.
export const G = 9.81;
export const WATER_DENSITY = 1025;

export interface Wave { dirX: number; dirZ: number; k: number; omega: number; amp: number; steep: number; phase: number }
export interface SeaState { level: number; windDir: number } // level 0 calm .. 1 storm; windDir radians

const BASE: { len: number; amp: number; turn: number; phase: number }[] = [
  { len: 64, amp: 1.25, turn: 0, phase: 0 },
  { len: 33, amp: 0.62, turn: 0.45, phase: 1.7 },
  { len: 19, amp: 0.34, turn: -0.6, phase: 4.1 },
  { len: 10.5, amp: 0.16, turn: 0.9, phase: 2.6 },
  { len: 6, amp: 0.08, turn: -1.2, phase: 5.3 },
];
export const WAVE_COUNT = BASE.length;

/** Wave set for a sea state. Calm water keeps a gentle swell so the sea is never glass. */
export function wavesFor(s: SeaState): Wave[] {
  const lvl = Math.max(0, Math.min(1, s.level));
  const scale = 0.06 + lvl * 0.94;
  return BASE.map((b) => {
    const k = (2 * Math.PI) / b.len;
    const a = b.amp * scale;
    const ang = s.windDir + b.turn;
    return { dirX: Math.cos(ang), dirZ: Math.sin(ang), k, omega: Math.sqrt(G * k), amp: a, steep: a > 0 ? Math.min(0.75, 0.55 / (k * a * WAVE_COUNT)) : 0, phase: b.phase };
  });
}

/** Displacement of an undisturbed surface point (x0, z0) at time t. Writes [dx, dy, dz] into out. */
export function displace(waves: Wave[], x0: number, z0: number, t: number, out: Float64Array | number[]): void {
  let dx = 0, dy = 0, dz = 0;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    const th = w.k * (w.dirX * x0 + w.dirZ * z0) - w.omega * t + w.phase;
    const c = Math.cos(th), s = Math.sin(th);
    const qa = w.steep * w.amp;
    dx += qa * w.dirX * c;
    dz += qa * w.dirZ * c;
    dy += w.amp * s;
  }
  out[0] = dx; out[1] = dy; out[2] = dz;
}

const tmp = new Float64Array(3);
/** Water surface height at world (x, z) and time t (metres, sea level 0). */
export function waterHeight(waves: Wave[], x: number, z: number, t: number): number {
  let x0 = x, z0 = z;
  for (let it = 0; it < 4; it++) {
    displace(waves, x0, z0, t, tmp);
    x0 = x - tmp[0];
    z0 = z - tmp[2];
  }
  displace(waves, x0, z0, t, tmp);
  return tmp[1];
}

/** Vertical surface velocity (approx., from the vertical term) for wave-relative drag. */
export function waterVerticalVelocity(waves: Wave[], x: number, z: number, t: number): number {
  let v = 0;
  for (const w of waves) {
    const th = w.k * (w.dirX * x + w.dirZ * z) - w.omega * t + w.phase;
    v += -w.amp * w.omega * Math.cos(th);
  }
  return v;
}

/** Pack waves into a flat Float32Array for shader uniforms: [dirX, dirZ, k, omega, amp, steep, phase, 0] x N. */
export function packWaves(waves: Wave[]): Float32Array {
  const a = new Float32Array(waves.length * 8);
  waves.forEach((w, i) => a.set([w.dirX, w.dirZ, w.k, w.omega, w.amp, w.steep, w.phase, 0], i * 8));
  return a;
}
