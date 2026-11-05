// What's on the baseplate. The game draws it and the movement code collides
// with it, so the future multiplayer server can use the same list.

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
export const SOLDIER = { x: 3.1, z: -12.6, facing: -0.24 };
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

// Solid boxes the player can't walk through: { minX, minY, minZ, maxX, maxY, maxZ }.
export const COLLIDERS = [
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

// Distance along a ray (origin, direction of length 1) to the first collider
// it hits, or maxDistance if it hits nothing closer.
export function raycastColliders(ox, oy, oz, dx, dy, dz, maxDistance) {
  let nearest = maxDistance;
  for (const b of COLLIDERS) {
    const hit = hitBox(b, ox, oy, oz, dx, dy, dz, nearest);
    if (hit) nearest = Math.min(nearest, hit.t);
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
    const hit = hitBox(b, ox, oy, oz, dx, dy, dz, nearest);
    if (!hit || hit.axis < 0 || hit.t >= nearest) continue;
    nearest = hit.t;
    const n = [0, 0, 0];
    n[hit.axis] = -Math.sign([dx, dy, dz][hit.axis]);
    best = { distance: hit.t, nx: n[0], ny: n[1], nz: n[2], what: b.what || 'wall' };
  }
  if (best) {
    best.x = ox + dx * best.distance;
    best.y = oy + dy * best.distance;
    best.z = oz + dz * best.distance;
  }
  return best;
}
