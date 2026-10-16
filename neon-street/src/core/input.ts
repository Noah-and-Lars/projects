// Keyboard + pointer-lock mouse input.

export class Input {
  private keys = new Set<string>();
  private dx = 0;
  private dy = 0;
  locked = false;
  /** Fires when pointer lock is lost (Esc) so the UI can open the menu. */
  onUnlock: (() => void) | null = null;
  onLock: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      // Keep the browser from scrolling / finding when we own the keys.
      if (this.locked && ['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      const nowLocked = document.pointerLockElement === this.canvas;
      if (nowLocked !== this.locked) {
        this.locked = nowLocked;
        this.keys.clear();
        if (nowLocked) this.onLock?.();
        else this.onUnlock?.();
      }
    });
    document.addEventListener('pointerlockerror', () => {
      this.locked = false;
    });
  }

  async requestLock(): Promise<void> {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true } as PointerLockOptions) as unknown;
      if (p instanceof Promise) await p.catch(() => this.canvas.requestPointerLock());
    } catch {
      try { this.canvas.requestPointerLock(); } catch { /* unsupported */ }
    }
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Returns and clears accumulated mouse motion for this frame. */
  consumeMouse(): [number, number] {
    const r: [number, number] = [this.dx, this.dy];
    this.dx = 0;
    this.dy = 0;
    return r;
  }
}
