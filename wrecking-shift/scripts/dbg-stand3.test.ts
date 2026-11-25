// broad sweep: eye drift of a standing player on many spots per map (standing and crouched)
import { it } from 'vitest';
import { Sim, initPhysics } from '../src/sim/sim';
import { LEVELS } from '../src/game/levels';
import { Player } from '../src/sim/player';
it('sweep', async () => {
  await initPhysics();
  for (const id of ['testyard', 'harbor', 'ridge', 'works']) {
    const sim = new Sim(1); const info = LEVELS[id].build(sim);
    for (let i = 0; i < 120; i++) sim.step();
    const p = new Player(sim, info.spawn);
    const b = info.bounds; let bad = 0, tested = 0; const worst: string[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 150; k++) {
      const x = b.min.x + 2 + rnd() * (b.max.x - b.min.x - 4), z = b.min.z + 2 + rnd() * (b.max.z - b.min.z - 4);
      const h = sim.raycast({ x, y: b.max.y + 20, z }, { x: 0, y: -1, z: 0 }, 200);
      if (!h || (sim.waterLevel != null && h.point.y < sim.waterLevel)) continue;
      const crouch = k % 5 === 4;
      p.input.crouch = crouch;
      p.teleport({ x, y: h.point.y + 0.1, z });
      for (let i = 0; i < 150; i++) { p.update(); sim.step(); }
      const e0 = p.eye; let r = 0;
      for (let i = 0; i < 120; i++) { p.update(); sim.step(); const e = p.eye; r = Math.max(r, Math.abs(e.x - e0.x), Math.abs(e.y - e0.y), Math.abs(e.z - e0.z)); }
      tested++;
      if (r > 0) { bad++; if (worst.length < 8) worst.push(`${x.toFixed(1)},${z.toFixed(1)} on ${h.body.name}${crouch ? ' crouch' : ''}${p.grounded ? '' : ' air'}${p.inWater ? ' water' : ''}: ${(r * 1000).toFixed(3)}mm`); }
    }
    console.log('PROBE', id, 'tested', tested, 'moving', bad, worst.join(' | '));
  }
});
