// Crash ragdoll: when a rider crashes, the body is thrown off the bike as a
// chain of planck bodies joined by limited revolute joints. Ragdolls only
// collide with the ground, so they never affect the race.
import * as planck from 'planck';
import { CAT_GROUND } from './physics.js';

const { Vec2 } = planck;
export const CAT_RAGDOLL = 0x0004;

const SEGMENTS = [
  // name, from, to, half thickness, density
  ['torso', 'hip', 'shoulder', 0.14, 1.0],
  ['thigh', 'hip', 'knee', 0.08, 1.0],
  ['shin', 'knee', 'foot', 0.07, 1.0],
  ['upper', 'shoulder', 'elbow', 0.055, 0.8],
  ['fore', 'elbow', 'hand', 0.05, 0.8],
];

export function createRagdoll(world, jw, vel, angVel) {
  const filter = { filterCategoryBits: CAT_RAGDOLL, filterMaskBits: CAT_GROUND };
  const seg = {};
  for (const [name, a, b, hw, density] of SEGMENTS) {
    const pa = jw[a], pb = jw[b];
    const len = Math.max(0.1, Math.hypot(pb.x - pa.x, pb.y - pa.y));
    const body = world.createBody({
      type: 'dynamic',
      position: Vec2((pa.x + pb.x) / 2, (pa.y + pb.y) / 2),
      angle: Math.atan2(pb.y - pa.y, pb.x - pa.x),
      angularDamping: 1.5, linearDamping: 0.1,
    });
    body.createFixture({ shape: new planck.Box(len / 2, hw), density, friction: 0.7, restitution: 0.15, ...filter });
    body.setLinearVelocity(Vec2(vel.x * 0.85, vel.y * 0.85 + 2));
    body.setAngularVelocity(angVel * 0.5);
    seg[name] = { body, len };
  }
  const head = world.createBody({ type: 'dynamic', position: Vec2(jw.head.x, jw.head.y), angularDamping: 1.5 });
  head.createFixture({ shape: new planck.Circle(0.15), density: 1.2, friction: 0.6, restitution: 0.2, ...filter });
  head.setLinearVelocity(Vec2(vel.x * 0.85, vel.y * 0.85 + 2.5));

  const joints = [];
  const pin = (A, B, p, lo, hi) => {
    joints.push(world.createJoint(new planck.RevoluteJoint({
      enableLimit: true, lowerAngle: lo, upperAngle: hi,
    }, A, B, Vec2(p.x, p.y))));
  };
  pin(seg.torso.body, seg.thigh.body, jw.hip, -2.2, 0.6);
  pin(seg.thigh.body, seg.shin.body, jw.knee, -0.1, 2.4);
  pin(seg.torso.body, seg.upper.body, jw.shoulder, -3.0, 1.2);
  pin(seg.upper.body, seg.fore.body, jw.elbow, -2.4, 0.1);
  pin(seg.torso.body, head, jw.shoulder, -0.6, 0.6);

  const bodies = [...Object.values(seg).map(s => s.body), head];
  return { seg, head, bodies, joints };
}

export function destroyRagdoll(world, rd) {
  if (!rd) return;
  for (const j of rd.joints) world.destroyJoint(j);
  for (const b of rd.bodies) world.destroyBody(b);
}

// Current joint positions (world) read back from the ragdoll bodies.
export function ragdollJoints(rd) {
  const end = (s, sign) => {
    const p = s.body.getPosition(), a = s.body.getAngle();
    return { x: p.x + Math.cos(a) * s.len / 2 * sign, y: p.y + Math.sin(a) * s.len / 2 * sign };
  };
  const hp = rd.head.getPosition();
  return {
    hip: end(rd.seg.torso, -1), shoulder: end(rd.seg.torso, 1),
    knee: end(rd.seg.thigh, 1), foot: end(rd.seg.shin, 1),
    elbow: end(rd.seg.upper, 1), hand: end(rd.seg.fore, 1),
    head: { x: hp.x, y: hp.y },
    torsoAngle: rd.seg.torso.body.getAngle(),
  };
}
