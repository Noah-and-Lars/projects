/** Deterministic seeded RNG (mulberry32). All sim randomness must come from here. */
export class Rng {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  get state(): number { return this.s; }
  set state(v: number) { this.s = v >>> 0; }
  /** float in [0,1) */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  fork(): Rng {
    return new Rng((this.next() * 4294967296) >>> 0);
  }
}

/** Stateless integer hash -> [0,1) (for procedural colour variation etc.) */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
