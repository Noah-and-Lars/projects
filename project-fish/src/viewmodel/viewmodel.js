// The first-person view of the hands and gun.
//
// They live in their own small scene with their own camera, drawn after the
// world on top of it. That way the gun never pokes into walls, and its size on
// screen doesn't change with the player's field of view.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createPistol, SIGHTS } from './pistol.js';
import { createArms } from './arms.js';
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
      this.leftArm = leftArmOf(arms);
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
    // Reloading: the gun tips towards the support hand so it can reach the magazine well.
    const reload = gun ? gun.reloadProgress : -1;
    const tilt = reload < 0 ? 0 : smoothstep(0, 0.14, reload) * (1 - smoothstep(0.84, 1, reload));
    if (tilt > 0) {
      this.posePosition.add(new THREE.Vector3(-0.015, -0.035, 0.03).multiplyScalar(tilt));
      this.poseQuaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32 * tilt, -0.12 * tilt, -0.5 * tilt)));
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

    // The support hand lets go to fetch a magazine, then comes back.
    const S = RELOAD_STEPS;
    const away = reload < 0 ? 0 : smoothstep(S.handOff, S.handOff + 0.1, reload) * (1 - smoothstep(S.handOn - 0.18, S.handOn, reload));
    if (this.leftArm) {
      this.leftArm.position.set(-0.05 * away, -0.22 * away, 0.08 * away);
      this.leftArm.rotation.set(0.4 * away, 0, 0);
    }

    // The old magazine drops out; the new one comes up and clicks in.
    if (this.magazine && this.magazineRest) {
      const m = this.magazine.position.copy(this.magazineRest);
      if (reload >= S.magOut && reload < S.magIn - 0.12) {
        const t = (reload - S.magOut) * gun.reloadSeconds;
        m.y -= Math.min(0.6, 0.5 * 9.8 * t * t);
      } else if (reload >= S.magIn - 0.12 && reload < S.magIn) {
        m.y -= 0.1 * (1 - smoothstep(S.magIn - 0.12, S.magIn, reload));
      }
    }
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
