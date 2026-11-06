// Keyboard and mouse. Keys are read by their physical position (KeyW etc.),
// so WASD works on any keyboard layout.

import { BUTTON_AIM, BUTTON_CROUCH, BUTTON_JUMP, BUTTON_PRONE, BUTTON_SPRINT, BUTTON_SPRINT_KEY } from './shared/movement.js';
import { settings } from './settings.js';

const DEGREES_PER_COUNT = 0.022;
const MAX_PITCH = (89 * Math.PI) / 180;

// Keys the game uses; the browser's default action for them is blocked while playing.
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyR', 'KeyQ', 'KeyF', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyB', 'KeyT', 'KeyC', 'KeyZ', 'KeyP', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

// Q aims: a quick click turns aiming on or off; holding it aims until you let go.
const AIM_KEY = 'KeyQ';
const AIM_CLICK_MS = 250; // a press shorter than this counts as a click

// Holding Shift sprints. Firing stops it; it carries on this long after the
// last shot if Shift is still held.
const SPRINT_AFTER_SHOT_MS = 400;

// The mouse wheel switches guns: one step per notch (a touchpad's smooth
// scrolling adds up to a step every this many pixels), and no more than one
// step this often.
const WHEEL_STEP = 50;
const WHEEL_GAP_MS = 120;

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
    // Presses not yet handled by the frame loop (firing, reloading): how many of each.
    this.pressed = new Map();
    this.onLockChange = null;
    this.aimKeyOn = false; // aiming with Q
    this.aimKeyDown = 0; // when Q was pressed
    this.aimKeyWasOn = false; // whether it was already on when Q was pressed
    this.lastShot = -Infinity; // when the fire button was last pressed (ms)
    this.sprintBlocked = false; // set by the game while a shot is waiting to go off
    this.wheel = 0; // scrolled since the last step (pixels)
    this.wheelSteps_ = 0; // steps not yet handled (+1 down, -1 up)
    this.lastWheelStep = -Infinity;

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
      if (e.code === AIM_KEY && !e.repeat) {
        this.aimKeyWasOn = this.aimKeyOn;
        this.aimKeyOn = true;
        this.aimKeyDown = performance.now();
      }
      if (!e.repeat) {
        this.tapped.add(e.code);
        this.pressed.set(e.code, (this.pressed.get(e.code) || 0) + 1);
      }
    });

    document.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      if (e.code === AIM_KEY) {
        const click = performance.now() - this.aimKeyDown < AIM_CLICK_MS;
        // A click while aiming turns it off; letting go after holding stops too.
        if (this.aimKeyWasOn || !click) this.aimKeyOn = false;
      }
    });

    // Mouse buttons count as keys called Mouse0 (left), Mouse2 (right).
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.held.add('Mouse' + e.button);
      if (e.button === 0) this.lastShot = performance.now();
      this.tapped.add('Mouse' + e.button);
      this.pressed.set('Mouse' + e.button, (this.pressed.get('Mouse' + e.button) || 0) + 1);
    });
    document.addEventListener('mouseup', (e) => {
      this.held.delete('Mouse' + e.button);
    });
    // The wheel: in whole steps.
    document.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      // Line or page scrolling (some mice) counts a notch per line.
      const delta = e.deltaMode === 0 ? e.deltaY : Math.sign(e.deltaY) * WHEEL_STEP;
      const now = performance.now();
      // Scrolling during the gap after a step is let go (so a fast flick is
      // one step, and nothing is left over), and so is anything left from
      // scrolling the other way.
      if (now - this.lastWheelStep <= WHEEL_GAP_MS || Math.sign(delta) !== Math.sign(this.wheel)) this.wheel = 0;
      if (now - this.lastWheelStep <= WHEEL_GAP_MS) return;
      this.wheel += delta;
      if (Math.abs(this.wheel) >= WHEEL_STEP) {
        this.wheelSteps_ += Math.sign(this.wheel);
        this.lastWheelStep = now;
        this.wheel = 0;
      }
    }, { passive: false });

    // Right-click aims, so don't open the browser's menu.
    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });

    // Don't keep walking if the window loses focus while a key is down.
    window.addEventListener('blur', () => this.releaseAll());
  }

  releaseAll() {
    this.aimKeyOn = false;
    this.wheel = 0;
    this.wheelSteps_ = 0;
    this.held.clear();
    this.tapped.clear();
    this.pressed.clear();
  }

  // Mouse wheel steps since the last time this asked (+ down, - up).
  wheelSteps() {
    const n = this.wheelSteps_;
    this.wheelSteps_ = 0;
    return n;
  }

  // How many times `code` was pressed since the last time this asked about it.
  presses(code) {
    const n = this.pressed.get(code) || 0;
    this.pressed.delete(code);
    return n;
  }

  // Lets go of the mouse (for a menu).
  unlock() {
    if (document.pointerLockElement === this.element) document.exitPointerLock();
  }

  // Locks the mouse to the game. Must be called from a click or key press.
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

  // Holding the right mouse button, or Q (click or hold), aims down the sights.
  get aiming() {
    return this.locked && (this.held.has('Mouse2') || this.aimKeyOn);
  }

  // Holding Shift sprints, unless aiming, or just after firing (or while a
  // shot is still waiting for the gun to come up).
  get sprinting() {
    return this.locked && (this.held.has('ShiftLeft') || this.held.has('ShiftRight')) && !this.aiming
      && !this.sprintBlocked && performance.now() - this.lastShot > SPRINT_AFTER_SHOT_MS;
  }

  // Fills `cmd` with this tick's input.
  sample(cmd) {
    const down = (code) => (this.held.has(code) || this.tapped.has(code) ? 1 : 0);
    cmd.forward = down('KeyW') - down('KeyS');
    cmd.right = down('KeyD') - down('KeyA');
    cmd.yaw = this.yaw;
    cmd.pitch = this.pitch;
    cmd.buttons = (down('Space') ? BUTTON_JUMP : 0) | (this.aiming ? BUTTON_AIM : 0) | (this.sprinting ? BUTTON_SPRINT : 0)
      | (down('KeyC') ? BUTTON_CROUCH : 0) | (down('KeyZ') ? BUTTON_PRONE : 0)
      | (this.locked && (down('ShiftLeft') || down('ShiftRight')) ? BUTTON_SPRINT_KEY : 0);
    this.tapped.clear();
    return cmd;
  }
}
