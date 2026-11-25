import { MAT, bricks, defineMod, levelKit, siteMap, topple, vox } from '../../src/mods/kit';

/** Knock over every chimney stack on a small yard before the clock runs out. */
export default defineMod({
  id: 'stack-topple', name: 'Stack Topple', category: 'modes', author: 'Wrecking Shift',
  description: 'Five brick stacks, ninety seconds. Bring them all down by any means.',
  maps: [siteMap({
    id: 'stack-yard', title: 'Stack Yard', blurb: 'five brick stacks', ground: MAT.dirt, sky: 'day',
    spawn: { x: 0, y: 0.05, z: 12 },
    build(sim) {
      for (let i = 0; i < 5; i++) {
        const g = vox(10, 90, 10, (g) => { for (let y = 0; y < 90; y++) for (let z = 0; z < 10; z++) for (let x = 0; x < 10; x++) if (x < 2 || x > 7 || z < 2 || z > 7 || y < 4) g.set(x, y, z, bricks(MAT.brick, i)(x, y, z)); });
        levelKit.addStatic(sim, g, -12 + i * 6 - 0.5, -0.2, -6, 'stack', ['stack']);
      }
    },
  })],
  modes: [{
    id: 'stack-topple', title: 'Stack Topple', level: 'stack-yard', infiniteAmmo: true,
    rules: ['Five brick stacks stand on the yard.', 'Bring every one of them down (below 3 m) within 90 seconds.', 'Every tool, infinite ammo.'],
    create: () => topple({ tag: 'stack', below: 3, seconds: 90, label: 'Stacks down' }),
  }],
});
