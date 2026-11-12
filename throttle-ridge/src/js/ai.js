// AI rider controller. It drives the same bike physics as the player and only
// sets throttle / brake / lean, like a player pressing keys.
import { GRAVITY, STEP } from './physics.js';

// slip: chance per jump of a mistake in the air (1.1); fumble: chance per second
// of a fumble on the ground (a missed gear, a chopped throttle).
export const SKILLS = {
  easy:   { throttle: 0.8,  gain: 2.2, damp: 0.35, react: 0.16, noise: 0.35, wheelieCut: 0.3,  slip: 0.16, fumble: 0.06 },
  medium: { throttle: 0.9,  gain: 3.0, damp: 0.45, react: 0.09, noise: 0.15, wheelieCut: 0.38, slip: 0.11, fumble: 0.04 },
  hard:   { throttle: 1.0,  gain: 3.8, damp: 0.5,  react: 0.04, noise: 0.05, wheelieCut: 0.45, slip: 0.05, fumble: 0.02 },
};

export function createAI(skillName, seed = 1) {
  const skill = { ...SKILLS[skillName] };
  let s = seed * 9301 + 49297;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  // Small per-rider variation so the pack spreads out.
  skill.throttle = Math.min(1, skill.throttle * (0.97 + rand() * 0.05));
  return { skill, rand, timer: 0, lean: 0, throttle: 1, brake: 0, bias: (rand() - 0.5) * skill.noise * 0.3, mistake: null, wasAir: false, fumbleT: 0 };
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

  // Mistakes (1.1): bots aren't perfect. On a take-off they sometimes misjudge
  // the rotation (too much, too little, or freeze up); on the ground they
  // sometimes fumble the throttle for a moment.
  if (!bike.grounded && !ai.wasAir && bike.airTime > 0.08) {
    ai.wasAir = true;
    if (ai.rand() < sk.slip) {
      const r = ai.rand();
      ai.mistake = r < 0.4 ? { type: 'over', bias: (ai.rand() < 0.5 ? -1 : 1) * (0.45 + ai.rand() * 0.6) }
        : r < 0.75 ? { type: 'freeze', t: 0.25 + ai.rand() * 0.45 }
        : { type: 'late', t: 0.3 + ai.rand() * 0.3 };
    }
  }
  if (bike.grounded) { ai.wasAir = false; if (ai.mistake && ai.mistake.type !== 'fumble') ai.mistake = null; }
  if (bike.grounded && !ai.mistake && ai.rand() < sk.fumble * dt) ai.mistake = { type: 'fumble', t: 0.35 + ai.rand() * 0.6 };
  const m = ai.mistake;
  if (m && m.t !== undefined && (m.t -= dt) <= 0) { if (m.type === 'freeze' || m.type === 'fumble') ai.mistake = null; else if (m.type === 'late') m.type = 'done'; }

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
    let err = angle - target + ai.bias + (m && m.type === 'over' ? m.bias : 0);
    err = Math.atan2(Math.sin(err), Math.cos(err));
    let lean = err * sk.gain + w * sk.damp;
    if (bike.grounded && Math.abs(err) < 0.12) lean = 0;
    ai.lean = Math.max(-1, Math.min(1, lean));

    // Throttle: back off during big wheelies, otherwise hold it open.
    ai.throttle = sk.throttle;
    if (bike.grounded && err > sk.wheelieCut) ai.throttle = 0;
    ai.brake = 0;
  }
  bike.input.throttle = m && m.type === 'fumble' ? 0 : ai.throttle;
  bike.input.brake = ai.brake;
  bike.input.lean = ai.lean > 0.15 ? Math.min(1, ai.lean) : ai.lean < -0.15 ? Math.max(-1, ai.lean) : 0;
  if (m && (m.type === 'freeze' || m.type === 'late')) bike.input.lean = m.type === 'freeze' ? (ai.frozen ??= bike.input.lean) : 0;
  else ai.frozen = undefined;
}
