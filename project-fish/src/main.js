// Starts the game: sets up rendering and runs the game loop.
//
// The game logic runs in fixed ticks (TICK_RATE per second). Each screen frame
// runs however many ticks are due, then draws the player smoothly between the
// last two ticks so movement looks the same at 30, 60 or 144 FPS. Mouse look is
// applied every frame, straight from the mouse, so aiming never lags.

import * as THREE from 'three';
import { GUNS, LOADOUT, MOVEMENT, PLAYER, TICK_DT } from './shared/config.js';
import { createPlayerState, emptyCommand, horizontalSpeed, simulatePlayer } from './shared/movement.js';
import { raycastColliders, raycastWorld } from './shared/map.js';
import { Pistol } from './weapon.js';
import { WorldEffects } from './effects/worldEffects.js';
import { playDryFire, playGunshot, playMagCatch, playMagGrab, playMagIn, playMagOut, playSlideBack, playSlideRelease, startAudio } from './effects/audio.js';
import { addSoldier, createWorld, SUN_DIRECTION } from './world.js';
import { Viewmodel, AIM } from './viewmodel/viewmodel.js';
import { Input } from './input.js';
import { GpuTimer, Hud } from './hud.js';
import { settings } from './settings.js';

// Never run more than this much game time in one frame (e.g. after switching
// tabs), so the game doesn't freeze trying to catch up.
const MAX_FRAME_SECONDS = 0.25;

const container = document.getElementById('game');
const overlay = document.getElementById('overlay');
const overlayStatus = document.getElementById('overlay-status');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch {
  overlayStatus.textContent = 'Your browser or graphics card doesn’t support WebGL, which the game needs.';
  throw new Error('WebGL not available');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.autoClear = false; // the world and the gun are drawn one after the other
// Film-like tone mapping: bright highlights roll off softly instead of clipping.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

const scene = createWorld();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 1500);
camera.rotation.order = 'YXZ'; // turn left/right first, then look up/down
const soldier = addSoldier(scene, renderer, camera);
const viewmodel = new Viewmodel(renderer, SUN_DIRECTION);

const input = new Input(renderer.domElement);
const hud = new Hud(document.getElementById('debug'));
const gpuTimer = new GpuTimer(renderer.getContext());

const player = createPlayerState();
const previous = { x: player.x, y: player.y, z: player.z };
const cmd = emptyCommand();
// The guns the player carries (src/shared/config.js), and the one in hand:
// switching to another happens at once here (its keys and its ammo), while
// the hands put the old one away and draw the new one.
const weapons = Object.fromEntries(LOADOUT.map((key) => [key, new Pistol(GUNS[key])]));
let held = LOADOUT[0];
let weapon = weapons[held];

const asked = { reload: false, inspect: false }; // keys pressed while switching guns

// What the hands show of a gun (see Viewmodel.update).
function gunStateOf(w) {
  return {
    slideLocked: w.slideLocked,
    reloadProgress: w.reloadProgress,
    reloadSeconds: w.reload ? w.reload.duration : 0,
    reloadEmpty: w.reload ? w.reload.empty : false,
    ammo: w.ammo,
    reserve: w.reserve,
    inspectTime: w.inspectTime,
    inspectCheck: w.inspectCheck,
    inspectAmount: w.inspectAmount,
  };
}

// The gun being put away, as it was when the switch began: the hands keep
// showing it like that (mid-reload, mid-inspect) while it goes down out of
// view, rather than snapping back to the hold.
let outgoing = null;

function switchGun(key) {
  if (key === held || !weapons[key]) return;
  if (!outgoing || outgoing.key !== viewmodel.shownGun) outgoing = { key: held, state: gunStateOf(weapon) };
  weapon.holster();
  asked.reload = asked.inspect = false;
  held = key;
  weapon = weapons[key];
  viewmodel.switchTo(key);
}
const effects = new WorldEffects(scene);

// --- Window size and field of view ---

// three.js wants the vertical FOV. Work it out from the horizontal FOV on a
// 16:9 screen, so wider screens see more at the sides instead of less above
// and below. `zoom` > 1 narrows it, for aiming down the sights.
function setWorldFov(zoom) {
  const halfHorizontal = (settings.fov * Math.PI) / 360;
  const fov = (2 * Math.atan((Math.tan(halfHorizontal) * (9 / 16)) / zoom) * 180) / Math.PI;
  if (fov !== camera.fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

let aimAmount = 0;

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  setWorldFov(1 + (AIM.zoom - 1) * aimAmount);
  viewmodel.setAspect(width / height);
}
window.addEventListener('resize', resize);
resize();

// --- Click to play / Esc to release the mouse ---

let loaded = false;
overlay.addEventListener('click', () => {
  startAudio(); // browsers only allow sound after a click
  if (loaded) input.lock();
});
input.onLockChange = (locked) => {
  overlay.hidden = locked;
  document.body.classList.toggle('playing', locked);
};
viewmodel.ready.then(() => {
  // A dropped magazine is handed over to the world: get its materials ready
  // now, so the first empty reload doesn't stall.
  const drops = Object.values(viewmodel.guns).map((g) => g.dropModel).filter(Boolean).map((m) => m.clone(true));
  for (const d of drops) {
    d.position.set(0, -50, 0);
    scene.add(d);
  }
  renderer.compile(scene, camera);
  for (const d of drops) scene.remove(d);
  loaded = true;
  overlayStatus.textContent = 'Click to play';
});

// --- Shooting ---

// The view kicks up with each shot and springs back, and a little of the
// climb stays, so you pull down to stay on target. Radians.
const RECOIL = { kick: 0.42, kickRandom: 0.12, sideways: 0.12, climb: 0.0045, aimed: 0.7, stiffness: 160, damping: 0.72 };
const viewKick = { x: 0, y: 0, vx: 0, vy: 0 };

function updateViewKick(dt) {
  const c = 2 * RECOIL.damping * Math.sqrt(RECOIL.stiffness);
  const steps = Math.max(1, Math.ceil(dt * 240));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    viewKick.vx += (-RECOIL.stiffness * viewKick.x - c * viewKick.vx) * h;
    viewKick.vy += (-RECOIL.stiffness * viewKick.y - c * viewKick.vy) * h;
    viewKick.x += viewKick.vx * h;
    viewKick.y += viewKick.vy * h;
  }
}

// A point in the gun layer's camera space, as a position in the world. The
// gun layer has its own field of view, so x and y are scaled to keep the
// point in the same place on screen.
function gunPointToWorld(p) {
  const scale = Math.tan((camera.fov * Math.PI) / 360) / Math.tan((viewmodel.camera.fov * Math.PI) / 360);
  return new THREE.Vector3(p.x * scale, p.y * scale, p.z).applyQuaternion(camera.quaternion).add(camera.position);
}

// Tips a direction by a random angle of up to `degrees`.
function spread(direction, degrees) {
  const angle = (degrees * Math.PI) / 180 * Math.sqrt(Math.random());
  const around = Math.random() * Math.PI * 2;
  const side = new THREE.Vector3().crossVectors(direction, Math.abs(direction.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(side, direction);
  return direction.clone().multiplyScalar(Math.cos(angle))
    .addScaledVector(side, Math.sin(angle) * Math.cos(around))
    .addScaledVector(up, Math.sin(angle) * Math.sin(around))
    .normalize();
}

function shoot() {
  const gun = weapon.spec;
  viewmodel.fire(aimAmount);
  playGunshot(held);
  barrels[held].heat = Math.min(HEAT.max, barrels[held].heat + HEAT.perShot);

  // Where the shot goes: through the sights when aiming, roughly at the
  // centre from the hip, straying more from the hip and while moving.
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const sight = viewmodel.sightOnScreen();
  const throughSights = new THREE.Vector3(sight.x, sight.y, 0.5).unproject(camera).sub(camera.position).normalize();
  const moving = Math.min(1, horizontalSpeed(player) / MOVEMENT.walkSpeed);
  const stray = (gun.spread.hip + gun.spread.moving * moving) * (1 - aimAmount) + gun.spread.aim * aimAmount;
  const direction = spread(forward.clone().lerp(throughSights, aimAmount).normalize(), stray);
  const hit = raycastWorld(camera.position.x, camera.position.y, camera.position.z, direction.x, direction.y, direction.z, gun.range);
  if (hit && hit.what === 'soldier') effects.impact(hit, 0x6b6e58, false); // cloth: no hole (his box is only roughly his shape)
  else if (hit) effects.impact(hit, hit.what === 'ground' ? 0x8c8c8c : 0xcfc6b6);

  // Flash, smoke and the spent case, where the gun is.
  const muzzle = gunPointToWorld(viewmodel.muzzlePoint());
  effects.flash(muzzle);
  effects.smoke(muzzle, direction);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const caseVelocity = right.multiplyScalar(1.6 + Math.random() * 0.8)
    .addScaledVector(up, 2 + Math.random() * 0.8)
    .addScaledVector(forward, -0.4)
    .add(new THREE.Vector3(player.vx, player.vy, player.vz));
  effects.ejectCase(gunPointToWorld(viewmodel.portPoint()), caseVelocity);

  const k = (1 - (1 - RECOIL.aimed) * aimAmount) * gun.recoil;
  viewKick.vx += (RECOIL.kick + Math.random() * RECOIL.kickRandom) * k;
  viewKick.vy += (Math.random() * 2 - 1) * RECOIL.sideways * k;
  input.pitch = Math.min(1.55, input.pitch + RECOIL.climb * k);
}

// --- Barrel heat ---

// Each shot heats the barrel (up to `max`), and it cools over a few seconds.
// Once it's warm, thin smoke curls off the muzzle and out of the ejection
// port, most when it's at `full`. After a whole magazine fired fast, it
// smokes for about three seconds.
// Each gun has its own barrel: they all cool, and only the one in the hands
// smokes.
const HEAT = { perShot: 1, max: 6, coolPerSecond: 1.3, smokeFrom: 2, full: 6, puffsPerSecond: 8 };
const barrels = Object.fromEntries(LOADOUT.map((key) => [key, { heat: 0, smokeTimer: 0 }]));

function updateBarrelSmoke(dt) {
  for (const b of Object.values(barrels)) b.heat = Math.max(0, b.heat - HEAT.coolPerSecond * dt);
  const barrel = barrels[viewmodel.shownGun];
  if (!barrel || barrel.heat < HEAT.smokeFrom) return;
  const amount = Math.min(1, (barrel.heat - HEAT.smokeFrom) / (HEAT.full - HEAT.smokeFrom));
  barrel.smokeTimer -= dt;
  if (barrel.smokeTimer > 0) return;
  barrel.smokeTimer = 1 / (HEAT.puffsPerSecond * (0.4 + 0.6 * amount));
  const from = Math.random() < 0.7 ? viewmodel.muzzlePoint() : viewmodel.portPoint();
  effects.barrelSmoke(gunPointToWorld(from), amount);
}

// --- Ammo counter ---

const ammo = document.getElementById('ammo');
const ammoName = ammo.querySelector('.name');
const ammoMag = ammo.querySelector('.mag');
const ammoReserve = ammo.querySelector('.reserve');
const ammoHint = ammo.querySelector('.hint');
let shownAmmo = '';

function updateAmmo() {
  const state = `${held}/${weapon.ammo}/${weapon.reserve}/${weapon.reloading}`;
  if (state === shownAmmo) return;
  shownAmmo = state;
  if (ammoName) ammoName.textContent = weapon.spec.name;
  ammoMag.textContent = weapon.ammo;
  ammoReserve.textContent = weapon.reserve;
  ammo.classList.toggle('low', weapon.ammo <= 3);
  ammoHint.textContent = weapon.reloading ? 'Reloading' : weapon.ammo === 0 && weapon.reserve > 0 ? 'Press R to reload' : weapon.ammo === 0 ? 'Out of ammo' : '';
}

// --- Game loop ---

let lastTime = null;
let accumulator = 0;
const lookDirection = new THREE.Vector3();

renderer.setAnimationLoop((time) => {
  const cpuStart = performance.now();
  const frameSeconds = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS);
  lastTime = time;

  accumulator += frameSeconds;
  // A shot waiting for the gun to come up stops a sprint until it's gone off.
  input.sprintBlocked = weapon.shotWaiting;
  while (accumulator >= TICK_DT) {
    previous.x = player.x;
    previous.y = player.y;
    previous.z = player.z;
    if (input.locked) {
      input.sample(cmd);
    } else {
      // No input while the mouse is released; the player stands still.
      Object.assign(cmd, emptyCommand(), { yaw: input.yaw, pitch: input.pitch });
    }
    simulatePlayer(player, cmd, TICK_DT);
    accumulator -= TICK_DT;
  }

  // How far we are between the last tick and the next one (0..1).
  const alpha = accumulator / TICK_DT;
  camera.position.set(
    previous.x + (player.x - previous.x) * alpha,
    previous.y + (player.y - previous.y) * alpha + PLAYER.eyeHeight,
    previous.z + (player.z - previous.z) * alpha,
  );
  updateViewKick(frameSeconds);
  camera.rotation.set(input.pitch + viewKick.x, input.yaw + viewKick.y, 0);

  // Switching guns: 1 and 2, or the mouse wheel.
  if (input.locked) {
    LOADOUT.forEach((key, i) => {
      if (input.presses(`Digit${i + 1}`) > 0) switchGun(key);
    });
    const steps = input.wheelSteps();
    if (steps) switchGun(LOADOUT[(LOADOUT.indexOf(held) + steps % LOADOUT.length + LOADOUT.length) % LOADOUT.length]);
  }

  // The gun in hand: trigger, reload and inspect keys, then the gun's pose,
  // then what happened. Aiming or sprinting stops an inspect. While the
  // hands are switching guns, it can't be reloaded, inspected or aimed (a
  // trigger pull waits until it's up).
  // (A reload or inspect asked for then is kept until it's up.)
  const switching = Boolean(viewmodel.switching);
  const busy = input.aiming || Boolean(player.sprinting);
  if (input.locked && input.presses('KeyR') > 0) asked.reload = true;
  if (input.locked && input.presses('KeyF') > 0) asked.inspect = true;
  const reloadNow = asked.reload && !switching;
  const inspectNow = asked.inspect && !switching;
  if (!switching || !input.locked) asked.reload = asked.inspect = false;
  const events = input.locked
    ? weapon.update(frameSeconds, input.presses('Mouse0'), reloadNow, viewmodel.readyToFire, inspectNow, busy)
    : weapon.update(frameSeconds, 0, false, viewmodel.readyToFire, false, busy);
  camera.getWorldDirection(lookDirection);
  const wallDistance = raycastColliders(camera.position.x, camera.position.y, camera.position.z, lookDirection.x, lookDirection.y, lookDirection.z, 2);
  // The gun the hands are holding (while switching, the one being put away
  // until it's out of view, as it was when the switch began).
  const shownKey = viewmodel.shownGun;
  if (outgoing && (outgoing.key !== shownKey || shownKey === held)) outgoing = null;
  const gunState = outgoing ? outgoing.state : gunStateOf(weapons[shownKey]);
  aimAmount = viewmodel.update(frameSeconds, player, input.yaw, input.pitch, camera.quaternion, wallDistance, input.aiming && !weapon.reloading && !weapon.inspecting && !switching, gunState);
  setWorldFov(1 + (AIM.zoom - 1) * aimAmount);
  document.body.classList.toggle('aiming', aimAmount > 0.4);
  document.body.classList.toggle('sprinting', viewmodel.motion.sprint > 0.4);
  for (const event of events) {
    if (event === 'shot') shoot();
    else if (event === 'dry') {
      playDryFire();
      viewmodel.dryFire();
    }
    else if (event === 'magOut') playMagOut(held, (weapon.slideLocked ? 0 : weapon.ammo - 1) <= 0); // empty, or with rounds in it
    else if (event === 'magCaught') playMagCatch();
    else if (event === 'magGrab') playMagGrab();
    else if (event === 'magIn') {
      playMagIn(held);
      viewmodel.seatMagazine();
    }
    else if (event === 'slidePull') playSlideBack(held);
    else if (event === 'slideRelease') playSlideRelease(held);
  }
  // An empty magazine dropped out of view in the gun layer carries on falling in the world.
  const dropped = viewmodel.takeDroppedMagazine();
  if (dropped) {
    effects.dropMagazine(
      dropped.object,
      gunPointToWorld(dropped.position),
      camera.quaternion.clone().multiply(dropped.quaternion),
      dropped.velocity.applyQuaternion(camera.quaternion).add(new THREE.Vector3(player.vx, player.vy, player.vz)),
    );
  }
  updateBarrelSmoke(frameSeconds);
  effects.update(frameSeconds);
  soldier.update(frameSeconds);
  updateAmmo();

  gpuTimer.begin();
  renderer.clear();
  renderer.render(scene, camera);
  viewmodel.render(renderer);
  gpuTimer.end();
  hud.update(frameSeconds, player, performance.now() - cpuStart, gpuTimer.ms);
});
