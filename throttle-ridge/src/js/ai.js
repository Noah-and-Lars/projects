// AI rider controller. It drives the same bike physics as the player and only
// sets throttle / brake / lean, like a player pressing keys.
import { GRAVITY, STEP } from './physics.js';

export const SKILLS = {
  easy:   { throttle: 0.8,  gain: 2.2, damp: 0.35, react: 0.16, noise: 0.35, wheelieCut: 0.3 },
  medium: { throttle: 0.9,  gain: 3.0, damp: 0.45, react: 0.09, noise: 0.15, wheelieCut: 0.38 },
  hard:   { throttle: 1.0,  gain: 3.8, damp: 0.5,  react: 0.04, noise: 0.05, wheelieCut: 0.45 },
};

export function createAI(skillName, seed = 1) {
  const skill = { ...SKILLS[skillName] };
  let s = seed * 9301 + 49297;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  // Small per-rider variation so the pack spreads out.
  skill.throttle = Math.min(1, skill.throttle * (0.97 + rand() * 0.05));
  return { skill, rand, timer: 0, lean: 0, throttle: 1, brake: 0, bias: (rand() - 0.5) * skill.noise * 0.3 };
}

// Predict where the bike will land with a simple ballistic sweep.
function predictLandingX(track, x, y, vx, vy) {
  let t = 0;
  const dt = 0.03;
  for (let i = 0; i < 120; i++) {
    t += dt;
    const px = x + vx * t;
    const py = y + vy * t + 0.5 * GRAVITY * t * t;
    if (py - 0.9 <= track.heightAt(px)) return px;
  }
  return x + vx * t;
}

export function aiControl(ai, bike, track, dt = STEP) {
  const sk = ai.skill;
  const c = bike.chassis;
  const p = c.getPosition();
  const v = c.getLinearVelocity();
  const angle = c.getAngle();
  const w = c.getAngularVelocity();

  ai.timer -= dt;
  if (ai.timer <= 0) {
    ai.timer = sk.react * (0.6 + ai.rand() * 0.8);
    let target;
    if (bike.grounded) {
      target = Math.atan(track.slopeAround(p.x + 1.2, 1.2));
    } else {
      const lx = predictLandingX(track, p.x, p.y, v.x, v.y);
      target = Math.atan(track.slopeAround(lx, 1.2)) - 0.05;
      if (bike.airTime > 0.1 && ai.rand() < sk.noise * 0.05) ai.bias = (ai.rand() - 0.5) * sk.noise;
    }
    let err = angle - target + ai.bias;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    let lean = err * sk.gain + w * sk.damp;
    if (bike.grounded && Math.abs(err) < 0.12) lean = 0;
    ai.lean = Math.max(-1, Math.min(1, lean));

    // Throttle: back off during big wheelies, otherwise hold it open.
    ai.throttle = sk.throttle;
    if (bike.grounded && err > sk.wheelieCut) ai.throttle = 0;
    ai.brake = 0;
  }
  bike.input.throttle = ai.throttle;
  bike.input.brake = ai.brake;
  bike.input.lean = ai.lean > 0.15 ? Math.min(1, ai.lean) : ai.lean < -0.15 ? Math.max(-1, ai.lean) : 0;
}
