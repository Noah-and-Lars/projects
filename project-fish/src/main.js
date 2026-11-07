// Starts the game: sets up rendering and runs the game loop.
//
// The game logic runs in fixed ticks (TICK_RATE per second). Each screen frame
// runs however many ticks are due, then draws the player smoothly between the
// last two ticks so movement looks the same at 30, 60 or 144 FPS. Mouse look is
// applied every frame, straight from the mouse, so aiming never lags.

import * as THREE from 'three';
import { GUNS, LOADOUT, MOVEMENT, PLAYER, TICK_DT } from './shared/config.js';
import { BUTTON_SPRINT, BUTTON_SPRINT_KEY, createPlayerState, emptyCommand, horizontalSpeed, simulatePlayer } from './shared/movement.js';
import { raycastColliders, raycastWorld } from './shared/map.js';
import { Pistol } from './weapon.js';
import { WorldEffects } from './effects/worldEffects.js';
import { playDryFire, playGunshot, playMagCatch, playMagGrab, playMagIn, playMagOut, playShellIn, playSlideBack, playSlideRelease, playSwitchClick, startAudio } from './effects/audio.js';
import { addSoldier, createWorld, outdoorEnvironment, SUN_DIRECTION } from './world.js';
import { Viewmodel, AIM } from './viewmodel/viewmodel.js';
import { PlayerBody } from './player/body.js';
import { FirstPersonArms } from './player/fpArms.js';
import { Input } from './input.js';
import { GpuTimer, Hud } from './hud.js';
import { settings } from './settings.js';
import { Loadout } from './attachments.js';
import { LoadoutMenu } from './loadoutMenu.js';
import { breakdownById } from './showcase/breakdowns.js';
import { Outfit, Wardrobe } from './gear.js';
import { OutfitMenu } from './outfitMenu.js';

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
// A gun's light and laser (attachments, switched with T). The light is one
// spot light, always in the world and just dark when it's off (adding or
// removing a light makes three.js rebuild every material's shader); the laser
// is a red dot where its beam meets the world.
const torch = new THREE.SpotLight(0xfff1da, 0, 45, 0.21, 0.5, 2);
scene.add(torch, torch.target);
const laserDot = new THREE.Sprite(new THREE.SpriteMaterial({
  map: dotTexture(), color: 0xff3a22, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, sizeAttenuation: false,
}));
laserDot.scale.setScalar(0.009);
laserDot.visible = false;
scene.add(laserDot);
const LIGHT = { intensity: 140 };
const LASER = { range: 120 };
let lightsOn = true;
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 1500);
camera.rotation.order = 'YXZ'; // turn left/right first, then look up/down
// What the soldier wears (chosen in the loadout menu's Outfit tab, src/
// gear.js): the player's body and the soldier by the house wear it.
const outfit = new Outfit();
const wardrobe = new Wardrobe(outfit);
const soldier = addSoldier(scene, renderer, camera, wardrobe);
const body = new PlayerBody(scene, renderer, camera, wardrobe);
const viewmodel = new Viewmodel(renderer, SUN_DIRECTION);
// The soldier's own arms on the gun (settings.soldierArms), once both are in.
const fpArms = settings.soldierArms ? new FirstPersonArms(body, viewmodel) : null;

const input = new Input(renderer.domElement);
const hud = new Hud(document.getElementById('debug'));
const gpuTimer = new GpuTimer(renderer.getContext());

const player = createPlayerState();
const previous = { x: player.x, y: player.y, z: player.z, eye: player.eye };
const cmd = emptyCommand();
// The guns the player carries (src/shared/config.js), and the one in hand:
// switching to another happens at once here (its keys and its ammo), while
// the hands put the old one away and draw the new one.
const weapons = Object.fromEntries(LOADOUT.map((key) => [key, new Pistol(GUNS[key])]));
let held = LOADOUT[0];
let weapon = weapons[held];

const asked = { reload: false, inspect: false }; // keys pressed while switching guns
// The keys for the guns, in LOADOUT's order: the number row, 1 to 9, then
// 0, - and =.
const GUN_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];

// What the hands show of a gun (see Viewmodel.update).
function gunStateOf(w) {
  return {
    slideLocked: w.slideLocked,
    reloadProgress: w.reloadProgress,
    reloadSeconds: w.reload ? w.reload.duration : 0,
    reloadEmpty: w.reload ? w.reload.empty : false,
    reloadClip: w.reload ? w.reload.clip || null : null,
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

// The attachments on each gun, and the loadout menu (B) to choose them. If
// closing the menu can't take the mouse back, the click-to-play screen shows.
const loadout = new Loadout();
const menu = new LoadoutMenu(document.getElementById('loadout'), loadout, input, () => held, new OutfitMenu(outfit, wardrobe));
// (Each gun's tab can put that gun in the hands.)
menu.onPickGun = (key) => switchGun(key);
// Puts a gun's chosen attachments on it (once the models are in; then each
// time the loadout changes).
function applyLoadout(key) {
  viewmodel.setAttachments(key, loadout.on(key));
  const g = viewmodel.guns[key];
  if (weapons[key] && g) weapons[key].chamberCheck = g.points.chamberCheck !== false;
}
const pendingLoadout = new Set();
loadout.onChange((key) => {
  if (!loaded) return;
  if (key === held && (weapon.reloading || weapon.inspect)) pendingLoadout.add(key);
  else applyLoadout(key);
});
menu.onFailedLock = () => {
  overlay.hidden = false;
};

// --- The gun breakdowns (the loadout menu's Breakdowns picker) ---
//
// Each opens over the game with its own renderer (src/showcase/breakdown.js);
// its code, script and model are only loaded when it's picked (the list is
// src/showcase/breakdowns.js). Meanwhile the game stands still: the frame
// loop does nothing (so nothing moves, fires or is drawn), and the mouse
// stays free, as it is in the menu. Closing it (Esc, its Close button)
// frees all it made and goes back to the picker.
let showcase = null; // the Breakdown while it's open (or loading)
async function openBreakdown(id) {
  if (showcase) return;
  const entry = breakdownById(id);
  if (!entry) return;
  const pending = { loading: true, cancelled: false };
  showcase = pending;
  input.releaseAll();
  const back = () => {
    showcase = null;
    input.releaseAll();
    menu.show('breakdowns', id);
  };
  // Till its code is in, a plain screen says it's loading, and Esc goes back
  // to the picker (it then never opens).
  const wait = document.createElement('div');
  wait.className = 'showcase-loading';
  wait.textContent = `Loading the ${entry.name} breakdown…`;
  const onKey = (e) => {
    if (e.code !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    pending.cancelled = true;
    done();
    back();
  };
  const done = () => {
    wait.remove();
    window.removeEventListener('keydown', onKey, true);
  };
  window.addEventListener('keydown', onKey, true);
  document.body.appendChild(wait);
  let Breakdown, script;
  try {
    const [engine, loaded] = await Promise.all([import('./showcase/breakdown.js'), entry.load()]);
    Breakdown = engine.Breakdown;
    script = loaded;
  } catch (error) {
    console.error(error);
    if (pending.cancelled) return;
    done();
    back();
    return;
  }
  if (pending.cancelled) return;
  done();
  const show = new Breakdown({ script, onClose: back });
  showcase = show;
  show.play().catch((error) => console.error(error));
}
menu.onBreakdown = openBreakdown;

// --- Window size and field of view ---

// three.js wants the vertical FOV. Work it out from the horizontal FOV on a
// 16:9 screen, so wider screens see more at the sides instead of less above
// and below. `zoom` > 1 narrows it, for aiming down the sights.
function setWorldFov(zoom, wider = 0) {
  const halfHorizontal = ((settings.fov + wider) * Math.PI) / 360;
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
  if (typeof photo !== 'undefined') {
    photo.camera.aspect = width / height;
    photo.camera.updateProjectionMatrix();
  }
  setWorldFov(1 + (AIM.zoom - 1) * aimAmount);
  viewmodel.setAspect(width / height);
}
window.addEventListener('resize', resize);

// --- Photo mode (P) ---
//
// The camera comes off the player to fly round and look at him from
// outside: WASD to fly (Shift faster), Space and C up and down, the mouse to
// look. The arrow keys walk him (Shift runs), so you can watch him move. His
// whole body shows, head and arms too, holding a copy of the gun where the
// hands have it. P again comes back. The game carries on meanwhile.
const photo = { on: false, camera: new THREE.PerspectiveCamera(60, 1, 0.02, 1500), look: { yaw: 0, pitch: 0 }, player: { yaw: 0, pitch: 0 }, gun: null, gunOf: null };
photo.camera.rotation.order = 'YXZ';
const PHOTO = { speed: 2.5, fast: 4 };
function setPhotoMode(on) {
  photo.on = on;
  document.body.classList.toggle('photo', on);
  body.setFirstPerson(!on);
  if (on) {
    // Start a little behind and above him, looking at him.
    photo.player = { yaw: input.yaw, pitch: input.pitch };
    const back = new THREE.Vector3(Math.sin(input.yaw), 0, Math.cos(input.yaw));
    photo.camera.position.copy(camera.position).addScaledVector(back, 2.2).add(new THREE.Vector3(0.6, 0.3, 0));
    const to = camera.position.clone().add(new THREE.Vector3(0, -0.6, 0)).sub(photo.camera.position);
    input.yaw = Math.atan2(-to.x, -to.z);
    input.pitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
  } else {
    input.yaw = photo.player.yaw;
    input.pitch = photo.player.pitch;
    if (photo.gun) photo.gun.visible = false;
  }
}
// The gun in his hands, in the world: a copy of the one in the gun layer,
// its parts as they are there. (Lit by the outdoor sky as it is in the gun
// layer, and as he is: the world's plain lights alone leave a metal gun
// nearly black. Its materials are copies with the sky on, let go of when
// another gun's copy takes its place.)
let photoSky = null;
function lightPhotoGun(gun) {
  if (!photoSky) photoSky = outdoorEnvironment(renderer, SUN_DIRECTION);
  const made = [];
  gun.traverse((o) => {
    if (!o.isMesh) return;
    const lit = [].concat(o.material).map((m) => {
      const copy = Object.assign(m.clone(), { envMap: photoSky, envMapIntensity: viewmodel.scene.environmentIntensity });
      made.push(copy);
      return copy;
    });
    o.material = Array.isArray(o.material) ? lit : lit[0];
  });
  gun.userData.litMaterials = made;
}
function updatePhotoGun() {
  const source = viewmodel.photoSource;
  if (!source) return;
  if (photo.gunOf !== source) {
    if (photo.gun) {
      scene.remove(photo.gun);
      for (const m of photo.gun.userData.litMaterials || []) m.dispose();
    }
    photo.gun = viewmodel.copyForPhoto(source);
    lightPhotoGun(photo.gun);
    photo.gun.matrixAutoUpdate = false;
    photo.gunOf = source;
    scene.add(photo.gun);
  }
  const from = [];
  source.traverse((o) => from.push(o));
  let i = 0;
  photo.gun.traverse((o) => {
    const f = from[i++];
    if (!f || o === photo.gun) return;
    o.position.copy(f.position);
    o.quaternion.copy(f.quaternion);
    o.scale.copy(f.scale);
    o.visible = f.visible;
  });
  // (A gun with its own arms leaves them out: his own arms hold it.)
  for (const name of photo.gun.userData.hidden || []) {
    const part = photo.gun.getObjectByName(name);
    if (part) part.visible = false;
  }
  photo.gun.visible = true;
  photo.gun.matrix.multiplyMatrices(camera.matrixWorld, source.matrixWorld);
  photo.gun.matrixWorldNeedsUpdate = true;
}
function flyPhotoCamera(dt) {
  const c = photo.camera;
  c.rotation.set(photo.look.pitch, photo.look.yaw, 0);
  const held = (code) => (input.held.has(code) ? 1 : 0);
  const speed = PHOTO.speed * (held('ShiftLeft') || held('ShiftRight') ? PHOTO.fast : 1) * dt;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion);
  c.position.addScaledVector(forward, (held('KeyW') - held('KeyS')) * speed)
    .addScaledVector(right, (held('KeyD') - held('KeyA')) * speed)
    .add(new THREE.Vector3(0, (held('Space') - held('KeyC')) * speed, 0));
}
resize();

// --- Click to play / Esc to release the mouse ---

let loaded = false;
overlay.addEventListener('click', () => {
  startAudio(); // browsers only allow sound after a click
  if (loaded) input.lock();
});
input.onLockChange = (locked) => {
  overlay.hidden = locked || menu.open;
  document.body.classList.toggle('playing', locked);
};
viewmodel.ready.then(() => {
  // The guns with their own arms wear the outfit's gloves too.
  viewmodel.wearGloves(outfit);
  // A gun whose model couldn't be loaded may have a stand-in that plays by
  // slightly different rules (its fallbackRules in GUN_KINDS, src/viewmodel/viewmodel.js).
  for (const key of LOADOUT) {
    const g = viewmodel.guns[key];
    if (g && g.rules && weapons[key].spec !== g.rules) weapons[key].spec = g.rules;
  }
  LOADOUT.forEach(applyLoadout);
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

// --- How moving feels ---

// The camera's extra tilt and widening for the way you're moving: it rolls
// a little into a slide and the view widens (and settles back as it slows),
// widens a touch on a tactical sprint and a dive, and dips as you land hard.
// Degrees for fov, radians for the rest.
const MOVE_FEEL = { slideRoll: -0.1, slideFov: 7, tacSprintFov: 5, diveFov: 6, divePitch: -0.07, ease: 8, mantlePitch: -0.05 };
const moveFeel = { roll: 0, fov: 0, pitch: 0, landed: 0 };
function updateMoveFeel(dt) {
  const M = MOVE_FEEL;
  const sliding = player.move === 'slide' || player.move === 'supine';
  const slowing = sliding ? Math.max(0, 1 - player.moveTime / (player.move === 'supine' ? MOVEMENT.supineTime : MOVEMENT.slideTime)) : 0;
  let roll = 0;
  let fov = 0;
  let pitch = 0;
  if (sliding) {
    roll = M.slideRoll * (0.4 + 0.6 * slowing);
    fov = M.slideFov * (0.3 + 0.7 * slowing);
  } else if (player.tacSprint) {
    fov = M.tacSprintFov * Math.min(1, player.stamina / MOVEMENT.fatigueStart);
  } else if (player.move === 'dive') {
    fov = M.diveFov * (player.grounded ? 0.4 : 1);
    pitch = player.grounded ? 0 : M.divePitch;
  } else if (player.move === 'mantle') {
    pitch = M.mantlePitch * Math.sin(Math.PI * Math.min(1, player.moveTime / 0.5));
  }
  const k = 1 - Math.exp(-dt * M.ease);
  moveFeel.roll += (roll - moveFeel.roll) * k;
  moveFeel.fov += (fov - moveFeel.fov) * k;
  moveFeel.pitch += (pitch - moveFeel.pitch) * k;
}

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
  // (Fully automatic, each round of a burst kicks a little harder than the
  // last, up to its burstKick's most; and sprinting waits for the burst to
  // end, as it does after a shot from the others.)
  const burst = weapon.automatic && gun.burstKick ? 1 + Math.min(gun.burstKick.most, gun.burstKick.perRound * Math.max(0, weapon.burst - 1)) : 1;
  if (weapon.automatic) input.lastShot = performance.now();
  viewmodel.fire(aimAmount, burst);
  const suppressed = Boolean(viewmodel.points.suppressed);
  playGunshot(held, suppressed);
  barrels[held].heat = Math.min(HEAT.max, barrels[held].heat + HEAT.perShot);

  // Where the shot goes: through the sights when aiming, roughly at the
  // centre from the hip, straying more from the hip and while moving.
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const sight = viewmodel.sightOnScreen();
  const throughSights = new THREE.Vector3(sight.x, sight.y, 0.5).unproject(camera).sub(camera.position).normalize();
  const moving = Math.min(1, horizontalSpeed(player) / MOVEMENT.walkSpeed);
  // Steadier crouched or prone; wilder sliding, diving or in the air.
  const steady = player.move === 'slide' || player.move === 'supine' || player.move === 'dive' || !player.grounded ? 1.5
    : player.stance === 'prone' ? 0.65 : player.stance === 'crouch' ? 0.8 : 1;
  const stray = ((gun.spread.hip + gun.spread.moving * moving) * (1 - aimAmount) + gun.spread.aim * aimAmount) * steady;
  const direction = spread(forward.clone().lerp(throughSights, aimAmount).normalize(), stray);
  // (A shotgun's pellets, `pellets` of them, each strayed by up to its
  // pelletSpread from there; each kicks up less dust than a bullet.)
  const pellets = Math.max(1, gun.pellets || 1);
  for (let i = 0; i < pellets; i++) {
    const d = pellets > 1 ? spread(direction, gun.pelletSpread || 0) : direction;
    const hit = raycastWorld(camera.position.x, camera.position.y, camera.position.z, d.x, d.y, d.z, gun.range);
    const dust = pellets > 1 ? 0.35 : 1;
    if (hit && hit.what === 'soldier') effects.impact(hit, 0x6b6e58, false, dust); // cloth: no hole (his box is only roughly his shape)
    else if (hit) effects.impact(hit, hit.what === 'ground' ? 0x8c8c8c : 0xcfc6b6, true, dust);
  }

  // Flash, smoke and the spent case, where the gun is.
  const muzzle = gunPointToWorld(viewmodel.muzzlePoint());
  effects.flash(muzzle, suppressed ? 0.12 : 1);
  effects.smoke(muzzle, direction);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const caseVelocity = right.multiplyScalar(1.6 + Math.random() * 0.8)
    .addScaledVector(up, 2 + Math.random() * 0.8)
    .addScaledVector(forward, -0.4)
    .add(new THREE.Vector3(player.vx, player.vy, player.vz));
  effects.ejectCase(gunPointToWorld(viewmodel.portPoint()), caseVelocity, gun.caseSize);

  const k = (1 - (1 - RECOIL.aimed) * aimAmount) * gun.recoil * burst;
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

// --- Light and laser ---

// A soft round dot, for the laser.
function dotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

// Points the light and laser where the gun in the hands points (they shine
// straight ahead from where they're mounted), when it has them and they're
// switched on.
function updateBeams() {
  const light = lightsOn && viewmodel.lightBeam();
  if (light) {
    const [from, ahead] = light.map(gunPointToWorld);
    torch.position.copy(from);
    torch.target.position.copy(ahead);
    torch.intensity = LIGHT.intensity;
  } else {
    torch.intensity = 0;
  }
  const laser = lightsOn && viewmodel.laserBeam();
  laserDot.visible = false;
  if (laser) {
    const [from, ahead] = laser.map(gunPointToWorld);
    const d = ahead.sub(from).normalize();
    const hit = raycastWorld(from.x, from.y, from.z, d.x, d.y, d.z, LASER.range);
    if (hit) {
      laserDot.position.set(hit.x + hit.nx * 0.01, hit.y + hit.ny * 0.01, hit.z + hit.nz * 0.01);
      laserDot.visible = true;
    }
  }
  viewmodel.setGlow(lightsOn);
}

// --- Ammo counter ---

// The guns' names on the page (the start screen's controls and credits) are
// each gun's own (its name in src/shared/config.js).
for (const el of document.querySelectorAll('[data-gun-name]')) {
  if (GUNS[el.dataset.gunName]) el.textContent = GUNS[el.dataset.gunName].name;
}

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
  if (ammoName) ammoName.textContent = weapon.automatic ? `${weapon.spec.name} · Auto` : weapon.spec.name;
  ammoMag.textContent = weapon.ammo;
  ammoReserve.textContent = weapon.reserve;
  // (Low: 3 rounds or fewer, or a fifth of a bigger magazine.)
  ammo.classList.toggle('low', weapon.ammo <= Math.max(3, Math.ceil(weapon.spec.magazine * 0.2)));
  ammoHint.textContent = weapon.reloading ? 'Reloading' : weapon.ammo === 0 && weapon.reserve > 0 ? 'Press R to reload' : weapon.ammo === 0 ? 'Out of ammo' : '';
}

// --- Game loop ---

let lastTime = null;
let accumulator = 0;
const lookDirection = new THREE.Vector3();

renderer.setAnimationLoop((time) => {
  // (Standing still while the breakdown is open, and not catching up after.)
  if (showcase) {
    lastTime = null;
    return;
  }
  const cpuStart = performance.now();
  const frameSeconds = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS);
  lastTime = time;

  // Photo mode: the mouse turns its camera; the player keeps the look he had.
  if (input.locked && input.presses('KeyP') > 0) setPhotoMode(!photo.on);
  if (photo.on) {
    photo.look = { yaw: input.yaw, pitch: input.pitch };
    input.yaw = photo.player.yaw;
    input.pitch = photo.player.pitch;
  }
  const play = input.locked && !photo.on; // the game's own keys

  accumulator += frameSeconds;
  // A shot waiting for the gun to come up stops a sprint until it's gone off.
  input.sprintBlocked = weapon.shotWaiting;
  while (accumulator >= TICK_DT) {
    previous.x = player.x;
    previous.y = player.y;
    previous.z = player.z;
    previous.eye = player.eye;
    if (photo.on) {
      // The arrow keys walk him (Shift runs).
      input.sample(cmd);
      const held = (code) => (input.held.has(code) ? 1 : 0);
      Object.assign(cmd, emptyCommand(), { yaw: input.yaw, pitch: input.pitch });
      cmd.forward = held('ArrowUp') - held('ArrowDown');
      cmd.right = held('ArrowRight') - held('ArrowLeft');
      if (cmd.forward > 0 && (held('ShiftLeft') || held('ShiftRight'))) cmd.buttons = BUTTON_SPRINT | BUTTON_SPRINT_KEY;
    } else if (input.locked) {
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
  const feetY = previous.y + (player.y - previous.y) * alpha;
  const eyeNow = previous.eye + (player.eye - previous.eye) * alpha;
  camera.position.set(
    previous.x + (player.x - previous.x) * alpha,
    feetY + eyeNow,
    previous.z + (player.z - previous.z) * alpha,
  );
  updateViewKick(frameSeconds);
  updateMoveFeel(frameSeconds);
  camera.rotation.set(input.pitch + viewKick.x + moveFeel.pitch, input.yaw + viewKick.y, moveFeel.roll);

  // The loadout menu: B.
  if (play && input.presses('KeyB') > 0) {
    menu.show();
    if (weapon.inspect) weapon.inspect.cut = true; // put the gun back in the hold first
  }
  // A loadout change to the gun in the hands waits for its reload or
  // inspect to end.
  if (pendingLoadout.has(held) && !weapon.reloading && !weapon.inspect) {
    pendingLoadout.delete(held);
    applyLoadout(held);
  }
  // The light and laser: T.
  if (play && input.presses('KeyT') > 0 && (viewmodel.points.light || viewmodel.points.laser)) {
    lightsOn = !lightsOn;
    playSwitchClick();
    viewmodel.flickSwitch();
  }

  // Switching guns: 1 to 9, 0, - and =, or the mouse wheel.
  if (play) {
    LOADOUT.forEach((key, i) => {
      if (GUN_KEYS[i] && input.presses(GUN_KEYS[i]) > 0) switchGun(key);
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
  const busy = input.aiming || Boolean(player.sprinting) || player.move !== 'ground' && player.move !== 'air';
  // Climbing, diving through the air or getting up off your back, the gun
  // can't fire (aiming, it can while climbing).
  const cantFire = (player.move === 'mantle' && !input.aiming) || player.move === 'rise' || (player.move === 'dive' && !player.grounded);
  // (Clicks while it can't fire are dropped, not kept for later.)
  const clicks = input.locked ? input.presses('Mouse0') * (photo.on ? 0 : 1) : 0;
  // (A fully automatic gun fires as long as the button is held.)
  const holdingTrigger = play && !cantFire && input.held.has('Mouse0');
  if (play && input.presses('KeyR') > 0) asked.reload = true;
  if (play && input.presses('KeyF') > 0) asked.inspect = true;
  const reloadNow = asked.reload && !switching;
  const inspectNow = asked.inspect && !switching;
  if (!switching || !input.locked) asked.reload = asked.inspect = false;
  const events = input.locked
    ? weapon.update(frameSeconds, cantFire ? 0 : clicks, reloadNow, viewmodel.readyToFire, inspectNow, busy, holdingTrigger)
    : weapon.update(frameSeconds, 0, false, viewmodel.readyToFire, false, busy);
  camera.getWorldDirection(lookDirection);
  const wallDistance = raycastColliders(camera.position.x, camera.position.y, camera.position.z, lookDirection.x, lookDirection.y, lookDirection.z, 2);
  // The gun the hands are holding (while switching, the one being put away
  // until it's out of view, as it was when the switch began).
  const shownKey = viewmodel.shownGun;
  if (outgoing && (outgoing.key !== shownKey || shownKey === held)) outgoing = null;
  const gunState = outgoing ? outgoing.state : gunStateOf(weapons[shownKey]);
  aimAmount = viewmodel.update(frameSeconds, player, input.yaw, input.pitch, camera.quaternion, wallDistance, input.aiming && !photo.on && !weapon.reloading && !weapon.inspecting && !switching, gunState);
  setWorldFov(1 + (AIM.zoom - 1) * aimAmount, moveFeel.fov);
  updateBeams();
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
    else if (event === 'magGrab' || event === 'rackGrab') playMagGrab();
    else if (event === 'magIn') {
      playMagIn(held);
      viewmodel.seatMagazine();
    }
    else if (event === 'shellIn') playShellIn();
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
  body.update(new THREE.Vector3(camera.position.x, feetY, camera.position.z), input.yaw, input.pitch, player, frameSeconds, eyeNow);
  if (fpArms && body.model && loaded) fpArms.update(camera, player, input.pitch, frameSeconds);
  updateAmmo();

  if (photo.on) {
    flyPhotoCamera(frameSeconds);
    updatePhotoGun();
  }

  gpuTimer.begin();
  renderer.clear();
  renderer.render(scene, photo.on ? photo.camera : camera);
  if (!photo.on) viewmodel.render(renderer);
  gpuTimer.end();
  // (Back to the photo camera's look for the mouse.)
  if (photo.on) {
    photo.player = { yaw: input.yaw, pitch: input.pitch };
    input.yaw = photo.look.yaw;
    input.pitch = photo.look.pitch;
  }
  hud.update(frameSeconds, player, performance.now() - cpuStart, gpuTimer.ms);
});
