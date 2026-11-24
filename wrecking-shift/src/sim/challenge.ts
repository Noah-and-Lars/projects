/**
 * Challenge modes — deterministic score attack rules (pure TS, runs in Node, no DOM / three.js).
 *
 *   rubble  "Rubble Rush"   : wreck as much as you can. The 90 s clock starts once the first 500 voxels
 *                             are gone; score = voxels removed from static world bodies + props
 *                             (sim.onRemoved, debris re-breaking does not count).
 *   snatch  "Snatch Sprint" : 12 small alarmed loot crates are scattered over the map. Taking the first
 *                             one (E, looked at within 2.5 m) starts a 60 s clock. Clock out at the escape
 *                             point (E) before it runs out: 100 per crate + 5 per second left. Too late =
 *                             you keep half the crate points and no time bonus.
 *
 * Events pushed to `sim.out` as `{ type: 'custom', name, data }`:
 *   challenge:ready {mode, level}            (challenge created, clock not running)
 *   challenge:start {mode, level, seconds}   (clock started)
 *   challenge:tick {left}                    (every whole second while the clock runs)
 *   challenge:score {score}                  (score changed; rubble: at most every 6 ticks)
 *   challenge:pickup {count, total, name}    (snatch: a crate was taken)
 *   challenge:end {result}                   (ChallengeResult)
 */
import type { VoxelBody } from './body';
import { box } from './build';
import type { LevelInfo } from './levels/types';
import { MAT, pal } from './materials';
import { INTERACT_RANGE, ESCAPE_RADIUS, deathReason, type MissionPlayer } from './mission';
import { Rng } from './rng';
import { DT, type Sim } from './sim';
import type { V3 } from './vec';
import { VoxelGrid } from './voxels';

// ------------------------------------------------------------------------------------------ rules data

export type ChallengeModeId = 'rubble' | 'snatch';

export interface ChallengeModeDef {
  id: ChallengeModeId;
  title: string;
  tagline: string;
  rules: string[];
  /** clock length (seconds) */
  seconds: number;
  /** score needed for 1 / 2 / 3 stars (per level, `default` fallback) */
  stars: Record<string, [number, number, number]>;
}

export const RUBBLE = { seconds: 90, startAfter: 500, ammoFactor: 3 };
export const SNATCH = { seconds: 60, crates: 12, minSpacing: 8, escapeSpacing: 6, perCrate: 100, perSecond: 5, lateFactor: 0.5 };

export const CHALLENGE_MODES: Record<ChallengeModeId, ChallengeModeDef> = {
  rubble: {
    id: 'rubble', title: 'Rubble Rush', tagline: 'Ninety seconds. Everything on the site is fair game.',
    rules: [
      `Every tool, a fat stack of ammo (${RUBBLE.ammoFactor}× the usual).`,
      `The clock starts after the first ${RUBBLE.startAfter} voxels are gone — warm up however you like.`,
      `${RUBBLE.seconds} s on the clock. One point per voxel broken out of buildings, terrain and props.`,
      'Loose debris you smash again scores nothing — knock down something new.',
    ],
    seconds: RUBBLE.seconds,
    // measured: a busy but unhurried run with bombs + shotgun breaks ~10-14k voxels in 90 s (see DECISIONS.md)
    stars: { default: [4000, 10000, 20000], testyard: [2500, 6000, 12000] },
  },
  snatch: {
    id: 'snatch', title: 'Snatch Sprint', tagline: 'Alarmed crates all over the site. Grab, run, clock out.',
    rules: [
      `${SNATCH.crates} small alarmed crates are hidden around the map (red blinking lid). Look at one and press E.`,
      `Lifting the first crate starts a ${SNATCH.seconds} s clock.`,
      `Clock out at the escape point (E) in time: ${SNATCH.perCrate} per crate + ${SNATCH.perSecond} per second left.`,
      'Miss the clock and the client only pays half for the crates — no time bonus.',
    ],
    seconds: SNATCH.seconds,
    stars: { default: [300, 700, 1200] },
  },
};

export function starThresholds(mode: ChallengeModeId, levelId: string): [number, number, number] {
  const s = CHALLENGE_MODES[mode].stars;
  return s[levelId] ?? s.default;
}
export function starsFor(mode: ChallengeModeId, levelId: string, score: number): number {
  const t = starThresholds(mode, levelId);
  return score >= t[2] ? 3 : score >= t[1] ? 2 : score >= t[0] ? 1 : 0;
}
/** key used for best scores in the save file */
export function challengeKey(mode: ChallengeModeId, levelId: string): string { return `${mode}@${levelId}`; }

// ------------------------------------------------------------------------------------------ types

export type ChallengePhase = 'ready' | 'running' | 'ended';
export type ChallengeOutcome = 'time' | 'escaped' | 'late' | 'dead' | 'quit';

export interface ChallengeResult {
  mode: ChallengeModeId;
  levelId: string;
  /** true = counts as a finished run (time up in rubble, escaped in snatch) */
  success: boolean;
  outcome: ChallengeOutcome;
  reason: string;
  score: number;
  stars: number;
  breakdown: { label: string; points: number }[];
  /** rubble */
  voxels: number;
  /** snatch */
  crates: number;
  total: number;
  /** clock seconds left at the end (null if it never ran) */
  timeLeft: number | null;
  /** seconds since the challenge was created */
  time: number;
}

export interface ChallengeContext {
  sim: Sim;
  level: LevelInfo;
  levelId: string;
  player: MissionPlayer;
}
export interface ChallengeInput { interact: boolean }
export interface ChallengeFocus { kind: 'crate' | 'escape'; name: string }

interface CrateRec { body: VoxelBody | null; bodyId: number; pos: V3; taken: boolean }

const TICKS = Math.round(1 / DT);
function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; }
const round2 = (v: number) => Math.round(v * 100) / 100;

// ------------------------------------------------------------------------------------------ crate spots

export interface SpotOptions {
  count?: number;
  minSpacing?: number;
  /** min distance to the escape point */
  escapeSpacing?: number;
  seed?: number;
}

/**
 * Deterministic loot spots: candidates around every level marker (except `escape` / `heli_start`) on
 * rings of 0 / 4 / 8 / 12 m, each dropped to the floor with a downward ray from 1.6 m above the marker
 * height (same storey), then a coarse grid of ground-level points as fallback (same height as the
 * spawn ± 1.2 m). Chosen greedily in shuffled order keeping `minSpacing` (relaxed when needed).
 */
export function pickCrateSpots(sim: Sim, level: LevelInfo, opts: SpotOptions = {}): V3[] {
  const k = opts.count ?? SNATCH.crates;
  const minSpacing = opts.minSpacing ?? SNATCH.minSpacing;
  const escSpacing = opts.escapeSpacing ?? SNATCH.escapeSpacing;
  const rng = new Rng((opts.seed ?? 7331) ^ 0x5eed);
  const b = level.bounds;
  const wl = level.waterLevel;
  const margin = 3;
  const inBounds = (x: number, z: number) => x > b.min.x + margin && x < b.max.x - margin && z > b.min.z + margin && z < b.max.z - margin;

  const floorAt = (x: number, z: number, top: number, maxDrop: number): V3 | null => {
    const o = { x, y: top, z };
    if (sim.sample(o)) return null; // start point inside something solid (wall, roof)
    const hit = sim.raycast(o, { x: 0, y: -1, z: 0 }, maxDrop);
    if (!hit || hit.normal.y < 0.7 || hit.body.dynamic) return null;
    const p = hit.point;
    if (wl != null && p.y < wl + 0.15) return null;
    // room for the crate and a crouching player
    for (const dy of [0.25, 0.6, 1.0]) if (sim.sample({ x, y: p.y + dy, z })) return null;
    // not right at a drop-off: the 4 neighbours 0.3 m away must also be floor within 0.25 m
    for (const [dx, dz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
      const h2 = sim.raycast({ x: x + dx, y: p.y + 0.2, z: z + dz }, { x: 0, y: -1, z: 0 }, 0.5);
      if (!h2) return null;
    }
    return { x, y: p.y, z };
  };

  type Cand = { p: V3; prio: number; r: number };
  const cands: Cand[] = [];
  const names = Object.keys(level.markers).filter((n) => n !== 'escape' && n !== 'heli_start').sort();
  for (const name of names) {
    const m = level.markers[name];
    if (!inBounds(m.x, m.z)) continue;
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    const a0 = (h % 360) * Math.PI / 180;
    const rings: [number, number][] = [[0, 1], [4, 6], [8, 8], [12, 10]];
    for (const [r, n] of rings) {
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2;
        const x = m.x + Math.sin(a) * r, z = m.z + Math.cos(a) * r;
        if (!inBounds(x, z)) continue;
        const f = floorAt(x, z, m.y + 1.6, 3.0);
        if (f && Math.abs(f.y - m.y) < 1.2) cands.push({ p: f, prio: 0, r: rng.next() });
      }
    }
  }
  // fallback: ground-level grid (same height band as the spawn so it is walkable from there)
  const sy = level.spawn.y;
  const step = 6;
  for (let x = Math.ceil((b.min.x + margin) / step) * step; x < b.max.x - margin; x += step) {
    for (let z = Math.ceil((b.min.z + margin) / step) * step; z < b.max.z - margin; z += step) {
      const f = floorAt(x + 0.5, z + 0.5, sy + 1.6, 3.0);
      if (f && Math.abs(f.y - sy) < 1.2) cands.push({ p: f, prio: 1, r: rng.next() });
    }
  }
  cands.sort((p, q) => p.prio - q.prio || p.r - q.r);

  const esc = level.markers.escape ?? level.spawn;
  const chosen: V3[] = [];
  const d2 = (a: V3, c: V3) => (a.x - c.x) ** 2 + (a.z - c.z) ** 2;
  for (const spacing of [minSpacing, minSpacing * 0.66, minSpacing * 0.4]) {
    for (const c of cands) {
      if (chosen.length >= k) break;
      if (chosen.includes(c.p)) continue;
      if (d2(c.p, esc) < escSpacing * escSpacing) continue;
      if (chosen.some((q) => d2(q, c.p) < spacing * spacing)) continue;
      chosen.push(c.p);
    }
    if (chosen.length >= k) break;
  }
  return chosen;
}

/** small red-lidded loot crate (0.4 x 0.3 x 0.4 m) standing on `floor` (centre of its bottom face) */
export function lootCrate(sim: Sim, floor: V3, n: number): VoxelBody {
  const g = new VoxelGrid(4, 3, 4);
  box(g, 0, 0, 0, 4, 2, 4, pal(MAT.crate, n % 3));
  box(g, 0, 0, 0, 4, 1, 4, pal(MAT.crate, 3));
  box(g, 0, 2, 0, 4, 3, 4, pal(MAT.alarmbox, 1));
  g.set(1, 2, 1, pal(MAT.lamp)); g.set(2, 2, 2, pal(MAT.lamp));
  const body = sim.addBody(g, { x: floor.x - 0.2, y: floor.y + 0.005, z: floor.z - 0.2 }, { dynamic: true, kind: 'prop', name: 'Loot Crate', tags: ['challenge:crate'] });
  body.keepIndex = 0;
  return body;
}

// ------------------------------------------------------------------------------------------ Challenge

export class Challenge {
  readonly mode: ChallengeModeId;
  readonly def: ChallengeModeDef;
  readonly levelId: string;
  readonly sim: Sim;
  readonly level: LevelInfo;
  readonly player: MissionPlayer;
  phase: ChallengePhase = 'ready';
  /** ticks since creation */
  tick = 0;
  /** clock ticks left (full while 'ready') */
  clockTicks: number;
  /** rubble: voxels counted */
  voxels = 0;
  result: ChallengeResult | null = null;
  focus: ChallengeFocus | null = null;
  crates: CrateRec[] = [];
  private lastScore = 0;
  private removedHook: (b: VoxelBody) => void;
  private clockStarted = false;

  constructor(mode: ChallengeModeId, ctx: ChallengeContext) {
    this.mode = mode;
    this.def = CHALLENGE_MODES[mode];
    this.levelId = ctx.levelId;
    this.sim = ctx.sim;
    this.level = ctx.level;
    this.player = ctx.player;
    this.clockTicks = this.def.seconds * TICKS;
    this.removedHook = (b) => { if (this.phase !== 'ended' && (b.kind === 'world' || b.kind === 'prop') && !b.tags.has('challenge:crate')) this.voxels++; };
    if (mode === 'rubble') this.sim.onRemoved.push(this.removedHook);
    else {
      const spots = pickCrateSpots(this.sim, this.level, { seed: hashStr(this.levelId) });
      spots.forEach((p, i) => { const body = lootCrate(this.sim, p, i); this.crates.push({ body, bodyId: body.id, pos: { ...p }, taken: false }); });
    }
    this.emit('challenge:ready', { mode, level: this.levelId });
  }

  get ended(): boolean { return this.phase === 'ended'; }
  get running(): boolean { return this.phase === 'running'; }
  get timeLeft(): number { return Math.max(0, this.clockTicks / TICKS); }
  get cratesTaken(): number { return this.crates.reduce((s, c) => s + (c.taken ? 1 : 0), 0); }
  get cratesTotal(): number { return this.crates.length; }
  /** live score (final score once ended) */
  get score(): number {
    if (this.result) return this.result.score;
    return this.mode === 'rubble' ? this.voxels : this.cratesTaken * SNATCH.perCrate;
  }
  /** rubble: voxels still needed before the clock starts */
  get warmupLeft(): number { return this.mode === 'rubble' && !this.clockStarted ? Math.max(0, RUBBLE.startAfter - this.voxels) : 0; }
  escapePos(): V3 { const e = this.level.markers.escape ?? this.level.spawn; return { x: e.x, y: e.y, z: e.z }; }
  /** snatch: crates still lying around (map / HUD markers) */
  openCrates(): { pos: V3; bodyId: number }[] {
    const out: { pos: V3; bodyId: number }[] = [];
    for (const c of this.crates) if (!c.taken && c.body && !c.body.removed) out.push({ pos: c.body.center(), bodyId: c.bodyId });
    return out;
  }

  dispose(): void {
    const i = this.sim.onRemoved.indexOf(this.removedHook);
    if (i >= 0) this.sim.onRemoved.splice(i, 1);
  }

  update(input: ChallengeInput): void {
    if (this.ended) return;
    this.tick++;
    const p = this.player;
    if (p.dead) { this.finish('dead', deathReason(p.lastHurt)); return; }
    if (this.mode === 'rubble') this.updateRubble();
    else this.updateSnatch(input);
    if (this.ended) return;
    if (this.phase === 'running') {
      const before = Math.ceil(this.clockTicks / TICKS);
      this.clockTicks--;
      const after = Math.ceil(this.clockTicks / TICKS);
      if (after !== before && this.clockTicks > 0) this.emit('challenge:tick', { left: after });
      if (this.clockTicks <= 0) {
        this.clockTicks = 0;
        if (this.mode === 'rubble') this.finish('time', 'Time! Put the tools down.');
        else this.finish('late', 'The clock ran out before you clocked out.');
      }
    }
  }

  private startClock(): void {
    if (this.clockStarted) return;
    this.clockStarted = true;
    this.phase = 'running';
    this.clockTicks = this.def.seconds * TICKS;
    this.emit('challenge:start', { mode: this.mode, level: this.levelId, seconds: this.def.seconds });
  }

  private updateRubble(): void {
    if (!this.clockStarted && this.voxels >= RUBBLE.startAfter) this.startClock();
    if (this.voxels !== this.lastScore && this.tick % 6 === 0) { this.lastScore = this.voxels; this.emit('challenge:score', { score: this.voxels }); }
  }

  private updateSnatch(input: ChallengeInput): void {
    const p = this.player;
    for (const c of this.crates) if (c.body && c.body.removed) c.body = null;
    this.focus = null;
    let used = false;
    if (!p.seated) {
      const hit = this.sim.raycast(p.eye, p.forward, INTERACT_RANGE);
      const c = hit ? this.crates.find((r) => r.body === hit.body && !r.taken) : undefined;
      if (c) {
        this.focus = { kind: 'crate', name: 'Loot Crate' };
        if (input.interact) {
          used = true;
          c.taken = true;
          this.sim.removeBody(c.body!);
          c.body = null;
          this.focus = null;
          this.startClock();
          this.emit('challenge:pickup', { count: this.cratesTaken, total: this.cratesTotal, name: 'Loot Crate' });
          this.emit('challenge:score', { score: this.score });
        }
      }
    }
    if (this.clockStarted && this.cratesTaken > 0 && this.atEscape()) {
      if (!this.focus) this.focus = { kind: 'escape', name: 'escape' };
      const allGone = this.openCrates().length === 0;
      if ((input.interact && !used) || allGone) this.finish('escaped', allGone ? 'Every crate bagged and clocked out.' : 'Clocked out with the goods.');
    }
  }

  /** horizontal radius + vertical tolerance, like the mission escape */
  atEscape(): boolean {
    const c = this.escapePos(), p = this.player.pos;
    return (p.x - c.x) ** 2 + (p.z - c.z) ** 2 <= ESCAPE_RADIUS * ESCAPE_RADIUS && Math.abs(p.y - c.y) < ESCAPE_RADIUS + 2;
  }

  /** give up (quit / restart from the pause menu): ends without a result being worth recording */
  abort(): void { if (!this.ended) this.finish('quit', 'Walked off the job.'); }

  private finish(outcome: ChallengeOutcome, reason: string): void {
    if (this.ended) return;
    this.phase = 'ended';
    this.focus = null;
    const breakdown: { label: string; points: number }[] = [];
    let score = 0;
    let success = false;
    const left = this.clockStarted ? round2(this.timeLeft) : null;
    if (this.mode === 'rubble') {
      score = this.voxels;
      breakdown.push({ label: `Voxels wrecked`, points: this.voxels });
      success = outcome === 'time';
    } else {
      const n = this.cratesTaken;
      if (outcome === 'escaped') {
        const pts = n * SNATCH.perCrate;
        const bonus = Math.floor(this.timeLeft) * SNATCH.perSecond;
        breakdown.push({ label: `Crates (${n} × ${SNATCH.perCrate})`, points: pts });
        if (bonus > 0) breakdown.push({ label: `Time left (${Math.floor(this.timeLeft)} s × ${SNATCH.perSecond})`, points: bonus });
        score = pts + bonus;
        success = true;
      } else if (outcome === 'late') {
        const pts = Math.floor(n * SNATCH.perCrate * SNATCH.lateFactor);
        breakdown.push({ label: `Crates (${n}, late: half pay)`, points: pts });
        score = pts;
      } else {
        breakdown.push({ label: `Crates (${n}, nothing delivered)`, points: 0 });
      }
    }
    if (outcome === 'quit') score = 0;
    this.result = {
      mode: this.mode, levelId: this.levelId, success, outcome, reason, score,
      stars: outcome === 'quit' ? 0 : starsFor(this.mode, this.levelId, score), breakdown,
      voxels: this.voxels, crates: this.cratesTaken, total: this.cratesTotal, timeLeft: left, time: round2(this.tick * DT),
    };
    this.dispose();
    this.emit('challenge:score', { score });
    this.emit('challenge:end', { result: this.result });
  }

  private emit(name: string, data: any): void { this.sim.out.push({ type: 'custom', name, data }); }
}
