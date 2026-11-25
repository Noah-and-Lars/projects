import { MAT, defineMod, flat, pal } from '../../src/mods/kit';
import { Blue } from '../../src/sim/prefabs/vehicles';
import { handSpec } from './_util';

/**
 * Hand-built food van shaped like a giant sausage in a bun: a hollow terracotta sausage (the cabin, glazed at the
 * nose) lying in a crate-coloured bun, with a yellow mustard squiggle on top and a serving hatch on the side.
 * Grid 2.0 x 2.4 x 5.6 m, rear-wheel drive.
 */
function frankfurter() {
  const SX = 20, SY = 24, SZ = 56;
  const b = new Blue(SX, SY, SZ);
  const cx = SX / 2;
  const axles = [12, 44];
  // chassis
  b.frame(4, 0, 2, 6, 1, 54); b.frame(14, 0, 2, 16, 1, 54);
  for (const z of [6, 27, 48]) b.frame(6, 0, z, 14, 1, z + 2);
  b.box(2, 1, 3, 18, 2, 53, flat(MAT.sheetmetal, 1));
  b.box(6, 1, 16, 14, 3, 24, flat(MAT.steel, 1)); // engine + gas bottles (low, heavy)
  // bun: lower half-ellipse shell (x half-width 10, y 1..12), rounded ends
  const bunTop = 12;
  for (let z = 2; z < 54; z++) {
    const ez = Math.min(1, (Math.min(z - 2, 53 - z) + 1) / 5); // taper the last 0.5 m
    for (let y = 1; y < bunTop; y++) for (let x = 0; x < SX; x++) {
      const dx = (x + 0.5 - cx) / (10 * (0.6 + 0.4 * ez)), dy = (bunTop - y) / 11;
      const r2 = dx * dx + dy * dy;
      if (r2 <= 1 && (r2 > 0.62 || y <= 2 || ez < 1)) b.box(x, y, z, x + 1, y + 1, z + 1, pal(MAT.crate, (x + z) % 3 === 0 ? 2 : 1));
    }
  }
  // sausage: hollow tube (radius 7.5) along z, centre y 13, with hemispherical-ish ends poking out of the bun
  const cy = 13.5, R = 7.5;
  const sausage = (x: number, y: number, z: number) => pal(MAT.tile, (x * 3 + y + z * 2) % 7 === 0 ? 3 : 2);
  for (let z = 0; z < SZ; z++) {
    const end = Math.min(z, SZ - 1 - z);
    const rz = end >= 6 ? R : Math.sqrt(Math.max(0, R * R - (6 - end) ** 2 * 1.4));
    for (let y = 2; y < SY; y++) for (let x = 0; x < SX; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= rz * rz && (d2 > (rz - 1.3) ** 2 || end < 1)) b.box(x, y, z, x + 1, y + 1, z + 1, sausage(x, y, z));
    }
  }
  // open the sausage floor inside the bun so the cabin is one space
  for (let z = 4; z < 52; z++) for (let y = 3; y < bunTop; y++) for (let x = 2; x < SX - 2; x++) {
    const dx = (x + 0.5 - cx) / 10, dy = (bunTop - y) / 11;
    if (dx * dx + dy * dy <= 0.55) b.clear(x, y, z, x + 1, y + 1, z + 1);
  }
  // glazing: windscreen across the nose and cab side windows (above the bun line)
  const g = b.g;
  for (let z = 34; z < SZ; z++) for (let y = 14; y < 20; y++) for (let x = 0; x < SX; x++) {
    const i = g.idx(x, y, z);
    if (g.data[i] >> 3 !== MAT.tile) continue;
    const nose = z >= SZ - 7, side = z < 46 && Math.abs(x + 0.5 - cx) > 4.5;
    if (nose || side) g.data[i] = pal(MAT.glass, 2);
  }
  // serving hatch on the right flank (x = 0 side) with an awning, plus a counter
  for (let z = 14; z < 30; z++) for (let y = 13; y < 19; y++) for (let x = 0; x < 5; x++) {
    const i = g.idx(x, y, z);
    if (g.data[i] >> 3 === MAT.tile) g.data[i] = 0;
  }
  b.box(0, 19, 13, 3, 20, 31, (_x, _y, z) => pal(((z >> 1) & 1) ? MAT.whitepaint : MAT.plastic, 1)); // striped awning
  b.box(1, 12, 14, 4, 13, 30, flat(MAT.marble, 1)); // counter
  // mustard squiggle along the top
  for (let z = 6; z < SZ - 6; z++) {
    const x = Math.round(cx - 0.5 + 3.2 * Math.sin(z / 2.6));
    const top = Math.floor(cy + R);
    b.box(x, top, z, x + 2, top + 1, z + 1, flat(MAT.wire, 1));
  }
  // interior: dashboard, seats, lamps in the bun ends
  b.box(3, 9, 46, 17, 12, 49, flat(MAT.electronics, 1));
  b.box(10, 2, 36, 16, 5, 41, flat(MAT.fabric, 1)); b.box(10, 5, 34, 16, 13, 36, flat(MAT.fabric, 2));
  b.box(4, 2, 36, 9, 5, 41, flat(MAT.fabric, 1)); b.box(4, 5, 34, 9, 13, 36, flat(MAT.fabric, 2));
  b.box(2, 5, 53, 5, 7, 54, flat(MAT.lamp)); b.box(15, 5, 53, 18, 7, 54, flat(MAT.lamp));
  b.box(2, 5, 2, 5, 7, 3, flat(MAT.plastic, 1)); b.box(15, 5, 2, 18, 7, 3, flat(MAT.plastic, 1));
  // wheel wells
  for (const z of axles) { b.clear(0, 0, z - 4, 4, 7, z + 4); b.clear(16, 0, z - 4, 20, 7, z + 4); }
  const mass = 2200;
  const spec = handSpec({
    id: 'frankfurter-wagon', r: 0.34, ww: 0.24, clearance: 0.22, sx: SX, inset: 0.18,
    axles, drive: 'rear', mass, power: 4.4, topSpeed: 22, grip: 1.75,
    stiffness: 36, susp: 0.14, antiRoll: 5.5, maxSteer: 0.56,
    seat: { x: 1.3, y: 1.55, z: 3.85 }, hoodCam: { x: 1.0, y: 1.5, z: 5.0 }, engine: { x: 1.0, y: 0.25, z: 2.0 },
    camDist: 7.5, camHeight: 2.4,
  });
  return b.finish('Frankfurter food van', spec, mass, [6, 1, 16, 14, 3, 24], [4, 0, 28]);
}

export default defineMod({
  id: 'frankfurter-wagon', name: 'Frankfurter Wagon', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A street-food van shaped like a five-metre sausage in a bun, mustard squiggle and all. You drive from inside the sausage.',
  vehicles: [{ id: 'frankfurter-wagon', name: 'Frankfurter food van', group: 'Odd', blueprint: frankfurter }],
});
