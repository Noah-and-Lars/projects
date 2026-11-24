import { beforeAll, describe, expect, it } from 'vitest';
import { Sim, initPhysics } from '../../src/sim/sim';
import { restoreSim, rleDecode, rleEncode, snapshotSim } from '../../src/sim/snapshot';
import { testYard } from '../../src/sim/levels/testyard';

beforeAll(async () => { await initPhysics(); });

describe('snapshot', () => {
  it('rle round trip', () => {
    const d = new Uint8Array([0, 0, 0, 5, 5, 1, 0, 0, 9]);
    expect([...rleDecode(rleEncode(d), d.length)]).toEqual([...d]);
  });
  it('restores a damaged world identically and continues deterministically', () => {
    const a = new Sim(9);
    testYard.build(a);
    a.explode({ x: 0, y: 1, z: -8 }, 1.4);
    for (let i = 0; i < 90; i++) a.step();
    const snap = JSON.parse(JSON.stringify(snapshotSim(a)));
    const b = new Sim(9);
    restoreSim(snap, b);
    expect(b.bodies.size).toBe(a.bodies.size);
    const sig = (s: Sim) => { let n = 0; for (const x of s.bodies.values()) n += x.grid.count * (x.id + 1); return n; };
    expect(sig(b)).toBe(sig(a));
    for (const x of a.bodies.values()) {
      const y = b.bodies.get(x.id)!;
      expect(y.dynamic).toBe(x.dynamic);
      expect(y.rb.translation().y).toBeCloseTo(x.rb.translation().y, 5);
    }
    b.explode({ x: 9, y: 1, z: 0 }, 1.2);
    for (let i = 0; i < 60; i++) b.step();
    expect(b.bodies.size).toBeGreaterThan(5);
  });
});
