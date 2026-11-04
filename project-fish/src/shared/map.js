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
];

// Distance along a ray (origin, direction of length 1) to the first collider
// it hits, or maxDistance if it hits nothing closer.
export function raycastColliders(ox, oy, oz, dx, dy, dz, maxDistance) {
  let nearest = maxDistance;
  for (const b of COLLIDERS) {
    let tMin = 0;
    let tMax = nearest;
    for (const [o, d, lo, hi] of [[ox, dx, b.minX, b.maxX], [oy, dy, b.minY, b.maxY], [oz, dz, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) tMax = -1;
        continue;
      }
      let t0 = (lo - o) / d;
      let t1 = (hi - o) / d;
      if (t0 > t1) [t0, t1] = [t1, t0];
      tMin = Math.max(tMin, t0);
      tMax = Math.min(tMax, t1);
    }
    if (tMax >= tMin && tMax >= 0) nearest = Math.min(nearest, tMin);
  }
  return nearest;
}
