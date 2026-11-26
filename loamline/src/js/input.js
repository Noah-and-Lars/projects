// Keyboard, gamepad, touch sticks and tilt steering merged into one input
// state per frame.

import { clamp } from './noise.js';
import { setting } from './storage.js';

const keys = new Set();
const pressedOnce = new Set();
let actionsQueue = [];

const TAP = 0.2; // a W press shorter than this in the air is a barspin

export class Input {
  constructor() {
    this.steerKb = 0;
    this.prevJump = false;
    this.wDownAt = -1;
    this.wWasDown = false;
    this.stickFlickArmed = true;
    this.touch = { lx: 0, ly: 0, rx: 0, ry: 0, jump: false, active: false };
    this.tilt = new Tilt();
    this.padPrev = {};
    this.time = 0;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!keys.has(e.code)) pressedOnce.add(e.code);
      keys.add(e.code);
      if (!e.repeat) {
        if (e.code === 'KeyR') actionsQueue.push('respawn');
        if (e.code === 'KeyC') actionsQueue.push('camera');
        if (e.code === 'KeyP') actionsQueue.push('photo');
        if (e.code === 'Escape') actionsQueue.push('pause');
        if (e.code === 'KeyM') actionsQueue.push('mute');
        if (e.code === 'Enter' || e.code === 'NumpadEnter') actionsQueue.push('enter');
      }
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => keys.clear());
  }

  action(a) { actionsQueue.push(a); }
  takeActions() { const a = actionsQueue; actionsQueue = []; return a; }

  // Called once per frame (not per physics substep).
  read(dt, grounded) {
    this.time += dt;
    const k = (c) => keys.has(c);
    const once = (c) => pressedOnce.has(c);

    // Keyboard steer builds up rather than snapping.
    const sens = setting('steerSens') ?? 1;
    const want = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    const rate = (want !== 0 ? 4.5 : 9) * (0.6 + 0.4 * sens);
    this.steerKb += clamp(want - this.steerKb, -rate * dt, rate * dt);

    let throttleRaw = k('KeyW') ? 1 : 0;
    let brakeRaw = k('KeyS') ? 1 : 0;
    let weight = (k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0);
    let spin = (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0);
    let steer = this.steerKb;
    let jump = k('Space');
    let flickUp = false;

    // Gamepad.
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = (i) => { const v = p.axes[i] || 0; return Math.abs(v) < 0.14 ? 0 : v; };
      const btn = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const val = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      const lx = curve(ax(0), sens), ly = ax(1), rx = ax(2), ry = ax(3);
      if (Math.abs(lx) > Math.abs(steer)) steer = lx;
      throttleRaw = Math.max(throttleRaw, val(7));
      brakeRaw = Math.max(brakeRaw, val(6));
      if (Math.abs(ry) > Math.abs(weight)) weight = -ry;
      if (Math.abs(rx) > Math.abs(spin)) spin = rx;
      jump = jump || btn(0);
      if (!grounded) {
        if (ly < -0.5) throttleRaw = Math.max(throttleRaw, 1);   // stick up: no hander
        if (ly > 0.5) brakeRaw = Math.max(brakeRaw, 1);          // stick down: superman
        if (ly < -0.85 && this.stickFlickArmed) { flickUp = true; this.stickFlickArmed = false; }
      }
      if (ly > -0.4) this.stickFlickArmed = true;
      const edge = (i, a) => { if (btn(i) && !this.padPrev[i]) actionsQueue.push(a); this.padPrev[i] = btn(i); };
      edge(3, 'respawn'); edge(5, 'camera'); edge(9, 'pause'); edge(1, 'photo');
    }

    // Touch sticks.
    const t = this.touch;
    if (t.active) {
      const lx = curve(t.lx, sens);
      if (Math.abs(lx) > Math.abs(steer)) steer = lx;
      if (t.ly < -0.25) throttleRaw = Math.max(throttleRaw, clamp(-t.ly * 1.3, 0, 1));
      if (t.ly > 0.25) brakeRaw = Math.max(brakeRaw, clamp(t.ly * 1.3, 0, 1));
      if (Math.abs(t.ry) > Math.abs(weight)) weight = -t.ry;
      if (Math.abs(t.rx) > Math.abs(spin)) spin = t.rx;
      jump = jump || t.jump;
      if (!grounded && t.flick) { flickUp = true; }
      t.flick = false;
    }

    // Tilt steering (ground only).
    if (grounded && this.tilt.on && this.tilt.value !== null) {
      if (Math.abs(this.tilt.value) > Math.abs(steer)) steer = this.tilt.value;
    }

    // W in the air: tap = barspin, hold = no hander.
    const wDown = throttleRaw > 0.5;
    let barspinTap = flickUp;
    let noHand = 0;
    if (!grounded) {
      if (wDown && !this.wWasDown) this.wDownAt = this.time;
      if (!wDown && this.wWasDown && this.wDownAt >= 0 && this.time - this.wDownAt < TAP) barspinTap = true;
      if (wDown && this.wDownAt >= 0 && this.time - this.wDownAt >= TAP) noHand = 1;
    } else {
      this.wDownAt = -1;
    }
    this.wWasDown = wDown;

    const out = {
      throttle: grounded ? throttleRaw : 0,
      brake: grounded ? brakeRaw : 0,
      steer: clamp(steer, -1, 1),
      weight: clamp(weight, -1, 1),
      spin: grounded ? 0 : clamp(spin, -1, 1),
      jumpHeld: jump,
      jumpPressed: jump && !this.prevJump,
      jumpReleased: !jump && this.prevJump,
      barspinTap,
      noHand,
      superman: grounded ? 0 : (brakeRaw > 0.5 ? 1 : 0),
      raw: { throttle: throttleRaw, brake: brakeRaw },
    };
    this.prevJump = jump;
    pressedOnce.clear();
    void once;
    return out;
  }

  reset() { this.prevJump = false; this.steerKb = 0; this.wDownAt = -1; keys.clear(); }

  anyKey() { return keys.size > 0; }
}

// Sensitivity curve: a part push turns less, a full push is always full lock.
function curve(x, sens) {
  const e = 1 + (1 - sens) * 1.5;
  return Math.sign(x) * Math.pow(Math.abs(x), e);
}

// ------------------------------------------------------------- tilt ----
class Tilt {
  constructor() {
    this.on = false; this.value = null; this.zero = null; this.raw = 0;
    this.handler = (e) => this.onEvent(e);
  }
  static available() { return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && window.isSecureContext; }
  async enable() {
    const D = window.DeviceOrientationEvent;
    if (!D) return false;
    if (typeof D.requestPermission === 'function') {
      try { if (await D.requestPermission() !== 'granted') return false; } catch { return false; }
    }
    this.on = true; this.zero = null; this.value = 0;
    window.addEventListener('deviceorientation', this.handler);
    return true;
  }
  disable() { this.on = false; this.value = null; window.removeEventListener('deviceorientation', this.handler); }
  calibrate() { this.zero = this.raw; }
  onEvent(e) {
    if (e.beta === null || e.gamma === null) return;
    // Steering-wheel angle in landscape, whichever way round the phone is.
    const b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
    const sx = Math.sin(g) * Math.cos(b), sy = -Math.sin(b);
    const o = ((screen.orientation && screen.orientation.angle) || 0) * Math.PI / 180;
    const x = sx * Math.cos(o) - sy * Math.sin(o), y = sx * Math.sin(o) + sy * Math.cos(o);
    const ang = Math.atan2(x, -y) * 180 / Math.PI;
    if (this.zero === null) this.zero = ang;
    this.raw = ang;
    let d = ((ang - this.zero + 540) % 360) - 180;
    const dead = 4, full = 45;
    const m = Math.max(0, Math.abs(d) - dead) / (full - dead);
    const target = Math.sign(d) * Math.pow(Math.min(1, m), 1.6);
    this.value += (target - this.value) * 0.5;
  }
}

// ------------------------------------------------------- touch sticks --
export function bindTouch(input, root) {
  const t = input.touch;
  const sticks = root.querySelectorAll('.stick');
  for (const el of sticks) {
    const side = el.dataset.side;
    const knob = el.querySelector('.knob');
    let id = null, cx = 0, cy = 0, lastY = 0, lastT = 0;
    const R = 56;
    const set = (x, y) => {
      if (side === 'l') { t.lx = x; t.ly = y; } else { t.rx = x; t.ry = y; }
      knob.style.transform = `translate(${x * R}px, ${y * R}px)`;
    };
    el.addEventListener('pointerdown', (e) => {
      id = e.pointerId; el.setPointerCapture(id);
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      t.active = true;
      lastY = 0; lastT = performance.now();
      move(e);
    });
    const move = (e) => {
      if (e.pointerId !== id) return;
      let x = (e.clientX - cx) / R, y = (e.clientY - cy) / R;
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      // A quick flick up on the left stick throws a barspin.
      const now = performance.now();
      if (side === 'l' && y < -0.85 && lastY > -0.4 && now - lastT < 160) t.flick = true;
      if (now - lastT > 60) { lastY = y; lastT = now; }
      set(x, y);
    };
    el.addEventListener('pointermove', move);
    const end = (e) => { if (e.pointerId !== id) return; id = null; set(0, 0); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  const jb = root.querySelector('.tjump');
  jb.addEventListener('pointerdown', (e) => { jb.setPointerCapture(e.pointerId); t.jump = true; t.active = true; jb.classList.add('on'); });
  const up = () => { t.jump = false; jb.classList.remove('on'); };
  jb.addEventListener('pointerup', up);
  jb.addEventListener('pointercancel', up);
  for (const b of root.querySelectorAll('[data-act]')) {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); input.action(b.dataset.act); });
  }
}

export { Tilt };
