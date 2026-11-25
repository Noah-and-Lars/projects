import { MAT, defineMod, flat, shaded } from '../../src/mods/kit';
import { Blue } from '../../src/sim/prefabs/vehicles';
import { handSpec } from './_util';

/**
 * Hand-built monster pickup: a narrow pickup body perched on a steel ladder frame, with 1.7 m wheels standing out
 * beside it. Grid 2.8 x 2.2 x 4.8 m; the body sits 0.95 m up, the dense steel axles + frame keep the weight low.
 */
function stiltjack() {
  const SX = 28, SY = 22, SZ = 48;
  const b = new Blue(SX, SY, SZ);
  const paint = shaded(MAT.plastic, 8, 4);
  const glass = flat(MAT.glass, 2);
  const lamp = flat(MAT.lamp);
  const axles = [10, 38];
  // ladder frame + axle beams (all steel, low) and shock towers
  b.frame(9, 0, 2, 11, 4, 46); b.frame(17, 0, 2, 19, 4, 46);
  for (const z of axles) b.frame(2, 0, z - 1, 26, 3, z + 2);
  for (const z of [4, 24, 44]) b.frame(11, 1, z, 17, 3, z + 2);
  for (const z of axles) for (const x of [7, 20]) b.frame(x, 3, z - 1, x + 1, 9, z + 1);
  // body: x 6..22 (clear of the tyres), floor at y 4
  const X0 = 6, X1 = 22;
  b.box(X0, 4, 1, X1, 5, 47, flat(MAT.sheetmetal, 1));
  // bonnet z 34..48
  b.box(X0, 5, 34, X1, 10, 48, paint);
  b.box(X0 + 1, 7, 47, X1 - 1, 9, 48, flat(MAT.sheetmetal, 0)); // grille
  b.box(X0, 8, 47, X0 + 3, 10, 48, lamp); b.box(X1 - 3, 8, 47, X1, 10, 48, lamp);
  b.box(X0 + 6, 10, 38, X1 - 6, 11, 44, flat(MAT.steel, 1)); // bonnet scoop
  b.box(X0, 4, 47, X1, 6, 48, flat(MAT.rubber, 1)); // bumper
  // cab z 21..35
  b.box(X0, 5, 21, X0 + 1, 11, 35, paint); b.box(X1 - 1, 5, 21, X1, 11, 35, paint);
  b.box(X0, 11, 21, X0 + 1, 17, 34, glass); b.box(X1 - 1, 11, 21, X1, 17, 34, glass);
  for (const z of [21, 33]) { b.box(X0, 11, z, X0 + 1, 17, z + 2, paint); b.box(X1 - 1, 11, z, X1, 17, z + 2, paint); }
  b.box(X0, 5, 21, X1, 11, 22, paint); b.box(X0 + 1, 11, 21, X1 - 1, 17, 22, glass); // back wall + rear window
  b.box(X0 + 1, 10, 34, X1 - 1, 17, 35, glass); // windscreen
  b.box(X0, 17, 21, X1, 18, 35, paint); // roof
  b.box(X0 + 2, 18, 30, X1 - 2, 19, 32, lamp); // roof lamps
  b.box(X0 + 1, 9, 31, X1 - 1, 11, 34, flat(MAT.electronics, 1)); // dash
  b.box(X0 + 2, 5, 25, X1 - 2, 7, 29, flat(MAT.fabric, 1)); b.box(X0 + 2, 7, 22, X1 - 2, 13, 24, flat(MAT.fabric, 2)); // bench
  // open bed z 1..21 with a roll bar
  b.box(X0, 5, 1, X0 + 1, 9, 21, paint); b.box(X1 - 1, 5, 1, X1, 9, 21, paint);
  b.box(X0, 5, 1, X1, 9, 2, paint);
  b.box(X0 + 1, 5, 2, X1 - 1, 6, 21, shaded(MAT.wood, 4, 3));
  for (const x of [X0, X1 - 1]) b.box(x, 9, 18, x + 1, 19, 19, flat(MAT.steel, 0));
  b.box(X0, 19, 18, X1, 20, 19, flat(MAT.steel, 0));
  b.box(X0 + 1, 5, 0, X0 + 3, 7, 1, flat(MAT.plastic, 1)); b.box(X1 - 3, 5, 0, X1 - 1, 7, 1, flat(MAT.plastic, 1));
  // engine block under the bonnet
  b.box(10, 5, 38, 18, 9, 46, flat(MAT.steel, 1));
  const mass = 3200;
  const spec = handSpec({
    id: 'stiltjack-monster', r: 0.85, ww: 0.55, clearance: 0.58, sx: SX, inset: 0.3,
    axles, drive: 'all', mass, power: 5.4, topSpeed: 24, grip: 2.1,
    stiffness: 30, susp: 0.22, antiRoll: 7, maxSteer: 0.55,
    seat: { x: 1.75, y: 1.45, z: 2.75 }, hoodCam: { x: 1.4, y: 1.6, z: 3.55 }, engine: { x: 1.4, y: 0.75, z: 4.2 },
    camDist: 7.5, camHeight: 3.0, ram: 1.5,
  });
  return b.finish('Stiltjack monster pickup', spec, mass, [X0, 5, 34, X1, 11, 48], [9, 0, 24]);
}

export default defineMod({
  id: 'stiltjack-monster', name: 'Stiltjack Monster Pickup', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A little red pickup jacked up on wheels taller than a person. Drives straight over cars, kerbs and good taste.',
  vehicles: [{ id: 'stiltjack-monster', name: 'Stiltjack monster pickup', group: 'Odd', blueprint: stiltjack }],
});
