// Orbit camera for the Yard: drag to orbit, middle/shift-drag or two fingers to pan, wheel/pinch to zoom.
// A press that does not move becomes a "tap" (tool action).
import * as THREE from 'three';

export class OrbitCam {
  target = new THREE.Vector3(0, 0.5, 0);
  yaw = -0.75;
  pitch = 0.55;
  dist = 9;
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; button: number; moved: boolean }>();
  private pinch0 = 0;
  onTap: (x: number, y: number, e: PointerEvent) => void = () => {};
  onHover: (x: number, y: number) => void = () => {};
  dragging = false;

  constructor(public camera: THREE.PerspectiveCamera, private el: HTMLElement) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private down = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, moved: false });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse') this.onHover(e.clientX, e.clientY); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > 6) p.moved = true;
    if (!p.moved) { if (e.pointerType === 'mouse') this.onHover(e.clientX, e.clientY); return; }
    this.dragging = true;
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch0 > 0) this.dist = THREE.MathUtils.clamp(this.dist * (this.pinch0 / d), 1.5, 60);
      this.pinch0 = d;
      this.pan(dx * 0.5, dy * 0.5);
      return;
    }
    if (p.button === 1 || (p.button === 0 && e.shiftKey) || (p.button === 2 && e.shiftKey)) this.pan(dx, dy);
    else {
      this.yaw -= dx * 0.008;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.006, -0.2, 1.45);
    }
  };

  private up = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) this.dragging = false;
    if (p && !p.moved && p.button !== 2 && p.button !== 1 && this.pointers.size === 0) this.onTap(e.clientX, e.clientY, e);
    else if (p && !p.moved && p.button === 2) this.onTap(e.clientX, e.clientY, e);
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(e.deltaY * 0.0012), 1.5, 60);
  };

  pan(dx: number, dy: number) {
    const s = this.dist * 0.0016;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.target.addScaledVector(right, -dx * s);
    this.target.addScaledVector(fwd, -dy * s);
    this.target.y = THREE.MathUtils.clamp(this.target.y, 0, 20);
  }

  update() {
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(this.target);
  }
}
