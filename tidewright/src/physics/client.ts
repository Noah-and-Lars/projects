// Main-thread proxy for the physics worker, with snapshot interpolation.
import type { ToWorker, FromWorker, SpawnInfo, VehicleSnap } from './protocol';
import { TICK } from './sim-host';

export interface InterpSnap { prev: VehicleSnap | null; curr: VehicleSnap }

export class PhysicsClient {
  worker: Worker;
  ready: Promise<string>;
  private prev = new Map<number, VehicleSnap>();
  private curr = new Map<number, VehicleSnap>();
  private snapArrival = 0;
  private snapInterval = 1000 / 60;
  stepMs = 0;
  dilation = 1;
  onSpawned: (info: SpawnInfo) => void = () => {};
  onError: (msg: string) => void = (m) => console.error(m);

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.ready = new Promise((resolve) => {
      this.worker.onmessage = (ev: MessageEvent<FromWorker>) => {
        const m = ev.data;
        if (m.type === 'ready') resolve(m.backend);
        else if (m.type === 'spawned') this.onSpawned(m.info);
        else if (m.type === 'error') this.onError(m.message);
        else if (m.type === 'snap') {
          const now = performance.now();
          if (this.snapArrival) this.snapInterval = this.snapInterval * 0.9 + Math.min(100, now - this.snapArrival) * 0.1;
          this.snapArrival = now;
          this.stepMs = this.stepMs * 0.9 + m.stepMs * 0.1;
          this.dilation = m.dilation;
          for (const v of m.vehicles) {
            const c = this.curr.get(v.id);
            if (c) this.prev.set(v.id, c);
            this.curr.set(v.id, v);
          }
        }
      };
    });
    this.worker.onerror = (e) => this.onError(e.message);
  }

  send(m: ToWorker) { this.worker.postMessage(m); }

  /** Interpolation factor between the previous and current snapshot. */
  alpha(): number {
    const a = (performance.now() - this.snapArrival) / Math.max(this.snapInterval, TICK * 1000 * 0.5);
    return Math.max(0, Math.min(1, a));
  }

  get(id: number): InterpSnap | null {
    const curr = this.curr.get(id);
    return curr ? { prev: this.prev.get(id) ?? null, curr } : null;
  }

  forget(id: number) { this.prev.delete(id); this.curr.delete(id); }
  dispose() { this.worker.terminate(); }
}
