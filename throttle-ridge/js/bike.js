// Bike physics: a chassis body (frame + rider) and two wheels on wheel joints
// with spring suspension. Rear-wheel drive. Leaning applies torque to the
// chassis: in the air it rotates the bike, on the ground it shifts weight
// (wheelies, nose-down pre-loading).
import * as planck from 'planck';
import { CAT_BIKE, CAT_GROUND, STEP } from './physics.js';

const { Vec2 } = planck;

export const BIKE = {
  wheelR: 0.36,
  rearX: -0.72, frontX: 0.74, wheelY: -0.42,
  topSpeed: 25,          // m/s on the flat at full throttle
  driveTorque: 15,
  brakeTorque: 30,
  airSpin: 6.2,          // max rad/s of rotation from leaning in the air
  airTorque: 9,
  groundTorque: 5.5,
  suspensionHz: 5.2,
  suspensionDamp: 0.75,
};

export function createBike(world, x, y, opts = {}) {
  const chassis = world.createBody({ type: 'dynamic', position: Vec2(x, y), angularDamping: 0.6 });
  const bikeFilter = { filterCategoryBits: CAT_BIKE, filterMaskBits: CAT_GROUND };

  chassis.createFixture({
    shape: new planck.Polygon([Vec2(-0.75, -0.2), Vec2(0.8, -0.1), Vec2(0.6, 0.22), Vec2(-0.65, 0.18)]),
    density: 2.2, friction: 0.5, ...bikeFilter, userData: 'frame',
  });
  // Rider torso and head: if these touch the ground, the rider crashes.
  chassis.createFixture({
    shape: new planck.Box(0.16, 0.34, Vec2(-0.12, 0.6), -0.15),
    density: 0.9, friction: 0.5, ...bikeFilter, userData: 'torso',
  });
  chassis.createFixture({
    shape: new planck.Circle(Vec2(0.0, 1.08), 0.17),
    density: 0.5, friction: 0.5, ...bikeFilter, userData: 'head',
  });

  const makeWheel = (lx) => {
    const w = world.createBody({ type: 'dynamic', position: Vec2(x + lx, y + BIKE.wheelY), angularDamping: 0.2 });
    w.createFixture({
      shape: new planck.Circle(BIKE.wheelR),
      density: 1.1, friction: 1.6, restitution: 0.05, ...bikeFilter, userData: 'wheel',
    });
    return w;
  };
  const rear = makeWheel(BIKE.rearX);
  const front = makeWheel(BIKE.frontX);

  const jointOpts = {
    enableMotor: false, maxMotorTorque: 0, motorSpeed: 0,
    frequencyHz: BIKE.suspensionHz, dampingRatio: BIKE.suspensionDamp,
  };
  const rearJoint = world.createJoint(new planck.WheelJoint(jointOpts, chassis, rear, rear.getPosition(), Vec2(0, 1)));
  const frontJoint = world.createJoint(new planck.WheelJoint({ ...jointOpts, frequencyHz: BIKE.suspensionHz * 0.95 }, chassis, front, front.getPosition(), Vec2(0, 1)));

  const bike = {
    id: opts.id ?? 0,
    chassis, rear, front, rearJoint, frontJoint,
    input: { throttle: 0, brake: 0, lean: 0 },
    rearContact: false, frontContact: false,
    grounded: false, airTime: 0,
    crashed: false, crashTimer: 0,
    stuckTimer: 0,
    lastVel: Vec2(0, 0),
    events: [],
    rpm: 0,
    leanVisual: 0,
    finished: false, finishTime: 0,
    progress: 0,
  };
  return bike;
}

function touching(body, tag) {
  for (let ce = body.getContactList(); ce; ce = ce.next) {
    const c = ce.contact;
    if (!c.isTouching()) continue;
    const a = c.getFixtureA(), b = c.getFixtureB();
    const mine = a.getBody() === body ? a : b;
    const other = mine === a ? b : a;
    if (other.getUserData() !== 'ground') continue;
    if (!tag || mine.getUserData() === tag) return true;
  }
  return false;
}

// Called before world.step: apply drive, brake and lean.
export function applyControls(bike, track) {
  const { chassis, rear, front, rearJoint, frontJoint } = bike;
  const inp = bike.input;
  if (bike.crashed) {
    rearJoint.enableMotor(false);
    frontJoint.enableMotor(false);
    return;
  }
  const v = chassis.getLinearVelocity();
  const angle = chassis.getAngle();
  const fwdSpeed = v.x * Math.cos(angle) + v.y * Math.sin(angle);

  if (inp.hold) {
    // Held at the start gate: lock both wheels, no reversing.
    rearJoint.enableMotor(true); rearJoint.setMotorSpeed(0); rearJoint.setMaxMotorTorque(BIKE.brakeTorque);
    frontJoint.enableMotor(true); frontJoint.setMotorSpeed(0); frontJoint.setMaxMotorTorque(BIKE.brakeTorque);
  } else if (inp.brake > 0) {
    // Brake hard; if nearly stopped, reverse slowly.
    if (fwdSpeed > 1) {
      rearJoint.enableMotor(true); rearJoint.setMotorSpeed(0); rearJoint.setMaxMotorTorque(BIKE.brakeTorque * inp.brake);
      frontJoint.enableMotor(true); frontJoint.setMotorSpeed(0); frontJoint.setMaxMotorTorque(BIKE.brakeTorque * 0.7 * inp.brake);
    } else {
      frontJoint.enableMotor(false);
      rearJoint.enableMotor(true); rearJoint.setMotorSpeed(5 / BIKE.wheelR); rearJoint.setMaxMotorTorque(BIKE.driveTorque * 0.35);
    }
  } else if (inp.throttle > 0) {
    frontJoint.enableMotor(false);
    rearJoint.enableMotor(true);
    rearJoint.setMotorSpeed(-BIKE.topSpeed / BIKE.wheelR);
    // Torque falls away near top speed so acceleration is punchy at low speed.
    const k = Math.max(0.25, 1 - Math.max(0, fwdSpeed) / (BIKE.topSpeed * 1.1));
    rearJoint.setMaxMotorTorque(BIKE.driveTorque * inp.throttle * (0.55 + 0.45 * k));
  } else {
    // Engine braking.
    frontJoint.enableMotor(false);
    rearJoint.enableMotor(true);
    rearJoint.setMotorSpeed(0);
    rearJoint.setMaxMotorTorque(0.6);
  }

  const lean = inp.lean; // -1 back .. +1 forward
  const w = chassis.getAngularVelocity();
  if (!bike.grounded) {
    // Air control: drive angular velocity towards a target spin rate.
    const target = -lean * BIKE.airSpin;
    if (lean !== 0) {
      const torque = Math.max(-1, Math.min(1, (target - w) * 0.5)) * BIKE.airTorque;
      chassis.applyTorque(torque, true);
    } else {
      chassis.applyTorque(-w * 0.35, true); // gentle stabilising
    }
  } else if (lean !== 0) {
    // Weight shift on the ground.
    chassis.applyTorque(-lean * BIKE.groundTorque, true);
    // Leaning forward also pushes the front wheel down a little.
    if (lean > 0) front.applyForceToCenter(Vec2(0, -6 * lean), true);
  }
}

// Called after world.step: contacts, landings, crashes.
export function updateBike(bike, track, dt = STEP) {
  const { chassis, rear, front } = bike;
  bike.events.length = 0;
  bike.rearContact = touching(rear);
  bike.frontContact = touching(front);
  const wasGrounded = bike.grounded;
  bike.grounded = bike.rearContact || bike.frontContact;

  const v = chassis.getLinearVelocity();
  if (!bike.crashed && (touching(chassis, 'head') || touching(chassis, 'torso'))) {
    bike.crashed = true;
    bike.crashTimer = 1.0;
    bike.events.push({ type: 'crash', x: chassis.getPosition().x, y: chassis.getPosition().y });
  }

  if (!bike.grounded) {
    bike.airTime += dt;
  } else {
    if (!wasGrounded && bike.airTime > 0.22 && !bike.crashed) landing(bike, track);
    bike.airTime = 0;
  }

  // Visual lean eases toward input.
  const target = bike.crashed ? 0 : bike.input.lean;
  bike.leanVisual += (target - bike.leanVisual) * Math.min(1, dt * 12);

  // RPM for audio: rear wheel spin blended with throttle.
  const wheelSpin = Math.abs(rear.getAngularVelocity()) * BIKE.wheelR / BIKE.topSpeed;
  const targetRpm = bike.crashed ? 0.1 : Math.min(1.2, (bike.grounded ? wheelSpin : wheelSpin * 0.6 + bike.input.throttle * 0.5) * 0.85 + bike.input.throttle * 0.25);
  bike.rpm += (targetRpm - bike.rpm) * Math.min(1, dt * 8);

  bike.lastVel = Vec2(v.x, v.y);
  bike.lastAngle = chassis.getAngle();
}

function landing(bike, track) {
  const { chassis, rear, front } = bike;
  const pos = chassis.getPosition();
  const slope = track.slopeAround(pos.x, 1.0);
  const groundAngle = Math.atan(slope);
  // Use the velocity from before contact resolution.
  const v = bike.lastVel;
  const angle = bike.lastAngle;
  let diff = angle - groundAngle;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const t = Vec2(Math.cos(groundAngle), Math.sin(groundAngle));
  const n = Vec2(-t.y, t.x);
  const along = v.x * t.x + v.y * t.y;
  const impact = Math.abs(v.x * n.x + v.y * n.y);
  const ad = Math.abs(diff);
  // 1 = perfect, 0 = awful.
  const quality = ad < 0.22 ? 1 : ad > 0.65 ? 0 : 1 - (ad - 0.22) / 0.43;
  const keep = 0.5 + 0.5 * quality;
  const speed = Math.max(0, along) * keep * (quality > 0.95 ? 1.02 : 1);
  const nv = Vec2(t.x * speed, t.y * speed);
  for (const b of [chassis, rear, front]) {
    const cur = b.getLinearVelocity();
    // Keep a little of the normal component so suspension still compresses.
    const nComp = cur.x * n.x + cur.y * n.y;
    b.setLinearVelocity(Vec2(nv.x + n.x * nComp * 0.6, nv.y + n.y * nComp * 0.6));
  }
  if (quality > 0.6) chassis.setAngularVelocity(chassis.getAngularVelocity() * 0.4);
  bike.events.push({ type: 'land', quality, impact, x: pos.x, y: pos.y });
}

// Place the bike upright on the ground at x, at rest (or with an initial speed).
export function resetBike(bike, track, x, speed = 0) {
  const ang = Math.atan(track.slopeAround(x, 1.5));
  const gy = track.heightAt(x);
  const c = Math.cos(ang), s = Math.sin(ang);
  const base = Vec2(x - s * 0.95, gy + c * 0.95); // chassis centre above ground
  const place = (body, lx, ly, a) => {
    body.setTransform(Vec2(base.x + lx * c - ly * s, base.y + lx * s + ly * c), a);
    body.setLinearVelocity(Vec2(c * speed, s * speed));
    body.setAngularVelocity(0);
    body.setAwake(true);
  };
  place(bike.chassis, 0, 0, ang);
  place(bike.rear, BIKE.rearX, BIKE.wheelY, 0);
  place(bike.front, BIKE.frontX, BIKE.wheelY, 0);
  if (speed) {
    bike.rear.setAngularVelocity(-speed / BIKE.wheelR);
    bike.front.setAngularVelocity(-speed / BIKE.wheelR);
  }
  bike.crashed = false;
  bike.crashTimer = 0;
  bike.airTime = 0;
  bike.grounded = false;
  bike.stuckTimer = 0;
  bike.lastVel = Vec2(0, 0);
  bike.lastAngle = ang;
}
