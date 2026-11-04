// The first-person view of the hands and gun.
//
// They live in their own small scene with their own camera, drawn after the
// world on top of it. That way the gun never pokes into walls, and its size on
// screen doesn't change with the player's field of view.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createPistol, GRIP, SIGHTS, MAGAZINE } from './pistol.js';
import { createArms } from './arms.js';
import { SupportHand, MAG_IN_HAND, WRIST, ALONG, PALM_NORMAL, PALM_HEEL } from './supportHand.js';
import { ViewmodelMotion } from './motion.js';
import { MuzzleFlash } from '../effects/muzzleFlash.js';
import { RELOAD_STEPS } from '../weapon.js';

// Points on the pistol (gun space): the muzzle, and the ejection port the
// spent case comes out of.
const MUZZLE = [0, 0, -0.1545];
const PORT = [0.008, 0.017, -0.025];
const SLIDE_TRAVEL = 0.028; // how far the slide goes back when firing (metres)
// The barrel only follows the slide a little way, and its back end tips down
// as it unlocks (pivoting near the muzzle), like a real pistol's.
const BARREL = { travel: 0.0035, tilt: 0.0105, muzzleZ: -0.15 };
const TRIGGER_TRAVEL = 0.0032;

// Where the gun goes while reloading, relative to how it's held: up, in and
// tipped so the magazine well faces the support hand, clear of the shooting
// hand's wrist (radians: muzzle up, muzzle right, top towards the right).
const RELOAD_POSE = { position: new THREE.Vector3(-0.04, 0.08, 0.09), turn: [0.22, -0.18, -0.9] };

// --- The support hand during a reload ---------------------------------------
//
// It lets go of the gun, fingers opening, drops to the belt and closes round a
// fresh magazine, brings it back up and lines it up under the magazine well,
// lifts its thumb off and pushes the magazine in until it reaches the bottom
// of the grip. There it lets go, turns its palm up under the magazine
// and slaps it home, then slides back up the grip and closes round it again.

// How far the magazine is from home (metres along the grip) when its top is
// at the mouth of the magazine well, and when the hand lets go of it: as far
// in as the hand can push it before its thumb and palm reach the bottom of
// the grip.
const MAG_AT_WELL = GRIP.bottom - MAGAZINE.top;
const RELEASE_GAP = 0.086;

// Where the hand goes to hold the magazine `gap` metres out of the gun.
const holding = (gap) => GRIP.down.clone().multiplyScalar(gap).sub(MAG_IN_HAND);

// Palm up, to slap the magazine home: the palm faces up the grip, the wrist
// bent back a little so the fingers point away from the gun (forward and to
// the right), out of the way of the shooting hand.
const RIGHT = new THREE.Vector3(1, 0, 0);
const PALM_UP = (() => {
  const frame = (x, y) => {
    const X = x.clone().normalize();
    const Z = new THREE.Vector3().crossVectors(X, y).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, new THREE.Vector3().crossVectors(Z, X), Z));
  };
  const fingers = RIGHT.clone().multiplyScalar(0.55).addScaledVector(GRIP.front, 0.75).addScaledVector(GRIP.down, 0.25);
  return frame(fingers, GRIP.down.clone().negate()).multiply(frame(ALONG, PALM_NORMAL).invert());
})();
// Where the hand goes to push on the bottom of the magazine `gap` metres out
// of the gun with the heel of its palm. The palm is curved: the middle of it
// rises a little above the heel.
const PALM_RISE = 0.0125;
const pushing = (gap) => {
  const base = GRIP.top.clone().addScaledVector(GRIP.front, MAGAZINE.forward).addScaledVector(GRIP.down, MAGAZINE.base + gap + PALM_RISE);
  const heel = PALM_HEEL.clone().sub(WRIST).applyQuaternion(PALM_UP).add(WRIST);
  return base.sub(heel);
};
const PALM_HALF = new THREE.Quaternion().slerp(PALM_UP, 0.5);
const NONE = new THREE.Quaternion();
const turned = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const S = RELOAD_STEPS;

// Keyframes: reload progress, where the hand is (from where it holds the gun),
// how it's turned (about the wrist), its hand shape (supportHand.js), and
// whether it stops there (otherwise it flows through).
const HAND_KEYS = [
  { r: S.magOut, at: V(0, 0, 0), turn: NONE, hand: 'grip', stop: true },
  { r: 0.13, at: V(-0.012, -0.014, 0.008), turn: NONE, hand: 'loose' }, // fingers lift off the grip...
  { r: 0.17, at: V(-0.06, -0.06, 0.035), turn: turned(0.1, 0, 0.12), hand: 'open' }, // ...and it lets go
  { r: 0.27, at: V(-0.09, -0.36, 0.2), turn: turned(0.5, 0, 0.2), hand: 'relaxed' }, // down to the belt
  { r: 0.31, at: V(-0.095, -0.38, 0.21), turn: turned(0.55, 0, 0.2), hand: 'open', stop: true, name: 'reach' },
  { r: S.magGrab, at: V(-0.095, -0.385, 0.21), turn: turned(0.55, 0, 0.2), hand: 'magazine', stop: true, name: 'grab' }, // closes round a fresh magazine
  { r: 0.4, at: V(-0.085, -0.33, 0.19), turn: turned(0.45, 0, 0.15), hand: 'magazine' }, // pulls it out of the pouch
  { r: 0.49, at: holding(MAG_AT_WELL + 0.04).add(V(-0.02, -0.02, 0.035)), turn: turned(0.22, 0.05, 0.05), hand: 'magazine' },
  { r: 0.545, at: holding(MAG_AT_WELL + 0.006), turn: NONE, hand: 'feeding', stop: true }, // lined up under the well, thumb off
  { r: 0.59, at: holding(RELEASE_GAP), turn: NONE, hand: 'feeding', stop: true, name: 'letGo' }, // pushed in as far as the hand can
  { r: 0.61, at: holding(RELEASE_GAP), turn: NONE, hand: 'released', stop: true }, // fingers open off it
  { r: 0.63, at: holding(RELEASE_GAP).addScaledVector(GRIP.down, 0.03).add(V(-0.03, 0, 0)), turn: PALM_HALF, hand: 'flat' }, // drops away, turning palm up...
  { r: 0.647, at: pushing(RELEASE_GAP).addScaledVector(GRIP.down, 0.015), turn: PALM_UP, hand: 'flat' }, // ...and comes up under it
  { r: 0.66, at: pushing(RELEASE_GAP), turn: PALM_UP, hand: 'flat', stop: true, name: 'slap' }, // palm under the magazine
  { r: S.magIn, at: pushing(0), turn: PALM_UP, hand: 'flat', stop: true }, // slapped home
  { r: 0.72, at: pushing(0).addScaledVector(GRIP.down, 0.025).add(V(-0.012, 0, 0)), turn: PALM_HALF, hand: 'open' },
  { r: 0.755, at: V(-0.045, -0.04, 0.012), turn: NONE, hand: 'open' }, // comes back up beside the grip
  { r: 0.785, at: V(-0.007, -0.01, 0.004), turn: NONE, hand: 'loose' }, // fingers round it...
  { r: S.handOn, at: V(0, 0, 0), turn: NONE, hand: 'grip', stop: true }, // ...and closed on it
];
const keyAt = (name) => HAND_KEYS.find((key) => key.name === name).r;
// The fingers close on the fresh magazine at the belt (it appears in them
// halfway), and let go of it under the gun; the palm pushes it home.
const MAG_IN_FINGERS = [(keyAt('reach') + keyAt('grab')) / 2, keyAt('letGo')];
const PUSH = [keyAt('slap'), S.magIn];

// Where the hand is at reload progress r: offset, turn, and hand shapes to
// blend between. The path is a smooth curve through the keyframes (stopping
// at the ones marked to), the turn and the hand shape ease from one key to
// the next. (Exported so the path can be checked outside the game.)
const handPath = { offset: new THREE.Vector3(), turn: new THREE.Quaternion(), from: 'grip', to: 'grip', k: 0 };
export function handAt(r) {
  const keys = HAND_KEYS;
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
  const k = t2 * (3 - 2 * t);
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
      if (this.barrel) this.barrelRest = { position: this.barrel.position.clone(), tilt: this.barrel.rotation.x };
      this.magazine = pistol.getObjectByName('magazine');
      this.magazineRest = this.magazine ? this.magazine.position.clone() : null;
      this.magazineRound = this.magazine ? this.magazine.getObjectByName('magazine_round') : null;
      this.leftArm = leftArmOf(arms);
      // The support glove gets finger joints, so it can let go and take hold.
      let glove = this.leftArm.getObjectByName('left_glove');
      if (glove && !glove.isMesh) glove = glove.children.find((c) => c.isMesh);
      if (glove) {
        this.hand = new SupportHand();
        this.hand.skin(glove);
      }
      // The fresh magazine the support hand brings back during a reload.
      if (this.magazine) {
        this.handMagazine = this.magazine.clone();
        this.handMagazine.position.copy(this.magazineRest).add(MAG_IN_HAND);
        this.handMagazine.visible = false;
        shadowed(this.handMagazine);
        this.leftArm.add(this.handMagazine);
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

  // Where a point on the gun (gun space) is in the gun layer's camera space.
  pointOnGun([x, y, z]) {
    this.scene.updateMatrixWorld();
    return this.gun.localToWorld(new THREE.Vector3(x, y, z));
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
    this.motion.update(frameSeconds, player, yaw, pitch, wallDistance, aim);
    this.holder.position.copy(this.pivot).add(this.motion.position.value);
    const r = this.motion.rotation.value;
    this.holder.rotation.set(r.x, r.y, r.z);
    this.gun.position.copy(this.posePosition).sub(this.pivot);
    this.gun.quaternion.copy(this.poseQuaternion);

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

    // The slide snaps back on a shot and returns, or stays back on an empty gun.
    this.slideTime += dt;
    const locked = gun && gun.slideLocked;
    let back = 0;
    if (this.slideTime < 0.025) back = this.slideTime / 0.025;
    else if (this.slideTime < 0.075) back = locked ? 1 : 1 - (this.slideTime - 0.025) / 0.05;
    else back = locked ? 1 : 0;
    if (this.slide) this.slide.position.z = this.slideRest + SLIDE_TRAVEL * back;
    if (this.barrel) {
      const tilt = BARREL.tilt * back;
      this.barrel.rotation.x = this.barrelRest.tilt + tilt;
      this.barrel.position.set(
        this.barrelRest.position.x,
        this.barrelRest.position.y + BARREL.muzzleZ * Math.sin(tilt),
        this.barrelRest.position.z + BARREL.travel * back,
      );
    }
    // The slide slamming home jolts the gun again.
    if (!this.slammed && this.slideTime >= 0.06) {
      this.slammed = true;
      if (!locked) this.motion.slam(this.lastAim);
    }

    // The support hand lets go, fetches a fresh magazine and brings it back.
    const hand = handAt(reload);
    if (this.leftArm) {
      // Turned about the wrist.
      this.leftArm.quaternion.copy(hand.turn);
      this.leftArm.position.copy(WRIST).applyQuaternion(hand.turn).negate().add(WRIST).add(hand.offset);
    }
    if (this.hand) this.hand.set(hand.from, hand.to, hand.k);
    if (this.handMagazine) this.handMagazine.visible = reload >= MAG_IN_FINGERS[0] && reload < MAG_IN_FINGERS[1];

    // The old magazine slides out along the grip and falls away. The new one
    // is in the hand until the hand lets go of it partway in; it stays there
    // until the palm pushes it home.
    if (this.magazine && this.magazineRest) {
      this.magazine.position.copy(this.magazineRest);
      let visible = true;
      let round = true;
      if (reload >= S.magOut && reload < MAG_IN_FINGERS[1]) {
        const t = (reload - S.magOut) * gun.reloadSeconds;
        const drop = 0.4 * t + 0.5 * 9.8 * t * t;
        this.magazine.position.addScaledVector(GRIP.down, Math.min(drop, 1));
        visible = t < 0.6;
        round = !gun.reloadEmpty; // an emptied magazine drops without a round on top
      } else if (reload >= MAG_IN_FINGERS[1] && reload < S.magIn) {
        const pushed = reload < PUSH[0] ? 0 : smoothstep(PUSH[0], PUSH[1], reload);
        this.magazine.position.addScaledVector(GRIP.down, RELEASE_GAP * (1 - pushed));
      }
      this.magazine.visible = visible;
      if (this.magazineRound) this.magazineRound.visible = round;
    }
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
