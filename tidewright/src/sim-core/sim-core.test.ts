import { describe, it, expect } from 'vitest';
import { ROTATIONS, rotateAbout, mulMV } from './rotations';
import { VehicleGrid, partCells, mirrorPlacement, cellKey } from './grid';
import { History, placeCmd, removeCmd, paintCmd } from './history';
import { greedyBoxes } from './greedy';
import { serialize, deserialize, migrate, FORMAT_ID, SCHEMA_VERSION, VehicleFileError, encodeFile, decodeFile } from './vehicle-format';
import { assemble } from './assembly';
import { validate } from './validator';
import { budget } from './budget';
import { runabout } from './presets';
import { buildTerrain, heightAt } from './terrain';
import { engineCurve, engineTorque, autoShift } from './drivetrain';
import { magic, suspensionForce } from './tyre';

describe('rotations', () => {
  it('has 24 unique proper rotations with identity first', () => {
    expect(ROTATIONS.length).toBe(24);
    expect(new Set(ROTATIONS.map((m) => m.join())).size).toBe(24);
    expect(ROTATIONS[0].join()).toBe('1,0,0,0,1,0,0,0,1');
  });
  it('four quarter turns return to start', () => {
    for (const ax of ['x', 'y', 'z'] as const) {
      let r = 5;
      for (let i = 0; i < 4; i++) r = rotateAbout(r, ax);
      expect(r).toBe(5);
    }
  });
  it('yaw turns -Z forward into +X', () => {
    const r = rotateAbout(0, 'y', 3);
    expect(mulMV(ROTATIONS[r], [0, 0, -1])).toEqual([1, 0, 0].map((v) => v + 0));
  });
});

describe('grid', () => {
  it('places multi-cell parts and blocks overlaps', () => {
    const g = new VehicleGrid();
    g.add(g.make('burner_s', [0, 0, 0], 0, 1));
    expect(g.cells.size).toBe(12);
    expect(g.canPlace('plate', [1, 1, 2], 0)).toBe(false);
    expect(g.canPlace('plate', [2, 0, 0], 0)).toBe(true);
    expect(g.canPlace('plate', [0, -1, 0], 0)).toBe(false); // below the floor
  });
  it('mirrors parts across the x plane', () => {
    const m = mirrorPlacement({ type: 'spring_m', pos: [-6, 0, 4], rot: 0 }, 0)!;
    expect(m.pos).toEqual([4, 0, 4]);
    const cells = partCells({ type: 'spring_m', ...m }).map((c) => c[0]);
    expect(Math.min(...cells)).toBe(4);
    expect(Math.max(...cells)).toBe(5);
    // A part straddling the plane has no separate mirror image.
    expect(mirrorPlacement({ type: 'plate', pos: [0, 0, 0], rot: 0 }, 0)).not.toBeNull();
    expect(mirrorPlacement({ type: 'burner_s', pos: [-1, 0, 0], rot: 0 }, 0)).toBeNull();
  });
  it('mirrored rotated ramp is a proper rotation with mirrored cells', () => {
    const r = rotateAbout(0, 'y', 1);
    const m = mirrorPlacement({ type: 'ramp', pos: [-3, 0, 0], rot: r }, 0)!;
    expect(m.pos).toEqual([2, 0, 0]);
    expect(m.rot).toBeGreaterThanOrEqual(0);
  });
});

describe('history', () => {
  it('undoes and redoes place, erase and paint', () => {
    const g = new VehicleGrid();
    const h = new History(g);
    const p = g.make('plate', [0, 0, 0], 0, 3);
    h.run(placeCmd([p]));
    expect(g.size).toBe(1);
    h.run(paintCmd([{ id: p.id, from: 3, to: 9 }]));
    expect(g.parts.get(p.id)!.color).toBe(9);
    h.undo();
    expect(g.parts.get(p.id)!.color).toBe(3);
    h.run(removeCmd([g.parts.get(p.id)!]));
    expect(g.size).toBe(0);
    h.undo();
    expect(g.size).toBe(1);
    h.undo();
    expect(g.size).toBe(0);
    h.redo();
    expect(g.size).toBe(1);
    expect(h.canRedo).toBe(true);
  });
});

describe('greedy boxes', () => {
  it('covers every cell exactly once with few boxes', () => {
    const keys: number[] = [];
    for (let x = 0; x < 8; x++) for (let z = 0; z < 16; z++) keys.push(cellKey(x, 0, z));
    keys.push(cellKey(0, 1, 0), cellKey(1, 1, 0));
    const boxes = greedyBoxes(keys);
    expect(boxes.length).toBe(2);
    let vol = 0;
    for (const b of boxes) vol += (b.max[0] - b.min[0] + 1) * (b.max[1] - b.min[1] + 1) * (b.max[2] - b.min[2] + 1);
    expect(vol).toBe(keys.length);
  });
});

describe('vehicle file format', () => {
  it('round-trips the starter car', () => {
    const g = runabout();
    g.parts.get([...g.parts.keys()][3])!.props.mode = 'locked';
    const f = serialize(g, 'Test car');
    const json = JSON.parse(JSON.stringify(f));
    const r = deserialize(json);
    expect(r.warnings).toEqual([]);
    expect(r.name).toBe('Test car');
    expect(r.grid.size).toBe(g.size);
    expect(r.grid.cells.size).toBe(g.cells.size);
    expect(serialize(r.grid, 'Test car').blocks).toEqual(f.blocks);
  });
  it('stores part names, not ids, and skips unknown parts with a warning', () => {
    const f = serialize(runabout(), 'x');
    f.partTable[0] = 'zz_future_part';
    const r = deserialize(f);
    expect(r.warnings.some((w) => w.includes('zz_future_part'))).toBe(true);
  });
  it('runs migrations in order and rejects newer files', () => {
    const old = { format: FORMAT_ID, schemaVersion: SCHEMA_VERSION - 1, legacy: true };
    const up = migrate(old, { [SCHEMA_VERSION - 1]: (f: any) => ({ ...f, migrated: true }) }) as any;
    expect(up.migrated).toBe(true);
    expect(up.schemaVersion).toBe(SCHEMA_VERSION);
    expect(() => migrate({ format: FORMAT_ID, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(VehicleFileError);
    expect(() => migrate({ format: 'other' })).toThrow(VehicleFileError);
  });
  it('gzip encodes and decodes', async () => {
    const f = serialize(runabout(), 'zip');
    const bytes = await encodeFile(f);
    expect(bytes[0]).toBe(0x1f);
    const back = deserialize(await decodeFile(bytes));
    expect(back.grid.size).toBe(runabout().size);
  });
});

describe('assembly, validator, budget', () => {
  const g = runabout();
  const m = assemble(g);
  it('produces a sensible car', () => {
    expect(m.mass).toBeGreaterThan(300);
    expect(m.mass).toBeLessThan(1200);
    expect(m.wheels.length).toBe(4);
    expect(m.wheels.filter((w) => w.steer === 1).length).toBe(2);
    expect(Math.abs(m.com[0])).toBeLessThan(0.15);
    expect(m.engine).not.toBeNull();
    expect(m.gears.length).toBe(5);
    expect(m.diff).toBe('open');
    expect(m.boxes.length).toBeLessThan(60);
    // springs carry the weight at half travel
    const k = m.wheels.reduce((s, w) => s + w.k * w.travel * 0.5, 0);
    expect(k).toBeCloseTo(m.mass * 9.81, 0);
  });
  it('validates clean starter and flags problems', () => {
    expect(validate(g).filter((i) => i.level === 'error')).toEqual([]);
    const g2 = g.clone();
    g2.add(g2.make('plate', [0, 20, 0], 0, 0));
    const seat = [...g2.parts.values()].find((p) => p.type === 'helm')!;
    g2.remove(seat.id);
    const codes = validate(g2).map((i) => i.code);
    expect(codes).toContain('floating');
    expect(codes).toContain('no-seat');
  });
  it('reports a budget', () => {
    const b = budget(g);
    expect(b.parts).toBe(g.size);
    expect(b.powerKw).toBeGreaterThan(30);
    expect(b.topSpeed).toBeGreaterThan(25);
  });
});

describe('terrain', () => {
  it('is deterministic with a flat yard pad above sea level and ocean around', () => {
    const a = buildTerrain({ size: 1536, res: 97, seed: 7 });
    const b = buildTerrain({ size: 1536, res: 97, seed: 7 });
    expect(a.heights).toEqual(b.heights);
    expect(heightAt(a, a.pad.x, a.pad.z)).toBeCloseTo(a.pad.y, 0);
    expect(heightAt(a, 760, 760)).toBeLessThan(-5);
    expect(Math.max(...a.heights)).toBeGreaterThan(25);
  });
});

describe('drivetrain & tyre', () => {
  const e = assemble(runabout()).engine!;
  it('engine curve peaks near peak rps and dies past red line', () => {
    const at = (rps: number) => engineCurve(e, rps * Math.PI * 2);
    expect(at(e.peakRps)).toBeCloseTo(e.peakTorque, 0);
    expect(at(e.peakRps)).toBeGreaterThan(at(e.idleRps));
    expect(at(e.maxRps * 1.07)).toBe(0);
    expect(engineTorque(e, e.idleRps * Math.PI * 2 * 0.8, 0, true)).toBeGreaterThan(0); // idle governor
  });
  it('auto box shifts up at high revs and down at low', () => {
    const gears = [10, 6, 4, 3, 2.4];
    const w = (rps: number, g: number) => (rps * Math.PI * 2) / gears[g - 1];
    expect(autoShift(e, gears, 1, w(e.maxRps * 0.95, 1), 1)).toBe(2);
    expect(autoShift(e, gears, 3, w(e.peakRps * 0.2, 3), 1)).toBe(2);
  });
  it('tyre curve rises then saturates; springs never pull', () => {
    expect(magic(0)).toBe(0);
    expect(magic(0.1)).toBeGreaterThan(magic(0.02));
    expect(Math.abs(magic(1))).toBeLessThanOrEqual(1);
    expect(suspensionForce(0, -10, 1000, 100)).toBe(0);
  });
});
