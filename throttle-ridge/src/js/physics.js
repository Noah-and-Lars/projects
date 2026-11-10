// Physics world setup (planck.js / Box2D) and the fixed timestep.
import * as planck from 'planck';

export const STEP = 1 / 60;
export const GRAVITY = -22;

// Collision categories: bikes only ever touch the ground, so riders never
// collide with each other or with their own parts.
export const CAT_GROUND = 0x0001;
export const CAT_BIKE = 0x0002;

export function createWorld(track) {
  const world = new planck.World({ gravity: planck.Vec2(0, GRAVITY) });
  const ground = world.createBody({ type: 'static' });
  const verts = [];
  for (let i = 0; i < track.xs.length; i++) verts.push(planck.Vec2(track.xs[i], track.ys[i]));
  // End walls so nobody can ride off the world.
  const first = verts[0], last = verts[verts.length - 1];
  verts.unshift(planck.Vec2(first.x, first.y + 30));
  verts.push(planck.Vec2(last.x, last.y + 30));
  ground.createFixture({
    shape: new planck.Chain(verts, false),
    friction: 0.9,
    filterCategoryBits: CAT_GROUND,
    filterMaskBits: 0xffff,
    userData: 'ground',
  });
  return { world, ground, planck };
}

export function stepWorld(world) {
  world.step(STEP, 8, 3);
}
