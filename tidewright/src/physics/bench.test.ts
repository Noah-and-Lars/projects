// Benchmark (opt-in: BENCH=1 npx vitest run src/physics/bench.test.ts): 20 starter cars on the island.
import { it, expect } from 'vitest';
import { SimHost } from './sim-host';
import { RapierBackend } from './rapier-backend';
import { serialize } from '../sim-core/vehicle-format';
import { runabout } from '../sim-core/presets';
import { NO_CONTROLS } from '../sim-core/vehicle-sim';
import { DEFAULT_TERRAIN } from '../sim-core/terrain';

it.skipIf(!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BENCH)('20 raycast-wheel cars at 60 Hz', async () => {
  const host = new SimHost(new RapierBackend());
  await host.init(DEFAULT_TERRAIN);
  const file = serialize(runabout(), 'bench');
  for (let i = 0; i < 20; i++) host.spawn(i + 1, file, { x: (i % 5) * 9 - 18, z: 300 + Math.floor(i / 5) * 9, yaw: 0 });
  for (let i = 0; i < 20; i++) host.setControls(i + 1, { ...NO_CONTROLS, throttle: 0.6, steer: (i % 3) - 1 });
  for (let i = 0; i < 60; i++) host.tick();
  const t: number[] = [];
  for (let i = 0; i < 600; i++) { const s = performance.now(); host.tick(); t.push(performance.now() - s); }
  t.sort((a, b) => a - b);
  const r = { cars: 20, colliders: host.backend.colliderCount(), tickMs: { median: +t[300].toFixed(3), p95: +t[570].toFixed(3), max: +t[599].toFixed(3) } };
  console.log(JSON.stringify(r));
  expect(r.tickMs.median).toBeLessThan(8);
}, 60000);
