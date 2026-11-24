import type { VoxelBody } from './body';
import { MAT, MATERIALS, PAL_FLAMMABILITY, PAL_HARDNESS, VOXEL, matOf, pal as palOf, scorch, shadeOf } from './materials';
import type { Sim, SimSystem } from './sim';
import type { V3 } from './vec';

/**
 * Fire system interface (implementation: see FireSystem below).
 * Other systems (tools, explosions, missions) only use these methods.
 */
export interface FireApi {
  /** try to ignite the voxel (no-op when not flammable / cap reached). returns true if burning */
  ignite(body: VoxelBody, x: number, y: number, z: number): boolean;
  /** ignite flammable voxels near a world position */
  igniteNear(pos: V3, radius: number, maxNew?: number): number;
  /** add heat at a world position (blowtorch). */
  heat(pos: V3, amount: number): void;
  /** put out fires within radius; returns number extinguished */
  extinguish(pos: V3, radius: number): number;
  /** number of burning voxels */
  count(): number;
  /** world positions of (a sample of) fires for rendering / audio / damage */
  positions(max?: number): V3[];
}

/** A group of nearby fires (smoke source / fire light / audio emitter). */
export interface FireCluster {
  x: number; y: number; z: number;
  /** number of fires in the cluster */
  n: number;
  /** summed intensity (0..1 per fire) */
  strength: number;
}

/** callback of FireSystem.forEachFire: world centre of the burning voxel, intensity 0..1, palette, world exposure dir */
export type FireVisitor = (x: number, y: number, z: number, intensity: number, pal: number, ex: number, ey: number, ez: number) => void;

/** hard storage limit (the gameplay cap `maxFires` must stay below it) */
const CAPACITY = 4096;
/** voxel index range per body in the packed (body, voxel) key */
const KEY_SPAN = 33554432; // 2^25
/** fires are updated every UPDATE_EVERY ticks (10 Hz), staggered by slot */
export const UPDATE_EVERY = 6;
/** heat at which a surface voxel ignites (interior voxels need INTERIOR_FACTOR times more) */
const IGNITE_HEAT = 1;
const INTERIOR_FACTOR = 2.5;
/** heat halves every HEAT_HALF_LIFE ticks */
const HEAT_HALF_LIFE = 90;
const HEAT_DECAY_LN = Math.log(0.5) / HEAT_HALF_LIFE;
const DECAY_LUT = new Float64Array(4096);
for (let i = 0; i < 4096; i++) DECAY_LUT[i] = Math.exp(HEAT_DECAY_LN * i);
const decay = (dt: number) => (dt < 4096 ? DECAY_LUT[dt] : 0);
const HEAT_Q = 256; // heat quantisation (packed with the tick in one number)
const HEAT_QMAX = 1023;
/** heatMap value marking a burning voxel */
const BURNING = -1;
/** heat given to a neighbour per fire update (face neighbour, sideways, flammability 1, intensity 1) */
const SPREAD = 0.2;
/** heat given by a gap-jumping probe */
const JUMP = 0.4;
const WET_TICKS = 150;
/** per-palette multiplier of how readily neighbour-to-neighbour spread reaches a voxel (grass: no endless lawn fires) */
const SPREAD_MUL = new Float32Array(256).fill(1);
for (let s = 0; s < 8; s++) SPREAD_MUL[(MAT.grass << 3) | s] = 0.2;

/** 26-neighbourhood offsets with distance weights (faces 1, edges 0.5, corners 0.3) */
const NB: number[][] = [];
for (let dz = -1; dz <= 1; dz++)
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const m = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
      if (m === 0) continue;
      const l = Math.hypot(dx, dy, dz);
      NB.push([dx, dy, dz, m === 1 ? 1 : m === 2 ? 0.5 : 0.3, dx / l, dy / l, dz / l]);
    }
/** 6-neighbourhood, preferred exposure order: up, sides, down */
const FACES = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]];

/**
 * Deterministic sparse fire cellular automaton.
 *
 * - Fires live on voxels, keyed by (body id, voxel index); each has fuel (MaterialDef.burnTime fire ticks) and an
 *   intensity. Fires update at 10 Hz, staggered over the 6 ticks by slot number.
 * - Burning voxels heat their 26 neighbours (upward ×3, sideways ×1, down ×0.3, scaled by flammability). Heat decays
 *   (half-life 1.5 s) and is stored sparsely. Above the threshold the neighbour ignites, subject to the global cap and
 *   a per-tick ignition budget. Random probes 1.5–3 voxels away jump air gaps and reach other bodies.
 * - Burnt-out voxels are removed (connectivity → collapse), or become char (wood/crates) that crumbles a few seconds
 *   later; grass burns down to scorched dirt. Neighbours are scorched.
 */
export class FireSystem implements FireApi, SimSystem {
  /** gameplay cap of simultaneous fires */
  maxFires = 1200;
  /**
   * max new ignitions by spreading per tick: maxNewPerTick + count * spreadPerFire (a bigger fire has a longer front).
   * Direct ignite()/igniteNear()/heat() calls are not limited.
   */
  maxNewPerTick = 4;
  spreadPerFire = 0.003;
  private budget = 4;
  /** water surface height (set by the game from LevelInfo); fires below it go out */
  waterLevel: number | null = null;
  /** probability that a fire update sends a gap-jumping probe, and the probe budget per tick */
  jumpChance = 0.3;
  maxProbesPerTick = 40;
  /** fraction of burnt-out wood / crate voxels that turn into char instead of vanishing */
  charChance = 0.4;
  /** damage per second when standing in fire (at the closest distance) */
  damagePerSecond = 0.3;

  // ---- per-slot storage (struct of arrays)
  private sb: (VoxelBody | null)[] = new Array(CAPACITY).fill(null);
  private sidx = new Int32Array(CAPACITY);
  private sx = new Int32Array(CAPACITY);
  private sy = new Int32Array(CAPACITY);
  private sz = new Int32Array(CAPACITY);
  private fuel = new Float32Array(CAPACITY);
  private fuelMax = new Float32Array(CAPACITY);
  private inten = new Float32Array(CAPACITY);
  /** local exposure direction (which face is open to air) */
  private sexp = new Int8Array(CAPACITY * 3);
  /** cached world centre (refreshed at each fire update) */
  private wpos = new Float32Array(CAPACITY * 3);
  private alive = new Uint8Array(CAPACITY);
  private free: number[] = [];
  private hw = 0;
  private n = 0;
  private map = new Map<number, number>();
  /** packed heat: tick * 1024 + quantised heat */
  private heatMap = new Map<number, number>();
  /** char voxels waiting to crumble */
  private chars: { body: VoxelBody; idx: number; at: number }[] = [];
  private wet: { x: number; y: number; z: number; r2: number; until: number }[] = [];
  /** body transform cache: tx ty tz qx qy qz qw tick identity */
  private tf = new Map<number, Float64Array>();
  private nearCache = new Map<number, { at: number; list: VoxelBody[] }>();
  private newThisTick = 0;
  private burning = false;
  private probesThisTick = 0;
  private lastIgniteEvent = -1e9;
  private lastPos = { x: 0, y: 0, z: 0 };
  private tmp = new Float64Array(3);
  /** stats for debugging / perf tests */
  readonly stats = { ignited: 0, burntOut: 0, charred: 0, crumbled: 0, extinguished: 0 };

  constructor(protected sim: Sim) {
    for (let i = CAPACITY - 1; i >= 0; i--) this.free.push(i);
    sim.onRemoved.push((b, x, y, z) => {
      if (this.n === 0) return;
      const s = this.map.get(b.id * KEY_SPAN + b.grid.idx(x, y, z));
      if (s !== undefined) this.kill(s);
    });
    sim.onSplit.push((parent, child, off) => this.handleSplit(parent, child, off));
    sim.onExplosion.push((pos, size) => {
      this.igniteNear(pos, size * 1.3, Math.ceil(2 + size * 3));
    });
  }

  // =================================================================== public API

  count(): number { return this.n; }

  /** is this voxel burning? */
  isBurning(body: VoxelBody, x: number, y: number, z: number): boolean {
    return body.grid.inside(x, y, z) && this.map.has(body.id * KEY_SPAN + body.grid.idx(x, y, z));
  }

  ignite(body: VoxelBody, x: number, y: number, z: number): boolean {
    const g = body.grid;
    if (body.removed || !g.inside(x, y, z)) return false;
    const idx = g.idx(x, y, z);
    if (this.map.has(body.id * KEY_SPAN + idx)) return true;
    return this.start(body, x, y, z, idx) >= 0;
  }

  igniteNear(pos: V3, radius: number, maxNew = 8): number {
    if (maxNew <= 0) return 0;
    // gather flammable surface candidates, then pick by flammability-weighted lottery (deterministic)
    const cand: { b: VoxelBody; x: number; y: number; z: number; w: number }[] = [];
    const rv = radius / VOXEL;
    const rv2 = rv * rv;
    for (const b of this.sim.bodiesNear(pos, radius)) {
      const g = b.grid;
      const l = b.toLocal(pos);
      const x0 = Math.max(0, Math.floor(l.x - rv)), x1 = Math.min(g.sx - 1, Math.floor(l.x + rv));
      const y0 = Math.max(0, Math.floor(l.y - rv)), y1 = Math.min(g.sy - 1, Math.floor(l.y + rv));
      const z0 = Math.max(0, Math.floor(l.z - rv)), z1 = Math.min(g.sz - 1, Math.floor(l.z + rv));
      for (let z = z0; z <= z1; z++)
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const p = g.data[x + g.sx * (y + g.sy * z)];
            if (!p || PAL_FLAMMABILITY[p] <= 0) continue;
            const dx = x + 0.5 - l.x, dy = y + 0.5 - l.y, dz = z + 0.5 - l.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > rv2) continue;
            if (!this.exposed(g, x, y, z)) continue;
            cand.push({ b, x, y, z, w: PAL_FLAMMABILITY[p] * (1.2 - Math.sqrt(d2) / (rv + 1e-6)) });
            if (cand.length > 4000) break;
          }
    }
    let lit = 0;
    const rng = this.sim.rng;
    for (let tries = 0; lit < maxNew && cand.length && tries < maxNew * 6; tries++) {
      const k = rng.int(cand.length);
      const c = cand[k];
      if (rng.next() > c.w) continue;
      cand[k] = cand[cand.length - 1]; cand.pop();
      const idx = c.b.grid.idx(c.x, c.y, c.z);
      if (this.map.has(c.b.id * KEY_SPAN + idx)) continue;
      if (this.start(c.b, c.x, c.y, c.z, idx) >= 0) lit++;
      else if (this.n >= this.maxFires) break;
    }
    return lit;
  }

  /**
   * Point heating (blowtorch, hot debris). `amount` is in ignition units: a surface voxel of flammability 1 ignites
   * at 1.0 accumulated heat (wood 0.6 needs ~1.7 units at the centre). Heat decays with a 1.5 s half-life.
   * Example: a blowtorch calling heat(p, 0.08) every tick lights wood in ~0.4 s.
   */
  heat(pos: V3, amount: number): void {
    if (amount <= 0 || this.isWet(pos.x, pos.y, pos.z) || this.underwater(pos.y)) return;
    const R = 2.5; // voxels (0.25 m)
    for (const b of this.sim.bodiesNear(pos, R * VOXEL)) {
      const g = b.grid;
      const l = b.toLocal(pos);
      const x0 = Math.max(0, Math.floor(l.x - R)), x1 = Math.min(g.sx - 1, Math.floor(l.x + R));
      const y0 = Math.max(0, Math.floor(l.y - R)), y1 = Math.min(g.sy - 1, Math.floor(l.y + R));
      const z0 = Math.max(0, Math.floor(l.z - R)), z1 = Math.min(g.sz - 1, Math.floor(l.z + R));
      for (let z = z0; z <= z1; z++)
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const idx = x + g.sx * (y + g.sy * z);
            const p = g.data[idx];
            if (!p) continue;
            const f = PAL_FLAMMABILITY[p];
            if (f <= 0) continue;
            const dx = x + 0.5 - l.x, dy = y + 0.5 - l.y, dz = z + 0.5 - l.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d > R) continue;
            const key = b.id * KEY_SPAN + idx;
            if (this.map.has(key)) continue;
            const h = this.addHeat(key, amount * f * (1 - d / (R + 0.5)));
            if (h >= IGNITE_HEAT && (h >= IGNITE_HEAT * INTERIOR_FACTOR || this.exposed(g, x, y, z))) {
              this.start(b, x, y, z, idx);
            }
          }
    }
  }

  extinguish(pos: V3, radius: number): number {
    const r2 = radius * radius;
    let k = 0;
    for (let s = 0; s < this.hw; s++) {
      if (!this.alive[s]) continue;
      this.refreshPos(s);
      const dx = this.wpos[s * 3] - pos.x, dy = this.wpos[s * 3 + 1] - pos.y, dz = this.wpos[s * 3 + 2] - pos.z;
      if (dx * dx + dy * dy + dz * dz <= r2) { this.kill(s); k++; }
    }
    // wet the area: no ignition for a while, and cool it down
    this.wet.push({ x: pos.x, y: pos.y, z: pos.z, r2: (radius + 0.15) * (radius + 0.15), until: this.sim.tick + WET_TICKS });
    if (this.wet.length > 64) this.wet.shift();
    this.stats.extinguished += k;
    if (k) this.sim.out.push({ type: 'custom', name: 'fire:out', data: { pos: { x: pos.x, y: pos.y, z: pos.z }, count: k, cause: 'extinguish' } });
    return k;
  }

  /** put out everything (level reset, cheats) */
  clear(): void {
    for (let s = 0; s < this.hw; s++) if (this.alive[s]) this.kill(s);
    this.heatMap.clear();
  }

  positions(max = 64): V3[] {
    const out: V3[] = [];
    if (this.n === 0 || max <= 0) return out;
    // one fire per 0.5 m cell first (spatially spread), then fill up evenly
    const seen = new Set<number>();
    const rest: number[] = [];
    for (let s = 0; s < this.hw; s++) {
      if (!this.alive[s]) continue;
      this.refreshPos(s);
      const o = s * 3;
      const ck = (Math.floor(this.wpos[o] * 2) & 1023) | ((Math.floor(this.wpos[o + 1] * 2) & 1023) << 10) | ((Math.floor(this.wpos[o + 2] * 2) & 1023) << 20);
      if (seen.has(ck)) { rest.push(s); continue; }
      seen.add(ck);
      out.push({ x: this.wpos[o], y: this.wpos[o + 1], z: this.wpos[o + 2] });
    }
    if (out.length > max) {
      const step = out.length / max;
      const r: V3[] = [];
      for (let i = 0; i < max; i++) r.push(out[Math.floor(i * step)]);
      return r;
    }
    const need = Math.min(max - out.length, rest.length);
    const step = rest.length / Math.max(1, need);
    for (let j = 0; j < need; j++) {
      const o = rest[Math.floor(j * step)] * 3;
      out.push({ x: this.wpos[o], y: this.wpos[o + 1], z: this.wpos[o + 2] });
    }
    return out;
  }

  /**
   * Visit (an evenly strided sample of at most `max`) fires with their current world position. `offset` rotates
   * which fires are picked when sampling (pass a frame counter to cover all fires over time). Allocation-free.
   */
  forEachFire(cb: FireVisitor, max = Infinity, offset = 0): number {
    if (this.n === 0) return 0;
    const stride = this.n > max ? this.n / max : 1;
    let next = stride > 1 ? (offset % Math.max(1, Math.floor(stride))) : 0;
    let i = 0, visited = 0;
    for (let s = 0; s < this.hw; s++) {
      if (!this.alive[s]) continue;
      if (i++ < next) continue;
      next += stride;
      this.refreshPos(s);
      const b = this.sb[s]!;
      const o = s * 3;
      const ex = this.sexp[o], ey = this.sexp[o + 1], ez = this.sexp[o + 2];
      let wx = ex, wy = ey, wz = ez;
      const a = this.xf(b);
      if (!a[8]) { this.rotate(a, ex, ey, ez, false); wx = this.tmp[0]; wy = this.tmp[1]; wz = this.tmp[2]; }
      cb(this.wpos[o], this.wpos[o + 1], this.wpos[o + 2], this.inten[s], b.grid.data[this.sidx[s]], wx, wy, wz);
      visited++;
      if (visited >= max) break;
    }
    return visited;
  }

  /**
   * Group fires into `cell`-sized clusters (smoke sources, fire lights, audio emitters), strongest first.
   */
  clusters(cell = 1.5, max = 16): FireCluster[] {
    if (this.n === 0) return [];
    const m = new Map<number, FireCluster>();
    const inv = 1 / cell;
    for (let s = 0; s < this.hw; s++) {
      if (!this.alive[s]) continue;
      this.refreshPos(s);
      const o = s * 3;
      const x = this.wpos[o], y = this.wpos[o + 1], z = this.wpos[o + 2];
      const k = (Math.floor(x * inv) & 1023) | ((Math.floor(y * inv) & 1023) << 10) | ((Math.floor(z * inv) & 1023) << 20);
      let c = m.get(k);
      if (!c) { c = { x: 0, y: 0, z: 0, n: 0, strength: 0 }; m.set(k, c); }
      c.x += x; c.y += y; c.z += z; c.n++; c.strength += this.inten[s];
    }
    const arr = [...m.values()];
    for (const c of arr) { c.x /= c.n; c.y /= c.n; c.z /= c.n; }
    arr.sort((a, b) => b.strength - a.strength);
    if (arr.length > max) arr.length = max;
    return arr;
  }

  /** smoke emitters: clusters of fires (alias with a smaller default cell) */
  smokeSources(max = 24): FireCluster[] {
    return this.clusters(1.0, max);
  }

  /** closest fire to a world position within maxDist (null if none) */
  closest(pos: V3, maxDist = Infinity): V3 | null {
    let best = -1, bd = maxDist * maxDist;
    for (let s = 0; s < this.hw; s++) {
      if (!this.alive[s]) continue;
      this.refreshPos(s);
      const o = s * 3;
      const dx = this.wpos[o] - pos.x, dy = this.wpos[o + 1] - pos.y, dz = this.wpos[o + 2] - pos.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = s; }
    }
    return best < 0 ? null : { x: this.wpos[best * 3], y: this.wpos[best * 3 + 1], z: this.wpos[best * 3 + 2] };
  }

  /** number of fires on one body */
  countOn(body: VoxelBody): number {
    let k = 0;
    for (let s = 0; s < this.hw; s++) if (this.alive[s] && this.sb[s] === body) k++;
    return k;
  }

  /** debug / tests: list of burning voxels */
  list(): { body: VoxelBody; x: number; y: number; z: number; fuel: number; intensity: number }[] {
    const out = [];
    for (let s = 0; s < this.hw; s++) {
      if (!this.alive[s]) continue;
      out.push({ body: this.sb[s]!, x: this.sx[s], y: this.sy[s], z: this.sz[s], fuel: this.fuel[s], intensity: this.inten[s] });
    }
    return out;
  }

  // =================================================================== update

  update(sim: Sim): void {
    const tick = sim.tick;
    this.newThisTick = 0;
    this.probesThisTick = 0;
    if (tick % 30 === 0) this.crumbleChars(tick);
    if (tick % 300 === 0) this.sweep(tick);
    if (this.n === 0) {
      if (this.burning) { this.burning = false; this.sim.out.push({ type: 'custom', name: 'fire:out', data: { pos: { ...this.lastPos }, count: 0, cause: 'all' } }); }
      return;
    }
    this.burning = true;
    this.budget = this.maxNewPerTick + Math.floor(this.n * this.spreadPerFire);
    const phase = tick % UPDATE_EVERY;
    for (let s = phase; s < this.hw; s += UPDATE_EVERY) {
      if (this.alive[s]) this.updateFire(s, tick);
    }
    if (phase === 0) this.hurtPlayer();
  }

  private updateFire(s: number, tick: number): void {
    const b = this.sb[s]!;
    const g = b.grid;
    const idx = this.sidx[s];
    const p = g.data[idx];
    if (b.removed || !p) { this.kill(s); return; }
    const x = this.sx[s], y = this.sy[s], z = this.sz[s];
    this.refreshPos(s);
    const o = s * 3;
    const wx = this.wpos[o], wy = this.wpos[o + 1], wz = this.wpos[o + 2];
    this.lastPos.x = wx; this.lastPos.y = wy; this.lastPos.z = wz;
    if (this.underwater(wy) || (this.wet.length && this.isWet(wx, wy, wz))) { this.kill(s); return; }

    // fuel + intensity
    const fm = this.fuelMax[s];
    const f = (this.fuel[s] -= 1);
    if (f <= 0) { this.burnOut(s, b, x, y, z, p); return; }
    let I = this.inten[s];
    if (f < fm * 0.25) I = Math.max(0.15, f / (fm * 0.25));
    else if (I < 1) I = Math.min(1, I + 0.2);
    this.inten[s] = I;
    if (f < fm * 0.5 && shadeOf(p) < 6) this.sim.setVoxel(b, x, y, z, scorch(p, x + z));

    // world up in body-local space (upward spread bias)
    const a = this.xf(b);
    let ux = 0, uy = 1, uz = 0;
    if (!a[8]) { this.rotate(a, 0, 1, 0, true); ux = this.tmp[0]; uy = this.tmp[1]; uz = this.tmp[2]; }

    // exposure (for flame placement)
    this.updateExposure(s, g, x, y, z);

    // heat the 26 neighbours
    const sxx = g.sx, sxy = g.sx * g.sy;
    const base = SPREAD * I;
    const bid = b.id * KEY_SPAN;
    const hm = this.heatMap;
    for (let k = 0; k < 26; k++) {
      const nb = NB[k];
      const nx = x + nb[0], ny = y + nb[1], nz = z + nb[2];
      if (nx < 0 || ny < 0 || nz < 0 || nx >= g.sx || ny >= g.sy || nz >= g.sz) continue;
      const ni = nx + sxx * ny + sxy * nz;
      const np = g.data[ni];
      if (!np) continue;
      const fl = PAL_FLAMMABILITY[np];
      if (fl <= 0) continue;
      const key = bid + ni;
      // inlined addHeat(); BURNING sentinel = neighbour already on fire (one Map lookup in the hot loop)
      const v = hm.get(key);
      if (v === BURNING) continue;
      const dot = nb[4] * ux + nb[5] * uy + nb[6] * uz;
      let h = base * nb[3] * (dot > 0 ? 1 + 2 * dot : 1 + 0.7 * dot) * fl * SPREAD_MUL[np];
      if (v !== undefined) { const t0 = Math.floor(v / 1024); h += ((v - t0 * 1024) / HEAT_Q) * decay(tick - t0); }
      const q = h * HEAT_Q < HEAT_QMAX ? Math.round(h * HEAT_Q) : HEAT_QMAX;
      hm.set(key, tick * 1024 + q);
      if (q >= IGNITE_HEAT * HEAT_Q) this.trySpread(b, nx, ny, nz, ni, key, q / HEAT_Q);
    }

    // gap jumping / other bodies
    if (this.probesThisTick < this.maxProbesPerTick && this.sim.rng.next() < this.jumpChance * I) {
      this.probesThisTick++;
      this.probe(b, wx, wy, wz, I);
    }
  }

  private trySpread(b: VoxelBody, x: number, y: number, z: number, idx: number, key: number, h: number): void {
    if (this.newThisTick >= this.budget || this.n >= this.maxFires) return;
    if (h < IGNITE_HEAT * INTERIOR_FACTOR && !this.exposed(b.grid, x, y, z)) return;
    if (this.start(b, x, y, z, idx) >= 0) this.newThisTick++;
  }

  /** random probe 1.5–3 voxels away (biased upward): jumps small air gaps and reaches touching / nearby bodies */
  private probe(b: VoxelBody, wx: number, wy: number, wz: number, I: number): void {
    const rng = this.sim.rng;
    let dx = rng.next() * 2 - 1, dy = rng.next() * 1.5 - 0.5, dz = rng.next() * 2 - 1;
    const l = Math.hypot(dx, dy, dz) || 1;
    const len = (1.5 + rng.next() * 1.5) * VOXEL / l;
    const px = wx + dx * len, py = wy + dy * len, pz = wz + dz * len;
    const list = this.nearBodies(b);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.removed) continue;
      const a = this.xf(o);
      // world -> local voxel coords
      let lx = px - a[0], ly = py - a[1], lz = pz - a[2];
      if (!a[8]) { this.rotate(a, lx, ly, lz, true); lx = this.tmp[0]; ly = this.tmp[1]; lz = this.tmp[2]; }
      const x = Math.floor(lx / VOXEL), y = Math.floor(ly / VOXEL), z = Math.floor(lz / VOXEL);
      const g = o.grid;
      if (x < 0 || y < 0 || z < 0 || x >= g.sx || y >= g.sy || z >= g.sz) continue;
      const idx = x + g.sx * (y + g.sy * z);
      const p = g.data[idx];
      if (!p) continue;
      const fl = PAL_FLAMMABILITY[p];
      if (fl <= 0) return;
      const key = o.id * KEY_SPAN + idx;
      if (this.map.has(key)) return;
      const up = dy > 0 ? 1 + dy / l : 0.6;
      const h = this.addHeat(key, JUMP * I * fl * up);
      if (h >= IGNITE_HEAT) this.trySpread(o, x, y, z, idx, key, h);
      return;
    }
  }

  private burnOut(s: number, b: VoxelBody, x: number, y: number, z: number, p: number): void {
    const o = s * 3;
    const ex = this.sexp[o], ey = this.sexp[o + 1], ez = this.sexp[o + 2];
    this.kill(s);
    this.stats.burntOut++;
    const sim = this.sim, rng = sim.rng;
    const m = matOf(p);
    if (m === MAT.grass) {
      sim.setVoxel(b, x, y, z, palOf(MAT.dirt, 6 + (x + z) % 2));
    } else if ((m === MAT.wood || m === MAT.crate || m === MAT.rubber) && rng.next() < this.charChance) {
      sim.setVoxel(b, x, y, z, palOf(MAT.char, rng.int(5)));
      this.stats.charred++;
      if (this.chars.length >= 6000) this.crumbleOne(this.chars.shift()!);
      this.chars.push({ body: b, idx: b.grid.idx(x, y, z), at: sim.tick + 240 + rng.int(420) });
    } else {
      sim.removeVoxel(b, x, y, z);
      // a few glowing bits drop off burning solids (foliage / fabric just turn to ash)
      if (m !== MAT.leaves && m !== MAT.fabric && rng.next() < 0.06) sim.out.push({ type: 'crumb', pos: { x: this.wpos[o], y: this.wpos[o + 1], z: this.wpos[o + 2] }, pal: palOf(MAT.char, 1), count: 1 });
    }
    // scorch the neighbours
    const g = b.grid;
    for (let k = 0; k < 6; k++) {
      const f = FACES[k];
      const nx = x + f[0], ny = y + f[1], nz = z + f[2];
      if (f[0] === ex && f[1] === ey && f[2] === ez) continue;
      const np = g.get(nx, ny, nz);
      if (!np || shadeOf(np) >= 6 || PAL_HARDNESS[np] >= 3 || matOf(np) === MAT.char) continue;
      if (rng.next() < 0.55 && !this.map.has(b.id * KEY_SPAN + g.idx(nx, ny, nz))) sim.setVoxel(b, nx, ny, nz, scorch(np, nx + nz));
    }
  }

  private crumbleOne(c: { body: VoxelBody; idx: number }): void {
    const b = c.body;
    if (b.removed) return;
    const g = b.grid;
    const p = g.data[c.idx];
    if (!p || matOf(p) !== MAT.char) return;
    const x = c.idx % g.sx, y = ((c.idx / g.sx) | 0) % g.sy, z = (c.idx / (g.sx * g.sy)) | 0;
    this.sim.removeVoxel(b, x, y, z);
    this.stats.crumbled++;
    if (this.sim.rng.next() < 0.12) this.sim.out.push({ type: 'crumb', pos: b.toWorld({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }), pal: p, count: 2 });
  }

  private crumbleChars(tick: number): void {
    if (!this.chars.length) return;
    let w = 0;
    for (let i = 0; i < this.chars.length; i++) {
      const c = this.chars[i];
      if (c.at <= tick) this.crumbleOne(c);
      else if (!c.body.removed) this.chars[w++] = c;
    }
    this.chars.length = w;
  }

  /** periodic cleanup: decayed heat entries, stale caches, expired wet zones */
  private sweep(tick: number): void {
    if (this.heatMap.size) {
      for (const [k, v] of this.heatMap) {
        if (v === BURNING) continue;
        const t = Math.floor(v / 1024);
        const h = ((v - t * 1024) / HEAT_Q) * decay(tick - t);
        if (h < 0.05) this.heatMap.delete(k);
      }
    }
    for (const id of this.tf.keys()) if (!this.sim.bodies.has(id)) this.tf.delete(id);
    for (const [id, c] of this.nearCache) if (!this.sim.bodies.has(id) || tick - c.at > 120) this.nearCache.delete(id);
    this.wet = this.wet.filter((w) => w.until > tick);
  }

  private hurtPlayer(): void {
    const pl = this.sim.player;
    if (!pl) return;
    const e = pl.eye;
    const footY = e.y - 1.65;
    const R = 0.8;
    let best = R, near = 0;
    for (let s = 0; s < this.hw; s++) {
      if (!this.alive[s]) continue;
      const o = s * 3;
      const dx = this.wpos[o] - e.x, dz = this.wpos[o + 2] - e.z;
      if (dx > R || dx < -R || dz > R || dz < -R) continue;
      const y = this.wpos[o + 1];
      const dy = y < footY ? footY - y : y > e.y ? y - e.y : 0;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < R) { near++; if (d < best) best = d; if (near >= 12) break; }
    }
    if (!near) return;
    const k = (1 - best / R) * Math.min(1, 0.4 + near * 0.1);
    pl.damage(this.damagePerSecond * (UPDATE_EVERY / 60) * Math.max(0.2, k), 'fire');
  }

  // =================================================================== split / bookkeeping

  private handleSplit(parent: VoxelBody, child: VoxelBody, off: [number, number, number]): void {
    if (this.n === 0 && this.chars.length === 0) return;
    const pg = parent.grid, cg = child.grid;
    for (let s = 0; s < this.hw; s++) {
      if (!this.alive[s] || this.sb[s] !== parent) continue;
      if (pg.data[this.sidx[s]]) continue;
      const cx = this.sx[s] - off[0], cy = this.sy[s] - off[1], cz = this.sz[s] - off[2];
      if (!cg.inside(cx, cy, cz)) continue;
      const ci = cg.idx(cx, cy, cz);
      if (!cg.data[ci]) continue;
      this.map.delete(parent.id * KEY_SPAN + this.sidx[s]);
      this.heatMap.delete(parent.id * KEY_SPAN + this.sidx[s]);
      this.sb[s] = child; this.sidx[s] = ci; this.sx[s] = cx; this.sy[s] = cy; this.sz[s] = cz;
      this.map.set(child.id * KEY_SPAN + ci, s);
      this.heatMap.set(child.id * KEY_SPAN + ci, BURNING);
    }
    for (const c of this.chars) {
      if (c.body !== parent || pg.data[c.idx]) continue;
      const x = c.idx % pg.sx, y = ((c.idx / pg.sx) | 0) % pg.sy, z = (c.idx / (pg.sx * pg.sy)) | 0;
      const cx = x - off[0], cy = y - off[1], cz = z - off[2];
      if (!cg.inside(cx, cy, cz) || !cg.data[cg.idx(cx, cy, cz)]) continue;
      c.body = child; c.idx = cg.idx(cx, cy, cz);
    }
  }

  /** allocate a fire; returns slot or -1 */
  private start(b: VoxelBody, x: number, y: number, z: number, idx: number): number {
    if (this.n >= this.maxFires || this.free.length === 0) return -1;
    const p = b.grid.data[idx];
    if (!p) return -1;
    const fl = PAL_FLAMMABILITY[p];
    if (fl <= 0) return -1;
    const a = this.xf(b);
    let wx = (x + 0.5) * VOXEL, wy = (y + 0.5) * VOXEL, wz = (z + 0.5) * VOXEL;
    if (!a[8]) { this.rotate(a, wx, wy, wz, false); wx = this.tmp[0]; wy = this.tmp[1]; wz = this.tmp[2]; }
    wx += a[0]; wy += a[1]; wz += a[2];
    if (this.underwater(wy) || (this.wet.length && this.isWet(wx, wy, wz))) return -1;
    const s = this.free.pop()!;
    if (s >= this.hw) this.hw = s + 1;
    this.alive[s] = 1;
    this.sb[s] = b; this.sidx[s] = idx; this.sx[s] = x; this.sy[s] = y; this.sz[s] = z;
    const bt = MATERIALS[matOf(p)].burnTime || 20;
    const fm = Math.max(4, bt * (0.75 + 0.5 * this.sim.rng.next()));
    this.fuel[s] = fm; this.fuelMax[s] = fm;
    this.inten[s] = 0.3;
    this.wpos[s * 3] = wx; this.wpos[s * 3 + 1] = wy; this.wpos[s * 3 + 2] = wz;
    this.updateExposure(s, b.grid, x, y, z);
    this.map.set(b.id * KEY_SPAN + idx, s);
    this.heatMap.set(b.id * KEY_SPAN + idx, BURNING);
    this.n++;
    this.stats.ignited++;
    const t = this.sim.tick;
    if (t - this.lastIgniteEvent >= 20) {
      this.lastIgniteEvent = t;
      this.sim.out.push({ type: 'custom', name: 'fire:ignite', data: { pos: { x: wx, y: wy, z: wz } } });
    }
    return s;
  }

  private kill(s: number): void {
    if (!this.alive[s]) return;
    const b = this.sb[s]!;
    this.map.delete(b.id * KEY_SPAN + this.sidx[s]);
    this.heatMap.delete(b.id * KEY_SPAN + this.sidx[s]);
    this.alive[s] = 0;
    this.sb[s] = null;
    this.n--;
    this.free.push(s);
    if (s === this.hw - 1) while (this.hw > 0 && !this.alive[this.hw - 1]) this.hw--;
    // keep the free stack handing out low slots first (dense iteration)
    if (this.free.length > 1 && this.free[this.free.length - 1] > this.free[this.free.length - 2]) {
      const l = this.free.length;
      const t = this.free[l - 1]; this.free[l - 1] = this.free[l - 2]; this.free[l - 2] = t;
    }
  }

  private updateExposure(s: number, g: VoxelBody['grid'], x: number, y: number, z: number): void {
    const o = s * 3;
    for (let k = 0; k < 6; k++) {
      const f = FACES[k];
      if (!g.get(x + f[0], y + f[1], z + f[2])) { this.sexp[o] = f[0]; this.sexp[o + 1] = f[1]; this.sexp[o + 2] = f[2]; return; }
    }
    this.sexp[o] = 0; this.sexp[o + 1] = 0; this.sexp[o + 2] = 0;
  }

  /** has the voxel a face open to air (or the grid border)? */
  private exposed(g: VoxelBody['grid'], x: number, y: number, z: number): boolean {
    return !g.get(x, y + 1, z) || !g.get(x + 1, y, z) || !g.get(x - 1, y, z) || !g.get(x, y, z + 1) || !g.get(x, y, z - 1) || !g.get(x, y - 1, z);
  }

  private addHeat(key: number, amount: number): number {
    const t = this.sim.tick;
    const v = this.heatMap.get(key);
    let h = amount;
    if (v === BURNING) return 0;
    if (v !== undefined) {
      const t0 = Math.floor(v / 1024);
      h += ((v - t0 * 1024) / HEAT_Q) * decay(t - t0);
    }
    const q = Math.min(HEAT_QMAX, Math.round(h * HEAT_Q));
    this.heatMap.set(key, t * 1024 + q);
    return q / HEAT_Q;
  }

  private underwater(y: number): boolean {
    return this.waterLevel !== null && y < this.waterLevel;
  }

  private isWet(x: number, y: number, z: number): boolean {
    const t = this.sim.tick;
    for (const w of this.wet) {
      if (w.until <= t) continue;
      const dx = x - w.x, dy = y - w.y, dz = z - w.z;
      if (dx * dx + dy * dy + dz * dz < w.r2) return true;
    }
    return false;
  }

  /** bodies whose bounds are within reach of body b (cached, refreshed every 20–60 ticks) */
  private nearBodies(b: VoxelBody): VoxelBody[] {
    const t = this.sim.tick;
    let c = this.nearCache.get(b.id);
    if (!c || t - c.at > (b.dynamic ? 20 : 60)) {
      const list = this.sim.bodiesNear(b.center(), b.radius + 0.5);
      // own body first (most probes land there), then the others
      list.sort((p, q) => (p === b ? -1 : q === b ? 1 : p.id - q.id));
      c = { at: t, list };
      this.nearCache.set(b.id, c);
    }
    return c.list;
  }

  /** refresh the cached world centre of a slot if its body moved this tick */
  private refreshPos(s: number): void {
    const b = this.sb[s]!;
    if (!b.dynamic) return; // static bodies never move (cache computed at ignition)
    const a = this.xf(b);
    this.rotate(a, (this.sx[s] + 0.5) * VOXEL, (this.sy[s] + 0.5) * VOXEL, (this.sz[s] + 0.5) * VOXEL, false);
    const o = s * 3;
    this.wpos[o] = this.tmp[0] + a[0]; this.wpos[o + 1] = this.tmp[1] + a[1]; this.wpos[o + 2] = this.tmp[2] + a[2];
  }

  /** body transform, cached per tick */
  private xf(b: VoxelBody): Float64Array {
    let a = this.tf.get(b.id);
    if (!a) { a = new Float64Array(9); a[7] = -1; this.tf.set(b.id, a); }
    const t = this.sim.tick;
    // bodies only move in world.step(), which is followed by tick++: a per-tick cache is exact
    if (a[7] !== t) {
      const p = b.rb.translation(), q = b.rb.rotation();
      a[0] = p.x; a[1] = p.y; a[2] = p.z; a[3] = q.x; a[4] = q.y; a[5] = q.z; a[6] = q.w; a[7] = t;
      a[8] = !b.dynamic && b.identityRot ? 1 : 0;
    }
    return a;
  }

  /** rotate (x,y,z) by the cached quaternion (or its inverse) into this.tmp */
  private rotate(a: Float64Array, x: number, y: number, z: number, inverse: boolean): void {
    const qx = inverse ? -a[3] : a[3], qy = inverse ? -a[4] : a[4], qz = inverse ? -a[5] : a[5], qw = a[6];
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    this.tmp[0] = x + qw * tx + (qy * tz - qz * ty);
    this.tmp[1] = y + qw * ty + (qz * tx - qx * tz);
    this.tmp[2] = z + qw * tz + (qx * ty - qy * tx);
  }
}
