// Lightning: occasional sky flashes with a couple of pulses each. The
// renderer raises the temporal blend factor during a flash so it shows up
// immediately instead of being averaged away by the history.

export interface FlashState {
  /** Sky brightness multiplier. */
  sky: number;
  /** Minimum temporal blend factor to apply this frame. */
  historyBoost: number;
  /** True on the frame a flash begins (for thunder later). */
  started: boolean;
}

export class Lightning {
  private nextAt: number;
  private flashStart = -100;
  private pulses: number[] = [];
  private strength = 1;

  constructor(private enabled = true, firstDelay = 8) {
    this.nextAt = firstDelay + Math.random() * 10;
  }

  /** Force a flash now (debug / demo). */
  trigger(time: number): void {
    this.flashStart = time;
    const n = 2 + Math.floor(Math.random() * 2);
    this.pulses = [0];
    for (let i = 1; i < n; i++) this.pulses.push(this.pulses[i - 1] + 0.08 + Math.random() * 0.2);
    this.strength = 25 + Math.random() * 30;
    this.nextAt = time + 14 + Math.random() * 28;
  }

  update(_dt: number, time: number): FlashState {
    let started = false;
    if (this.enabled && time >= this.nextAt) {
      this.trigger(time);
      started = true;
    }
    const t = time - this.flashStart;
    let env = 0;
    for (const p of this.pulses) {
      const d = t - p;
      if (d >= 0) env = Math.max(env, Math.exp(-d / 0.07) * (1 - Math.exp(-d / 0.008)));
    }
    const sky = 1 + this.strength * env;
    // Blend hard while bright, ease off for a moment afterwards so the
    // history drops the flash quickly.
    let boost = 0;
    if (env > 0.02) boost = 0.55;
    else if (t < (this.pulses.at(-1) ?? 0) + 0.45) boost = 0.25;
    return { sky, historyBoost: boost, started };
  }
}
