import RAPIER from '@dimforge/rapier3d-compat';
import { VehicleFx } from '../render/vehicleFx';
import type { VoxelBody } from '../sim/body';
import { EYE_OFFSET } from '../sim/player';
import { adoptVehicle, spawnVehicle } from '../sim/prefabs/vehicles';
import { GROUP_ALL, GROUP_PLAYER, groups } from '../sim/sim';
import { qrot, type V3 } from '../sim/vec';
import { VehicleSystem, type Vehicle } from '../sim/vehicle';
import type { Game, GameModule, CameraOverride } from './game';

/**
 * Driving: enter / exit vehicles with E, W/S throttle + brake/reverse, A/D steer, Space handbrake,
 * V toggles chase / first-person camera, R flips a vehicle that lies on its side or roof.
 *
 * Publishes `game.ext.vehicles = { system, list, current, camMode, hint }`.
 */

export type VehicleCamMode = 'chase' | 'hood';

export interface VehiclesExt {
  system: VehicleSystem;
  readonly list: Vehicle[];
  readonly current: Vehicle | null;
  camMode: VehicleCamMode;
  /** short prompt for the HUD ('E  drive van', 'R  flip hatchback') or '' */
  readonly hint: string;
  enter(v: Vehicle): void;
  /** spawn a prefab ('hatchback' | 'van' | 'loader') at a ground point (sandbox / debug / missions) */
  spawn(id: string, x: number, y: number, z: number, yaw?: number): Vehicle;
  exit(): void;
}

const ENTER_RANGE = 3;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class VehicleModule implements GameModule {
  game!: Game;
  system: VehicleSystem | null = null;
  current: Vehicle | null = null;
  camMode: VehicleCamMode = 'chase';
  hint = '';
  readonly fx = new VehicleFx();
  private orbitYaw = 0;
  private orbitPitch = 0;
  private prevYaw = 0;
  private prevPitch = 0;
  private mouseIdle = 0;
  private camYaw = 0;
  private camDist = 6;
  private camInit = false;
  private hud: HTMLDivElement | null = null;
  readonly cam: CameraOverride = { eye: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, roll: 0 };

  init(game: Game): void {
    this.game = game;
    game.renderer.scene.add(this.fx.root);
  }

  save(): any {
    const sys = this.system;
    if (!sys) return [];
    return sys.list.filter((v) => !v.removed && !v.body.removed).map((v) => ({ body: v.body.id, wear: v.wear, seated: v === this.current }));
  }
  load(game: Game, data: any): void {
    for (const s of data ?? []) {
      const body = game.sim.bodies.get(s.body);
      if (!body) continue;
      const v = adoptVehicle(game.sim, body);
      if (!v) continue;
      v.wear = s.wear ?? 0;
      if (s.seated) this.enter(v);
    }
  }

  onLevelLoaded(game: Game): void {
    this.game = game;
    if (this.current) this.current = null;
    game.toolsEnabled = true;
    this.fx.clear();
    const sys = VehicleSystem.of(game.sim);
    sys.waterLevel = game.level.waterLevel;
    this.system = sys;
    const self = this;
    const ext: VehiclesExt = {
      system: sys,
      get list() { return sys.list; },
      get current() { return self.current; },
      get camMode() { return self.camMode; },
      set camMode(m: VehicleCamMode) { self.camMode = m; },
      get hint() { return self.hint; },
      enter: (v) => this.enter(v),
      spawn: (id, x, y, z, yaw = 0) => spawnVehicle(game.sim, id, x, y, z, yaw),
      exit: () => this.exit(),
    };
    game.ext.vehicles = ext;
    this.camInit = false;
  }

  // ------------------------------------------------------------------ fixed tick

  fixedUpdate(game: Game): void {
    if (!this.system) return;
    const p = game.player;
    const keys = game.pendingKeys;
    const inp = game.input;
    const ctl = game.controlsEnabled && !p.dead;
    const cur = this.current;
    if (cur) {
      if (cur.removed || p.dead || cur.drowned) { this.exit(); return; }
      cur.input.throttle = ctl ? (inp.down('KeyW') || inp.down('ArrowUp') ? 1 : 0) - (inp.down('KeyS') || inp.down('ArrowDown') ? 1 : 0) : 0;
      cur.input.steer = ctl ? (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0) - (inp.down('KeyA') || inp.down('ArrowLeft') ? 1 : 0) : 0;
      cur.input.handbrake = ctl && inp.down('Space');
      if (ctl && keys.has('KeyV')) this.camMode = this.camMode === 'chase' ? 'hood' : 'chase';
      if (ctl && keys.has('KeyR') && cur.upright < 0.5 && Math.abs(cur.speed) < 2) cur.flip();
      if (ctl && keys.has('KeyE')) { this.exit(); return; }
      this.followSeat();
      this.hint = cur.canFlip ? 'R  flip vehicle' : '';
      return;
    }
    // on foot: what are we looking at?
    const target = this.lookTarget();
    this.hint = target ? (target.upright < 0.5 ? 'R  flip ' : 'E  drive ') + target.name : '';
    if (!ctl || !target) return;
    if (keys.has('KeyE') && target.upright >= 0.5 && !target.dead) this.enter(target);
    else if (keys.has('KeyR') && target.upright < 0.5) target.flip();
  }

  onEvents(game: Game): void {
    // keep the seated player glued to the seat after the physics step too (missions read player.pos)
    if (this.current && !this.current.removed && game.player.seated) this.followSeat();
  }

  /** the vehicle the player looks at (within 3 m), or the nearest one right in front */
  lookTarget(): Vehicle | null {
    const sys = this.system;
    if (!sys || !sys.list.length) return null;
    const p = this.game.player;
    const eye = p.eye, f = p.forward;
    const hit = this.game.sim.raycast(eye, f, ENTER_RANGE);
    const hv = hit ? sys.byBody(hit.body) : null;
    if (hv && !hv.removed) return hv;
    if (hit && hit.dist < 1.2) return null; // something else right in front of us
    let best: Vehicle | null = null, bestD = 1e9;
    for (const v of sys.list) {
      if (v.removed) continue;
      const d = boxDistance(v.body, eye);
      if (d > 1.6) continue;
      const c = v.com;
      const dx = c.x - eye.x, dz = c.z - eye.z;
      const l = Math.hypot(dx, dz) || 1;
      if ((dx * f.x + dz * f.z) / l < 0.3) continue;
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  enter(v: Vehicle): void {
    const g = this.game;
    if (this.current || v.removed) return;
    this.current = v;
    v.seated = true;
    v.startEngine();
    g.player.setSeated(true);
    g.toolsEnabled = false;
    this.orbitYaw = 0; this.orbitPitch = 0;
    this.prevYaw = g.player.yaw; this.prevPitch = g.player.pitch;
    this.camInit = false;
    this.followSeat();
    g.sim.out.push({ type: 'custom', name: 'vehicle:enter', data: { name: v.name } });
  }

  exit(): void {
    const g = this.game;
    const v = this.current;
    if (!v) return;
    this.current = null;
    v.seated = false;
    v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = false;
    v.stopEngine();
    const spot = v.removed ? null : this.exitSpot(v);
    const p = g.player;
    p.setSeated(false);
    if (spot) p.teleport(spot);
    else if (!v.removed) { const c = v.com; p.teleport({ x: c.x, y: c.y + 1.5, z: c.z }); }
    p.yaw = v.removed ? p.yaw : v.yaw;
    p.pitch = 0;
    g.toolsEnabled = true;
    g.cameraOverride = null;
    this.hint = '';
    g.sim.out.push({ type: 'custom', name: 'vehicle:exit', data: { name: v.name } });
  }

  private followSeat(): void {
    const v = this.current;
    if (!v || v.removed) return;
    const s = v.seatWorld();
    const p = this.game.player;
    // feet position such that player.eye == seat
    p.teleport({ x: s.x, y: s.y - (p.height - EYE_OFFSET), z: s.z });
  }

  /** free standing spot next to the vehicle: driver door, other door, behind, in front, on the roof */
  exitSpot(v: Vehicle): V3 | null {
    const sim = this.game.sim;
    const g = v.body.grid;
    const halfW = (g.sx * 0.1) / 2, halfL = (g.sz * 0.1) / 2;
    const c = v.com;
    // heading in the ground plane (works when the vehicle lies on its side / roof)
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    const lx = -fz, lz = fx; // left of the heading
    const seat = v.seatWorld();
    const sl = (seat.x - c.x) * lx + (seat.z - c.z) * lz; // driver side sign
    const side = sl >= 0 ? 1 : -1;
    const along = (seat.x - c.x) * fx + (seat.z - c.z) * fz;
    const cands: [number, number][] = [
      [c.x + lx * side * (halfW + 0.55) + fx * along, c.z + lz * side * (halfW + 0.55) + fz * along],
      [c.x - lx * side * (halfW + 0.55) + fx * along, c.z - lz * side * (halfW + 0.55) + fz * along],
      [c.x + lx * side * (halfW + 0.55), c.z + lz * side * (halfW + 0.55)],
      [c.x - fx * (halfL + 0.6), c.z - fz * (halfL + 0.6)],
      [c.x + fx * (halfL + 0.6), c.z + fz * (halfL + 0.6)],
      [c.x - lx * side * (halfW + 1.3), c.z - lz * side * (halfW + 1.3)],
    ];
    const shape = new RAPIER.Cylinder(0.85, 0.32);
    const filt = groups(GROUP_PLAYER, GROUP_ALL & ~GROUP_PLAYER);
    const solid = (b: VoxelBody) => b !== v.body && b.kind !== 'debris';
    // loose debris does not block a spot (the character controller pushes it away)
    const notDebris = (col: RAPIER.Collider) => sim.byCollider.get(col.handle)?.kind !== 'debris';
    for (const [x, z] of cands) {
      // never through a wall: the spot must be visible from the seat
      const to = { x: x - seat.x, y: 0, z: z - seat.z };
      const dist = Math.hypot(to.x, to.z);
      if (sim.raycast(seat, { x: to.x / dist, y: 0, z: to.z / dist }, dist, v.body, solid)) continue;
      const top = { x, y: Math.max(seat.y, c.y + 0.8), z };
      const down = sim.raycast(top, { x: 0, y: -1, z: 0 }, 6, v.body, solid);
      if (!down) continue;
      const feetY = down.point.y + 0.02;
      if (feetY > c.y + 1.2) continue;
      const hit = sim.world.intersectionWithShape({ x, y: feetY + 0.92, z }, { x: 0, y: 0, z: 0, w: 1 }, shape, undefined, filt, this.game.player.col, undefined, notDebris);
      if (!hit) return { x, y: feetY, z };
    }
    // on top of it
    const top = qrot(v.rot, { x: 0, y: 1, z: 0 }).y > 0 ? g.sy * 0.1 + 0.1 : 0.2;
    return { x: c.x, y: v.body.rb.translation().y + top, z: c.z };
  }

  // ------------------------------------------------------------------ per frame (camera, wheels, hud)

  frameUpdate(game: Game, dt: number): void {
    const sys = this.system;
    if (!sys) return;
    this.fx.sync(sys.list, dt);
    const v = this.current;
    const p = game.player;
    // mouse look changed player yaw/pitch this frame -> camera orbit
    const dyaw = wrap(p.yaw - this.prevYaw), dpitch = p.pitch - this.prevPitch;
    this.prevYaw = p.yaw; this.prevPitch = p.pitch;
    if (!v || v.removed) { this.updateHud(null); return; }
    if (Math.abs(dyaw) + Math.abs(dpitch) > 1e-5) { this.orbitYaw += dyaw; this.orbitPitch += dpitch; this.mouseIdle = 0; }
    else this.mouseIdle += dt;
    const fwd = v.forward;
    if (this.camMode === 'chase') {
      this.orbitYaw = wrap(this.orbitYaw);
      this.orbitPitch = Math.max(-0.9, Math.min(0.5, this.orbitPitch));
      if (this.mouseIdle > 1.2 && Math.abs(v.speed) > 2) {
        const k = 1 - Math.exp(-dt * 1.8);
        this.orbitYaw -= this.orbitYaw * k; this.orbitPitch -= this.orbitPitch * k;
      }
      if (!this.camInit) { this.camYaw = v.yaw; this.camDist = v.spec.camDist; this.camInit = true; }
      // follow the heading (slower when airborne / tumbling)
      const follow = v.upright > 0.5 ? 4.5 : 1.0;
      this.camYaw += wrap(v.yaw - this.camYaw) * (1 - Math.exp(-dt * follow));
      const yaw = this.camYaw + this.orbitYaw;
      const pitch = -0.2 + this.orbitPitch;
      const c = v.com;
      const target = { x: c.x, y: c.y + v.spec.camHeight * 0.55, z: c.z };
      const cp = Math.cos(pitch);
      const back = { x: Math.sin(yaw) * cp, y: -Math.sin(pitch), z: Math.cos(yaw) * cp }; // = -forward(yaw, pitch)
      let want = v.spec.camDist;
      const hit = game.sim.raycast(target, back, want + 0.3, v.body, (b) => b.kind !== 'debris' || b.mass > 150);
      if (hit) want = Math.max(1.2, hit.dist - 0.35);
      // pull in immediately, ease back out
      this.camDist = want < this.camDist ? want : this.camDist + (want - this.camDist) * (1 - Math.exp(-dt * 2.5));
      const d = this.camDist;
      this.cam.eye = { x: target.x + back.x * d, y: target.y + back.y * d, z: target.z + back.z * d };
      this.cam.yaw = yaw;
      this.cam.pitch = pitch;
      this.cam.roll = 0;
    } else {
      this.orbitYaw = Math.max(-1.9, Math.min(1.9, this.orbitYaw));
      this.orbitPitch = Math.max(-1.0, Math.min(0.8, this.orbitPitch));
      if (this.mouseIdle > 1.5 && Math.abs(v.speed) > 2) { const k = 1 - Math.exp(-dt * 1.5); this.orbitYaw -= this.orbitYaw * k; }
      this.cam.eye = v.hoodCamWorld();
      this.cam.yaw = v.yaw + this.orbitYaw;
      this.cam.pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y))) - 0.07 + this.orbitPitch;
      this.cam.roll = 0;
    }
    game.cameraOverride = this.cam;
    this.updateHud(v);
  }

  private updateHud(v: Vehicle | null): void {
    if (typeof document === 'undefined') return;
    if (!v) { if (this.hud) this.hud.style.display = 'none'; return; }
    if (!this.hud) {
      const ui: HTMLElement = this.game.ext.hud?.root ?? document.getElementById('ui') ?? document.body;
      const el = document.createElement('div');
      el.id = 'vehicle-hud';
      el.style.cssText = 'position:absolute;right:18px;bottom:16px;font:600 13px/1.35 system-ui,sans-serif;color:#fff;' +
        'text-shadow:0 1px 2px #000a;text-align:right;pointer-events:none;letter-spacing:.02em';
      ui.appendChild(el);
      this.hud = el;
    }
    this.hud.style.display = '';
    const hp = Math.round(v.health * 100);
    const state = v.drowned ? 'FLOODED' : v.dead ? 'ENGINE DEAD' : v.smoking ? 'ENGINE DAMAGED' : '';
    this.hud.innerHTML = `<div style="font-size:26px">${Math.round(Math.abs(v.speedKmh))}<span style="font-size:12px"> km/h</span></div>` +
      `<div style="opacity:.85">${v.name} · ${hp}%${state ? ' · ' + state : ''}</div>` +
      `<div style="opacity:.6;font-weight:400">E exit · V camera${v.canFlip ? ' · R flip' : ''}</div>`;
  }
}

/** distance from a point to a body's (oriented) voxel grid box */
function boxDistance(b: VoxelBody, p: V3): number {
  const l = b.toLocal(p);
  const g = b.grid;
  const dx = Math.max(0, -l.x, l.x - g.sx), dy = Math.max(0, -l.y, l.y - g.sy), dz = Math.max(0, -l.z, l.z - g.sz);
  return Math.hypot(dx, dy, dz) * 0.1;
}

export function vehicleModule(): VehicleModule {
  return new VehicleModule();
}
