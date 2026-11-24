import { beforeAll, describe, expect, it } from 'vitest';
import { HARBOR_MISSIONS } from '../../src/game/missionsHarbor';
import { DroneSystem } from '../../src/sim/drones';
import { harbor } from '../../src/sim/levels/harbor';
import { MORE_MISSIONS } from '../../src/game/missionsMore';
import { LEVELS } from '../../src/game/levels';
import { Mission } from '../../src/sim/mission';
import { Player } from '../../src/sim/player';
import { Sim, initPhysics } from '../../src/sim/sim';
import { WaterSystem } from '../../src/sim/water';

beforeAll(async () => { await initPhysics(); });

describe('map missions', () => {
  for (const def of [...HARBOR_MISSIONS, ...MORE_MISSIONS]) {
    it(`${def.id}: props rest where placed and planning stays quiet`, () => {
      const sim = new Sim(1234);
      const ds = new DroneSystem(sim); sim.ext.drones = ds; sim.systems.push(ds);
      const lv = LEVELS[def.levelId].build(sim);
      sim.waterLevel = lv.waterLevel; sim.systems.push(new WaterSystem(lv.waterLevel!));
      const player = new Player(sim, lv.spawn);
      def.setup!(sim, lv);
      const items = [...sim.bodies.values()].filter((b) => [...b.tags].some((t) => t.startsWith('target:') || t.startsWith('valuable:')) && b.dynamic);
      const y0 = items.map((b) => b.rb.translation().y);
      const m = new Mission(def, { sim, level: lv, player });
      for (let i = 0; i < 300; i++) { player.update(); sim.step(); m.update({ interact: false }); }
      expect(m.phase).toBe('planning');
      for (const o of m.objectives()) if (o.need === 0 || (o as any).total === 0) console.log(def.id, 'objective has no bodies:', o.id);
      console.log(def.id, JSON.stringify(m.objectives().map((o: any) => [o.id, o.need, o.detail])), 'alarms', m.markers().filter((k: any) => k.kind === 'alarm').length);
      items.forEach((b, i) => {
        const p = b.rb.translation();
        const drop = y0[i] - p.y;
        if (drop > 0.35) console.log(def.id, b.name, 'dropped', drop.toFixed(2), 'to', p.x.toFixed(1), p.y.toFixed(2), p.z.toFixed(1));
        expect(drop).toBeLessThan(0.35);
      });
      expect([...sim.bodies.values()].filter((b) => b.kind === 'debris').length).toBe(0);
    }, 120000);
  }
});
