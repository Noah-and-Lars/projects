// The first-person view of the hands and gun.
//
// They live in their own small scene with their own camera, drawn after the
// world on top of it. That way the gun never pokes into walls, and its size on
// screen doesn't change with the player's field of view.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPistol } from './pistol.js';
import { createArms } from './arms.js';

const VIEW_FOV = 52; // vertical, degrees

// Where the gun sits in front of the camera when held at the hip.
const HIP_POSITION = new THREE.Vector3(0.11, -0.065, -0.32);
const HIP_ROTATION = new THREE.Euler(0.04, 0.25, 0.08, 'YXZ'); // muzzle turned in towards the crosshair

// How the gun moves (all small, in metres and radians).
const SWAY = { perRadian: 0.18, max: 0.06, return: 9 };
const BOB = { stepsPerMetre: 0.75, side: 0.0045, up: 0.0035, tilt: 0.012 };
const BREATH = { speed: 1.4, amount: 0.0008 };

export class Viewmodel {
  constructor(renderer, sunDirection) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(VIEW_FOV, 1, 0.01, 3);

    // Soft studio-style reflections so metal and polymer look like metal and polymer.
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a6a6a, 1.0));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.7);
    this.scene.add(this.sun, this.sun.target);
    this.sunDirection = sunDirection;

    // holder: moves with sway and bob. gun: the pistol and arms, at the hip pose.
    this.holder = new THREE.Group();
    this.gun = new THREE.Group();
    this.gun.position.copy(HIP_POSITION);
    this.gun.rotation.copy(HIP_ROTATION);
    this.gun.add(createPistol(), createArms());
    this.holder.add(this.gun);
    this.scene.add(this.holder);

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

    // Light the gun from wherever the sun is, relative to where the player looks.
    const inverse = cameraQuaternion.clone().invert();
    this.sun.position.copy(this.sunDirection).applyQuaternion(inverse);
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
