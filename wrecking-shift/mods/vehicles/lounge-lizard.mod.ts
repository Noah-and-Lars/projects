import { MAT, defineMod, flat, shaded } from '../../src/mods/kit';
import { Blue } from '../../src/sim/prefabs/vehicles';
import { handSpec } from './_util';

/**
 * Hand-built motorised sofa: a three-seat settee on a steel tray with four castor-sized wheels, plus a standard
 * lamp bolted to one arm. Grid 2.0 x 1.9 x 2.6 m, 260 kg.
 */
function sofa() {
  const SX = 20, SY = 19, SZ = 26;
  const b = new Blue(SX, SY, SZ);
  const cushion = shaded(MAT.fabric, 6, 2);
  const cushionDark = flat(MAT.fabric, 3);
  const wood = shaded(MAT.wood, 4, 5);
  const axles = [4, 21];
  // steel tray (frame) and wooden plinth with castor gaps
  b.frame(4, 0, 1, 6, 1, 25); b.frame(14, 0, 1, 16, 1, 25);
  b.frame(6, 0, 3, 14, 1, 5); b.frame(6, 0, 20, 14, 1, 22);
  b.frame(6, 0, 11, 14, 1, 14); // battery box mount
  b.box(0, 1, 0, SX, 3, SZ, wood);
  for (const z of axles) { b.clear(0, 0, z - 3, 3, 3, z + 3); b.clear(17, 0, z - 3, 20, 3, z + 3); }
  b.box(7, 1, 10, 13, 3, 15, flat(MAT.steel, 1)); // motor + battery (heavy, low)
  // seat cushions (three, with seams), backrest, arms
  b.box(3, 3, 6, 17, 6, 22, cushion);
  for (const x of [7, 12]) b.box(x, 5, 6, x + 1, 6, 22, cushionDark);
  b.box(1, 3, 1, 19, 14, 6, cushion); // backrest
  b.box(1, 13, 0, 19, 15, 6, cushionDark); // top roll
  for (const x of [7, 12]) b.box(x, 6, 5, x + 1, 13, 6, cushionDark);
  b.box(0, 3, 1, 3, 10, 24, cushion); b.box(17, 3, 1, 20, 10, 24, cushion); // arms
  b.box(0, 9, 1, 3, 10, 24, cushionDark); b.box(17, 9, 1, 20, 10, 24, cushionDark);
  b.box(0, 1, 24, SX, 3, 26, wood); // front skirt
  // standard lamp on the left arm (pole, shade, bulb) and a steering tiller on the right
  b.box(1, 10, 2, 2, 17, 3, flat(MAT.steel, 0));
  b.box(0, 15, 1, 3, 18, 4, flat(MAT.plaster, 1));
  b.box(1, 16, 2, 2, 17, 3, flat(MAT.lamp));
  b.box(15, 6, 18, 16, 10, 19, flat(MAT.steel, 0)); b.box(14, 10, 17, 17, 11, 20, flat(MAT.rubber, 1));
  b.box(1, 1, 25, 4, 3, 26, flat(MAT.lamp)); b.box(16, 1, 25, 19, 3, 26, flat(MAT.lamp)); // 'headlights'
  const mass = 260;
  const spec = handSpec({
    id: 'lounge-lizard', r: 0.17, ww: 0.12, clearance: 0.1, sx: SX, inset: 0.12,
    axles, drive: 'rear', mass, power: 6.0, topSpeed: 13, grip: 1.9,
    stiffness: 42, susp: 0.1, antiRoll: 5, maxSteer: 0.6, steerFalloff: 9, reverseSpeed: 5,
    seat: { x: 1.3, y: 1.25, z: 1.25 }, hoodCam: { x: 1.0, y: 1.1, z: 2.7 }, engine: { x: 1.0, y: 0.2, z: 1.25 },
    camDist: 4.5, camHeight: 1.6,
  });
  return b.finish('Lounge Lizard sofa', spec, mass, [7, 1, 10, 13, 3, 15], [4, 0, 13]);
}

export default defineMod({
  id: 'lounge-lizard', name: 'Lounge Lizard', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A three-seat settee on a battery tray and four castors, with a standard lamp bolted to the arm. The comfiest way to drive into a wall.',
  vehicles: [{ id: 'lounge-lizard', name: 'Lounge Lizard sofa', group: 'Odd', blueprint: sofa }],
});
