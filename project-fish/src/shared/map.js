// The map: what the game draws and the movement code collides with, so the
// future multiplayer server can use the same lists.
//
// Two maps (MAP_ID): the parking garage (the default: a photo scan of an
// underground car park, assets/map/garage.glb, see GARAGE) and the
// baseplate (?map=baseplate in the address: a flat grey plain with a small
// house and a movement course, for trying the moves on).

const asked = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('map') : null;
export const MAP_ID = asked === 'baseplate' ? 'baseplate' : 'garage';

// The parking garage (tools/map/build_garage.mjs makes its model, its floor
// at height 0). Traced from the scan (metres, seen from above, x right, z
// towards the spawn): its outline, walking round it; the scan's real walls
// are the north side, the notch and the east and south sides, and where the
// scan simply stops (the west and south-west, open into darkness) the
// outline closes it off just the same. Its three pillars, and its ceiling:
// 3.02 m up, with beams across it down to 2.49 m (MOVE_CEILING: as high as
// a jump takes your head anywhere in it, so it never goes into a beam).
export const GARAGE = {
  model: 'assets/map/garage.glb',
  outline: [
    [-5.62, -6.12], [4.25, -4.69], [4.21, 0.25], [9.31, 0.19], [9.41, 9.87], [4.69, 9.81], [4.69, 10.5],
    [1.0, 10.55], [-3.0, 9.0], [-6.0, 4.0], [-7.0, 1.5], [-7.25, 0.5], [-6.06, -6.25],
  ],
  // The outline's edges (each from its point to the next) where the scan
  // stops: the world draws darkness thickening over the last `darkDepth`
  // metres up to them, and the player is kept out of it by a second wall
  // that far in (`keepOut`, a little longer at each end so the corners
  // close).
  open: [6, 7, 8, 9, 10, 11, 12],
  darkDepth: 2.0,
  keepOut: 1.3,
  pillars: [[-6.24, -1.9], [-1.21, -0.95], [4.81, 5.08]],
  pillarHalf: 0.18,
  ceiling: 3.02,
  moveCeiling: 2.45,
  wallHeight: 3.1,
};

// Where the player starts: x, z and the way they face (yaw: radians, 0 =
// towards -Z, positive turning left).
export const SPAWN = MAP_ID === 'garage' ? { x: 2.6, z: 7.2, yaw: 0.2 } : { x: 0, z: 0, yaw: 0 };

// A small house to give a sense of movement until the real map arrives.
// x / z: centre of the house on the ground. The front (door side) faces +Z,
// towards where the player spawns.
export const HOUSE = {
  x: 5,
  z: -16,
  width: 6, // m, along X
  depth: 5, // m, along Z
  wallHeight: 2.8, // m
  roofHeight: 1.8, // m from the top of the walls to the ridge
};

// A soldier standing beside the door, facing the spawn: the character model
// players will have in multiplayer, shown here until then. x / z: where he
// stands; facing: his turn about the vertical (radians, 0 = facing +Z).
export const SOLDIER = MAP_ID === 'garage' ? { x: 5.5, z: 3.2, facing: -0.58 } : { x: 3.1, z: -12.6, facing: -0.24 };
// His box (about as wide as his shoulders and gear). Shots that hit it report
// 'soldier'. If his model can't be loaded, the world takes it out again.
export const SOLDIER_BOX = { minX: SOLDIER.x - 0.32, maxX: SOLDIER.x + 0.32, minY: 0, maxY: 1.8, minZ: SOLDIER.z - 0.22, maxZ: SOLDIER.z + 0.22, what: 'soldier' };

// A small course to try the movement on, to the left of the spawn: crates
// to climb (0.5, 1 and 1.5 m), a low wall to vault, a 2 m wall and a 2.6 m
// ledge to climb (jump first for the ledge), a bar to slide under (1 m off
// the ground: too low to walk or crouch under), and three steps to walk up.
// Each: a box and what it looks like ('crate', 'concrete' or 'metal').
const box = (x, z, w, d, y0, y1, look) => ({ minX: x - w / 2, maxX: x + w / 2, minY: y0, maxY: y1, minZ: z - d / 2, maxZ: z + d / 2, look });
export const OBSTACLES = [
  box(-6, -6, 1.2, 1.2, 0, 0.5, 'crate'),
  box(-8.5, -6, 1.5, 1.5, 0, 1.0, 'crate'),
  box(-11.5, -6, 2, 2, 0, 1.5, 'crate'),
  box(-7, -10.5, 4, 0.3, 0, 0.9, 'concrete'),
  box(-11.5, -10.5, 3, 0.4, 0, 2.0, 'concrete'),
  box(-15, -10.5, 2.5, 3, 0, 2.6, 'concrete'),
  box(-6.6, -16, 0.15, 0.15, 0, 1.6, 'metal'),
  box(-9.4, -16, 0.15, 0.15, 0, 1.6, 'metal'),
  box(-8, -16, 2.65, 0.15, 1.0, 1.3, 'metal'),
  box(-12, -15, 1.6, 0.4, 0, 0.3, 'concrete'),
  box(-12, -15.4, 1.6, 0.4, 0, 0.6, 'concrete'),
  box(-12, -16.3, 1.6, 1.4, 0, 0.9, 'concrete'),
];

// The garage's solid parts as boxes: its pillars, and its ceiling twice
// over: where shots hit it (3.02 m), and how high your head can go
// (`shots: false`: shots go past it). `ceiling`: only ever overhead, it
// never pushes the player sideways, nor is it a ledge to climb or stand on.
const GARAGE_BOXES = () => {
  const h = GARAGE.pillarHalf;
  const xs = GARAGE.outline.map((p) => p[0]);
  const zs = GARAGE.outline.map((p) => p[1]);
  const over = { minX: Math.min(...xs) - 1, maxX: Math.max(...xs) + 1, minZ: Math.min(...zs) - 1, maxZ: Math.max(...zs) + 1 };
  return [
    ...GARAGE.pillars.map(([x, z]) => ({ minX: x - h, maxX: x + h, minY: 0, maxY: GARAGE.wallHeight, minZ: z - h, maxZ: z + h })),
    { ...over, minY: GARAGE.ceiling, maxY: GARAGE.ceiling + 1, ceiling: true },
    { ...over, minY: GARAGE.moveCeiling, maxY: GARAGE.moveCeiling + 0.3, ceiling: true, shots: false },
  ];
};

// An edge of the garage's outline (i: from point i to the next), and the
// way into the garage from it (a unit vector, seen from above).
export function garageEdge(i) {
  const o = GARAGE.outline;
  const [ax, az] = o[i];
  const [bx, bz] = o[(i + 1) % o.length];
  const len = Math.hypot(bx - ax, bz - az);
  let nx = -(bz - az) / len;
  let nz = (bx - ax) / len;
  // (Inwards: towards the middle of the outline.)
  const cx = o.reduce((t, p) => t + p[0], 0) / o.length;
  const cz = o.reduce((t, p) => t + p[1], 0) / o.length;
  if ((cx - ax) * nx + (cz - az) * nz < 0) { nx = -nx; nz = -nz; }
  return { ax, az, bx, bz, len, nx, nz, ux: (bx - ax) / len, uz: (bz - az) / len };
}

// Walls that aren't boxes: upright, as tall as wallHeight, along a line
// seen from above ({ ax, az, bx, bz }). The garage's outline, and its
// keep-out walls inside the open edges.
export const WALLS = MAP_ID === 'garage'
  ? [
    ...GARAGE.outline.map((p, i) => {
      const e = garageEdge(i);
      return { ax: e.ax, az: e.az, bx: e.bx, bz: e.bz, height: GARAGE.wallHeight };
    }),
    ...GARAGE.open.map((i) => {
      const e = garageEdge(i);
      const k = GARAGE.keepOut;
      const more = 0.8;
      return {
        ax: e.ax + e.nx * k - e.ux * more, az: e.az + e.nz * k - e.uz * more,
        bx: e.bx + e.nx * k + e.ux * more, bz: e.bz + e.nz * k + e.uz * more,
        height: GARAGE.wallHeight, keepOut: true,
      };
    }),
  ]
  : [];

// Solid boxes the player can't walk through: { minX, minY, minZ, maxX, maxY, maxZ }.
export const COLLIDERS = MAP_ID === 'garage' ? [SOLDIER_BOX, ...GARAGE_BOXES()] : [
  {
    minX: HOUSE.x - HOUSE.width / 2,
    maxX: HOUSE.x + HOUSE.width / 2,
    minY: 0,
    maxY: HOUSE.wallHeight + HOUSE.roofHeight,
    minZ: HOUSE.z - HOUSE.depth / 2,
    maxZ: HOUSE.z + HOUSE.depth / 2,
  },
  SOLDIER_BOX,
  ...OBSTACLES,
];

// Where a ray (origin o, direction d of length 1) enters a box, or null:
// { t: distance, axis: 0/1/2 of the face it went through }.
function hitBox(b, ox, oy, oz, dx, dy, dz, tMax) {
  let tMin = 0;
  let axis = -1;
  const slabs = [[ox, dx, b.minX, b.maxX], [oy, dy, b.minY, b.maxY], [oz, dz, b.minZ, b.maxZ]];
  for (let i = 0; i < 3; i++) {
    const [o, d, lo, hi] = slabs[i];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t0 = (lo - o) / d;
    let t1 = (hi - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > tMin) {
      tMin = t0;
      axis = i;
    }
    tMax = Math.min(tMax, t1);
    if (tMax < tMin) return null;
  }
  return { t: tMin, axis };
}

// Where a ray meets a wall (WALLS), or null: { t, nx, nz (the side it hit's
// outward direction) }.
function hitWall(w, ox, oy, oz, dx, dy, dz, tMax) {
  const ex = w.bx - w.ax;
  const ez = w.bz - w.az;
  const denom = dx * ez - dz * ex;
  if (Math.abs(denom) < 1e-9) return null;
  const qx = w.ax - ox;
  const qz = w.az - oz;
  const t = (qx * ez - qz * ex) / denom;
  const u = (qx * dz - qz * dx) / denom;
  if (t < 0 || t >= tMax || u < 0 || u > 1) return null;
  const y = oy + dy * t;
  if (y < 0 || y > w.height) return null;
  const len = Math.hypot(ex, ez);
  let nx = ez / len;
  let nz = -ex / len;
  if (nx * dx + nz * dz > 0) { nx = -nx; nz = -nz; }
  return { t, nx, nz };
}

// Distance along a ray (origin, direction of length 1) to the first collider
// it hits, or maxDistance if it hits nothing closer.
export function raycastColliders(ox, oy, oz, dx, dy, dz, maxDistance) {
  let nearest = maxDistance;
  for (const b of COLLIDERS) {
    if (b.shots === false) continue;
    const hit = hitBox(b, ox, oy, oz, dx, dy, dz, nearest);
    if (hit) nearest = Math.min(nearest, hit.t);
  }
  for (const w of WALLS) {
    if (w.keepOut) continue; // (shots fly on into the dark)
    const hit = hitWall(w, ox, oy, oz, dx, dy, dz, nearest);
    if (hit) nearest = hit.t;
  }
  return nearest;
}

// What a shot along the ray hits first: the ground or a collider. Returns
// { distance, x, y, z, nx, ny, nz (the surface's outward direction), what:
// 'ground', 'wall' or a box's own `what` }, or null if nothing is within
// maxDistance.
export function raycastWorld(ox, oy, oz, dx, dy, dz, maxDistance) {
  let best = null;
  let nearest = maxDistance;
  if (dy < -1e-9) {
    const t = -oy / dy;
    if (t >= 0 && t < nearest) {
      nearest = t;
      best = { distance: t, nx: 0, ny: 1, nz: 0, what: 'ground' };
    }
  }
  for (const b of COLLIDERS) {
    if (b.shots === false) continue;
    const hit = hitBox(b, ox, oy, oz, dx, dy, dz, nearest);
    if (!hit || hit.axis < 0 || hit.t >= nearest) continue;
    nearest = hit.t;
    const n = [0, 0, 0];
    n[hit.axis] = -Math.sign([dx, dy, dz][hit.axis]);
    best = { distance: hit.t, nx: n[0], ny: n[1], nz: n[2], what: b.what || 'wall' };
  }
  for (const w of WALLS) {
    if (w.keepOut) continue; // (shots fly on into the dark)
    const hit = hitWall(w, ox, oy, oz, dx, dy, dz, nearest);
    if (!hit) continue;
    nearest = hit.t;
    best = { distance: hit.t, nx: hit.nx, ny: 0, nz: hit.nz, what: 'wall' };
  }
  if (best) {
    best.x = ox + dx * best.distance;
    best.y = oy + dy * best.distance;
    best.z = oz + dz * best.distance;
  }
  return best;
}
