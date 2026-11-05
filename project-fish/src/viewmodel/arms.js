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

// A slice across the grip is a rounded rectangle. sectionSurface(section, deg)
// gives the point on it at angle `deg` round it (0 = right side, 90 = front,
// 180 = left side) and the direction straight out of the surface there, as
// 2D coordinates [right, front]. `section` is the grip (GRIP), or anything
// shaped like it: { top, down, front, halfWidth, halfDepth, cornerRadius }.
function sectionSurface(section, deg) {
  const { halfWidth: a, halfDepth: b, cornerRadius: r } = section;
  const distance = (x, y) => {
    const qx = Math.abs(x) - (a - r);
    const qy = Math.abs(y) - (b - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
  const dx = Math.cos(deg * DEG);
  const dy = Math.sin(deg * DEG);
  let inside = 0;
  let outside = 0.08;
  for (let i = 0; i < 40; i++) {
    const mid = (inside + outside) / 2;
    if (distance(dx * mid, dy * mid) < 0) inside = mid;
    else outside = mid;
  }
  const x = dx * inside;
  const y = dy * inside;
  const e = 1e-6;
  const nx = distance(x + e, y) - distance(x - e, y);
  const ny = distance(x, y + e) - distance(x, y - e);
  const len = Math.hypot(nx, ny);
  return { x, y, nx: nx / len, ny: ny / len };
}

// A point round a section: `u` metres down from its top, at angle `deg`,
// `offset` metres out from its surface.
function around(section, u, deg, offset) {
  const p = sectionSurface(section, deg);
  return section.top.clone()
    .addScaledVector(section.down, u)
    .addScaledVector(RIGHT, p.x + p.nx * offset)
    .addScaledVector(section.front, p.y + p.ny * offset);
}

const aroundGrip = (u, deg, offset) => around(GRIP, u, deg, offset);

// A finger curled round a section from its knuckle. Each next joint is one
// bone length further round (direction +1 = from the right side towards the
// front, -1 = from the left side), resting on the surface, or on whatever
// `under` metres thick lies in between (the other hand's fingers). Fingers
// press in very slightly. `startDeg`: roughly where round the section the
// knuckle is (worked out if not given).
function curlRound(section, knuckle, lengths, radii, direction = 1, under = 0, startDeg = null) {
  const rel = knuckle.clone().sub(section.top);
  const u = rel.dot(section.down);
  let deg = startDeg ?? Math.atan2(rel.dot(section.front), rel.dot(RIGHT)) / DEG;
  const joints = [knuckle.clone()];
  for (let i = 0; i < 3; i++) {
    const offset = under + radii[i + 1] * 0.92;
    const previous = joints[i];
    let near = deg;
    let far = deg + direction * 170;
    for (let k = 0; k < 40; k++) {
      const mid = (near + far) / 2;
      if (around(section, u, mid, offset).distanceTo(previous) < lengths[i]) near = mid;
      else far = mid;
    }
    deg = (near + far) / 2;
    joints.push(around(section, u, deg, offset));
  }
  return { joints, radii };
}

// A finger curled round the grip, its knuckle at angle `startDeg`,
// `knuckleOffset` out from the grip, `u` metres down from the grip's top.
function curledFinger(u, startDeg, knuckleOffset, lengths, radius, direction = 1, under = 0) {
  const radii = [radius * 1.08, radius, radius * 0.94, radius * 0.86];
  return curlRound(GRIP, aroundGrip(u, startDeg, knuckleOffset), lengths, radii, direction, under, startDeg);
}

// Bone lengths (knuckle to middle joint, middle to last joint, last joint to
// tip) and thickness of each finger, for a gloved adult hand, in metres.
export const FINGERS = {
  index: { lengths: [0.046, 0.027, 0.022], radius: 0.0094 },
  middle: { lengths: [0.05, 0.031, 0.024], radius: 0.0098 },
  ring: { lengths: [0.047, 0.029, 0.023], radius: 0.0094 },
  little: { lengths: [0.037, 0.021, 0.02], radius: 0.0085 },
};

function bones(finger) {
  const out = [];
  for (let i = 0; i < finger.joints.length - 1; i++) {
    out.push(roundCone(finger.joints[i], finger.joints[i + 1], finger.radii[i], finger.radii[i + 1]));
  }
  return out;
}

// The knuckle bumps on the back of a finger's middle and last joints. The back
// of a finger faces away from the grip's centre line.
function knuckleBumps(finger) {
  const out = [];
  for (const j of [1, 2]) {
    const joint = finger.joints[j];
    const axis = finger.joints[j + 1].clone().sub(finger.joints[j - 1]).normalize();
    const onAxis = GRIP.top.clone().addScaledVector(GRIP.down, joint.clone().sub(GRIP.top).dot(GRIP.down));
    const away = joint.clone().sub(onAxis);
    const back = away.addScaledVector(axis, -away.dot(axis)).normalize();
    const r = finger.radii[j];
    out.push(ellipsoid(joint.clone().addScaledVector(back, r * 0.72), r * 0.5, r * 0.42, r * 0.7, basis(axis, back)));
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

// Right (shooting) hand: a high grip, palm on the right side and back of the
// grip, middle, ring and little fingers curled round the front strap (the
// middle finger tucked up under the trigger guard), index finger on the
// trigger, thumb over the back and forward along the left side of the frame.
export function rightHandPose() {
  const { index, middle, ring, little } = FINGERS;
  const fingers = [
    { // index, on the trigger
      joints: [V(0.03, -0.052, 0.002), V(0.024, -0.047, -0.04), V(0.0095, -0.05, -0.066), V(-0.006, -0.0515, -0.0695)],
      radii: [index.radius * 1.1, index.radius * 1.03, index.radius * 0.97, index.radius * 0.88],
    },
    curledFinger(0.018, -15, 0.0185, middle.lengths, middle.radius),
    curledFinger(0.037, -15, 0.018, ring.lengths, ring.radius),
    curledFinger(0.055, -12, 0.017, little.lengths, little.radius),
  ];
  // The thumb's base is buried in the thumb muscle behind the grip; the thumb
  // itself runs forward along the left side, so from behind it's foreshortened.
  const thumb = {
    joints: [V(-0.004, -0.061, 0.071), V(-0.019, -0.036, 0.041), V(-0.0235, -0.025, 0.012), V(-0.0235, -0.0215, -0.0145)],
    radii: [0.0116, 0.0108, 0.01, 0.0091],
  };
  // The web between thumb and index finger sits high on the back of the grip,
  // just under the beavertail.
  const web = { center: V(0.006, -0.037, 0.043), radii: [0.019, 0.0085, 0.012] };
  return { fingers, thumb, web, wrist: V(0.024, -0.1, 0.098), elbow: V(0.17, -0.2, 0.32), awayFromGrip: V(1, 0, 0) };
}

// Left (support) hand: palm heel on the left side of the grip over the right
// hand's fingertips, fingers curled round the front on top of the right
// hand's fingers (the index finger just under the trigger guard), thumb
// forward along the left side under the right thumb.
export function leftHandPose() {
  const { index, middle, ring, little } = FINGERS;
  const over = 0.0195; // the right hand's fingers are this thick
  const fingers = [
    curledFinger(0.024, 200, 0.031, index.lengths, index.radius, -1, over),
    curledFinger(0.041, 200, 0.032, middle.lengths, middle.radius, -1, over),
    curledFinger(0.057, 198, 0.031, ring.lengths, ring.radius, -1, over),
    curledFinger(0.071, 194, 0.029, little.lengths, little.radius, -1, over * 0.8),
  ];
  const thumb = {
    joints: [V(-0.044, -0.082, 0.07), V(-0.031, -0.053, 0.04), V(-0.025, -0.0425, 0.006), V(-0.0245, -0.0405, -0.023)],
    radii: [0.0122, 0.0114, 0.0104, 0.0094],
  };
  return { fingers, thumb, wrist: V(-0.052, -0.114, 0.088), elbow: V(-0.19, -0.21, 0.29), awayFromGrip: V(-1, 0, 0) };
}

// --- Building ---------------------------------------------------------------

// The shapes a hand is made of, as distance functions (see sdf.js): the palm
// (with the metacarpal bones running out to the knuckles), each finger, the
// thumb and the knuckle pads, blended into one glove. The support hand's
// skeleton (supportHand.js) uses the parts to work out which bone each bit of
// the glove follows.
export function handShapes(pose, { pads: withPads = true } = {}) {
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
  const metacarpals = [];
  const spread = [-0.019, -0.0063, 0.0063, 0.018];
  mcps.forEach((mcp, i) => {
    const base = wrist.clone().addScaledVector(across, spread[i]).addScaledVector(along, 0.014);
    metacarpals.push({ base, shape: roundCone(base, mcp, 0.0115, fingers[i].radii[0]) });
  });
  const palmBody = [];
  const palmCenter = wrist.clone().lerp(middle, 0.55).addScaledVector(back, -0.003);
  palmBody.push(ellipsoid(palmCenter, 0.038, 0.04, 0.0115, basis(along, across)));
  palmBody.push(roundCone(wrist, wrist.clone().addScaledVector(forearm, 0.06), 0.0255, 0.028));

  // Thumb muscle, between the thumb's base and the index knuckle.
  const thenarCenter = thumb.joints[0].clone().lerp(thumb.joints[1], 0.45).lerp(palmCenter, 0.3);
  palmBody.push(ellipsoid(thenarCenter, 0.028, 0.018, 0.016, basis(thumb.joints[1].clone().sub(thumb.joints[0]), back)));
  if (pose.web) palmBody.push(ellipsoid(pose.web.center, ...pose.web.radii, basis(V(1, 0, 0), V(0, 1, 0))));
  const palm = [...metacarpals.map((m) => m.shape), ...palmBody];

  // Moulded knuckle pads on the back of the glove.
  const padShapes = mcps.map((mcp, i) => ellipsoid(
    mcp.clone().addScaledVector(back, fingers[i].radii[0] * 0.8),
    0.0085, 0.0075, 0.0042, basis(across, along),
  ));

  // Joints within a finger blend smoothly, the fingers and thumb melt into
  // the palm, but neighbouring fingers stay separate, with a crease between.
  const palmFn = blend(palm, 0.012);
  const thumbFn = blend([...bones(thumb), ...knuckleBumps(thumb)], 0.004);
  const fingerFns = fingers.map((f) => blend([...bones(f), ...knuckleBumps(f)], 0.004));
  const padFn = withPads ? blend(padShapes, 0.002) : () => 1;
  const glove = (x, y, z) => {
    let f = Infinity;
    for (const fn of fingerFns) f = Math.min(f, fn(x, y, z));
    let d = smoothMin(palmFn(x, y, z), thumbFn(x, y, z), 0.01);
    d = smoothMin(d, f, 0.007);
    return withPads ? smoothMin(d, padFn(x, y, z), 0.003) : d;
  };
  return {
    glove, palmFn, palmBodyFn: blend(palmBody, 0.012), thumbFn, fingerFns, padFn,
    metacarpalBases: metacarpals.map((m) => m.base),
    all: [...palm, ...padShapes, ...bones(thumb), ...fingers.flatMap(bones)],
    frame: { along, across, back, palmCenter }, forearm,
  };
}

function buildHand(pose, colors, { pads: withPads = true } = {}) {
  const { wrist } = pose;
  const { glove, padFn, all, frame, forearm } = handShapes(pose, { pads: withPads });
  const { back, palmCenter } = frame;

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
  const gloveGeometry = meshFromDistance(glove, boundsOf(all, 0.006), HAND_STEP, colorAt);

  // Wrist strap where the glove meets the sleeve.
  const strapA = wrist.clone().addScaledVector(forearm, 0.016);
  const strap = roundCone(strapA, strapA.clone().addScaledVector(forearm, 0.022), 0.0282, 0.0292);
  const strapGeometry = meshFromDistance(blend([strap], 0.001), boundsOf([strap], 0.004), 0.002);

  return { gloveGeometry, strapGeometry, forearm, frame };
}

function buildSleeve(pose, forearm, { folds: withFolds = true } = {}) {
  const start = pose.wrist.clone().addScaledVector(forearm, 0.034);
  // Further up the arm than the forearm is long, so its end stays off screen.
  const end = pose.wrist.clone().addScaledVector(forearm, 0.55);
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
    const named = (mesh, name) => Object.assign(mesh, { name: `${part.side}_${name}` });
    group.add(
      named(new THREE.Mesh(part.glove, glove), 'glove'),
      named(new THREE.Mesh(part.strap, strap), 'strap'),
      named(new THREE.Mesh(part.sleeve, sleeve), 'sleeve'),
    );
    arms.add(group);
  }
  return arms;
}
