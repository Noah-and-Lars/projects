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
});
