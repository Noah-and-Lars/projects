// Gloved hands and sleeved forearms, holding the pistol in a two-handed grip.
//
// Everything is in gun space (see pistol.js). Each finger is a chain of bones
// wrapped around the grip; bones, palm and thumb muscle are blended into one
// smooth glove, and each forearm into a sleeve with fabric folds.

import * as THREE from 'three';
import { GRIP } from './pistol.js';
import { roundCone, ellipsoid, blend, smoothMin, boundsOf, meshFromDistance } from './sdf.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RIGHT = V(1, 0, 0);
const DEG = Math.PI / 180;

// Mesh detail in metres. Smaller is smoother but slower to build.
const HAND_STEP = 0.0018;
const SLEEVE_STEP = 0.003;

// A point around the grip: `u` metres down from its top, at angle `deg` around
// it (0 = right side, 90 = front strap, 180 = left side), `offset` metres out
// from its surface.
function aroundGrip(u, deg, offset) {
  const a = GRIP.halfWidth;
  const b = GRIP.halfDepth;
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  let nx = c / a;
  let nf = s / b;
  const len = Math.hypot(nx, nf);
  nx /= len;
  nf /= len;
  return GRIP.top.clone()
    .addScaledVector(GRIP.down, u)
    .addScaledVector(RIGHT, a * c + nx * offset)
    .addScaledVector(GRIP.front, b * s + nf * offset);
}

// A finger wrapped around the grip: joints at the given angles and offsets.
function wrappedFinger(u, angles, offsets, radius) {
  return {
    joints: angles.map((deg, i) => aroundGrip(u, deg, offsets[i])),
    radii: [radius * 1.08, radius, radius * 0.94, radius * 0.86],
  };
}

function bones(finger) {
  const out = [];
  for (let i = 0; i < finger.joints.length - 1; i++) {
    out.push(roundCone(finger.joints[i], finger.joints[i + 1], finger.radii[i], finger.radii[i + 1]));
  }
  return out;
}

// Rotation whose X axis is `x`, with Y as close to `yHint` as possible.
function basis(x, yHint) {
  const ax = x.clone().normalize();
  const az = new THREE.Vector3().crossVectors(ax, yHint).normalize();
  const ay = new THREE.Vector3().crossVectors(az, ax).normalize();
  return new THREE.Matrix4().makeBasis(ax, ay, az);
}

// --- Poses -------------------------------------------------------------------

// Right (shooting) hand: palm on the right side and back of the grip, middle,
// ring and little fingers around the front, index finger on the trigger,
// thumb over the back and forward along the left side of the frame.
function rightHandPose() {
  const fingers = [
    { // index, on the trigger
      joints: [V(0.03, -0.052, 0.002), V(0.024, -0.047, -0.04), V(0.0095, -0.05, -0.066), V(-0.006, -0.0515, -0.0695)],
      radii: [0.0104, 0.0097, 0.0091, 0.0083],
    },
    wrappedFinger(0.022, [-10, 70, 132, 172], [0.0185, 0.0098, 0.0098, 0.009], 0.0098),
    wrappedFinger(0.041, [-10, 68, 128, 166], [0.018, 0.0094, 0.0094, 0.0087], 0.0094),
    wrappedFinger(0.059, [-10, 62, 116, 150], [0.017, 0.0086, 0.0086, 0.008], 0.0086),
  ];
  const thumb = {
    joints: [V(0.03, -0.06, 0.075), V(-0.012, -0.03, 0.052), V(-0.0235, -0.023, 0.018), V(-0.0235, -0.021, -0.01)],
    radii: [0.0122, 0.0114, 0.0104, 0.0094],
  };
  return { fingers, thumb, wrist: V(0.04, -0.098, 0.1), elbow: V(0.17, -0.2, 0.32), awayFromGrip: V(1, 0, 0) };
}

// Left (support) hand: palm on the left side over the right hand's fingertips,
// fingers wrapped around the front over the right hand's fingers, thumb
// forward along the left side under the right thumb.
function leftHandPose() {
  const out = (r) => 0.0195 + r; // outside the right hand's fingers
  const fingers = [
    wrappedFinger(0.014, [196, 145, 104, 74], [0.03, out(0.0094), out(0.0094), out(0.0087)], 0.0094),
    wrappedFinger(0.032, [196, 142, 98, 66], [0.031, out(0.0098), out(0.0098), out(0.009)], 0.0098),
    wrappedFinger(0.05, [194, 142, 100, 70], [0.03, out(0.0094), out(0.0094), out(0.0087)], 0.0094),
    wrappedFinger(0.066, [190, 146, 110, 84], [0.028, out(0.0086), out(0.0086), out(0.008)], 0.0086),
  ];
  const thumb = {
    joints: [V(-0.044, -0.082, 0.07), V(-0.031, -0.053, 0.04), V(-0.025, -0.0425, 0.006), V(-0.0245, -0.0405, -0.023)],
    radii: [0.0122, 0.0114, 0.0104, 0.0094],
  };
  return { fingers, thumb, wrist: V(-0.052, -0.114, 0.088), elbow: V(-0.19, -0.21, 0.29), awayFromGrip: V(-1, 0, 0) };
}

// --- Building ---------------------------------------------------------------

function buildHand(pose, colors, { pads: withPads = true } = {}) {
  const { fingers, thumb, wrist } = pose;
  const mcps = fingers.map((f) => f.joints[0]);
  const index = mcps[0];
  const little = mcps[mcps.length - 1];
  const middle = mcps[1];

  const along = middle.clone().sub(wrist).normalize(); // wrist → knuckles
  const across = little.clone().sub(index).projectOnPlane(along).normalize(); // index → little finger
  const back = new THREE.Vector3().crossVectors(along, across).normalize(); // back of the hand
  if (back.dot(pose.awayFromGrip) < 0) back.negate();
  const forearm = pose.elbow.clone().sub(wrist).normalize();

  // Palm: metacarpal bones fanning out from the wrist, filled out by a flat pad,
  // plus the wrist, which ends inside the sleeve.
  const palm = [];
  const spread = [-0.019, -0.0063, 0.0063, 0.018];
  mcps.forEach((mcp, i) => {
    const base = wrist.clone().addScaledVector(across, spread[i]).addScaledVector(along, 0.014);
    palm.push(roundCone(base, mcp, 0.0115, fingers[i].radii[0]));
  });
  const palmCenter = wrist.clone().lerp(middle, 0.55).addScaledVector(back, -0.003);
  palm.push(ellipsoid(palmCenter, 0.038, 0.04, 0.0115, basis(along, across)));
  palm.push(roundCone(wrist, wrist.clone().addScaledVector(forearm, 0.06), 0.0255, 0.028));

  // Thumb muscle, between the thumb's base and the index knuckle.
  const thenarCenter = thumb.joints[0].clone().lerp(thumb.joints[1], 0.45).lerp(palmCenter, 0.35);
  palm.push(ellipsoid(thenarCenter, 0.027, 0.016, 0.014, basis(thumb.joints[1].clone().sub(thumb.joints[0]), back)));

  // Moulded knuckle pads on the back of the glove.
  const pads = mcps.map((mcp, i) => ellipsoid(
    mcp.clone().addScaledVector(back, fingers[i].radii[0] * 0.8),
    0.0085, 0.0075, 0.0042, basis(across, along),
  ));

  // Joints within a finger blend smoothly, the fingers and thumb melt into
  // the palm, but neighbouring fingers stay separate, with a crease between.
  const palmFn = blend(palm, 0.012);
  const thumbFn = blend(bones(thumb), 0.004);
  const fingerFns = fingers.map((f) => blend(bones(f), 0.004));
  const padFn = withPads ? blend(pads, 0.002) : () => 1;
  const glove = (x, y, z) => {
    let f = Infinity;
    for (const fn of fingerFns) f = Math.min(f, fn(x, y, z));
    let d = smoothMin(palmFn(x, y, z), thumbFn(x, y, z), 0.01);
    d = smoothMin(d, f, 0.007);
    return withPads ? smoothMin(d, padFn(x, y, z), 0.003) : d;
  };

  // Colours: fabric on the back, darker synthetic leather on the palm side, black pads.
  const fabric = new THREE.Color(colors.fabric);
  const leather = new THREE.Color(colors.palm);
  const pad = new THREE.Color(colors.pads);
  const p = new THREE.Vector3();
  const colorAt = (x, y, z) => {
    if (padFn(x, y, z) < 0.0006) return pad;
    p.set(x, y, z);
    return p.sub(palmCenter).dot(back) < -0.004 ? leather : fabric;
  };
  const all = [...palm, ...pads, ...bones(thumb), ...fingers.flatMap(bones)];
  const gloveGeometry = meshFromDistance(glove, boundsOf(all, 0.006), HAND_STEP, colorAt);

  // Wrist strap where the glove meets the sleeve.
  const strapA = wrist.clone().addScaledVector(forearm, 0.016);
  const strap = roundCone(strapA, strapA.clone().addScaledVector(forearm, 0.022), 0.0282, 0.0292);
  const strapGeometry = meshFromDistance(blend([strap], 0.001), boundsOf([strap], 0.004), 0.002);

  return { gloveGeometry, strapGeometry, forearm, frame: { along, across, back, palmCenter } };
}

function buildSleeve(pose, forearm, { folds: withFolds = true } = {}) {
  const start = pose.wrist.clone().addScaledVector(forearm, 0.034);
  const end = pose.wrist.clone().addScaledVector(forearm, 0.27);
  const arm = roundCone(start, end, 0.036, 0.045);
  const cuff = roundCone(start, start.clone().addScaledVector(forearm, 0.018), 0.0375, 0.038);

  // Two directions across the forearm, to measure the angle around it.
  const side1 = new THREE.Vector3().crossVectors(forearm, V(0, 1, 0)).normalize();
  const side2 = new THREE.Vector3().crossVectors(forearm, side1).normalize();
  const shapes = [arm, cuff];
  const base = blend(shapes, 0.006);
  const fn = (x, y, z) => {
    const dx = x - start.x, dy = y - start.y, dz = z - start.z;
    const t = dx * forearm.x + dy * forearm.y + dz * forearm.z; // distance along the arm
    const around = Math.atan2(dx * side1.x + dy * side1.y + dz * side1.z, dx * side2.x + dy * side2.y + dz * side2.z);
    // Soft folds that wander round the arm, bunched up more near the cuff.
    const folds = Math.sin(t * 85 + 1.6 * Math.sin(around * 3 + t * 18)) * 0.0016
      + Math.sin(t * 150 + around * 2 + 1.3) * 0.0012 * Math.exp(-Math.max(t - 0.02, 0) * 14);
    if (!withFolds) return base(x, y, z);
    return base(x, y, z) - (t > 0.016 ? folds : folds * Math.max(t, 0) / 0.016);
  };
  return meshFromDistance(fn, boundsOf(shapes, 0.008), SLEEVE_STEP);
}

const COLORS = { fabric: 0x232427, palm: 0x1c1a18, pads: 0x121212 };

// The posed shapes for both arms. The game uses them as they are; the Blender
// tools (tools/) use the plain versions (no knuckle pads or folds) as the
// starting point for the detailed models in assets/arms.glb.
export function buildArmParts({ plain = false } = {}) {
  return [['right', rightHandPose()], ['left', leftHandPose()]].map(([side, pose]) => {
    const hand = buildHand(pose, COLORS, { pads: !plain });
    return {
      side,
      pose,
      frame: { ...hand.frame, forearm: hand.forearm },
      glove: hand.gloveGeometry,
      strap: hand.strapGeometry,
      sleeve: buildSleeve(pose, hand.forearm, { folds: !plain }),
    };
  });
}

// Simple built-in arms, used if assets/arms.glb can't be loaded.
export function createArms() {
  const arms = new THREE.Group();
  arms.name = 'arms';

  const glove = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const strap = new THREE.MeshStandardMaterial({ color: 0x191919, roughness: 0.95, metalness: 0 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x4d533f, roughness: 0.96, metalness: 0 });

  for (const part of buildArmParts()) {
    const group = new THREE.Group();
    group.name = part.side + 'Arm';
    group.add(
      new THREE.Mesh(part.glove, glove),
      new THREE.Mesh(part.strap, strap),
      new THREE.Mesh(part.sleeve, sleeve),
    );
    arms.add(group);
  }
  return arms;
}
