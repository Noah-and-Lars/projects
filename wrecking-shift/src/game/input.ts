/** Keyboard / mouse state with pointer lock. */
export class Input {
  keys = new Set<string>();
  /** keys pressed since last consume */
  pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  buttons = 0;
  buttonsPressed = 0;
  wheel = 0;
  locked = false;
  sensitivity = 0.0023;
  /** invert vertical mouse look (settings) */
  invertY = false;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      if (this.locked && ['Tab', 'Space', 'KeyQ', 'KeyE'].includes(e.code)) e.preventDefault();
      // F5 would reload the page and lose the run (it is quicksave); never let the browser have it or F9
      if (e.code === 'F5' || e.code === 'F9') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; });
    el.addEventListener('mousedown', (e) => {
      if (!this.locked) { this.requestLock(); return; }
      this.buttons |= 1 << e.button; this.buttonsPressed |= 1 << e.button;
    });
    window.addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX; this.mouseDY += this.invertY ? -e.movementY : e.movementY;
    });
    window.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (!this.locked) { this.keys.clear(); this.buttons = 0; }
      this.onLockChange?.(this.locked);
    });
  }
  onLockChange?: (locked: boolean) => void;
  /** set false while menus are open */
  allowLock = true;

  requestLock(): void {
    if (!this.allowLock) return;
    try { (this.el.requestPointerLock() as any)?.catch?.(() => {}); } catch { /* headless */ }
  }
  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  down(code: string): boolean { return this.keys.has(code); }
  /** true once per key press */
  hit(code: string): boolean { return this.pressed.has(code); }
  endFrame(): void {
    this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; this.buttonsPressed = 0; this.wheel = 0;
  }
}
