// Rillstone Vale: one hand-shaped valley, about 600 m x 600 m (BUILD_BRIEF 3.2).
//
// The shape is a function of position: a glacier-fed river winds north to
// south down a terraced valley, with a waterfall below Upper Falls, the town
// of Millbrook on a river bend, flattened claim plots and an old adit cut into
// a terrace cliff. A fixed noise seed adds variation; hand-placed features are
// blended in on top. Nothing here is diggable: claims replace the terrain
// inside their rectangles with voxel volumes (world/claims.js).
import { fbm2, noise2 } from '../core/noise.js';

export const SIZE = 600;
export const HALF = SIZE / 2;
export const GRID = 2;            // terrain cell size in metres
const SEED = 1337;                // the valley's shape never changes

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// River centreline: x as a function of z (the river runs north, -z, to south, +z).
export const riverX = (z) => 34 * Math.sin(z / 95 + 0.4) + 14 * Math.sin(z / 41 + 1.3) - 10;
export const RIVER_HALF_WIDTH = (z) => 6.5 + 2 * noise2(z / 60, 3.1, SEED) + (z < FALLS_Z ? -1.5 : 0);
// Valley floor height along the river; the falls drop 16 m below Upper Falls.
export const FALLS_Z = -138;
// River silt (0-10) at a point along the river: clear water off the falls,
// 6 by the Gravel Bar, muddier downstream of Millbrook.
export const riverSilt = (z) => Math.max(0, Math.min(10, Math.round(2 + (z - FALLS_Z) * 4 / 220)));
export const floorY = (z) => 6 - z * 0.022 + 16 * smooth(FALLS_Z + 8, FALLS_Z - 12, z);
// The river surface sits a little below the floor; the bed is carved under it.
export const waterY = (z) => floorY(z) - 0.7;

const TOWN_Z = 30;
export const TOWN = { x: riverX(TOWN_Z) + 52, z: TOWN_Z, r: 46, name: 'Millbrook' };
TOWN.y = floorY(TOWN_Z) + 1.4;

export const HAMLET = { x: riverX(-205) - 40, z: -205, r: 26, name: 'Upper Falls' };
HAMLET.y = floorY(-205) + 1.2;

// The old Rillstone Pumphouse on the bank below Millbrook: the end goal.
// Its wheel hangs over the river on the -x (river) side.
export const PUMPHOUSE = { z: -8, x: 0, y: 0 };
PUMPHOUSE.x = Math.round(riverX(PUMPHOUSE.z) + 16);
PUMPHOUSE.y = floorY(PUMPHOUSE.z) + 1.3;

// Claim plots (sizes in metres, BUILD_BRIEF 3.2). Rectangles are aligned to
// the terrain grid. `top` is the flat plot height the voxel volume starts at.
const snap = (v) => Math.round(v / GRID) * GRID;
function plot(id, name, price, w, d, depth, cx, cz, extra = {}) {
  const x0 = snap(cx - w / 2), z0 = snap(cz - d / 2);
  return { id, name, price, w, d, depth, x0, z0, x1: x0 + w, z1: z0 + d, cx: x0 + w / 2, cz: z0 + d / 2, ...extra };
}
// The old adit: a horizontal tunnel into a terrace cliff east of Millbrook.
// It leads to the Ember Seam claim behind a timber door, and is the M1 "cave".
export const ADIT = { x: snap(TOWN.x + 70), z: snap(TOWN.z - 30), y: 0, len: 46, w: 4.2, h: 3.6, dir: 1 };
ADIT.y = floorY(ADIT.z) + 3.2;

// Deeds also need Guild Standing (BUILD_BRIEF 3.6: standing unlocks deeds).
export const CLAIMS = [
  plot('gravel', 'Gravel Bar', 0, 24, 24, 6, riverX(76) - 23, 76, { band: 1, standing: 0, blurb: 'River-edge starter' }),
  plot('willow', 'Willow Bend', 900, 32, 32, 22, riverX(150) + 30, 150, { standing: 0, blurb: 'Gentle bank, good river access' }),
  plot('oldcut', 'Old Cut', 1500, 40, 32, 22, riverX(-40) - 70, -40, { standing: 2, blurb: 'Half-dug old pit. Something was left behind' }),
  plot('slate', 'Slate Shelf', 6000, 48, 40, 22, riverX(220) - 110, 220, { standing: 6, blurb: 'Terraced cliff: bring lifts and belts' }),
  plot('glimmer', 'Glimmer Hollow', 8500, 40, 40, 22, riverX(-90) + 85, -90, { standing: 10, blurb: 'A sure Glimmerite vein at mid-depth' }),
  // Ember Seam runs horizontally into the mountain from the end of the adit:
  // its bands deepen with distance from the door, down to basalt (band 4).
  plot('ember', 'Ember Seam', 12000, 48, 32, 28, ADIT.x + ADIT.len - 2 + 24, ADIT.z, { standing: 16, tunnel: true, blurb: 'A tunnel into the mountain, down to basalt' }),
];
for (const c of CLAIMS) c.top = Math.max(floorY(c.cz) + 0.6, 0) + (c.id === 'slate' ? 14 : c.id === 'oldcut' ? 3 : c.id === 'glimmer' ? 4 : 0);
{ // Tunnel claim: x0 sits just inside the adit's end; floor level with the adit.
  const e = CLAIMS.find(c => c.id === 'ember');
  e.x0 = ADIT.x + ADIT.len - 2; e.x1 = e.x0 + e.w; e.cx = e.x0 + e.w / 2;
  e.floor = ADIT.y; e.top = ADIT.y + 9;
}


// The switchback road up the falls step to Upper Falls (BUILD_BRIEF 3.2):
// three legs across the slope, about a 10% grade, where the truck matters.
// [x, z, y] vertices; the road is 6 m wide with 3 m shoulders.
export const ROAD = [[-62, -108, 9.6], [-66, -126, 10.1], [-112, -133, 15.2], [-117, -139, 16.4], [-70, -144, 21.4], [-65, -149, 22.6], [-108, -156, 27.4], [-101, -172, 27.8], [-86, -182, 27.8]];
ROAD[ROAD.length - 1][2] = HAMLET.y;
const ROAD_BOX = [-126, -192, -52, -100];
// Nearest point on the road: { d (m), y (road height) } or null when far.
export function roadAt(x, z) {
  if (x < ROAD_BOX[0] || x > ROAD_BOX[2] || z < ROAD_BOX[1] || z > ROAD_BOX[3]) return null;
  let best = null;
  for (let i = 0; i < ROAD.length - 1; i++) {
    const [ax, az, ay] = ROAD[i], [bx, bz, by] = ROAD[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (!best || d < best.d) best = { d, y: ay + (by - ay) * t };
  }
  return best;
}

// Slate Shelf's terrace floors, by x (shared with world/claims.js): the
// hillside outside its open (+x) end follows the lowest step.
export function slateFloor(c, x) {
  const u = x - c.x0;
  return c.top - 5 * smooth(15, 17.5, u) - 5 * smooth(31, 33.5, u);
}

// Raw valley shape before features are flattened in.
function baseHeight(x, z) {
  const rx = riverX(z);
  const d = Math.abs(x - rx);
  const f = floorY(z);
  const n = fbm2(x / 70, z / 70, 4, SEED);
  // Valley floor: a gentle rise away from the river.
  let h = f + Math.min(d, 70) * 0.035 + (n - 0.5) * 2.2;
  // Terraces: steep sandstone risers between flat treads.
  const r = Math.max(0, d - 62 - n * 18);
  const e = r * 0.32 + (noise2(x / 45, z / 45, SEED + 5) - 0.5) * 3;
  const step = 7;
  const k = Math.floor(e / step), fr = e / step - k;
  h += (k + smooth(0.5, 0.92, fr)) * step;
  // Mountains past the valley rim, and a wall at the map edge.
  const rim = Math.max(0, d - 190);
  h += rim * rim * 0.0035 * (0.6 + n * 0.8) + rim * fbm2(x / 30, z / 30, 3, SEED + 9) * 0.25;
  const edge = Math.max(Math.abs(x), Math.abs(z)) - (HALF - 50);
  if (edge > 0) h += edge * edge * 0.02 + edge * 0.3;
  // River bed: carved channel with sloped banks.
  const w = RIVER_HALF_WIDTH(z);
  const bed = f - 2.4;
  const bank = smooth(w + 7, w - 1, d);
  h = lerp(h, Math.min(h, bed + Math.max(0, d - w + 1.5) * 0.9 + 0.2), bank);
  return h;
}

// Blend a flat disc / rectangle into the terrain.
function flatDisc(h, x, z, cx, cz, r, y, soft = 18) {
  const t = smooth(r + soft, r, Math.hypot(x - cx, z - cz));
  return lerp(h, y, t);
}
function flatRect(h, x, z, x0, z0, x1, z1, y, soft = 8) {
  const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
  const t = smooth(soft, 0, Math.hypot(dx, dz));
  return lerp(h, y, t);
}

// Depth of river water over the bed at a point (0 out of the river).
export function riverDepth(x, z) {
  if (Math.abs(x - riverX(z)) > RIVER_HALF_WIDTH(z) + 1.5) return 0;
  return Math.max(0, waterY(z) - height(x, z));
}
export function height(x, z) {
  let h = baseHeight(x, z);
  h = flatDisc(h, x, z, TOWN.x, TOWN.z, TOWN.r, TOWN.y);
  h = flatDisc(h, x, z, HAMLET.x, HAMLET.z, HAMLET.r, HAMLET.y, 14);
  { const P = PUMPHOUSE; h = flatRect(h, x, z, P.x - 4.5, P.z - 7, P.x + 9, P.z + 7, P.y, 4); }
  const r = roadAt(x, z);
  if (r && r.d < 6.5) h = lerp(h, r.y, smooth(6.5, 3.2, r.d));
  for (const c of CLAIMS) {
    if (c.tunnel) continue;
    if (c.id === 'slate' && x > c.x1 - 16) {
      // Past the open end the ground drops with the lowest terrace, then
      // blends into the hillside.
      const y = slateFloor(c, Math.min(x, c.x1));
      h = flatRect(h, x, z, c.x0, c.z0, c.x1, c.z1, y, 9);
      continue;
    }
    h = flatRect(h, x, z, c.x0, c.z0, c.x1, c.z1, c.top, c.id === 'gravel' ? 4 : 9);
  }
  // Adit: a flat apron in front of a sheer cliff the tunnel runs into.
  const a = ADIT;
  const across = Math.abs(z - a.z);
  if (across < 34 && x > a.x - 30 && x < a.x + a.len + 80) {
    const side = smooth(34, 22, across);
    const cliff = x >= a.x ? Math.max(h, a.y + a.h + 6 + (x - a.x) * 0.25) : lerp(h, a.y, smooth(a.x - 30, a.x - 18, x));
    h = lerp(h, cliff, side);
  }
  return h;
}

// Terrain cells that are not drawn or collided: claim plots (their voxel
// volumes take over) and the adit mouth.
export function isHole(cx, cz) {
  // cx, cz: the cell's minimum corner.
  const mx = cx + GRID / 2, mz = cz + GRID / 2;
  for (const c of CLAIMS) if (c.voxel && !c.tunnel && mx > c.x0 && mx < c.x1 && mz > c.z0 && mz < c.z1) return true;
  const a = ADIT;
  if (mx > a.x - GRID && mx < a.x && Math.abs(mz - a.z) < 3.2) return true;
  return false;
}

// Where you start: the Gravel Bar claim post, on the bank.
export function spawnPoint() {
  const c = CLAIMS[0];
  return { x: c.x0 - 3, z: c.cz + 4, yaw: -Math.PI / 2 };
}
