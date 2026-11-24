import { bricks, box, clear, cylinderY, flat, planks, shaded } from '../build';
import { MAT, pal } from '../materials';
import { hash3 } from '../rng';
import type { Sim } from '../sim';
import { VoxelGrid } from '../voxels';
import { barrel, boat, container, crate, fence, lampPost, makeBuilding, pier, pine, placeBuilding, rock, shelf, table, tank, tree } from './kit';
import { Heightmap, buildTerrain, fbm2, smoothstep } from './terrain';
import type { LevelDef, LevelInfo } from './types';

const G = 1.4; // quay / town ground level (m); sea level is 0

/** tall brick lighthouse with a spiral stair and lamp room */
function lighthouse(sim: Sim, x: number, y: number, z: number) {
  const R = 22, Hh = 150;
  const S = R * 2 + 8;
  const g = new VoxelGrid(S, Hh + 34, S);
  const c = S / 2;
  const stripes = (xx: number, yy: number, zz: number) => (((yy / 30) | 0) % 2 ? bricks(MAT.brick, 3)(xx, yy, zz) : pal(MAT.whitepaint, (hash3(xx >> 1, yy >> 1, zz >> 1) * 5) | 0));
  cylinderY(g, c, c, R, 0, Hh, stripes, 3);
  cylinderY(g, c, c, R, 0, 3, shaded(MAT.concrete, 3, 2));
  // door
  clear(g, c - 5, 3, 0, c + 5, 24, 10);
  // spiral stairs: wooden treads from the wall toward a central post
  cylinderY(g, c, c, 2, 3, Hh, shaded(MAT.wood, 2, 5));
  for (let i = 0; i < (Hh - 6) / 2; i++) {
    const a = i * 0.26;
    const yy = 3 + i * 2;
    for (let r = 2; r < R - 2; r++) for (let w = -2; w <= 2; w++) {
      const px = Math.floor(c + Math.cos(a) * r - Math.sin(a) * w * 0.9), pz = Math.floor(c + Math.sin(a) * r + Math.cos(a) * w * 0.9);
      g.set(px, yy, pz, pal(MAT.wood, (i + r) % 5)); g.set(px, yy + 1, pz, pal(MAT.wood, (i + r) % 5));
    }
  }
  // small windows
  for (let yy = 40; yy < Hh - 20; yy += 36) { clear(g, c - 2, yy, 0, c + 2, yy + 8, 8); clear(g, c - 2, yy + 18, S - 8, c + 2, yy + 26, S); }
  // gallery + lamp room
  cylinderY(g, c, c, R + 4, Hh, Hh + 2, shaded(MAT.concrete, 3, 4));
  clear(g, c + 6, Hh, c - 4, c + 14, Hh + 2, c + 4); // hatch from the stairs
  cylinderY(g, c, c, R + 4, Hh + 2, Hh + 8, flat(MAT.steel), 1);
  cylinderY(g, c, c, R - 6, Hh + 2, Hh + 22, pal(MAT.glass, 2), 1);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const px = Math.floor(c + Math.cos(a) * (R - 6.5)), pz = Math.floor(c + Math.sin(a) * (R - 6.5)); box(g, px, Hh + 2, pz, px + 1, Hh + 22, pz + 1, flat(MAT.steel)); }
  box(g, c - 3, Hh + 2, c - 3, c + 3, Hh + 6, c + 3, flat(MAT.steel));
  box(g, c - 3, Hh + 6, c - 3, c + 3, Hh + 14, c + 3, pal(MAT.lamp));
  for (let i = 0; i < 10; i++) cylinderY(g, c, c, R - 5 - i * 1.6, Hh + 22 + i, Hh + 23 + i, shaded(MAT.paintedmetal, 3, 7));
  g.recount();
  return sim.addBody(g, { x: x - c * 0.1, y: y - 0.2, z: z - c * 0.1 }, { name: 'lighthouse' });
}

/** steel-frame warehouse with sheet-metal skin, mezzanine and big doors */
function warehouse(sim: Sim, x: number, z: number, w = 200, d = 130, name = 'warehouse') {
  const H = 62;
  const g = new VoxelGrid(w, H + 22, d);
  box(g, 0, 0, 0, w, 3, d, shaded(MAT.concrete, 4, 3));
  // concrete columns every 4 m, steel roof trusses
  for (let cx = 0; cx < w; cx += 40) for (const cz of [0, d - 4]) box(g, Math.min(cx, w - 4), 3, cz, Math.min(cx, w - 4) + 4, H, cz + 4, shaded(MAT.concrete, 3, 5));
  box(g, w - 4, 3, 0, w, H, 4, shaded(MAT.concrete, 3, 5)); box(g, w - 4, 3, d - 4, w, H, d, shaded(MAT.concrete, 3, 5));
  const skin = shaded(MAT.sheetmetal, 6, 9);
  box(g, 0, 3, 1, w, H, 2, skin); box(g, 0, 3, d - 2, w, H, d - 1, skin);
  box(g, 1, 3, 0, 2, H, d, skin); box(g, w - 2, 3, 0, w - 1, H, d, skin);
  // brick plinth 1 m
  box(g, 0, 3, 0, w, 13, 2, bricks(MAT.brick, 4)); box(g, 0, 3, d - 2, w, 13, d, bricks(MAT.brick, 4));
  box(g, 0, 3, 0, 2, 13, d, bricks(MAT.brick, 4)); box(g, w - 2, 3, 0, w, 13, d, bricks(MAT.brick, 4));
  // roof: shallow gable in sheet metal on steel trusses
  for (let cx = 0; cx < w; cx += 40) {
    const xx = Math.min(cx, w - 2);
    for (let i = 0; i < d / 2; i++) { const yy = H + Math.floor(i * 0.3); box(g, xx, yy - 2, i, xx + 2, yy, i + 1, flat(MAT.steel)); box(g, xx, yy - 2, d - 1 - i, xx + 2, yy, d - i, flat(MAT.steel)); }
    box(g, xx, H - 2, 0, xx + 2, H, d, flat(MAT.steel));
  }
  for (let i = 0; i < d / 2; i++) { const yy = H + Math.floor(i * 0.3); box(g, 0, yy, i, w, yy + 1, i + 1, shaded(MAT.sheetmetal, 8, 11)); box(g, 0, yy, d - 1 - i, w, yy + 1, d - i, shaded(MAT.sheetmetal, 8, 11)); }
  for (let i = 0; i < d / 2; i++) { const yy = H + Math.floor(i * 0.3); box(g, 1, H, i, 2, yy, d - i, skin); box(g, w - 2, H, i, w - 1, yy, d - i, skin); }
  // big sliding door openings (front = z0 side) and a side door
  clear(g, 30, 3, 0, 70, 45, 3); clear(g, 120, 3, 0, 160, 45, 3);
  clear(g, w - 3, 3, d - 40, w, 24, d - 30);
  // skylight strip windows high on the walls
  for (let cx = 10; cx < w - 20; cx += 40) { box(g, cx, 46, d - 2, cx + 22, 56, d - 1, pal(MAT.glass, 2)); box(g, cx, 46, d - 1, cx + 22, 56, d, 0); }
  // mezzanine office at the back-left corner: wooden floor on steel posts, plaster walls, stairs
  const mx = 60, mz = 50, my = 30;
  box(g, 2, my, d - mz, mx, my + 2, d - 2, planks(MAT.wood, 4, 6));
  for (const [px, pz] of [[mx - 3, d - mz], [mx - 3, d - 20], [20, d - mz]]) box(g, px, 3, pz, px + 2, my, pz + 2, flat(MAT.steel));
  box(g, 2, my + 2, d - mz, mx, my + 26, d - mz + 1, shaded(MAT.plaster, 6, 2)); box(g, mx - 1, my + 2, d - mz, mx, my + 26, d - 2, shaded(MAT.plaster, 6, 2));
  clear(g, mx - 1, my + 2, d - 22, mx, my + 22, d - 13); // office door
  box(g, 14, my + 10, d - mz, 40, my + 20, d - mz + 1, pal(MAT.glass, 2));
  for (let i = 0; i < my / 2; i++) box(g, mx + i * 3, Math.max(3, 3 + i * 2 - 2), d - 13, mx + i * 3 + 3, 3 + i * 2 + 2, d - 3, planks(MAT.wood, 3, 8));
  // hanging lamps
  for (let cx = 40; cx < w; cx += 60) box(g, cx, H - 5, (d >> 1) - 2, cx + 4, H - 2, (d >> 1) + 2, pal(MAT.lamp));
  g.recount();
  return sim.addBody(g, { x, y: G - 0.2, z }, { name });
}

export const harbor: LevelDef = {
  id: 'harbor',
  title: 'Gullwick Harbour',
  build(sim: Sim): LevelInfo {
    const seed = 11;
    const hm = new Heightmap((x, z) => {
      const n = fbm2(x * 0.02 + 7, z * 0.02 + 3, seed);
      const land = G + 0.3 + n * 1.6 + smoothstep(-20, -62, z) * (3 + 5 * fbm2(x * 0.015, z * 0.015, seed + 3));
      const shore = 31 + 5 * (fbm2(x * 0.03, 0.5, seed + 5) - 0.5) + smoothstep(-30, -62, x) * 9;
      const sea = -3.2 - 1.2 * n;
      return land + (sea - land) * smoothstep(shore - 1.5, shore + 7, z);
    });
    // road from the north edge down to the quay, a cross street, the quay apron, plots
    hm.addPad(-3.5, -64, 3.5, 9, G, 2.5, MAT.asphalt);
    hm.addPad(-46, 7, 46, 30.4, G, 1.0, MAT.concrete);
    hm.addPad(3.5, -14, 44, -9, G, 2.5, MAT.asphalt);
    hm.addPad(8, -9, 26, 3, G, 2, MAT.grass);          // office plot
    hm.addPad(26, -32, 46, -14, G, 2, MAT.concrete);   // fuel depot
    hm.addPad(-22, -36, -8, -24, G + 0.6, 3, MAT.grass); // cottage
    hm.addPad(-58, 24, -46, 38, 3.2, 4, MAT.rock);     // lighthouse rock
    const ter = buildTerrain(sim, { x0: -64, z0: -64, tilesX: 5, tilesZ: 5, heightmap: hm, waterLevel: 0, seed });
    const gy = (x: number, z: number) => ter.heightAt(x, z);

    // --- buildings
    warehouse(sim, -42, 9.5);
    placeBuilding(sim, makeBuilding({ w: 110, d: 80, floors: 2, wall: MAT.brick, lining: MAT.plaster, roof: 'flat', slab: MAT.wood, doors: 'ws', partitions: true, lamps: true, seed: 3 }), 11, G, -7, 'office');
    placeBuilding(sim, makeBuilding({ w: 70, d: 56, floors: 1, wall: MAT.wood, wallT: 2, roof: 'gable', roofMat: MAT.tile, doors: 's', lamps: true, seed: 5, winStep: 26 }), -19, G + 0.6, -33, 'cottage');
    placeBuilding(sim, makeBuilding({ w: 50, d: 40, floors: 1, wall: MAT.concrete, roof: 'flat', doors: 'w', winW: 0, seed: 8 }), 39, G, -22, 'pump house');
    lighthouse(sim, -52, 3.2, 31);

    // --- container yard (east quay)
    const cols = [MAT.paintedmetal, MAT.sheetmetal, MAT.plastic, MAT.paintedmetal];
    let k = 0;
    for (let cx = 12; cx <= 34; cx += 7.5) for (let cz = 12; cz <= 24; cz += 3.2) {
      if (hash3(cx | 0, cz | 0, 1, seed) < 0.25) continue;
      container(sim, cx, G, cz, cols[k++ % cols.length]);
      if (hash3(cx | 0, cz | 0, 2, seed) < 0.4) container(sim, cx, G + 2.6, cz, cols[k++ % cols.length]);
    }

    // --- fuel depot
    tank(sim, 31, G, -27, 16, 44, true);
    tank(sim, 31, G, -19, 14, 36, false);
    fence(sim, 26, G, -32.2, 20, false, MAT.sheetmetal, 18);
    fence(sim, 26, G, -14, 13, false, MAT.sheetmetal, 18);
    fence(sim, 45.8, G, -32, 18, true, MAT.sheetmetal, 18);
    for (const [bx, bz] of [[36.5, -30], [37.3, -30], [36.9, -29.2], [28, -16], [44, -16.5]]) barrel(sim, bx, G + 0.05, bz);

    // --- waterfront
    pier(sim, -1.5, G, 30.2, 20, 3, true, 5);
    pier(sim, 22, G, 30.2, 12, 2.4, true, 5);
    boat(sim, 2.2, 0.1, 40, 0.2);
    boat(sim, -4.6, 0.1, 36, -1.4);
    boat(sim, 25, 0.1, 37, 1.6);
    for (let lx = -40; lx <= 40; lx += 16) lampPost(sim, lx, G, 28.6);
    for (let lz = -56; lz <= 0; lz += 14) lampPost(sim, 4.2, gy(4.2, lz), lz);

    // --- props
    for (const [cx, cz, n] of [[-12, 12, 8], [-11.1, 12.2, 8], [-11.6, 12, 6], [6, 26, 10], [7.2, 26.3, 8], [-30, 27, 8], [44, 10, 8]] as const) crate(sim, cx, G + 0.05, cz, n);
    crate(sim, -11.6, G + 0.9, 12.1, 7);
    for (let i = 0; i < 5; i++) crate(sim, -36 + i * 1.1, G + 0.15, 20, 8, i * 0.3);
    for (let i = 0; i < 4; i++) shelf(sim, -26 + i * 3, G + 0.15, 21.6);
    table(sim, -40.5, G + 3.25, 20);
    table(sim, 14, G + 0.15, -3);
    barrel(sim, -20, G + 0.15, 14, false); barrel(sim, -19.2, G + 0.15, 14.3, false);
    barrel(sim, -24.5, G + 0.15, 20.5);

    // --- nature
    for (let i = 0; i < 26; i++) {
      const x = -60 + hash3(i, 1, 0, seed) * 120, z = -62 + hash3(i, 2, 0, seed) * 44;
      if (Math.abs(x) < 7 || (x > 6 && z > -36 && z < 6) || (x > -24 && x < -6 && z > -38 && z < -22)) continue;
      (i % 3 ? pine : tree)(sim, x, gy(x, z), z, i);
    }
    for (let i = 0; i < 10; i++) {
      const x = -62 + hash3(i, 5, 0, seed) * 124, z = -60 + hash3(i, 6, 0, seed) * 90;
      if (Math.abs(x) < 6 || (z > 6 && z < 31 && Math.abs(x) < 47)) continue;
      rock(sim, x, gy(x, z), z, 5 + ((hash3(i, 7, 0, seed) * 9) | 0), i);
    }
    fence(sim, -24, gy(-24, -22), -22, 18, false, MAT.wood, 10);

    return {
      name: 'Gullwick Harbour',
      spawn: { x: 1.5, y: gy(1.5, -52) + 0.1, z: -52 },
      spawnYaw: Math.PI,
      bounds: { min: { x: -64, y: -6, z: -64 }, max: { x: 64, y: 28, z: 64 } },
      waterLevel: 0,
      sunDir: { x: -0.55, y: -0.42, z: 0.72 },
      sky: 'sunset',
      markers: {
        escape: { x: -1.5, y: gy(-1.5, -55), z: -55 },
        quay: { x: 0, y: G, z: 20 },
        warehouse: { x: -32, y: G, z: 16 },
        office: { x: 16, y: G, z: -3 },
        lighthouse: { x: -52, y: 3.2, z: 31 },
        depot: { x: 34, y: G, z: -23 },
        pier: { x: 0, y: G, z: 46 },
        heli_start: { x: 90, y: 40, z: -90 },
      },
    };
  },
};
