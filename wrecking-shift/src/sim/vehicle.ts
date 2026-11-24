import RAPIER from '@dimforge/rapier3d-compat';
import type { VoxelBody } from './body';
import { MATERIALS, PAL_DENSITY, PAL_HARDNESS, VOXEL } from './materials';
import { DT, GROUP_ALL, GROUP_PLAYER, GROUP_VEHICLE, groups, type RayHit, type Sim, type SimEvent, type SimSystem } from './sim';
import { clamp, qrot, qyaw, vcross, vdot, type Quat, type V3 } from './vec';
import type { VoxelGrid } from './voxels';

/**
 * Drivable vehicles.
 *
 * A vehicle is ONE dynamic `VoxelBody` (kind 'vehicle') plus a Rapier `DynamicRayCastVehicleController`
 * with raycast wheels (wheels are not voxels; the renderer draws them from the controller state).
 *
 * Chassis-local frame (= the body's voxel grid frame, origin at the grid corner):
 *   +X across (x = 0 is the vehicle's right side), +Y up, +Z forward (the front is at z = sz).
 * World heading uses the player convention: yaw 0 faces -Z, forward = (-sin yaw, 0, -cos yaw);
 * the body rotation for heading `yaw` is `qyaw(yaw + PI)`.
 */

export interface WheelDef {
  /** suspension hard point, chassis-local metres */
  x: number; y: number; z: number;
  radius: number;
  /** visual tyre width (m) */
  width: number;
  /** steering factor (1 = front steering wheel, -0.4 = slight counter-steer rear, 0 = fixed) */
  steer: number;
  drive: boolean;
  /** locked by the handbrake (rear wheels) */
  handbrake: boolean;
}

export interface VehicleSpec {
  /** prefab id ('hatchback', 'van', 'loader') */
  id: string;
  wheels: WheelDef[];
  /** suspension */
  restLength: number;
  stiffness: number;
  compression: number;
  relaxation: number;
  maxTravel: number;
  /** tyre grip (friction coefficient-like) and lateral stiffness */
  frictionSlip: number;
  sideFriction: number;
  /** total drive force (N) at low speed */
  engineForce: number;
  /** braking impulse per wheel per tick (Rapier units) */
  brake: number;
  handbrake: number;
  /** m/s */
  topSpeed: number;
  reverseSpeed: number;
  /** max steering angle at standstill (rad), halves at `steerFalloff` m/s */
  maxSteer: number;
  steerFalloff: number;
  /** anti-roll stiffness (natural frequency, rad/s) applied while grounded */
  antiRoll: number;
  /** first-person eye, chassis-local metres */
  seat: V3;
  /** first-person 'hood' camera, chassis-local metres (in front of the windshield, above the bonnet) */
  hoodCam: V3;
  /** chase camera distance / height above the centre of mass */
  camDist: number;
  camHeight: number;
  /** ramming: carve severity bonus while pushing with throttle, and minimum speed for ramming */
  ramPush: number;
  ramMinSpeed: number;
  /** engine (smoke) position, chassis-local metres */
  engine: V3;
}

export interface VehicleBlueprint {
  spec: VehicleSpec;
  grid: VoxelGrid;
  name: string;
  /** target total mass (kg); the voxel mass is scaled to it */
  mass: number;
  /** grid indices of the steel frame (keepIndex is chosen among these) */
  frame: number[];
  /** grid indices of the engine bay (health) */
  engineBay: number[];
  /** preferred keep voxel (grid coords) */
  keep: [number, number, number];
}

export interface VehicleInput {
  /** -1..1: W = +1 (accelerate), S = -1 (brake, then reverse) */
  throttle: number;
  /** -1..1: D = +1 (right) */
  steer: number;
  handbrake: boolean;
}

const UP: V3 = { x: 0, y: 1, z: 0 };
/** ramming: carve severity thresholds / radius gains / max radii per hardness class (soft, medium, hard) */
const HARD_THR = [2.0, 4.5, 26, 1e9];
/** fraction of the removed matter's momentum (at vehicle speed) taken from the vehicle */
const RAM_MOMENTUM = 0.25;
const HARD_K = [0.09, 0.06, 0.03, 0];
const HARD_RMAX = [0.75, 0.58, 0.35, 0];
/** below this health the engine smokes, below DEAD_HEALTH it dies */
export const SMOKE_HEALTH = 0.3;
export const DEAD_HEALTH = 0.12;
/** engine-bay fraction below which the engine smokes / dies */
export const SMOKE_ENGINE = 0.55;
export const DEAD_ENGINE = 0.25;

let vehicleSerial = 0;

/** ramming probe origin (voxel coords); `low` = underside band */
interface Probe extends V3 { low: boolean; edge: boolean }

export class Vehicle {
  readonly id: number;
  readonly spec: VehicleSpec;
  readonly body: VoxelBody;
  readonly ctrl: RAPIER.DynamicRayCastVehicleController;
  name: string;
  readonly input: VehicleInput = { throttle: 0, steer: 0, handbrake: false };
  /** signed forward speed m/s (negative = reversing) */
  speed = 0;
  /** current (smoothed) steering angle in radians (positive = left) */
  steerAngle = 0;
  engineOn = false;
  /** player sits inside (set by the game module) */
  seated = false;
  /** 0..1: 0.7 x fraction of vital voxels (frame + engine bay) left + 0.3 x fraction of all voxels left */
  health = 1;
  /** 0..1 fraction of the engine bay left */
  engineHealth = 1;
  /** accumulated non-voxel damage (blast waves, hard crashes) subtracted from health */
  wear = 0;
  dead = false;
  /** engine flooded (COM under water) */
  drowned = false;
  removed = false;
  /** number of wheels touching the ground (last tick) */
  grounded = 0;
  /** last skid amount 0..1 */
  skid = 0;
  /** wheels whose mounting voxels were destroyed */
  readonly wheelLost: boolean[];
  /** world-space heading yaw (player convention) */
  yaw = 0;
  /** ticks since the vehicle was nearly upside-down and slow */
  stuckTicks = 0;
  private frame: Int32Array;
  private engineBay: Int32Array;
  private vitalTotal: number;
  private probesFwd: Probe[] = [];
  private probesBack: Probe[] = [];
  private probeTick = -999;
  private probeCount = -1;
  private lastCrashTick = -999;
  private lastSkidTick = -999;
  private lastSmokeTick = -999;
  private lastSelfDamageTick = -999;
  private lastHealthCount = -1;
  private pred: (c: RAPIER.Collider) => boolean;
  private readonly queryGroups = groups(GROUP_VEHICLE, GROUP_ALL & ~GROUP_PLAYER);

  constructor(readonly sim: Sim, bp: VehicleBlueprint, body: VoxelBody) {
    this.id = ++vehicleSerial;
    this.spec = bp.spec;
    this.body = body;
    this.name = bp.name;
    this.frame = Int32Array.from(bp.frame);
    this.engineBay = Int32Array.from(bp.engineBay);
    this.vitalTotal = Math.max(1, this.frame.length + this.engineBay.length);
    const s = bp.spec;
    const ctrl = sim.world.createVehicleController(body.rb);
    // forward axis = local +Z (the .d.ts declares the setter as `setIndexForwardAxis`, sic)
    (ctrl as any).setIndexForwardAxis = 2;
    ctrl.indexUpAxis = 1;
    const mass = bp.mass;
    const n = s.wheels.length;
    for (let i = 0; i < n; i++) {
      const w = s.wheels[i];
      ctrl.addWheel({ x: w.x, y: w.y, z: w.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, s.restLength, w.radius);
      ctrl.setWheelSuspensionStiffness(i, s.stiffness);
      ctrl.setWheelSuspensionCompression(i, s.compression);
      ctrl.setWheelSuspensionRelaxation(i, s.relaxation);
      ctrl.setWheelMaxSuspensionTravel(i, s.maxTravel);
      ctrl.setWheelMaxSuspensionForce(i, (mass * 9.81 * 6) / n);
      ctrl.setWheelFrictionSlip(i, s.frictionSlip);
      ctrl.setWheelSideFrictionStiffness(i, s.sideFriction);
    }
    this.ctrl = ctrl;
    this.wheelLost = s.wheels.map(() => false);
    this.pred = (c) => c.handle !== this.body.col.handle;
    this.updateHealth();
  }

  get speedKmh(): number { return this.speed * 3.6; }
  /** current throttle input (-1..1) */
  get throttle(): number { return this.input.throttle; }
  /** current steering input (-1..1, right positive) */
  get steer(): number { return this.input.steer; }
  get mass(): number { return this.body.mass; }
  get rot(): Quat { return this.body.rb.rotation(); }
  /** world centre of mass */
  get com(): V3 { return this.body.rb.worldCom(); }
  /** world forward / up / right unit vectors */
  get forward(): V3 { return qrot(this.body.rb.rotation(), { x: 0, y: 0, z: 1 }); }
  get up(): V3 { return qrot(this.body.rb.rotation(), UP); }
  get right(): V3 { return qrot(this.body.rb.rotation(), { x: -1, y: 0, z: 0 }); }
  /** chassis-local metres -> world */
  localToWorld(p: V3): V3 { return this.body.toWorld({ x: p.x / VOXEL, y: p.y / VOXEL, z: p.z / VOXEL }); }
  /** world position of the first-person eye */
  seatWorld(): V3 { return this.localToWorld(this.spec.seat); }
  /** world position of the hood camera */
  hoodCamWorld(): V3 { return this.localToWorld(this.spec.hoodCam); }
  /** upright = up.y (1 upright, 0 on its side, -1 on its roof) */
  get upright(): number { return this.up.y; }

  startEngine(): void {
    if (this.dead || this.drowned || this.removed) return;
    if (!this.engineOn) {
      this.engineOn = true;
      this.body.rb.wakeUp();
    }
  }
  stopEngine(): void { this.engineOn = false; }

  /** put the vehicle back on its wheels (flip assist) */
  flip(): void {
    const rb = this.body.rb;
    const com = rb.worldCom();
    const rot = qyaw(this.yaw + Math.PI);
    // place so the COM keeps its x/z and lands ~1 m higher
    const lc = rb.localCom();
    const off = qrot(rot, lc);
    rb.setRotation(rot, true);
    rb.setTranslation({ x: com.x - off.x, y: com.y + 1.0 - off.y + Math.max(0, lc.y - 0.5), z: com.z - off.z }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.stuckTicks = 0;
    this.sim.out.push({ type: 'custom', name: 'vehicle:flip', data: { name: this.name } });
  }

  /** needs flip assist: on its side / roof and nearly still */
  get canFlip(): boolean { return this.upright < 0.35 && this.stuckTicks > 30; }

  // ------------------------------------------------------------------ per tick

  update(sim: Sim): void {
    if (this.removed) return;
    const body = this.body;
    if (body.removed || body.grid.count === 0) { this.destroy(sim); return; }
    const rb = body.rb;
    const s = this.spec;
    const ctrl = this.ctrl;
    const lin = rb.linvel();
    const fwd = this.forward;
    const up = this.up;
    this.speed = vdot(lin, fwd);
    const flat = Math.hypot(fwd.x, fwd.z);
    if (flat > 0.2) this.yaw = Math.atan2(-fwd.x, -fwd.z);
    const absV = Math.abs(this.speed);
    const planar = Math.hypot(lin.x, lin.y, lin.z);
    this.stuckTicks = up.y < 0.35 && planar < 1.2 ? this.stuckTicks + 1 : 0;

    // damage / health (cheap: only when the voxel count changed)
    if (body.grid.count !== this.lastHealthCount) this.updateHealth();
    if ((sim.tick + this.id) % 15 === 0) this.checkWheels();

    // water: flooded engine
    const wl = VehicleSystem.of(sim).waterLevel;
    if (wl !== null && !this.drowned && rb.worldCom().y < wl - 0.5) {
      this.drowned = true;
      this.engineOn = false;
      sim.out.push({ type: 'custom', name: 'vehicle:stall', data: { name: this.name } });
    }

    // ---- driver input -> engine / brake / steering
    const inp = this.input;
    const live = this.engineOn && !this.dead && !this.drowned;
    let drive = 0, brake = 0;
    if (live) {
      const thr = clamp(inp.throttle, -1, 1);
      if (thr > 0.01) {
        if (this.speed < -0.8) brake = s.brake * thr;
        else drive = thr * s.engineForce * clamp((s.topSpeed - this.speed) / (0.25 * s.topSpeed), 0, 1);
      } else if (thr < -0.01) {
        if (this.speed > 0.8) brake = s.brake * -thr;
        else drive = thr * s.engineForce * 0.7 * clamp((s.reverseSpeed + this.speed) / (0.3 * s.reverseSpeed), 0, 1);
      } else {
        brake = s.brake * 0.04; // engine braking / rolling resistance
      }
    } else {
      // parked or dead: hold still (but let it roll a little when pushed hard)
      brake = this.seated || this.dead ? s.brake * 0.08 : s.brake * 0.5;
    }
    let nDrive = 0;
    for (let i = 0; i < s.wheels.length; i++) if (s.wheels[i].drive && !this.wheelLost[i]) nDrive++;
    const target = -clamp(inp.steer, -1, 1) * s.maxSteer / (1 + absV / s.steerFalloff);
    const rate = 2.6 * DT;
    this.steerAngle += clamp(target - this.steerAngle, -rate, rate);
    const hb = live && inp.handbrake;
    for (let i = 0; i < s.wheels.length; i++) {
      const w = s.wheels[i];
      ctrl.setWheelEngineForce(i, w.drive && nDrive && !(hb && w.handbrake) ? drive / nDrive : 0);
      ctrl.setWheelSteering(i, this.steerAngle * w.steer);
      const lock = (hb || (!live && !this.seated)) && w.handbrake;
      ctrl.setWheelBrake(i, lock ? Math.max(brake, s.handbrake) : brake);
      ctrl.setWheelSideFrictionStiffness(i, hb && w.handbrake ? s.sideFriction * 0.35 : s.sideFriction);
      ctrl.setWheelFrictionSlip(i, hb && w.handbrake ? s.frictionSlip * 0.6 : s.frictionSlip);
    }
    if (drive !== 0 || inp.steer !== 0) rb.wakeUp();

    // ---- ramming (before the wheels so the impulse is part of this tick)
    if (absV > Math.min(3, s.ramMinSpeed) && planar > 0.5) this.ram(sim, lin, planar, inp.throttle);

    ctrl.updateVehicle(DT, undefined, this.queryGroups, this.pred);

    // ---- grounded state, anti-roll, skids
    let g = 0;
    for (let i = 0; i < s.wheels.length; i++) if (ctrl.wheelIsInContact(i)) g++;
    this.grounded = g;
    if (g >= 2 && s.antiRoll > 0) this.antiRoll(fwd, up);
    this.detectSkid(sim, lin, fwd, g, hb, brake);
    if (this.smoking && sim.tick - this.lastSmokeTick >= 12) {
      this.lastSmokeTick = sim.tick;
      sim.out.push({ type: 'custom', name: 'vehicle:smoke', data: { name: this.name, pos: this.localToWorld(s.engine), amount: this.smokeAmount } });
    }
  }

  private antiRoll(fwd: V3, up: V3): void {
    const rb = this.body.rb;
    // roll angle around the forward axis and its rate
    const c = vcross(up, UP);
    const rollErr = vdot(c, fwd);
    const w = rb.angvel();
    const rollRate = vdot(w, fwd);
    const g = this.body.grid;
    const I = this.body.mass * ((g.sx * VOXEL) ** 2 + (g.sy * VOXEL) ** 2) / 12;
    const wn = this.spec.antiRoll;
    const tau = I * (wn * wn * rollErr - 1.2 * wn * rollRate);
    rb.applyTorqueImpulse({ x: fwd.x * tau * DT, y: fwd.y * tau * DT, z: fwd.z * tau * DT }, true);
  }

  private detectSkid(sim: Sim, lin: V3, fwd: V3, grounded: number, hb: boolean, brake: number): void {
    if (grounded < 2) { this.skid = 0; return; }
    const right = vcross(fwd, UP);
    const lat = Math.abs(vdot(lin, right));
    const v = Math.abs(this.speed);
    let amount = clamp((lat - 2.2) / 6, 0, 1);
    if (hb && v > 4) amount = Math.max(amount, clamp(v / 15, 0.2, 1));
    if (brake > this.spec.brake * 0.5 && v > 9) amount = Math.max(amount, clamp((v - 9) / 12, 0.15, 0.8));
    this.skid = amount;
    if (amount > 0.05 && sim.tick - this.lastSkidTick >= 6) {
      this.lastSkidTick = sim.tick;
      const g = this.body.grid;
      const pos = this.body.toWorld({ x: g.sx / 2, y: 0, z: g.sz * 0.2 });
      sim.out.push({ type: 'custom', name: 'vehicle:skid', data: { name: this.name, pos, amount } });
    }
  }

  // ------------------------------------------------------------------ damage

  updateHealth(): void {
    const d = this.body.grid.data;
    let fr = 0, en = 0;
    for (let i = 0; i < this.frame.length; i++) if (d[this.frame[i]]) fr++;
    for (let i = 0; i < this.engineBay.length; i++) if (d[this.engineBay[i]]) en++;
    this.lastHealthCount = this.body.grid.count;
    this.engineHealth = en / Math.max(1, this.engineBay.length);
    const vital = (fr + en) / this.vitalTotal;
    const hull = Math.min(1, this.body.grid.count / Math.max(1, this.body.initialCount));
    // vital voxels (frame + engine bay) dominate; any lost panel still counts a little
    this.health = Math.max(0, 0.7 * vital + 0.3 * hull - this.wear);
    // the keep voxel was destroyed: pick another surviving frame voxel
    const b = this.body;
    if (b.keepIndex < 0 || !d[b.keepIndex]) {
      b.keepIndex = -1;
      for (let i = 0; i < this.frame.length; i++) if (d[this.frame[i]]) { b.keepIndex = this.frame[i]; break; }
    }
    if (!this.dead && (this.health < DEAD_HEALTH || this.engineHealth < DEAD_ENGINE)) this.kill();
  }

  /** engine smokes */
  get smoking(): boolean { return !this.removed && !this.drowned && (this.health < SMOKE_HEALTH || this.engineHealth < SMOKE_ENGINE); }
  /** 0..1 smoke intensity */
  get smokeAmount(): number {
    return clamp(Math.max(1 - this.health / SMOKE_HEALTH, (SMOKE_ENGINE - this.engineHealth) / (SMOKE_ENGINE - DEAD_ENGINE)), 0.15, 1);
  }

  /** non-voxel damage (0..1 of full health) */
  addWear(amount: number): void {
    if (amount <= 0 || this.removed) return;
    this.wear = Math.min(1, this.wear + amount);
    this.updateHealth();
  }

  kill(): void {
    if (this.dead) return;
    this.dead = true;
    this.engineOn = false;
    this.sim.out.push({ type: 'custom', name: 'vehicle:dead', data: { name: this.name } });
  }

  /** wheels lose their mounting when no chassis voxel remains around the hard point */
  private checkWheels(): void {
    const g = this.body.grid;
    const s = this.spec;
    for (let i = 0; i < s.wheels.length; i++) {
      if (this.wheelLost[i]) continue;
      const w = s.wheels[i];
      const cx = Math.floor(w.x / VOXEL), cy = Math.floor(w.y / VOXEL), cz = Math.floor(w.z / VOXEL);
      const rx = Math.ceil(w.radius / VOXEL) + 3;
      let found = false;
      for (let z = cz - rx; z <= cz + rx && !found; z++)
        for (let y = cy - 2; y <= cy + 6 && !found; y++)
          for (let x = cx - rx; x <= cx + rx; x++) if (g.get(x, y, z)) { found = true; break; }
      if (!found) {
        this.wheelLost[i] = true;
        this.ctrl.setWheelSuspensionRestLength(i, 0);
        this.ctrl.setWheelRadius(i, 0.01);
        this.ctrl.setWheelMaxSuspensionForce(i, 0);
        this.sim.out.push({ type: 'custom', name: 'vehicle:wheelLost', data: { name: this.name, wheel: i } });
      }
    }
  }

  /** bumper probe origins (voxel coords, just inside the outermost voxel of a column) */
  private refreshProbes(): void {
    const g = this.body.grid;
    const fwd: Probe[] = [], back: Probe[] = [];
    // one probe per 3x3 band of (x, y) columns at the outermost voxel of that band, so every protruding
    // part (corners, bucket edges, mirrors) leads the carve and nothing snags on the edge of the hole
    const B = 3;
    for (let y0 = 0; y0 < g.sy; y0 += B)
      for (let x0 = 0; x0 < g.sx; x0 += B) {
        let zf = -1, zb = 1e9;
        const x1 = Math.min(g.sx, x0 + B), y1 = Math.min(g.sy, y0 + B);
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            for (let z = g.sz - 1; z > zf; z--) if (g.get(x, y, z)) { zf = z; break; }
            for (let z = 0; z < Math.min(zb, g.sz); z++) if (g.get(x, y, z)) { zb = z; break; }
          }
        if (zf < 0) continue;
        // edge bands probe at the very edge of the vehicle's silhouette (underside, roof, sides)
        const px = x0 === 0 ? 0.5 : x1 >= g.sx ? g.sx - 0.5 : (x0 + x1) / 2;
        const py = y0 === 0 ? 0.5 : y1 >= g.sy ? g.sy - 0.5 : (y0 + y1) / 2;
        const low = y0 === 0;
        const edge = low || x0 === 0 || x1 >= g.sx || y1 >= g.sy;
        fwd.push({ x: px, y: py, z: zf + 0.5, low, edge });
        back.push({ x: px, y: py, z: zb + 0.5, low, edge });
      }
    // silhouette edge probes first: interior carves that would overlap them are skipped (cost)
    const byEdge = (a: Probe, b: Probe) => Number(b.edge) - Number(a.edge);
    fwd.sort(byEdge);
    back.sort(byEdge);
    this.probesFwd = fwd;
    this.probesBack = back;
    this.probeCount = g.count;
    this.probeTick = this.sim.tick;
  }

  /**
   * Ramming: probe ahead of the moving bumper; carve the obstacle with radii from the impact severity,
   * slow the vehicle by the momentum given to the removed matter, and crumple our own bumper a bit.
   */
  private ram(sim: Sim, lin: V3, planar: number, throttle: number): void {
    const body = this.body;
    if (this.probeCount !== body.grid.count && sim.tick - this.probeTick > 20) this.refreshProbes();
    if (this.probeCount < 0) this.refreshProbes();
    const dir = { x: lin.x / planar, y: lin.y / planar, z: lin.z / planar };
    const probes = this.speed >= 0 ? this.probesFwd : this.probesBack;
    const len = 0.35 + planar * DT * 2;
    const m = body.mass;
    const massF = Math.cbrt(m / 1500);
    const pushing = (throttle > 0.5 && this.speed > 0) || (throttle < -0.5 && this.speed < 0) ? this.spec.ramPush : 0;
    const self = body;
    const filter = (b: VoxelBody) => b.kind !== 'vehicle' && (!b.dynamic || b.mass > m * 0.5);
    let removedMass = 0, removedCount = 0, worst = 0;
    let hitPos: V3 | null = null;
    let hitBody: VoxelBody | null = null;
    let selfPoint: V3 | null = null;
    // pass 1: which probes see an obstacle right ahead
    const hits: (RayHit | null)[] = [];
    let first: RayHit | null = null;
    let firstK = -1;
    for (let k = 0; k < probes.length; k++) {
      // starts half a voxel inside the outermost voxel
      const o = body.toWorld(probes[k]);
      let hit = sim.raycast(o, dir, len, self, filter);
      if (hit && (hit.normal.y > 0.6 || vdot(hit.normal, dir) > -0.3 || -vdot(lin, hit.normal) < 1)) hit = null; // floors / glancing
      hits.push(hit);
      if (hit && (!first || hit.dist < first.dist)) { first = hit; firstK = k; }
    }
    if (!first) return;
    const wall = first.body;
    const vn = Math.max(1, -vdot(lin, first.normal));
    const sev = vn * massF + pushing;
    worst = sev;
    const r = [0, 0, 0];
    for (let h = 0; h < 3; h++) r[h] = clamp((sev - HARD_THR[h]) * HARD_K[h], 0, HARD_RMAX[h]);
    hitPos = first.point; hitBody = wall;
    {
      // crumple centre: mean of the probes that touch the obstacle (not a corner probe)
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (let k = 0; k < probes.length; k++) if (hits[k] && hits[k]!.body === wall) { sx += probes[k].x; sy += probes[k].y; sz += probes[k].z; n++; }
      selfPoint = n ? body.toWorld({ x: sx / n, y: sy / n, z: sz / n }) : body.toWorld(probes[firstK]);
    }
    if (r[0] > 0.05) {
      // pass 2: carve the vehicle's whole cross-section into the rammed body (probes that did not hit yet are
      // projected onto the obstacle plane), so the hole is vehicle-shaped and the corners never snag
      const rMax = Math.max(r[0], r[1], r[2]);
      const shielded: VoxelBody[] = [];
      const done: V3[] = [];
      const spacing2 = Math.max(0.25, r[1] * 0.85) ** 2;
      for (let k = 0; k < probes.length; k++) {
        const o = body.toWorld(probes[k]);
        const h = hits[k];
        let d: number;
        if (h && h.body === wall) d = h.dist;
        else {
          // distance along dir to the plane through the first hit
          const den = vdot(dir, first.normal);
          d = den < -0.2 ? vdot({ x: first.point.x - o.x, y: first.point.y - o.y, z: first.point.z - o.z }, first.normal) / den : first.dist;
          if (d < 0 || d > len + 6) continue;
        }
        // underside probes carve a bit lower so no stub is left for the belly to snag on
        const c = { x: o.x + dir.x * (d + 0.12), y: o.y + dir.y * (d + 0.12) - (probes[k].low ? 0.2 : 0), z: o.z + dir.z * (d + 0.12) };
        let near = false;
        for (const q of done) if ((q.x - c.x) ** 2 + (q.y - c.y) ** 2 + (q.z - c.z) ** 2 < spacing2) { near = true; break; }
        if (near) continue;
        done.push(c);
        // only the rammed body is carved (never the ground under it or a neighbour)
        for (const b of sim.bodiesNear(c, rMax)) if (b !== wall && b !== self && !b.indestructible) { b.indestructible = true; shielded.push(b); }
        const res = sim.carve(c, r[0], r[1], r[2], { cause: 'ram', fracture: 0.2, ignore: self, rough: 0.2, silent: removedCount > 300 });
        if (res.removed) {
          removedMass += matterMass(res.byMat);
          removedCount += res.removed;
        }
      }
      for (const b of shielded) b.indestructible = false;
    }
    if (!hitPos) return;
    // momentum handed to the removed matter slows us down
    if (removedMass > 0) {
      const vAlong = Math.max(0, vdot(lin, dir));
      const J = Math.min(m * vAlong * 0.3, removedMass * vAlong * RAM_MOMENTUM);
      body.rb.applyImpulse({ x: -dir.x * J, y: -dir.y * J, z: -dir.z * J }, true);
    }
    // our own bumper crumples (rate limited)
    if (selfPoint && worst > 7 && sim.tick - this.lastSelfDamageTick >= 8) {
      this.lastSelfDamageTick = sim.tick;
      // an obstacle that did not give way puts all the energy into our own front
      const rs = clamp((worst - 7) * (removedCount < 50 ? 0.034 : 0.022), 0, 0.4);
      this.damageSelf(selfPoint, rs * 1.3, rs, 0);
      if (removedCount < 50) this.addWear(clamp((worst - 9) * 0.012, 0, 0.25));
    }
    if (worst > 4 && sim.tick - this.lastCrashTick >= 10) {
      this.lastCrashTick = sim.tick;
      sim.out.push({ type: 'custom', name: 'vehicle:crash', data: { name: this.name, pos: hitPos, force: clamp(worst / 30, 0.05, 1), removed: removedCount, body: hitBody } });
    }
  }

  /** remove voxels of this vehicle only, by hardness radius (bumper crumple) */
  damageSelf(center: V3, rSoft: number, rMed: number, rHard: number): number {
    const body = this.body;
    const g = body.grid;
    const lc = body.toLocal(center);
    const rad = [rSoft / VOXEL, rMed / VOXEL, rHard / VOXEL, 0];
    const rMax = Math.max(rad[0], rad[1], rad[2]);
    if (rMax <= 0.3) return 0;
    let n = 0;
    const byMat = new Uint32Array(MATERIALS.length);
    const samples: { p: V3; pal: number }[] = [];
    for (let z = Math.floor(lc.z - rMax); z <= Math.ceil(lc.z + rMax); z++)
      for (let y = Math.floor(lc.y - rMax); y <= Math.ceil(lc.y + rMax); y++)
        for (let x = Math.floor(lc.x - rMax); x <= Math.ceil(lc.x + rMax); x++) {
          const p = g.get(x, y, z);
          if (!p) continue;
          const r = rad[PAL_HARDNESS[p]];
          const dx = x + 0.5 - lc.x, dy = y + 0.5 - lc.y, dz = z + 0.5 - lc.z;
          if (dx * dx + dy * dy + dz * dz >= r * r) continue;
          this.sim.removeVoxel(body, x, y, z);
          byMat[p >> 3]++;
          if (samples.length < 12) samples.push({ p: body.toWorld({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }), pal: p });
          n++;
        }
    if (n) this.sim.out.push({ type: 'carve', pos: center, removed: n, byMat, samples, cause: 'ram' } as SimEvent);
    return n;
  }

  destroy(sim: Sim): void {
    if (this.removed) return;
    this.removed = true;
    this.engineOn = false;
    if (!this.dead) { this.dead = true; sim.out.push({ type: 'custom', name: 'vehicle:dead', data: { name: this.name } }); }
    try { sim.world.removeVehicleController(this.ctrl); } catch { /* already gone with the world */ }
  }
}

/** density-weighted mass of a set of palette counts (kg) */
export function matterMass(byMat: Uint32Array): number {
  let m = 0;
  for (let i = 0; i < byMat.length; i++) if (byMat[i]) m += byMat[i] * MATERIALS[i].density * VOXEL ** 3;
  return m;
}

const systems = new WeakMap<Sim, VehicleSystem>();

/** Updates all vehicles of a sim (registered in `sim.systems`, runs before physics). */
export class VehicleSystem implements SimSystem {
  readonly list: Vehicle[] = [];
  /** water surface (from the level) — vehicles stall when their COM is 0.5 m under it */
  waterLevel: number | null = null;
  private outRef: SimEvent[] | null = null;
  private outIdx = 0;
  private lastImpactTick = new Map<number, number>();

  /** the vehicle system of a sim (created + registered on first use) */
  static of(sim: Sim): VehicleSystem {
    let s = systems.get(sim);
    if (!s) {
      const sys = new VehicleSystem();
      s = sys;
      systems.set(sim, s);
      sim.systems.push(s);
      sim.onExplosion.push((pos, size) => sys.blast(pos, size));
    }
    return s;
  }

  /** create a vehicle from a blueprint at ground point (x, y, z) facing `yaw` */
  spawn(sim: Sim, bp: VehicleBlueprint, x: number, y: number, z: number, yaw: number): Vehicle {
    const g = bp.grid;
    const rot = qyaw(yaw + Math.PI);
    // spawn with the suspension fully extended (wheel centre = hard point - rest length), it settles from there
    const w0 = bp.spec.wheels[0];
    const clear = w0.radius - (w0.y - bp.spec.restLength);
    const half = qrot(rot, { x: (g.sx * VOXEL) / 2, y: 0, z: (g.sz * VOXEL) / 2 });
    const pos = { x: x - half.x, y: y + Math.max(0.05, clear) + 0.02, z: z - half.z };
    // raw voxel mass -> target mass
    let raw = 0;
    for (let i = 0; i < g.data.length; i++) if (g.data[i]) raw += PAL_DENSITY[g.data[i]] * VOXEL ** 3;
    const body = sim.addBody(g, pos, { dynamic: true, kind: 'vehicle', rot, name: bp.name, tags: ['vehicle', 'vehicle:' + bp.spec.id], massScale: bp.mass / Math.max(1, raw) });
    body.rb.setLinearDamping(0.05);
    body.rb.setAngularDamping(0.4);
    const [kx, ky, kz] = bp.keep;
    body.keepIndex = g.data[g.idx(kx, ky, kz)] ? g.idx(kx, ky, kz) : bp.frame[0] ?? -1;
    body.noFracture = true;
    const v = new Vehicle(sim, bp, body);
    body.user.vehicle = v;
    this.list.push(v);
    return v;
  }

  /** blast wave damage: closer than ~2.5 x size to the chassis box hurts (on top of the carved voxels) */
  blast(pos: V3, size: number): void {
    for (const v of this.list) {
      if (v.removed) continue;
      const l = v.body.toLocal(pos);
      const g = v.body.grid;
      const d = Math.hypot(Math.max(0, -l.x, l.x - g.sx), Math.max(0, -l.y, l.y - g.sy), Math.max(0, -l.z, l.z - g.sz)) * VOXEL;
      const R = size * 2.5;
      if (d >= R) continue;
      v.addWear(size * 0.18 * (1 - d / R));
    }
  }

  /** the vehicle owning a body, if any */
  byBody(b: VoxelBody | null | undefined): Vehicle | null {
    return (b && (b.user.vehicle as Vehicle | undefined)) || null;
  }

  update(sim: Sim): void {
    this.scanImpacts(sim);
    for (const v of this.list) v.update(sim);
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].removed) this.list.splice(i, 1);
  }

  /** hard contacts of vehicles (from the core 'impact' events of the previous tick) -> vehicle:crash */
  private scanImpacts(sim: Sim): void {
    if (sim.out !== this.outRef) { this.outRef = sim.out; this.outIdx = 0; }
    const out = sim.out;
    const n = out.length;
    for (let i = this.outIdx; i < n; i++) {
      const e = out[i];
      if (e.type !== 'impact') continue;
      const v = this.byBody(e.a) ?? this.byBody(e.b);
      if (!v || v.removed) continue;
      const force = clamp(e.force / (v.mass * 140), 0, 1);
      if (force < 0.08) continue;
      const last = this.lastImpactTick.get(v.id) ?? -999;
      if (sim.tick - last < 10) continue;
      this.lastImpactTick.set(v.id, sim.tick);
      sim.out.push({ type: 'custom', name: 'vehicle:crash', data: { name: v.name, pos: e.pos, force } });
      if (force > 0.5) v.addWear((force - 0.5) * 0.08);
    }
    this.outIdx = sim.out.length;
  }
}
