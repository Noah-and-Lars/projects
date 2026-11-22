// Physics worker entry: fixed-step loop with catch-up cap (time dilation instead of spiral of death).
import { RapierBackend } from './rapier-backend';
import { SimHost, TICK } from './sim-host';
import type { ToWorker, FromWorker } from './protocol';

const host = new SimHost(new RapierBackend());
const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);
let ready = false, paused = false;
let acc = 0, last = performance.now();
const MAX_CATCHUP = 4;
const queue: ToWorker[] = [];

function handle(m: ToWorker) {
  switch (m.type) {
    case 'spawn': post({ type: 'spawned', info: host.spawn(m.id, m.file, m.at) }); break;
    case 'remove': host.remove(m.id); break;
    case 'controls': host.setControls(m.id, m.controls); break;
    case 'reset': host.reset(m.id); break;
    case 'ignition': host.ignition(m.id, m.on); break;
    case 'pause': paused = m.paused; last = performance.now(); acc = 0; break;
  }
}

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  try {
    if (m.type === 'init') {
      await host.init(m.terrain);
      ready = true;
      post({ type: 'ready', backend: host.backend.name });
      for (const q of queue.splice(0)) handle(q);
      last = performance.now();
      setInterval(loop, 4);
      return;
    }
    if (!ready) { queue.push(m); return; }
    handle(m);
  } catch (e) {
    post({ type: 'error', message: String((e as Error)?.stack ?? e) });
  }
};

function loop() {
  const now = performance.now();
  acc += (now - last) / 1000;
  last = now;
  if (paused || host.vehicles.size === 0) { acc = 0; return; }
  let steps = 0;
  const t0 = performance.now();
  while (acc >= TICK && steps < MAX_CATCHUP) { host.tick(); acc -= TICK; steps++; }
  let dilation = 1;
  if (acc >= TICK) { dilation = steps / (steps + acc / TICK); acc = 0; } // drop time: the world slows down
  if (!steps) return;
  const stepMs = (performance.now() - t0) / steps;
  const vehicles = host.snapshot();
  post({ type: 'snap', t: host.time, tick: host.tickCount, stepMs, dilation, vehicles }, vehicles.map((v) => v.data.buffer));
}
