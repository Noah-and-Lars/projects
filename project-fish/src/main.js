// Starts the game: sets up rendering and runs the game loop.
//
// The game logic runs in fixed ticks (TICK_RATE per second). Each screen frame
// runs however many ticks are due, then draws the player smoothly between the
// last two ticks so movement looks the same at 30, 60 or 144 FPS. Mouse look is
// applied every frame, straight from the mouse, so aiming never lags.

import * as THREE from 'three';
import { PLAYER, TICK_DT } from './shared/config.js';
import { createPlayerState, emptyCommand, simulatePlayer } from './shared/movement.js';
import { createWorld } from './world.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
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
container.appendChild(renderer.domElement);

const scene = createWorld();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 1500);
camera.rotation.order = 'YXZ'; // turn left/right first, then look up/down

const input = new Input(renderer.domElement);
const hud = new Hud(document.getElementById('debug'));

const player = createPlayerState();
const previous = { x: player.x, y: player.y, z: player.z };
const cmd = emptyCommand();

// --- Window size and field of view ---

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  // three.js wants the vertical FOV. Work it out from the horizontal FOV on a
  // 16:9 screen, so wider screens see more at the sides instead of less above and below.
  const halfHorizontal = (settings.fov * Math.PI) / 360;
  camera.fov = (2 * Math.atan(Math.tan(halfHorizontal) * (9 / 16)) * 180) / Math.PI;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Click to play / Esc to release the mouse ---

overlay.addEventListener('click', () => input.lock());
input.onLockChange = (locked) => {
  overlay.hidden = locked;
  document.body.classList.toggle('playing', locked);
};
overlayStatus.textContent = 'Click to play';

// --- Game loop ---

let lastTime = null;
let accumulator = 0;

renderer.setAnimationLoop((time) => {
  const frameSeconds = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS);
  lastTime = time;

  accumulator += frameSeconds;
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
  camera.rotation.set(input.pitch, input.yaw, 0);

  hud.update(frameSeconds, player);
  renderer.render(scene, camera);
});
