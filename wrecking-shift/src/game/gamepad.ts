/**
 * Gamepad support (browser Gamepad API, "standard" mapping). The pad is turned into the same inputs the
 * keyboard and mouse produce, so every feature (tools, vehicles, menus, rebinding) works with it unchanged:
 * - held buttons / stick directions become key codes (synthetic keydown / keyup through `emitKey`),
 * - the right stick becomes mouse motion (scaled by the game's mouse sensitivity, so the Settings slider applies),
 * - triggers become the left / right mouse buttons, bumpers the mouse wheel (tool cycling).
 *
 * On foot: left stick move, right stick look, RT use tool, LT grab/secondary, RB / LB next / previous tool,
 * A jump, B crouch, X interact, Y flashlight, left stick click sprint, Start pause, Back site map.
 * Driving: RT throttle, LT brake / reverse, left stick steer, A handbrake, X get out, Y camera,
 * RB / LB raise / lower the loader bucket, right stick look around.
 * Menus: d-pad / left stick move the focus between buttons, A presses, B goes back, Start closes the pause menu.
 *
 * `mapPad` is pure (unit tested with fake pads); `GamepadInput` does the polling and the edge bookkeeping.
 */

/** the bits of a Gamepad we use (real Gamepad objects fit) */
export interface PadLike {
  axes: ArrayLike<number>;
  buttons: ArrayLike<{ pressed: boolean; value: number }>;
  connected?: boolean;
}

/** standard mapping button indices */
export const PAD = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
} as const;

export type PadContext = 'foot' | 'drive' | 'menu';

export interface PadFrame {
  /** key codes that should be held */
  keys: Set<string>;
  /** mouse button mask that should be held (1 = LMB, 4 = RMB) */
  buttons: number;
  /** look rate, -1..1 per axis after dead zone + response curve */
  lookX: number;
  lookY: number;
  /** wheel steps requested by bumper presses (needs the previous frame for edges): +1 next, -1 previous */
  wheel: number;
  /** menu focus moves (edges): 'up' | 'down' | 'left' | 'right' */
  nav: ('up' | 'down' | 'left' | 'right')[];
  /** A pressed this frame (menu: click the focused button) */
  activate: boolean;
}

export const DEAD_ZONE = 0.22;
/** stick / trigger threshold that counts as a digital press */
export const PRESS = 0.45;

const btn = (p: PadLike, i: number): number => { const b = p.buttons[i]; return b ? (b.pressed ? Math.max(0.5, b.value || 1) : b.value || 0) : 0; };
const axis = (p: PadLike, i: number): number => { const v = p.axes[i]; return typeof v === 'number' && isFinite(v) ? v : 0; };
/** dead zone + squared response (fine aiming near the centre) */
export function curve(v: number): number {
  const a = Math.abs(v);
  if (a < DEAD_ZONE) return 0;
  const t = Math.min(1, (a - DEAD_ZONE) / (1 - DEAD_ZONE));
  return Math.sign(v) * t * t;
}

/** which buttons are down (for edge detection between frames) */
export function padDown(p: PadLike): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < 16; i++) out.push(btn(p, i) > PRESS);
  // left stick directions as virtual buttons 16..19 (menu navigation)
  out.push(axis(p, 1) < -0.6, axis(p, 1) > 0.6, axis(p, 0) < -0.6, axis(p, 0) > 0.6);
  return out;
}

/**
 * Map one pad state to game inputs. `prev` = padDown() of the previous poll (edges for bumpers / menu moves).
 */
export function mapPad(p: PadLike, ctx: PadContext, prev: boolean[] = []): PadFrame {
  const down = padDown(p);
  const edge = (i: number) => down[i] && !prev[i];
  const keys = new Set<string>();
  const f: PadFrame = { keys, buttons: 0, lookX: 0, lookY: 0, wheel: 0, nav: [], activate: false };
  if (down[PAD.START]) keys.add('Escape');
  if (ctx === 'menu') {
    if (edge(PAD.UP) || edge(16)) f.nav.push('up');
    if (edge(PAD.DOWN) || edge(17)) f.nav.push('down');
    if (edge(PAD.LEFT) || edge(18)) f.nav.push('left');
    if (edge(PAD.RIGHT) || edge(19)) f.nav.push('right');
    f.activate = edge(PAD.A);
    if (down[PAD.B]) keys.add('Escape');
    return f;
  }
  const lx = axis(p, 0), ly = axis(p, 1);
  f.lookX = curve(axis(p, 2));
  f.lookY = curve(axis(p, 3));
  if (down[PAD.BACK]) keys.add('Tab');
  if (ctx === 'drive') {
    if (btn(p, PAD.RT) > PRESS * 0.6) keys.add('KeyW');
    if (btn(p, PAD.LT) > PRESS * 0.6) keys.add('KeyS');
    if (lx < -0.3) keys.add('KeyA');
    if (lx > 0.3) keys.add('KeyD');
    if (down[PAD.A]) keys.add('Space');
    if (down[PAD.X]) keys.add('KeyE');
    if (down[PAD.Y]) keys.add('KeyV');
    if (down[PAD.RB]) keys.add('KeyR');
    if (down[PAD.LB]) keys.add('KeyF');
    return f;
  }
  // on foot
  if (ly < -0.35) keys.add('KeyW');
  if (ly > 0.35) keys.add('KeyS');
  if (lx < -0.35) keys.add('KeyA');
  if (lx > 0.35) keys.add('KeyD');
  if (down[PAD.A]) keys.add('Space');
  if (down[PAD.B]) keys.add('KeyC');
  if (down[PAD.X]) keys.add('KeyE');
  if (down[PAD.Y]) keys.add('KeyF');
  if (down[PAD.LS]) keys.add('ShiftLeft');
  if (btn(p, PAD.RT) > PRESS) f.buttons |= 1;
  if (btn(p, PAD.LT) > PRESS) f.buttons |= 4;
  if (edge(PAD.RB)) f.wheel += 1;
  if (edge(PAD.LB)) f.wheel -= 1;
  return f;
}

/** what GamepadInput drives (the game's Input fits) */
export interface InputSink {
  keys: Set<string>;
  mouseDX: number;
  mouseDY: number;
  buttons: number;
  buttonsPressed: number;
  wheel: number;
  invertY: boolean;
}

/** look speed: right stick fully over = this many "mouse pixels" per second (x the mouse sensitivity) */
export const LOOK_PX_PER_S = 1100;

export class GamepadInput {
  /** keys this poller is holding down */
  private held = new Set<string>();
  private heldButtons = 0;
  private prev: boolean[] = [];
  /** index of the pad in use (first connected one) */
  active = -1;

  constructor(
    private input: InputSink,
    private getPads: () => ArrayLike<PadLike | null> | null,
    private emitKey: (code: string, down: boolean) => void,
    private nav?: (dir: 'up' | 'down' | 'left' | 'right') => void,
    private activate?: () => void,
  ) {}

  poll(dt: number, ctx: PadContext): PadFrame | null {
    let pad: PadLike | null = null;
    let pads: ArrayLike<PadLike | null> | null = null;
    try { pads = this.getPads(); } catch { pads = null; }
    this.active = -1;
    if (pads) for (let i = 0; i < pads.length; i++) { const q = pads[i]; if (q && q.connected !== false) { pad = q; this.active = i; break; } }
    if (!pad) { this.releaseAll(); return null; }
    const f = mapPad(pad, ctx, this.prev);
    this.prev = padDown(pad);
    // keys: press what is newly wanted, release what is no longer wanted (and re-press keys lost to a blur)
    for (const k of f.keys) if (!this.held.has(k) || !this.input.keys.has(k)) { this.held.add(k); this.emitKey(k, true); }
    for (const k of [...this.held]) if (!f.keys.has(k)) { this.held.delete(k); this.emitKey(k, false); }
    // mouse buttons: only touch the bits the pad owns, so the real mouse keeps working
    const on = f.buttons & ~this.heldButtons, off = this.heldButtons & ~f.buttons;
    this.input.buttons = (this.input.buttons | on) & ~off;
    this.input.buttonsPressed |= on;
    this.heldButtons = f.buttons;
    if (f.wheel) this.input.wheel += f.wheel;
    if (f.lookX || f.lookY) {
      this.input.mouseDX += f.lookX * LOOK_PX_PER_S * dt;
      this.input.mouseDY += (this.input.invertY ? -f.lookY : f.lookY) * LOOK_PX_PER_S * 0.75 * dt;
    }
    for (const d of f.nav) this.nav?.(d);
    if (f.activate) this.activate?.();
    return f;
  }

  releaseAll(): void {
    for (const k of this.held) this.emitKey(k, false);
    this.held.clear();
    this.input.buttons &= ~this.heldButtons;
    this.heldButtons = 0;
    this.prev = [];
  }
}
