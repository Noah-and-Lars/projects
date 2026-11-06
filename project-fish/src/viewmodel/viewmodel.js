// The first-person view of the hands and gun.
//
// They live in their own small scene with their own camera, drawn after the
// world on top of it. That way the gun never pokes into walls, and its size on
// screen doesn't change with the player's field of view.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { createPistol, GRIP, SIGHTS, MAGAZINE, SLIDE } from './pistol.js';
import { createPistol45, MODEL45, FALLBACK45 } from './pistol45.js';
import { MODEL9 } from './pistol9.js';
import { MODEL_BERETTA } from './beretta.js';
import { MODEL_FN502 } from './fn502.js';
import { MODEL_HIPISTOL } from './hipistol.js';
import { MODEL_X4 } from './x4.js';
import { MODEL_MP7 } from './mp7.js';
import { MODEL_AR15 } from './ar15.js';
import { AnimatedGun } from './animatedGun.js';
import { GunGloves } from './gunGloves.js';
import { createArms, rightHandPose } from './arms.js';
import { SupportHand, WRIST, HOLD_TURN, holdingAt, handMatrix, OVER_TURN, OVER_SLIDE } from './supportHand.js';
import { ShootingHand, MAG_RELEASE } from './shootingHand.js';
import { ViewmodelMotion, MOTION } from './motion.js';
import { MuzzleFlash } from '../effects/muzzleFlash.js';
import { outdoorEnvironment } from '../world.js';
import { RELOAD_STEPS, CATCH_GAP, magazineFall, INSPECT, INSPECT_STEPS, reloadSteps } from '../weapon.js';
import { PISTOL, PISTOL45, BERETTA, FN502, HIPISTOL, X4, MP7, AR15, LOADOUT } from '../shared/config.js';

// Points on the built-in first pistol (gun space; used if its model file
// can't be loaded; the model's are in pistol9.js): the
// muzzle, and the ejection port the spent case comes out of; the sight line
// (pistol.js); how far the slide goes back when firing (metres), and the
// top and half width of the slide; the barrel, which only follows the slide
// a little way, its back end tipping down as it unlocks (pivoting near the
// muzzle), like a real pistol's; and the slide stop, which turns up
// (radians) about the pin at its back end into the slide's notch when the
// slide locks back empty. It has no hammer to show (it's striker fired), and
// its magazine release is in shootingHand.js. The second pistol's are in
// pistol45.js. A gun whose magazine slides out at a slightly different angle
// from the grip line has its own magDown.)
const POINTS9 = {
  muzzle: [0, 0, -0.1545],
  port: [0.008, 0.017, -0.025],
  sights: SIGHTS,
  slideTravel: 0.028,
  slideTop: SLIDE.top,
  slideHalfWidth: SLIDE.halfWidth,
  barrel: { travel: 0.0035, tilt: 0.0105, pivot: new THREE.Vector3(0, 0, -0.15) },
  slideStop: { lift: 0.12, pivot: new THREE.Vector3(0, -0.0143, 0.0085) },
  hammer: null,
  magRelease: null,
};
// How far the trigger comes back (metres); how far the extractor's loaded-
// chamber bump sinks in when there's no round in the chamber; how far the
// trigger's safety blade presses in as the trigger is pulled.
const TRIGGER_TRAVEL = 0.0032;
const INDICATOR_TRAVEL = 0.0006;
const BLADE_TRAVEL = 0.0009;

// If the model of a gun with its own arms can't be loaded, the PF-9's built-
// in stand-in takes its place, held by the usual hands: its rules, but the
// PF-9's reloads and inspect (theirs follow their own animations).
const standIn = (rules) => ({
  ...rules,
  reloadTime: PISTOL.reloadTime,
  emptyReloadTime: PISTOL.emptyReloadTime,
  reloadSteps: undefined,
  inspectTime: undefined,
  inspectLocked: undefined,
  inspect: undefined,
});

// The guns: their rules (src/shared/config.js), their models (made in
// Blender, see tools/blender/) with simpler built-in ones in case a file
// can't be loaded, and the points on each. A gun that brings its own arms
// and animations (`animated`, see animatedGun.js) has its constants there
// instead, where it's held (`rig`, see RIG), and the rules its stand-in
// follows (`fallbackRules`).
const GUN_KINDS = {
  pistol: { rules: PISTOL, model: new URL('../../assets/pistol.glb', import.meta.url), fallback: createPistol, points: MODEL9, fallbackPoints: POINTS9 },
  pistol45: { rules: PISTOL45, model: new URL('../../assets/pistol45.glb', import.meta.url), fallback: createPistol45, points: MODEL45, fallbackPoints: FALLBACK45 },
  beretta: {
    rules: BERETTA, model: new URL('../../assets/beretta.glb', import.meta.url), animated: MODEL_BERETTA,
    // (Its rear sight where the M1911's is at the hip: see RIG.)
    rig: { sightAsAtHip: MODEL45.sights, kick: 0.4 },
    fallback: createPistol, fallbackPoints: POINTS9, fallbackRules: standIn(BERETTA),
  },
  fn502: {
    rules: FN502, model: new URL('../../assets/fn502.glb', import.meta.url), animated: MODEL_FN502,
    // (Its maker framed it close to the eye, its arms ending just past the
    // elbows, out of view. Moved out as far as the M1911's hold, those ends
    // would come into view. It's held 3 cm further out, 3 cm lower and 2 cm
    // to the right than its maker had it, with a slightly wider view at the
    // hip: as far as the arms' ends stay out of view through every clip, at
    // 16:9, 21:9 and 4:3, with a margin. That shows it a little bigger than
    // the others, its rear sight about where theirs is.)
    rig: { hip: new THREE.Vector3(0.02, -0.03, -0.03), viewFov: 64, kick: 0.4 },
    fallback: createPistol, fallbackPoints: POINTS9, fallbackRules: standIn(FN502),
  },
  hipistol: {
    rules: HIPISTOL, model: new URL('../../assets/hipistol.glb', import.meta.url), animated: MODEL_HIPISTOL,
    // (Its maker holds it low on the right at the hip, with the support
    // arm below the view. It's held 1 cm right, 1 cm lower and 2 cm further
    // out than that, which brings it in to about where the others are; any
    // higher and the support arm's sleeve comes into view at the bottom
    // left. Aiming, its own aimed clips play and the gun layer lines up
    // their sights.)
    // (Its run clip is its maker's sprint pose, the gun held low across the
    // chest, so it doesn't take the gun layer's too; that pose is held 7 cm
    // higher, or the gun would be all but out of view.)
    rig: { hip: new THREE.Vector3(0.01, -0.01, -0.02), kick: 0.4, sprintPose: 0, sprintOut: new THREE.Vector3(0, 0.07, 0) },
    fallback: createPistol, fallbackPoints: POINTS9, fallbackRules: standIn(HIPISTOL),
  },
  // The guns whose makers' clips were put on the soldier's own arms
  // (soldierRig.js).
  x4: {
    rules: X4, model: new URL('../../assets/x4.glb', import.meta.url), animated: MODEL_X4,
    rig: { hip: new THREE.Vector3(0.015, 0.005, -0.02), kick: 0.4, aimLevel: 1, sprintPose: 0, sprintOut: new THREE.Vector3(0, 0.1, 0.03) },
    fallback: createPistol, fallbackPoints: POINTS9, fallbackRules: standIn(X4),
  },
  mp7: {
    rules: MP7, model: new URL('../../assets/mp7.glb', import.meta.url), animated: MODEL_MP7,
    rig: {
      hip: new THREE.Vector3(0.03, -0.035, -0.02), kick: 0.3, aimLevel: 1, sprintPose: 0, sprintOut: new THREE.Vector3(0, 0.1, 0.03),
      suppressed: true, redDot: { radius: 0.0095 },
    },
    fallback: createPistol, fallbackPoints: POINTS9, fallbackRules: standIn(MP7),
  },
  // (Its maker framed it shouldered, low on the right; it's held 2 cm
  // further right, 2.5 cm lower and 3 cm further out, which shows a little
  // less of the optic at the hip, with the arms' ends out of view through
  // both reloads and its draw at 16:9, 21:9 and 4:3, looking down too. It
  // has no shot clip, so it takes more of the gun layer's kick than the
  // others with their own arms. Aiming, the eyepiece of its magnifier is
  // 16 cm from the eye: further and the stock fills the bottom of the view,
  // as it runs back under the eye. It has no run clip, so it takes the gun
  // layer's sprint pose like the PF-9. Its holographic sight's reticle
  // isn't on the model, so a dot is drawn (redDot: in the eyepiece, seen
  // through the glass).)
  ar15: {
    rules: AR15, model: new URL('../../assets/ar15.glb', import.meta.url), animated: MODEL_AR15,
    rig: {
      hip: new THREE.Vector3(0.02, -0.025, -0.03), kick: 0.6, aimLevel: 1, eyeRelief: 0.16,
      suppressed: true, redDot: { radius: 0.0188 },
    },
    fallback: createPistol, fallbackPoints: POINTS9, fallbackRules: standIn(AR15),
  },
};

// Switching guns: the one in the hands drops down out of view, turning away
// (seconds, and how far it goes: metres, and radians muzzle up, muzzle left,
// top left), and the other comes up the same way.
export const SWITCH = { lower: 0.2, raise: 0.3, drop: new THREE.Vector3(0.03, -0.24, 0.06), turn: [-0.75, 0.3, 0.35] };

// Turns a part `angle` radians about the line across the gun (along X)
// through `pivot` (in its parent's space), starting from where it rests. The
// model file doesn't keep the origins its parts were made about (compressing
// it moves them to each part's middle), so this goes by the pivot instead.
const ACROSS = new THREE.Vector3(1, 0, 0);
const turning = new THREE.Quaternion();
function turnAbout(part, rest, pivot, angle) {
  turning.setFromAxisAngle(ACROSS, angle);
  part.position.copy(rest.position).sub(pivot).applyQuaternion(turning).add(pivot);
  part.quaternion.copy(turning).multiply(rest.quaternion);
}
const restOf = (part) => part && { position: part.position.clone(), quaternion: part.quaternion.clone() };

// How much higher (metres along the grip) a gun's magazine bottom is than
// the one the hands are posed for (MAGAZINE.base): from its lowest point
// along the grip.
function magazineSeat(pistol, magazine) {
  pistol.updateMatrixWorld(true);
  const toGun = pistol.matrixWorld.clone().invert();
  const p = new THREE.Vector3();
  let deepest = -Infinity;
  magazine.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const m = toGun.clone().multiply(o.matrixWorld);
    const position = o.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i).applyMatrix4(m);
      deepest = Math.max(deepest, p.sub(GRIP.top).dot(GRIP.down));
    }
  });
  if (!Number.isFinite(deepest)) return 0;
  return THREE.MathUtils.clamp(MAGAZINE.base - deepest, -0.01, 0.03);
}

// A part's bounds in gun space (as it is now).
function partBox(pistol, part) {
  pistol.updateMatrixWorld(true);
  const toGun = pistol.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  part.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(toGun.clone().multiply(o.matrixWorld)));
  });
  return box;
}

// The front of a gun's trigger where the finger rests (gun space): the
// foremost point of its blade, about half way down it, on the middle line.
// Measured from the model, so each gun's trigger finger lands on its own.
function triggerFace(pistol, trigger) {
  pistol.updateMatrixWorld(true);
  const toGun = pistol.matrixWorld.clone().invert();
  const points = [];
  const p = new THREE.Vector3();
  const visit = (o) => {
    if (o.name === 'safety_blade') return; // it sticks out in front, and pushes in
    if (o.isMesh) {
      const m = toGun.clone().multiply(o.matrixWorld);
      const position = o.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) points.push(p.fromBufferAttribute(position, i).applyMatrix4(m).clone());
    }
    for (const c of o.children) visit(c);
  };
  visit(trigger);
  if (!points.length) return new THREE.Vector3(0, -0.05, -0.058);
  let lo = Infinity;
  let hi = -Infinity;
  for (const q of points) {
    lo = Math.min(lo, q.y);
    hi = Math.max(hi, q.y);
  }
  const y = (lo + hi) / 2;
  let z = Infinity;
  for (const q of points) if (Math.abs(q.y - y) < 0.003 && Math.abs(q.x) < 0.004) z = Math.min(z, q.z);
  if (!Number.isFinite(z)) for (const q of points) z = Math.min(z, q.z);
  return new THREE.Vector3(0, y, z);
}
// How far an attachment is moved for the mount it sits on (see pistol9.js).
const place = (extra, on) => (extra && extra.on && extra.on[on] && extra.on[on].offset) || [0, 0, 0];

// Where the gun goes while reloading, relative to how it's held: brought up
// and in, muzzle tipped up so the magazine well comes into view, and canted
// a little towards the support hand (radians: muzzle up, muzzle right, top
// towards the right).
const RELOAD_POSE = { position: new THREE.Vector3(-0.04, 0.15, 0.11), turn: [0.45, -0.1, -0.35] };

// --- The hands during a reload ----------------------------------------------
//
// The shooting hand's thumb comes down onto the magazine release and presses
// it. From empty, the support hand has already let go and is heading for the
// belt, and the empty magazine drops free. With rounds left, the support hand
// turns palm up under the grip first, the old magazine drops into it, and it
// pulls it out and takes it down to the pouch to swap it. Either way it comes
// back palm up with a fresh magazine, baseplate in the palm and index finger
// along the front, lines it up under the magazine well and pushes it straight
// in: the fingers slide off the front as it goes up into the grip, and the
// palm pushes it home. Then the hand drops away, turns back and comes up
// beside the grip, and closes round it again.

// How far the magazine is from fully home (metres along the grip) when its
// top is at the mouth of the magazine well. (With rounds left, the old one
// lands in the hand waiting CATCH_GAP below, far enough out for the fingers
// to close on it below the grip; see weapon.js.)
const MAG_AT_WELL = GRIP.bottom - MAGAZINE.top;
// An empty magazine that's dropped is handed over to the world (where it
// lands on the ground and stays) once it has fallen this far, out of view.
const HAND_TO_WORLD = 0.3;
// The magazine's own frame (gun space, seated): centred halfway between its
// top and the bottom of its baseplate, X to the right, Y up along it.
const MAGAZINE_CENTER = GRIP.top.clone().addScaledVector(GRIP.front, MAGAZINE.forward).addScaledVector(GRIP.down, (MAGAZINE.top + MAGAZINE.base) / 2);
const MAGAZINE_TURN = (() => {
  const x = new THREE.Vector3(1, 0, 0);
  const y = GRIP.down.clone().negate();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)));
})();
const MAGAZINE_FRAME = new THREE.Matrix4().compose(MAGAZINE_CENTER, MAGAZINE_TURN, new THREE.Vector3(1, 1, 1));

const NONE = new THREE.Quaternion();
const turned = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
const between = (a, b, k) => new THREE.Quaternion().slerpQuaternions(a, b, k);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const AT_BELT = turned(0.5, 0, 0.2);
const BELT = V(-0.095, -0.38, 0.21);

// Inspecting: where the support hand waits, down out of view, while the
// shooting hand turns the gun; when the magazine lands in it (seconds); and
// where the middle of the magazine is (gun space) and how it's turned (gun
// space, after being held palm up) as the hand holds it up to look at.
const LOW = V(-0.088, -0.34, 0.195);
const AT_LOW = turned(0.48, 0, 0.19);
const CAUGHT = INSPECT_STEPS.magCaught;
const LOOK = [
  { center: MAGAZINE_CENTER.clone().addScaledVector(GRIP.down, MAG_AT_WELL + 0.02).add(V(-0.07, 0.07, 0.07)), turn: turned(0.55, 0.25, 0) },
  { center: MAGAZINE_CENTER.clone().addScaledVector(GRIP.down, MAG_AT_WELL + 0.02).add(V(-0.075, 0.075, 0.075)), turn: turned(0.6, -0.1, 0) },
];
// Where the support hand goes (offset, turn) to hold the magazine with its
// middle at `center`, turned `turn` from palm up.
function holdingMagazine({ center, turn }) {
  const hold = HOLD_TURN.clone().premultiply(turn);
  // The magazine's middle in the hand as modelled (it's held as when it's
  // pushed home).
  const inHand = MAGAZINE_CENTER.clone().applyMatrix4(handMatrix(holdingAt(0), HOLD_TURN).invert());
  const at = center.clone().sub(WRIST).sub(inHand.clone().sub(WRIST).applyQuaternion(hold));
  return { at, turn: hold };
}

// The second half, the same for both: from taking hold of the fresh magazine
// at the belt (the hand turned `turn` there) to closing round the grip again,
// for a magazine that goes in along `down`.
const freshMagazine = (S, turn, down = GRIP.down, seat = 0) => [
  { r: S.magGrab, at: BELT.clone().add(V(0, -0.005, 0)), turn, hand: 'magazine', stop: true, name: 'grab' }, // closes round a fresh magazine
  { r: S.magGrab + 0.07, at: V(-0.08, -0.25, 0.15), turn: between(turn, HOLD_TURN, 0.5), hand: 'magazine' }, // pulls it out, turning it up
  { r: 0.5, at: holdingAt(MAG_AT_WELL + 0.05, down, seat).add(V(-0.03, -0.02, 0.04)), turn: HOLD_TURN, hand: 'magazine' },
  { r: 0.545, at: holdingAt(MAG_AT_WELL + 0.008, down, seat), turn: HOLD_TURN, hand: 'magazine', stop: true }, // lined up under the well
  { r: 0.59, at: holdingAt(0.055, down, seat), turn: HOLD_TURN, hand: 'pushing' }, // in it goes, the fingers sliding off its front...
  { r: S.magIn, at: holdingAt(0, down, seat), turn: HOLD_TURN, hand: 'flat', stop: true }, // ...and the palm pushes it home
  { r: 0.665, at: holdingAt(0, down, seat).addScaledVector(down, 0.022).add(V(-0.008, 0, 0)), turn: between(HOLD_TURN, NONE, 0.2), hand: 'flat' },
  { r: 0.725, at: V(-0.045, -0.07, 0.022), turn: between(HOLD_TURN, NONE, 0.62), hand: 'reaching' }, // turning back
  { r: 0.79, at: V(-0.028, -0.028, 0.01), turn: NONE, hand: 'reaching' }, // beside the grip
  { r: 0.815, at: V(-0.008, -0.01, 0.004), turn: NONE, hand: 'loose' }, // fingers round it...
  { r: S.handOn, at: V(0, 0, 0), turn: NONE, hand: 'grip', stop: true }, // ...and closed on it
];

// The inspect's keys (seconds) up to the magazine going back in, and the
// chamber check after it. A key from the end of a reload, moved to the same
// time after the magazine goes in as it is there.
const inInspect = (key) => ({ ...key, r: INSPECT.magIn + (key.r - RELOAD_STEPS.catching.magIn) * PISTOL.reloadTime });
const inspectHead = (down, seat) => [
  { r: 0, at: V(0, 0, 0), turn: NONE, hand: 'grip', stop: true },
  { r: 0.08, at: V(-0.012, -0.014, 0.008), turn: NONE, hand: 'loose' }, // fingers lift off the grip...
  { r: 0.15, at: V(-0.022, -0.03, -0.012), turn: turned(0.08, 0, 0.05), hand: 'loose' }, // ...off the front of the grip...
  { r: 0.27, at: V(-0.055, -0.18, 0.095), turn: turned(0.3, 0, 0.14), hand: 'reaching' }, // ...and away
  { r: 0.5, at: LOW, turn: AT_LOW, hand: 'relaxed', stop: true }, // down out of the way
  { r: 2.75, at: LOW, turn: AT_LOW, hand: 'relaxed', stop: true },
  { r: 3.05, at: V(-0.07, -0.2, 0.1), turn: between(AT_LOW, HOLD_TURN, 0.55), hand: 'reaching' }, // back up, turning palm up
  { r: INSPECT.magOut - 0.08, at: holdingAt(CATCH_GAP, down, seat), turn: HOLD_TURN, hand: 'flat', stop: true }, // under the magazine
  { r: CAUGHT, at: holdingAt(CATCH_GAP, down, seat), turn: HOLD_TURN, hand: 'flat', stop: true }, // it drops in...
  { r: CAUGHT + 0.08, at: holdingAt(CATCH_GAP + 0.008, down, seat), turn: HOLD_TURN, hand: 'pushing' }, // ...the hand gives a little and the fingers close...
  { r: CAUGHT + 0.16, at: holdingAt(MAG_AT_WELL + 0.03, down, seat), turn: HOLD_TURN, hand: 'magazine' }, // ...pulling it out
  { r: CAUGHT + 0.42, ...holdingMagazine(LOOK[0]), hand: 'magazine' }, // held up to look at...
  { r: INSPECT.magIn - 0.43, ...holdingMagazine(LOOK[1]), hand: 'magazine', stop: true }, // ...turning it a little
  // Lined up under the well, and in it goes.
  ...freshMagazine(RELOAD_STEPS.catching, HOLD_TURN, down, seat).slice(3, 6).map(inInspect),
];
// How far back the slide is eased to check the chamber: half way.
const PRESS_CHECK = 0.5;
// Let go, the slide snaps forward in this long (seconds).
const PRESS_SNAP = 0.035;
// How far back the slide is (a fraction of its full travel) `time` seconds
// into an inspect that checks the chamber: eased back as the hand moves it
// (the hand's keys there are stops, so its move is this same smoothstep),
// held, then snapping forward.
function pressCheckAt(time) {
  if (time < INSPECT.pull) return 0;
  if (time < INSPECT.release) return PRESS_CHECK * smoothstep(INSPECT.pull, INSPECT.pulled, time);
  return PRESS_CHECK * Math.max(0, 1 - (time - INSPECT.release) / PRESS_SNAP);
}
// The chamber check's keys, for a gun whose slide the hand takes hold of at
// OVER_SLIDE moved by `shift` (its slide is lower or narrower than the first
// pistol's) and goes back `travel` metres when it fires, and whose magazine
// goes in along `down`.
// It takes hold of the slide at its back (pinched over the top behind the
// ejection port, at the back serrations), within easy reach of the
// soldier's arm: this far back from where it would over the front.
const CHECK_REAR = V(0, 0.004, 0.1);
const inspectCheck = (shift, travel, down, seat) => {
  const over = OVER_SLIDE.clone().add(shift).add(CHECK_REAR);
  const PULLED = over.clone().add(V(0, 0, travel * PRESS_CHECK));
  return [
  { r: INSPECT.magIn + 0.075, at: holdingAt(0, down, seat).addScaledVector(down, 0.022).add(V(-0.008, 0, 0)), turn: between(HOLD_TURN, NONE, 0.2), hand: 'flat' }, // away from the magazine...
  { r: 5.07, at: over.clone().add(V(-0.045, -0.05, 0.03)), turn: between(HOLD_TURN, OVER_TURN, 0.55), hand: 'open' }, // ...up to the slide...
  { r: 5.26, at: over.clone().add(V(-0.014, -0.006, 0.004)), turn: OVER_TURN, hand: 'open', stop: true }, // ...beside it, open...
  { r: INSPECT.pull, at: over, turn: OVER_TURN, hand: 'slide', stop: true }, // ...and takes hold of it
  { r: INSPECT.pulled, at: PULLED, turn: OVER_TURN, hand: 'slide', stop: true }, // eases it back half way...
  { r: INSPECT.release - 0.05, at: PULLED, turn: OVER_TURN, hand: 'slide', stop: true }, // ...holds it while the chamber's checked...
  { r: INSPECT.release + 0.03, at: PULLED.clone().add(V(-0.012, 0.004, 0.004)), turn: OVER_TURN, hand: 'open' }, // ...and lets go (the fingers just ahead of it): it snaps forward
  { r: INSPECT.release + 0.15, at: PULLED.clone().add(V(-0.04, 0.02, 0.012)), turn: OVER_TURN, hand: 'open' }, // up and off it, clear of the top...
  { r: 6.5, at: V(-0.06, -0.045, 0.035), turn: between(OVER_TURN, NONE, 0.6), hand: 'reaching' }, // ...back down...
  { r: 6.62, at: V(-0.028, -0.028, 0.01), turn: NONE, hand: 'reaching' }, // ...beside the grip
  { r: 6.67, at: V(-0.008, -0.01, 0.004), turn: NONE, hand: 'loose' }, // fingers round it...
  { r: 6.72, at: V(0, 0, 0), turn: NONE, hand: 'grip', stop: true }, // ...and closed on it
  ];
};

// Racking the slide from behind, after an empty reload on a gun that's
// done that way (its reload steps have rackGrab): off the magazine, up and
// over the back of the slide, takes hold of it (palm on top, fingers over
// its right side, thumb along its left), pulls it back the last bit and lets
// go so it slingshots forward, and back round the grip.
const RACK_REAR = V(0, 0.004, 0.105); // from where it takes hold of the slide's front
const RACK_PULL = 0.006; // metres further back than locked
function rackFromBehind(E, shift, down, seat) {
  const rear = OVER_SLIDE.clone().add(shift).add(RACK_REAR);
  const pulled = rear.clone().add(V(0, 0, RACK_PULL));
  const back = E.handOn - E.slideRelease; // from letting go to holding the grip again
  return [
    { r: E.magIn + 0.03, at: holdingAt(0, down, seat).addScaledVector(down, 0.025).add(V(-0.01, 0, 0)), turn: between(HOLD_TURN, NONE, 0.2), hand: 'flat' }, // off the magazine...
    { r: E.rackGrab - 0.06, at: rear.clone().add(V(-0.05, 0.03, 0.03)), turn: between(HOLD_TURN, OVER_TURN, 0.6), hand: 'open' }, // ...up and over...
    { r: E.rackGrab - 0.02, at: rear.clone().add(V(-0.012, 0.008, 0.002)), turn: OVER_TURN, hand: 'open', stop: true }, // ...onto the back of the slide...
    { r: E.rackGrab, at: rear, turn: OVER_TURN, hand: 'slide', stop: true }, // ...and takes hold
    { r: E.rackPull, at: pulled, turn: OVER_TURN, hand: 'slide', stop: true }, // pulls it back
    { r: E.slideRelease, at: pulled, turn: OVER_TURN, hand: 'slide', stop: true },
    // (Spaced through the time left, so they never bunch up.)
    { r: E.slideRelease + 0.15 * back, at: pulled.clone().add(V(-0.015, 0.012, 0.012)), turn: OVER_TURN, hand: 'open' }, // lets go: it slams home
    { r: E.slideRelease + 0.38 * back, at: pulled.clone().add(V(-0.04, 0.02, 0.02)), turn: between(OVER_TURN, NONE, 0.3), hand: 'open' },
    { r: E.slideRelease + 0.68 * back, at: V(-0.028, -0.028, 0.01), turn: NONE, hand: 'reaching' }, // back down beside the grip
    { r: E.slideRelease + 0.84 * back, at: V(-0.008, -0.01, 0.004), turn: NONE, hand: 'loose' },
    { r: E.handOn, at: V(0, 0, 0), turn: NONE, hand: 'grip', stop: true },
  ];
}

// The support hand's keyframes for each kind of reload: reload progress,
// where the hand is (from where it holds the gun), how it's turned (about
// the wrist), its hand shape (supportHand.js), and whether it stops there
// (otherwise it flows through).
// For a gun with these points (see POINTS9).
function handPaths(points, rules = null) {
  const E = reloadSteps(rules, 'empty');
  const C = reloadSteps(rules, 'catching');
  // (A gun with a longer empty reload has its first part played at the
  // usual pace: the keys up to the magazine going in are moved earlier.)
  const early = E.magIn / RELOAD_STEPS.empty.magIn;
  const sooner = (keys) => keys.map((key) => ({ ...key, r: key.r * early }));
  const shift = V(SLIDE.halfWidth - points.slideHalfWidth, points.slideTop - SLIDE.top, 0);
  const down = points.magDown || GRIP.down;
  const seat = points.seat || 0;
  return {
    // From empty: off the grip and straight down to the belt, as the thumb
    // presses the release and the empty magazine falls.
    empty: E.rackGrab === undefined ? [
      { r: 0, at: V(0, 0, 0), turn: NONE, hand: 'grip', stop: true },
      { r: 0.035, at: V(-0.012, -0.014, 0.008), turn: NONE, hand: 'loose' }, // fingers lift off the grip...
      { r: 0.06, at: V(-0.022, -0.03, -0.012), turn: turned(0.08, 0, 0.05), hand: 'loose' }, // ...off the front of the grip...
      { r: 0.105, at: V(-0.055, -0.18, 0.095), turn: turned(0.3, 0, 0.14), hand: 'reaching' }, // ...and it's away
      { r: 0.2, at: V(-0.088, -0.34, 0.195), turn: turned(0.48, 0, 0.19), hand: 'relaxed' }, // down to the belt
      { r: 0.305, at: BELT, turn: AT_BELT, hand: 'open', stop: true, name: 'reach' },
      ...freshMagazine(E, AT_BELT, down, seat),
    ] : [
      ...sooner([
        { r: 0, at: V(0, 0, 0), turn: NONE, hand: 'grip', stop: true },
        { r: 0.035, at: V(-0.012, -0.014, 0.008), turn: NONE, hand: 'loose' }, // fingers lift off the grip...
        { r: 0.06, at: V(-0.022, -0.03, -0.012), turn: turned(0.08, 0, 0.05), hand: 'loose' }, // ...off the front of the grip...
        { r: 0.105, at: V(-0.055, -0.18, 0.095), turn: turned(0.3, 0, 0.14), hand: 'reaching' }, // ...and it's away
        { r: 0.2, at: V(-0.088, -0.34, 0.195), turn: turned(0.48, 0, 0.19), hand: 'relaxed' }, // down to the belt
        { r: 0.305, at: BELT, turn: AT_BELT, hand: 'open', stop: true, name: 'reach' },
      ]),
      ...sooner(freshMagazine(RELOAD_STEPS.empty, AT_BELT, down, seat).slice(0, 6)),
      ...rackFromBehind(E, shift, down, seat),
    ],
    // With rounds left: palm up under the grip to catch the old magazine,
    // out with it, put it away on the way down, and on to the belt for a
    // fresh one, palm up all the way.
    catching: [
      { r: 0, at: V(0, 0, 0), turn: NONE, hand: 'grip', stop: true },
      { r: 0.03, at: V(-0.012, -0.014, 0.008), turn: between(NONE, HOLD_TURN, 0.08), hand: 'loose' }, // fingers lift off the grip...
      { r: 0.09, at: holdingAt(CATCH_GAP + 0.04, down, seat).add(V(-0.05, 0, 0.02)), turn: between(NONE, HOLD_TURN, 0.6), hand: 'reaching' }, // ...turning palm up
      { r: 0.15, at: holdingAt(CATCH_GAP, down, seat), turn: HOLD_TURN, hand: 'flat', stop: true }, // under the magazine
      { r: C.magCaught, at: holdingAt(CATCH_GAP, down, seat), turn: HOLD_TURN, hand: 'flat', stop: true }, // it drops in...
      { r: 0.25, at: holdingAt(CATCH_GAP + 0.008, down, seat), turn: HOLD_TURN, hand: 'pushing' }, // ...the hand gives a little and the fingers close...
      { r: 0.275, at: holdingAt(MAG_AT_WELL + 0.03, down, seat), turn: HOLD_TURN, hand: 'magazine' }, // ...pulling it out
      { r: 0.305, at: V(-0.07, -0.26, 0.14), turn: HOLD_TURN, hand: 'magazine', stop: true, name: 'stow' }, // into a pouch...
      { r: 0.33, at: V(-0.08, -0.3, 0.17), turn: HOLD_TURN, hand: 'open' }, // ...lets go of it...
      { r: 0.36, at: BELT, turn: HOLD_TURN, hand: 'open', stop: true, name: 'reach' }, // ...and on to the belt
      ...freshMagazine(C, HOLD_TURN, down, seat),
    ],
    // Inspecting (times in seconds): off the grip and down out of view while
    // the shooting hand turns the gun, then back up, palm up under the grip,
    // to catch the magazine as it drops. Out with it, held up to look at,
    // and back in. Then up over the top of the slide, eases it back half way
    // (the slide follows the hand), holds it there while the chamber's
    // checked, and lets go so it snaps forward; and back round the grip.
    inspect: [...inspectHead(down, seat), ...inspectCheck(shift, points.slideTravel, down, seat)],
    // With the slide locked back, no chamber check: straight back round the
    // grip once the magazine is in (as at the end of a reload).
    inspectShort: [...inspectHead(down, seat), ...freshMagazine(C, HOLD_TURN, down, seat).slice(6).map(inInspect)],
  };
}
const HAND_PATHS = handPaths(POINTS9);
const keyAt = (kind, name) => HAND_PATHS[kind].find((key) => key.name === name).r;
// The fresh magazine appears in the hand as its fingers close on it at the
// belt, and is in the hand until it's home.
const freshInHand = (paths) => {
  const at = (kind, name) => paths[kind].find((key) => key.name === name).r;
  return { empty: (at('empty', 'reach') + at('empty', 'grab')) / 2, catching: (at('catching', 'reach') + at('catching', 'grab')) / 2 };
};
const FRESH_IN_HAND = freshInHand(HAND_PATHS);

// The shooting hand's thumb: it starts down this long before the release is
// pressed, is on the button this long before, and is back this long after
// (fractions of the reload).
const THUMB = { start: 0.08, on: 0.035, back: 0.06 };
// Pressing an attachment's switch: how long (seconds), and the fractions of
// that taken reaching it and holding it down.
const FLICK = { time: 0.34, reach: 0.4, hold: 0.6 };
// The same for the slide stop at the end of an empty reload.
const STOP_THUMB = { start: 0.07, on: 0.025, back: 0.07 };

// How far the thumb is from holding the grip to being on the release and
// pressing it, at reload progress r: [from shape, to shape, how far]. `scale`
// stretches the thumb's timings (for the inspect, which is longer).
function thumbAt(r, S, scale = 1, slideStop = false) {
  const ease = (a, b) => smoothstep(a, b, r);
  // After an empty reload, the thumb comes up onto the slide stop and
  // pushes it down, and the slide goes home.
  if (slideStop && S.slideRelease !== undefined) {
    const at = S.slideRelease;
    if (r >= at - STOP_THUMB.start && r < at + STOP_THUMB.back) {
      if (r < at - STOP_THUMB.on) return ['grip', 'onStop', ease(at - STOP_THUMB.start, at - STOP_THUMB.on)];
      if (r < at) return ['onStop', 'pressStop', ease(at - STOP_THUMB.on, at)];
      return ['pressStop', 'grip', ease(at + 0.01, at + STOP_THUMB.back)];
    }
  }
  const press = S.magOut;
  const start = THUMB.start * scale;
  const on = THUMB.on * scale;
  const back = THUMB.back * scale;
  if (r < press - start || r >= press + back) return ['grip', 'grip', 0];
  if (r < press - on) return ['grip', 'onRelease', ease(press - start, press - on)];
  if (r < press) return ['onRelease', 'pressRelease', ease(press - on, press)];
  return ['pressRelease', 'grip', ease(press, press + back)];
}

// --- Inspecting --------------------------------------------------------------
//
// The support hand lets go and drops out of the way (HAND_PATHS.inspect), and
// the shooting hand brings the gun up and turns it to show its right side
// (ejection port, loaded-chamber indicator), then turns it over to show its
// left (slide stop, markings). Then the gun comes upright and up as for a
// reload, and the support hand comes back to check the magazine; then,
// tipped so the ejection port faces you, the chamber.
//
// Keyframes, at seconds into the inspect: where the whole gun and both arms
// go (`at`, added to where the gun is held, and `turn`, radians: muzzle up,
// muzzle left, top towards the left), and how the shooting hand turns the gun
// on top of that (`gun`, about the wrist, the same way round) and turns its
// forearm at the elbow (`elbow`; x lifts the hand, y swings it left). The
// hand's turn is shared out the way a real arm does it: as much as it can as
// the forearm twisting about its own length (so the sleeve stays where it
// is), the rest at the wrist. The movement is a smooth curve through the
// keys, easing in and out of the ones marked stop.
const STILL = { gun: [0, 0, 0], elbow: [0, 0, 0] };
const MAGAZINE_CHECK = { at: [-0.04, 0.12, 0.05], turn: RELOAD_POSE.turn, ...STILL };
// Checking the chamber, the gun is turned muzzle right, a little up, so the
// top and right side of the slide, with the ejection port, face you.
const CHAMBER_CHECK = { at: [-0.075, 0.06, 0.08], turn: [0.45, -0.6, 0.15], ...STILL };
const poseKey = (t, key, stop = true) => ({ t, ...key, stop });
// A pose moved and turned a little from another (so a hold isn't frozen).
const nudged = (key, at, turn) => ({ ...key, at: key.at.map((a, i) => a + at[i]), turn: key.turn.map((a, i) => a + turn[i]) });
const INSPECT_POSE_HEAD = [
  poseKey(0, { at: [0, 0, 0], turn: [0, 0, 0], ...STILL }),
  poseKey(0.2, { at: [-0.005, 0.01, 0.01], turn: [0, 0, 0], gun: [0.08, 0, 0.1], elbow: [0.01, 0, 0] }, false), // the support hand is off
  poseKey(0.8, { at: [-0.05, 0.035, 0.07], turn: [0, 0, 0], gun: [0.85, 0, 1.2], elbow: [0, 0, 0] }), // the right side: forearm rolled over
  poseKey(1.55, { at: [-0.048, 0.04, 0.07], turn: [0, 0, 0], gun: [0.9, 0.05, 1.27], elbow: [0.02, 0, 0] }),
  poseKey(2.2, { at: [0.01, 0.015, 0.06], turn: [0, 0, 0], gun: [0.35, 0.75, -0.5], elbow: [0.12, 0.35, 0] }), // turned over: the left side, muzzle to the left
  poseKey(2.85, { at: [0.008, 0.02, 0.06], turn: [0, 0, 0], gun: [0.4, 0.8, -0.56], elbow: [0.13, 0.36, 0] }),
  poseKey(3.25, MAGAZINE_CHECK), // up for the magazine check
  poseKey(4.8, MAGAZINE_CHECK),
];
const keyed = (keys) => keys.map((key) => ({ t: key.t, stop: key.stop, v: [...key.at, ...key.turn, ...key.gun, ...key.elbow] }));
const INSPECT_POSES = {
  // Tipped so the ejection port faces you while the slide's eased back.
  check: keyed([
    ...INSPECT_POSE_HEAD,
    poseKey(5.3, CHAMBER_CHECK),
    poseKey(INSPECT.release + 0.05, nudged(CHAMBER_CHECK, [0.002, 0.003, 0], [0.03, -0.02, 0.03])),
    poseKey(INSPECT.time, { at: [0, 0, 0], turn: [0, 0, 0], ...STILL }),
  ]),
  short: keyed([
    ...INSPECT_POSE_HEAD,
    poseKey(5.22, MAGAZINE_CHECK), // the support hand is back on
    poseKey(INSPECT.shortTime, { at: [0, 0, 0], turn: [0, 0, 0], ...STILL }),
  ]),
};

// The inspect pose `time` seconds in (`check`: with the chamber check).
const inspectPose = { at: new THREE.Vector3(), turn: [0, 0, 0], gun: [0, 0, 0], elbow: [0, 0, 0] };
function inspectPoseAt(time, check = true) {
  const keys = check ? INSPECT_POSES.check : INSPECT_POSES.short;
  const t = Math.min(Math.max(time, 0), keys[keys.length - 1].t - 1e-6);
  let i = 0;
  while (t >= keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.t - a.t;
  const u = (t - a.t) / span;
  // Cubic Hermite curve, flowing through keys that aren't stops.
  const slope = (j, n) => {
    const key = keys[j];
    if (key.stop || j === 0 || j === keys.length - 1) return 0;
    return (keys[j + 1].v[n] - keys[j - 1].v[n]) / (keys[j + 1].t - keys[j - 1].t);
  };
  const u2 = u * u;
  const u3 = u2 * u;
  const v = a.v.map((va, n) => va * (2 * u3 - 3 * u2 + 1) + slope(i, n) * (u3 - 2 * u2 + u) * span
    + b.v[n] * (-2 * u3 + 3 * u2) + slope(i + 1, n) * (u3 - u2) * span);
  const out = inspectPose;
  out.at.set(v[0], v[1], v[2]);
  out.turn = v.slice(3, 6);
  out.gun = v.slice(6, 9);
  out.elbow = v.slice(9, 12);
  return out;
}

// Splits a turn into its part about `axis` (the twist) and what's left (the
// swing, done after it): turn = swing × twist.
function swingTwist(turn, axis) {
  const along = new THREE.Vector3(turn.x, turn.y, turn.z).projectOnVector(axis);
  const twist = new THREE.Quaternion(along.x, along.y, along.z, turn.w).normalize();
  return { twist, swing: turn.clone().multiply(twist.clone().invert()) };
}

// Where the hand is at reload progress r: offset, turn, and hand shapes to
// blend between. The path is a smooth curve through the keyframes (stopping
// at the ones marked to), the turn and the hand shape ease from one key to
// the next. (Exported so the path can be checked outside the game.)
const handPath = { offset: new THREE.Vector3(), turn: new THREE.Quaternion(), from: 'grip', to: 'grip', k: 0 };
export function handAt(r, kind = 'empty', paths = HAND_PATHS) {
  const keys = paths[kind];
  const out = handPath;
  if (r < keys[0].r || r >= keys[keys.length - 1].r) {
    out.offset.set(0, 0, 0);
    out.turn.identity();
    out.from = out.to = 'grip';
    out.k = 0;
    return out;
  }
  let i = 0;
  while (r >= keys[i + 1].r) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.r - a.r;
  const t = (r - a.r) / span;
  const slope = (j) => {
    const key = keys[j];
    if (key.stop || j === 0 || j === keys.length - 1) return new THREE.Vector3();
    return keys[j + 1].at.clone().sub(keys[j - 1].at).divideScalar(keys[j + 1].r - keys[j - 1].r);
  };
  // Cubic Hermite curve.
  const t2 = t * t;
  const t3 = t2 * t;
  out.offset.copy(a.at).multiplyScalar(2 * t3 - 3 * t2 + 1)
    .addScaledVector(slope(i), (t3 - 2 * t2 + t) * span)
    .addScaledVector(b.at, -2 * t3 + 3 * t2)
    .addScaledVector(slope(i + 1), (t3 - t2) * span);
  // The turn and the hand shape ease in and out of keys the hand stops at,
  // and flow straight through the others.
  const k = -2 * t3 + 3 * t2 + (a.stop ? 0 : t3 - 2 * t2 + t) + (b.stop ? 0 : t3 - t2);
  out.turn.slerpQuaternions(a.turn, b.turn, k);
  out.from = a.hand;
  out.to = b.hand;
  out.k = k;
  return out;
}

// The hands and arms, made in Blender (see tools/blender/).
const ARMS_MODEL = new URL('../../assets/arms.glb', import.meta.url);

const VIEW_FOV = 62; // vertical, degrees

// Where the gun sits in front of the camera when held at the hip: arms pushed
// out, pistol a little right of centre, pointing straight ahead. (Close
// enough that the soldier's own arms reach it from his shoulders; the wide
// view keeps it the size it would be further out.)
const HIP_POSITION = new THREE.Vector3(0.074, -0.069, -0.4);
const HIP_ROTATION = new THREE.Euler(0, 0.02, 0, 'YXZ');

// Aiming down the sights: the gun comes up so the line through the three
// sight dots runs straight through the eye, with the rear sight this far away.
export const AIM = {
  time: 0.28, // seconds to bring the sights up (or down)
  eyeToRearSight: 0.24, // metres
  viewFov: 44, // the gun layer's vertical field of view while aiming (makes the sights a bit bigger)
  zoom: 1.15, // how much the world zooms in while aiming
  arc: { down: 0.012, roll: 0.07 }, // the slight swoop the gun makes on the way up
};
// (Where the gun is then depends on its sights: see useGun.)
const AIM_ROTATION = new THREE.Quaternion();
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);
const HIP_QUATERNION = new THREE.Quaternion().setFromEuler(HIP_ROTATION);

// A gun with its own arms (animatedGun.js). Its model's root is the eye its
// arms were posed for: placed there, the gun would sit where its maker
// framed it. It's placed in the gun's pose to sit at the eye moved by `hip`
// (gun space) when the gun is at the hip (`at` is the eye there): the
// Beretta's by as much as puts its rear sight where the M1911's is at the
// hip (`sightAsAtHip`, that gun's sights), so it's held as the others are.
// It goes up to the sights and moves with the weapon physics from there,
// the whole rig as one, like the others. Each gun's `rig` in GUN_KINDS can
// set (else these):
// - hip: as above (or sightAsAtHip to work it out).
// - viewFov: the gun layer's view at the hip with it (the others' one);
//   aiming, it goes to AIM.viewFov like the others.
// - eyeRelief: how far its rear sight is from the eye when aiming (metres).
// - kick: how much of the gun layer's recoil kick it gets (its shoot
//   animation already kicks the hands and gun back and up).
// - tacOut: on a tactical sprint, as the others come up close in front of
//   the chest, it's held this much lower (metres, gun space).
// - sprintPose: how much of the gun layer's sprint pose (MOTION.sprint and
//   tacSprint's offsets) it takes: 0 for a gun whose run clip is its
//   maker's own sprint pose. sprintOut: sprinting, it's held this much
//   higher (metres, gun space), as much as it's in the sprint pose: for a
//   run clip that takes the gun lower than the gun layer's view shows.
// - aimLevel: how much of the cant its maker holds it at (its model's cant)
//   the whole rig is turned back about the line of sight as it comes up to
//   the sights (1: aimed level).
// - suppressed: it has a suppressor on (a faint flash, a quieter shot).
// - redDot: it's aimed through a red dot sight (its model's sights are the
//   lens: the middle, and the back and front of the sight), and the dot
//   shows in the lens (radius: the lens's, metres), and shots go through
//   it: see redDotPoint and showRedDot. (The lens's glass is see-through
//   in the model itself: its own material, written by the converter.)
// (Sprinting, the others' hands bend at the wrists; a gun with its own arms
// only does if its model asks for it, see animatedGun.js: the whole rig
// takes the sprint pose's offsets.)
const RIG = {
  at: HIP_POSITION.clone().applyQuaternion(HIP_QUATERNION.clone().invert()).negate(),
  hip: new THREE.Vector3(),
  viewFov: VIEW_FOV,
  eyeRelief: 0.26,
  kick: 0.4,
  tacOut: new THREE.Vector3(),
  sprintPose: 1,
  sprintOut: new THREE.Vector3(),
  aimLevel: 0,
  suppressed: false,
  redDot: null,
};
// A gun's own RIG values: its rig in GUN_KINDS over RIG's.
function rigOf(kind) {
  const r = { ...RIG, ...(kind.rig || {}) };
  if (kind.rig && kind.rig.sightAsAtHip && !kind.rig.hip) {
    const M = kind.animated;
    const s = kind.rig.sightAsAtHip;
    const rear = new THREE.Vector3(...M.frame).add(new THREE.Vector3(M.sights.x || 0, M.sights.height, M.sights.rearZ));
    r.hip = new THREE.Vector3(s.x || 0, s.height, s.rearZ).sub(RIG.at).sub(rear);
  }
  return r;
}
// A gun with its own arms has none of the other guns' separate parts.
const NO_PARTS = {
  slide: null, trigger: null, barrel: null, magazine: null, magazineRest: null, slideStop: null, hammer: null,
  extractor: null, chamberRound: null, safetyBlade: null,
};

// A red dot sight's dot (showRedDot): its size (metres across at the lens,
// its glow round it included; its bright middle is about a third of that).
// Aimed (from aimFrom of the way up to the sights), it's kept in view while
// the eye is off the lens's axis by up to `keep` lens radii (a burst's kick
// shakes the eye off it by more than the lens: the MP7A1's, 9.5 mm, by up
// to 17), drawn no further out than inLens of the radius.
const RED_DOT = { size: 0.004, inLens: 0.85, aimFrom: 0.6, keep: 2 };

// The red dot: a bright, nearly white middle, red round it, glowing out.
function dotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,236,226,1)');
  grad.addColorStop(0.2, 'rgba(255,90,60,1)');
  grad.addColorStop(0.4, 'rgba(255,30,15,0.85)');
  grad.addColorStop(0.65, 'rgba(255,20,10,0.25)');
  grad.addColorStop(1, 'rgba(255,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const lensAt = new THREE.Vector3();
const lensAxis = new THREE.Vector3();
const lensSeen = new THREE.Vector3();
const dotAim = new THREE.Vector3();

// The arms swing about this point between the wrists (gun space), not the eye.
const PIVOT = new THREE.Vector3(0, -0.085, 0.07);
// The wrists bend about the line through both of them (gun space): from the
// shooting hand's wrist to the support hand's (arms.js).
const RIGHT_WRIST = rightHandPose().wrist;
const WRIST_LINE = WRIST.clone().sub(RIGHT_WRIST).normalize();
// The shooting forearm, which twists about its own length during an inspect,
// and its elbow, which it turns about.
const RIGHT_ELBOW = rightHandPose().elbow;
const FOREARM = RIGHT_ELBOW.clone().sub(RIGHT_WRIST).normalize();

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Shows what's in a magazine with `rounds` rounds: the top round and the one
// staggered under it, brass behind each pair of witness holes down to the
// level the rounds reach (the top pair from 2, the bottom pair only when
// full), and the follower when it's empty.
function showRounds(magazine, rounds, capacity = PISTOL.magazine) {
  if (!magazine) return;
  const set = (name, on) => {
    const part = magazine.getObjectByName(name);
    if (part) part.visible = on;
  };
  set('magazine_round', rounds >= 1);
  set('magazine_second_round', rounds >= 2);
  set('magazine_follower', rounds === 0);
  for (let k = 1; k <= 6; k++) set(`magazine_rounds_${k}`, rounds >= (k * capacity) / 6);
}

// One arm as a group: the support (left) arm, so it can let go during a
// reload, and the shooting (right) arm, so its forearm can twist during an
// inspect.
function armOf(arms, side) {
  const name = `${side}Arm`;
  const existing = arms.getObjectByName(name);
  if (existing) return existing;
  const group = new THREE.Group();
  group.name = name;
  for (const part of arms.children.filter((c) => c.name.startsWith(side))) group.add(part);
  arms.add(group);
  return group;
}

// Everything in a loaded model casts and catches shadows.
function shadowed(model) {
  model.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  return model;
}

// Loads a model made in Blender. If it can't be loaded, uses the simpler
// built-in one instead, so the game still works. Gives { model, animations,
// fromFile }.
async function loadModel(url, fallback) {
  try {
    const gltf = await loader.loadAsync(url.href);
    return { model: gltf.scene, animations: gltf.animations || [], fromFile: true };
  } catch (error) {
    console.warn(`Couldn't load ${url.pathname}; using the built-in model instead.`, error);
    return { model: fallback(), animations: [], fromFile: false };
  }
}

// How far the trigger is pulled (0..1) `tt` seconds after it was pulled:
// it comes back as it breaks, then resets.
const triggerPullAt = (tt) => (tt < 0.03 ? tt / 0.03 : tt < 0.11 ? 1 - (tt - 0.03) / 0.08 : 0);

export class Viewmodel {
  constructor(renderer, sunDirection) {
    this.renderer = renderer;
    this.gloves = null; // the outfit's gloves on the guns with their own arms (see wearGloves)
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(VIEW_FOV, 1, 0.01, 3);

    this.scene.environment = outdoorEnvironment(renderer, sunDirection);
    this.scene.environmentIntensity = 0.9;

    this.scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x55554f, 0.35));
    // The sun, with its own small, sharp shadow map: the hands shade the gun and each other.
    this.sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -0.4, right: 0.4, top: 0.4, bottom: -0.4, near: 0.05, far: 2 });
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.0012;
    this.sun.target.position.copy(HIP_POSITION);
    this.scene.add(this.sun, this.sun.target);
    this.sunDirection = sunDirection;

    // holder: sits at the pivot and moves with the weapon physics.
    // gun: the pistol and arms, placed so they're held in the current pose
    // (somewhere between the hip and aiming down the sights).
    this.holder = new THREE.Group();
    this.gun = new THREE.Group();
    this.holder.add(this.gun);
    this.scene.add(this.holder);
    this.motion = new ViewmodelMotion();
    this.aimProgress = 0; // 0 = at the hip, 1 = aiming down the sights
    this.wasAiming = false;
    this.posePosition = new THREE.Vector3();
    this.poseQuaternion = new THREE.Quaternion();
    this.pivot = new THREE.Vector3();

    this.flash = null; // the gun in the hands' muzzle flash
    this.slideTime = 1; // seconds since the slide last went back
    this.triggerTime = 1; // seconds since the trigger was last pulled
    this.flick = null; // seconds into pressing a switch (see flickSwitch)
    this.slammed = true;
    this.lastAim = 0;
    this.pistol = null;
    this.dropped = null; // an empty magazine just dropped, for the world to take over
    this.dropping = null;
    this.dropDone = false;
    this.guns = {}; // each gun's model and moving parts (see rigGun)
    this.current = null; // the one in the hands
    this.switching = null; // { to }: putting it away to draw another
    this.lowered = 0; // how far down out of view it is while switching (0..1)
    // Whether a gun with its own arms is being lowered holding its pose
    // (put away mid-reload: see update and updateSwitch).
    this.rigHeld = false;
    // (What a gun with its own arms is told each frame: one object, reused.)
    this.rigState = { clip: 'idle', time: 0, toIdle: 0, empty: false, shotDt: 0, moving: { walk: 0, run: 0 }, aim: 0, slide: 'clip', triggerPull: 0 };
    this.rigFrameSeconds = 0; // real time this frame, for its shots (see animateRig)
    this.wristRight = new THREE.Vector3();
    this.wristLeft = new THREE.Vector3();
    this.aimPosition = new THREE.Vector3();
    this.aimRoll = new THREE.Quaternion();
    // A red dot sight's dot (see showRedDot): one, for whichever gun has one.
    this.redDot = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTexture(), transparent: true, depthWrite: false, toneMapped: false,
    }));
    this.redDot.scale.setScalar(RED_DOT.size);
    this.redDot.visible = false;
    this.redDot.renderOrder = 1;
    this.scene.add(this.redDot);
    // How far the gun is drawn in so the soldier's arms reach it (set by
    // src/player/fpArms.js).
    this.reachPull = new THREE.Vector3();

    // Resolves once the pistols and hands are loaded and in place.
    const kinds = Object.keys(GUN_KINDS);
    this.ready = Promise.all([loadModel(ARMS_MODEL, createArms), ...kinds.map((key) => loadModel(GUN_KINDS[key].model, GUN_KINDS[key].fallback))]).then(([{ model: arms }, ...pistols]) => {
      arms.name = 'arms';
      this.arms = arms;
      this.gun.add(shadowed(arms));
      this.leftArm = armOf(arms, 'left');
      this.rightArm = armOf(arms, 'right');
      // The support glove gets finger joints, so it can let go and take hold.
      let glove = this.leftArm.getObjectByName('left_glove');
      if (glove && !glove.isMesh) glove = glove.children.find((c) => c.isMesh);
      if (glove) {
        this.hand = new SupportHand();
        this.hand.skin(glove);
        this.carriedByHand(this.hand, this.leftArm.getObjectByName('left_knuckle_guard'));
      }
      // And the shooting glove's thumb, so it can press the magazine release.
      let rightGlove = arms.getObjectByName('right_glove');
      if (rightGlove && !rightGlove.isMesh) rightGlove = rightGlove.children.find((c) => c.isMesh);
      if (rightGlove) {
        this.shooter = new ShootingHand();
        this.shooter.skin(rightGlove);
        this.carriedByHand(this.shooter, arms.getObjectByName('right_knuckle_guard'));
      }
      // The gloves model's own meshes (see hideGloves).
      this.gloveMeshes = [];
      arms.traverse((o) => {
        if (o.isMesh) this.gloveMeshes.push(o);
      });
      kinds.forEach((key, i) => {
        const { model, animations, fromFile } = pistols[i];
        this.guns[key] = (fromFile && GUN_KINDS[key].animated && this.rigAnimated(key, model, animations))
          || this.rigGun(key, fromFile && GUN_KINDS[key].animated ? GUN_KINDS[key].fallback() : model, fromFile && !GUN_KINDS[key].animated);
      });
      // Get every gun's materials and textures ready now, so the first switch
      // to one doesn't stall while they're prepared.
      // (One at a time: each gun brings its own muzzle-flash light, and the
      // materials are made for the lights in the scene.)
      // (Its attachments too: they're shown for this, then put back as the
      // loadout has them.)
      for (const g of Object.values(this.guns)) {
        this.gun.add(g.object);
        for (const node of Object.values(g.attachments)) node.visible = true;
        renderer.compile(this.scene, this.camera);
        g.object.traverse((o) => {
          if (!o.isMesh) return;
          for (const material of [].concat(o.material)) {
            for (const value of Object.values(material)) if (value && value.isTexture) renderer.initTexture(value);
          }
        });
        this.gun.remove(g.object);
        this.setAttachments(g.key, g.on);
      }
      this.useGun(LOADOUT[0]);
    });

  }

  // A gun's model, its moving parts (and where they rest), its own copies of
  // the magazine (the fresh one the support hand brings, and an empty one to
  // drop into the world) and its muzzle flash.
  rigGun(key, pistol, fromFile) {
    const kind = GUN_KINDS[key];
    const given = fromFile ? kind.points : kind.fallbackPoints;
    // (A gun's stand-in may play by other rules: its kind's fallbackRules.)
    const rules = fromFile ? kind.rules : kind.fallbackRules || kind.rules;
    pistol.name = 'pistol';
    shadowed(pistol);
    const part = (name) => pistol.getObjectByName(name);
    // How much higher this gun's magazine bottom is than the grip's usual
    // one, measured from the model: the support palm pushes it home there.
    const magazinePart = part('magazine');
    const points = { ...given, seat: magazinePart ? magazineSeat(pistol, magazinePart) : 0 };
    const g = { key, rules, base: points, points, pistol, object: pistol, paths: handPaths(points, rules), release: '', on: {} };
    g.freshInHand = freshInHand(g.paths);
    const slide = part('slide');
    const trigger = part('trigger');
    const magazine = part('magazine');
    const extractor = part('extractor');
    const chamberRound = part('chamber_round');
    const safetyBlade = part('safety_blade');
    g.parts = {
      slide, slideRest: slide ? slide.position.z : 0,
      trigger, triggerRest: trigger ? trigger.position.z : 0,
      barrel: part('barrel'), barrelRest: restOf(part('barrel')),
      magazine, magazineRest: magazine ? magazine.position.clone() : null,
      slideStop: part('slide_stop'), slideStopRest: restOf(part('slide_stop')),
      hammer: part('hammer'), hammerRest: restOf(part('hammer')),
      extractor, extractorRest: extractor ? extractor.position.x : 0,
      chamberRound, chamberRoundRest: chamberRound ? chamberRound.position.clone() : null,
      safetyBlade, safetyBladeRest: safetyBlade ? safetyBlade.position.z : 0,
    };
    // The shooting hand on this gun: the index finger on its trigger (and
    // pulling it), and the thumb on its magazine release.
    if (this.shooter && trigger) {
      g.release = '_' + key;
      g.grip = 'grip' + g.release;
      this.shooter.addGun(g.release, triggerFace(pistol, trigger), TRIGGER_TRAVEL, points.magRelease || MAG_RELEASE);
      const stop = part('slide_stop');
      if (stop && reloadSteps(rules, 'empty').rackGrab === undefined) {
        const box = partBox(pistol, stop);
        this.shooter.addSlideStop(g.release, new THREE.Vector3(box.min.x + 0.002, box.max.y + 0.0012, (box.min.z + box.max.z) / 2));
        g.thumbStop = true;
      }
    } else if (points.magRelease && this.shooter) {
      g.release = '_' + key;
      this.shooter.addRelease(g.release, points.magRelease);
    }
    // The fresh magazine the support hand brings back during a reload.
    if (magazine) {
      // Where it sits in the hand: where the seated magazine is, relative to
      // the hand pushing it home.
      g.handMagazine = magazine.clone();
      magazine.updateMatrix();
      handMatrix(holdingAt(0, GRIP.down, points.seat), HOLD_TURN).invert().multiply(magazine.matrix)
        .decompose(g.handMagazine.position, g.handMagazine.quaternion, g.handMagazine.scale);
      g.handMagazine.visible = false;
      shadowed(g.handMagazine);
      if (this.leftArm) this.leftArm.add(g.handMagazine);
    }
    // A copy of the magazine for dropping into the world, centred on the
    // middle of the magazine and lined up with it (see MAGAZINE_FRAME).
    if (magazine) {
      const copy = magazine.clone();
      showRounds(copy, 0); // it's empty
      magazine.updateMatrix();
      MAGAZINE_FRAME.clone().invert().multiply(magazine.matrix).decompose(copy.position, copy.quaternion, copy.scale);
      copy.visible = true;
      // In the gun layer, reflections of the sky give the magazine's
      // near-black finish its dark-grey sheen. The world has no
      // reflections (it would look black there), so its copy gets that
      // dark grey as a plain colour instead.
      copy.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.color.lerp(new THREE.Color(0x5a5d63), 0.55);
        o.material.metalness = Math.min(o.material.metalness, 0.15);
        o.material.roughness = Math.max(o.material.roughness, 0.55);
        o.castShadow = o.receiveShadow = true;
      });
      g.dropModel = new THREE.Group();
      g.dropModel.add(copy);
    }
    g.flash = new MuzzleFlash(points.muzzle);
    g.flash.attachTo(pistol);
    // Its attachments (src/attachments.js): parts named att_<id>, hidden
    // until they're chosen. Each remembers where it is relative to the gun,
    // for moving it onto another mount.
    g.attachments = {};
    pistol.updateMatrixWorld(true);
    const toGun = pistol.matrixWorld.clone().invert();
    g.inGun = (o) => toGun.clone().multiply(o.matrixWorld);
    // (Only the outermost: the loader names an attachment's own pieces after
    // it too.)
    const inAttachment = (o) => {
      for (let p = o.parent; p && p !== pistol; p = p.parent) if (p.name.startsWith('att_')) return true;
      return false;
    };
    pistol.traverse((o) => {
      if (o.name.startsWith('att_') && !inAttachment(o)) g.attachments[o.name.slice(4)] = o;
    });
    for (const node of Object.values(g.attachments)) {
      node.visible = false;
      node.userData.home = node.parent;
      node.userData.inGun = g.inGun(node);
    }
    g.restInGun = new Map();
    return g;
  }

  // A gun that brings its own arms and animations (see animatedGun.js and
  // RIG), from its loaded model; or null if the model hasn't what it needs
  // (then its stand-in is used). Its points (the muzzle, the ejection port
  // and the sights) are in the space of its frame's node (the gun layer's
  // `pistol` while it's held), which in the idle pose (or the aimed idle
  // pose, for a gun with its own aimed clips) is gun space moved to M.frame;
  // that's where it is, for aiming.
  rigAnimated(key, scene, animations) {
    const kind = GUN_KINDS[key];
    const M = kind.animated;
    const rig = new AnimatedGun(scene, animations, M);
    if (!rig.ok) {
      console.warn(`The ${kind.rules.name}'s model hasn't its animations; using the built-in model instead.`);
      return null;
    }
    shadowed(scene);
    const held = rigOf(kind);
    const object = new THREE.Group();
    object.name = `${key}_rig`;
    object.add(scene);
    const at = RIG.at.clone().add(held.hip);
    object.position.copy(at);
    const points = {
      muzzle: M.muzzle,
      port: M.port,
      sights: { ...M.sights, eyeRelief: held.eyeRelief },
      sightsAt: at.clone().add(new THREE.Vector3(...M.frame)),
      slideTravel: M.slideTravel,
      viewFov: held.viewFov,
      kick: held.kick,
      chamberCheck: false,
      suppressed: held.suppressed,
      redDot: held.redDot,
      // (Aimed, the rig is turned this much about the line of sight: radians,
      // positive anticlockwise as you look.)
      aimRoll: -THREE.MathUtils.degToRad((M.cant || 0) * held.aimLevel),
    };
    const g = { key, rules: kind.rules, base: points, points, pistol: rig.frame, object, rig, at, held, animated: M, parts: NO_PARTS, attachments: {}, on: {}, release: '' };
    g.flash = new MuzzleFlash(M.muzzle);
    g.flash.setMuzzle(M.muzzle, held.suppressed);
    g.flash.attachTo(rig.frame);
    return g;
  }

  // Shows the attachments `on` ({ slot: id }, see src/attachments.js) on gun
  // `key`, each on the mount it sits on with the others, and works out what
  // they change: the aim line through a red dot, the muzzle at the front of a
  // suppressor, where the light and laser shine from.
  setAttachments(key, on) {
    const g = this.guns[key];
    if (!g) return;
    g.on = { ...on };
    if (g.animated) return; // (it has none)
    const ids = new Set(Object.values(on).filter(Boolean));
    const extra = g.base.attachments || {};
    // Which mount each one sits on.
    const mount = ids.has('clamp') ? 'clamp' : ids.has('cover') ? 'cover' : null;
    const rail = ids.has('clamp') ? 'clamp' : ids.has('can_box') ? 'can_box' : 'frame';
    const sitsOn = { reddot: mount, light_long: rail, light_compact: rail, can_box: ids.has('cover') ? 'cover' : null };
    const move = new THREE.Matrix4();
    for (const [id, node] of Object.entries(g.attachments)) {
      node.visible = ids.has(id);
      const seat = (extra[id] && extra[id].on && extra[id].on[sitsOn[id]]) || {};
      const parent = (seat.parent && g.pistol.getObjectByName(seat.parent)) || node.userData.home;
      if (!g.restInGun.has(parent)) g.restInGun.set(parent, parent === g.pistol ? new THREE.Matrix4() : g.inGun(parent));
      const [x, y, z] = seat.offset || [0, 0, 0];
      move.makeTranslation(x, y, z);
      g.restInGun.get(parent).clone().invert().multiply(move).multiply(node.userData.inGun)
        .decompose(node.position, node.quaternion, node.scale);
      if (node.parent !== parent) parent.add(node);
    }
    // What they change.
    const points = { ...g.base, chamberCheck: true };
    if (ids.has('reddot') && extra.reddot) points.sights = extra.reddot.sights[mount] || g.base.sights;
    for (const id of ids) {
      const e = extra[id] || {};
      if (e.muzzle) {
        points.muzzle = e.muzzle;
        if (id === 'can_box' && ids.has('cover')) points.muzzle = [e.muzzle[0], e.muzzle[1], e.muzzle[2] - 0.0018];
        points.suppressed = true;
      }
      if (e.lens) {
        const [x, y, z] = place(extra[id], sitsOn[id]);
        points.light = [e.lens[0] + x, e.lens[1] + y, e.lens[2] + z];
      }
      if (e.emitter) points.laser = e.emitter;
    }
    // The switch the support hand's index finger presses with T: the
    // laser's if there is one, else the light's.
    g.switchPose = null;
    const switchOf = ids.has('laser') && extra.laser && extra.laser.switch ? ['laser', 'index']
      : ['light_long', 'light_compact'].filter((id) => ids.has(id) && extra[id] && extra[id].switch).map((id) => [id, 'index'])[0];
    if (switchOf && this.hand) {
      const [id, finger] = switchOf;
      const [x, y, z] = extra[id].switch;
      const [ox, oy, oz] = id === 'laser' ? [0, 0, 0] : place(extra[id], sitsOn[id]);
      g.switchPose = 'switch_' + key;
      this.hand.addSwitch(g.switchPose, new THREE.Vector3(x + ox, y + oy, z + oz), finger);
    }
    // The hand that checks the chamber takes hold of the slide over its
    // front: not with the clamp mount or box suppressor in the way. With the
    // rail cover on, it takes hold of that.
    if (['clamp', 'can_box'].some((id) => ids.has(id) && g.attachments[id])) points.chamberCheck = false;
    if (ids.has('cover') && extra.cover) {
      points.slideTop = extra.cover.slide.top;
      points.slideHalfWidth = extra.cover.slide.halfWidth;
    }
    g.points = points;
    g.paths = handPaths(points, g.rules);
    g.freshInHand = freshInHand(g.paths);
    g.flash.setMuzzle(points.muzzle, Boolean(points.suppressed));
    if (g === this.current) this.aimAt(points.sights, points.sightsAt);
  }

  // Has the guns with their own arms wear the gloves in `outfit` (the
  // Outfit, src/gear.js; see gunGloves.js): each from when it's taken out.
  wearGloves(outfit) {
    this.gloves = new GunGloves(outfit, this);
    if (this.current) this.gloves.dress(this.current.key);
  }

  // Puts a gun in the hands (straight away; switchTo puts one away first).
  useGun(key) {
    const g = this.guns[key];
    if (!g || g === this.current) return;
    if (this.gloves) this.gloves.dress(key);
    if (this.current) this.gun.remove(this.current.object);
    this.current = g;
    this.gun.add(g.object);
    this.pistol = g.pistol;
    // A gun with its own arms: the gloves model and its hands aren't drawn,
    // and it starts its draw (or idle pose) afresh.
    if (this.arms) this.arms.visible = !g.animated;
    if (g.rig) g.rig.reset(this.switching ? 'draw' : 'idle'); // (its idle pose if it has no draw)
    this.rigHeld = false;
    this.flash = g.flash;
    Object.assign(this, g.parts);
    for (const other of Object.values(this.guns)) if (other.handMagazine) other.handMagazine.visible = false;
    this.handMagazine = g.handMagazine || null;
    this.dropModel = g.dropModel || null;
    this.aimAt(g.points.sights, g.points.sightsAt);
    // Its moving parts start at rest.
    this.slideTime = this.triggerTime = 1;
    this.slammed = true;
    this.pressSnapped = false;
    this.stopLift = 0;
    this.chambered = 1;
    this.dropDone = false;
  }

  // Stops drawing the gloves model (the soldier's own arms hold the gun
  // instead, src/player/fpArms.js); its hand rigs keep working.
  hideGloves() {
    for (const mesh of this.gloveMeshes || []) mesh.visible = false;
  }

  // The support hand presses the gun's light or laser switch (T).
  flickSwitch() {
    if (this.current && this.current.switchPose) this.flick = 0;
  }

  // Aiming down the sights, the gun comes up so the line through its sights
  // runs straight through the eye, the rear sight AIM.eyeToRearSight away (or
  // the sight's own eye relief). (Sights that aren't on gun space's middle
  // line, or measured from a part that isn't at its origin, `at`, are moved
  // over by that much.)
  // (A gun whose rig is turned about the line of sight as it's aimed, its
  // points' aimRoll, is placed so its sights are on that line, turned.)
  aimAt(sights, at = null) {
    const x = (sights.x || 0) + (at ? at.x : 0);
    const y = sights.height + (at ? at.y : 0);
    const z = sights.rearZ + (at ? at.z : 0);
    const roll = (this.current && this.current.points.aimRoll) || 0;
    const rear = new THREE.Vector3(x, y, z).applyAxisAngle(FORWARD_AXIS, roll);
    this.aimPosition.set(-rear.x, -rear.y, -((sights.eyeRelief ?? AIM.eyeToRearSight) + rear.z));
  }

  // For a gun with its own arms, where its hands' wrists are (gun layer
  // camera space), for the soldier's body to reach them (src/player/
  // fpArms.js); null for the others.
  get ownWrists() {
    const g = this.current;
    if (!g || !g.animated) return null;
    this.scene.updateMatrixWorld();
    const at = (bone, into) => (bone ? bone.getWorldPosition(into) : null);
    return { right: at(g.rig.hands.shooting, this.wristRight), left: at(g.rig.hands.support, this.wristLeft) };
  }

  // What photo mode copies into the world for the gun in the hands: the gun,
  // or for one with its own arms the whole rig (its arms are left out:
  // there, his own hold it). copyForPhoto makes the copy; the names of the
  // parts to keep hidden are in its userData.hidden.
  get photoSource() {
    return this.current && this.current.animated ? this.current.rig.root : this.pistol;
  }

  copyForPhoto(source) {
    if (!(this.current && this.current.animated && source === this.current.rig.root)) {
      // (Its attachments remember their mounts in userData, which a copy
      // can't take: it's left out of the copy.)
      const kept = [];
      source.traverse((o) => {
        if (o.userData.home) {
          kept.push([o, o.userData]);
          o.userData = {};
        }
      });
      const copy = source.clone(true);
      for (const [o, data] of kept) o.userData = data;
      return copy;
    }
    const copy = cloneSkinned(source);
    copy.userData.hidden = this.current.animated.meshes.arms;
    return copy;
  }

  // Which gun is in the hands (its key in LOADOUT).
  get shownGun() {
    return this.current ? this.current.key : LOADOUT[0];
  }

  // Starts putting the gun in the hands away and drawing `key`. Asking for
  // the one being put away brings it straight back up. Returns whether
  // anything changed.
  switchTo(key) {
    if (!this.guns[key]) return false;
    const target = this.switching ? this.switching.to : this.shownGun;
    if (key === target) return false;
    this.switching = { to: key };
    // (Its gloves load while the other is put away.)
    if (this.gloves) this.gloves.dress(key);
    return true;
  }

  // Lowers the gun out of view, swaps it, and raises the other. (A gun with
  // its own arms plays its hide and draw animations instead, if it has
  // them, and takes their time; without them it's lowered and raised like
  // the others, in its rest pose, and comes straight back up if it's asked
  // for again. One put away mid-reload is lowered like the others holding
  // its pose, and isn't brought straight back up if it's asked for again: a
  // mid-reload pose has the support hand down at the belt, and going over
  // from there to the hold in view would swing that arm up past the eye. It
  // goes on down out of view and is drawn afresh.)
  updateSwitch(dt) {
    if (!this.switching) return;
    const rig = this.current && this.current.rig;
    if (this.switching.to !== this.shownGun || this.rigHeld) {
      const time = rig && !this.rigHeld && rig.has('hide') ? rig.duration('hide') : SWITCH.lower;
      this.lowered = Math.min(1, this.lowered + dt / time);
      if (this.lowered < 1) return;
      if (this.switching.to !== this.shownGun) this.useGun(this.switching.to);
      else {
        this.rigHeld = false;
        rig.reset('draw');
      }
    } else {
      this.lowered = Math.max(0, this.lowered - dt / (rig && rig.has('draw') ? rig.duration('draw') : SWITCH.raise));
      if (this.lowered <= 0) this.switching = null;
    }
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // A shot: the gun kicks, the muzzle flashes and the slide cycles.
  // (burst: how much harder this round of a burst kicks, for a fully
  // automatic gun.)
  fire(aim, burst = 1) {
    this.motion.kick(aim, (this.current ? this.current.rules.recoil * (this.current.points.kick ?? 1) : 1) * burst);
    if (this.flash) this.flash.fire();
    if (this.current && this.current.rig) this.current.rig.fire();
    this.slideTime = 0;
    this.triggerTime = 0;
    this.slammed = false;
  }

  // The palm seating the new magazine jolts the gun up a little.
  seatMagazine() {
    if (this.current && this.current.rig) return; // (its reload animation has it)
    this.motion.rotation.velocity.x += 0.5;
    this.motion.position.velocity.y += 0.06;
  }

  // The trigger pulled on an empty gun: it moves, nothing else happens.
  dryFire() {
    this.triggerTime = 0;
    this.motion.twitch();
    if (this.current && this.current.rig) this.current.rig.dryFire();
  }

  // A hand-mounted part (the hard knuckle guard) moves with the hand when the
  // wrist bends.
  carriedByHand(rig, part) {
    if (part) rig.root.attach(part);
  }

  // Places the shooting arm, both hands and the gun. Sprinting bends both
  // wrists `sprintBend` radians, muzzle down: the hands and the gun turn
  // together about the line through both wrists, and the forearms stay put.
  // Inspecting (`inspect` is the pose, `amount` how much of it), the
  // shooting hand turns the gun: its forearm turns at the elbow and twists
  // about its length, and its wrist bends (the support hand is off the gun
  // then).
  poseArms(sprintBend, inspect, amount) {
    const sprint = new THREE.Quaternion().setFromAxisAngle(WRIST_LINE, sprintBend);
    const elbow = new THREE.Quaternion().setFromEuler(new THREE.Euler(...inspect.elbow.map((a) => a * amount)));
    // How the gun turns about the wrist, besides the elbow's turn: as much
    // as possible as the forearm's twist, the rest at the wrist.
    const hand = new THREE.Quaternion().setFromEuler(new THREE.Euler(...inspect.gun.map((a) => a * amount)));
    const { twist, swing } = swingTwist(elbow.clone().invert().multiply(hand), FOREARM);
    // A turn about a point, applied to an object's position and rotation.
    const about = (object, turn, point) => {
      object.position.sub(point).applyQuaternion(turn).add(point);
      object.quaternion.premultiply(turn);
    };
    // The forearm: twisted about its length (the line through the wrist and
    // elbow), then turned at the elbow.
    if (this.rightArm) {
      this.rightArm.position.set(0, 0, 0);
      this.rightArm.quaternion.identity();
      about(this.rightArm, twist, RIGHT_WRIST);
      about(this.rightArm, elbow, RIGHT_ELBOW);
    }
    // The hand bends at the wrist after the twist (so in the forearm's own
    // frame that's the twist undone, the bend, and the twist again).
    if (this.shooter) this.shooter.bendWrist(twist.clone().invert().multiply(swing).multiply(twist).multiply(sprint));
    if (this.hand) this.hand.bendWrist(sprint);
    // The gun goes with the shooting hand: the sprint bend, the twist and the
    // wrist about the wrist, then the elbow.
    if (this.pistol) {
      this.pistol.position.set(0, 0, 0);
      this.pistol.quaternion.identity();
      about(this.pistol, swing.clone().multiply(twist).multiply(sprint), RIGHT_WRIST);
      about(this.pistol, elbow, RIGHT_ELBOW);
    }
  }

  // Whether the gun is up and can fire: not while it's still in (or coming
  // up from) the sprint pose, or switching. (A gun with its own draw
  // animation can once that has it on target, a moment before it ends:
  // its events.draw.fire, e.g. MODEL_BERETTA's.)
  get readyToFire() {
    if (this.motion.sprint >= 0.25) return false;
    if (!this.switching) return true;
    const g = this.current;
    const draw = g && g.rig && g.rig.has('draw') && g.animated.events && g.animated.events.draw;
    const from = draw && !this.rigHeld && this.switching.to === g.key ? draw.fire : undefined;
    return from !== undefined && (1 - this.lowered) * g.rig.duration('draw') >= from;
  }

  // Where a point on the gun (gun space) is in the gun layer's camera space.
  pointOnGun([x, y, z]) {
    this.scene.updateMatrixWorld();
    return (this.pistol || this.gun).localToWorld(new THREE.Vector3(x, y, z));
  }

  get points() {
    return this.current ? this.current.points : POINTS9;
  }

  // The way the magazine of the gun in the hands slides out.
  get magDown() {
    return this.points.magDown || GRIP.down;
  }

  muzzlePoint() {
    return this.pointOnGun(this.points.muzzle);
  }

  // Where the gun's light and laser shine from, and a point a metre ahead
  // along their beam (gun layer), or null if it hasn't one.
  lightBeam() {
    return this.beam(this.points.light);
  }

  laserBeam() {
    return this.beam(this.points.laser);
  }

  beam(p) {
    return p ? [this.pointOnGun(p), this.pointOnGun([p[0], p[1], p[2] - 1])] : null;
  }

  // The light's lens and the laser's window glow while they're on.
  setGlow(on) {
    if (this.glowing === on) return;
    this.glowing = on;
    for (const g of Object.values(this.guns)) {
      for (const id of ['light_long', 'light_compact', 'laser']) {
        const node = g.attachments[id];
        if (!node) continue;
        node.traverse((o) => {
          if (!o.isMesh) return;
          for (const m of [].concat(o.material)) if (m.emissive) m.emissiveIntensity = on ? 2.5 : 0;
        });
      }
    }
  }

  portPoint() {
    return this.pointOnGun(this.points.port);
  }

  // Where the front sight is on screen (-1..1 each way), so shots go where the
  // sights point.
  // (Through a red dot sight, where its dot is: see redDotPoint.)
  sightOnScreen() {
    if (this.points.redDot && this.pistol && this.redDotPoint(dotAim) !== null) return dotAim.project(this.camera);
    const sights = this.points.sights;
    return this.pointOnGun([sights.x || 0, sights.height, sights.frontZ]).project(this.camera);
  }

  // frameSeconds: time since the last frame. player: movement state.
  // yaw / pitch: where the player is looking. cameraQuaternion: the world
  // camera's rotation. wallDistance: metres to whatever is straight ahead.
  // aiming: whether the aim button is held. gun: { slideLocked,
  // reloadProgress (0..1, or -1), reloadSeconds, reloadEmpty, ammo, reserve,
  // inspectTime (seconds, or -1), inspectCheck (whether the inspect checks
  // the chamber), inspectAmount (1, going to 0 when an inspect is cut
  // short) }. Returns how far into aiming the gun is (0..1,
  // eased), for zooming the world.
  update(frameSeconds, player, yaw, pitch, cameraQuaternion, wallDistance = Infinity, aiming = false, gun = null) {
    // Bring the sights up or down at a steady pace, eased at both ends.
    const dt = Math.min(frameSeconds, 0.05);
    this.rigFrameSeconds = Math.min(frameSeconds, 0.25);
    if (this.flick !== null) {
      this.flick += dt;
      if (this.flick >= FLICK.time) this.flick = null;
    }
    this.aimProgress = Math.min(1, Math.max(0, this.aimProgress + (aiming ? dt : -dt) / AIM.time));
    const p = this.aimProgress;
    const aim = p * p * (3 - 2 * p);
    this.lastAim = aim;
    if (aiming !== this.wasAiming) this.motion.settle(aiming ? 1 : -1);
    this.wasAiming = aiming;

    // The pose for this much aiming, with a slight swoop on the way.
    const swoop = Math.sin(Math.PI * aim);
    this.posePosition.lerpVectors(HIP_POSITION, this.aimPosition, aim);
    this.posePosition.y -= AIM.arc.down * swoop;
    this.poseQuaternion.slerpQuaternions(HIP_QUATERNION, AIM_ROTATION, aim);
    if (this.points.aimRoll) this.poseQuaternion.multiply(this.aimRoll.setFromAxisAngle(FORWARD_AXIS, this.points.aimRoll * aim));
    this.poseQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), AIM.arc.roll * swoop));
    // Reloading: the gun comes up and in, tipped so the magazine well faces
    // you, so you can watch the support hand bring the new magazine in.
    const reload = gun ? gun.reloadProgress : -1;
    const ends = gun && gun.reloadEmpty ? reloadSteps(this.current && this.current.rules, 'empty').handOn : 0.84;
    // (A gun with its own arms has its reload pose in its animation.)
    const rig = this.current && this.current.rig;
    const tilt = reload < 0 || rig ? 0 : smoothstep(0, 0.14, reload) * (1 - smoothstep(ends, 1, reload));
    if (tilt > 0) {
      const pose = this.points.reloadPose || RELOAD_POSE;
      this.posePosition.add(pose.position.clone().multiplyScalar(tilt));
      this.poseQuaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.turn.map((a) => a * tilt))));
    }
    // Inspecting: the gun is brought up and turned over (all of it scaled
    // down as it goes back to the hold when it's cut short).
    const inspect = gun && gun.inspectTime >= 0 && reload < 0 ? gun.inspectTime : -1;
    const check = Boolean(gun && gun.inspectCheck);
    // (A gun with its own arms has its inspect in its animation.)
    const amount = inspect < 0 || rig ? 0 : smoothstep(0, 1, gun.inspectAmount);
    const pose = inspectPoseAt(inspect, check);
    if (amount > 0) {
      this.posePosition.addScaledVector(pose.at, amount);
      this.poseQuaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.turn.map((a) => a * amount))));
    }
    // Switching guns: down out of view and back up (in real time, even when
    // the frame rate is low).
    this.updateSwitch(Math.min(frameSeconds, 0.25));
    // (A gun with its own arms plays its hide and draw animations instead,
    // if it has them, unless it's put away mid-reload: then it's lowered
    // like the others, held as it was, see AnimatedGun.lowering and
    // updateSwitch.)
    const ownRig = this.current && this.current.rig;
    if (!ownRig || !this.switching) this.rigHeld = false;
    else if (this.switching.to !== this.shownGun && ownRig.reloading) this.rigHeld = true;
    const raising = Boolean(this.switching) && this.switching.to === this.shownGun && !this.rigHeld;
    const byClip = ownRig && !this.rigHeld && ownRig.has(raising ? 'draw' : 'hide');
    const lowered = byClip ? 0 : smoothstep(0, 1, this.lowered);
    if (lowered > 0) {
      this.posePosition.addScaledVector(SWITCH.drop, lowered);
      this.poseQuaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...SWITCH.turn.map((a) => a * lowered))));
    }
    this.pivot.copy(PIVOT).applyQuaternion(this.poseQuaternion).add(this.posePosition);
    if (this.current && this.current.rig) this.animateRig(dt, gun, reload);
    else this.animateGun(dt, gun, reload, inspect, amount, check);

    // Weapon physics move the whole posed gun about the pivot between the wrists.
    // Sprinting tips the gun down, except while reloading, inspecting or aiming.
    this.motion.sprintPose = this.current && this.current.held ? this.current.held.sprintPose : 1;
    this.motion.update(frameSeconds, player, yaw, pitch, wallDistance, aim, Boolean(player.sprinting) && reload < 0 && inspect < 0 && !aiming);
    this.holder.position.copy(this.pivot).add(this.motion.position.value).add(this.reachPull);
    const r = this.motion.rotation.value;
    this.holder.rotation.set(r.x, r.y, r.z);
    this.gun.position.copy(this.posePosition).sub(this.pivot);
    this.gun.quaternion.copy(this.poseQuaternion);
    const bend = MOTION.sprint.bend * this.motion.sprint * (1 - this.motion.tac) + MOTION.tacSprint.bend * this.motion.tac;
    if (this.current && this.current.rig) this.poseRig(bend);
    else this.poseArms(bend, pose, amount);
    if (this.dropping && this.dropModel) this.dropMagazine(this.dropping);
    this.dropping = null;
    this.showRedDot();

    const hipFov = this.points.viewFov || VIEW_FOV;
    const fov = hipFov + (AIM.viewFov - hipFov) * aim;
    if (fov !== this.camera.fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.sun.target.position.copy(this.posePosition);

    // Light and reflections come from where the sun and sky are, relative to
    // where the player looks.
    const inverse = cameraQuaternion.clone().invert();
    this.sun.position.copy(this.sunDirection).applyQuaternion(inverse).add(this.sun.target.position);
    this.scene.environmentRotation.setFromQuaternion(inverse);
    return aim;
  }

  // The slide, the support hand and the magazine. reload: how far through a
  // reload (0..1, or -1); inspect: how far into an inspect (seconds, or -1);
  // amount: how much of the inspect there is (it goes to 0 when it's cut
  // short); check: whether the inspect checks the chamber.
  animateGun(dt, gun, reload, inspect = -1, amount = 0, check = false) {
    if (this.flash) this.flash.update(dt);
    if (!this.pistol) return;
    const points = this.points;
    const rules = this.current.rules;

    // The trigger comes back as it breaks, then resets.
    this.triggerTime += dt;
    const pull = triggerPullAt(this.triggerTime);
    this.triggerPull = pull;
    if (this.trigger) this.trigger.position.z = this.triggerRest + TRIGGER_TRAVEL * pull;
    // The safety blade in its face presses in first, as the finger takes up the slack.
    if (this.safetyBlade) this.safetyBlade.position.z = this.safetyBladeRest + BLADE_TRAVEL * Math.min(1, pull * 3);
    // With the slide locked back on an empty magazine, the slide stop is up in
    // its notch, and the extractor's bump sits flush (nothing in the chamber).
    const quick = Math.min(1, dt * 40);
    this.stopLift += ((gun && gun.slideLocked ? 1 : 0) - this.stopLift) * quick;
    if (this.slideStop && points.slideStop) turnAbout(this.slideStop, this.slideStopRest, points.slideStop.pivot, points.slideStop.lift * this.stopLift);
    this.chambered += ((gun && gun.slideLocked ? 0 : 1) - this.chambered) * quick;
    if (this.extractor) this.extractor.position.x = this.extractorRest - INDICATOR_TRAVEL * (1 - this.chambered);

    // The slide snaps back on a shot and returns, or stays back on an empty gun.
    this.slideTime += dt;
    const locked = gun && gun.slideLocked;
    let back = 0;
    if (this.slideTime < 0.025) back = this.slideTime / 0.025;
    else if (this.slideTime < 0.075) back = locked ? 1 : 1 - (this.slideTime - 0.025) / 0.05;
    else back = locked ? 1 : 0;
    // Checking the chamber in an inspect, the support hand eases the slide
    // back half way and holds it, then lets go and it snaps forward.
    const pressed = reload < 0 && check && amount > 0 ? pressCheckAt(inspect) : 0;
    back = Math.max(back, pressed);
    if (reload < 0 && check && inspect >= INSPECT.release + PRESS_SNAP) {
      if (!this.pressSnapped) this.motion.slam(this.lastAim);
      this.pressSnapped = true;
    } else this.pressSnapped = false;
    // Racking it from behind (a gun whose empty reload ends that way), the
    // hand pulls the locked-back slide the last bit further before letting go.
    let racked = 0;
    if (reload >= 0 && gun && gun.reloadEmpty && locked) {
      const R = reloadSteps(rules, 'empty');
      if (R.rackGrab !== undefined) racked = smoothstep(R.rackGrab, R.rackPull, reload) * RACK_PULL;
    }
    if (this.slide) this.slide.position.z = this.slideRest + points.slideTravel * back + racked;
    const barrel = points.barrel;
    if (this.barrel && barrel) {
      turnAbout(this.barrel, this.barrelRest, barrel.pivot, barrel.tilt * back);
      this.barrel.position.z += barrel.travel * back;
    }
    // A hammer (the 1911's): cocked, it falls as the trigger breaks, and the
    // slide going back pushes it back past cocked; it settles back on the
    // sear as the slide returns. With the slide locked back, it's held just
    // past cocked.
    if (this.hammer && points.hammer) {
      const cocked = points.hammer.cocked;
      const st = this.slideTime;
      let angle = cocked;
      if (st < 0.006) angle = cocked * (1 - st / 0.006);
      else if (st < 0.03) angle = cocked * 1.12 * smoothstep(0.006, 0.03, st);
      else if (st < 0.09 && !locked) angle = cocked * (1.12 - 0.12 * smoothstep(0.03, 0.09, st));
      else if (locked) angle = cocked * 1.12;
      turnAbout(this.hammer, this.hammerRest, points.hammer.pivot, Math.max(angle, cocked * 1.12 * back));
    }
    // The slide slamming home jolts the gun again.
    if (!this.slammed && this.slideTime >= 0.06) {
      this.slammed = true;
      if (!locked) this.motion.slam(this.lastAim);
    }
    // The round in the chamber, if there is one (not while the slide is
    // cycling: the spent case is flying out then). Eased back, the extractor
    // draws it back with the slide, so its brass shows in the ejection port.
    if (this.chamberRound) {
      const ammo = gun && gun.ammo !== undefined ? gun.ammo : rules.magazine;
      this.chamberRound.visible = !locked && ammo > 0 && this.slideTime >= 0.075;
      this.chamberRound.position.z = this.chamberRoundRest.z + (points.slideTravel - (barrel ? barrel.travel : 0)) * pressed;
    }

    // The hands. A reload (its kind decides the support hand's path) or an
    // inspect, which is followed the same way, with its own path.
    const inspecting = reload < 0 && inspect >= 0;
    const kind = inspecting ? (check ? 'inspect' : 'inspectShort') : gun && gun.reloadEmpty ? 'empty' : 'catching';
    const S = inspecting ? INSPECT_STEPS : reloadSteps(rules, kind);
    const r = inspecting ? inspect : reload;
    // Cut short, the hands go back to holding the gun from wherever they are.
    const returning = inspecting ? 1 - amount : 0;
    // (The inspect's times are in seconds; the thumb's are fractions of a reload.)
    if (this.shooter) {
      // (On another gun, the thumb goes to that gun's magazine release.)
      const [from, to, k] = thumbAt(r, S, inspecting ? rules.reloadTime : 1, Boolean(this.current.thumbStop) && !inspecting);
      const grip = this.current.grip || 'grip';
      const release = (shape) => (shape === 'grip' ? grip : shape + this.current.release);
      const squeeze = this.current.grip ? 'squeeze' + this.current.release : null;
      this.shooter.set(release(from), release(to), k, grip, returning, squeeze, this.triggerPull || 0);
    }
    const hand = handAt(r, kind, this.current.paths);
    if (returning > 0) {
      hand.offset.multiplyScalar(1 - returning);
      hand.turn.slerp(NONE, returning);
    }
    if (this.leftArm) {
      // Turned about the wrist.
      this.leftArm.quaternion.copy(hand.turn);
      this.leftArm.position.copy(WRIST).applyQuaternion(hand.turn).negate().add(WRIST).add(hand.offset);
    }
    if (this.hand) this.hand.set(hand.from, hand.to, hand.k, 'grip', returning);
    // Whether the support hand is on the gun (rather than off at the belt).
    const ON_GUN = ['grip', 'loose', 'flat', 'pushing', 'slide'];
    this.supportOnGun = ON_GUN.includes(hand.from) && ON_GUN.includes(hand.to);
    // Pressing an attachment's switch (T): a quick reach and back, while
    // the hand's holding the gun.
    if (this.hand && this.flick !== null && this.current.switchPose && hand.from === 'grip' && hand.to === 'grip' && returning === 0 && r < 0) {
      const t = this.flick / FLICK.time;
      const k = t < FLICK.reach ? smoothstep(0, FLICK.reach, t) : t < FLICK.hold ? 1 : 1 - smoothstep(FLICK.hold, 1, t);
      this.hand.set('grip', this.current.switchPose, k);
    }
    if (!this.magazine || !this.magazineRest) return;

    // The magazines. Out comes the old one when the release is pressed; in
    // goes the fresh one, carried in the support hand from the belt. (In an
    // inspect, the old one goes back in.)
    const seconds = inspecting ? 1 : gun ? gun.reloadSeconds : 1;
    const out = r >= S.magOut && r < S.magIn;
    const fall = out ? magazineFall((r - S.magOut) * seconds) : 0;
    let inGun = !out; // the gun's own magazine, seated (or on its way out)
    let inHand = !inspecting && r >= (this.current.freshInHand || FRESH_IN_HAND)[kind] && r < S.magIn;
    // Rounds in the magazines: one of the gun's rounds is in the chamber, the
    // rest in the magazine; a fresh one from the pouch is full (or has what's
    // left in reserve).
    const ammo = gun && gun.ammo !== undefined ? gun.ammo : rules.magazine;
    const reserve = gun && gun.reserve !== undefined ? gun.reserve : rules.reserve;
    const inMagazine = gun && gun.slideLocked ? 0 : Math.max(0, ammo - 1);
    const fresh = Math.min(rules.magazine, reserve);
    let gunRounds = !inspecting && reload >= S.magIn ? fresh : inMagazine;
    let handRounds = fresh;
    this.magazine.position.copy(this.magazineRest);
    if (!out) this.dropDone = false;
    if (out && kind === 'empty') {
      // The empty one drops free, without a round on top, and out of view
      // it's handed over to the world.
      this.magazine.position.addScaledVector(this.magDown, Math.min(fall, HAND_TO_WORLD));
      inGun = fall < HAND_TO_WORLD;
      gunRounds = 0;
      if (!inGun && !this.dropDone) {
        this.dropDone = true;
        const t = (r - S.magOut) * seconds;
        this.dropping = { fallen: HAND_TO_WORLD, speed: 0.4 + 9.8 * t };
      }
    } else if (out && r < S.magCaught) {
      // The old one slides out and drops into the waiting hand...
      this.magazine.position.addScaledVector(this.magDown, Math.min(fall, CATCH_GAP));
      inGun = true;
    } else if (out && (inspecting || r < keyAt('catching', 'stow'))) {
      // ...which takes it down to the pouch (or, inspecting, holds it up to
      // look at and puts it back).
      inHand = true;
      handRounds = inMagazine;
    }
    this.magazine.visible = inGun;
    showRounds(this.magazine, gunRounds, rules.magazine);
    if (this.handMagazine) {
      this.handMagazine.visible = inHand;
      showRounds(this.handMagazine, handRounds, rules.magazine);
    }
  }

  // A gun with its own arms: its animations, as the gun's state says (see
  // animatedGun.js). Putting it away or drawing it plays its hide or draw
  // animation as far as the switch has got; a reload plays its reload
  // animation (from empty, its empty one) over the reload's time, and an
  // inspect its inspect; otherwise it's in its idle pose (with the slide
  // locked back once the last round has gone, if it has that pose), each
  // shot playing its shoot animation.
  animateRig(dt, gun, reload) {
    if (this.flash) this.flash.update(dt);
    const rig = this.current.rig;
    this.triggerTime += dt;
    this.triggerPull = triggerPullAt(this.triggerTime);
    let clip = 'idle';
    let time = 0;
    let toIdle = 0;
    // (Asked for again while it's lowered holding its pose, it goes on down
    // as it was: see updateSwitch.)
    const leaving = this.switching && (this.switching.to !== this.shownGun || this.rigHeld);
    const empty = Boolean(gun && gun.slideLocked);
    if (leaving) {
      clip = 'hide';
      time = this.lowered * rig.duration('hide');
    } else if (this.switching) {
      clip = 'draw';
      time = (1 - this.lowered) * rig.duration('draw');
    } else if (reload >= 0) {
      clip = gun.reloadEmpty ? 'reloadEmpty' : 'reload';
      time = reload * rig.duration(rig.clipFor(clip));
    } else if (gun && gun.inspectTime >= 0) {
      clip = 'inspect';
      time = gun.inspectTime;
      toIdle = 1 - smoothstep(0, 1, gun.inspectAmount);
    }
    // (The opt-in extras' slide: while it's being put away, it stays as it
    // was when the switch began.)
    const slide = leaving ? rig.slideMode : reload >= 0 && !gun.reloadEmpty ? 'home' : empty ? 'locked' : 'clip';
    // (Its shots move on in real time, as the fire rate does. Walking and
    // running, its walk and run loops play, if it has them, as much as the
    // gun layer's own bob and sprint pose have come in.)
    // (Aiming, they're kept down as much as the gun layer's bob is.)
    const k = this.motion.bobAmount * (1 - (1 - MOTION.aiming.bob) * (this.lastAim || 0));
    const s = this.rigState;
    s.moving.walk = k * (1 - this.motion.sprint);
    s.moving.run = k * this.motion.sprint;
    s.clip = clip;
    s.time = time;
    s.toIdle = toIdle;
    s.empty = empty;
    s.shotDt = this.rigFrameSeconds;
    s.aim = this.lastAim || 0;
    s.slide = slide;
    s.triggerPull = this.triggerPull;
    rig.update(dt, s);
  }

  // Where a gun with its own arms is held: at the eye moved to the hip, a
  // little lower on a tactical sprint (its RIG tacOut); its wrists bend
  // sprinting only if its model asks for it (see animatedGun.js).
  poseRig(sprintBend) {
    const g = this.current;
    g.object.position.copy(g.at).addScaledVector(g.held.tacOut, this.motion.tac).addScaledVector(g.held.sprintOut, this.motion.sprint);
    if (sprintBend) g.rig.bendWrists(sprintBend);
  }

  // Where a red dot sight's dot is (a gun whose points have redDot; the
  // gun layer's camera space, into `out`), as a real one shows it: where
  // the line from the eye along the sight's axis (the gun's, forward) meets
  // the lens, so it sits on what the gun points at, and shots go there (see
  // sightOnScreen). With the eye further off that axis than inLens of the
  // lens's radius, it's drawn there on the lens instead, towards the axis
  // line (see RED_DOT). Returns how far off the axis the eye is (metres).
  redDotPoint(out) {
    const lens = this.points.redDot;
    this.scene.updateMatrixWorld();
    const s = this.points.sights;
    this.pistol.localToWorld(lensAt.set(s.x || 0, s.height, lens.z ?? s.rearZ));
    lensAxis.set(0, 0, -1).transformDirection(this.pistol.matrixWorld);
    // (The gun layer's camera is at its origin, looking along -Z.)
    out.copy(lensAxis).multiplyScalar(lensAt.dot(lensAxis));
    const off = out.distanceTo(lensAt);
    const most = RED_DOT.inLens * lens.radius;
    if (off > most) out.sub(lensAt).multiplyScalar(most / off).add(lensAt);
    return off;
  }

  // A red dot sight's dot (see redDotPoint) shows when the eye is behind the
  // lens (near the middle of the screen once aimed, out of sight at the
  // hip), fading out towards the lens's rim; and aimed, while the eye is
  // shaken off the lens by firing (RED_DOT). (It's drawn just in front of
  // the lens, in the gun layer.)
  showRedDot() {
    const dot = this.redDot;
    const lens = this.points.redDot;
    dot.visible = false;
    if (!lens || !this.pistol || this.lowered >= 1) return;
    const off = this.redDotPoint(lensSeen);
    if (lensSeen.z > -0.02) return;
    const r = lens.radius;
    const behind = 1 - smoothstep(0.75 * r, r, off);
    const aimed = smoothstep(RED_DOT.aimFrom, 1, this.lastAim || 0) * (1 - smoothstep(RED_DOT.keep * r, (RED_DOT.keep + 0.5) * r, off));
    const opacity = Math.max(behind, aimed);
    if (opacity <= 0.01) return;
    dot.position.copy(lensSeen).addScaledVector(lensAxis, -0.0015);
    dot.material.opacity = opacity;
    dot.visible = true;
  }

  // The dropped magazine as it leaves the gun: where it is, which way it's
  // turned and how fast it's going (in the gun layer's camera space).
  dropMagazine({ fallen, speed }) {
    this.scene.updateMatrixWorld();
    const pistol = this.pistol.matrixWorld;
    const turn = this.pistol.getWorldQuaternion(new THREE.Quaternion());
    this.dropped = {
      object: this.dropModel.clone(true),
      position: MAGAZINE_CENTER.clone().addScaledVector(this.magDown, fallen).applyMatrix4(pistol),
      quaternion: turn.clone().multiply(MAGAZINE_TURN),
      velocity: this.magDown.clone().applyQuaternion(turn).multiplyScalar(speed),
    };
  }

  // An empty magazine dropped since last asked, if any (see dropMagazine).
  takeDroppedMagazine() {
    const dropped = this.dropped;
    this.dropped = null;
    return dropped;
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
