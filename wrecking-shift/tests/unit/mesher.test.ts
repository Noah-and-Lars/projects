import { describe, expect, it } from 'vitest';
import { MAT, pal } from '../../src/sim/materials';
import { meshChunk } from '../../src/sim/mesher';
import { VoxelGrid } from '../../src/sim/voxels';

describe('mesher', () => {
  it('a solid box becomes 6 quads', () => {
    const g = new VoxelGrid(16, 8, 12);
    g.fill(0, 0, 0, 16, 8, 12, pal(MAT.concrete));
    const m = meshChunk(g, 0, 0, 0)!;
    expect(m.quads).toBe(6);
    // area check
    let area = 0;
    for (let q = 0; q < m.quads; q++) {
      const p = m.positions.subarray(q * 12, q * 12 + 12);
      const ux = p[3] - p[0], uy = p[4] - p[1], uz = p[5] - p[2];
      const vx = p[6] - p[0], vy = p[7] - p[1], vz = p[8] - p[2];
      area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    }
    expect(area).toBeCloseTo(2 * (1.6 * 0.8 + 1.6 * 1.2 + 0.8 * 1.2), 4);
  });
  it('triangles face outward', () => {
    const g = new VoxelGrid(4, 4, 4);
    g.fill(1, 1, 1, 3, 3, 3, pal(MAT.wood));
    const m = meshChunk(g, 0, 0, 0)!;
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = m.indices[t] * 3, b = m.indices[t + 1] * 3, c = m.indices[t + 2] * 3;
      const P = m.positions;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const dot = nx * m.normals[a] + ny * m.normals[a + 1] + nz * m.normals[a + 2];
      expect(dot).toBeGreaterThan(0);
    }
  });
  it('is fast enough', () => {
    const g = new VoxelGrid(64, 64, 64);
    g.fill(0, 0, 0, 64, 64, 64, (x, y, z) => ((x * 7 + y * 13 + z * 5) % 11 < 7 ? pal(MAT.brick, (x + y) % 5) : 0));
    for (let i = 0; i < 8; i++) meshChunk(g, i & 1, (i >> 1) & 1, i >> 2); // warm up
    // best of 5 (the machine may be busy with other work)
    let quads = 0, ms = Infinity;
    for (let r = 0; r < 5; r++) {
      const t = performance.now();
      quads = 0;
      for (let i = 0; i < 8; i++) quads += meshChunk(g, i & 1, (i >> 1) & 1, i >> 2)!.quads;
      ms = Math.min(ms, (performance.now() - t) / 8);
    }
    expect(quads).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(150); // worst-case noisy chunk (~480k quads in 8 chunks); generous: CI machines are shared
  });
});

describe('mesher options', () => {
  it('without baked AO faces merge on palette only (fewer quads) and alpha is 255', () => {
    const g = new VoxelGrid(32, 32, 32);
    g.fill(0, 0, 0, 32, 4, 32, pal(MAT.concrete));
    g.fill(10, 4, 10, 14, 20, 14, pal(MAT.concrete)); // pillar -> AO gradients on the floor around it
    const a = meshChunk(g, 0, 0, 0)!;
    const b = meshChunk(g, 0, 0, 0, { bakeAO: false })!;
    expect(b.quads).toBeLessThan(a.quads);
    for (let i = 3; i < b.colors.length; i += 4) expect(b.colors[i]).toBe(255);
    let dark = 0;
    for (let i = 3; i < a.colors.length; i += 4) if (a.colors[i] < 255) dark++;
    expect(dark).toBeGreaterThan(0);
    // same surface area either way
    const area = (m: typeof a) => {
      let s = 0;
      for (let q = 0; q < m.quads; q++) {
        const p = m.positions.subarray(q * 12, q * 12 + 12);
        s += Math.hypot(p[3] - p[0], p[4] - p[1], p[5] - p[2]) * Math.hypot(p[6] - p[0], p[7] - p[1], p[8] - p[2]);
      }
      return s;
    };
    expect(area(b)).toBeCloseTo(area(a), 3);
  });
  it('inflate grows quads in-plane, only where the surface continues past the edge', () => {
    // an isolated cube has only convex edges: nothing is inflated (no fins poking out of neighbouring surfaces)
    const g = new VoxelGrid(8, 8, 8);
    g.fill(2, 2, 2, 6, 6, 6, pal(MAT.brick, 2));
    const m = meshChunk(g, 0, 0, 0, { bakeAO: false, inflate: 0.01 })!;
    expect(m.quads).toBe(6);
    for (const v of m.positions) expect(Math.min(Math.abs(v - 0.2), Math.abs(v - 0.6))).toBeLessThan(1e-6);
    // a slab made of two materials filling the grid: the shared edge overlaps, top faces also grow past the grid
    // boundary (neighbouring ground tiles), side faces do not
    const s = new VoxelGrid(8, 4, 8);
    s.fill(0, 0, 0, 4, 4, 8, pal(MAT.brick, 2));
    s.fill(4, 0, 0, 8, 4, 8, pal(MAT.concrete, 2));
    const sm = meshChunk(s, 0, 0, 0, { bakeAO: false, inflate: 0.01 })!;
    expect(sm.quads).toBe(10);
    // corner codes: bits 0/1 = +u/+v corner, bits 2/3 = surface continues past that edge
    for (let q = 0; q < sm.quads; q++) {
      const d = [0, 1, 2].find((k) => sm.normals[q * 12 + k] !== 0)!;
      const u = (d + 1) % 3, v = (d + 2) % 3;
      const us = [0, 1, 2, 3].map((c) => sm.positions[q * 12 + c * 3 + u]), vs = [0, 1, 2, 3].map((c) => sm.positions[q * 12 + c * 3 + v]);
      for (let c = 0; c < 4; c++) {
        const code = sm.aux[q * 12 + c * 3 + 2];
        expect(!!(code & 1)).toBe(us[c] > (Math.min(...us) + Math.max(...us)) / 2);
        expect(!!(code & 2)).toBe(vs[c] > (Math.min(...vs) + Math.max(...vs)) / 2);
        if (d !== 1) { // side faces: only the edge shared by the two materials (x = 0.4) continues
          const xAxisIsU = u === 0;
          const x = sm.positions[q * 12 + c * 3];
          const onSeam = Math.abs(x - 0.4) < 0.01;
          if (d === 2) { expect(!!(code & (xAxisIsU ? 4 : 8))).toBe(onSeam); expect(code & (xAxisIsU ? 8 : 4)).toBe(0); }
          else expect(code & 12).toBe(0);
        } else expect(code & 12).toBe(12);
      }
    }
    const near = (v: number, list: number[]) => Math.min(...list.map((t) => Math.abs(v - t))) < 1e-6;
    for (let q = 0; q < sm.quads; q++) {
      const d = [0, 1, 2].find((k) => sm.normals[q * 12 + k] !== 0)!;
      const xs = [0, 1, 2, 3].map((c) => sm.positions[q * 12 + c * 3]);
      const ys = [0, 1, 2, 3].map((c) => sm.positions[q * 12 + c * 3 + 1]);
      const zs = [0, 1, 2, 3].map((c) => sm.positions[q * 12 + c * 3 + 2]);
      if (d === 1) { // top / bottom
        for (const y of ys) expect(near(y, [0, 0.4])).toBe(true);
        for (const x of xs) expect(near(x, [-0.001, 0.399, 0.401, 0.801])).toBe(true);
        for (const z of zs) expect(near(z, [-0.001, 0.801])).toBe(true);
      } else {
        for (const y of ys) expect(near(y, [0, 0.4])).toBe(true); // never above the top surface
        if (d === 2) { for (const x of xs) expect(near(x, [0, 0.399, 0.401, 0.8])).toBe(true); for (const z of zs) expect(near(z, [0, 0.8])).toBe(true); }
        else { for (const z of zs) expect(near(z, [0, 0.8])).toBe(true); for (const x of xs) expect(near(x, [0, 0.8])).toBe(true); }
      }
    }
  });
  it('skips empty chunks and handles hollow / solid ones', () => {
    const g = new VoxelGrid(96, 96, 96);
    g.fill(0, 0, 0, 96, 96, 96, pal(MAT.rock, 2));
    expect(meshChunk(g, 1, 1, 1)).toBeNull();          // buried: no faces
    expect(meshChunk(g, 0, 1, 1)!.quads).toBe(1);      // one outer face
    expect(meshChunk(g, 0, 0, 0)!.quads).toBe(3);
    g.fill(40, 40, 40, 56, 56, 56, 0);                 // cavity inside the middle chunk
    expect(meshChunk(g, 1, 1, 1, { bakeAO: false })!.quads).toBe(6);
    const e = new VoxelGrid(64, 64, 64);
    e.set(40, 40, 40, pal(MAT.wood));
    expect(meshChunk(e, 0, 0, 0)).toBeNull();
    expect(meshChunk(e, 1, 1, 1)!.quads).toBe(6);
    // a voxel just across the chunk border hides the face it touches
    e.set(31, 5, 5, pal(MAT.wood)); e.set(32, 5, 5, pal(MAT.wood));
    expect(meshChunk(e, 0, 0, 0)!.quads).toBe(5);
  });
  it('glass gets its own index list and opaque faces behind glass are kept', () => {
    const g = new VoxelGrid(8, 8, 8);
    g.fill(0, 0, 0, 8, 8, 2, pal(MAT.brick, 2));
    g.fill(0, 0, 2, 8, 8, 3, pal(MAT.glass, 2));
    const m = meshChunk(g, 0, 0, 0, { bakeAO: false })!;
    // brick: 6 faces (the +z one is visible through the glass); glass: 5 faces (not the one against the brick)
    expect(m.quads).toBe(11); expect(m.glassQuads).toBe(5);
    expect(m.indices.length).toBe(36); expect(m.glassIndices.length).toBe(30);
    for (const i of m.glassIndices) expect(m.aux[i * 3 + 1]).toBe(255);
    for (const i of m.indices) expect(m.aux[i * 3 + 1]).toBe(0);
  });
});
