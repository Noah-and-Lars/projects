import RAPIER from '@dimforge/rapier3d-compat';
import { DT, GROUP_ALL, GROUP_PLAYER, groups, type Sim } from './sim';
import { clamp, type V3 } from './vec';

export interface PlayerInput {
  /** strafe -1..1 (right positive) */
  moveX: number;
  /** forward -1..1 (forward positive) */
  moveZ: number;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
}

export const PLAYER_RADIUS = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_CROUCH_HEIGHT = 1.0;
export const EYE_OFFSET = 0.15; // eye below top of head
/** a character placed with its feet exactly on a surface starts inside the controller's skin and cannot move */
const SPAWN_LIFT = 0.03;

/** First-person character (kinematic cylinder + Rapier character controller). */
export class Player {
  readonly rb: RAPIER.RigidBody;
  col: RAPIER.Collider;
  readonly ctrl: RAPIER.KinematicCharacterController;
  input: PlayerInput = { moveX: 0, moveZ: 0, jump: false, crouch: false, sprint: false };
  yaw = 0;
  pitch = 0;
  vel: V3 = { x: 0, y: 0, z: 0 };
  /** gravity multiplier (rule-tweak mods) */
  gravityScale = 1;
  grounded = false;
  crouching = false;
  height = PLAYER_HEIGHT;
  health = 1;
  dead = false;
  /** when set the player is inside a vehicle: physics body disabled */
  seated = false;
  walkSpeed = 5.2;
  sprintSpeed = 7.4;
  crouchSpeed = 2.6;
  jumpSpeed = 5.0;
  /** seconds since last grounded (coyote time) */
  private airTime = 0;
  private jumpHeld = false;
  /** in water: swim */
  inWater = false;
  headUnderWater = false;
  /** seconds of breath left */
  breath = 12;
  /** accumulated walked distance (footsteps / head bob) */
  stride = 0;
  /** last landing speed for fall damage / audio (consumed by game) */
  landed = 0;
  noclip = false;
  /** ticks since last damage (regen delay) */
  private sinceHurt = 999;
  /** last damage cause for the fail screen */
  lastHurt = '';
  godMode = false;

  /** apply damage (0..1 of full health) */
  damage(amount: number, cause = ''): void {
    if (this.dead || this.godMode || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.sinceHurt = 0;
    this.lastHurt = cause;
    this.sim.out.push({ type: 'custom', name: 'player:hurt', data: { amount, cause } });
    if (this.health <= 0) { this.dead = true; this.sim.out.push({ type: 'custom', name: 'player:dead', data: { cause } }); }
  }
  revive(): void { this.dead = false; this.health = 1; }

  constructor(readonly sim: Sim, pos: V3) {
    const w = sim.world;
    this.rb = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y + PLAYER_HEIGHT / 2 + SPAWN_LIFT, pos.z));
    this.col = this.makeCollider(PLAYER_HEIGHT);
    this.ctrl = w.createCharacterController(0.02);
    this.ctrl.enableAutostep(0.36, 0.12, false);
    this.ctrl.enableSnapToGround(0.25);
    this.ctrl.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.ctrl.setMinSlopeSlideAngle((40 * Math.PI) / 180);
    this.ctrl.setApplyImpulsesToDynamicBodies(true);
    this.ctrl.setCharacterMass(80);
    sim.player = this;
  }

  private makeCollider(h: number): RAPIER.Collider {
    return this.sim.world.createCollider(
      RAPIER.ColliderDesc.cylinder(h / 2, PLAYER_RADIUS).setCollisionGroups(groups(GROUP_PLAYER, GROUP_ALL & ~GROUP_PLAYER)).setFriction(0),
      this.rb,
    );
  }

  /** feet position */
  get pos(): V3 {
    const t = this.rb.translation();
    return { x: t.x, y: t.y - this.height / 2, z: t.z };
  }
  get eye(): V3 {
    const t = this.rb.translation();
    return { x: t.x, y: t.y + this.height / 2 - EYE_OFFSET, z: t.z };
  }
  /** unit view direction */
  get forward(): V3 {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }

  teleport(feet: V3): void {
    this.rb.setTranslation({ x: feet.x, y: feet.y + this.height / 2, z: feet.z }, true);
    this.rb.setNextKinematicTranslation({ x: feet.x, y: feet.y + this.height / 2, z: feet.z });
    this.vel = { x: 0, y: 0, z: 0 };
  }

  setSeated(s: boolean): void {
    this.seated = s;
    this.col.setEnabled(!s);
  }

  private setHeight(h: number): void {
    if (h === this.height) return;
    const feet = this.pos;
    this.sim.world.removeCollider(this.col, false);
    this.height = h;
    this.col = this.makeCollider(h);
    this.rb.setTranslation({ x: feet.x, y: feet.y + h / 2, z: feet.z }, true);
  }

  private canStand(): boolean {
    const t = this.rb.translation();
    const feetY = t.y - this.height / 2;
    const shape = new RAPIER.Cylinder((PLAYER_HEIGHT - 0.1) / 2 - 0.05, PLAYER_RADIUS - 0.03);
    const hit = this.sim.world.intersectionWithShape(
      { x: t.x, y: feetY + 0.1 + PLAYER_HEIGHT / 2, z: t.z }, { x: 0, y: 0, z: 0, w: 1 }, shape,
      undefined, groups(GROUP_PLAYER, GROUP_ALL & ~GROUP_PLAYER), this.col, this.rb,
    );
    return !hit;
  }

  update(): void {
    this.sinceHurt++;
    if (!this.dead && this.sinceHurt > 240 && this.health < 1) this.health = Math.min(1, this.health + DT * 0.12);
    if (this.headUnderWater && !this.seated) {
      this.breath -= DT;
      if (this.breath < 0 && this.sim.tick % 60 === 0) this.damage(0.15, 'drowning');
    } else this.breath = Math.min(12, this.breath + DT * 4);
    if (this.seated || this.dead) return;
    const inp = this.input;
    // crouch handling
    if (inp.crouch && !this.crouching) { this.crouching = true; this.setHeight(PLAYER_CROUCH_HEIGHT); }
    else if (!inp.crouch && this.crouching && this.canStand()) { this.crouching = false; this.setHeight(PLAYER_HEIGHT); }

    const speed = this.crouching ? this.crouchSpeed : inp.sprint ? this.sprintSpeed : this.walkSpeed;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = inp.moveX, mz = inp.moveZ;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    // forward = (-sin, -cos), right = (cos, -sin)
    const wishX = (-sin * mz + cos * mx) * speed;
    const wishZ = (-cos * mz - sin * mx) * speed;

    if (this.noclip) {
      const f = this.forward;
      const t = this.rb.translation();
      const s = (inp.sprint ? 25 : 10) * DT;
      const nx = t.x + (f.x * mz + cos * mx) * s, ny = t.y + (f.y * mz + (inp.jump ? 1 : 0) - (inp.crouch ? 1 : 0)) * s, nz = t.z + (f.z * mz - sin * mx) * s;
      this.rb.setTranslation({ x: nx, y: ny, z: nz }, true);
      this.vel = { x: 0, y: 0, z: 0 };
      return;
    }

    const accel = this.grounded ? 14 : this.inWater ? 5 : 3.5;
    const k = Math.min(1, accel * DT);
    this.vel.x += (wishX - this.vel.x) * k;
    this.vel.z += (wishZ - this.vel.z) * k;

    if (this.inWater) {
      // swim: buoyant, jump = up
      this.vel.y += (-1.5 - this.vel.y) * Math.min(1, 3 * DT);
      if (inp.jump) this.vel.y = 2.6;
      this.vel.x *= 0.96; this.vel.z *= 0.96;
    } else {
      this.vel.y -= 9.81 * 1.6 * this.gravityScale * DT; // slightly heavy gravity feels snappier
      if (this.grounded) this.airTime = 0; else this.airTime += DT;
      if (inp.jump && !this.jumpHeld && this.airTime < 0.12) {
        this.vel.y = this.jumpSpeed * (this.crouching ? 0.8 : 1);
        this.airTime = 1;
        this.grounded = false;
      }
    }
    this.jumpHeld = inp.jump;
    this.vel.y = clamp(this.vel.y, -50, 50);

    const jumping = this.vel.y > 0.01;
    if (jumping) this.ctrl.disableSnapToGround(); else this.ctrl.enableSnapToGround(0.25);
    const desired = { x: this.vel.x * DT, y: this.vel.y * DT, z: this.vel.z * DT };
    this.ctrl.computeColliderMovement(this.col, desired, undefined, groups(GROUP_PLAYER, GROUP_ALL & ~GROUP_PLAYER));
    const m = this.ctrl.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.ctrl.computedGrounded() && !jumping;
    // Rapier's controller nudges the character 0.1 mm off the ground every call (normal nudge factor 1e-4) and
    // the -1 m/s "stick to ground" speed pulls it back the next tick: on terrain the eye flipped by 0.1 mm at
    // 30 Hz while standing still, which made every sub-pixel edge of the distant ground flicker. Sub-0.3 mm
    // vertical corrections while grounded are dropped (walking a slope moves > 1 mm per tick).
    // On terraced slopes the cylinder rests on voxel edges, the controller never reports "grounded" and the
    // nudge along the slanted edge normals made a standing player creep (~4 cm per 10 s on Kestrel Ridge).
    // So the same applies while the fall is held up, and tiny sideways drift without movement input is dropped.
    // Only without movement input: while walking, those sub-mm nudges are what lets the cylinder slide up
    // over voxel edges (dropping them got the player stuck in a Kestrel Ridge playthrough).
    const held = desired.y < 0 && m.y > desired.y * 0.5;
    if (ml < 1e-3) {
      if ((this.grounded || held) && Math.abs(m.y) < 0.0003) m.y = 0;
      if (Math.abs(m.x) < 0.0003 && Math.abs(m.z) < 0.0003) { m.x = 0; m.z = 0; }
    }
    const t = this.rb.translation();
    this.rb.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });

    // velocity feedback from collisions
    const fallSpeed = -this.vel.y;
    if (this.grounded) {
      if (!wasGrounded && fallSpeed > 3) { this.landed = fallSpeed; if (fallSpeed > 13) this.damage((fallSpeed - 13) * 0.07, 'fall'); }
      this.vel.y = -1.0;
    } else if (this.vel.y > 0 && m.y < desired.y * 0.5) {
      this.vel.y = 0; // bumped head
    } else if (this.vel.y < -2 && m.y > desired.y * 0.5) {
      // falling but held up (resting on an edge / a prop the controller does not report as ground): keep the
      // speed we actually move at. It used to grow without limit, and the eventual "landing" at -30 m/s killed
      // the player with fall damage after a small hop onto a chair.
      this.vel.y = Math.max(this.vel.y, m.y / DT - 1);
    }
    // horizontal blocked -> kill that velocity component so we don't stick-accelerate
    if (Math.abs(desired.x) > 1e-5 && Math.abs(m.x) < Math.abs(desired.x) * 0.2) this.vel.x *= 0.5;
    if (Math.abs(desired.z) > 1e-5 && Math.abs(m.z) < Math.abs(desired.z) * 0.2) this.vel.z *= 0.5;
    if (this.grounded) this.stride += Math.hypot(m.x, m.z);
  }
}
