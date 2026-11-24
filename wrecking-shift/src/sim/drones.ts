import { box, flat } from './build';
import type { VoxelBody } from './body';
import { MAT, pal } from './materials';
import { DT, type Sim, type SimSystem } from './sim';
import { qrot, vdist, vlen, vnorm, vsub, type V3 } from './vec';
import { VoxelGrid } from './voxels';

/**
 * Security drones: hovering puzzle-like guards. They cannot be destroyed by tools; explosions only
 * stun them. Water kills them (push, ram or blast them into it, or flood their path).
 *  - 'watcher' (white eye): raises the alarm after 2 s of unbroken sight.
 *  - 'gunner' (amber eye): chases and fires short bursts.
 */
export type DroneKind = 'watcher' | 'gunner';
export type DroneState = 'patrol' | 'investigate' | 'chase' | 'stunned' | 'dead';

export class Drone {
  state: DroneState = 'patrol';
  wp = 0;
  /** seconds the player has been continuously visible */
  seeTime = 0;
  sees = false;
  stun = 0;
  alarmRaised = false;
  target: V3 | null = null;
  private lostTime = 0;
  /** gunner burst state */
  charge = 0;
  burst = 0;
  private shotTimer = 0;
  private stuck = 0;
  private lastPos: V3;
  constructor(readonly body: VoxelBody, readonly kind: DroneKind, public waypoints: V3[]) {
    this.lastPos = body.rb.worldCom();
  }
  get pos(): V3 { return this.body.rb.worldCom(); }
  get forward(): V3 { return qrot(this.body.rb.rotation(), { x: 0, y: 0, z: -1 }); }
  /** internal mutable fields used by the system */
  _lost(dt: number) { this.lostTime += dt; return this.lostTime; }
  _found() { this.lostTime = 0; }
  _shot(dt: number) { this.shotTimer -= dt; if (this.shotTimer <= 0) { this.shotTimer = 0.15; return true; } return false; }
  _progress(p: V3, dt: number): boolean {
    if (vdist(p, this.lastPos) < 0.02) this.stuck += dt; else this.stuck = 0;
    this.lastPos = p;
    if (this.stuck > 2.5) { this.stuck = 0; return false; }
    return true;
  }
}

export const DRONE_VIEW_RANGE = 25;
export const DRONE_HALF_FOV = (75 * Math.PI) / 180;
const HOVER = 1.3;

export function droneGrid(kind: DroneKind): VoxelGrid {
  const g = new VoxelGrid(8, 6, 8);
  box(g, 0, 1, 0, 8, 5, 8, flat(MAT.steel));
  box(g, 1, 0, 1, 7, 6, 7, flat(MAT.steel, 1));
  box(g, 2, 2, 2, 6, 4, 6, 0); // hollow core keeps the mass reasonable
  box(g, 1, 5, 1, 7, 6, 7, pal(MAT.paintedmetal, kind === 'gunner' ? 2 : 4));
  // eye on the front (-z) face
  box(g, 2, 2, 0, 6, 4, 1, pal(kind === 'gunner' ? MAT.gold : MAT.lamp, 2));
  box(g, 3, 0, 3, 5, 1, 5, pal(MAT.rubber));
  g.recount();
  return g;
}

export class DroneSystem implements SimSystem {
  drones: Drone[] = [];
  /** set false to freeze AI (menus/cutscenes) */
  enabled = true;

  constructor(private sim: Sim) {
    sim.onExplosion.push((pos, size) => this.hear(pos, size));
  }

  spawn(kind: DroneKind, pos: V3, waypoints: V3[] = []): Drone {
    const g = droneGrid(kind);
    const body = this.sim.addBody(g, { x: pos.x - 0.4, y: pos.y, z: pos.z - 0.4 }, { dynamic: true, kind: 'prop', name: kind === 'gunner' ? 'gunner drone' : 'watcher drone', tags: ['drone'] });
    return this.adopt(body, kind, waypoints.length ? waypoints : [pos]);
  }

  /** take control of an existing drone body (spawn / quickload) */
  adopt(body: VoxelBody, kind: DroneKind, waypoints: V3[]): Drone {
    body.indestructible = true; body.impactProof = true; body.noSplit = true;
    body.rb.setGravityScale(0, true);
    body.rb.setEnabledRotations(false, true, false, true);
    body.rb.setLinearDamping(1.5);
    const d = new Drone(body, kind, waypoints);
    this.drones.push(d);
    return d;
  }

  save(): any {
    return this.drones.filter((d) => !d.body.removed).map((d) => ({ body: d.body.id, kind: d.kind, waypoints: d.waypoints, wp: d.wp, dead: d.state === 'dead', alarm: d.alarmRaised, state: d.state, see: d.seeTime, target: d.target, stun: d.stun }));
  }
  load(data: any): void {
    for (const s of data ?? []) {
      const body = this.sim.bodies.get(s.body);
      if (!body) continue;
      const d = this.adopt(body, s.kind, s.waypoints);
      d.wp = s.wp; d.alarmRaised = s.alarm;
      d.seeTime = s.see ?? 0; d.target = s.target ?? null;
      if (s.state === 'stunned') this.setStunned(d, s.stun ?? 1);
      else if (s.state && s.state !== 'dead') d.state = s.state;
      if (s.dead) { d.state = 'dead'; body.rb.setGravityScale(1, true); body.rb.setEnabledRotations(true, true, true, true); body.rb.setLinearDamping(0.05); }
    }
  }

  private hear(pos: V3, size: number): void {
    for (const d of this.drones) {
      if (d.state === 'dead') continue;
      const dist = vdist(d.pos, pos);
      const stunR = 4 + size * 3;
      if (dist < stunR) this.setStunned(d, 4 * Math.min(1, 1.2 - dist / stunR));
      else if (dist < 45 && d.state !== 'chase') { d.state = 'investigate'; d.target = { ...pos }; d._found(); }
    }
  }

  private setStunned(d: Drone, t: number): void {
    d.stun = Math.max(d.stun, t);
    d.state = 'stunned';
    d.seeTime = 0; d.charge = 0; d.burst = 0;
    d.body.rb.setGravityScale(1, true);
    d.body.rb.setEnabledRotations(true, true, true, true);
    d.body.rb.setLinearDamping(0.05);
  }
  private recover(d: Drone): void {
    d.state = 'patrol';
    d.body.rb.setGravityScale(0, true);
    // snap upright (keep yaw) before locking the tilt axes again
    const f = d.forward;
    const yaw = Math.atan2(-f.x, -f.z);
    d.body.rb.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    d.body.rb.setEnabledRotations(false, true, false, true);
    d.body.rb.setLinearDamping(1.5);
  }

  private canSee(d: Drone, eye: V3): boolean {
    const p = d.pos;
    const to = vsub(eye, p);
    const dist = vlen(to);
    if (dist > DRONE_VIEW_RANGE) return false;
    const dir = vnorm(to);
    const f = d.forward;
    if (dist > 1.5 && Math.acos(Math.max(-1, Math.min(1, dir.x * f.x + dir.y * f.y + dir.z * f.z))) > DRONE_HALF_FOV) return false;
    const hit = this.sim.raycast(p, dir, dist - 0.25, d.body, (b) => !b.tags.has('drone'));
    return !hit;
  }

  update(sim: Sim): void {
    if (!this.enabled) return;
    const player = sim.player;
    const wl = sim.waterLevel;
    for (const d of this.drones) {
      if (d.state === 'dead') continue;
      if (d.body.removed) { d.state = 'dead'; continue; }
      const rb = d.body.rb;
      const p = d.pos;
      if (wl != null && p.y < wl - 0.15) {
        d.state = 'dead';
        rb.setGravityScale(1, true); rb.setEnabledRotations(true, true, true, true); rb.setLinearDamping(0.05);
        const g = d.body.grid;
        for (let x = 2; x < 6; x++) for (let y = 2; y < 4; y++) if (g.get(x, y, 0)) sim.setVoxel(d.body, x, y, 0, pal(MAT.char, 1));
        sim.out.push({ type: 'custom', name: 'drone:dead', data: { pos: p, kind: d.kind } });
        continue;
      }
      if (d.state === 'stunned') {
        d.stun -= DT;
        if (d.stun <= 0) this.recover(d);
        continue;
      }
      // --- sensing
      d.sees = !!player && this.canSee(d, player.eye);
      if (d.sees) {
        d.seeTime += DT; d._found();
        d.target = { ...player!.eye };
        if (d.kind === 'watcher' && d.seeTime >= 2 && !d.alarmRaised) {
          d.alarmRaised = true;
          sim.out.push({ type: 'custom', name: 'drone:alarm', data: { pos: p } });
        }
        if (d.kind === 'gunner' && d.seeTime > 0.3) d.state = 'chase';
        else if (d.state === 'patrol' && d.seeTime > 0.3) d.state = 'investigate';
        if (sim.tick % 30 === 0) sim.out.push({ type: 'custom', name: 'drone:spot', data: { pos: p, kind: d.kind, t: d.seeTime } });
      } else {
        d.seeTime = Math.max(0, d.seeTime - DT * 2);
        if (d.state !== 'patrol' && d._lost(DT) > 6) { d.state = 'patrol'; d.target = null; }
      }
      // --- movement goal
      let goal: V3, speed = 2.0, keep = 0.4;
      if (d.state === 'patrol') {
        goal = d.waypoints[d.wp % d.waypoints.length];
        if (Math.hypot(goal.x - p.x, goal.z - p.z) < 0.6) { d.wp = (d.wp + 1) % d.waypoints.length; goal = d.waypoints[d.wp]; }
      } else {
        goal = d.target ?? p;
        speed = d.state === 'chase' ? 3.6 : 2.6;
        keep = d.kind === 'gunner' && d.sees ? 7 : d.sees ? 4 : 0.8;
      }
      const dx = goal.x - p.x, dz = goal.z - p.z;
      const hd = Math.hypot(dx, dz);
      let vx = 0, vz = 0;
      if (hd > keep) { vx = (dx / hd) * speed; vz = (dz / hd) * speed; }
      else if (d.state === 'investigate' && !d.sees && d._lost(0) > 2) { /* look around */ }
      if (hd > keep && !d._progress(p, DT) && d.state === 'patrol') d.wp = (d.wp + 1) % d.waypoints.length;
      // hover height from the ground below
      const down = sim.raycast(p, { x: 0, y: -1, z: 0 }, 6, d.body);
      const ground = down ? down.dist : 6;
      const vy = Math.max(-3, Math.min(3, (HOVER - ground) * 4));
      const v = rb.linvel();
      const k = 0.12;
      rb.setLinvel({ x: v.x + (vx - v.x) * k, y: v.y + (vy - v.y) * 0.25, z: v.z + (vz - v.z) * k }, true);
      // face the goal / the player
      const face = d.sees && player ? vsub(player.eye, p) : hd > 0.3 ? { x: dx, y: 0, z: dz } : null;
      if (face) {
        const f = d.forward;
        const cur = Math.atan2(-f.x, -f.z), want = Math.atan2(-face.x, -face.z);
        let diff = want - cur;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        rb.setAngvel({ x: 0, y: Math.max(-3, Math.min(3, diff * 5)), z: 0 }, true);
      } else rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      // --- gunner attack
      if (d.kind === 'gunner' && d.state === 'chase' && player) {
        if (d.sees && d.burst === 0) {
          d.charge += DT;
          if (d.charge >= 1.2) { d.burst = 3; d.charge = 0; sim.out.push({ type: 'custom', name: 'drone:charge', data: { pos: p } }); }
        } else if (!d.sees) d.charge = Math.max(0, d.charge - DT);
        if (d.burst > 0 && d._shot(DT)) {
          d.burst--;
          const aim = vsub(player.eye, p);
          const s = 0.035;
          const dir = vnorm({ x: aim.x + (sim.rng.next() - 0.5) * s * vlen(aim), y: aim.y - 0.3 + (sim.rng.next() - 0.5) * s * vlen(aim), z: aim.z + (sim.rng.next() - 0.5) * s * vlen(aim) });
          const dist = vlen(aim);
          const hit = sim.raycast(p, dir, 60, d.body);
          sim.out.push({ type: 'custom', name: 'tool:shot', data: { tool: 'pistol', pos: p, dir, source: 'drone' } });
          if (hit && hit.dist < dist - 0.4) sim.carve(hit.point, 0.14, 0.09, 0, { cause: 'gun' });
          else {
            // passes the player: closest approach decides
            const t = aim.x * dir.x + aim.y * dir.y + aim.z * dir.z;
            const cx = p.x + dir.x * t - player.eye.x, cy = p.y + dir.y * t - (player.eye.y - 0.5), cz = p.z + dir.z * t - player.eye.z;
            if (Math.hypot(cx, cz) < 0.35 && Math.abs(cy) < 0.95) player.damage(0.14, 'drone');
            if (hit) sim.carve(hit.point, 0.14, 0.09, 0, { cause: 'gun' });
          }
        }
      }
    }
  }

  alive(): number { return this.drones.filter((d) => d.state !== 'dead').length; }
}
