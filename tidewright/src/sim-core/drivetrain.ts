// Engine torque curve, auto clutch and automatic gearbox logic (pure functions).
import type { EngineModel } from './assembly';
import { clamp } from './math';

const TAU = Math.PI * 2;

/** Full-throttle torque at engine speed w (rad/s). Peaks at peakRps, fades to 0 just past maxRps. */
export function engineCurve(e: EngineModel, w: number): number {
  const rps = w / TAU;
  if (rps <= 0) return e.peakTorque * 0.55;
  if (rps < e.peakRps) {
    const t = rps / e.peakRps;
    return e.peakTorque * (0.55 + 0.45 * (2 * t - t * t));
  }
  const t = (rps - e.peakRps) / (e.maxRps * 1.06 - e.peakRps);
  return Math.max(0, e.peakTorque * (1 - t * t));
}

/** Internal friction torque (always opposes rotation). */
export function engineFriction(e: EngineModel, w: number): number {
  return e.peakTorque * (0.03 + 0.12 * Math.abs(w / TAU) / e.maxRps) * Math.sign(w);
}

/** Net engine torque at throttle (0..1), including an idle governor. */
export function engineTorque(e: EngineModel, w: number, throttle: number, running: boolean): number {
  if (!running) return -engineFriction(e, w) * 2;
  const idleW = e.idleRps * TAU;
  // Idle governor: keep the engine at idle with the throttle released.
  const gov = clamp((idleW * 1.15 - w) / (idleW * 0.5), 0, 0.6);
  const thr = Math.max(throttle, gov);
  return thr * engineCurve(e, w) - engineFriction(e, w);
}

/** Clutch engagement 0..1 for an automatic clutch, from engine speed and throttle. */
export function autoClutch(e: EngineModel, wEngine: number, wDriven: number, throttle: number): number {
  const idleW = e.idleRps * TAU;
  // Engaged once the drivetrain itself spins the engine above idle.
  if (wDriven > idleW * 1.25) return 1;
  // Launch: engage progressively as the engine revs up under throttle.
  const lo = idleW * 1.15, hi = idleW * 2.6;
  const t = clamp((wEngine - lo) / (hi - lo), 0, 1);
  return throttle > 0.02 ? t * t * (3 - 2 * t) : 0;
}

/** Pick a gear for the automatic box. gear is 1-based. Returns the new gear. */
export function autoShift(e: EngineModel, gears: number[], gear: number, wDrivenWheel: number, throttle: number): number {
  if (gear < 1) return gear;
  const rps = (g: number) => (Math.abs(wDrivenWheel) * gears[g - 1]) / TAU;
  const up = e.maxRps * (throttle > 0.6 ? 0.9 : 0.7);
  const down = e.peakRps * (throttle > 0.6 ? 0.55 : 0.38);
  if (gear < gears.length && rps(gear) > up && rps(gear + 1) > e.peakRps * 0.5) return gear + 1;
  if (gear > 1 && rps(gear) < down) return gear - 1;
  return gear;
}
