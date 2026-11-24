/**
 * Headless play harness for scripted mission playthroughs (tests/unit/playthrough.test.ts).
 *
 * Mirrors what Game.fixedStep + the vehicle / mission modules do every tick, without DOM or three.js:
 *   player.update -> ToolBelt.update (tool input edges) -> vehicle seat + input -> Mission.update -> sim.step
 *   -> drone sightings raise the alarm (MissionModule.onEvents).
 * The belt gets the career unlocks of `careerScore(def)` via Progress.applyToBelt (no cash upgrades).
 *
 * Honest-play helpers (`walk`, `drive`, `aim`, `fire`, `take`) only use controller input; `tp` (teleport)
 * throws once the alarm is running, so a playthrough cannot cheat the countdown.
 */
import { MISSIONS, missionById } from '../../src/game/missions';
import { Progress } from '../../src/game/progress';
import type { VoxelBody } from '../../src/sim/body';
import { DroneSystem } from '../../src/sim/drones';
import { FireSystem } from '../../src/sim/fire';
import { LEVELS } from '../../src/game/levels';
import type { LevelInfo } from '../../src/sim/levels/types';
import { Mission, maxScore, type MissionDef } from '../../src/sim/mission';
import { EYE_OFFSET, Player } from '../../src/sim/player';
import { Sim, type SimEvent } from '../../src/sim/sim';
import { createBelt, createTools, emptyToolInput, type Tool, type ToolBelt, type ToolContext } from '../../src/sim/tools';
import type { V3 } from '../../src/sim/vec';
import { VehicleSystem, type Vehicle } from '../../src/sim/vehicle';
import { WaterSystem } from '../../src/sim/water';

// ------------------------------------------------------------------------------------------ progression

/** every mission that must be completed before `id` can be played (transitive unlockAfter, plus the tutorial) */
export function prerequisites(id: string): string[] {
  const out = new Set<string>(['housewarming']);
  const visit = (m: string) => {
    for (const p of missionById(m)?.unlockAfter ?? []) if (!out.has(p)) { out.add(p); visit(p); }
  };
  visit(id);
  out.delete(id);
  return [...out];
}

/**
 * Score of a "typical" completion: required objectives + client bonus + 10 s left on the clock
 * (missions with an alarm). Optional objectives are not counted, so this is a conservative career.
 */
export function typicalScore(def: MissionDef): number {
  let s = def.objectives.reduce((a, o) => a + (o.required === false ? 0 : (o.points ?? 100)), 0) + (def.reward?.score ?? 0);
  if (def.alarmSeconds != null || def.fireAlarm != null || def.demolitionSensor != null) s += 10 * (def.timeBonusPerSecond ?? 2);
  return s;
}

/** career score of a player who completed exactly the prerequisites of `id` */
export function careerScore(id: string): number {
  return prerequisites(id).reduce((s, m) => s + typicalScore(missionById(m)!), 0);
}

export { maxScore, MISSIONS };

// ------------------------------------------------------------------------------------------ harness

const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });
const hdist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface WalkOpts {
  /** arrival radius at the last point (horizontal, m) */
  r?: number;
  /** arrival radius at intermediate points */
  rMid?: number;
  sprint?: boolean;
  crouch?: boolean;
  /** give up after this many ticks (throws) */
  max?: number;
  /** keep the pitch while walking */
  pitch?: number;
  /** max yaw change per tick (rad); default: face the waypoint at once */
  turnRate?: number;
}

export class Run {
  readonly sim: Sim;
  readonly lv: LevelInfo;
  readonly player: Player;
  readonly belt: ToolBelt;
  readonly mission: Mission;
  readonly fire: FireSystem;
  readonly drones: DroneSystem;
  readonly vehicles: VehicleSystem;
  readonly def: MissionDef;
  readonly score: number;
  /** vehicle the player sits in */
  car: Vehicle | null = null;
  /** held mouse buttons */
  lmb = false;
  rmb = false;
  private prevL = false;
  private prevR = false;
  private interactNext = false;
  private scrollNext = 0;
  /** tool ids that were fired at least once */
  readonly used = new Set<string>();
  readonly events: SimEvent[] = [];
  /** tick when the alarm started (mission ticks) */
  alarmAt = -1;
  verbose = false;

  constructor(id: string, opts: { score?: number } = {}) {
    const def = missionById(id);
    if (!def) throw new Error('no mission ' + id);
    this.def = def;
    const sim = (this.sim = new Sim(def.seed ?? 1234));
    this.fire = new FireSystem(sim);
    sim.systems.push(this.fire);
    this.drones = new DroneSystem(sim);
    sim.ext.drones = this.drones;
    sim.systems.push(this.drones);
    const lv = (this.lv = LEVELS[def.levelId].build(sim));
    if (lv.waterLevel != null) {
      sim.waterLevel = lv.waterLevel;
      sim.systems.push(new WaterSystem(lv.waterLevel));
    }
    this.player = new Player(sim, lv.spawn);
    this.player.yaw = lv.spawnYaw;
    this.belt = createBelt();
    this.vehicles = VehicleSystem.of(sim);
    this.vehicles.waterLevel = lv.waterLevel;
    this.fire.waterLevel = lv.waterLevel;
    def.setup?.(sim, lv);
    this.mission = new Mission(def, { sim, level: lv, player: this.player, fireCount: () => this.fire.count() });
    this.score = opts.score ?? careerScore(id);
    const base = new Map<string, number>();
    for (const t of createTools()) base.set(t.id, t.maxAmmo);
    const prog = new Progress(null);
    // a career with exactly this score (one fake record) -> rank unlocks, no upgrades
    prog.data.missions.__career = { best: this.score, completed: true, plays: 1 };
    prog.applyToBelt(this.belt, base, { mission: def });
    sim.step();
    sim.drainEvents();
  }

  get ctx(): ToolContext { return { sim: this.sim, player: this.player, infiniteAmmo: false, fire: this.fire }; }
  get phase() { return this.mission.phase; }
  get t(): number { return this.mission.tick / 60; }
  get left(): number { return this.mission.timeLeft; }
  get planning(): boolean { return this.mission.phase === 'planning'; }
  unlocked(id: string): boolean { return !!this.belt.byId(id)?.unlocked; }
  tool(id: string): Tool { return this.belt.byId(id)!; }

  log(...a: any[]): void { if (this.verbose || process.env.PLAY_LOG) console.log(`[${this.def.id} t=${this.t.toFixed(1)} ${this.phase}${this.phase === 'alarm' ? ' ' + this.left.toFixed(1) : ''}]`, ...a); }

  // ---------------------------------------------------------------- ticking

  /** one fixed tick, the same order as Game.fixedStep */
  tick(): void {
    const p = this.player;
    p.update();
    const ti = emptyToolInput();
    const ctl = !p.dead;
    const L = ctl && this.lmb, R = ctl && this.rmb;
    ti.primary = L; ti.secondary = R;
    ti.primaryPressed = L && !this.prevL; ti.primaryReleased = !L && this.prevL;
    ti.secondaryPressed = R && !this.prevR;
    ti.scroll = this.scrollNext; this.scrollNext = 0;
    ti.interactPressed = this.interactNext;
    this.prevL = L; this.prevR = R;
    if (ti.primaryPressed && !this.belt.grab.holding && !p.seated) this.used.add(this.belt.current.id);
    this.belt.update(this.ctx, ti, ctl && !p.seated);
    // vehicle module
    if (this.car) {
      if (this.car.removed || p.dead || this.car.drowned) this.exitCar();
      else this.followSeat();
    }
    const interact = this.interactNext && !p.seated;
    this.interactNext = false;
    const m = this.mission;
    const before = m.phase;
    m.update({ interact, vehicleBody: this.car?.body ?? null });
    this.sim.step();
    const ev = this.sim.drainEvents();
    for (const e of ev) if (e.type === 'custom' && (e.name.startsWith('mission:') || e.name.startsWith('drone:alarm'))) this.events.push(e);
    if (m.phase === 'planning') for (const e of ev) if (e.type === 'custom' && e.name === 'drone:alarm') { m.triggerAlarm('drone'); break; }
    if (this.car && !this.car.removed && p.seated) this.followSeat();
    if (before === 'planning' && m.phase === 'alarm') { this.alarmAt = m.tick; this.log('ALARM', m.alarmCause); }
  }

  /** run n ticks (stops early when the mission ended) */
  step(n = 1, each?: (i: number) => boolean | void): void {
    for (let i = 0; i < n; i++) {
      this.tick();
      if (this.mission.ended) return;
      if (each && each(i) === true) return;
    }
  }
  wait(seconds: number): void { this.step(Math.round(seconds * 60)); }

  // ---------------------------------------------------------------- planning-only helpers

  /** teleport (feet) — planning phase only */
  tp(feet: V3, yaw?: number): void {
    if (!this.planning) throw new Error(`teleport after the alarm (t=${this.t.toFixed(1)})`);
    if (this.car) this.exitCar();
    this.player.teleport({ x: feet.x, y: feet.y + 0.1, z: feet.z });
    if (yaw != null) this.player.yaw = yaw;
    this.step(6);
  }

  // ---------------------------------------------------------------- honest controls

  /** look from the eye toward a world point */
  aim(target: V3): void {
    const e = this.player.eye;
    const dx = target.x - e.x, dy = target.y - e.y, dz = target.z - e.z;
    this.player.yaw = Math.atan2(-dx, -dz);
    this.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  select(id: string): void {
    const i = this.belt.tools.findIndex((t) => t.id === id);
    if (i < 0 || !this.belt.tools[i].unlocked) throw new Error(`tool ${id} not unlocked at career score ${this.score}`);
    this.belt.select(this.ctx, i);
  }
  /** press E for one tick */
  pressE(): void { this.interactNext = true; this.tick(); }
  /** click LMB once (press + release) with the current tool */
  click(holdTicks = 1): void {
    this.lmb = true; this.step(holdTicks); this.lmb = false; this.step(1);
  }
  /** hold LMB for n ticks */
  hold(n: number, each?: (i: number) => boolean | void): void {
    this.lmb = true; this.step(n, each); this.lmb = false; this.step(1);
  }

  /** walk (real input) through waypoints; throws when stuck for `max` ticks */
  walk(points: V3[] | V3, o: WalkOpts = {}): void {
    const pts = Array.isArray(points) ? points : [points];
    const p = this.player;
    for (let k = 0; k < pts.length; k++) {
      const wp = pts[k];
      const last = k === pts.length - 1;
      const r = last ? (o.r ?? 0.5) : (o.rMid ?? 0.7);
      const max = o.max ?? 60 * 30;
      let best = Infinity, sinceBest = 0, jumpCd = 0;
      for (let i = 0; ; i++) {
        const pos = p.pos;
        const d = hdist(pos, wp);
        if (d < r) break;
        if (this.mission.ended) {
          if (this.mission.phase === 'failed') throw new Error(`${this.def.id}: failed (${this.mission.failReason}) while walking to ${JSON.stringify(wp)} at ${JSON.stringify(roundV(pos))}`);
          return;
        }
        if (i > max) throw new Error(`${this.def.id}: stuck walking to ${JSON.stringify(wp)} at ${JSON.stringify(roundV(pos))} (t=${this.t.toFixed(1)})`);
        const want = Math.atan2(-(wp.x - pos.x), -(wp.z - pos.z));
        if (o.turnRate) p.yaw += Math.max(-o.turnRate, Math.min(o.turnRate, wrap(want - p.yaw)));
        else p.yaw = want;
        if (o.pitch != null) p.pitch = o.pitch;
        p.input.moveZ = d < 0.6 ? Math.max(0.3, d) : 1;
        p.input.moveX = 0;
        p.input.sprint = o.sprint !== false;
        p.input.crouch = !!o.crouch;
        if (d < best - 0.05) { best = d; sinceBest = 0; } else sinceBest++;
        p.input.jump = false;
        if (jumpCd > 0) jumpCd--;
        else if (sinceBest > 20 && p.grounded) { p.input.jump = true; jumpCd = 40; sinceBest = 0; }
        this.tick();
        if (process.env.WALK_LOG && i % 15 === 0) this.log('walk', k, roundV(p.pos), 'hp', p.health.toFixed(2), p.grounded ? 'g' : 'air', 'vy', p.vel.y.toFixed(1));
      }
    }
    this.stop();
  }
  stop(): void {
    const i = this.player.input;
    i.moveX = 0; i.moveZ = 0; i.jump = false; i.sprint = false;
  }

  /** walk to a body, look at it and press E (collect / pocket) */
  take(body: VoxelBody, approach?: V3): void {
    const c = body.center();
    if (approach) this.walk(approach, { r: 0.35 });
    const p = this.player;
    for (let i = 0; i < 3; i++) {
      this.aim(c);
      this.tick();
      if (this.mission.focus) break;
    }
    if (!this.mission.focus) throw new Error(`${this.def.id}: nothing to take at ${JSON.stringify(roundV(c))} from ${JSON.stringify(roundV(p.pos))} (dist ${hdist(c, p.pos).toFixed(2)})`);
    this.pressE();
    this.log('took', body.name);
  }

  /** hold RMB on a body until the grabber has it (stand within 3 m, it is aimed at) */
  grab(body: VoxelBody): void {
    for (let i = 0; i < 20; i++) {
      this.aim(body.rb.worldCom());
      this.rmb = true;
      this.tick();
      if (this.belt.grab.body === body) return;
    }
    throw new Error(`${this.def.id}: could not grab ${body.name} from ${JSON.stringify(roundV(this.player.pos))} (dist ${hdist(this.player.pos, body.center()).toFixed(2)})`);
  }
  /** carry the held body along a route (RMB stays down), then throw it (LMB) toward `throwAt` */
  carry(route: V3[], throwAt?: V3, o: WalkOpts = {}): void {
    const body = this.belt.grab.body;
    if (!body) throw new Error('not holding anything');
    // turn toward the first waypoint gradually so the held body swings around with the view
    const p = this.player;
    const f = route[0];
    const want = Math.atan2(-(f.x - p.pos.x), -(f.z - p.pos.z));
    for (let i = 0; i < 90; i++) {
      const d = wrap(want - p.yaw);
      if (Math.abs(d) < 0.05) break;
      p.yaw += Math.sign(d) * Math.min(Math.abs(d), 0.07);
      p.pitch += (-0.35 - p.pitch) * 0.2;
      this.tick();
    }
    const t0 = this.mission.tick;
    let k = 0;
    for (const wp of route) {
      this.walk([wp], { pitch: -0.35, sprint: false, turnRate: 0.05, ...o, r: o.rMid ?? 0.7 });
      if (process.env.PLAY_LOG) this.log(`carry wp${k++}`, roundV(this.player.pos), 'body', body.removed ? 'GONE' : roundV(body.center()), this.belt.grab.body === body ? 'held' : 'DROPPED', 'hp', this.player.health.toFixed(2), 'fires', this.fire.count(), this.fire.positions(3).map((q) => roundV(q)));
      if (this.belt.grab.body !== body) break;
    }
    void t0;
    if (this.belt.grab.body !== body) throw new Error(`${this.def.id}: dropped ${body.name} on the way at ${JSON.stringify(roundV(this.player.pos))}, it is at ${body.removed ? 'removed' : JSON.stringify(roundV(body.center()))}`);
    if (throwAt) {
      this.aim(throwAt);
      this.step(4);
      this.click();
    }
    this.rmb = false;
    this.tick();
  }

  // ---------------------------------------------------------------- vehicles

  /** enter a vehicle the player stands next to (E) */
  enter(v: Vehicle): void {
    const d = hdist(this.player.pos, v.com);
    if (d > 4) throw new Error(`${this.def.id}: too far from ${v.name} to get in (${d.toFixed(1)} m)`);
    this.car = v;
    v.seated = true;
    v.startEngine();
    this.player.setSeated(true);
    this.followSeat();
    this.tick();
  }
  exitCar(): void {
    const v = this.car;
    if (!v) return;
    this.car = null;
    v.seated = false;
    v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = false;
    v.stopEngine();
    const p = this.player;
    p.setSeated(false);
    if (!v.removed) {
      const c = v.com;
      const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
      const half = (v.body.grid.sx * 0.1) / 2 + 0.6;
      p.teleport({ x: c.x - fz * half, y: c.y + 0.2, z: c.z + fx * half });
      p.yaw = v.yaw;
    }
    p.pitch = 0;
  }
  private followSeat(): void {
    const v = this.car;
    if (!v || v.removed) return;
    const s = v.seatWorld();
    const p = this.player;
    p.teleport({ x: s.x, y: s.y - (p.height - EYE_OFFSET), z: s.z });
  }

  /**
   * Drive through waypoints with a simple pursuit driver: steer toward the next point, throttle with
   * a speed cap that drops before sharp turns, brake when too fast. Returns stats.
   */
  drive(points: V3[], o: { cap?: number; r?: number; max?: number; reverse?: boolean; log?: boolean } = {}): DriveStats {
    const v = this.car;
    if (!v) throw new Error('not in a vehicle');
    return driveRoute(v, points, () => this.tick(), () => this.mission.ended, o);
  }

  // ---------------------------------------------------------------- queries

  bodies(pred: (b: VoxelBody) => boolean): VoxelBody[] {
    return [...this.sim.bodies.values()].filter((b) => !b.removed && pred(b)).sort((a, b) => a.id - b.id);
  }
  tagged(tag: string): VoxelBody[] { return this.bodies((b) => b.tags.has(tag)); }
  vehicle(id: string, near?: V3): Vehicle {
    const list = this.vehicles.list.filter((v) => v.spec.id === id && !v.removed);
    if (near) list.sort((a, b) => hdist(a.com, near) - hdist(b.com, near));
    if (!list.length) throw new Error('no vehicle ' + id);
    return list[0];
  }
  marker(name: string, dy = 0): V3 {
    const m = this.lv.markers[name];
    if (!m) throw new Error('no marker ' + name);
    return v3(m.x, m.y + dy, m.z);
  }
  /** ground height under (x, z) from above `top` */
  groundY(x: number, z: number, top = 60, ignoreDynamic = true): number {
    const h = this.sim.raycast(v3(x, top, z), v3(0, -1, 0), top + 20, null, ignoreDynamic ? (b) => !b.dynamic : undefined);
    return h ? h.point.y : -Infinity;
  }

  /** finish: E at the escape point (on foot) */
  clockOut(): void {
    // the escape point follows the van, which may have rolled a little since the route was planned
    const e = this.mission.escapePos();
    if (!this.player.seated && hdist(this.player.pos, e) > 2.2) this.walk([v3(e.x, e.y, e.z)], { r: 2.0 });
    for (let i = 0; i < 3 && !this.mission.ended; i++) { this.player.pitch = 0.6; this.pressE(); }
  }

  summary(): string {
    const r = this.mission.result;
    return `${this.def.id}: ${this.mission.phase} score ${r?.score} left ${r?.timeLeft} time ${r?.time} tools ${[...this.used].join(',')}`;
  }
}

export interface DriveStats { ticks: number; topSpeed: number; minUp: number; stuck: boolean; reached: number }

/**
 * Pure-pursuit driver along a polyline (shared by the mission harness and the road test): steers toward a point
 * a speed-dependent distance ahead on the path, targets the speed the path curvature ahead allows
 * (v = sqrt(a_lat * R), with the vehicle's own minimum turning radius), brakes toward it, and reverses out
 * when it has been stuck for 1.5 s.
 */
export function driveRoute(v: Vehicle, points: V3[], tick: () => void, ended: () => boolean, o: { cap?: number; r?: number; max?: number; log?: boolean; aLat?: number; reverse?: boolean } = {}): DriveStats {
  const R = !!o.reverse;
  const cap = o.cap ?? (R ? Math.min(3, v.spec.reverseSpeed) : v.spec.topSpeed);
  const st: DriveStats = { ticks: 0, topSpeed: 0, minUp: 1, stuck: false, reached: 0 };
  const max = o.max ?? 60 * 120;
  const aLat = o.aLat ?? 3.5;
  // path with the start position prepended, cumulative arc length
  const P = [v3(v.com.x, 0, v.com.z), ...points];
  const S = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + hdist(P[i - 1], P[i]));
  const total = S[S.length - 1];
  const at = (s: number): V3 => {
    s = Math.max(0, Math.min(total, s));
    let i = 1;
    while (i < P.length - 1 && S[i] < s) i++;
    const t = (s - S[i - 1]) / Math.max(1e-6, S[i] - S[i - 1]);
    return v3(P[i - 1].x + (P[i].x - P[i - 1].x) * t, 0, P[i - 1].z + (P[i].z - P[i - 1].z) * t);
  };
  const headingAt = (s: number) => { const a = at(s - 0.5), b = at(s + 0.5); return Math.atan2(-(b.x - a.x), -(b.z - a.z)); };
  const ws = v.spec.wheels.map((w) => w.z);
  const wheelbase = Math.max(...ws) - Math.min(...ws);
  const rMin = wheelbase / Math.tan(v.spec.maxSteer * 0.85);
  let seg = 1, prog = 0, slow = 0, reverse = 0, revSteer = 0;
  while (true) {
    if (ended()) break;
    const c = v.com;
    // progress: project onto the current and the next two segments
    let best = Infinity;
    for (let i = seg; i < Math.min(P.length, seg + 3); i++) {
      const a = P[i - 1], b = P[i];
      const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((c.x - a.x) * ex + (c.z - a.z) * ez) / l2));
      const d = Math.hypot(c.x - a.x - ex * t, c.z - a.z - ez * t);
      // a later segment only counts when we are actually on it (folded paths: hairpins, turnarounds)
      if (d < best - 1e-6 && d < 3.5) { best = d; const sNew = S[i - 1] + t * (S[i] - S[i - 1]); if (sNew >= prog - 0.5) { prog = Math.max(prog, Math.min(sNew, prog + 3)); seg = i; } }
    }
    while (seg < P.length - 1 && S[seg] <= prog) seg++;
    st.reached = Math.max(0, seg - 1);
    if (total - prog < (o.r ?? 2.0) || hdist(c, P[P.length - 1]) < (o.r ?? 2.0)) { st.reached = points.length; break; }
    if (st.ticks++ > max) { st.stuck = true; break; }
    const sp = R ? -v.speed : v.speed;
    const yaw = R ? wrap(v.yaw + Math.PI) : v.yaw;
    const look = Math.max(3.5, Math.min(12, 1.6 + Math.abs(sp) * 0.75));
    const tgtPt = at(prog + look);
    const want = Math.atan2(-(tgtPt.x - c.x), -(tgtPt.z - c.z));
    const err = wrap(want - yaw);
    // speed limit from the tightest bend in the next ~25 m (heading change over 6 m windows)
    let target = cap;
    for (let s = prog; s < Math.min(total, prog + 25); s += 2) {
      const dh = Math.abs(wrap(headingAt(s + 6) - headingAt(s)));
      const R = Math.max(rMin, dh > 1e-3 ? 6 / dh : 1e9);
      const vb = Math.max(2.2, Math.sqrt(aLat * (R - rMin * 0.8)));
      // allowed now: braking at ~3 m/s^2 over the distance to that bend
      target = Math.min(target, Math.sqrt(vb * vb + 2 * 3 * Math.max(0, s - prog)));
    }
    target = Math.min(target, Math.max(2.2, cap * (1 - Math.min(0.8, Math.abs(err) / 1.2))));
    if (reverse > 0) {
      reverse--;
      v.input.throttle = R ? 1 : -1;
      v.input.steer = revSteer;
    } else {
      v.input.steer = Math.max(-1, Math.min(1, -err * 2.5)) * (R ? -1 : 1);
      v.input.throttle = (sp < target - 0.4 ? 1 : sp > target + 0.4 ? -Math.min(1, 0.3 + (sp - target) * 0.35) : 0.15) * (R ? -1 : 1);
      if (Math.abs(sp) < 0.4 && v.input.throttle * (R ? -1 : 1) > 0) slow++; else slow = Math.max(0, slow - 2);
      if (slow > 90) { reverse = 75; slow = 0; revSteer = err > 0 ? 1 : -1; }
    }
    v.input.handbrake = false;
    tick();
    if (o.log && st.ticks % 30 === 0) console.log(`  drive t=${(st.ticks / 60).toFixed(1)} s=${prog.toFixed(1)}/${total.toFixed(0)} ${JSON.stringify(roundV(v.com))} v=${v.speed.toFixed(1)} tgt=${target.toFixed(1)} err=${err.toFixed(2)} thr=${v.input.throttle.toFixed(2)} st=${v.input.steer.toFixed(2)} up=${v.upright.toFixed(2)} gr=${v.grounded} hp=${v.health.toFixed(2)}`);
    st.topSpeed = Math.max(st.topSpeed, Math.abs(v.speed));
    st.minUp = Math.min(st.minUp, v.upright);
  }
  v.input.throttle = 0; v.input.steer = 0;
  return st;
}

export function roundV(p: V3): V3 { return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) }; }
export { v3, hdist };
