// The first-person view of the hands and gun.
//
// They live in their own small scene with their own camera, drawn after the
// world on top of it. That way the gun never pokes into walls, and its size on
// screen doesn't change with the player's field of view.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createPistol } from './pistol.js';
import { createArms } from './arms.js';

// Detailed models made in Blender (see tools/blender/).
const PISTOL_MODEL = new URL('../../assets/pistol.glb', import.meta.url);
const ARMS_MODEL = new URL('../../assets/arms.glb', import.meta.url);

const VIEW_FOV = 52; // vertical, degrees

// Where the gun sits in front of the camera when held at the hip: arms pushed
// out, pistol a little right of centre, pointing straight ahead.
const HIP_POSITION = new THREE.Vector3(0.075, -0.07, -0.5);
const HIP_ROTATION = new THREE.Euler(0, 0.02, 0, 'YXZ');

// How the gun moves (all small, in metres and radians).
const SWAY = { perRadian: 0.14, max: 0.045, return: 9 };
const BOB = { stepsPerMetre: 0.75, side: 0.0045, up: 0.0035, tilt: 0.012 };
const BREATH = { speed: 1.4, amount: 0.0008 };

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

    // holder: moves with sway and bob. gun: the pistol and arms, at the hip pose.
    this.holder = new THREE.Group();
    this.gun = new THREE.Group();
    this.gun.position.copy(HIP_POSITION);
    this.gun.rotation.copy(HIP_ROTATION);
    this.holder.add(this.gun);
    this.scene.add(this.holder);

    // Resolves once the pistol and hands are loaded and in place.
    this.ready = Promise.all([loadModel(PISTOL_MODEL, createPistol), loadModel(ARMS_MODEL, createArms)]).then(([pistol, arms]) => {
      arms.name = 'arms';
      this.gun.add(shadowed(pistol), shadowed(arms));
    });

    this.lastYaw = null;
    this.lastPitch = 0;
    this.swayYaw = 0;
    this.swayPitch = 0;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.time = 0;
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // frameSeconds: time since the last frame. player: movement state.
  // yaw / pitch: where the player is looking. cameraQuaternion: the world camera's rotation.
  update(frameSeconds, player, yaw, pitch, cameraQuaternion) {
    const dt = Math.min(frameSeconds, 0.05);
    this.time += dt;

    // Sway: the gun lags a little behind fast mouse movements, then catches up.
    if (this.lastYaw === null) this.lastYaw = yaw;
    let dYaw = yaw - this.lastYaw;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    const dPitch = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    const clamp = (v) => Math.max(-SWAY.max, Math.min(SWAY.max, v));
    this.swayYaw = clamp(this.swayYaw - dYaw * SWAY.perRadian);
    this.swayPitch = clamp(this.swayPitch - dPitch * SWAY.perRadian);
    const settle = Math.exp(-SWAY.return * dt);
    this.swayYaw *= settle;
    this.swayPitch *= settle;

    // Bob: a figure-of-eight in step with walking, fading in and out with speed.
    const speed = player.grounded ? Math.hypot(player.vx, player.vz) : 0;
    this.bobAmount += (Math.min(speed / 5, 1) - this.bobAmount) * Math.min(1, dt * 8);
    this.bobPhase += speed * dt * BOB.stepsPerMetre * Math.PI;
    const bobX = Math.sin(this.bobPhase) * BOB.side * this.bobAmount;
    const bobY = -Math.abs(Math.cos(this.bobPhase)) * BOB.up * this.bobAmount;
    const breath = Math.sin(this.time * BREATH.speed) * BREATH.amount;

    // In the air the gun lags behind: it dips as you rise and floats up as you fall.
    const air = player.grounded ? 0 : Math.max(-0.012, Math.min(0.008, -player.vy * 0.0012));

    this.holder.position.set(bobX, bobY + breath + air, 0);
    this.holder.rotation.set(this.swayPitch, this.swayYaw, Math.sin(this.bobPhase) * BOB.tilt * this.bobAmount);

    // Light and reflections come from where the sun and sky are, relative to
    // where the player looks.
    const inverse = cameraQuaternion.clone().invert();
    this.sun.position.copy(this.sunDirection).applyQuaternion(inverse).add(this.sun.target.position);
    this.scene.environmentRotation.setFromQuaternion(inverse);
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
