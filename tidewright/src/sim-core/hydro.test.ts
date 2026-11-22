import { describe, it, expect } from 'vitest';
import { wavesFor, displace, waterHeight, packWaves } from './waves';
import { analyseHull, plateCoefficient, staticThrust } from './hydro';
import { assemble } from './assembly';
import { skiff, runabout } from './presets';
import { VehicleGrid } from './grid';
import { validate } from './validator';
import { VehicleSim, NO_CONTROLS, type Controls, type BodyState } from './vehicle-sim';
import { type Vec3, type Quat, qrot, qmul, qnorm, qconj, add, scale, cross, sub } from './math';

describe('waves', () => {
  it('CPU height inverts the shader displacement exactly', () => {
    const w = wavesFor({ level: 1, windDir: 0.7 });
    const out = [0, 0, 0];
    for (const [x0, z0, t] of [[3, 4, 0], [-120, 55, 17.3], [400, -300, 999.9]]) {
      displace(w, x0, z0, t, out);
      expect(waterHeight(w, x0 + out[0], z0 + out[2], t)).toBeCloseTo(out[1], 3);
    }
  });
  it('rising sea state raises wave height; calm stays small', () => {
    const peak = (lvl: number) => { const w = wavesFor({ level: lvl, windDir: 0 }); let m = 0; for (let i = 0; i < 400; i++) m = Math.max(m, Math.abs(waterHeight(w, i * 1.7, i * 0.9, i * 0.37))); return m; };
    expect(peak(0)).toBeLessThan(0.3);
    expect(peak(1)).toBeGreaterThan(1.2);
    expect(packWaves(wavesFor({ level: 0.5, windDir: 0 })).length).toBe(40);
  });
});

describe('hull analysis', () => {
  it('finds sealed air inside a closed box and open-top air in a tub', () => {
    const closed = new VehicleGrid();
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++)
      if (x === 0 || x === 3 || y === 0 || y === 3 || z === 0 || z === 3) closed.add(closed.make('plate', [x, y, z], 0, 0));
    const h = analyseHull(closed);
    expect(h.sealedCells.length).toBe(8);
    expect(h.openCells.length).toBe(0);
    const tub = new VehicleGrid();
    for (let x = 0; x < 4; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 4; z++)
      if (x === 0 || x === 3 || y === 0 || z === 0 || z === 3) tub.add(tub.make('plate', [x, y, z], 0, 0));
    const t = analyseHull(tub);
    expect(t.openCells.length).toBe(8);
    expect(t.regions.length).toBe(1);
    expect(t.regions[0].rim[1]).toBeCloseTo(0.75);
  });
  it('the skiff floats with reserve; the buggy has hull volume but no screws', () => {
    const m = assemble(skiff());
    expect(m.hull.maxBuoyancy).toBeGreaterThan(m.mass * 9.81 * 2);
    expect(m.hull.points.length).toBeLessThanOrEqual(160);
    expect(m.screws.length).toBe(1);
    expect(m.rudders.length).toBe(1);
    expect(validate(skiff()).filter((i) => i.level === 'error')).toEqual([]);
    expect(assemble(runabout()).screws.length).toBe(0);
  });
  it('plate coefficient is odd and bounded; static thrust grows with power', () => {
    expect(plateCoefficient(-0.2)).toBeCloseTo(-plateCoefficient(0.2));
    expect(Math.abs(plateCoefficient(1.5))).toBeLessThan(1.3);
    expect(staticThrust(30000, 0.5)).toBeGreaterThan(staticThrust(10000, 0.5));
  });
});

// Minimal rigid-body rig in calm water (no ground).
function boatRig(level = 0) {
  const model = assemble(skiff());
  const sim = new VehicleSim(model);
  const waves = wavesFor({ level, windDir: 0 });
  const b = { pos: [0, -0.3, 0] as Vec3, quat: [0, 0, 0, 1] as Quat, linvel: [0, 0, 0] as Vec3, angvel: [0, 0, 0] as Vec3 };
  let t = 0;
  const invI = model.inertia.map((v) => 1 / v) as Vec3;
  const step = (ctl: Controls, dt = 1 / 120) => {
    const c = add(b.pos, qrot(b.quat, model.com));
    const st: BodyState = { ...b, com: c };
    for (const { point, impulse } of sim.step(dt, st, ctl, () => null, { waves, t })) {
      b.linvel = add(b.linvel, scale(impulse, 1 / model.mass));
      const tb = qrot(qconj(b.quat), cross(sub(point, c), impulse));
      b.angvel = add(b.angvel, qrot(b.quat, [tb[0] * invI[0], tb[1] * invI[1], tb[2] * invI[2]]));
    }
    b.linvel[1] -= 9.81 * dt;
    const nc = add(c, scale(b.linvel, dt));
    const w = b.angvel;
    const d = qmul([w[0] * dt * 0.5, w[1] * dt * 0.5, w[2] * dt * 0.5, 0], b.quat);
    b.quat = qnorm([b.quat[0] + d[0], b.quat[1] + d[1], b.quat[2] + d[2], b.quat[3] + d[3]]);
    b.pos = sub(nc, qrot(b.quat, model.com));
    t += dt;
  };
  const run = (secs: number, ctl: Controls) => { for (let i = 0; i < secs * 120; i++) step(ctl); };
  return { model, sim, b, run, tel: () => sim.telemetry({ ...b, com: [0, 0, 0] }) };
}
const C = (o: Partial<Controls>): Controls => ({ ...NO_CONTROLS, ...o });

describe('boat in water', () => {
  it('floats level at a sensible draft and settles', () => {
    const r = boatRig();
    r.run(8, NO_CONTROLS);
    const up = qrot(r.b.quat, [0, 1, 0]);
    expect(up[1]).toBeGreaterThan(0.97);
    expect(Math.abs(r.b.linvel[1])).toBeLessThan(0.15); // calm sea keeps a gentle swell
    expect(r.tel().submerged).toBeGreaterThan(0.05);
    expect(r.tel().submerged).toBeLessThan(0.6);
    expect(r.tel().flooded).toBe(0);
  });
  it('drives forward under the screw and reaches planing-ish speed', () => {
    const r = boatRig();
    r.run(3, NO_CONTROLS);
    r.run(15, C({ throttle: 1 }));
    expect(r.tel().speed).toBeGreaterThan(6);
    expect(r.b.pos[2]).toBeLessThan(-40);
  });
  it('turns right with the rudder', () => {
    const r = boatRig();
    r.run(3, NO_CONTROLS);
    r.run(6, C({ throttle: 1 }));
    const x0 = r.b.pos[0];
    r.run(5, C({ throttle: 1, steer: 1 }));
    expect(r.b.pos[0]).toBeGreaterThan(x0 + 3);
  });
  it('reverses on held brake', () => {
    const r = boatRig();
    r.run(3, NO_CONTROLS);
    r.run(6, C({ brake: 1 }));
    expect(r.sim.gear).toBe(-1);
    expect(r.tel().speed).toBeLessThan(-0.5);
  });
  it('rides out a storm sea state without capsizing', () => {
    const r = boatRig(1);
    r.run(3, NO_CONTROLS);
    r.run(30, C({ throttle: 0.6 }));
    const up = qrot(r.b.quat, [0, 1, 0]);
    expect(up[1]).toBeGreaterThan(0.5);
    expect(r.b.pos[1]).toBeGreaterThan(-3);
  });
});
