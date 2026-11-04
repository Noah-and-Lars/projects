// Keyboard and mouse. Keys are read by their physical position (KeyW etc.),
// so WASD works on any keyboard layout.

import { BUTTON_AIM, BUTTON_JUMP } from './shared/movement.js';
import { settings } from './settings.js';

const DEGREES_PER_COUNT = 0.022;
const MAX_PITCH = (89 * Math.PI) / 180;

// Keys the game uses; the browser's default action for them is blocked while playing.
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);

export class Input {
  constructor(element) {
    this.element = element;
    this.locked = false;
    this.yaw = 0;
    this.pitch = 0;
    this.held = new Set();
    // Keys pressed since the last tick. A quick tap can start and end between
    // two ticks (or during a slow frame); this makes sure it still counts.
    this.tapped = new Set();
    this.onLockChange = null;

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.releaseAll();
      this.onLockChange?.(this.locked);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const radiansPerCount = (DEGREES_PER_COUNT * settings.sensitivity * Math.PI) / 180;
      this.yaw -= e.movementX * radiansPerCount;
      this.pitch -= e.movementY * radiansPerCount;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
      // Keep yaw between -π and π so it never loses precision.
      this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    });

    document.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.held.add(e.code);
      if (!e.repeat) this.tapped.add(e.code);
    });

    document.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
    });

    // Mouse buttons count as keys called Mouse0 (left), Mouse2 (right).
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.held.add('Mouse' + e.button);
      this.tapped.add('Mouse' + e.button);
    });
    document.addEventListener('mouseup', (e) => {
      this.held.delete('Mouse' + e.button);
    });
    // Right-click aims, so don't open the browser's menu.
    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });

    // Don't keep walking if the window loses focus while a key is down.
    window.addEventListener('blur', () => this.releaseAll());
  }

  releaseAll() {
    this.held.clear();
    this.tapped.clear();
  }

  // Locks the mouse to the game. Must be called from a click.
  async lock() {
    try {
      // Raw mouse input, without the operating system's mouse acceleration.
      await this.element.requestPointerLock({ unadjustedMovement: true });
    } catch {
      // Not every browser supports raw input; fall back to a normal lock.
      // If this fails too (e.g. clicking straight after pressing Esc), the
      // player just clicks again.
      try {
        await this.element.requestPointerLock();
      } catch {
        // Ignore.
      }
    }
  }

  // Holding the right mouse button aims down the sights.
  get aiming() {
    return this.locked && this.held.has('Mouse2');
  }

  // Fills `cmd` with this tick's input.
  sample(cmd) {
    const down = (code) => (this.held.has(code) || this.tapped.has(code) ? 1 : 0);
    cmd.forward = down('KeyW') - down('KeyS');
    cmd.right = down('KeyD') - down('KeyA');
    cmd.yaw = this.yaw;
    cmd.pitch = this.pitch;
    cmd.buttons = (down('Space') ? BUTTON_JUMP : 0) | (this.held.has('Mouse2') ? BUTTON_AIM : 0);
    this.tapped.clear();
    return cmd;
  }
}
