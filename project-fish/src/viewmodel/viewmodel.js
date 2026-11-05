// The first-person view of the hands and gun.
//
// They live in their own small scene with their own camera, drawn after the
// world on top of it. That way the gun never pokes into walls, and its size on
// screen doesn't change with the player's field of view.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createPistol, GRIP, SIGHTS, MAGAZINE } from './pistol.js';
import { createArms, rightHandPose } from './arms.js';
import { SupportHand, WRIST, HOLD_TURN, holdingAt, handMatrix } from './supportHand.js';
import { ShootingHand } from './shootingHand.js';
import { ViewmodelMotion, MOTION } from './motion.js';
import { MuzzleFlash } from '../effects/muzzleFlash.js';
import { RELOAD_STEPS, CATCH_GAP, magazineFall } from '../weapon.js';
import { PISTOL } from '../shared/config.js';

// Points on the pistol (gun space): the muzzle, and the ejection port the
// spent case comes out of.
const MUZZLE = [0, 0, -0.1545];
const PORT = [0.008, 0.017, -0.025];
const SLIDE_TRAVEL = 0.028; // how far the slide goes back when firing (metres)
// The barrel only follows the slide a little way, and its back end tips down
// as it unlocks (pivoting near the muzzle), like a real pistol's.
const BARREL = { travel: 0.0035, tilt: 0.0105, pivot: new THREE.Vector3(0, 0, -0.15) };
const TRIGGER_TRAVEL = 0.0032;
// Small moving parts: the slide stop turns up (radians) about the pin at its
// back end (gun space; the Blender pistol matches) into the slide's notch
// when the slide locks back empty; how far the extractor's loaded-chamber
// bump sinks in (metres) when there's no round in the chamber; how far the
// trigger's safety blade presses in as the trigger is pulled.
const SLIDE_STOP = { lift: 0.12, pivot: new THREE.Vector3(0, -0.0143, 0.0085) };
const INDICATOR_TRAVEL = 0.0006;
const BLADE_TRAVEL = 0.0009;

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

// The second half, the same for both: from taking hold of the fresh magazine
// at the belt (the hand turned `turn` there) to closing round the grip again.
const freshMagazine = (S, turn) => [
  { r: S.magGrab, at: BELT.clone().add(V(0, -0.005, 0)), turn, hand: 'magazine', stop: true, name: 'grab' }, // closes round a fresh magazine
  { r: S.magGrab + 0.07, at: V(-0.08, -0.25, 0.15), turn: between(turn, HOLD_TURN, 0.5), hand: 'magazine' }, // pulls it out, turning it up
  { r: 0.5, at: holdingAt(MAG_AT_WELL + 0.05).add(V(-0.03, -0.02, 0.04)), turn: HOLD_TURN, hand: 'magazine' },
  { r: 0.545, at: holdingAt(MAG_AT_WELL + 0.008), turn: HOLD_TURN, hand: 'magazine', stop: true }, // lined up under the well
  { r: 0.59, at: holdingAt(0.055), turn: HOLD_TURN, hand: 'pushing' }, // in it goes, the fingers sliding off its front...
  { r: S.magIn, at: holdingAt(0), turn: HOLD_TURN, hand: 'flat', stop: true }, // ...and the palm pushes it home
  { r: 0.665, at: holdingAt(0).addScaledVector(GRIP.down, 0.022).add(V(-0.008, 0, 0)), turn: between(HOLD_TURN, NONE, 0.2), hand: 'flat' },
  { r: 0.725, at: V(-0.045, -0.07, 0.022), turn: between(HOLD_TURN, NONE, 0.62), hand: 'reaching' }, // turning back
  { r: 0.79, at: V(-0.028, -0.028, 0.01), turn: NONE, hand: 'reaching' }, // beside the grip
  { r: 0.815, at: V(-0.008, -0.01, 0.004), turn: NONE, hand: 'loose' }, // fingers round it...
  { r: S.handOn, at: V(0, 0, 0), turn: NONE, hand: 'grip', stop: true }, // ...and closed on it
];

// The support hand's keyframes for each kind of reload: reload progress,
// where the hand is (from where it holds the gun), how it's turned (about
// the wrist), its hand shape (supportHand.js), and whether it stops there
// (otherwise it flows through).
const HAND_PATHS = (() => {
  const E = RELOAD_STEPS.empty;
  const C = RELOAD_STEPS.catching;
  return {
    // From empty: off the grip and straight down to the belt, as the thumb
    // presses the release and the empty magazine falls.
    empty: [
      { r: 0, at: V(0, 0, 0), turn: NONE, hand: 'grip', stop: true },
      { r: 0.035, at: V(-0.012, -0.014, 0.008), turn: NONE, hand: 'loose' }, // fingers lift off the grip...
      { r: 0.06, at: V(-0.022, -0.03, -0.012), turn: turned(0.08, 0, 0.05), hand: 'loose' }, // ...off the front of the grip...
      { r: 0.105, at: V(-0.055, -0.18, 0.095), turn: turned(0.3, 0, 0.14), hand: 'reaching' }, // ...and it's away
      { r: 0.2, at: V(-0.088, -0.34, 0.195), turn: turned(0.48, 0, 0.19), hand: 'relaxed' }, // down to the belt
      { r: 0.305, at: BELT, turn: AT_BELT, hand: 'open', stop: true, name: 'reach' },
      ...freshMagazine(E, AT_BELT),
    ],
    // With rounds left: palm up under the grip to catch the old magazine,
    // out with it, put it away on the way down, and on to the belt for a
    // fresh one, palm up all the way.
    catching: [
      { r: 0, at: V(0, 0, 0), turn: NONE, hand: 'grip', stop: true },
      { r: 0.03, at: V(-0.012, -0.014, 0.008), turn: between(NONE, HOLD_TURN, 0.08), hand: 'loose' }, // fingers lift off the grip...
      { r: 0.09, at: holdingAt(CATCH_GAP + 0.04).add(V(-0.05, 0, 0.02)), turn: between(NONE, HOLD_TURN, 0.6), hand: 'reaching' }, // ...turning palm up
      { r: 0.15, at: holdingAt(CATCH_GAP), turn: HOLD_TURN, hand: 'flat', stop: true }, // under the magazine
      { r: C.magCaught, at: holdingAt(CATCH_GAP), turn: HOLD_TURN, hand: 'flat', stop: true }, // it drops in...
      { r: 0.25, at: holdingAt(CATCH_GAP + 0.008), turn: HOLD_TURN, hand: 'pushing' }, // ...the hand gives a little and the fingers close...
      { r: 0.275, at: holdingAt(MAG_AT_WELL + 0.03), turn: HOLD_TURN, hand: 'magazine' }, // ...pulling it out
      { r: 0.305, at: V(-0.07, -0.26, 0.14), turn: HOLD_TURN, hand: 'magazine', stop: true, name: 'stow' }, // into a pouch...
      { r: 0.33, at: V(-0.08, -0.3, 0.17), turn: HOLD_TURN, hand: 'open' }, // ...lets go of it...
      { r: 0.36, at: BELT, turn: HOLD_TURN, hand: 'open', stop: true, name: 'reach' }, // ...and on to the belt
      ...freshMagazine(C, HOLD_TURN),
    ],
  };
})();
const keyAt = (kind, name) => HAND_PATHS[kind].find((key) => key.name === name).r;
// The fresh magazine appears in the hand as its fingers close on it at the
// belt, and is in the hand until it's home.
const FRESH_IN_HAND = {
  empty: (keyAt('empty', 'reach') + keyAt('empty', 'grab')) / 2,
  catching: (keyAt('catching', 'reach') + keyAt('catching', 'grab')) / 2,
};

// The shooting hand's thumb: it starts down this long before the release is
// pressed, is on the button this long before, and is back this long after
// (fractions of the reload).
const THUMB = { start: 0.08, on: 0.035, back: 0.06 };

// How far the thumb is from holding the grip to being on the release and
// pressing it, at reload progress r: [from shape, to shape, how far].
function thumbAt(r, S) {
  const ease = (a, b) => smoothstep(a, b, r);
  const press = S.magOut;
  if (r < press - THUMB.start || r >= press + THUMB.back) return ['grip', 'grip', 0];
  if (r < press - THUMB.on) return ['grip', 'onRelease', ease(press - THUMB.start, press - THUMB.on)];
  if (r < press) return ['onRelease', 'pressRelease', ease(press - THUMB.on, press)];
  return ['pressRelease', 'grip', ease(press, press + THUMB.back)];
}

// Where the hand is at reload progress r: offset, turn, and hand shapes to
// blend between. The path is a smooth curve through the keyframes (stopping
// at the ones marked to), the turn and the hand shape ease from one key to
// the next. (Exported so the path can be checked outside the game.)
const handPath = { offset: new THREE.Vector3(), turn: new THREE.Quaternion(), from: 'grip', to: 'grip', k: 0 };
export function handAt(r, kind = 'empty') {
  const keys = HAND_PATHS[kind];
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

// Detailed models made in Blender (see tools/blender/).
const PISTOL_MODEL = new URL('../../assets/pistol.glb', import.meta.url);
const ARMS_MODEL = new URL('../../assets/arms.glb', import.meta.url);

const VIEW_FOV = 52; // vertical, degrees

// Where the gun sits in front of the camera when held at the hip: arms pushed
// out, pistol a little right of centre, pointing straight ahead.
const HIP_POSITION = new THREE.Vector3(0.075, -0.07, -0.5);
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
const AIM_POSITION = new THREE.Vector3(0, -SIGHTS.height, -(AIM.eyeToRearSight + SIGHTS.rearZ));
const AIM_ROTATION = new THREE.Quaternion();
const HIP_QUATERNION = new THREE.Quaternion().setFromEuler(HIP_ROTATION);

// The arms swing about this point between the wrists (gun space), not the eye.
const PIVOT = new THREE.Vector3(0, -0.085, 0.07);
// The wrists bend about the line through both of them (gun space): from the
// shooting hand's wrist to the support hand's (arms.js).
const RIGHT_WRIST = rightHandPose().wrist;
const WRIST_LINE = WRIST.clone().sub(RIGHT_WRIST).normalize();

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

// Reflections: an outdoor sky over grey ground with the sun in it, matching the
// world, so metal shows the sky above and the ground below, like outside.
function outdoorEnvironment(renderer, sunDirection) {
  const scene = new THREE.Scene();
  const dome = new THREE.SphereGeometry(10, 64, 32);
  const sky = new THREE.Color(0x8fadd0);
  const horizon = new THREE.Color(0xdde4ea);
  const ground = new THREE.Color(0x5e5e5e);
  const colors = [];
  const position = dome.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const up = position.getY(i) / 10;
    const c = up > 0 ? horizon.clone().lerp(sky, Math.pow(up, 0.5)) : horizon.clone().lerp(ground, Math.min(1, -up * 8));
    colors.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 13, 12) }));
  sun.position.copy(sunDirection).multiplyScalar(9);
  scene.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0).texture;
  pmrem.dispose();
  return texture;
}

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Shows what's in a magazine with `rounds` rounds: the top round and the one
// staggered under it, brass behind each pair of witness holes down to the
// level the rounds reach (the top pair from 2, the bottom pair only when
// full), and the follower when it's empty.
function showRounds(magazine, rounds) {
  if (!magazine) return;
  const set = (name, on) => {
    const part = magazine.getObjectByName(name);
    if (part) part.visible = on;
  };
  set('magazine_round', rounds >= 1);
  set('magazine_second_round', rounds >= 2);
  set('magazine_follower', rounds === 0);
  for (let k = 1; k <= 6; k++) set(`magazine_rounds_${k}`, rounds >= (k * PISTOL.magazine) / 6);
}

// The support (left) arm as one group, so it can let go during a reload.
function leftArmOf(arms) {
  const existing = arms.getObjectByName('leftArm');
  if (existing) return existing;
  const group = new THREE.Group();
  group.name = 'leftArm';
  for (const part of arms.children.filter((c) => c.name.startsWith('left'))) group.add(part);
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
// built-in one instead, so the game still works.
async function loadModel(url, fallback) {
  try {
    return (await loader.loadAsync(url.href)).scene;
  } catch (error) {
    console.warn(`Couldn't load ${url.pathname}; using the built-in model instead.`, error);
    return fallback();
  }
}

export class Viewmodel {
  constructor(renderer, sunDirection) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(VIEW_FOV, 1, 0.01, 3);

    this.scene.environment = outdoorEnvironment(renderer, sunDirection);
    this.scene.environmentIntensity = 0.9;

    this.scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x55554f, 0.35));
    // The sun, with its own small, sharp shadow map: the hands shade the gun and each other.
    this.sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -0.24, right: 0.24, top: 0.24, bottom: -0.24, near: 0.05, far: 2 });
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

    this.flash = new MuzzleFlash(MUZZLE);
    this.slideTime = 1; // seconds since the slide last went back
    this.triggerTime = 1; // seconds since the trigger was last pulled
    this.slammed = true;
    this.lastAim = 0;
    this.pistol = null;
    this.dropped = null; // an empty magazine just dropped, for the world to take over
    this.dropping = null;
    this.dropDone = false;

    // Resolves once the pistol and hands are loaded and in place.
    this.ready = Promise.all([loadModel(PISTOL_MODEL, createPistol), loadModel(ARMS_MODEL, createArms)]).then(([pistol, arms]) => {
      arms.name = 'arms';
      this.gun.add(shadowed(pistol), shadowed(arms));
      this.pistol = pistol;
      this.slide = pistol.getObjectByName('slide');
      this.slideRest = this.slide ? this.slide.position.z : 0;
      this.trigger = pistol.getObjectByName('trigger');
      this.triggerRest = this.trigger ? this.trigger.position.z : 0;
      this.barrel = pistol.getObjectByName('barrel');
      this.barrelRest = restOf(this.barrel);
      this.magazine = pistol.getObjectByName('magazine');
      this.magazineRest = this.magazine ? this.magazine.position.clone() : null;
      this.slideStop = pistol.getObjectByName('slide_stop');
      this.slideStopRest = restOf(this.slideStop);
      this.extractor = pistol.getObjectByName('extractor');
      this.extractorRest = this.extractor ? this.extractor.position.x : 0;
      this.safetyBlade = pistol.getObjectByName('safety_blade');
      this.safetyBladeRest = this.safetyBlade ? this.safetyBlade.position.z : 0;
      this.stopLift = 0;
      this.chambered = 1;
      this.leftArm = leftArmOf(arms);
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
      // The fresh magazine the support hand brings back during a reload.
      if (this.magazine) {
        // Where it sits in the hand: where the seated magazine is, relative to
        // the hand pushing it home.
        this.handMagazine = this.magazine.clone();
        this.magazine.updateMatrix();
        handMatrix(holdingAt(0), HOLD_TURN).invert().multiply(this.magazine.matrix)
          .decompose(this.handMagazine.position, this.handMagazine.quaternion, this.handMagazine.scale);
        this.handMagazine.visible = false;
        shadowed(this.handMagazine);
        this.leftArm.add(this.handMagazine);
      }
      // A copy of the magazine for dropping into the world, centred on the
      // middle of the magazine and lined up with it (see MAGAZINE_FRAME).
      if (this.magazine) {
        const copy = this.magazine.clone();
        showRounds(copy, 0); // it's empty
        this.magazine.updateMatrix();
        MAGAZINE_FRAME.clone().invert().multiply(this.magazine.matrix).decompose(copy.position, copy.quaternion, copy.scale);
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
        this.dropModel = new THREE.Group();
        this.dropModel.add(copy);
      }
      this.flash.attachTo(pistol);
    });

  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // A shot: the gun kicks, the muzzle flashes and the slide cycles.
  fire(aim) {
    this.motion.kick(aim);
    this.flash.fire();
    this.slideTime = 0;
    this.triggerTime = 0;
    this.slammed = false;
  }

  // The palm seating the new magazine jolts the gun up a little.
  seatMagazine() {
    this.motion.rotation.velocity.x += 0.5;
    this.motion.position.velocity.y += 0.06;
  }

  // The trigger pulled on an empty gun: it moves, nothing else happens.
  dryFire() {
    this.triggerTime = 0;
    this.motion.twitch();
  }

  // A hand-mounted part (the hard knuckle guard) moves with the hand when the
  // wrist bends.
  carriedByHand(rig, part) {
    if (part) rig.root.attach(part);
  }

  // Bends both wrists `angle` radians, muzzle down: the hands and the gun turn
  // together about the line through both wrists, and the forearms stay put.
  bendWrists(angle) {
    const turn = new THREE.Quaternion().setFromAxisAngle(WRIST_LINE, angle);
    if (this.hand) this.hand.bendWrist(turn);
    if (this.shooter) this.shooter.bendWrist(turn);
    if (this.pistol) {
      this.pistol.quaternion.copy(turn);
      this.pistol.position.copy(RIGHT_WRIST).applyQuaternion(turn).negate().add(RIGHT_WRIST);
    }
  }

  // Whether the gun is up and can fire: not while it's still in (or coming
  // up from) the sprint pose.
  get readyToFire() {
    return this.motion.sprint < 0.25;
  }

  // Where a point on the gun (gun space) is in the gun layer's camera space.
  pointOnGun([x, y, z]) {
    this.scene.updateMatrixWorld();
    return (this.pistol || this.gun).localToWorld(new THREE.Vector3(x, y, z));
  }

  muzzlePoint() {
    return this.pointOnGun(MUZZLE);
  }

  portPoint() {
    return this.pointOnGun(PORT);
  }

  // Where the front sight is on screen (-1..1 each way), so shots go where the
  // sights point.
  sightOnScreen() {
    return this.pointOnGun([0, SIGHTS.height, SIGHTS.frontZ]).project(this.camera);
  }

  // frameSeconds: time since the last frame. player: movement state.
  // yaw / pitch: where the player is looking. cameraQuaternion: the world
  // camera's rotation. wallDistance: metres to whatever is straight ahead.
  // aiming: whether the aim button is held. gun: { slideLocked,
  // reloadProgress (0..1, or -1), reloadSeconds }. Returns how far into
  // aiming the gun is (0..1, eased), for zooming the world.
  update(frameSeconds, player, yaw, pitch, cameraQuaternion, wallDistance = Infinity, aiming = false, gun = null) {
    // Bring the sights up or down at a steady pace, eased at both ends.
    const dt = Math.min(frameSeconds, 0.05);
    this.aimProgress = Math.min(1, Math.max(0, this.aimProgress + (aiming ? dt : -dt) / AIM.time));
    const p = this.aimProgress;
    const aim = p * p * (3 - 2 * p);
    this.lastAim = aim;
    if (aiming !== this.wasAiming) this.motion.settle(aiming ? 1 : -1);
    this.wasAiming = aiming;

    // The pose for this much aiming, with a slight swoop on the way.
    const swoop = Math.sin(Math.PI * aim);
    this.posePosition.lerpVectors(HIP_POSITION, AIM_POSITION, aim);
    this.posePosition.y -= AIM.arc.down * swoop;
    this.poseQuaternion.slerpQuaternions(HIP_QUATERNION, AIM_ROTATION, aim);
    this.poseQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), AIM.arc.roll * swoop));
    // Reloading: the gun comes up and in, tipped so the magazine well faces
    // you, so you can watch the support hand bring the new magazine in.
    const reload = gun ? gun.reloadProgress : -1;
    const tilt = reload < 0 ? 0 : smoothstep(0, 0.14, reload) * (1 - smoothstep(0.84, 1, reload));
    if (tilt > 0) {
      this.posePosition.add(RELOAD_POSE.position.clone().multiplyScalar(tilt));
      this.poseQuaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...RELOAD_POSE.turn.map((a) => a * tilt))));
    }
    this.pivot.copy(PIVOT).applyQuaternion(this.poseQuaternion).add(this.posePosition);
    this.animateGun(dt, gun, reload);

    // Weapon physics move the whole posed gun about the pivot between the wrists.
    // Sprinting tips the gun down, except while reloading or aiming.
    this.motion.update(frameSeconds, player, yaw, pitch, wallDistance, aim, Boolean(player.sprinting) && reload < 0 && !aiming);
    this.holder.position.copy(this.pivot).add(this.motion.position.value);
    const r = this.motion.rotation.value;
    this.holder.rotation.set(r.x, r.y, r.z);
    this.gun.position.copy(this.posePosition).sub(this.pivot);
    this.gun.quaternion.copy(this.poseQuaternion);
    this.bendWrists(MOTION.sprint.bend * this.motion.sprint);
    if (this.dropping && this.dropModel) this.dropMagazine(this.dropping);
    this.dropping = null;

    const fov = VIEW_FOV + (AIM.viewFov - VIEW_FOV) * aim;
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

  // The slide, the support hand and the magazine.
  animateGun(dt, gun, reload) {
    this.flash.update(dt);
    if (!this.pistol) return;

    // The trigger comes back as it breaks, then resets.
    this.triggerTime += dt;
    const tt = this.triggerTime;
    const pull = tt < 0.03 ? tt / 0.03 : tt < 0.11 ? 1 - (tt - 0.03) / 0.08 : 0;
    if (this.trigger) this.trigger.position.z = this.triggerRest + TRIGGER_TRAVEL * pull;
    // The safety blade in its face presses in first, as the finger takes up the slack.
    if (this.safetyBlade) this.safetyBlade.position.z = this.safetyBladeRest + BLADE_TRAVEL * Math.min(1, pull * 3);
    // With the slide locked back on an empty magazine, the slide stop is up in
    // its notch, and the extractor's bump sits flush (nothing in the chamber).
    const quick = Math.min(1, dt * 40);
    this.stopLift += ((gun && gun.slideLocked ? 1 : 0) - this.stopLift) * quick;
    if (this.slideStop) turnAbout(this.slideStop, this.slideStopRest, SLIDE_STOP.pivot, SLIDE_STOP.lift * this.stopLift);
    this.chambered += ((gun && gun.slideLocked ? 0 : 1) - this.chambered) * quick;
    if (this.extractor) this.extractor.position.x = this.extractorRest - INDICATOR_TRAVEL * (1 - this.chambered);

    // The slide snaps back on a shot and returns, or stays back on an empty gun.
    this.slideTime += dt;
    const locked = gun && gun.slideLocked;
    let back = 0;
    if (this.slideTime < 0.025) back = this.slideTime / 0.025;
    else if (this.slideTime < 0.075) back = locked ? 1 : 1 - (this.slideTime - 0.025) / 0.05;
    else back = locked ? 1 : 0;
    if (this.slide) this.slide.position.z = this.slideRest + SLIDE_TRAVEL * back;
    if (this.barrel) {
      turnAbout(this.barrel, this.barrelRest, BARREL.pivot, BARREL.tilt * back);
      this.barrel.position.z += BARREL.travel * back;
    }
    // The slide slamming home jolts the gun again.
    if (!this.slammed && this.slideTime >= 0.06) {
      this.slammed = true;
      if (!locked) this.motion.slam(this.lastAim);
    }

    // The hands. Which kind of reload it is decides the support hand's path.
    const kind = gun && gun.reloadEmpty ? 'empty' : 'catching';
    const S = RELOAD_STEPS[kind];
    if (this.shooter) this.shooter.set(...thumbAt(reload, S));
    const hand = handAt(reload, kind);
    if (this.leftArm) {
      // Turned about the wrist.
      this.leftArm.quaternion.copy(hand.turn);
      this.leftArm.position.copy(WRIST).applyQuaternion(hand.turn).negate().add(WRIST).add(hand.offset);
    }
    if (this.hand) this.hand.set(hand.from, hand.to, hand.k);
    if (!this.magazine || !this.magazineRest) return;

    // The magazines. Out comes the old one when the release is pressed; in
    // goes the fresh one, carried in the support hand from the belt.
    const seconds = gun ? gun.reloadSeconds : 1;
    const out = reload >= S.magOut && reload < S.magIn;
    const fall = out ? magazineFall((reload - S.magOut) * seconds) : 0;
    let inGun = !out; // the gun's own magazine, seated (or on its way out)
    let inHand = reload >= FRESH_IN_HAND[kind] && reload < S.magIn;
    // Rounds in the magazines: one of the gun's rounds is in the chamber, the
    // rest in the magazine; a fresh one from the pouch is full (or has what's
    // left in reserve).
    const ammo = gun && gun.ammo !== undefined ? gun.ammo : PISTOL.magazine;
    const reserve = gun && gun.reserve !== undefined ? gun.reserve : PISTOL.reserve;
    const inMagazine = gun && gun.slideLocked ? 0 : Math.max(0, ammo - 1);
    const fresh = Math.min(PISTOL.magazine, reserve);
    let gunRounds = reload >= 0 && reload >= S.magIn ? fresh : inMagazine;
    let handRounds = fresh;
    this.magazine.position.copy(this.magazineRest);
    if (!out) this.dropDone = false;
    if (out && kind === 'empty') {
      // The empty one drops free, without a round on top, and out of view
      // it's handed over to the world.
      this.magazine.position.addScaledVector(GRIP.down, Math.min(fall, HAND_TO_WORLD));
      inGun = fall < HAND_TO_WORLD;
      gunRounds = 0;
      if (!inGun && !this.dropDone) {
        this.dropDone = true;
        const t = (reload - S.magOut) * seconds;
        this.dropping = { fallen: HAND_TO_WORLD, speed: 0.4 + 9.8 * t };
      }
    } else if (out && reload < S.magCaught) {
      // The old one slides out and drops into the waiting hand...
      this.magazine.position.addScaledVector(GRIP.down, Math.min(fall, CATCH_GAP));
      inGun = true;
    } else if (out && reload < keyAt('catching', 'stow')) {
      // ...which takes it down to the pouch.
      inHand = true;
      handRounds = inMagazine;
    }
    this.magazine.visible = inGun;
    showRounds(this.magazine, gunRounds);
    if (this.handMagazine) {
      this.handMagazine.visible = inHand;
      showRounds(this.handMagazine, handRounds);
    }
  }

  // The dropped magazine as it leaves the gun: where it is, which way it's
  // turned and how fast it's going (in the gun layer's camera space).
  dropMagazine({ fallen, speed }) {
    this.scene.updateMatrixWorld();
    const pistol = this.pistol.matrixWorld;
    const turn = this.pistol.getWorldQuaternion(new THREE.Quaternion());
    this.dropped = {
      object: this.dropModel.clone(true),
      position: MAGAZINE_CENTER.clone().addScaledVector(GRIP.down, fallen).applyMatrix4(pistol),
      quaternion: turn.clone().multiply(MAGAZINE_TURN),
      velocity: GRIP.down.clone().applyQuaternion(turn).multiplyScalar(speed),
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
