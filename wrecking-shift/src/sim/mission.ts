/**
 * Heist mission framework — deterministic mission logic (pure TS, runs in Node, no DOM / three.js).
 *
 * ================================================================================================
 *  AUTHORING GUIDE (level designers: read this, then look at src/game/missions.ts for examples)
 * ================================================================================================
 *
 * A mission = a `MissionDef` (data, registered in src/game/missions.ts) played on a level
 * (`LevelDef`, registered in src/game/levels.ts). One level can host many missions. Everything the
 * mission needs to know about the level comes from BODY TAGS, NAMES and LEVEL MARKERS:
 *
 * Body tags (`body.tags`, set via `sim.addBody(.., { tags: [...] })` or `body.tags.add(..)`):
 *   target:<id>       an objective target. `collect` targets are small DYNAMIC bodies picked up with E
 *                     (looked at within 2.5 m); `deliver` targets are (heavy) bodies that must be moved
 *                     into a zone; `destroy` / `demolish` objectives may also use `target:<id>` OR
 *                     `destroy:<id>` (preferred for static buildings). Several bodies may share an id
 *                     (e.g. 3 bodies tagged `target:server` -> "collect 3 servers").
 *                     Display name = `body.name` (e.g. 'Gold Idol') — always set a name.
 *   destroy:<id>      bodies of a destroy / demolish objective (usually STATIC world pieces).
 *   alarm:<id>        an alarm box wired to target <id> (any target id, or a free id for a standalone
 *                     box). Triggers the alarm when the box loses a voxel, is removed, moves, or comes
 *                     loose (all solid matter it was mounted on is gone). A target is "alarmed" when
 *                     at least one alarm box names it: tampering with it (collect, move > 0.5 m, any
 *                     voxel lost) starts the countdown. Build boxes with `alarmBox()` (sim/missionProps).
 *   valuable:<amount> loose cash item (dynamic body) — E to pick up, adds $amount (paid on success).
 *   escape            the escape vehicle body (optional). If present, the escape point follows it;
 *                     being seated (player.seated) within the escape radius of it also counts as escaping.
 *
 * Level markers (`LevelInfo.markers`, name -> world position):
 *   escape            escape point (used when no body is tagged `escape`; falls back to level.spawn).
 *   heli_start        where the cosmetic security helicopter appears (default: far corner, 35 m up).
 *   <any name>        referenced by zones: `{ marker: 'dock', radius: 4 }`.
 * Level zones (`LevelInfo.zones`, optional): named spheres/boxes, referenced as `{ zone: 'name' }`.
 * Water: `LevelInfo.waterLevel` — a deliver zone `{ water: true }` completes when the body's centre
 * of mass is below the surface.
 *
 * Mission-specific props: put them in `MissionDef.setup(sim, level)` (runs right after the level was
 * built, before the first tick), so the same level stays clean for sandbox / other missions.
 *
 * Phases: 'planning' (no time pressure, quicksave allowed) -> 'alarm' (countdown) -> 'success' | 'failed'.
 * Missions without alarm boxes, fireAlarm or demolitionSensor have no timer at all.
 * Escape: once every REQUIRED objective is done the escape point opens; press E within
 * `escape.radius` (default 3 m) of it, or sit in the vehicle tagged `escape` (MissionInput.vehicleBody, or
 * player.seated within the radius of it) -> success.
 *
 * Events pushed to `sim.out` as `{ type: 'custom', name, data }` (HUD + audio listen to these):
 *   mission:start {id}            mission:alarm {seconds, cause}     mission:second {left}
 *   mission:target {id, title, required}   (a target was taken)      mission:objective {id, title}
 *   mission:pickup {amount, name}  mission:escapeOpen {}  mission:heli {pos} (helicopter appears)
 *   mission:success {result}       mission:fail {reason}
 * ================================================================================================
 */
import type { VoxelBody } from './body';
import type { LevelInfo } from './levels/types';
import { DT, type Sim } from './sim';
import type { V3 } from './vec';

// ------------------------------------------------------------------------------------------ types

export type MissionPhase = 'planning' | 'alarm' | 'success' | 'failed';

/** A region of the level. Exactly one position source: `marker`, `zone`, `at`, `bodyTag` or `water`. */
export interface ZoneDef {
  /** level marker name (LevelInfo.markers) */
  marker?: string;
  /** named level zone (LevelInfo.zones) */
  zone?: string;
  /** explicit world position */
  at?: V3;
  /** follows the (first) body carrying this tag, e.g. 'escape' = the escape van; centre = body grid centre */
  bodyTag?: string;
  /** offset added to the resolved centre (metres) */
  offset?: V3;
  /** sphere radius (metres, default 3) — ignored when `half` is given */
  radius?: number;
  /** axis-aligned box half extents instead of a sphere */
  half?: V3;
  /** below LevelInfo.waterLevel (centre of mass under the surface). Combined with a position = both. */
  water?: boolean;
}

interface ObjectiveBase {
  /** unique within the mission */
  id: string;
  /** HUD text, e.g. 'Steal the gold idol' */
  title: string;
  /** default true. Optional objectives are bonus score. */
  required?: boolean;
  /** score when completed (default 100 required / 50 optional) */
  points?: number;
}
/** pick up all (or `count`) bodies tagged `target:<target>` with E */
export interface CollectObjective extends ObjectiveBase { kind: 'collect'; target?: string; count?: number }
/** bring all (or `count`) bodies tagged `target:<target>` into `zone` (must stay 0.5 s) */
export interface DeliverObjective extends ObjectiveBase { kind: 'deliver'; target?: string; count?: number; zone: ZoneDef }
/** bodies tagged `destroy:<target>` (or `target:<target>`) must lose >= percent% of their voxels */
export interface DestroyObjective extends ObjectiveBase { kind: 'destroy'; target?: string; percent: number }
/** nothing of the bodies tagged `destroy:<target>` / `target:<target>` may remain above world height `height` */
export interface DemolishObjective extends ObjectiveBase { kind: 'demolish'; target?: string; height: number }
/** the player must enter `zone` */
export interface ReachObjective extends ObjectiveBase { kind: 'reach'; zone: ZoneDef }
export type ObjectiveDef = CollectObjective | DeliverObjective | DestroyObjective | DemolishObjective | ReachObjective;

export interface MissionDef {
  id: string;
  /** LevelDef id the mission plays on */
  levelId: string;
  title: string;
  /** who hired you, e.g. 'Dottie Fenwick, Fenwick Realty' */
  client: string;
  /** briefing text (plain text, paragraphs separated by blank lines) */
  brief: string;
  objectives: ObjectiveDef[];
  /** countdown length in seconds once the alarm is triggered (default 60) */
  alarmSeconds?: number;
  /** burning voxel count that triggers the alarm (fire alarm). undefined = no fire alarm */
  fireAlarm?: number;
  /** removed voxels (before the alarm) that trigger the alarm. undefined = off */
  demolitionSensor?: number;
  /** tool restrictions: `allow` = only these tool ids are usable; `ammo` = absolute max ammo overrides */
  tools?: { allow?: string[]; ammo?: Record<string, number> };
  /** presentation hint for the renderer (written to LevelInfo.sky) */
  timeOfDay?: 'day' | 'sunset' | 'night' | 'overcast';
  /** presentation hint: falling rain / snow (written to LevelInfo.weather) */
  weather?: 'rain' | 'snow';
  /** flat payment on success (added to valuables) and extra score */
  reward?: { cash?: number; score?: number };
  /** escape point override (default: body tagged 'escape' or marker 'escape', radius 3) */
  escape?: ZoneDef;
  /** marker name for the helicopter start (default 'heli_start') */
  heliStart?: string;
  /** score per second left on the alarm clock at escape (default 2). Never triggered = full clock. */
  timeBonusPerSecond?: number;
  /** progression: mission ids that must be completed first (UI / progress only) */
  unlockAfter?: string[];
  /** level seed (default 1234) */
  seed?: number;
  /** spawn mission-specific props / tag level bodies. Must be deterministic. */
  setup?: (sim: Sim, level: LevelInfo) => void;
}

export interface ObjectiveState {
  id: string;
  title: string;
  kind: ObjectiveDef['kind'];
  required: boolean;
  points: number;
  done: boolean;
  /** 0..1 */
  progress: number;
  /** collect / deliver: items done / needed */
  count: number;
  need: number;
  /** HUD detail, e.g. '1/3' or '42%' */
  detail: string;
}

export interface MissionResult {
  missionId: string;
  success: boolean;
  reason?: string;
  /** total score */
  score: number;
  breakdown: { label: string; points: number }[];
  /** cash earned (valuables + reward), only paid out on success */
  cash: number;
  valuables: { name: string; amount: number }[];
  alarmTriggered: boolean;
  /** seconds left on the alarm clock (null if it never ran) */
  timeLeft: number | null;
  /** mission duration in seconds */
  time: number;
}

/** what is under the crosshair (for the HUD prompt) */
export interface MissionFocus {
  kind: 'target' | 'valuable' | 'escape';
  name: string;
  amount?: number;
  required?: boolean;
}

/** the subset of Player the mission needs (lets tests use fakes) */
export interface MissionPlayer {
  readonly eye: V3;
  readonly pos: V3;
  readonly forward: V3;
  dead: boolean;
  seated: boolean;
  lastHurt?: string;
}

export interface MissionContext {
  sim: Sim;
  level: LevelInfo;
  player: MissionPlayer;
  /** burning voxel count (game.fire.count) */
  fireCount?: () => number;
}

export interface MissionInput {
  /** interact key (E) pressed this tick */
  interact: boolean;
  /** body of the vehicle the player is driving (game.ext.vehicles.current.body), if any */
  vehicleBody?: VoxelBody | null;
}

// ------------------------------------------------------------------------------------------ constants

export const INTERACT_RANGE = 2.5;
export const ESCAPE_RADIUS = 3;
export const HELI_SECONDS = 15;
/** a dynamic alarmed target moved further than this from its start = tampered */
export const TAMPER_MOVE = 0.5;
const TICKS = Math.round(1 / DT);

// ------------------------------------------------------------------------------------------ helpers

/** all bodies carrying exactly this tag, in id order (deterministic) */
export function bodiesWithTag(sim: Sim, tag: string): VoxelBody[] {
  const out: VoxelBody[] = [];
  for (const b of sim.bodies.values()) if (b.tags.has(tag)) out.push(b);
  return out.sort((a, b) => a.id - b.id);
}
/** add a tag to every body matching a predicate (handy in MissionDef.setup) */
export function tagBodies(sim: Sim, pred: (b: VoxelBody) => boolean, tag: string): number {
  let n = 0;
  for (const b of sim.bodies.values()) if (pred(b)) { b.tags.add(tag); n++; }
  return n;
}

const dist2 = (a: V3, b: V3) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
const copy = (v: V3): V3 => ({ x: v.x, y: v.y, z: v.z });
const round2 = (v: number) => Math.round(v * 100) / 100;

/** world centre of the body's grid box (valid right after creation, unlike rb.worldCom()) */
function bodyPos(b: VoxelBody): V3 {
  return b.center();
}

/** highest world y of any solid voxel top face (amortised callers) */
export function highestVoxelY(b: VoxelBody): number {
  const g = b.grid;
  if (g.count === 0 || b.removed) return -Infinity;
  if (!b.dynamic && b.identityRot) {
    const t = b.rb.translation();
    for (let y = g.sy - 1; y >= 0; y--) {
      for (let z = 0; z < g.sz; z++) {
        let i = g.sx * (y + g.sy * z);
        for (let x = 0; x < g.sx; x++, i++) if (g.data[i]) return t.y + (y + 1) * 0.1;
      }
    }
    return -Infinity;
  }
  // rotated / dynamic: check the 8 corners of every solid voxel's cell centre (coarse but rare)
  let best = -Infinity;
  for (let z = 0; z < g.sz; z++) for (let y = 0; y < g.sy; y++) for (let x = 0; x < g.sx; x++) {
    if (!g.data[g.idx(x, y, z)]) continue;
    const w = b.toWorld({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    if (w.y + 0.087 > best) best = w.y + 0.087;
  }
  return best;
}

// ------------------------------------------------------------------------------------------ runtime records

interface TargetRec {
  /** objective target id (the <id> in target:<id>) */
  tid: string;
  body: VoxelBody | null;
  bodyId: number;
  name: string;
  start: V3;
  initial: number;
  collected: boolean;
  delivered: boolean;
  inZone: number;
}
interface AlarmBoxRec {
  tid: string;
  body: VoxelBody | null;
  bodyId: number;
  start: V3;
  initial: number;
  /** world points that were solid next to the box at mission start */
  mounts: V3[];
}
interface ValuableRec { body: VoxelBody | null; bodyId: number; name: string; amount: number; taken: boolean }
interface ObjRec {
  def: ObjectiveDef;
  done: boolean;
  count: number;
  need: number;
  progress: number;
  /** destroy / demolish bodies */
  bodies: VoxelBody[];
  bodyIds: number[];
  initial: number;
  /** demolish: start height + current */
  topStart: number;
  top: number;
}

export interface MissionJSON {
  v: 1;
  id: string;
  phase: MissionPhase;
  tick: number;
  alarmTicks: number;
  alarmCause: string;
  removedVoxels: number;
  escapeOpen: boolean;
  failReason: string;
  result: MissionResult | null;
  objectives: { id: string; done: boolean; count: number; need: number; progress: number; initial: number; topStart: number; top: number }[];
  targets: { tid: string; bodyId: number; name: string; start: V3; initial: number; collected: boolean; delivered: boolean }[];
  alarmBoxes: { tid: string; bodyId: number; start: V3; initial: number; mounts: V3[] }[];
  valuables: { bodyId: number; name: string; amount: number; taken: boolean }[];
}

// ------------------------------------------------------------------------------------------ Mission

export class Mission {
  readonly def: MissionDef;
  readonly sim: Sim;
  readonly level: LevelInfo;
  readonly player: MissionPlayer;
  private fireCount: () => number;

  phase: MissionPhase = 'planning';
  /** mission ticks since start */
  tick = 0;
  /** alarm ticks left (meaningful in 'alarm') */
  alarmTicks: number;
  alarmCause = '';
  /** voxels removed before the alarm (demolition sensor) */
  removedVoxels = 0;
  escapeOpen = false;
  failReason = '';
  result: MissionResult | null = null;
  /** what the crosshair is on (updated every tick) */
  focus: MissionFocus | null = null;
  /** cosmetic helicopter (null when not flying) */
  heli: { pos: V3; yaw: number } | null = null;
  /** true when the mission has any alarm source at all */
  readonly hasAlarm: boolean;

  private objs: ObjRec[] = [];
  private targets: TargetRec[] = [];
  private alarmBoxes: AlarmBoxRec[] = [];
  private valuables: ValuableRec[] = [];
  private removedHook: (b: VoxelBody) => void;
  private heliAnnounced = false;

  constructor(def: MissionDef, ctx: MissionContext) {
    this.def = def;
    this.sim = ctx.sim;
    this.level = ctx.level;
    this.player = ctx.player;
    this.fireCount = ctx.fireCount ?? (() => 0);
    this.alarmTicks = this.alarmSecondsTotal * TICKS;
    this.bind();
    this.hasAlarm = this.alarmBoxes.length > 0 || def.fireAlarm != null || def.demolitionSensor != null;
    this.removedHook = (b) => { if (this.phase === 'planning' && b.kind !== 'debris') this.removedVoxels++; };
    this.sim.onRemoved.push(this.removedHook);
    this.sim.out.push({ type: 'custom', name: 'mission:start', data: { id: def.id } });
  }

  get alarmSecondsTotal(): number { return this.def.alarmSeconds ?? 60; }
  /** seconds left on the alarm clock (full length while planning) */
  get timeLeft(): number { return Math.max(0, this.alarmTicks / TICKS); }
  get ended(): boolean { return this.phase === 'success' || this.phase === 'failed'; }
  /** quicksave is only allowed while planning (before the alarm) */
  canQuicksave(): boolean { return this.phase === 'planning'; }

  /** stop listening to the sim (call when the mission is dropped) */
  dispose(): void {
    const i = this.sim.onRemoved.indexOf(this.removedHook);
    if (i >= 0) this.sim.onRemoved.splice(i, 1);
  }

  // ---------------------------------------------------------------- binding level bodies

  private bind(): void {
    const sim = this.sim;
    const bodies = [...sim.bodies.values()].sort((a, b) => a.id - b.id);
    const targetIds = new Set<string>();
    for (const o of this.def.objectives) {
      if (o.kind === 'collect' || o.kind === 'deliver') targetIds.add(o.target ?? o.id);
    }
    for (const b of bodies) {
      for (const t of b.tags) {
        if (t.startsWith('target:')) {
          const tid = t.slice(7);
          if (!targetIds.has(tid)) continue;
          this.targets.push({ tid, body: b, bodyId: b.id, name: b.name || tid, start: bodyPos(b), initial: b.grid.count, collected: false, delivered: false, inZone: 0 });
        } else if (t.startsWith('alarm:')) {
          this.alarmBoxes.push({ tid: t.slice(6), body: b, bodyId: b.id, start: bodyPos(b), initial: b.grid.count, mounts: this.findMounts(b) });
        } else if (t.startsWith('valuable:')) {
          const amount = Math.max(0, Math.round(Number(t.slice(9)) || 0));
          this.valuables.push({ body: b, bodyId: b.id, name: b.name || 'Valuable', amount, taken: false });
        }
      }
    }
    for (const def of this.def.objectives) {
      const rec: ObjRec = { def, done: false, count: 0, need: 0, progress: 0, bodies: [], bodyIds: [], initial: 0, topStart: 0, top: 0 };
      if (def.kind === 'collect' || def.kind === 'deliver') {
        const tid = def.target ?? def.id;
        const n = this.targets.filter((t) => t.tid === tid).length;
        rec.need = Math.max(1, Math.min(n, def.count ?? n));
      } else if (def.kind === 'destroy' || def.kind === 'demolish') {
        const tid = def.target ?? def.id;
        rec.bodies = bodies.filter((b) => b.tags.has('destroy:' + tid) || b.tags.has('target:' + tid));
        rec.bodyIds = rec.bodies.map((b) => b.id);
        rec.initial = rec.bodies.reduce((s, b) => s + b.initialCount, 0);
        if (def.kind === 'demolish') {
          rec.topStart = rec.top = rec.bodies.reduce((m, b) => Math.max(m, highestVoxelY(b)), -Infinity);
        }
        rec.need = 1;
      } else rec.need = 1;
      this.objs.push(rec);
    }
  }

  /** solid points around an alarm box it is mounted on (5 probes per face, half a voxel outside) */
  private findMounts(b: VoxelBody): V3[] {
    const g = b.grid;
    const out: V3[] = [];
    const e = 0.5; // voxel units outside the grid box
    const faces: [number, number, number][] = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
    const size = [g.sx, g.sy, g.sz];
    for (const f of faces) {
      const axis = f[0] ? 0 : f[1] ? 1 : 2;
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      for (const [fu, fv] of [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) {
        const l = [0, 0, 0];
        l[axis] = f[axis] < 0 ? -e : size[axis] + e;
        l[u] = size[u] * fu; l[v] = size[v] * fv;
        const w = b.toWorld({ x: l[0], y: l[1], z: l[2] });
        const s = this.sim.sample(w);
        if (s && s.body !== b) out.push(w);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- per tick

  update(input: MissionInput): void {
    if (this.ended) { this.updateHeli(); return; }
    this.tick++;
    const p = this.player;
    if (p.dead) { this.fail(deathReason(p.lastHurt)); return; }

    // crosshair focus + interact
    this.focus = this.computeFocus();
    let used = false;
    if (input.interact && this.focus && this.focus.kind !== 'escape') { this.interact(); used = true; }

    this.refreshBodies();
    this.updateObjectives();
    if (this.phase === 'planning' && this.hasAlarm) this.checkAlarm();

    if (this.phase === 'alarm') {
      const before = Math.ceil(this.alarmTicks / TICKS);
      this.alarmTicks--;
      const after = Math.ceil(this.alarmTicks / TICKS);
      if (after !== before && this.alarmTicks > 0) this.emit('mission:second', { left: after });
      this.updateHeli();
      if (this.alarmTicks <= 0) { this.alarmTicks = 0; this.fail('Security arrived before you clocked out.'); return; }
    }

    // escape
    if (!this.escapeOpen && this.objs.every((o) => o.done || !isRequired(o.def))) {
      this.escapeOpen = true;
      this.emit('mission:escapeOpen', {});
    }
    if (this.escapeOpen) {
      const near = this.atEscape();
      if (near && !this.focus) this.focus = { kind: 'escape', name: 'escape' };
      const vb = input.vehicleBody;
      const seatedInEscape = (p.seated && near && bodiesWithTag(this.sim, 'escape').length > 0) || (!!vb && !vb.removed && vb.tags.has('escape'));
      if (seatedInEscape || (near && input.interact && !used)) this.succeed();
    }
  }

  private computeFocus(): MissionFocus | null {
    const p = this.player;
    if (p.seated) return null;
    const hit = this.sim.raycast(p.eye, p.forward, INTERACT_RANGE);
    if (!hit) return null;
    const b = hit.body;
    const t = this.targets.find((r) => r.body === b && !r.collected);
    if (t && this.isCollectTarget(t.tid)) return { kind: 'target', name: t.name, required: this.targetRequired(t.tid) };
    const v = this.valuables.find((r) => r.body === b && !r.taken);
    if (v) return { kind: 'valuable', name: v.name, amount: v.amount };
    return null;
  }

  private isCollectTarget(tid: string): boolean {
    return this.objs.some((o) => o.def.kind === 'collect' && (o.def.target ?? o.def.id) === tid && !o.done);
  }
  private targetRequired(tid: string): boolean {
    return this.objs.some((o) => (o.def.kind === 'collect' || o.def.kind === 'deliver') && (o.def.target ?? o.def.id) === tid && isRequired(o.def));
  }

  private interact(): void {
    const p = this.player;
    const hit = this.sim.raycast(p.eye, p.forward, INTERACT_RANGE);
    if (!hit) return;
    const t = this.targets.find((r) => r.body === hit.body && !r.collected);
    if (t && this.isCollectTarget(t.tid)) {
      t.collected = true;
      this.sim.removeBody(hit.body);
      t.body = null;
      const o = this.objs.find((r) => r.def.kind === 'collect' && (r.def.target ?? r.def.id) === t.tid)!;
      this.emit('mission:target', { id: t.tid, title: t.name, required: isRequired(o.def) });
      if (this.phase === 'planning' && this.isAlarmed(t.tid)) this.triggerAlarm('target');
      return;
    }
    const v = this.valuables.find((r) => r.body === hit.body && !r.taken);
    if (v) {
      v.taken = true;
      this.sim.removeBody(hit.body);
      v.body = null;
      this.emit('mission:pickup', { amount: v.amount, name: v.name });
    }
  }

  private isAlarmed(tid: string): boolean { return this.alarmBoxes.some((a) => a.tid === tid); }

  /** drop references to removed bodies */
  private refreshBodies(): void {
    for (const t of this.targets) if (t.body && t.body.removed) t.body = null;
    for (const a of this.alarmBoxes) if (a.body && a.body.removed) a.body = null;
    for (const v of this.valuables) if (v.body && v.body.removed) { v.body = null; }
  }

  private updateObjectives(): void {
    for (let i = 0; i < this.objs.length; i++) {
      const o = this.objs[i];
      if (o.done) continue;
      const d = o.def;
      switch (d.kind) {
        case 'collect': {
          const tid = d.target ?? d.id;
          o.count = this.targets.filter((t) => t.tid === tid && t.collected).length;
          break;
        }
        case 'deliver': {
          const tid = d.target ?? d.id;
          for (const t of this.targets) {
            if (t.tid !== tid || t.delivered || !t.body) continue;
            if (this.inZone(d.zone, bodyPos(t.body))) {
              if (++t.inZone >= TICKS / 2) t.delivered = true;
            } else t.inZone = 0;
          }
          o.count = this.targets.filter((t) => t.tid === tid && t.delivered).length;
          break;
        }
        case 'destroy': {
          let cur = 0;
          for (const b of o.bodies) if (!b.removed) cur += b.grid.count;
          o.progress = o.initial > 0 ? 1 - cur / o.initial : 1;
          if (o.progress * 100 >= d.percent - 1e-9) o.done = true;
          break;
        }
        case 'demolish': {
          // amortised: each demolish objective re-scans every 20 ticks, staggered
          if ((this.tick + i * 7) % 20 === 0 || this.tick === 1) {
            o.top = o.bodies.reduce((m, b) => Math.max(m, highestVoxelY(b)), -Infinity);
            const span = o.topStart - d.height;
            o.progress = span > 0 ? Math.min(1, Math.max(0, (o.topStart - o.top) / span)) : 1;
            if (o.top <= d.height + 1e-6) o.done = true;
          }
          break;
        }
        case 'reach': {
          if (this.inZone(d.zone, this.player.pos) || this.inZone(d.zone, this.player.eye)) o.count = 1;
          break;
        }
      }
      if (d.kind === 'collect' || d.kind === 'deliver' || d.kind === 'reach') {
        o.progress = o.need > 0 ? Math.min(1, o.count / o.need) : 1;
        if (o.count >= o.need) o.done = true;
      }
      if (o.done) {
        o.progress = 1;
        this.emit('mission:objective', { id: d.id, title: d.title });
      }
    }
  }

  private checkAlarm(): void {
    // tampered targets
    for (const t of this.targets) {
      if (!this.isAlarmed(t.tid)) continue;
      const b = t.body;
      if (!b) { this.triggerAlarm('target'); return; }
      if (b.grid.count < t.initial || (b.dynamic && dist2(bodyPos(b), t.start) > TAMPER_MOVE * TAMPER_MOVE)) { this.triggerAlarm('target'); return; }
    }
    // destroy-objective targets wired to alarms (explosion sensors)
    for (const o of this.objs) {
      if (o.def.kind !== 'destroy' && o.def.kind !== 'demolish') continue;
      if (!this.isAlarmed(o.def.target ?? o.def.id)) continue;
      let cur = 0;
      for (const b of o.bodies) if (!b.removed) cur += b.grid.count;
      if (cur < o.initial) { this.triggerAlarm('target'); return; }
    }
    // alarm boxes
    for (const a of this.alarmBoxes) {
      const b = a.body;
      if (!b || b.grid.count < a.initial) { this.triggerAlarm('alarmbox'); return; }
      if (b.dynamic && dist2(bodyPos(b), a.start) > 0.01) { this.triggerAlarm('alarmbox'); return; }
      if (a.mounts.length && (this.tick + a.bodyId) % 10 === 0) {
        let held = false;
        for (const m of a.mounts) { const s = this.sim.sample(m); if (s && s.body !== b) { held = true; break; } }
        if (!held) { this.triggerAlarm('alarmbox'); return; }
      }
    }
    if (this.def.fireAlarm != null && this.tick % 15 === 0 && this.fireCount() >= this.def.fireAlarm) { this.triggerAlarm('fire'); return; }
    if (this.def.demolitionSensor != null && this.removedVoxels > this.def.demolitionSensor) { this.triggerAlarm('demolition'); return; }
  }

  /** start the countdown (no-op unless planning) */
  triggerAlarm(cause: string): void {
    if (this.phase !== 'planning') return;
    this.phase = 'alarm';
    this.alarmCause = cause;
    this.alarmTicks = this.alarmSecondsTotal * TICKS;
    this.emit('mission:alarm', { seconds: this.alarmSecondsTotal, cause });
  }

  // ---------------------------------------------------------------- zones / escape

  /** resolve a zone's centre (null when its anchor does not exist) */
  zoneCenter(z: ZoneDef): V3 | null {
    let c: V3 | null = null;
    if (z.bodyTag) {
      const b = bodiesWithTag(this.sim, z.bodyTag)[0];
      if (b) c = b.center();
    } else if (z.marker) {
      const m = this.level.markers[z.marker];
      if (m) c = copy(m);
    } else if (z.zone) {
      const lz = this.level.zones?.[z.zone];
      if (lz) c = 'center' in lz ? copy(lz.center) : { x: (lz.min.x + lz.max.x) / 2, y: (lz.min.y + lz.max.y) / 2, z: (lz.min.z + lz.max.z) / 2 };
    } else if (z.at) c = copy(z.at);
    if (c && z.offset) { c.x += z.offset.x; c.y += z.offset.y; c.z += z.offset.z; }
    return c;
  }

  inZone(z: ZoneDef, p: V3): boolean {
    if (z.water) {
      const w = this.level.waterLevel;
      if (w == null || p.y >= w) return false;
      if (!z.marker && !z.zone && !z.at && !z.bodyTag) return true;
    }
    if (z.zone && !z.half && z.radius == null) {
      const lz = this.level.zones?.[z.zone];
      if (lz && 'min' in lz) return p.x >= lz.min.x && p.x <= lz.max.x && p.y >= lz.min.y && p.y <= lz.max.y && p.z >= lz.min.z && p.z <= lz.max.z;
      if (lz && 'radius' in lz) return dist2(p, lz.center) <= lz.radius * lz.radius;
    }
    const c = this.zoneCenter(z);
    if (!c) return false;
    if (z.half) return Math.abs(p.x - c.x) <= z.half.x && Math.abs(p.y - c.y) <= z.half.y && Math.abs(p.z - c.z) <= z.half.z;
    const r = z.radius ?? 3;
    return dist2(p, c) <= r * r;
  }

  /** the escape zone definition in effect */
  escapeZone(): ZoneDef {
    if (this.def.escape) return this.def.escape;
    if (bodiesWithTag(this.sim, 'escape').length) return { bodyTag: 'escape', radius: ESCAPE_RADIUS };
    if (this.level.markers.escape) return { marker: 'escape', radius: ESCAPE_RADIUS };
    return { at: this.level.spawn, radius: ESCAPE_RADIUS };
  }
  /** world position of the escape point */
  escapePos(): V3 { return this.zoneCenter(this.escapeZone()) ?? copy(this.level.spawn); }

  private atEscape(): boolean {
    const z = this.escapeZone();
    const c = this.zoneCenter(z);
    if (!c) return false;
    const r = z.radius ?? ESCAPE_RADIUS;
    // horizontal distance + generous vertical tolerance (van roofs, ramps)
    const p = this.player.pos;
    return (p.x - c.x) ** 2 + (p.z - c.z) ** 2 <= r * r && Math.abs(p.y - c.y) < r + 2;
  }

  // ---------------------------------------------------------------- helicopter

  /** helicopter start point */
  heliStartPos(): V3 {
    const m = this.level.markers[this.def.heliStart ?? 'heli_start'];
    if (m) return copy(m);
    const e = this.escapePos();
    const b = this.level.bounds;
    return { x: b.min.x - 40, y: e.y + 35, z: b.max.z + 40 };
  }

  private updateHeli(): void {
    if (this.phase === 'failed' && this.heli) return; // hovers where it arrived
    if (this.phase !== 'alarm') { if (this.phase !== 'failed') this.heli = null; return; }
    const left = this.alarmTicks / TICKS;
    if (left > HELI_SECONDS) { this.heli = null; return; }
    const a = this.heliStartPos();
    const e = this.escapePos();
    const b = { x: e.x, y: e.y + 14, z: e.z };
    const t = Math.min(1, Math.max(0, 1 - left / HELI_SECONDS));
    const s = 1 - (1 - t) * (1 - t) * 0.6 - 0.4 * (1 - t); // fast in, slowing toward the target
    const k = Math.min(1, Math.max(0, s));
    const pos = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
    const dx = b.x - a.x, dz = b.z - a.z;
    this.heli = { pos, yaw: Math.atan2(-dx, -dz) };
    if (!this.heliAnnounced) { this.heliAnnounced = true; this.emit('mission:heli', { pos: copy(pos) }); }
  }

  // ---------------------------------------------------------------- end

  private succeed(): void {
    if (this.ended) return;
    this.phase = 'success';
    this.result = this.makeResult(true);
    this.focus = null;
    this.emit('mission:success', { result: this.result });
  }

  fail(reason: string): void {
    if (this.ended) return;
    this.phase = 'failed';
    this.failReason = reason;
    this.result = this.makeResult(false, reason);
    this.focus = null;
    this.emit('mission:fail', { reason });
  }

  private makeResult(success: boolean, reason?: string): MissionResult {
    const breakdown: { label: string; points: number }[] = [];
    let score = 0;
    for (const o of this.objs) {
      if (!o.done) continue;
      const pts = pointsOf(o.def);
      breakdown.push({ label: (isRequired(o.def) ? '' : 'Bonus: ') + o.def.title, points: pts });
      score += pts;
    }
    const per = this.def.timeBonusPerSecond ?? 2;
    let timeBonus = 0;
    if (success && this.hasAlarm) timeBonus = Math.floor(this.alarmCause ? this.timeLeft : this.alarmSecondsTotal) * per;
    if (timeBonus > 0) { breakdown.push({ label: this.alarmCause ? 'Time left on the clock' : 'Silent job (alarm never tripped)', points: timeBonus }); score += timeBonus; }
    if (success && this.def.reward?.score) { breakdown.push({ label: 'Client bonus', points: this.def.reward.score }); score += this.def.reward.score; }
    const valuables = this.valuables.filter((v) => v.taken).map((v) => ({ name: v.name, amount: v.amount }));
    const cash = success ? valuables.reduce((s, v) => s + v.amount, 0) + (this.def.reward?.cash ?? 0) : 0;
    return {
      missionId: this.def.id, success, reason, score: success ? score : 0, breakdown, cash, valuables,
      alarmTriggered: !!this.alarmCause, timeLeft: this.alarmCause ? round2(this.timeLeft) : null, time: round2(this.tick * DT),
    };
  }

  // ---------------------------------------------------------------- queries for HUD / map

  objectives(): ObjectiveState[] {
    return this.objs.map((o) => {
      const d = o.def;
      let detail = '';
      if ((d.kind === 'collect' || d.kind === 'deliver') && o.need > 1) detail = `${o.count}/${o.need}`;
      else if (d.kind === 'destroy') detail = `${Math.min(100, Math.floor(o.progress * 100))}% / ${d.percent}%`;
      else if (d.kind === 'demolish' && !o.done && isFinite(o.top)) detail = `${o.top.toFixed(1)} m → ${d.height.toFixed(1)} m`;
      return { id: d.id, title: d.title, kind: d.kind, required: isRequired(d), points: pointsOf(d), done: o.done, progress: o.progress, count: o.count, need: o.need, detail };
    });
  }

  /** map / HUD markers: remaining targets with world positions */
  markers(): { kind: 'target' | 'valuable' | 'alarm' | 'zone'; name: string; pos: V3; required: boolean; done: boolean }[] {
    const out: { kind: 'target' | 'valuable' | 'alarm' | 'zone'; name: string; pos: V3; required: boolean; done: boolean }[] = [];
    for (const t of this.targets) {
      if (!t.body || t.collected) continue;
      out.push({ kind: 'target', name: t.name, pos: bodyPos(t.body), required: this.targetRequired(t.tid), done: t.delivered });
    }
    for (const o of this.objs) {
      const d = o.def;
      if (d.kind === 'destroy' || d.kind === 'demolish') {
        for (const b of o.bodies) if (!b.removed) out.push({ kind: 'target', name: d.title, pos: b.center(), required: isRequired(d), done: o.done });
      } else if (d.kind === 'reach' || d.kind === 'deliver') {
        const c = this.zoneCenter(d.zone);
        if (c) out.push({ kind: 'zone', name: d.title, pos: c, required: isRequired(d), done: o.done });
      }
    }
    for (const a of this.alarmBoxes) if (a.body) out.push({ kind: 'alarm', name: 'Alarm box', pos: a.body.center(), required: false, done: false });
    return out;
  }

  /** alarm wires: alarm box centre -> wired target centre (cosmetic) */
  wires(): { from: V3; to: V3 }[] {
    const out: { from: V3; to: V3 }[] = [];
    for (const a of this.alarmBoxes) {
      if (!a.body) continue;
      for (const t of this.targets) if (t.tid === a.tid && t.body) out.push({ from: a.body.center(), to: bodyPos(t.body) });
    }
    return out;
  }

  /** cash picked up so far this mission */
  get cash(): number { return this.valuables.reduce((s, v) => s + (v.taken ? v.amount : 0), 0); }
  /** score of the objectives completed so far (no time bonus) */
  get score(): number { return this.objs.reduce((s, o) => s + (o.done ? pointsOf(o.def) : 0), 0); }

  private emit(name: string, data: any): void {
    this.sim.out.push({ type: 'custom', name, data });
  }

  // ---------------------------------------------------------------- serialisation

  toJSON(): MissionJSON {
    return {
      v: 1, id: this.def.id, phase: this.phase, tick: this.tick, alarmTicks: this.alarmTicks, alarmCause: this.alarmCause,
      removedVoxels: this.removedVoxels, escapeOpen: this.escapeOpen, failReason: this.failReason,
      result: this.result ? JSON.parse(JSON.stringify(this.result)) : null,
      objectives: this.objs.map((o) => ({ id: o.def.id, done: o.done, count: o.count, need: o.need, progress: o.progress, initial: o.initial, topStart: isFinite(o.topStart) ? o.topStart : -1e9, top: isFinite(o.top) ? o.top : -1e9 })),
      targets: this.targets.map((t) => ({ tid: t.tid, bodyId: t.bodyId, name: t.name, start: copy(t.start), initial: t.initial, collected: t.collected, delivered: t.delivered })),
      alarmBoxes: this.alarmBoxes.map((a) => ({ tid: a.tid, bodyId: a.bodyId, start: copy(a.start), initial: a.initial, mounts: a.mounts.map(copy) })),
      valuables: this.valuables.map((v) => ({ bodyId: v.bodyId, name: v.name, amount: v.amount, taken: v.taken })),
    };
  }

  /**
   * Rebuild a mission from `toJSON()` output against a sim that is in the matching state
   * (bodies are re-bound by id; records of bodies that no longer exist are kept as gone).
   * Does NOT run `def.setup` and emits no start event side effects beyond 'mission:start'.
   */
  static fromJSON(def: MissionDef, json: MissionJSON, ctx: MissionContext): Mission {
    if (!json || json.v !== 1 || json.id !== def.id) throw new Error('mission json does not match ' + def.id);
    const m = new Mission(def, ctx);
    m.phase = json.phase; m.tick = json.tick; m.alarmTicks = json.alarmTicks; m.alarmCause = json.alarmCause;
    m.removedVoxels = json.removedVoxels; m.escapeOpen = json.escapeOpen; m.failReason = json.failReason; m.result = json.result;
    const live = (id: number) => { const b = ctx.sim.bodies.get(id); return b && !b.removed ? b : null; };
    m.targets = json.targets.map((t) => ({ ...t, start: copy(t.start), body: t.collected ? null : live(t.bodyId), inZone: 0 }));
    m.alarmBoxes = json.alarmBoxes.map((a) => ({ ...a, start: copy(a.start), mounts: a.mounts.map(copy), body: live(a.bodyId) }));
    m.valuables = json.valuables.map((v) => ({ ...v, body: v.taken ? null : live(v.bodyId) }));
    for (const s of json.objectives) {
      const o = m.objs.find((r) => r.def.id === s.id);
      if (!o) continue;
      o.done = s.done; o.count = s.count; o.need = s.need; o.progress = s.progress; o.initial = s.initial;
      o.topStart = s.topStart; o.top = s.top;
    }
    return m;
  }
}

// ------------------------------------------------------------------------------------------ misc

export function isRequired(d: ObjectiveDef): boolean { return d.required !== false; }
export function pointsOf(d: ObjectiveDef): number { return d.points ?? (isRequired(d) ? 100 : 50); }
/** maximum achievable score of a mission (all objectives + full time bonus + client bonus) */
export function maxScore(def: MissionDef, hasAlarm = true): number {
  let s = def.objectives.reduce((a, o) => a + pointsOf(o), 0) + (def.reward?.score ?? 0);
  if (hasAlarm) s += (def.alarmSeconds ?? 60) * (def.timeBonusPerSecond ?? 2);
  return s;
}

export function deathReason(cause = ''): string {
  switch (cause) {
    case 'explosion': return 'You were inside your own blast radius. Read the label next time.';
    case 'fall': return 'Gravity filed a complaint. You lost.';
    case 'fire': return 'You got a little too close to the warm part of the job.';
    case 'crush': return 'Something heavy came down on the contractor.';
    case 'water': return 'The harbour kept you.';
    default: return 'You were flattened on the job.';
  }
}
