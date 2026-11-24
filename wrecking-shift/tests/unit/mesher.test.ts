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
    const t = performance.now();
    let quads = 0;
    for (let i = 0; i < 8; i++) quads += meshChunk(g, i & 1, (i >> 1) & 1, i >> 2)!.quads;
    const ms = (performance.now() - t) / 8;
    expect(quads).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(40); // worst-case noisy chunk
  });
});
