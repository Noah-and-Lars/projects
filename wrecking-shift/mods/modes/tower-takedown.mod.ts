import { MAT, defineMod, demolish, levelKit, shaded, siteMap } from '../../src/mods/kit';
import { slab } from '../maps/_util';

const { makeBuilding, placeBuilding, crate, barrel, tree, fence, container, bookcase, sofa } = levelKit;

/** Demolish one condemned tower block (60 % of it) without bothering the neighbours. */
export default defineMod({
  id: 'tower-takedown', name: 'Tower Takedown', category: 'modes', author: 'Wrecking Shift',
  description: 'Hollin House is condemned: six storeys of brick and timber floors. Bring down 60 % of it in three minutes. The neighbours can stay standing.',
  maps: [siteMap({
    id: 'hollin-estate', title: 'Hollin Estate', blurb: 'one condemned tower block', ground: MAT.grass, sky: 'overcast', seed: 251,
    spawn: { x: 0, y: 0.05, z: 20 }, spawnYaw: 0,
    build(sim, rng) {
      // the target: tagged so the rules can count its voxels
      const g = makeBuilding({ w: 90, d: 70, floors: 6, floorH: 28, wall: MAT.brick, wallT: 2, lining: MAT.plaster, slab: MAT.wood, roof: 'flat', doors: 'sn', partitions: true, lamps: true, winStep: 20, seed: 9 });
      sim.addBody(g, { x: -4.5, y: -0.2, z: -8 }, { name: 'Hollin House', tags: ['condemned'] });
      for (let f = 0; f < 6; f += 2) { bookcase(sim, -3.5, 0.1 + f * 2.8 + 0.05, -7.5, 0, f); sofa(sim, -3.6, 0.1 + f * 2.8 + 0.05, -4, 0, MAT.fabric); }
      // the neighbours
      placeBuilding(sim, makeBuilding({ w: 70, d: 60, floors: 2, wall: MAT.concrete, lining: MAT.plaster, roof: 'flat', doors: 's', seed: 3 }), -20, 0, -10, 'shop');
      placeBuilding(sim, makeBuilding({ w: 60, d: 60, floors: 2, wall: MAT.brick, roof: 'gable', roofMat: MAT.tile, doors: 's', seed: 4 }), 12, 0, -10, 'house');
      slab(sim, -25.6, 0, 6, 51.2, 5, shaded(MAT.asphalt, 6, 2), 'road');
      container(sim, -20, 0, 1, MAT.paintedmetal);
      for (let i = 0; i < 6; i++) crate(sim, rng.range(6, 12), 0.05, rng.range(1, 4), 8);
      for (let i = 0; i < 4; i++) barrel(sim, -10 + i * 0.7, 0.05, 2, true);
      fence(sim, -25, 0, -20, 50, false, MAT.wood, 12);
      for (const [x, z] of [[-18, 16], [18, 16], [-22, -16], [22, -16]]) tree(sim, x, 0, z, x | 0, 0.9);
    },
  })],
  modes: [{
    id: 'tower-takedown', title: 'Tower Takedown', level: 'hollin-estate', infiniteAmmo: true,
    rules: ['Hollin House, the six-storey block in the middle, is condemned.', 'Destroy 60 % of it within 180 seconds: pieces that fall off count.', 'Every tool, infinite ammo.'],
    create: () => demolish({ tag: 'condemned', fraction: 0.6, seconds: 180, label: 'Hollin House' }),
  }],
});
