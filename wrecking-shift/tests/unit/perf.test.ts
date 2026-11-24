// CPU-side cost of the rendering data paths. Skipped by default; run with:  BENCH=1 npx vitest run tests/unit/perf.test.ts --disable-console-intercept
import { beforeAll, describe, it } from 'vitest';
import { MAT, pal } from '../../src/sim/materials';
import { chunkDims, meshChunk } from '../../src/sim/mesher';
import { hash3 } from '../../src/sim/rng';
import { Sim, initPhysics } from '../../src/sim/sim';
import { testYard } from '../../src/sim/levels/testyard';
import { VoxelGrid } from '../../src/sim/voxels';
import { Occupancy } from '../../src/render/occupancy';
import { OPAQUE, WorldOccupancy } from '../../src/render/worldOccupancy';

beforeAll(async () => { await initPhysics(); });
const bench = !!process.env.BENCH;
const best = (n: number, f: () => void) => { let b = Infinity; for (let i = 0; i < n; i++) { const t = performance.now(); f(); b = Math.min(b, performance.now() - t); } return b; };

/** terrain-like tile: heightfield surface (1 voxel) + 5 soil + bedrock shell, hollow below */
function terrainTile(seed: number, sy = 60): VoxelGrid {
  const g = new VoxelGrid(256, sy, 256);
  for (let z = 0; z < 256; z++) for (let x = 0; x < 256; x++) {
    const h = Math.min(sy - 1, Math.floor(30 + 12 * Math.sin((x + seed * 40) * 0.03) * Math.cos(z * 0.025) + 6 * Math.sin(x * 0.11 + z * 0.07)));
    const shade = (hash3(x >> 3, 0, z >> 3, seed) * 5) | 0;
    g.data[g.idx(x, h, z)] = pal(MAT.grass, shade);
    for (let y = Math.max(0, h - 5); y < h; y++) g.data[g.idx(x, y, z)] = pal(MAT.dirt, shade);
    if (x === 0 || z === 0 || x === 255 || z === 255) for (let y = 0; y < h - 5; y++) g.data[g.idx(x, y, z)] = pal(MAT.bedrock, 2);
    g.data[g.idx(x, 0, z)] = pal(MAT.bedrock, 2);
  }
  g.recount();
  return g;
}

describe.skipIf(!bench)('render CPU benchmarks', () => {
  it('mesher: 25 terrain tiles (256x60x256, hollow)', () => {
    const tiles = [terrainTile(1), terrainTile(2), terrainTile(3), terrainTile(4), terrainTile(5)];
    for (const [name, opts] of [['baked AO (dynamic / low tier)', { bakeAO: true, inflate: 0.01 }], ['volume mode (static, medium / high)', { bakeAO: false, inflate: 0.01 }]] as const) {
      let quads = 0, chunks = 0, nonEmpty = 0;
      const ms = best(3, () => {
        quads = 0; chunks = 0; nonEmpty = 0;
        for (const g of tiles) {
          const [nx, ny, nz] = chunkDims(g);
          for (let cz = 0; cz < nz; cz++) for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) { chunks++; const m = meshChunk(g, cx, cy, cz, opts); if (m) { nonEmpty++; quads += m.quads; } }
        }
      });
      console.log(`mesher ${name}: ${(ms / 5).toFixed(1)} ms / tile, ${(ms / chunks).toFixed(3)} ms / chunk, ${Math.round(quads / 5)} quads / tile -> 25 tiles: ${(ms * 5 / 1000).toFixed(2)} s, ${Math.round(quads * 5 / 1000)}k quads (${chunks / 5} chunks / tile, ${nonEmpty / 5} non-empty)`);
    }
    // empty and buried chunks
    const e = new VoxelGrid(256, 256, 256);
    e.fill(0, 0, 0, 256, 100, 256, pal(MAT.rock, 2));
    const ms = best(3, () => { for (let cz = 0; cz < 8; cz++) for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) meshChunk(e, cx, cy, cz, { bakeAO: false }); });
    console.log(`mesher: 512 empty / solid chunks: ${(ms / 512 * 1000).toFixed(1)} us / chunk`);
  });

  it('occupancy: testyard build + explosion update', () => {
    const sim = new Sim(1);
    const info = testYard.build(sim);
    let w!: WorldOccupancy;
    const ms = best(3, () => { w = WorldOccupancy.create(sim, info.bounds); });
    console.log(`volume testyard: ${w.occ.nx}x${w.occ.ny}x${w.occ.nz} voxels, build ${ms.toFixed(1)} ms, ${(w.occ.byteLength / 1048576).toFixed(2)} MiB (x2 with the GPU copy)`);
    for (const [size, pos] of [[1.5, { x: 1, y: 1.2, z: -8 }], [1.5, { x: 9, y: 1, z: -1.5 }], [2.5, { x: -2, y: 1.5, z: -14 }]] as const) {
      sim.explode(pos, size);
      sim.step();
      const t = performance.now();
      w.collect(sim);
      const boxes = w.pending;
      const vox = w.flush();
      console.log(`  explosion size ${size}: ${boxes} box(es), ${vox} voxels re-stamped, collect + update ${(performance.now() - t).toFixed(2)} ms`);
      for (let i = 0; i < 30; i++) { sim.step(); w.collect(sim); w.flush(); }
    }
  });

  it('occupancy: synthetic 200 x 40 x 200 m level', () => {
    // 2000 x 400 x 2000 voxels: ground tiles + 60 buildings; bit volume = 1000 x 200 x 1000 bytes
    const occ = new Occupancy(2000, 400, 2000, OPAQUE);
    console.log(`volume 200x40x200 m: ${(occ.byteLength / 1048576).toFixed(1)} MiB CPU mirror (bits ${(occ.bits.length / 1048576).toFixed(1)} + density mips ${((occ.byteLength - occ.bits.length) / 1048576).toFixed(1)}), same again on the GPU`);
    const ground = new VoxelGrid(250, 8, 250);
    ground.fill(0, 0, 0, 250, 8, 250, pal(MAT.dirt, 2));
    let id = 1;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) occ.addSource({ id: id++, data: ground.data, sx: 250, sy: 8, sz: 250, ox: i * 250, oy: 0, oz: j * 250 });
    const house = new VoxelGrid(120, 200, 120);
    house.fill(0, 0, 0, 120, 200, 120, pal(MAT.brick, 2));
    house.fill(3, 3, 3, 117, 197, 117, 0);
    for (let y = 30; y < 200; y += 30) house.fill(0, y, 0, 120, y + 2, 120, pal(MAT.concrete, 2));
    for (let i = 0; i < 60; i++) occ.addSource({ id: id++, data: house.data, sx: 120, sy: 200, sz: 120, ox: 40 + (i % 8) * 240, oy: 8, oz: 60 + Math.floor(i / 8) * 240 });
    const t = performance.now();
    occ.rebuildAll();
    console.log(`  full build (64 ground tiles + 60 hollow 12x20x12 m buildings): ${(performance.now() - t).toFixed(0)} ms`);
    const u = best(5, () => { occ.updateRegion(600, 8, 600, 630, 38, 630); });
    console.log(`  3 m edit box (30^3 voxels) update: ${u.toFixed(2)} ms`);
  });
});
