// Rider skeleton and riding pose (bike-local 2D coordinates, metres).
// Shared by the renderer (to pose the model) and the crash ragdoll (to start
// from the same pose). No rendering or physics dependencies.

export const LIMB = { thigh: 0.45, shin: 0.47, upper: 0.30, fore: 0.30, torso: 0.56 };
export const PEG = { x: -0.1, y: -0.37 };
export const GRIP = { x: 0.425, y: 0.405 };

// Two-bone IK in 2D. sign picks which side the middle joint bends to.
export function ik(a, b, l1, l2, sign) {
  const dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, d));
  const base = Math.atan2(dy, dx);
  const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = base + sign * Math.acos(Math.max(-1, Math.min(1, c)));
  return { x: a.x + Math.cos(ang) * l1, y: a.y + Math.sin(ang) * l1 };
}

// lean: -1 back .. +1 forward. crouch: 0 standing .. 1 fully absorbed.
// Standing "attack position": on the pegs, knees bent, elbows up.
export function riderPose(lean = 0, crouch = 0) {
  const c = Math.max(-0.3, Math.min(1, crouch));
  const hip = {
    x: -0.3 + lean * 0.16 - c * 0.04,
    y: PEG.y + 0.74 - c * 0.24 - Math.abs(lean) * 0.06,
  };
  const torsoA = 0.74 + lean * 0.26 + c * 0.18; // radians forward from vertical
  const shoulder = { x: hip.x + Math.sin(torsoA) * LIMB.torso, y: hip.y + Math.cos(torsoA) * LIMB.torso };
  const head = { x: shoulder.x + 0.07 + lean * 0.03, y: shoulder.y + 0.2 };
  const foot = { x: PEG.x, y: PEG.y };
  const knee = ik(hip, foot, LIMB.thigh, LIMB.shin, 1);
  const hand = { x: GRIP.x, y: GRIP.y };
  const elbow = ik(shoulder, hand, LIMB.upper, LIMB.fore, -1);
  return { hip, knee, foot, shoulder, elbow, hand, head, torsoA };
}

// Transform a local pose point to world space for a chassis at (x, y, angle).
export function toWorld(p, cx, cy, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: cx + p.x * c - p.y * s, y: cy + p.x * s + p.y * c };
}
