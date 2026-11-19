// Moving a standing body (player or staff) through the store: an upright
// cylinder against axis-aligned boxes, with step-up, gravity and a ceiling.
import { CEIL } from './world.js';

export function moveBody(world, b, dx, dz, dt) {
  const r = b.radius, step = b.step;
  // Horizontal, one axis at a time.
  const tryAxis = (ax, d) => {
    if (!d) return;
    const nx = b.x + (ax === 0 ? d : 0), nz = b.z + (ax === 1 ? d : 0);
    let blocked = false, stepUp = 0;
    world.forBoxes(nx - r, nz - r, nx + r, nz + r, (o) => {
      if (o.y1 <= b.y + 0.001 || o.y0 >= b.y + b.height) return; // below feet or above head
      if (o.y1 - b.y <= step && b.onGround) { // a step: rise onto it if there's room
        stepUp = Math.max(stepUp, o.y1 - b.y);
        return;
      }
      blocked = true;
    });
    if (!blocked && stepUp > 0) {
      // check headroom at the stepped height
      const ny = b.y + stepUp;
      world.forBoxes(nx - r, nz - r, nx + r, nz + r, (o) => { if (o.y1 > ny + 0.001 && o.y0 < ny + b.height) blocked = true; });
      if (!blocked) b.y = ny;
    }
    if (!blocked) { b.x = nx; b.z = nz; return true; }
    b.hitWall = true;
    return false;
  };
  b.hitWall = false;
  // Sub-steps so fast movement can't tunnel through thin walls.
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.2));
  for (let i = 0; i < n; i++) { tryAxis(0, dx / n); tryAxis(1, dz / n); }

  // Vertical.
  b.vy -= b.gravity * dt;
  let ny = b.y + b.vy * dt;
  let ground = 0, ceil = CEIL;
  world.forBoxes(b.x - r + 0.01, b.z - r + 0.01, b.x + r - 0.01, b.z + r - 0.01, (o) => {
    if (o.y1 <= b.y + 0.05 && o.y1 > ground) ground = o.y1;
    if (o.y0 >= b.y + b.height - 0.05 && o.y0 < ceil) ceil = o.y0;
  });
  if (ny <= ground) { ny = ground; if (b.vy < 0) { b.landSpeed = -b.vy; b.vy = 0; } b.onGround = true; }
  else b.onGround = false;
  if (ny + b.height > ceil) { ny = ceil - b.height; if (b.vy > 0) b.vy = 0; }
  b.y = ny;
}

// Is a vertical cylinder at (x, y, z) free of solids?
export function bodyFits(world, x, y, z, r, h) {
  let ok = true;
  world.forBoxes(x - r, z - r, x + r, z + r, (o) => { if (o.y1 > y + 0.05 && o.y0 < y + h) ok = false; });
  return ok;
}
