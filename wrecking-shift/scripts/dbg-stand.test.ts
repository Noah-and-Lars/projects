// probe: does a standing player's eye move? LEVELS=harbor,ridge,works npx vitest run --config scripts/bench.config.ts scripts/dbg-stand.test.ts --disableConsoleIntercept
import { it } from 'vitest';
import { Sim, initPhysics } from '../src/sim/sim';
import { LEVELS } from '../src/game/levels';
import { Player } from '../src/sim/player';

it('stand', async () => {
  await initPhysics();
  for (const id of (process.env.LEVELS ?? 'harbor').split(',')) {
    const sim = new Sim(1);
    const info = LEVELS[id].build(sim);
    const p = new Player(sim, info.spawn); p.yaw = info.spawnYaw;
    const rows: string[] = [];
    let worst = 0;
    for (let k = 0; k < 16; k++) {
      const x = info.spawn.x + ((k % 4) - 1.5) * 9, z = info.spawn.z + (Math.floor(k / 4) - 1.5) * 9;
      const h = sim.raycast({ x, y: 60, z }, { x: 0, y: -1, z: 0 }, 120);
      if (!h) continue;
      p.teleport({ x, y: h.point.y + 0.1, z });
      for (let i = 0; i < 180; i++) { p.update(); sim.step(); }
      const e0 = p.eye; let r = 0;
      for (let i = 0; i < 240; i++) { p.update(); sim.step(); const e = p.eye; r = Math.max(r, Math.abs(e.x - e0.x), Math.abs(e.y - e0.y), Math.abs(e.z - e0.z)); }
      worst = Math.max(worst, r);
      rows.push(`${x.toFixed(0)},${z.toFixed(0)}:${(r * 1000).toFixed(3)}mm${p.grounded ? '' : '(air)'}`);
    }
    console.log('PROBE', id, 'worst mm', (worst * 1000).toFixed(3), rows.join(' '));
  }
});
