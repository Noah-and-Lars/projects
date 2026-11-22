// Driving input: keyboard, gamepad (standard mapping) and touch, merged into Controls.
import { NO_CONTROLS, type Controls } from '../sim-core/vehicle-sim';

export type Action = 'throttle' | 'brake' | 'left' | 'right' | 'handbrake' | 'shiftUp' | 'shiftDown' | 'lights' | 'reset' | 'camera' | 'yard' | 'ignition';

export const DEFAULT_KEYS: Record<Action, string[]> = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  shiftUp: ['KeyE'],
  shiftDown: ['KeyQ'],
  lights: ['KeyL'],
  reset: ['KeyR'],
  camera: ['KeyC'],
  yard: ['Escape', 'Backquote'],
  ignition: ['KeyI'],
};

const EDGE: Action[] = ['shiftUp', 'shiftDown', 'lights', 'reset', 'camera', 'yard', 'ignition'];

export class DriveInput {
  private down = new Set<string>();
  private pressed = new Set<Action>();
  private touch = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private padPrev: boolean[] = [];
  private steerSmooth = 0;
  lightsOn = false;
  keys = DEFAULT_KEYS;
  lastDevice: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';
  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const isDown = e.type === 'keydown';
    if (isDown && !this.down.has(e.code)) for (const a of EDGE) if (this.keys[a].includes(e.code)) this.pressed.add(a);
    if (isDown) this.down.add(e.code); else this.down.delete(e.code);
    if (Object.values(this.keys).some((k) => k.includes(e.code))) { e.preventDefault(); this.lastDevice = 'keyboard'; }
  };
  private onBlur = () => this.down.clear();

  attach() {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
  }
  detach() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
    this.down.clear(); this.pressed.clear();
  }

  setTouch(t: Partial<DriveInput['touch']>) { Object.assign(this.touch, t); this.lastDevice = 'touch'; }
  pressTouch(a: Action) { this.pressed.add(a); this.lastDevice = 'touch'; }

  /** Consume edge-triggered actions since the last call. */
  takePressed(): Set<Action> {
    const p = new Set(this.pressed);
    this.pressed.clear();
    return p;
  }
  peek(a: Action): boolean { return this.pressed.has(a); }

  private held(a: Action) { return this.keys[a].some((k) => this.down.has(k)); }

  /** Poll everything and build Controls. Call once per frame. */
  poll(dt: number, edges: Set<Action>): Controls {
    let throttle = this.held('throttle') ? 1 : 0;
    let brake = this.held('brake') ? 1 : 0;
    let keySteer = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let handbrake = this.held('handbrake');
    // Keyboard steering eases in and snaps back, so it isn't twitchy.
    const rate = (keySteer === 0 ? 6 : 3.2) * dt;
    this.steerSmooth += Math.max(-rate, Math.min(rate, keySteer - this.steerSmooth));
    let steer = this.steerSmooth;

    const pads = navigator.getGamepads?.() ?? [];
    for (const gp of pads) {
      if (!gp || gp.mapping !== 'standard') continue;
      const ax = gp.axes[0] ?? 0;
      const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
      const rt = gp.buttons[7]?.value ?? 0, lt = gp.buttons[6]?.value ?? 0;
      const btn = (i: number) => !!gp.buttons[i]?.pressed;
      const any = Math.abs(dz(ax)) > 0 || rt > 0.05 || lt > 0.05 || gp.buttons.some((b) => b.pressed);
      if (any) this.lastDevice = 'gamepad';
      if (Math.abs(dz(ax)) > Math.abs(steer)) steer = dz(ax);
      throttle = Math.max(throttle, rt);
      brake = Math.max(brake, lt);
      handbrake = handbrake || btn(0);
      const map: [number, Action][] = [[5, 'shiftUp'], [4, 'shiftDown'], [3, 'camera'], [2, 'reset'], [12, 'lights'], [8, 'yard'], [9, 'ignition']];
      for (const [i, a] of map) { if (btn(i) && !this.padPrev[i]) edges.add(a); }
      this.padPrev = gp.buttons.map((b) => b.pressed);
      break;
    }

    if (this.touch.throttle || this.touch.brake || this.touch.steer || this.touch.handbrake) {
      throttle = Math.max(throttle, this.touch.throttle);
      brake = Math.max(brake, this.touch.brake);
      if (Math.abs(this.touch.steer) > Math.abs(steer)) steer = this.touch.steer;
      handbrake = handbrake || this.touch.handbrake;
    }
    if (edges.has('lights')) this.lightsOn = !this.lightsOn;
    return {
      ...NO_CONTROLS, throttle, brake, steer: Math.max(-1, Math.min(1, steer)), handbrake,
      shiftUp: edges.has('shiftUp'), shiftDown: edges.has('shiftDown'), lights: this.lightsOn,
    };
  }
}
