// Headless driving tests: VehicleSim on a minimal rigid-body integrator over flat ground.
import { describe, it, expect } from 'vitest';
import { assemble } from './assembly';
import { runabout } from './presets';
import { VehicleSim, NO_CONTROLS, type Controls, type BodyState } from './vehicle-sim';
import { type Vec3, type Quat, qrot, qmul, qnorm, qconj, add, scale, cross, sub } from './math';

function makeRig(groundY = 0) {
  const model = assemble(runabout());
  const sim = new VehicleSim(model);
  const lowest = Math.min(...model.wheels.map((w) => w.center[1] - w.radius));
  const b = { pos: [0, groundY - lowest + 0.05, 0] as Vec3, quat: [0, 0, 0, 1] as Quat, linvel: [0, 0, 0] as Vec3, angvel: [0, 0, 0] as Vec3 };
  const com = () => add(b.pos, qrot(b.quat, model.com));
  const ray = (o: Vec3, d: Vec3, max: number) => {
    if (d[1] >= -1e-6) return null;
    const t = (groundY - o[1]) / d[1];
    return t >= 0 && t <= max ? { dist: t, normal: [0, 1, 0] as Vec3 } : null;
  };
  const invI = model.inertia.map((v) => 1 / v) as Vec3;
  const applyAngular = (J: Vec3, r: Vec3) => {
    // world -> body, scale by inverse inertia, body -> world
    const tb = qrot(qconj(b.quat), cross(r, J));
    const dw = qrot(b.quat, [tb[0] * invI[0], tb[1] * invI[1], tb[2] * invI[2]]);
    b.angvel = add(b.angvel, dw);
  };
  const step = (ctl: Controls, dt = 1 / 120) => {
    const c = com();
    const state: BodyState = { ...b, com: c };
    for (const { point, impulse } of sim.step(dt, state, ctl, ray)) {
      b.linvel = add(b.linvel, scale(impulse, 1 / model.mass));
      applyAngular(impulse, sub(point, c));
    }
    b.linvel[1] -= 9.81 * dt;
    // integrate about the COM
    const newCom = add(c, scale(b.linvel, dt));
    const w = b.angvel;
    const dq: Quat = [w[0] * dt * 0.5, w[1] * dt * 0.5, w[2] * dt * 0.5, 0];
    const q = b.quat;
    const dqq = qmul(dq, q);
    b.quat = qnorm([q[0] + dqq[0], q[1] + dqq[1], q[2] + dqq[2], q[3] + dqq[3]]);
    b.pos = sub(newCom, qrot(b.quat, model.com));
  };
  const run = (secs: number, ctl: Controls) => { for (let i = 0; i < secs * 120; i++) step(ctl); };
  const speed = () => sim.telemetry({ ...b, com: com() }).speed;
  return { model, sim, b, run, speed };
}

const C = (o: Partial<Controls>): Controls => ({ ...NO_CONTROLS, ...o });

describe('VehicleSim on flat ground', () => {
  it('settles on its springs without drifting or jitter', () => {
    const r = makeRig();
    for (let i = 0; i < 12; i++) { r.run(0.25, NO_CONTROLS); if (process.env.DBG) console.log(i, r.b.linvel.map(v=>v.toFixed(3)).join(), r.b.angvel.map(v=>v.toFixed(3)).join(), r.b.pos.map(v=>v.toFixed(2)).join()); }
    expect(Math.abs(r.b.linvel[1])).toBeLessThan(0.02);
    expect(Math.hypot(r.b.linvel[0], r.b.linvel[2])).toBeLessThan(0.05);
    expect(r.sim.telemetry({ ...r.b, com: [0, 0, 0] }).grounded).toBe(4);
    // body sits roughly where it was built (half travel)
    const comp = r.sim.wheels.map((w, i) => w.compression / (r.model.wheels[i].travel + r.model.wheels[i].radius));
    for (const c of comp) expect(c).toBeGreaterThan(0.1);
  });

  it('accelerates forward on throttle, shifts up and reaches road speed', () => {
    const r = makeRig();
    r.run(1, NO_CONTROLS);
    r.run(4, C({ throttle: 1 }));
    expect(r.speed()).toBeGreaterThan(12);
    expect(r.b.pos[2]).toBeLessThan(-10); // forward is -Z
    r.run(16, C({ throttle: 1 }));
    expect(r.speed()).toBeGreaterThan(28);
    expect(r.sim.gear).toBeGreaterThanOrEqual(4);
    expect(r.sim.fuel).toBeLessThan(r.model.fuel);
  });

  it('brakes to a stop, then reverses on held brake', () => {
    const r = makeRig();
    r.run(1, NO_CONTROLS);
    r.run(5, C({ throttle: 1 }));
    r.run(5, C({ brake: 1 }));
    expect(r.speed()).toBeLessThan(0.5);
    r.run(3, C({ brake: 1 }));
    expect(r.sim.gear).toBe(-1);
    expect(r.speed()).toBeLessThan(-1);
  });

  it('steers right with positive steer input and stays upright', () => {
    const r = makeRig();
    r.run(1, NO_CONTROLS);
    r.run(3, C({ throttle: 0.7 }));
    const x0 = r.b.pos[0];
    r.run(3, C({ throttle: 0.5, steer: 1 }));
    expect(r.b.pos[0]).toBeGreaterThan(x0 + 2);
    const up = qrot(r.b.quat, [0, 1, 0]);
    expect(up[1]).toBeGreaterThan(0.8);
  });

  it('holds still on the handbrake', () => {
    const r = makeRig();
    r.run(2, C({ handbrake: true }));
    expect(Math.abs(r.speed())).toBeLessThan(0.05);
  });
});
