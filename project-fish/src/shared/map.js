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
