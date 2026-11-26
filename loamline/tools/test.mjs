// Headless checks (node tools/test.mjs): every course builds, and a bot with
// the strong-assist controller rides each one top to bottom. Reports crashes,
// landing grades and time per course; exits non-zero on failure.
import { Track } from '../src/js/track.js';
import { COURSES } from '../src/js/courses.js';
import { BikeSim, BIKES, emptyInput } from '../src/js/physics.js';
import { wrapAngle, clamp } from '../src/js/noise.js';

const DT = 1 / 120;
let failed = false;
const bikeArg = process.argv[2] || 'trail';

for (const course of COURSES) {
  const tr = new Track(course);
  const hs = { hint: 0 };
  const sim = new BikeSim(tr.groundFor(hs), BIKES[bikeArg]);
  const start = tr.pointAt(3, 0);
  hs.hint = start.i;
  sim.reset(start.x, 0, start.z, start.yaw, 0);
  const p = {};
  let t = 0, crashes = 0, takeoff = null, held = false;
  const grades = {};
  const log = [];
  while (t < 240) {
    tr.project(sim.pos.x, sim.pos.z, hs.hint, p);
    hs.hint = p.i;
    if (p.s >= tr.finishS) break;
    const inp = emptyInput();
    if (sim.grounded) {
      const look = clamp(Math.abs(sim.speed) * 0.55, 3, 9);
      const a = tr.pointAt(p.s + look, 0);
      const err = wrapAngle(Math.atan2(a.x - sim.pos.x, a.z - sim.pos.z) - sim.yaw);
      inp.steer = clamp(-err * 2.2, -1, 1);
      const j = tr.nextJump(p.s, 45);
      let target = 12;
      if (j && j.lipS - p.s < 40) target = j.speed;
      const f = tr.featureAt(p.s + 8);
      if (f && f.type === 'berm') target = Math.min(target, 11.5);
      const onKicker = j && p.s > j.s0 + 2 && p.s < j.lipS;
      if (sim.speed < target - 0.3 && !onKicker) inp.throttle = 1;
      else if (sim.speed > target + 0.4) inp.brake = clamp((sim.speed - target) * 0.35, 0, 1);
      // Pop at the lip.
      if (j && p.s > j.lipS - 3 && p.s < j.lipS - 0.05) { inp.jumpHeld = true; }
      inp.jumpReleased = held && !inp.jumpHeld;
      held = inp.jumpHeld;
    } else {
      // Late pop: let go just after the bike leaves the lip.
      if (held) { inp.jumpReleased = true; held = false; }
      const lp = tr.predictLanding(sim.pos, sim.vel, hs.hint);
      sim.assist.airPitch = lp ? Math.atan(lp.slope) : null;
      sim.assist.airGain = 0.85; sim.assist.straighten = 1;
    }
    { const jl = tr.nextJump(p.s - 0.6, 8); sim.nearLip = !!(jl && p.s > jl.s0 && p.s < jl.lipS + 0.5); }
    const off = Math.abs(p.d) - tr.hw;
    sim.surface.roll = off > 0.3 ? 4 : 1;
    const ev = sim.step(DT, inp);
    for (const e of ev) {
      if (e.type === 'takeoff' || e.type === 'pop') {
        if (!takeoff) { const j = tr.nextJump(p.s - 3, 6); takeoff = j && p.s > j.lipS - 3 && p.s < j.lipS + 2 ? j : null; }
      }
      if (e.type === 'land') {
        const lp = tr.project(sim.pos.x, sim.pos.z, hs.hint, {});
        let g = takeoff && e.airTime >= 0.35 ? tr.judge(takeoff, lp.s) : null;
        let crash = e.crash || (g === 'casedGap' && takeoff.pit > 0.8 ? 'pit' : null);
        if (g) grades[g] = (grades[g] || 0) + 1;
        if (crash || (g && g !== 'sweet')) log.push(`  ${takeoff ? takeoff.kind + '@' + takeoff.lipS.toFixed(0) : 'bump'} v=${takeoff ? takeoff.speed : '-'} → ${g}${crash ? ' CRASH ' + crash : ''} vn=${e.vn.toFixed(1)} pitchErr=${(e.pitchErr * 57).toFixed(0)}° air=${e.airTime.toFixed(2)}`);
        if (crash) {
          crashes++;
          const j = takeoff;
          const s0 = j ? j.s0 - 16 : lp.s - 20;
          const pt = tr.pointAt(Math.max(3, s0), 0);
          hs.hint = pt.i;
          sim.reset(pt.x, 0, pt.z, pt.yaw, j ? j.speed * 0.97 : 7);
        }
        takeoff = null;
      }
    }
    if (Math.abs(p.d) > tr.hw + 7) { crashes++; log.push(`  off track at s=${p.s.toFixed(0)}`); const pt = tr.pointAt(p.s - 10, 0); hs.hint = pt.i; sim.reset(pt.x, 0, pt.z, pt.yaw, 8); }
    t += DT;
  }
  // The bot is a simple controller, not a perfect rider: a course passes if
  // it can be finished with at most a couple of crashes.
  const ok = t < 240 && crashes <= 2;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${course.id.padEnd(7)} ${t.toFixed(1)}s  crashes ${crashes}  ${JSON.stringify(grades)}`);
  for (const l of log) console.log(l);
}
process.exit(failed ? 1 : 0);
