/**
 * Kestrel Ridge road test: every vehicle drives from the spawn lot up the switchback to the mansion
 * forecourt and back down with a waypoint-following driver (tests/unit/playHarness.driveRoute).
 * Reports climb time and top speed on the grade.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { ridge } from '../../src/sim/levels/ridge';
import { spawnVehicle } from '../../src/sim/prefabs/vehicles';
import { Sim, initPhysics } from '../../src/sim/sim';
import { VehicleSystem } from '../../src/sim/vehicle';
import { driveRoute, roundV, v3 } from './playHarness';

beforeAll(async () => { await initPhysics(); });

/** road centre line (ridge.ts addRoad), lot -> forecourt */
export const RIDGE_UP = [v3(40, 1.2, 22), v3(31, 1.2, 21), v3(25, 1.2, 19.2), v3(10, 4, 15), v3(-10, 6.8, 9), v3(-15.5, 6.8, 9), v3(-19, 6.8, 5.5), v3(-19.5, 6.8, 1.5), v3(-17, 6.8, -1.5), v3(-12, 6.8, -3), v3(4, 10, -8.7), v3(20, 12.5, -15.4), v3(25.5, 13, -19.5), v3(22, 13, -24), v3(12, 13, -23.5)];
/** turning round on the forecourt: back up east, then forward left onto the road */
export const RIDGE_BACK = [v3(27, 13, -25)];
export const RIDGE_DOWN = [v3(22, 13, -23), v3(20.2, 13, -19.5), v3(19, 12.5, -15.6), v3(14, 11.5, -13.6), v3(4, 10, -8.7), v3(-12, 6.8, -3), v3(-17, 6.8, -1.5), v3(-19.5, 6.8, 1.5), v3(-19, 6.8, 5.5), v3(-15.5, 6.8, 9), v3(-10, 6.8, 9), v3(10, 4, 15), v3(25, 1.2, 19.2), v3(31, 1.2, 21), v3(44, 1.2, 22)];

const rows: string[] = [];

describe('Kestrel Ridge roads', () => {
  for (const id of (process.env.VEH ?? 'van,hatchback,loader').split(',')) {
    it(`${id} climbs the switchback to the forecourt and comes back down`, () => {
      const sim = new Sim(1234);
      const lv = ridge.build(sim);
      VehicleSystem.of(sim).waterLevel = lv.waterLevel;
      const v = spawnVehicle(sim, id, 44, 1.2, 22, Math.PI / 2); // facing -x (west), on the lot
      for (let i = 0; i < 90; i++) sim.step();
      v.startEngine();
      v.seated = true;
      let seen = 0;
      // speed on the graded legs (15 % from the lane to T1, 16 % from the hairpin to the forecourt)
      const grade = { up: 0, down: 0, n: 0, sum: 0 };
      let phase: 'up' | 'down' = 'up';
      const tick = () => {
        sim.step();
        const c = v.com;
        const onGrade = (c.x > -8 && c.x < 23 && ((c.z > 9 && c.z < 20) || (c.z < -4 && c.z > -16)));
        if (onGrade) { grade[phase] = Math.max(grade[phase], Math.abs(v.speed)); if (phase === 'up') { grade.n++; grade.sum += Math.abs(v.speed); } }
        if (process.env.DRIVE_LOG) for (const e of sim.out.splice(seen)) {
          if (e.type === 'custom' && e.name === 'vehicle:crash') console.log('  CRASH', JSON.stringify(e.data.pos), 'force', e.data.force.toFixed(2), 'removed', e.data.removed, e.data.body?.name);
          if (e.type === 'impact' && (e as any).force > 150000 && ((e as any).a === v.body || (e as any).b === v.body)) console.log('  IMPACT', (e as any).a?.name, (e as any).b?.name, JSON.stringify((e as any).pos), (e as any).force.toFixed(0));
        }
        seen = sim.out.length;
        if (!process.env.DRIVE_LOG) sim.drainEvents(); // like Game.fixedStep
        else { sim.drainEvents(); seen = 0; }
      };
      const up = driveRoute(v, RIDGE_UP, tick, () => false, { max: 60 * 90, log: !!process.env.DRIVE_LOG });
      const atTop = roundV(v.com);
      phase = 'down';
      const back = driveRoute(v, RIDGE_BACK, tick, () => false, { reverse: true, max: 60 * 20, log: !!process.env.DRIVE_LOG });
      expect(back.stuck, `${id} could not back up on the forecourt`).toBe(false);
      const down = driveRoute(v, RIDGE_DOWN, tick, () => false, { max: 60 * 90, log: !!process.env.DRIVE_LOG });
      rows.push(`${id.padEnd(10)} up ${(up.ticks / 60).toFixed(1)} s (on the grade: top ${(grade.up * 3.6).toFixed(0)} km/h, mean ${(grade.sum / Math.max(1, grade.n) * 3.6).toFixed(0)} km/h)  turn ${(back.ticks / 60).toFixed(1)} s  down ${(down.ticks / 60).toFixed(1)} s (top on the grade ${(grade.down * 3.6).toFixed(0)} km/h)  min upright ${Math.min(up.minUp, down.minUp).toFixed(2)}  health ${v.health.toFixed(2)}`);
      console.log(rows[rows.length - 1], 'top at', JSON.stringify(atTop), 'end', JSON.stringify(roundV(v.com)));
      expect(up.stuck, `${id} stuck going up after waypoint ${up.reached} at ${JSON.stringify(atTop)}`).toBe(false);
      expect(atTop.y).toBeGreaterThan(12.5);
      expect(up.minUp).toBeGreaterThan(0.8);
      expect(down.stuck, `${id} stuck going down after waypoint ${down.reached}`).toBe(false);
      expect(down.minUp).toBeGreaterThan(0.8);
      expect(v.dead).toBe(false);
    }, 240000);
  }
});
