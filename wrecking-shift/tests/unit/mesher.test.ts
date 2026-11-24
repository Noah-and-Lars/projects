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
    expect(ms).toBeLessThan(40); // worst-case noisy chunk
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
  it('inflate grows quads in-plane only', () => {
    const g = new VoxelGrid(8, 8, 8);
    g.fill(2, 2, 2, 6, 6, 6, pal(MAT.brick, 2));
    const m = meshChunk(g, 0, 0, 0, { bakeAO: false, inflate: 0.01 })!;
    expect(m.quads).toBe(6);
    for (let q = 0; q < 6; q++) {
      const d = [0, 1, 2].find((k) => m.normals[q * 12 + k] !== 0)!;
      for (let c = 0; c < 4; c++) for (let k = 0; k < 3; k++) {
        const v = m.positions[q * 12 + c * 3 + k];
        if (k === d) expect(Math.min(Math.abs(v - 0.2), Math.abs(v - 0.6))).toBeLessThan(1e-6);
        else expect(Math.min(Math.abs(v - 0.199), Math.abs(v - 0.601))).toBeLessThan(1e-6);
      }
    }
  });
  it('glass gets its own index list and opaque faces behind glass are kept', () => {
    const g = new VoxelGrid(8, 8, 8);
    g.fill(0, 0, 0, 8, 8, 2, pal(MAT.brick, 2));
    g.fill(0, 0, 2, 8, 8, 3, pal(MAT.glass, 2));
    const m = meshChunk(g, 0, 0, 0, { bakeAO: false })!;
    // brick: 6 faces (the +z one is visible through the glass); glass: 5 faces (not the one against the brick)
    expect(m.quads).toBe(11); expect(m.glassQuads).toBe(5);
    expect(m.indices.length).toBe(36); expect(m.glassIndices.length).toBe(30);
    for (const i of m.glassIndices) expect(m.aux[i * 2 + 1]).toBe(255);
    for (const i of m.indices) expect(m.aux[i * 2 + 1]).toBe(0);
  });
});
