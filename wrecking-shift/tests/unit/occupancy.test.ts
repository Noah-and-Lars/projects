import { beforeAll, describe, expect, it } from 'vitest';
import { MAT, pal } from '../../src/sim/materials';
import { Rng } from '../../src/sim/rng';
import { Sim, initPhysics } from '../../src/sim/sim';
import { VoxelGrid } from '../../src/sim/voxels';
import { Occupancy, planVolume, type OccSource } from '../../src/render/occupancy';
import { OPAQUE, WorldOccupancy } from '../../src/render/worldOccupancy';

beforeAll(async () => { await initPhysics(); });

function src(id: number, g: VoxelGrid, ox: number, oy: number, oz: number): OccSource {
  return { id, data: g.data, sx: g.sx, sy: g.sy, sz: g.sz, ox, oy, oz };
}
function randomGrid(rng: Rng, sx: number, sy: number, sz: number, fill = 0.3): VoxelGrid {
  const g = new VoxelGrid(sx, sy, sz);
  for (let i = 0; i < g.data.length; i++) g.data[i] = rng.next() < fill ? pal(rng.next() < 0.2 ? MAT.glass : MAT.brick, rng.int(5)) : 0;
  g.recount();
  return g;
}
/** brute-force reference of the whole volume state */
function reference(occ: Occupancy) {
  const solid = (x: number, y: number, z: number) => {
    for (const s of occ.sources.values()) {
      const lx = x - s.ox, ly = y - s.oy, lz = z - s.oz;
      if (lx < 0 || ly < 0 || lz < 0 || lx >= s.sx || ly >= s.sy || lz >= s.sz) continue;
      if (OPAQUE[s.data[lx + s.sx * (ly + s.sy * lz)]]) return true;
    }
    return false;
  };
  const bits = new Uint8Array(occ.bits.length);
  for (let z = 0; z < occ.nz; z++) for (let y = 0; y < occ.ny; y++) for (let x = 0; x < occ.nx; x++)
    if (solid(x, y, z)) bits[(x >> 1) + occ.bx * ((y >> 1) + occ.by * (z >> 1))] |= 1 << ((x & 1) | ((y & 1) << 1) | ((z & 1) << 2));
  const m0 = occ.mips[0];
  const dens = new Uint8Array(m0.data.length);
  for (let k = 0; k < m0.sz; k++) for (let j = 0; j < m0.sy; j++) for (let i = 0; i < m0.sx; i++) {
    let n = 0;
    for (let c = 0; c < 64; c++) if (solid(i * 4 + (c & 3), j * 4 + ((c >> 2) & 3), k * 4 + (c >> 4))) n++;
    dens[i + m0.sx * (j + m0.sy * k)] = n === 0 ? 0 : Math.max(1, Math.round((255 * n) / 64));
  }
  return { bits, dens, solid };
}
const same = (a: Uint8Array, b: Uint8Array) => Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.length), Buffer.from(b.buffer, b.byteOffset, b.length)) === 0;

describe('occupancy', () => {
  it('bit packing, glass transparency and density level 0', () => {
    const occ = new Occupancy(16, 8, 12, OPAQUE);
    expect([occ.nx, occ.ny, occ.nz, occ.bx, occ.by, occ.bz]).toEqual([16, 8, 12, 8, 4, 6]);
    const g = new VoxelGrid(4, 4, 4);
    g.set(1, 0, 0, pal(MAT.brick)); g.set(0, 1, 0, pal(MAT.wood)); g.set(0, 0, 1, pal(MAT.steel));
    g.set(3, 3, 3, pal(MAT.glass)); g.set(2, 2, 2, pal(MAT.lamp));
    occ.addSource(src(1, g, 4, 0, 4));
    occ.rebuildAll();
    // brick (2,0,2) holds voxels (4..5, 0..1, 4..5): bits 1 (x), 2 (y), 4 (z)
    expect(occ.bits[2 + occ.bx * (0 + occ.by * 2)]).toBe((1 << 1) | (1 << 2) | (1 << 4));
    expect(occ.solid(5, 0, 4)).toBe(true); expect(occ.solid(4, 1, 4)).toBe(true); expect(occ.solid(4, 0, 5)).toBe(true);
    expect(occ.solid(4, 0, 4)).toBe(false);
    expect(occ.solid(7, 3, 7)).toBe(false); // glass does not block light
    expect(occ.solid(6, 2, 6)).toBe(false); // lamps neither
    expect(occ.solid(-1, 0, 0)).toBe(false); expect(occ.solid(0, 99, 0)).toBe(false);
    const m0 = occ.mips[0];
    expect(m0.data[1 + m0.sx * (0 + m0.sy * 1)]).toBe(Math.round((255 * 3) / 64));
    expect(m0.data[0]).toBe(0);
    // a single voxel never rounds down to "empty"
    const g2 = new VoxelGrid(1, 1, 1); g2.set(0, 0, 0, pal(MAT.brick));
    occ.addSource(src(2, g2, 0, 0, 0));
    occ.updateRegion(0, 0, 0, 1, 1, 1);
    expect(m0.data[0]).toBeGreaterThan(0);
  });

  it('stamps overlapping / partly outside sources like the brute-force reference', () => {
    const rng = new Rng(7);
    const occ = new Occupancy(40, 28, 36, OPAQUE);
    occ.addSource(src(1, randomGrid(rng, 20, 20, 20), -5, 3, 2));
    occ.addSource(src(2, randomGrid(rng, 30, 10, 30), 15, -4, 10));
    occ.addSource(src(3, randomGrid(rng, 9, 9, 9, 0.9), 8, 8, 8));
    occ.rebuildAll();
    const ref = reference(occ);
    expect(same(occ.bits, ref.bits)).toBe(true);
    expect(same(occ.mips[0].data, ref.dens)).toBe(true);
  });

  it('density mips are a box filter with GL NPOT level sizes', () => {
    const rng = new Rng(3);
    const occ = new Occupancy(44, 20, 28, OPAQUE); // level 0: 11 x 5 x 7
    occ.addSource(src(1, randomGrid(rng, 44, 20, 28, 0.5), 0, 0, 0));
    occ.rebuildAll();
    expect(occ.mips.length).toBe(Math.floor(Math.log2(11)) + 1);
    expect(occ.mips.map((m) => [m.sx, m.sy, m.sz])).toEqual([[11, 5, 7], [5, 2, 3], [2, 1, 1], [1, 1, 1]]);
    for (let l = 1; l < occ.mips.length; l++) {
      const s = occ.mips[l - 1], d = occ.mips[l];
      for (let k = 0; k < d.sz; k++) for (let j = 0; j < d.sy; j++) for (let i = 0; i < d.sx; i++) {
        let sum = 0, n = 0;
        for (let c = 0; c < 8; c++) {
          const x = 2 * i + (c & 1), y = 2 * j + ((c >> 1) & 1), z = 2 * k + (c >> 2);
          if (x < s.sx && y < s.sy && z < s.sz) { sum += s.data[x + s.sx * (y + s.sy * z)]; n++; }
        }
        expect(d.data[i + d.sx * (j + d.sy * k)]).toBe(Math.round(sum / n));
      }
    }
  });

  it('region updates == full rebuild (random edits, add / remove sources)', () => {
    const rng = new Rng(11);
    const mk = () => new Occupancy(52, 36, 44, OPAQUE);
    const occ = mk();
    const grids = [randomGrid(rng, 30, 30, 30, 0.6), randomGrid(rng, 40, 12, 40, 0.8), randomGrid(rng, 16, 16, 16, 0.5)];
    const offs: [number, number, number][] = [[2, 2, 2], [10, 20, -3], [30, 0, 25]];
    grids.forEach((g, i) => occ.addSource(src(i + 1, g, ...offs[i])));
    occ.rebuildAll();
    const check = () => {
      const full = mk();
      for (const s of occ.sources.values()) full.addSource(s);
      full.rebuildAll();
      expect(same(occ.bits, full.bits)).toBe(true);
      for (let l = 0; l < occ.mips.length; l++) expect(same(occ.mips[l].data, full.mips[l].data)).toBe(true);
    };
    for (let round = 0; round < 25; round++) {
      const gi = rng.int(3), g = grids[gi], o = offs[gi];
      // carve or fill a random box in one grid
      const x0 = rng.int(g.sx), y0 = rng.int(g.sy), z0 = rng.int(g.sz);
      const x1 = Math.min(g.sx, x0 + 1 + rng.int(9)), y1 = Math.min(g.sy, y0 + 1 + rng.int(9)), z1 = Math.min(g.sz, z0 + 1 + rng.int(9));
      g.fill(x0, y0, z0, x1, y1, z1, rng.chance(0.7) ? 0 : pal(MAT.concrete));
      const r = occ.updateRegion(x0 + o[0], y0 + o[1], z0 + o[2], x1 + o[0], y1 + o[1], z1 + o[2]);
      if (r) { // boxes are inside their textures
        expect(r.bits[3]).toBeLessThanOrEqual(occ.bx); expect(r.bits[0]).toBeGreaterThanOrEqual(0);
        r.mips.forEach((b, l) => { for (let a = 0; a < 3; a++) { expect(b[a]).toBeLessThan(b[a + 3]); expect(b[a + 3]).toBeLessThanOrEqual([occ.mips[l].sx, occ.mips[l].sy, occ.mips[l].sz][a]); } });
      }
      if (round % 5 === 4) check();
    }
    // remove a whole source
    const s = occ.removeSource(2)!;
    occ.updateRegion(s.ox, s.oy, s.oz, s.ox + s.sx, s.oy + s.sy, s.oz + s.sz);
    check();
    occ.addSource(s);
    occ.updateRegion(s.ox, s.oy, s.oz, s.ox + s.sx, s.oy + s.sy, s.oz + s.sz);
    check();
  });

  it('CPU reference DDA agrees with brute-force sampling', () => {
    const rng = new Rng(5);
    const occ = new Occupancy(32, 32, 32, OPAQUE);
    occ.addSource(src(1, randomGrid(rng, 32, 32, 32, 0.02), 0, 0, 0));
    occ.rebuildAll();
    let hits = 0;
    for (let n = 0; n < 2000; n++) {
      const ro = [rng.range(-6, 38), rng.range(-6, 38), rng.range(-6, 38)];
      let rd = [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)];
      if (n % 7 === 0) rd[rng.int(3)] = 0;
      const l = Math.hypot(rd[0], rd[1], rd[2]);
      rd = l > 1e-6 ? rd.map((v) => v / l) : [1, 0, 0];
      const tMax = n % 3 === 0 ? 1000 : rng.range(0, 40);
      // brute force: dense sampling along the ray
      let brute = false;
      const tEnd = Math.min(tMax, 120);
      for (let t = 0; t <= tEnd && !brute; t += 0.01) brute = occ.solid(Math.floor(ro[0] + rd[0] * t), Math.floor(ro[1] + rd[1] * t), Math.floor(ro[2] + rd[2] * t));
      const dda = occ.trace(ro[0], ro[1], ro[2], rd[0], rd[1], rd[2], tMax);
      if (brute) expect(dda).toBe(true); // the DDA never misses what sampling finds
      if (dda) hits++;
      if (dda && !brute) {
        // must be a graze / end-point case: a solid voxel within 0.02 of the segment
        let near = false;
        for (let t = 0; t <= tEnd + 0.02 && !near; t += 0.005)
          for (let c = 0; c < 8 && !near; c++) near = occ.solid(Math.floor(ro[0] + rd[0] * t + ((c & 1) - 0.5) * 0.04), Math.floor(ro[1] + rd[1] * t + (((c >> 1) & 1) - 0.5) * 0.04), Math.floor(ro[2] + rd[2] * t + ((c >> 2) - 0.5) * 0.04));
        expect(near).toBe(true);
      }
    }
    expect(hits).toBeGreaterThan(200);
    // simple exact cases
    const o2 = new Occupancy(16, 16, 16, OPAQUE);
    const g = new VoxelGrid(1, 1, 1); g.set(0, 0, 0, pal(MAT.brick));
    o2.addSource(src(1, g, 8, 8, 8)); o2.rebuildAll();
    expect(o2.trace(0.5, 8.5, 8.5, 1, 0, 0, 100)).toBe(true);
    expect(o2.trace(0.5, 8.5, 8.5, 1, 0, 0, 7)).toBe(false);
    expect(o2.trace(0.5, 9.5, 8.5, 1, 0, 0, 100)).toBe(false);
    expect(o2.trace(-20, 8.5, 8.5, 1, 0, 0, 100)).toBe(true);
    expect(o2.trace(8.5, 8.5, 8.5, 0, 1, 0, 0)).toBe(true); // starts inside
  });

  it('planVolume: intersects content with bounds, aligns, crops to limits', () => {
    const p = planVolume([-256, -8, -256, 256, 70, 256], [-256, -50, -256, 256, 400, 256], 2048, 1e9);
    expect(p).toMatchObject({ ox: -256, oz: -256, nx: 512, nz: 512, cropped: false });
    expect(p.oy).toBe(-16); expect(p.ny % 4).toBe(0); expect(p.oy + p.ny).toBeGreaterThanOrEqual(78);
    const big = planVolume([-3000, -8, -3000, 3000, 200, 3000], [-3000, -50, -3000, 3000, 400, 3000], 1024, 1e12, [500, -200]);
    expect(big.nx).toBe(2048); expect(big.nz).toBe(2048); expect(big.cropped).toBe(true);
    expect(big.ox + big.nx / 2).toBe(500); expect(big.oz + big.nz / 2).toBe(-200);
    const mem = planVolume([0, 0, 0, 2000, 400, 2000], [0, 0, 0, 2000, 400, 2000], 2048, 64 * 1024 * 1024, undefined, 0);
    expect((mem.nx / 2) * (mem.ny / 2) * (mem.nz / 2)).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(mem.cropped).toBe(true); expect(mem.ny).toBe(400);
  });
});

describe('world occupancy (sim mirror)', () => {
  it('stamps static bodies, ignores dynamic ones, follows edits / splits / removal', () => {
    const sim = new Sim(1);
    const ground = new VoxelGrid(64, 4, 64);
    ground.fill(0, 0, 0, 64, 4, 64, pal(MAT.bedrock));
    sim.addBody(ground, { x: -3.2, y: -0.4, z: -3.2 });
    const wall = new VoxelGrid(30, 30, 4);
    wall.fill(0, 0, 0, 30, 30, 4, pal(MAT.brick));
    wall.fill(10, 10, 0, 20, 20, 4, pal(MAT.glass));
    const wb = sim.addBody(wall, { x: -1.5, y: 0, z: 0 });
    const crate = new VoxelGrid(6, 6, 6);
    crate.fill(0, 0, 0, 6, 6, 6, pal(MAT.wood));
    sim.addBody(crate, { x: 1, y: 2, z: 2 }, { dynamic: true });
    const w = WorldOccupancy.create(sim, { min: { x: -3.2, y: -5, z: -3.2 }, max: { x: 3.2, y: 20, z: 3.2 } });
    const { occ, plan } = w;
    expect(plan.ox).toBe(-32); expect(plan.oy).toBe(-12); expect(plan.nx).toBe(64);
    const at = (x: number, y: number, z: number) => occ.solid(Math.floor(x * 10 + 1e-6) - plan.ox, Math.floor(y * 10 + 1e-6) - plan.oy, Math.floor(z * 10 + 1e-6) - plan.oz);
    expect(at(0, -0.05, 0)).toBe(true);     // ground
    expect(at(-1.45, 0.05, 0.05)).toBe(true); // wall
    expect(at(0, 1.5, 0.05)).toBe(false);   // glass pane
    expect(at(1.3, 2.3, 2.3)).toBe(false);  // dynamic crate not stamped
    expect(w.has(wb.id)).toBe(true);
    // a ray through the window passes, through the bricks not
    const ray = (x: number, y: number) => occ.trace(x * 10 - plan.ox, y * 10 - plan.oy, -10 - plan.oz, 0, 0, 1, 40);
    expect(ray(0, 1.5)).toBe(false); expect(ray(-1, 0.5)).toBe(true);
    // carve a hole -> incremental update == rebuild
    sim.carve({ x: -1, y: 0.5, z: 0.2 }, 0.45, 0.45, 0.45);
    sim.step();
    w.collect(sim);
    expect(w.pending).toBeGreaterThan(0);
    let uploads = 0;
    w.flush(() => uploads++);
    expect(uploads).toBeGreaterThan(0);
    expect(ray(-1, 0.5)).toBe(false);
    const snapshot = occ.bits.slice();
    occ.rebuildAll();
    expect(same(snapshot, occ.bits)).toBe(true);
    // cut the wall off its base: the upper part becomes dynamic debris and leaves the volume
    for (let x = 0; x < 30; x++) for (let z = 0; z < 4; z++) sim.removeVoxel(wb, x, 1, z);
    sim.step();
    w.collect(sim); w.flush();
    expect(at(-1.45, 2.5, 0.05)).toBe(false);
    expect(at(-1.45, 0.05, 0.05)).toBe(true);
    const snap2 = occ.bits.slice();
    occ.rebuildAll();
    expect(same(snap2, occ.bits)).toBe(true);
    // remove the body entirely
    sim.removeBody(wb);
    w.collect(sim); w.flush();
    expect(at(-1.45, 0.05, 0.05)).toBe(false);
    expect(w.has(wb.id)).toBe(false);
    expect(at(0, -0.05, 0)).toBe(true);
  });
});
