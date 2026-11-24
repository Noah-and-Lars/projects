import { box, clear, cylinderY, flat, planks, shaded, shell, windowX, windowZ, type PalFn } from '../build';
import { MAT, pal } from '../materials';
import { hash3 } from '../rng';
import type { Sim } from '../sim';
import type { V3 } from '../vec';
import { VoxelGrid } from '../voxels';
import { barrel, boat, crate, pier, pine, rock, shelf, table, tree } from './kit';
import { RoadHeightmap, addStatic, bed, bookcase, chair, hedge, plant, railing, sculpture, sofa, stairs, streetLamp, wallRun } from './kit2';
import { buildTerrain, fbm2, smoothstep } from './terrain';
import type { LevelDef, LevelInfo } from './types';

/**
 * KESTREL RIDGE — a wealthy hillside estate above a lake at dusk. 4x4 terrain tiles (102.4 m square,
 * x/z in [-51.2, 51.2]), lake to the south (+z, water level 0), the hill rises to the north (-z).
 *
 * Levels (ground heights): lakeshore road 1.2 m, lower terrace "T1" 6.8 m (gallery + pool), estate terrace
 * "T2" 13.0 m (mansion, garage, garden, gazebo), east lawn "T3" 13.0 m (greenhouse) across a ravine,
 * hilltop 20 m (watchtower). A switchback road climbs from the spawn lot (SE corner) along the shore, west
 * up to a hairpin on T1, then east up to the mansion forecourt.
 *
 * Markers (all world positions at floor level unless noted):
 *   escape            van spot beside the spawn, east end of the shore road
 *   shore_road        shore road west end (boathouse turn-off)
 *   hairpin           road hairpin on T1, east of the gallery
 *   forecourt         mansion forecourt (concrete), top of the road
 *   mansion_front     mansion front door (south facade, under the balcony/portico)
 *   mansion_back      mansion back door (north facade, garden side)
 *   mansion_hall      ground-floor central hall
 *   mansion_living    ground-floor living room (west, fireplace)
 *   mansion_library   ground-floor library (north-west)
 *   mansion_dining    ground-floor dining room (east)
 *   mansion_kitchen   ground-floor kitchen (north-east)
 *   mansion_stairs    foot of the stair core (ground floor, east side; flights go down to the basement and up)
 *   mansion_study     first-floor study (south-east) — good spot for a safe / documents
 *   mansion_bedroom   first-floor master bedroom (north-west)
 *   mansion_balcony   first-floor balcony over the front door
 *   mansion_attic     second-floor games room / attic gallery (east)
 *   mansion_suite     second-floor suite (west)
 *   basement          basement storage hall (foot of the cellar stairs)
 *   wine_cellar       basement wine cellar (the vault door opens into it)
 *   vault             inside the basement vault (0.5 m concrete walls + ceiling)
 *   vault_door        in front of the steel vault door (cellar side)
 *   garage            inside the 3-bay garage (east of the mansion)
 *   garage_door       in front of the middle garage door (each door 3.2 m wide x 2.7 m high)
 *   gazebo            centre of the garden gazebo (south-west of the mansion)
 *   garden            formal hedge garden
 *   gallery           inside the glass gallery / pool house (art on plinths)
 *   gallery_door      sliding-door gap in the gallery's glass front
 *   gallery_roof      roof terrace of the gallery (external steel stair on its east side)
 *   pool              bottom of the (drained) pool in front of the gallery
 *   boathouse         boathouse interior deck
 *   boathouse_slip    boat slip inside the boathouse (water)
 *   jetty_end         far end of the jetty
 *   lake_dump         deep water south of the jetty (dump objectives here)
 *   lake_dump_east    deep water off the east shore below the spawn
 *   vineyard          vine rows on the slope between the two road legs
 *   ravine            ravine floor under the footbridge
 *   footbridge        middle of the wooden footbridge (T2 <-> T3)
 *   greenhouse        inside the greenhouse (east lawn)
 *   greenhouse_door   greenhouse door (west end, facing the footbridge)
 *   watchtower_door   watchtower entrance (hilltop)
 *   watchtower_top    watchtower top platform (~16 m above the hilltop)
 *   hilltop           hilltop plateau beside the tower
 *   heli_start        helicopter spawn far outside the map (north-east, high)
 */

const LAKE = 0;
const SHORE = 1.2;
const T1 = 6.8;
const T2 = 13.0;
const HILL = 20.0;

type Marks = Record<string, V3>;

/** coarse brick courses (big uniform patches keep greedy quads large; the shader adds the grain) */
const brickFn: PalFn = (x, y, z) => { const row = (y / 6) | 0; return pal(MAT.brick, (hash3(((x + z + (row % 2) * 8) / 16) | 0, row, 0, 4) * 4) | 0); };
const concFn = shaded(MAT.concrete, 10, 2);
const plastFn = shaded(MAT.plaster, 16, 3);
const woodFloor = planks(MAT.wood, 4, 6, 'z'); // stripes along one axis only: each plank is one greedy quad

// ------------------------------------------------------------------ mansion

/** three-storey brick mansion with basement vault. (wx, wz) = min corner of the main block, gy = ground floor level */
function mansion(sim: Sim, wx: number, wz: number, gy: number, m: Marks): void {
  const W = 230, D = 150, DP = 26, SY = 192;
  const g = new VoxelGrid(W, SY, D + DP);
  const L = [37, 71, 105, 139]; // floor surfaces: ground, first, second, roof top
  const y0w = gy - L[0] * 0.1;
  const W2 = (lx: number, ly: number, lz: number): V3 => ({ x: wx + lx * 0.1, y: y0w + ly * 0.1, z: wz + lz * 0.1 });

  // basement: concrete box, ground-floor slab in concrete
  box(g, 0, 0, 0, W, 3, D, concFn);
  shell(g, 0, 3, 0, W, 34, D, 4, concFn);
  box(g, 0, 34, 0, W, 37, D, concFn);
  box(g, 4, 36, 4, W - 4, 37, D - 4, woodFloor);
  // storeys: brick walls with plaster lining, wooden slabs, concrete roof slab
  for (let f = 0; f < 3; f++) {
    const y0 = L[f], y1 = L[f + 1] - 3;
    shell(g, 0, y0, 0, W, L[f + 1], D, 3, brickFn);
    shell(g, 3, y0, 3, W - 3, y1, D - 3, 1, plastFn);
    box(g, 3, y1, 3, W - 3, L[f + 1], D - 3, f === 2 ? concFn : woodFloor);
    // stone string course between storeys
    if (f > 0) { box(g, 0, y0 - 2, 0, W, y0, 1, flat(MAT.marble, 1)); box(g, 0, y0 - 2, D - 1, W, y0, D, flat(MAT.marble, 1)); box(g, 0, y0 - 2, 0, 1, y0, D, flat(MAT.marble, 1)); box(g, W - 1, y0 - 2, 0, W, y0, D, flat(MAT.marble, 1)); }
  }
  // partitions (2-voxel plaster) with 11x21 doorways
  const part = (f: number) => {
    const y0 = f < 0 ? 3 : L[f], y1 = f < 0 ? 34 : L[f + 1] - 3;
    return {
      x: (x: number, z0: number, z1: number, doors: number[] = []) => { box(g, x, y0, z0, x + 2, y1, z1, plastFn); for (const d of doors) clear(g, x, y0, d, x + 2, y0 + 21, d + 11); },
      z: (z: number, x0: number, x1: number, doors: number[] = []) => { box(g, x0, y0, z, x1, y1, z + 2, plastFn); for (const d of doors) clear(g, d, y0, z, d + 11, y0 + 21, z + 2); },
    };
  };
  // --- basement: vault (NW), wine cellar, storage hall
  const B = part(-1);
  shell(g, 4, 3, 4, 76, 34, 66, 5, concFn); // vault walls 0.5 m
  box(g, 9, 29, 9, 71, 34, 61, concFn);    // vault ceiling (+ the floor slab above)
  clear(g, 71, 3, 29, 76, 25, 41);          // vault doorway (east wall) ...
  // ... closed by an old armoured door of riveted plate (painted metal: a blowtorch, shotgun or pipe bomb gets
  // through it; with a steel slab the vault could only be opened with tools unlocked after this mission)
  box(g, 72, 3, 29, 74, 25, 41, flat(MAT.paintedmetal, 1));
  box(g, 74, 12, 33, 75, 16, 37, pal(MAT.paintedmetal, 0)); // hand wheel
  for (const z0 of [12, 30, 48]) { // steel racks inside the vault
    box(g, 9, 3, z0, 13, 26, z0 + 10, flat(MAT.steel, 2));
    clear(g, 9, 4, z0 + 1, 12, 11, z0 + 9); clear(g, 9, 12, z0 + 1, 12, 18, z0 + 9); clear(g, 9, 19, z0 + 1, 12, 25, z0 + 9);
  }
  B.z(66, 76, 152, [110]); B.x(150, 4, 66, [30]);
  // wine racks along the cellar's north wall
  box(g, 80, 3, 4, 148, 24, 10, planks(MAT.wood, 3, 2));
  for (let x = 81; x < 147; x += 2) for (let y = 5; y < 23; y += 3) g.set(x, y, 9, pal(MAT.glass, (x + y) % 3));
  for (const [lx, lz, ly] of [[40, 35, 27], [112, 35, 32], [180, 100, 32], [60, 110, 32], [120, 110, 32]]) box(g, lx - 2, ly, lz - 2, lx + 2, ly + 2, lz + 2, pal(MAT.lamp));

  // --- ground floor
  const G0 = part(0);
  G0.x(90, 4, D - 4, [25, 100]);
  G0.z(60, 4, 90, [40]);
  G0.x(140, 4, D - 4, [30, 100]);
  G0.z(70, 142, 194, [162]);
  G0.x(194, 40, 92); // stair-core wall beside the basement flight's opening
  // fireplace + chimney breast (west wall of the living room)
  box(g, 0, L[0], 96, 12, SY - 6, 114, brickFn);
  clear(g, 4, L[0], 100, 12, L[0] + 10, 110);
  box(g, 4, L[0], 100, 8, L[0] + 1, 110, pal(MAT.char, 1));

  // --- first floor
  const G1 = part(1);
  G1.z(60, 4, 140, [30, 100]);
  G1.z(76, 4, 194, [40, 110, 165]);
  G1.x(70, 4, 60); G1.x(90, 78, D - 4); G1.x(140, 78, D - 4); G1.x(194, 78, 92);
  // --- second floor
  const G2 = part(2);
  G2.x(110, 4, D - 4, [60]);

  // --- windows (glass inside the brick, lining cut through)
  for (let f = 0; f < 3; f++) {
    const y0 = L[f] + 8, y1 = L[f] + (f === 0 ? 26 : 24);
    for (let x = 14; x + 12 < W - 6; x += 26) {
      const xc = x + 6;
      if (!(f === 0 && xc > 98 && xc < 132) && !(f === 1 && xc > 98 && xc < 132)) windowX(g, x, x + 12, y0, y1, D - 4, D);
      if (!(f === 0 && xc > 98 && xc < 132)) windowX(g, x, x + 12, y0, y1, 0, 4);
    }
    for (let z = 16; z + 12 < D - 6; z += 26) {
      if (!(z + 12 > 94 && z < 116)) windowZ(g, z, z + 12, y0, y1, 0, 4);
      if (!(z + 12 > 36 && z < 95)) windowZ(g, z, z + 12, y0, y1, W - 4, W);
    }
  }
  // doors: front (double, south), back (north), balcony
  clear(g, 108, L[0], D - 4, 122, L[0] + 24, D);
  clear(g, 109, L[0], 0, 120, L[0] + 22, 4);
  clear(g, 109, L[1], D - 4, 121, L[1] + 23, D);

  // --- stair core (east side): lane B x 196..209, divider 209..211, lane A x 211..226
  const step = planks(MAT.wood, 3, 13, 'z');
  clear(g, 196, 34, 40, 209, 37, 91);            // ground slab opening over the basement flight
  clear(g, 211, L[1] - 3, 40, 226, L[1], 91);    // first-floor opening over flight 1
  clear(g, 196, L[2] - 3, 40, 209, L[2], 91);    // second-floor opening over flight 2
  stairs(g, 'z', 40, 1, 196, 209, 3, 34, step);       // basement -> ground (northward up = +z)
  stairs(g, 'z', 91, -1, 211, 226, L[0], 34, step);   // ground -> first
  stairs(g, 'z', 40, 1, 196, 209, L[1], 34, step);    // first -> second
  for (const f of [0, 1]) box(g, 209, L[f], 40, 211, L[f + 1] - 3, 91, plastFn);
  const bal = flat(MAT.wood, 0);
  railing(g, 'x', 196, 209, 39, L[0], bal);            // ground: end of the basement opening
  railing(g, 'x', 211, 226, 91, L[1], bal);            // first: end of flight-1 opening
  railing(g, 'x', 196, 209, 39, L[2], bal);            // second: end of flight-2 opening
  railing(g, 'z', 40, 91, 209, L[2], bal); railing(g, 'z', 40, 91, 195, L[2], bal);

  // --- ceiling lamps
  for (let f = 0; f < 3; f++) for (const [lx, lz] of [[45, 30], [45, 110], [115, 40], [115, 110], [168, 35], [168, 110], [212, 120]])
    box(g, lx - 2, L[f + 1] - 4, lz - 2, lx + 2, L[f + 1] - 3, lz + 2, pal(MAT.lamp));

  // --- roof: hip roof in tiles on the concrete slab, two chimney stacks
  const tile = shaded(MAT.tile, 12, 5);
  // terraced hip roof (rise 4 every 8): big flat terraces keep the greedy mesher's quad count low
  for (let i = 0; ; i++) {
    const ins = 8 * i, y = L[3] + 4 * i;
    if (D - 2 * ins <= 24) { box(g, ins, y, ins, W - ins, y + 4, D - ins, tile); break; }
    shell(g, ins, y, ins, W - ins, y + 4, D - ins, 10, tile);
  }
  box(g, 180, L[2], 30, 190, SY - 6, 44, brickFn);
  box(g, 0, SY - 8, 96, 12, SY - 6, 114, flat(MAT.concrete, 1)); box(g, 180, SY - 8, 30, 190, SY - 6, 44, flat(MAT.concrete, 1));

  // --- portico + balcony (front, south)
  box(g, 80, L[1] - 3, D, 150, L[1], D + 22, concFn);
  for (const cx of [85, 145]) cylinderY(g, cx, D + 17, 3, L[0], L[1] - 3, flat(MAT.marble, 2));
  railing(g, 'x', 80, 150, D + 21, L[1], flat(MAT.marble, 1), 10);
  railing(g, 'z', D, D + 22, 80, L[1], flat(MAT.marble, 1), 10);
  railing(g, 'z', D, D + 22, 149, L[1], flat(MAT.marble, 1), 10);

  addStatic(sim, g, wx, y0w, wz, 'mansion', ['mansion']);

  // --- furniture (dynamic)
  const P = (lx: number, ly: number, lz: number) => W2(lx, ly + 0.2, lz);
  const f0 = L[0], f1 = L[1], f2 = L[2];
  // living room
  { const p = P(30, f0, 120); sofa(sim, p.x, p.y, p.z); }
  { const p = P(55, f0, 120); sofa(sim, p.x, p.y, p.z, 0, MAT.fabric); }
  { const p = P(40, f0, 100); table(sim, p.x, p.y, p.z, 16, 9); }
  { const p = P(70, f0, 140); bookcase(sim, p.x, p.y, p.z, 0, 1); }
  // library
  for (let i = 0; i < 4; i++) { const p = P(10 + i * 18, f0, 5); bookcase(sim, p.x, p.y, p.z, 0, 10 + i); }
  { const p = P(40, f0, 30); table(sim, p.x, p.y, p.z, 16, 9); }
  { const p = P(44, f0, 42); chair(sim, p.x, p.y, p.z); }
  // dining room: long table and chairs
  { const p = P(150, f0, 100); table(sim, p.x, p.y, p.z, 30, 10); }
  for (const lx of [152, 162, 172]) { const a = P(lx, f0, 92); chair(sim, a.x, a.y, a.z); const b = P(lx, f0, 113); chair(sim, b.x, b.y, b.z); }
  // kitchen
  { const p = P(150, f0, 20); table(sim, p.x, p.y, p.z, 20, 10); }
  { const p = P(172, f0, 6); shelf(sim, p.x, p.y, p.z); }
  // hall
  { const p = P(96, f0, 130); plant(sim, p.x, p.y, p.z, 1); }
  { const p = P(130, f0, 130); plant(sim, p.x, p.y, p.z, 2); }
  // first floor: bedrooms, sitting room, study
  { const p = P(20, f1, 20); bed(sim, p.x, p.y, p.z); }
  { const p = P(90, f1, 20); bed(sim, p.x, p.y, p.z); }
  { const p = P(30, f1, 110); bed(sim, p.x, p.y, p.z); }
  { const p = P(100, f1, 110); sofa(sim, p.x, p.y, p.z); }
  { const p = P(160, f1, 120); table(sim, p.x, p.y, p.z, 18, 9); }
  { const p = P(166, f1, 132); chair(sim, p.x, p.y, p.z); }
  { const p = P(150, f1, 80); bookcase(sim, p.x, p.y, p.z, 0, 21); }
  { const p = P(205, f1, 140); bookcase(sim, p.x, p.y, p.z, 0, 22); }
  // second floor: suite + games room
  { const p = P(40, f2, 60); bed(sim, p.x, p.y, p.z); }
  { const p = P(70, f2, 120); sofa(sim, p.x, p.y, p.z, 0, MAT.fabric); }
  { const p = P(150, f2, 70); table(sim, p.x, p.y, p.z, 24, 14); }
  { const p = P(140, f2, 120); shelf(sim, p.x, p.y, p.z); }
  // basement: crates and shelves in the storage hall, crates in the cellar
  for (const [lx, lz] of [[160, 110], [169, 112], [164, 120], [100, 30], [108, 40]]) { const p = P(lx, 3, lz); crate(sim, p.x, p.y, p.z, 8); }
  { const p = P(30, 3, 130); shelf(sim, p.x, p.y, p.z); }
  { const p = P(60, 3, 130); shelf(sim, p.x, p.y, p.z); }

  // --- markers
  m.mansion_front = W2(115, f0, D + 12);
  m.mansion_back = W2(115, f0, -10);
  m.mansion_hall = W2(115, f0, 75);
  m.mansion_living = W2(45, f0, 110);
  m.mansion_library = W2(45, f0, 30);
  m.mansion_dining = W2(165, f0, 110);
  m.mansion_kitchen = W2(165, f0, 35);
  m.mansion_stairs = W2(218, f0, 100);
  m.mansion_study = W2(170, f1, 110);
  m.mansion_bedroom = W2(35, f1, 30);
  m.mansion_balcony = W2(115, f1, D + 12);
  m.mansion_attic = W2(170, f2, 110);
  m.mansion_suite = W2(55, f2, 90);
  m.basement = W2(200, 3, 30);
  m.wine_cellar = W2(110, 3, 40);
  m.vault = W2(40, 3, 35);
  m.vault_door = W2(84, 3, 35);
}

// ------------------------------------------------------------------ garage

function garage(sim: Sim, wx: number, wz: number, gy: number, m: Marks): void {
  const W = 140, D = 100, H = 37;
  const g = new VoxelGrid(W, H + 8, D);
  box(g, 0, 0, 0, W, 3, D, concFn);
  shell(g, 0, 3, 0, W, H, D, 3, brickFn);
  box(g, 0, H, 0, W, H + 3, D, concFn);
  shell(g, 0, H + 3, 0, W, H + 6, D, 1, flat(MAT.concrete, 1));
  for (const x0 of [8, 54, 100]) { clear(g, x0, 3, D - 3, x0 + 32, 30, D); box(g, x0 - 1, 30, D - 3, x0 + 33, 32, D, flat(MAT.steel, 1)); }
  clear(g, 0, 3, 45, 3, 24, 56); // side door toward the mansion
  for (let x = 14; x < W - 14; x += 30) windowX(g, x, x + 12, 16, 28, 0, 3);
  windowZ(g, 30, 44, 16, 28, W - 3, W); windowZ(g, 60, 74, 16, 28, W - 3, W);
  for (const lx of [24, 70, 116]) box(g, lx - 2, H - 1, 48, lx + 2, H, 52, pal(MAT.lamp));
  // inspection pit edge marking / workbench along the back wall
  box(g, 10, 3, 3, 60, 12, 10, planks(MAT.wood, 3, 7));
  addStatic(sim, g, wx, gy - 0.2, wz, 'garage', ['garage']);
  const P = (lx: number, lz: number): V3 => ({ x: wx + lx * 0.1, y: gy + 0.12, z: wz + lz * 0.1 });
  { const p = P(70, 4); shelf(sim, p.x, p.y, p.z); }
  { const p = P(95, 4); shelf(sim, p.x, p.y, p.z); }
  for (const [lx, lz, ex] of [[124, 10, 1], [131, 10, 1], [127, 17, 0]] as const) { const p = P(lx, lz); barrel(sim, p.x, p.y, p.z, !!ex); }
  { const p = P(30, 14); crate(sim, p.x, p.y, p.z, 7); }
  m.garage = P(70, 50);
  m.garage_door = P(70, D + 8);
}

// ------------------------------------------------------------------ glass gallery / pool house

function gallery(sim: Sim, wx: number, wz: number, gy: number, m: Marks): void {
  const W = 220, D = 110, H = 43; // interior floor y = 3, roof slab 43..46
  const SX = W + 18;
  const g = new VoxelGrid(SX, H + 14, D);
  const glass = pal(MAT.glass, 2);
  box(g, 0, 0, 0, W, 3, D, concFn);
  box(g, 4, 2, 4, W - 4, 3, D - 4, flat(MAT.marble, 1));
  // back wall (north) + side walls in concrete, roof slab
  box(g, 0, 3, 0, W, H, 4, concFn);
  box(g, 0, 3, 0, 4, H, D, concFn); box(g, W - 4, 3, 0, W, H, D, concFn);
  box(g, 0, H, 0, W, H + 3, D, concFn);
  // tall slit windows in the side walls
  for (let z = 14; z < D - 14; z += 22) { windowZ(g, z, z + 8, 8, H - 6, 0, 4); windowZ(g, z, z + 8, 8, H - 6, W - 4, W); }
  // glass front on steel columns, sliding-door gap
  box(g, 4, 3, D - 2, W - 4, H, D - 1, glass);
  for (let x = 0; x < W; x += 44) { const cx = Math.min(x, W - 3); box(g, cx, 3, D - 3, cx + 3, H, D, flat(MAT.steel)); }
  box(g, 0, H - 2, D - 3, W, H, D, flat(MAT.steel));
  clear(g, 100, 3, D - 3, 114, 25, D);
  // interior glass partition: gallery (west) | pool lounge (east)
  box(g, 150, 3, 4, 151, H, D - 3, glass);
  clear(g, 150, 3, 48, 151, 25, 62);
  // plinths (marble) with art; paintings on the back wall
  const plinths = [[25, 40], [55, 70], [85, 40], [115, 70], [125, 30], [30, 80]];
  for (const [px, pz] of plinths) box(g, px - 4, 3, pz - 4, px + 4, 13, pz + 4, flat(MAT.marble, 3));
  for (let i = 0; i < 5; i++) {
    const x0 = 12 + i * 27;
    box(g, x0, 14, 4, x0 + 18, 30, 5, pal(MAT.wood, 0));
    box(g, x0 + 1, 15, 4, x0 + 17, 29, 5, pal([MAT.fabric, MAT.plastic, MAT.paintedmetal, MAT.fabric, MAT.gold][i], i % 5));
  }
  // light strips
  for (let x = 20; x < W - 10; x += 40) box(g, x, H - 1, 20, x + 16, H, 22, pal(MAT.lamp));
  for (let x = 20; x < W - 10; x += 40) box(g, x, H - 1, 80, x + 16, H, 82, pal(MAT.lamp));
  // roof terrace: glass balustrade, steel stair on the east side
  const R = H + 3;
  box(g, 0, R, 0, W, R + 10, 1, glass); box(g, 0, R, D - 1, W, R + 10, D, glass); box(g, 0, R, 0, 1, R + 10, D, glass);
  box(g, W - 1, R, 0, W, R + 10, 28, glass); box(g, W - 1, R, 40, W, R + 10, D, glass);
  const steelStep = flat(MAT.steel, 2);
  box(g, W, H, 26, W + 16, R, 40, steelStep); // top landing bolted to the roof slab
  stairs(g, 'z', D - 6, -1, W + 2, W + 16, 3, R - 3, steelStep, 4);
  for (let z = 44; z < D; z += 22) box(g, W + 14, 0, z, W + 16, 3 + Math.max(0, Math.floor((D - 6 - z) / 3) * 2) - 2, z + 2, steelStep);
  box(g, W + 14, 0, 26, W + 16, H, 28, steelStep);
  railing(g, 'x', W, W + 16, 26, R, flat(MAT.steel, 1), 10);
  addStatic(sim, g, wx, gy - 0.2, wz, 'gallery', ['gallery']);
  const P = (lx: number, ly: number, lz: number): V3 => ({ x: wx + lx * 0.1, y: gy - 0.2 + ly * 0.1 + 0.02, z: wz + lz * 0.1 });
  plinths.forEach(([px, pz], i) => { const p = P(px - 3, 13, pz - 3); sculpture(sim, p.x, p.y, p.z, i % 4); });
  { const p = P(165, 3, 30); sofa(sim, p.x, p.y, p.z); }
  { const p = P(190, 3, 60); sofa(sim, p.x, p.y, p.z, Math.PI / 2, MAT.plastic); }
  { const p = P(170, 3, 60); table(sim, p.x, p.y, p.z, 12, 8); }
  { const p = P(60, R, 50); table(sim, p.x, p.y, p.z, 12, 8); }
  { const p = P(90, R, 40); chair(sim, p.x, p.y, p.z); }
  m.gallery = P(70, 3, 55);
  m.gallery_door = P(107, 3, D + 10);
  m.gallery_roof = P(110, R, 55);
}

/** drained pool shell (tiles), top flush with the deck at `deckY` */
function pool(sim: Sim, wx: number, wz: number, deckY: number, m: Marks): void {
  const W = 120, D = 45, H = 18;
  const g = new VoxelGrid(W, H, D);
  const t = shaded(MAT.whitepaint, 10, 1);
  box(g, 0, 0, 0, W, 2, D, t);
  shell(g, 0, 2, 0, W, H, D, 2, t);
  shell(g, 0, H - 1, 0, W, H, D, 4, flat(MAT.concrete, 0));
  box(g, 2, 2, 2, W - 2, 3, D - 2, pal(MAT.fabric, 1)); // blue floor liner
  stairs(g, 'x', W - 2, -1, 4, 16, 2, 15, t); // steps down at the east end
  addStatic(sim, g, wx, deckY - H * 0.1 + 0.1, wz, 'pool');
  m.pool = { x: wx + 4, y: deckY - 1.5, z: wz + 2.2 };
}

// ------------------------------------------------------------------ boathouse

function boathouse(sim: Sim, wx: number, wz: number, deckY: number, m: Marks): void {
  const W = 100, D = 120, DK = 48; // deck voxels 48..50 -> deck top = deckY
  const y0w = deckY - (DK + 2) * 0.1;
  const g = new VoxelGrid(W, DK + 60, D);
  const wood = planks(MAT.wood, 3, 4);
  for (const px of [2, 34, 64, 95]) for (let pz = 2; pz < D; pz += 24) box(g, px, 0, pz, px + 3, DK, pz + 3, shaded(MAT.wood, 8, 2));
  box(g, 0, DK, 0, W, DK + 2, D, planks(MAT.wood, 3, 8, 'z'));
  clear(g, 32, DK, 40, 68, DK + 2, D); // boat slip
  const y1 = DK + 2 + 30;
  shell(g, 0, DK + 2, 0, W, y1, D, 2, wood);
  clear(g, 28, DK + 2, D - 2, 72, DK + 2 + 26, D); // lake door
  clear(g, 44, DK + 2, 0, 56, DK + 2 + 21, 2);     // land door
  for (const z of [20, 70]) { windowZ(g, z, z + 12, DK + 12, DK + 22, 0, 2); windowZ(g, z, z + 12, DK + 12, DK + 22, W - 2, W); }
  // gable roof, ridge along z
  const rf = shaded(MAT.tile, 12, 9);
  for (let i = 0; i <= W / 2; i++) {
    const yy = y1 + (i >> 1);
    box(g, i, yy, 0, i + 1, yy + 2, D, rf); box(g, W - 1 - i, yy, 0, W - i, yy + 2, D, rf);
    box(g, i, y1, 0, i + 1, yy, 2, wood); box(g, W - 1 - i, y1, 0, W - i, yy, 2, wood);
    box(g, i, y1, D - 2, i + 1, yy, D, wood); box(g, W - 1 - i, y1, D - 2, W - i, yy, D, wood);
  }
  box(g, 2, y1 - 6, 60, 3, y1 - 4, 64, pal(MAT.lamp)); box(g, W - 3, y1 - 6, 60, W - 2, y1 - 4, 64, pal(MAT.lamp));
  clear(g, 78, DK + 2, D - 2, 92, DK + 2 + 21, D); // walkway door to the jetty
  addStatic(sim, g, wx, y0w, wz, 'boathouse', ['boathouse']);
  const P = (lx: number, lz: number): V3 => ({ x: wx + lx * 0.1, y: deckY + 0.02, z: wz + lz * 0.1 });
  for (const [lx, lz] of [[8, 10], [8, 19], [16, 12]]) { const p = P(lx, lz); crate(sim, p.x, p.y, p.z, 8); }
  { const p = P(85, 12); barrel(sim, p.x, p.y, p.z, true); }
  { const p = P(85, 20); barrel(sim, p.x, p.y, p.z, false); }
  { const p = P(76, 50); shelf(sim, p.x, p.y, p.z, true); }
  boat(sim, wx + 4.2, LAKE + 0.1, wz + 11.2, Math.PI / 2);
  m.boathouse = P(15, 40);
  m.boathouse_slip = { x: wx + 5, y: LAKE, z: wz + 9 };
}

// ------------------------------------------------------------------ watchtower

/** square stone tower with a wooden stair spiralling along the inside walls */
function watchtower(sim: Sim, cx: number, gy: number, cz: number, m: Marks): void {
  const S = 50, T = 4, TOP = 158;
  const g = new VoxelGrid(S, TOP + 16, S);
  const stone = shaded(MAT.rock, 7, 4);
  box(g, 0, 0, 0, S, 3, S, stone);
  shell(g, 0, 3, 0, S, TOP + 10, S, T, stone);
  // crenellations
  for (let i = 0; i < S; i += 8) { clear(g, i + 2, TOP + 5, 0, i + 6, TOP + 10, S); clear(g, 0, TOP + 5, i + 2, S, TOP + 10, i + 6); }
  // door (south) and arrow slits
  clear(g, 19, 3, S - T, 31, 24, S);
  for (let y = 30; y < TOP - 10; y += 28) { clear(g, 24, y, 0, 26, y + 10, T); clear(g, 0, y + 14, 24, T, y + 24, 26); clear(g, S - T, y + 7, 24, S, y + 17, 26); clear(g, 24, y + 21, S - T, 26, y + 31, S); }
  // spiral stair: lanes 10 wide along the walls, corner landings
  const wood = planks(MAT.wood, 3, 5);
  const a = T, b = S - T, lw = 10;
  let y = 3;
  const sides: { lane: [number, number, number, number] }[] = [];
  let side = 0;
  while (y < TOP - 3) {
    const rise = Math.min(14, TOP - y);
    if (side === 0) { stairs(g, 'x', a + lw, 1, a, a + lw, y, rise, wood, 4); sides.push({ lane: [a + lw, b - lw, a, a + lw] }); }
    if (side === 1) { stairs(g, 'z', a + lw, 1, b - lw, b, y, rise, wood, 4); sides.push({ lane: [b - lw, b, a + lw, b - lw] }); }
    if (side === 2) { stairs(g, 'x', b - lw, -1, b - lw, b, y, rise, wood, 4); sides.push({ lane: [a + lw, b - lw, b - lw, b] }); }
    if (side === 3) { stairs(g, 'z', b - lw, -1, a, a + lw, y, rise, wood, 4); sides.push({ lane: [a, a + lw, a + lw, b - lw] }); }
    y += rise;
    // landing in the next corner
    const [lx, lz] = [[b - lw, a], [b - lw, b - lw], [a, b - lw], [a, a]][side];
    box(g, lx, y - 4, lz, lx + lw, y, lz + lw, wood);
    side = (side + 1) % 4;
  }
  // top platform with a hatch over the last flight (+ the corner before it)
  box(g, T, TOP - 3, T, S - T, TOP, S - T, planks(MAT.wood, 4, 7));
  for (const s of sides.slice(-2)) { const [x0, x1, z0, z1] = s.lane; clear(g, x0, TOP - 3, z0, x1, TOP, z1); }
  const last = (side + 3) % 4; // corner reached before the final flight
  { const [lx, lz] = [[a, a], [b - lw, a], [b - lw, b - lw], [a, b - lw]][last]; clear(g, lx, TOP - 3, lz, lx + lw, TOP, lz + lw); }
  // the stonework stops at head height (local y 23 = 2 m above the floor); the lookout above is an old timber frame.
  // A tower of solid 0.4 m rock needed ~20 bombs to fell (tests/unit/levels.test.ts); with tools a player has when
  // "Spoiling the View" unlocks (6 bombs, 6 pipe bombs) it could not be brought down to the 4 m the job asks for.
  const timber = planks(MAT.wood, 2, 9);
  for (let yy = 23; yy < g.sy; yy++) for (let zz = 0; zz < S; zz++) for (let xx = 0; xx < S; xx++) {
    const p = g.get(xx, yy, zz);
    if (p && p >> 3 === MAT.rock) g.set(xx, yy, zz, timber(xx, yy, zz));
  }
  // brazier
  box(g, 22, TOP, 22, 28, TOP + 2, 28, flat(MAT.steel)); box(g, 23, TOP + 2, 23, 27, TOP + 3, 27, pal(MAT.lamp));
  const x0 = cx - S * 0.05, z0 = cz - S * 0.05;
  addStatic(sim, g, x0, gy - 0.2, z0, 'watchtower', ['tower']);
  m.watchtower_door = { x: cx, y: gy, z: z0 + S * 0.1 + 1.0 };
  m.watchtower_top = { x: cx - 1, y: gy - 0.2 + TOP * 0.1, z: cz - 1 };
}

// ------------------------------------------------------------------ small structures

function gazebo(sim: Sim, cx: number, gy: number, cz: number): void {
  const R = 26, S = R * 2 + 4, c = S / 2;
  const g = new VoxelGrid(S, 56, S);
  cylinderY(g, c, c, R, 0, 5, planks(MAT.wood, 3, 3));
  const posts: [number, number][] = [];
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) * Math.PI / 4; posts.push([Math.round(c + Math.cos(a) * (R - 3)) - 1, Math.round(c + Math.sin(a) * (R - 3)) - 1]); }
  for (const [px, pz] of posts) box(g, px, 5, pz, px + 2, 32, pz + 2, flat(MAT.whitepaint, 2));
  cylinderY(g, c, c, R - 1.5, 12, 14, flat(MAT.whitepaint, 1), 3);
  clear(g, c - 6, 12, c, c + 6, 14, S); // entrance (south)
  for (let k = 0; k < 14; k++) cylinderY(g, c, c, R + 1 - k * 2, 30 + k, 31 + k, shaded(MAT.tile, 10, 4), 3);
  cylinderY(g, c, c, 2, 30, 46, flat(MAT.whitepaint, 1));
  addStatic(sim, g, cx - c * 0.1, gy - 0.3, cz - c * 0.1, 'gazebo');
  table(sim, cx - 0.5, gy + 0.22, cz - 0.4, 10, 8);
  chair(sim, cx - 1.6, gy + 0.22, cz - 0.3);
  chair(sim, cx + 1.0, gy + 0.22, cz - 0.3, Math.PI);
}

/** glass greenhouse on a thin steel frame, door on the west end */
function greenhouse(sim: Sim, wx: number, wz: number, gy: number, m: Marks): void {
  const W = 90, D = 140, H = 30;
  const g = new VoxelGrid(W, H + 30, D);
  const glass = pal(MAT.glass, 1), steel = flat(MAT.steel, 2);
  box(g, 0, 0, 0, W, 3, D, concFn);
  shell(g, 0, 3, 0, W, 8, D, 2, brickFn);
  box(g, 1, 8, 0, 2, H, D, glass); box(g, W - 2, 8, 0, W - 1, H, D, glass);
  box(g, 0, 8, 1, W, H, 2, glass); box(g, 0, 8, D - 2, W, H, D - 1, glass);
  for (let z = 0; z < D; z += 14) { const zz = Math.min(z, D - 2); box(g, 0, 3, zz, 2, H, zz + 2, steel); box(g, W - 2, 3, zz, W, H, zz + 2, steel); }
  for (const x of [0, W - 2]) box(g, x, 3, D - 2, x + 2, H, D, steel);
  box(g, 0, H - 1, 0, W, H, 2, steel); box(g, 0, H - 1, D - 2, W, H, D, steel);
  box(g, 0, H - 1, 0, 2, H, D, steel); box(g, W - 2, H - 1, 0, W, H, D, steel);
  // gable glass roof (ridge along z) on steel rafters
  for (let i = 0; i < W / 2; i++) {
    const yy = H + Math.floor(i * 0.55);
    box(g, i, yy, 0, i + 1, yy + 2, D, glass); box(g, W - 1 - i, yy, 0, W - i, yy + 2, D, glass);
    for (let z = 0; z < D; z += 14) { const zz = Math.min(z, D - 2); box(g, i, yy, zz, i + 1, yy + 2, zz + 2, steel); box(g, W - 1 - i, yy, zz, W - i, yy + 2, zz + 2, steel); }
    box(g, i, H, 0, i + 1, yy, 1, glass); box(g, W - 1 - i, H, 0, W - i, yy, 1, glass);
    box(g, i, H, D - 1, i + 1, yy, D, glass); box(g, W - 1 - i, H, D - 1, W - i, yy, D, glass);
  }
  box(g, 44, H + 23, 0, 46, H + 26, D, steel);
  clear(g, 0, 3, 82, 2, 25, 94); // door, in line with the footbridge deck (it used to sit 0.9 m south of it, behind the railing end)
  // planting benches
  for (const x0 of [10, 60]) {
    box(g, x0, 3, 10, x0 + 20, 10, D - 10, planks(MAT.wood, 3, 2));
    box(g, x0 + 1, 9, 11, x0 + 19, 10, D - 11, flat(MAT.dirt, 2));
    for (let z = 14; z < D - 14; z += 9) box(g, x0 + 4 + ((z * 7) % 10), 10, z, x0 + 9 + ((z * 7) % 10), 13 + (z % 4), z + 5, shaded(MAT.leaves, 3, z));
  }
  addStatic(sim, g, wx, gy - 0.2, wz, 'greenhouse', ['greenhouse']);
  for (let i = 0; i < 4; i++) plant(sim, wx + 4.0, gy + 0.12, wz + 2 + i * 3.2, i);
  m.greenhouse = { x: wx + 4.5, y: gy, z: wz + 8.8 };
  m.greenhouse_door = { x: wx - 1, y: gy, z: wz + 8.8 };
}

/** wooden footbridge along x, posts anchored on both banks (ground at `gy`) */
function footbridge(sim: Sim, wx: number, gy: number, wz: number, len: number, m: Marks): void {
  const L = Math.round(len * 10), Wd = 16;
  const g = new VoxelGrid(L, 24, Wd);
  const wood = planks(MAT.wood, 3, 11, 'x');
  for (const x0 of [0, L - 5]) for (const z0 of [0, Wd - 3]) box(g, x0, 0, z0, x0 + 5, 21, z0 + 3, shaded(MAT.wood, 8, 3));
  box(g, 0, 9, 0, L, 11, Wd, wood);
  box(g, 0, 6, 1, L, 9, 4, flat(MAT.wood, 0)); box(g, 0, 6, Wd - 4, L, 9, Wd - 1, flat(MAT.wood, 0));
  railing(g, 'x', 0, L, 0, 11, flat(MAT.wood, 1), 10); railing(g, 'x', 0, L, Wd - 1, 11, flat(MAT.wood, 1), 10);
  addStatic(sim, g, wx, gy - 1.0, wz, 'footbridge');
  m.footbridge = { x: wx + len / 2, y: gy - 1.0 + 1.1, z: wz + 0.8 };
}

// ------------------------------------------------------------------ level

export const ridge: LevelDef = {
  id: 'ridge',
  title: 'Kestrel Ridge',
  build(sim: Sim): LevelInfo {
    const seed = 23;
    const ravineX = (z: number) => 34 + 1.5 * Math.sin(z * 0.11);
    const hm = new RoadHeightmap((x, z) => {
      const n = fbm2(x * 0.03 + 3, z * 0.03 + 9, seed);
      let h = SHORE + (T2 - SHORE) * smoothstep(14, -12, z) + (HILL + 0.5 - T2) * smoothstep(-26, -46, z) * smoothstep(-24, -44, x);
      h += (n - 0.5) * 2.4 * smoothstep(-2, 10, Math.abs(z - 2)) + (n - 0.5) * 1.2;
      // ravine on the east side, opening onto the shore
      if (z < 16) {
        const floor = SHORE + 4.2 * smoothstep(12, -40, z);
        const k = (1 - smoothstep(2.2, 5.5, Math.abs(x - ravineX(z)))) * smoothstep(-50, -42, z);
        h += (Math.min(h, floor) - h) * k;
      }
      // lake
      const sea = -3.6 - 1.0 * n;
      return h + (sea - h) * smoothstep(26, 35, z + 2 * (fbm2(x * 0.05, 1, seed + 2) - 0.5));
    });
    // terraces and plots (flattened BEFORE the roads are applied)
    hm.addPad(-51.2, 17, 51.2, 25.5, SHORE, 3);                    // shore strip
    hm.addPad(-48, -8, -6, 12, T1, 3);                               // T1 lower terrace
    hm.addPad(-30, -46, 29, -12, T2, 3);                             // T2 estate terrace
    hm.addPad(38.5, -46, 51.2, 6, T2, 3);                            // T3 east lawn
    hm.addPad(-51.2, -51.2, -38, -38, HILL, 5, MAT.rock);            // hilltop
    hm.addPad(-8, -28, 28, -17, T2, 2, MAT.concrete);                // forecourt
    hm.addPad(8, -32.6, 22, -28, T2, 1, MAT.concrete);               // garage apron
    hm.addPad(-46, 5, -24, 12.5, T1, 1.5, MAT.concrete);             // pool deck
    hm.addPad(-20, -43, 3, -28, 9.5, 0.15);                          // mansion basement pit
    hm.addPad(-42, 6.5, -30, 11, T1 - 1.8, 0.15);                    // pool pit
    hm.addPad(40, 16, 51.2, 26.5, SHORE, 2, MAT.asphalt);            // spawn lot
    // roads: shore lane, switchback up to the forecourt, footpath to the hilltop
    hm.addRoad([{ x: 52, z: 22, y: SHORE }, { x: -46, z: 22, y: SHORE }], 2.8, 2);
    // switchback: flat for 6 m where it leaves the shore lane (climbing while still overlapping the lane made a
    // bank across the carriageway), then 15 % up to T1, a hairpin of ~5.8 m radius (the old one, ~4 m, was tighter
    // than a van can turn), and 16 % up to the forecourt. Driven by every vehicle in tests/unit/ridgeRoads.test.ts.
    hm.addRoad([{ x: 31, z: 21, y: SHORE }, { x: 25, z: 19.2, y: SHORE }, { x: -10, z: 9, y: T1 }, { x: -15.5, z: 9, y: T1 }, { x: -19, z: 5.5, y: T1 },
      { x: -19.5, z: 1.5, y: T1 }, { x: -17, z: -1.5, y: T1 }, { x: -12, z: -3, y: T1 }, { x: 24, z: -17, y: T2 }], 3, 3.5);
    hm.addRoad([{ x: -26, z: -24, y: T2 }, { x: -40, z: -41, y: HILL }], 1.5, 2.5, MAT.rock);
    const ter = buildTerrain(sim, { x0: -51.2, z0: -51.2, tilesX: 4, tilesZ: 4, heightmap: hm, waterLevel: LAKE, seed });
    const gy = (x: number, z: number) => ter.heightAt(x, z);
    const m: Marks = {};

    // --- estate terrace
    mansion(sim, -20, -43, T2, m);
    garage(sim, 8, -42.6, T2, m);
    gazebo(sim, -19, T2, -20);
    m.gazebo = { x: -19, y: T2 + 0.2, z: -20 };
    // formal garden hedges around the gazebo, terrace-edge hedge, boundary wall behind the house
    hedge(sim, -29, T2, -27, 7, 1.2); hedge(sim, -15, T2, -27, 5, 1.2);
    hedge(sim, -29, T2, -14.6, 22, 1.2, 1.0);
    hedge(sim, -29, T2, -26, 1.2, 4.5); hedge(sim, -29, T2, -19, 1.2, 4.4);
    hedge(sim, -10.2, T2, -26, 1.2, 9.6);
    m.garden = { x: -25, y: T2, z: -22 };
    wallRun(sim, -30, gy, -50.6, 58, false, 1.8, 3, MAT.brick);
    wallRun(sim, 28.4, gy, -50.6, 4, true, 1.8, 3, MAT.brick);
    // --- lower terrace: gallery + pool
    gallery(sim, -46, -7, T1, m);
    pool(sim, -42, 6.5, T1, m);
    // --- east lawn: greenhouse, footbridge across the ravine
    greenhouse(sim, 40.5, -33, T2, m);
    footbridge(sim, 28, T2, -25, 12.4, m);
    m.ravine = { x: ravineX(-24), y: gy(ravineX(-24), -24), z: -24 };
    // --- hilltop
    watchtower(sim, -46, HILL, -46, m);
    m.hilltop = { x: -40, y: gy(-40, -40), z: -40 };
    // --- lakeshore: boathouse + jetty + boats
    boathouse(sim, -32, 23.5, SHORE + 0.2, m);
    pier(sim, -24.2, SHORE + 0.2, 35.5, 12, 2.4, true, 5.5);
    boat(sim, -21.2, LAKE + 0.1, 40, Math.PI / 2 + 0.1);
    boat(sim, -27.8, LAKE + 0.1, 44, Math.PI / 2 - 0.15);
    m.jetty_end = { x: -23.2, y: SHORE + 0.2, z: 46.8 };

    // --- vineyard rows on the slope between the two road legs (short pieces so they follow the slope)
    for (const vz of [-2.5, 0.5, 3.5]) for (let vx = -1; vx <= 15; vx += 4) hedge(sim, vx, Math.min(gy(vx, vz), gy(vx + 3.2, vz), gy(vx, vz + 0.6)) - 0.2, vz, 3.2, 0.6, 1.2);
    m.vineyard = { x: 7, y: gy(7, 2), z: 2 };
    // --- lamps along the roads
    for (let lx = -44; lx <= 44; lx += 14) if (lx < -36 || lx > -18) streetLamp(sim, lx, gy(lx, 25.6), 25.6, true);
    for (const [lx, lz] of [[19, 13.7], [3, 9.0], [-14, 3], [-4.7, -1.7], [9.3, -7.3], [-4, -18], [21, -12.3]]) streetLamp(sim, lx, gy(lx, lz), lz);
    streetLamp(sim, -23, SHORE + 0.2, 46.4);

    // --- nature: trees, rocks
    const pines: [number, number][] = [[-48, -30], [-42, -22], [-36, -32], [-49, -16], [-34, -14], [46, -46], [42, 2], [-48, 14], [24, 0], [26, 6], [-6, 16.2], [12, -46], [-2, -48]];
    pines.forEach(([x, z], i) => pine(sim, x, gy(x, z), z, i + 3));
    const trees: [number, number][] = [[44, -40], [48, -10], [-26, -33], [24, -46], [14, 8]];
    trees.forEach(([x, z], i) => tree(sim, x, gy(x, z), z, i + 11));
    const rocks: [number, number, number][] = [[33, -8, 8], [35, -32, 10], [33, 6, 7], [-38, -47, 12], [-47, -36, 10], [-50, -40, 9], [-49, 27, 9], [12, 27.5, 7], [29, 28, 8], [44, 10, 11], [50, 12, 9]];
    rocks.forEach(([x, z, r], i) => rock(sim, x, gy(x, z), z, r, i + 2));

    // --- markers
    const spawn = { x: 46.5, y: SHORE + 0.1, z: 21.5 }; // +0.1: a player created exactly on a voxel surface can start stuck
    m.escape = { x: 46.5, y: SHORE, z: 24.8 };
    m.shore_road = { x: -36, y: SHORE, z: 22 };
    m.hairpin = { x: -19, y: T1, z: 3.5 };
    m.forecourt = { x: 10, y: T2, z: -22 };
    m.lake_dump = { x: -18, y: LAKE, z: 47 };
    m.lake_dump_east = { x: 30, y: LAKE, z: 44 };
    m.heli_start = { x: 95, y: 45, z: -95 };
    return {
      name: 'Kestrel Ridge',
      spawn,
      spawnYaw: Math.PI / 2,
      bounds: { min: { x: -51.2, y: -6, z: -51.2 }, max: { x: 51.2, y: 42, z: 51.2 } },
      waterLevel: LAKE,
      sunDir: { x: 0.62, y: -0.3, z: -0.72 },
      sky: 'sunset',
      markers: m,
    };
  },
};
