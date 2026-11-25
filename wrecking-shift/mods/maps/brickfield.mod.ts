import { MAT, bricks, box, defineMod, levelKit, siteMap, vox, shaded } from '../../src/mods/kit';

/** A flat yard of brick kilns and chimney stacks to knock down. */
export default defineMod({
  id: 'brickfield', name: 'Brickfield', category: 'maps', author: 'Wrecking Shift',
  description: 'A disused brickworks: three kiln sheds and two tall chimney stacks on a sandy yard.',
  maps: [siteMap({
    id: 'brickfield', title: 'Brickfield', blurb: 'kilns + chimney stacks', ground: MAT.sand, sky: 'sunset',
    spawn: { x: 0, y: 0.05, z: 14 }, spawnYaw: 0,
    build(sim, rng) {
      for (let i = 0; i < 3; i++) {
        const g = vox(56, 34, 40, (g) => {
          box(g, 0, 0, 0, 56, 2, 40, shaded(MAT.concrete, 3));
          for (let y = 2; y < 30; y++) for (let z = 0; z < 40; z++) for (let x = 0; x < 56; x++) {
            const edge = x < 3 || x >= 53 || z < 3 || z >= 37;
            if (edge) g.set(x, y, z, bricks(MAT.brick, i)(x, y, z));
          }
          box(g, 22, 2, 37, 34, 22, 40, 0); // door
          box(g, 0, 30, 0, 56, 32, 40, shaded(MAT.tile, 4));
        });
        levelKit.addStatic(sim, g, -18 + i * 13 - 2.8, -0.2, -12 + rng.range(-1, 1), 'kiln');
      }
      for (const x of [-14, 14]) {
        const g = vox(16, 160, 16, (g) => { for (let y = 0; y < 160; y++) for (let z = 0; z < 16; z++) for (let x2 = 0; x2 < 16; x2++) { const d = Math.hypot(x2 - 7.5, z - 7.5); if (d < 8 - y / 60 && d > 5 - y / 60) g.set(x2, y, z, bricks(MAT.brick, 3)(x2, y, z)); } });
        levelKit.addStatic(sim, g, x - 0.8, -0.2, 2, 'chimney', ['chimney']);
      }
      for (let i = 0; i < 6; i++) levelKit.crate(sim, rng.range(-8, 8), 0.05, rng.range(4, 10));
    },
  })],
});
