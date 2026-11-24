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
import { Run, careerScore, hdist, roundV, v3 } from './playHarness';

beforeAll(async () => { await initPhysics(); });

const results: { id: string; score: number; left: number | null; time: number; tools: string; career: number }[] = [];
afterAll(() => {
  if (!results.length) return;
  console.log('\nmission            career  tools                              left    score  time');
  for (const r of results) console.log(`${r.id.padEnd(18)} ${String(r.career).padStart(6)}  ${r.tools.padEnd(34)} ${String(r.left ?? '-').padStart(6)} ${String(r.score).padStart(7)} ${r.time.toFixed(1).padStart(5)}`);
});

function finish(r: Run, expectLeft: [number, number] | null = [8, 25]) {
  r.log(r.summary());
  if (r.mission.phase !== 'success') console.log('NOT DONE: player', roundV(r.player.pos), 'seated', r.player.seated, 'escape', roundV(r.mission.escapePos()), 'escapeOpen', r.mission.escapeOpen, JSON.stringify(r.mission.objectives().map((o) => [o.id, o.done])));
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
    if (process.env.PLAY_LOG) {
      const tw = r.tagged('destroy:tower')[0];
      const out: string[] = [];
      for (let y = 20; y < 45; y++) { let n = 0; for (let z = 0; z < tw.grid.sz; z++) for (let x = 0; x < tw.grid.sx; x++) if (tw.grid.get(x, y, z)) n++; out.push(`${y}:${n}`); }
      console.log('tower layers', out.join(' '));
      for (const ly of [26, 32]) { const rows: string[] = []; for (let z = 0; z < tw.grid.sz; z += 1) { let row = ''; for (let x = 0; x < tw.grid.sx; x++) row += tw.grid.get(x, ly, z) ? '#' : '.'; rows.push(row); } console.log('layer', ly + '\n' + rows.join('\n')); }
    }
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
  it('depot-clearance: bombs on the pump house while planning, pistol into the full tank, run to the van', () => {
    const r = new Run('depot-clearance');
    r.select('bomb');
    // pump house: x 39..44, z -22..-18, door on the west side
    for (const [x, z, nx, nz] of [[39, -21.5, -1, 0], [39, -18.5, -1, 0], [41.5, -18, 0, 1], [43.9, -19, 1, 0], [43.9, -21, 1, 0], [41.5, -22, 0, -1]]) {
      r.tp(v3(x + nx * 1.4, 1.5, z + nz * 1.4));
      r.aim(v3(x, 2.0, z));
      r.click();
      r.tp(v3(x + nx * 7, 1.5, z + nz * 7));
      r.wait(2.5);
    }
    expect(r.phase).toBe('planning');
    expect(r.mission.objectives()[1].done).toBe(true);
    // the tank sensor starts the clock: two rounds through the shell into the fuel
    r.select('pistol');
    r.tp(v3(40, 1.5, -28.5));
    for (let i = 0; i < 3 && r.planning; i++) { r.aim(v3(31, 3.2, -27)); r.click(); }
    for (let i = 0; i < 3; i++) { r.aim(v3(31, 3.2, -27)); r.click(); r.wait(0.2); }
    expect(r.phase).toBe('alarm');
    r.walk([v3(37.5, 1.5, -24), v3(37.5, 1.5, -15.5), v3(42, 1.5, -12.5), v3(30, 1.5, -11), v3(4, 1.5, -11), v3(2, 1.5, -25), v3(0, 2, -50), r.mission.escapePos()], { r: 2.5 });
    r.clockOut();
    finish(r);
  }, T);
  it('night-watch: case in the warehouse while planning, pier and quay cases under the watchers, van', () => {
    const r = new Run('night-watch');
    const cases = r.tagged('target:case').sort((a, b) => a.center().x - b.center().x);
    const [w, pier, quay] = [cases[0], cases[1], cases[2]];
    r.tp(v3(w.center().x, 1.5, w.center().z - 1.3));
    r.take(w);
    r.walk([v3(-25, 1.5, 19), v3(-20.5, 1.5, 19), v3(-10, 1.5, 29), v3(0, 1.5, 31), v3(0, 1.5, pier.center().z - 1.3)]);
    r.take(pier);
    r.walk([v3(0, 1.5, 31), v3(10, 1.5, 28.5), v3(quay.center().x - 1.3, 1.5, quay.center().z + 0.5)]);
    r.take(quay);
    r.log('hp', r.player.health.toFixed(2));
    r.walk([v3(10, 1.5, 28), v3(4, 1.5, 9), v3(2, 1.5, -20), v3(0, 2, -50), r.mission.escapePos()], { r: 2.5 });
    r.clockOut();
    finish(r);
  }, T);
});

describe('Kestrel Ridge playthroughs', () => {
  it('private-view: six pieces off the plinths (alarm on the first), out of the glass door, down the road to the van', () => {
    const r = new Run('private-view');
    const art = r.tagged('target:art').sort((a, b) => a.center().x - b.center().x);
    // west to east; stand 1.2 m south (+z) of each piece, on the gallery floor
    const floor = 6.95;
    const order = [...art];
    r.tp(v3(order[0].center().x, floor, order[0].center().z + 1.25));
    for (const a of order) {
      const c = a.center();
      r.walk(v3(c.x, floor, c.z + 1.25), { r: 0.3 });
      r.take(a);
    }
    expect(r.phase).toBe('alarm');
    r.walk([v3(-35.3, floor, 2.5), v3(-35.3, floor, 5.0), v3(-24, 6.9, 5.5), v3(-12, 6.9, 8.5), v3(-9, 6.9, 9.6), v3(25, 1.3, 19.3), v3(40, 1.3, 22), r.mission.escapePos()], { r: 2.5 });
    r.clockOut();
    finish(r);
  }, T);
  it('cellar-door: blowtorch a hatch in the vault door while planning, crawl in, hatchback down the switchback to the van', () => {
    const r = new Run('cellar-door');
    const mansion = r.bodies((b) => b.name === 'mansion')[0];
    // planning: the deed box in the study (unalarmed bonus)
    const [deed] = r.tagged('target:deed');
    r.tp(v3(deed.center().x - 1.2, 16.4, deed.center().z));
    r.take(deed);
    // planning: cut a 0.9 x 1.3 m hatch into the armoured vault door (crouched, 0.85 m from it)
    r.select('blowtorch');
    r.tp(v3(-11.9, 9.7, -39.5));
    r.player.input.crouch = true; r.step(10);
    const pts: [number, number][] = [];
    for (let y = 9.65; y <= 10.95; y += 0.1) pts.push([-39.95, y]);
    for (let z = -39.95; z <= -39.05; z += 0.1) pts.push([z, 10.95]);
    for (let y = 10.95; y >= 9.65; y -= 0.1) pts.push([-39.05, y]);
    for (let z = -39.05; z >= -39.95; z -= 0.1) pts.push([z, 9.7]);
    r.lmb = true;
    for (const [z, y] of pts) {
      for (let k = 0; k < 40; k++) {
        r.aim(v3(-12.75, y, z));
        r.tick();
        const h = r.sim.raycast(r.player.eye, r.player.forward, 1.6);
        if (!h || h.body !== mansion || h.point.x < -12.85) break;
      }
    }
    r.lmb = false; r.step(60);
    expect(r.phase).toBe('planning');
    // crawl in, take both (the idol is wired: alarm)
    r.walk([v3(-14.4, 9.7, -39.5)], { crouch: true });
    r.player.input.crouch = false; r.step(10);
    const [books] = r.tagged('target:books'), [plan] = r.tagged('target:plan');
    r.take(books, v3(-14.2, 9.7, -39.2));
    r.take(plan, v3(-14.9, 9.7, -39.3));
    expect(r.phase).toBe('alarm');
    // out through the hatch, cellar, stairs, hall, front door
    r.walk([v3(-14.2, 9.7, -39.5), v3(-11.3, 9.7, -39.5)], { crouch: true });
    r.player.input.crouch = false;
    r.walk([v3(-10.6, 9.7, -37.6), v3(-6.2, 9.7, -37.6), v3(-5.8, 9.7, -39.45), v3(-4.6, 9.7, -39.45), v3(-2, 9.7, -39.5), v3(0.25, 9.7, -39.5), v3(0.25, 13.1, -32.5), v3(-1, 13.1, -30.8), v3(-5.4, 13.1, -30.8), v3(-5.4, 13.1, -32.45), v3(-6.6, 13.1, -32.45), v3(-8.5, 13.1, -32.45), v3(-8.5, 13.1, -27), v3(-8.5, 13.1, -25), v3(8.3, 13.1, -22.5)], { rMid: 0.45 });
    const car = r.vehicle('hatchback', r.player.pos);
    r.enter(car);
    const st = r.drive([v3(11, 13, -24.5), v3(17, 13, -25.5), v3(23, 13, -23.5), v3(24.5, 13, -20), v3(21.5, 13, -16.5), v3(14, 11.5, -13.6), v3(4, 10, -8.7),
      v3(-12, 6.8, -3), v3(-17, 6.8, -1.5), v3(-19.5, 6.8, 1.5), v3(-19, 6.8, 5.5), v3(-15.5, 6.8, 9), v3(-10, 6.8, 9), v3(10, 4, 15), v3(25, 1.2, 19.2), v3(31, 1.2, 21), v3(40, 1.2, 22.4), v3(46.3, 1.2, 22.9)], { max: 60 * 60, r: 1.2 });
    r.log('drive', st);
    r.step(30);
    finish(r);
  }, T);
  it('tower-down: bombs round the timber lookout of the watchtower, then back to the van', () => {
    const r = new Run('tower-down');
    const c = v3(-46, 20, -46);
    const H = 23.0; // timber starts 2 m above the floor (22.1); the job wants nothing above 24
    r.select('bomb');
    // the four wall centres (the north one beside the arrow slit) and two corners, 1.4 m out, aimed at the wall
    const spots: [number, number, number, number][] = [[-46, -43.5, 0, 1], [-45.2, -48.5, 0, -1], [-43.5, -46, 1, 0], [-48.5, -46, -1, 0], [-43.5, -43.5, 1, 1], [-48.5, -48.5, -1, -1]];
    for (const [x, z, nx, nz] of spots) {
      const d = nx && nz ? 1.1 : 1.4;
      r.tp(v3(x + nx * d, 20.1, z + nz * d));
      r.aim(v3(x - nx * 0.05, H, z - nz * 0.05));
      r.click();
      r.tp(v3(c.x + 9, 20.1, c.z + 9));
      r.wait(4);
      r.log('bomb', r.mission.objectives()[0].detail, 'hp', r.player.health.toFixed(2));
    }
    // sledge the two corners that are left (north-east, south-west)
    r.select('sledge');
    for (const [x, z, nx, nz] of [[-43.5, -48.5, 1, -1], [-48.5, -43.5, -1, 1]] as const) {
      if (r.mission.objectives()[0].done) break;
      r.tp(v3(x + nx * 0.9, 20.1, z + nz * 0.9));
      for (const [ax, az] of [[0, 0], [-nx * 0.6, 0], [0, -nz * 0.6], [-nx * 1.1, 0], [0, -nz * 1.1]]) {
        for (const h of [H - 0.15, H + 0.25]) {
          r.aim(v3(x + ax, h, z + az));
          r.hold(26);
        }
      }
      r.log('sledge', r.mission.objectives()[0].detail);
    }
    r.wait(4);
    if (process.env.PLAY_LOG) {
      const tw = r.tagged('destroy:tower')[0];
      const out: string[] = [];
      for (let y = 20; y < 45; y++) { let n = 0; for (let z = 0; z < tw.grid.sz; z++) for (let x = 0; x < tw.grid.sx; x++) if (tw.grid.get(x, y, z)) n++; out.push(`${y}:${n}`); }
      console.log('tower layers', out.join(' '));
      for (const ly of [26, 32]) { const rows: string[] = []; for (let z = 0; z < tw.grid.sz; z += 1) { let row = ''; for (let x = 0; x < tw.grid.sx; x++) row += tw.grid.get(x, ly, z) ? '#' : '.'; rows.push(row); } console.log('layer', ly + '\n' + rows.join('\n')); }
    }
    expect(r.mission.objectives()[0].done).toBe(true);
    expect(r.player.dead).toBe(false);
    // no alarm on this job: back to the van
    r.tp(v3(r.mission.escapePos().x - 1.8, 1.3, r.mission.escapePos().z - 1.6));
    r.clockOut();
    finish(r, null);
  }, T);
});

describe('Brackwater Works playthroughs', () => {
  it('long-drop: bombs round the chimney shaft just above the plinth, back to the van', () => {
    const r = new Run('long-drop');
    const top = () => r.mission.objectives()[0];
    const chim = r.tagged('destroy:chimney')[0];
    const c = v3(10, 1.7, -27);
    const H = 5.1; // on the round shaft, 0.7 m above the square plinth
    r.select('bomb');
    const N = 6;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2 + 0.3;
      const ca = Math.cos(a), sa = Math.sin(a);
      r.tp(v3(c.x + ca * 3.4, 1.7, c.z + sa * 3.4));
      r.aim(v3(c.x + ca * 1.55, H, c.z + sa * 1.55));
      r.click();
      r.tp(v3(c.x + ca * 12, 1.7, c.z + sa * 12));
      r.wait(4);
      r.log('bomb', k, top().detail, 'chimney', chim.removed ? 'gone' : chim.grid.count, 'hp', r.player.health.toFixed(2));
    }
    r.wait(4);
    // finish the cut with the shotgun: shoot the biggest piece of brickwork left in the weakest band
    r.select('shotgun');
    for (let shot = 0; shot < 12 && !top().done && !chim.removed; shot++) {
      let bestY = 30, bestN = 1e9;
      for (let y = 30; y < 42; y++) { let n = 0; for (let z = 0; z < chim.grid.sz; z++) for (let x = 0; x < chim.grid.sx; x++) if (chim.grid.get(x, y, z)) n++; if (n < bestN) { bestN = n; bestY = y; } }
      // angle sectors of what is left in that band
      const sec = new Array(12).fill(0).map(() => ({ n: 0, x: 0, y: 0, z: 0 }));
      for (let y = bestY - 1; y <= bestY + 1; y++) for (let z = 0; z < chim.grid.sz; z++) for (let x = 0; x < chim.grid.sx; x++) {
        if (!chim.grid.get(x, y, z)) continue;
        const w = chim.toWorld({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
        const k = Math.floor(((Math.atan2(w.z - c.z, w.x - c.x) + Math.PI) / (2 * Math.PI)) * 12) % 12;
        sec[k].n++; sec[k].x += w.x; sec[k].y += w.y; sec[k].z += w.z;
      }
      const s0 = sec.reduce((a, b) => (b.n > a.n ? b : a));
      if (!s0.n) break;
      const p = v3(s0.x / s0.n, s0.y / s0.n, s0.z / s0.n);
      const dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz) || 1;
      r.tp(v3(c.x + (dx / l) * 3.6, 1.7, c.z + (dz / l) * 3.6));
      r.aim(p);
      r.click();
      r.step(50);
      r.log('shot', shot, 'band', bestY, bestN, top().detail);
    }
    r.wait(4);
    if (process.env.PLAY_LOG) {
      const out: string[] = [];
      for (let y = 26; y < 50; y++) { let n = 0; for (let z = 0; z < chim.grid.sz; z++) for (let x = 0; x < chim.grid.sx; x++) if (chim.grid.get(x, y, z)) n++; out.push(`${y}:${n}`); }
      console.log('chimney layers', out.join(' '));
    }
    expect(top().done).toBe(true);
    expect(r.player.dead).toBe(false);
    // no alarm on this job: back to the van at the gate
    const e = r.mission.escapePos();
    r.tp(v3(e.x + 1.5, 1.7, e.z + 1.8));
    r.clockOut();
    finish(r, null);
  }, T);
  it('payday: machine parts while planning, cash box (alarm), across the works to the office top floor, van', () => {
    const r = new Run('payday');
    const [parts] = r.tagged('target:parts'), [cash] = r.tagged('target:cash'), [server] = r.tagged('target:payroll');
    // planning: the unalarmed "machine parts" on the loading dock
    r.tp(v3(parts.center().x - 1.2, 2.95, parts.center().z));
    r.take(parts);
    // the cash box just inside the boiler house's south door
    r.tp(v3(22.0, 1.7, -35.0));
    r.take(cash);
    expect(r.phase).toBe('alarm');
    // office (origin -60, -15): ground floor along under lane B, lane A up to floor 1, lane B up to floor 2
    const up = [v3(-50.5, 1.7, -5.5), v3(-46.0, 1.7, -5.5), v3(-46.0, 1.7, -12.6), v3(-47.55, 1.7, -12.6), v3(-47.55, 5.1, -6.5), v3(-46.0, 5.1, -6.5), v3(-46.0, 8.5, -12.6)];
    // floor 2: stair-core door -> office 3 -> corridor -> office 1 (payroll)
    const f2 = [v3(-47.6, 8.5, -12.85), v3(-49.5, 8.5, -12.85), v3(-49.85, 8.5, -10.2), v3(-49.85, 8.5, -8.4), v3(-53, 8.5, -8.4), v3(-53, 8.5, -6.45), v3(-55, 8.5, -6.45), v3(-57.65, 8.5, -8.4), v3(-57.65, 8.5, -10.0)];
    r.walk([v3(13.5, 1.7, -31), v3(13.5, 1.7, -18), v3(12.5, 1.7, -15), v3(5, 1.7, -6), v3(-20, 1.7, 1), v3(-54.4, 1.7, 0.5), v3(-54.4, 1.7, -2.4), v3(-54.4, 1.7, -5), ...up,
      ...f2], { rMid: 0.45 });
    r.take(server);
    r.walk([...f2.slice(0, -1).reverse(), ...up.slice().reverse(), v3(-54.4, 1.7, -5), v3(-54.4, 1.7, -2.4), v3(-56.5, 1.7, 1.2)], { rMid: 0.45 });
    r.clockOut();
    finish(r);
  }, T);
  it('bund-fire: pistol into the four fuel tanks from behind the bund wall, sprint to the van at the gate', () => {
    const r = new Run('bund-fire');
    const tanksObj = () => r.mission.objectives()[0];
    r.select('pistol');
    r.tp(v3(49, 1.7, -7));
    for (const [tx, tz] of [[43, -16], [55, -16], [43, -26], [55, -26]]) {
      const aimAt = v3(tx + (49 - tx) * 0.1, 4.6, tz + 1.6);
      for (let k = 0; k < 3; k++) { r.aim(aimAt); r.click(); r.step(12); }
      r.step(40);
      r.log('tank', tx, tz, tanksObj().detail, 'hp', r.player.health.toFixed(2));
      if (tanksObj().done) break;
    }
    expect(r.phase).toBe('alarm');
    expect(tanksObj().done).toBe(true);
    r.walk([v3(40, 1.7, -4), v3(20, 1.7, 1.5), v3(-30, 1.7, 1.5), v3(-55, 1.7, 1.5), r.mission.escapePos()], { r: 2.5 });
    r.clockOut();
    finish(r);
  }, T);
});

