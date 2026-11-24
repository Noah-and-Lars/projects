/**
 * Scripted playthroughs of every mission on the big maps (harbor, ridge, works).
 *
 * Each run uses only the tools a player has at that point of the career (RANKS, prerequisites from the
 * `unlockAfter` chain, see playHarness.careerScore) with base ammo. Teleporting is allowed while planning
 * (the planning phase is untimed); from the moment the alarm starts every move is real controller input
 * (walking, driving, tools) and `Run.tp` throws. Results are printed as a table at the end.
 *
 *   PLAY_LOG=1 npx vitest run tests/unit/playthrough.test.ts -t paper   (verbose log of one run)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../../src/sim/sim';
import { Run, careerScore, v3 } from './playHarness';

beforeAll(async () => { await initPhysics(); });

const results: { id: string; score: number; left: number | null; time: number; tools: string; career: number }[] = [];
afterAll(() => {
  if (!results.length) return;
  console.log('\nmission            career  tools                              left    score  time');
  for (const r of results) console.log(`${r.id.padEnd(18)} ${String(r.career).padStart(6)}  ${r.tools.padEnd(34)} ${String(r.left ?? '-').padStart(6)} ${String(r.score).padStart(7)} ${r.time.toFixed(1).padStart(5)}`);
});

function finish(r: Run, expectLeft: [number, number] | null = [8, 25]) {
  r.log(r.summary());
  expect(r.mission.phase, r.mission.failReason || 'mission did not end').toBe('success');
  const res = r.mission.result!;
  results.push({ id: r.def.id, score: res.score, left: res.timeLeft, time: res.time, tools: [...r.used].join(','), career: r.score });
  for (const t of r.used) expect(r.unlocked(t), `${t} unlocked at career ${r.score}`).toBe(true);
  if (expectLeft && res.timeLeft != null) {
    expect(res.timeLeft).toBeGreaterThan(expectLeft[0]);
    expect(res.timeLeft).toBeLessThan(expectLeft[1]);
  }
  return res;
}

const T = 240000;

describe('Gullwick Harbour playthroughs', () => {
  it('paper-trail: log + valuables while planning, idol (alarm) -> server -> van on foot', () => {
    const r = new Run('paper-trail');
    expect(careerScore('paper-trail')).toBeGreaterThanOrEqual(0);
    const [log] = r.tagged('target:log'), [idol] = r.tagged('target:idol'), [server] = r.tagged('target:server');
    // planning: the unalarmed log in the cottage, then the mezzanine
    r.tp(v3(log.center().x, 1.9, log.center().z + 1.3));
    r.take(log);
    r.tp(v3(-38.5, 4.4, 20.6));
    r.take(idol);
    expect(r.phase).toBe('alarm');
    // mezzanine -> office door -> stairs -> warehouse door -> office
    r.walk([v3(-36.5, 4.4, 20.8), v3(-35.3, 4.3, 20.8), v3(-31.0, 1.5, 20.8), v3(-31, 1.5, 15), v3(-37, 1.5, 11), v3(-37, 1.5, 8), v3(-20, 1.4, 2), v3(8, 1.4, -3), v3(12, 1.5, -3), v3(15, 1.5, -3.7), v3(17, 1.5, -3.7), v3(21.3, 1.5, -6.6), v3(21.3, 4.3, -1.2), v3(17.5, 4.5, -1.8), v3(15.5, 4.5, -1.8), v3(14.5, 4.5, -3.4)]);
    r.take(server);
    r.walk([v3(15.5, 4.5, -1.8), v3(17.5, 4.5, -1.8), v3(21.3, 4.5, -1.0), v3(21.3, 1.5, -6.6), v3(17, 1.5, -3.7), v3(15, 1.5, -3.7), v3(12, 1.5, -3), v3(8, 1.4, -3), v3(2, 1.5, -20), v3(0, 2, -50), r.mission.escapePos()], { r: 2.5 });
    r.clockOut();
    finish(r);
  }, T);

  it('lights-out: sledge the timber shoring at the foot of the lighthouse, walk back to the van', () => {
    const r = new Run('lights-out');
    const c = v3(-52, 3.2, 31);
    r.select('sledge');
    r.tp(v3(c.x, 3.3, c.z - 3.1));
    for (let deg = 0; deg < 360 && !r.mission.objectives()[0].done; deg += 18) {
      const a = (deg * Math.PI) / 180;
      r.walk(v3(c.x + Math.sin(a) * 3.1, 3.3, c.z - Math.cos(a) * 3.1), { r: 0.3, sprint: false });
      for (const h of [3.75, 4.35]) {
        r.aim(v3(c.x + Math.sin(a) * 2.0, h, c.z - Math.cos(a) * 2.0));
        r.hold(26);
      }
    }
    r.wait(4);
    expect(r.mission.objectives()[0].done).toBe(true);
    expect(r.player.dead).toBe(false);
    // no alarm on this job: walk back
    r.walk([v3(-44, 1.6, 25.5), v3(-20, 1.5, 25.5), v3(-15, 1.5, 5), v3(0, 1.5, 0), v3(0, 2, -50), r.mission.escapePos()], { r: 2.5 });
    r.clockOut();
    finish(r, null);
  }, T);

  it('dead-weight: pump-house box while planning, then the two alarmed boxes into the harbour, van', () => {
    const r = new Run('dead-weight');
    const box = (n: string) => r.bodies((b) => b.name === n)[0];
    // planning: the unalarmed box C out of the pump house, through the depot gate, off the quay
    const C = box('Strongbox C');
    r.tp(v3(43.2, 1.5, -20.0));
    r.grab(C);
    r.carry([v3(41.5, 1.5, -20.0), v3(37.0, 1.5, -20.0), v3(37.0, 1.5, -15.5), v3(42, 1.5, -12), v3(42, 1.5, 32.6)], v3(42, 2.5, 40));
    r.wait(3);
    r.log('box C at', C.removed ? 'gone' : C.center());
    expect(r.phase).toBe('planning');
    expect(r.mission.objectives()[1].done).toBe(true);
    // box A in the warehouse -> alarm; out the side door, off the quay
    const A = box('Strongbox A');
    // (out the wide front door: the 1 m side door is too narrow to thread a held box through reliably)
    r.tp(v3(A.center().x, 1.5, A.center().z + 1.9));
    r.grab(A);
    r.carry([v3(-27.0, 1.5, 12.5), v3(-28, 1.5, 7.5), v3(-21, 1.5, 6), v3(-20.5, 1.5, 32.6)], v3(-20.5, 2.5, 40));
    expect(r.phase).toBe('alarm');
    // box B in the container yard
    const B = box('Strongbox B');
    r.walk([v3(18.7, 1.5, 28), v3(18.7, 1.5, 21.5), v3(B.center().x - 1.3, 1.5, B.center().z)]);
    r.grab(B);
    r.carry([v3(18.7, 1.5, 21.5), v3(18.7, 1.5, 28), v3(18.7, 1.5, 32.6)], v3(18.7, 2.5, 40));
    r.step(240, () => r.mission.escapeOpen);
    r.log('A', A.removed ? '-' : A.center(), 'B', B.removed ? '-' : B.center());
    expect(r.mission.escapeOpen).toBe(true);
    r.walk([v3(10, 1.5, 26), v3(2, 1.5, 6), v3(0, 1.5, -20), v3(0, 2, -50), r.mission.escapePos()], { r: 2.5 });
    r.clockOut();
    finish(r);
  }, T);
});
