import { MAT, VoxelGrid, box, checkpoints, cylinderY, defineMod, levelKit, pal, shaded, siteMap } from '../../src/mods/kit';
import type { V3 } from '../../src/sim/vec';
import { hatchback } from '../../src/sim/prefabs/vehicles';
import { beacon } from '../maps/_util';

const { addStatic, makeBuilding, placeBuilding, crate, barrel, fence, tree } = levelKit;

const RX = 28, RZ = 24;
const onOval = (a: number, sx = 1): V3 => ({ x: Math.cos(a) * RX * sx, y: 0, z: Math.sin(a) * RZ * sx });
/** checkpoints: 8 per lap, counter-clockwise seen from above, starting just past the start line (south) */
const lap = (): V3[] => Array.from({ length: 8 }, (_, i) => onOval(Math.PI / 2 - (i + 1) * (Math.PI / 4)));

/** A two-lap dirt rally around an oval of tyre stacks; the car waits next to you. */
export default defineMod({
  id: 'gravel-rally', name: 'Gravel Rally', category: 'modes', author: 'Wrecking Shift',
  description: 'Two laps of the Dunmarsh dirt oval in a borrowed hatchback: sixteen checkpoints, tyre walls, a jump on the back straight and 150 seconds on the clock.',
  maps: [siteMap({
    id: 'dunmarsh-oval', title: 'Dunmarsh Oval', blurb: 'dirt rally oval', half: 38.4, ground: MAT.dirt, sky: 'day', seed: 221,
    spawn: { x: -3, y: 0.05, z: 30 }, spawnYaw: -Math.PI / 2,
    build(sim, rng) {
      // tyre stacks marking the inside and outside of the oval
      const tyres = () => {
        const g = new VoxelGrid(8, 9, 8);
        cylinderY(g, 4, 4, 4, 0, 9, (_x, y) => pal(MAT.rubber, y % 3 === 0 ? 0 : 2), 1.6);
        return g;
      };
      for (let i = 0; i < 28; i++) { const p = onOval((i / 28) * Math.PI * 2, 1.27); addStatic(sim, tyres(), p.x - 0.4, -0.1, p.z - 0.4, 'tyres'); }
      for (let i = 0; i < 20; i++) { const p = onOval((i / 20) * Math.PI * 2, 0.73); addStatic(sim, tyres(), p.x - 0.4, -0.1, p.z - 0.4, 'tyres'); }
      // start / finish gantry over the south straight
      const gt = new VoxelGrid(100, 50, 4);
      box(gt, 0, 0, 0, 3, 50, 4, shaded(MAT.paintedmetal, 3, 1)); box(gt, 97, 0, 0, 100, 50, 4, shaded(MAT.paintedmetal, 3, 1));
      box(gt, 0, 42, 0, 100, 50, 4, (x, y) => pal(((x >> 2) + (y >> 2)) % 2 ? MAT.whitepaint : MAT.asphalt, 1));
      addStatic(sim, gt, -5, -0.1, 22.5, 'start gantry');
      // jump ramp on the back (north) straight, rising toward -x (the direction of travel there)
      const rp = new VoxelGrid(60, 9, 40);
      for (let x = 0; x < 60; x++) box(rp, x, 0, 0, x + 1, Math.max(1, Math.round(9 * (1 - x / 60))), 40, shaded(MAT.wood, 4, 3));
      addStatic(sim, rp, 2, -0.1, -26, 'jump');
      // infield: pit garage, crate stacks to plough through, hay of sorts
      placeBuilding(sim, makeBuilding({ w: 100, d: 50, floors: 1, floorH: 36, wall: MAT.sheetmetal, wallT: 1, roof: 'flat', roofMat: MAT.sheetmetal, doors: 's', doorW: 50, doorH: 30, winW: 0, seed: 3 }), -5, 0, -4, 'pit garage');
      for (let i = 0; i < 9; i++) crate(sim, 24 + (i % 3) * 0.9, 0.05 + Math.floor(i / 3) * 0.85, -3 + (i % 2) * 0.2, 8);
      for (let i = 0; i < 6; i++) crate(sim, -27 + (i % 2) * 0.9, 0.05 + Math.floor(i / 2) * 0.85, 2, 8);
      for (let i = 0; i < 3; i++) barrel(sim, -10 + i * 0.8, 0.05, 6, i !== 1);
      // spectators' side
      fence(sim, -20, 0, 33.5, 40, false, MAT.wood, 12);
      for (let i = 0; i < 8; i++) tree(sim, rng.range(-36, 36), 0, rng.range(-37, -34), i, 0.9);
      // the car
      hatchback(sim, 2, 0.1, 27, -Math.PI / 2);
      lap().forEach((p, i) => beacon(sim, p, i));
    },
  })],
  modes: [{
    id: 'gravel-rally', title: 'Gravel Rally', level: 'dunmarsh-oval',
    rules: ['A hatchback waits by the start gantry: get in (E).', 'Drive two laps of the oval through all sixteen checkpoints in order (counter-clockwise: east first).', 'You have 150 seconds. Shortcuts through the tyre wall are allowed if you can make them.'],
    create: () => checkpoints({ seconds: 150, radius: 5, points: [...lap(), ...lap()] }),
  }],
});
