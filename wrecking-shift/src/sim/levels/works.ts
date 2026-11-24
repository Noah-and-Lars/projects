import { box, clear, cylinderY, flat, planks, shaded, shell, windowX, windowZ, type PalFn } from '../build';
import { MAT, pal } from '../materials';
import { hash3 } from '../rng';
import type { Sim } from '../sim';
import type { V3 } from '../vec';
import { VoxelGrid } from '../voxels';
import { barrel, container, crate, fence, makeBuilding, placeBuilding, shelf, table, tank } from './kit';
import { RoadHeightmap, addStatic, chair, cylinderX, cylinderZ, lattice, railing, scrap, spool, stairs, streetLamp, wallRun, wallSeg } from './kit2';
import { buildTerrain, fbm2, smoothstep } from './terrain';
import type { LevelDef, LevelInfo } from './types';

/**
 * BRACKWATER WORKS — an old riverside industrial plant under an overcast sky. 5x4 terrain tiles
 * (x in [-64, 64], z in [-51.2, 51.2]), flat yard at 1.6 m, a canal (water level 0, 2.6 m deep, concrete quay
 * walls) runs east-west at z 12..22. North bank: factory hall, chimney, boiler house, silos, tank farm, pipe
 * rack, office block. South bank: loading dock, container yard, scrap yard, rail siding with wagons, gantry crane.
 * Entry by road through the gate in the west perimeter wall (spawn just inside it).
 *
 * Markers (world positions at floor level unless noted):
 *   escape            van spot beside the spawn, just inside the west gate
 *   gate              the west gate opening
 *   office_door       office block entrance (south side, facing the main road)
 *   office_lobby      office ground floor
 *   office_top        office third floor (records / safe room)
 *   office_roof       office roof (stair hatch; heli pick-up spot)
 *   factory_door_a    big door of the west hall (south facade)
 *   factory_door_b    big door of the east hall (south facade)
 *   factory_hall      middle of the factory hall (both halves form one open space)
 *   factory_side      small side door on the factory's west wall
 *   chimney           centre of the free-standing 30 m brick chimney (ground)
 *   chimney_door      flue access opening at the chimney's base (south side)
 *   boiler_house      inside the boiler house (boiler on supports)
 *   silo_stairs       foot of the steel stair tower at the silos' west end
 *   silo_catwalk      catwalk over the four silos (~14 m up)
 *   tank_farm         inside the bund wall between the 4 fuel tanks (entry gap on the south side)
 *   pipe_rack         under the pipe rack (between factory yard and tank farm)
 *   factory_yard      open yard between the factory and the main road
 *   parking           car park by the gate (north of the canal)
 *   road_bridge       middle of the concrete road bridge over the canal
 *   footbridge        middle of the steel footbridge over the canal (east)
 *   canal_dump        canal water west of the road bridge (dump objectives here)
 *   canal_dump_east   canal water east of the footbridge
 *   dock              top of the raised loading dock (under the shed roof)
 *   dock_ramp         foot of the dock ramp (west end)
 *   container_yard    between the container stacks
 *   scrap_yard        scrap heaps (south-east)
 *   rail_siding       on the track between the wagons
 *   wagon_box         boxcar (side door), wagon_gondola  open wagon with scrap, wagon_tank  tank wagon
 *   gantry            under the gantry crane over the siding
 *   gantry_top        top girder of the gantry crane (~13 m, not reachable without climbing / tools)
 *   heli_start        helicopter spawn far outside the map (south-west, high)
 */

const G = 1.6;      // yard level
const WATER = 0;
const CANAL_Z = 17; // canal centre line
type Marks = Record<string, V3>;

const brickFn: PalFn = (x, y, z) => { const row = (y / 6) | 0; return pal(MAT.brick, (hash3(((x + z + (row % 2) * 8) / 16) | 0, row, 0, 8) * 4) | 0); };
const concFn = shaded(MAT.concrete, 10, 2);
const sheetFn = shaded(MAT.sheetmetal, 10, 5);
const steel = flat(MAT.steel, 2);

// ------------------------------------------------------------------ factory hall (one half)

/** half of the saw-tooth factory hall; `open` = the side that joins the other half (columns only, no wall) */
function factoryHall(sim: Sim, wx: number, wz: number, gy: number, open: 'e' | 'w', name: string, m: Marks, mk: string): void {
  const W = 220, D = 250, H = 90, T = 3;
  const g = new VoxelGrid(W, H + 30, D);
  box(g, 0, 0, 0, W, 3, D, concFn);
  const wallX = open === 'e' ? 0 : W - T; // closed gable side
  box(g, 0, 3, 0, W, H, T, brickFn); box(g, 0, 3, D - T, W, H, D, brickFn);
  box(g, wallX, 3, 0, wallX + T, H, D, brickFn);
  // steel columns: along the open edge, the centre line and the closed wall, at every valley
  const colX = open === 'e' ? [0, 108, W - 4] : [0, 108, W - 4];
  for (let t = 0; t <= 5; t++) {
    const z0 = Math.min(t * 50, D - 4);
    for (const cx of colX) if (!(cx === 108 && (t === 0 || t === 5))) box(g, cx, 3, z0, cx + 4, H, z0 + 4, steel);
    box(g, 0, H - 4, z0, W, H, z0 + 4, steel); // valley beam
  }
  // saw-tooth roof: sheet-metal slopes rising to the south, vertical north-light glazing
  for (let t = 0; t < 5; t++) {
    const z0 = t * 50;
    for (let dz = 0; dz < 50; dz++) {
      // terraced slope (rise 6 every 12): far fewer AO-broken quads than a 1:2 voxel staircase
      const y = H + 6 * Math.min(3, Math.floor(dz / 12)) + (dz >= 48 ? 6 : 0);
      box(g, 0, dz % 12 === 0 && dz > 0 ? y - 6 : y, z0 + dz, W, y + 2, z0 + dz + 1, flat(MAT.sheetmetal, 1 + (t % 3)));
      box(g, wallX, H, z0 + dz, wallX + T, y, z0 + dz + 1, brickFn); // gable infill on the closed side
    }
    if (t < 4) box(g, 0, H, z0 + 49, W, H + 25, z0 + 50, pal(MAT.glass, 2));
    for (let x = 20; x < W; x += 44) box(g, x, H, z0 + 49, x + 2, H + 25, z0 + 50, steel);
  }
  // windows + doors
  for (let x = 14; x + 16 < W - 8; x += 34) { windowX(g, x, x + 16, 25, 70, 0, T); if (x + 16 < 86 || x > 134) windowX(g, x, x + 16, 25, 70, D - T, D); }
  for (let z = 14; z + 16 < D - 8; z += 34) if (!(z < 132 && z + 16 > 116)) windowZ(g, z, z + 16, 25, 70, wallX, wallX + T);
  clear(g, 90, 3, D - T, 130, 48, D);
  box(g, 88, 48, D - T, 132, 52, D, steel);
  clear(g, wallX, 3, 118, wallX + T, 24, 130);
  // machines (static) and a lamp row
  for (const [mx, mz] of [[30, 60], [30, 150], [150, 100]]) {
    box(g, mx, 3, mz, mx + 40, 14, mz + 24, flat(MAT.paintedmetal, 1));
    box(g, mx + 4, 14, mz + 4, mx + 36, 26, mz + 20, sheetFn);
    cylinderX(g, 30, mz + 12, 5, mx + 6, mx + 34, steel);
  }
  for (let t = 0; t < 5; t++) for (let x = 30; x < W; x += 60) box(g, x, H - 6, t * 50 + 1, x + 6, H - 4, t * 50 + 3, pal(MAT.lamp));
  addStatic(sim, g, wx, gy - 0.2, wz, name, ['factory']);
  const P = (lx: number, lz: number): V3 => ({ x: wx + lx * 0.1, y: gy + 0.12, z: wz + lz * 0.1 });
  for (const [lx, lz] of [[100, 30], [109, 31], [104, 40], [180, 200], [189, 200]]) { const p = P(lx, lz); crate(sim, p.x, p.y, p.z, 8); }
  { const p = P(60, 210); shelf(sim, p.x, p.y, p.z); }
  { const p = P(160, 30); spool(sim, p.x, p.y, p.z); }
  { const p = P(200, 120); barrel(sim, p.x, p.y, p.z, true); }
  m[mk] = P(110, D + 10);
}

// ------------------------------------------------------------------ chimney

/** free-standing tapered brick chimney, hollow (~3 m outer diameter at the base), with a flue door */
function chimney(sim: Sim, cx: number, gy: number, cz: number, m: Marks): void {
  const HT = 302, S = 44, c = S / 2;
  const g = new VoxelGrid(S, HT, S);
  box(g, 0, 0, 0, S, 3, S, concFn);
  box(g, 2, 3, 2, S - 2, 30, S - 2, brickFn); // square plinth
  cylinderY(g, c, c, 12.5, 3, 30, 0);           // hollow inside
  for (let y = 30; y < HT; y++) {
    const r = 16 - (4.5 * (y - 30)) / (HT - 30);
    const band = y > HT - 16 && y < HT - 10 ? flat(MAT.brick, 0) : brickFn;
    cylinderY(g, c, c, r, y, y + 1, band, 3);
  }
  for (let y = HT - 6; y < HT; y++) cylinderY(g, c, c, 13, y, y + 1, flat(MAT.brick, 0), 3); // cap
  clear(g, c - 5, 3, c, c + 6, 24, S); // flue access door (south)
  addStatic(sim, g, cx - c * 0.1, gy - 0.2, cz - c * 0.1, 'chimney', ['chimney']);
  m.chimney = { x: cx, y: gy, z: cz };
  m.chimney_door = { x: cx, y: gy, z: cz + c * 0.1 + 0.8 };
}

// ------------------------------------------------------------------ silos

/** four sheet-metal silos on steel legs, catwalk on top, stair tower at the west end */
function silos(sim: Sim, wx: number, wz: number, gy: number, m: Marks): void {
  const R = 22, SP = 52, TW = 32, SX = TW + 4 * SP + 4, SZ = 60, TOPY = 142;
  const g = new VoxelGrid(SX, TOPY + 14, SZ);
  const cz = 30;
  // stair tower: lattice corners, zig-zag flights in two lanes, landings at alternate ends
  box(g, 0, 0, 0, TW, 3, SZ, concFn);
  for (const [px, pz] of [[0, 0], [TW - 2, 0], [0, SZ - 2], [TW - 2, SZ - 2]]) box(g, px, 3, pz, px + 2, TOPY, pz + 2, steel);
  for (let y = 30; y < TOPY; y += 30) { box(g, 0, y, 0, TW, y + 1, 1, steel); box(g, 0, y, SZ - 1, TW, y + 1, SZ, steel); }
  const laneA: [number, number] = [2, 15], laneB: [number, number] = [17, 30];
  let y = 3, f = 0;
  while (y < TOPY) {
    const rise = Math.min(30, TOPY - y);
    if (f % 2 === 0) stairs(g, 'z', 8, 1, laneA[0], laneA[1], y, rise, steel, 4);
    else stairs(g, 'z', 53, -1, laneB[0], laneB[1], y, rise, steel, 4);
    y += rise;
    if (f % 2 === 0) box(g, 0, y - 3, 52, TW, y, SZ, steel); else box(g, 0, y - 3, 0, TW, y, 9, steel);
    f++;
  }
  box(g, 16, TOPY - 3, 26, TW, TOPY, SZ, steel); // top deck (lane A stays open for the last flight)
  railing(g, 'z', 0, SZ, 0, TOPY, steel); railing(g, 'x', 0, TW, 0, TOPY, steel);
  // silos
  for (let i = 0; i < 4; i++) {
    const sx = TW + 2 + SP * i + SP / 2;
    box(g, sx - 24, 0, cz - 24, sx + 24, 3, cz + 24, concFn);
    for (const [lx, lz] of [[-15, -15], [12, -15], [-15, 12], [12, 12]]) box(g, sx + lx, 3, cz + lz, sx + lx + 3, 58, cz + lz + 3, steel);
    for (const yy of [20, 40]) { box(g, sx - 15, yy, cz - 15, sx + 15, yy + 1, cz - 14, steel); box(g, sx - 15, yy, cz + 14, sx + 15, yy + 1, cz + 15, steel); box(g, sx - 15, yy, cz - 15, sx - 14, yy + 1, cz + 15, steel); box(g, sx + 14, yy, cz - 15, sx + 15, yy + 1, cz + 15, steel); }
    for (let k = 0; k < 16; k++) cylinderY(g, sx, cz, 5 + k * 1.1, 40 + k, 41 + k, flat(MAT.sheetmetal, 1), 2); // hopper cone
    cylinderY(g, sx, cz, R, 56, 132, i % 2 ? flat(MAT.sheetmetal, 2) : flat(MAT.whitepaint, 2), 1);
    for (let k = 0; k < 8; k++) cylinderY(g, sx, cz, R - k * 2.6, 132 + k, 133 + k, flat(MAT.sheetmetal, 3), 3); // roof cone
    box(g, sx - 3, 132, cz - 3, sx + 3, TOPY - 3, cz + 3, steel); // hatch stub carrying the catwalk
  }
  // catwalk across the silo tops
  box(g, TW, TOPY - 3, cz - 6, SX, TOPY - 1, cz + 6, steel);
  railing(g, 'x', TW, SX, cz - 6, TOPY - 1, steel); railing(g, 'x', TW, SX, cz + 5, TOPY - 1, steel);
  addStatic(sim, g, wx, gy - 0.2, wz, 'silos', ['silos']);
  m.silo_stairs = { x: wx + 0.8, y: gy, z: wz + 0.5 };
  m.silo_catwalk = { x: wx + (TW + SP * 2) * 0.1, y: gy - 0.2 + (TOPY - 1) * 0.1, z: wz + cz * 0.1 };
}

// ------------------------------------------------------------------ pipe rack

function pipeRack(sim: Sim, wx: number, gy: number, wz: number, len: number): void {
  const L = Math.round(len * 10);
  const g = new VoxelGrid(L, 78, 22);
  for (let x = 0; x < L; x += 50) {
    const xx = Math.min(x, L - 3);
    box(g, xx, 0, 0, xx + 3, 60, 3, steel); box(g, xx, 0, 19, xx + 3, 60, 22, steel);
    box(g, xx, 57, 0, xx + 3, 60, 22, steel); box(g, xx, 30, 0, xx + 3, 32, 22, steel);
  }
  cylinderX(g, 65, 6, 5, 0, L, sheetFn, 2);
  cylinderX(g, 64, 15, 4, 0, L, shaded(MAT.paintedmetal, 12, 3), 2);
  cylinderX(g, 35, 11, 3, 0, L, sheetFn, 2);
  addStatic(sim, g, wx, gy - 0.3, wz, 'piperack');
}

// ------------------------------------------------------------------ canal crossings

function roadBridge(sim: Sim, wx: number, wz: number, m: Marks): void {
  const W = 64, D = 150, DT = 46; // deck top voxel 46 -> world G + 0.2
  const y0w = G + 0.2 - DT * 0.1;
  const g = new VoxelGrid(W, DT + 10, D);
  box(g, 0, 0, 0, W, DT, 22, concFn); box(g, 0, 0, D - 22, W, DT, D, concFn); // abutments
  box(g, 0, DT - 6, 0, W, DT, D, concFn);                                     // deck
  box(g, 6, 0, 70, W - 6, DT - 6, 80, concFn);                                 // central pier
  box(g, 0, DT - 1, 0, W, DT, D, flat(MAT.asphalt, 2));
  box(g, 0, DT, 0, 3, DT + 9, D, concFn); box(g, W - 3, DT, 0, W, DT + 9, D, concFn); // parapets
  addStatic(sim, g, wx, y0w, wz, 'road bridge', ['bridge']);
  m.road_bridge = { x: wx + W * 0.05, y: G + 0.2, z: wz + D * 0.05 };
}

function footbridge(sim: Sim, wx: number, wz: number, m: Marks): void {
  const W = 26, D = 150;
  const g = new VoxelGrid(W, 22, D);
  for (const z0 of [0, D - 8]) box(g, 0, 0, z0, W, 4, z0 + 8, concFn);
  box(g, 0, 3, 0, W, 4, D, flat(MAT.steel, 3));
  for (const x0 of [0, W - 2]) {
    box(g, x0, 3, 0, x0 + 2, 6, D, steel); box(g, x0, 18, 0, x0 + 2, 20, D, steel);
    for (let z = 0; z < D; z += 15) { box(g, x0, 6, Math.min(z, D - 2), x0 + 2, 18, Math.min(z, D - 2) + 2, steel); for (let k = 0; k < 12; k++) box(g, x0, 6 + k, Math.min(z + k, D - 1), x0 + 2, 7 + k, Math.min(z + k + 2, D), steel); }
  }
  addStatic(sim, g, wx, G - 0.3, wz, 'footbridge', ['bridge']);
  m.footbridge = { x: wx + W * 0.05, y: G + 0.1, z: wz + D * 0.05 };
}

// ------------------------------------------------------------------ loading dock

function loadingDock(sim: Sim, wx: number, wz: number, m: Marks): void {
  const RAMP = 70, PL = 180, SX = RAMP + PL, SZ = 120, DH = 12; // dock top 1.2 m above the yard
  const g = new VoxelGrid(SX, DH + 75, SZ);
  shell(g, RAMP, 0, 0, SX, DH + 3, SZ, 4, concFn);
  for (let x = RAMP + 40; x < SX; x += 40) box(g, x, 0, 0, x + 4, DH + 3, SZ, concFn); // inner walls
  box(g, RAMP, DH, 0, SX, DH + 3, SZ, concFn);
  for (let i = 0; i < RAMP; i++) { const h = 3 + Math.floor((i * DH) / RAMP); box(g, i, 0, 20, i + 1, h, 100, concFn); }
  box(g, RAMP, DH + 2, SZ - 3, SX, DH + 3, SZ, flat(MAT.paintedmetal, 0)); // yellow edge
  // shed: steel columns + shallow sheet-metal gable roof
  const R0 = DH + 3 + 50;
  for (let x = RAMP; x < SX; x += 45) for (const z of [2, SZ - 6]) { const xx = Math.min(x, SX - 4); box(g, xx, DH + 3, z, xx + 4, R0, z + 4, steel); }
  for (let i = 0; i < SZ / 2; i++) { const yy = R0 + Math.floor(i * 0.25); box(g, RAMP - 6, yy, i, SX, yy + 2, i + 1, sheetFn); box(g, RAMP - 6, yy, SZ - 1 - i, SX, yy + 2, SZ - i, sheetFn); }
  for (let x = RAMP; x < SX; x += 45) { const xx = Math.min(x, SX - 4); box(g, xx, R0 - 3, 2, xx + 4, R0, SZ - 2, steel); }
  box(g, RAMP + 90, R0 - 4, 58, RAMP + 94, R0 - 3, 62, pal(MAT.lamp));
  addStatic(sim, g, wx, G - 0.3, wz, 'loading dock', ['dock']);
  const top = G - 0.3 + (DH + 3) * 0.1;
  const P = (lx: number, lz: number): V3 => ({ x: wx + lx * 0.1, y: top + 0.02, z: wz + lz * 0.1 });
  for (const [lx, lz, n] of [[90, 20, 8], [99, 20, 8], [94, 29, 8], [140, 30, 9], [150, 30, 9], [145, 30.5, 7], [200, 70, 8], [209, 72, 8], [204, 80, 8]] as const) { const p = P(lx, lz); crate(sim, p.x, p.y, p.z, n); }
  { const p = P(150, 30); crate(sim, p.x, p.y + 0.95, p.z + 0.05, 7); }
  for (const lx of [110, 120]) { const p = P(lx, 95); barrel(sim, p.x, p.y, p.z, true); }
  { const p = P(170, 90); spool(sim, p.x, p.y, p.z); }
  { const p = P(225, 40); table(sim, p.x, p.y, p.z, 14, 8); }
  m.dock = P(150, 60);
  m.dock_ramp = { x: wx + 0.5, y: G, z: wz + 6 };
}

// ------------------------------------------------------------------ rail

/** straight track along x: rock ballast, wooden sleepers, two steel rails (gauge ~1.45 m) */
function track(sim: Sim, wx: number, wz: number, len: number): void {
  const L = Math.round(len * 10);
  const g = new VoxelGrid(L, 9, 30);
  box(g, 0, 0, 0, L, 5, 30, shaded(MAT.rock, 12, 3));
  for (let x = 1; x < L; x += 6) box(g, x, 5, 2, x + 3, 6, 28, flat(MAT.wood, 0));
  box(g, 0, 6, 6, L, 8, 7, flat(MAT.steel, 1)); box(g, 0, 6, 21, L, 8, 22, flat(MAT.steel, 1));
  box(g, 0, 5, 6, L, 6, 7, flat(MAT.steel, 1)); box(g, 0, 5, 21, L, 6, 22, flat(MAT.steel, 1));
  addStatic(sim, g, wx, G - 0.2, wz, 'track');
}

/** static freight wagon standing on the rails (rail top = G + 0.6) */
function wagon(sim: Sim, wx: number, wz: number, kind: 'box' | 'gondola' | 'tank', m: Marks): void {
  const L = 120, Wd = 28, H = 40;
  const g = new VoxelGrid(L, H, Wd);
  for (const ax of [16, 28, 92, 104]) { cylinderZ(g, ax, 4, 4, 4, 8, steel); cylinderZ(g, ax, 4, 4, 19, 23, steel); box(g, ax - 1, 3, 4, ax + 1, 5, 23, steel); }
  for (const bx of [10, 86]) box(g, bx, 7, 3, bx + 24, 9, 25, steel); // bogies
  box(g, 0, 9, 0, L, 12, Wd, flat(MAT.steel, 1));                      // chassis
  if (kind === 'box') {
    shell(g, 1, 12, 1, L - 1, H - 2, Wd - 1, 1, shaded(MAT.paintedmetal, 12, 7));
    box(g, 1, H - 2, 1, L - 1, H, Wd - 1, sheetFn);
    clear(g, 48, 12, Wd - 2, 72, 34, Wd); // side door open
  } else if (kind === 'gondola') {
    shell(g, 1, 12, 1, L - 1, 26, Wd - 1, 1, shaded(MAT.sheetmetal, 10, 4));
    for (let x = 2; x < L - 2; x++) { const h = 12 + Math.round(6 + 5 * Math.sin(x * 0.11) + 3 * hash3(x >> 2, 1, 2)); box(g, x, 12, 2, x + 1, h, Wd - 2, shaded(MAT.steel, 4, 9)); }
  } else {
    cylinderX(g, 25, Wd / 2, 12, 4, L - 4, shaded(MAT.whitepaint, 12, 2), 1);
    cylinderX(g, 25, Wd / 2, 12, 4, 5, flat(MAT.whitepaint, 1)); cylinderX(g, 25, Wd / 2, 12, L - 5, L - 4, flat(MAT.whitepaint, 1));
    for (const x of [20, 98]) box(g, x, 12, 4, x + 3, 16, Wd - 4, steel);
  }
  addStatic(sim, g, wx, G + 0.6, wz, `wagon ${kind}`, ['wagon']);
  m[`wagon_${kind}`] = { x: wx + 6, y: G, z: wz + (kind === 'box' ? 4.0 : -1.0) };
}

/** steel lattice gantry crane over the siding (spans z), 13 m to the top girder */
function gantryCrane(sim: Sim, wx: number, wz: number, m: Marks): void {
  const SX = 60, SZ = 110, TOP = 132;
  const g = new VoxelGrid(SX, TOP + 4, SZ);
  for (const lx of [0, SX - 10]) for (const lz of [0, SZ - 10]) { box(g, lx - 0, 0, lz, lx + 10, 3, lz + 10, steel); lattice(g, lx, lz, 10, 3, TOP - 10, steel, 20); }
  for (const lx of [0, SX - 10]) { box(g, lx, TOP - 12, 0, lx + 10, TOP - 10, SZ, steel); box(g, lx, TOP - 2, 0, lx + 10, TOP, SZ, steel); for (let z = 0; z < SZ; z += 12) box(g, lx, TOP - 10, Math.min(z, SZ - 2), lx + 10, TOP - 2, Math.min(z, SZ - 2) + 2, steel); }
  for (const lz of [0, SZ - 10]) box(g, 0, TOP - 10, lz, SX, TOP - 2, lz + 10, shaded(MAT.paintedmetal, 10, 1));
  // trolley + hook
  const zc = SZ >> 1;
  box(g, 0, TOP, zc - 6, SX, TOP + 4, zc + 6, shaded(MAT.paintedmetal, 10, 2));
  box(g, 29, 70, zc - 1, 31, TOP, zc + 1, pal(MAT.wire, 1));
  box(g, 25, 64, zc - 4, 35, 70, zc + 4, steel);
  addStatic(sim, g, wx, G - 0.2, wz, 'gantry crane', ['crane']);
  m.gantry = { x: wx + SX * 0.05, y: G, z: wz + SZ * 0.05 };
  m.gantry_top = { x: wx + 0.5, y: G - 0.2 + TOP * 0.1, z: wz + SZ * 0.05 };
}

// ------------------------------------------------------------------ office block

/**
 * three-storey concrete-frame office: brick infill with ribbon windows, concrete slabs, plaster partitions,
 * U-stair core on the east side (lane A x 118..131, lane B x 133..146) running to a roof hatch.
 */
function office(sim: Sim, wx: number, wz: number, gy: number, m: Marks): void {
  const W = 150, D = 120, SH = 34, F = 3, NF = 3;
  const L = [F, F + SH, F + 2 * SH, F + 3 * SH]; // floor surfaces; L[3] = roof
  const g = new VoxelGrid(W, L[3] + 12, D);
  const plaster = shaded(MAT.plaster, 16, 3);
  box(g, 0, 0, 0, W, F, D, concFn);
  for (let f = 0; f < NF; f++) {
    const y0 = L[f], y1 = L[f + 1] - 3;
    shell(g, 0, y0, 0, W, y1, D, 2, brickFn);
    shell(g, 2, y0, 2, W - 2, y1, D - 2, 1, plaster);
    box(g, 0, y1, 0, W, L[f + 1], D, concFn); // slab (roof slab for the top floor)
    // ribbon windows between the frame columns
    for (let x = 6; x + 26 < W - 4; x += 36) { windowX(g, x, x + 26, y0 + 9, y0 + 25, 0, 3); windowX(g, x, x + 26, y0 + 9, y0 + 25, D - 3, D); }
    for (let z = 10; z + 26 < D - 4; z += 36) windowZ(g, z, z + 26, y0 + 9, y0 + 25, 0, 3);
  }
  // concrete frame: columns at the corners and every 3.6 m
  for (let x = 0; x < W; x += 36) for (const z of [0, D - 3]) { const xx = Math.min(x, W - 3); box(g, xx, F, z, xx + 3, L[3], z + 3, concFn); }
  for (let z = 36; z < D - 3; z += 36) for (const x of [0, W - 3]) box(g, x, F, z, x + 3, L[3], z + 3, concFn);
  box(g, 0, L[3], 0, W, L[3] + 6, 2, concFn); box(g, 0, L[3], D - 2, W, L[3] + 6, D, concFn);
  box(g, 0, L[3], 0, 2, L[3] + 6, D, concFn); box(g, W - 2, L[3], 0, W, L[3] + 6, D, concFn);
  // partitions: stair-core wall (x 116), a cross wall with doors, small offices on the upper floors
  const part = (f: number, axis: 'x' | 'z', at: number, a0: number, a1: number, doors: number[]) => {
    const y0 = L[f], y1 = L[f + 1] - 3;
    if (axis === 'x') { box(g, at, y0, a0, at + 2, y1, a1, plaster); for (const d of doors) clear(g, at, y0, d, at + 2, y0 + 21, d + 11); }
    else { box(g, a0, y0, at, a1, y1, at + 2, plaster); for (const d of doors) clear(g, d, y0, at, d + 11, y0 + 21, at + 2); }
  };
  for (let f = 0; f < NF; f++) {
    part(f, 'x', 116, 3, D - 3, [16, 90]);
    part(f, 'z', 56, 3, 116, f === 0 ? [30, 80] : [18, 58, 96]);
    if (f > 0) { part(f, 'x', 40, 3, 56, []); part(f, 'x', 78, 3, 56, []); part(f, 'x', 58, 58, D - 3, []); }
  }
  // stairs: f0 lane A (+z), f1 lane B (-z), f2 lane A (+z) to the roof
  const step = flat(MAT.concrete, 3);
  clear(g, 118, L[1] - 3, 30, 131, L[1], 81); clear(g, 133, L[2] - 3, 30, 147, L[2], 81); clear(g, 118, L[3] - 3, 30, 131, L[3], 81);
  stairs(g, 'z', 30, 1, 118, 131, L[0], SH, step);
  stairs(g, 'z', 81, -1, 133, 147, L[1], SH, step);
  stairs(g, 'z', 30, 1, 118, 131, L[2], SH, step);
  for (let f = 0; f < NF; f++) box(g, 131, L[f], 30, 133, L[f + 1] - 3, 81, plaster);
  const rail = flat(MAT.steel, 1);
  railing(g, 'x', 118, 131, 29, L[1], rail); railing(g, 'x', 133, 147, 81, L[2], rail); railing(g, 'x', 118, 131, 29, L[3], rail);
  railing(g, 'z', 30, 81, 117, L[3], rail); railing(g, 'z', 30, 82, 131, L[3], rail);
  // door (south), reception desk, lamps
  clear(g, 50, F, D - 3, 62, F + 22, D);
  box(g, 40, F, 80, 70, F + 10, 86, planks(MAT.wood, 3, 4));
  for (let f = 0; f < NF; f++) for (const [lx, lz] of [[30, 30], [90, 30], [30, 90], [90, 90], [130, 100]]) box(g, lx - 2, L[f + 1] - 4, lz - 2, lx + 2, L[f + 1] - 3, lz + 2, pal(MAT.lamp));
  addStatic(sim, g, wx, gy - 0.2, wz, 'office', ['office']);
  const P = (lx: number, f: number, lz: number): V3 => ({ x: wx + lx * 0.1, y: gy - 0.2 + L[f] * 0.1 + 0.02, z: wz + lz * 0.1 });
  for (let f = 0; f < NF; f++) {
    { const p = P(10, f, 10); table(sim, p.x, p.y, p.z, 16, 8); }
    { const p = P(14, f, 20); chair(sim, p.x, p.y, p.z); }
    { const p = P(90, f, 6); shelf(sim, p.x, p.y, p.z); }
  }
  { const p = P(20, 2, 70); table(sim, p.x, p.y, p.z, 20, 10); }
  m.office_door = P(56, 0, D + 6);
  m.office_lobby = P(56, 0, 100);
  m.office_top = P(30, 2, 30);
  m.office_roof = P(80, 3, 60);
}

// ------------------------------------------------------------------ level

export const works: LevelDef = {
  id: 'works',
  title: 'Brackwater Works',
  build(sim: Sim): LevelInfo {
    const seed = 41;
    const hm = new RoadHeightmap((x, z) => {
      const n = fbm2(x * 0.04 + 1, z * 0.04 + 5, seed);
      const yard = G + (n - 0.5) * 0.3;
      const d = Math.abs(z - CANAL_Z);
      return yard + (-2.6 - n * 0.4 - yard) * (1 - smoothstep(4.6, 5.2, d));
    });
    hm.addPad(-64, -51.2, 64, 10.6, G, 1, MAT.concrete);        // north yard (concrete hardstanding)
    hm.addPad(-64, 23.4, 64, 51.2, G, 1, MAT.concrete);         // south yard
    hm.addPad(-64, -1, 62, 5, G, 1, MAT.asphalt);               // main road
    hm.addPad(-31, 5, -23, 10.6, G, 1, MAT.asphalt);            // road to the bridge
    hm.addPad(-31, 23.4, -23, 51.2, G, 1, MAT.asphalt);         // south road
    hm.addPad(-64, 5, -40, 10.6, G, 1, MAT.asphalt);            // car park
    hm.addPad(-64, -51.2, -42, -22, G, 1, MAT.grass);           // lawn behind the office
    hm.addPad(36, -32, 62, -10, G, 1, MAT.rock);                // tank farm (gravel)
    hm.addPad(46, 25, 63, 37, G, 1, MAT.dirt);                  // scrap yard
    const ter = buildTerrain(sim, { x0: -64, z0: -51.2, tilesX: 5, tilesZ: 4, heightmap: hm, waterLevel: WATER, seed });
    void ter;
    const m: Marks = {};

    // --- north bank
    factoryHall(sim, -40, -44, G, 'e', 'factory west', m, 'factory_door_a');
    factoryHall(sim, -18, -44, G, 'w', 'factory east', m, 'factory_door_b');
    m.factory_hall = { x: -18, y: G, z: -31.5 };
    m.factory_side = { x: -41, y: G, z: -31.6 };
    m.factory_yard = { x: -10, y: G, z: -12 };
    chimney(sim, 10, G, -27, m);
    {
      const g = makeBuilding({ w: 140, d: 110, floors: 1, floorH: 50, wall: MAT.brick, roof: 'gable', roofMat: MAT.sheetmetal, doors: 'sw', doorW: 14, doorH: 24, winStep: 30, lamps: true, seed: 12 });
      // boiler on saddles + flue stub
      for (const sx of [40, 95]) box(g, sx, 3, 40, sx + 6, 14, 70, flat(MAT.concrete, 2));
      cylinderX(g, 24, 55, 13, 25, 115, shaded(MAT.paintedmetal, 12, 6), 2);
      cylinderX(g, 24, 55, 13, 25, 27, steel); cylinderX(g, 24, 55, 13, 113, 115, steel);
      placeBuilding(sim, g, 15, G, -47, 'boiler house');
      m.boiler_house = { x: 15 + 7, y: G, z: -47 + 9.5 };
    }
    silos(sim, 30, -50, G, m);
    // tank farm inside a concrete bund wall (entry gap at the south-west corner)
    wallRun(sim, 36.5, G, -32, 25.5, false, 1.2, 3, MAT.concrete, MAT.concrete);
    wallRun(sim, 36.5, G, -31.5, 21.5, true, 1.2, 3, MAT.concrete, MAT.concrete);
    wallRun(sim, 61.5, G, -31.5, 21.5, true, 1.2, 3, MAT.concrete, MAT.concrete);
    wallRun(sim, 39.5, G, -10.5, 22.5, false, 1.2, 3, MAT.concrete, MAT.concrete);
    for (const [tx, tz] of [[43, -26], [55, -26], [43, -16], [55, -16]]) tank(sim, tx, G, tz, 17, 52, true);
    m.tank_farm = { x: 49, y: G, z: -21 };
    for (const [bx, bz] of [[38, -12.5], [38.7, -12.4]]) barrel(sim, bx, G + 0.12, bz, true);
    // pipe rack: boiler house / chimney -> tank farm, and along the factory front
    pipeRack(sim, -4, G, -16.2, 18); pipeRack(sim, 14, G, -16.2, 22.4);
    m.pipe_rack = { x: 10, y: G, z: -15.1 };
    // office block (3 storeys, concrete frame, plaster partitions, stairs to the roof)
    office(sim, -60, -15, G, m);
    // perimeter: brick wall west (gate) + north, sheet fence east + south
    wallRun(sim, -63.8, G, -51.2, 50.2, true, 2.2, 2, MAT.brick, MAT.concrete, 20);
    wallRun(sim, -63.8, G, 5.6, 5.6, true, 2.2, 2, MAT.brick, MAT.concrete, 20);
    wallRun(sim, -63.8, G, 23, 28.2, true, 2.2, 2, MAT.brick, MAT.concrete, 20);
    wallRun(sim, -61.6, G, -51.0, 125, false, 2.2, 2, MAT.brick, MAT.concrete, 20);
    for (const [z0, z1] of [[-50.8, -30], [-30, -10], [-10, 11.4], [22.4, 36], [36, 50.4]]) fence(sim, 63.4, G, z0, z1 - z0, true, MAT.sheetmetal, 18);
    for (let x = -62; x < 62; x += 20) fence(sim, x, G, 50.4, Math.min(20, 63 - x), false, MAT.sheetmetal, 18);
    for (const gz of [-1.6, 5.6]) wallSeg(sim, -64, G, gz, 0.6, true, 2.8, 4, MAT.brick, MAT.concrete); // gate piers
    m.gate = { x: -62.5, y: G, z: 2 };
    m.parking = { x: -52, y: G, z: 8 };

    // --- canal: quay walls, bridges
    for (const qz of [11.6, 22.0]) for (const [x0, x1] of [[-64, -30.3], [-23.7, 37.9], [40.7, 64]]) wallRun(sim, x0, -2.6, qz, x1 - x0, false, 4.6, 3, MAT.concrete, MAT.concrete, 20);
    roadBridge(sim, -30.2, 10.0, m);
    footbridge(sim, 38, 10.0, m);
    m.canal_dump = { x: -45, y: WATER, z: CANAL_Z };
    m.canal_dump_east = { x: 52, y: WATER, z: CANAL_Z };

    // --- south bank
    loadingDock(sim, -14, 26.5, m);
    const cols = [MAT.paintedmetal, MAT.sheetmetal, MAT.plastic, MAT.paintedmetal, MAT.sheetmetal];
    let k = 0;
    for (const [cx, cz, two] of [[16, 26.5, 1], [16, 29.4, 0], [24, 26.5, 1], [24, 32.3, 1], [32, 26.5, 0], [32, 32.3, 1], [16, 35.2, 0], [40, 29.4, 1]] as const) {
      container(sim, cx, G, cz, cols[k++ % cols.length]);
      if (two) container(sim, cx, G + 2.6, cz, cols[k++ % cols.length]);
    }
    m.container_yard = { x: 28, y: G, z: 37.5 };
    for (let i = 0; i < 22; i++) {
      const sx = 48 + hash3(i, 1, 0, seed) * 13, sz = 26 + hash3(i, 2, 0, seed) * 10;
      scrap(sim, sx, G + 0.12, sz, i);
    }
    for (const [sx, sz] of [[50, 36], [52, 36.4]]) barrel(sim, sx, G + 0.12, sz, false);
    m.scrap_yard = { x: 54, y: G, z: 31 };
    // rail siding + wagons + gantry crane
    for (let i = 0; i < 5; i++) track(sim, -64 + i * 25.6, 43.5, 25.6);
    wagon(sim, -44, 43.6, 'box', m);
    wagon(sim, -2, 43.6, 'gondola', m);
    wagon(sim, 11, 43.6, 'tank', m);
    m.rail_siding = { x: -20, y: G + 0.6, z: 45 };
    gantryCrane(sim, 1, 39.0, m);

    // --- lamps
    for (let lx = -50; lx <= 56; lx += 16) streetLamp(sim, lx, G, 5.6, true);
    for (const [lx, lz] of [[-22, 30], [-22, 40], [10, 41], [44, 40], [-44, -20], [-26, -16], [60, -36], [32, -8]]) streetLamp(sim, lx, G, lz);

    const spawn = { x: -58.5, y: G + 0.1, z: 2 }; // +0.1: a player created exactly on a voxel surface can start stuck
    m.escape = { x: -58.5, y: G, z: -0.2 };
    m.heli_start = { x: -95, y: 45, z: 95 };
    return {
      name: 'Brackwater Works',
      spawn,
      spawnYaw: -Math.PI / 2,
      bounds: { min: { x: -64, y: -6, z: -51.2 }, max: { x: 64, y: 40, z: 51.2 } },
      waterLevel: WATER,
      sunDir: { x: -0.35, y: -0.82, z: 0.45 },
      sky: 'overcast',
      markers: m,
    };
  },
};
